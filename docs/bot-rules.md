# Especificação da Inteligência Artificial do Bot

Este documento especifica o modelo de dados, as regras de inferência lógica e os algoritmos de tomada de decisão para a Inteligência Artificial (Bot) do jogo de cartas.

---

## 1. Modelo de Estado Interno (`BotMemoryState`)

Para cada jogador da sala (exceto o próprio Bot), o Bot manterá e atualizará constantemente o seguinte estado de memória:

```typescript
export interface PlayerMemory {
  playerId: number;
  // Conjunto de IDs de cartas que o Bot sabe com 100% de certeza que o jogador possui (obtidas via Carta 7 ou 0)
  knownCardIds: Set<number>;
  // Conjunto de Cores que o jogador provavelmente NÃO tem (porque comprou uma carta opcionalmente no turno daquela cor)
  unmatchedColors: Set<COLOR>;
  // Quantidade de cartas jogadas da cor ativa desde a última compra
  playedColorCounts: Map<COLOR, number>;
}
```

---

## 2. Regras de Atualização do Estado Interno (Reação aos Eventos)

### 2.1. Quando um Jogador Joga uma Carta
- **Atualização de Contagem**: Incrementar a contagem da cor da carta jogada no mapa `playedColorCounts` do jogador.
- **Remoção de Certeza**: Se a carta jogada estiver no `knownCardIds` daquele jogador, removê-la da lista (pois ela saiu da mão dele).
- **Evitar Cor do Oponente**: Se a carta jogada for um Coringa (`WILD` ou `DRAW_4`), o Bot registra a cor escolhida pelo jogador para evitar escolhê-la em turnos futuros caso queira prejudicá-lo.

### 2.2. Quando um Jogador Compra Carta Opcionalmente (por Opção)
- **Inferência de Ausência de Cor**: Adicionar a cor ativa da mesa no conjunto `unmatchedColors` do jogador, pois a compra opcional indica que ele não possuía cartas jogáveis daquela cor no momento.

### 2.3. Quando um Jogador Compra Cartas por Efeito (+2 / +4)
- **Reset de Inferências**: Limpar o conjunto `unmatchedColors` do jogador, pois as novas cartas compradas podem conter qualquer cor.
- **Preservação de Certezas**: O conjunto `knownCardIds` **permanece mantido**, pois o jogador continua em posse das cartas que já tinha anteriormente.

### 2.4. Quando a Carta 7 é Jogada (Troca de Mãos)
- **Troca entre Dois Oponentes (Sem o Bot)**: Inverter o estado completo (`knownCardIds` e `unmatchedColors`) entre o Jogador A e o Jogador B.
- **Troca Envolvendo o Bot**:
  - As cartas que o Bot possuía na mão passam a ser registradas como `knownCardIds` com 100% de certeza para o jogador que recebeu a mão do Bot.
  - O estado do jogador com quem o Bot trocou é atribuído à memória do Bot sobre ele.

### 2.5. Quando a Carta 0 é Jogada (Rotação Global de Mãos)
- **Rotação Global**: Deslocar o estado completo de todos os jogadores na direção atual do jogo (`DIRECTION.RIGHT` ou `DIRECTION.LEFT`).
- O Bot atribui as cartas que tinha antes da rotação como `knownCardIds` do jogador que recebeu a sua mão.

---

## 3. Algoritmo de Tomada de Decisão no Turno do Bot

### 3.1. Validação Soberana da Carta +4 (`DRAW_4`)
- **Regra do Desafio (+4)**: Se a regra `DRAW_4_CHALLENGES` estiver ativa no jogo, o Bot **somente poderá considerar jogar um +4 se não possuir nenhuma outra carta válida da cor atual na mão** (evitando blefes arriscados que geram punições).

### 3.2. Análise de Ameaças (Jogadores com Poucas Cartas < 4)
Considerando as posições relativas na mesa: `P+1` (Próximo/Segundo), `P+2` (Terceiro) e `P+3` (Quarto — logo antes do Bot):

