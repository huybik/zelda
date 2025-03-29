import * as THREE from 'three';
import { Inventory } from '../systems/inventory'; // Assuming Inventory path
import { Player } from '../entities/player'; // Assuming Player path

// --- Entity ---
export interface EntityUserData {
    entityReference: any; // Consider a more specific base entity type if possible
    isEntity: boolean;
    isPlayer: boolean;
    isNPC: boolean;
    isAnimal: boolean;
    isCollidable: boolean;
    isInteractable: boolean;
    interactionType?: string; // e.g., 'talk', 'pet', 'gather', 'open'
    prompt?: string;
    id: string;
    boundingBox?: THREE.Box3; // Added for consistency
    height?: number;
    width?: number;
    depth?: number;
    [key: string]: any; // Allow other properties (like resource, loot, etc.)
}

// --- Interaction ---
export interface InteractionResult {
    type: 'reward' | 'message' | 'dialogue' | 'item_retrieved' | 'error' | 'gather_start' | 'open_result';
    item?: { name: string; amount: number };
    message?: string;
    text?: string; // For dialogue
    state?: string; // NPC dialogue state
}

export interface TargetInfo {
    mesh: THREE.Object3D;
    instance: any; // The actual class instance (Entity, InteractableObject, etc.)
    point: THREE.Vector3;
    distance: number;
}

export interface ActiveGather {
    targetInstance: any; // The entity/object being gathered from
    startTime: number;
    duration: number;
    resource: string;
}

// --- Inventory ---
export interface InventoryItem {
    name: string;
    count: number;
    icon?: string; // Icon identifier (e.g., CSS class name)
    data?: any; // Optional extra data (e.g., durability, effects)
}

// --- Quest ---
export type QuestStatus = 'unknown' | 'available' | 'active' | 'completed' | 'failed';

export interface Objective {
    type: 'gather' | 'retrieve' | 'kill' | 'explore' | 'talk_to';
    item?: string; // For gather/retrieve
    amount?: number;
    turnIn?: boolean; // Does the item get removed on completion?
    target?: string; // For kill quests
    locationId?: string; // For explore quests
    locationHint?: string;
    npcId?: string; // For talk_to quests
    npcName?: string;
    [key: string]: any; // Allow other objective properties
}

export interface Reward {
    gold?: number;
    items?: Array<{ name: string; amount: number }>;
    xp?: number;
    // Add other potential rewards (reputation, etc.)
}

export interface QuestData {
    id: string;
    title: string;
    description: string;
    objectives: Objective[];
    reward?: Reward;
    // Add prerequisites, follow-up quests, etc. if needed
}

export interface QuestState {
    data: QuestData;
    status: QuestStatus;
    progress?: Record<string, any>; // Optional detailed progress tracking
}

// --- Event Log ---
export interface EventEntry {
    timestamp: string;
    message: string;
}

// --- Controls ---
export interface KeyState {
    [key: string]: boolean | undefined; // Use `code` property from KeyboardEvent
}

export interface MouseState {
    x: number;
    y: number;
    dx: number;
    dy: number;
    buttons: { [key: number]: boolean | undefined };
}

export interface MoveState {
    forward: number; // -1, 0, 1
    right: number; // -1, 0, 1
    jump: boolean;
    sprint: boolean;
    interact: boolean; // Added for interaction system
}