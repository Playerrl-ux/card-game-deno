# Card Game Server

Servidor em tempo real para um card game multiplayer baseado em turnos, com suporte a múltiplas salas simultâneas, jogadores humanos, bots autônomos e persistência de partidas.

---

## O que é o projeto?

O **Card Game Server** é o backend responsável por gerenciar o ciclo de vida completo de partidas de um card game competitivo. Ele atua como fonte única da verdade para as regras e estado do jogo, garantindo que todas as ações e eventos sejam validados e distribuídos para os clientes conectados.

Principais características:

- **Multiplayer em tempo real**: Comunicação bidirecional orientada a eventos via WebSocket.
- **Gerenciamento de salas (Lobby)**: Criação de salas, entrada de jogadores, reconexão transparente e encerramento automático quando vazias.
- **Suporte a Bots autônomos**: Bots integrados que tomam decisões de jogo, blefam, desafiam e respondem a eventos em tempo hábil.
- **Gravação de partidas e replays**: Histórico de ações e eventos gravado em segundo plano para auditoria, análises e replays.
- **Validação estrita de ações**: Cada evento de jogador é validado em tempo de execução contra o estado atual da mesa e do baralho.

---

## Stack Tecnológica

- **Runtime**: [Deno](https://deno.com/) — Execução nativa de TypeScript, ambiente seguro e gerenciador de dependências e tasks embutido.
- **Framework Web / WebSocket**: [Hono](https://hono.dev/) (`hono/deno`) — Servidor HTTP leve e suporte nativo ao ciclo de vida de conexões WebSocket.
- **Validação de Schemas**: [Zod](https://zod.dev/) — Definição e validação dos contratos de dados e payloads de eventos recebidos dos clientes.
- **Persistência / Concorrência**: SQLite em [Web Worker](https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API) — Processamento e gravação assíncrona de eventos em thread separada para não bloquear o loop principal do jogo.
- **Testes**: [Vitest](https://vitest.dev/) — Suíte de testes unitários e de integração para validação das regras de negócio, fluxos de partidas e inteligência dos bots.

---

## Pré-requisitos

- **[Deno](https://deno.land/)** instalado na máquina (versão 2.x recomendada).

Para verificar se o Deno está instalado:

```bash
deno --version
```

---

## Como rodar o projeto

### 1. Clonar o repositório

```bash
git clone <URL_DO_REPOSITORIO>
cd card-game
```

### 2. Rodar em ambiente de desenvolvimento (com auto-reload)

Para iniciar o servidor vigiando alterações no código-fonte (`src/`):

```bash
deno task dev
```

### 3. Rodar em produção

Para iniciar o servidor em modo de produção (sem watch):

```bash
deno task start
```

Ou diretamente via comando Deno:

```bash
deno run -A --sloppy-imports src/network/websocket.controller.ts
```

O servidor iniciará por padrão na porta **9000**. O endpoint WebSocket para conexões é:

```
ws://localhost:9000/ws
```

---

## Testes

O projeto conta com testes unitários e de integração cobrindo regras de cartas, efeitos, sistema de bots e conexões de rede.

- **Executar todos os testes:**

  ```bash
  deno task test
  ```

- **Executar testes em modo interativo (watch):**

  ```bash
  deno task test:watch
  ```

- **Executar testes com saída detalhada:**
  ```bash
  deno task test:debug
  ```

---

## Utilitários e Scripts

- **Exportar eventos e histórico de salas:**
  ```bash
  deno task export:rooms
  ```
  Exporta os dados das salas salvas no banco de dados local para inspeção e testes.

---

## Arquitetura e Engenharia

Para uma análise detalhada das decisões arquiteturais, desafios técnicos de concorrência/Event Loop, polimorfismo dinâmico de cartas e limites de escopo, consulte o documento:
- [Decisões de Arquitetura e Engenharia](docs/architecture.md)
