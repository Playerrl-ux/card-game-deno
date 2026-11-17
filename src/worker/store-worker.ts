/// <reference no-default-lib="true" />
/// <reference lib="deno.worker" />

import { getDatabase } from "../db/sqlite.connection.ts";
import { EventData, generalSchema } from "./message.schema.ts";

const db = getDatabase();
const eventsByMatch = new Map<string, EventData[]>();
let totalPendingEvents = 0;
const MAX_SIZE = 1000;
let mainStmt: any;
const flushTimeoutMs = 500;
let flushTimer: ReturnType<typeof setTimeout> | undefined;

function push(evt: EventData) {
  const key =
    evt.matchId ??
    (Array.isArray(evt.data?.args) ? evt.data.args[0] : undefined) ??
    "any";
  let list = eventsByMatch.get(key);
  if (!list) {
    list = [];
    eventsByMatch.set(key, list);
  }
  list.push(evt);
  totalPendingEvents++;

  if (totalPendingEvents >= MAX_SIZE) {
    flush();
  }
}

function flush() {
  clearTimeout(flushTimer);
  if (totalPendingEvents > 0) {
    const allEvents: EventData[] = [];
    for (const list of eventsByMatch.values()) {
      allEvents.push(...list);
    }
    eventsByMatch.clear();
    totalPendingEvents = 0;
    writeToDatabase(allEvents);
  }
  flushTimer = setTimeout(() => flush(), flushTimeoutMs);
}

function writeToDatabase(evt: EventData[]) {
  if (evt.length === 0) return;
  db.exec("BEGIN TRANSACTION");

  try {
    for (const item of evt) {
      if (item.data.alreadyWritten) {
        continue;
      }
      try {
        if (item.data.useMain && mainStmt) {
          mainStmt.run(...item.data.args);
        } else {
          db.prepare(item.data.sql).run(...item.data.args);
        }
        if (item.promiseId !== undefined) {
          self.postMessage({
            promiseId: item.promiseId,
            data: { success: true },
          });
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error("[StoreWorker] Erro ao gravar dados no SQLite:", message);
        if (item.promiseId !== undefined) {
          self.postMessage({
            promiseId: item.promiseId,
            error: message,
          });
        }
      }
    }

    db.exec("COMMIT");
  } catch (err) {
    try {
      db.exec("ROLLBACK");
    } catch {}
    const message = err instanceof Error ? err.message : String(err);
    console.error(
      "[StoreWorker] Falha ao comitar transação no SQLite:",
      message,
    );
  }
}

self.onmessage = (evt: MessageEvent) => {
  try {
    const parsed = generalSchema.parse(evt.data);

    if (parsed.name == "MAIN_STATEMENT") {
      mainStmt = db.prepare(parsed.mainSttm);
      flushTimer = setTimeout(() => flush(), flushTimeoutMs);
    } else if (parsed.name === "FINISH_GAME") {
      const matchEvents = eventsByMatch.get(parsed.matchId);
      if (matchEvents && matchEvents.length > 0) {
        eventsByMatch.delete(parsed.matchId);
        totalPendingEvents -= matchEvents.length;
        writeToDatabase(matchEvents);
      }
      self.postMessage({
        promiseId: parsed.promiseId,
        data: { success: true },
      });
    } else {
      const { name, promiseId, data } = parsed;
      const params = Array.isArray(data.args) ? data.args : [data.args];

      if (name === "DATABASE_READ") {
        try {
          const stmt = db.prepare(data.sql);
          const result =
            data.method === "get" ? stmt.get(...params) : stmt.all(...params);

          if (promiseId !== undefined) {
            self.postMessage({
              promiseId,
              data: result,
            });
          }
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          if (promiseId !== undefined) {
            self.postMessage({
              promiseId,
              error: message,
            });
          }
        }
      }
      if (name === "DATABASE_WRITE") {
        push(parsed);
      }
    }
  } catch (err) {
    console.log(evt.data.name);
    console.error("[StoreWorker] Erro ao processar mensagem:", err);
  }
};
