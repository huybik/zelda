// main.ts
// Single file refactored code for minimal size, easy maintenance, separation of concerns, and decoupling.

import nipplejs, {
  JoystickManager,
  Joystick,
  JoystickManagerOptions,
  EventData,
  JoystickOutputData,
} from "nipplejs";
import {
  Raycaster,
  Points,
  CylinderGeometry,
  ConeGeometry,
  Quaternion,
  Material,
  Matrix4,
  AnimationMixer,
  AnimationAction,
  LoopOnce,
  Sprite,
  SpriteMaterial,
  Scene,
  PerspectiveCamera,
  WebGLRenderer,
  Clock,
  Vector3,
  Color,
  Fog,
  Mesh,
  PlaneGeometry,
  MeshLambertMaterial,
  AmbientLight,
  DirectionalLight,
  HemisphereLight,
  BoxGeometry,
  MeshBasicMaterial,
  DoubleSide,
  PCFSoftShadowMap,
  MathUtils,
  Object3D,
  Group,
  AnimationClip,
  Vector2,
  SphereGeometry,
  TorusGeometry,
  CircleGeometry,
  MeshPhongMaterial,
  PointsMaterial,
  BufferGeometry,
  BufferAttribute,
  CanvasTexture,
  TextureLoader,
  Box3,
} from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { SimplexNoise } from "three/examples/jsm/math/SimplexNoise.js";
import WebGL from "three/examples/jsm/capabilities/WebGL.js";

// =============================================================================
// Constants & Configuration
// =============================================================================

const WORLD_SIZE = 100;
const TERRAIN_SEGMENTS = 15;
const CHARACTER_HEIGHT = 1.8;
const CHARACTER_RADIUS = 0.4;
const INTERACTION_DISTANCE = 3.0;
const API_KEY1 = import.meta.env.VITE_API_KEY1;
const API_KEY2 = import.meta.env.VITE_API_KEY2;

let currentApiKey = API_KEY1 || "";
let API_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${currentApiKey}`;
let switchedApiKey = false;

const Colors = {
  PASTEL_GREEN: 0x98fb98,
  PASTEL_BROWN: 0xcd853f,
  PASTEL_GRAY: 0xb0c4de,
  FOREST_GREEN: 0x228b22,
  BACKGROUND: 0x87ceeb,
  TERRAIN: 0x88b04b,
  EXIT_PORTAL: 0x00ff00,
  START_PORTAL: 0xff0000,
} as const;

// =============================================================================
// Interfaces & Types
// =============================================================================

interface EntityUserData {
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
  resource?: string;
  gatherTime?: number;
  isDepletable?: boolean;
  respawnTime?: number;
  isSimpleObject?: boolean; // Flag for non-Entity interactables
  [key: string]: unknown;
}

interface InteractionResult {
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

interface TargetInfo {
  mesh: Object3D;
  instance: any;
  point: Vector3;
  distance: number;
}

interface ActiveGather {
  targetInstance: any;
  startTime: number;
  duration: number;
  resource: string;
}

interface InventoryItem {
  name: string;
  count: number;
  icon?: string;
}

interface EventEntry {
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

interface KeyState {
  [key: string]: boolean | undefined;
}

interface MouseState {
  x: number;
  y: number;
  dx: number;
  dy: number;
  buttons: { [key: number]: boolean | undefined };
}

interface MoveState {
  forward: number;
  right: number;
  jump: boolean;
  sprint: boolean;
  interact: boolean;
  attack: boolean;
}

interface UpdateOptions {
  moveState?: MoveState;
  collidables?: Object3D[];
}

interface Observation {
  timestamp: number;
  self: {
    id: string;
    position: Vector3;
    health: number;
    isDead: boolean;
    currentAction: string;
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
    type: string;
    position: Vector3;
    isInteractable: boolean;
    resource?: string;
  }>;
}

interface Quest {
  name: string;
  description: string;
  isCompleted: boolean;
  checkCompletion: (
    interactionTarget: Character,
    chatResponse: string
  ) => boolean;
}

// =============================================================================
// Utility Functions
// =============================================================================

let nextEntityIdCounter = 0;
function getNextEntityId(): number {
  return nextEntityIdCounter++;
}

function randomFloat(min: number, max: number): number {
  return Math.random() * (max - min) + min;
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  x = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return x * x * (3 - 2 * x);
}

function smoothVectorLerp(
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

function getTerrainHeight(scene: Scene, x: number, z: number): number {
  const terrain = scene.getObjectByName("Terrain") as Mesh;
  if (!terrain) return 0;
  const raycaster = new Raycaster(
    new Vector3(x, 200, z),
    new Vector3(0, -1, 0)
  );
  const intersects = raycaster.intersectObject(terrain);
  return intersects.length > 0 ? intersects[0].point.y : 0;
}

async function loadModels(): Promise<
  Record<string, { scene: Group; animations: AnimationClip[] }>
> {
  const loader = new GLTFLoader();
  const modelPaths = {
    player: "assets/player/scene.gltf",
    tavernMan: "assets/player/scene.gltf", // Using same model for simplicity
    oldMan: "assets/player/scene.gltf",
    woman: "assets/player/scene.gltf",
  };
  const models: Record<string, { scene: Group; animations: AnimationClip[] }> =
    {};
  for (const [key, path] of Object.entries(modelPaths)) {
    const gltf = await loader.loadAsync(path);
    models[key] = { scene: gltf.scene, animations: gltf.animations };
  }
  return models;
}

function switchApiKey(): void {
  if (currentApiKey === API_KEY1 && API_KEY2) {
    currentApiKey = API_KEY2;
    console.log("Switched to VITE_API_KEY2 due to rate limit.");
  } else if (currentApiKey === API_KEY2 && API_KEY1) {
    currentApiKey = API_KEY1;
    console.log("Switched back to VITE_API_KEY1.");
  } else {
    console.warn("No alternate API key available or configured.");
    return; // Don't change URL if no switch possible
  }
  API_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${currentApiKey}`;
}

async function sendToGemini(prompt: string): Promise<string | null> {
  if (!currentApiKey) {
    console.warn("Gemini API key not configured.");
    return null;
  }

  try {
    const response = await fetch(API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { responseMimeType: "application/json" },
      }),
    });

    if (!response.ok) {
      if (response.status === 429 && !switchedApiKey) {
        console.warn(`Rate limit hit (429). Switching API key...`);
        switchApiKey();
        switchedApiKey = true; // Mark that we switched
        return sendToGemini(prompt); // Retry with the new key
      }
      console.error(`HTTP error! status: ${response.status}`);
      const errorData = await response.text(); // Get text for better debugging
      console.error("Error details:", errorData);
      return null;
    }

    switchedApiKey = false; // Reset switch flag on success
    const data = await response.json();
    if (data.candidates?.[0]?.content?.parts?.[0]?.text) {
      return data.candidates[0].content.parts[0].text as string;
    } else {
      console.error("Unexpected API response format:", data);
      return null;
    }
  } catch (error) {
    console.error("Error during API call:", error);
    return JSON.stringify({ action: "idle", intent: "Error fallback" }); // Provide a fallback JSON
  }
}

// =============================================================================
// Event Log
// =============================================================================

class EventLog {
  entries: EventEntry[];
  maxEntries: number;
  onChangeCallbacks: Array<(entries: EventEntry[]) => void>;

  constructor(maxEntries: number = 50) {
    this.entries = [];
    this.maxEntries = Math.max(1, maxEntries);
    this.onChangeCallbacks = [];
  }

  addEntry(entry: EventEntry): void;
  addEntry(message: string): void;
  addEntry(...args: any[]): void {
    let entryToAdd: EventEntry;
    const timestamp = new Date().toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });

    if (args.length === 1 && typeof args[0] === "string") {
      entryToAdd = { timestamp, message: args[0] };
    } else if (
      args.length === 1 &&
      typeof args[0] === "object" &&
      args[0].message
    ) {
      entryToAdd = { ...args[0], timestamp: args[0].timestamp || timestamp };
    } else {
      console.warn("Invalid arguments passed to EventLog.addEntry:", args);
      return;
    }

    this.entries.push(entryToAdd);
    if (this.entries.length > this.maxEntries) this.entries.shift();
    this.notifyChange();
  }

  onChange(callback: (entries: EventEntry[]) => void): void {
    if (typeof callback === "function") this.onChangeCallbacks.push(callback);
  }

  notifyChange(): void {
    const entriesCopy = [...this.entries];
    this.onChangeCallbacks.forEach((cb) => cb(entriesCopy));
  }
}

// =============================================================================
// Inventory
// =============================================================================

class Inventory {
  size: number;
  items: Array<InventoryItem | null>;
  onChangeCallbacks: Array<(items: Array<InventoryItem | null>) => void>;
  itemMaxStack: Record<string, number>;