1. **Se o Próximo Jogador (`P+1`) estiver com Poucas Cartas (< 4)**:
   - Priorizar jogar cartas de bloqueio (`BLOCK`, `REVERSE`) ou cartas de compra (`DRAW_2`, `DRAW_4`).
   - Se jogar Coringa ou +4: escolher uma cor contida no `unmatchedColors` de `P+1`. Se não houver informação, escolher a cor mais abundante na própria mão do Bot.
   - **Compra forçada**: Se nenhuma carta disponível para jogar bloquear a vez de `P+1` (incluindo `+4`) **ou** tiver a cor que `P+1` provavelmente não possui (via `unmatchedColors`), o Bot deve **comprar uma carta** em vez de jogar qualquer outra. Jogar uma carta neutra quando `P+1` é ameaça pode beneficiá-lo ao deixar a mesa em uma cor que ele possui.

2. **Se o Terceiro Jogador (`P+2`) estiver com Poucas Cartas (< 4)**:
   - Tentar jogar um +4 (se válido) escolhendo uma cor em `unmatchedColors` de `P+2`.
   - Se não tiver +4, jogar um +2 da cor em `unmatchedColors` de `P+2`.
   - Se não houver informação de cor que ele não tenha, jogar a cor que `P+1` provavelmente possui para manter o fluxo favorável.

3. **Se o Quarto Jogador (`P+3`) estiver com Poucas Cartas (< 4)**:
   - **NÃO jogar `REVERSE`**: inverter a direção passaria o turno imediatamente para `P+3`, pois ele é o jogador logo antes do Bot na ordem atual.
   - Jogar preferencialmente na cor contida em `unmatchedColors` de `P+3` para que, quando chegar a vez dele, ele não consiga jogar.
   - Se tiver um `+2` ou `+4` válido na cor certa, utilizá-lo para forçar outros jogadores a comprarem antes de `P+3` chegar ao turno.
   - Sem opção direcionada, jogar na cor mais abundante da própria mão e aguardar oportunidade futura.

4. **Modo Padrão (Sem Ameaças Iminentes)**:
   - Jogar a carta jogável da **cor mais abundante na mão do Bot** que não seja carta de compra.
   - **Critério de Desempate**: Escolher a carta localizada mais à direita no array da mão.
   - Ao jogar Coringa/+4 sem ameaças: escolher sempre a cor mais abundante na própria mão.

---

## 4. Lógica de Decisão de Desafio ao +4 (`CHALLENGE`)

Quando um oponente joga um +4 contra o Bot, o Bot decide se aceita a punição ou se lança um Desafio:

1. **Desafiar (`CHALLENGE`)**:
   - Se o Bot **sabe com certeza** (através de `knownCardIds`) de que o oponente **TINHA a cor anterior da mesa** na mão ao jogar o +4.
   - Se o oponente estiver com poucas cartas (< 4) e o Bot **não tiver nenhuma informação** de cor em `unmatchedColors` para aquele oponente (tentativa de risco calculado).

2. **NÃO Desafiar**:
   - Se a cor da mesa estava em `unmatchedColors` daquele oponente (o que indica que ele não tinha a cor e jogou o +4 honestamente).
   - Se o oponente já jogou 3 ou mais cartas da cor anterior da mesa (`playedColorCounts >= 3`), indicando exaustão daquela cor na mão (jogada honesta).
   - Em caso de dúvida padrão sem ameaça crítica de vitória do oponente.

---

## 5. Mecânica de Jump-In com Tempo de Reação Humano

Quando um jogador descarta uma carta e o Bot possui em sua mão uma carta **idêntica em Cor e Valor/Tipo**:

```typescript
export interface JumpInAttempt {
  cardId: number;
  targetCard: Card;
  scheduledTime: number; // Timestamp em que a ação deve disparar
  timerId: ReturnType<typeof setTimeout>;
}
```

### 5.1. Avaliação Estratégica antes de Tentar o Jump-In
Antes de agendar o timer de reação, o Bot **deve aplicar as mesmas regras de análise de ameaças da Seção 3.2** para decidir se a carta idêntica que possui é uma boa jogada no contexto atual:

