function handleOpen() {
  console.log("Conexao aberta");
}

function handleClose() {
  console.log("Conexao fechada");
}

function handleError(e: Event | ErrorEvent) {
  console.log("an error ocurred");
  console.log(e instanceof ErrorEvent ? e.message : e.type);
}

function handleMessage(this: WebSocket, message: MessageEvent) {
  console.log("Mensagem recebida: " + message.data);
  const reply = prompt("Server >> ") || "No reply";
  if (reply === "exit") {
    return this.close();
  }
  this.send(reply as string);
}

async function reqHandler(req: Request) {
  if (req.headers.get("upgrade") !== "websocket") {
    return new Response(null, { status: 501 });
  }
  const { socket: ws, response: res } = Deno.upgradeWebSocket(req);
  ws.onopen = handleOpen;
  ws.onclose = handleClose;
  ws.onerror = handleError;
  ws.onmessage = handleMessage;

  return res;
}
console.log("Waiting for messages...");
Deno.serve({ port: 9000 }, reqHandler);
