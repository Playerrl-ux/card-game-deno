import z from "zod";

// Game se refere a eventos internos da engine do jogo, External se refere a evento envolvendo chat, conexao, etc...
const EVENT_TYPES = ["GAME", "EXTERNAL"] as const;
export type EventType = (typeof EVENT_TYPES)[number];

//essa interface vai servir tanto para eventos enviados pelo servidor quanto pelo cliente
export interface EventNetwork {
  type: EventType;
  name: string;
  sendedBy: number;
  roomName: string;
  data: unknown;
}

// se type for GAME o campo data vai conter o nome de um evento do cliente da game engine
// se type for EXTERNAL o campo data vai conter o nome de um dos metodos no room manager
// e data vai conter possiveis argumentos
export const eventNetworkSchema = z.object({
  type: z.enum(EVENT_TYPES),
  name: z.string(),
  sendedBy: z.number().int().optional().default(-1),
  roomName: z.string().min(5).max(10),
  data: z.unknown(),
});

export interface GameEvent {
  data: unknown;
}
export const gameEventSchema = z.object({
  data: z.unknown(),
});

import { ExternalClientEventPayloads } from "./external-payloads.ts";

export interface StartGameEvent {
  name: string;
  configs: Record<string, unknown>;
  numberOfDecks: number;
  modeName: string;
}
export const startGameSchema = ExternalClientEventPayloads.START_GAME.dataStructure;

export const createRoomSchema = ExternalClientEventPayloads.CREATE_ROOM.dataStructure;
