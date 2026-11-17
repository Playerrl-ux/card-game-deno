/**
 * Script de Teste End-to-End com Múltiplas Salas Simultâneas (Headless Client)
 *
 * Cria N salas no game simultaneamente, cada uma com 4 conexões WebSocket dedicadas.
 * - Cada sala roda de forma independente sem gerar arquivos de log no disco.
 * - Gerencia o ciclo de vida completo de cada partida (createRoom -> joinRoom -> startGame -> TEST_PLAY echo -> WIN).
 *
 * Para rodar:
 * deno run -A scripts/test-multi-rooms.ts
 */

const TOTAL_ROOMS = 10;
const PLAYERS_PER_ROOM = 4;
const WS_URL = "ws://localhost:9000/ws";

interface RoomResult {
  roomId: number;
  roomName: string;
  winnerPlayerId?: number;
  turnsPlayed: number;
  durationMs: number;
  success: boolean;
  error?: string;
}

class RoomSimulation {
  public sockets: WebSocket[] = [];
  public joinedPlayers = 0;
  public isGameStarted = false;
  public isFinished = false;
  public turnsPlayed = 0;
  public startTime = 0;

  constructor(
    public readonly roomId: number,
    public readonly roomName: string,
    private readonly onComplete: (result: RoomResult) => void,
  ) {}

  public start(): void {
    this.startTime = Date.now();
    console.log(
      `[Sala ${this.roomId}] [${this.roomName}] Iniciando conexões...`,
    );

    for (let i = 0; i < PLAYERS_PER_ROOM; i++) {
      const playerIndex = i;
      const ws = new WebSocket(WS_URL);
      this.sockets.push(ws);

      ws.onopen = () => {
        if (playerIndex === 0) {
          this.sendToServer(ws, 0, {
            type: "EXTERNAL",
            name: "createRoom",
            roomName: this.roomName,
            data: { isTestRoom: true },
          });
        }
      };

      ws.onmessage = (event) => {
        try {
          const payload = JSON.parse(event.data);
          this.handleServerMessage(playerIndex, ws, payload);
        } catch (e) {
          console.error(
            `[Sala ${this.roomId}] Erro ao parsear mensagem do Player ${playerIndex}:`,
            e,
          );
        }
      };

      ws.onerror = (err) => {
        if (!this.isFinished) {
          console.error(
            `[Sala ${this.roomId}] Erro no socket do Player ${playerIndex}:`,
            err,
          );
        }
      };

      ws.onclose = () => {
        // Conexão encerrada
      };
    }
  }

