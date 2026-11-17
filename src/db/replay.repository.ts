import { ackDataSchema } from "../worker/message.schema.ts";

export interface RoomRecord {
  id: string;
  name: string;
  createdAt: string;
}

export interface MatchRecord {
  id: string;
  roomId: string;
  modeName: string;
  seed: number | null;
  status: "IN_PROGRESS" | "FINISHED" | "ABORTED";
  createdAt: string;
  endedAt: string | null;
}

export interface RecordedEventRecord {
  id: number;
  matchId: string;
  sequence: number;
  timestamp: number;
  source: "CLIENT" | "SERVER";
  senderId: number;
  eventType: "GAME" | "EXTERNAL";
  eventName: string;
  payload: string; // JSON string
}

export interface ReplayData {
  match: MatchRecord;
  events: RecordedEventRecord[];
}

export class ReplayRepository {
  private sequenceCounters: Map<string, number> = new Map();
  private roomCache: Map<string, RoomRecord> = new Map();
  private worker: Worker;
  private promisesMap = new Map<
    number,
    {
      resolve: (value: any) => void;
      reject: (reason?: any) => void;
    }
  >();
  private nextPromiseId = 1;
  // usado num outro codigo para monitorar o numero de eventos na fila do worker
  private pendingEventsCount = 0;

  private readonly mainEventStmt = `
    INSERT INTO match_events (
      match_id, sequence, timestamp, source, sender_id, event_type, event_name, payload
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
`;

  constructor(worker: Worker) {
    this.worker = worker;

    // Configura o PreparedStatement principal no worker
    this.worker.postMessage({
      name: "MAIN_STATEMENT",
      mainSttm: this.mainEventStmt,
    });

    this.worker.onmessage = (e: MessageEvent) => {
      const parseResult = ackDataSchema.safeParse(e.data);
      if (!parseResult.success) {
        return;
      }
      const { promiseId, data, error } = parseResult.data;

      if (this.pendingEventsCount > 0) {
        this.pendingEventsCount--;
      }

      if (error) {
        console.error(
          `[ReplayRepository] Erro retornado pelo worker (ID: ${promiseId}):`,
          error,
        );
      }

      const resolvers = this.promisesMap.get(promiseId);
      if (resolvers) {
        this.promisesMap.delete(promiseId);
        if (error) {
          resolvers.reject(new Error(error));
        } else {
          resolvers.resolve(data);
        }
      }
    };
  }

  /**
   * Executa uma consulta de leitura no SQLite através do Worker de forma assíncrona.
   */
  getDataAsync<T = unknown>(
    sql: string,
    args: unknown[] = [],
    method: "get" | "all" = "all",
  ): Promise<T> {
    const promiseId = this.nextPromiseId++;
    const { promise, resolve, reject } = Promise.withResolvers<T>();

    this.promisesMap.set(promiseId, { resolve, reject });
    this.pendingEventsCount++;

    this.worker.postMessage({
      name: "DATABASE_READ",
      promiseId,
      data: {
        sql,
        args,
        method,
      },
    });

    return promise;
  }

  /**
   * Executa uma gravação no SQLite através do Worker aguardando confirmação.
   */
  runDataAsync(sql: string, args: unknown[] = []): Promise<void> {
    const promiseId = this.nextPromiseId++;
    const { promise, resolve, reject } = Promise.withResolvers<void>();

    this.promisesMap.set(promiseId, { resolve, reject });
    this.pendingEventsCount++;

    this.worker.postMessage({
      name: "DATABASE_WRITE",
      promiseId,
      data: {
        sql,
        args,
      },
    });

    return promise;
  }

  /**
   * Busca uma sala existente pelo nome ou cria uma nova e retorna seu registro.
   */
  async getOrCreateRoom(roomName: string): Promise<RoomRecord> {
    const cached = this.roomCache.get(roomName);
    if (cached) {
      return cached;
    }

    const existing = await this.getRoomByName(roomName);
    if (existing) {
      this.roomCache.set(roomName, existing);
      return existing;
    }

    const id = crypto.randomUUID();
    const createdAt = new Date().toISOString();
    const roomRecord: RoomRecord = { id, name: roomName, createdAt };
    this.roomCache.set(roomName, roomRecord);

    await this.runDataAsync(
      "INSERT INTO rooms (id, name, created_at) VALUES (?, ?, ?)",
      [id, roomName, createdAt],
    );

    return roomRecord;
  }

