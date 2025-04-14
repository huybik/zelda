/* File: /src/main.ts */
import * as THREE from "three";
import {
  Scene,
  PerspectiveCamera,
  WebGLRenderer,
  Clock,
  Vector3,
  Color,
  Fog,
  PCFSoftShadowMap,
  Object3D,
  Group,
  AnimationClip,
  Box3,
  MathUtils, // Added MathUtils
} from "three";
import WebGL from "three/examples/jsm/capabilities/WebGL.js";
import { Entity } from "./entities/entitiy";
import { Character } from "./entities/character";
import { Animal } from "./entities/animals";
import { InteractionSystem } from "./systems/interaction";
import { Physics } from "./systems/physics";
import { ThirdPersonCamera } from "./systems/camera";
import { Controls } from "./controls/controls";
import { MobileControls } from "./controls/mobileControls";
import { HUD } from "./ui/hud";
import { InventoryDisplay } from "./ui/inventory";
import { JournalDisplay } from "./ui/journal";
import { Minimap } from "./ui/minimap";
import {
  Inventory,
  getTerrainHeight,
  Quest,
  InventoryItem,
  EventEntry,
} from "./core/utils.ts"; // Added InventoryItem
import { WORLD_SIZE, TERRAIN_SEGMENTS } from "./core/constants";
import { loadModels } from "./core/assetLoader";
import { createTerrain } from "./core/terrain";
import { setupLighting } from "./core/lighting";
import { populateEnvironment } from "./core/environment";
import { createWorldBoundary } from "./models/walls.ts";
import {
  spawnParticleEffect,
  updateParticleEffects,
} from "./systems/particles";
import { AIController } from "./ai/npcAI.ts";
import { AnimalAIController } from "./ai/animalAI.ts";
import { LandingPage } from "./ui/landingPage.ts";
import { QuestManager } from "./core/questManager.ts";
import { PortalManager } from "./objects/portalManagement";
import { getItemDefinition, WeaponDefinition, isWeapon } from "./core/items"; // Import item utils

export class Game {
  scene: Scene | null = null;
  renderer: WebGLRenderer | null = null;
  camera: PerspectiveCamera | null = null;
  clock: Clock | null = null;
  activeCharacter: Character | null = null;
  thirdPersonCamera: ThirdPersonCamera | null = null;
  controls: Controls | null = null;
  mobileControls: MobileControls | null = null;
  physics: Physics | null = null;
  inventory: Inventory | null = null; // This will be the PLAYER's inventory instance
  interactionSystem: InteractionSystem | null = null;
  hud: HUD | null = null;
  minimap: Minimap | null = null;
  inventoryDisplay: InventoryDisplay | null = null;
  journalDisplay: JournalDisplay | null = null;
  entities: Array<any> = []; // Includes Characters, Animals, Resources (Object3D)
  collidableObjects: Object3D[] = [];
  interactableObjects: Array<any> = []; // Includes Characters, Animals, Resources (Object3D)
  isPaused: boolean = false;
  isQuestBannerVisible: boolean = false;
  intentContainer: HTMLElement | null = null;
  particleEffects: Group[] = [];
  audioElement: HTMLAudioElement | null = null;
  startPortalRefUrl: string | null = null;
  startPortalOriginalParams: URLSearchParams | null = null;
  hasEnteredFromPortal: boolean = false;
  questManager: QuestManager;
  boundHandleVisibilityChange: () => void;
  wasPausedBeforeVisibilityChange: boolean = false;
  worldSize: number = WORLD_SIZE;
  language: string = "en";
  isGameStarted: boolean = false;
  private landingPage: LandingPage | null = null;
  public portalManager: PortalManager;

  private lastAiUpdateTime: number = 0;
  private aiUpdateInterval: number = 0.2; // Update AI logic 5 times per second

  private questBannerElement: HTMLElement | null = null;
  private questBannerTitle: HTMLElement | null = null;
  private questBannerDesc: HTMLElement | null = null;
  private questBannerButton: HTMLButtonElement | null = null;
  private boundQuestBannerClickHandler: (() => void) | null = null;
  public models!: Record<string, { scene: Group; animations: AnimationClip[] }>;

