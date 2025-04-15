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
import { NotificationManager } from "./ui/notificationManager"; // Import NotificationManager
import {
  Inventory,
  getTerrainHeight,
  Quest,
  InventoryItem, // Added InventoryItem
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
import { TradingSystem } from "./systems/tradingSystem.ts"; // Import TradingSystem
import {
  getItemDefinition,
  WeaponDefinition,
  isWeapon,
  Profession, // Import Profession
  ProfessionStartingWeapon, // Import starting weapon map
} from "./core/items";
import { DroppedItemManager } from "./systems/droppedItemManager.ts"; // Import DroppedItemManager

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
  tradingSystem: TradingSystem | null = null; // Add TradingSystem
  droppedItemManager: DroppedItemManager | null = null; // Add DroppedItemManager
  hud: HUD | null = null;
  minimap: Minimap | null = null;
  inventoryDisplay: InventoryDisplay | null = null;
  journalDisplay: JournalDisplay | null = null;
  notificationManager: NotificationManager | null = null; // Add NotificationManager
  entities: Array<any> = []; // Includes Characters, Animals, Resources (Object3D)
  collidableObjects: Object3D[] = [];
  interactableObjects: Array<any> = []; // Includes Characters, Animals, Resources (Object3D), Dropped Items
  isPaused: boolean = false;
  isQuestBannerVisible: boolean = false; // Tracks if the banner UI is visible (for quests or trades)
  currentBannerType: "quest" | "trade" | "none" = "none"; // Tracks what the banner is showing
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
  playerProfession: Profession = Profession.None; // Store player's chosen profession
  isGameStarted: boolean = false;
  private landingPage: LandingPage | null = null;
  public portalManager: PortalManager;

  private lastAiUpdateTime: number = 0;
  private aiUpdateInterval: number = 0.2; // Update AI logic 5 times per second

  // Banner UI Elements
  private questBannerElement: HTMLElement | null = null;
  private questBannerTitle: HTMLElement | null = null;
  private questBannerDesc: HTMLElement | null = null;
  private questBannerButtonContainer: HTMLElement | null = null; // Container for buttons
  private questBannerOkButton: HTMLButtonElement | null = null;
  private questBannerAcceptButton: HTMLButtonElement | null = null;
  private questBannerDeclineButton: HTMLButtonElement | null = null;

  // Store current banner handlers to remove them later
  private boundBannerOkClickHandler: (() => void) | null = null;
  private boundBannerAcceptClickHandler: (() => void) | null = null;
  private boundBannerDeclineClickHandler: (() => void) | null = null;

  // Store current trade details if a trade banner is shown
  private currentTradeInitiator: Character | null = null;
  private currentTradeTarget: Character | null = null;
  private currentTradeGiveItems: InventoryItem[] = [];
  private currentTradeReceiveItems: InventoryItem[] = [];

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
      player: "assets/player.glb",
      tavernMan: "assets/tavernman.glb",
      oldMan: "assets/oldman.glb",
      woman: "assets/woman.glb",
    };

    this.models = await loadModels(modelPaths);

    const savedName = localStorage.getItem("playerName");
    const savedLang = localStorage.getItem("selectedLanguage");
    const savedProfession = localStorage.getItem(
      "selectedProfession"
    ) as Profession | null;
    this.language = savedLang || "en";
    this.playerProfession = savedProfession || Profession.Hunter; // Default if not saved

    const urlParams = new URLSearchParams(window.location.search);
    this.hasEnteredFromPortal = urlParams.get("portal") === "true";
    this.startPortalRefUrl = urlParams.get("ref");
    this.startPortalOriginalParams = urlParams;

    // Player initialized here, inventory is passed
    this.initPlayer(this.models, savedName || "Player");
    // Set player profession AFTER initialization
    if (this.activeCharacter)
      this.activeCharacter.profession = this.playerProfession;

    this.initControls();
    this.initMobileControls();
    this.initPhysics();
    this.initEnvironment(this.models); // NPCs created here, including profession weapons
    this.initSystems(); // TradingSystem, DroppedItemManager initialized here
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

    // Find Quest Banner elements
    this.questBannerElement = document.getElementById("quest-detail-banner");
    this.questBannerTitle = document.getElementById("quest-banner-title");
    this.questBannerDesc = document.getElementById("quest-banner-description");
    this.questBannerButtonContainer = document.getElementById(
      "quest-banner-buttons"
    );
    this.questBannerOkButton = document.getElementById(
      "quest-banner-ok"
    ) as HTMLButtonElement;
    this.questBannerAcceptButton = document.getElementById(
      "quest-banner-accept"
    ) as HTMLButtonElement;
    this.questBannerDeclineButton = document.getElementById(
      "quest-banner-decline"
    ) as HTMLButtonElement;

    // Setup Landing Page LAST, it will handle initial pause state
    this.landingPage = new LandingPage(this);
    this.landingPage.setup(savedName, savedLang, savedProfession); // Pass saved profession

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

  /** Gives the starting weapon to the player based on their chosen profession. */
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
        // Optionally equip it immediately
        const weaponDef = getItemDefinition(startingWeaponId);
        if (weaponDef && isWeapon(weaponDef)) {
          // Use requestAnimationFrame to delay slightly, ensuring bones are ready.
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
      !this.inventory ||
      !this.scene
    )
      throw new Error("Cannot init systems: Core components missing.");

    this.droppedItemManager = new DroppedItemManager(this); // Initialize DroppedItemManager first
    this.interactionSystem = new InteractionSystem(
      this.activeCharacter,
      this.camera,
      this.interactableObjects, // Pass interactables (will include dropped items later)
      this.controls,
      this.inventory, // Pass player inventory
      this.activeCharacter.eventLog,
      this,
      this.droppedItemManager // Pass DroppedItemManager to InteractionSystem
    );
    this.tradingSystem = new TradingSystem(this); // Initialize TradingSystem
  }

  initUI(): void {
    if (!this.activeCharacter || !this.inventory || !this.scene || !this.camera)
      throw new Error("Cannot init UI: Core components missing.");
    this.hud = new HUD(this.activeCharacter);
    this.minimap = new Minimap(
      document.getElementById("minimap-canvas") as HTMLCanvasElement,
      this.activeCharacter,
      this.entities, // Pass entities (minimap might draw resources/animals)
      WORLD_SIZE
    );
    // Pass the game instance to InventoryDisplay
    this.inventoryDisplay = new InventoryDisplay(this.inventory, this);
    this.journalDisplay = new JournalDisplay(
      this.activeCharacter.eventLog,
      this
    );
    // Initialize NotificationManager
    this.notificationManager = new NotificationManager(
      this.scene,
      this.camera,
      document.getElementById("ui-container")!
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
    console.log("Game Paused:", this.isPaused); // dont remove this
  }

  // Checks if any UI element that requires pausing is open
  isUIPaused(): boolean {
    return (
      this.inventoryDisplay?.isOpen ||
      this.journalDisplay?.isOpen ||
      this.interactionSystem?.isChatOpen ||
      this.isQuestBannerVisible // Check the generic banner visibility flag
    );
  }

  /**
   * Shows the quest/trade banner UI.
   * @param title The title for the banner.
   * @param description The description text or HTML.
   * @param type The type of banner ('quest' or 'trade').
   * @param onOk Optional handler for the OK button (for quests).
   * @param onAccept Optional handler for the Accept button (for trades).
   * @param onDecline Optional handler for the Decline button (for trades).
   */
  private showBanner(
    title: string,
    description: string, // Can be HTML
    type: "quest" | "trade",
    onOk?: () => void,
    onAccept?: () => void,
    onDecline?: () => void
  ): void {
    if (
      !this.questBannerElement ||
      !this.questBannerTitle ||
      !this.questBannerDesc ||
      !this.questBannerButtonContainer ||
      !this.questBannerOkButton ||
      !this.questBannerAcceptButton ||
      !this.questBannerDeclineButton
    )
      return;

    // --- Clean up previous listeners ---
    this.removeBannerListeners();

    // --- Configure Banner Content ---
    this.questBannerTitle.textContent = title;
    // Use innerHTML to render potential HTML in description (for trade items)
    this.questBannerDesc.innerHTML = description;
    this.currentBannerType = type;

    // --- Configure Buttons ---
    if (type === "trade") {
      this.questBannerOkButton.classList.add("hidden");
      this.questBannerAcceptButton.classList.remove("hidden");
      this.questBannerDeclineButton.classList.remove("hidden");

      if (onAccept) {
        this.boundBannerAcceptClickHandler = () => {
          onAccept();
          this.hideQuestBanner(); // Hide after action
        };
        this.questBannerAcceptButton.addEventListener(
          "click",
          this.boundBannerAcceptClickHandler
        );
      }
      if (onDecline) {
        this.boundBannerDeclineClickHandler = () => {
          onDecline();
          this.hideQuestBanner(); // Hide after action
        };
        this.questBannerDeclineButton.addEventListener(
          "click",
          this.boundBannerDeclineClickHandler
        );
      }
    } else {
      // Quest or other notification type
      this.questBannerOkButton.classList.remove("hidden");
      this.questBannerAcceptButton.classList.add("hidden");
      this.questBannerDeclineButton.classList.add("hidden");

      if (onOk) {
        this.boundBannerOkClickHandler = () => {
          onOk();
          this.hideQuestBanner(); // Hide after action
        };
        this.questBannerOkButton.addEventListener(
          "click",
          this.boundBannerOkClickHandler
        );
      }
    }

    // --- Show Banner and Pause ---
    this.questBannerElement.classList.remove("hidden");
    this.isQuestBannerVisible = true;
    this.setPauseState(true); // Pause the game
  }

  /** Removes all active banner button listeners. */
  private removeBannerListeners(): void {
    if (this.boundBannerOkClickHandler && this.questBannerOkButton) {
      this.questBannerOkButton.removeEventListener(
        "click",
        this.boundBannerOkClickHandler
      );
    }
    if (this.boundBannerAcceptClickHandler && this.questBannerAcceptButton) {
      this.questBannerAcceptButton.removeEventListener(
        "click",
        this.boundBannerAcceptClickHandler
      );
    }
    if (this.boundBannerDeclineClickHandler && this.questBannerDeclineButton) {
      this.questBannerDeclineButton.removeEventListener(
        "click",
        this.boundBannerDeclineClickHandler
      );
    }
    this.boundBannerOkClickHandler = null;
    this.boundBannerAcceptClickHandler = null;
    this.boundBannerDeclineClickHandler = null;
  }

  /** Hides the quest/trade banner and unpauses the game. */
  hideQuestBanner(): void {
    if (!this.questBannerElement || !this.isQuestBannerVisible) return;

    this.removeBannerListeners(); // Clean up listeners
    this.questBannerElement.classList.add("hidden");
    this.isQuestBannerVisible = false;
    this.currentBannerType = "none";
    this.currentTradeInitiator = null; // Clear trade context
    this.currentTradeTarget = null;
    this.currentTradeGiveItems = [];
    this.currentTradeReceiveItems = [];
    this.setPauseState(false); // Unpause the game (if no other UI requires pause)
  }

  /**
   * Shows a quest notification banner.
   * @param quest The quest to display.
   * @param isCompletion Whether this is a completion notification.
   */
  showQuestNotification(quest: Quest, isCompletion: boolean = false): void {
    const title = isCompletion ? `Quest Completed: ${quest.name}` : quest.name;
    this.showBanner(title, quest.description, "quest", () => {
      // Optional: Add logic for when OK is clicked on a quest banner
      console.log(`Quest banner acknowledged: ${quest.name}`);
    });
  }

  /**
   * Shows a trade offer notification banner.
   * @param initiator The NPC initiating the trade.
   * @param target The Player receiving the offer.
   * @param itemsToGive Items the NPC wants to give (Player receives).
   * @param itemsToReceive Items the NPC wants to receive (Player gives).
   */
  showTradeNotification(
    initiator: Character,
    target: Character,
    itemsToGive: InventoryItem[],
    itemsToReceive: InventoryItem[]
  ): void {
    if (!this.tradingSystem) return;

    // Store trade details for handlers
    this.currentTradeInitiator = initiator;
    this.currentTradeTarget = target;
    this.currentTradeGiveItems = [...itemsToGive];
    this.currentTradeReceiveItems = [...itemsToReceive];

    const title = `Trade Offer from ${initiator.name}`;

    // Helper to format items with names
    const formatItems = (items: InventoryItem[]) =>
      items
        .map((i) => {
          const def = getItemDefinition(i.id);
          return `${i.count}x ${def ? def.name : i.id}`; // Use name if available
        })
        .join(", ") || "Nothing";

    // Create HTML description with colored spans
    const giveDesc = formatItems(itemsToGive); // Items NPC gives (Player receives)
    const receiveDesc = formatItems(itemsToReceive); // Items NPC receives (Player gives)

    const descriptionHTML = `
            You Receive: <span class="trade-item-receive">${giveDesc}</span>
            <br>
            You Give: <span class="trade-item-give">${receiveDesc}</span>
        `;

    this.showBanner(
      title,
      descriptionHTML, // Pass HTML string
      "trade",
      undefined, // No OK handler for trades
      () => this.handleTradeAccept(), // Accept handler
      () => this.handleTradeDecline() // Decline handler
    );
  }

  /** Handles the logic when the player clicks "Accept" on a trade offer. */
  handleTradeAccept(): void {
    if (
      !this.tradingSystem ||
      !this.currentTradeInitiator ||
      !this.currentTradeTarget
    )
      return;

    const success = this.tradingSystem.executeTrade(
      this.currentTradeInitiator,
      this.currentTradeTarget,
      this.currentTradeGiveItems,
      this.currentTradeReceiveItems
    );

    if (success) {
      // Optionally show a success message (though item sprites might be enough)
      console.log("Trade accepted and executed successfully.");
    } else {
      // Failure message is handled within executeTrade/notificationManager
      console.log("Trade accepted but failed during execution.");
    }
    // hideQuestBanner is called automatically by showBanner's button handlers
  }

  /** Handles the logic when the player clicks "Decline" on a trade offer. */
  handleTradeDecline(): void {
    if (
      !this.tradingSystem ||
      !this.currentTradeInitiator ||
      !this.currentTradeTarget
    )
      return;

    this.tradingSystem.declineTrade(
      this.currentTradeInitiator,
      this.currentTradeTarget
    );
    // hideQuestBanner is called automatically by showBanner's button handlers
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
      this.droppedItemManager?.update(deltaTime); // Update dropped items
      this.checkRespawn(); // Check for respawning entities

      // Check player death
      if (this.activeCharacter.isDead) this.respawnPlayer();
    } // End if (!this.isPaused)

    // --- UI Update (always update) ---
    this.hud!.update();
    this.minimap!.update();
    this.notificationManager?.update(deltaTime); // Update notifications regardless of pause state
    // Inventory and Journal displays update themselves internally when shown/data changes

    // --- Render ---
    this.renderer.render(this.scene, this.camera);
  }

  checkRespawn(): void {
    const now = performance.now();
    for (const entity of this.entities) {
      if (
        entity.isDead &&
        entity.deathTimestamp !== null &&
        entity !== this.activeCharacter // Don't respawn player here
      ) {
        const respawnDelay =
          (entity as Character | Animal).respawnDelay ?? 20000; // Use entity specific or default
        if (now - entity.deathTimestamp > respawnDelay) {
          if (typeof (entity as any).respawn === "function") {
            (entity as Character | Animal).respawn(); // Call the specific respawn method
          } else {
            console.warn(
              `Entity ${entity.name} is dead but has no respawn method.`
            );
            // Optionally remove the entity permanently here if it shouldn't respawn
            // this.removeEntity(entity);
          }
        }
      }
    }
  }

  // Helper to remove entity completely (if needed, e.g., non-respawnable)
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

    // Define a safe respawn point (e.g., near village center or start portal)
    let respawnPos = new Vector3(0, 0, 10); // Example near village
    if (this.portalManager.startPortal) {
      respawnPos = this.portalManager.startPortal.group.position
        .clone()
        .add(new Vector3(0, 0, 3)); // Near start portal
    }

    this.activeCharacter.respawn();
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

  /**
   * Creates a dropped item orb in the world.
   * @param itemId The ID of the item to drop.
   * @param count The number of items in the stack.
   * @param position The world position to drop the item at.
   */
  dropItem(itemId: string, count: number, position: Vector3): void {
    if (!this.droppedItemManager) {
      console.error("DroppedItemManager not initialized.");
      return;
    }
    this.droppedItemManager.createDroppedItem(itemId, count, position);
  }

  /**
   * Executes a trade between two characters based on IDs and item lists.
   * This is intended to be called by the AIController after receiving an API response.
   * @param initiatorId The ID of the character initiating the trade.
   * @param targetId The ID of the character receiving the trade proposal.
   * @param itemsToGive An array of items the initiator wants to give.
   * @param itemsToReceive An array of items the initiator wants to receive.
   * @returns True if the trade was successful, false otherwise.
   */
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

    // This method is now deprecated for direct AI calls.
    // AI should call requestTradeUI, and player actions call executeTrade/declineTrade.
    // For now, let's assume this might be called internally or for testing.
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
    this.inventoryDisplay?.destroy(); // Clean up inventory display listeners
    this.journalDisplay = null; // Assuming journal doesn't need complex cleanup
    this.notificationManager?.dispose(); // Dispose notification manager
    this.droppedItemManager?.dispose(); // Dispose dropped item manager
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
    this.tradingSystem = null; // Nullify trading system
    this.droppedItemManager = null;
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
