// src/Game.ts
import {
  Scene,
  WebGLRenderer,
  PerspectiveCamera,
  Clock,
  Vector3,
  Color,
  Fog,
  Object3D,
  Group,
  PCFSoftShadowMap,
  BufferGeometry,
  MeshBasicMaterial,
  Mesh,
  SphereGeometry,
  Points,
  Box3,
} from "three";
import WebGL from "three/examples/jsm/capabilities/WebGL.js";

// Core Components
import { Entity } from "./core/Entity";
import { Character } from "./core/Character";
import { Inventory } from "./core/Inventory";
import { AIController } from "./core/AIController"; // Import AIController if needed for type checks

// Systems
import { ThirdPersonCamera, Controls } from "./systems/Controls";
import { MobileControls } from "./systems/MobileControls";
import { Physics } from "./systems/Physics";
import { InteractionSystem } from "./systems/InteractionSystem";

// World Generation & Portals
import {
  createTerrain,
  setupLighting,
  populateEnvironment,
  createWorldBoundary,
} from "./world/WorldGenerator";
import { createPortalGroup, animatePortalParticles } from "./world/Portals";

// UI Components
import { HUD } from "./ui/HUD";
import { InventoryDisplay } from "./ui/InventoryDisplay";
import { JournalDisplay } from "./ui/JournalDisplay";
import { Minimap } from "./ui/Minimap";

// Config & Types
import { Colors, WORLD_SIZE, PARTICLE_EFFECT_DURATION } from "./config";
import type { EventEntry, Quest, LoadedModel } from "./types";
import { getTerrainHeight, loadModels } from "./utils"; // Import model loader

export class Game {
  // Core Three.js components
  renderer: WebGLRenderer;
  scene: Scene;
  camera: PerspectiveCamera;
  clock: Clock;

  // Game state
  isPaused: boolean = false;
  activeCharacter: Character | null = null; // The character currently under player control

  // Entities and world objects
  entities: Array<any> = []; // All active entities (Characters, simple objects)
  collidableObjects: Object3D[] = []; // Objects considered for physics collisions
  interactableObjects: Array<any> = []; // Objects the player can interact with

  // Systems
  thirdPersonCamera: ThirdPersonCamera | null = null;
  controls: Controls | null = null;
  mobileControls: MobileControls | null = null;
  physics: Physics | null = null;
  interactionSystem: InteractionSystem | null = null;

  // UI
  hud: HUD | null = null;
  minimap: Minimap | null = null;
  inventoryDisplay: InventoryDisplay | null = null;
  journalDisplay: JournalDisplay | null = null;

  // Audio
  audioElement: HTMLAudioElement | null = null;

  // Particle Effects
  particleEffects: Group[] = []; // Store active particle effect groups

  // Portals
  exitPortalGroup: Group | null = null;
  exitPortalBox: Box3 | null = null;
  exitPortalParticlesGeo: BufferGeometry | null = null;
  startPortalGroup: Group | null = null;
  startPortalBox: Box3 | null = null;
  startPortalParticlesGeo: BufferGeometry | null = null;
  startPortalRefUrl: string | null = null; // URL to return to via start portal
  startPortalOriginalParams: URLSearchParams | null = null; // Params from initial load
  hasEnteredFromPortal: boolean = false; // Flag if game started via portal link

  // Quests
  quests: Quest[] = [];

  // Reference to Character class for dynamic instantiation in WorldGenerator
  // This avoids direct import cycles if WorldGenerator needs Character
  characterClassRef: typeof Character = Character;

  constructor() {
    if (!WebGL.isWebGL2Available()) {
      throw new Error("WebGL 2 is not available. Cannot initialize the game.");
    }
    this.renderer = this.initRenderer();
    this.scene = this.initScene();
    this.camera = this.initCamera();
    this.clock = new Clock();
    this.initAudio();
  }

  // Asynchronous initialization sequence
  async init(): Promise<void> {
    console.log("Game initialization started...");

    // Load necessary assets (e.g., 3D models)
    const models = await this.loadGameModels();
    console.log("Models loaded.");

    // Process URL parameters for portal logic
    this.processUrlParameters();

    // Initialize core components in order
    this.initPlayer(models); // Player needs to exist before systems that use it
    if (!this.activeCharacter) throw new Error("Player initialization failed.");

    this.initControls(); // Desktop controls first
    this.initMobileControls(); // Initializes if mobile detected, links to Controls
    this.initPhysics();
    this.initEnvironment(models); // Populate world with objects and NPCs
    this.initSystems(); // Interaction system depends on player & entities
    this.initQuests();
    this.initUI();
    this.setupUIControls(); // Keyboard/button bindings for UI

    // Initialize portals
    this.initPortals();

    // Final setup steps
    this.linkEntitiesToGame(); // Ensure all entities have a 'game' reference
    this.setupAudioInteraction(); // Start audio on first interaction

    console.log("Game initialization complete.");
  }