  constructor() {
    this.questManager = new QuestManager(this);
    this.portalManager = new PortalManager(this);
    this.boundHandleVisibilityChange = this.handleVisibilityChange.bind(this);
  }

  async init(): Promise<void> {
    this.clock = new Clock();
    this.initRenderer();
    this.initScene();
    this.initCamera();
    this.initInventory(); // Player inventory created here
    this.initAudio();

    const modelPaths = {
      player: "assets/player/scene.gltf",
      tavernMan: "assets/tavernman/scene.gltf",
      oldMan: "assets/oldman/scene.gltf",
      woman: "assets/woman/scene.gltf",
    };

    this.models = await loadModels(modelPaths);

    const savedName = localStorage.getItem("playerName");
    const savedLang = localStorage.getItem("selectedLanguage");
    this.language = savedLang || "en";

    const urlParams = new URLSearchParams(window.location.search);
    this.hasEnteredFromPortal = urlParams.get("portal") === "true";
    this.startPortalRefUrl = urlParams.get("ref");
    this.startPortalOriginalParams = urlParams;

    // Player initialized here, inventory is passed
    this.initPlayer(this.models, savedName || "Player");

    this.initControls();
    this.initMobileControls();
    this.initPhysics();
    this.initEnvironment(this.models); // NPCs created here
    this.initSystems();
    this.questManager.initQuests();
    this.initUI(); // UI initialized here, including InventoryDisplay
    this.setupUIControls();
    this.portalManager.initPortals(
      this.scene!,
      this.hasEnteredFromPortal,
      this.startPortalRefUrl,
      this.startPortalOriginalParams
    );
    // Look away from start portal if entered from one
    if (
      this.hasEnteredFromPortal &&
      this.portalManager.startPortal &&
      this.activeCharacter?.mesh
    ) {
      this.activeCharacter.mesh.lookAt(
        this.portalManager.startPortal.group.position
          .clone()
          .add(new Vector3(0, 0, 10))
      );
    }
    // Set portals for minimap
    if (this.minimap) {
      this.minimap.setPortals(
        this.portalManager.exitPortal?.group || null,
        this.portalManager.startPortal?.group || null
      );
    }
    // Initialize displays for all entities AFTER they are created
    this.entities.forEach((entity) => {
      if (entity instanceof Character || entity instanceof Animal) {
        entity.game = this; // Ensure game reference is set
        if (entity instanceof Character) {
          entity.initIntentDisplay();
          entity.initNameDisplay();
        } else if (entity instanceof Animal) {
          entity.initNameDisplay();
        }
      }
    });

    // Assign random weapons to NPCs AFTER environment population and display init
    this.assignStartingWeapons();

    // Find Quest Banner elements
    this.questBannerElement = document.getElementById("quest-detail-banner");
    this.questBannerTitle = document.getElementById("quest-banner-title");
    this.questBannerDesc = document.getElementById("quest-banner-description");
    this.questBannerButton = document.getElementById(
      "quest-banner-ok"
    ) as HTMLButtonElement;

    // Setup Landing Page LAST, it will handle initial pause state
    this.landingPage = new LandingPage(this);
    this.landingPage.setup(savedName, savedLang);

    document.addEventListener(
      "pointerlockchange",
      this.handlePointerLockChange.bind(this)
    );
    document.addEventListener(
      "visibilitychange",
      this.boundHandleVisibilityChange
    );

    this.renderer!.setAnimationLoop(this.update.bind(this));
  }

  handlePointerLockChange(): void {
    if (
      document.pointerLockElement === this.renderer?.domElement &&
      this.audioElement?.paused &&
      this.isGameStarted
    ) {
      this.audioElement
        .play()
        .catch((e) =>
          console.warn("Background music play failed on interaction:", e)
        );
    }
  }