  constructor(size: number = 9) {
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

    // Try stacking existing items
    for (let i = 0; i < this.size && remainingCount > 0; i++) {
      const slot = this.items[i];
      if (slot?.name === itemName && slot.count < maxStack) {
        const amountToAdd = Math.min(remainingCount, maxStack - slot.count);
        slot.count += amountToAdd;
        remainingCount -= amountToAdd;
        changed = true;
      }
    }

    // Try adding to empty slots
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

// =============================================================================
// AI Controller
// =============================================================================

class AIController {
  character: Character;
  aiState: string = "idle";
  previousAiState: string = "idle";
  homePosition: Vector3;
  destination: Vector3 | null = null;
  targetResource: Object3D | null = null;
  gatherTimer: number = 0;
  gatherDuration: number = 0;
  actionTimer: number = 5; // Time between proactive decisions
  interactionDistance: number = 3;
  searchRadius: number;
  roamRadius: number;
  target: Entity | null = null;
  observation: Observation | null = null;
  persona: string = "";
  currentIntent: string = "";
  targetAction: string | null = null; // 'chat', 'attack', 'heal', 'gather', 'moveTo'
  message: string | null = null; // For chat action

  private lastApiCallTime: number = 0;
  private apiCallCooldown: number = 10000; // 10 seconds
  private lastObservation: Observation | null = null;

  constructor(character: Character) {
    this.character = character;
    this.homePosition = character.mesh!.position.clone();
    this.searchRadius = character.searchRadius;
    this.roamRadius = character.roamRadius;
    this.persona = character.persona;
  }

  computeAIMoveState(deltaTime: number): MoveState {
    const moveState: MoveState = {
      forward: 0,
      right: 0,
      jump: false,
      sprint: false,
      interact: false,
      attack: false,
    };

    if (this.character.game) {
      this.updateObservation(this.character.game.entities);
    }

    switch (this.aiState) {
      case "idle":
        this.actionTimer -= deltaTime;
        const canCallApi =
          Date.now() - this.lastApiCallTime >= this.apiCallCooldown;
        if (
          canCallApi &&
          (this.actionTimer <= 0 ||
            this.isAffectedByEntities() ||
            this.justCompletedAction())
        ) {
          this.decideNextAction();
          this.lastApiCallTime = Date.now();
          this.actionTimer = 5 + Math.random() * 5; // Reset timer
        }
        break;

      case "roaming":
      case "movingToTarget": // Combined movement logic
      case "movingToResource":
        let targetPos: Vector3 | null = null;
        if (this.aiState === "roaming" && this.destination)
          targetPos = this.destination;
        if (this.aiState === "movingToTarget" && this.target?.mesh)
          targetPos = this.target.mesh.position;
        if (this.aiState === "movingToResource" && this.targetResource)
          targetPos = this.targetResource.position;

        if (targetPos) {
          const direction = targetPos
            .clone()
            .sub(this.character.mesh!.position);
          direction.y = 0;
          const distance = direction.length();
          const stopDistance =
            this.aiState === "roaming" ? 0.5 : this.interactionDistance;

          if (distance > stopDistance) {
            direction.normalize();
            this.character.lookAt(
              this.character.mesh!.position.clone().add(direction)
            );
            moveState.forward = 1;
          } else {
            // Reached destination or target
            if (this.aiState === "movingToResource" && this.targetResource) {
              this.aiState = "gathering";
              this.gatherTimer = 0;
              this.gatherDuration =
                this.targetResource.userData.gatherTime || 3000;
              this.character.isGathering = true;
              this.character.triggerAction("gather"); // Start gather animation
            } else if (
              this.aiState === "movingToTarget" &&
              this.target &&
              this.targetAction
            ) {
              this.character.lookAt(targetPos); // Ensure facing target
              this.performTargetAction();
            } else {
              // Roaming reached destination
              this.aiState = "idle";
              this.destination = null;
            }
          }
        } else {
          this.aiState = "idle"; // Target lost or invalid
        }
        break;

      case "gathering":
        this.gatherTimer += deltaTime * 1000;
        if (this.gatherTimer >= this.gatherDuration) {
          this.completeGathering();
        }
        // Animation handled by Character update
        break;
    }

    if (this.aiState !== this.previousAiState) {
      // Minimal logging for state changes if needed for debugging
      // console.log(`${this.character.name} state: ${this.previousAiState} -> ${this.aiState}`);
      this.previousAiState = this.aiState;
    }

    return moveState;
  }

  performTargetAction(): void {
    if (!this.target || !this.targetAction) {
      this.resetActionState();
      return;
    }

    switch (this.targetAction) {
      case "chat":
        if (this.message) {
          this.character.showTemporaryMessage(this.message);
          this.character.game?.logEvent(
            this.character,
            "chat",
            `${this.character.name} said "${this.message}" to ${this.target.name}.`,
            this.target,
            { message: this.message },
            this.character.mesh!.position
          );
        }
        break;
      case "attack":
        this.character.triggerAction("attack"); // Animation triggers actual attack
        break;
      case "heal":
        if (
          this.target instanceof Character &&
          this.target.health < this.target.maxHealth
        ) {
          this.character.triggerAction("heal"); // Animation triggers heal effect
        }
        break;
    }
    // Action initiated, reset state for next decision cycle
    this.resetActionState();
  }

  completeGathering(): void {
    if (this.targetResource && this.character.inventory) {
      const resourceName = this.targetResource.userData.resource;
      if (this.character.inventory.addItem(resourceName, 1)) {
        this.character.game?.logEvent(
          this.character,
          "gather",
          `${this.character.name} gathered 1 ${resourceName}.`,
          undefined,
          { resource: resourceName },
          this.character.mesh!.position
        );

        if (this.targetResource?.userData.isDepletable) {
          this.targetResource.visible = false;
          this.targetResource.userData.isInteractable = false;
          const respawnTime = this.targetResource.userData.respawnTime || 15000;
          const resourceToRespawn = this.targetResource; // Closure
          setTimeout(() => {
            if (resourceToRespawn?.userData) {
              resourceToRespawn.visible = true;
              resourceToRespawn.userData.isInteractable = true;
            }
          }, respawnTime);
        }
      } else {
        this.character.game?.logEvent(
          this.character,
          "gather_fail",
          `Inventory full, could not gather ${resourceName}.`,
          undefined,
          { resource: resourceName },
          this.character.mesh!.position
        );
      }
    }
    this.character.isGathering = false;
    this.resetActionState();
  }

  resetActionState(): void {
    this.aiState = "idle";
    this.target = null;
    this.targetAction = null;
    this.message = null;
    this.targetResource = null;
    this.destination = null;
    this.currentIntent = ""; // Clear intent until next decision
    this.character.updateIntentDisplay("");
  }

  private justCompletedAction(): boolean {
    return this.previousAiState !== "idle" && this.aiState === "idle";
  }

  private isAffectedByEntities(): boolean {
    if (!this.observation || !this.lastObservation) return false;
    // Simplified check: Did the number of nearby characters change?
    if (
      this.observation.nearbyCharacters.length !==
      this.lastObservation.nearbyCharacters.length
    )
      return true;
    // Add more sophisticated checks if needed (e.g., health changes, specific actions)
    return false;
  }

  updateObservation(allEntities: Array<any>): void {
    this.lastObservation = this.observation
      ? JSON.parse(JSON.stringify(this.observation))
      : null;

    const nearbyCharacters: Observation["nearbyCharacters"] = [];
    const nearbyObjects: Observation["nearbyObjects"] = [];
    const selfPosition = this.character.mesh!.position;
    const searchRadiusSq = this.searchRadius * this.searchRadius;

    const self: Observation["self"] = {
      id: this.character.id,
      position: selfPosition.clone(),
      health: this.character.health,
      isDead: this.character.isDead,
      currentAction: this.aiState,
    };

    for (const entity of allEntities) {
      if (entity === this.character || !entity?.mesh?.parent) continue; // Skip self, ensure entity is in scene

      const entityMesh = entity.mesh;
      const entityPosition = entityMesh.position;
      const distanceSq = selfPosition.distanceToSquared(entityPosition);

      if (distanceSq > searchRadiusSq) continue;

      if (entity instanceof Character) {
        nearbyCharacters.push({
          id: entity.id,
          position: entityPosition.clone(),
          health: entity.health,
          isDead: entity.isDead,
          currentAction:
            entity.aiController?.aiState ||
            (entity.userData.isPlayer ? "player_controlled" : "unknown"),
        });
      } else if (entity.userData?.isInteractable && entity.visible) {
        nearbyObjects.push({
          id: entity.userData.id || entity.uuid,
          type: entity.name || "unknown",
          position: entityPosition.clone(),
          isInteractable: entity.userData.isInteractable,
          resource: entity.userData.resource,
        });
      }
    }

    this.observation = {
      timestamp: Date.now(),
      self,
      nearbyCharacters,
      nearbyObjects,
    };
  }

  generatePrompt(): string {
    if (!this.observation) return "Error: No observation data.";

    const { self, nearbyCharacters, nearbyObjects } = this.observation;
    const eventLog = this.character.eventLog.entries
      .slice(-5)
      .map((e) => `[${e.timestamp}] ${e.message}`)
      .join("\n");

    // Limit nearby objects description length
    const maxObjectsToShow = 5;
    const limitedObjects = nearbyObjects.slice(0, maxObjectsToShow);
    let nearbyObjectsDesc =
      limitedObjects.length > 0
        ? limitedObjects
            .map(
              (o) =>
                `- ${o.type} (${o.id}) at (${o.position.x.toFixed(1)}, ${o.position.z.toFixed(1)})${o.resource ? ", resource: " + o.resource : ""}`
            )
            .join("\n")
        : "None";
    if (nearbyObjects.length > maxObjectsToShow) {
      nearbyObjectsDesc += `\n- ... and ${nearbyObjects.length - maxObjectsToShow} more`;
    }

    const nearbyCharsDesc =
      nearbyCharacters.length > 0
        ? nearbyCharacters
            .map(
              (c) =>
                `- ${c.id} at (${c.position.x.toFixed(1)}, ${c.position.z.toFixed(1)}), health: ${c.health}, ${c.isDead ? "dead" : "alive"}, action: ${c.currentAction}`
            )
            .join("\n")
        : "None";

    // Simplified prompt structure
    return `
  Persona: ${this.persona || "A villager."}
  Me (${this.character.id}): Health ${self.health}, Action: ${self.currentAction}
  Nearby Chars:
  ${nearbyCharsDesc}
  Nearby Objs:
  ${nearbyObjectsDesc}
  Recent Events:
  ${eventLog || "None"}

  Choose action (JSON): {"action": "idle|roam|gather|moveTo|attack|heal|chat", "object_id": "...", "target_id": "...", "message": "...", "intent": "brief reason"}
  Ensure IDs exist in nearby lists. Be concise. Example: {"action": "gather", "object_id": "Tree_123", "intent": "Need wood"}
  `.trim();
  }

  async decideNextAction(): Promise<void> {
    const prompt = this.generatePrompt();
    try {
      // console.log(`AI (${this.character.name}) Prompting...`); // Minimal log
      const response = await sendToGemini(prompt);
      if (response) {
        try {
          const actionData = JSON.parse(response);
          // console.log(`AI (${this.character.name}) Response:`, actionData); // Minimal log
          this.setActionFromAPI(actionData);
        } catch (parseError) {
          console.error(
            `Failed to parse API response:`,
            parseError,
            "\nResponse:",
            response
          );
          this.fallbackToDefaultBehavior();
        }
      } else {
        console.warn(`AI (${this.character.name}) received null response.`);
        this.fallbackToDefaultBehavior();
      }
    } catch (error) {
      console.error(`Error querying API for ${this.character.name}:`, error);
      this.fallbackToDefaultBehavior();
    }
  }

  fallbackToDefaultBehavior(): void {
    // console.log(`AI (${this.character.name}) falling back to roam.`); // Minimal log
    this.aiState = "roaming";
    const angle = Math.random() * Math.PI * 2;
    const distance = Math.random() * this.roamRadius;
    this.destination = this.homePosition
      .clone()
      .add(
        new Vector3(Math.cos(angle) * distance, 0, Math.sin(angle) * distance)
      );
    if (this.character.scene) {
      this.destination.y = getTerrainHeight(
        this.character.scene,
        this.destination.x,
        this.destination.z
      );
    }
    this.target = null;
    this.targetAction = null;
    this.message = null;
    this.currentIntent = "Exploring";
    this.character.updateIntentDisplay(this.currentIntent);
  }

  setActionFromAPI(actionData: {
    action: string;
    object_id?: string;
    target_id?: string;
    message?: string;
    intent: string;
  }): void {
    const { action, object_id, target_id, message, intent } = actionData;
    this.currentIntent = intent || "Thinking...";
    this.character.updateIntentDisplay(this.currentIntent);

    // Reset previous action state
    this.destination = null;
    this.targetResource = null;
    this.target = null;
    this.targetAction = null;
    this.message = null;

    switch (action) {
      case "idle":
        this.aiState = "idle";
        break;
      case "roam":
        this.aiState = "roaming";
        const angle = Math.random() * Math.PI * 2;
        const distance = Math.random() * this.roamRadius;
        this.destination = this.homePosition
          .clone()
          .add(
            new Vector3(
              Math.cos(angle) * distance,
              0,
              Math.sin(angle) * distance
            )
          );
        if (this.character.scene)
          this.destination.y = getTerrainHeight(
            this.character.scene,
            this.destination.x,
            this.destination.z
          );
        break;
      case "gather":
        if (object_id) {
          const targetObject = this.character.game?.entities.find(
            (e) =>
              e.userData?.id === object_id &&
              e.userData?.isInteractable &&
              e.visible
          );
          if (
            targetObject &&
            this.observation?.nearbyObjects.some((o) => o.id === object_id)
          ) {
            this.targetResource = targetObject;
            this.aiState = "movingToResource";
          } else {
            this.aiState = "idle"; // Target not found or invalid
          }
        } else {
          this.aiState = "idle";
        }
        break;
      case "moveTo":
      case "attack":
      case "heal":
      case "chat":
        if (target_id) {
          const targetEntity = this.character.game?.entities.find(
            (e) => e.id === target_id
          );
          if (
            targetEntity instanceof Character &&
            !targetEntity.isDead &&
            this.observation?.nearbyCharacters.some((c) => c.id === target_id)
          ) {
            this.target = targetEntity;
            this.targetAction = action;
            this.aiState = "movingToTarget";
            if (action === "chat") this.message = message || "...";
          } else {
            this.aiState = "idle"; // Target not found, dead, or invalid
          }
        } else {
          this.aiState = "idle";
        }
        break;
      default:
        console.warn(
          `AI (${this.character.name}) received unknown action: ${action}`
        );
        this.aiState = "idle";
        break;
    }
    // Minimal logging
    // if (this.aiState !== 'idle') console.log(`AI (${this.character.name}) decided: ${action} (Intent: ${intent})`);
  }
}

// =============================================================================
// Entity Base Class
// =============================================================================

class Entity {
  id: string;
  mesh: Group | null;
  scene: Scene | null;
  name: string;
  velocity: Vector3;
  boundingBox: Box3;
  health: number;
  maxHealth: number;
  isDead: boolean;
  userData: EntityUserData;
  game: Game | null = null; // Reference to the main game instance

  // Optional display elements
  intentSprite: Sprite | null = null;
  nameSprite: Sprite | null = null;
  private intentCanvas: HTMLCanvasElement | null = null;
  private intentContext: CanvasRenderingContext2D | null = null;
  private intentTexture: CanvasTexture | null = null;
  private nameCanvas: HTMLCanvasElement | null = null;
  private nameContext: CanvasRenderingContext2D | null = null;
  private nameTexture: CanvasTexture | null = null;

  constructor(scene: Scene, position: Vector3, name: string = "Entity") {
    this.id = `${name}_${getNextEntityId()}`;
    this.scene = scene;
    this.name = name;
    this.mesh = new Group();
    this.mesh.position.copy(position);
    this.velocity = new Vector3();
    this.boundingBox = new Box3();
    this.health = 100;
    this.maxHealth = 100;
    this.isDead = false;

    this.userData = {
      entityReference: this,
      isEntity: true,
      isPlayer: false,
      isNPC: false,
      isCollidable: true,
      isInteractable: true,
      id: this.id,
    };
    if (this.mesh) {
      this.mesh.userData = this.userData;
      this.mesh.name = this.name;
      this.scene.add(this.mesh);
    }
  }

  // Basic update method (overridden by Character)
  update(deltaTime: number, options: UpdateOptions = {}): void {}

  updateBoundingBox(): void {
    if (!this.mesh) return;
    const height = this.userData.height ?? CHARACTER_HEIGHT;
    const radius = this.userData.radius ?? CHARACTER_RADIUS;
    const center = this.mesh.position
      .clone()
      .add(new Vector3(0, height / 2, 0));
    const size = new Vector3(radius * 2, height, radius * 2);
    this.boundingBox.setFromCenterAndSize(center, size);
    this.userData.boundingBox = this.boundingBox; // Keep reference in userData if needed elsewhere
  }

  setPosition(position: Vector3): void {
    if (!this.mesh) return;
    this.mesh.position.copy(position);
    this.updateBoundingBox();
  }

  lookAt(targetPosition: Vector3): void {
    if (!this.mesh) return;
    const target = targetPosition.clone();
    target.y = this.mesh.position.y; // Look horizontally
    if (target.distanceToSquared(this.mesh.position) < 0.001) return; // Avoid looking at self
    this.mesh.lookAt(target);
  }

  takeDamage(amount: number, attacker: Entity): void {
    if (this.isDead || amount <= 0) return;
    this.health = Math.max(0, this.health - amount);
    this.game?.logEvent(
      this,
      "take_damage",
      `${this.name} took ${amount} damage${attacker ? ` from ${attacker.name}` : ""}.`,
      attacker.name,
      { damage: amount },
      this.mesh!.position
    );
    if (this.health <= 0) this.die(attacker);
  }

  heal(amount: number): void {
    if (this.isDead || amount <= 0 || this.health >= this.maxHealth) return;
    const actualHeal = Math.min(amount, this.maxHealth - this.health);
    this.health += actualHeal;
    // Logging handled by the action triggering the heal
  }

  die(attacker: Entity | null = null): void {
    if (this.isDead) return;
    this.isDead = true;
    this.velocity.set(0, 0, 0);
    this.health = 0;
    this.userData.isCollidable = false;
    this.userData.isInteractable = false;
    // Specific death behavior (e.g., animation) handled in Character
  }

  destroy(): void {
    this.removeDisplays();
    if (!this.mesh || !this.scene) return;
    this.mesh.traverse((child) => {
      if (child instanceof Mesh) {
        child.geometry?.dispose();
        if (Array.isArray(child.material)) {
          child.material.forEach((mat: Material) => mat?.dispose());
        } else {
          (child.material as Material)?.dispose();
        }
      }
    });
    this.scene.remove(this.mesh);
    this.mesh = null;
    this.scene = null;
    this.userData.entityReference = null;
  }

  // --- Display Methods ---

  initNameDisplay(): void {
    if (this.userData.isPlayer || this.nameSprite) return; // Don't show for player, prevent re-init

    this.nameCanvas = document.createElement("canvas");
    this.nameCanvas.width = 200;
    this.nameCanvas.height = 30;
    this.nameContext = this.nameCanvas.getContext("2d")!;
    this.nameTexture = new CanvasTexture(this.nameCanvas);

    const material = new SpriteMaterial({ map: this.nameTexture });
    this.nameSprite = new Sprite(material);
    const aspectRatio = this.nameCanvas.width / this.nameCanvas.height;
    this.nameSprite.scale.set(aspectRatio * 0.3, 0.3, 1);
    this.nameSprite.position.set(0, CHARACTER_HEIGHT + 0.15, 0); // Below intent
    this.mesh!.add(this.nameSprite);
    this.updateNameDisplay(this.name);
  }

  updateNameDisplay(name: string): void {
    if (!this.nameContext || !this.nameCanvas || !this.nameTexture) return;
    const ctx = this.nameContext;
    const canvas = this.nameCanvas;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.font = "16px Arial";
    ctx.fillStyle = "blue";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(name, canvas.width / 2, canvas.height / 2);
    this.nameTexture.needsUpdate = true;
  }

  initIntentDisplay(): void {
    if (this.intentSprite) return; // Prevent re-init

    this.intentCanvas = document.createElement("canvas");
    this.intentCanvas.width = 200;
    this.intentCanvas.height = 70;
    this.intentContext = this.intentCanvas.getContext("2d")!;
    this.intentTexture = new CanvasTexture(this.intentCanvas);

    const material = new SpriteMaterial({ map: this.intentTexture });
    this.intentSprite = new Sprite(material);
    const aspectRatio = this.intentCanvas.width / this.intentCanvas.height;
    this.intentSprite.scale.set(aspectRatio * 0.6, 0.6, 1);
    this.intentSprite.position.set(0, CHARACTER_HEIGHT + 0.6, 0); // Above name
    this.mesh!.add(this.intentSprite);
    this.updateIntentDisplay(""); // Start hidden
  }

  updateIntentDisplay(text: string): void {
    if (
      !this.intentContext ||
      !this.intentCanvas ||
      !this.intentTexture ||
      !this.intentSprite
    )
      return;

    if (!text || text.trim() === "") {
      this.intentSprite.visible = false;
      return;
    }
    this.intentSprite.visible = true;

    const ctx = this.intentContext;
    const canvas = this.intentCanvas;
    const maxWidth = canvas.width - 10;
    const lineHeight = 20;
    const x = canvas.width / 2;
    const borderRadius = 10;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "rgba(0, 0, 0, 0.5)";
    ctx.beginPath();
    ctx.roundRect(0, 0, canvas.width, canvas.height, borderRadius);
    ctx.fill();

    ctx.font = "13px Arial";
    ctx.fillStyle = "white";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    // Basic word wrapping
    const words = text.split(" ");
    let lines = [];
    let currentLine = "";
    for (const word of words) {
      const testLine = currentLine + word + " ";
      if (ctx.measureText(testLine).width > maxWidth && currentLine !== "") {
        lines.push(currentLine.trim());
        currentLine = word + " ";
      } else {
        currentLine = testLine;
      }
    }
    lines.push(currentLine.trim());

    // Limit lines and draw
    const maxLines = 3;
    const totalTextHeight = Math.min(lines.length, maxLines) * lineHeight;
    let startY = (canvas.height - totalTextHeight) / 2 + lineHeight / 2;

    for (let i = 0; i < Math.min(lines.length, maxLines); i++) {
      let lineToDraw = lines[i];
      if (i === maxLines - 1 && lines.length > maxLines) {
        lineToDraw = lineToDraw.slice(0, -3) + "..."; // Add ellipsis if truncated
      }
      ctx.fillText(lineToDraw, x, startY + i * lineHeight);
    }

    this.intentTexture.needsUpdate = true;
  }

  showTemporaryMessage(message: string, duration: number = 7000): void {
    if (!this.intentSprite) return;
    const aiController = (this as any).aiController as AIController | null; // Type assertion
    const originalIntent = aiController ? aiController.currentIntent : "";
    this.updateIntentDisplay(message);
    setTimeout(() => {
      // Only reset if the intent hasn't changed again by the AI
      if (
        this.intentSprite?.visible &&
        this.intentContext?.measureText(message).width ===
          this.intentContext?.measureText(
            this.intentSprite.material.map?.image?.getContext("2d")?.canvas
              .textContent || ""
          ).width
      ) {
        this.updateIntentDisplay(originalIntent);
      }
    }, duration);
  }

  removeDisplays(): void {
    if (this.intentSprite && this.mesh) {
      this.mesh.remove(this.intentSprite);
      this.intentSprite.material.map?.dispose();
      this.intentSprite.material.dispose();
      this.intentSprite = null;
      this.intentTexture?.dispose();
      this.intentTexture = null;
      this.intentCanvas = null;
      this.intentContext = null;
    }
    if (this.nameSprite && this.mesh) {
      this.mesh.remove(this.nameSprite);
      this.nameSprite.material.map?.dispose();
      this.nameSprite.material.dispose();
      this.nameSprite = null;
      this.nameTexture?.dispose();
      this.nameTexture = null;
      this.nameCanvas = null;
      this.nameContext = null;
    }
  }
}

// =============================================================================
// Character Class
// =============================================================================

class Character extends Entity {
  maxStamina: number;
  stamina: number;
  walkSpeed: number;
  runSpeed: number;
  jumpForce: number;
  staminaDrainRate: number;
  staminaRegenRate: number;
  staminaJumpCost: number;
  canJump: boolean;
  isSprinting: boolean;
  isExhausted: boolean;
  exhaustionThreshold: number;
  moveState: MoveState;
  gravity: number;
  isOnGround: boolean;
  groundCheckDistance: number;
  eventLog: EventLog;
  mixer: AnimationMixer;
  animations: Record<string, AnimationAction | undefined> = {};
  currentActionName: string = "idle";
  isGathering: boolean = false;
  gatherAttackTimer: number = 0;
  gatherAttackInterval: number = 1.0; // How often to play attack anim while gathering
  searchRadius: number = 30;
  roamRadius: number = 10;
  inventory: Inventory | null;
  persona: string = "";
  aiController: AIController | null = null;
  actionType: string = "none"; // 'attack', 'heal', 'gather'
  isPerformingAction: boolean = false; // Is playing a non-looping action anim (attack/heal)

  private groundCheckOrigin = new Vector3();
  private groundCheckDirection = new Vector3(0, -1, 0);
  private attackTriggered: boolean = false; // Prevent holding attack key spamming triggers
  private rayCaster: Raycaster; // Moved from Entity for Character-specific use

  constructor(
    scene: Scene,
    position: Vector3,
    name: string,
    model: Group,
    animations: AnimationClip[],
    inventory: Inventory | null
  ) {
    super(scene, position, name);
    this.userData.isCollidable = true;
    this.userData.isInteractable = true;
    this.userData.interactionType = "talk";
    this.userData.isNPC = true; // Default to NPC
    this.userData.height = CHARACTER_HEIGHT;
    this.userData.radius = CHARACTER_RADIUS;

    this.maxHealth = 100;
    this.health = this.maxHealth;
    this.maxStamina = 100;
    this.stamina = this.maxStamina;
    this.walkSpeed = 4.0;
    this.runSpeed = 8.0;
    this.jumpForce = 8.0;
    this.staminaDrainRate = 15;
    this.staminaRegenRate = 10;
    this.staminaJumpCost = 10;
    this.canJump = false;
    this.isSprinting = false;
    this.isExhausted = false;
    this.exhaustionThreshold = 20;
    this.moveState = {
      forward: 0,
      right: 0,
      jump: false,
      sprint: false,
      interact: false,
      attack: false,
    };
    this.gravity = -25;
    this.isOnGround = false;
    this.groundCheckDistance = 0.15;
    this.inventory = inventory;
    this.eventLog = new EventLog(50);
    this.rayCaster = new Raycaster();

    // Setup model
    const box = new Box3().setFromObject(model);
    const scale = CHARACTER_HEIGHT / (box.max.y - box.min.y);
    console.log("scale:", scale);

    model.scale.set(scale, scale, scale);
    model.position.y = -box.min.y * scale; // Align bottom with origin
    this.mesh!.add(model);

    // Setup animations
    this.mixer = new AnimationMixer(model);
    this.setupAnimations(animations);
    this.switchAction("idle"); // Start with idle

    this.mixer.addEventListener("finished", (e) =>
      this.onAnimationFinished(e.action)
    );

    if (this.userData.isNPC) {
      this.aiController = new AIController(this);
    }

    this.updateBoundingBox();
  }

  setupAnimations(clips: AnimationClip[]): void {
    const animNames: Record<string, string> = {
      idle: "idle", // Look for exact match first
      walk: "walk",
      run: "run",
      jump: "jump",
      attack: "attack",
      // Add fallbacks if exact names aren't found
      idleFallback: "idled",
    };

    for (const key in animNames) {
      const baseName = animNames[key as keyof typeof animNames];
      let clip = clips.find((c) => c.name.toLowerCase() === baseName);
      // Fallback check (e.g., "idled" for "idle")
      if (!clip && key === "idle" && animNames.idleFallback) {
        clip = clips.find((c) =>
          c.name.toLowerCase().includes(animNames.idleFallback)
        );
      }
      // Generic fallback check
      if (!clip) {
        clip = clips.find((c) => c.name.toLowerCase().includes(baseName));
      }

      if (clip) {
        this.animations[key.replace("Fallback", "")] =
          this.mixer.clipAction(clip);
        if (key === "jump" || key === "attack") {
          this.animations[key]!.setLoop(LoopOnce, 1);
          this.animations[key]!.clampWhenFinished = true;
        }
      } else {
        console.warn(`Animation clip not found for: ${baseName}`);
      }
    }
  }

  switchAction(actionName: string): void {
    const newAction = this.animations[actionName];
    const oldAction = this.animations[this.currentActionName];

    if (newAction === oldAction && newAction?.isRunning()) return; // Already playing

    if (oldAction) {
      oldAction.fadeOut(0.2);
    }

    if (newAction) {
      newAction.reset().fadeIn(0.2).play();
      this.currentActionName = actionName;
    } else {
      // Fallback to idle if requested action doesn't exist
      if (this.animations.idle && this.currentActionName !== "idle") {
        console.warn(`Action "${actionName}" not found, falling back to idle.`);
        this.switchAction("idle");
      }
    }
  }

  onAnimationFinished(action: AnimationAction): void {
    if (action === this.animations.attack || action === this.animations.jump) {
      this.isPerformingAction = false;
      // Don't immediately switch back if gathering, let update handle it
      if (!this.isGathering) {
        this.actionType = "none";
        // Transition back to movement/idle state
        const isMoving =
          Math.abs(this.moveState.forward) > 0.1 ||
          Math.abs(this.moveState.right) > 0.1;
        this.switchAction(
          isMoving ? (this.isSprinting ? "run" : "walk") : "idle"
        );
      }
    }
    // Handle other finished animations if needed
  }

  performAttack(): void {
    const range = 2.0;
    const damage = this.userData.isPlayer ? 10 : 5; // Player deals more damage
    if (!this.mesh || !this.scene || !this.game) return;

    const rayOrigin = this.mesh.position
      .clone()
      .add(new Vector3(0, CHARACTER_HEIGHT / 2, 0));
    const rayDirection = this.mesh.getWorldDirection(new Vector3());
    this.rayCaster.set(rayOrigin, rayDirection);
    this.rayCaster.far = range;

    const potentialTargets = this.game.entities.filter(
      (entity): entity is Character =>
        entity instanceof Character &&
        entity !== this &&
        !entity.isDead &&
        entity.mesh !== null
    );
    const targetMeshes = potentialTargets.map((char) => char.mesh!);
    const intersects = this.rayCaster.intersectObjects(targetMeshes, true);

    if (intersects.length > 0) {
      // Find the actual Character instance from the intersected mesh part
      let hitObject = intersects[0].object;
      let targetEntity: Character | null = null;
      while (hitObject && !targetEntity) {
        if (hitObject.userData?.entityReference instanceof Character) {
          targetEntity = hitObject.userData.entityReference;
        }
        hitObject = hitObject.parent!;
      }

      if (targetEntity && targetEntity !== this && !targetEntity.isDead) {
        targetEntity.takeDamage(damage, this);
        this.game.spawnParticleEffect(intersects[0].point, "red");
      }
    }
  }

  selfHeal(): void {
    if (
      this.isDead ||
      this.isPerformingAction ||
      this.health >= this.maxHealth
    ) {
      if (this.health >= this.maxHealth)
        this.game?.logEvent(
          this,
          "heal_fail",
          `${this.name} is already at full health.`,
          undefined,
          {},
          this.mesh!.position
        );
      return;
    }

    const healAmount = 25;
    const actualHeal = Math.min(healAmount, this.maxHealth - this.health);

    if (actualHeal > 0) {
      this.heal(actualHeal); // Apply heal
      this.game?.logEvent(
        this,
        "self_heal",
        `${this.name} healed for ${actualHeal} health.`,
        undefined,
        { amount: actualHeal },
        this.mesh!.position
      );
      this.game?.spawnParticleEffect(
        this.mesh!.position.clone().add(
          new Vector3(0, CHARACTER_HEIGHT / 2, 0)
        ),
        "green"
      );
      this.triggerAction("heal"); // Trigger animation (uses attack slot)
    }
  }

  handleStamina(deltaTime: number): void {
    const isMoving = this.moveState.forward !== 0 || this.moveState.right !== 0;
    this.isSprinting =
      this.moveState.sprint &&
      isMoving &&
      !this.isExhausted &&
      this.stamina > 0;

    if (this.isSprinting) {
      this.stamina -= this.staminaDrainRate * deltaTime;
      if (this.stamina <= 0) {
        this.stamina = 0;
        this.isExhausted = true;
        this.isSprinting = false;
        this.game?.logEvent(
          this,
          "exhausted",
          `${this.name} is exhausted!`,
          undefined,
          {},
          this.mesh!.position
        );
      }
    } else {
      let regenRate = this.staminaRegenRate;
      if (this.isExhausted) {
        regenRate /= 2; // Slower regen when exhausted
        if (this.stamina >= this.exhaustionThreshold) {
          this.isExhausted = false;
          this.game?.logEvent(
            this,
            "recovered",
            `${this.name} feels recovered.`,
            undefined,
            {},
            this.mesh!.position
          );
        }
      }
      this.stamina = Math.min(
        this.maxStamina,
        this.stamina + regenRate * deltaTime
      );
    }
  }

  handleMovement(deltaTime: number): void {
    if (!this.mesh) return;
    const forward = new Vector3(0, 0, 1).applyQuaternion(this.mesh.quaternion);
    const right = new Vector3(1, 0, 0).applyQuaternion(this.mesh.quaternion);
    const moveDirection = new Vector3(
      this.moveState.right,
      0,
      this.moveState.forward
    ).normalize();
    const moveVelocity = new Vector3();

    if (moveDirection.lengthSq() > 0) {
      moveVelocity
        .addScaledVector(forward, moveDirection.z)
        .addScaledVector(right, moveDirection.x);
      const currentSpeed = this.isSprinting ? this.runSpeed : this.walkSpeed;
      moveVelocity.normalize().multiplyScalar(currentSpeed);
    }

    this.velocity.x = moveVelocity.x;
    this.velocity.z = moveVelocity.z;

    // Handle Jump
    if (
      this.moveState.jump &&
      this.canJump &&
      this.stamina >= this.staminaJumpCost
    ) {
      this.velocity.y = this.jumpForce;
      this.stamina -= this.staminaJumpCost;
      this.canJump = false;
      this.isOnGround = false;
      if (this.stamina <= 0 && !this.isExhausted) {
        this.isExhausted = true;
        this.game?.logEvent(
          this,
          "exhausted",
          `${this.name} is exhausted!`,
          undefined,
          {},
          this.mesh.position
        );
      }
      this.moveState.jump = false; // Consume jump input
      this.switchAction("jump");
      this.game?.logEvent(
        this,
        "jump",
        `${this.name} jumped.`,
        undefined,
        {},
        this.mesh.position
      );
    }
  }

  applyGravity(deltaTime: number): void {
    if (!this.isOnGround) {
      this.velocity.y += this.gravity * deltaTime;
    } else {
      this.velocity.y = Math.max(0, this.velocity.y + this.gravity * deltaTime); // Prevent sinking through floor
    }
  }

  checkGround(collidables: Object3D[]): void {
    if (!this.mesh) return;
    this.groundCheckOrigin.copy(this.mesh.position).add(new Vector3(0, 0.1, 0)); // Start slightly above feet
    const rayLength = this.groundCheckDistance + 0.1; // Check slightly below feet
    this.rayCaster.set(this.groundCheckOrigin, this.groundCheckDirection);
    this.rayCaster.far = rayLength;
    this.rayCaster.near = 0;

    const checkAgainst = collidables.filter(
      (obj) => obj !== this.mesh && obj?.userData?.isCollidable
    );
    this.rayCaster.camera = this.game?.camera!;
    const intersects = this.rayCaster.intersectObjects(checkAgainst, true);

    let foundGround = false;
    let groundY = -Infinity;
    if (intersects.length > 0) {
      // Find the highest intersection point that's below or very close to the character's feet
      for (const intersect of intersects) {
        if (intersect.point.y <= this.mesh.position.y + 0.01) {
          // Allow slight tolerance
          groundY = Math.max(groundY, intersect.point.y);
          foundGround = true;
        }
      }
    }

    if (foundGround && this.velocity.y <= 0) {
      // Only ground if moving down or still
      if (!this.isOnGround) {
        // Landed
        this.mesh.position.y = groundY; // Snap to ground
        this.velocity.y = 0;
        this.isOnGround = true;
        this.canJump = true;
      } else {
        // Ensure character stays on ground if already grounded
        this.mesh.position.y = Math.max(this.mesh.position.y, groundY);
      }
    } else {
      // In air
      this.isOnGround = false;
      this.canJump = false;
    }
  }

  updateAnimations(deltaTime: number): void {
    this.mixer.update(deltaTime);

    // Don't change animation if performing a specific action (attack/heal/jump)
    if (
      this.isPerformingAction ||
      (this.animations.jump && this.animations.jump.isRunning())
    ) {
      return;
    }

    // Handle gathering animation loop
    if (this.isGathering && this.animations.attack) {
      this.gatherAttackTimer += deltaTime;
      if (this.gatherAttackTimer >= this.gatherAttackInterval) {
        this.animations.attack.reset().play(); // Play attack anim periodically
        this.gatherAttackTimer = 0;
      }
      // Ensure idle/walk isn't playing over gather attack
      if (
        this.currentActionName !== "attack" &&
        !this.animations.attack.isRunning()
      ) {
        this.switchAction("idle"); // Default to idle between gather swings
      }
      return; // Don't override with movement anims while gathering
    }

    // Handle movement animations
    if (!this.isOnGround) {
      // In air - could play a falling animation if available, otherwise idle/jump
      if (!this.animations.jump?.isRunning()) {
        // Don't override jump anim
        this.switchAction("idle"); // Default air anim
      }
    } else {
      // On ground
      const isMoving =
        Math.abs(this.moveState.forward) > 0.1 ||
        Math.abs(this.moveState.right) > 0.1;
      if (isMoving) {
        this.switchAction(this.isSprinting ? "run" : "walk");
      } else {
        this.switchAction("idle");
      }
    }
  }

  triggerAction(actionType: string): void {
    const actionAnim = this.animations.attack; // Use attack animation for attack, heal, gather feedback

    if (actionAnim && !this.isPerformingAction && !this.isGathering) {
      this.actionType = actionType;
      this.isPerformingAction = true;
      actionAnim.reset().play();

      // Immediately stop movement animations
      if (this.animations.idle?.isRunning()) this.animations.idle.stop();
      if (this.animations.walk?.isRunning()) this.animations.walk.stop();
      if (this.animations.run?.isRunning()) this.animations.run.stop();
      this.currentActionName = "attack"; // Reflect the action being played

      // Perform action logic *after* animation finishes (handled in onAnimationFinished)
      // Or immediately for some actions? Heal is immediate, attack is on finish.
      if (actionType === "heal") {
        // Heal logic is already applied in selfHeal before calling triggerAction
      } else if (actionType === "attack") {
        // Attack logic (damage dealing) happens in onAnimationFinished
        // This ensures the attack visually connects before damage is applied.
      }
    } else if (actionType === "gather" && actionAnim) {
      // Special handling for gather start - animation loop managed in updateAnimations
      this.actionType = actionType;
      // Don't set isPerformingAction = true for gather, as it's a looping state
    }
  }

  update(deltaTime: number, options: UpdateOptions = {}): void {
    if (this.isDead || !this.mesh) return;

    const { moveState, collidables } = options;
    if (!moveState || !collidables) {
      // console.warn(`Missing moveState or collidables for ${this.name} update`);
      return; // Don't update if essential options are missing
    }
    this.moveState = moveState;

    this.handleStamina(deltaTime);

    // Only allow movement if not performing a blocking action (attack/heal)
    // Gathering allows movement cancellation but doesn't block input processing here
    if (!this.isPerformingAction) {
      this.handleMovement(deltaTime);
    } else {
      // Stop horizontal movement during attack/heal animation
      this.velocity.x = 0;
      this.velocity.z = 0;
    }

    this.applyGravity(deltaTime);

    // Apply velocity (position update handled by Physics system for collision resolution)
    // Store intended movement for Physics system
    // Note: Physics system will directly modify mesh.position based on collisions

    // Check ground state *before* potential collision adjustments
    this.checkGround(collidables);

    // Handle attack trigger
    if (
      moveState.attack &&
      !this.attackTriggered &&
      !this.isPerformingAction &&
      !this.isGathering
    ) {
      this.attackTriggered = true;
      this.triggerAction("attack");
    } else if (!moveState.attack) {
      this.attackTriggered = false;
    }

    this.updateAnimations(deltaTime);
    this.updateBoundingBox(); // Update BB after potential position changes
  }

  die(attacker: Entity): void {
    if (this.isDead) return;
    super.die(attacker); // Call base Entity die method
    if (this.aiController) this.aiController.aiState = "dead";
    this.isGathering = false;
    this.isPerformingAction = false;
    this.actionType = "none";
    // Stop all animations
    this.mixer.stopAllAction();
    // Could play a death animation here if available
    // this.switchAction('death');

    this.game?.logEvent(
      this,
      "death",
      `${this.name} has died!`,
      attacker.id,
      attacker ? { killedBy: attacker.name } : {},
      this.mesh!.position
    );
    if (attacker instanceof Character) {
      this.game?.logEvent(
        attacker,
        "defeat",
        `${attacker.name} defeated ${this.name}.`,
        this,
        {},
        attacker.mesh!.position
      );
    }
  }

  respawn(position: Vector3): void {
    this.setPosition(position);
    this.health = this.maxHealth * 0.75; // Respawn with partial health
    this.stamina = this.maxStamina;
    this.velocity.set(0, 0, 0);
    this.isDead = false;
    this.isExhausted = false;
    this.isOnGround = false; // Recalculate ground state
    this.canJump = false;
    this.isGathering = false;
    this.gatherAttackTimer = 0;
    this.isPerformingAction = false;
    this.actionType = "none";
    this.attackTriggered = false;
    this.userData.isCollidable = true;
    this.userData.isInteractable = true;

    if (this.aiController) {
      this.aiController.resetActionState(); // Reset AI state fully
    }

    this.mixer.stopAllAction();
    this.switchAction("idle"); // Start idle animation

    this.game?.logEvent(
      this,
      "respawn",
      `${this.name} respawned.`,
      undefined,
      {},
      position
    );
    this.updateBoundingBox();
  }

  interact(player: Character): InteractionResult | null {
    if (this.isDead)
      return { type: "message", message: "Cannot interact with the deceased." };
    this.lookAt(player.mesh!.position);
    this.game?.logEvent(
      player,
      "interact_start",
      `Started interacting with ${this.name}.`,
      this,
      {},
      player.mesh!.position
    );
    return { type: "chat" }; // Always trigger chat for NPCs
  }
}

// =============================================================================
// World Generation & Objects
// =============================================================================

function createTerrain(
  size: number,
  segments: number = TERRAIN_SEGMENTS
): Mesh {
  const simplex = new SimplexNoise();
  const geometry = new PlaneGeometry(size, size, segments, segments);
  const vertices = geometry.attributes.position.array as Float32Array;
  const noiseStrength = 16;
  const noiseScale = 0.005;
  const flattenRadius = 240; // Keep flattening near center
  const flattenStrength = 0.1;

  for (let i = 0; i < vertices.length / 3; i++) {
    const index = i * 3;
    const x = vertices[index];
    const y = vertices[index + 1];
    let z = simplex.noise(x * noiseScale, y * noiseScale) * noiseStrength;
    // Flatten center area
    const distToCenter = Math.sqrt(x * x + y * y);
    if (distToCenter < flattenRadius) {
      const flattenFactor = 1.0 - smoothstep(0, flattenRadius, distToCenter);
      z = MathUtils.lerp(z, z * (1.0 - flattenStrength), flattenFactor);
    }
    vertices[index + 2] = z;
  }
  geometry.attributes.position.needsUpdate = true;
  geometry.rotateX(-Math.PI / 2); // Rotate to be flat on XZ plane
  geometry.computeVertexNormals();
  geometry.computeBoundingBox(); // Needed for physics/raycasting

  const material = new MeshLambertMaterial({ color: Colors.TERRAIN });
  const terrainMesh = new Mesh(geometry, material);
  terrainMesh.receiveShadow = true;
  terrainMesh.name = "Terrain";
  terrainMesh.userData = { isTerrain: true, isCollidable: true }; // Mark as terrain and collidable
  return terrainMesh;
}

function setupLighting(scene: Scene): void {
  scene.add(new AmbientLight(0xadc1d4, 0.6));

  const dirLight = new DirectionalLight(0xfff5e1, 0.9);
  dirLight.position.set(150, 200, 100);
  dirLight.castShadow = true;
  dirLight.shadow.mapSize.width = 1024;
  dirLight.shadow.mapSize.height = 1024;
  dirLight.shadow.camera.near = 10;
  dirLight.shadow.camera.far = 500;
  const shadowCamSize = 150;
  dirLight.shadow.camera.left = -shadowCamSize;
  dirLight.shadow.camera.right = shadowCamSize;
  dirLight.shadow.camera.top = shadowCamSize;
  dirLight.shadow.camera.bottom = -shadowCamSize;
  dirLight.shadow.bias = -0.001;
  scene.add(dirLight);
  scene.add(dirLight.target); // Target defaults to (0,0,0)

  scene.add(new HemisphereLight(Colors.BACKGROUND, Colors.PASTEL_GREEN, 0.3));
}

// --- Simple Object Creation ---
const treeTrunkMat = new MeshLambertMaterial({ color: Colors.PASTEL_BROWN });
const treeFoliageMat = new MeshLambertMaterial({ color: Colors.PASTEL_GREEN });
const rockMat = new MeshLambertMaterial({ color: Colors.PASTEL_GRAY });
const herbMat = new MeshLambertMaterial({ color: Colors.FOREST_GREEN });

function createWorldObject(
  name: string,
  geometry: BufferGeometry,
  material: Material | Material[],
  options: Partial<EntityUserData> & {
    scale?: number | Vector3;
    rotation?: Vector3;
  } = {}
): Group {
  const group = new Group();
  group.name = name;
  const mesh = new Mesh(geometry, material);
  mesh.castShadow = true;
  mesh.receiveShadow = true;

  if (options.scale) {
    if (typeof options.scale === "number") group.scale.setScalar(options.scale);
    else group.scale.copy(options.scale);
  }
  if (options.rotation)
    group.rotation.set(
      options.rotation.x,
      options.rotation.y,
      options.rotation.z
    );

  group.add(mesh);

  // Assign UserData
  group.userData = {
    id: `${name}_${getNextEntityId()}`,
    isCollidable: options.isCollidable ?? false,
    isInteractable: options.isInteractable ?? false,
    interactionType: options.interactionType,
    resource: options.resource,
    gatherTime: options.gatherTime,
    prompt: options.prompt,
    isDepletable: options.isDepletable,
    respawnTime: options.respawnTime,
    entityReference: group, // Reference to the group itself
    isSimpleObject: true, // Mark as simple object
    ...options, // Spread any other custom data
  };
  group.userData.boundingBox = new Box3().setFromObject(group); // Compute initial bounding box

  return group;
}

function createTree(): Group {
  const trunkHeight = randomFloat(3, 5);
  const trunkRadius = randomFloat(0.3, 0.5);
  const foliageHeight = trunkHeight * 1.2 + randomFloat(0, 1);
  const foliageRadius = trunkRadius * 3 + randomFloat(0, 1.5);

  const treeGroup = new Group();
  treeGroup.name = "Tree";

  const trunkGeo = new CylinderGeometry(
    trunkRadius * 0.8,
    trunkRadius,
    trunkHeight,
    8
  );
  const trunkMesh = new Mesh(trunkGeo, treeTrunkMat);
  trunkMesh.position.y = trunkHeight / 2;
  trunkMesh.castShadow = true;
  trunkMesh.receiveShadow = true;
  treeGroup.add(trunkMesh);

  const foliageGeo = new ConeGeometry(foliageRadius, foliageHeight, 6);
  const foliageMesh = new Mesh(foliageGeo, treeFoliageMat);
  foliageMesh.position.y = trunkHeight + foliageHeight / 3;
  foliageMesh.castShadow = true;
  treeGroup.add(foliageMesh);

  treeGroup.userData = {
    id: `Tree_${getNextEntityId()}`,
    isCollidable: true,
    isInteractable: true,
    interactionType: "gather",
    resource: "wood",
    gatherTime: 3000,
    prompt: "Gather Wood",
    isDepletable: true,
    respawnTime: 20000,
    entityReference: treeGroup,
    isSimpleObject: true,
  };
  treeGroup.userData.boundingBox = new Box3().setFromObject(treeGroup);
  return treeGroup;
}

function createRock(size: number): Group {
  const height = size * randomFloat(0.5, 1.0);
  const geo = new BoxGeometry(size, height, size * randomFloat(0.8, 1.2));
  const group = createWorldObject("Rock", geo, rockMat, {
    isCollidable: true,
    isInteractable: true,
    interactionType: "gather",
    resource: "stone",
    gatherTime: 4000,
    prompt: "Gather Stone",
    isDepletable: true,
    respawnTime: 30000,
    rotation: new Vector3(
      randomFloat(-0.1, 0.1) * Math.PI,
      randomFloat(0, 2) * Math.PI,
      randomFloat(-0.1, 0.1) * Math.PI
    ),
  });
  group.position.y = height / 2; // Adjust position based on geometry center
  return group;
}

function createHerb(): Group {
  const size = 0.25;
  const geo = new SphereGeometry(size, 5, 4);
  const group = createWorldObject("Herb Plant", geo, herbMat, {
    isCollidable: false, // Herbs shouldn't block movement
    isInteractable: true,
    interactionType: "gather",
    resource: "herb",
    gatherTime: 1500,
    prompt: "Gather Herb",
    isDepletable: true,
    respawnTime: 15000,
    castShadow: true,
  });
  group.position.y = size; // Position above ground
  return group;
}

function populateEnvironment(
  scene: Scene,
  worldSize: number,
  collidableObjects: Object3D[],
  interactableObjects: Array<any>,
  entities: Array<any>,
  models: Record<string, { scene: Group; animations: AnimationClip[] }>,
  gameInstance: Game
): void {
  const halfSize = worldSize / 2;
  const villageCenter = new Vector3(5, 0, 10); // Keep village center

  // --- Add Characters ---
  const addCharacter = (
    pos: Vector3,
    name: string,
    modelKey: string,
    persona: string
  ): Character => {
    const model = models[modelKey];
    const charInventory = new Inventory(9); // NPCs get a small inventory
    const character = new Character(
      scene,
      pos,
      name,
      model.scene.clone(),
      model.animations,
      charInventory
    );
    character.game = gameInstance; // Link character to game
    character.persona = persona;
    if (character.aiController) character.aiController.persona = persona; // Sync persona to AI

    character.mesh!.position.y = getTerrainHeight(scene, pos.x, pos.z); // Place on terrain
    entities.push(character);
    collidableObjects.push(character.mesh!);
    interactableObjects.push(character);
    character.initNameDisplay(); // Show name tag for NPCs
    character.initIntentDisplay(); // Show intent bubble
    return character;
  };

  addCharacter(
    villageCenter.clone().add(new Vector3(-12, 0, 2)),
    "Farmer Giles",
    "tavernMan",
    "Hardworking farmer, values community, knowledgeable about crops, a bit stubborn."
  );
  addCharacter(
    villageCenter.clone().add(new Vector3(10, 0, -3)),
    "Blacksmith Brynn",
    "woman",
    "Skilled artisan, proud, strong-willed, independent, focused on craft, gruff but kind."
  );
  addCharacter(
    new Vector3(halfSize * 0.4, 0, -halfSize * 0.3), // Hunter further out
    "Hunter Rex",
    "oldMan",
    "Experienced tracker, quiet, observant, prefers wilderness, resourceful, not very social."
  );

  // --- Add Objects ---
  const addObject = (
    creator: (...args: any[]) => Group,
    count: number,
    minDistSq: number,
    ...args: any[]
  ) => {
    let added = 0;
    let attempts = 0;
    const maxAttempts = count * 5; // Prevent infinite loop

    while (added < count && attempts < maxAttempts) {
      attempts++;
      const x = randomFloat(-halfSize * 0.95, halfSize * 0.95);
      const z = randomFloat(-halfSize * 0.95, halfSize * 0.95);
      const distSq = (x - villageCenter.x) ** 2 + (z - villageCenter.z) ** 2;

      // Place away from village center based on minDistSq
      if (distSq < minDistSq) continue;

      const obj = creator(...args);
      const height = getTerrainHeight(scene, x, z);
      obj.position.set(x, height, z);

      // Adjust Y position for specific objects if needed
      if (obj.name === "Herb Plant") obj.position.y += 0.1;
      if (obj.name === "Rock")
        obj.position.y +=
          (obj.userData.boundingBox?.getSize(new Vector3()).y ?? 0) / 2; // Place rock bottom on terrain

      scene.add(obj);
      entities.push(obj); // Add simple objects to entities list for minimap etc.
      if (obj.userData.isCollidable) collidableObjects.push(obj);
      if (obj.userData.isInteractable) interactableObjects.push(obj);
      added++;
    }
    if (added < count)
      console.warn(`Could only place ${added}/${count} of ${creator.name}`);
  };

  addObject(createTree, 100, 25 * 25);
  addObject(() => createRock(randomFloat(1, 2.5)), 50, 20 * 20); // Pass size arg
  addObject(createHerb, 30, 10 * 10);
}

function createWorldBoundary(
  scene: Scene,
  worldSize: number,
  collidableObjects: Object3D[]
): void {
  const thickness = 20; // Make boundaries thick
  const height = 100; // Make boundaries high
  const halfSize = worldSize / 2;
  const boundaryMaterial = new MeshBasicMaterial({
    visible: false,
    side: DoubleSide,
  }); // Invisible

  const createWall = (
    px: number,
    pz: number,
    sx: number,
    sz: number,
    name: string
  ) => {
    const wallGeo = new BoxGeometry(sx, height, sz);
    const wallMesh = new Mesh(wallGeo, boundaryMaterial);
    wallMesh.position.set(px, height / 2, pz); // Center vertically
    wallMesh.name = name;
    wallMesh.userData = { isCollidable: true };
    wallMesh.geometry.computeBoundingBox(); // Compute local bounding box
    wallMesh.updateMatrixWorld(true); // Ensure world matrix is up-to-date
    // Store world bounding box in userData for easier access in collision checks
    wallMesh.userData.boundingBox = wallMesh.geometry
      .boundingBox!.clone()
      .applyMatrix4(wallMesh.matrixWorld);
    scene.add(wallMesh);
    collidableObjects.push(wallMesh);
  };

  // Create walls slightly outside the worldSize
  createWall(
    halfSize + thickness / 2,
    0,
    thickness,
    worldSize + thickness * 2,
    "Boundary+X"
  );
  createWall(
    -halfSize - thickness / 2,
    0,
    thickness,
    worldSize + thickness * 2,
    "Boundary-X"
  );
  createWall(
    0,
    halfSize + thickness / 2,
    worldSize + thickness * 2,
    thickness,
    "Boundary+Z"
  );
  createWall(
    0,
    -halfSize - thickness / 2,
    worldSize + thickness * 2,
    thickness,
    "Boundary-Z"
  );
}

// =============================================================================
// Input & Controls
// =============================================================================

class ThirdPersonCamera {
  camera: PerspectiveCamera;
  target: Object3D;
  idealOffset: Vector3 = new Vector3(0, 2.5, -2.5); // Closer default offset
  minOffsetDistance: number = 1.5;
  maxOffsetDistance: number = 12.0;
  pitchAngle: number = 0.15; // Initial downward tilt
  minPitch: number = -Math.PI / 3; // Limit looking down
  maxPitch: number = Math.PI / 2.5; // Limit looking up
  pitchSensitivity: number = 0.0025;
  lerpAlphaPositionBase: number = 0.05; // Smoothing factor for position
  lerpAlphaLookatBase: number = 0.1; // Smoothing factor for lookat point
  collisionRaycaster: Raycaster;
  collisionOffset: number = 0.3; // Push camera slightly away from collision point
  currentPosition: Vector3;
  currentLookat: Vector3;

  private targetPosition = new Vector3();
  private offset = new Vector3();
  private idealPosition = new Vector3();
  private finalPosition = new Vector3();
  private idealLookat = new Vector3();
  private rayOrigin = new Vector3();
  private cameraDirection = new Vector3();

  constructor(camera: PerspectiveCamera, target: Object3D) {
    this.camera = camera;
    this.target = target;
    this.collisionRaycaster = new Raycaster();
    this.collisionRaycaster.camera = camera;
    this.currentPosition = new Vector3();
    this.currentLookat = new Vector3();
    this.target.getWorldPosition(this.currentLookat);
    this.currentLookat.y += (target.userData?.height ?? CHARACTER_HEIGHT) * 0.6; // Look slightly above target center
    this.update(0.016, []); // Initial positioning
    this.camera.position.copy(this.currentPosition);
    this.camera.lookAt(this.currentLookat);
  }

  handleMouseInput(deltaX: number, deltaY: number): void {
    // Yaw (deltaX) is handled by rotating the player character directly in Controls
    // Update pitch based on deltaY
    this.pitchAngle -= deltaY * this.pitchSensitivity;
    this.pitchAngle = MathUtils.clamp(
      this.pitchAngle,
      this.minPitch,
      this.maxPitch
    );
  }

  update(deltaTime: number, collidables: Object3D[]): void {
    if (!this.target?.parent) return; // Target might have been removed

    this.target.getWorldPosition(this.targetPosition);
    const targetQuaternion = this.target.quaternion;

    // Calculate ideal camera position based on target rotation and pitch
    this.offset
      .copy(this.idealOffset)
      .applyAxisAngle(new Vector3(1, 0, 0), this.pitchAngle) // Apply pitch rotation
      .applyQuaternion(targetQuaternion); // Apply target's yaw rotation
    this.idealPosition.copy(this.targetPosition).add(this.offset);

    // Collision detection
    this.cameraDirection.copy(this.idealPosition).sub(this.targetPosition);
    let idealDistance = this.cameraDirection.length();
    this.cameraDirection.normalize();

    // Raycast from near the target towards the ideal camera position
    this.rayOrigin
      .copy(this.targetPosition)
      .addScaledVector(this.cameraDirection, 0.2); // Start ray slightly away from target center
    this.collisionRaycaster.set(this.rayOrigin, this.cameraDirection);
    this.collisionRaycaster.far = Math.max(0, idealDistance - 0.2); // Don't check beyond ideal position

    const collisionCheckObjects = collidables.filter(
      (obj) => obj !== this.target && obj?.userData?.isCollidable
    );
    const intersects = this.collisionRaycaster.intersectObjects(
      collisionCheckObjects,
      true
    );

    let actualDistance = idealDistance;
    if (intersects.length > 0) {
      // Find the closest collision point
      const closestHitDist = intersects.reduce(
        (minDist, i) => Math.min(minDist, i.distance),
        idealDistance
      );
      actualDistance = Math.max(
        this.minOffsetDistance,
        closestHitDist + 0.2 - this.collisionOffset
      ); // Adjust distance based on hit, ensure minimum offset
    }

    // Clamp final distance
    actualDistance = MathUtils.clamp(
      actualDistance,
      this.minOffsetDistance,
      this.maxOffsetDistance
    );
    this.finalPosition
      .copy(this.targetPosition)
      .addScaledVector(this.cameraDirection, actualDistance);

    // Calculate ideal lookat point (slightly above target center)
    const targetHeight = this.target.userData?.height ?? CHARACTER_HEIGHT;
    this.idealLookat
      .copy(this.targetPosition)
      .add(new Vector3(0, targetHeight * 0.6, 0));

    // Smoothly interpolate camera position and lookat point
    smoothVectorLerp(
      this.currentPosition,
      this.finalPosition,
      this.lerpAlphaPositionBase,
      deltaTime
    );
    smoothVectorLerp(
      this.currentLookat,
      this.idealLookat,
      this.lerpAlphaLookatBase,
      deltaTime
    );

    // Apply final position and lookat
    this.camera.position.copy(this.currentPosition);
    this.camera.lookAt(this.currentLookat);
  }
}

class Controls {
  player: Character | null;
  cameraController: ThirdPersonCamera | null;
  domElement: HTMLElement;
  game: Game; // Required reference
  keys: KeyState = {};
  mouse: MouseState = { x: 0, y: 0, dx: 0, dy: 0, buttons: {} };
  isPointerLocked: boolean = false;
  playerRotationSensitivity: number = 0.0025;
  moveState: MoveState = {
    forward: 0,
    right: 0,
    jump: false,
    sprint: false,
    interact: false,
    attack: false,
  };
  keyDownListeners: Record<string, Array<() => void>> = {};
  mouseClickListeners: Record<number, Array<(event: MouseEvent) => void>> = {};

  // Bound event handlers for cleanup
  private boundOnKeyDown: (event: KeyboardEvent) => void;
  private boundOnKeyUp: (event: KeyboardEvent) => void;
  private boundOnMouseDown: (event: MouseEvent) => void;
  private boundOnMouseUp: (event: MouseEvent) => void;
  private boundOnMouseMove: (event: MouseEvent) => void;
  private boundOnClick: (event: MouseEvent) => void;
  private boundOnPointerLockChange: () => void;
  private boundOnPointerLockError: () => void;
  private boundHandleEscape: (event: KeyboardEvent) => void;

  constructor(
    player: Character | null,
    cameraController: ThirdPersonCamera | null,
    domElement: HTMLElement,
    game: Game
  ) {
    this.player = player;
    this.cameraController = cameraController;
    this.domElement = domElement;
    this.game = game;

    // Bind methods
    this.boundOnKeyDown = this.onKeyDown.bind(this);
    this.boundOnKeyUp = this.onKeyUp.bind(this);
    this.boundOnMouseDown = this.onMouseDown.bind(this);
    this.boundOnMouseUp = this.onMouseUp.bind(this);
    this.boundOnMouseMove = this.onMouseMove.bind(this);
    this.boundOnClick = this.onClick.bind(this);
    this.boundOnPointerLockChange = this.onPointerLockChange.bind(this);
    this.boundOnPointerLockError = this.onPointerLockError.bind(this);
    this.boundHandleEscape = (e) => {
      if (e.code === "Escape") this.handleEscapeKey();
    };

    this.initListeners();
  }

  initListeners(): void {
    // Always listen for Escape key
    document.addEventListener("keydown", this.boundHandleEscape, false);

    // Add other listeners only if not on mobile
    if (!this.game.mobileControls?.isActive()) {
      document.addEventListener("keydown", this.boundOnKeyDown, false);
      document.addEventListener("keyup", this.boundOnKeyUp, false);
      document.addEventListener("mousedown", this.boundOnMouseDown, false);
      document.addEventListener("mouseup", this.boundOnMouseUp, false);
      document.addEventListener("mousemove", this.boundOnMouseMove, false);
      this.domElement.addEventListener("click", this.boundOnClick, false);
      document.addEventListener(
        "pointerlockchange",
        this.boundOnPointerLockChange,
        false
      );
      document.addEventListener(
        "pointerlockerror",
        this.boundOnPointerLockError,
        false
      );
    }
  }

  addKeyDownListener(keyCode: string, callback: () => void): void {
    if (!this.keyDownListeners[keyCode]) this.keyDownListeners[keyCode] = [];
    this.keyDownListeners[keyCode].push(callback);
  }

  addMouseClickListener(
    buttonIndex: number,
    callback: (event: MouseEvent) => void
  ): void {
    if (!this.mouseClickListeners[buttonIndex])
      this.mouseClickListeners[buttonIndex] = [];
    this.mouseClickListeners[buttonIndex].push(callback);
  }

  lockPointer(): void {
    if (
      !this.game.mobileControls?.isActive() &&
      document.pointerLockElement !== this.domElement
    ) {
      this.domElement.requestPointerLock();
    }
  }

  unlockPointer(): void {
    if (
      !this.game.mobileControls?.isActive() &&
      document.pointerLockElement === this.domElement
    ) {
      document.exitPointerLock();
    }
  }

  onPointerLockChange(): void {
    if (document.pointerLockElement === this.domElement) {
      this.isPointerLocked = true;
      document.body.classList.add("pointer-locked");
      this.mouse.dx = 0;
      this.mouse.dy = 0; // Reset delta on lock
      // Try to unpause if no UI is open
      if (!this.game.isUIBlockingGameplay()) {
        this.game.setPauseState(false);
      }
    } else {
      this.isPointerLocked = false;
      document.body.classList.remove("pointer-locked");
      this.keys = {}; // Reset keys on unlock
      this.mouse.buttons = {};
      this.mouse.dx = 0;
      this.mouse.dy = 0;
      this.updateContinuousMoveState(); // Reset movement state
      // Pause if no UI is open
      if (!this.game.isUIBlockingGameplay()) {
        this.game.setPauseState(true);
      }
    }
  }

  onPointerLockError(): void {
    console.error("Pointer lock failed.");
    this.isPointerLocked = false;
    document.body.classList.remove("pointer-locked");
  }

  onKeyDown(event: KeyboardEvent): void {
    // Handled by initListeners check
    const keyCode = event.code;
    if (this.game.interactionSystem?.isChatOpen || this.keys[keyCode]) return; // Ignore if chatting or key already down

    this.keys[keyCode] = true;
    this.keyDownListeners[keyCode]?.forEach((cb) => cb());

    if (keyCode === "Space") this.moveState.jump = true;
    if (keyCode === "KeyE") this.moveState.interact = true;
    if (keyCode === "KeyF") this.moveState.attack = true;

    this.updateContinuousMoveState();
  }

  onKeyUp(event: KeyboardEvent): void {
    // Handled by initListeners check
    const keyCode = event.code;
    this.keys[keyCode] = false;
    if (keyCode === "KeyF") this.moveState.attack = false;
    // Jump and Interact are consumed, not reset on keyup
    this.updateContinuousMoveState();
  }

  handleEscapeKey(): void {
    if (this.game.interactionSystem?.isChatOpen) {
      this.game.interactionSystem.closeChatInterface();
    } else if (this.game.inventoryDisplay?.isOpen) {
      this.game.inventoryDisplay.hide();
      this.game.setPauseState(false);
    } else if (this.game.journalDisplay?.isOpen) {
      this.game.journalDisplay.hide();
      this.game.setPauseState(false);
    } else if (this.isPointerLocked) {
      this.unlockPointer();
    }
  }

  onMouseDown(event: MouseEvent): void {
    // Handled by initListeners check
    if (this.game.interactionSystem?.isChatOpen) return;
    this.mouse.buttons[event.button] = true;
    this.mouseClickListeners[event.button]?.forEach((cb) => cb(event));
  }

  onMouseUp(event: MouseEvent): void {
    // Handled by initListeners check
    this.mouse.buttons[event.button] = false;
  }

  onMouseMove(event: MouseEvent): void {
    // Handled by initListeners check
    if (this.isPointerLocked) {
      this.mouse.dx += event.movementX ?? 0;
      this.mouse.dy += event.movementY ?? 0;
    } else {
      this.mouse.x = event.clientX;
      this.mouse.y = event.clientY;
    }
  }

  onClick(event: MouseEvent): void {
    // Handled by initListeners check
    const targetElement = event.target as HTMLElement;
    // Check if click is on the game canvas itself, not UI overlays
    const isGameCanvasClick =
      targetElement === this.domElement ||
      (this.domElement.contains(targetElement) &&
        targetElement.closest(
          "#hud, #mobile-controls-layer, #inventory-display, #journal-display, #chat-container, #minimap-canvas, #interaction-prompt, #welcome-banner"
        ) === null);

    if (
      isGameCanvasClick &&
      !this.isPointerLocked &&
      !this.game.isUIBlockingGameplay()
    ) {
      this.lockPointer();
    }
  }

  updateContinuousMoveState(): void {
    // Only update from keyboard if mobile is inactive
    if (!this.game.mobileControls?.isActive()) {
      const W = this.keys["KeyW"] || this.keys["ArrowUp"];
      const S = this.keys["KeyS"] || this.keys["ArrowDown"];
      const A = this.keys["KeyA"] || this.keys["ArrowLeft"];
      const D = this.keys["KeyD"] || this.keys["ArrowRight"];
      const Sprint = this.keys["ShiftLeft"] || this.keys["ShiftRight"];

      this.moveState.forward = (W ? 1 : 0) - (S ? 1 : 0);
      this.moveState.right = (D ? 1 : 0) - (A ? 1 : 0); // Corrected strafe
      this.moveState.sprint = Sprint ?? false;
    }
    // Mobile input directly modifies moveState.forward/right/sprint
  }

  update(deltaTime: number): void {
    // --- Rotation Update (Mouse - Desktop Only) ---
    if (
      !this.game.mobileControls?.isActive() &&
      this.isPointerLocked &&
      this.player?.mesh
    ) {
      if (Math.abs(this.mouse.dx) > 0) {
        const yawDelta = -this.mouse.dx * this.playerRotationSensitivity;
        this.player.mesh.rotateY(yawDelta);
      }
      if (this.cameraController && Math.abs(this.mouse.dy) > 0) {
        this.cameraController.handleMouseInput(this.mouse.dx, this.mouse.dy); // Pass raw deltaY
      }
    }
    this.mouse.dx = 0;
    this.mouse.dy = 0; // Reset mouse delta each frame

    // --- Keyboard Movement Update (Desktop Only) ---
    this.updateContinuousMoveState();

    // Mobile input is applied directly by MobileControls.update()
  }

  consumeInteraction(): boolean {
    if (!this.moveState.interact) return false;
    this.moveState.interact = false; // Reset after consumption
    return true;
  }

  dispose(): void {
    document.removeEventListener("keydown", this.boundHandleEscape);
    if (!this.game.mobileControls?.isActive()) {
      document.removeEventListener("keydown", this.boundOnKeyDown);
      document.removeEventListener("keyup", this.boundOnKeyUp);
      document.removeEventListener("mousedown", this.boundOnMouseDown);
      document.removeEventListener("mouseup", this.boundOnMouseUp);
      document.removeEventListener("mousemove", this.boundOnMouseMove);
      this.domElement.removeEventListener("click", this.boundOnClick);
      document.removeEventListener(
        "pointerlockchange",
        this.boundOnPointerLockChange
      );
      document.removeEventListener(
        "pointerlockerror",
        this.boundOnPointerLockError
      );
    }
    // Clear listeners
    this.keyDownListeners = {};
    this.mouseClickListeners = {};
  }
}

class MobileControls {
  private game: Game;
  private controls: Controls; // Reference to desktop controls to update moveState
  private moveManager: JoystickManager | null = null;
  private moveVector = new Vector2(0, 0);
  private cameraRotationDelta = new Vector2(0, 0);
  private isDraggingCamera: boolean = false;
  private lastTouchPosition = new Vector2(0, 0);
  private currentTouchId: number | null = null;
  private gameContainer: HTMLElement | null = null;
  private moveZoneElement: HTMLElement | null = null;
  private buttons: Record<string, HTMLElement | null> = {};
  private buttonStates: Record<string, boolean> = {
    interact: false,
    attack: false,
  }; // Track button states

  private boundHandleCameraTouchStart: (event: TouchEvent) => void;
  private boundHandleCameraTouchMove: (event: TouchEvent) => void;
  private boundHandleCameraTouchEnd: (event: TouchEvent) => void;
  private isMobileDevice: boolean;

  constructor(game: Game, controls: Controls) {
    this.game = game;
    this.controls = controls;
    this.isMobileDevice =
      "ontouchstart" in window ||
      navigator.maxTouchPoints > 0 ||
      window.innerWidth < 768;

    this.boundHandleCameraTouchStart = this.handleCameraTouchStart.bind(this);
    this.boundHandleCameraTouchMove = this.handleCameraTouchMove.bind(this);
    this.boundHandleCameraTouchEnd = this.handleCameraTouchEnd.bind(this);

    if (!this.isMobileDevice) {
      document.getElementById("mobile-controls-layer")?.classList.add("hidden");
      return;
    }

    this.gameContainer = document.getElementById("game-container");
    this.moveZoneElement = document.getElementById("joystick-zone-left");

    this.setupMoveJoystick();
    this.setupButtons();
    this.setupTouchCameraControls();
    document
      .getElementById("mobile-controls-layer")
      ?.classList.remove("hidden");
  }

  isActive(): boolean {
    return this.isMobileDevice;
  }

  private setupMoveJoystick(): void {
    if (!this.moveZoneElement) return;
    const options: JoystickManagerOptions = {
      mode: "dynamic",
      color: "rgba(255, 255, 255, 0.5)",
      fadeTime: 150,
      size: 100,
      position: { left: "50%", top: "50%" },
      zone: this.moveZoneElement,
    };
    this.moveManager = nipplejs.create(options);
    this.moveManager.on("move", (evt, nipple) => {
      if (nipple.angle && nipple.force) {
        this.moveVector.set(
          Math.cos(nipple.angle.radian) * nipple.force,
          Math.sin(nipple.angle.radian) * nipple.force
        );
      }
    });
    this.moveManager.on("end", () => this.moveVector.set(0, 0));
  }

  private setupTouchCameraControls(): void {
    if (!this.gameContainer) return;
    this.gameContainer.addEventListener(
      "touchstart",
      this.boundHandleCameraTouchStart,
      { passive: false }
    );
    this.gameContainer.addEventListener(
      "touchmove",
      this.boundHandleCameraTouchMove,
      { passive: false }
    );
    this.gameContainer.addEventListener(
      "touchend",
      this.boundHandleCameraTouchEnd,
      { passive: false }
    );
    this.gameContainer.addEventListener(
      "touchcancel",
      this.boundHandleCameraTouchEnd,
      { passive: false }
    );
  }

  private isPointInsideRect(x: number, y: number, rect: DOMRect): boolean {
    return (
      x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom
    );
  }

  private handleCameraTouchStart(event: TouchEvent): void {
    if (this.isDraggingCamera || !this.moveZoneElement) return;
    const touch = event.changedTouches[0];
    if (!touch) return;

    const touchX = touch.clientX;
    const touchY = touch.clientY;

    // Ignore touches starting in move zone or on buttons
    if (
      this.isPointInsideRect(
        touchX,
        touchY,
        this.moveZoneElement.getBoundingClientRect()
      )
    )
      return;
    for (const btnName in this.buttons) {
      if (
        this.buttons[btnName] &&
        this.isPointInsideRect(
          touchX,
          touchY,
          this.buttons[btnName]!.getBoundingClientRect()
        )
      )
        return;
    }

    event.preventDefault();
    this.isDraggingCamera = true;
    this.currentTouchId = touch.identifier;
    this.lastTouchPosition.set(touchX, touchY);
    this.cameraRotationDelta.set(0, 0);
  }

  private handleCameraTouchMove(event: TouchEvent): void {
    if (!this.isDraggingCamera || this.currentTouchId === null) return;
    let currentTouch: Touch | null = null;
    for (let i = 0; i < event.changedTouches.length; i++) {
      if (event.changedTouches[i].identifier === this.currentTouchId) {
        currentTouch = event.changedTouches[i];
        break;
      }
    }
    if (!currentTouch) return;

    event.preventDefault();
    const touchX = currentTouch.clientX;
    const touchY = currentTouch.clientY;
    this.cameraRotationDelta.x += touchX - this.lastTouchPosition.x;
    this.cameraRotationDelta.y += touchY - this.lastTouchPosition.y;
    this.lastTouchPosition.set(touchX, touchY);
  }

  private handleCameraTouchEnd(event: TouchEvent): void {
    if (!this.isDraggingCamera || this.currentTouchId === null) return;
    let touchEnded = false;
    for (let i = 0; i < event.changedTouches.length; i++) {
      if (event.changedTouches[i].identifier === this.currentTouchId) {
        touchEnded = true;
        break;
      }
    }
    if (touchEnded) {
      event.preventDefault();
      this.isDraggingCamera = false;
      this.currentTouchId = null;
      // Delta is consumed in update()
    }
  }

  private setupButtons(): void {
    const buttonIds = ["interact", "attack", "inventory", "journal"];
    buttonIds.forEach((id) => {
      this.buttons[id] = document.getElementById(`button-${id}`);
      if (!this.buttons[id])
        console.error(`Mobile button not found: button-${id}`);
    });

    // Touch listeners
    this.buttons.interact?.addEventListener(
      "touchstart",
      (e) => {
        e.preventDefault();
        this.buttonStates.interact = true;
        this.buttons.interact?.classList.add("active");
      },
      { passive: false }
    );
    this.buttons.interact?.addEventListener(
      "touchend",
      (e) => {
        e.preventDefault();
        this.buttons.interact?.classList.remove("active");
      },
      { passive: false }
    ); // State reset in update

    this.buttons.attack?.addEventListener(
      "touchstart",
      (e) => {
        e.preventDefault();
        this.buttonStates.attack = true;
        this.buttons.attack?.classList.add("active");
      },
      { passive: false }
    );
    this.buttons.attack?.addEventListener(
      "touchend",
      (e) => {
        e.preventDefault();
        this.buttonStates.attack = false;
        this.buttons.attack?.classList.remove("active");
      },
      { passive: false }
    );

    this.buttons.inventory?.addEventListener(
      "touchend",
      (e) => {
        // touchend for tap actions
        e.preventDefault();
        if (this.game.interactionSystem?.isChatOpen) return;
        this.game.journalDisplay?.hide();
        this.game.inventoryDisplay?.toggle();
        this.game.setPauseState(this.game.inventoryDisplay?.isOpen ?? false);
      },
      { passive: false }
    );

    this.buttons.journal?.addEventListener(
      "touchend",
      (e) => {
        e.preventDefault();
        if (this.game.interactionSystem?.isChatOpen) return;
        this.game.inventoryDisplay?.hide();
        this.game.journalDisplay?.toggle();
        this.game.setPauseState(this.game.journalDisplay?.isOpen ?? false);
      },
      { passive: false }
    );

    // Add active class on touchstart for visual feedback on tap buttons
    this.buttons.inventory?.addEventListener(
      "touchstart",
      (e) => {
        e.preventDefault();
        this.buttons.inventory?.classList.add("active");
      },
      { passive: false }
    );
    this.buttons.inventory?.addEventListener(
      "touchend",
      (e) => {
        e.preventDefault();
        this.buttons.inventory?.classList.remove("active");
      },
      { passive: false }
    );
    this.buttons.journal?.addEventListener(
      "touchstart",
      (e) => {
        e.preventDefault();
        this.buttons.journal?.classList.add("active");
      },
      { passive: false }
    );
    this.buttons.journal?.addEventListener(
      "touchend",
      (e) => {
        e.preventDefault();
        this.buttons.journal?.classList.remove("active");
      },
      { passive: false }
    );
  }

  update(deltaTime: number): void {
    if (!this.isActive()) return;

    // --- Update Move State from Joystick ---
    // Invert Y for forward/backward, keep X for strafe
    this.controls.moveState.forward = -this.moveVector.y;
    this.controls.moveState.right = this.moveVector.x;
    // Clamp values
    this.controls.moveState.forward = Math.max(
      -1,
      Math.min(1, this.controls.moveState.forward)
    );
    this.controls.moveState.right = Math.max(
      -1,
      Math.min(1, this.controls.moveState.right)
    );
    this.controls.moveState.sprint = false; // No sprint button for now
    this.controls.moveState.jump = false; // No jump button for now

    // --- Update Button States ---
    if (this.buttonStates.interact) {
      this.controls.moveState.interact = true;
      this.buttonStates.interact = false; // Consume the press
    } else {
      this.controls.moveState.interact = false;
    }
    this.controls.moveState.attack = this.buttonStates.attack;

    // --- Update Camera/Rotation from Touch Input ---
    const touchCameraSensitivity = 0.002; // Adjusted sensitivity for touch
    const touchPlayerRotationSensitivity = 0.0025;

    if (this.cameraRotationDelta.lengthSq() > 0) {
      if (this.controls.player?.mesh) {
        const yawDelta =
          -this.cameraRotationDelta.x * touchPlayerRotationSensitivity;
        this.controls.player.mesh.rotateY(yawDelta);
      }
      if (this.controls.cameraController) {
        const pitchDelta = this.cameraRotationDelta.y; // Pass raw deltaY
        this.controls.cameraController.handleMouseInput(0, pitchDelta); // Use existing method
      }
      this.cameraRotationDelta.set(0, 0); // Reset delta after applying
    }
  }

  destroy(): void {
    this.moveManager?.destroy();
    if (this.gameContainer) {
      this.gameContainer.removeEventListener(
        "touchstart",
        this.boundHandleCameraTouchStart
      );
      this.gameContainer.removeEventListener(
        "touchmove",
        this.boundHandleCameraTouchMove
      );
      this.gameContainer.removeEventListener(
        "touchend",
        this.boundHandleCameraTouchEnd
      );
      this.gameContainer.removeEventListener(
        "touchcancel",
        this.boundHandleCameraTouchEnd
      );
    }
    // Basic button listener removal (more robust needed if dynamically adding/removing)
    for (const btnName in this.buttons) {
      // Simplified removal - assumes listeners were added directly
      // A more robust approach would store bound listeners and remove them specifically
      const btn = this.buttons[btnName];
      if (btn) {
        // Example: btn.removeEventListener('touchstart', ...);
      }
    }
  }
}

// =============================================================================
// Physics System
// =============================================================================

class Physics {
  player: Character;
  collidableObjects: Object3D[];
  collisionCheckRadiusSq: number = 20 * 20; // Optimization: only check nearby objects

  // Reusable vectors/boxes to avoid allocations in loop
  private playerBox = new Box3();
  private objectBox = new Box3();
  private overlap = new Vector3();
  private centerPlayer = new Vector3();
  private centerObject = new Vector3();
  private sizePlayer = new Vector3();
  private sizeObject = new Vector3();
  private pushVector = new Vector3();
  private playerVelocity = new Vector3(); // Store velocity before applying
  private playerPosition = new Vector3(); // Store position before applying

  constructor(player: Character, collidableObjects: Object3D[]) {
    this.player = player;
    this.collidableObjects = collidableObjects;
  }

  update(deltaTime: number): void {
    if (this.player.isDead || !this.player.mesh) return;

    // Store current velocity and apply basic movement intention
    this.playerVelocity.copy(this.player.velocity);
    this.playerPosition.copy(this.player.mesh.position);

    // Apply intended movement based on velocity
    this.playerPosition.addScaledVector(this.playerVelocity, deltaTime);

    // Update player's bounding box based on *intended* position
    this.player.updateBoundingBox(); // Update internal BB
    this.playerBox.copy(this.player.boundingBox); // Use the updated internal BB
    this.playerBox.translate(
      this.playerPosition.clone().sub(this.player.mesh.position)
    ); // Translate BB to intended position

    const playerWorldPos = this.playerPosition; // Use intended position for proximity checks

    // Collision detection and resolution loop
    this.collidableObjects.forEach((object) => {
      if (
        !object?.parent ||
        object === this.player.mesh ||
        !object.userData?.isCollidable
      )
        return;
      // Skip dead characters
      const entityRef = object.userData?.entityReference;
      if (entityRef instanceof Character && entityRef.isDead) return;

      const objectPosition = object.getWorldPosition(this.centerObject); // Reuse centerObject vector

      // Broad phase check
      if (
        playerWorldPos.distanceToSquared(objectPosition) >
        this.collisionCheckRadiusSq
      )
        return;

      // Narrow phase check (AABB)
      // Use pre-calculated world bounding box if available (e.g., for static boundaries)
      let currentObjectBox = object.userData.boundingBox as Box3 | undefined;
      if (!currentObjectBox || currentObjectBox.isEmpty()) {
        // Calculate world box if not pre-calculated or empty
        this.objectBox.setFromObject(object, true); // Calculate world box
        currentObjectBox = this.objectBox;
        if (currentObjectBox.isEmpty()) return; // Skip if box calculation fails
        // Optionally store it back if it's likely static: object.userData.boundingBox = currentObjectBox.clone();
      }

      if (this.playerBox.intersectsBox(currentObjectBox)) {
        this.resolveCollision(this.playerBox, currentObjectBox, object);
        // After resolving, update the playerBox to the new position for subsequent checks in the same frame
        this.playerBox.translate(this.pushVector);
      }
    });

    // Apply the final adjusted position to the player mesh
    this.player.mesh.position.copy(this.playerPosition).add(this.pushVector); // Apply accumulated push

    // Re-check ground state after collisions have been resolved
    this.player.checkGround(this.collidableObjects);

    // Apply vertical velocity *after* ground check and horizontal collisions
    // This prevents gravity pulling through floor immediately after collision resolution
    if (!this.player.isOnGround) {
      this.player.mesh.position.y += this.player.velocity.y * deltaTime;
    } else {
      // Ensure player stays snapped to ground if grounded
      // this.player.mesh.position.y = Math.max(this.player.mesh.position.y, groundY); // groundY needs to be accessible or recalculated
    }

    // Final bounding box update at the actual position
    this.player.updateBoundingBox();
  }

  resolveCollision(playerBox: Box3, objectBox: Box3, object: Object3D): void {
    playerBox.getCenter(this.centerPlayer);
    objectBox.getCenter(this.centerObject);
    playerBox.getSize(this.sizePlayer);
    objectBox.getSize(this.sizeObject);

    // Calculate overlap on each axis
    this.overlap.x =
      this.sizePlayer.x / 2 +
      this.sizeObject.x / 2 -
      Math.abs(this.centerPlayer.x - this.centerObject.x);
    this.overlap.y =
      this.sizePlayer.y / 2 +
      this.sizeObject.y / 2 -
      Math.abs(this.centerPlayer.y - this.centerObject.y);
    this.overlap.z =
      this.sizePlayer.z / 2 +
      this.sizeObject.z / 2 -
      Math.abs(this.centerPlayer.z - this.centerObject.z);

    // Find axis of minimum overlap (MTV - Minimum Translation Vector)
    let minOverlap = Infinity;
    let pushAxis = -1; // 0: x, 1: y, 2: z

    if (this.overlap.x > 0 && this.overlap.x < minOverlap) {
      minOverlap = this.overlap.x;
      pushAxis = 0;
    }
    if (this.overlap.y > 0 && this.overlap.y < minOverlap) {
      minOverlap = this.overlap.y;
      pushAxis = 1;
    }
    if (this.overlap.z > 0 && this.overlap.z < minOverlap) {
      minOverlap = this.overlap.z;
      pushAxis = 2;
    }

    if (pushAxis === -1 || minOverlap < 0.0001) return; // No significant overlap

    // Calculate push vector based on minimum overlap axis
    this.pushVector.set(0, 0, 0);
    const pushMagnitude = minOverlap + 0.001; // Add small epsilon to ensure separation

    switch (pushAxis) {
      case 0: // X-axis
        this.pushVector.x =
          this.centerPlayer.x > this.centerObject.x
            ? pushMagnitude
            : -pushMagnitude;
        // Stop velocity component pushing into the object
        if (Math.sign(this.player.velocity.x) === Math.sign(this.pushVector.x))
          this.player.velocity.x = 0;
        break;
      case 1: // Y-axis
        this.pushVector.y =
          this.centerPlayer.y > this.centerObject.y
            ? pushMagnitude
            : -pushMagnitude;
        // Handle vertical collision response (landing, hitting ceiling)
        if (this.pushVector.y > 0 && this.player.velocity.y <= 0) {
          // Pushed up (landed)
          this.player.velocity.y = 0;
          // Ground check will handle isOnGround/canJump flags
        } else if (this.pushVector.y < 0 && this.player.velocity.y > 0) {
          // Pushed down (hit ceiling)
          this.player.velocity.y = 0;
        }
        break;
      case 2: // Z-axis
        this.pushVector.z =
          this.centerPlayer.z > this.centerObject.z
            ? pushMagnitude
            : -pushMagnitude;
        if (Math.sign(this.player.velocity.z) === Math.sign(this.pushVector.z))
          this.player.velocity.z = 0;
        break;
    }

    // Apply the push vector to the intended player position
    this.playerPosition.add(this.pushVector);
  }
}

// =============================================================================
// Interaction System
// =============================================================================

class InteractionSystem {
  player: Character;
  camera: PerspectiveCamera;
  interactableEntities: Array<any>; // Includes Characters and simple objects
  controls: Controls;
  inventory: Inventory; // Reference to the *current* player's inventory
  eventLog: EventLog; // Reference to the *current* player's event log
  game: Game;
  raycaster: Raycaster;
  interactionDistance: number = INTERACTION_DISTANCE;
  aimTolerance: number = Math.PI / 6; // How far off center can the aim be
  currentTarget: any | null = null;
  interactionPromptElement: HTMLElement | null;
  activeGather: ActiveGather | null = null;
  promptTimeout: ReturnType<typeof setTimeout> | null = null;

  // Chat UI
  chatContainer: HTMLElement | null;
  chatInput: HTMLInputElement | null;
  isChatOpen: boolean = false;
  chatTarget: Character | null = null;
  private boundSendMessage: (() => Promise<void>) | null = null;
  private boundHandleChatKeyDown: ((e: KeyboardEvent) => void) | null = null;

  // Reusable vectors
  private cameraDirection = new Vector3();
  private objectDirection = new Vector3();
  private playerDirection = new Vector3();
  private objectPosition = new Vector3();
  private playerPosition = new Vector3();

  constructor(
    player: Character,
    camera: PerspectiveCamera,
    interactableEntities: Array<any>,
    controls: Controls,
    game: Game
  ) {
    this.player = player;
    this.camera = camera;
    this.interactableEntities = interactableEntities;
    this.controls = controls;
    this.inventory = player.inventory!; // Assume player always has inventory
    this.eventLog = player.eventLog;
    this.game = game;
    this.raycaster = new Raycaster();
    this.raycaster.camera = camera;
    this.interactionPromptElement =
      document.getElementById("interaction-prompt");
    this.chatContainer = document.getElementById("chat-container");
    this.chatInput = document.getElementById("chat-input") as HTMLInputElement;
  }

  // Called when player control switches
  setActivePlayer(newPlayer: Character): void {
    this.player = newPlayer;
    this.inventory = newPlayer.inventory!;
    this.eventLog = newPlayer.eventLog;
    this.currentTarget = null; // Reset target on switch
    this.cancelGatherAction(); // Cancel any ongoing gather
    this.closeChatInterface(); // Close chat if open
    this.hidePrompt();
  }

  update(deltaTime: number): void {
    if (this.isChatOpen) {
      if (this.interactionPromptElement?.style.display !== "none")
        this.hidePrompt();
      return; // Don't check for interactions while chatting
    }

    // Handle ongoing gather action
    if (this.activeGather) {
      const moved = this.player.velocity.lengthSq() > 0.001; // Check if player moved significantly
      if (moved || this.controls.consumeInteraction()) {
        // Cancel if moved or interact pressed again
        this.cancelGatherAction();
        return;
      }
      this.updateGatherAction(deltaTime);
      return; // Don't look for new targets while gathering
    }

    // Find potential target
    const targetInfo = this.findInteractableTarget();

    if (targetInfo?.instance?.userData?.isInteractable) {
      if (this.currentTarget !== targetInfo.instance) {
        this.currentTarget = targetInfo.instance;
        const promptText =
          targetInfo.instance.userData.prompt ||
          (this.game.mobileControls?.isActive() ? "Tap Interact" : "Press E");
        this.showPrompt(promptText); // Show prompt without timeout initially
      }
      // Check for interaction input
      if (this.controls.consumeInteraction()) {
        this.tryInteract(this.currentTarget);
      }
    } else if (this.currentTarget) {
      // No valid target found, clear current target and prompt
      this.currentTarget = null;
      this.hidePrompt();
    }
  }

  findInteractableTarget(): TargetInfo | null {
    if (!this.player.mesh) return null;
    this.player.mesh.getWorldPosition(this.playerPosition);

    // 1. Raycast from camera center (primary method)
    this.raycaster.setFromCamera(new Vector2(0, 0), this.camera);
    this.raycaster.far = this.interactionDistance * 1.5; // Slightly longer raycast check

    const meshesToCheck = this.interactableEntities
      .map((item) => (item as any).mesh ?? item) // Get mesh if available
      .filter(
        (mesh): mesh is Object3D =>
          mesh instanceof Object3D &&
          mesh.userData?.isInteractable &&
          mesh.visible &&
          !(
            mesh.userData?.entityReference instanceof Character &&
            mesh.userData.entityReference.isDead
          ) && // Exclude dead characters
          this.playerPosition.distanceToSquared(mesh.position) < 100 // Broad phase distance check
      );

    const intersects = this.raycaster.intersectObjects(meshesToCheck, true);

    if (intersects.length > 0) {
      for (const intersect of intersects) {
        let hitObject: Object3D | null = intersect.object;
        let rootInstance: any | null = null;
        let rootMesh: Object3D | null = null;

        // Traverse up to find the root interactable object/entity
        while (hitObject) {
          if (
            hitObject.userData?.isInteractable &&
            (hitObject.userData?.entityReference ||
              hitObject.userData?.isSimpleObject)
          ) {
            rootInstance =
              hitObject.userData.entityReference ||
              this.interactableEntities.find(
                (e) => (e as any).mesh === hitObject
              );
            rootMesh = hitObject;
            break;
          }
          hitObject = hitObject.parent;
        }

        if (
          rootInstance &&
          rootMesh &&
          rootInstance.userData?.isInteractable &&
          !(rootInstance instanceof Character && rootInstance.isDead)
        ) {
          // Check angle tolerance
          this.objectDirection
            .copy(intersect.point)
            .sub(this.camera.position)
            .normalize();
          this.camera.getWorldDirection(this.cameraDirection);
          if (
            this.cameraDirection.angleTo(this.objectDirection) <
            this.aimTolerance
          ) {
            return {
              mesh: rootMesh,
              instance: rootInstance,
              point: intersect.point,
              distance: intersect.distance,
            };
          }
        }
      }
    }

    // 2. Fallback: Check nearby objects based on player facing direction
    let closestDistSq = this.interactionDistance * this.interactionDistance;
    let closestInstance: any | null = null;
    let closestMesh: Object3D | null = null;
    this.player.mesh.getWorldDirection(this.playerDirection);

    this.interactableEntities.forEach((item) => {
      if (
        !item?.userData?.isInteractable ||
        item === this.player ||
        (item instanceof Character && item.isDead)
      )
        return;
      const objMesh = (item as any).mesh ?? item;
      if (!objMesh || !objMesh.visible) return;

      this.objectPosition.copy(objMesh.getWorldPosition(new Vector3()));
      const distSq = this.playerPosition.distanceToSquared(this.objectPosition);

      if (distSq < closestDistSq) {
        this.objectDirection
          .copy(this.objectPosition)
          .sub(this.playerPosition)
          .normalize();
        // Check if object is roughly in front of the player
        if (this.playerDirection.dot(this.objectDirection) > 0.707) {
          // Check within ~90 degree cone
          closestDistSq = distSq;
          closestInstance = item;
          closestMesh = objMesh;
        }
      }
    });

    if (closestInstance && closestMesh) {
      this.objectPosition.copy(
        (closestMesh as Object3D).getWorldPosition(new Vector3())
      );
      return {
        mesh: closestMesh,
        instance: closestInstance,
        point: this.objectPosition.clone(),
        distance: Math.sqrt(closestDistSq),
      };
    }

    return null; // No target found
  }

  tryInteract(targetInstance: any): void {
    if (
      !targetInstance?.userData?.isInteractable ||
      (targetInstance instanceof Character && targetInstance.isDead)
    ) {
      this.showPrompt("Cannot interact.", 1500);
      return;
    }

    const targetMesh = (targetInstance as any).mesh ?? targetInstance;
    if (!(targetMesh instanceof Object3D)) return;

    const distance = this.player.mesh!.position.distanceTo(targetMesh.position);
    if (distance > this.interactionDistance * 1.1) {
      // Allow slight tolerance
      this.currentTarget = null;
      this.hidePrompt();
      return;
    }

    let result: InteractionResult | null = null;
    if (typeof targetInstance.interact === "function") {
      result = targetInstance.interact(this.player);
    } else if (
      targetInstance.userData.interactionType === "gather" &&
      targetInstance.userData.resource
    ) {
      this.startGatherAction(targetInstance);
      result = { type: "gather_start" };
    } else {
      // Default examine action
      this.game.logEvent(
        this.player,
        "examine",
        `Examined ${targetInstance.name || "object"}.`,
        targetInstance.id,
        {},
        targetMesh.position
      );
      result = { type: "message", message: "You look at the object." };
    }

    if (result) this.handleInteractionResult(result, targetInstance);

    // Clear target if interaction made it non-interactable (e.g., depleted resource)
    if (
      result?.type !== "gather_start" &&
      !targetInstance.userData?.isInteractable
    ) {
      this.currentTarget = null;
      this.hidePrompt();
    }
  }

  handleInteractionResult(
    result: InteractionResult,
    targetInstance: any
  ): void {
    let promptDuration: number | null = 2000;
    let promptText: string | null = null;

    switch (result.type) {
      case "reward":
      case "message":
      case "error":
        promptText = result.message || "Interacted.";
        break;
      case "dialogue": // Simple dialogue display
        promptText = result.text
          ? `${targetInstance.name ?? "NPC"}: ${result.text}`
          : "Hmm...";
        promptDuration = 4000;
        break;
      case "chat": // Open chat UI
        if (targetInstance instanceof Character) {
          this.openChatInterface(targetInstance);
          promptDuration = null; // UI handles feedback
        } else {
          promptText = "Cannot chat with this.";
        }
        break;
      case "item_retrieved": // Log handles feedback
      case "gather_start": // Gather progress handles feedback
        promptDuration = null;
        break;
    }

    if (promptText && promptDuration !== null) {
      this.showPrompt(promptText, promptDuration);
    }
  }

  startGatherAction(targetInstance: any): void {
    if (this.activeGather || !targetInstance.userData.resource) return;
    const resource = targetInstance.userData.resource as string;
    const gatherTime = (targetInstance.userData.gatherTime as number) || 2000;

    // Check inventory space *before* starting
    if (
      this.inventory.countItem(resource) >=
        this.inventory.getMaxStack(resource) &&
      !this.inventory.items.includes(null)
    ) {
      // Check if there's an existing stack that's full AND no empty slots
      let canStack = false;
      for (const item of this.inventory.items) {
        if (
          item?.name === resource &&
          item.count < this.inventory.getMaxStack(resource)
        ) {
          canStack = true;
          break;
        }
      }
      if (!canStack) {
        this.showPrompt("Inventory full for this item.", 2000);
        this.game.logEvent(
          this.player,
          "gather_fail",
          `Inventory full, cannot start gathering ${resource}.`,
          targetInstance.id,
          { resource },
          this.player.mesh!.position
        );
        return;
      }
    }

    this.activeGather = {
      targetInstance,
      startTime: performance.now(),
      duration: gatherTime,
      resource,
    };
    this.showPrompt(`Gathering ${resource}... (0%)`); // Show initial progress
    this.game.logEvent(
      this.player,
      "gather_start",
      `Started gathering ${resource}...`,
      targetInstance.id,
      { resource },
      this.player.mesh!.position
    );

    // Player stops moving and starts gather animation
    this.player.velocity.set(0, 0, 0);
    this.player.isGathering = true;
    this.player.gatherAttackTimer = 0; // Reset animation timer
    this.player.triggerAction("gather");
  }

  updateGatherAction(deltaTime: number): void {
    if (!this.activeGather) return;
    const elapsedTime = performance.now() - this.activeGather.startTime;
    const progress = Math.min(1, elapsedTime / this.activeGather.duration);
    this.showPrompt(
      `Gathering ${this.activeGather.resource}... (${Math.round(progress * 100)}%)`
    );
    if (progress >= 1) this.completeGatherAction();
  }

  completeGatherAction(): void {
    if (!this.activeGather) return;
    const { resource, targetInstance } = this.activeGather;
    const targetMesh = targetInstance.mesh ?? targetInstance;

    if (this.inventory.addItem(resource, 1)) {
      this.game.logEvent(
        this.player,
        "gather_complete",
        `Gathered 1 ${resource}.`,
        targetInstance.id,
        { resource },
        targetMesh.position
      );
      if (targetInstance.userData.isDepletable) {
        targetInstance.userData.isInteractable = false;
        targetMesh.visible = false;
        const respawnTime = targetInstance.userData.respawnTime || 15000;
        setTimeout(() => {
          if (targetInstance.userData) {
            targetInstance.userData.isInteractable = true;
            targetMesh.visible = true;
          }
        }, respawnTime);
      }
    } else {
      this.game.logEvent(
        this.player,
        "gather_fail",
        `Inventory full, could not gather ${resource}.`,
        targetInstance.id,
        { resource },
        targetMesh.position
      );
      this.showPrompt("Inventory full!", 2000);
    }

    this.resetGatherState();
  }

  cancelGatherAction(): void {
    if (!this.activeGather) return;
    this.game.logEvent(
      this.player,
      "gather_cancel",
      `Gathering ${this.activeGather.resource} cancelled.`,
      this.activeGather.targetInstance.id,
      { resource: this.activeGather.resource },
      this.player.mesh!.position
    );
    this.resetGatherState();
  }

  resetGatherState(): void {
    this.player.isGathering = false;
    this.player.gatherAttackTimer = 0;
    this.player.isPerformingAction = false; // Ensure this is reset if gather used attack anim
    this.player.actionType = "none";
    // Stop gather animation (which might be attack anim)
    if (this.player.animations.attack?.isRunning()) {
      this.player.animations.attack.stop();
      // Optionally transition back to idle/walk smoothly
      this.player.switchAction("idle");
    }
    this.activeGather = null;
    this.hidePrompt();
    this.currentTarget = null; // Clear target after gather attempt
  }

  showPrompt(text: string, duration: number | null = null): void {
    if (!this.interactionPromptElement) return;
    // Don't overwrite gather progress prompt unless it's a timed message
    if (this.activeGather && duration === null) return;

    this.interactionPromptElement.textContent = text;
    this.interactionPromptElement.style.display = "block";

    clearTimeout(this.promptTimeout ?? undefined); // Clear existing timeout
    this.promptTimeout = null;

    if (duration && duration > 0) {
      this.promptTimeout = setTimeout(() => {
        // Only hide if the text hasn't changed in the meantime
        if (this.interactionPromptElement?.textContent === text) {
          this.hidePrompt();
        }
      }, duration);
    }
  }

  hidePrompt(): void {
    if (!this.interactionPromptElement) return;
    // Don't hide if gathering is in progress (it shows its own prompt)
    if (this.activeGather) return;

    this.interactionPromptElement.style.display = "none";
    this.interactionPromptElement.textContent = "";
    clearTimeout(this.promptTimeout ?? undefined);
    this.promptTimeout = null;
  }

  // --- Chat ---
  generateChatPrompt(target: Character, playerMessage: string): string {
    const recentEvents = target.eventLog.entries
      .slice(-5)
      .map((e) => e.message)
      .join("\n");
    const persona = target.persona || "a villager";
    return `You are ${target.name} (${persona}). Player ${this.player.name} says: "${playerMessage}". Recent events:\n${recentEvents || "None"}\nRespond briefly (1-2 sentences).`;
  }

  async openChatInterface(target: Character): Promise<void> {
    if (!this.chatContainer || !this.chatInput || this.isChatOpen) return;
    this.game.setPauseState(true);
    this.isChatOpen = true;
    this.chatTarget = target;
    this.chatContainer.classList.remove("hidden");
    this.chatInput.value = "";
    this.chatInput.focus();
    this.hidePrompt(); // Hide interaction prompt

    // Define bound handlers only once
    if (!this.boundSendMessage) {
      this.boundSendMessage = async () => {
        if (!this.chatTarget || !this.chatInput || this.chatInput.disabled)
          return;
        const message = this.chatInput.value.trim();
        if (!message) return;

        this.player.showTemporaryMessage(message); // Show player message bubble
        this.game.logEvent(
          this.player,
          "chat",
          `${this.player.name} said "${message}" to ${this.chatTarget.name}.`,
          this.chatTarget,
          { message },
          this.player.mesh!.position
        );

        this.chatInput.value = "";
        this.chatInput.disabled = true; // Disable while waiting

        const prompt = this.generateChatPrompt(this.chatTarget, message);
        try {
          const responseJson = await sendToGemini(prompt);
          let npcMessage = "Hmm...";
          if (responseJson) {
            // Attempt to parse assuming the response is the direct text, not wrapped JSON
            npcMessage = responseJson.trim() || "Hmm...";
            // If it *is* wrapped JSON (e.g., {"response": "..."}), parse it:
            try {
              const parsed = JSON.parse(responseJson);
              if (parsed.response) npcMessage = parsed.response.trim();
            } catch (e) {
              /* Ignore parse error if it's plain text */
            }
          }

          this.chatTarget.showTemporaryMessage(npcMessage);
          this.game.logEvent(
            this.chatTarget,
            "chat",
            `${this.chatTarget.name} said "${npcMessage}" to ${this.player.name}.`,
            this.player,
            { message: npcMessage },
            this.chatTarget.mesh!.position
          );
          this.game.checkQuestCompletion(this.chatTarget, npcMessage); // Check quests
        } catch (error) {
          console.error("Error during chat API call:", error);
          this.chatTarget.showTemporaryMessage("I... don't know what to say.");
          this.game.logEvent(
            this.chatTarget,
            "chat_error",
            `${this.chatTarget.name} failed to respond.`,
            this.player,
            { error: (error as Error).message },
            this.chatTarget.mesh!.position
          );
        } finally {
          this.closeChatInterface(); // Close UI after response/error
        }
      };
    }
    if (!this.boundHandleChatKeyDown) {
      this.boundHandleChatKeyDown = (e: KeyboardEvent) => {
        if (e.key === "Enter" && this.boundSendMessage) this.boundSendMessage();
        // Allow Escape key to close chat (handled globally by Controls)
      };
    }

    // Add listeners
    this.chatInput.addEventListener("keydown", this.boundHandleChatKeyDown);
    // Consider adding a send button listener as well
  }

  closeChatInterface(): void {
    if (!this.isChatOpen || !this.chatContainer || !this.chatInput) return;
    this.isChatOpen = false;
    this.chatTarget = null;
    this.chatContainer.classList.add("hidden");
    this.chatInput.disabled = false;
    this.game.setPauseState(false); // Unpause

    // Remove listeners
    if (this.boundHandleChatKeyDown)
      this.chatInput.removeEventListener(
        "keydown",
        this.boundHandleChatKeyDown
      );
    // Remove send button listener if added
  }
}

// =============================================================================
// UI Classes
// =============================================================================

class HUD {
  player: Character;
  healthBarElement: HTMLElement | null;
  staminaBarElement: HTMLElement | null;
  fpsDisplayElement: HTMLElement | null;
  frameTimes: number[] = [];
  MAX_SAMPLES: number = 60;
  lastUpdateTime: number;

  constructor(player: Character) {
    this.player = player;
    this.healthBarElement = document.getElementById("health-bar");
    this.staminaBarElement = document.getElementById("stamina-bar");
    this.fpsDisplayElement = document.getElementById("fps-display");
    this.lastUpdateTime = performance.now();
    this.update(); // Initial update
  }

  update(): void {
    // FPS Calculation
    const currentTime = performance.now();
    const deltaTime = (currentTime - this.lastUpdateTime) / 1000;
    this.lastUpdateTime = currentTime;
    this.frameTimes.push(deltaTime);
    if (this.frameTimes.length > this.MAX_SAMPLES) this.frameTimes.shift();
    const averageDelta =
      this.frameTimes.reduce((a, b) => a + b, 0) / this.frameTimes.length;
    const fps = averageDelta > 0 ? 1 / averageDelta : 0;
    if (this.fpsDisplayElement)
      this.fpsDisplayElement.textContent = `FPS: ${Math.round(fps)}`;

    // Health & Stamina Bars
    if (this.player.isDead) {
      if (this.healthBarElement) this.healthBarElement.style.width = `0%`;
      if (this.staminaBarElement) this.staminaBarElement.style.width = `0%`;
      return;
    }
    if (!this.healthBarElement || !this.staminaBarElement) return;

    const healthPercent = Math.max(
      0,
      (this.player.health / this.player.maxHealth) * 100
    );
    this.healthBarElement.style.width = `${healthPercent}%`;
    this.healthBarElement.style.backgroundColor =
      healthPercent < 30
        ? "#FF4500"
        : healthPercent < 60
          ? "#FFA500"
          : "#4CAF50";

    const staminaPercent = Math.max(
      0,
      (this.player.stamina / this.player.maxStamina) * 100
    );
    this.staminaBarElement.style.width = `${staminaPercent}%`;
    if (this.player.isExhausted) {
      this.staminaBarElement.style.backgroundColor = "#888"; // Greyed out when exhausted
      this.staminaBarElement.classList.add("exhausted");
    } else {
      this.staminaBarElement.style.backgroundColor = "#FF69B4"; // Pink stamina
      this.staminaBarElement.classList.remove("exhausted");
    }
  }
}

class InventoryDisplay {
  inventory: Inventory;
  displayElement: HTMLElement | null;
  slotsContainer: HTMLElement | null;
  isOpen: boolean = false;
  private boundUpdateDisplay: (items: Array<InventoryItem | null>) => void;

  constructor(inventory: Inventory) {
    this.inventory = inventory;
    this.displayElement = document.getElementById("inventory-display");
    this.slotsContainer = document.getElementById("inventory-slots");
    this.boundUpdateDisplay = this.updateDisplay.bind(this);
    this.inventory.onChange(this.boundUpdateDisplay);
    if (this.slotsContainer) this.createSlots();
    this.hide(); // Start hidden
  }

  setInventory(newInventory: Inventory): void {
    if (this.inventory === newInventory) return;
    // Remove listener from old inventory
    this.inventory.onChangeCallbacks = this.inventory.onChangeCallbacks.filter(
      (cb) => cb !== this.boundUpdateDisplay
    );
    // Set new inventory and add listener
    this.inventory = newInventory;
    this.inventory.onChange(this.boundUpdateDisplay);
    // Recreate slots if size differs and update display if open
    if (
      this.slotsContainer &&
      this.slotsContainer.children.length !== this.inventory.size
    ) {
      this.createSlots();
    }
    if (this.isOpen) this.updateDisplay(this.inventory.items);
  }

  createSlots(): void {
    if (!this.slotsContainer) return;
    this.slotsContainer.innerHTML = ""; // Clear existing slots
    for (let i = 0; i < this.inventory.size; i++) {
      const slotElement = document.createElement("div");
      slotElement.classList.add("inventory-slot");
      slotElement.dataset.index = i.toString();
      slotElement.title = "Empty";
      // Simplified innerHTML
      slotElement.innerHTML = `<div class="item-icon" data-icon="empty" style="visibility: hidden;"></div><span class="item-count"></span>`;
      this.slotsContainer.appendChild(slotElement);
    }
  }

  updateDisplay(items: Array<InventoryItem | null>): void {
    if (!this.isOpen || !this.slotsContainer) return;
    const slotElements =
      this.slotsContainer.querySelectorAll<HTMLElement>(".inventory-slot");
    if (slotElements.length !== this.inventory.size) this.createSlots(); // Recreate if needed

    items.forEach((item, index) => {
      const slotElement = slotElements[index];
      if (!slotElement) return;
      const iconElement = slotElement.querySelector<HTMLElement>(".item-icon");
      const countElement =
        slotElement.querySelector<HTMLElement>(".item-count");
      if (!iconElement || !countElement) return;

      if (item) {
        const iconClass =
          item.icon ||
          item.name.toLowerCase().replace(/ /g, "_").replace(/'/g, "");
        if (iconElement.dataset.icon !== iconClass) {
          iconElement.className = `item-icon ${iconClass}`; // Set class for background image
          iconElement.dataset.icon = iconClass;
        }
        iconElement.style.visibility = "visible";
        countElement.textContent = item.count > 1 ? item.count.toString() : "";
        slotElement.title = `${item.name}${item.count > 1 ? ` (${item.count})` : ""}`;
      } else {
        if (iconElement.dataset.icon !== "empty") {
          iconElement.className = "item-icon";
          iconElement.dataset.icon = "empty";
        }
        iconElement.style.visibility = "hidden";
        countElement.textContent = "";
        slotElement.title = "Empty";
      }
    });
  }

  toggle(): void {
    this.isOpen ? this.hide() : this.show();
  }
  show(): void {
    if (!this.displayElement || this.isOpen) return;
    this.isOpen = true;
    this.updateDisplay(this.inventory.items);
    this.displayElement.classList.remove("hidden");
  }
  hide(): void {
    if (!this.displayElement || !this.isOpen) return;
    this.isOpen = false;
    this.displayElement.classList.add("hidden");
  }
}

class JournalDisplay {
  eventLog: EventLog;
  game: Game;
  displayElement: HTMLElement | null;
  eventListElement: HTMLElement | null;
  questListElement: HTMLElement | null;
  isOpen: boolean = false;
  private boundUpdateEvents: (entries: EventEntry[]) => void;
  private boundUpdateQuests: () => void;

  constructor(eventLog: EventLog, game: Game) {
    this.eventLog = eventLog;
    this.game = game;
    this.displayElement = document.getElementById("journal-display");
    this.eventListElement = document.getElementById("event-log");
    this.questListElement = document.getElementById("quest-log");
    this.boundUpdateEvents = this.updateEvents.bind(this);
    this.boundUpdateQuests = this.updateQuests.bind(this);
    this.eventLog.onChange(this.boundUpdateEvents);
    // Quest updates are triggered manually on show/completion
    this.hide(); // Start hidden
  }

  setEventLog(newEventLog: EventLog): void {
    if (this.eventLog === newEventLog) return;
    this.eventLog.onChangeCallbacks = this.eventLog.onChangeCallbacks.filter(
      (cb) => cb !== this.boundUpdateEvents
    );
    this.eventLog = newEventLog;
    this.eventLog.onChange(this.boundUpdateEvents);
    if (this.isOpen) this.updateEvents(this.eventLog.entries);
  }

  updateEvents(entries: EventEntry[]): void {
    if (!this.isOpen || !this.eventListElement) return;
    this.eventListElement.innerHTML =
      entries.length === 0 ? "<li>No events recorded.</li>" : "";
    // Display newest events at the top
    [...entries].reverse().forEach((entry) => {
      const li = document.createElement("li");
      li.textContent = `[${entry.timestamp}] ${entry.message}`;
      this.eventListElement!.appendChild(li);
    });
    this.eventListElement.scrollTop = 0; // Scroll to top
  }

  updateQuests(): void {
    if (!this.isOpen || !this.questListElement) return;
    this.questListElement.innerHTML = ""; // Clear existing quests
    const quests = this.game.quests || [];
    if (quests.length === 0) {
      this.questListElement.innerHTML = "<li>No active quests.</li>";
      return;
    }
    quests.forEach((quest) => {
      const li = document.createElement("li");
      li.textContent = `${quest.name}: ${quest.isCompleted ? "Completed" : "In Progress"}`;
      li.title = quest.description; // Add description as tooltip
      if (quest.isCompleted) li.classList.add("completed");
      this.questListElement!.appendChild(li);
    });
  }

  toggle(): void {
    this.isOpen ? this.hide() : this.show();
  }
  show(): void {
    if (!this.displayElement || this.isOpen) return;
    this.isOpen = true;
    this.updateEvents(this.eventLog.entries);
    this.updateQuests(); // Update quests when opening
    this.displayElement.classList.remove("hidden");
  }
  hide(): void {
    if (!this.displayElement || !this.isOpen) return;
    this.isOpen = false;
    this.displayElement.classList.add("hidden");
  }
}

class Minimap {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  player: Character;
  entities: Array<any>; // Includes Characters and simple objects like trees/rocks
  worldSize: number;
  mapSize: number;
  mapScale: number;
  halfMapSize: number;
  halfWorldSize: number;
  bgColor: string = "rgba(100, 100, 100, 0.6)";
  playerColor: string = "yellow";
  npcColor: string = "cyan";
  resourceColorMap: Record<string, string> = {
    wood: "saddlebrown",
    stone: "darkgray",
    herb: "limegreen",
    default: "white",
  };
  dotSize: number = 3;
  playerDotSize: number = 4;
  playerTriangleSize: number;

  // Reusable vectors
  private entityPosition = new Vector3();
  private playerPosition = new Vector3();
  private playerForward = new Vector3();

  constructor(
    canvasElement: HTMLCanvasElement,
    player: Character,
    entities: Array<any>,
    worldSize: number
  ) {
    this.canvas = canvasElement;
    const context = this.canvas.getContext("2d");
    if (!context) throw new Error("Could not get 2D context for minimap.");
    this.ctx = context;
    this.player = player;
    this.entities = entities;
    this.worldSize = worldSize;
    this.mapSize = this.canvas.width; // Assume square canvas
    this.mapScale = this.mapSize / this.worldSize;
    this.halfMapSize = this.mapSize / 2;
    this.halfWorldSize = this.worldSize / 2;
    this.playerTriangleSize = this.playerDotSize * 1.5;
  }

  // Called when player control switches
  setActivePlayer(newPlayer: Character): void {
    this.player = newPlayer;
  }

  update(): void {
    this.ctx.fillStyle = this.bgColor;
    this.ctx.fillRect(0, 0, this.mapSize, this.mapSize);

    if (this.player.isDead || !this.player.mesh) return;

    // Get player position and orientation for rotation
    this.player.mesh.getWorldPosition(this.playerPosition);
    this.player.mesh.getWorldDirection(this.playerForward);
    const playerRotationAngle = Math.atan2(
      this.playerForward.x,
      this.playerForward.z
    ); // Angle relative to positive Z

    // Center and rotate the map view around the player
    this.ctx.save();
    this.ctx.translate(this.halfMapSize, this.halfMapSize);
    this.ctx.rotate(-playerRotationAngle); // Rotate opposite to player facing direction
    const playerMapX = this.worldToMapX(this.playerPosition.x);
    const playerMapZ = this.worldToMapZ(this.playerPosition.z);
    this.ctx.translate(-playerMapX, -playerMapZ); // Translate so player world pos is at center

    // Draw entities relative to the player's rotated view
    this.entities.forEach((entity) => {
      if (
        !entity ||
        entity === this.player ||
        (entity instanceof Character && entity.isDead)
      )
        return;

      const mesh = (entity as any).mesh ?? entity;
      if (!(mesh instanceof Object3D) || !mesh.parent || !mesh.visible) return;

      mesh.getWorldPosition(this.entityPosition);
      const entityMapX = this.worldToMapX(this.entityPosition.x);
      const entityMapZ = this.worldToMapZ(this.entityPosition.z);

      let color = "gray";
      let size = this.dotSize;
      let draw = false;

      if (entity.userData?.isNPC) {
        color = this.npcColor;
        size += 1;
        draw = true;
      } else if (entity.userData?.resource) {
        color =
          this.resourceColorMap[entity.userData.resource] ||
          this.resourceColorMap.default;
        draw = true;
      } else if (entity.userData?.isInteractable) {
        // Generic interactable fallback
        color = "lightblue";
        draw = true;
      }

      if (draw) this.drawDot(entityMapX, entityMapZ, color, size);
    });

    this.ctx.restore(); // Restore context to draw player indicator at center

    // Draw player indicator (triangle pointing up) at the center of the minimap
    this.drawPlayerTriangle(
      this.halfMapSize,
      this.halfMapSize,
      this.playerColor,
      this.playerTriangleSize
    );
  }

  // Convert world X to map X
  worldToMapX = (worldX: number): number =>
    (worldX + this.halfWorldSize) * this.mapScale;
  // Convert world Z to map Y (inverted Z)
  worldToMapZ = (worldZ: number): number =>
    (this.halfWorldSize - worldZ) * this.mapScale;

  drawDot(mapX: number, mapY: number, color: string, size: number): void {
    this.ctx.fillStyle = color;
    this.ctx.beginPath();
    this.ctx.arc(mapX, mapY, size, 0, Math.PI * 2);
    this.ctx.fill();
  }

  drawPlayerTriangle(
    centerX: number,
    centerY: number,
    color: string,
    size: number
  ): void {
    const height = size * 1.5;
    const width = size;
    this.ctx.fillStyle = color;
    this.ctx.beginPath();
    // Point triangle upwards (representing player's forward in the rotated view)
    this.ctx.moveTo(centerX, centerY - height * 0.6);
    this.ctx.lineTo(centerX - width / 2, centerY + height * 0.4);
    this.ctx.lineTo(centerX + width / 2, centerY + height * 0.4);
    this.ctx.closePath();
    this.ctx.fill();
  }
}

// =============================================================================
// Game Class (Main Orchestrator)
// =============================================================================

class Game {
  scene: Scene;
  renderer: WebGLRenderer;
  camera: PerspectiveCamera;
  clock: Clock;
  activeCharacter: Character | null = null;
  thirdPersonCamera: ThirdPersonCamera | null = null;
  controls: Controls | null = null;
  mobileControls: MobileControls | null = null;
  physics: Physics | null = null;
  interactionSystem: InteractionSystem | null = null;
  hud: HUD | null = null;
  minimap: Minimap | null = null;
  inventoryDisplay: InventoryDisplay | null = null;
  journalDisplay: JournalDisplay | null = null;

  entities: Array<any> = []; // Characters and simple interactable objects
  collidableObjects: Object3D[] = []; // Meshes/Groups used for physics collision
  interactableObjects: Array<any> = []; // Entities/Objects the player can interact with

  isPaused: boolean = false;
  particleEffects: Group[] = [];
  audioElement: HTMLAudioElement | null = null;

  // Portals
  exitPortalGroup: Group | null = null;
  exitPortalBox: Box3 | null = null;
  exitPortalParticles: BufferGeometry | null = null;
  startPortalGroup: Group | null = null;
  startPortalBox: Box3 | null = null;
  startPortalParticles: BufferGeometry | null = null;
  startPortalRefUrl: string | null = null;
  startPortalOriginalParams: URLSearchParams | null = null;
  hasEnteredFromPortal: boolean = false;

  quests: Quest[] = [];

  constructor() {
    this.renderer = this.initRenderer();
    this.scene = this.initScene();
    this.camera = this.initCamera();
    this.clock = new Clock();
    this.initAudio();
  }

  async init(): Promise<void> {
    const models = await loadModels();

    const urlParams = new URLSearchParams(window.location.search);
    this.hasEnteredFromPortal = urlParams.get("portal") === "true";
    this.startPortalRefUrl = urlParams.get("ref");
    this.startPortalOriginalParams = urlParams;

    this.initPlayer(models); // Must be before controls/camera
    this.initControls(); // Desktop controls first
    this.initMobileControls(); // Mobile controls (checks if needed)
    this.initPhysics();
    this.initEnvironment(models); // Populate after player/physics
    this.initSystems(); // Interaction system depends on player/entities
    this.initQuests();
    this.initUI();
    this.setupUIControls(); // Keyboard bindings

    this.createExitPortal();
    if (this.hasEnteredFromPortal && this.startPortalRefUrl) {
      this.createStartPortal();
      // Face player away from start portal
      if (this.activeCharacter?.mesh && this.startPortalGroup) {
        const lookTarget = this.startPortalGroup.position
          .clone()
          .add(new Vector3(0, 0, 10)); // Look slightly "out"
        this.activeCharacter.mesh.lookAt(lookTarget);
        // Update camera immediately after player rotation
        this.thirdPersonCamera?.update(0.01, this.collidableObjects);
      }
    }

    // Ensure all characters have game reference and displays (if NPC)
    this.entities.forEach((entity) => {
      if (entity instanceof Character) {
        entity.game = this;
        if (entity.userData.isNPC) {
          entity.initIntentDisplay();
          entity.initNameDisplay();
        }
      } else if (entity instanceof Group && entity.userData.isSimpleObject) {
        // Simple objects might need game ref later?
      }
    });

    // Start music on first interaction (pointer lock)
    document.addEventListener("pointerlockchange", () => {
      if (
        document.pointerLockElement === this.renderer?.domElement &&
        this.audioElement?.paused
      ) {
        this.audioElement
          .play()
          .catch((e) => console.warn("Audio play failed:", e));
      }
    });
  }

  initRenderer(): WebGLRenderer {
    const renderer = new WebGLRenderer({
      antialias: true,
      powerPreference: "high-performance",
    });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = PCFSoftShadowMap;
    document.getElementById("game-container")?.appendChild(renderer.domElement);
    return renderer;
  }

  initScene(): Scene {
    const scene = new Scene();
    scene.background = new Color(Colors.BACKGROUND);
    scene.fog = new Fog(Colors.BACKGROUND, 150, 600);
    setupLighting(scene);
    const terrain = createTerrain(WORLD_SIZE);
    scene.add(terrain);
    this.collidableObjects.push(terrain); // Add terrain for physics
    createWorldBoundary(scene, WORLD_SIZE, this.collidableObjects);
    return scene;
  }

  initCamera(): PerspectiveCamera {
    return new PerspectiveCamera(
      75,
      window.innerWidth / window.innerHeight,
      0.1,
      2000
    );
  }

  initAudio(): void {
    this.audioElement = new Audio("assets/background.mp3");
    this.audioElement.loop = true;
    this.audioElement.volume = 0.3;
  }

  initPlayer(
    models: Record<string, { scene: Group; animations: AnimationClip[] }>
  ): void {
    let spawnPos = new Vector3(0, 0, 5); // Default spawn
    if (this.hasEnteredFromPortal) {
      spawnPos = new Vector3(0, 0, 15); // Spawn further from start portal
    }
    spawnPos.y = getTerrainHeight(this.scene, spawnPos.x, spawnPos.z);

    const playerModel = models.player;
    const playerInventory = new Inventory(9); // Player inventory size
    this.activeCharacter = new Character(
      this.scene,
      spawnPos,
      "Player",
      playerModel.scene,
      playerModel.animations,
      playerInventory
    );
    this.activeCharacter.userData.isPlayer = true;
    this.activeCharacter.userData.isNPC = false;
    this.activeCharacter.aiController = null; // Player has no AI
    this.activeCharacter.game = this; // Link player to game

    this.entities.push(this.activeCharacter);
    this.collidableObjects.push(this.activeCharacter.mesh!);
    this.interactableObjects.push(this.activeCharacter); // Player can be interacted with? (Maybe for future features)
  }

  initControls(): void {
    if (!this.activeCharacter || !this.activeCharacter.mesh)
      throw new Error("Player character not initialized before controls.");
    this.thirdPersonCamera = new ThirdPersonCamera(
      this.camera,
      this.activeCharacter.mesh
    );
    this.controls = new Controls(
      this.activeCharacter,
      this.thirdPersonCamera,
      this.renderer.domElement,
      this
    );
  }

  initMobileControls(): void {
    if (!this.controls)
      throw new Error(
        "Desktop controls must be initialized before mobile controls."
      );
    this.mobileControls = new MobileControls(this, this.controls);
  }

  initPhysics(): void {
    if (!this.activeCharacter)
      throw new Error("Player character not initialized before physics.");
    this.physics = new Physics(this.activeCharacter, this.collidableObjects);
  }

  initEnvironment(
    models: Record<string, { scene: Group; animations: AnimationClip[] }>
  ): void {
    populateEnvironment(
      this.scene,
      WORLD_SIZE,
      this.collidableObjects,
      this.interactableObjects,
      this.entities,
      models,
      this
    );
  }

  initSystems(): void {
    if (!this.activeCharacter || !this.controls)
      throw new Error(
        "Player character or controls not initialized before systems."
      );
    this.interactionSystem = new InteractionSystem(
      this.activeCharacter,
      this.camera,
      this.interactableObjects,
      this.controls,
      this
    );
  }

  initQuests(): void {
    this.quests = [
      {
        name: "Meet Brynn",
        description: "Find and talk to Blacksmith Brynn.",
        isCompleted: false,
        checkCompletion: (target, response) =>
          target.name === "Blacksmith Brynn" &&
          response.toLowerCase().includes("brynn"),
      },
      {
        name: "Rock Collection",
        description: "Ask Farmer Giles to collect rocks.",
        isCompleted: false,
        checkCompletion: (target, response) =>
          target.name === "Farmer Giles" &&
          (response.toLowerCase().includes("ok") ||
            response.toLowerCase().includes("agree")) &&
          response.toLowerCase().includes("rock"),
      },
      // { name: "Hunter's Task", description: "Convince Hunter Rex to deal with Brynn.", isCompleted: false, checkCompletion: (target, response) => target.name === "Hunter Rex" && (response.toLowerCase().includes("ok") || response.toLowerCase().includes("agree")) && response.toLowerCase().includes("kill") && response.toLowerCase().includes("brynn") }, // Example of a more complex quest
    ];
  }

  initUI(): void {
    if (!this.activeCharacter)
      throw new Error("Player character not initialized before UI.");
    this.hud = new HUD(this.activeCharacter);
    const minimapCanvas = document.getElementById(
      "minimap-canvas"
    ) as HTMLCanvasElement;
    if (minimapCanvas) {
      this.minimap = new Minimap(
        minimapCanvas,
        this.activeCharacter,
        this.entities,
        WORLD_SIZE
      );
    } else {
      console.error("Minimap canvas not found!");
    }
    this.inventoryDisplay = new InventoryDisplay(
      this.activeCharacter.inventory!
    );
    this.journalDisplay = new JournalDisplay(
      this.activeCharacter.eventLog,
      this
    );
  }

  setupUIControls(): void {
    if (!this.controls) return;
    // Inventory Toggle (I key or Mobile Button)
    this.controls.addKeyDownListener("KeyI", () => {
      if (this.isUIBlockingGameplay()) return;
      this.journalDisplay?.hide();
      this.inventoryDisplay?.toggle();
      this.setPauseState(this.inventoryDisplay?.isOpen ?? false);
    });
    // Journal Toggle (J key or Mobile Button)
    this.controls.addKeyDownListener("KeyJ", () => {
      if (this.isUIBlockingGameplay()) return;
      this.inventoryDisplay?.hide();
      this.journalDisplay?.toggle();
      this.setPauseState(this.journalDisplay?.isOpen ?? false);
    });
    // Self Heal (H key) - No mobile equivalent yet
    this.controls.addKeyDownListener("KeyH", () => {
      if (!this.isPaused && !this.interactionSystem?.isChatOpen) {
        this.activeCharacter?.selfHeal();
      }
    });
    // Switch Control (C key) - Desktop only for now
    this.controls.addKeyDownListener("KeyC", () => {
      if (
        this.interactionSystem?.currentTarget instanceof Character &&
        this.interactionSystem.currentTarget !== this.activeCharacter
      ) {
        this.switchControlTo(this.interactionSystem.currentTarget);
      }
    });
    // Escape Key handled in Controls class

    // Inventory Click (Desktop)
    this.controls.addMouseClickListener(0, (event: MouseEvent) => {
      if (this.inventoryDisplay?.isOpen) this.handleInventoryClick(event);
    });
  }

  handleInventoryClick(event: MouseEvent): void {
    const slotElement = (event.target as HTMLElement)?.closest(
      ".inventory-slot"
    ) as HTMLElement | null;
    if (!slotElement || !this.activeCharacter?.inventory) return;
    const index = parseInt(slotElement.dataset.index ?? "-1", 10);
    if (index === -1) return;
    const item = this.activeCharacter.inventory.getItem(index);
    if (!item) return;
    this.logEvent(
      this.activeCharacter,
      "examine",
      `Examined ${item.name}.`,
      undefined,
      { item: item.name },
      this.activeCharacter.mesh!.position
    );
    event.stopPropagation(); // Prevent click from closing inventory if clicking on slot
  }

  setPauseState(paused: boolean): void {
    if (this.isPaused === paused) return;
    this.isPaused = paused;

    // Handle pointer lock only on desktop
    if (!this.mobileControls?.isActive()) {
      if (this.isPaused && this.controls?.isPointerLocked) {
        this.controls.unlockPointer();
      } else if (
        !this.isPaused &&
        !this.isUIBlockingGameplay() &&
        !document.pointerLockElement
      ) {
        this.controls?.lockPointer();
      }
    }
    // console.log("Game Paused:", this.isPaused); // Optional debug log
  }

  // Helper to check if any UI element prevents gameplay/pointer lock
  isUIBlockingGameplay(): boolean {
    return (
      this.inventoryDisplay?.isOpen ||
      this.journalDisplay?.isOpen ||
      this.interactionSystem?.isChatOpen ||
      false
    );
  }

  start(): void {
    if (!this.renderer || !this.clock) return;
    this.showWelcomeMessage();
    this.renderer.setAnimationLoop(this.update.bind(this));
  }

  showWelcomeMessage(): void {
    const banner = document.getElementById("welcome-banner");
    if (!banner) return;
    const isMobile = this.mobileControls?.isActive();
    const welcomeText = isMobile
      ? "Welcome! Use joysticks & buttons."
      : "Welcome! [WASD] Move, Mouse Look, [I] Inv, [J] Journal, [E] Interact, [F] Attack, [H] Heal, [C] Switch, [Esc] Unlock/Close";
    banner.textContent = welcomeText;
    banner.classList.remove("hidden");
    setTimeout(() => banner.classList.add("hidden"), 5000);
  }

  update(): void {
    if (
      !this.clock ||
      !this.renderer ||
      !this.scene ||
      !this.camera ||
      !this.activeCharacter
    )
      return;
    const deltaTime = Math.min(this.clock.getDelta(), 0.05); // Clamp delta time
    const elapsedTime = this.clock.elapsedTime;

    // Update controls (Mobile first, then Desktop which incorporates mobile state)
    this.mobileControls?.update(deltaTime);
    this.controls?.update(deltaTime);

    if (!this.isPaused) {
      // Update active character (player) based on controls
      this.activeCharacter.update(deltaTime, {
        moveState: this.controls!.moveState,
        collidables: this.collidableObjects,
      });

      // Update physics (handles player movement/collision)
      this.physics?.update(deltaTime);

      // Update other entities (NPCs, simple objects with update logic)
      this.entities.forEach((entity) => {
        if (entity === this.activeCharacter) return;
        if (entity instanceof Character && entity.aiController) {
          const aiMoveState = entity.aiController.computeAIMoveState(deltaTime);
          entity.update(deltaTime, {
            moveState: aiMoveState,
            collidables: this.collidableObjects,
          });
          entity.aiController.updateObservation(this.entities); // Update AI observation after movement
        } else if (
          entity.update &&
          typeof entity.update === "function" &&
          !(entity instanceof Character)
        ) {
          // Update simple objects if they have an update method
          entity.update(deltaTime);
        }
      });

      // Update systems
      this.interactionSystem?.update(deltaTime);
      this.thirdPersonCamera?.update(deltaTime, this.collidableObjects);

      // Check game state changes
      if (this.activeCharacter.isDead) this.respawnPlayer();
      this.animatePortals();
      this.checkPortalCollisions();
    }

    // Update UI and effects regardless of pause state (except particle movement)
    this.updateParticleEffects(elapsedTime, deltaTime);
    this.hud?.update();
    this.minimap?.update();

    // Render the scene
    this.renderer.render(this.scene, this.camera);
  }

  // --- Portal Methods ---
  createPortalGroup(
    position: Vector3,
    color: number,
    labelText: string | null
  ): Group {
    const group = new Group();
    group.position.copy(position);
    group.position.y = getTerrainHeight(this.scene, position.x, position.z) + 5; // Place above terrain

    const radius = 5;
    const tube = 1.5;

    // Torus Ring
    const torusGeo = new TorusGeometry(radius, tube, 16, 100);
    const torusMat = new MeshPhongMaterial({
      color,
      emissive: color,
      transparent: true,
      opacity: 0.8,
    });
    group.add(new Mesh(torusGeo, torusMat));

    // Inner Disc
    const innerGeo = new CircleGeometry(radius - tube, 32);
    const innerMat = new MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.5,
      side: DoubleSide,
    });
    group.add(new Mesh(innerGeo, innerMat));

    // Label (Optional)
    if (labelText) {
      const canvas = document.createElement("canvas");
      canvas.width = 512;
      canvas.height = 64;
      const context = canvas.getContext("2d");
      if (context) {
        context.fillStyle = `#${color.toString(16).padStart(6, "0")}`;
        context.font = "bold 24px Arial";
        context.textAlign = "center";
        context.textBaseline = "middle";
        context.fillText(labelText, canvas.width / 2, canvas.height / 2);
        const texture = new CanvasTexture(canvas);
        const labelGeo = new PlaneGeometry(radius * 2, 3); // Adjust size
        const labelMat = new MeshBasicMaterial({
          map: texture,
          transparent: true,
          side: DoubleSide,
        });
        const label = new Mesh(labelGeo, labelMat);
        label.position.y = radius + 2; // Position above torus
        group.add(label);
      }
    }
    return group;
  }

  createPortalParticles(
    radius: number,
    tube: number,
    color: Color
  ): { geometry: BufferGeometry; system: Points } {
    const count = 1000;
    const geometry = new BufferGeometry();
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    const baseColor = color;

    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const r = radius + (Math.random() - 0.5) * tube * 2;
      const idx = i * 3;
      positions[idx] = Math.cos(angle) * r;
      positions[idx + 1] = Math.sin(angle) * r;
      positions[idx + 2] = (Math.random() - 0.5) * 4; // Z-spread

      colors[idx] = baseColor.r + (Math.random() - 0.5) * 0.2;
      colors[idx + 1] = baseColor.g + (Math.random() - 0.5) * 0.2;
      colors[idx + 2] = baseColor.b + (Math.random() - 0.5) * 0.2;
    }
    geometry.setAttribute("position", new BufferAttribute(positions, 3));
    geometry.setAttribute("color", new BufferAttribute(colors, 3));
    const material = new PointsMaterial({
      size: 0.2,
      vertexColors: true,
      transparent: true,
      opacity: 0.6,
    });
    const system = new Points(geometry, material);
    return { geometry, system };
  }

