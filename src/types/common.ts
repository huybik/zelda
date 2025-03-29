import * as THREE from 'three';
// Removed unused imports like Player/Inventory if only types are needed

// --- Entity ---
export interface EntityUserData {
    entityReference: any; // Could be Entity | InteractableObject | THREE.Object3D etc.
    isEntity: boolean;
    isPlayer: boolean;
    isNPC: boolean;
    isAnimal: boolean;
    isCollidable: boolean;
    isInteractable: boolean;
    interactionType?: string;
    prompt?: string;
    id: string;
    boundingBox?: THREE.Box3;
    height?: number;
    width?: number;
    depth?: number;
    // Flags for specific object types
    isSimpleObject?: boolean; // For InteractableObject differentiation
    isTerrain?: boolean;
    // Dynamic properties
    isHostile?: boolean;
    resource?: string;
    gatherTime?: number;
    isDepletable?: boolean;
    respawnTime?: number;
    loot?: Record<string, number>;
    isOpen?: boolean; // For chests etc.
    [key: string]: any; // Allow other properties
}

// --- Interaction ---
export interface InteractionResult {
    type: 'reward' | 'message' | 'dialogue' | 'item_retrieved' | 'error' | 'gather_start' | 'open_result';
    item?: { name: string; amount: number };
    message?: string;
    text?: string;
    state?: string;
}

export interface TargetInfo {
    mesh: THREE.Object3D;
    instance: any; // Entity | InteractableObject | THREE.Object3D
    point: THREE.Vector3;
    distance: number;
}

export interface ActiveGather {
    targetInstance: any;
    startTime: number;
    duration: number;
    resource: string;
}

// --- Inventory ---
export interface InventoryItem {
    name: string;
    count: number;
    icon?: string;
    data?: any;
}

// --- Quest ---
export type QuestStatus = 'unknown' | 'available' | 'active' | 'completed' | 'failed';

export interface Objective {
    type: 'gather' | 'retrieve' | 'kill' | 'explore' | 'talk_to';
    item?: string;
    amount?: number;
    turnIn?: boolean;
    target?: string;
    locationId?: string;
    locationHint?: string;
    npcId?: string;
    npcName?: string;
    [key: string]: any;
}

export interface Reward {
    gold?: number;
    items?: Array<{ name: string; amount: number }>;
    xp?: number;
}

export interface QuestData {
    id: string;
    title: string;
    description: string;
    objectives: Objective[];
    reward?: Reward;
}

export interface QuestState {
    data: QuestData;
    status: QuestStatus;
    progress?: Record<string, any>;
}

// --- Event Log ---
export interface EventEntry {
    timestamp: string;
    message: string;
}

// --- Controls ---
export interface KeyState { [key: string]: boolean | undefined; }
export interface MouseState { x: number; y: number; dx: number; dy: number; buttons: { [key: number]: boolean | undefined }; }
export interface MoveState { forward: number; right: number; jump: boolean; sprint: boolean; interact: boolean; }