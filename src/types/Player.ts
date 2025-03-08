export interface Player {
  id: string;
  username: string;
  position: Position;
  direction: 'up' | 'down' | 'left' | 'right';
  isMoving: boolean;
  lastUpdate: number;
}

// server/src/types/WorldTypes.ts
export interface Position {
  x: number;
  y: number;
}

export interface Tree {
  id: number;
  x: number;
  y: number;
  size: number;
  color: string;
  variant: number;
}

export interface Bush {
  id: number;
  x: number;
  y: number;
  size: number;
  color: string;
  variant: number;
}

export interface Flower {
  id: number;
  x: number;
  y: number;
  color: string;
}

export interface WorldChunk {
  x: number;
  y: number;
  trees: Tree[];
  bushes: Bush[];
  flowers: Flower[];
  isLoaded: boolean;
}

export enum GameEventType {
  PLAYER_JOIN = 'player_join',
  PLAYER_LEAVE = 'player_leave',
  PLAYER_MOVE = 'player_move',
  WORLD_SYNC = 'world_sync',
  CHAT_MESSAGE = 'chat_message'
}

export interface GameEvent {
  type: GameEventType;
  timestamp: number;
  data: any;
}
