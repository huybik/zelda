/* File: /src/core/initialization.ts */
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
} from "three";
import { Game } from "../main";
import { Character } from "../entities/character";
import { InteractionSystem } from "../systems/interaction";
import { Physics } from "../systems/physics";
import { ThirdPersonCamera } from "../systems/camera";
import { Controls } from "../controls/controls";
import { MobileControls } from "../controls/mobileControls";
import { HUD } from "../ui/hud";
import { InventoryDisplay } from "../ui/inventory";
import { JournalDisplay } from "../ui/journal";
import { Minimap } from "../ui/minimap";
import { NotificationManager } from "../ui/notificationManager";
import { Inventory, getTerrainHeight } from "./utils";
import { WORLD_SIZE, TERRAIN_SEGMENTS } from "./constants";
import { createTerrain } from "./terrain";
import { setupLighting } from "./lighting";
import { populateEnvironment } from "./environment";
import { createWorldBoundary } from "../models/walls";
import { TradingSystem } from "../systems/tradingSystem";
import { CombatSystem } from "../systems/combatSystem";
import { DroppedItemManager } from "../systems/droppedItemManager";
import { UIManager } from "../ui/uiManager";

export const initializeGame = {
  initRenderer(): WebGLRenderer {
    const renderer = new WebGLRenderer({
      antialias: true,
      powerPreference: "high-performance",
    });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = PCFSoftShadowMap;
    document.getElementById("game-container")?.appendChild(renderer.domElement);
    return renderer;
  },

  initScene(game: Game): Scene {
    const scene = new Scene();
    scene.background = new Color(0x87ceeb);
    scene.fog = new Fog(0x87ceeb, 15, 50);
    setupLighting(scene);
    const terrain = createTerrain(game.worldSize, TERRAIN_SEGMENTS);
    scene.add(terrain);
    game.collidableObjects.push(terrain);
    createWorldBoundary(scene, game.worldSize, game.collidableObjects);
    return scene;
  },

  initCamera(): PerspectiveCamera {
    return new PerspectiveCamera(
      75,
      window.innerWidth / window.innerHeight,
      0.1,
      2000
    );
  },

  initInventory(): Inventory {
    return new Inventory(20);
  },

  initAudio(): HTMLAudioElement {
    const audioElement = new Audio("assets/background.mp3");
    audioElement.loop = true;
    audioElement.volume = 0.3;
    return audioElement;
  },

  initPlayer(game: Game, playerName: string): Character {
    let playerSpawnPos = new Vector3(0, 0, 5);
    if (game.hasEnteredFromPortal) playerSpawnPos = new Vector3(0, 0, 15);
    playerSpawnPos.y = getTerrainHeight(
      game.scene!,
      playerSpawnPos.x,
      playerSpawnPos.z
    );

    const playerModelData = game.models.player;
    if (!playerModelData) throw new Error("Player model not loaded!");

    const player = new Character(
      game.scene!,
      playerSpawnPos,
      playerName,
      playerModelData.scene,
      playerModelData.animations,
      game.inventory!
    );
    player.userData.isPlayer = true;
    player.userData.isInteractable = true;
    player.userData.isNPC = false;
    if (player.aiController) player.aiController = null;

    game.entities.push(player);
    game.collidableObjects.push(player.mesh!);
    game.interactableObjects.push(player);
    return player;
  },

  initControls(game: Game): Controls {
    if (!game.activeCharacter || !game.renderer)
      throw new Error("Cannot init controls: Core components missing.");
    return new Controls(
      game.activeCharacter,
      null, // Camera controller passed later
      game.renderer.domElement,
      game
    );
  },

  initMobileControls(game: Game): MobileControls {
    if (!game.controls)
      throw new Error("Cannot init mobile controls: Base controls missing.");
    return new MobileControls(game, game.controls);
  },

  initCameraAndControls(game: Game): ThirdPersonCamera {
    if (!game.activeCharacter || !game.camera || !game.controls)
      throw new Error("Cannot init camera/controls: Core components missing.");

    const thirdPersonCamera = new ThirdPersonCamera(
      game.camera,
      game.activeCharacter.mesh!,
      game // Pass game instance
    );
    game.controls.cameraController = thirdPersonCamera; // Link camera to controls
    return thirdPersonCamera;
  },

  initPhysics(game: Game): Physics {
    if (!game.activeCharacter)
      throw new Error("Cannot init physics: Player character missing.");
    return new Physics(game.activeCharacter, game.collidableObjects);
  },

  initEnvironment(game: Game): void {
    if (!game.scene || !game.inventory)
      throw new Error("Cannot init environment: Scene or Inventory missing.");
    populateEnvironment(
      game.scene,
      game.worldSize,
      game.collidableObjects,
      game.interactableObjects,
      game.entities,
      game.inventory,
      game.models,
      game
    );
  },

  initSystems(game: Game): void {
    if (
      !game.activeCharacter ||
      !game.camera ||
      !game.controls ||
      !game.inventory ||
      !game.scene
    )
      throw new Error("Cannot init systems: Core components missing.");

    game.droppedItemManager = new DroppedItemManager(game);
    game.combatSystem = new CombatSystem(game);
    game.interactionSystem = new InteractionSystem(
      game.activeCharacter,
      game.camera,
      game.interactableObjects,
      game.controls,
      game.inventory,
      game.activeCharacter.eventLog,
      game,
      game.droppedItemManager
    );
    game.tradingSystem = new TradingSystem(game);
  },

  initUI(game: Game): void {
    if (!game.activeCharacter || !game.inventory || !game.scene || !game.camera)
      throw new Error("Cannot init UI: Core components missing.");
    game.hud = new HUD(game.activeCharacter);
    game.minimap = new Minimap(
      document.getElementById("minimap-canvas") as HTMLCanvasElement,
      game.activeCharacter,
      game.entities,
      game.worldSize
    );
    game.inventoryDisplay = new InventoryDisplay(game.inventory, game);
    game.journalDisplay = new JournalDisplay(
      game.activeCharacter.eventLog,
      game
    );
    game.notificationManager = new NotificationManager(
      game.scene,
      game.camera,
      document.getElementById("ui-container")!
    );
    game.uiManager = new UIManager(game); // Initialize UIManager
    game.uiManager.init(); // Call UIManager's init to get elements
  },

  setupUIControls(game: Game): void {
    if (
      !game.controls ||
      !game.inventoryDisplay ||
      !game.journalDisplay ||
      !game.interactionSystem ||
      !game.uiManager // Check for uiManager
    )
      return;

    game.controls.addKeyDownListener("KeyI", () => {
      if (game.interactionSystem?.isChatOpen || game.uiManager?.isBannerVisible)
        return;
      game.journalDisplay!.hide();
      game.inventoryDisplay!.toggle();
      game.setPauseState(game.inventoryDisplay!.isOpen);
    });
    game.controls.addKeyDownListener("KeyJ", () => {
      if (game.interactionSystem?.isChatOpen || game.uiManager?.isBannerVisible)
        return;
      game.inventoryDisplay!.hide();
      game.journalDisplay!.toggle();
      // Pause state handled by journalDisplay
    });
    game.controls.addKeyDownListener("KeyC", () => {
      if (game.isPaused || !game.characterSwitchingEnabled) return;
      if (
        game.interactionSystem!.currentTarget instanceof Character &&
        game.interactionSystem!.currentTarget !== game.activeCharacter
      ) {
        game.switchControlTo(game.interactionSystem!.currentTarget);
      }
    });

    // Profiler Controls
    game.controls.addKeyDownListener("KeyP", () => {
      if (game.profiler) {
        console.log(game.profiler.getReport());
      }
    });
    game.controls.addKeyDownListener("KeyO", () => {
      if (game.profiler) {
        game.profiler.reset();
      }
    });
    game.controls.addKeyDownListener("BracketLeft", () => {
      // [ key
      if (game.profiler) {
        game.profiler.toggle();
      }
    });
  },
};
