import * as THREE from 'three';
import { setupLighting } from './world/lighting.js';
import { createTerrain } from './world/terrain.js';
import { Player } from './entities/player.js';
import { Controls } from './systems/controls.js';
import { ThirdPersonCamera } from './systems/camera.js';
import { HUD } from './ui/hud.js';
import { Minimap } from './ui/minimap.js';
import { Inventory } from './systems/inventory.js';
import { InventoryDisplay } from './ui/inventoryDisplay.js';
import { InteractionSystem, InteractableObject } from './systems/interaction.js';
import { populateEnvironment, createWorldBoundary } from './world/environment.js';
import { Physics } from './systems/physics.js';
import { QuestLog, EventLog } from './systems/quest.js';
import { JournalDisplay } from './ui/journal.js';
// Import entity types used in population if needed for type checking (though not strictly required)
// import { NPC } from './entities/npc.js';
// import { Animal } from './entities/animal.js';

const WORLD_SIZE = 1000; // Corresponds to 1km x 1km
const TERRAIN_SEGMENTS = 150; // Increased detail for terrain

// Global reference (use carefully, primarily for debugging or specific UI needs)
window.game = null;

class Game {
    constructor() {
        this.scene = null;
        this.renderer = null;
        this.clock = null;
        this.player = null;
        this.camera = null; // PerspectiveCamera
        this.thirdPersonCamera = null; // Camera controller
        this.controls = null;
        this.physics = null;
        this.inventory = null;
        this.questLog = null;
        this.eventLog = null;
        this.interactionSystem = null;

        // UI Components
        this.hud = null;
        this.minimap = null;
        this.inventoryDisplay = null;
        this.journalDisplay = null;

        // Game object collections
        this.entities = []; // Player, NPCs, Animals, dynamic objects (like animated chests, windmills)
        this.collidableObjects = []; // Meshes/Groups for physics collision checks (terrain, player, static props, entities)
        this.interactableObjects = []; // Instances/references for interaction system (NPCs, animals, items, static props)

        this.isPaused = false; // Basic pause state

        window.game = this; // Assign global reference
    }

    init() {
        console.log("Initializing game...");
        this.clock = new THREE.Clock();

        // Renderer setup
        this.renderer = new THREE.WebGLRenderer({
             antialias: true,
             powerPreference: "high-performance"
             });
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.setPixelRatio(window.devicePixelRatio);
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        // Attach renderer's DOM element (canvas) to the container div
        document.getElementById('game-container').appendChild(this.renderer.domElement);

        // Scene setup
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x87CEEB); // Pastel blue sky
        this.scene.fog = new THREE.Fog(0x87CEEB, 150, 600);