  createExitPortal(): void {
    const position = new Vector3(-30, 0, -40); // Off-center position
    this.exitPortalGroup = this.createPortalGroup(
      position,
      Colors.EXIT_PORTAL,
      "VIBEVERSE PORTAL"
    );
    this.exitPortalGroup.rotation.y = Math.PI / 4; // Slight rotation

    const { geometry, system } = this.createPortalParticles(
      5,
      1.5,
      new Color(Colors.EXIT_PORTAL)
    );
    this.exitPortalParticles = geometry;
    this.exitPortalGroup.add(system);

    this.scene.add(this.exitPortalGroup);
    this.exitPortalBox = new Box3().setFromObject(this.exitPortalGroup);
  }

  createStartPortal(): void {
    const position = new Vector3(0, 0, 5); // Near default spawn
    let label = "Return Portal";
    if (this.startPortalRefUrl) {
      try {
        const urlObj = new URL(
          this.startPortalRefUrl.startsWith("http")
            ? this.startPortalRefUrl
            : "https://" + this.startPortalRefUrl
        );
        label = `Return to: ${urlObj.hostname}`;
      } catch (e) {
        /* Use default label */
      }
    }
    this.startPortalGroup = this.createPortalGroup(
      position,
      Colors.START_PORTAL,
      label
    );
    this.startPortalGroup.rotation.y = -Math.PI / 2; // Face towards player spawn area

    const { geometry, system } = this.createPortalParticles(
      5,
      1.5,
      new Color(Colors.START_PORTAL)
    );
    this.startPortalParticles = geometry;
    this.startPortalGroup.add(system);

    this.scene.add(this.startPortalGroup);
    this.startPortalBox = new Box3().setFromObject(this.startPortalGroup);
  }