  /**
   * Retorna os dados de uma sala pelo nome.
   */
  async getRoomByName(roomName: string): Promise<RoomRecord | null> {
    const cached = this.roomCache.get(roomName);
    if (cached) {
      return cached;
    }

    const row = await this.getDataAsync<RoomRecord | undefined>(
      "SELECT id, name, created_at as createdAt FROM rooms WHERE name = ?",
      [roomName],
      "get",
    );

    if (row) {
      this.roomCache.set(roomName, row);
      return row;
    }

    return null;
  }

  /**
   * Registra uma nova partida no banco de dados vinculada ao ID da sala.
   */
  async createMatch(
    matchId: string,
    roomName: string,
    modeName: string,
    seed: number | null = null,
  ): Promise<void> {
    this.sequenceCounters.set(matchId, 0);
    const room = await this.getOrCreateRoom(roomName);
    const createdAt = new Date().toISOString();

    await this.runDataAsync(
      `
      INSERT INTO matches (id, room_id, mode_name, seed, status, created_at)
      VALUES (?, ?, ?, ?, 'IN_PROGRESS', ?)
      `,
      [matchId, room.id, modeName, seed, createdAt],
    );
  }

  /**
   * Registra uma ação/evento sequencial da partida.
   * Não bloqueia a thread principal: atualiza a sequência em memória e
   * despacha a gravação de forma assíncrona ao Worker.
   */
  recordEvent(
    matchId: string,
    source: "CLIENT" | "SERVER",
    senderId: number,
    eventType: "GAME" | "EXTERNAL",
    eventName: string,
    payload: unknown,
  ): number {
    let currentSeq = this.sequenceCounters.get(matchId);
    if (currentSeq === undefined) {
      currentSeq = 0;
    }

    const nextSeq = currentSeq + 1;
    this.sequenceCounters.set(matchId, nextSeq);

    const timestamp = Date.now();
    const payloadStr =
      typeof payload === "string" ? payload : JSON.stringify(payload);

    const promiseId = this.nextPromiseId++;
    this.pendingEventsCount++;

    this.worker.postMessage({
      name: "DATABASE_WRITE",
      matchId,
      promiseId,
      data: {
        sql: this.mainEventStmt,
        useMain: true,
        args: [
          matchId,
          nextSeq,
          timestamp,
          source,
          senderId,
          eventType,
          eventName,
          payloadStr,
        ],
      },
    });

    return nextSeq;
  }

  /**
   * Finaliza uma partida alterando seu status e salvando o tempo de encerramento.
   */
  finishMatch(
    matchId: string,
    status: "FINISHED" | "ABORTED" = "FINISHED",
  ): Promise<void> {
    const endedAt = new Date().toISOString();
    this.sequenceCounters.delete(matchId);

    const promiseId = this.nextPromiseId++;
    const { promise, resolve, reject } = Promise.withResolvers<void>();

    this.promisesMap.set(promiseId, { resolve, reject });
    this.pendingEventsCount++;

    this.worker.postMessage({
      name: "FINISH_GAME",
      promiseId,
      matchId,
    });

    return Promise.all([
      promise,
      this.runDataAsync(
        `
      UPDATE matches
      SET status = ?, ended_at = ?
      WHERE id = ?
      `,
        [status, endedAt, matchId],
      ),
    ]).then(() => undefined);
  }

  /**
   * Recupera todos os metadados e eventos ordenados de uma partida para replay.
   */
  async getMatchReplay(matchId: string): Promise<ReplayData | null> {
    const matchRow = await this.getDataAsync<MatchRecord | undefined>(
      `
      SELECT id, room_id as roomId, mode_name as modeName, seed, status, created_at as createdAt, ended_at as endedAt
      FROM matches WHERE id = ?
      `,
      [matchId],
      "get",
    );

    if (!matchRow) {
      return null;
    }

    const eventRows = await this.getDataAsync<RecordedEventRecord[]>(
      `
      SELECT id, match_id as matchId, sequence, timestamp, source, sender_id as senderId, event_type as eventType, event_name as eventName, payload
      FROM match_events
      WHERE match_id = ?
      ORDER BY sequence ASC
      `,
      [matchId],
      "all",
    );

    return {
      match: matchRow,
      events: eventRows,
    };
  }

  /**
   * Retorna as partidas vinculadas a uma sala específica (buscando pelo nome da sala).
   */
  async getMatchesByRoom(roomName: string): Promise<MatchRecord[]> {
    return await this.getDataAsync<MatchRecord[]>(
      `
      SELECT m.id, m.room_id as roomId, m.mode_name as modeName, m.seed, m.status, m.created_at as createdAt, m.ended_at as endedAt
      FROM matches m
      INNER JOIN rooms r ON m.room_id = r.id
      WHERE r.name = ?
      ORDER BY m.created_at DESC
      `,
      [roomName],
      "all",
    );
  }
}
