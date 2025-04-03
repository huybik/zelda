import { Vector3, Object3D, Box3, Camera } from "three";
import { Character } from "../entities"; // Adjust path if entities structure changes later

// Moved from utils.ts
export interface EntityUserData {
  entityReference: any | null;
  isEntity: boolean;
  isPlayer: boolean;
  isNPC: boolean;
  isCollidable: boolean;
  isInteractable: boolean;
  interactionType?: string;
  prompt?: string;
  id: string;
  boundingBox?: Box3;
  height?: number;
  radius?: number;
  [key: string]: unknown;
}

export interface InteractionResult {
  type:
    | "reward"
    | "message"
    | "dialogue"
    | "item_retrieved"
    | "error"
    | "gather_start"
    | "chat";
  item?: { name: string; amount: number };
  message?: string;
  text?: string;
  state?: string;
  options?: string[];
}

export interface TargetInfo {
  mesh: Object3D;
  instance: any;
  point: Vector3;
  distance: number;
}

export interface ActiveGather {
  targetInstance: any;
  startTime: number;
  duration: number;
  resource: string;
}

export interface InventoryItem {
  name: string;
  count: number;
  icon?: string;
}

export interface GameEvent {
  actor: string;
  action: string;
  target?: string;
  details: Record<string, any>;
  location: Vector3;
}

export interface Quest {
  name: string;
  description: string;
  isCompleted: boolean;
  checkCompletion: (
    interactionTarget: Character,
    chatResponse: string
  ) => boolean;
}

export interface EventEntry {
  timestamp: string;
  message: string;
  actorId?: string;
  actorName?: string;
  action?: string;
  targetId?: string;
  targetName?: string;
  details?: Record<string, any>;
  location?: Vector3;
}

export interface KeyState {
  [key: string]: boolean | undefined;
}

export interface MouseState {
  x: number;
  y: number;
  dx: number;
  dy: number;
  buttons: { [key: number]: boolean | undefined };
}

export interface MoveState {
  forward: number;
  right: number;
  jump: boolean;
  sprint: boolean;
  interact: boolean;
  attack: boolean;
}

export interface UpdateOptions {
  moveState?: MoveState;
  player?: any;
  collidables?: Object3D[];
  camera?: Camera;
} 