  // --- Initialization Sub-methods ---

  private initRenderer(): WebGLRenderer {
    const renderer = new WebGLRenderer({
      antialias: true,
      powerPreference: "high-performance",
    });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = PCFSoftShadowMap; // Softer shadows
    document.getElementById("game-container")?.appendChild(renderer.domElement);
    return renderer;
  }

  private initScene(): Scene {
    const scene = new Scene();
    scene.background = new Color(Colors.BACKGROUND);
    scene.fog = new Fog(Colors.BACKGROUND, 150, 600); // Distance fog

    setupLighting(scene); // Add lights
    const terrain = createTerrain(WORLD_SIZE); // Create terrain mesh
    scene.add(terrain);
    this.collidableObjects.push(terrain); // Terrain is collidable

    createWorldBoundary(scene, WORLD_SIZE, this.collidableObjects); // Add invisible walls

    return scene;
  }

  private initCamera(): PerspectiveCamera {
    const camera = new PerspectiveCamera(
      75, // Field of view
      window.innerWidth / window.innerHeight, // Aspect ratio
      0.1, // Near clipping plane
      2000 // Far clipping plane
    );
    // Initial position will be set by ThirdPersonCamera
    return camera;
  }

  private initAudio(): void {
    try {
      this.audioElement = new Audio("assets/background.mp3"); // Path to your audio file
      this.audioElement.loop = true;
      this.audioElement.volume = 0.3; // Adjust volume
    } catch (error) {
      console.warn("Failed to initialize background audio:", error);
      this.audioElement = null;
    }
  }

  private async loadGameModels(): Promise<Record<string, LoadedModel>> {
    // Define model paths relative to the public directory or assets folder
    const modelPaths = {
      player: "assets/player/scene.gltf",

      // Add other models here: e.g., enemy: "assets/enemy/scene.gltf"
    };
    return loadModels(modelPaths);
  }

  private processUrlParameters(): void {
    const urlParams = new URLSearchParams(window.location.search);
    this.hasEnteredFromPortal = urlParams.get("portal") === "true";
    this.startPortalRefUrl = urlParams.get("ref"); // Get referring URL
    this.startPortalOriginalParams = urlParams; // Store all original params
    if (this.hasEnteredFromPortal) {
      console.log(
        "Entered game via portal from:",
        this.startPortalRefUrl || "Unknown"
      );
    }
  }

  private initPlayer(models: Record<string, LoadedModel>): void {
    let spawnPos = new Vector3(0, 0, 15); // Default spawn near origin
    // Ensure spawn position is on the terrain (handled by Character constructor placement)

    const playerModelData = models.player;
    if (!playerModelData) throw new Error("Player model failed to load.");
    spawnPos.y = getTerrainHeight(this.scene, spawnPos.x, spawnPos.z); // Set Y position from model

    const playerInventory = new Inventory(); // Default size
    this.activeCharacter = new Character(
      this.scene,
      spawnPos, // Initial position hint (actual placement done in constructor)
      "Player",
      playerModelData.scene,
      playerModelData.animations,
      playerInventory
    );
    this.activeCharacter.userData.isPlayer = true; // Mark as player
    this.activeCharacter.userData.isNPC = false;
    this.activeCharacter.userData.isInteractable = false;
    this.activeCharacter.aiController = null; // Player doesn't use AIController
    this.activeCharacter.game = this; // Link back to game

    // Add player to relevant lists
    this.entities.push(this.activeCharacter);
    this.collidableObjects.push(this.activeCharacter.mesh!);
    this.interactableObjects.push(this.activeCharacter); // Player might be targetable later

    console.log(`Player initialized at ~(${spawnPos.x}, ${spawnPos.z})`);
  }

