/* File: /src/core/utils.ts */
import {
  Vector3,
  Quaternion,
  Mesh,
  Scene,
  Object3D,
  Raycaster,
  Box3,
} from "three";
import type { Character } from "../entities/character";
import { getItemDefinition, Profession } from "./items"; // Import item definitions and Profession

export interface EntityUserData {
  entityReference: any | null;
  isEntity: boolean;
  isPlayer: boolean;
  isNPC: boolean;
  isCollidable: boolean;
  isInteractable: boolean; // Can be targeted (for chat, attack, etc.)
  interactionType?: string; // e.g., "talk", "attack" (for resources)
  prompt?: string; // Prompt for 'E' interaction (chat)
  id: string;
  boundingBox?: Box3;
  height?: number;
  radius?: number;
  // Resource specific
  resource?: string;
  health?: number;
  maxHealth?: number;
  isDepletable?: boolean;
  respawnTime?: number;
  // Animal specific
  isAnimal?: boolean;
  animalType?: string;
  isAggressive?: boolean;
  // Simple Object flag
  isSimpleObject?: boolean;
  [key: string]: unknown;
}

export interface InteractionResult {
  type: "reward" | "message" | "dialogue" | "item_retrieved" | "error" | "chat";
  item?: { name: string; amount: number };
  message?: string;
  text?: string;
  state?: string;
  options?: string[];
}

export interface TargetInfo {
  mesh: Object3D;
  instance: any; // Can be Character, Animal, or resource Object3D
  point: Vector3;
  distance: number;
}

// Represents an item stack within the inventory UI/data
export interface InventoryItem {
  id: string; // Use the unique ID from ItemDefinition (e.g., 'wood', 'sword')
  name: string; // Display name (e.g., 'Wood', 'Sword')
  count: number;
  icon?: string; // Store icon filename (e.g., 'wood.png') for convenience
}

export interface GameEvent {
  actor: string;
  action: string;
  target?: string;
  details: Record<string, any>;
  location: Vector3;
}

// --- New Quest System Interfaces ---

export enum QuestObjectiveType {
  ITEM_COUNT = "item_count", // Have X of item Y in inventory
  KILL_COUNT = "kill_count", // Kill X entities of type Y
  ENTITY_STATE = "entity_state", // Entity X is in state Y (e.g., following)
  ENTITY_KILLED_BY = "entity_killed_by", // Entity X killed by entity type Y
  MULTI_STATE = "multi_state", // Multiple entities in a specific state (e.g., all villagers following)
  RECEIVE_ITEM_TRADE = "receive_item_trade", // Player received item X via trade (for free/minimal cost)
}

export enum QuestRewardType {
  WEAPON_CHOICE = "weapon_choice",
  WEAPON_UPGRADE = "weapon_upgrade",
  ENABLE_MECHANIC = "enable_mechanic",
  ADD_PROFESSION = "add_profession",
  ITEM_REWARD = "item_reward", // Grant specific item(s)
}

export interface QuestObjective {
  type: QuestObjectiveType;
  description: string; // e.g., "Gather Wood", "Kill Wolves", "Convince Villagers"
  targetItemId?: string; // For ITEM_COUNT, RECEIVE_ITEM_TRADE
  targetEntityType?: string; // For KILL_COUNT, ENTITY_KILLED_BY (killer type)
  targetEntityId?: string; // For ENTITY_STATE, ENTITY_KILLED_BY (victim)
  targetState?: string; // For ENTITY_STATE (e.g., "following")
  requiredCount: number;
  currentCount: number; // Track progress
  isCompleted: boolean; // Track individual objective completion
}

export interface QuestRewardOption {
  id: string; // e.g., "new_sword", "upgrade_damage"
  name: string; // e.g., "New Sword", "Upgrade Damage"
  description: string;
}

export interface Quest {
  id: string;
  name: string;
  description: string; // Overall quest description
  objectives: QuestObjective[];
  isCompleted: boolean; // Overall quest completion status
  rewardType: QuestRewardType;
  rewardOptions?: QuestRewardOption[]; // For choices like weapon selection
  rewardData?: any; // For specific data like profession, mechanic, or item reward details { itemId: 'coin', count: 10 }
  hasBeenNotified?: boolean; // Track if completion notification was shown
}

