/**
 * Script de Teste End-to-End (Headless Client)
 *
 * Cria 4 conexões WebSocket simulando 4 clientes.
 * - Cliente 0: Cria a sala com isTestRoom=true
 * - Clientes 1, 2 e 3: Entram na sala
 * - Cliente 0: Inicia o jogo
 * - Todos os clientes escutam TEST_PLAY e devolvem o evento (Echo).
 * - Todos os eventos recebidos são salvos em data/test-client-events.jsonl
 * - O script termina ao receber o evento de WIN ou BROADCAST:WIN.
 *
 * Para rodar:
 * deno run -A scripts/test-client.ts
 */

const ROOM_NAME = "TEST_" + Math.floor(Math.random() * 1000);
const WS_URL = "ws://localhost:9000/ws";

const MAX_PLAYERS = 4;
const sockets: WebSocket[] = [];
let joinedPlayers = 0;
let isGameStarted = false;

// Limpa/Cria o arquivo de logs
try {
  Deno.mkdirSync("./data", { recursive: true });
} catch (e) {
  // Pasta data/ já existe
}
for (let i = 0; i < MAX_PLAYERS; i++) {
  Deno.writeTextFileSync(`./data/client_${i}.jsonl`, "");
}

function appendLog(playerId: number, source: "CLIENT" | "SERVER", data: any) {
  const logEntry =
    JSON.stringify({
      timestamp: new Date().toISOString(),
      source,
      event: data,
    }) + "\n";
  Deno.writeTextFileSync(`./data/client_${playerId}.jsonl`, logEntry, {
    append: true,
  });
}

function sendToServer(ws: WebSocket, playerId: number, payload: any) {
  appendLog(playerId, "CLIENT", payload);
  ws.send(JSON.stringify(payload));
}

async function start() {
  console.log(
    `[TestClient] Conectando ${MAX_PLAYERS} websockets em ${WS_URL}...`,
  );

  for (let i = 0; i < MAX_PLAYERS; i++) {
    const ws = new WebSocket(WS_URL);
    sockets.push(ws);

    ws.onopen = () => {
      console.log(`[Player ${i}] WebSocket Conectado!`);

      if (i === 0) {
        sendToServer(ws, i, {
          type: "EXTERNAL",
          name: "createRoom",
          roomName: ROOM_NAME,
          data: { isTestRoom: true },
        });
      }
    };

    ws.onmessage = (event) => {
      const payload = JSON.parse(event.data);
      appendLog(i, "SERVER", payload);

      if (payload.type === "SERVER" || payload.type === "EXTERNAL") {
        if (payload.name === "ROOM_CREATED" && i === 0) {
          console.log(
            `[Player ${i}] Sala ${ROOM_NAME} criada. Conectando os bots...`,
          );
          for (let j = 1; j < MAX_PLAYERS; j++) {
            sendToServer(sockets[j], j, {
              type: "EXTERNAL",
              name: "joinRoom",
              roomName: ROOM_NAME,
              data: {},
            });
          }
        }

        if (payload.name === "ROOM_JOINED") {
          // Deixa apenas o Player 0 contar as entradas para evitar Race Conditions nos logs
          if (i === 0) {
            joinedPlayers++;
            console.log(
              `[Player 0] Detectou entrada de jogador (${joinedPlayers}/${MAX_PLAYERS - 1})`,
            );

            if (joinedPlayers === MAX_PLAYERS - 1 && !isGameStarted) {
              isGameStarted = true;
              console.log(
                `[Player 0] Iniciando o jogo na sala ${ROOM_NAME}...`,
              );

              sendToServer(sockets[0], 0, {
                type: "EXTERNAL",
                name: "startGame",
                roomName: ROOM_NAME,
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
        }

        if (payload.name === "TEST_PLAY") {
          console.log(
            `[Player ${i}] Bot recebeu TEST_PLAY: ${payload.data.eventName}. Devolvendo...`,
          );

          sendToServer(ws, i, {
            type: "GAME",
            name: payload.data.eventName,
            roomName: ROOM_NAME,
            sendedBy: i,
            data: { data: payload.data.data },
          });
        }

        if (payload.name === "WIN" || payload.name === "BROADCAST:WIN") {
          console.log(`[Player ${i}] Recebeu evento de WIN! Encerrando...`);
          ws.close();
        }

        if (payload.name === "PING") {
          sendToServer(ws, i, {
            type: "EXTERNAL",
            name: "ping",
            roomName: ROOM_NAME,
            sendedBy: i,
            data: {},
          });
        }
      }
    };

    ws.onclose = () => {
      console.log(`[Player ${i}] Desconectado.`);
    };

    ws.onerror = (err) => {
      console.error(`[Player ${i}] Erro no socket:`, err);
    };
  }
}

start();