        // Camera setup
        this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 2000);

        // Core Systems
        this.inventory = new Inventory(24);
        this.questLog = new QuestLog();
        this.eventLog = new EventLog(75);

        // Lighting
        setupLighting(this.scene);

        // World - Terrain and Boundaries first
        const terrain = createTerrain(WORLD_SIZE, TERRAIN_SEGMENTS);
        this.scene.add(terrain);
        this.collidableObjects.push(terrain);

        createWorldBoundary(this.scene, WORLD_SIZE, this.collidableObjects);

        // Player (requires scene)
        const playerSpawnPos = new THREE.Vector3(0, 0, 5); // Near village center, Y determined later
        // Place player at correct terrain height + small offset
        playerSpawnPos.y = getTerrainHeight(playerSpawnPos.x, playerSpawnPos.z) + 0.5;
        this.player = new Player(this.scene, playerSpawnPos);
        this.entities.push(this.player);
        this.collidableObjects.push(this.player.mesh); // Player collides with others
        this.player.setJournal(this.questLog, this.eventLog);

        // Camera Controller (requires camera, player mesh)
        this.thirdPersonCamera = new ThirdPersonCamera(this.camera, this.player.mesh);

        // Controls (requires player, camera controller, renderer's DOM element)
        this.controls = new Controls(this.player, this.thirdPersonCamera, this.renderer.domElement);

        // Physics (requires player, collidables array)
        this.physics = new Physics(this.player, this.collidableObjects);

        // Populate Environment (adds NPCs, Animals, Trees, Rocks, etc.)
        populateEnvironment(this.scene, WORLD_SIZE, this.collidableObjects, this.interactableObjects, this.entities, this.questLog, this.inventory, this.eventLog);

        // Interaction System
        this.interactionSystem = new InteractionSystem(this.player, this.camera, this.interactableObjects, this.controls, this.inventory, this.eventLog);

        // UI
        this.hud = new HUD(this.player);
        this.minimap = new Minimap(document.getElementById('minimap-canvas'), this.player, this.entities, WORLD_SIZE);
        this.inventoryDisplay = new InventoryDisplay(this.inventory);
        this.journalDisplay = new JournalDisplay(this.questLog, this.eventLog, this.inventory);


        // Initial Log Message
        this.eventLog.addEntry("Welcome! Click game window to lock controls. (I=Inventory, J=Journal, E=Interact, Esc=Unlock/Close UI)");

        // Bind controls for UI toggling etc.
        this.setupUIControls();

        // Prompt user to click to start/lock controls (optional)
        // Could display a temporary message until first click

        console.log("Game initialization complete.");
    }

    setupUIControls() {
        // Toggle Inventory
        this.controls.addKeyDownListener('KeyI', () => {
            if (this.journalDisplay.isOpen) this.journalDisplay.hide(); // Close journal if open
            this.inventoryDisplay.toggle();
            this.setPauseState(this.inventoryDisplay.isOpen); // Pause when inventory is open
        });

        // Toggle Journal
        this.controls.addKeyDownListener('KeyJ', () => {
             if (this.inventoryDisplay.isOpen) this.inventoryDisplay.hide(); // Close inventory if open
            this.journalDisplay.toggle();
            this.setPauseState(this.journalDisplay.isOpen); // Pause when journal is open
        });

        // Close UI with Escape
        this.controls.addKeyDownListener('Escape', () => {
            if (this.inventoryDisplay.isOpen) {
                this.inventoryDisplay.hide();
                this.setPauseState(false); // Unpause
            } else if (this.journalDisplay.isOpen) {
                this.journalDisplay.hide();
                this.setPauseState(false); // Unpause
            } else {
                 // If no UI is open, Escape unlocks the pointer
                 if (this.controls.isPointerLocked) {
                     this.controls.unlockPointer(); // Explicitly unlock
                     // Optionally pause the game when pointer is manually unlocked
                     // this.setPauseState(true);
                 }
            }
        });


        // Handle clicks within inventory UI
        this.controls.addMouseClickListener(0, (event) => { // Left Mouse Button (0)
             if (this.inventoryDisplay.isOpen && event.target) {
                 this.handleInventoryClick(event);
             }
        });
    }

    handleInventoryClick(event) {
        if (!this.inventoryDisplay.isOpen) return;

        const slotElement = event.target.closest('.inventory-slot');
        if (slotElement) {
            const index = parseInt(slotElement.dataset.index, 10);
            const item = this.inventory.getItem(index);

            if (item) {
                console.log(`Clicked on item: ${item.name} in slot ${index}`);
                if (item.name === 'Health Potion') {
                    if (this.player.health < this.player.maxHealth) {
                        this.player.heal(25);
                        if (this.inventory.removeItemByIndex(index, 1)) {
                            this.eventLog.addEntry(`Used a Health Potion. Ahh, refreshing!`);
                        }
                    } else {
                         this.eventLog.addEntry(`Your health is already full.`);
                    }
                } else {
                     this.eventLog.addEntry(`You examine the ${item.name}.`);
                }
                 event.stopPropagation();
            }
        }
    }


    setPauseState(paused) {
        if (this.isPaused === paused) return;
        this.isPaused = paused;
        console.log(`Game ${paused ? 'paused' : 'resumed'}.`);

        // Handle pointer lock based on pause state
        if (this.isPaused) {
            // If game is paused (usually by opening UI), release pointer lock
            this.controls.unlockPointer();
        } else {
            // If game is resumed AND no UI panels are open, re-acquire pointer lock
            if (!this.inventoryDisplay.isOpen && !this.journalDisplay.isOpen) {
                this.controls.lockPointer();
            }
        }
        // Actual pausing of game logic (entity updates, physics) happens in the update loop
    }

    start() {
        if (!this.renderer) {
            console.error("Game not initialized. Call init() before start().");
            return;
        }
        console.log("Starting game loop...");
        // Start the animation loop
        this.renderer.setAnimationLoop(() => this.update());
    }

    update() {
        if (!this.player || !this.renderer || !this.scene || !this.camera) return;

        const deltaTime = Math.min(this.clock.getDelta(), 0.05);

        // Update controls state (reads input, updates mouse deltas if locked)
        // This runs even if paused, so UI keys work. Mouse rotation is applied inside controls.update if locked.
        this.controls.update(deltaTime);

        // --- Game Logic Updates (Skip if Paused) ---
        if (!this.isPaused) {

            // Update player (movement, stamina, animation)
            // Player uses moveState from controls and handles its own physics (gravity, ground check)
            this.player.update(deltaTime, this.controls.moveState, this.collidableObjects);

            // Update physics (collision response between player and other objects)
            // Run AFTER player has moved and updated its bounding box.
            this.physics.update(deltaTime);

            // Update other entities (NPCs, Animals, animated objects)
            this.entities.forEach(entity => {
                if (entity === this.player || entity.isDead || typeof entity.update !== 'function') return;
                try {
                    entity.update(deltaTime, this.player, this.collidableObjects);
                } catch (error) {
                    console.error(`Error updating entity ${entity.name || entity.id}:`, error);
                }
            });

            // Handle interactions
            this.interactionSystem.update(deltaTime);

            // Update camera position AFTER player and physics updates
            this.thirdPersonCamera.update(deltaTime, this.collidableObjects);

            // Check for player death
            if (this.player.isDead) {
                this.respawnPlayer();
                // return; // Skip rendering this frame after respawn?
            }
        } // End if (!isPaused)


        // --- UI Updates (Update even when paused) ---
        this.hud.update();
        this.minimap.update();
        // Inventory/Journal update via callbacks or when opened.

        // Render the scene
        try {
            this.renderer.render(this.scene, this.camera);
        } catch (error) {
            console.error("Error during rendering:", error);
        }
    }

     respawnPlayer() {
        console.log("Player died. Respawning...");
        this.eventLog.addEntry("You blacked out and woke up back near the village...");

        const goldCount = this.inventory.countItem('gold');
        const goldPenalty = Math.min(10, Math.floor(goldCount * 0.1));
        if (goldPenalty > 0) {
             this.inventory.removeItem('gold', goldPenalty);
             this.eventLog.addEntry(`You lost ${goldPenalty} gold.`);
        }

        const respawnPos = new THREE.Vector3(0, 0, 10); // Village spawn point
        respawnPos.y = getTerrainHeight(respawnPos.x, respawnPos.z) + 0.5;
        this.player.respawn(respawnPos);

        // Ensure game is unpaused and controls might need re-locking
        this.setPauseState(false);
        // Hud updates automatically in the loop

        if (this.interactionSystem.activeGather) {
            this.interactionSystem.cancelGatherAction();
        }
     }

    onWindowResize() {
        if (this.camera && this.renderer) {
            this.camera.aspect = window.innerWidth / window.innerHeight;
            this.camera.updateProjectionMatrix();
            this.renderer.setSize(window.innerWidth, window.innerHeight);
            console.log("Window resized.");
        }
    }

    dispose() {
        console.log("Disposing game...");
        if (this.renderer) {
            this.renderer.setAnimationLoop(null);
            if(this.renderer.domElement.parentNode) {
                this.renderer.domElement.parentNode.removeChild(this.renderer.domElement);
            }
             this.renderer.dispose();
        }
        if(this.controls) this.controls.dispose();
        if(this.inventoryDisplay) this.inventoryDisplay.dispose();
        if(this.journalDisplay) this.journalDisplay.dispose();

        if (this.scene) {
             this.scene.traverse((object) => {
                if (!object) return;
                if (object.geometry) object.geometry.dispose();
                if (object.material) {
                    if (Array.isArray(object.material)) {
                        object.material.forEach(material => material?.dispose());
                    } else if (object.material.dispose) {
                        object.material.dispose();
                    }
                }
             });
        }
        this.entities = [];
        this.collidableObjects = [];
        this.interactableObjects = [];
        window.game = null;
        console.log("Game disposed.");
    }
}

// Helper function to get terrain height
function getTerrainHeight(x, z) {
     // Use window.game carefully, might not be fully initialized when first called during init
     const game = window.game;
     const terrain = game?.scene?.getObjectByName("Terrain");
     if (!terrain || !terrain.geometry) return 0; // Default height if terrain not ready

     // Raycast down to find precise terrain height
     // Reuse a single raycaster instance if possible, or create locally
     const raycaster = new THREE.Raycaster(new THREE.Vector3(x, 100, z), new THREE.Vector3(0, -1, 0), 0, 200);
     const intersects = raycaster.intersectObject(terrain);
     return intersects.length > 0 ? intersects[0].point.y : 0;
}


export default Game;