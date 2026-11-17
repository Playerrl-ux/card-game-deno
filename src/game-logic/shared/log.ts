import { appendFileSync, mkdirSync } from "node:fs";
mkdirSync("logs", { recursive: true });

const LOG_FILE = "logs/app.log";

const format = (level: string, msg: string, args: unknown[]) => {
  const ts = new Date().toISOString();
  const extra = args.length ? " " + JSON.stringify(args) : "";
  return `[${ts}] [${level}] ${msg}${extra}`;
};

const log = (level: string, msg: string, args: unknown[]) => {
  const line = format(level, msg, args);
  console.log(line);
  appendFileSync(LOG_FILE, line + "\n");
};

export const logger = {
  info: (msg: string, ...args: unknown[]) => log("INFO", msg, args),
  warn: (msg: string, ...args: unknown[]) => log("WARN", msg, args),
  error: (msg: string, ...args: unknown[]) => log("ERROR", msg, args),
  debug: (msg: string, ...args: unknown[]) => log("DEBUG", msg, args),
};
