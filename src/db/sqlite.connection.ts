import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";

export type SqliteDatabase = InstanceType<typeof DatabaseSync>;

let dbInstance: SqliteDatabase | undefined;

const SCHEMA_SQL = `
  CREATE TABLE IF NOT EXISTS rooms (
    id TEXT PRIMARY KEY,
    name TEXT UNIQUE NOT NULL,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS matches (
    id TEXT PRIMARY KEY,
    room_id TEXT NOT NULL,
    mode_name TEXT NOT NULL,
    seed INTEGER,
    status TEXT NOT NULL,
    created_at TEXT NOT NULL,
    ended_at TEXT,
    FOREIGN KEY (room_id) REFERENCES rooms(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS match_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    match_id TEXT NOT NULL,
    sequence INTEGER NOT NULL,
    timestamp INTEGER NOT NULL,
    source TEXT NOT NULL,
    sender_id INTEGER NOT NULL,
    event_type TEXT NOT NULL,
    event_name TEXT NOT NULL,
    payload TEXT NOT NULL,
    FOREIGN KEY (match_id) REFERENCES matches(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_match_events_match_seq ON match_events(match_id, sequence);
  CREATE INDEX IF NOT EXISTS idx_matches_room_id ON matches(room_id);
  CREATE INDEX IF NOT EXISTS idx_rooms_name ON rooms(name);
`;

export function getDatabase(dbPath: string = "data/replays.db"): SqliteDatabase {
  if (dbInstance && dbPath === "data/replays.db") {
    return dbInstance;
  }

  if (dbPath !== ":memory:") {
    mkdirSync("data", { recursive: true });
  }

  const db = new DatabaseSync(dbPath);
  db.exec("PRAGMA foreign_keys = ON;");
  if (dbPath !== ":memory:") {
    db.exec("PRAGMA journal_mode = WAL;");
    db.exec("PRAGMA synchronous = NORMAL;");
  }
  db.exec(SCHEMA_SQL);

  if (dbPath === "data/replays.db") {
    dbInstance = db;
  }

  return db;
}

export function closeDatabase(): void {
  if (dbInstance) {
    dbInstance.close();
    dbInstance = undefined;
  }
}
