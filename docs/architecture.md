# Decisões de Arquitetura e Engenharia — Card Game Server

Este documento detalha as decisões de design, escolhas de engenharia, desafios técnicos enfrentados e os limites de escopo do **Card Game Server**.

---

## 1. Visão Geral e Filosofia do Projeto

O objetivo principal deste projeto foi construir uma **engine de jogo autoritativa e reativa em tempo real**, servindo como um laboratório prático aprofundado para dominar:

- **Programação assíncrona avançada em JavaScript/TypeScript**: controle fino de Promises, encadeamento, composição e cancelamento.
- **Mecânica do Event Loop**: microtasks vs macrotasks, gerenciamento rigoroso de timers e prevenção de condições de corrida.
- **Comunicação bidirecional orientada a eventos**: arquitetura desacoplada via WebSockets com múltiplos clientes simultâneos.

### Backend 100% Autoritativo

O servidor detém o estado absoluto da partida e atua como a única fonte da verdade (_single source of truth_). O cliente (frontend ou bot) é puramente reativo: envia intenções de ação via eventos e renderiza as respostas e broadcasts do servidor, sem fazer suposições locais ou antecipar alterações de regras.

---

## 2. Decisões de Design e Features

### 2.1 Separação Estrita em Camadas: Rede vs Engine de Jogo

O sistema é desacoplado em dois domínios arquiteturais bem delimitados:

1. **Camada de Rede (`src/network`)**:
   - Gerencia o ciclo de vida das conexões WebSocket (abertura, fechamento, heartbeat e reconexão).
   - Gerencia salas (`RoomManager`), agrupamento de sockets e roteamento de mensagens brutas de/para clientes.
2. **Camada de Lógica do Jogo (`src/game-logic`)**:
   - Contém as regras de negócio, mecânicas do baralho, pilha de descarte, mãos de jogadores e efeitos de cartas.
   - É agnóstica à infraestrutura de transporte (não sabe o que é um socket HTTP ou WebSocket).

### 2.2 Arquitetura Orientada a Eventos e Actions Sem Estado (Data-Centric Design)

A lógica da engine é dividida em eventos que o cliente pode emitir (`client:PLAY_CARD`, `client:DRAW_CHOICE`, `client:JUMP_IN`, etc.):

- **Actions Stateless (Singletons Funcionais)**: Cada evento possui uma `action` que processa os dados recebidos. Os objetos que definem a lógica dos eventos são instâncias únicas em todo o sistema.
- **Centralização do Estado**: A action não armazena estado próprio; ela recebe o estado da sala (`DefaultState`), o payload validado e o `EventManager`. Toda mutação ocorre exclusivamente no estado da sala.

### 2.3 Estado Exclusivo e Isolamento Completo por Sala

- Cada partida possui uma instância dedicada e isolada de `DefaultState`.
- Não há estado mutável compartilhado entre salas. Duas ou dezenas de salas rodando em paralelo processam suas jogadas de forma independente, eliminando qualquer risco de contaminação de memória ou interferência cruzada.

### 2.4 Validação Estrita nas Bordas com Zod

A camada de validação (`EventGuard` / `client-payloads.ts`) utiliza **Zod** nos pontos de entrada das mensagens:

- Dados malformatados, tipos inválidos ou campos ausentes são rejeitados antes de alcançar a engine.
- As actions da engine de jogo recebem dados previamente validados e tipados em tempo de compilação e execução, sem a necessidade de conversões defensivas ou verificações manuais de schema espalhadas pelas regras de negócio.

### 2.5 Extensibilidade e Tipos Base para Modos de Jogo

A arquitetura foi desenhada em torno de contratos base (`DefaultState`, `DefaultPlayerState`, `DefaultClientEvent`, `DefaultCard`):

- Regras e novos modos podem ser adicionados plugando novos conjuntos de eventos ou alterando a composição do deck sem a necessidade de reescrever o motor de turnos ou a camada de rede.

### 2.6 Separação entre Eventos Internos e Externos

O protocolo de comunicação estabelece uma fronteira clara:

- **Eventos Externos**: Relacionados ao gerenciamento de infraestrutura, lobby e salas (`create_room`, `join_room`, `leave_room`, `room_state`).
- **Eventos Internos**: Relacionados estritamente à gameplay do card game (`client:PLAY_CARD`, `client:DRAW_CHOICE`, `client:JUMP_IN`, etc.).

### 2.7 Persistência Concorrente em Segundo Plano (SQLite + Web Worker)

Para armazenar o histórico completo de eventos de cada partida sem prejudicar a taxa de transferência (_throughput_) da engine:

- A gravação em banco de dados SQLite é delegada a um **Web Worker** independente (`store-worker.ts`).
- A engine apenas despacha mensagens assíncronas para o Worker via `postMessage`.
- O I/O em disco do banco de dados roda em uma thread separada do SO, garantindo impacto praticamente nulo no loop de eventos das partidas.