  animatePortals(): void {
    const time = Date.now() * 0.001;
    const animateParticleSystem = (particles: BufferGeometry | null) => {
      if (!particles) return;
      const positions = particles.attributes.position.array as Float32Array;
      for (let i = 0; i < positions.length; i += 3) {
        // Simple oscillation - adjust Y based on sine wave
        positions[i + 1] += 0.05 * Math.sin(time + i * 0.1); // Adjust frequency/amplitude as needed
      }
      particles.attributes.position.needsUpdate = true;
    };
    animateParticleSystem(this.exitPortalParticles);
    animateParticleSystem(this.startPortalParticles);
  }

  checkPortalCollisions(): void {
    if (!this.activeCharacter?.mesh) return;
    const playerBox = new Box3().setFromObject(this.activeCharacter.mesh);

    // Exit Portal Check
    if (
      this.exitPortalGroup &&
      this.exitPortalBox &&
      playerBox.intersectsBox(this.exitPortalBox)
    ) {
      const params = new URLSearchParams({
        username: this.activeCharacter.name,
        color: "white", // Example param
        speed: this.activeCharacter.velocity.length().toFixed(2),
        ref: window.location.href,
        speed_x: this.activeCharacter.velocity.x.toFixed(2),
        speed_y: this.activeCharacter.velocity.y.toFixed(2),
        speed_z: this.activeCharacter.velocity.z.toFixed(2),
      });
      const nextPage = `http://portal.pieter.com?${params.toString()}`;
      window.location.href = nextPage; // Redirect
    }

    // Start Portal Check
    if (
      this.startPortalGroup &&
      this.startPortalBox &&
      this.startPortalRefUrl &&
      this.startPortalOriginalParams &&
      playerBox.intersectsBox(this.startPortalBox)
    ) {
      let url = this.startPortalRefUrl;
      if (!url.startsWith("http")) url = "https://" + url;
      // Forward original params, excluding portal-specific ones
      const forwardParams = new URLSearchParams();
      for (const [key, value] of this.startPortalOriginalParams) {
        if (key !== "ref" && key !== "portal") forwardParams.append(key, value);
      }
      const paramString = forwardParams.toString();
      window.location.href = url + (paramString ? "?" + paramString : ""); // Redirect back
    }
  }

