import { z } from "zod";

export const CLIENT_PREFIX = "client:";

export const ClientEventPayloads = {
  PLAY_CARD: {
    commomName: `${CLIENT_PREFIX}PLAY_CARD` as const,
    dataStructure: z.object({
      cardId: z.number(),
      playerId: z.number().optional(),
      saidUno: z.boolean().optional().default(false),
    }),
  },

  JUMP_IN: {
    commomName: `${CLIENT_PREFIX}JUMP_IN` as const,
    dataStructure: z.object({
      cardJumpedId: z.number().int().gte(0),
      targetId: z.number().int().gte(0),
    }),
  },

  CHALLENGE: {
    commomName: `${CLIENT_PREFIX}CHALLENGE` as const,
    dataStructure: z.object({
      challenge: z.boolean(),
      playerId: z.number().optional(),
    }),
  },

  CHOOSE_COLOR: {
    commomName: `${CLIENT_PREFIX}CHOOSE_COLOR` as const,
    dataStructure: z.object({
      color: z.string(),
    }),
  },

  SELECT_HAND: {
    commomName: `${CLIENT_PREFIX}SELECT_HAND` as const,
    dataStructure: z.object({
      targetId: z.number(),
    }),
  },

  DRAW_CHOICE: {
    commomName: `${CLIENT_PREFIX}DRAW_CHOICE` as const,
    dataStructure: z.object({
      playerId: z.number().optional(),
    }),
  },

  KEEP_EVENT: {
    commomName: `${CLIENT_PREFIX}KEEP_EVENT` as const,
    dataStructure: z.object({}),
  },

  UNO: {
    commomName: `${CLIENT_PREFIX}UNO` as const,
    dataStructure: z
      .object({
        playerId: z.number().optional(),
      })
      .optional()
      .default({}),
  },
} as const;

export type ClientEventKey = keyof typeof ClientEventPayloads;
export type ClientEventName = ClientEventKey;

export type ClientPayload<K extends ClientEventKey> = z.infer<
  (typeof ClientEventPayloads)[K]["dataStructure"]
>;