- Se houver ameaça em `P+1` e a carta idêntica **não bloqueia** e **não é de uma cor que `P+1` não possui**, o Jump-In pode não ser vantajoso. Nesse caso, o Bot **não agenda o Jump-In**.
- Se a carta idêntica **bloqueia a vez de `P+1`** (ex: `BLOCK`, `REVERSE`, `DRAW_2`) ou **é da cor contida em `unmatchedColors` de `P+1`**, o Jump-In é vantajoso e deve ser agendado.
- Sem ameaças ativas: o Bot **sempre tenta o Jump-In** se a carta idêntica existir.

### 5.2. Agendamento com Tempo de Reação Aleatório
1. **Detecção**: Ao receber a notificação de descarte no jogo, o Bot verifica se possui uma carta idêntica à carta descartada e avalia sua vantagem estratégica (Seção 5.1).
2. **Tempo Humano**: Se a jogada for vantajosa, o Bot sorteia um tempo de reação entre `minTimeout` e `maxTimeout` (recebidos via construtor, por padrão `400ms` e `1200ms`) utilizando a função determinística de número aleatório (`state.randomManager`).
3. **Agendamento**: O Bot cria um timer assíncrono para emitir o evento `client:JUMP_IN` após o atraso sorteado.

### 5.3. Condições de Cancelamento Limpo
O timer de Jump-In é **imediatamente cancelado** (`clearTimeout`) se qualquer um dos seguintes eventos ocorrer antes do tempo esgotar:
- O turno mudar ou outro jogador realizar um Jump-In primeiro.
- A carta do topo do descarte mudar.
- O Bot ser afetado por um bloqueio ou mudança de estado.

### 5.4. Disparo do Evento
Se o tempo de reação expirar e a jogada continuar válida:
- O Bot emite o evento `client:JUMP_IN` com o ID da sua carta idêntica.

---

## 6. Decisão de Jogar a Carta Comprada (`KEEP_EVENT` / `DRAW_CHOICE`)

Quando o Bot compra uma carta opcionalmente (por não ter carta jogável ou por estratégia) e o servidor pergunta se deseja jogar a carta recém-comprada:

- O Bot **aplica as mesmas regras de análise de ameaças da Seção 3.2** sobre a carta recém-comprada para decidir se deve jogá-la ou guardá-la.
- Se a carta comprada for considerada uma **boa jogada** segundo as regras (bloqueia `P+1`, está na cor certa para a ameaça ativa, etc.), o Bot **joga a carta** (`client:KEEP_EVENT` com intenção de jogar, ou o equivalente na API).
- Se a carta comprada **não for vantajosa** (ex: não bloqueia e não prejudica o oponente ameaçador), o Bot **passa** (`client:DRAW_CHOICE`) e mantém a carta na mão para oportunidade futura.
- Sem ameaças ativas: o Bot joga a carta comprada se ela for jogável, guardando-a apenas se não puder jogar.

---

## 7. Cadência e Tempo de Resposta do Bot (`DEFAULT_BOT_DELAY_MS`)

Para garantir uma cadência natural de partida e evitar respostas instantâneas que prejudiquem a experiência do jogador humano:

1. **Atraso Padrão de Turno**:
   - O delay padrão do Bot (`DEFAULT_BOT_DELAY_MS`) é configurado como **`1000ms`** (1 segundo).
   - Quando o Bot recebe permissão de turno (`PERMISSIONS`) com tempo disponível (`timeout` maior que 1000ms, como o turno regular de 10s): ele aguarda **`1000ms`** antes de despachar sua ação (`client:PLAY_CARD`, `client:CHOOSE_COLOR`, `client:SELECT_HAND`, `client:CHALLENGE`, etc.).

2. **Ajuste para Timeouts Curtos**:
   - Se o timeout disponível estiver entre `20ms` e `1000ms`: o Bot utiliza metade do tempo disponível (`Math.floor(timeout / 2)`).
   - Se o timeout for inferior a `20ms`: o Bot executa imediatamente (`0ms`).

3. **Ambiente de Testes (`isTestRoom`)**:
   - Em salas de teste (`configs.isTestRoom: true`), o delay é desativado (`hasDelay: false`) para execução imediata e determinística dos testes automatizados.