  // --- Particle Effects ---
  spawnParticleEffect(position: Vector3, colorName: "red" | "green"): void {
    if (!this.scene || !this.clock) return;
    const particleCount = 10;
    const particleSize = 0.07;
    const effectDuration = 1.0; // seconds
    const spreadRadius = 0.3;
    const particleSpeed = 1.5;
    const color = colorName === "red" ? 0xff0000 : 0x00ff00;

    const effectGroup = new Group();
    effectGroup.position.copy(position);
    const geometry = new SphereGeometry(particleSize, 4, 2); // Simple geometry

    for (let i = 0; i < particleCount; i++) {
      const material = new MeshBasicMaterial({
        color,
        transparent: true,
        opacity: 1.0,
      });
      const particle = new Mesh(geometry, material);
      const initialOffset = new Vector3(
        (Math.random() - 0.5) * spreadRadius * 2,
        (Math.random() - 0.5) * spreadRadius * 2,
        (Math.random() - 0.5) * spreadRadius * 2
      );
      particle.position.copy(initialOffset);
      particle.userData.velocity = initialOffset
        .clone()
        .normalize()
        .multiplyScalar(particleSpeed * (0.5 + Math.random() * 0.5));
      effectGroup.add(particle);
    }

    effectGroup.userData.startTime = this.clock.elapsedTime;
    effectGroup.userData.duration = effectDuration;
    this.scene.add(effectGroup);
    this.particleEffects.push(effectGroup);
  }

