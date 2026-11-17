import { Hono } from "hono";
import { cors } from "hono/cors";
import { upgradeWebSocket } from "hono/deno";
import { EventNetwork, eventNetworkSchema } from "./network.event.ts";
import { RoomManger } from "./room.manager.ts";

const app = new Hono();

app.use(
  "*",
  cors({
    origin: "*",
    allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"],
    allowHeaders: ["*"],
    exposeHeaders: ["*"],
  }),
);
const roomManager = new RoomManger();
globalThis.addEventListener("error", (e) => {
  console.error("UNCAUGHT ERROR:", e.error);
  e.preventDefault();
});
globalThis.addEventListener("unhandledrejection", (e) => {
  console.error("UNHANDLED REJECTION:", e.reason);
  e.preventDefault();
});

roomManager.startHeartbeatMonitor();

app.get(
  "/ws",
  upgradeWebSocket((c) => {
    return {
      onOpen: (_event, _ws) => {
        console.log("[WebSocket] Client connected");
      },
      onMessage: async (event, ws) => {
        const rawSocket = (ws as any).raw || ws;
        let roomName = "";
        try {
          const text =
            typeof event.data === "string"
              ? event.data
              : new TextDecoder().decode(event.data as ArrayBuffer);

          const json = JSON.parse(text);
          if (json && typeof json.roomName === "string") {
            roomName = json.roomName;
          }
          const parsedEvent = eventNetworkSchema.parse(json) as EventNetwork;

          await roomManager.handle(parsedEvent, rawSocket as WebSocket);
        } catch (err) {
          const message =
            err instanceof Error ? err.message : "Invalid JSON or Event schema";
          roomManager.sendError(rawSocket as WebSocket, message, roomName);
        }
      },
      onClose: (_event, ws) => {
        console.log("[WebSocket] Client disconnected");
        const rawSocket = (ws as any).raw || ws;
        roomManager.handleDisconnect(rawSocket as WebSocket);
      },
      onError: (err, ws) => {
        console.error("[WebSocket] Error:", err);
        const rawSocket = (ws as any).raw || ws;
        roomManager.handleDisconnect(rawSocket as WebSocket);
      },
    };
  }),
);

console.log("[Server] Running WebSocket controller on 0.0.0.0:9000...");
Deno.serve({ port: 9000, hostname: "0.0.0.0" }, app.fetch);

export { app, roomManager };
