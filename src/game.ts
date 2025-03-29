import * as THREE from 'three';
import { setupLighting } from './world/lighting';
import { createTerrain } from './world/terrain';
import { Player } from './entities/player';
import { Controls } from './systems/controls';
import { ThirdPersonCamera } from './systems/camera';
import { HUD } from './ui/hud';
import { Minimap } from './ui/minimap';
import { Inventory } from './systems/inventory';
import { InventoryDisplay } from './ui/inventoryDisplay';
import { InteractionSystem, InteractableObject } from './systems/interaction';
import { populateEnvironment, createWorldBoundary } from './world/environment';
import { Physics } from './systems/physics';
import { QuestLog, EventLog } from './systems/quest';
import { JournalDisplay } from './ui/journal';
import { Entity } from './entities/entity'; // Import base type

const WORLD_SIZE = 1000;
const TERRAIN_SEGMENTS = 150;

// --- Global Reference ---
// Use carefully, primarily for debugging or specific UI/control needs.
// Define a type for the global game instance if needed elsewhere.
// declare global { interface Window { game: Game | null; } }
(window as any).game = null;

// --- Helper Function ---
// Gets terrain height at XZ coords using raycasting.
// Placed here as it needs access to the scene after initialization.
function getTerrainHeight(x: number, z: number): number {
    const game = (window as any).game as Game | null;
    const terrain = game?.scene?.getObjectByName("Terrain") as THREE.Mesh | undefined;
    if (!terrain) return 0; // Default height if terrain not ready

    // Reuse a single raycaster if possible, or create locally
    const raycaster = new THREE.Raycaster(new THREE.Vector3(x, 200, z), new THREE.Vector3(0, -1, 0)); // Start high
    const intersects = raycaster.intersectObject(terrain);
    return intersects.length > 0 ? intersects[0].point.y : 0;
}

// --- Game Class ---
class Game {
    // Core Three.js components
    public scene: THREE.Scene | null = null;
    public renderer: THREE.WebGLRenderer | null = null;
    public camera: THREE.PerspectiveCamera | null = null;
    private clock: THREE.Clock | null = null;

    // Player and Camera Control
    public player: Player | null = null;
    private thirdPersonCamera: ThirdPersonCamera | null = null;
    private controls: Controls | null = null;

    // Systems
    private physics: Physics | null = null;
    public inventory: Inventory | null = null; // Public for potential access by items/UI
    public questLog: QuestLog | null = null;   // Public for NPCs/UI
    public eventLog: EventLog | null = null;   // Public for entities/UI
    private interactionSystem: InteractionSystem | null = null;

    // UI Components
    private hud: HUD | null = null;
    private minimap: Minimap | null = null;
    private inventoryDisplay: InventoryDisplay | null = null;
    private journalDisplay: JournalDisplay | null = null;

    // Game Object Collections (references to objects in the scene)
    // Entities requiring .update() calls
    public entities: Array<Entity | THREE.Object3D> = [];
    // Objects for physics collision checks (meshes/groups)
    public collidableObjects: THREE.Object3D[] = [];
    // Objects/Entities the player can interact with (instances or groups)
    public interactableObjects: Array<Entity | InteractableObject | THREE.Object3D> = [];

    public isPaused: boolean = false;

    constructor() {
        (window as any).game = this; // Set global reference
    }

    public init(): void {
        console.log("Initializing game...");
        this.clock = new THREE.Clock();

        // Renderer
        this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.setPixelRatio(window.devicePixelRatio);
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap; // Softer shadows
        document.getElementById('game-container')?.appendChild(this.renderer.domElement);

        // Scene
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x87CEEB); // Sky blue
        this.scene.fog = new THREE.Fog(0x87CEEB, 150, 600); // Distance fog