  private initControls(): void {
    if (!this.activeCharacter || !this.activeCharacter.mesh)
      throw new Error("Player must be initialized before controls.");
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

  private initMobileControls(): void {
    if (!this.controls)
      throw new Error(
        "Desktop controls must be initialized before mobile controls."
      );
    this.mobileControls = new MobileControls(this, this.controls);
    // Link mobile controls reference back to desktop controls if needed
    this.controls.mobileControls = this.mobileControls;
    // If mobile is active, remove desktop listeners
    if (this.mobileControls.isActive()) {
      this.controls.removeDesktopListeners();
    }
  }

  private initPhysics(): void {
    if (!this.activeCharacter)
      throw new Error("Player must be initialized before physics.");
    this.physics = new Physics(this.activeCharacter, this.collidableObjects);
  }

  private initEnvironment(models: Record<string, LoadedModel>): void {
    populateEnvironment(
      this.scene,
      WORLD_SIZE,
      this.collidableObjects,
      this.interactableObjects,
      this.entities,
      models,
      this // Pass game instance
    );
  }

  private initSystems(): void {
    if (!this.activeCharacter || !this.controls)
      throw new Error(
        "Player and controls must be initialized before systems."
      );
    this.interactionSystem = new InteractionSystem(
      this.activeCharacter,
      this.camera,
      this.interactableObjects, // Pass the list of interactables
      this.controls,
      this
    );
  }

  private initQuests(): void {
    // Define quests here or load from external source
    this.quests = [
      {
        name: "Meet Brynn",
        description: "Find and talk to Blacksmith Brynn.",
        isCompleted: false,
        checkCompletion: (target, response) =>
          target.name === "Blacksmith Brynn" &&
          response.toLowerCase().includes("brynn"), // Simple check
      },
      {
        name: "Rock Collection",
        description: "Ask Farmer Giles about collecting rocks.",
        isCompleted: false,
        checkCompletion: (target, response) =>
          target.name === "Farmer Giles" &&
          (response.toLowerCase().includes("rock") ||
            response.toLowerCase().includes("stone")) &&
          (response.toLowerCase().includes("yes") ||
            response.toLowerCase().includes("ok") ||
            response.toLowerCase().includes("agree")),
      },
      // Add more quests
    ];
    console.log(`Initialized ${this.quests.length} quests.`);
  }

  private initUI(): void {
    if (!this.activeCharacter)
      throw new Error("Player must be initialized before UI.");
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
      console.error("Minimap canvas element not found!");
    }

    this.inventoryDisplay = new InventoryDisplay(
      this.activeCharacter.inventory!
    );
    this.journalDisplay = new JournalDisplay(
      this.activeCharacter.eventLog,
      this
    );
  }

  // Setup keyboard shortcuts for UI elements
  private setupUIControls(): void {
    if (!this.controls) return;

    // Inventory Toggle (I key or Mobile Button)
    this.controls.addKeyDownListener("KeyI", () => {
      if (this.isUIBlockingGameplay() && !this.inventoryDisplay?.isOpen) return; // Don't open if other UI is blocking
      this.journalDisplay?.hide(); // Close journal if open
      this.inventoryDisplay?.toggle();
      this.setPauseState(this.inventoryDisplay?.isOpen ?? false); // Pause if inventory opened
    });

    // Journal Toggle (J key or Mobile Button)
    this.controls.addKeyDownListener("KeyJ", () => {
      if (this.isUIBlockingGameplay() && !this.journalDisplay?.isOpen) return; // Don't open if other UI is blocking
      this.inventoryDisplay?.hide(); // Close inventory if open
      this.journalDisplay?.toggle();
      this.setPauseState(this.journalDisplay?.isOpen ?? false); // Pause if journal opened
    });

    // Self Heal (H key) - No mobile equivalent yet defined
    this.controls.addKeyDownListener("KeyH", () => {
      // Only allow heal if not paused and chat isn't open
      if (!this.isPaused && !this.interactionSystem?.isChatOpen) {
        this.activeCharacter?.selfHeal();
      }
    });

    // Switch Control (C key) - Desktop only for now
    this.controls.addKeyDownListener("KeyC", () => {
      if (this.isPaused || this.isUIBlockingGameplay()) return; // Don't switch if paused or UI open

      // Target the currently highlighted interactable if it's a Character
      const target = this.interactionSystem?.currentTarget;
      if (
        target instanceof Character &&
        target !== this.activeCharacter &&
        !target.isDead
      ) {
        this.switchControlTo(target);
      } else {
        // Cycle through available NPCs if no specific target
        this.cycleControlToNextNPC();
      }
    });

    // Escape Key is handled globally in Controls.ts for closing UI/unlocking pointer

    // Handle clicks within the inventory UI (Desktop)
    this.controls.addMouseClickListener(0, (event: MouseEvent) => {
      if (this.inventoryDisplay?.isOpen) {
        this.handleInventoryClick(event);
      }
    });
  }

