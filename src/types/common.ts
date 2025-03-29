import * as THREE from 'three';
// No direct dependency on Player/Inventory needed here if only types are used.

// --- Entity ---
/**
 * Shared UserData structure for various scene objects (Entities, InteractableObjects, simple meshes).
 * Helps InteractionSystem and other systems identify and interact with objects consistently.
 */
export interface EntityUserData {
    // Core identification
    id: string;                 // Unique identifier (can be Entity ID, object name, etc.)
    entityReference?: any;      // Direct reference to the controlling instance (Entity, InteractableObject, Chest, etc.)

    // Type flags
    isEntity?: boolean;         // Is this controlled by an Entity class instance?
    isPlayer?: boolean;
    isNPC?: boolean;
    isAnimal?: boolean;
    isSimpleObject?: boolean;   // Is this controlled by InteractableObject?
    isTerrain?: boolean;        // Is this the main terrain mesh?

    // Interaction flags & data
    isInteractable?: boolean;   // Can the player interact with this?
    interactionType?: string;   // e.g., 'talk', 'gather', 'open', 'retrieve', 'read_sign'
    prompt?: string;            // Text displayed when interaction is possible (e.g., "Press E to talk")

    // Physics & State flags
    isCollidable?: boolean;     // Does this participate in physics collisions?
    boundingBox?: THREE.Box3;   // Cached bounding box for physics/interaction checks
    isHostile?: boolean;        // Is this currently hostile towards the player? (e.g., Wolf)
    isDead?: boolean;           // Is the associated entity dead?
    isOpen?: boolean;           // Is the container (Chest) open?

    // Resource gathering data
    resource?: string;          // Type of resource (e.g., 'wood', 'stone', 'herb')
    gatherTime?: number;        // Time in milliseconds to gather
    isDepletable?: boolean;     // Does gathering remove/hide the node temporarily?
    respawnTime?: number;       // Time in milliseconds for a depleted node to respawn

    // Container/Item data
    loot?: Record<string, number>; // Items contained within (e.g., Chest) - { itemName: amount }
    data?: any;                 // Generic data payload (e.g., sign text, item name for retrieval)

    // Dimensions (optional, for specific entity types)
    height?: number;
    width?: number;
    depth?: number;
    radius?: number;

    // Allow additional dynamic properties if needed
    [key: string]: any;
}

// --- Interaction ---
/** Result of an interaction attempt */
export interface InteractionResult {
    type: 'reward' | 'message' | 'dialogue' | 'item_retrieved' | 'error' | 'gather_start' | 'open_result';
    item?: { name: string; amount: number }; // For reward/retrieval
    message?: string;                       // Generic message/error/result text
    text?: string;                          // Dialogue text from an NPC
    state?: string;                         // Optional state change indicator (e.g., NPC dialogue state)
}

/** Information about a potential interaction target */
export interface TargetInfo {
    mesh: THREE.Object3D;     // The specific mesh/group targeted
    instance: any;          // The controlling instance (Entity, InteractableObject, THREE.Object3D, etc.)
    point: THREE.Vector3;   // World-space point of interaction (e.g., raycast hit point)
    distance: number;       // Distance from the interaction origin (camera/player)
}

/** State for an ongoing gathering action */
export interface ActiveGather {
    targetInstance: any;    // The object being gathered from (usually the mesh/group)
    startTime: number;      // Timestamp when gathering started (performance.now())
    duration: number;       // Total time required in milliseconds
    resource: string;       // Name of the resource being gathered
}

// --- Inventory ---
/** Represents an item stack in the inventory */
export interface InventoryItem {
    name: string;           // Unique name of the item
    count: number;          // Number of items in this stack
    icon?: string;          // Optional identifier for UI icon (e.g., CSS class name)
    data?: any;             // Optional additional data (e.g., item stats, description key)
}

// --- Quest ---
/** Possible statuses of a quest */
export type QuestStatus = 'unknown' | 'available' | 'active' | 'completed' | 'failed';

/** Defines a single objective within a quest */
export interface Objective {
    type: 'gather' | 'retrieve' | 'kill' | 'explore' | 'talk_to'; // Type of objective
    item?: string;          // Item name for gather/retrieve objectives
    amount?: number;        // Required amount (default 1)
    turnIn?: boolean;       // Does completing the quest consume this item? (default false)
    target?: string;        // Target identifier for kill objectives (e.g., 'Wolf')
    locationId?: string;    // Identifier for explore objectives
    locationHint?: string;  // Hint text for explore objectives
    npcId?: string;         // Identifier for talk_to objectives
    npcName?: string;       // Display name for talk_to objectives
    [key: string]: any;     // Allow custom objective properties
}

/** Defines potential rewards for completing a quest */
export interface Reward {
    gold?: number;
    items?: Array<{ name: string; amount: number }>; // Items to grant
    xp?: number;                                    // Experience points (if applicable)
}

/** Static definition of a quest */
export interface QuestData {
    id: string;             // Unique identifier for the quest
    title: string;          // Display name of the quest
    description: string;    // Text describing the quest task
    objectives: Objective[];// List of objectives to complete
    reward?: Reward;        // Optional rewards upon completion
}

/** Runtime state of a quest for a player */
export interface QuestState {
    data: QuestData;        // Reference to the static quest definition
    status: QuestStatus;    // Current status of the quest
    progress?: Record<string, any>; // Optional tracker for complex progress (e.g., kill counts)
}

// --- Event Log ---
/** An entry in the event log UI */
export interface EventEntry {
    timestamp: string;      // Formatted timestamp string
    message: string;        // The event message
}

// --- Controls ---
/** State of keyboard keys (true if pressed) */
export interface KeyState { [key: string]: boolean | undefined; }
/** State of the mouse (position, delta, buttons) */
export interface MouseState { x: number; y: number; dx: number; dy: number; buttons: { [key: number]: boolean | undefined }; }
/** Player movement state derived from input */
export interface MoveState { forward: number; right: number; jump: boolean; sprint: boolean; interact: boolean; }