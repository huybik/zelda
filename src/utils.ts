// File: /src/ultils.ts
import {
  Vector3,
  Quaternion,
  Mesh,
  Scene,
  Object3D,
  Raycaster,
  Box3,
} from "three";
import { Character } from "./entities";

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
    | "chat"; // Added 'chat' type
  item?: { name: string; amount: number };
  message?: string;
  text?: string;
  state?: string;
  options?: string[]; // Added options for dialogue
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

// Interface for structured event data
export interface GameEvent {
  actor: string; // ID or name of the character performing the action
  action: string; // e.g., "attack", "gather", "move", etc.
  target?: string; // ID or name of the target, if applicable
  details: Record<string, any>; // Additional details like damage, resource type, etc.
  location: Vector3; // Position where the event occurred
}

// src/ultils.ts
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
  actorId?: string; // Unique ID of the actor
  actorName?: string; // Display name of the actor
  action?: string;
  targetId?: string; // Unique ID of the target
  targetName?: string; // Display name of the target
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
  attack: boolean; // Added attack property
}

export interface UpdateOptions {
  moveState?: MoveState;
  player?: any;
  collidables?: Object3D[];
}

export function degreesToRadians(degrees: number): number {
  return degrees * (Math.PI / 180);
}

export function randomFloat(min: number, max: number): number {
  return Math.random() * (max - min) + min;
}

export function smoothVectorLerp(
  current: Vector3,
  target: Vector3,
  alphaBase: number,
  deltaTime: number
): Vector3 {
  if (alphaBase <= 0) return current.copy(target);
  if (alphaBase >= 1) return current;
  const factor = 1 - Math.pow(alphaBase, deltaTime);
  return current.lerp(target, factor);
}

export function smoothQuaternionSlerp(
  current: Quaternion,
  target: Quaternion,
  alphaBase: number,
  deltaTime: number
): Quaternion {
  if (alphaBase <= 0) return current.copy(target);
  if (alphaBase >= 1) return current;
  const factor = 1 - Math.pow(alphaBase, deltaTime);
  return current.slerp(target, factor);
}

export function smoothstep(edge0: number, edge1: number, x: number): number {
  x = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return x * x * (3 - 2 * x);
}

export function getTerrainHeight(scene: Scene, x: number, z: number): number {
  const terrain = scene.getObjectByName("Terrain") as Mesh;
  if (!terrain) return 0;
  const raycaster = new Raycaster(
    new Vector3(x, 200, z),
    new Vector3(0, -1, 0)
  );
  const intersects = raycaster.intersectObject(terrain);
  return intersects.length > 0 ? intersects[0].point.y : 0;
}

export const Colors = {
  PASTEL_GREEN: 0x98fb98,
  PASTEL_BROWN: 0xcd853f,
  PASTEL_GRAY: 0xb0c4de,
  FOREST_GREEN: 0x228b22,
} as const;

export let nextEntityId = 0;

export function getNextEntityId(): number {
  return nextEntityId++;
}

export class Inventory {
  size: number;
  items: Array<InventoryItem | null>;
  onChangeCallbacks: Array<(items: Array<InventoryItem | null>) => void>;
  itemMaxStack: Record<string, number>;

  constructor(size: number = 20) {
    this.size = size;
    this.items = new Array(size).fill(null);
    this.onChangeCallbacks = [];
    this.itemMaxStack = {
      default: 64,
      wood: 99,
      stone: 99,
      herb: 30,
      feather: 50,
      "Health Potion": 10,
      gold: Infinity,
    };
  }

  getMaxStack(itemName: string): number {
    return this.itemMaxStack[itemName] ?? this.itemMaxStack["default"];
  }

