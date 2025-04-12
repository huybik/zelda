// File: /src/main.ts
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
import { Animal } from "./entities/animals"; // Import Animal
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
import { createExitPortal, createStartPortal } from "./models/portals.ts";
import { createWorldBoundary } from "./models/walls.ts";
import {
  spawnParticleEffect,
  updateParticleEffects,
} from "./systems/particles";
import { AIController } from "./ai/npcAI.ts";
import { AnimalAIController } from "./ai/animalAI.ts"; // Import Animal AI
import { updateObservation } from "./ai/api.ts";

// --- Language Data ---
interface Language {
  code: string;
  name: string;
}

const languages: Language[] = [
  { code: "en", name: "English" },
  { code: "es", name: "Español (Spanish)" },
  { code: "fr", name: "Français (French)" },
  { code: "de", name: "Deutsch (German)" },
  { code: "zh", name: "中文 (Chinese)" },
  { code: "ja", name: "日本語 (Japanese)" },
  { code: "ko", name: "한국어 (Korean)" },
  { code: "ru", name: "Русский (Russian)" },
  { code: "pt", name: "Português (Portuguese)" },
  { code: "it", name: "Italiano (Italian)" },
  { code: "ar", name: "العربية (Arabic)" },
  { code: "hi", name: "हिन्दी (Hindi)" },
  { code: "bn", name: "বাংলা (Bengali)" },
  { code: "pa", name: "ਪੰਜਾਬੀ (Punjabi)" },
  { code: "jv", name: "Basa Jawa (Javanese)" },
  { code: "ms", name: "Bahasa Melayu (Malay)" },
  { code: "tr", name: "Türkçe (Turkish)" },
  { code: "vi", name: "Tiếng Việt (Vietnamese)" },
  { code: "te", name: "తెలుగు (Telugu)" },
  { code: "mr", name: "मराठी (Marathi)" },
  { code: "ta", name: "தமிழ் (Tamil)" },
  { code: "ur", name: "اردو (Urdu)" },
  { code: "fa", name: "فارسی (Persian)" },
  { code: "nl", name: "Nederlands (Dutch)" },
  { code: "pl", name: "Polski (Polish)" },
  { code: "uk", name: "Українська (Ukrainian)" },
  { code: "ro", name: "Română (Romanian)" },
  { code: "sv", name: "Svenska (Swedish)" },
  { code: "el", name: "Ελληνικά (Greek)" },
  { code: "hu", name: "Magyar (Hungarian)" },
  { code: "cs", name: "Čeština (Czech)" },
  { code: "fi", name: "Suomi (Finnish)" },
  { code: "he", name: "עברית (Hebrew)" },
  { code: "th", name: "ไทย (Thai)" },
  { code: "id", name: "Bahasa Indonesia (Indonesian)" },
  // Add more languages as needed
].sort((a, b) => a.name.localeCompare(b.name)); // Sort alphabetically by name

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
  intentContainer: HTMLElement | null = null;
  particleEffects: Group[] = [];
  audioElement: HTMLAudioElement | null = null;
  exitPortalGroup: THREE.Group | null = null;
  exitPortalBox: THREE.Box3 | null = null;
  exitPortalParticles: THREE.BufferGeometry | null = null;
  exitPortalInnerMaterial: THREE.MeshBasicMaterial | null = null;
  startPortalGroup: THREE.Group | null = null;
  startPortalBox: THREE.Box3 | null = null;
  startPortalParticles: THREE.BufferGeometry | null = null;
  startPortalInnerMaterial: THREE.MeshBasicMaterial | null = null;
  startPortalRefUrl: string | null = null;
  startPortalOriginalParams: URLSearchParams | null = null;
  hasEnteredFromPortal: boolean = false;
  quests: Quest[] | undefined;
  boundHandleVisibilityChange: () => void;
  wasPausedBeforeVisibilityChange: boolean = false;
  worldSize: number = WORLD_SIZE; // Make world size accessible
  language: string = "en"; // Default language
  isGameStarted: boolean = false; // Flag to control game start after landing page

  // AI Throttling
  private lastAiUpdateTime: number = 0;
  private aiUpdateInterval: number = 0.2; // Update AI 5 times per second

  // Landing page state
  private languageListHideTimeout: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    this.boundHandleVisibilityChange = this.handleVisibilityChange.bind(this);
  }

  async init(): Promise<void> {
    this.clock = new Clock();
    this.initRenderer();
    this.initScene();
    this.initCamera();
    this.initInventory();
    this.initAudio();

    // Load models while landing page might be shown
    const models = await loadModels();

    // Check localStorage for settings
    const savedName = localStorage.getItem("playerName");
    const savedLang = localStorage.getItem("selectedLanguage");
    this.language = savedLang || "en";

    // Setup Landing Page
    this.setupLandingPage(savedName, savedLang);

    // Initialize game elements in background
    const urlParams = new URLSearchParams(window.location.search);
    this.hasEnteredFromPortal = urlParams.get("portal") === "true";
    this.startPortalRefUrl = urlParams.get("ref");
    this.startPortalOriginalParams = urlParams;

    this.initPlayer(models, savedName || "Player"); // Use saved name if available
    this.initControls();
    this.initMobileControls();
    this.initPhysics();
    this.initEnvironment(models); // Populates NPCs, objects, and animals
    this.initSystems();
    this.initQuests();
    this.initUI(); // Initializes minimap among other things
    this.setupUIControls();

    // Create portals AFTER minimap is initialized in initUI
    createExitPortal(this.scene!, this);
    if (this.hasEnteredFromPortal && this.startPortalRefUrl) {
      createStartPortal(this.scene!, this);
      if (this.activeCharacter?.mesh) {
        this.activeCharacter.mesh.lookAt(
          this.startPortalGroup!.position.clone().add(new Vector3(0, 0, 10))
        );
      }
    }

    // Tell minimap about the portals
    if (this.minimap) {
      this.minimap.setPortals(this.exitPortalGroup, this.startPortalGroup);
    }

    this.entities.forEach((entity) => {
      if (entity instanceof Character || entity instanceof Animal) {
        entity.game = this;
        // Only init displays for Characters (NPCs)
        if (entity instanceof Character) {
          entity.initIntentDisplay();
          entity.initNameDisplay();
        }
      }
    });
    document.addEventListener(
      "pointerlockchange",
      this.handlePointerLockChange.bind(this)
    );
    document.addEventListener(
      "visibilitychange",
      this.boundHandleVisibilityChange
    );

    // Start the animation loop, but game logic might be paused initially
    this.renderer!.setAnimationLoop(this.update.bind(this));
  }

  setupLandingPage(savedName: string | null, savedLang: string | null): void {
    const landingPage = document.getElementById("landing-page");
    const nameInput = document.getElementById(
      "player-name"
    ) as HTMLInputElement;
    const langSearchInput = document.getElementById(
      "language-search"
    ) as HTMLInputElement;
    const langListContainer = document.getElementById(
      "language-list-container"
    );
    const langList = document.getElementById(
      "language-list"
    ) as HTMLUListElement;
    const startButton = document.getElementById("start-game-button");
    const gameContainer = document.getElementById("game-container");
    const uiContainer = document.getElementById("ui-container");
    const loadingText = landingPage?.querySelector(".loading-text");

    if (
      !landingPage ||
      !nameInput ||
      !langSearchInput ||
      !langListContainer ||
      !langList ||
      !startButton ||
      !gameContainer ||
      !uiContainer ||
      !loadingText
    ) {
      console.error("Landing page elements not found!");
      this.isGameStarted = true; // Skip landing page if elements are missing
      gameContainer?.classList.remove("hidden");
      uiContainer?.classList.remove("hidden");
      return;
    }

    let selectedLanguageCode = savedLang || "en"; // Initialize with saved or default

    // Function to show/hide language list
    const showLanguageList = () => {
      if (this.languageListHideTimeout) {
        clearTimeout(this.languageListHideTimeout);
        this.languageListHideTimeout = null;
      }
      langListContainer.classList.remove("hidden");
    };

    const hideLanguageList = (immediate = false) => {
      if (this.languageListHideTimeout) {
        clearTimeout(this.languageListHideTimeout);
        this.languageListHideTimeout = null;
      }
      if (immediate) {
        langListContainer.classList.add("hidden");
      } else {
        // Delay hiding to allow clicks on list items
        this.languageListHideTimeout = setTimeout(() => {
          langListContainer.classList.add("hidden");
          this.languageListHideTimeout = null;
        }, 150); // 150ms delay
      }
    };

    // Function to populate the language list
    const populateLanguageList = (filter: string = "") => {
      langList.innerHTML = ""; // Clear existing list
      const filterLower = filter.toLowerCase();
      const filteredLanguages = languages.filter(
        (lang) =>
          lang.name.toLowerCase().includes(filterLower) ||
          lang.code.toLowerCase().includes(filterLower)
      );

      filteredLanguages.forEach((lang) => {
        const li = document.createElement("li");
        li.textContent = lang.name;
        li.dataset.langCode = lang.code;
        if (lang.code === selectedLanguageCode) {
          li.classList.add("selected");
        }
        li.addEventListener("mousedown", (e) => {
          // Use mousedown to register before blur
          e.preventDefault(); // Prevent input from losing focus immediately
          selectedLanguageCode = lang.code;
          langSearchInput.value = lang.name; // Update input field
          localStorage.setItem("selectedLanguageName", lang.name); // Save selection
          populateLanguageList(); // Refresh list to show selection
          hideLanguageList(true); // Hide immediately after selection
          // Manually trigger blur if needed, though hiding might be enough
          // langSearchInput.blur();
        });
        langList.appendChild(li);
      });
    };

    // Initial population and state
    populateLanguageList();
    hideLanguageList(true); // Start hidden

    // Pre-fill name input
    if (savedName) {
      nameInput.value = savedName;
    }

    // Set initial search input value if language was saved
    const initialLang = languages.find((l) => l.code === selectedLanguageCode);
    if (initialLang) {
      langSearchInput.value = initialLang.name;
    }

    // Event listeners for search input
    langSearchInput.addEventListener("input", () => {
      populateLanguageList(langSearchInput.value);
      showLanguageList(); // Ensure list is shown while typing
    });

    langSearchInput.addEventListener("focus", () => {
      showLanguageList();
      // Optional: Select all text on focus for easier searching
      langSearchInput.select();
    });

    langSearchInput.addEventListener("blur", () => {
      hideLanguageList(); // Hide with delay on blur
    });

    // Start button logic
    startButton.onclick = () => {
      const playerName = nameInput.value.trim() || "Player";

      // Save settings
      localStorage.setItem("playerName", playerName);
      localStorage.setItem("selectedLanguage", selectedLanguageCode);
      this.language = selectedLanguageCode;

      // Update player name if already initialized
      if (this.activeCharacter) {
        this.activeCharacter.name = playerName;
        // If name display exists, update it (though it might be hidden initially)
        this.activeCharacter.updateNameDisplay(playerName);
      }

      // Hide landing page, show game
      landingPage.classList.add("hidden");
      gameContainer.classList.remove("hidden");
      uiContainer.classList.remove("hidden");

      // Set flag to start game logic updates
      this.isGameStarted = true;
      this.setPauseState(false); // Ensure game is not paused

      // Show welcome banner
      const banner = document.getElementById("welcome-banner");
      if (banner) {
        const welcomeText = this.mobileControls?.isActive()
          ? `Welcome, ${playerName}! Use joysticks to move, drag screen to look, buttons to act.`
          : `Welcome, ${playerName}! [WASD] Move, Mouse Look, [I] Inv, [J] Journal, [E] Interact, [F] Attack, [C] Switch, [Esc] Unlock/Close`;
        banner.textContent = welcomeText;
        banner.classList.remove("hidden");
        setTimeout(() => banner.classList.add("hidden"), 5000);
      }

      // Try to play audio on user interaction
      this.audioElement
        ?.play()
        .catch((e) => console.warn("Background music play failed:", e));
    };

    // Indicate loading is complete (or near complete)
    loadingText.textContent = "Ready to start!";
  }

  handlePointerLockChange(): void {
    if (
      document.pointerLockElement === this.renderer?.domElement &&
      this.audioElement?.paused &&
      this.isGameStarted // Only play if game has started
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
          this.isGameStarted // Only resume if game started
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

  initQuests(): void {
    this.quests = [
      {
        name: "Who is Blacksmith Brynn",
        description: "Find out who Blacksmith Brynn is.",
        isCompleted: false,
        checkCompletion: (target, response) => {
          return (
            target.name === "Blacksmith Brynn" &&
            response.toLowerCase().includes("brynn")
          );
        },
      },
      {
        name: "Get Farmer Giles to collect rocks",
        description: "Convince Farmer Giles to collect rocks.",
        isCompleted: false,
        checkCompletion: (target, response) => {
          const lowerResponse = response.toLowerCase();
          return (
            target.name === "Farmer Giles" &&
            (lowerResponse.includes("ok") || lowerResponse.includes("agree")) &&
            lowerResponse.includes("rock")
          );
        },
      },
      {
        name: "Convince Hunter Rex to kill Blacksmith Brynn",
        description:
          "Persuade Hunter Rex to take action against Blacksmith Brynn.",
        isCompleted: false,
        checkCompletion: (target, response) => {
          const lowerResponse = response.toLowerCase();
          return (
            target.name === "Hunter Rex" &&
            (lowerResponse.includes("ok") || lowerResponse.includes("agree")) &&
            lowerResponse.includes("kill") &&
            lowerResponse.includes("brynn")
          );
        },
      },
    ];
  }

  checkQuestCompletion(
    interactionTarget: Character,
    chatResponse: string
  ): void {
    this.quests?.forEach((quest) => {
      if (
        !quest.isCompleted &&
        quest.checkCompletion(interactionTarget, chatResponse)
      ) {
        quest.isCompleted = true;
        this.showCongratulationMessage(`Quest Completed: ${quest.name}`);
        this.logEvent(
          interactionTarget,
          "quest_complete",
          `Completed quest: ${quest.name}`,
          undefined,
          { quest: quest.name },
          interactionTarget.mesh!.position
        );
      }
    });
  }

  showCongratulationMessage(message: string): void {
    const banner = document.getElementById("welcome-banner");
    if (banner) {
      banner.textContent = message;
      banner.classList.remove("hidden");
      setTimeout(() => banner.classList.add("hidden"), 5000);
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
      playerName, // Use provided name
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
    // Animals are now added within populateEnvironment
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
      this.entities, // Pass the entities array which now includes animals
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
      if (this.interactionSystem?.isChatOpen) return;
      this.journalDisplay!.hide();
      this.inventoryDisplay!.toggle();
      this.setPauseState(this.inventoryDisplay!.isOpen);
    });
    this.controls!.addKeyDownListener("KeyJ", () => {
      if (this.interactionSystem?.isChatOpen) return;
      this.inventoryDisplay!.hide();
      this.journalDisplay!.toggle();
      this.setPauseState(this.journalDisplay!.isOpen);
    });
    this.controls!.addKeyDownListener("KeyC", () => {
      if (
        this.interactionSystem!.currentTarget instanceof Character &&
        this.interactionSystem!.currentTarget !== this.activeCharacter
      ) {
        this.switchControlTo(this.interactionSystem!.currentTarget);
      }
    });
    this.controls!.addKeyDownListener("Escape", () => {
      if (this.interactionSystem?.isChatOpen) {
        this.interactionSystem.closeChatInterface();
      } else if (this.inventoryDisplay!.isOpen) {
        this.inventoryDisplay!.hide();
        this.setPauseState(false);
      } else if (this.journalDisplay!.isOpen) {
        this.journalDisplay!.hide();
        this.setPauseState(false);
      } else if (this.controls!.isPointerLocked) {
        this.controls!.unlockPointer();
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
    // Don't allow pausing if the game hasn't started from landing page yet
    if (!this.isGameStarted && paused) return;

    if (this.isPaused === paused) return;
    this.isPaused = paused;
    if (!this.mobileControls?.isActive()) {
      if (this.isPaused) {
        if (this.controls?.isPointerLocked) this.controls.unlockPointer();
      } else {
        if (
          !this.inventoryDisplay?.isOpen &&
          !this.journalDisplay?.isOpen &&
          !this.interactionSystem?.isChatOpen &&
          !document.pointerLockElement
        ) {
          this.controls?.lockPointer();
        }
      }
    }
    console.log("Game Paused:", this.isPaused);
  }

  start(): void {
    // Game loop is started in init(), but actual updates depend on isGameStarted flag
    console.log(
      "Game initialized. Waiting for user to start via landing page."
    );
    // Welcome banner is now shown after clicking start on landing page
  }

  update(): void {
    if (
      !this.clock ||
      !this.renderer ||
      !this.scene ||
      !this.camera ||
      !this.activeCharacter
    )
      return;

    const deltaTime = Math.min(this.clock.getDelta(), 0.05); // Use clamped delta time
    const elapsedTime = this.clock.elapsedTime;

    // Update controls regardless of pause state
    this.mobileControls?.update(deltaTime);
    this.controls!.update(deltaTime);

    // Only run game logic if not paused AND game has started
    if (!this.isPaused && this.isGameStarted) {
      // --- AI Update Throttling ---
      const currentTime = this.clock.elapsedTime;
      const timeSinceLastAiUpdate = currentTime - this.lastAiUpdateTime;
      const shouldUpdateAiLogic =
        timeSinceLastAiUpdate >= this.aiUpdateInterval;

      if (shouldUpdateAiLogic) {
        this.lastAiUpdateTime = currentTime;
      }
      // --- End AI Update Throttling ---

      // Update Player (always uses controls input)
      this.activeCharacter.update(deltaTime, {
        moveState: this.controls!.moveState,
        collidables: this.collidableObjects,
      });

      this.physics!.update(deltaTime); // Physics uses player's velocity set by update

      // Update other entities (NPCs and Animals)
      this.entities.forEach((entity) => {
        if (entity === this.activeCharacter) return;
        // Handle Character AI
        if (
          entity instanceof Character &&
          entity.aiController instanceof AIController
        ) {
          if (shouldUpdateAiLogic) {
            // Update observation only when AI thinks
            updateObservation(entity.aiController, this.entities);
            // Compute and store the new move state inside the entity
            entity.moveState = entity.aiController.computeAIMoveState(
              timeSinceLastAiUpdate
            );
          }
          // Update the entity using its current (potentially stale) moveState
          entity.update(deltaTime, {
            moveState: entity.moveState, // Pass the entity's internal state
            collidables: this.collidableObjects,
          });
        }
        // Handle Animal AI
        else if (
          entity instanceof Animal &&
          entity.aiController instanceof AnimalAIController
        ) {
          // Update AI logic (state decisions, target finding) only when throttled interval passes
          if (shouldUpdateAiLogic) {
            // Pass the actual time since the last AI update for timers inside the AI
            entity.aiController.updateLogic(timeSinceLastAiUpdate);
          }
          // Update the animal's movement and animations every frame based on its current state
          entity.update(deltaTime, { collidables: this.collidableObjects });
        }
        // Handle other generic entity updates (if any)
        else if (
          entity.update &&
          !(entity instanceof Character) &&
          !(entity instanceof Animal)
        ) {
          entity.update(deltaTime); // Assuming generic entities don't need complex options
        }
      });

      this.interactionSystem!.update(deltaTime);
      this.thirdPersonCamera!.update(deltaTime, this.collidableObjects);
      if (this.activeCharacter.isDead) this.respawnPlayer();
      this.animatePortals();
      this.checkPortalCollisions();
      updateParticleEffects(this, elapsedTime);
      this.checkDeadEntityRemoval(); // Check for dead entities to remove
    }

    // Update UI elements even if paused (e.g., FPS counter)
    this.hud!.update();
    this.minimap!.update(); // Minimap should reflect current state

    // Render the scene
    this.renderer.render(this.scene, this.camera);
  }

  checkDeadEntityRemoval(): void {
    const now = performance.now();
    const entitiesToRemove: Entity[] = [];

    for (const entity of this.entities) {
      if (
        entity.isDead &&
        entity !== this.activeCharacter && // Don't remove the player
        entity.deathTimestamp !== null
      ) {
        const timeSinceDeath = now - entity.deathTimestamp;
        if (timeSinceDeath > 7000) {
          // 7 seconds timeout
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
        if (collidableIndex > -1) {
          this.collidableObjects.splice(collidableIndex, 1);
        }

        // Remove from interactables
        const interactableIndex = this.interactableObjects.findIndex(
          (obj) => obj === entityToRemove
        );
        if (interactableIndex > -1) {
          this.interactableObjects.splice(interactableIndex, 1);
        }

        // Call destroy method
        entityToRemove.destroy?.(); // Use optional chaining just in case

        // Remove from main entities list
        const entityIndex = this.entities.findIndex(
          (e) => e === entityToRemove
        );
        if (entityIndex > -1) {
          this.entities.splice(entityIndex, 1);
        }
      }
      // Update minimap if it relies on the entities array directly
      if (this.minimap) {
        this.minimap.entities = this.entities; // Ensure minimap has the updated list
      }
    }
  }

  animatePortals(): void {
    if (this.exitPortalParticles) {
      const positions = this.exitPortalParticles.attributes.position
        .array as Float32Array;
      for (let i = 0; i < positions.length; i += 3) {
        positions[i + 1] += 0.05 * Math.sin(Date.now() * 0.001 + i);
      }
      this.exitPortalParticles.attributes.position.needsUpdate = true;
    }
    if (this.startPortalParticles) {
      const positions = this.startPortalParticles.attributes.position
        .array as Float32Array;
      for (let i = 0; i < positions.length; i += 3) {
        positions[i + 1] += 0.05 * Math.sin(Date.now() * 0.001 + i);
      }
      this.startPortalParticles.attributes.position.needsUpdate = true;
    }
  }

  checkPortalCollisions(): void {
    if (!this.activeCharacter || !this.activeCharacter.mesh) return;
    const playerBox = new Box3().setFromObject(this.activeCharacter.mesh);
    const playerCenter = playerBox.getCenter(new Vector3());
    if (this.exitPortalGroup && this.exitPortalBox) {
      const portalCenter = this.exitPortalBox.getCenter(new Vector3());
      const portalDistance = playerCenter.distanceTo(portalCenter);
      const interactionThreshold = 15;
      if (portalDistance < interactionThreshold) {
        const currentSpeed = this.activeCharacter.velocity.length();
        const selfUsername = this.activeCharacter.name;
        const ref = window.location.href;
        const newParams = new URLSearchParams();
        newParams.append("username", selfUsername);
        newParams.append("color", "white");
        newParams.append("speed", currentSpeed.toFixed(2));
        newParams.append("ref", ref);
        newParams.append("speed_x", this.activeCharacter.velocity.x.toFixed(2));
        newParams.append("speed_y", this.activeCharacter.velocity.y.toFixed(2));
        newParams.append("speed_z", this.activeCharacter.velocity.z.toFixed(2));
        const paramString = newParams.toString();
        const nextPage =
          "http://portal.pieter.com" + (paramString ? "?" + paramString : "");
        if (playerBox.intersectsBox(this.exitPortalBox))
          window.location.href = nextPage;
      }
    }
    if (
      this.startPortalGroup &&
      this.startPortalBox &&
      this.startPortalRefUrl &&
      this.startPortalOriginalParams
    ) {
      const portalCenter = this.startPortalBox.getCenter(new Vector3());
      const portalDistance = playerCenter.distanceTo(portalCenter);
      const interactionThreshold = 15;
      if (
        portalDistance < interactionThreshold &&
        playerBox.intersectsBox(this.startPortalBox)
      ) {
        let url = this.startPortalRefUrl;
        if (!url.startsWith("http://") && !url.startsWith("https://"))
          url = "https://" + url;
        const newParams = new URLSearchParams();
        for (const [key, value] of this.startPortalOriginalParams) {
          if (key !== "ref" && key !== "portal") newParams.append(key, value);
        }
        const paramString = newParams.toString();
        window.location.href = url + (paramString ? "?" + paramString : "");
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
    this.interactionSystem!.cancelGatherAction();
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
    // Ensure the AI controller is the correct type and reset state
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
    if (newPlayer.aiController) newPlayer.aiController = null; // Remove AI from new player
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
    // Log to all Characters' event logs
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
    await gameInstance.init(); // Init now includes setting up landing page listeners
    // gameInstance.start(); // Start is now effectively handled by the landing page button
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