  updateParticleEffects(elapsedTime: number, deltaTime: number): void {
    if (!this.scene) return;
    const particleDeltaTime = this.isPaused ? 0 : deltaTime; // Don't move particles if paused

    for (let i = this.particleEffects.length - 1; i >= 0; i--) {
      const effect = this.particleEffects[i];
      const effectElapsedTime = elapsedTime - effect.userData.startTime;
      const progress = Math.min(
        1.0,
        effectElapsedTime / effect.userData.duration
      );

      if (progress >= 1.0) {
        // Remove effect
        effect.traverse((child) => {
          if (child instanceof Mesh) {
            child.geometry?.dispose();
            if (Array.isArray(child.material))
              child.material.forEach((m) => m.dispose());
            else child.material?.dispose();
          }
        });
        this.scene.remove(effect);
        this.particleEffects.splice(i, 1);
        continue;
      }

      // Update particles
      effect.children.forEach((particle) => {
        if (particle instanceof Mesh) {
          // Move particle if not paused
          if (!this.isPaused && particle.userData.velocity) {
            particle.position.addScaledVector(
              particle.userData.velocity,
              particleDeltaTime
            );
          }
          // Fade out particle
          const mat = particle.material as MeshBasicMaterial; // Assume MeshBasicMaterial
          if (mat.opacity !== undefined) {
            mat.opacity = 1.0 - progress;
            mat.needsUpdate = true;
          }
        }
      });
    }
  }

