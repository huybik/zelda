// src/types.ts
import { Box3, Object3D, Vector3, Group, AnimationClip } from "three";
import type { Entity } from "./core/Entity"; // Use type import for interfaces/classes
import type { Character } from "./core/Character";

// Keep EntityUserData flexible but typed
export interface EntityUserData {
  entityReference: Entity | Object3D | null; // Can reference Entity or simple Object3D
  isEntity: boolean;
  isPlayer: boolean;
  isNPC: boolean;
  isCollidable: boolean;
  isInteractable: boolean;
  interactionType?: "gather" | "talk" | "examine" | string; // Allow custom types
  prompt?: string;
  id: string;
  boundingBox?: Box3;
  height?: number;
  radius?: number;
  resource?: string;
  gatherTime?: number;
  isDepletable?: boolean;
  respawnTime?: number;
  isSimpleObject?: boolean; // Flag for non-Entity interactables
  isTerrain?: boolean; // Flag for terrain mesh
  velocity?: Vector3; // For particle effects or simple moving objects
  startTime?: number; // For particle effects
  duration?: number; // For particle effects
  [key: string]: unknown; // Allow additional properties
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
  text?: string; // For simple dialogue
  state?: string; // Potential future use for state changes
  options?: string[]; // Potential future use for dialogue choices
}

export interface TargetInfo {
  mesh: Object3D;
  instance: any; // Could be Character or simple Object3D Group
  point: Vector3;
  distance: number;
}

export interface ActiveGather {
  targetInstance: any; // Could be Character or simple Object3D Group
  startTime: number;
  duration: number;
  resource: string;
}

export interface InventoryItem {
  name: string;
  count: number;
  icon?: string; // Optional icon identifier
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

// Options passed to Entity/Character update methods
export interface UpdateOptions {
  moveState?: MoveState;
  collidables?: Object3D[];
}

// Data structure for AI observation
export interface Observation {
  timestamp: number;
  self: {
    id: string;
    position: Vector3;
    health: number;
    isDead: boolean;
    currentAction: string; // AI state or player action
  };
  nearbyCharacters: Array<{
    id: string;
    position: Vector3;
    health: number;
    isDead: boolean;
    currentAction: string;
  }>;
  nearbyObjects: Array<{
    id: string;
    type: string; // e.g., 'Tree', 'Rock'
    position: Vector3;
    isInteractable: boolean;
    resource?: string;
  }>;
}

// Structure for AI action decisions from Gemini
export interface AIActionData {
  action:
    | "idle"
    | "roam"
    | "gather"
    | "moveTo"
    | "attack"
    | "heal"
    | "chat"
    | string; // Allow other actions potentially
  object_id?: string; // ID of the object to interact with (e.g., gather)
  target_id?: string; // ID of the character to interact with
  message?: string; // Message content for 'chat' action
  intent: string; // Brief reason for the action
}

// Structure for Quests
export interface Quest {
  name: string;
  description: string;
  isCompleted: boolean;
  checkCompletion: (
    interactionTarget: Character,
    chatResponse: string
  ) => boolean;
}

// Structure for loaded GLTF models
export interface LoadedModel {
  scene: Group;
  animations: AnimationClip[];
}
