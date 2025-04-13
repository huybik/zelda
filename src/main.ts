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
import { Inventory, getTerrainHeight, Quest } from "./core/utils.ts";
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
  inventory: Inventory | null = null;
  interactionSystem: InteractionSystem | null = null;
  hud: HUD | null = null;
  minimap: Minimap | null = null;
  inventoryDisplay: InventoryDisplay | null = null;
  journalDisplay: JournalDisplay | null = null;
  entities: Array<any> = [];
  collidableObjects: Object3D[] = [];
  interactableObjects: Array<any> = [];
  isPaused: boolean = false;
  isQuestBannerVisible: boolean = false; // Track quest banner state
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
  private aiUpdateInterval: number = 0.2;

  private languageListHideTimeout: ReturnType<typeof setTimeout> | null = null;

  private questBannerElement: HTMLElement | null = null;
  private questBannerTitle: HTMLElement | null = null;
  private questBannerDesc: HTMLElement | null = null;
  private questBannerButton: HTMLButtonElement | null = null;
  private boundQuestBannerClickHandler: (() => void) | null = null;

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

    const models = await loadModels();

    const savedName = localStorage.getItem("playerName");
    const savedLang = localStorage.getItem("selectedLanguage");
    this.language = savedLang || "en";

    // Pre-initialize game elements but keep paused
    const urlParams = new URLSearchParams(window.location.search);
    this.hasEnteredFromPortal = urlParams.get("portal") === "true";
    this.startPortalRefUrl = urlParams.get("ref");
    this.startPortalOriginalParams = urlParams;

    this.initPlayer(models, savedName || "Player");
    this.initControls();
    this.initMobileControls();
    this.initPhysics();
    this.initEnvironment(models);
    this.initSystems();
    this.questManager.initQuests();
    this.initUI();
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
    if (!this.mobileControls?.isActive()) {
      return;
    }
    if (document.visibilityState === "hidden") {
      this.wasPausedBeforeVisibilityChange = this.isPaused;
      this.setPauseState(true);
      console.log("Game paused (mobile) due to visibility change.");
      if (this.audioElement && !this.audioElement.paused) {
        this.audioElement.pause();
      }
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
    this.inventory = new Inventory(9);
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
    const playerModel = models.player;
    this.activeCharacter = new Character(
      this.scene!,
      playerSpawnPos,
      playerName,
      playerModel.scene,
      playerModel.animations,
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

  initControls(): void {
    this.thirdPersonCamera = new ThirdPersonCamera(
      this.camera!,
      this.activeCharacter!.mesh!
    );
    this.controls = new Controls(
      this.activeCharacter,
      this.thirdPersonCamera,
      this.renderer!.domElement,
      this
    );
  }

  initMobileControls(): void {
    this.mobileControls = new MobileControls(this, this.controls!);
  }

  initPhysics(): void {
    this.physics = new Physics(this.activeCharacter!, this.collidableObjects);
  }

  initEnvironment(
    models: Record<string, { scene: Group; animations: AnimationClip[] }>
  ): void {
    populateEnvironment(
      this.scene!,
      WORLD_SIZE,
      this.collidableObjects,
      this.interactableObjects,
      this.entities,
      this.inventory!,
      models,
      this
    );
  }

  initSystems(): void {
    this.interactionSystem = new InteractionSystem(
      this.activeCharacter!,
      this.camera!,
      this.interactableObjects,
      this.controls!,
      this.inventory!,
      this.activeCharacter!.eventLog,
      this
    );
  }

  initUI(): void {
    this.hud = new HUD(this.activeCharacter!);
    this.minimap = new Minimap(
      document.getElementById("minimap-canvas") as HTMLCanvasElement,
      this.activeCharacter!,
      this.entities,
      WORLD_SIZE
    );
    this.inventoryDisplay = new InventoryDisplay(this.inventory!);
    this.journalDisplay = new JournalDisplay(
      this.activeCharacter!.eventLog,
      this
    );
  }

  setupUIControls(): void {
    this.controls!.addKeyDownListener("KeyI", () => {
      if (this.interactionSystem?.isChatOpen || this.isQuestBannerVisible)
        return;
      this.journalDisplay!.hide();
      this.inventoryDisplay!.toggle();
      this.setPauseState(this.inventoryDisplay!.isOpen);
    });
    this.controls!.addKeyDownListener("KeyJ", () => {
      if (this.interactionSystem?.isChatOpen || this.isQuestBannerVisible)
        return;
      this.inventoryDisplay!.hide();
      this.journalDisplay!.toggle();
      // Pause state is handled by journalDisplay show/hide
    });
    this.controls!.addKeyDownListener("KeyC", () => {
      if (this.isPaused) return; // Prevent switching when paused
      if (
        this.interactionSystem!.currentTarget instanceof Character &&
        this.interactionSystem!.currentTarget !== this.activeCharacter
      ) {
        this.switchControlTo(this.interactionSystem!.currentTarget);
      }
    });

    this.controls!.addMouseClickListener(0, (event: MouseEvent) => {
      if (this.inventoryDisplay!.isOpen) this.handleInventoryClick(event);
    });
  }

  handleInventoryClick(event: MouseEvent): void {
    const slotElement = (event.target as HTMLElement)?.closest(
      ".inventory-slot"
    ) as HTMLElement | null;
    if (!slotElement) return;
    const index = parseInt(slotElement.dataset.index ?? "-1", 10);
    if (index === -1) return;
    const item = this.inventory!.getItem(index);
    if (!item) return;
    this.logEvent(
      this.activeCharacter!,
      "examine",
      `Examined ${item.name}.`,
      undefined,
      { item: item.name },
      this.activeCharacter!.mesh!.position
    );
    event.stopPropagation();
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
    if (!paused) {
      if (this.isUIPaused()) {
        console.log("Attempted to unpause, but UI requires pause.");
        return; // Do not unpause if a UI element requires it
      }
    }

    this.isPaused = paused;

    if (!this.mobileControls?.isActive()) {
      if (this.isPaused) {
        if (this.controls?.isPointerLocked) this.controls.unlockPointer();
      } else {
        // Only lock pointer if no UI is open
        if (!this.isUIPaused() && !document.pointerLockElement) {
          this.controls?.lockPointer();
        }
      }
    }
    console.log("Game Paused:", this.isPaused);
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
  }

  update(): void {
    if (
      !this.clock ||
      !this.renderer ||
      !this.scene ||
      !this.camera ||
      !this.activeCharacter ||
      !this.isGameStarted // Don't update if game hasn't started from landing page
    )
      return;

    const deltaTime = Math.min(this.clock.getDelta(), 0.05);
    const elapsedTime = this.clock.elapsedTime;

    this.mobileControls?.update(deltaTime);
    this.controls!.update(deltaTime);

    if (!this.isPaused) {
      const currentTime = this.clock.elapsedTime;
      const timeSinceLastAiUpdate = currentTime - this.lastAiUpdateTime;
      const shouldUpdateAiLogic =
        timeSinceLastAiUpdate >= this.aiUpdateInterval;

      if (shouldUpdateAiLogic) {
        this.lastAiUpdateTime = currentTime;
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
          entity.update &&
          !(entity instanceof Character) &&
          !(entity instanceof Animal)
        ) {
          entity.update(deltaTime);
        }
      });

      this.interactionSystem!.update(deltaTime);
      this.thirdPersonCamera!.update(deltaTime, this.collidableObjects);
      if (this.activeCharacter.isDead) this.respawnPlayer();
      this.portalManager.animatePortals();
      this.portalManager.checkPortalCollisions();
      updateParticleEffects(this, elapsedTime);
      this.checkDeadEntityRemoval();
    }

    this.hud!.update();
    this.minimap!.update();

    this.renderer.render(this.scene, this.camera);
  }

  checkDeadEntityRemoval(): void {
    const now = performance.now();
    const entitiesToRemove: Entity[] = [];

    for (const entity of this.entities) {
      if (
        entity.isDead &&
        entity !== this.activeCharacter &&
        entity.deathTimestamp !== null
      ) {
        const timeSinceDeath = now - entity.deathTimestamp;
        if (timeSinceDeath > 7000) {
          entitiesToRemove.push(entity);
        }
      }
    }

    if (entitiesToRemove.length > 0) {
      for (const entityToRemove of entitiesToRemove) {
        console.log(
          `Removing dead entity: ${entityToRemove.name} after timeout.`
        );

        const collidableIndex = this.collidableObjects.findIndex(
          (obj) => obj === entityToRemove.mesh
        );
        if (collidableIndex > -1) {
          this.collidableObjects.splice(collidableIndex, 1);
        }

        const interactableIndex = this.interactableObjects.findIndex(
          (obj) => obj === entityToRemove
        );
        if (interactableIndex > -1) {
          this.interactableObjects.splice(interactableIndex, 1);
        }

        entityToRemove.destroy?.();

        const entityIndex = this.entities.findIndex(
          (e) => e === entityToRemove
        );
        if (entityIndex > -1) {
          this.entities.splice(entityIndex, 1);
        }
      }
      if (this.minimap) {
        this.minimap.entities = this.entities;
      }
    }
  }

  spawnParticleEffect(position: Vector3, colorName: "red" | "green"): void {
    spawnParticleEffect(this, position, colorName);
  }

  respawnPlayer(): void {
    const respawnMessage = `${this.activeCharacter!.name} blacked out and woke up back near the village...`;
    this.logEvent(
      this.activeCharacter!,
      "respawn_start",
      respawnMessage,
      undefined,
      {},
      this.activeCharacter!.mesh!.position
    );

    const pressurize = new Vector3(0, 0, 10);
    pressurize.y = getTerrainHeight(this.scene!, pressurize.x, pressurize.z);
    this.activeCharacter!.respawn(pressurize);
    this.setPauseState(false);
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
      switchMessage,
      oldPlayer.name,
      {},
      newPlayer.mesh!.position
    );
    oldPlayer.userData.isPlayer = false;
    oldPlayer.userData.isNPC = true;
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

    newPlayer.userData.isPlayer = true;
    newPlayer.userData.isNPC = false;
    oldPlayer.initIntentDisplay();
    oldPlayer.initNameDisplay();
    newPlayer.removeDisplays();
    this.activeCharacter = newPlayer;
    if (newPlayer.aiController) newPlayer.aiController = null;
    this.controls!.player = newPlayer;
    this.thirdPersonCamera!.target = newPlayer.mesh!;
    this.physics!.player = newPlayer;
    this.interactionSystem!.player = newPlayer;
    this.interactionSystem!.eventLog = newPlayer.eventLog;
    this.inventory = newPlayer.inventory;
    this.inventoryDisplay!.setInventory(this.inventory!);
    this.interactionSystem!.inventory = newPlayer.inventory!;
    this.hud!.player = newPlayer;
    this.minimap!.player = newPlayer;
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
    target?: Entity | string,
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
    const targetId = typeof target === "string" ? target : target?.id;
    const targetName = typeof target === "string" ? target : target?.name;
    const eventEntry = {
      timestamp,
      message,
      actorId,
      actorName,
      action,
      targetId,
      targetName,
      details,
      location,
    };
    this.entities.forEach((entity) => {
      if (entity instanceof Character && entity.eventLog)
        entity.eventLog.addEntry(eventEntry);
    });
  }

  destroy(): void {
    document.removeEventListener(
      "visibilitychange",
      this.boundHandleVisibilityChange
    );
    this.renderer?.setAnimationLoop(null);
    this.controls?.dispose();
    this.mobileControls?.destroy();
    this.entities.forEach((entity) => entity.destroy?.());
    this.scene?.traverse((object) => {
      if (object instanceof THREE.Mesh) {
        object.geometry?.dispose();
        if (Array.isArray(object.material)) {
          object.material.forEach((material) => material.dispose());
        } else if (object.material) {
          object.material.dispose();
        }
      }
    });
    this.renderer?.dispose();
    document
      .getElementById("game-container")
      ?.removeChild(this.renderer!.domElement);

    this.scene = null;
    this.renderer = null;
    this.camera = null;
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
    await gameInstance.init();
    // gameInstance.start(); // Start logic is now within init/landing page
    const onResize = () => gameInstance.onWindowResize();
    window.addEventListener("resize", onResize, false);
    window.addEventListener("beforeunload", () => {
      window.removeEventListener("resize", onResize);
      gameInstance.destroy();
    });
  }
  startGame();
} else {
  const warning = WebGL.getWebGLErrorMessage();
  document.getElementById("game-container")?.appendChild(warning);
}
