import { ServerEventArgs } from "../game-logic/base/server.event.ts";
import { Player } from "../game-logic/base/player/player.state.ts";
import {
  ExternalServerEventPayloads,
  PongData,
  PlayerStatusData,
  RoomCreatedData,
  RoomErrorData,
  RoomJoinedData,
  RoomLeftData,
  RoomReconnectData,
  RoomStateData,
  TestPlayData,
} from "./external-payloads.ts";

export type {
  PongData,
  PlayerStatusData,
  RoomCreatedData,
  RoomErrorData,
  RoomJoinedData,
  RoomLeftData,
  RoomReconnectData,
  RoomStateData,
  TestPlayData,
};

/**
 * Evento de confirmação de criação de sala.
 */
export class RoomCreatedEvent extends ServerEventArgs<RoomCreatedData> {
  constructor(
    sendedBy: Player<unknown> | null,
    forPlayers: Player<unknown>[],
    data: RoomCreatedData,
  ) {
    super(
      ExternalServerEventPayloads.ROOM_CREATED.commomName,
      sendedBy,
      forPlayers,
      data,
      true,
    );
  }
}

/**
 * Evento de confirmação de entrada na sala.
 */
export class RoomJoinedEvent extends ServerEventArgs<RoomJoinedData> {
  constructor(
    sendedBy: Player<unknown> | null,
    forPlayers: Player<unknown>[],
    data: RoomJoinedData,
  ) {
    super(
      ExternalServerEventPayloads.ROOM_JOINED.commomName,
      sendedBy,
      forPlayers,
      data,
      true,
    );
  }
}

/**
 * Evento de confirmação de reconexão na sala.
 */
export class RoomReconnectEvent extends ServerEventArgs<RoomReconnectData> {
  constructor(
    sendedBy: Player<unknown> | null,
    forPlayers: Player<unknown>[],
    data: RoomReconnectData,
  ) {
    super(
      ExternalServerEventPayloads.ROOM_RECONNECT.commomName,
      sendedBy,
      forPlayers,
      data,
      true,
    );
  }
}

/**
 * Evento emitido quando um jogador sai da sala no lobby.
 */
export class RoomLeftEvent extends ServerEventArgs<RoomLeftData> {
  constructor(
    sendedBy: Player<unknown> | null,
    forPlayers: Player<unknown>[],
    data: RoomLeftData,
  ) {
    super(
      ExternalServerEventPayloads.ROOM_LEFT.commomName,
      sendedBy,
      forPlayers,
      data,
      true,
    );
  }
}

/**
 * Evento emitido para listar os jogadores no lobby.
 */
export class RoomStateEvent extends ServerEventArgs<RoomStateData> {
  constructor(
    sendedBy: Player<unknown> | null,
    forPlayers: Player<unknown>[],
    data: RoomStateData,
  ) {
    super(
      ExternalServerEventPayloads.ROOM_STATE.commomName,
      sendedBy,
      forPlayers,
      data,
      true,
    );
  }
}

/**
 * Evento de erro ou falha em ações de sala/externas.
 */
export class RoomErrorEvent extends ServerEventArgs<RoomErrorData> {
  constructor(
    sendedBy: Player<unknown> | null,
    forPlayers: Player<unknown>[],
    data: RoomErrorData,
  ) {
    super(
      ExternalServerEventPayloads.ROOM_ERROR.commomName,
      sendedBy,
      forPlayers,
      data,
      true,
    );
  }
}

export class PongEvent extends ServerEventArgs<PongData> {
  constructor(
    sendedBy: Player<unknown> | null,
    forPlayers: Player<unknown>[],
  ) {
    super(
      ExternalServerEventPayloads.PONG.commomName,
      sendedBy,
      forPlayers,
      { timestamp: Date.now() },
      true,
    );
  }
}

export class PlayerStatusChangedEvent extends ServerEventArgs<PlayerStatusData> {
  constructor(
    sendedBy: Player<unknown> | null,
    forPlayers: Player<unknown>[],
    data: PlayerStatusData,
  ) {
    super(
      ExternalServerEventPayloads.PLAYER_STATUS_CHANGED.commomName,
      sendedBy,
      forPlayers,
      data,
      true,
    );
  }
}

export class TestPlayEvent extends ServerEventArgs<TestPlayData> {
  constructor(
    sendedBy: Player<unknown> | null,
    forPlayers: Player<unknown>[],
    data: TestPlayData,
  ) {
    super(
      ExternalServerEventPayloads.TEST_PLAY.commomName,
      sendedBy,
      forPlayers,
      data,
      true,
    );
  }
}