  addItem(itemName: string, count: number = 1): boolean {
    if (!itemName || count <= 0) return false;
    const maxStack = this.getMaxStack(itemName);
    let remainingCount = count;
    let changed = false;
    for (let i = 0; i < this.size && remainingCount > 0; i++) {
      const slot = this.items[i];
      if (slot?.name === itemName && slot.count < maxStack) {
        const canAdd = maxStack - slot.count;
        const amountToAdd = Math.min(remainingCount, canAdd);
        slot.count += amountToAdd;
        remainingCount -= amountToAdd;
        changed = true;
      }
    }
    if (remainingCount > 0) {
      for (let i = 0; i < this.size && remainingCount > 0; i++) {
        if (!this.items[i]) {
          const amountToAdd = Math.min(remainingCount, maxStack);
          this.items[i] = {
            name: itemName,
            count: amountToAdd,
            icon: itemName.toLowerCase().replace(/ /g, "_").replace(/'/g, ""),
          };
          remainingCount -= amountToAdd;
          changed = true;
        }
      }
    }
    if (changed) this.notifyChange();
    return remainingCount === 0;
  }

  removeItem(itemName: string, count: number = 1): boolean {
    if (!itemName || count <= 0) return false;
    let neededToRemove = count;
    let changed = false;
    for (let i = this.size - 1; i >= 0 && neededToRemove > 0; i--) {
      const slot = this.items[i];
      if (slot?.name === itemName) {
        const amountToRemove = Math.min(neededToRemove, slot.count);
        slot.count -= amountToRemove;
        neededToRemove -= amountToRemove;
        changed = true;
        if (slot.count === 0) this.items[i] = null;
      }
    }
    if (changed) this.notifyChange();
    return neededToRemove === 0;
  }

  removeItemByIndex(index: number, count: number = 1): boolean {
    if (index < 0 || index >= this.size || !this.items[index] || count <= 0)
      return false;
    const item = this.items[index]!;
    const removeCount = Math.min(count, item.count);
    item.count -= removeCount;
    if (item.count === 0) this.items[index] = null;
    this.notifyChange();
    return true;
  }

  countItem(itemName: string): number {
    return this.items.reduce(
      (total, item) => total + (item?.name === itemName ? item.count : 0),
      0
    );
  }

  getItem(index: number): InventoryItem | null {
    return index >= 0 && index < this.size ? this.items[index] : null;
  }

  onChange(callback: (items: Array<InventoryItem | null>) => void): void {
    if (typeof callback === "function") this.onChangeCallbacks.push(callback);
  }

  notifyChange(): void {
    const itemsCopy = this.items.map((item) => (item ? { ...item } : null));
    this.onChangeCallbacks.forEach((cb) => cb(itemsCopy));
  }
}

export class EventLog {
  entries: EventEntry[];
  maxEntries: number;
  onChangeCallbacks: Array<(entries: EventEntry[]) => void>; // Changed to pass EventEntry[]

  constructor(maxEntries: number = 50) {
    this.entries = [];
    this.maxEntries = Math.max(1, maxEntries);
    this.onChangeCallbacks = [];
  }

  // Overload addEntry
  addEntry(message: string): void;
  addEntry(entry: EventEntry): void;
  addEntry(
    actor: string,
    action: string,
    message: string,
    target?: string,
    details?: Record<string, any>,
    location?: Vector3
  ): void;

  addEntry(...args: any[]): void {
    let entryToAdd: EventEntry;
    const timestamp = new Date().toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });

    if (args.length === 1 && typeof args[0] === "string") {
      // Simple message string
      const message = args[0];
      entryToAdd = {
        timestamp,
        message,
        actorId: undefined, // Or set default like 'System'
        actorName: undefined,
        action: undefined,
        targetId: undefined,
        details: {},
        location: undefined, // Or default Vector3
      };
    } else if (
      args.length === 1 &&
      typeof args[0] === "object" &&
      args[0].message &&
      args[0].timestamp
    ) {
      // Pre-constructed EventEntry object (used by game.logEvent distribution)
      entryToAdd = args[0];
      // Ensure timestamp is current if not provided or different format
      if (!entryToAdd.timestamp || entryToAdd.timestamp.length !== 8) {
        entryToAdd.timestamp = timestamp;
      }
    } else if (
      args.length >= 3 &&
      typeof args[0] === "string" &&
      typeof args[1] === "string" &&
      typeof args[2] === "string"
    ) {
      // Structured event data
      const [
        actor,
        action,
        message,
        target,
        details = {},
        location = new Vector3(),
      ] = args;
      entryToAdd = {
        timestamp,
        message,
        actorId: undefined, // Or set default like 'System'
        actorName: undefined,
        action: undefined,
        targetId: undefined,
        details: {},
        location: undefined, // Or default Vector3
      };
    } else {
      console.warn("Invalid arguments passed to EventLog.addEntry:", args);
      return; // Don't add invalid entries
    }

    this.entries.push(entryToAdd);
    if (this.entries.length > this.maxEntries) this.entries.shift();
    this.notifyChange();
  }

  getFormattedEntries(): string[] {
    // Return only the message part for simple display compatibility
    return [...this.entries]
      .reverse()
      .map((entry) => `[${entry.timestamp}] ${entry.message}`);
  }

  onChange(callback: (entries: EventEntry[]) => void): void {
    // Changed parameter type
    if (typeof callback === "function") this.onChangeCallbacks.push(callback);
  }

  notifyChange(): void {
    // Pass the raw entries array to callbacks
    const entriesCopy = [...this.entries];
    this.onChangeCallbacks.forEach((cb) => cb(entriesCopy));
  }
}
