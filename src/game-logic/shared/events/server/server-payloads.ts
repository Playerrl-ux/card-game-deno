import { z } from "zod";

export const serializedCardSchema = z.object({
  id: z.number(),
  name: z.string(),
  color: z.string(),
  type: z.string(),
  value: z.number().optional(),
  effectiveColor: z.string().optional(),
});

export type SerializedCard = z.infer<typeof serializedCardSchema>;

export const DEFAULT_TURN_TIMEOUT = 10000;

export const ServerEventPayloads = {
  // Eventos de Início e Estado do Jogo
  GAME_STARTED: {
    commomName: "GAME_STARTED",
    dataStructure: z.object({
      roomName: z.string(),
      modeName: z.string(),
      configs: z.record(z.string(), z.unknown()),
      initialDiscard: serializedCardSchema,
      seed: z.number().optional(),
    }),
  },

  GAME_SNAPSHOT: {
    commomName: "GAME_SNAPSHOT",
    dataStructure: z.object({
      players: z.array(
        z.object({
          id: z.number(),
          handCount: z.number(),
          lastClientEventName: z.string().nullable(),
        }),
      ),
      playerOrder: z.array(z.number()),
      currentPlayerId: z.number(),
      direction: z.string(),
      handCards: z.array(serializedCardSchema),
      topDiscard: serializedCardSchema.nullable(),
      timers: z.array(
        z.object({
          duration: z.number(),
          createdAt: z.number(),
          remainingTime: z.number(),
        }),
      ),
      lastEvent: z.unknown().nullable(),
      lastClientEventName: z.string().nullable(),
      allowedEvents: z.array(z.string()),
      gameRound: z.number(),
      configs: z.record(z.string(), z.unknown()),
    }),
  },

  // Eventos de Ação e Notificação do Jogo
  CARD_DRAW: {
    commomName: "CARD_DRAW",
    dataStructure: z.object({
      playerId: z.number(),
      quantity: z.number(),
      cards: z.array(serializedCardSchema),
    }),
  },

  CHALLENGE_RESULT: {
    commomName: "CHALLENGE_RESULT",
    dataStructure: z.object({
      playerId: z.number(),
      challengeResult: z.boolean(),
    }),
  },

  DIRECTION: {
    commomName: "DIRECTION",
    dataStructure: z.object({
      direction: z.string(),
    }),
  },

  CHOOSE: {
    commomName: "CHOOSE",
    dataStructure: z.object({
      playerId: z.number(),
    }),
  },

  DRAW2_OPTIONS: {
    commomName: "DRAW2_OPTIONS",
    dataStructure: z.void().optional(),
  },

  HAND_CHANGED: {
    commomName: "HAND_CHANGED",
    dataStructure: z.object({
      playerId: z.number(),
      targetId: z.number(),
    }),
  },

  NEW_HAND: {
    commomName: "NEW_HAND",
    dataStructure: z.object({
      playerId: z.number(),
      hand: z.array(serializedCardSchema),
    }),
  },

  PERMISSIONS: {
    commomName: "PERMISSIONS",
    timeout: DEFAULT_TURN_TIMEOUT,
    dataStructure: z.object({
      allowedEvents: z.array(z.array(z.string())),
      playerId: z.number(),
      timeout: z.number().optional(),
      allowedCards: z.array(serializedCardSchema).optional(),
    }),
  },

  SHOW_HAND: {
    commomName: "SHOW_HAND",
    dataStructure: z.object({
      playerId: z.number(),
      cards: z.array(serializedCardSchema),
    }),
  },

  TIMEOUT_TO_PLAYER: {
    commomName: "TIMEOUT-TO-PLAYER",
    dataStructure: z.object({
      playerId: z.number(),
    }),
  },

  WIN: {
    commomName: "WIN",
    broadcastName: "BROADCAST:WIN",
    dataStructure: z.object({}),
  },

  WILD_CHOOSE: {
    commomName: "WILD_CHOOSE",
    broadcastName: "BROADCAST:WILD_CHOOSE",
    timeout: 10000,
    dataStructure: z.object({
      color: z.string(),
    }),
  },

  SEVEN_EFFECT_CHOOSE: {
    commomName: "7_EFFECT_CHOOSE",
    broadcastName: "BROADCAST:7_EFFECT_CHOOSE",
    timeout: 10000,
    dataStructure: z.object({
      targetId: z.number(),
    }),
  },

  // Notificações Broadcast de Ações de Jogadores
  PLAY_CARD: {
    commomName: "client:PLAY_CARD",
    broadcastName: "BROADCAST:client:PLAY_CARD",
    dataStructure: z.object({
      card: serializedCardSchema,
      saidUno: z.boolean().optional(),
    }),
  },

  JUMP_IN: {
    commomName: "client:JUMP_IN",
    broadcastName: "BROADCAST:client:JUMP_IN",
    timeout: 1000,
    dataStructure: z.object({
      target: serializedCardSchema,
      cardJumpedIn: serializedCardSchema,
    }),
  },

  CHALLENGE: {
    commomName: "client:CHALLENGE",
    broadcastName: "BROADCAST:client:CHALLENGE",
    dataStructure: z.object({
      challenge: z.boolean(),
    }),
  },

  UNO: {
    commomName: "client:UNO",
    broadcastName: "BROADCAST:client:UNO",
    timeout: 1000,
    dataStructure: z.object({
      playerId: z.number().optional(),
    }),
  },
} as const;

export type ServerEventKey = keyof typeof ServerEventPayloads;
export type ServerEventName = ServerEventKey;

export type ServerPayload<K extends ServerEventKey> = z.infer<
  (typeof ServerEventPayloads)[K]["dataStructure"]
>;