  private initPortals(): void {
    // Create Exit Portal
    const exitPortalPos = new Vector3(-30, 0, -40); // Example position
    const {
      group: exitGroup,
      particlesGeo: exitParticles,
      boundingBox: exitBox,
    } = createPortalGroup(
      this.scene,
      exitPortalPos,
      Colors.EXIT_PORTAL,
      "VIBEVERSE PORTAL",
      Math.PI / 4
    );
    this.exitPortalGroup = exitGroup;
    this.exitPortalParticlesGeo = exitParticles;
    this.exitPortalBox = exitBox;

    // Create Start Portal only if entered from a portal and have a return URL
    if (this.hasEnteredFromPortal && this.startPortalRefUrl) {
      const startPortalPos = new Vector3(0, 0, 5); // Near default spawn
      let label = "Return Portal";
      try {
        // Try to create a more descriptive label from the ref URL
        const urlObj = new URL(
          this.startPortalRefUrl.startsWith("http")
            ? this.startPortalRefUrl
            : "https://" + this.startPortalRefUrl
        );
        label = `Return to: ${urlObj.hostname}`;
      } catch (e) {
        /* Use default label if URL parsing fails */
      }

      const {
        group: startGroup,
        particlesGeo: startParticles,
        boundingBox: startBox,
      } = createPortalGroup(
        this.scene,
        startPortalPos,
        Colors.START_PORTAL,
        label,
        -Math.PI / 2
      );
      this.startPortalGroup = startGroup;
      this.startPortalParticlesGeo = startParticles;
      this.startPortalBox = startBox;

      // Face player away from start portal after spawning
      if (this.activeCharacter?.mesh && this.startPortalGroup) {
        const lookTargetPos = this.startPortalGroup.position
          .clone()
          .add(new Vector3(0, 0, 10)); // Look "out"
        this.activeCharacter.lookAt(lookTargetPos);
        // Update camera immediately after player rotation
        this.thirdPersonCamera?.update(0.01, this.collidableObjects);
      }
    }
  }

  // Ensure all entities have a reference to the game instance and NPCs have displays
  private linkEntitiesToGame(): void {
    this.entities.forEach((entity) => {
      if (entity instanceof Entity) {
        // Check if it's an Entity subclass
        entity.game = this;
        if (entity instanceof Character && entity.userData.isNPC) {
          // Ensure NPC displays are initialized (might be redundant if done in populate)
          entity.initIntentDisplay();
          entity.initNameDisplay();
        }
      } else if (entity instanceof Group && entity.userData.isSimpleObject) {
        // Simple objects might need game ref later? For now, ensure userData has ref to self
        if (!entity.userData.entityReference) {
          entity.userData.entityReference = entity;
        }
      }
    });
  }

  // Setup listener to play audio on first user interaction (required by browsers)
  private setupAudioInteraction(): void {
    const playAudio = () => {
      if (this.audioElement && this.audioElement.paused) {
        this.audioElement
          .play()
          .catch((e) => console.warn("Audio playback failed:", e));
        // Remove listener after first successful play
        document.removeEventListener("pointerlockchange", playAudio);
        document.removeEventListener("click", playAudio);
        document.removeEventListener("keydown", playAudio);
        document.removeEventListener("touchstart", playAudio);
      }
    };

    // Listen for various interaction types to trigger audio start
    document.addEventListener("pointerlockchange", playAudio, { once: false }); // Use false for pointerlock
    document.addEventListener("click", playAudio, { once: true });
    document.addEventListener("keydown", playAudio, { once: true });
    document.addEventListener("touchstart", playAudio, { once: true });
  }

  // --- Game Loop & Update ---

  start(): void {
    if (!this.renderer || !this.clock) {
      console.error(
        "Renderer or Clock not initialized. Cannot start game loop."
      );
      return;
    }
    this.showWelcomeMessage();
    // Use the renderer's built-in animation loop
    this.renderer.setAnimationLoop(this.update.bind(this));
    console.log("Game loop started.");
  }

  private showWelcomeMessage(): void {
    const banner = document.getElementById("welcome-banner");
    if (!banner) return;
    const isMobile = this.mobileControls?.isActive();
    const welcomeText = isMobile
      ? "Welcome! Use joysticks & buttons."
      : "Welcome! [WASD] Move | Mouse Look | [E] Interact | [F] Attack | [H] Heal | [C] Switch | [I] Inv | [J] Journal | [Esc] Menu/Unlock";
    banner.textContent = welcomeText;
    banner.classList.remove("hidden");
    setTimeout(() => banner.classList.add("hidden"), 7000); // Show for 7 seconds
  }

