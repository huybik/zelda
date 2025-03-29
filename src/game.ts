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
import { InteractionSystem } from './systems/interaction'; // FIX: Removed InteractableObject (re-imported in environment)
import { populateEnvironment, createWorldBoundary } from './world/environment';
import { Physics } from './systems/physics';
import { QuestLog, EventLog } from './systems/quest';
import { JournalDisplay } from './ui/journal';
// FIX: Removed unused Entity import
// import { Entity } from './entities/entity';

const WORLD_SIZE = 1000; const TERRAIN_SEGMENTS = 150;
(window as any).game = null; // Global reference

// Local helper for terrain height (could be moved to a World utility)
function getTerrainHeight(x: number, z: number): number {
    const gameInstance = (window as any).game as Game | null; // Type cast
    const terrain = gameInstance?.scene?.getObjectByName("Terrain") as THREE.Mesh | undefined;
    if (!terrain?.geometry) return 0; // Check geometry too
    // Consider caching raycaster if performance is an issue
    const raycaster = new THREE.Raycaster(new THREE.Vector3(x, terrain.geometry.boundingBox?.max?.y ?? 200, z), new THREE.Vector3(0, -1, 0));
    const intersects = raycaster.intersectObject(terrain);
    return intersects[0]?.point.y ?? 0;
}

class Game {
    public scene: THREE.Scene | null = null;
    public renderer: THREE.WebGLRenderer | null = null;
    public camera: THREE.PerspectiveCamera | null = null;
    private clock: THREE.Clock | null = null;

    public player: Player | null = null;
    private thirdPersonCamera: ThirdPersonCamera | null = null;
    private controls: Controls | null = null;

    private physics: Physics | null = null;
    public inventory: Inventory | null = null;
    public questLog: QuestLog | null = null;
    public eventLog: EventLog | null = null;
    private interactionSystem: InteractionSystem | null = null;

    private hud: HUD | null = null; private minimap: Minimap | null = null;
    private inventoryDisplay: InventoryDisplay | null = null;
    private journalDisplay: JournalDisplay | null = null;

    // Collections (references, not owners)
    // Use more specific types if possible, 'any' for brevity if mixed types are complex
    public entities: Array<any> = []; // Entities/Objects requiring .update()
    public collidableObjects: THREE.Object3D[] = []; // Meshes/Groups for physics checks
    public interactableObjects: Array<any> = []; // Entities/Objects for interaction checks

    public isPaused: boolean = false;

    constructor() { (window as any).game = this; }

    public init(): void {
        console.log("Initializing game...");
        this.clock = new THREE.Clock();

        this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.setPixelRatio(window.devicePixelRatio);
        this.renderer.shadowMap.enabled = true; this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        document.getElementById('game-container')?.appendChild(this.renderer.domElement);

        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x87CEEB);
        this.scene.fog = new THREE.Fog(0x87CEEB, 150, 600);