  // --- Game State & Player Management ---
  respawnPlayer(): void {
    if (!this.activeCharacter || !this.activeCharacter.inventory) return;
    this.logEvent(
      this.activeCharacter,
      "respawn_start",
      `${this.activeCharacter.name} blacked out...`,
      undefined,
      {},
      this.activeCharacter.mesh!.position
    );

    // Gold penalty (example)
    const goldCount = this.activeCharacter.inventory.countItem("gold");
    const goldPenalty = Math.min(10, Math.floor(goldCount * 0.1));
    if (goldPenalty > 0) {
      this.activeCharacter.inventory.removeItem("gold", goldPenalty);
      this.logEvent(
        this.activeCharacter,
        "penalty",
        `Lost ${goldPenalty} gold.`,
        undefined,
        { item: "gold", amount: goldPenalty },
        this.activeCharacter.mesh!.position
      );
    }

    const respawnPos = new Vector3(0, 0, 10); // Respawn near village center
    respawnPos.y = getTerrainHeight(this.scene, respawnPos.x, respawnPos.z);
    this.activeCharacter.respawn(respawnPos);
    this.setPauseState(false);
    this.interactionSystem?.cancelGatherAction(); // Ensure gather is cancelled
  }

  switchControlTo(targetCharacter: Character): void {
    if (
      !this.activeCharacter ||
      targetCharacter === this.activeCharacter ||
      !targetCharacter.mesh ||
      targetCharacter.isDead
    )
      return;

    const oldPlayer = this.activeCharacter;
    const newPlayer = targetCharacter;

    this.logEvent(
      oldPlayer,
      "control_switch_out",
      `Switched control to ${newPlayer.name}.`,
      newPlayer,
      {},
      oldPlayer.mesh!.position
    );
    this.logEvent(
      newPlayer,
      "control_switch_in",
      `Switched control from ${oldPlayer.name}.`,
      oldPlayer,
      {},
      newPlayer.mesh!.position
    );

    // --- Update Old Player (becomes NPC) ---
    oldPlayer.userData.isPlayer = false;
    oldPlayer.userData.isNPC = true;
    if (!oldPlayer.aiController) {
      // Add AI if it doesn't exist
      oldPlayer.aiController = new AIController(oldPlayer);
      oldPlayer.aiController.persona = oldPlayer.persona; // Ensure persona is set
    }
    oldPlayer.aiController!.resetActionState(); // Reset AI
    oldPlayer.initNameDisplay(); // Show NPC displays
    oldPlayer.initIntentDisplay();

    // --- Update New Player ---
    newPlayer.userData.isPlayer = true;
    newPlayer.userData.isNPC = false;
    newPlayer.aiController = null; // Remove AI controller
    newPlayer.removeDisplays(); // Hide NPC displays

    // --- Update Game Systems ---
    this.activeCharacter = newPlayer;
    this.controls!.player = newPlayer;
    this.thirdPersonCamera!.target = newPlayer.mesh!;
    this.physics!.player = newPlayer;
    this.interactionSystem!.setActivePlayer(newPlayer); // Update interaction system's player ref
    this.hud!.player = newPlayer;
    this.minimap?.setActivePlayer(newPlayer); // Update minimap's player ref
    this.inventoryDisplay!.setInventory(newPlayer.inventory!);
    this.journalDisplay!.setEventLog(newPlayer.eventLog);

    // --- Reset UI State ---
    this.inventoryDisplay!.hide();
    this.journalDisplay!.hide();
    this.interactionSystem!.closeChatInterface();
    this.setPauseState(false); // Ensure game is unpaused

    console.log(`Control switched to: ${newPlayer.name}`);
  }