  // Main game update function, called every frame.
  private update(): void {
    // Calculate delta time, clamping to avoid large jumps
    const deltaTime = Math.min(this.clock.getDelta(), 0.05); // Max 50ms frame time (20 FPS min)
    const elapsedTime = this.clock.elapsedTime;

    // Update controls first to gather input
    // Mobile controls update the shared moveState within Controls
    this.mobileControls?.update(deltaTime);
    this.controls?.update(deltaTime); // Updates desktop input and camera pitch/player yaw

    // --- Paused State ---
    if (this.isPaused) {
      // Minimal updates while paused (e.g., UI animations if any)
      // Update particle visuals (fade) but not movement
      this.updateParticleEffects(elapsedTime, 0); // Pass 0 deltaTime for no movement
      this.renderer.render(this.scene, this.camera); // Still render the scene
      return; // Skip main game logic updates
    }

    // --- Active Gameplay Updates ---

    // 1. Update Active Character (Player)
    if (this.activeCharacter && this.controls) {
      this.activeCharacter.update(deltaTime, {
        moveState: this.controls.moveState, // Pass current input state
        collidables: this.collidableObjects,
      });
    }

    // 2. Update Physics (handles player movement/collision resolution)
    this.physics?.update(deltaTime);

    // 3. Update Other Entities (NPCs)
    this.entities.forEach((entity) => {
      if (entity === this.activeCharacter) return; // Skip player

      if (entity instanceof Character && entity.aiController) {
        // AI computes its move state, then character updates based on it
        // Note: AI observation update happens within AIController.computeAIMoveState
        entity.update(deltaTime, {
          // moveState is determined by AIController internally now
          collidables: this.collidableObjects,
        });
      } else if (
        entity.update &&
        typeof entity.update === "function" &&
        !(entity instanceof Character)
      ) {
        // Call update on simple objects if they have it
        entity.update(deltaTime);
      }
    });

    // 4. Update Systems
    this.interactionSystem?.update(deltaTime); // Handles targeting, interaction prompts, gathering
    this.thirdPersonCamera?.update(deltaTime, this.collidableObjects); // Update camera position based on player

    // 5. Update Game State Logic
    if (this.activeCharacter?.isDead) {
      this.respawnPlayer(); // Handle player death
    }
    this.animatePortals(elapsedTime); // Animate portal visuals
    this.checkPortalCollisions(); // Check if player entered a portal

    // 6. Update UI and Effects
    this.updateParticleEffects(elapsedTime, deltaTime); // Update particle positions and lifetime
    this.hud?.update(); // Update health, stamina, FPS display
    this.minimap?.update(); // Update minimap display

    // 7. Render the Scene
    this.renderer.render(this.scene, this.camera);
  }

  // --- Game State Management ---

  setPauseState(paused: boolean): void {
    if (this.isPaused === paused) return; // No change

    this.isPaused = paused;
    console.log(`Game ${paused ? "Paused" : "Resumed"}`);

    // Handle pointer lock logic for desktop
    if (!this.mobileControls?.isActive()) {
      if (this.isPaused && this.controls?.isPointerLocked) {
        this.controls.unlockPointer(); // Unlock pointer when pausing
      } else if (
        !this.isPaused &&
        !this.isUIBlockingGameplay() &&
        !document.pointerLockElement
      ) {
        // Try to re-lock pointer when unpausing, but only if no UI is open
        this.controls?.lockPointer();
      }
    }

    // Handle audio pausing/resuming
    if (this.audioElement) {
      if (this.isPaused) {
        this.audioElement.pause();
      } else {
        // Attempt to play audio, might require user interaction again if stopped for long
        this.audioElement
          .play()
          .catch((e) => console.warn("Audio resume failed:", e));
      }
    }
  }

  // Checks if any UI element that should block gameplay is currently open.
  isUIBlockingGameplay(): boolean {
    return (
      this.inventoryDisplay?.isOpen ||
      this.journalDisplay?.isOpen ||
      this.interactionSystem?.isChatOpen ||
      false // Add other blocking UI states here
    );
  }

  // --- Player Management ---

  respawnPlayer(): void {
    if (!this.activeCharacter || !this.activeCharacter.isDead) return;

    console.log(`${this.activeCharacter.name} is respawning...`);
    this.logEvent(
      this.activeCharacter,
      "respawn_start",
      `${this.activeCharacter.name} blacked out...`,
      undefined,
      {},
      this.activeCharacter.mesh!.position
    );

    // Apply penalties (e.g., lose gold) - Example
    const goldCount = this.activeCharacter.inventory?.countItem("gold") ?? 0;
    const goldPenalty = Math.min(10, Math.floor(goldCount * 0.1)); // Lose 10% or 10 gold max
    if (goldPenalty > 0) {
      this.activeCharacter.inventory?.removeItem("gold", goldPenalty);
      this.logEvent(
        this.activeCharacter,
        "penalty",
        `Lost ${goldPenalty} gold upon respawning.`,
        undefined,
        { item: "gold", amount: goldPenalty },
        this.activeCharacter.mesh!.position
      );
    }

    // Determine respawn location (e.g., near village center or start portal)
    const respawnPos = new Vector3(0, 0, 10); // Example: near village center
    // Actual placement on terrain is handled by Character.respawn

    // Call character's respawn logic
    this.activeCharacter.respawn(respawnPos);

    // Ensure game is unpaused after respawn
    this.setPauseState(false);
    // Cancel any actions player was doing
    this.interactionSystem?.cancelGatherAction();
    this.interactionSystem?.closeChatInterface(); // Close chat if it was open
  }