  handleVisibilityChange(): void {
    if (!this.mobileControls?.isActive()) return; // Only apply for mobile
    if (document.visibilityState === "hidden") {
      this.wasPausedBeforeVisibilityChange = this.isPaused;
      this.setPauseState(true);
      console.log("Game paused (mobile) due to visibility change.");
      if (this.audioElement && !this.audioElement.paused)
        this.audioElement.pause();
    } else if (document.visibilityState === "visible") {
      if (!this.wasPausedBeforeVisibilityChange) {
        this.setPauseState(false);
        console.log("Game resumed (mobile) due to visibility change.");
        if (
          this.audioElement &&
          this.audioElement.paused &&
          !this.isPaused &&
          this.isGameStarted
        ) {
          this.audioElement
            .play()
            .catch((e) => console.warn("Audio resume failed", e));
        }
      } else {
        console.log(
          "Game kept paused (mobile) on visibility change because it was already paused."
        );
      }
      this.wasPausedBeforeVisibilityChange = false; // Reset flag
    }
  }

  initRenderer(): void {
    this.renderer = new WebGLRenderer({
      antialias: true,
      powerPreference: "high-performance",
    });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(window.devicePixelRatio);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = PCFSoftShadowMap;
    document
      .getElementById("game-container")
      ?.appendChild(this.renderer.domElement);
    this.intentContainer = document.getElementById("intent-container");
  }

  initScene(): void {
    this.scene = new Scene();
    this.scene.background = new Color(0x87ceeb);
    this.scene.fog = new Fog(0x87ceeb, 15, 50);
    setupLighting(this.scene);
    const terrain = createTerrain(WORLD_SIZE, TERRAIN_SEGMENTS);
    this.scene.add(terrain);
    this.collidableObjects.push(terrain);
    createWorldBoundary(this.scene, WORLD_SIZE, this.collidableObjects);
  }

  initCamera(): void {
    this.camera = new PerspectiveCamera(
      75,
      window.innerWidth / window.innerHeight,
      0.1,
      2000
    );
  }

  initInventory(): void {
    // Creates the inventory instance that the player will use
    this.inventory = new Inventory(20); // Example size 20
  }

  initAudio(): void {
    this.audioElement = new Audio("assets/background.mp3");
    this.audioElement.loop = true;
    this.audioElement.volume = 0.3;
  }

  initPlayer(
    models: Record<string, { scene: Group; animations: AnimationClip[] }>,
    playerName: string
  ): void {
    let playerSpawnPos = new Vector3(0, 0, 5);
    if (this.hasEnteredFromPortal) playerSpawnPos = new Vector3(0, 0, 15); // Adjust spawn if from portal
    playerSpawnPos.y = getTerrainHeight(
      this.scene!,
      playerSpawnPos.x,
      playerSpawnPos.z
    );

    const playerModelData = models.player;
    if (!playerModelData) throw new Error("Player model not loaded!");

    // Pass the game's inventory instance to the player character
    this.activeCharacter = new Character(
      this.scene!,
      playerSpawnPos,
      playerName,
      playerModelData.scene, // Pass the cloned scene
      playerModelData.animations,
      this.inventory! // Assign the game's inventory instance
    );
    this.activeCharacter.userData.isPlayer = true;
    this.activeCharacter.userData.isInteractable = true; // Player can be target of interaction? Maybe not needed.
    this.activeCharacter.userData.isNPC = false;
    if (this.activeCharacter.aiController)
      this.activeCharacter.aiController = null; // Remove AI for player

    this.entities.push(this.activeCharacter);
    this.collidableObjects.push(this.activeCharacter.mesh!);
    this.interactableObjects.push(this.activeCharacter); // Add player to interactables if needed (e.g., for targeting)
  }

