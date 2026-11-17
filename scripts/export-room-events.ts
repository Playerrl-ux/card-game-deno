/**
 * Script para exportar eventos das salas armazenadas no banco de dados SQLite
 * para arquivos no formato JSON Lines (.jsonl / .json), onde cada linha representa um evento,
 * no mesmo padrão gerado pelos testes de cliente único (test-client.ts).
 *
 * Uso:
 *   deno run -A scripts/export-room-events.ts [opções]
 *
 * Opções:
 *   --out-dir=<caminho>   Diretório de saída dos arquivos (padrão: "data/rooms")
 *   --ext=<jsonl|json>    Extensão dos arquivos gerados (padrão: "jsonl")
 *   --db=<caminho>        Caminho para o banco SQLite (padrão: "data/replays.db")
 *   --room=<nome>         Exporta apenas uma sala específica
 *   --help, -h            Exibe a mensagem de ajuda
 */

import { DatabaseSync } from "node:sqlite";
import { existsSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";

interface ParsedArgs {
  outDir: string;
  ext: string;
  dbPath: string;
  roomFilter?: string;
  showHelp: boolean;
}

function parseCliArgs(args: string[]): ParsedArgs {
  const result: ParsedArgs = {
    outDir: "data/rooms",
    ext: "jsonl",
    dbPath: "data/replays.db",
    showHelp: false,
  };

  for (const arg of args) {
    if (arg === "--help" || arg === "-h") {
      result.showHelp = true;
    } else if (arg.startsWith("--out-dir=")) {
      result.outDir = arg.slice("--out-dir=".length);
    } else if (arg.startsWith("--ext=")) {
      result.ext = arg.slice("--ext=".length).replace(/^\./, "");
    } else if (arg.startsWith("--db=")) {
      result.dbPath = arg.slice("--db=".length);
    } else if (arg.startsWith("--room=")) {
      result.roomFilter = arg.slice("--room=".length);
    }
  }

  return result;
}

function printHelp(): void {
  console.log(`
Exportador de Eventos de Salas (SQLite -> JSON Lines)

Uso:
  deno run -A scripts/export-room-events.ts [opções]

Opções:
  --out-dir=<caminho>   Diretório de saída (padrão: data/rooms)
  --ext=<jsonl|json>    Extensão do arquivo (padrão: jsonl)
  --db=<caminho>        Caminho do banco SQLite (padrão: data/replays.db)
  --room=<nome>         Exporta apenas a sala com o nome especificado
  --help, -h            Exibe esta ajuda
`);
}

interface RoomRow {
  id: string;
  name: string;
  created_at: string;
}

interface EventRow {
  match_id: string;
  mode_name: string;
  sequence: number;
  timestamp: number;
  source: "CLIENT" | "SERVER";
  sender_id: number;
  event_type: "GAME" | "EXTERNAL";
  event_name: string;
  payload: string;
}

export function exportRoomEvents(): void {
  const args = parseCliArgs(Deno.args);

  if (args.showHelp) {
    printHelp();
    return;
  }

  const resolvedDbPath = resolve(args.dbPath);
  if (!existsSync(resolvedDbPath)) {
    console.error(`[Export] Erro: Banco de dados não encontrado em: ${resolvedDbPath}`);
    Deno.exit(1);
  }

  console.log(`[Export] Abrindo banco de dados: ${resolvedDbPath}`);
  const db = new DatabaseSync(resolvedDbPath);

  // Garante que o diretório de destino existe
  mkdirSync(args.outDir, { recursive: true });

  // Busca salas
  let roomsQuery = "SELECT id, name, created_at FROM rooms";
  const queryParams: unknown[] = [];

  if (args.roomFilter) {
    roomsQuery += " WHERE name = ?";
    queryParams.push(args.roomFilter);
  }
  roomsQuery += " ORDER BY created_at ASC";

  const roomsStmt = db.prepare(roomsQuery);
  const rooms = roomsStmt.all(...queryParams) as unknown as RoomRow[];

  if (rooms.length === 0) {
    if (args.roomFilter) {
      console.warn(`[Export] Nenhuma sala encontrada com o nome: "${args.roomFilter}"`);
    } else {
      console.warn("[Export] Nenhuma sala cadastrada no banco de dados.");
    }
    return;
  }

  console.log(`[Export] Encontrada(s) ${rooms.length} sala(s) para exportar.`);
  console.log(`[Export] Diretório de saída: ${resolve(args.outDir)}`);
  console.log(`[Export] Formato: 1 evento JSON por linha (.${args.ext})\n`);

  const eventsStmt = db.prepare(`
    SELECT 
      m.id AS match_id,
      m.mode_name AS mode_name,
      me.sequence,
      me.timestamp,
      me.source,
      me.sender_id,
      me.event_type,
      me.event_name,
      me.payload
    FROM matches m
    JOIN match_events me ON me.match_id = m.id
    WHERE m.room_id = ?
    ORDER BY m.created_at ASC, me.sequence ASC
  `);

  const startTime = performance.now();
  let totalEvents = 0;
  let exportedFilesCount = 0;

  for (const room of rooms) {
    const rows = eventsStmt.all(room.id) as unknown as EventRow[];

    if (rows.length === 0) {
      console.log(`[Export] Sala ${room.name}: 0 eventos (ignorada)`);
      continue;
    }

    const lines: string[] = [];
    for (const row of rows) {
      let parsedPayload: unknown;
      try {
        parsedPayload = JSON.parse(row.payload);
      } catch {
        parsedPayload = row.payload;
      }

      const logEntry = {
        timestamp: new Date(row.timestamp).toISOString(),
        source: row.source,
        event: {
          type: row.event_type,
          name: row.event_name,
          roomName: room.name,
          data: parsedPayload,
          sendedBy: row.sender_id,
        },
      };

      lines.push(JSON.stringify(logEntry));
    }

    // Grava o arquivo de log para a sala
    const fileName = `${room.name}.${args.ext}`;
    const filePath = resolve(args.outDir, fileName);

    Deno.writeTextFileSync(filePath, lines.join("\n") + "\n");

    totalEvents += rows.length;
    exportedFilesCount++;

    console.log(
      `[Export] ✓ Sala ${room.name.padEnd(10)} | ${rows.length.toString().padStart(6)} eventos -> ${filePath}`,
    );
  }

  const duration = ((performance.now() - startTime) / 1000).toFixed(2);
  console.log("\n" + "=".repeat(60));
  console.log(`[Export] Concluído com sucesso!`);
  console.log(`[Export] Salas exportadas: ${exportedFilesCount}/${rooms.length}`);
  console.log(`[Export] Total de eventos gravados: ${totalEvents.toLocaleString()}`);
  console.log(`[Export] Tempo total: ${duration}s`);
  console.log("=".repeat(60));
}

// Executa automaticamente quando chamado diretamente
if (import.meta.main) {
  exportRoomEvents();
}