  // Switches player control to the target character.
  switchControlTo(targetCharacter: Character): void {
    if (
      !this.activeCharacter ||
      targetCharacter === this.activeCharacter ||
      !targetCharacter.mesh ||
      targetCharacter.isDead
    ) {
      console.warn("Cannot switch control: Invalid target character.");
      return;
    }

    const oldPlayer = this.activeCharacter;
    const newPlayer = targetCharacter;

    console.log(
      `Switching control from ${oldPlayer.name} to ${newPlayer.name}`
    );
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
    oldPlayer.aiController!.resetActionState(); // Reset AI state
    oldPlayer.initNameDisplay(); // Show NPC displays
    oldPlayer.initIntentDisplay();

    // --- Update New Player ---
    newPlayer.userData.isPlayer = true;
    newPlayer.userData.isNPC = false;
    newPlayer.aiController = null; // Remove AI controller
    newPlayer.removeDisplays(); // Hide NPC displays

    // --- Update Game Systems to point to the new active character ---
    this.activeCharacter = newPlayer;
    this.controls!.player = newPlayer; // Update controls target
    this.thirdPersonCamera!.setTarget(newPlayer.mesh!); // Update camera target
    this.physics!.setActivePlayer(newPlayer); // Update physics target
    this.interactionSystem!.setActivePlayer(newPlayer); // Update interaction system target
    this.hud!.setActivePlayer(newPlayer); // Update HUD target
    this.minimap?.setActivePlayer(newPlayer); // Update minimap target
    this.inventoryDisplay!.setInventory(newPlayer.inventory!); // Update inventory display source
    this.journalDisplay!.setEventLog(newPlayer.eventLog); // Update journal display source

    // --- Reset UI State ---
    this.inventoryDisplay!.hide();
    this.journalDisplay!.hide();
    this.interactionSystem!.closeChatInterface();
    this.setPauseState(false); // Ensure game is unpaused
    this.controls?.lockPointer(); // Attempt to lock pointer for new player
  }

  // Cycles control to the next available NPC.
  cycleControlToNextNPC(): void {
    if (!this.activeCharacter) return;
    const npcs = this.entities.filter(
      (e): e is Character =>
        e instanceof Character && e.userData.isNPC && !e.isDead
    );
    if (npcs.length === 0) return; // No NPCs to switch to

    const currentIndex = npcs.findIndex((npc) => npc === this.activeCharacter); // Find current index if player is an NPC (shouldn't happen ideally)
    let nextIndex = 0; // Default to first NPC if player isn't in the NPC list

    if (this.activeCharacter.userData.isPlayer) {
      // If current is player, find the first NPC
      nextIndex = 0;
    } else {
      // If current is an NPC, find the next one, wrapping around
      nextIndex = (currentIndex + 1) % npcs.length;
    }

    if (npcs[nextIndex]) {
      this.switchControlTo(npcs[nextIndex]);
    }
  }

  // --- Quest Management ---