  checkQuestCompletion(
    interactionTarget: Character,
    chatResponse: string
  ): void {
    this.quests?.forEach((quest) => {
      if (
        !quest.isCompleted &&
        quest.checkCompletion(interactionTarget, chatResponse)
      ) {
        quest.isCompleted = true;
        this.showCongratulationMessage(`Quest Completed: ${quest.name}`);
        this.logEvent(
          this.activeCharacter!,
          "quest_complete",
          `Completed quest: ${quest.name}`,
          interactionTarget,
          { quest: quest.name },
          interactionTarget.mesh!.position
        );
        this.journalDisplay?.updateQuests(); // Update journal UI
      }
    });
  }

  showCongratulationMessage(message: string): void {
    const banner = document.getElementById("welcome-banner");
    if (banner) {
      banner.textContent = message;
      banner.classList.remove("hidden");
      setTimeout(() => banner.classList.add("hidden"), 5000);
    }
  }

  onWindowResize(): void {
    if (this.camera && this.renderer) {
      this.camera.aspect = window.innerWidth / window.innerHeight;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(window.innerWidth, window.innerHeight);
      // Re-initialize mobile controls if layout changes significantly?
      // Consider if needed based on joystick/button positioning method
    }
  }

  // Centralized Event Logging
  logEvent(
    actor: Entity | string,
    action: string,
    message: string,
    target?: Entity | string | undefined,
    details: Record<string, any> = {},
    location?: Vector3
  ): void {
    const actorId = typeof actor === "string" ? actor : actor.id;
    const actorName = typeof actor === "string" ? actor : actor.name;
    const targetId = typeof target === "string" ? target : target?.id;
    const targetName = typeof target === "string" ? target : target?.name;

    const eventEntry: EventEntry = {
      timestamp: new Date().toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      }),
      message,
      actorId,
      actorName,
      action,
      targetId,
      targetName,
      details,
      location,
    };

    // Distribute event to all characters' logs
    this.entities.forEach((entity) => {
      if (entity instanceof Character && entity.eventLog) {
        entity.eventLog.addEntry(eventEntry); // Pass the structured entry
      }
    });
  }
}

// =============================================================================
// Main Execution
// =============================================================================

declare global {
  interface Window {
    game: Game;
  }
}

if (WebGL.isWebGL2Available()) {
  async function startGame() {
    try {
      const gameInstance = new Game();
      window.game = gameInstance; // Make accessible globally for debugging
      await gameInstance.init();
      gameInstance.start();

      const onResize = () => gameInstance.onWindowResize();
      window.addEventListener("resize", onResize, false);
      // Cleanup listener on unload
      window.addEventListener("beforeunload", () =>
        window.removeEventListener("resize", onResize)
      );
    } catch (error) {
      console.error("Failed to initialize game:", error);
      const errorDiv = document.createElement("div");
      errorDiv.style.color = "red";
      errorDiv.style.padding = "20px";
      errorDiv.innerHTML = `<h2>Game Initialization Failed</h2><p>${(error as Error).message}</p><pre>${(error as Error).stack}</pre>`;
      document.getElementById("game-container")?.appendChild(errorDiv);
    }
  }
  startGame();
} else {
  const warning = WebGL.getWebGLErrorMessage();
  document.getElementById("game-container")?.appendChild(warning);
}