  private sendToServer(
    ws: WebSocket,
    playerId: number,
    payload: unknown,
  ): void {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(payload));
    }
  }

  private handleServerMessage(
    playerId: number,
    ws: WebSocket,
    payload: any,
  ): void {
    if (!payload || typeof payload !== "object") return;

    if (payload.type === "SERVER" || payload.type === "EXTERNAL") {
      // 1. Sala criada pelo Player 0 -> Conectar outros jogadores
      if (payload.name === "ROOM_CREATED" && playerId === 0) {
        for (let j = 1; j < PLAYERS_PER_ROOM; j++) {
          this.sendToServer(this.sockets[j], j, {
            type: "EXTERNAL",
            name: "joinRoom",
            roomName: this.roomName,
            data: {},
          });
        }
      }

      // 2. Jogadores entram na sala -> Quando todos entrarem, inicia o jogo
      if (payload.name === "ROOM_JOINED" && playerId === 0) {
        this.joinedPlayers++;
        if (
          this.joinedPlayers === PLAYERS_PER_ROOM - 1 &&
          !this.isGameStarted
        ) {
          this.isGameStarted = true;
          console.log(
            `[Sala ${this.roomId}] [${this.roomName}] Todos os jogadores conectados. Iniciando partida...`,
          );

          this.sendToServer(this.sockets[0], 0, {
            type: "EXTERNAL",
            name: "startGame",
            roomName: this.roomName,
            data: {
              modeName: "Default",
              numberOfDecks: 1,
              configs: {
                SEVEN_HAS_EFFECT: true,
                ZERO_HAS_EFFECT: true,
                DRAW_2_OVER_DRAW_4: true,
                DRAW_UNTIL_HAVE: true,
                JUMPIN: true,
                DRAW_4_CHALLENGES: true,
                isTestRoom: true,
                CanWin: true,
              },
            },
          });
        }
      }

      // 3. Echo do TEST_PLAY gerado pelo bot no servidor
      if (payload.name === "TEST_PLAY") {
        this.turnsPlayed++;
        this.sendToServer(ws, playerId, {
          type: "GAME",
          name: payload.data.eventName,
          roomName: this.roomName,
          sendedBy: playerId,
          data: { data: payload.data.data },
        });
      }

      // 4. Tratamento de Ping/Pong
      if (payload.name === "PING") {
        this.sendToServer(ws, playerId, {
          type: "EXTERNAL",
          name: "ping",
          roomName: this.roomName,
          sendedBy: playerId,
          data: {},
        });
      }

      // 5. Erros de sala
      if (payload.name === "ROOM_ERROR") {
        console.warn(
          `[Sala ${this.roomId}] [${this.roomName}] ROOM_ERROR para Player ${playerId}: ${payload.data?.message}`,
        );
      }

      // 6. Fim de jogo (WIN)
      if (payload.name === "WIN" || payload.name === "BROADCAST:WIN") {
        if (!this.isFinished) {
          this.isFinished = true;
          const winner = payload.sendedBy ?? playerId;
          const durationMs = Date.now() - this.startTime;
          console.log(
            `[Sala ${this.roomId}] [${this.roomName}] Partida finalizada! Vencedor: Player ${winner} (em ${(durationMs / 1000).toFixed(1)}s, ${this.turnsPlayed} jogadas)`,
          );

          this.closeAllSockets();
          this.onComplete({
            roomId: this.roomId,
            roomName: this.roomName,
            winnerPlayerId: winner,
            turnsPlayed: this.turnsPlayed,
            durationMs,
            success: true,
          });
        }
      }
    }
  }

  public closeAllSockets(): void {
    for (const ws of this.sockets) {
      try {
        if (
          ws.readyState === WebSocket.OPEN ||
          ws.readyState === WebSocket.CONNECTING
        ) {
          ws.close();
        }
      } catch (_e) {
        // Ignora erros ao fechar
      }
    }
  }
}

async function main() {
  console.log("=================================================");
  console.log(` Iniciando teste multi-salas: ${TOTAL_ROOMS} salas simultâneas`);
  console.log(
    ` Total de conexões WebSocket: ${TOTAL_ROOMS * PLAYERS_PER_ROOM}`,
  );
  console.log(` URL WebSocket: ${WS_URL}`);
  console.log("=================================================\n");

  const results: RoomResult[] = [];
  const rooms: RoomSimulation[] = [];

  const allCompletedPromise = new Promise<void>((resolve) => {
    let completedCount = 0;

    for (let r = 0; r < TOTAL_ROOMS; r++) {
      const randomSuffix = Math.floor(Math.random() * 900 + 100);
      const roomName = `R${r + 1}_${randomSuffix}`;
      const room = new RoomSimulation(r + 1, roomName, (result) => {
        results.push(result);
        completedCount++;
        console.log(
          `>> Progresso: ${completedCount}/${TOTAL_ROOMS} salas finalizadas.\n`,
        );
        if (completedCount === TOTAL_ROOMS) {
          resolve();
        }
      });
      rooms.push(room);
    }
  });

  // Escuta SIGINT para encerrar graciosamente se o usuário der Ctrl+C
  Deno.addSignalListener("SIGINT", () => {
    console.log("\n[Abortando] Encerrando sockets de todas as salas...");
    for (const room of rooms) {
      room.closeAllSockets();
    }
    Deno.exit(0);
  });

  // Inicia todas as salas concorrentemente
  for (const room of rooms) {
    room.start();
  }

  await allCompletedPromise;

  console.log("\n=================================================");
  console.log("             RELATÓRIO FINAL DAS SALAS            ");
  console.log("=================================================");
  console.table(
    results.map((res) => ({
      Sala: res.roomId,
      Nome: res.roomName,
      Vencedor: `Player ${res.winnerPlayerId}`,
      Jogadas: res.turnsPlayed,
      "Duração (s)": (res.durationMs / 1000).toFixed(1),
      Status: res.success ? "OK" : "FALHA",
    })),
  );
  console.log("Todas as 10 salas foram concluídas com sucesso!");
}

if (import.meta.main) {
  main();
}