// --- End New Quest System Interfaces ---

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
  interact: boolean; // For 'E' key interactions (like chat)
  attack: boolean; // For 'F' key / mouse click attacks (combat & resources)
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
  const factor = 1 - Math.pow(alphaBase, deltaTime);
  return current.lerp(target, factor);
}

export function smoothQuaternionSlerp(
  current: Quaternion,
  target: Quaternion,
  alphaBase: number,
  deltaTime: number
): Quaternion {
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

export let nextEntityId = 0;

export function getNextEntityId(): number {
  return nextEntityId++;
}

export class Inventory {
  size: number;
  items: Array<InventoryItem | null>;
  onChangeCallbacks: Array<(items: Array<InventoryItem | null>) => void>;

  constructor(size: number = 20) {
    this.size = size;
    this.items = new Array(size).fill(null);
    this.onChangeCallbacks = [];
  }

  /**
   * Gets the maximum stack size for a given item ID.
   * @param itemId The unique ID of the item.
   * @returns The maximum stack size, or 1 if the item definition is not found or not stackable.
   */
  getMaxStack(itemId: string): number {
    const definition = getItemDefinition(itemId);
    // Use definition.maxStack if stackable, otherwise 1. Default to 1 if no definition.
    return definition ? (definition.stackable ? definition.maxStack : 1) : 1;
  }

  /**
   * Adds an item to the inventory.
   * @param itemId The unique ID of the item to add.
   * @param count The number of items to add.
   * @returns An object containing the amount added in this call (`added`) and the total amount successfully added (`totalAdded`).
   */
  addItem(
    itemId: string,
    count: number = 1
  ): { added: number; totalAdded: number } {
    const definition = getItemDefinition(itemId);
    if (!definition || count <= 0) {
      console.warn(
        `Attempted to add invalid item ID: ${itemId} or count: ${count}`
      );
      return { added: 0, totalAdded: 0 };
    }

    const maxStack = this.getMaxStack(itemId);
    let remainingCount = count;
    let changed = false;
    let amountAddedInCall = 0;

    // First pass: Add to existing stacks if the item is stackable
    if (definition.stackable) {
      for (let i = 0; i < this.size && remainingCount > 0; i++) {
        const slot = this.items[i];
        if (slot?.id === itemId && slot.count < maxStack) {
          const canAdd = maxStack - slot.count;
          const amountToAdd = Math.min(remainingCount, canAdd);
          slot.count += amountToAdd;
          remainingCount -= amountToAdd;
          amountAddedInCall += amountToAdd;
          changed = true;
        }
      }
    }

    // Second pass: Add to new slots
    if (remainingCount > 0) {
      for (let i = 0; i < this.size && remainingCount > 0; i++) {
        if (!this.items[i]) {
          const amountToAdd = Math.min(remainingCount, maxStack);
          this.items[i] = {
            id: definition.id,
            name: definition.name,
            count: amountToAdd,
            icon: definition.icon, // Store icon filename
          };
          remainingCount -= amountToAdd;
          amountAddedInCall += amountToAdd;
          changed = true;
          // If item is not stackable, we only add one per slot, so break after finding one empty slot.
          if (!definition.stackable) break;
        }
      }
    }

    if (changed) this.notifyChange();
    const totalAdded = count - remainingCount;
    return { added: amountAddedInCall, totalAdded: totalAdded };
  }

  /**
   * Removes an item from the inventory by its ID.
   * @param itemId The unique ID of the item to remove.
   * @param count The number of items to remove.
   * @returns True if the specified count was successfully removed, false otherwise.
   */
  removeItem(itemId: string, count: number = 1): boolean {
    if (!itemId || count <= 0) return false;
    let neededToRemove = count;
    let changed = false;

    // Iterate backwards to remove from potentially partial stacks first
    for (let i = this.size - 1; i >= 0 && neededToRemove > 0; i--) {
      const slot = this.items[i];
      if (slot?.id === itemId) {
        const amountToRemove = Math.min(neededToRemove, slot.count);
        slot.count -= amountToRemove;
        neededToRemove -= amountToRemove;
        changed = true;
        if (slot.count === 0) {
          this.items[i] = null; // Clear the slot if empty
        }
      }
    }

    if (changed) this.notifyChange();
    return neededToRemove === 0; // Return true if the required amount was removed
  }

  /**
   * Removes an item from a specific inventory slot index.
   * @param index The index of the slot.
   * @param count The number of items to remove from that slot.
   * @returns True if items were successfully removed, false otherwise.
   */
  removeItemByIndex(index: number, count: number = 1): boolean {
    if (index < 0 || index >= this.size || !this.items[index] || count <= 0) {
      return false;
    }
    const item = this.items[index]!;
    const removeCount = Math.min(count, item.count);
    item.count -= removeCount;
    if (item.count === 0) {
      this.items[index] = null;
    }
    this.notifyChange();
    return true;
  }

  /**
   * Counts the total number of a specific item in the inventory.
   * @param itemId The unique ID of the item to count.
   * @returns The total count of the item across all stacks.
   */
  countItem(itemId: string): number {
    return this.items.reduce(
      (total, item) => total + (item?.id === itemId ? item.count : 0),
      0
    );
  }

  /**
   * Checks if the inventory contains at least the specified quantities of given items.
   * @param itemsToCheck An array of InventoryItem objects representing the items and counts to check for.
   * @returns True if all items are present in sufficient quantities, false otherwise.
   */
  hasItems(itemsToCheck: InventoryItem[]): boolean {
    if (!itemsToCheck || itemsToCheck.length === 0) {
      return true; // No items required, so condition is met.
    }

    // Create a temporary map to store the total count of each required item ID.
    const requiredCounts: { [itemId: string]: number } = {};
    for (const item of itemsToCheck) {
      if (item && item.id && item.count > 0) {
        requiredCounts[item.id] = (requiredCounts[item.id] || 0) + item.count;
      }
    }

    // Create a map of available item counts in the inventory.
    const availableCounts: { [itemId: string]: number } = {};
    for (const slot of this.items) {
      if (slot && slot.id && slot.count > 0) {
        availableCounts[slot.id] = (availableCounts[slot.id] || 0) + slot.count;
      }
    }

    // Check if available counts meet the required counts.
    for (const itemId in requiredCounts) {
      if (
        !availableCounts[itemId] ||
        availableCounts[itemId] < requiredCounts[itemId]
      ) {
        return false; // Not enough of this item.
      }
    }

    return true; // All required items are present in sufficient quantities.
  }

  /**
   * Gets the item at a specific inventory index.
   * @param index The index of the slot.
   * @returns The InventoryItem in the slot, or null if the slot is empty or index is invalid.
   */
  getItem(index: number): InventoryItem | null {
    return index >= 0 && index < this.size ? this.items[index] : null;
  }

  /**
   * Registers a callback function to be called when the inventory changes.
   * @param callback The function to call with the updated items array.
   */
  onChange(callback: (items: Array<InventoryItem | null>) => void): void {
    if (typeof callback === "function") {
      this.onChangeCallbacks.push(callback);
    }
  }

  /**
   * Notifies all registered callbacks about an inventory change.
   */
  notifyChange(): void {
    // Create a shallow copy for the notification
    const itemsCopy = [...this.items];
    this.onChangeCallbacks.forEach((cb) => cb(itemsCopy));
  }
}

export class EventLog {
  entries: EventEntry[];
  maxEntries: number;
  onChangeCallbacks: Array<(entries: EventEntry[]) => void>;

  constructor(maxEntries: number = 50) {
    this.entries = [];
    this.maxEntries = Math.max(1, maxEntries);
    this.onChangeCallbacks = [];
  }

  addEntry(entry: EventEntry): void {
    if (
      !entry.timestamp ||
      typeof entry.timestamp !== "string" ||
      entry.timestamp.length !== 8
    ) {
      entry.timestamp = new Date().toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      });
    }
    if (typeof entry.message !== "string") {
      entry.message = "[No message provided]";
    }
    this.entries.push(entry);
    if (this.entries.length > this.maxEntries) this.entries.shift();
    this.notifyChange();
  }

  getFormattedEntries(): string[] {
    return [...this.entries]
      .reverse()
      .map((entry) => `[${entry.timestamp}] ${entry.message}`);
  }

  onChange(callback: (entries: EventEntry[]) => void): void {
    if (typeof callback === "function") this.onChangeCallbacks.push(callback);
  }

  notifyChange(): void {
    const entriesCopy = [...this.entries];
    this.onChangeCallbacks.forEach((cb) => cb(entriesCopy));
  }
}