        this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 2000);

        // Core Systems
        this.inventory = new Inventory(24); this.questLog = new QuestLog(); this.eventLog = new EventLog(75);

        // World
        setupLighting(this.scene);
        const terrain = createTerrain(WORLD_SIZE, TERRAIN_SEGMENTS);
        this.scene.add(terrain); this.collidableObjects.push(terrain);
        createWorldBoundary(this.scene, WORLD_SIZE, this.collidableObjects);

        // Player
        const spawnPos = new THREE.Vector3(0, 0, 5); spawnPos.y = getTerrainHeight(spawnPos.x, spawnPos.z) + 0.5;
        this.player = new Player(this.scene, spawnPos);
        this.entities.push(this.player); // Push the Player instance
        // FIX: Check player.mesh before adding to collidables
        if (this.player.mesh) {
             this.collidableObjects.push(this.player.mesh);
        }
        this.player.setJournal(this.questLog, this.eventLog);

        // Dependent Systems & UI (Ensure player, camera, inventory etc. exist)
        if (!this.player || !this.camera || !this.inventory || !this.questLog || !this.eventLog) {
             throw new Error("Failed to initialize core game components.");
        }

        // FIX: Check player.mesh before passing to camera/controls
        if (!this.player.mesh) {
            throw new Error("Player mesh failed to initialize.");
        }

        this.thirdPersonCamera = new ThirdPersonCamera(this.camera, this.player.mesh);
        this.controls = new Controls(this.player, this.thirdPersonCamera, this.renderer.domElement);
        this.physics = new Physics(this.player, this.collidableObjects);

        // Populate (fills collection arrays - ensure dependencies like questLog are passed)
        populateEnvironment(this.scene, WORLD_SIZE, this.collidableObjects, this.interactableObjects, this.entities, this.questLog, this.inventory, this.eventLog);

        this.interactionSystem = new InteractionSystem(this.player, this.camera, this.interactableObjects, this.controls, this.inventory, this.eventLog);

        this.hud = new HUD(this.player);
        this.minimap = new Minimap(document.getElementById('minimap-canvas') as HTMLCanvasElement | null, this.player, this.entities, WORLD_SIZE);
        this.inventoryDisplay = new InventoryDisplay(this.inventory);
        this.journalDisplay = new JournalDisplay(this.questLog, this.eventLog, this.inventory);

        this.setupUIControls();
        this.eventLog.addEntry("Welcome! Click to lock controls. [I] Inv, [J] Journal, [E] Interact, [Esc] Unlock/Close");
        console.log("Game initialization complete.");
    }

    private setupUIControls(): void {
        if (!this.controls || !this.inventoryDisplay || !this.journalDisplay) return;
        const togglePanel = (panel: InventoryDisplay | JournalDisplay, otherPanel: InventoryDisplay | JournalDisplay) => {
            otherPanel.hide(); panel.toggle(); this.setPauseState(panel.isOpen);
        };
        this.controls.addKeyDownListener('KeyI', () => togglePanel(this.inventoryDisplay!, this.journalDisplay!));
        this.controls.addKeyDownListener('KeyJ', () => togglePanel(this.journalDisplay!, this.inventoryDisplay!));
        this.controls.addKeyDownListener('Escape', () => {
            if (this.inventoryDisplay?.isOpen || this.journalDisplay?.isOpen) {
                this.inventoryDisplay?.hide(); this.journalDisplay?.hide(); this.setPauseState(false);
            } else if (this.controls?.isPointerLocked) this.controls.unlockPointer();
        });
        this.controls.addMouseClickListener(0, (e) => this.handleInventoryClick(e));
    }

    private handleInventoryClick(event: MouseEvent): void {
        if (!this.inventoryDisplay?.isOpen || !this.player || !this.inventory || !this.eventLog) return;
        const slotElement = (event.target as HTMLElement)?.closest('.inventory-slot') as HTMLElement | null;
        if (!slotElement) return;
        const index = parseInt(slotElement.dataset.index ?? '-1', 10);
        const item = this.inventory.getItem(index);
        if (!item) return;

        console.log(`Clicked item: ${item.name} in slot ${index}`);
        if (item.name === 'Health Potion') {
            if (this.player.health < this.player.maxHealth) {
                this.player.heal(25);
                if (this.inventory.removeItemByIndex(index, 1)) this.eventLog.addEntry(`Used a Health Potion.`);
            } else this.eventLog.addEntry(`Health already full.`);
        } else this.eventLog.addEntry(`You examine the ${item.name}.`);
        event.stopPropagation();
    }

    public setPauseState(paused: boolean): void {
        if (this.isPaused === paused) return;
        this.isPaused = paused; console.log(`Game ${paused ? 'paused' : 'resumed'}.`);
        if (!this.controls) return;
        if (paused) this.controls.unlockPointer();
        else if (!this.inventoryDisplay?.isOpen && !this.journalDisplay?.isOpen) this.controls.lockPointer();
    }

    public start(): void {
        if (!this.renderer || !this.clock) { console.error("Game not initialized."); return; }
        console.log("Starting game loop...");
        this.renderer.setAnimationLoop(this.update.bind(this));
    }

    private update(): void {
        if (!this.clock || !this.renderer || !this.scene || !this.camera || !this.player || !this.controls) return; // FIX: Add controls check
        const dt = Math.min(this.clock.getDelta(), 0.05); // Capped delta time

        this.controls.update(dt); // Read input even if paused

        if (!this.isPaused) {
            // Update player (uses controls.moveState via player's internal state)
            // Player's update now matches Entity signature, moveState is internal
            this.player.update(dt, undefined, this.collidableObjects); // Pass undefined for player arg

            // Update Physics AFTER player move intent
            this.physics?.update(dt);

            // Update other entities (NPC, Animal, Windmill, Chest etc.)
            this.entities.forEach(entity => {
                // Skip player, check for update method
                if (entity !== this.player && typeof entity.update === 'function') {
                    try {
                        // Pass player instance if the entity might need it (like Animal/NPC)
                        // Check if update signature expects player
                        // A safer approach might be a different update signature for interactive entities
                        if (entity.update.length >= 2) { // Check if update accepts at least 2 args (dt, player)
                            entity.update(dt, this.player, this.collidableObjects);
                        } else {
                             entity.update(dt); // Assume simple update like Windmill
                        }
                    }
                    catch (e) { console.error(`Error updating entity ${entity?.name ?? entity?.id}:`, e); }
                }
            });

            // Update Interaction (uses controls.moveState.interact)
            this.interactionSystem?.update(dt);

            // Update Camera AFTER physics/movement
            this.thirdPersonCamera?.update(dt, this.collidableObjects);

            if (this.player.isDead) this.respawnPlayer();
        }

        // UI Updates (always run)
        this.hud?.update(); this.minimap?.update();
        // Inv/Journal updated via callbacks or on show

        try { this.renderer.render(this.scene, this.camera); }
        catch (e) { console.error("Render error:", e); /* Consider stopping loop? */ }
    }

    private respawnPlayer(): void {
        if (!this.player || !this.inventory || !this.eventLog || !this.interactionSystem) return;
        console.log("Player died. Respawning...");
        this.eventLog.addEntry("You blacked out...");

        const goldPenalty = Math.min(10, Math.floor(this.inventory.countItem('gold') * 0.1));
        if (goldPenalty > 0) {
            this.inventory.removeItem('gold', goldPenalty); this.eventLog.addEntry(`Lost ${goldPenalty} gold.`);
        }

        const respawnPos = new THREE.Vector3(0, 0, 10); // Village spawn
        respawnPos.y = getTerrainHeight(respawnPos.x, respawnPos.z) + 0.5;
        this.player.respawn(respawnPos);
        this.setPauseState(false);
        this.interactionSystem.cancelGatherAction(); // Cancel any active gather
    }

    public onWindowResize(): void {
        if (this.camera && this.renderer) {
            this.camera.aspect = window.innerWidth / window.innerHeight;
            this.camera.updateProjectionMatrix();
            this.renderer.setSize(window.innerWidth, window.innerHeight);
        }
    }

    public dispose(): void {
        console.log("Disposing game...");
        this.renderer?.setAnimationLoop(null);
        // FIX: Check parentNode before removing
        if (this.renderer?.domElement.parentNode) {
            this.renderer.domElement.parentNode.removeChild(this.renderer.domElement);
        }
        this.renderer?.dispose();
        this.controls?.dispose(); this.inventoryDisplay?.dispose(); this.journalDisplay?.dispose();
        this.scene?.traverse(obj => { // Dispose scene resources
            if (obj instanceof THREE.Mesh) {
                obj.geometry?.dispose();
                const material = obj.material; // Avoid TS error with Array.isArray check
                if (Array.isArray(material)) material.forEach(m => m?.dispose());
                else material?.dispose();
            }
        });
        this.entities = []; this.collidableObjects = []; this.interactableObjects = [];
        this.scene = null; this.player = null; // Null out other properties too
        this.camera = null; this.clock = null; this.thirdPersonCamera = null;
        this.controls = null; this.physics = null; this.inventory = null;
        this.questLog = null; this.eventLog = null; this.interactionSystem = null;
        this.hud = null; this.minimap = null; this.inventoryDisplay = null;
        this.journalDisplay = null; this.renderer = null;

        (window as any).game = null;
        console.log("Game disposed.");
    }
}
export default Game;