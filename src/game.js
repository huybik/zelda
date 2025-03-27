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
import { InteractionSystem } from './systems/interaction.js';
import { populateEnvironment, createWorldBoundary } from './world/environment.js';
import { Physics } from './systems/physics.js';
import { QuestLog, EventLog } from './systems/quest.js'; // Renamed QuestSystem to QuestLog
import { JournalDisplay } from './ui/journal.js';
import { NPC } from './entities/npc.js';
import { Animal } from './entities/animal.js';

const WORLD_SIZE = 1000; // Corresponds to 1km x 1km

class Game {
    constructor() {
        this.scene = new THREE.Scene();
        this.renderer = new THREE.WebGLRenderer({ antialias: true });
        this.clock = new THREE.Clock();
        this.player = null;
        this.camera = null; // This will be the PerspectiveCamera
        this.thirdPersonCamera = null; // This manages the camera position/rotation
        this.controls = null;
        this.hud = null;
        this.minimap = null;
        this.inventory = null;
        this.inventoryDisplay = null;
        this.interactionSystem = null;
        this.physics = null;
        this.questLog = null;
        this.eventLog = null;
        this.journalDisplay = null;

        this.entities = []; // All dynamic entities (player, NPCs, animals)
        this.collidableObjects = []; // Static collidable objects (trees, rocks, buildings)
        this.interactableObjects = []; // Objects that can be interacted with
    }

    init() {
        // Renderer setup
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.setPixelRatio(window.devicePixelRatio);
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap; // Softer shadows
        document.getElementById('game-container').appendChild(this.renderer.domElement);

        // Scene background and fog
        this.scene.background = new THREE.Color(0x87CEEB); // Pastel blue sky
        this.scene.fog = new THREE.Fog(0x87CEEB, 100, 500); // Slight fog

        // Camera setup
        this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 2000);

        // Lighting
        setupLighting(this.scene);

        // Terrain
        const terrain = createTerrain(WORLD_SIZE);
        this.scene.add(terrain);
        this.collidableObjects.push(terrain); // Add terrain for ground collision checks

        // World Boundary (invisible walls)
        createWorldBoundary(this.scene, WORLD_SIZE, this.collidableObjects);


        // Player
        this.player = new Player(this.scene, new THREE.Vector3(0, 1, 5));
        this.entities.push(this.player);
        this.collidableObjects.push(this.player.mesh); // Player collides with others

        // Camera Controller
        this.thirdPersonCamera = new ThirdPersonCamera(this.camera, this.player.mesh);

        // Controls
        this.controls = new Controls(this.player, this.thirdPersonCamera, this.renderer.domElement);

        // Physics
        this.physics = new Physics(this.player, this.collidableObjects);

        // Inventory
        this.inventory = new Inventory(20);
        this.inventoryDisplay = new InventoryDisplay(this.inventory);

        // Quest & Journal System
        this.questLog = new QuestLog();
        this.eventLog = new EventLog();
        this.journalDisplay = new JournalDisplay(this.questLog, this.eventLog);
        this.player.setJournal(this.questLog, this.eventLog); // Give player access

        // Populate Environment (Trees, Rocks, Buildings, NPCs, Animals)
        populateEnvironment(this.scene, WORLD_SIZE, this.collidableObjects, this.interactableObjects, this.entities, this.questLog, this.inventory);

        // Interaction System
        this.interactionSystem = new InteractionSystem(this.player, this.camera, this.interactableObjects, this.controls, this.inventory, this.eventLog);

        // UI
        this.hud = new HUD(this.player);
        this.minimap = new Minimap(document.getElementById('minimap-canvas'), this.player, this.entities, WORLD_SIZE);

        // Initial Log Message
        this.eventLog.addEntry("You arrive in the quiet village, ready for adventure.");

        // Bind controls for UI toggling
        this.controls.addKeyListener('KeyI', () => this.inventoryDisplay.toggle());
        this.controls.addKeyListener('KeyJ', () => this.journalDisplay.toggle());
        this.controls.addMouseListener(0, (event) => this.handleInventoryClick(event)); // Left Mouse Button (0)
    }

    handleInventoryClick(event) {
    // ***** CORRECTED LINE BELOW *****
    // Check if inventory is open using property access, not function call
    if (!this.inventoryDisplay.isOpen) return;
    // ***** END CORRECTION *****

    const target = event.target;
    if (target.closest('.inventory-slot')) {
        const slotElement = target.closest('.inventory-slot');
        const index = parseInt(slotElement.dataset.index, 10);
        const item = this.inventory.getItem(index);

        if (item) {
            console.log(`Clicked on item: ${item.name}`);
            this.eventLog.addEntry(`You examine the ${item.name}.`);
            // Add item usage logic here, e.g., consuming a potion
            if (item.name === 'Health Potion') {
                if (this.player.health < this.player.maxHealth) {
                    this.player.heal(25); // Heal 25 HP
                    this.inventory.removeItemByIndex(index);
                    this.eventLog.addEntry(`You used a Health Potion and recovered some health.`);
                } else {
                     this.eventLog.addEntry(`Your health is already full.`);
                }
            }
            // Prevent interaction system from triggering if inventory is open
            // This might need more robust handling depending on event bubbling
             event.stopPropagation();
        }
    }
    }


    start() {
        this.renderer.setAnimationLoop(() => this.update());
    }

    update() {
        const deltaTime = this.clock.getDelta();

        // Update controls state
        this.controls.update(deltaTime);

        // Update player (movement, stamina regen etc)
        this.player.update(deltaTime, this.controls.moveState, this.collidableObjects);

        // Update physics (gravity, collision response)
        this.physics.update(deltaTime);

        // Update camera position
        this.thirdPersonCamera.update(deltaTime);

        // Update other entities (NPCs, Animals)
        this.entities.forEach(entity => {
            if (entity !== this.player && entity.update) {
                // Pass necessary info like player position for AI, delta time, collidables
                entity.update(deltaTime, this.player, this.collidableObjects);
            }
        });

        // Handle interactions
        this.interactionSystem.update(deltaTime);

        // Update UI elements
        this.hud.update();
        this.minimap.update();
        this.inventoryDisplay.update(); // Keep inventory display updated
        this.journalDisplay.update(); // Keep journal display updated

        // Respawn logic
        if (this.player.isDead) {
            this.respawnPlayer();
        }

        // Render the scene
        this.renderer.render(this.scene, this.camera);
    }

     respawnPlayer() {
        console.log("Player died. Respawning...");
        this.eventLog.addEntry("You blacked out and woke up back in the village...");
        // Minor resource penalty (example: lose some gold or a random item)
        const penaltyAmount = Math.min(5, this.inventory.countItem('gold'));
        if (penaltyAmount > 0) {
             this.inventory.removeItem('gold', penaltyAmount);
             this.eventLog.addEntry(`You lost ${penaltyAmount} gold.`);
        }

        this.player.respawn(new THREE.Vector3(0, 1, 5)); // Respawn near village center
        this.hud.update(); // Update HUD immediately after respawn
    }


    onWindowResize() {
        this.camera.aspect = window.innerWidth / window.innerHeight;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(window.innerWidth, window.innerHeight);
    }
}

export default Game;