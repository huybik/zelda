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
             powerPreference: "high-performance" // Request high performance GPU if available
             });
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.setPixelRatio(window.devicePixelRatio);
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap; // Softer shadows are generally nicer
        document.getElementById('game-container').appendChild(this.renderer.domElement);

        // Scene setup
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x87CEEB); // Pastel blue sky
        this.scene.fog = new THREE.Fog(0x87CEEB, 150, 600); // Adjust fog distance

        // Camera setup
        this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 2000);

        // Core Systems
        this.inventory = new Inventory(24); // Slightly larger inventory
        this.questLog = new QuestLog(); // Initialize with empty definitions initially
        this.eventLog = new EventLog(75); // Keep more log entries

        // Lighting
        setupLighting(this.scene);

        // World - Terrain and Boundaries first
        const terrain = createTerrain(WORLD_SIZE, TERRAIN_SEGMENTS);
        this.scene.add(terrain);
        this.collidableObjects.push(terrain); // Add terrain for ground collision checks

        createWorldBoundary(this.scene, WORLD_SIZE, this.collidableObjects);

        // Player (requires scene)
        const playerSpawnPos = new THREE.Vector3(0, 1, 5); // Near village center
        playerSpawnPos.y = createTerrain(1,1).geometry ? // Quick way to get approx height
                             terrain.geometry.parameters.height/2 + 1 : playerSpawnPos.y; // TODO get real height
        playerSpawnPos.y = 5; // Hacky override
        this.player = new Player(this.scene, playerSpawnPos);
        this.entities.push(this.player);
        this.collidableObjects.push(this.player.mesh); // Player collides with others
        this.player.setJournal(this.questLog, this.eventLog); // Give player access to logs

        // Camera Controller (requires camera, player mesh)
        this.thirdPersonCamera = new ThirdPersonCamera(this.camera, this.player.mesh);

        // Controls (requires player, camera controller, DOM element)
        this.controls = new Controls(this.player, this.thirdPersonCamera, this.renderer.domElement);

        // Physics (requires player, collidables array)
        this.physics = new Physics(this.player, this.collidableObjects);

        // Populate Environment (requires scene and core systems/arrays)
        // This adds NPCs, Animals, Trees, Rocks, etc. to the respective arrays
        populateEnvironment(this.scene, WORLD_SIZE, this.collidableObjects, this.interactableObjects, this.entities, this.questLog, this.inventory, this.eventLog);

        // Interaction System (requires player, camera, interactables array, controls, inventory, eventLog)
        // Pass the interactableObjects array which now contains entities AND static interactables
        this.interactionSystem = new InteractionSystem(this.player, this.camera, this.interactableObjects, this.controls, this.inventory, this.eventLog);

        // UI (requires player, entities, inventory, logs etc.)
        this.hud = new HUD(this.player);
        this.minimap = new Minimap(document.getElementById('minimap-canvas'), this.player, this.entities, WORLD_SIZE);
        this.inventoryDisplay = new InventoryDisplay(this.inventory);
        // Pass inventory to JournalDisplay for quest progress checks
        this.journalDisplay = new JournalDisplay(this.questLog, this.eventLog, this.inventory);


        // Initial Log Message
        this.eventLog.addEntry("Welcome to the Low-Poly Wilderness! (I=Inventory, J=Journal, E=Interact)");

        // Bind controls for UI toggling etc.
        this.setupUIControls();

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
                this.setPauseState(false);
            } else if (this.journalDisplay.isOpen) {
                this.journalDisplay.hide();
                this.setPauseState(false);
            } else {
                 // Optional: Open main menu or exit pointer lock
                 if (document.pointerLockElement) document.exitPointerLock();
                 // this.setPauseState(true); // Pause for menu?
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
        // Check if inventory is open (using the getter)
        if (!this.inventoryDisplay.isOpen) return;

        const slotElement = event.target.closest('.inventory-slot');
        if (slotElement) {
            const index = parseInt(slotElement.dataset.index, 10);
            const item = this.inventory.getItem(index);

            if (item) {
                console.log(`Clicked on item: ${item.name} in slot ${index}`);

                // Simple item usage logic (example: Health Potion)
                if (item.name === 'Health Potion') {
                    if (this.player.health < this.player.maxHealth) {
                        this.player.heal(25); // Heal amount
                        // Remove *one* potion from the clicked stack
                        if (this.inventory.removeItemByIndex(index, 1)) {
                            this.eventLog.addEntry(`Used a Health Potion. Ahh, refreshing!`);
                        }
                    } else {
                         this.eventLog.addEntry(`Your health is already full.`);
                    }
                } else {
                     this.eventLog.addEntry(`You examine the ${item.name}.`);
                }
                // Prevent interaction system or other listeners from processing this click
                 event.stopPropagation();
            }
        }
    }


    setPauseState(paused) {
        if (this.isPaused === paused) return; // No change
        this.isPaused = paused;
        console.log(`Game ${paused ? 'paused' : 'resumed'}.`);
        // TODO: Add actual pause logic (stop entity updates, animations, physics?)
        // For now, it primarily affects UI opening/closing pointer lock.
        if (this.isPaused && document.pointerLockElement) {
             document.exitPointerLock(); // Release pointer lock when paused by UI
        } else if (!this.isPaused && !document.pointerLockElement && !this.inventoryDisplay.isOpen && !this.journalDisplay.isOpen) {
             // Only re-lock if pause ended AND no UI is open
             this.controls.lockPointer();
        }

    }

    start() {
        if (!this.renderer) {
            console.error("Game not initialized. Call init() before start().");
            return;
        }
        console.log("Starting game loop...");
        this.renderer.setAnimationLoop(() => this.update());
    }

    update() {
        if (!this.player || !this.renderer || !this.scene || !this.camera) return; // Guard against missing core components

        const deltaTime = Math.min(this.clock.getDelta(), 0.05); // Get delta time, clamp to prevent large jumps

        // Update controls state regardless of pause (reads input)
        this.controls.update(deltaTime);

        // --- Game Logic Updates (Skip if Paused) ---
        if (!this.isPaused) {

            // Update player (movement, stamina, animation)
            // Player update needs the *raw* moveState from controls
            this.player.update(deltaTime, this.controls.moveState, this.collidableObjects);

            // Update physics (collision response) AFTER player tries to move
            this.physics.update(deltaTime);

            // Update other entities (NPCs, Animals, animated objects)
            this.entities.forEach(entity => {
                // Skip player, dead entities, or entities without an update method
                if (entity === this.player || entity.isDead || typeof entity.update !== 'function') return;

                try {
                    // Pass necessary info like player position for AI, delta time, collidables
                    entity.update(deltaTime, this.player, this.collidableObjects);
                } catch (error) {
                    console.error(`Error updating entity ${entity.name || entity.id}:`, error);
                    // Optional: Mark entity for removal or disable updates
                }
            });

            // Handle interactions (detect targets, process interaction key press)
            this.interactionSystem.update(deltaTime);

            // Update camera position AFTER player and physics updates
            this.thirdPersonCamera.update(deltaTime, this.collidableObjects);

            // Check for player death AFTER all updates that could cause damage
            if (this.player.isDead) {
                this.respawnPlayer();
                // Skip rendering this frame after respawn? Optional.
                // return;
            }
        } // End if (!isPaused)


        // --- UI Updates (Update even when paused to show correct state) ---
        this.hud.update();
        this.minimap.update();
        // Inventory and Journal displays update themselves internally when shown or data changes
        // No explicit update call needed here unless force refresh is required.
        // this.inventoryDisplay.updateDisplay(); // Not needed if using onChange
        // this.journalDisplay.updateDisplay(); // Not needed if using onChange


        // Render the scene
        try {
            this.renderer.render(this.scene, this.camera);
        } catch (error) {
            console.error("Error during rendering:", error);
            // Handle rendering errors, e.g., stop the loop?
        }
    }

     respawnPlayer() {
        console.log("Player died. Respawning...");
        this.eventLog.addEntry("You blacked out and woke up back near the village...");

        // --- Penalties (Example) ---
        // 1. Lose some gold
        const goldCount = this.inventory.countItem('gold');
        const goldPenalty = Math.min(10, Math.floor(goldCount * 0.1)); // Lose 10% or 10 gold, whichever is less
        if (goldPenalty > 0) {
             this.inventory.removeItem('gold', goldPenalty);
             this.eventLog.addEntry(`You lost ${goldPenalty} gold.`);
        }
        // 2. TODO: Maybe drop some non-quest items? More complex.

        // Respawn player at a safe location
        const respawnPos = new THREE.Vector3(0, 5, 10); // Village spawn point
        respawnPos.y = getTerrainHeight(respawnPos.x, respawnPos.z) + 0.5; // Place slightly above ground
        this.player.respawn(respawnPos);

        // Reset relevant states
        this.setPauseState(false); // Ensure game isn't paused after respawn
        this.hud.update(); // Update HUD immediately after respawn
        // Reset any ongoing interaction
        if (this.interactionSystem.activeGather) {
            this.interactionSystem.cancelGatherAction();
        }
        // Reset camera? (Should follow player automatically)
     }

     // --- Entity Management (Example TODO) ---
     // requestEntityRemoval(entityId, delay = 0) {
     //    setTimeout(() => {
     //       const entity = this.entities.find(e => e.id === entityId);
     //       if (entity) {
     //           this.removeEntity(entity);
     //       }
     //    }, delay);
     // }

     // removeEntity(entity) {
     //     if (!entity) return;
     //     console.log(`Removing entity: ${entity.name || entity.id}`);
     //     // Remove from all relevant arrays
     //     this.entities = this.entities.filter(e => e !== entity);
     //     this.collidableObjects = this.collidableObjects.filter(o => o !== entity.mesh);
     //     this.interactableObjects = this.interactableObjects.filter(i => i !== entity);
     //
     //     // Call entity's destroy method for scene removal and resource cleanup
     //     if (typeof entity.destroy === 'function') {
     //         entity.destroy();
     //     } else if (entity.mesh && entity.mesh.parent) {
     //         // Basic removal if no destroy method
     //         entity.mesh.parent.remove(entity.mesh);
     //     }
     // }


    onWindowResize() {
        if (this.camera && this.renderer) {
            this.camera.aspect = window.innerWidth / window.innerHeight;
            this.camera.updateProjectionMatrix();
            this.renderer.setSize(window.innerWidth, window.innerHeight);
            console.log("Window resized.");
        }
    }

    // Clean up resources on exit
    dispose() {
        console.log("Disposing game...");
        if (this.renderer) {
            this.renderer.setAnimationLoop(null); // Stop game loop
            if(this.renderer.domElement.parentNode) {
                this.renderer.domElement.parentNode.removeChild(this.renderer.domElement);
            }
             this.renderer.dispose();
        }
        if(this.controls) this.controls.dispose();
        if(this.inventoryDisplay) this.inventoryDisplay.dispose();
        if(this.journalDisplay) this.journalDisplay.dispose();

        // Dispose Three.js resources in the scene
        if (this.scene) {
             this.scene.traverse((object) => {
                if (object.geometry) object.geometry.dispose();
                if (object.material) {
                    if (Array.isArray(object.material)) {
                        object.material.forEach(material => material.dispose());
                    } else {
                        object.material.dispose();
                    }
                }
             });
        }

        // Clear arrays
        this.entities = [];
        this.collidableObjects = [];
        this.interactableObjects = [];

        window.game = null; // Clear global reference
        console.log("Game disposed.");
    }
}

// Helper function to get terrain height (duplicate from environment, maybe move to utils?)
function getTerrainHeight(x, z) {
     const terrain = window.game?.scene?.getObjectByName("Terrain"); // Access via global game ref if needed here
     if (!terrain || !terrain.geometry) return 0;
     const raycaster = new THREE.Raycaster(new THREE.Vector3(x, 100, z), new THREE.Vector3(0, -1, 0), 0, 200);
     const intersects = raycaster.intersectObject(terrain);
     return intersects.length > 0 ? intersects[0].point.y : 0;
}


export default Game;