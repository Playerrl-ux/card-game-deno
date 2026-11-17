import { z } from "zod";

export const ExternalServerEventPayloads = {
  ROOM_CREATED: {
    commomName: "ROOM_CREATED" as const,
    dataStructure: z.object({
      roomName: z.string(),
      playerId: z.number(),
    }),
  },

  ROOM_JOINED: {
    commomName: "ROOM_JOINED" as const,
    dataStructure: z.object({
      roomName: z.string(),
      playerId: z.number(),
      players: z.array(z.object({ id: z.number() })),
    }),
  },

  ROOM_RECONNECT: {
    commomName: "ROOM_RECONNECT" as const,
    dataStructure: z.object({
      roomName: z.string(),
      playerId: z.number(),
    }),
  },

  ROOM_LEFT: {
    commomName: "ROOM_LEFT" as const,
    dataStructure: z.object({
      roomName: z.string(),
      playerId: z.number(),
    }),
  },

  ROOM_STATE: {
    commomName: "ROOM_STATE" as const,
    dataStructure: z.object({
      roomName: z.string(),
      players: z.array(
        z.object({
          id: z.number(),
          isBot: z.boolean(),
        }),
      ),
    }),
  },

  ROOM_ERROR: {
    commomName: "ROOM_ERROR" as const,
    dataStructure: z.object({
      message: z.string(),
      code: z.string().optional(),
      details: z.unknown().optional(),
    }),
  },

  PONG: {
    commomName: "PONG" as const,
    dataStructure: z.object({
      timestamp: z.number(),
    }),
  },

  PLAYER_STATUS_CHANGED: {
    commomName: "PLAYER_STATUS_CHANGED" as const,
    dataStructure: z.object({
      playerId: z.number(),
      isConnected: z.boolean(),
      isBot: z.boolean(),
    }),
  },

  TEST_PLAY: {
    commomName: "TEST_PLAY" as const,
    dataStructure: z.object({
      eventName: z.string(),
      data: z.unknown(),
    }),
  },
} as const;

export const ExternalClientEventPayloads = {
  CREATE_ROOM: {
    commomName: "createRoom" as const,
    dataStructure: z.object({
      isTestRoom: z.boolean().optional().default(false),
    }),
  },

  JOIN_ROOM: {
    commomName: "joinRoom" as const,
    dataStructure: z.unknown(),
  },

  RECONNECT_ROOM: {
    commomName: "reconnectRoom" as const,
    dataStructure: z.unknown(),
  },

  ADD_BOT: {
    commomName: "addBot" as const,
    dataStructure: z.unknown(),
  },

  LEAVE_ROOM: {
    commomName: "leaveRoom" as const,
    dataStructure: z.unknown(),
  },

  GET_ROOM_STATE: {
    commomName: "getRoomState" as const,
    dataStructure: z.unknown(),
  },

  START_GAME: {
    commomName: "startGame" as const,
    dataStructure: z.object({
      name: z.literal("startGame").optional(),
      configs: z.record(z.string(), z.unknown()),
      numberOfDecks: z.number().int(),
      modeName: z.string(),
      isTestRoom: z.boolean().optional(),
      seed: z.number().int().optional(),
    }),
  },

  PING: {
    commomName: "ping" as const,
    dataStructure: z.unknown(),
  },
} as const;

export const ExternalEventPayloads = {
  SERVER: ExternalServerEventPayloads,
  CLIENT: ExternalClientEventPayloads,
} as const;

export type ExternalServerEventKey = keyof typeof ExternalServerEventPayloads;
export type ExternalServerPayload<K extends ExternalServerEventKey> = z.infer<
  (typeof ExternalServerEventPayloads)[K]["dataStructure"]
>;

export type ExternalClientEventKey = keyof typeof ExternalClientEventPayloads;
export type ExternalClientPayload<K extends ExternalClientEventKey> = z.infer<
  (typeof ExternalClientEventPayloads)[K]["dataStructure"]
>;

export type RoomCreatedData = ExternalServerPayload<"ROOM_CREATED">;
export type RoomJoinedData = ExternalServerPayload<"ROOM_JOINED">;
export type RoomReconnectData = ExternalServerPayload<"ROOM_RECONNECT">;
export type RoomLeftData = ExternalServerPayload<"ROOM_LEFT">;
export type RoomStateData = ExternalServerPayload<"ROOM_STATE">;
export type RoomErrorData = ExternalServerPayload<"ROOM_ERROR">;
export type PongData = ExternalServerPayload<"PONG">;
export type PlayerStatusData = ExternalServerPayload<"PLAYER_STATUS_CHANGED">;
export type TestPlayData = ExternalServerPayload<"TEST_PLAY">;