### 2.8 Bots com IA Autônoma e Assunção de Desconexão

- Quando um jogador humano perde a conexão WebSocket, a partida não é travada: um agente bot é ativado automaticamente para assumir a mão do jogador.
- Se o humano reconectar na sala, o bot é invalidado de forma transparente e seus timers pendentes são cancelados.
- Os bots possuem memória dedutiva (rastreamento de cores não correspondidas dos adversários, cartas conhecidas) e tomam decisões estratégicas de blefe, desafio e tempo de reação aleatório para eventos rápidos.

### 2.9 Deno Runtime e Scripts de Carga

- Utilização do **Deno** pelo suporte nativo a TypeScript, módulos modernos (ESM), WebSockets e isolamento seguro de permissões.
- Criação de scripts automatizados (`scripts/test-multi-rooms.ts`, `scripts/test-client.ts`) para estressar o servidor com 1 até 10+ salas de bots simultâneas rodando a toda velocidade de forma concorrente e sem vazamento de memória.

---

## 3. Principais Desafios Técnicos e Lições Aprendidas

### 3.1 Data-Driven Actions vs Polimorfismo Dinâmico de Cartas por Sala

Um desafio central de design foi decidir onde aplicar padrões sem estado versus polimorfismo:

- **As Actions são estáticas e globais**: Como a lógica de resolução de um evento é idêntica para todas as salas, as actions são singletons que apenas operam sobre dados externos (`state`).
- **As Cartas possuem polimorfismo por sala**: Diferente das actions, cartas especiais dependem de flags de configuração ativadas no início da partida (por exemplo, a regra opcional da carta 7 de trocar de mãos).
  - _Abordagem adotada_: Em vez de executar `if (configs.SEVEN_RULE)` dentro do método da carta a cada jogada, a fábrica de baralho instancia no início da partida a variante da carta que já contém ou omite os métodos de efeito específicos. A carta resultante é uma instância especializada exclusiva daquela sala, acelerando o processamento em tempo de execução.

### 3.2 Desacoplamento entre Camadas via Injeção de Callbacks

Para evitar dependências circulares entre a camada de rede (`RoomManager`), o filtro de eventos (`EventGuard`), o despachante de regras (`EventManager`) e o orquestrador de IA (`BotManager`), foi adotada uma injeção de callbacks nos construtores:

- O `EventManager` apenas invoca callbacks para emitir mensagens e transicionar estados.
- O `BotManager` conecta suas decisões emitindo eventos através de callbacks injetados.
- As camadas conversam nos cenários necessários sem conhecer detalhes concretos das implementações umas das outras.

### 3.3 Gerenciamento de Passagem de Turno e "Os Terrores de Zalgo"

A sincronização da passagem de turno provou ser um dos aspectos mais complexos da engine:

- O turno pode ser passado por múltiplos eventos (`PLAY_CARD`, `JUMP_IN`, `CHALLENGE`, timeout de jogada).
- No fluxo de `PLAY_CARD`, cartas podem disparar efeitos preliminares (`effectBefore`) ou efeitos posteriores (`effectAfter`). O efeito pode solicitar a passagem de turno, postergá-la aguardando eventos de terceiros (como escolha de cor ou cartas de compra), ou suspender a troca de turno (`CAN_CHANGE.NO`).
- **A Lição de Zalgo (Consistência Síncrona vs Assíncrona)**:
  Em versões iniciais, algumas branches de código retornavam de forma síncrona enquanto outras aguardavam Promises (`waitForEvent`). Essa mistura imprevisível de comportamentos síncronos e assíncronos na mesma cadeia de execução (_liberar Zalgo_) causava condições de corrida, onde microtasks eram processadas fora de ordem e o turno avançava antes de efeitos pendentes terminarem.
  - _Solução_: Padronização rigorosa do pipeline assíncrono. Toda cadeia de resolução de efeito é explicitamente sequencial (`await effectBefore -> await waitForEvent -> await effectAfter -> tryChange`), garantindo previsibilidade absoluta no Event Loop.

---

## 4. O que NÃO Está Incluído (Escopo Delimitado)

Para manter o foco do projeto no aprendizado profundo de concorrência, WebSockets e programação assíncrona, certas funcionalidades foram deliberadamente deixadas fora de escopo:

1. **Autenticação e Autorização Complexas**:
   - Não há sistema de login com senhas, JWT ou OAuth. A entrada nas salas utiliza um modelo simples baseado no nome da sala e IDs efêmeros de sessão.
2. **Servidor HTTP Tradicional (REST / GraphQL)**:
   - Não há rotas HTTP de CRUD ou APIs REST tradicionais. Toda a troca de mensagens, criação de partidas e interação do jogador ocorre 100% sobre conexões WebSocket persistentes.
3. **Infraestrutura de Nuvem e Deploy de Produção**:
   - O projeto foca na engine e no servidor local, sem configurações avançadas de orquestração de containers (Kubernetes), balanceamento de carga com sticky sessions ou clusterização de instâncias.
