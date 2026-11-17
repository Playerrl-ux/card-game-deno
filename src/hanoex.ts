import { Hono } from "hono";
import { upgradeWebSocket } from "hono/deno";

const app = new Hono();

app.get(
  "/",
  upgradeWebSocket((c) => {
    return {
      onMessage: (event, ws) => {
        console.log("Message received: " + event.data);
        ws.send("Hello from the server!");
      },
      onOpen: (_event, _ws) => {},
    };
  }),
);

Deno.serve({ port: 8000 }, app.fetch);