  // Checks if an interaction completes any active quests.
  checkQuestCompletion(
    interactionTarget: Character,
    chatResponse: string
  ): void {
    let questCompleted = false;
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
        questCompleted = true;
      }
    });
    // Update journal UI if a quest was completed
    if (questCompleted) {
      this.journalDisplay?.updateQuests();
    }
  }

  // Displays a temporary message banner for quest completions or important events.
  showCongratulationMessage(message: string): void {
    const banner = document.getElementById("welcome-banner"); // Reuse welcome banner element
    if (banner) {
      banner.textContent = message;
      banner.classList.remove("hidden");
      // Hide after a delay
      setTimeout(() => banner.classList.add("hidden"), 5000); // Show for 5 seconds
    } else {
      console.log("MESSAGE:", message); // Fallback to console log
    }
  }

  // --- Event Handling ---

  // Handles window resize events.
  onWindowResize(): void {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    // Re-initialize mobile controls if layout changes significantly? (Consider if needed)
    console.log("Window resized");
  }

  // Handles clicks within the inventory UI.
  handleInventoryClick(event: MouseEvent): void {
    const slotElement = (event.target as HTMLElement)?.closest(
      ".inventory-slot"
    ) as HTMLElement | null;
    if (!slotElement || !this.activeCharacter?.inventory) return;

    const index = parseInt(slotElement.dataset.index ?? "-1", 10);
    if (index === -1) return;

    const item = this.activeCharacter.inventory.getItem(index);
    if (!item) return; // Clicked empty slot

    // Log examine event on click (or implement drag/drop/use logic here)
    this.logEvent(
      this.activeCharacter,
      "examine",
      `Examined ${item.name} in inventory.`,
      undefined,
      { item: item.name, slot: index },
      this.activeCharacter.mesh!.position
    );
    // Prevent click from propagating further (e.g., closing inventory)
    event.stopPropagation();
  }

  // Centralized method for logging game events.
  logEvent(
    actor: Entity | string, // Can be an Entity instance or a system name like 'System'
    action: string,
    message: string,
    target?: Entity | string | undefined, // Target entity, object ID, or name
    details: Record<string, any> = {},
    location?: Vector3
  ): void {
    const actorId = typeof actor === "string" ? actor : actor.id;
    const actorName = typeof actor === "string" ? actor : actor.name;
    const targetId =
      typeof target === "string"
        ? target
        : target instanceof Entity
          ? target.id
          : undefined;
    const targetName =
      typeof target === "string"
        ? target
        : target instanceof Entity
          ? target.name
          : undefined;

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
      location: location?.clone(), // Clone location if provided
    };

    // Distribute event to all characters' logs (including the active player's)
    this.entities.forEach((entity) => {
      if (entity instanceof Character && entity.eventLog) {
        entity.eventLog.addEntry(eventEntry);
      }
    });

    // Optionally log important events to the main console
    if (
      action === "death" ||
      action === "quest_complete" ||
      action === "error"
    ) {
      console.log(`[EVENT] ${message}`);
    }
  }

  // --- Portal Logic ---

  private animatePortals(elapsedTime: number): void {
    animatePortalParticles(this.exitPortalParticlesGeo, elapsedTime);
    animatePortalParticles(this.startPortalParticlesGeo, elapsedTime);
  }

  private checkPortalCollisions(): void {
    if (!this.activeCharacter?.mesh || this.activeCharacter.isDead) return;

    // Use player's bounding box for collision check
    const playerBox = this.activeCharacter.boundingBox; // Use the updated BB

    // Exit Portal Check
    if (
      this.exitPortalGroup &&
      this.exitPortalBox &&
      playerBox.intersectsBox(this.exitPortalBox)
    ) {
      console.log("Player entered Exit Portal!");
      // Construct parameters for the next page URL
      const params = new URLSearchParams({
        username: this.activeCharacter.name,
        color: "white", // Example parameter
        speed: this.activeCharacter.velocity.length().toFixed(2),
        ref: window.location.href, // Pass current URL as reference
        // Pass velocity components if needed by the target portal
        speed_x: this.activeCharacter.velocity.x.toFixed(2),
        speed_y: this.activeCharacter.velocity.y.toFixed(2),
        speed_z: this.activeCharacter.velocity.z.toFixed(2),
      });
      // TODO: Replace with actual target portal URL
      const nextPage = `http://portal.pieter.com?${params.toString()}`;
      window.location.href = nextPage; // Redirect the browser
      this.setPauseState(true); // Pause game during redirect
    }

    // Start Portal Check (Return Portal)
    if (
      this.startPortalGroup &&
      this.startPortalBox &&
      this.startPortalRefUrl &&
      this.startPortalOriginalParams &&
      playerBox.intersectsBox(this.startPortalBox)
    ) {
      console.log("Player entered Start Portal (Return)!");
      let returnUrl = this.startPortalRefUrl;
      // Ensure URL has protocol
      if (!returnUrl.startsWith("http")) {
        returnUrl = "https://" + returnUrl;
      }
      // Forward original params, excluding portal-specific ones used for entry
      const forwardParams = new URLSearchParams();
      for (const [key, value] of this.startPortalOriginalParams) {
        if (key !== "ref" && key !== "portal") {
          forwardParams.append(key, value);
        }
      }
      const paramString = forwardParams.toString();
      const finalUrl = returnUrl + (paramString ? "?" + paramString : "");
      window.location.href = finalUrl; // Redirect back
      this.setPauseState(true); // Pause game during redirect
    }
  }

  // --- Particle Effects ---

  // Spawns a simple particle effect at a position.
  spawnParticleEffect(position: Vector3, colorName: "red" | "green"): void {
    if (!this.scene || !this.clock) return;

    const particleCount = 15;
    const particleSize = 0.08;
    const effectDuration = PARTICLE_EFFECT_DURATION; // seconds
    const spreadRadius = 0.4;
    const particleSpeed = 2.0;
    const color = colorName === "red" ? 0xff4444 : 0x44ff44; // Slightly less intense colors

    const effectGroup = new Group();
    effectGroup.position.copy(position);

    // Use a single geometry for all particles in this effect for performance
    const geometry = new SphereGeometry(particleSize, 4, 2); // Simple sphere

    for (let i = 0; i < particleCount; i++) {
      // Use a single material instance per effect if color is the same
      const material = new MeshBasicMaterial({
        color: color,
        transparent: true,
        opacity: 0.9, // Start slightly transparent
      });
      const particle = new Mesh(geometry, material);

      // Calculate random initial offset and velocity
      const initialOffset = new Vector3(
        Math.random() - 0.5,
        Math.random() - 0.5,
        Math.random() - 0.5
      )
        .normalize()
        .multiplyScalar(Math.random() * spreadRadius); // Random direction, random distance within spread

      particle.position.copy(initialOffset);
      // Store velocity in userData
      particle.userData.velocity = initialOffset
        .clone()
        .normalize()
        .multiplyScalar(particleSpeed * (0.7 + Math.random() * 0.6)); // Vary speed slightly

      effectGroup.add(particle);
    }

    // Store effect metadata in the group's userData
    effectGroup.userData.startTime = this.clock.elapsedTime;
    effectGroup.userData.duration = effectDuration;

    this.scene.add(effectGroup);
    this.particleEffects.push(effectGroup); // Add to list for updating

    // Auto-dispose geometry/material after duration? More complex, handle in update for now.
  }

  // Updates position and opacity of active particle effects.
  private updateParticleEffects(elapsedTime: number, deltaTime: number): void {
    if (!this.scene) return;
    const particleDeltaTime = this.isPaused ? 0 : deltaTime; // Use 0 delta time if paused

    for (let i = this.particleEffects.length - 1; i >= 0; i--) {
      const effect = this.particleEffects[i];
      const effectStartTime = effect.userData.startTime as number;
      const effectDuration = effect.userData.duration as number;
      const effectElapsedTime = elapsedTime - effectStartTime;
      const progress = Math.min(1.0, effectElapsedTime / effectDuration); // Progress from 0 to 1

      // Check if effect duration has passed
      if (progress >= 1.0) {
        // Remove effect and dispose resources
        effect.traverse((child) => {
          if (child instanceof Mesh) {
            // Dispose geometry and material *only if* they are unique to this effect
            // If shared, disposal should happen elsewhere or use reference counting.
            // Assuming unique for now:
            child.geometry?.dispose();
            if (Array.isArray(child.material)) {
              child.material.forEach((m) => m.dispose());
            } else {
              child.material?.dispose();
            }
          }
        });
        this.scene.remove(effect);
        this.particleEffects.splice(i, 1); // Remove from active list
        continue; // Move to the next effect
      }

      // Update individual particles within the effect
      effect.children.forEach((particle) => {
        if (particle instanceof Mesh) {
          // Update position based on velocity (if not paused)
          if (
            particleDeltaTime > 0 &&
            particle.userData.velocity instanceof Vector3
          ) {
            particle.position.addScaledVector(
              particle.userData.velocity,
              particleDeltaTime
            );
            // Optional: Add gravity or drag to particles
            // particle.userData.velocity.y -= 9.8 * particleDeltaTime * 0.1; // Example gravity
          }

          // Update opacity to fade out over time
          const mat = particle.material as MeshBasicMaterial; // Assume MeshBasicMaterial
          if (mat.opacity !== undefined) {
            mat.opacity = 0.9 * (1.0 - progress); // Fade from 0.9 to 0
            mat.needsUpdate = true; // Required if material properties change? Check Three.js docs.
          }
        }
      });
    }
  }

  // --- Cleanup ---
  dispose(): void {
    console.log("Disposing game resources...");
    this.renderer.setAnimationLoop(null); // Stop game loop

    // Dispose systems and UI
    this.controls?.dispose();
    this.mobileControls?.destroy();
    this.inventoryDisplay?.dispose();
    this.journalDisplay?.dispose();
    // Minimap doesn't have explicit dispose, relies on canvas removal

    // Dispose entities
    this.entities.forEach((entity) => {
      if (entity instanceof Entity) {
        entity.destroy();
      } else if (entity instanceof Group) {
        // Dispose simple objects (geometry/material)
        entity.traverse((child) => {
          if (child instanceof Mesh) {
            child.geometry?.dispose();
            if (Array.isArray(child.material))
              child.material.forEach((m) => m.dispose());
            else child.material?.dispose();
          }
        });
        this.scene.remove(entity);
      }
    });
    this.entities = [];
    this.collidableObjects = [];
    this.interactableObjects = [];

    // Dispose particle effects
    this.particleEffects.forEach((effect) => {
      effect.traverse((child) => {
        if (child instanceof Mesh) {
          child.geometry?.dispose();
          if (Array.isArray(child.material))
            child.material.forEach((m) => m.dispose());
          else child.material?.dispose();
        }
      });
      this.scene.remove(effect);
    });
    this.particleEffects = [];

    // Dispose portals
    [this.exitPortalGroup, this.startPortalGroup].forEach((group) => {
      if (group) {
        group.traverse((child) => {
          if (child instanceof Mesh || child instanceof Points) {
            child.geometry?.dispose();
            if (Array.isArray(child.material))
              child.material.forEach((m) => m.dispose());
            else child.material?.dispose();
          }
        });
        this.scene.remove(group);
      }
    });

    // Dispose Three.js resources
    this.renderer.dispose();
    this.scene.clear(); // Clears children, but check if materials/geometries need explicit disposal

    // Remove canvas from DOM
    this.renderer.domElement.remove();

    // Stop audio
    this.audioElement?.pause();
    this.audioElement = null;

    // Remove window listeners
    window.removeEventListener("resize", this.onWindowResize); // Ensure listener reference is correct

    console.log("Game disposed.");
  }
}
