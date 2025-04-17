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
  MathUtils,
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
import { NotificationManager } from "./ui/notificationManager";
import {
  Inventory,
  getTerrainHeight,
  Quest,
  InventoryItem,
  EventEntry,
} from "./core/utils.ts";
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
import { TradingSystem } from "./systems/tradingSystem.ts";
import { CombatSystem } from "./systems/combatSystem.ts";
import {
  getItemDefinition,
  isWeapon,
  Profession,
  ProfessionStartingWeapon,
} from "./core/items";
import { DroppedItemManager } from "./systems/droppedItemManager.ts";
import { UIManager } from "./ui/uiManager.ts"; // Import UIManager

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
  combatSystem: CombatSystem | null = null;
  inventory: Inventory | null = null;
  interactionSystem: InteractionSystem | null = null;
  tradingSystem: TradingSystem | null = null;
  droppedItemManager: DroppedItemManager | null = null;
  hud: HUD | null = null;
  minimap: Minimap | null = null;
  inventoryDisplay: InventoryDisplay | null = null;
  journalDisplay: JournalDisplay | null = null;
  notificationManager: NotificationManager | null = null;
  uiManager: UIManager | null = null; // Add UIManager
  entities: Array<any> = [];
  collidableObjects: Object3D[] = [];
  interactableObjects: Array<any> = [];
  isPaused: boolean = false;
  // Removed banner state, managed by UIManager now
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
  playerProfession: Profession = Profession.None;
  isGameStarted: boolean = false;
  private landingPage: LandingPage | null = null;
  public portalManager: PortalManager;
  public wolfKillCount: number = 0;
  public characterSwitchingEnabled: boolean = false;

  private lastAiUpdateTime: number = 0;
  private aiUpdateInterval: number = 0.2;
  private lastQuestCheckTime: number = 0;
  private questCheckInterval: number = 0.5;

  // Removed banner elements and handlers, moved to UIManager

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
    this.initInventory();
    this.initAudio();

    const modelPaths = {
      player: "assets/player.glb",
      tavernMan: "assets/tavernman.glb",
      oldMan: "assets/oldman.glb",
      woman: "assets/woman.glb",
      sword: "assets/items/weapons/sword.glb",
      axe: "assets/items/weapons/axe.glb",
      pickaxe: "assets/items/weapons/pickaxe.glb",
    };

    this.models = await loadModels(modelPaths);

    const savedName = localStorage.getItem("playerName");
    const savedLang = localStorage.getItem("selectedLanguage");
    const savedProfession = localStorage.getItem(
      "selectedProfession"
    ) as Profession | null;
    this.language = savedLang || "en";
    this.playerProfession = savedProfession || Profession.Hunter;

    const urlParams = new URLSearchParams(window.location.search);
    this.hasEnteredFromPortal = urlParams.get("portal") === "true";
    this.startPortalRefUrl = urlParams.get("ref");
    this.startPortalOriginalParams = urlParams;

    this.initPlayer(this.models, savedName || "Player");
    if (this.activeCharacter) {
      this.activeCharacter.professions.add(this.playerProfession);
      this.activeCharacter.profession = this.playerProfession;
    }

    this.initControls();
    this.initMobileControls(); // Initialize mobile controls before camera
    this.initCameraAndControls(); // Initialize camera after mobile controls status is known
    this.initPhysics();
    this.initEnvironment(this.models);
    this.initSystems(); // Includes TradingSystem, DroppedItemManager, CombatSystem
    this.questManager.initQuests();
    this.initUI(); // Includes UIManager
    this.setupUIControls();
    this.portalManager.initPortals(
      this.scene!,
      this.hasEnteredFromPortal,
      this.startPortalRefUrl,
      this.startPortalOriginalParams
    );

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

    if (this.minimap) {
      this.minimap.setPortals(
        this.portalManager.exitPortal?.group || null,
        this.portalManager.startPortal?.group || null
      );
    }

    this.entities.forEach((entity) => {
      if (entity instanceof Character || entity instanceof Animal) {
        entity.game = this;
        if (entity instanceof Character) {
          entity.initIntentDisplay();
          entity.initNameDisplay();
        } else if (entity instanceof Animal) {
          entity.initNameDisplay();
        }
      }
    });

    // UIManager initialization moved to initUI
    // Removed banner element finding here

    this.landingPage = new LandingPage(this);
    this.landingPage.setup(savedName, savedLang, savedProfession);

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
    if (!this.mobileControls?.isActive()) return;
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
      this.wasPausedBeforeVisibilityChange = false;
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
    this.inventory = new Inventory(20);
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
    if (this.hasEnteredFromPortal) playerSpawnPos = new Vector3(0, 0, 15);
    playerSpawnPos.y = getTerrainHeight(
      this.scene!,
      playerSpawnPos.x,
      playerSpawnPos.z
    );

    const playerModelData = models.player;
    if (!playerModelData) throw new Error("Player model not loaded!");

    this.activeCharacter = new Character(
      this.scene!,
      playerSpawnPos,
      playerName,
      playerModelData.scene,
      playerModelData.animations,
      this.inventory!
    );
    this.activeCharacter.userData.isPlayer = true;
    this.activeCharacter.userData.isInteractable = true;
    this.activeCharacter.userData.isNPC = false;
    if (this.activeCharacter.aiController)
      this.activeCharacter.aiController = null;

    this.entities.push(this.activeCharacter);
    this.collidableObjects.push(this.activeCharacter.mesh!);
    this.interactableObjects.push(this.activeCharacter);
  }

  giveStartingWeapon(): void {
    if (!this.activeCharacter || !this.activeCharacter.inventory) return;

    const startingWeaponId = ProfessionStartingWeapon[this.playerProfession];
    if (startingWeaponId) {
      const addResult = this.activeCharacter.inventory.addItem(
        startingWeaponId,
        1
      );
      if (addResult.totalAdded > 0) {
        console.log(
          `Gave starting weapon ${startingWeaponId} to player for profession ${this.playerProfession}.`
        );
        const weaponDef = getItemDefinition(startingWeaponId);
        if (weaponDef && isWeapon(weaponDef)) {
          requestAnimationFrame(() => {
            this.activeCharacter?.equipWeapon(weaponDef);
          });
        }
      } else {
        console.warn(
          `Could not give starting weapon ${startingWeaponId} to player (inventory full?).`
        );
      }
    }
  }

  initControls(): void {
    if (!this.activeCharacter || !this.renderer)
      throw new Error("Cannot init controls: Core components missing.");
    // Camera initialization moved to initCameraAndControls
    this.controls = new Controls(
      this.activeCharacter,
      null, // Camera controller passed later
      this.renderer.domElement,
      this
    );
  }

  initMobileControls(): void {
    if (!this.controls)
      throw new Error("Cannot init mobile controls: Base controls missing.");
    this.mobileControls = new MobileControls(this, this.controls);
  }

  // New method to initialize camera and link controls after mobile status is known
  initCameraAndControls(): void {
    if (!this.activeCharacter || !this.camera || !this.controls)
      throw new Error("Cannot init camera/controls: Core components missing.");

    const isMobileActive = this.mobileControls?.isActive() ?? false;
    this.thirdPersonCamera = new ThirdPersonCamera(
      this.camera,
      this.activeCharacter.mesh!,
      isMobileActive, // Pass mobile status
      this // Pass Game instance
    );
    this.controls.cameraController = this.thirdPersonCamera; // Link camera to controls
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
      this.inventory,
      models,
      this
    );
  }

  initSystems(): void {
    if (
      !this.activeCharacter ||
      !this.camera ||
      !this.controls ||
      !this.inventory ||
      !this.scene
    )
      throw new Error("Cannot init systems: Core components missing.");

    this.droppedItemManager = new DroppedItemManager(this);
    this.combatSystem = new CombatSystem(this);
    this.interactionSystem = new InteractionSystem(
      this.activeCharacter,
      this.camera,
      this.interactableObjects,
      this.controls,
      this.inventory,
      this.activeCharacter.eventLog,
      this,
      this.droppedItemManager
    );
    this.tradingSystem = new TradingSystem(this);
  }

  initUI(): void {
    if (!this.activeCharacter || !this.inventory || !this.scene || !this.camera)
      throw new Error("Cannot init UI: Core components missing.");
    this.hud = new HUD(this.activeCharacter);
    this.minimap = new Minimap(
      document.getElementById("minimap-canvas") as HTMLCanvasElement,
      this.activeCharacter,
      this.entities,
      WORLD_SIZE
    );
    this.inventoryDisplay = new InventoryDisplay(this.inventory, this);
    this.journalDisplay = new JournalDisplay(
      this.activeCharacter.eventLog,
      this
    );
    this.notificationManager = new NotificationManager(
      this.scene,
      this.camera,
      document.getElementById("ui-container")!
    );
    this.uiManager = new UIManager(this); // Initialize UIManager
    this.uiManager.init(); // Call UIManager's init to get elements
  }

  setupUIControls(): void {
    if (
      !this.controls ||
      !this.inventoryDisplay ||
      !this.journalDisplay ||
      !this.interactionSystem ||
      !this.uiManager // Check for uiManager
    )
      return;

    this.controls.addKeyDownListener("KeyI", () => {
      if (this.interactionSystem?.isChatOpen || this.uiManager?.isBannerVisible)
        return;
      this.journalDisplay!.hide();
      this.inventoryDisplay!.toggle();
      this.setPauseState(this.inventoryDisplay!.isOpen);
    });
    this.controls.addKeyDownListener("KeyJ", () => {
      if (this.interactionSystem?.isChatOpen || this.uiManager?.isBannerVisible)
        return;
      this.inventoryDisplay!.hide();
      this.journalDisplay!.toggle();
      // Pause state handled by journalDisplay
    });
    this.controls.addKeyDownListener("KeyC", () => {
      if (this.isPaused || !this.characterSwitchingEnabled) return;
      if (
        this.interactionSystem!.currentTarget instanceof Character &&
        this.interactionSystem!.currentTarget !== this.activeCharacter
      ) {
        this.switchControlTo(this.interactionSystem!.currentTarget);
      }
    });
  }

  setPauseState(paused: boolean): void {
    if (this.isPaused === paused) return;

    const landingPageVisible = !document
      .getElementById("landing-page")
      ?.classList.contains("hidden");
    if (landingPageVisible) {
      paused = true;
    }

    if (!paused && this.isUIPaused()) {
      console.log("Attempted to unpause, but UI requires pause.");
      return;
    }

    this.isPaused = paused;

    if (!this.mobileControls?.isActive()) {
      if (this.isPaused) {
        if (this.controls?.isPointerLocked) this.controls.unlockPointer();
      } else {
        if (!this.isUIPaused() && !document.pointerLockElement) {
          this.controls?.lockPointer();
        }
      }
    }
    console.log("Game Paused:", this.isPaused);
  }

  isUIPaused(): boolean {
    // Delegate check to UIManager
    return this.uiManager?.isUIPaused() ?? false;
  }

  // Removed banner methods, now handled by UIManager
  // showBanner, removeBannerListeners, hideQuestBanner,
  // showQuestCompletionBanner, handleRewardSelection,
  // showTradeNotification, handleTradeAccept, handleTradeDecline

  // Wrapper methods to call UIManager
  showQuestCompletionBanner(quest: Quest): void {
    this.uiManager?.showQuestCompletionBanner(quest);
  }

  showTradeNotification(
    initiator: Character,
    target: Character,
    itemsToGive: InventoryItem[],
    itemsToReceive: InventoryItem[]
  ): void {
    this.uiManager?.showTradeNotification(
      initiator,
      target,
      itemsToGive,
      itemsToReceive
    );
  }

  handleTradeAccept(): void {
    this.uiManager?.handleTradeAccept();
  }

  handleTradeDecline(): void {
    this.uiManager?.handleTradeDecline();
  }

  hideQuestBanner(): void {
    this.uiManager?.hideBanner();
  }

  // Getter for UIManager's banner visibility state
  get isQuestBannerVisible(): boolean {
    return this.uiManager?.isBannerVisible ?? false;
  }

  // Getter for UIManager's banner type state
  get currentBannerType(): "quest" | "trade" | "none" {
    return this.uiManager?.currentBannerType ?? "none";
  }

  start(): void {
    console.log(
      "Game initialized. Waiting for user to start via landing page."
    );
  }

  handlePlayerAttackInput(): void {
    if (this.isPaused || !this.activeCharacter || !this.combatSystem) return;
    this.combatSystem.initiateAttack(this.activeCharacter);
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

    const deltaTime = Math.min(this.clock.getDelta(), 0.05);
    const elapsedTime = this.clock.elapsedTime;

    this.controls!.update(deltaTime);
    this.mobileControls?.update(deltaTime);

    if (!this.isPaused) {
      const currentTime = this.clock.elapsedTime;
      const timeSinceLastAiUpdate = currentTime - this.lastAiUpdateTime;
      const shouldUpdateAiLogic =
        timeSinceLastAiUpdate >= this.aiUpdateInterval;

      if (shouldUpdateAiLogic) {
        this.lastAiUpdateTime = currentTime;
      }

      if (this.controls?.moveState.attack || this.mobileControls?.attackHeld) {
        this.handlePlayerAttackInput();
      }

      this.activeCharacter.update(deltaTime, {
        moveState: this.controls!.moveState,
        collidables: this.collidableObjects,
      });

      this.physics!.update(deltaTime);

      this.entities.forEach((entity) => {
        if (entity === this.activeCharacter) return;

        if (
          entity instanceof Character &&
          entity.aiController instanceof AIController
        ) {
          if (shouldUpdateAiLogic) {
            entity.moveState = entity.aiController.computeAIMoveState(
              timeSinceLastAiUpdate
            );
          }
          entity.update(deltaTime, {
            moveState: entity.moveState,
            collidables: this.collidableObjects,
          });
        } else if (
          entity instanceof Animal &&
          entity.aiController instanceof AnimalAIController
        ) {
          if (shouldUpdateAiLogic) {
            entity.aiController.updateLogic(timeSinceLastAiUpdate);
          }
          entity.update(deltaTime, { collidables: this.collidableObjects });
        } else if (
          entity instanceof Group &&
          entity.userData?.mixer &&
          entity.userData?.isFalling
        ) {
          entity.userData.mixer.update(deltaTime);
          if (
            !entity.userData.fallAction.isRunning() &&
            entity.userData.isFalling
          ) {
            entity.userData.isFalling = false;
            entity.visible = false;
            entity.userData.isCollidable = false;
            entity.userData.isInteractable = false;
            const respawnTime = entity.userData.respawnTime || 20000;
            const maxHealth = entity.userData.maxHealth;
            setTimeout(() => {
              if (entity && entity.userData) {
                entity.visible = true;
                entity.userData.isCollidable = true;
                entity.userData.isInteractable = true;
                entity.userData.health = maxHealth;
                entity.rotation.set(0, 0, 0);
                entity.quaternion.set(0, 0, 0, 1);
              }
            }, respawnTime);
          }
        } else if (
          entity.update &&
          !(entity instanceof Character) &&
          !(entity instanceof Animal) &&
          !(entity instanceof Group && entity.userData?.mixer)
        ) {
          entity.update(deltaTime);
        }
      });

      this.combatSystem?.update(deltaTime);
      this.interactionSystem!.update(deltaTime);
      this.thirdPersonCamera!.update(deltaTime, this.collidableObjects);
      this.portalManager.animatePortals();
      this.portalManager.checkPortalCollisions();
      updateParticleEffects(this, elapsedTime);
      this.droppedItemManager?.update(deltaTime);
      this.checkRespawn();

      if (currentTime - this.lastQuestCheckTime > this.questCheckInterval) {
        this.questManager.checkAllQuestsCompletion();
        this.lastQuestCheckTime = currentTime;
      }

      if (this.activeCharacter.isDead) this.respawnPlayer();
    }

    this.hud!.update();
    this.minimap!.update();
    this.notificationManager?.update(deltaTime);

    this.renderer.render(this.scene, this.camera);
  }

  checkRespawn(): void {
    const now = performance.now();
    for (const entity of this.entities) {
      if (
        entity.isDead &&
        entity.deathTimestamp !== null &&
        entity !== this.activeCharacter
      ) {
        const respawnDelay =
          (entity as Character | Animal).respawnDelay ?? 20000;
        if (now - entity.deathTimestamp > respawnDelay) {
          if (typeof (entity as any).respawn === "function") {
            (entity as Character | Animal).respawn();
          } else {
            console.warn(
              `Entity ${entity.name} is dead but has no respawn method.`
            );
          }
        }
      }
    }
  }

  removeEntity(entityToRemove: Entity): void {
    console.log(`Removing entity permanently: ${entityToRemove.name}.`);
    const collidableIndex = this.collidableObjects.findIndex(
      (obj) => obj === entityToRemove.mesh
    );
    if (collidableIndex > -1) this.collidableObjects.splice(collidableIndex, 1);
    const interactableIndex = this.interactableObjects.findIndex(
      (obj) => obj === entityToRemove
    );
    if (interactableIndex > -1)
      this.interactableObjects.splice(interactableIndex, 1);
    entityToRemove.destroy?.();
    const entityIndex = this.entities.findIndex((e) => e === entityToRemove);
    if (entityIndex > -1) this.entities.splice(entityIndex, 1);
    if (this.minimap) this.minimap.entities = this.entities;
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

    this.wolfKillCount = 0;
    const wolfQuest = this.questManager.getQuestById("wolf_slayer");
    if (wolfQuest && !wolfQuest.isCompleted) {
      wolfQuest.objectives.forEach((obj) => (obj.currentCount = 0));
    }

    let respawnPos = new Vector3(0, 0, 10);
    if (this.portalManager.startPortal) {
      respawnPos = this.portalManager.startPortal.group.position
        .clone()
        .add(new Vector3(0, 0, 3));
    }

    this.activeCharacter.respawn();
    this.setPauseState(false);
  }

  switchControlTo(targetCharacter: Character): void {
    if (
      targetCharacter === this.activeCharacter ||
      !targetCharacter.mesh ||
      targetCharacter.isDead ||
      !this.characterSwitchingEnabled
    )
      return;

    const oldPlayer = this.activeCharacter!;
    const newPlayer = targetCharacter;

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

    oldPlayer.userData.isPlayer = false;
    oldPlayer.userData.isNPC = true;
    newPlayer.userData.isPlayer = true;
    newPlayer.userData.isNPC = false;

    if (!oldPlayer.aiController) {
      console.warn(
        `Creating AIController for ${oldPlayer.name} on switch-out.`
      );
      oldPlayer.aiController = new AIController(oldPlayer);
      oldPlayer.aiController.persona = oldPlayer.persona;
    }
    if (oldPlayer.aiController instanceof AIController) {
      oldPlayer.aiController.aiState = "idle";
      oldPlayer.aiController.previousAiState = "idle";
    }
    if (newPlayer.aiController) newPlayer.aiController = null;

    oldPlayer.initIntentDisplay();
    oldPlayer.initNameDisplay();
    newPlayer.removeDisplays();

    this.activeCharacter = newPlayer;
    this.controls!.player = newPlayer;
    this.thirdPersonCamera!.target = newPlayer.mesh!;
    this.physics!.player = newPlayer;
    this.interactionSystem!.player = newPlayer;
    this.hud!.player = newPlayer;
    this.minimap!.player = newPlayer;

    this.inventory = newPlayer.inventory;
    this.inventoryDisplay!.setInventory(this.inventory!);
    this.interactionSystem!.inventory = newPlayer.inventory!;
    this.interactionSystem!.eventLog = newPlayer.eventLog;
    this.journalDisplay!.setEventLog(newPlayer.eventLog);

    this.inventoryDisplay!.hide();
    this.journalDisplay!.hide();
    this.interactionSystem!.closeChatInterface();
    this.setPauseState(false);

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
    target?: Entity | string | Object3D,
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
      targetId = target.uuid;
      targetName = target.name || target.userData?.resource || "Object";
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
      location: location?.clone(),
    };

    this.entities.forEach((entity) => {
      if (entity instanceof Character && entity.eventLog) {
        entity.eventLog.addEntry(eventEntry);
      }
    });
  }

  dropItem(itemId: string, count: number, position: Vector3): void {
    if (!this.droppedItemManager) {
      console.error("DroppedItemManager not initialized.");
      return;
    }
    this.droppedItemManager.createDroppedItem(itemId, count, position);
  }

  executeTrade(
    initiatorId: string,
    targetId: string,
    itemsToGive: InventoryItem[],
    itemsToReceive: InventoryItem[]
  ): boolean {
    if (!this.tradingSystem) {
      console.error("Trading system not initialized.");
      return false;
    }

    const initiator = this.entities.find(
      (e) => e instanceof Character && e.id === initiatorId
    ) as Character | undefined;
    const target = this.entities.find(
      (e) => e instanceof Character && e.id === targetId
    ) as Character | undefined;

    if (!initiator || !target) {
      console.warn(
        `Trade execution failed: Could not find initiator (${initiatorId}) or target (${targetId}).`
      );
      return false;
    }

    console.warn(
      "Game.executeTrade called directly. Use TradingSystem methods instead."
    );
    return this.tradingSystem.executeTrade(
      initiator,
      target,
      itemsToGive,
      itemsToReceive
    );
  }

  destroy(): void {
    document.removeEventListener(
      "visibilitychange",
      this.boundHandleVisibilityChange
    );
    this.renderer?.setAnimationLoop(null);
    this.controls?.dispose();
    this.mobileControls?.destroy();
    this.inventoryDisplay?.destroy();
    this.journalDisplay = null;
    this.notificationManager?.dispose();
    this.droppedItemManager?.dispose();
    this.entities.forEach((entity) => entity.destroy?.());
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

    this.scene = null;
    this.renderer = null;
    this.camera = null;
    this.clock = null;
    this.activeCharacter = null;
    this.entities = [];
    this.collidableObjects = [];
    this.interactableObjects = [];
    this.particleEffects = [];
    this.tradingSystem = null;
    this.droppedItemManager = null;
    this.combatSystem = null;
    this.uiManager = null; // Nullify UIManager
    console.log("Game destroyed.");
  }
}

declare global {
  interface Window {
    game: Game;
  }
}

if (WebGL.isWebGL2Available()) {
  async function startGame() {
    const gameInstance = new Game();
    window.game = gameInstance;
    try {
      await gameInstance.init();
    } catch (error) {
      console.error("Failed to initialize game:", error);
      const errorElement = document.createElement("div");
      errorElement.textContent = `Failed to initialize game: ${error}`;
      errorElement.style.color = "red";
      errorElement.style.padding = "20px";
      document.body.appendChild(errorElement);
      document.getElementById("landing-page")?.classList.add("hidden");
    }
  }
  startGame();
} else {
  const warning = WebGL.getWebGLErrorMessage();
  document.getElementById("game-container")?.appendChild(warning);
}