  /** Assigns a random starting weapon to each NPC. */
  assignStartingWeapons(): void {
    const availableWeapons: string[] = ["axe", "pickaxe", "sword"];
    this.entities.forEach((entity) => {
      // Ensure it's an NPC Character and not the player
      if (entity instanceof Character) {
        const randomWeaponId =
          availableWeapons[Math.floor(Math.random() * availableWeapons.length)];
        const weaponDef = getItemDefinition(randomWeaponId);
        if (weaponDef && isWeapon(weaponDef)) {
          entity.inventory?.addItem(randomWeaponId, 1);

          // Use requestAnimationFrame to delay slightly, ensuring bones are ready.
          requestAnimationFrame(() => {
            entity.equipWeapon(weaponDef);
          });
          console.log(`Assigned ${weaponDef.name} to NPC ${entity.name}`);
        }
      }
    });
  }

  initControls(): void {
    if (!this.activeCharacter || !this.camera || !this.renderer)
      throw new Error("Cannot init controls: Core components missing.");
    this.thirdPersonCamera = new ThirdPersonCamera(
      this.camera,
      this.activeCharacter.mesh!
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
      throw new Error("Cannot init mobile controls: Base controls missing.");
    this.mobileControls = new MobileControls(this, this.controls);
  }

  initPhysics(): void {
    if (!this.activeCharacter)
      throw new Error("Cannot init physics: Player character missing.");
    this.physics = new Physics(this.activeCharacter, this.collidableObjects);
  }

  initEnvironment(
    models: Record<string, { scene: Group; animations: AnimationClip[] }>
  ): void {
    if (!this.scene || !this.inventory)
      throw new Error("Cannot init environment: Scene or Inventory missing.");
    populateEnvironment(
      this.scene,
      WORLD_SIZE,
      this.collidableObjects,
      this.interactableObjects,
      this.entities,
      this.inventory, // Pass player inventory (though NPCs don't use it here)
      models,
      this
    );
  }

  initSystems(): void {
    if (
      !this.activeCharacter ||
      !this.camera ||
      !this.controls ||
      !this.inventory
    )
      throw new Error("Cannot init systems: Core components missing.");
    this.interactionSystem = new InteractionSystem(
      this.activeCharacter,
      this.camera,
      this.interactableObjects,
      this.controls,
      this.inventory, // Pass player inventory
      this.activeCharacter.eventLog,
      this
    );
  }

  initUI(): void {
    if (!this.activeCharacter || !this.inventory)
      throw new Error("Cannot init UI: Player or Inventory missing.");
    this.hud = new HUD(this.activeCharacter);
    this.minimap = new Minimap(
      document.getElementById("minimap-canvas") as HTMLCanvasElement,
      this.activeCharacter,
      this.entities,
      WORLD_SIZE
    );
    // Pass the game instance to InventoryDisplay
    this.inventoryDisplay = new InventoryDisplay(this.inventory, this);
    this.journalDisplay = new JournalDisplay(
      this.activeCharacter.eventLog,
      this
    );
  }

  setupUIControls(): void {
    if (
      !this.controls ||
      !this.inventoryDisplay ||
      !this.journalDisplay ||
      !this.interactionSystem
    )
      return;

    this.controls.addKeyDownListener("KeyI", () => {
      if (this.interactionSystem?.isChatOpen || this.isQuestBannerVisible)
        return;
      this.journalDisplay!.hide(); // Close journal if open
      this.inventoryDisplay!.toggle();
      this.setPauseState(this.inventoryDisplay!.isOpen);
    });
    this.controls.addKeyDownListener("KeyJ", () => {
      if (this.interactionSystem?.isChatOpen || this.isQuestBannerVisible)
        return;
      this.inventoryDisplay!.hide(); // Close inventory if open
      this.journalDisplay!.toggle();
      // Pause state is handled by journalDisplay show/hide methods
    });
    this.controls.addKeyDownListener("KeyC", () => {
      if (this.isPaused) return; // Prevent switching when paused
      if (
        this.interactionSystem!.currentTarget instanceof Character &&
        this.interactionSystem!.currentTarget !== this.activeCharacter
      ) {
        this.switchControlTo(this.interactionSystem!.currentTarget);
      }
    });

    // Click/Double-click is now handled within InventoryDisplay using event delegation
    // No need for a specific mouse listener here for inventory slots.
  }

  setPauseState(paused: boolean): void {
    if (this.isPaused === paused) return;

    // Special check for landing page: if landing page is visible, always pause.
    const landingPageVisible = !document
      .getElementById("landing-page")
      ?.classList.contains("hidden");
    if (landingPageVisible) {
      paused = true;
    }

    // Prevent unpausing if a UI element requires it
    if (!paused && this.isUIPaused()) {
      console.log("Attempted to unpause, but UI requires pause.");
      return; // Do not unpause if a UI element requires it
    }

    this.isPaused = paused;

    // Handle pointer lock for non-mobile
    if (!this.mobileControls?.isActive()) {
      if (this.isPaused) {
        if (this.controls?.isPointerLocked) this.controls.unlockPointer();
      } else {
        // Only attempt to lock pointer if no UI requires pause and pointer isn't already locked
        if (!this.isUIPaused() && !document.pointerLockElement) {
          this.controls?.lockPointer();
        }
      }
    }
    // console.log("Game Paused:", this.isPaused);
  }

  // Checks if any UI element that requires pausing is open
  isUIPaused(): boolean {
    return (
      this.inventoryDisplay?.isOpen ||
      this.journalDisplay?.isOpen ||
      this.interactionSystem?.isChatOpen ||
      this.isQuestBannerVisible
    );
  }

  showQuestBanner(quest: Quest | null, isCompletion: boolean = false): void {
    if (
      !this.questBannerElement ||
      !this.questBannerTitle ||
      !this.questBannerDesc ||
      !this.questBannerButton
    )
      return;

    // Remove previous listener if exists
    if (this.boundQuestBannerClickHandler && this.questBannerButton) {
      this.questBannerButton.removeEventListener(
        "click",
        this.boundQuestBannerClickHandler
      );
      this.boundQuestBannerClickHandler = null;
    }

    if (quest) {
      this.questBannerTitle.textContent = isCompletion
        ? `Quest Completed: ${quest.name}`
        : quest.name;
      this.questBannerDesc.textContent = quest.description;
      this.questBannerElement.classList.remove("hidden");
      this.isQuestBannerVisible = true;
      this.setPauseState(true); // Pause the game

      // Add new one-time listener
      this.boundQuestBannerClickHandler = () => {
        this.showQuestBanner(null); // Call hide logic
      };
      this.questBannerButton.addEventListener(
        "click",
        this.boundQuestBannerClickHandler,
        { once: true }
      );
    } else {
      // Hide the banner
      this.questBannerElement.classList.add("hidden");
      this.isQuestBannerVisible = false;
      this.setPauseState(false); // Unpause the game (if no other UI requires pause)

      // Clean up just in case
      if (this.boundQuestBannerClickHandler && this.questBannerButton) {
        this.questBannerButton.removeEventListener(
          "click",
          this.boundQuestBannerClickHandler
        );
      }
      this.boundQuestBannerClickHandler = null;
    }
  }

  start(): void {
    console.log(
      "Game initialized. Waiting for user to start via landing page."
    );
    // Actual start logic is triggered by the landing page button click
  }

  update(): void {
    if (
      !this.clock ||
      !this.renderer ||
      !this.scene ||
      !this.camera ||
      !this.activeCharacter ||
      !this.isGameStarted
    )
      return;

    const deltaTime = Math.min(this.clock.getDelta(), 0.05); // Clamp delta time
    const elapsedTime = this.clock.elapsedTime;

    // Update controls first
    this.mobileControls?.update(deltaTime);
    this.controls!.update(deltaTime); // Base controls update handles mouse movement for camera

    // --- Game Logic Update (conditional on pause state) ---
    if (!this.isPaused) {
      const currentTime = this.clock.elapsedTime;
      const timeSinceLastAiUpdate = currentTime - this.lastAiUpdateTime;
      const shouldUpdateAiLogic =
        timeSinceLastAiUpdate >= this.aiUpdateInterval;

      if (shouldUpdateAiLogic) {
        this.lastAiUpdateTime = currentTime;
      }

      // Update active character (player)
      this.activeCharacter.update(deltaTime, {
        moveState: this.controls!.moveState,
        collidables: this.collidableObjects,
      });

      // Update physics (collisions) after player movement
      this.physics!.update(deltaTime);

      // Update other entities (NPCs, Animals)
      this.entities.forEach((entity) => {
        if (entity === this.activeCharacter) return; // Skip player

        if (
          entity instanceof Character &&
          entity.aiController instanceof AIController
        ) {
          // Update NPC AI logic at intervals
          if (shouldUpdateAiLogic) {
            entity.moveState = entity.aiController.computeAIMoveState(
              timeSinceLastAiUpdate
            ); // AI computes its desired move state
          }
          // Update NPC entity state every frame using its current moveState
          entity.update(deltaTime, {
            moveState: entity.moveState,
            collidables: this.collidableObjects,
          });
        } else if (
          entity instanceof Animal &&
          entity.aiController instanceof AnimalAIController
        ) {
          // Update Animal AI logic at intervals
          if (shouldUpdateAiLogic) {
            entity.aiController.updateLogic(timeSinceLastAiUpdate); // AI updates its internal state/target
          }
          // Update Animal entity state every frame (movement/animation based on AI state)
          entity.update(deltaTime, { collidables: this.collidableObjects });
        } else if (
          entity.update &&
          !(entity instanceof Character) &&
          !(entity instanceof Animal)
        ) {
          // Update other simple entities if they have an update method
          entity.update(deltaTime);
        }
      });

      // Update systems
      this.interactionSystem!.update(deltaTime);
      this.thirdPersonCamera!.update(deltaTime, this.collidableObjects); // Update camera after all movements
      this.portalManager.animatePortals();
      this.portalManager.checkPortalCollisions();
      updateParticleEffects(this, elapsedTime); // Update particle effects
      this.checkDeadEntityRemoval(); // Check for removing dead entities

      // Check player death
      if (this.activeCharacter.isDead) this.respawnPlayer();
    } // End if (!this.isPaused)

    // --- UI Update (always update) ---
    this.hud!.update();
    this.minimap!.update();
    // Inventory and Journal displays update themselves internally when shown/data changes

    // --- Render ---
    this.renderer.render(this.scene, this.camera);
  }

  checkDeadEntityRemoval(): void {
    const now = performance.now();
    const removalDelay = 7000; // 7 seconds
    const entitiesToRemove: Entity[] = [];

    for (const entity of this.entities) {
      // Check for dead non-player entities with a death timestamp
      if (
        entity.isDead &&
        entity !== this.activeCharacter &&
        entity.deathTimestamp !== null
      ) {
        const timeSinceDeath = now - entity.deathTimestamp;
        if (timeSinceDeath > removalDelay) {
          entitiesToRemove.push(entity);
        }
      }
    }

    if (entitiesToRemove.length > 0) {
      for (const entityToRemove of entitiesToRemove) {
        console.log(
          `Removing dead entity: ${entityToRemove.name} after timeout.`
        );

        // Remove from collidables
        const collidableIndex = this.collidableObjects.findIndex(
          (obj) => obj === entityToRemove.mesh
        );
        if (collidableIndex > -1)
          this.collidableObjects.splice(collidableIndex, 1);

        // Remove from interactables
        const interactableIndex = this.interactableObjects.findIndex(
          (obj) => obj === entityToRemove
        );
        if (interactableIndex > -1)
          this.interactableObjects.splice(interactableIndex, 1);

        // Call entity's destroy method (cleans up mesh, etc.)
        entityToRemove.destroy?.();

        // Remove from main entities list
        const entityIndex = this.entities.findIndex(
          (e) => e === entityToRemove
        );
        if (entityIndex > -1) this.entities.splice(entityIndex, 1);
      }
      // Update minimap's entity list reference if needed (or minimap filters internally)
      if (this.minimap) this.minimap.entities = this.entities;
    }
  }

  spawnParticleEffect(position: Vector3, colorName: "red" | "green"): void {
    spawnParticleEffect(this, position, colorName);
  }

  respawnPlayer(): void {
    if (!this.activeCharacter || !this.scene) return;
    const respawnMessage = `${this.activeCharacter.name} blacked out and woke up back near the village...`;
    this.logEvent(
      this.activeCharacter,
      "respawn_start",
      respawnMessage,
      undefined,
      {},
      this.activeCharacter.mesh!.position
    );

    // Define a safe respawn point (e.g., near village center or start portal)
    let respawnPos = new Vector3(0, 0, 10); // Example near village
    if (this.portalManager.startPortal) {
      respawnPos = this.portalManager.startPortal.group.position
        .clone()
        .add(new Vector3(0, 0, 3)); // Near start portal
    }
    respawnPos.y = getTerrainHeight(this.scene, respawnPos.x, respawnPos.z);

    this.activeCharacter.respawn(respawnPos);
    this.setPauseState(false); // Unpause after respawn
  }

  switchControlTo(targetCharacter: Character): void {
    if (
      targetCharacter === this.activeCharacter ||
      !targetCharacter.mesh ||
      targetCharacter.isDead
    )
      return;

    const oldPlayer = this.activeCharacter!;
    const newPlayer = targetCharacter;

    // --- Logging ---
    const switchMessage = `Switched control to ${newPlayer.name}.`;
    this.logEvent(
      oldPlayer,
      "control_switch_out",
      switchMessage,
      newPlayer.name,
      {},
      oldPlayer.mesh!.position
    );
    this.logEvent(
      newPlayer,
      "control_switch_in",
      `Switched control from ${oldPlayer.name}.`,
      oldPlayer.name,
      {},
      newPlayer.mesh!.position
    );

    // --- Transfer Player Status ---
    oldPlayer.userData.isPlayer = false;
    oldPlayer.userData.isNPC = true;
    newPlayer.userData.isPlayer = true;
    newPlayer.userData.isNPC = false;

    // --- AI Handling ---
    if (!oldPlayer.aiController) {
      console.warn(
        `Creating AIController for ${oldPlayer.name} on switch-out.`
      );
      oldPlayer.aiController = new AIController(oldPlayer);
      oldPlayer.aiController.persona = oldPlayer.persona; // Ensure persona is set
    }
    if (oldPlayer.aiController instanceof AIController) {
      oldPlayer.aiController.aiState = "idle"; // Reset AI state
      oldPlayer.aiController.previousAiState = "idle";
    }
    if (newPlayer.aiController) newPlayer.aiController = null; // Remove AI from new player

    // --- UI/Display Handling ---
    oldPlayer.initIntentDisplay(); // Show intent bubble for old player (now NPC)
    oldPlayer.initNameDisplay(); // Show name for old player
    newPlayer.removeDisplays(); // Hide intent/name bubble for new player

    // --- System Updates ---
    this.activeCharacter = newPlayer;
    this.controls!.player = newPlayer;
    this.thirdPersonCamera!.target = newPlayer.mesh!;
    this.physics!.player = newPlayer;
    this.interactionSystem!.player = newPlayer;
    this.hud!.player = newPlayer;
    this.minimap!.player = newPlayer;

    // --- Inventory & Logs ---
    // Player inventory stays with the character instance. Update game references.
    this.inventory = newPlayer.inventory; // Update game's reference to the active inventory
    this.inventoryDisplay!.setInventory(this.inventory!); // Update display's reference
    this.interactionSystem!.inventory = newPlayer.inventory!;
    this.interactionSystem!.eventLog = newPlayer.eventLog; // Update interaction system log ref
    this.journalDisplay!.setEventLog(newPlayer.eventLog); // Update journal display log ref

    // --- Reset UI States ---
    this.inventoryDisplay!.hide();
    this.journalDisplay!.hide();
    this.interactionSystem!.closeChatInterface();
    this.setPauseState(false); // Ensure game is unpaused after switch

    console.log(`Control switched to: ${newPlayer.name}`);
  }

  onWindowResize(): void {
    if (this.camera && this.renderer) {
      this.camera.aspect = window.innerWidth / window.innerHeight;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(window.innerWidth, window.innerHeight);
    }
  }

  logEvent(
    actor: Entity | string,
    action: string,
    message: string,
    target?: Entity | string | Object3D, // Allow Object3D for resources
    details: Record<string, any> = {},
    location?: Vector3
  ): void {
    const timestamp = new Date().toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });

    const actorId = typeof actor === "string" ? actor : actor.id;
    const actorName = typeof actor === "string" ? actor : actor.name;

    let targetId: string | undefined;
    let targetName: string | undefined;
    if (typeof target === "string") {
      targetId = target;
      targetName = target;
    } else if (target instanceof Entity) {
      targetId = target.id;
      targetName = target.name;
    } else if (target instanceof Object3D) {
      targetId = target.uuid; // Use UUID for generic objects
      targetName = target.name || target.userData?.resource || "Object"; // Use name, resource, or default
    }

    const eventEntry: EventEntry = {
      timestamp,
      message,
      actorId,
      actorName,
      action,
      targetId,
      targetName,
      details,
      location: location?.clone(), // Clone location if provided
    };

    // Log to all character event logs
    this.entities.forEach((entity) => {
      if (entity instanceof Character && entity.eventLog) {
        entity.eventLog.addEntry(eventEntry);
      }
    });
    // Optionally log to a global game log here if needed
    // console.log(`[${timestamp}] ${message}`);
  }

  destroy(): void {
    document.removeEventListener(
      "visibilitychange",
      this.boundHandleVisibilityChange
    );
    this.renderer?.setAnimationLoop(null);
    this.controls?.dispose();
    this.mobileControls?.destroy();
    this.inventoryDisplay?.destroy(); // Clean up inventory display listeners
    this.journalDisplay = null; // Assuming journal doesn't need complex cleanup
    this.entities.forEach((entity) => entity.destroy?.()); // Call destroy on entities that have it
    this.scene?.traverse((object) => {
      if (object instanceof THREE.Mesh) {
        object.geometry?.dispose();
        if (Array.isArray(object.material)) {
          object.material.forEach((material) => material.dispose());
        } else if (object.material) {
          object.material.dispose();
        }
      } else if (object instanceof THREE.Sprite) {
        object.material?.map?.dispose();
        object.material?.dispose();
      }
    });
    this.renderer?.dispose();
    const gameContainer = document.getElementById("game-container");
    if (gameContainer && this.renderer) {
      gameContainer.removeChild(this.renderer.domElement);
    }

    // Nullify major references
    this.scene = null;
    this.renderer = null;
    this.camera = null;
    this.clock = null;
    this.activeCharacter = null;
    this.entities = [];
    this.collidableObjects = [];
    this.interactableObjects = [];
    this.particleEffects = [];
    console.log("Game destroyed.");
  }
}

// --- Global Access & Initialization ---
declare global {
  interface Window {
    game: Game;
  }
}

if (WebGL.isWebGL2Available()) {
  async function startGame() {
    const gameInstance = new Game();
    window.game = gameInstance; // Make accessible globally for debugging
    try {
      await gameInstance.init();
      // gameInstance.start(); // Start logic is now within init/landing page
      const onResize = () => gameInstance.onWindowResize();
      window.addEventListener("resize", onResize, false);
      // Cleanup on page unload
      window.addEventListener("beforeunload", () => {
        window.removeEventListener("resize", onResize);
        gameInstance.destroy();
      });
    } catch (error) {
      console.error("Failed to initialize game:", error);
      const errorElement = document.createElement("div");
      errorElement.textContent = `Failed to initialize game: ${error}`;
      errorElement.style.color = "red";
      errorElement.style.padding = "20px";
      document.body.appendChild(errorElement);
      // Hide landing page if it exists on error
      document.getElementById("landing-page")?.classList.add("hidden");
    }
  }
  startGame();
} else {
  const warning = WebGL.getWebGLErrorMessage();
  document.getElementById("game-container")?.appendChild(warning);
}