        // Camera
        this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 2000);

        // Core Systems Initialization
        this.inventory = new Inventory(24);
        this.questLog = new QuestLog();
        this.eventLog = new EventLog(75);

        // World Setup (Lighting, Terrain, Boundaries)
        setupLighting(this.scene);
        const terrain = createTerrain(WORLD_SIZE, TERRAIN_SEGMENTS);
        this.scene.add(terrain);
        this.collidableObjects.push(terrain);
        createWorldBoundary(this.scene, WORLD_SIZE, this.collidableObjects);

        // Player Setup
        const playerSpawnPos = new THREE.Vector3(0, 0, 5); // Near village
        playerSpawnPos.y = getTerrainHeight(playerSpawnPos.x, playerSpawnPos.z) + 0.5; // Place on terrain
        this.player = new Player(this.scene, playerSpawnPos);
        this.entities.push(this.player);
        this.collidableObjects.push(this.player.mesh);
        this.player.setJournal(this.questLog, this.eventLog);

        // Camera Controller & Controls (Depend on Player)
        this.thirdPersonCamera = new ThirdPersonCamera(this.camera, this.player.mesh);
        this.controls = new Controls(this.player, this.thirdPersonCamera, this.renderer.domElement);

        // Physics System (Depends on Player & Collidables list)
        this.physics = new Physics(this.player, this.collidableObjects);

        // Populate Environment (Adds NPCs, Animals, items, etc. to collections)
        populateEnvironment(
            this.scene, WORLD_SIZE, this.collidableObjects,
            this.interactableObjects, this.entities,
            this.questLog, this.inventory, this.eventLog
        );

        // Interaction System (Depends on Player, Camera, Controls, Inventory, Logs, Interactables list)
        this.interactionSystem = new InteractionSystem(
            this.player, this.camera, this.interactableObjects,
            this.controls, this.inventory, this.eventLog
        );

        // UI Setup (Depend on various systems)
        this.hud = new HUD(this.player);
        this.minimap = new Minimap(document.getElementById('minimap-canvas') as HTMLCanvasElement | null, this.player, this.entities, WORLD_SIZE);
        this.inventoryDisplay = new InventoryDisplay(this.inventory);
        this.journalDisplay = new JournalDisplay(this.questLog, this.eventLog, this.inventory);

        // UI Controls Setup (Depends on Controls & UI Panels)
        this.setupUIControls();

        this.eventLog.addEntry("Welcome! Click window to lock controls. [I] Inventory, [J] Journal, [E] Interact, [Esc] Unlock/Close UI");
        console.log("Game initialization complete.");
    }

    private setupUIControls(): void {
        if (!this.controls || !this.inventoryDisplay || !this.journalDisplay) return;

        // Toggle Inventory
        this.controls.addKeyDownListener('KeyI', () => {
            this.journalDisplay?.hide(); // Close journal if open
            this.inventoryDisplay?.toggle();
            this.setPauseState(this.inventoryDisplay?.isOpen ?? false);
        });

        // Toggle Journal
        this.controls.addKeyDownListener('KeyJ', () => {
            this.inventoryDisplay?.hide(); // Close inventory if open
            this.journalDisplay?.toggle();
            this.setPauseState(this.journalDisplay?.isOpen ?? false);
        });

        // Close UI / Unlock Pointer with Escape
        this.controls.addKeyDownListener('Escape', () => {
            if (this.inventoryDisplay?.isOpen) {
                this.inventoryDisplay.hide();
                this.setPauseState(false);
            } else if (this.journalDisplay?.isOpen) {
                this.journalDisplay.hide();
                this.setPauseState(false);
            } else if (this.controls?.isPointerLocked) {
                this.controls.unlockPointer();
                 // Optionally pause when manually unlocking pointer?
                 // this.setPauseState(true);
            }
        });

        // Handle clicks within inventory UI (example: use item)
        this.controls.addMouseClickListener(0, (event: MouseEvent) => { // Left Mouse Button (0)
            if (this.inventoryDisplay?.isOpen && event.target) {
                this.handleInventoryClick(event);
            }
        });
    }

    private handleInventoryClick(event: MouseEvent): void {
        if (!this.inventoryDisplay?.isOpen || !this.player || !this.inventory || !this.eventLog) return;

        const slotElement = (event.target as HTMLElement)?.closest('.inventory-slot') as HTMLElement | null;
        if (!slotElement) return;

        const index = parseInt(slotElement.dataset.index ?? '-1', 10);
        if (index === -1) return;

        const item = this.inventory.getItem(index);
        if (!item) return;

        console.log(`Clicked on item: ${item.name} in slot ${index}`);

        // Example: Use Health Potion
        if (item.name === 'Health Potion') {
            if (this.player.health < this.player.maxHealth) {
                this.player.heal(25); // Example heal amount
                if (this.inventory.removeItemByIndex(index, 1)) {
                    this.eventLog.addEntry(`Used a Health Potion. Ahh, refreshing!`);
                }
            } else {
                this.eventLog.addEntry(`Your health is already full.`);
            }
        } else {
            // Default action: examine
            this.eventLog.addEntry(`You examine the ${item.name}.`);
        }
         event.stopPropagation(); // Prevent click propagating further if needed
    }

    public setPauseState(paused: boolean): void {
        if (this.isPaused === paused) return;
        this.isPaused = paused;
        console.log(`Game ${paused ? 'paused' : 'resumed'}.`);

        if (!this.controls) return;

        if (this.isPaused) {
            // Release pointer lock when paused (e.g., UI open)
            this.controls.unlockPointer();
        } else {
            // Re-lock pointer when unpaused, ONLY if no UI panels are open
            if (!this.inventoryDisplay?.isOpen && !this.journalDisplay?.isOpen) {
                this.controls.lockPointer();
            }
        }
        // Game loop checks `isPaused` to skip updates.
    }

    public start(): void {
        if (!this.renderer || !this.clock) {
            console.error("Game not initialized properly. Call init() before start().");
            return;
        }
        console.log("Starting game loop...");
        this.renderer.setAnimationLoop(this.update.bind(this)); // Use bound update
    }

    private update(): void {
        if (!this.clock || !this.renderer || !this.scene || !this.camera || !this.player) return;

        const deltaTime = Math.min(this.clock.getDelta(), 0.05); // Cap delta time

        // Update controls (reads input) - runs even if paused for UI keys
        this.controls?.update(deltaTime);

        // --- Game Logic Updates (Runs only if NOT paused) ---
        if (!this.isPaused) {
            // Update Player (movement, physics state)
            this.player.update(deltaTime, this.controls!.moveState, this.collidableObjects);

            // Update Physics (collision response) AFTER player moves
            this.physics?.update(deltaTime);

            // Update other Entities (NPCs, Animals, animated objects like Windmill, Chest)
             this.entities.forEach(entity => {
                // Check if entity has an update method before calling
                if (entity !== this.player && typeof (entity as any).update === 'function') {
                    try {
                        (entity as any).update(deltaTime, this.player, this.collidableObjects);
                    } catch (error) {
                        console.error(`Error updating entity ${(entity as any).name ?? (entity as any).id}:`, error);
                    }
                }
             });

            // Update Interaction System (find targets, handle 'E' press)
            this.interactionSystem?.update(deltaTime);

            // Update Camera AFTER player/physics updates
            this.thirdPersonCamera?.update(deltaTime, this.collidableObjects);

            // Check for player death AFTER all updates for the frame
            if (this.player.isDead) {
                this.respawnPlayer();
                // Potentially skip rendering this frame? Might cause flicker.
            }
        } // End if (!isPaused)

        // --- UI Updates (Run even when paused) ---
        this.hud?.update();
        this.minimap?.update();
        // Inventory/Journal display updates handled by their own logic (callbacks/on open)

        // --- Render ---
        try {
            this.renderer.render(this.scene, this.camera);
        } catch (error) {
            console.error("Error during rendering:", error);
            // Consider stopping the loop or showing an error overlay
        }
    }

    private respawnPlayer(): void {
        if (!this.player || !this.inventory || !this.eventLog || !this.interactionSystem) return;

        console.log("Player died. Respawning...");
        this.eventLog.addEntry("You blacked out and woke up back near the village...");

        // Penalty Example: Lose some gold
        const goldCount = this.inventory.countItem('gold');
        const goldPenalty = Math.min(10, Math.floor(goldCount * 0.1));
        if (goldPenalty > 0) {
            this.inventory.removeItem('gold', goldPenalty);
            this.eventLog.addEntry(`You lost ${goldPenalty} gold.`);
        }

        // Reset to spawn point
        const respawnPos = new THREE.Vector3(0, 0, 10); // Village spawn
        respawnPos.y = getTerrainHeight(respawnPos.x, respawnPos.z) + 0.5;
        this.player.respawn(respawnPos);

        // Ensure game state is correct
        this.setPauseState(false); // Unpause
        this.interactionSystem.cancelGatherAction(); // Cancel any active gather

        // UI updates automatically in the loop
    }

    public onWindowResize(): void {
        if (this.camera && this.renderer) {
            this.camera.aspect = window.innerWidth / window.innerHeight;
            this.camera.updateProjectionMatrix();
            this.renderer.setSize(window.innerWidth, window.innerHeight);
            console.log("Window resized.");
        }
    }

    public dispose(): void {
        console.log("Disposing game...");
        if (this.renderer) {
            this.renderer.setAnimationLoop(null); // Stop loop
            this.renderer.domElement.parentNode?.removeChild(this.renderer.domElement);
            this.renderer.dispose(); // Free WebGL resources
        }
        this.controls?.dispose();
        this.inventoryDisplay?.dispose();
        this.journalDisplay?.dispose();

        // Dispose Three.js scene resources
        if (this.scene) {
            this.scene.traverse((object) => {
                if (!object) return;
                if (object instanceof THREE.Mesh) {
                    object.geometry?.dispose();
                    if (Array.isArray(object.material)) {
                        object.material.forEach(material => material?.dispose());
                    } else {
                        object.material?.dispose();
                    }
                }
            });
        }

        // Clear arrays and references
        this.entities = [];
        this.collidableObjects = [];
        this.interactableObjects = [];
        this.scene = null;
        this.player = null;
        // ... null out other references

        (window as any).game = null; // Clear global reference
        console.log("Game disposed.");
    }
}

export default Game; // Export the class