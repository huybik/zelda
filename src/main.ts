import nipplejs, {
  JoystickManager,
  Joystick,
  JoystickManagerOptions,
  EventData,
  JoystickOutputData,
} from "nipplejs";

import { Raycaster } from "three";
import { not } from "three/src/nodes/TSL.js";

import {
  Points,
  CylinderGeometry,
  ConeGeometry,
  Quaternion,
  Material,
  Matrix4,
  AnimationMixer,
  AnimationAction,
  LoopOnce,
  Sprite, // Added Sprite
  SpriteMaterial,
  Scene,
  PerspectiveCamera,
  WebGLRenderer,
  Clock,
  Vector3,
  Color,
  Fog,
  Mesh,
  PlaneGeometry,
  MeshLambertMaterial,
  AmbientLight,
  DirectionalLight,
  HemisphereLight,
  BoxGeometry,
  MeshBasicMaterial,
  DoubleSide,
  PCFSoftShadowMap,
  MathUtils,
  Object3D,
  Group,
  AnimationClip,
  Vector2,
  SphereGeometry, // Added for particles
  TorusGeometry,
  CircleGeometry,
  MeshPhongMaterial,
  PointsMaterial,
  BufferGeometry,
  BufferAttribute,
  CanvasTexture,
  TextureLoader,
  Box3,
} from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { SimplexNoise } from "three/examples/jsm/math/SimplexNoise.js";
import WebGL from "three/examples/jsm/capabilities/WebGL.js";

export const Colors = {
  PASTEL_GREEN: 0x98fb98,
  PASTEL_BROWN: 0xcd853f,
  PASTEL_GRAY: 0xb0c4de,
  FOREST_GREEN: 0x228b22,
} as const;

const WORLD_SIZE = 100;
const TERRAIN_SEGMENTS = 15;

async function loadModels(): Promise<
  Record<string, { scene: Group; animations: AnimationClip[] }>
> {
  const loader = new GLTFLoader();
  const modelPaths = {
    player: "assets/player/scene.gltf",
    tavernMan: "assets/player/scene.gltf",
    oldMan: "assets/player/scene.gltf",
    woman: "assets/player/scene.gltf",
  };
  const models: Record<string, { scene: Group; animations: AnimationClip[] }> =
    {};
  for (const [key, path] of Object.entries(modelPaths)) {
    const gltf = await loader.loadAsync(path);
    models[key] = { scene: gltf.scene, animations: gltf.animations };
  }
  return models;
}

function createTerrain(size: number, segments: number = 150): Mesh {
  const simplexTerrain = new SimplexNoise();
  const geometry = new PlaneGeometry(size, size, segments, segments);
  const vertices = geometry.attributes.position.array as Float32Array;
  const numVertices = geometry.attributes.position.count;
  const noiseStrength = 16;
  const noiseScale = 0.005;
  const flattenRadius = 240;
  const flattenStrength = 0.1;
  for (let i = 0; i < numVertices; i++) {
    const index = i * 3;
    const x = vertices[index];
    const y = vertices[index + 1];
    let z =
      simplexTerrain.noise(x * noiseScale, y * noiseScale) * noiseStrength;
    const distanceToCenter = Math.sqrt(x * x + y * y);
    if (distanceToCenter < flattenRadius) {
      const flattenFactor =
        1.0 - smoothstep(0, flattenRadius, distanceToCenter);
      z = MathUtils.lerp(z, z * (1.0 - flattenStrength), flattenFactor);
    }
    vertices[index + 2] = z;
  }
  geometry.attributes.position.needsUpdate = true;
  geometry.rotateX(-Math.PI / 2);
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  const material = new MeshLambertMaterial({ color: 0x88b04b });
  const terrainMesh = new Mesh(geometry, material);
  terrainMesh.receiveShadow = true;
  terrainMesh.name = "Terrain";
  terrainMesh.userData = {
    isTerrain: true,
    isCollidable: true,
    worldSize: size,
    segments,
  };
  return terrainMesh;
}

function setupLighting(scene: Scene): void {
  const ambientLight = new AmbientLight(0xadc1d4, 0.6);
  scene.add(ambientLight);
  const directionalLight = new DirectionalLight(0xfff5e1, 0.9);
  directionalLight.position.set(150, 200, 100);
  directionalLight.castShadow = true;
  directionalLight.target.position.set(0, 0, 0);
  directionalLight.shadow.mapSize.width = 1024;
  directionalLight.shadow.mapSize.height = 1024;
  directionalLight.shadow.camera.near = 10;
  directionalLight.shadow.camera.far = 500;
  const shadowCamSize = 150;
  directionalLight.shadow.camera.left = -shadowCamSize;
  directionalLight.shadow.camera.right = shadowCamSize;
  directionalLight.shadow.camera.top = shadowCamSize;
  directionalLight.shadow.camera.bottom = -shadowCamSize;
  directionalLight.shadow.bias = -0.001;
  scene.add(directionalLight);
  scene.add(directionalLight.target);
  const hemisphereLight = new HemisphereLight(0x87ceeb, 0x98fb98, 0.3);
  scene.add(hemisphereLight);
}

function populateEnvironment(
  scene: Scene,
  worldSize: number,
  collidableObjects: Object3D[],
  interactableObjects: Array<any>,
  entities: Array<any>,
  inventory: Inventory,
  models: Record<string, { scene: Group; animations: AnimationClip[] }>,
  gameInstance: Game // Added gameInstance
): void {
  const halfSize = worldSize / 2;
  const villageCenter = new Vector3(5, 0, 10);
  const addCharacter = (
    pos: Vector3,
    name: string,
    modelKey: string,
    isPlayer: boolean = false
  ): Character => {
    const model = models[modelKey];
    const charInventory = new Inventory(9);
    const character = new Character(
      scene,
      pos,
      name,
      model.scene,
      model.animations,
      charInventory
    );
    character.mesh!.position.y = getTerrainHeight(scene, pos.x, pos.z);
    character.game = gameInstance; // Assign game instance
    if (isPlayer) {
      character.name = "Player";
      character.userData.isPlayer = true;
      character.userData.isNPC = false;
      if (character.aiController) character.aiController = null; // Remove AI for player
    } else {
      character.userData.isPlayer = false;
      character.userData.isNPC = true;
      if (!character.aiController)
        console.warn(`NPC ${name} created without AIController!`); // Should be created in constructor
    }
    entities.push(character);
    collidableObjects.push(character.mesh!);
    interactableObjects.push(character);
    return character;
  };
  const farmerGiles = addCharacter(
    villageCenter.clone().add(new Vector3(-12, 0, 2)),
    "Farmer Giles",
    "tavernMan"
  );
  farmerGiles.persona =
    "A hardworking farmer who values community and is always willing to help others. He is knowledgeable about crops and livestock but can be a bit stubborn. He prefers to stay close to his farm but will venture out if necessary.";
  if (farmerGiles.aiController)
    farmerGiles.aiController.persona = farmerGiles.persona; // Sync persona

  const blacksmithBrynn = addCharacter(
    villageCenter.clone().add(new Vector3(10, 0, -3)),
    "Blacksmith Brynn",
    "woman"
  );
  blacksmithBrynn.persona =
    "A skilled artisan who takes pride in her work. She is strong-willed and independent, often focused on her craft. She can be gruff but has a kind heart, especially towards those in need.";
  if (blacksmithBrynn.aiController)
    blacksmithBrynn.aiController.persona = blacksmithBrynn.persona;

  const hunterRex = addCharacter(
    new Vector3(halfSize * 0.4, 0, -halfSize * 0.3),
    "Hunter Rex",
    "oldMan"
  );
  hunterRex.persona =
    "An experienced tracker and survivalist. He is quiet and observant, preferring the wilderness over the village. He is resourceful and can be relied upon in tough situations but is not very social.";
  if (hunterRex.aiController)
    hunterRex.aiController.persona = hunterRex.persona;

  const addObject = (
    creator: (pos: Vector3, ...args: any[]) => Group,
    count: number,
    minDistSq: number,
    ...args: any[]
  ) => {
    for (let i = 0; i < count; i++) {
      const x = randomFloat(-halfSize * 0.95, halfSize * 0.95);
      const z = randomFloat(-halfSize * 0.95, halfSize * 0.95);
      const distSq = (x - villageCenter.x) ** 2 + (z - villageCenter.z) ** 2;
      if (distSq < minDistSq) continue;
      const obj = creator(new Vector3(x, 0, z), ...args);
      const height = getTerrainHeight(scene, x, z);
      obj.position.y = height;
      if (obj.name === "Herb Plant") obj.position.y = height + 0.1;
      scene.add(obj);
      if (obj.userData.isCollidable) collidableObjects.push(obj);
      if (obj.userData.isInteractable) interactableObjects.push(obj);
      entities.push(obj);
      obj.userData.id = `${obj.name}_${obj.uuid.substring(0, 6)}`;
    }
  };
  addObject(createTree, 100, 25 * 25);
  addObject(createRock, 50, 20 * 20, randomFloat(1, 2.5));
  addObject(createHerb, 30, 10 * 10);
}

function createWorldBoundary(
  scene: Scene,
  worldSize: number,
  collidableObjects: Object3D[]
): void {
  const thickness = 20;
  const height = 100;
  const halfSize = worldSize / 2;
  const boundaryMaterial = new MeshBasicMaterial({
    transparent: true,
    opacity: 0.0,
    side: DoubleSide,
    visible: false,
  });
  const createWall = (
    px: number,
    pz: number,
    sx: number,
    sz: number,
    name: string
  ) => {
    const wallGeo = new BoxGeometry(sx, height, sz);
    const wallMesh = new Mesh(wallGeo, boundaryMaterial);
    wallMesh.position.set(px, height / 2, pz);
    wallMesh.name = name;
    wallMesh.userData.isCollidable = true;
    wallMesh.geometry.computeBoundingBox();
    wallMesh.updateMatrixWorld(true);
    wallMesh.userData.boundingBox = wallMesh.geometry
      .boundingBox!.clone()
      .applyMatrix4(wallMesh.matrixWorld);
    scene.add(wallMesh);
    collidableObjects.push(wallMesh);
  };
  createWall(
    halfSize + thickness / 2,
    0,
    thickness,
    worldSize + thickness * 2,
    "Boundary+X"
  );
  createWall(
    -halfSize - thickness / 2,
    0,
    thickness,
    worldSize + thickness * 2,
    "Boundary-X"
  );
  createWall(
    0,
    halfSize + thickness / 2,
    worldSize + thickness * 2,
    thickness,
    "Boundary+Z"
  );
  createWall(
    0,
    -halfSize - thickness / 2,
    worldSize + thickness * 2,
    thickness,
    "Boundary-Z"
  );
}

export class Inventory {
  size: number;
  items: Array<InventoryItem | null>;
  onChangeCallbacks: Array<(items: Array<InventoryItem | null>) => void>;
  itemMaxStack: Record<string, number>;

  constructor(size: number = 20) {
    this.size = size;
    this.items = new Array(size).fill(null);
    this.onChangeCallbacks = [];
    this.itemMaxStack = {
      default: 64,
      wood: 99,
      stone: 99,
      herb: 30,
      feather: 50,
      "Health Potion": 10,
      gold: Infinity,
    };
  }

  getMaxStack(itemName: string): number {
    return this.itemMaxStack[itemName] ?? this.itemMaxStack["default"];
  }

  addItem(itemName: string, count: number = 1): boolean {
    if (!itemName || count <= 0) return false;
    const maxStack = this.getMaxStack(itemName);
    let remainingCount = count;
    let changed = false;
    for (let i = 0; i < this.size && remainingCount > 0; i++) {
      const slot = this.items[i];
      if (slot?.name === itemName && slot.count < maxStack) {
        const canAdd = maxStack - slot.count;
        const amountToAdd = Math.min(remainingCount, canAdd);
        slot.count += amountToAdd;
        remainingCount -= amountToAdd;
        changed = true;
      }
    }
    if (remainingCount > 0) {
      for (let i = 0; i < this.size && remainingCount > 0; i++) {
        if (!this.items[i]) {
          const amountToAdd = Math.min(remainingCount, maxStack);
          this.items[i] = {
            name: itemName,
            count: amountToAdd,
            icon: itemName.toLowerCase().replace(/ /g, "_").replace(/'/g, ""),
          };
          remainingCount -= amountToAdd;
          changed = true;
        }
      }
    }
    if (changed) this.notifyChange();
    return remainingCount === 0;
  }

  removeItem(itemName: string, count: number = 1): boolean {
    if (!itemName || count <= 0) return false;
    let neededToRemove = count;
    let changed = false;
    for (let i = this.size - 1; i >= 0 && neededToRemove > 0; i--) {
      const slot = this.items[i];
      if (slot?.name === itemName) {
        const amountToRemove = Math.min(neededToRemove, slot.count);
        slot.count -= amountToRemove;
        neededToRemove -= amountToRemove;
        changed = true;
        if (slot.count === 0) this.items[i] = null;
      }
    }
    if (changed) this.notifyChange();
    return neededToRemove === 0;
  }

  removeItemByIndex(index: number, count: number = 1): boolean {
    if (index < 0 || index >= this.size || !this.items[index] || count <= 0)
      return false;
    const item = this.items[index]!;
    const removeCount = Math.min(count, item.count);
    item.count -= removeCount;
    if (item.count === 0) this.items[index] = null;
    this.notifyChange();
    return true;
  }

  countItem(itemName: string): number {
    return this.items.reduce(
      (total, item) => total + (item?.name === itemName ? item.count : 0),
      0
    );
  }

  getItem(index: number): InventoryItem | null {
    return index >= 0 && index < this.size ? this.items[index] : null;
  }

  onChange(callback: (items: Array<InventoryItem | null>) => void): void {
    if (typeof callback === "function") this.onChangeCallbacks.push(callback);
  }

  notifyChange(): void {
    const itemsCopy = this.items.map((item) => (item ? { ...item } : null));
    this.onChangeCallbacks.forEach((cb) => cb(itemsCopy));
  }
}

export class Game {
  scene: Scene | null = null;
  renderer: WebGLRenderer | null = null;
  camera: PerspectiveCamera | null = null;
  clock: Clock | null = null;
  activeCharacter: Character | null = null;
  thirdPersonCamera: ThirdPersonCamera | null = null;
  controls: Controls | null = null;
  mobileControls: MobileControls | null = null; // Added mobile controls instance
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
  particleEffects: Group[] = []; // Array to hold active particle effects
  audioElement: HTMLAudioElement | null = null; // For background music

  // Portal variables
  exitPortalGroup: Group | null = null;
  exitPortalBox: Box3 | null = null;
  exitPortalParticles: BufferGeometry | null = null;
  exitPortalInnerMaterial: MeshBasicMaterial | null = null;

  startPortalGroup: Group | null = null;
  startPortalBox: Box3 | null = null;
  startPortalParticles: BufferGeometry | null = null;
  startPortalInnerMaterial: MeshBasicMaterial | null = null;
  startPortalRefUrl: string | null = null;
  startPortalOriginalParams: URLSearchParams | null = null;
  hasEnteredFromPortal: boolean = false;
  quests: Quest[] | undefined;

  constructor() {}

  async init(): Promise<void> {
    this.clock = new Clock();
    this.initRenderer();
    this.initScene();
    this.initCamera();
    this.initInventory();
    this.initAudio();
    const models = await loadModels();

    const urlParams = new URLSearchParams(window.location.search);
    this.hasEnteredFromPortal = urlParams.get("portal") === "true";
    this.startPortalRefUrl = urlParams.get("ref");
    this.startPortalOriginalParams = urlParams; // Store all original params

    this.initPlayer(models);
    this.initControls(); // Initialize desktop controls first
    this.initMobileControls(); // Initialize mobile controls (will check if needed)
    this.initPhysics();
    this.initEnvironment(models);
    this.initSystems();
    this.initQuests();
    this.initUI();
    this.setupUIControls(); // Setup desktop keybinds

    this.createExitPortal();
    if (this.hasEnteredFromPortal && this.startPortalRefUrl) {
      this.createStartPortal();
      if (this.activeCharacter?.mesh) {
        this.activeCharacter.mesh.lookAt(
          this.startPortalGroup!.position.clone().add(new Vector3(0, 0, 10))
        );
      }
    }

    this.entities.forEach((entity) => {
      if (entity instanceof Character) {
        entity.game = this;
        entity.initIntentDisplay();
        entity.initNameDisplay(); // Add this line
      }
    });

    // Add listener for pointer lock change to start music on interaction
    document.addEventListener("pointerlockchange", () => {
      if (
        document.pointerLockElement === this.renderer?.domElement &&
        this.audioElement?.paused
      ) {
        this.audioElement.play().catch((e) => {
          console.warn("Background music play failed on interaction:", e);
        });
      }
    });
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
      setTimeout(() => {
        banner.classList.add("hidden");
      }, 5000); // Hide after 5 seconds
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
    this.scene.fog = new Fog(0x87ceeb, 150, 600);
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
    this.audioElement.volume = 0.3; // Start quieter
  }

  initPlayer(
    models: Record<string, { scene: Group; animations: AnimationClip[] }>
  ): void {
    let playerSpawnPos = new Vector3(0, 0, 5); // Default spawn

    if (this.hasEnteredFromPortal) {
      playerSpawnPos = new Vector3(0, 0, 15); // Adjust Z
    }

    playerSpawnPos.y = getTerrainHeight(
      this.scene!,
      playerSpawnPos.x,
      playerSpawnPos.z
    );

    const playerModel = models.player;
    this.activeCharacter = new Character(
      this.scene!,
      playerSpawnPos,
      "Player",
      playerModel.scene,
      playerModel.animations,
      this.inventory!
    );
    this.activeCharacter.userData.isPlayer = true;
    this.activeCharacter.userData.isInteractable = true;
    this.activeCharacter.userData.isNPC = false;
    if (this.activeCharacter.aiController) {
      this.activeCharacter.aiController = null;
    }
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

  // New method to initialize mobile controls
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
    // These are primarily for desktop/keyboard
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
    this.controls!.addKeyDownListener("KeyH", () => {
      if (!this.isPaused && !this.interactionSystem?.isChatOpen) {
        this.activeCharacter?.selfHeal();
      }
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
    if (this.isPaused === paused) return;
    this.isPaused = paused;

    // Don't manage pointer lock if mobile controls are active
    if (!this.mobileControls?.isActive()) {
      if (this.isPaused) {
        if (this.controls?.isPointerLocked) {
          this.controls.unlockPointer();
        }
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
    if (!this.renderer || !this.clock) return;

    const banner = document.getElementById("welcome-banner");
    if (banner) {
      const welcomeText = this.mobileControls?.isActive()
        ? "Welcome! Use joysticks to move/look, buttons to act."
        : "Welcome! [WASD] Move, Mouse Look, [I] Inv, [J] Journal, [E] Interact, [F] Attack, [H] Heal, [C] Switch, [Esc] Unlock/Close";
      banner.textContent = welcomeText;
      banner.classList.remove("hidden");
      setTimeout(() => {
        banner.classList.add("hidden");
      }, 5000);
    } else {
      // Fallback log entry
      this.activeCharacter!.eventLog.addEntry(
        this.mobileControls?.isActive()
          ? "Welcome! Use joysticks to move/look, buttons to act."
          : "Welcome! Click window to lock controls. [WASD] Move, Mouse Look, [I] Inventory, [J] Journal, [E] Interact, [F] Attack, [H] Heal, [C] Switch Control, [Esc] Unlock/Close UI"
      );
    }

    this.renderer.setAnimationLoop(this.update.bind(this));
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
    const deltaTime = Math.min(this.clock.getDelta(), 0.05);
    const elapsedTime = this.clock.elapsedTime;

    // Update mobile controls first if active
    this.mobileControls?.update(deltaTime);
    // Update desktop controls (will incorporate mobile input if active)
    this.controls!.update(deltaTime);

    if (!this.isPaused) {
      this.activeCharacter.update(deltaTime, {
        moveState: this.controls!.moveState,
        collidables: this.collidableObjects,
      });
      this.physics!.update(deltaTime);

      this.entities.forEach((entity) => {
        if (entity === this.activeCharacter) return;
        if (entity instanceof Character && entity.aiController) {
          const aiMoveState = entity.aiController.computeAIMoveState(deltaTime);
          entity.update(deltaTime, {
            moveState: aiMoveState,
            collidables: this.collidableObjects,
          });
        } else if (entity.update && !(entity instanceof Character)) {
          entity.update(deltaTime);
        }
      });

      this.entities.forEach((entity) => {
        if (entity instanceof Character && entity.aiController) {
          entity.aiController.updateObservation(this.entities);
        }
      });

      this.interactionSystem!.update(deltaTime);
      this.thirdPersonCamera!.update(deltaTime, this.collidableObjects);
      if (this.activeCharacter.isDead) this.respawnPlayer();

      this.animatePortals();
      this.checkPortalCollisions();
    }

    this.updateParticleEffects(elapsedTime);
    this.hud!.update();
    this.minimap!.update();

    this.renderer.render(this.scene, this.camera);
  }

  // --- Portal Methods ---

  createExitPortal(): void {
    if (!this.scene) return;

    this.exitPortalGroup = new Group();
    this.exitPortalGroup.position.set(-30, 10, -40); // Adjusted off-center position
    this.exitPortalGroup.rotation.x = 0; // Keep upright for now
    this.exitPortalGroup.rotation.y = Math.PI / 4; // Rotate slightly

    // Adjust Y position based on terrain height
    this.exitPortalGroup.position.y = getTerrainHeight(
      this.scene,
      this.exitPortalGroup.position.x,
      this.exitPortalGroup.position.z
    );
    this.exitPortalGroup.position.y += 5; // Raise it slightly above ground

    const portalRadius = 5;
    const portalTube = 1.5;

    // Create portal effect
    const exitPortalGeometry = new TorusGeometry(
      portalRadius,
      portalTube,
      16,
      100
    );
    const exitPortalMaterial = new MeshPhongMaterial({
      color: 0x00ff00,
      emissive: 0x00ff00,
      transparent: true,
      opacity: 0.8,
    });
    const exitPortal = new Mesh(exitPortalGeometry, exitPortalMaterial);
    this.exitPortalGroup.add(exitPortal);

    // Create portal inner surface
    const exitPortalInnerGeometry = new CircleGeometry(
      portalRadius - portalTube,
      32
    );
    this.exitPortalInnerMaterial = new MeshBasicMaterial({
      color: 0x00ff00,
      transparent: true,
      opacity: 0.5,
      side: DoubleSide,
    });
    const exitPortalInner = new Mesh(
      exitPortalInnerGeometry,
      this.exitPortalInnerMaterial
    );
    this.exitPortalGroup.add(exitPortalInner);

    // Add portal label
    const loader = new TextureLoader(); // Use TextureLoader
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d");
    if (context) {
      canvas.width = 512; // Increased width
      canvas.height = 64;
      context.fillStyle = "#00ff00";
      context.font = "bold 16px Arial";
      context.textAlign = "center";
      context.textBaseline = "middle"; // Center text vertically
      context.fillText("VIBEVERSE PORTAL", canvas.width / 2, canvas.height / 2);
      const texture = new CanvasTexture(canvas);
      const labelGeometry = new PlaneGeometry(portalRadius * 2, 5); // Adjust width based on radius
      const labelMaterial = new MeshBasicMaterial({
        map: texture,
        transparent: true,
        side: DoubleSide,
      });
      const label = new Mesh(labelGeometry, labelMaterial);
      label.position.y = portalRadius + 2; // Position above the torus
      this.exitPortalGroup.add(label);
    }

    // Create particle system for portal effect
    const exitPortalParticleCount = 1000;
    this.exitPortalParticles = new BufferGeometry();
    const exitPortalPositions = new Float32Array(exitPortalParticleCount * 3);
    const exitPortalColors = new Float32Array(exitPortalParticleCount * 3);

    for (let i = 0; i < exitPortalParticleCount * 3; i += 3) {
      // Create particles in a ring around the portal
      const angle = Math.random() * Math.PI * 2;
      const radius = portalRadius + (Math.random() - 0.5) * portalTube * 2;
      exitPortalPositions[i] = Math.cos(angle) * radius;
      exitPortalPositions[i + 1] = Math.sin(angle) * radius;
      exitPortalPositions[i + 2] = (Math.random() - 0.5) * 4;

      // Green color with slight variation
      exitPortalColors[i] = 0;
      exitPortalColors[i + 1] = 0.8 + Math.random() * 0.2;
      exitPortalColors[i + 2] = 0;
    }

    this.exitPortalParticles.setAttribute(
      "position",
      new BufferAttribute(exitPortalPositions, 3)
    );
    this.exitPortalParticles.setAttribute(
      "color",
      new BufferAttribute(exitPortalColors, 3)
    );

    const exitPortalParticleMaterial = new PointsMaterial({
      size: 0.2,
      vertexColors: true,
      transparent: true,
      opacity: 0.6,
    });

    const exitPortalParticleSystem = new Points(
      this.exitPortalParticles,
      exitPortalParticleMaterial
    );
    this.exitPortalGroup.add(exitPortalParticleSystem);

    // Add full portal group to scene
    this.scene.add(this.exitPortalGroup);

    // Create portal collision box
    this.exitPortalBox = new Box3().setFromObject(this.exitPortalGroup);
  }

  createStartPortal(): void {
    if (!this.scene || !this.activeCharacter?.mesh) return;

    // Use the default spawn point as the portal location
    const spawnPoint = new Vector3(0, 0, 5);
    spawnPoint.y = getTerrainHeight(this.scene, spawnPoint.x, spawnPoint.z);

    this.startPortalGroup = new Group();
    this.startPortalGroup.position.copy(spawnPoint);
    this.startPortalGroup.position.y += 5; // Raise slightly
    this.startPortalGroup.rotation.x = 0;
    this.startPortalGroup.rotation.y = -Math.PI / 2; // Face towards where player spawns

    const portalRadius = 10;
    const portalTube = 1.5;

    // Create portal effect
    const startPortalGeometry = new TorusGeometry(
      portalRadius,
      portalTube,
      16,
      100
    );
    const startPortalMaterial = new MeshPhongMaterial({
      color: 0xff0000,
      emissive: 0xff0000,
      transparent: true,
      opacity: 0.8,
    });
    const startPortal = new Mesh(startPortalGeometry, startPortalMaterial);
    this.startPortalGroup.add(startPortal);

    // Create portal inner surface
    const startPortalInnerGeometry = new CircleGeometry(
      portalRadius - portalTube,
      32
    );
    this.startPortalInnerMaterial = new MeshBasicMaterial({
      color: 0xff0000,
      transparent: true,
      opacity: 0.5,
      side: DoubleSide,
    });
    const startPortalInner = new Mesh(
      startPortalInnerGeometry,
      this.startPortalInnerMaterial
    );
    this.startPortalGroup.add(startPortalInner);

    // Add portal label (optional for start portal, maybe show ref URL?)
    const loader = new TextureLoader();
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d");
    if (context && this.startPortalRefUrl) {
      canvas.width = 512;
      canvas.height = 64;
      context.fillStyle = "#ff0000";
      context.font = "bold 28px Arial"; // Smaller font
      context.textAlign = "center";
      context.textBaseline = "middle";
      // Display the domain from refUrl
      let displayUrl = this.startPortalRefUrl;
      try {
        const urlObj = new URL(
          displayUrl.startsWith("http") ? displayUrl : "https://" + displayUrl
        );
        displayUrl = urlObj.hostname; // Show only hostname
      } catch (e) {
        // Keep original if URL parsing fails
      }
      context.fillText(
        `Return to: ${displayUrl}`,
        canvas.width / 2,
        canvas.height / 2
      );
      const texture = new CanvasTexture(canvas);
      const labelGeometry = new PlaneGeometry(portalRadius * 2, 5);
      const labelMaterial = new MeshBasicMaterial({
        map: texture,
        transparent: true,
        side: DoubleSide,
      });
      const label = new Mesh(labelGeometry, labelMaterial);
      label.position.y = portalRadius + 2;
      this.startPortalGroup.add(label);
    }

    // Create particle system for portal effect
    const startPortalParticleCount = 1000;
    this.startPortalParticles = new BufferGeometry();
    const startPortalPositions = new Float32Array(startPortalParticleCount * 3);
    const startPortalColors = new Float32Array(startPortalParticleCount * 3);

    for (let i = 0; i < startPortalParticleCount * 3; i += 3) {
      const angle = Math.random() * Math.PI * 2;
      const radius = portalRadius + (Math.random() - 0.5) * portalTube * 2;
      startPortalPositions[i] = Math.cos(angle) * radius;
      startPortalPositions[i + 1] = Math.sin(angle) * radius;
      startPortalPositions[i + 2] = (Math.random() - 0.5) * 4;

      startPortalColors[i] = 0.8 + Math.random() * 0.2;
      startPortalColors[i + 1] = 0;
      startPortalColors[i + 2] = 0;
    }

    this.startPortalParticles.setAttribute(
      "position",
      new BufferAttribute(startPortalPositions, 3)
    );
    this.startPortalParticles.setAttribute(
      "color",
      new BufferAttribute(startPortalColors, 3)
    );

    const startPortalParticleMaterial = new PointsMaterial({
      size: 0.2,
      vertexColors: true,
      transparent: true,
      opacity: 0.6,
    });

    const startPortalParticleSystem = new Points(
      this.startPortalParticles,
      startPortalParticleMaterial
    );
    this.startPortalGroup.add(startPortalParticleSystem);

    // Add portal group to scene
    this.scene.add(this.startPortalGroup);

    // Create portal collision box
    this.startPortalBox = new Box3().setFromObject(this.startPortalGroup);
  }

  animatePortals(): void {
    // Animate Exit Portal Particles
    if (this.exitPortalParticles) {
      const positions = this.exitPortalParticles.attributes.position
        .array as Float32Array;
      for (let i = 0; i < positions.length; i += 3) {
        positions[i + 1] += 0.05 * Math.sin(Date.now() * 0.001 + i); // Simple vertical oscillation
      }
      this.exitPortalParticles.attributes.position.needsUpdate = true;
    }

    // Animate Start Portal Particles
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

    // Check Exit Portal
    if (this.exitPortalGroup && this.exitPortalBox) {
      const portalCenter = this.exitPortalBox.getCenter(new Vector3());
      const portalDistance = playerCenter.distanceTo(portalCenter);
      const interactionThreshold = 15; // How close player needs to be

      if (portalDistance < interactionThreshold) {
        // Construct the redirect URL
        const currentSpeed = this.activeCharacter.velocity.length();
        const selfUsername = this.activeCharacter.name;
        const ref = window.location.href;

        const newParams = new URLSearchParams();
        newParams.append("username", selfUsername);
        newParams.append("color", "white"); // Hardcoded color
        newParams.append("speed", currentSpeed.toFixed(2));
        newParams.append("ref", ref);
        newParams.append("speed_x", this.activeCharacter.velocity.x.toFixed(2));
        newParams.append("speed_y", this.activeCharacter.velocity.y.toFixed(2));
        newParams.append("speed_z", this.activeCharacter.velocity.z.toFixed(2));

        const paramString = newParams.toString();
        const nextPage =
          "http://portal.pieter.com" + (paramString ? "?" + paramString : "");

        // Preload in iframe (optional, can be removed if causing issues)
        if (!document.getElementById("preloadFrame")) {
          const iframe = document.createElement("iframe");
          iframe.id = "preloadFrame";
          iframe.style.display = "none";
          iframe.src = nextPage;
          document.body.appendChild(iframe);
        }

        // Check for actual intersection to trigger redirect
        if (playerBox.intersectsBox(this.exitPortalBox)) {
          window.location.href = nextPage;
        }
      } else {
        // Remove preload iframe if player moves away
        const iframe = document.getElementById("preloadFrame");
        if (iframe) {
          iframe.remove();
        }
      }
    }

    // Check Start Portal
    if (
      this.startPortalGroup &&
      this.startPortalBox &&
      this.startPortalRefUrl &&
      this.startPortalOriginalParams
    ) {
      const portalCenter = this.startPortalBox.getCenter(new Vector3());
      const portalDistance = playerCenter.distanceTo(portalCenter);
      const interactionThreshold = 15;

      if (portalDistance < interactionThreshold) {
        if (playerBox.intersectsBox(this.startPortalBox)) {
          // Redirect back to the ref URL, forwarding original params
          let url = this.startPortalRefUrl;
          if (!url.startsWith("http://") && !url.startsWith("https://")) {
            url = "https://" + url;
          }

          // Reconstruct query parameters from the original entry URL
          const newParams = new URLSearchParams();
          for (const [key, value] of this.startPortalOriginalParams) {
            if (key !== "ref" && key !== "portal") {
              // Forward all params except ref and portal
              newParams.append(key, value);
            }
          }

          const paramString = newParams.toString();
          window.location.href = url + (paramString ? "?" + paramString : "");
        }
      }
    }
  }

  // --- End Portal Methods ---

  spawnParticleEffect(position: Vector3, colorName: "red" | "green"): void {
    if (!this.scene || !this.clock) return;

    const particleCount = 10;
    const particleSize = 0.07;
    const effectDuration = 1; // seconds
    const spreadRadius = 0.3;
    const particleSpeed = 1.5;

    const color = colorName === "red" ? 0xff0000 : 0x00ff00;

    const effectGroup = new Group();
    effectGroup.position.copy(position);

    const geometry = new SphereGeometry(particleSize, 4, 2); // Simple geometry

    for (let i = 0; i < particleCount; i++) {
      const material = new MeshBasicMaterial({
        color: color,
        transparent: true,
        opacity: 1.0,
      });
      const particle = new Mesh(geometry, material);

      // Random initial position within a small sphere
      const initialOffset = new Vector3(
        (Math.random() - 0.5) * spreadRadius,
        (Math.random() - 0.5) * spreadRadius,
        (Math.random() - 0.5) * spreadRadius
      );
      particle.position.copy(initialOffset);

      // Store direction and speed in userData
      particle.userData.velocity = initialOffset
        .clone()
        .normalize()
        .multiplyScalar(particleSpeed * (0.5 + Math.random() * 0.5));

      effectGroup.add(particle);
    }

    // Store effect metadata
    effectGroup.userData.startTime = this.clock.elapsedTime;
    effectGroup.userData.duration = effectDuration;

    this.scene.add(effectGroup);
    this.particleEffects.push(effectGroup);
  }

  updateParticleEffects(elapsedTime: number): void {
    if (!this.scene || !this.clock) return;

    const effectsToRemove: Group[] = [];
    const particleDeltaTime = this.isPaused ? 0 : this.clock!.getDelta(); // Use 0 delta if paused

    for (let i = this.particleEffects.length - 1; i >= 0; i--) {
      const effect = this.particleEffects[i];
      const effectElapsedTime = elapsedTime - effect.userData.startTime;
      const progress = Math.min(
        1.0,
        effectElapsedTime / effect.userData.duration
      );

      if (progress >= 1.0) {
        effectsToRemove.push(effect);
        this.particleEffects.splice(i, 1);
        continue;
      }

      // Animate individual particles only if not paused
      if (!this.isPaused) {
        effect.children.forEach((particle) => {
          if (particle instanceof Mesh && particle.userData.velocity) {
            // Move particle outwards
            particle.position.addScaledVector(
              particle.userData.velocity,
              particleDeltaTime
            ); // Use delta time for movement
          }
        });
      }

      // Update fade effect regardless of pause state
      effect.children.forEach((particle) => {
        if (particle instanceof Mesh) {
          // Fade out particle
          if (Array.isArray(particle.material)) {
            particle.material.forEach((mat) => {
              if (mat instanceof MeshBasicMaterial) {
                mat.opacity = 1.0 - progress;
                mat.needsUpdate = true;
              }
            });
          } else if (particle.material instanceof MeshBasicMaterial) {
            particle.material.opacity = 1.0 - progress;
            particle.material.needsUpdate = true;
          }
        }
      });
    }

    // Remove completed effects from the scene
    effectsToRemove.forEach((effect) => {
      // Dispose geometries and materials
      effect.traverse((child) => {
        if (child instanceof Mesh) {
          child.geometry?.dispose();
          if (Array.isArray(child.material)) {
            child.material.forEach((mat) => mat.dispose());
          } else {
            child.material?.dispose();
          }
        }
      });
      this.scene!.remove(effect);
    });
  }

  worldToScreenPosition(worldPos: Vector3): { x: number; y: number } | null {
    if (!this.camera || !this.renderer) return null;
    const vector = worldPos.clone().project(this.camera);
    const x = (vector.x * 0.5 + 0.5) * this.renderer.domElement.width;
    const y = (vector.y * -0.5 + 0.5) * this.renderer.domElement.height;
    if (vector.z > 1.0 || vector.z < -1.0) return null;
    return { x, y };
  }

  respawnPlayer(): void {
    const respawnMessage = `${
      this.activeCharacter!.name
    } blacked out and woke up back near the village...`;
    this.logEvent(
      this.activeCharacter!,
      "respawn_start",
      respawnMessage,
      undefined,
      {},
      this.activeCharacter!.mesh!.position
    );

    const goldCount = this.inventory!.countItem("gold");
    const goldPenalty = Math.min(10, Math.floor(goldCount * 0.1));
    if (goldPenalty > 0) {
      this.inventory!.removeItem("gold", goldPenalty);
      const penaltyMessage = `Lost ${goldPenalty} gold.`;
      this.logEvent(
        this.activeCharacter!,
        "penalty",
        penaltyMessage,
        undefined,
        { item: "gold", amount: goldPenalty },
        this.activeCharacter!.mesh!.position
      );
    }
    const respawnPos = new Vector3(0, 0, 10);
    respawnPos.y = getTerrainHeight(this.scene!, respawnPos.x, respawnPos.z);
    this.activeCharacter!.respawn(respawnPos);
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
    oldPlayer.aiController!.aiState = "idle";
    oldPlayer.aiController!.previousAiState = "idle";

    newPlayer.userData.isPlayer = true;
    newPlayer.userData.isNPC = false;

    // Update displays after flag changes
    oldPlayer.initIntentDisplay(); // Add displays for old player (now NPC)
    oldPlayer.initNameDisplay();
    newPlayer.removeDisplays(); // Remove displays for new player

    this.activeCharacter = newPlayer;

    if (newPlayer.aiController) {
      newPlayer.aiController = null;
    }

    this.controls!.player = newPlayer;
    this.thirdPersonCamera!.target = newPlayer.mesh!;
    this.physics!.player = newPlayer;
    this.interactionSystem!.player = newPlayer;
    this.interactionSystem!.eventLog = newPlayer.eventLog;
    this.inventory = newPlayer.inventory;
    this.inventoryDisplay!.setInventory(this.inventory!);
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
      // Potentially re-initialize or reposition mobile controls if layout changes significantly
      // this.mobileControls?.destroy(); // If nipplejs has a destroy method
      // this.initMobileControls();
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
    const eventEntry: EventEntry = {
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
    // Distribute to all characters' event logs
    this.entities.forEach((entity) => {
      if (entity instanceof Character && entity.eventLog) {
        entity.eventLog.addEntry(eventEntry);
      }
    });
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
    gameInstance.start();
    const onResize = () => gameInstance.onWindowResize();
    window.addEventListener("resize", onResize, false);
    window.addEventListener("beforeunload", () =>
      window.removeEventListener("resize", onResize)
    );
  }
  startGame();
} else {
  const warning = WebGL.getWebGLErrorMessage();
  document.getElementById("game-container")?.appendChild(warning);
}

///// src/ai.ts

// Define both API keys
const API_KEY1 = import.meta.env.VITE_API_KEY1;
const API_KEY2 = import.meta.env.VITE_API_KEY2;
let switched = false;

// Store the current API key and URL globally, with ability to switch
let currentApiKey = API_KEY1 || "";
let API_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${currentApiKey}`;

// Function to switch API key
function switchApiKey(): void {
  if (currentApiKey === API_KEY1) {
    currentApiKey = API_KEY2;
    console.log("Switched to VITE_API_KEY2 due to rate limit.");
  } else if (currentApiKey === API_KEY2) {
    currentApiKey = API_KEY1;
    console.log("Switched back to VITE_API_KEY1.");
  } else {
    console.warn("No alternate API key available for rotation.");
  }
  API_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${currentApiKey}`;
}

export async function sendToGemini(prompt: string): Promise<string | null> {
  if (!currentApiKey) {
    console.warn(
      "API_KEY is not configured. Please set a valid API_KEY in .env file to use Gemini API."
    );
    return null;
  }

  try {
    const response = await fetch(API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        contents: [
          {
            parts: [{ text: prompt }],
          },
        ],
        generationConfig: {
          responseMimeType: "application/json",
        },
      }),
    });

    if (!response.ok) {
      if (response.status === 429 && !switched) {
        // Rate limit hit, switch key and retry once
        console.warn(`Rate limit hit (429). Switching API key...`);
        switchApiKey();
        switched = true;
      }
      console.error(`HTTP error! status: ${response.status}`);
      const errorData = await response.json();
      console.error("Error details:", errorData);
      return null;
    }

    const data = await response.json();
    if (
      data.candidates &&
      data.candidates.length > 0 &&
      data.candidates[0].content &&
      data.candidates[0].content.parts &&
      data.candidates[0].content.parts.length > 0
    ) {
      return data.candidates[0].content.parts[0].text as string;
    } else {
      console.error(
        "No text content found in the API response or unexpected format:",
        data
      );
      return null;
    }
  } catch (error) {
    console.error("Error during API call:", error);
    return JSON.stringify({
      action: "idle",
      intent: "Error fallback",
    });
  }
}

export interface Observation {
  timestamp: number;
  self: {
    id: string;
    position: Vector3;
    health: number;
    isDead: boolean;
    currentAction: string;
  };
  nearbyCharacters: Array<{
    id: string;
    position: Vector3;
    health: number;
    isDead: boolean;
    currentAction: string;
  }>;
  nearbyObjects: Array<{
    id: string;
    type: string;
    position: Vector3;
    isInteractable: boolean;
    resource?: string;
  }>;
}

export class AIController {
  character: Character;
  aiState: string = "idle";
  previousAiState: string = "idle";
  homePosition: Vector3;
  destination: Vector3 | null = null;
  targetResource: Object3D | null = null;
  gatherTimer: number = 0;
  gatherDuration: number = 0;
  actionTimer: number = 5;
  interactionDistance: number = 3; // Increased slightly for actions
  searchRadius: number;
  roamRadius: number;
  target: Entity | null = null;
  observation: Observation | null = null;
  persona: string = "";
  currentIntent: string = "";

  // New properties for actions
  targetAction: string | null = null; // 'chat', 'attack', 'heal'
  message: string | null = null; // For chat action

  // New properties for optimization
  private lastApiCallTime: number = 0;
  private apiCallCooldown: number = 10000; // 5 seconds minimum between API calls
  private lastObservation: Observation | null = null; // To track changes

  constructor(character: Character) {
    this.character = character;
    this.homePosition = character.mesh!.position.clone();
    this.searchRadius = character.searchRadius;
    this.roamRadius = character.roamRadius;
    this.persona = character.persona;
  }

  computeAIMoveState(deltaTime: number): MoveState {
    const moveState: MoveState = {
      forward: 0,
      right: 0,
      jump: false,
      sprint: false,
      interact: false,
      attack: false,
    };

    // Update observation every frame to detect changes
    if (this.character.game) {
      this.updateObservation(this.character.game.entities);
    }

    switch (this.aiState) {
      case "idle":
        const currentTime = Date.now();
        const timeSinceLastCall = currentTime - this.lastApiCallTime;
        const canCallApi = timeSinceLastCall >= this.apiCallCooldown;

        // --- Reactivity Check (Happens frequently while idle) ---
        if (canCallApi && this.isAffectedByEntities()) {
          console.log(`AI (${this.character.name}) reacting to entity change.`);
          this.decideNextAction();
          this.lastApiCallTime = currentTime;
          this.actionTimer = 5 + Math.random() * 5; // Reset idle timer after API call
          break; // Exit idle state processing for this frame
        }

        // --- Regular Idle Timer Check ---
        this.actionTimer -= deltaTime;
        if (this.actionTimer <= 0) {
          this.actionTimer = 5 + Math.random() * 5; // Reset timer

          if (canCallApi && this.justCompletedAction()) {
            console.log(
              `AI (${this.character.name}) deciding action after completing task.`
            );
            this.decideNextAction();
            this.lastApiCallTime = currentTime;
          } else if (canCallApi) {
            console.log(
              `AI (${this.character.name}) deciding action after idle period.`
            );
            this.decideNextAction(); // Decide action even if idle
            this.lastApiCallTime = currentTime;
          } else {
            // Cooldown not met when timer expired, just roam for now
            console.log(
              `AI (${this.character.name}) falling back (cooldown) after idle period.`
            );
            this.fallbackToDefaultBehavior();
          }
        }
        break; // End of idle case

      case "roaming":
        if (this.destination) {
          const direction = this.destination
            .clone()
            .sub(this.character.mesh!.position);
          direction.y = 0;
          const distance = direction.length();
          if (distance > 0.5) {
            direction.normalize();
            this.character.lookAt(
              this.character.mesh!.position.clone().add(direction)
            );
            moveState.forward = 1;
          } else {
            this.aiState = "idle";
            this.destination = null;
          }
        } else {
          this.aiState = "idle";
        }
        break;

      case "movingToResource":
        if (
          this.targetResource &&
          this.targetResource.visible &&
          this.targetResource.userData.isInteractable
        ) {
          const direction = this.targetResource.position
            .clone()
            .sub(this.character.mesh!.position);
          direction.y = 0;
          const distance = direction.length();
          if (distance > 1) {
            direction.normalize();
            this.character.lookAt(this.targetResource.position);
            moveState.forward = 1;
          } else {
            this.aiState = "gathering";
            this.gatherTimer = 0;
            this.gatherDuration =
              this.targetResource.userData.gatherTime || 3000;
            this.character.isGathering = true;
          }
        } else {
          this.aiState = "idle";
          this.targetResource = null;
        }
        break;

      case "gathering":
        this.gatherTimer += deltaTime * 1000;
        if (this.gatherTimer >= this.gatherDuration) {
          if (this.targetResource && this.character.inventory) {
            const resourceName = this.targetResource.userData.resource;
            this.character.inventory.addItem(resourceName, 1);
            if (this.character.game) {
              this.character.game.logEvent(
                this.character,
                "gather",
                `${this.character.name} gathered 1 ${resourceName}.`,
                undefined,
                { resource: resourceName },
                this.character.mesh!.position
              );
            }
          }
          if (this.targetResource?.userData.isDepletable) {
            this.targetResource.visible = false;
            this.targetResource.userData.isInteractable = false;
            const respawnTime =
              this.targetResource.userData.respawnTime || 15000;
            const resourceToRespawn = this.targetResource;
            setTimeout(() => {
              if (resourceToRespawn && resourceToRespawn.userData) {
                resourceToRespawn.visible = true;
                resourceToRespawn.userData.isInteractable = true;
              }
            }, respawnTime);
          }
          this.targetResource = null;
          this.aiState = "idle";
          this.character.isGathering = false;
          this.currentIntent = "";
        }
        break;

      // New state for moving towards a character target for an action
      case "movingToTarget":
        if (
          this.target &&
          this.target.mesh &&
          this.targetAction &&
          !this.target.isDead
        ) {
          const direction = this.target.mesh.position
            .clone()
            .sub(this.character.mesh!.position);
          direction.y = 0; // Ignore vertical distance for movement
          const distance = direction.length();

          if (distance > this.interactionDistance) {
            // Move towards target
            direction.normalize();
            this.character.lookAt(
              this.character.mesh!.position.clone().add(direction)
            );
            moveState.forward = 1;
          } else {
            // In range, perform the action
            this.character.lookAt(this.target.mesh.position); // Look at target before action

            if (this.targetAction === "chat" && this.message) {
              this.character.showTemporaryMessage(this.message);
              // Log the event
              if (this.character.game) {
                this.character.game.logEvent(
                  this.character,
                  "chat",
                  `${this.character.name} said "${this.message}" to ${this.target.name}.`,
                  this.target,
                  { message: this.message },
                  this.character.mesh!.position
                );
              }
              // Chat is instant, go back to idle
              this.aiState = "idle";
              this.target = null;
              this.targetAction = null;
              this.message = null;
            } else if (this.targetAction === "attack") {
              this.character.triggerAction("attack"); // Trigger animation, actual attack happens on finish
              // Stay in this state until animation finishes? No, let animation handler reset state.
              // For now, assume action is triggered and go idle. Re-evaluation will happen.
              this.aiState = "idle";
              this.target = null;
              this.targetAction = null;
            } else if (this.targetAction === "heal") {
              if (
                this.target instanceof Character &&
                this.target.health < this.target.maxHealth
              ) {
                this.character.triggerAction("heal"); // Trigger animation, heal happens on finish
              }
              // Go idle after triggering heal attempt
              this.aiState = "idle";
              this.target = null;
              this.targetAction = null;
            } else {
              // Unknown target action, go idle
              this.aiState = "idle";
              this.target = null;
              this.targetAction = null;
              this.message = null;
            }
          }
        } else {
          // Target lost, dead, or no action defined, go idle
          this.aiState = "idle";
          this.target = null;
          this.targetAction = null;
          this.message = null;
        }
        break;
    }

    // Log state changes
    if (this.aiState !== this.previousAiState) {
      if (this.character.game) {
        let message = "";
        switch (this.aiState) {
          case "idle":
            message = `${this.character.name} is now idle.`;
            break;
          case "roaming":
            message = `${this.character.name} is roaming.`;
            break;
          case "movingToResource":
            message = `${this.character.name} is moving to a resource.`;
            break;
          case "gathering":
            message = `${this.character.name} started gathering.`;
            break;
          case "movingToTarget":
            message = `${this.character.name} is moving towards ${
              this.target?.name || "target"
            } to ${this.targetAction}.`;
            break; // Added movingToTarget log
        }
        if (message) {
          this.character.game.logEvent(
            this.character,
            this.aiState,
            message,
            undefined,
            {},
            this.character.mesh!.position
          );
        }
      }
      this.previousAiState = this.aiState;
    }

    return moveState;
  }

  // Check if an action just completed
  private justCompletedAction(): boolean {
    // Consider completion if moving from an active state to idle
    return this.previousAiState !== "idle" && this.aiState === "idle";
  }

  // Check if the character is affected by other entities
  private isAffectedByEntities(): boolean {
    if (!this.observation || !this.lastObservation) return false;

    const currentCharacters = this.observation.nearbyCharacters;
    const lastCharacters = this.lastObservation.nearbyCharacters;

    // Check for new characters or significant changes
    for (const currChar of currentCharacters) {
      const matchingLastChar = lastCharacters.find((c) => c.id === currChar.id);
      if (!matchingLastChar) {
        // New character appeared
        return true;
      }
      // Check for significant state changes (e.g., health drop, action change, death)
      if (
        currChar.health < matchingLastChar.health ||
        // currChar.currentAction !== matchingLastChar.currentAction || // Action changes too frequently
        currChar.isDead !== matchingLastChar.isDead
      ) {
        return true;
      }
    }
    // Check if characters disappeared (might be less critical)
    for (const lastChar of lastCharacters) {
      if (!currentCharacters.some((c) => c.id === lastChar.id)) {
        // Character disappeared
        // return true; // Optional: react to disappearance
      }
    }

    // If no significant changes are detected, return false
    return false;
  }

  updateObservation(allEntities: Array<any>): void {
    this.lastObservation = this.observation
      ? JSON.parse(JSON.stringify(this.observation))
      : null; // Deep copy needed for comparison

    const nearbyCharacters: Observation["nearbyCharacters"] = [];
    const nearbyObjects: Observation["nearbyObjects"] = [];
    const selfPosition = this.character.mesh!.position;
    const searchRadiusSq = this.searchRadius * this.searchRadius;

    // Add self to observation
    const self: Observation["self"] = {
      id: this.character.id,
      position: selfPosition.clone(),
      health: this.character.health,
      isDead: this.character.isDead,
      currentAction: this.aiState, // Use AI state for current action
    };

    for (const entity of allEntities) {
      if (entity === this.character || entity === this.character.mesh) continue;

      const entityMesh =
        entity instanceof Entity || entity instanceof Object3D
          ? ((entity as any).mesh ?? entity)
          : null;
      if (!entityMesh || !entityMesh.parent) continue; // Ensure mesh exists and is in the scene

      const entityPosition = entityMesh.position;
      const distanceSq = selfPosition.distanceToSquared(entityPosition);

      if (distanceSq > searchRadiusSq) continue;

      if (entity instanceof Character) {
        nearbyCharacters.push({
          id: entity.id,
          position: entityPosition.clone(),
          health: entity.health,
          isDead: entity.isDead,
          // Use AI state if available, otherwise check if player controlled
          currentAction:
            entity.aiController?.aiState ||
            (entity === this.character.game?.activeCharacter
              ? "player_controlled"
              : entity.isDead
                ? "dead"
                : "unknown"),
        });
      } else if (entity.userData?.isInteractable && entity.visible) {
        nearbyObjects.push({
          id: entity.userData.id || entity.uuid,
          type: entity.name || "unknown",
          position: entityPosition.clone(),
          isInteractable: entity.userData.isInteractable,
          resource: entity.userData.resource,
        });
      }
    }

    this.observation = {
      timestamp: Date.now(),
      self,
      nearbyCharacters,
      nearbyObjects,
    };
  }

  // Updated generatePrompt
  generatePrompt(): string {
    const persona = this.persona;
    const observation = this.observation;
    // Format event log to include IDs
    const eventLog = this.character.eventLog.entries
      .slice(-7)
      .map((entry) => {
        let logMessage = `[${entry.timestamp}] ${entry.message}`;

        return logMessage;
      })
      .join("\n");

    const selfState = observation?.self
      ? `- Health: ${observation.self.health}\n- Current action: ${observation.self.currentAction}`
      : "Unknown";

    let nearbyCharacters = "None";
    if (observation && observation.nearbyCharacters.length > 0) {
      nearbyCharacters = observation.nearbyCharacters
        .map(
          (c) =>
            `- ${c.id} at (${c.position.x.toFixed(1)}, ${c.position.y.toFixed(
              1
            )}, ${c.position.z.toFixed(1)}), health: ${c.health}, ${
              c.isDead ? "dead" : "alive"
            }, action: ${c.currentAction}`
        )
        .join("\n");
    }

    let nearbyObjects = "None";

    if (
      observation &&
      observation.nearbyObjects &&
      observation.nearbyObjects.length > 0
    ) {
      const typeCounts: Record<string, number> = {}; // Object to store counts for each type
      const limitedObjects = observation.nearbyObjects.filter((o) => {
        const type = o.type;
        // Initialize count if type not seen before
        typeCounts[type] = typeCounts[type] || 0;
        // Check if count for this type is less than 5
        if (typeCounts[type] < 3) {
          // Increment count and keep the object
          typeCounts[type]++;
          return true; // Include this object
        } else {
          // Exclude this object if limit for its type is reached
          return false;
        }
      });

      // Proceed only if there are objects left after filtering
      if (limitedObjects.length > 0) {
        nearbyObjects = limitedObjects
          .map(
            (o) =>
              `- ${o.type} (${o.id}) at (${o.position.x.toFixed(
                1
              )}, ${o.position.y.toFixed(1)}, ${o.position.z.toFixed(1)})${
                // Note: Removed potential extra comma before resource
                o.resource ? ", resource: " + o.resource : ""
              }`
          )
          .join("\n");
      }
      // If limitedObjects is empty after filtering, nearbyObjects remains "None"
    }

    // Updated prompt with new actions and response format
    const prompt = `
You are controlling an NPC named ${this.character.id} in a game. Here is your persona:
${persona}

Your current state:
${selfState}

Here are your recent observations:
Nearby characters:
${nearbyCharacters}

Nearby objects:
${nearbyObjects}

Here are the recent events you are aware of:
${eventLog}

Based on this information, decide your next action. You may want to gather resources, chat with others, attack enemies, or heal allies if necessary. Imediately proceed to gather resource if player request. Respond ONLY with a valid JSON object in the following format:
{
  "action": "idle" | "roam" | "gather" | "moveTo" | "attack" | "heal" | "chat",
  "object_id": "object_id_here", // only if action is "gather", choose from nearby objects
  "target_id": "character_id_here", // only if action is "moveTo", "attack", "heal", or "chat", choose from nearby characters or "home"
  "message": "message_here", // only if action is "chat"
  "intent": "less than 5 words reason here"
}

Example - Chat:
{
  "action": "chat",
  "target_id": "Farmer Giles_1",
  "message": "Nice weather we're having!",
  "intent": "Make small talk"
}
Example - Attack:
{
  "action": "attack",
  "target_id": "Hunter Rex_2",
  "intent": "Defend territory"
}
Example - Gather:
{
  "action": "gather",
  "object_id": "Herb Plant_d8a868",
  "intent": "Need wood"
}
Example - Idle:
{
  "action": "idle",
  "intent": "Resting"
}
Choose an appropriate action based on your persona and the current situation. Ensure the target_id exists and object_id exists in nearby list.
`.trim();

    return prompt;
  }

  async decideNextAction(): Promise<void> {
    const prompt = this.generatePrompt();
    try {
      console.log(`AI (${this.character.name}) Prompt:`, prompt);
      const response = await sendToGemini(prompt);
      if (response) {
        try {
          // Gemini API with JSON mode should return just the JSON string
          const actionData = JSON.parse(response);
          console.log(`AI (${this.character.name}) Response:`, actionData);

          this.setActionFromAPI(actionData);
        } catch (parseError) {
          console.error(
            `Failed to parse API response as JSON:`,
            parseError,
            "\nResponse:",
            response
          );
          this.fallbackToDefaultBehavior();
        }
      } else {
        console.warn(
          `AI (${this.character.name}) received null response from API.`
        );
        this.fallbackToDefaultBehavior();
      }
    } catch (error) {
      console.error(`Error querying API for ${this.character.name}:`, error);
      this.fallbackToDefaultBehavior();
    }
  }

  fallbackToDefaultBehavior(): void {
    console.log(
      `AI (${this.character.name}) falling back to default behavior (roam).`
    );
    this.aiState = "roaming";
    const angle = Math.random() * Math.PI * 2;
    const distance = Math.random() * this.roamRadius;
    this.destination = this.homePosition
      .clone()
      .add(
        new Vector3(Math.cos(angle) * distance, 0, Math.sin(angle) * distance)
      );
    if (this.character.scene) {
      this.destination.y = getTerrainHeight(
        this.character.scene,
        this.destination.x,
        this.destination.z
      );
    }
    this.target = null;
    this.targetAction = null;
    this.message = null;
    this.currentIntent = "Exploring";
  }

  // Updated setActionFromAPI
  setActionFromAPI(actionData: {
    action: string;
    object_id?: string;
    target_id?: string;
    message?: string;
    intent: string;
  }): void {
    const { action, object_id, target_id, message, intent } = actionData;
    this.currentIntent = intent || "Thinking...";
    this.character.updateIntentDisplay(`${this.currentIntent}`);

    // Reset action-specific properties
    this.destination = null;
    this.targetResource = null;
    this.target = null;
    this.targetAction = null;
    this.message = null;

    if (action === "idle") {
      this.aiState = "idle";
    } else if (action === "roam") {
      this.aiState = "roaming";
      const angle = Math.random() * Math.PI * 2;
      const distance = Math.random() * this.roamRadius;
      this.destination = this.homePosition
        .clone()
        .add(
          new Vector3(Math.cos(angle) * distance, 0, Math.sin(angle) * distance)
        );
      if (this.character.scene) {
        this.destination.y = getTerrainHeight(
          this.character.scene,
          this.destination.x,
          this.destination.z
        );
      }
    } else if (action === "gather" && object_id) {
      const targetObject = this.character.scene?.children.find(
        (child) =>
          child.userData.id === object_id &&
          child.userData.isInteractable &&
          child.visible
      );
      if (
        targetObject &&
        this.observation?.nearbyObjects.some((o) => o.id === object_id)
      ) {
        this.targetResource = targetObject;
        this.aiState = "movingToResource";
      } else {
        this.currentIntent += ` (couldn't find object ${object_id})`;
        this.aiState = "idle";
      }
    } else if (
      (action === "moveTo" ||
        action === "attack" ||
        action === "heal" ||
        action === "chat") &&
      target_id
    ) {
      let targetPos: Vector3 | null = null;
      let targetEntity: Entity | null = null;

      if (target_id.toLowerCase() === "home") {
        targetPos = this.homePosition.clone();
      } else {
        targetEntity =
          this.character.game?.entities.find((e) => e.id === target_id) || null;
        // Ensure target exists, is nearby, and is not dead (unless action allows targeting dead)
        if (
          targetEntity &&
          targetEntity.mesh &&
          this.observation?.nearbyCharacters.some((c) => c.id === target_id) &&
          !targetEntity.isDead
        ) {
          targetPos = targetEntity.mesh.position.clone();
        } else if (targetEntity && targetEntity.isDead) {
          this.currentIntent += ` (target ${target_id} is dead)`;
          targetEntity = null; // Don't target dead entities for most actions
        } else {
          this.currentIntent += `(couldn't find valid target ${target_id})`;
          console.warn(`couldn't find valid target ${target_id}`);
          targetEntity = null; // Target not valid
        }
      }

      if (targetPos) {
        this.destination = targetPos;
        if (this.character.scene) {
          // Adjust Y for terrain height if moving to a position, not an entity
          if (!targetEntity) {
            this.destination.y = getTerrainHeight(
              this.character.scene,
              this.destination.x,
              this.destination.z
            );
          }
        }

        if (action === "moveTo") {
          this.aiState = "roaming"; // Just moving to a location/entity
        } else if (targetEntity) {
          // Only set action states if we have a valid entity target
          this.aiState = "movingToTarget";
          this.target = targetEntity;
          this.targetAction = action;
          if (action === "chat") {
            this.message = message || "..."; // Use provided message or default
          }
        } else {
          // Target position valid, but entity invalid for action, just move there
          this.aiState = "roaming";
        }
      } else {
        // No valid target position found
        this.currentIntent += ` (invalid target ${target_id})`;
        this.aiState = "idle";
      }
    } else {
      console.log(
        `AI (${this.character.name}) action not recognized or missing parameters: "${action}", defaulting to idle.`
      );
      this.aiState = "idle";
    }

    // Log the decided action
    if (this.character.game) {
      let actionMessage = "";
      if (action === "idle") actionMessage = "idle";
      else if (action === "roam") actionMessage = "roam";
      else if (action === "gather" && object_id)
        actionMessage = `gather from ${object_id}`;
      else if (action === "moveTo" && target_id)
        actionMessage = `move to ${target_id}`;
      else if (action === "attack" && target_id)
        actionMessage = `attack ${target_id}`;
      else if (action === "heal" && target_id)
        actionMessage = `heal ${target_id}`;
      else if (action === "chat" && target_id)
        actionMessage = `chat with ${target_id}`;
      else actionMessage = action; // Fallback

      const messageLog = `${this.character.name} decided to ${actionMessage} because: ${intent}`;
      this.character.game.logEvent(
        this.character,
        "decide_action",
        messageLog,
        this.target || undefined, // Log the entity target if available
        { action, object_id, target_id, message, intent },
        this.character.mesh!.position
      );
    }
  }
}

// File: /src/entities.ts

export class Entity {
  id: string;
  mesh: Group | null;
  scene: Scene | null;
  name: string;
  velocity: Vector3;
  boundingBox: Box3;
  health: number;
  maxHealth: number;
  isDead: boolean;
  userData: EntityUserData;
  game: Game | null = null;
  intentCanvas: HTMLCanvasElement | null = null;
  intentContext: CanvasRenderingContext2D | null = null;
  intentTexture: CanvasTexture | null = null;
  intentSprite: Sprite | null = null;
  nameCanvas: HTMLCanvasElement | null = null;
  nameContext: CanvasRenderingContext2D | null = null;
  nameTexture: CanvasTexture | null = null;
  nameSprite: Sprite | null = null;
  aiController: AIController | null = null;
  rayCaster: Raycaster | null = null;

  constructor(scene: Scene, position: Vector3, name: string = "Entity") {
    this.id = `${name}_${getNextEntityId()}`;
    this.scene = scene;
    this.name = name;
    this.mesh = new Group();
    this.mesh.position.copy(position);
    this.velocity = new Vector3();
    this.boundingBox = new Box3();
    this.health = 100;
    this.maxHealth = 100;
    this.isDead = false;

    this.userData = {
      entityReference: this,
      isEntity: true,
      isPlayer: false,
      isNPC: false,
      isCollidable: true,
      isInteractable: true,
      id: this.id,
    };
    if (this.mesh) {
      this.mesh.userData = this.userData;
      this.mesh.name = this.name;
      this.scene.add(this.mesh);
    }
  }

  update(deltaTime: number, options: UpdateOptions = {}): void {}

  initNameDisplay(): void {
    if (this.userData.isPlayer) return;

    if (!this.nameCanvas) {
      this.nameCanvas = document.createElement("canvas");
      this.nameCanvas.width = 200;
      this.nameCanvas.height = 30; // Smaller height for name
      this.nameContext = this.nameCanvas.getContext("2d")!;
      this.nameTexture = new CanvasTexture(this.nameCanvas);
    }

    if (!this.nameSprite) {
      const material = new SpriteMaterial({ map: this.nameTexture });
      this.nameSprite = new Sprite(material);
      const aspectRatio = this.nameCanvas.width / this.nameCanvas.height;
      this.nameSprite.scale.set(aspectRatio * 0.3, 0.3, 1); // Smaller scale than intent
      this.nameSprite.position.set(0, CHARACTER_HEIGHT + 0.15, 0); // Below intent display
      this.mesh!.add(this.nameSprite);
    }

    this.updateNameDisplay(this.name);
  }
  updateNameDisplay(name: string): void {
    if (!this.nameContext || !this.nameCanvas || !this.nameTexture) return;

    const ctx = this.nameContext;
    const canvas = this.nameCanvas;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.font = "16px Arial";
    ctx.fillStyle = "blue";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(name, canvas.width / 2, canvas.height / 2);

    this.nameTexture.needsUpdate = true;
  }

  initIntentDisplay(): void {
    this.rayCaster = new Raycaster();
    if (this.game?.camera) {
      this.rayCaster.camera = this.game.camera;
    }

    if (!this.intentCanvas) {
      this.intentCanvas = document.createElement("canvas");
      this.intentCanvas.width = 200;
      this.intentCanvas.height = 70;
      this.intentContext = this.intentCanvas.getContext("2d")!;
      this.intentTexture = new CanvasTexture(this.intentCanvas);
    }

    if (!this.intentSprite) {
      const material = new SpriteMaterial({ map: this.intentTexture });
      this.intentSprite = new Sprite(material);
      const aspectRatio = this.intentCanvas.width / this.intentCanvas.height;
      this.intentSprite.scale.set(aspectRatio * 0.6, 0.6, 1);
      this.intentSprite.position.set(0, CHARACTER_HEIGHT + 0.6, 0);
      this.mesh!.add(this.intentSprite);
    }

    this.updateIntentDisplay("");
  }
  removeDisplays(): void {
    if (this.intentSprite && this.mesh) {
      this.mesh.remove(this.intentSprite);
      this.intentSprite = null;
    }
    if (this.nameSprite && this.mesh) {
      this.mesh.remove(this.nameSprite);
      this.nameSprite = null;
    }
  }

  updateIntentDisplay(text: string): void {
    if (!this.intentContext || !this.intentCanvas || !this.intentTexture)
      return;

    if (!text || text.trim() === "") {
      if (this.intentSprite) {
        this.intentSprite.visible = false;
      }
      return;
    } else {
      if (this.intentSprite) {
        this.intentSprite.visible = true;
      }
    }

    const ctx = this.intentContext;
    const canvas = this.intentCanvas;
    const maxWidth = canvas.width - 10; // Padding
    const lineHeight = 20; // Slightly more than font size
    const x = canvas.width / 2;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "rgba(0, 0, 0, 0.5)"; // Slightly darker background

    const borderRadius = 10; // Adjust this value to change the corner radius
    ctx.beginPath();
    ctx.roundRect(0, 0, canvas.width, canvas.height, borderRadius);
    ctx.fill();

    ctx.font = "13px Arial"; // Reduced font size
    ctx.fillStyle = "white";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    // Basic Text Wrapping Logic
    const words = text.split(" ");
    let lines = [];
    let currentLine = "";

    for (let i = 0; i < words.length; i++) {
      const testLine = currentLine + words[i] + " ";
      const metrics = ctx.measureText(testLine);
      const testWidth = metrics.width;
      if (testWidth > maxWidth && i > 0) {
        lines.push(currentLine.trim());
        currentLine = words[i] + " ";
      } else {
        currentLine = testLine;
      }
    }
    lines.push(currentLine.trim());

    // Calculate starting Y position for vertical centering
    const totalTextHeight = lines.length * lineHeight;
    let startY = (canvas.height - totalTextHeight) / 2 + lineHeight / 2;

    // Draw lines
    for (let i = 0; i < lines.length; i++) {
      // Prevent drawing too many lines if text is excessively long
      if (startY + i * lineHeight > canvas.height - lineHeight / 2) {
        // Optional: Indicate truncation if needed
        if (i > 0) {
          // Check if we drew at least one line
          const lastLineIndex = i - 1;
          const lastLineText = lines[lastLineIndex];
          // Remove last drawn line and replace with ellipsis
          ctx.clearRect(
            0,
            startY + lastLineIndex * lineHeight - lineHeight / 2,
            canvas.width,
            lineHeight
          );
          ctx.fillStyle = "rgba(0, 0, 0, 0.6)";
          ctx.fillRect(
            0,
            startY + lastLineIndex * lineHeight - lineHeight / 2,
            canvas.width,
            lineHeight
          );
          ctx.fillStyle = "white";
          ctx.fillText(
            lastLineText.substring(0, lastLineText.length - 1) + "...",
            x,
            startY + lastLineIndex * lineHeight
          );
        }
        break;
      }
      ctx.fillText(lines[i], x, startY + i * lineHeight);
    }

    this.intentTexture.needsUpdate = true;
  }

  showTemporaryMessage(message: string, duration: number = 7000): void {
    if (!this.intentSprite) return;
    const originalText = this.aiController
      ? `${this.name}: ${this.aiController.currentIntent}`
      : "";
    this.updateIntentDisplay(message);
    setTimeout(() => {
      // Check if the AI controller still exists and has an intent before resetting
      const currentIntentText = this.aiController
        ? `${this.name}: ${this.aiController.currentIntent}`
        : "";
      this.updateIntentDisplay(currentIntentText || originalText); // Fallback to original if no current intent
    }, duration);
  }

  updateBoundingBox(): void {
    if (!this.mesh) return;
    const height = this.userData.height ?? 1.8;
    const radius = this.userData.radius ?? 0.4;
    const center = this.mesh.position
      .clone()
      .add(new Vector3(0, height / 2, 0));
    const size = new Vector3(radius * 2, height, radius * 2);
    this.boundingBox.setFromCenterAndSize(center, size);
    this.userData.boundingBox = this.boundingBox;
  }

  setPosition(position: Vector3): void {
    if (!this.mesh) return;
    this.mesh.position.copy(position);
    this.updateBoundingBox();
  }

  lookAt(targetPosition: Vector3): void {
    if (!this.mesh) return;
    const target = targetPosition.clone();
    target.y = this.mesh.position.y;
    if (target.distanceToSquared(this.mesh.position) < 0.001) return;
    this.mesh.lookAt(target);
  }

  takeDamage(amount: number, attacker: Entity | null = null): void {
    if (this.isDead || amount <= 0) return;
    this.health = Math.max(0, this.health - amount);
    if (this.game) {
      // Log damage taken
      const message = `${this.name} took ${amount} damage${
        attacker ? ` from ${attacker.name}` : ""
      }.`;
      this.game.logEvent(
        this,
        "take_damage",
        message,
        attacker || undefined,
        { damage: amount },
        this.mesh!.position
      );
    }
    if (this.health <= 0) this.die(attacker);
  }

  heal(amount: number): void {
    if (this.isDead || amount <= 0 || this.health >= this.maxHealth) return;
    const actualHeal = Math.min(amount, this.maxHealth - this.health);
    this.health += actualHeal;
    // Logging for heal is handled by the healer (e.g., AIController, selfHeal, or an external ability)
  }

  die(attacker: Entity | null = null): void {
    if (this.isDead) return;
    this.isDead = true;
    this.velocity.set(0, 0, 0);
    this.health = 0;
    this.userData.isCollidable = false;
    this.userData.isInteractable = false;
  }

  destroy(): void {
    if (!this.mesh || !this.scene) return;
    this.mesh.traverse((child) => {
      if (child instanceof Mesh) {
        child.geometry?.dispose();
        if (Array.isArray(child.material)) {
          child.material.forEach((mat: Material) => mat?.dispose());
        } else {
          (child.material as Material)?.dispose();
        }
      }
    });
    this.scene.remove(this.mesh);
    this.mesh = null;
    this.scene = null;
    this.userData.entityReference = null;
  }
}

const CHARACTER_HEIGHT = 1.8;
const CHARACTER_RADIUS = 0.4;

export class Character extends Entity {
  maxStamina: number;
  stamina: number;
  walkSpeed: number;
  runSpeed: number;
  jumpForce: number;
  staminaDrainRate: number;
  staminaRegenRate: number;
  staminaJumpCost: number;
  canJump: boolean;
  isSprinting: boolean;
  isExhausted: boolean;
  exhaustionThreshold: number;
  moveState: MoveState;
  gravity: number;
  isOnGround: boolean;
  groundCheckDistance: number;
  lastVelocityY: number;
  eventLog: EventLog;
  mixer: AnimationMixer;
  idleAction?: AnimationAction;
  walkAction?: AnimationAction;
  runAction?: AnimationAction;
  jumpAction?: AnimationAction;
  attackAction?: AnimationAction; // Can be used for heal animation too
  isGathering: boolean = false;
  gatherAttackTimer: number = 0;
  gatherAttackInterval: number = 1.0;
  searchRadius: number = 30;
  roamRadius: number = 10;
  attackTriggered: boolean = false;
  inventory: Inventory | null;
  game: Game | null = null;
  persona: string = "";
  aiController: AIController | null = null;
  currentAction?: AnimationAction;

  actionType: string = "none"; // 'attack', 'heal', 'gather' etc.
  isPerformingAction: boolean = false;

  private groundCheckOrigin = new Vector3();
  private groundCheckDirection = new Vector3(0, -1, 0);

  constructor(
    scene: Scene,
    position: Vector3,
    name: string,
    model: Group,
    animations: AnimationClip[],
    inventory: Inventory | null
  ) {
    super(scene, position, name);
    this.userData.isCollidable = true;
    this.userData.isInteractable = true;
    this.userData.interactionType = "talk";
    this.userData.isNPC = true;
    this.maxHealth = 100;
    this.health = this.maxHealth;
    this.maxStamina = 100;
    this.stamina = this.maxStamina;
    this.walkSpeed = 4.0;
    this.runSpeed = 8.0;
    this.jumpForce = 8.0;
    this.staminaDrainRate = 15;
    this.staminaRegenRate = 10;
    this.staminaJumpCost = 10;
    this.canJump = false;
    this.isSprinting = false;
    this.isExhausted = false;
    this.exhaustionThreshold = 20;
    this.moveState = {
      forward: 0,
      right: 0,
      jump: false,
      sprint: false,
      interact: false,
      attack: false,
    };
    this.gravity = -25;
    this.isOnGround = false;
    this.groundCheckDistance = 0.15;
    this.lastVelocityY = 0;
    this.inventory = inventory;
    this.eventLog = new EventLog(50);
    const box = new Box3().setFromObject(model);
    const currentHeight = box.max.y - box.min.y;
    const scale = CHARACTER_HEIGHT / currentHeight;
    model.scale.set(scale, scale, scale);
    model.position.y = -box.min.y * scale;
    this.mesh!.add(model);
    this.mixer = new AnimationMixer(model);
    const idleAnim = animations.find(
      (anim) => anim.name.toLowerCase().includes("idled") // idled not idle
    );
    if (idleAnim) this.idleAction = this.mixer.clipAction(idleAnim);
    const walkAnim = animations.find((anim) =>
      anim.name.toLowerCase().includes("walk")
    );
    if (walkAnim) this.walkAction = this.mixer.clipAction(walkAnim);
    const runAnim = animations.find((anim) =>
      anim.name.toLowerCase().includes("run")
    );
    if (runAnim) this.runAction = this.mixer.clipAction(runAnim);
    const jumpAnim = animations.find((anim) =>
      anim.name.toLowerCase().includes("jump")
    );
    if (jumpAnim) {
      this.jumpAction = this.mixer.clipAction(jumpAnim);
      this.jumpAction.setLoop(LoopOnce, 1);
      this.jumpAction.clampWhenFinished = true;
    }
    const attackAnim = animations.find((anim) =>
      anim.name.toLowerCase().includes("attack")
    );
    if (attackAnim) {
      this.attackAction = this.mixer.clipAction(attackAnim);
      this.attackAction.setLoop(LoopOnce, 1);
      this.attackAction.clampWhenFinished = true;
    }
    if (this.idleAction) {
      this.switchAction(this.idleAction); // Set initial action with fading
    }
    this.userData.height = CHARACTER_HEIGHT;
    this.userData.radius = CHARACTER_RADIUS;
    this.updateBoundingBox();

    // Updated mixer listener
    this.mixer.addEventListener("finished", (e) => {
      if (e.action === this.attackAction) {
        if (this.actionType === "attack") {
          this.performAttack();
        } else if (this.actionType === "heal") {
          // Heal logic already applied in selfHeal
        }
        this.isPerformingAction = false;
        this.actionType = "none";
        const isMoving =
          Math.abs(this.moveState.forward) > 0.1 ||
          Math.abs(this.moveState.right) > 0.1;
        let targetAction: AnimationAction | undefined;
        if (isMoving) {
          targetAction =
            this.isSprinting && this.runAction
              ? this.runAction
              : this.walkAction;
        } else {
          targetAction = this.idleAction;
        }
        this.switchAction(targetAction);
      } else if (e.action === this.jumpAction) {
        // Handled in updateAnimations
      }
    });

    if (this.userData.isNPC) {
      this.aiController = new AIController(this);
    }
  }
  switchAction(newAction: AnimationAction | undefined): void {
    if (newAction === this.currentAction) {
      if (newAction && !newAction.isRunning()) newAction.play();
      return;
    }
    if (this.currentAction) {
      this.currentAction.fadeOut(0.2); // Fade out current animation over 0.2 seconds
    }
    if (newAction) {
      newAction.reset().fadeIn(0.1).play(); // Fade in new animation
    }
    this.currentAction = newAction;
  }

  performAttack(): void {
    const range = 2.0;
    const damage = this.name === "Player" ? 10 : 5;
    if (!this.rayCaster || !this.mesh || !this.scene || !this.game) return;

    const rayOrigin = this.mesh.position
      .clone()
      .add(new Vector3(0, CHARACTER_HEIGHT / 2, 0));
    const rayDirection = this.mesh.getWorldDirection(new Vector3());
    this.rayCaster.set(rayOrigin, rayDirection);
    this.rayCaster.far = range;

    const potentialTargets = this.game.entities.filter(
      (entity): entity is Character =>
        entity instanceof Character &&
        entity !== this &&
        !entity.isDead &&
        entity.mesh !== null
    );
    const targetMeshes = potentialTargets.map((char) => char.mesh!);
    const intersects = this.rayCaster.intersectObjects(targetMeshes, true);

    if (intersects.length > 0) {
      for (const hit of intersects) {
        let hitObject = hit.object;
        let targetEntity: Character | null = null;
        while (hitObject) {
          if (hitObject.userData?.entityReference instanceof Character) {
            targetEntity = hitObject.userData.entityReference;
            break;
          }
          if (!hitObject.parent) break;
          hitObject = hitObject.parent;
        }
        if (targetEntity && targetEntity !== this && !targetEntity.isDead) {
          targetEntity.takeDamage(damage, this);
          this.game.spawnParticleEffect(hit.point, "red");
          break;
        }
      }
    }
  }

  selfHeal(): void {
    if (
      this.isDead ||
      this.isPerformingAction ||
      this.health >= this.maxHealth
    ) {
      if (this.health >= this.maxHealth) {
        this.game?.logEvent(
          this,
          "heal_fail",
          `${this.name} is already at full health.`,
          undefined,
          {},
          this.mesh!.position
        );
      }
      return;
    }

    const healAmount = 25; // Amount to heal
    const actualHeal = Math.min(healAmount, this.maxHealth - this.health);

    if (actualHeal > 0) {
      this.heal(actualHeal); // Apply the heal immediately

      // Log the event
      if (this.game) {
        this.game.logEvent(
          this,
          "self_heal",
          `${this.name} healed for ${actualHeal} health.`,
          undefined,
          { amount: actualHeal },
          this.mesh!.position
        );
        // Spawn heal particles at character's feet/center
        this.game.spawnParticleEffect(
          this.mesh!.position.clone().add(
            new Vector3(0, CHARACTER_HEIGHT / 2, 0)
          ),
          "green"
        );
      }

      // Trigger the heal animation (using attackAction slot for now)
      this.triggerAction("heal");
    }
  }

  handleStamina(deltaTime: number): void {
    const isMoving = this.moveState.forward !== 0 || this.moveState.right !== 0;
    this.isSprinting =
      this.moveState.sprint &&
      isMoving &&
      !this.isExhausted &&
      this.stamina > 0;
    if (this.isSprinting) {
      this.stamina -= this.staminaDrainRate * deltaTime;
      if (this.stamina <= 0) {
        this.stamina = 0;
        this.isExhausted = true;
        this.isSprinting = false;
        if (this.game)
          this.game.logEvent(
            this,
            "exhausted",
            `${this.name} is exhausted!`,
            undefined,
            {},
            this.mesh!.position
          );
      }
    } else {
      let regenRate = this.staminaRegenRate;
      if (this.isExhausted) {
        regenRate /= 2;
        if (this.stamina >= this.exhaustionThreshold) {
          this.isExhausted = false;
          if (this.game)
            this.game.logEvent(
              this,
              "recovered",
              `${this.name} feels recovered.`,
              undefined,
              {},
              this.mesh!.position
            );
        }
      }
      this.stamina = Math.min(
        this.maxStamina,
        this.stamina + regenRate * deltaTime
      );
    }
  }

  handleMovement(deltaTime: number): void {
    const forward = new Vector3(0, 0, 1).applyQuaternion(this.mesh!.quaternion);
    const right = new Vector3(1, 0, 0).applyQuaternion(this.mesh!.quaternion);
    const moveDirection = new Vector3(
      this.moveState.right,
      0,
      this.moveState.forward
    ).normalize();
    const moveVelocity = new Vector3()
      .addScaledVector(forward, moveDirection.z)
      .addScaledVector(right, moveDirection.x);
    const currentSpeed = this.isSprinting ? this.runSpeed : this.walkSpeed;
    if (moveDirection.lengthSq() > 0) {
      moveVelocity.normalize().multiplyScalar(currentSpeed);
    }
    this.velocity.x = moveVelocity.x;
    this.velocity.z = moveVelocity.z;
    if (
      this.moveState.jump &&
      this.canJump &&
      this.stamina >= this.staminaJumpCost
    ) {
      this.velocity.y = this.jumpForce;
      this.stamina -= this.staminaJumpCost;
      this.canJump = false;
      this.isOnGround = false;
      if (this.stamina <= 0 && !this.isExhausted) {
        this.isExhausted = true;
        if (this.game)
          this.game.logEvent(
            this,
            "exhausted",
            `${this.name} is exhausted!`,
            undefined,
            {},
            this.mesh!.position
          );
      }
      this.moveState.jump = false;
      this.switchAction(this.jumpAction); // Smooth transition to jump
      if (this.game)
        this.game.logEvent(
          this,
          "jump",
          `${this.name} jumped.`,
          undefined,
          {},
          this.mesh!.position
        );
    }
  }

  applyGravity(deltaTime: number): void {
    if (!this.isOnGround) {
      this.velocity.y += this.gravity * deltaTime;
    } else {
      this.velocity.y = Math.max(this.gravity * deltaTime, -0.1);
    }
  }

  checkGround(collidables: Object3D[]): void {
    this.groundCheckOrigin
      .copy(this.mesh!.position)
      .add(new Vector3(0, 0.1, 0));
    const rayLength = 0.1 + this.groundCheckDistance;
    if (!this.rayCaster) return;
    this.rayCaster.set(this.groundCheckOrigin, this.groundCheckDirection);
    this.rayCaster.far = rayLength;
    this.rayCaster.near = 0;

    const checkAgainst = collidables.filter(
      (obj) => obj !== this.mesh && obj?.userData?.isCollidable
    );
    const intersects = this.rayCaster.intersectObjects(checkAgainst, true);
    let foundGround = false;
    let groundY = -Infinity;
    if (intersects.length > 0) {
      for (const intersect of intersects) {
        if (intersect.distance > 0.01) {
          groundY = Math.max(groundY, intersect.point.y);
          foundGround = true;
        }
      }
    }
    const baseY = this.mesh!.position.y;
    const snapThreshold = 0.05;
    if (
      foundGround &&
      baseY <= groundY + this.groundCheckDistance + snapThreshold
    ) {
      if (!this.isOnGround && this.velocity.y <= 0) {
        this.mesh!.position.y = groundY;
        this.velocity.y = 0;
        this.isOnGround = true;
        this.canJump = true;
        // if (this.jumpAction?.isRunning()) this.jumpAction.stop();
      } else if (this.isOnGround) {
        this.mesh!.position.y = Math.max(this.mesh!.position.y, groundY);
      } else {
        this.isOnGround = false;
        this.canJump = false;
      }
    } else {
      this.isOnGround = false;
      this.canJump = false;
    }
  }

  updateAnimations(deltaTime: number): void {
    this.mixer.update(deltaTime);

    if (this.isGathering && this.attackAction) {
      this.gatherAttackTimer += deltaTime;
      if (this.gatherAttackTimer >= this.gatherAttackInterval) {
        this.switchAction(this.attackAction);
        this.gatherAttackTimer = 0;
      } else if (!this.attackAction.isRunning()) {
        this.switchAction(this.idleAction);
      }
    } else if (this.isPerformingAction && this.attackAction) {
      // Let action play; transition handled in 'finished' listener
    } else if (!this.isOnGround) {
      if (this.jumpAction && this.jumpAction.isRunning()) {
        // Let jumpAction continue
      } else {
        this.switchAction(this.idleAction); // Use idle as fallback in air
      }
    } else {
      const isMoving =
        Math.abs(this.moveState.forward) > 0.1 ||
        Math.abs(this.moveState.right) > 0.1;
      let targetAction: AnimationAction | undefined;
      if (isMoving) {
        targetAction =
          this.isSprinting && this.runAction ? this.runAction : this.walkAction;
      } else {
        targetAction = this.idleAction;
      }
      this.switchAction(targetAction);
    }
  }

  triggerAction(actionType: string): void {
    // Use attackAction for attack, heal, gather visual feedback
    if (this.attackAction && !this.isPerformingAction && !this.isGathering) {
      this.actionType = actionType;
      this.isPerformingAction = true; // Mark that an action animation is playing
      this.attackAction.reset().play();
      // Stop movement animations immediately when action starts
      if (this.idleAction?.isRunning()) this.idleAction.stop();
      if (this.walkAction?.isRunning()) this.walkAction.stop();
      if (this.runAction?.isRunning()) this.runAction.stop();
      if (this.jumpAction?.isRunning()) this.jumpAction.stop();
    } else if (actionType === "gather" && this.attackAction) {
      // Special case for gather, handled in updateAnimations
      this.actionType = actionType; // Set type, but let update handle looping anim
    }
  }

  update(deltaTime: number, options: UpdateOptions = {}): void {
    if (this.isDead) return;
    const { moveState, collidables } = options;
    if (!moveState || !collidables) {
      console.warn(`Missing moveState or collidables for ${this.name} update`);
      return;
    }
    this.moveState = moveState;
    this.handleStamina(deltaTime);
    if (!this.isPerformingAction && !this.isGathering) {
      this.handleMovement(deltaTime);
    } else {
      this.velocity.x = 0;
      this.velocity.z = 0;
    }
    this.applyGravity(deltaTime);
    this.mesh!.position.x += this.velocity.x * deltaTime;
    this.mesh!.position.z += this.velocity.z * deltaTime;
    this.checkGround(collidables);
    this.mesh!.position.y += this.velocity.y * deltaTime;

    if (moveState.attack && !this.attackTriggered) {
      this.attackTriggered = true;
      this.triggerAction("attack");
    } else if (!moveState.attack) {
      this.attackTriggered = false;
    }

    this.lastVelocityY = this.velocity.y;
    this.updateAnimations(deltaTime);
    this.updateBoundingBox();
  }

  die(attacker: Entity | null = null): void {
    if (this.isDead) return;
    super.die(attacker);
    if (this.aiController) this.aiController.aiState = "dead";
    this.isGathering = false;
    this.isPerformingAction = false;
    this.actionType = "none";
    if (this.game) {
      const message = `${this.name} has died!`;
      const details = attacker ? { killedBy: attacker.name } : {};
      this.game.logEvent(
        this,
        "death",
        message,
        undefined,
        details,
        this.mesh!.position
      );
      if (attacker instanceof Character) {
        const defeatMessage = `${attacker.name} defeated ${this.name}.`;
        this.game.logEvent(
          attacker,
          "defeat",
          defeatMessage,
          this.name,
          {},
          attacker.mesh!.position
        );
      }
    }
  }

  respawn(position: Vector3): void {
    this.setPosition(position);
    this.health = this.maxHealth * 0.75;
    this.stamina = this.maxStamina;
    this.velocity.set(0, 0, 0);
    this.isDead = false;
    this.isExhausted = false;
    this.isOnGround = false;
    this.canJump = false;
    this.lastVelocityY = 0;
    this.isGathering = false;
    this.gatherAttackTimer = 0;
    this.isPerformingAction = false;
    this.actionType = "none";
    this.attackTriggered = false;
    this.userData.isCollidable = true;
    this.userData.isInteractable = true;
    if (this.aiController) {
      this.aiController.aiState = "idle";
      this.aiController.previousAiState = "idle";
      this.aiController.destination = null;
      this.aiController.targetResource = null;
      this.aiController.target = null;
      this.aiController.targetAction = null;
      this.aiController.message = null;
    }

    if (this.idleAction) this.idleAction.reset().play();
    if (this.walkAction) this.walkAction.stop();
    if (this.runAction) this.runAction.stop();
    if (this.attackAction) this.attackAction.stop();
    if (this.jumpAction) this.jumpAction.stop();

    if (this.game)
      this.game.logEvent(
        this,
        "respawn",
        `${this.name} feels slightly disoriented but alive.`,
        undefined,
        {},
        position
      );
    this.updateBoundingBox();
  }

  interact(player: Character): InteractionResult | null {
    this.lookAt(player.mesh!.position);
    if (this.game)
      this.game.logEvent(
        player,
        "interact_start",
        `Started interacting with ${this.name}.`,
        this,
        {},
        player.mesh!.position
      );
    return { type: "chat" }; // Signal to InteractionSystem to open chat UI
  }
}

// File: /src/mobileControls.ts
export class MobileControls {
  private game: Game;
  private controls: Controls;
  private moveJoystick: Joystick | null = null;
  // private cameraJoystick: Joystick | null = null; // Removed
  private moveManager: JoystickManager | null = null; // Store manager instance
  // private cameraManager: JoystickManager | null = null; // Removed
  private moveVector = new Vector2(0, 0);
  // private cameraVector = new Vector2(0, 0); // Removed - will calculate delta directly

  // Touch camera control state
  private isDraggingCamera: boolean = false;
  private lastTouchPosition = new Vector2(0, 0);
  private cameraRotationDelta = new Vector2(0, 0); // Stores delta calculated from touchmove
  private currentTouchId: number | null = null;
  private gameContainer: HTMLElement | null = null;
  private moveZoneElement: HTMLElement | null = null; // Cache move zone element

  private interactButton: HTMLElement | null = null;
  private attackButton: HTMLElement | null = null;
  private inventoryButton: HTMLElement | null = null;
  private journalButton: HTMLElement | null = null;

  private attackHeld: boolean = false;
  private interactPressed: boolean = false;

  // Bound event handlers for removal
  private boundHandleCameraTouchStart: (event: TouchEvent) => void;
  private boundHandleCameraTouchMove: (event: TouchEvent) => void;
  private boundHandleCameraTouchEnd: (event: TouchEvent) => void;

  constructor(game: Game, controls: Controls) {
    this.game = game;
    this.controls = controls;

    // Bind handlers
    this.boundHandleCameraTouchStart = this.handleCameraTouchStart.bind(this);
    this.boundHandleCameraTouchMove = this.handleCameraTouchMove.bind(this);
    this.boundHandleCameraTouchEnd = this.handleCameraTouchEnd.bind(this);

    if (!this.isMobile()) {
      console.log("Not a mobile device, skipping mobile controls setup.");
      document.getElementById("mobile-controls-layer")?.classList.add("hidden");
      return;
    }

    console.log("Setting up mobile controls.");
    this.gameContainer = document.getElementById("game-container");
    this.moveZoneElement = document.getElementById("joystick-zone-left"); // Cache element

    this.setupMoveJoystick(); // Renamed from setupJoysticks
    this.setupButtons();
    this.setupTouchCameraControls(); // New setup method
    document
      .getElementById("mobile-controls-layer")
      ?.classList.remove("hidden");
  }

  private isMobile(): boolean {
    const hasTouch = "ontouchstart" in window || navigator.maxTouchPoints > 0;
    const smallScreen = window.innerWidth < 768;
    return hasTouch || smallScreen;
  }

  private setupMoveJoystick(): void {
    // Renamed and simplified
    const moveZone = this.moveZoneElement; // Use cached element

    if (!moveZone) {
      console.error("Move joystick zone not found in HTML!");
      return;
    }

    const joystickSize = 100;

    const commonOptions: JoystickManagerOptions = {
      mode: "dynamic", // Static is often better for movement
      color: "rgba(255, 255, 255, 0.5)",
      fadeTime: 150,
      size: joystickSize,
      position: { left: "50%", top: "50%" }, // Center within the zone
      zone: moveZone, // Assign zone here
    };

    this.moveManager = nipplejs.create(commonOptions);

    const handleMove = (evt: EventData, nipple: JoystickOutputData) => {
      if (nipple.angle && nipple.force) {
        this.moveVector.set(
          Math.cos(nipple.angle.radian) * nipple.force,
          Math.sin(nipple.angle.radian) * nipple.force
        );
      } else {
        this.moveVector.set(0, 0);
      }
    };

    this.moveManager.on("start", handleMove);
    this.moveManager.on("move", handleMove);
    this.moveManager.on("end", () => {
      this.moveVector.set(0, 0);
    });

    this.moveJoystick = this.moveManager.get(this.moveManager.ids[0]);
  }

  private setupTouchCameraControls(): void {
    if (!this.gameContainer) {
      console.error("Game container not found for touch camera controls!");
      return;
    }
    console.log("Setting up touch camera listeners on game container.");
    this.gameContainer.addEventListener(
      "touchstart",
      this.boundHandleCameraTouchStart,
      { passive: false }
    );
    this.gameContainer.addEventListener(
      "touchmove",
      this.boundHandleCameraTouchMove,
      { passive: false }
    );
    this.gameContainer.addEventListener(
      "touchend",
      this.boundHandleCameraTouchEnd,
      { passive: false }
    );
    this.gameContainer.addEventListener(
      "touchcancel",
      this.boundHandleCameraTouchEnd, // Treat cancel like end
      { passive: false }
    );
  }

  private isPointInsideRect(x: number, y: number, rect: DOMRect): boolean {
    return (
      x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom
    );
  }

  private handleCameraTouchStart(event: TouchEvent): void {
    if (this.isDraggingCamera || !this.moveZoneElement) return; // Already dragging or move zone not found

    const touch = event.changedTouches[0]; // Get the first touch that changed state
    if (!touch) return;

    const touchX = touch.clientX;
    const touchY = touch.clientY;

    // Check if touch is inside the move joystick zone
    const moveZoneRect = this.moveZoneElement.getBoundingClientRect();
    if (this.isPointInsideRect(touchX, touchY, moveZoneRect)) {
      // console.log("Touch started inside move zone, ignoring for camera.");
      return;
    }

    // Check if touch is inside any button area
    const buttons = [
      this.interactButton,
      this.attackButton,
      this.inventoryButton,
      this.journalButton,
    ];
    for (const button of buttons) {
      if (button) {
        const buttonRect = button.getBoundingClientRect();
        if (this.isPointInsideRect(touchX, touchY, buttonRect)) {
          // console.log("Touch started inside button, ignoring for camera.");
          return;
        }
      }
    }

    // If touch is outside joystick zone and buttons, start camera drag
    // console.log("Starting camera drag");
    event.preventDefault(); // Prevent default actions like scrolling
    this.isDraggingCamera = true;
    this.currentTouchId = touch.identifier;
    this.lastTouchPosition.set(touchX, touchY);
    this.cameraRotationDelta.set(0, 0); // Reset delta on new touch start
  }

  private handleCameraTouchMove(event: TouchEvent): void {
    if (!this.isDraggingCamera || this.currentTouchId === null) return;

    // Find the touch that matches the one we started dragging with
    let currentTouch: Touch | null = null;
    for (let i = 0; i < event.changedTouches.length; i++) {
      if (event.changedTouches[i].identifier === this.currentTouchId) {
        currentTouch = event.changedTouches[i];
        break;
      }
    }

    if (!currentTouch) return; // Our touch didn't move

    event.preventDefault(); // Prevent scrolling during drag

    const touchX = currentTouch.clientX;
    const touchY = currentTouch.clientY;

    // Calculate delta movement since the last move event
    const deltaX = touchX - this.lastTouchPosition.x;
    const deltaY = touchY - this.lastTouchPosition.y;

    // Accumulate the delta for this frame's update
    this.cameraRotationDelta.x += deltaX * 8;
    this.cameraRotationDelta.y += deltaY * 8;

    // Update last touch position for the next move event
    this.lastTouchPosition.set(touchX, touchY);
    // console.log("Camera drag move:", this.cameraRotationDelta);
  }

  private handleCameraTouchEnd(event: TouchEvent): void {
    if (!this.isDraggingCamera || this.currentTouchId === null) return;

    // Check if the touch that ended/cancelled is the one we were tracking
    let touchEnded = false;
    for (let i = 0; i < event.changedTouches.length; i++) {
      if (event.changedTouches[i].identifier === this.currentTouchId) {
        touchEnded = true;
        break;
      }
    }

    if (touchEnded) {
      // console.log("Ending camera drag");
      event.preventDefault();
      this.isDraggingCamera = false;
      this.currentTouchId = null;
      // Don't reset cameraRotationDelta here, let the update loop consume it one last time
    }
  }

  private setupButtons(): void {
    this.interactButton = document.getElementById("button-interact");
    this.attackButton = document.getElementById("button-attack");
    this.inventoryButton = document.getElementById("button-inventory");
    this.journalButton = document.getElementById("button-journal");

    if (
      !this.interactButton ||
      !this.attackButton ||
      !this.inventoryButton ||
      !this.journalButton
    ) {
      console.error("Mobile action buttons not found in HTML!");
      return;
    }

    // --- Button Event Listeners (No changes needed here) ---
    // Interact Button (Tap)
    this.interactButton.addEventListener(
      "touchstart",
      (e) => {
        e.preventDefault();
        this.interactPressed = true;
        this.interactButton?.classList.add("active");
      },
      { passive: false }
    );
    this.interactButton.addEventListener(
      "touchend",
      (e) => {
        e.preventDefault();
        // interactPressed is reset in update after being consumed
        this.interactButton?.classList.remove("active");
      },
      { passive: false }
    );
    this.interactButton.addEventListener("mousedown", () => {
      // Desktop fallback
      this.interactPressed = true;
      this.interactButton?.classList.add("active");
    });
    this.interactButton.addEventListener("mouseup", () => {
      // Desktop fallback
      this.interactButton?.classList.remove("active");
    });

    // Attack Button (Hold)
    this.attackButton.addEventListener(
      "touchstart",
      (e) => {
        e.preventDefault();
        this.attackHeld = true;
        this.attackButton?.classList.add("active");
      },
      { passive: false }
    );
    this.attackButton.addEventListener(
      "touchend",
      (e) => {
        e.preventDefault();
        this.attackHeld = false;
        this.attackButton?.classList.remove("active");
      },
      { passive: false }
    );
    this.attackButton.addEventListener("mousedown", () => {
      // Desktop fallback
      this.attackHeld = true;
      this.attackButton?.classList.add("active");
    });
    this.attackButton.addEventListener("mouseup", () => {
      // Desktop fallback
      this.attackHeld = false;
      this.attackButton?.classList.remove("active");
    });

    // Inventory Button (Tap)
    this.inventoryButton.addEventListener(
      "touchstart",
      (e) => {
        e.preventDefault();
        this.inventoryButton?.classList.add("active");
      },
      { passive: false }
    );
    this.inventoryButton.addEventListener(
      "touchend",
      (e) => {
        e.preventDefault();
        this.inventoryButton?.classList.remove("active");
        if (this.game.interactionSystem?.isChatOpen) return;
        this.game.journalDisplay?.hide();
        this.game.inventoryDisplay?.toggle();
        this.game.setPauseState(this.game.inventoryDisplay?.isOpen ?? false);
      },
      { passive: false }
    );

    // Journal Button (Tap)
    this.journalButton.addEventListener(
      "touchstart",
      (e) => {
        e.preventDefault();
        this.journalButton?.classList.add("active");
      },
      { passive: false }
    );
    this.journalButton.addEventListener(
      "touchend",
      (e) => {
        e.preventDefault();
        this.journalButton?.classList.remove("active");
        if (this.game.interactionSystem?.isChatOpen) return;
        this.game.inventoryDisplay?.hide();
        this.game.journalDisplay?.toggle();
        this.game.setPauseState(this.game.journalDisplay?.isOpen ?? false);
      },
      { passive: false }
    );
  }

  update(deltaTime: number): void {
    if (!this.isMobile()) return;

    // --- Update Move State ---
    this.controls.moveState.forward = this.moveVector.y;
    this.controls.moveState.right = -this.moveVector.x; // Invert X for strafing

    this.controls.moveState.forward = Math.max(
      -1,
      Math.min(1, this.controls.moveState.forward)
    );
    this.controls.moveState.right = Math.max(
      -1,
      Math.min(1, this.controls.moveState.right)
    );
    this.controls.moveState.sprint = false;

    // --- Update Button States ---
    if (this.interactPressed) {
      this.controls.moveState.interact = true;
      this.interactPressed = false; // Consume the press
    } else {
      this.controls.moveState.interact = false; // Ensure it's false if not pressed
    }
    this.controls.moveState.attack = this.attackHeld;
    this.controls.moveState.jump = false;

    // --- Update Camera/Rotation from Touch Input ---
    // Sensitivity values might need significant tuning for touch
    const touchCameraSensitivity = 0.3; // Lower sensitivity for touch pixel delta
    const touchPlayerRotationSensitivity = 0.2; // Lower sensitivity for touch pixel delta

    if (this.cameraRotationDelta.lengthSq() > 0) {
      // Only rotate if there was movement
      if (this.controls.player && this.controls.player.mesh) {
        const yawDelta =
          -this.cameraRotationDelta.x *
          touchPlayerRotationSensitivity *
          deltaTime;
        this.controls.player.mesh.rotateY(yawDelta);
      }

      if (this.controls.cameraController) {
        const pitchDelta =
          -this.cameraRotationDelta.y *
          touchCameraSensitivity *
          deltaTime *
          100; // Keep multiplier for existing method scale
        this.controls.cameraController.handleMouseInput(0, pitchDelta);
      }

      // Reset delta *after* applying it for this frame
      this.cameraRotationDelta.set(0, 0);
    }
  }

  isActive(): boolean {
    return this.isMobile();
  }

  destroy(): void {
    this.moveManager?.destroy();

    // Remove touch listeners
    if (this.gameContainer) {
      this.gameContainer.removeEventListener(
        "touchstart",
        this.boundHandleCameraTouchStart
      );
      this.gameContainer.removeEventListener(
        "touchmove",
        this.boundHandleCameraTouchMove
      );
      this.gameContainer.removeEventListener(
        "touchend",
        this.boundHandleCameraTouchEnd
      );
      this.gameContainer.removeEventListener(
        "touchcancel",
        this.boundHandleCameraTouchEnd
      );
    }

    // TODO: Remove button event listeners if necessary (usually not needed if elements are removed/hidden)
    // If buttons remain but controls are destroyed, listeners should be removed.
    // Example (repeat for all buttons):
    // this.interactButton?.removeEventListener('touchstart', ...);
    // this.interactButton?.removeEventListener('touchend', ...);
  }
}

// File: /src/objects.ts

const treeTrunkMat = new MeshLambertMaterial({ color: Colors.PASTEL_BROWN });
const treeFoliageMat = new MeshLambertMaterial({ color: Colors.PASTEL_GREEN });
const rockMat = new MeshLambertMaterial({ color: Colors.PASTEL_GRAY });
const herbMat = new MeshLambertMaterial({ color: Colors.FOREST_GREEN });

export class InteractableObject {
  id: string;
  name: string;
  position: Vector3;
  interactionType: string;
  data: any;
  prompt: string;
  mesh: Mesh | Group | null;
  isActive: boolean;
  userData: EntityUserData;

  constructor(
    id: string,
    name: string,
    position: Vector3,
    interactionType: string,
    data: any,
    prompt: string,
    scene: Scene | null = null
  ) {
    this.id = id;
    this.name = name;
    this.position = position.clone();
    this.interactionType = interactionType;
    this.data = data;
    this.prompt = prompt;
    this.mesh = null;
    this.isActive = true;
    this.userData = {
      id: this.id,
      entityReference: this,
      isInteractable: true,
      interactionType: this.interactionType,
      prompt: this.prompt,
      data: this.data,
      isSimpleObject: true,
      isEntity: false,
      isPlayer: false,
      isNPC: false,
      isCollidable: false,
    };
  }

  // Updated interact method signature
  interact(player: Character): InteractionResult | null {
    if (!this.isActive) return { type: "error", message: "Already used." };
    let message = "";
    let action = "interact";
    let details: Record<string, any> = {};

    // Use player's inventory and game instance for logging
    const inventory = player.inventory;
    const game = player.game;

    if (!inventory || !game) {
      console.error(
        "Player inventory or game instance not found for interaction."
      );
      return { type: "error", message: "Internal error." };
    }

    switch (this.interactionType) {
      case "retrieve":
        const itemName = this.data as string;
        if (inventory.addItem(itemName, 1)) {
          message = `Picked up: ${itemName}`;
          action = "retrieve";
          details = { item: itemName, amount: 1 };
          this.removeFromWorld();
          game.logEvent(
            player,
            action,
            message,
            this.name,
            details,
            this.position
          );
          return {
            type: "item_retrieved",
            item: { name: itemName, amount: 1 },
          };
        } else {
          message = `Inventory is full. Cannot pick up ${itemName}.`;
          action = "retrieve_fail";
          details = { item: itemName };
          game.logEvent(
            player,
            action,
            message,
            this.name,
            details,
            this.position
          );
          return { type: "error", message: "Inventory full" };
        }
      case "read_sign":
        const signText =
          (this.data as string) || "The sign is worn and illegible.";
        message = `Read sign: "${signText}"`;
        action = "read";
        details = { text: signText };
        game.logEvent(
          player,
          action,
          message,
          this.name,
          details,
          this.position
        );
        return { type: "message", message: signText };
      default:
        message = `Looked at ${this.name}.`;
        action = "examine";
        game.logEvent(
          player,
          action,
          message,
          this.name,
          details,
          this.position
        );
        return { type: "message", message: "You look at the object." };
    }
  }

  removeFromWorld(): void {
    this.isActive = false;
    this.userData.isInteractable = false;
    if (this.mesh) {
      this.mesh.visible = false;
      this.userData.isCollidable = false;
    }
  }
}

export function createTree(position: Vector3): Group {
  const trunkHeight = randomFloat(3, 5);
  const trunkRadius = randomFloat(0.3, 0.5);
  const foliageHeight = trunkHeight * 1.2 + randomFloat(0, 1);
  const foliageRadius = trunkRadius * 3 + randomFloat(0, 1.5);
  const treeGroup = new Group();
  treeGroup.name = "Tree";
  const trunkGeo = new CylinderGeometry(
    trunkRadius * 0.8,
    trunkRadius,
    trunkHeight,
    8
  );
  const trunkMesh = new Mesh(trunkGeo, treeTrunkMat);
  trunkMesh.position.y = trunkHeight / 2;
  trunkMesh.castShadow = true;
  trunkMesh.receiveShadow = true;
  treeGroup.add(trunkMesh);
  const foliageGeo = new ConeGeometry(foliageRadius, foliageHeight, 6);
  const foliageMesh = new Mesh(foliageGeo, treeFoliageMat);
  foliageMesh.position.y = trunkHeight + foliageHeight / 3;
  foliageMesh.castShadow = true;
  treeGroup.add(foliageMesh);
  treeGroup.position.copy(position).setY(0);
  treeGroup.userData = {
    isCollidable: true,
    isInteractable: true,
    interactionType: "gather",
    resource: "wood",
    gatherTime: 3000,
    prompt: "Press E to gather Wood",
    isDepletable: true,
    respawnTime: 20000,
    entityReference: treeGroup,
    boundingBox: new Box3().setFromObject(treeGroup),
  };
  return treeGroup;
}

export function createRock(position: Vector3, size: number): Group {
  const rockGroup = new Group();
  rockGroup.name = "Rock";
  const height = size * randomFloat(0.5, 1.0);
  const geo = new BoxGeometry(size, height, size * randomFloat(0.8, 1.2));
  const mesh = new Mesh(geo, rockMat);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.rotation.set(
    randomFloat(-0.1, 0.1) * Math.PI,
    randomFloat(0, 2) * Math.PI,
    randomFloat(-0.1, 0.1) * Math.PI
  );
  rockGroup.add(mesh);
  rockGroup.position.copy(position).setY(0);
  rockGroup.userData = {
    isCollidable: true,
    isInteractable: true,
    interactionType: "gather",
    resource: "stone",
    gatherTime: 4000,
    prompt: "Press E to gather Stone",
    isDepletable: true,
    respawnTime: 30000,
    entityReference: rockGroup,
    boundingBox: new Box3().setFromObject(rockGroup),
  };
  return rockGroup;
}

export function createHerb(position: Vector3): Group {
  const herbGroup = new Group();
  herbGroup.name = "Herb Plant";
  const size = 0.25;
  const geo = new SphereGeometry(size, 5, 4);
  const mesh = new Mesh(geo, herbMat);
  mesh.castShadow = true;
  herbGroup.add(mesh);
  herbGroup.position.copy(position).setY(size);
  herbGroup.userData = {
    isCollidable: false,
    isInteractable: true,
    interactionType: "gather",
    resource: "herb",
    gatherTime: 1500,
    prompt: "Press E to gather Herb",
    isDepletable: true,
    respawnTime: 15000,
    entityReference: herbGroup,
    boundingBox: new Box3().setFromObject(herbGroup),
  };
  return herbGroup;
}

// File: /src/system.ts

export class InteractionSystem {
  player: Character;
  camera: PerspectiveCamera;
  interactableEntities: Array<any>;
  controls: Controls;
  inventory: Inventory;
  eventLog: EventLog; // Now references the current player's event log
  raycaster: Raycaster;
  interactionDistance: number = 3.0;
  aimTolerance: number = Math.PI / 6;
  currentTarget: any | null = null;
  currentTargetMesh: Object3D | null = null;
  interactionPromptElement: HTMLElement | null;
  activeGather: ActiveGather | null = null;
  promptTimeout: ReturnType<typeof setTimeout> | null = null;
  game: Game; // Added reference to the game instance

  // Chat UI elements
  chatContainer: HTMLElement | null;
  chatInput: HTMLInputElement | null;
  isChatOpen: boolean = false;
  chatTarget: Character | null = null;

  // Bound event handlers for chat
  boundSendMessage: (() => Promise<void>) | null = null;
  boundHandleChatKeyDown: ((e: KeyboardEvent) => void) | null = null;
  boundCloseChat: (() => void) | null = null; // Added bound close handler

  private cameraDirection = new Vector3();
  private objectDirection = new Vector3();
  private playerDirection = new Vector3();
  private objectPosition = new Vector3();

  constructor(
    player: Character,
    camera: PerspectiveCamera,
    interactableEntities: Array<any>,
    controls: Controls,
    inventory: Inventory,
    eventLog: EventLog,
    game: Game
  ) {
    // Added game parameter
    this.player = player;
    this.camera = camera;
    this.interactableEntities = interactableEntities;
    this.controls = controls;
    this.inventory = inventory;
    this.eventLog = eventLog; // Initial event log
    this.game = game; // Store game instance
    this.raycaster = new Raycaster();
    this.interactionPromptElement =
      document.getElementById("interaction-prompt");

    // Initialize chat UI elements
    this.chatContainer = document.getElementById("chat-container");
    this.chatInput = document.getElementById("chat-input") as HTMLInputElement;
  }

  update(deltaTime: number): void {
    // Don't update interaction system if chat is open
    if (this.isChatOpen) {
      // Optionally hide interaction prompt while chatting
      if (this.interactionPromptElement?.style.display !== "none") {
        this.hidePrompt();
      }
      return;
    }

    if (this.activeGather) {
      const moved = this.player.velocity.lengthSq() * deltaTime > 0.001;
      if (moved || this.controls.consumeInteraction()) {
        this.cancelGatherAction();
        return;
      }
      this.updateGatherAction(deltaTime);
      return;
    }
    const targetInfo = this.findInteractableTarget();
    if (targetInfo?.instance?.userData?.isInteractable) {
      if (this.currentTarget !== targetInfo.instance) {
        this.currentTarget = targetInfo.instance;
        this.currentTargetMesh = targetInfo.mesh;
        this.showPrompt(
          targetInfo.instance.userData.prompt ||
            (this.game.mobileControls?.isActive()
              ? "Tap Interact"
              : "Press E to interact") // Mobile specific prompt
        );
      }
      if (this.controls.consumeInteraction())
        this.tryInteract(this.currentTarget);
    } else if (this.currentTarget) {
      this.currentTarget = null;
      this.currentTargetMesh = null;
      this.hidePrompt();
    }
  }

  findInteractableTarget(): TargetInfo | null {
    // On mobile, prioritize nearby check over raycasting from center screen?
    // Or keep raycasting as primary? Let's keep raycasting for now.
    // if (this.game.mobileControls?.isActive()) {
    //     return this.findNearbyInteractable();
    // }

    this.raycaster.setFromCamera(new Vector2(0, 0), this.camera);
    this.raycaster.far = this.interactionDistance;
    const playerPosition = this.player.mesh!.position;
    const meshesToCheck = this.interactableEntities
      .map((item) => (item as any).mesh ?? item)
      .filter((mesh): mesh is Object3D => {
        if (
          !(mesh instanceof Object3D) ||
          !mesh.userData?.isInteractable ||
          !mesh.visible
        )
          return false;
        // Exclude dead characters unless interaction allows it
        const entityRef = mesh.userData?.entityReference;
        if (entityRef instanceof Character && entityRef.isDead) return false;
        const distSq = playerPosition.distanceToSquared(mesh.position);
        return distSq < 100; // Only check objects within 10 units (10^2 = 100)
      });
    let closestHit: TargetInfo | null = null;
    const intersects = this.raycaster.intersectObjects(meshesToCheck, true);
    if (intersects.length > 0) {
      for (const intersect of intersects) {
        let hitObject: Object3D | null = intersect.object;
        let rootInstance: any | null = null;
        let rootMesh: Object3D | null = null;
        while (hitObject) {
          if (
            hitObject.userData?.isInteractable &&
            hitObject.userData?.entityReference
          ) {
            rootInstance = hitObject.userData.entityReference;
            rootMesh = hitObject;
            break;
          }
          if (
            hitObject.userData?.isInteractable &&
            hitObject.userData?.isSimpleObject
          ) {
            rootInstance =
              this.interactableEntities.find(
                (e) => (e as any).mesh === hitObject
              ) || hitObject.userData?.entityReference;
            rootMesh = hitObject;
            break;
          }
          hitObject = hitObject.parent;
        }
        if (rootInstance && rootMesh && rootInstance.userData?.isInteractable) {
          // Check if the root instance is a dead character
          if (rootInstance instanceof Character && rootInstance.isDead)
            continue;

          this.objectDirection
            .copy(intersect.point)
            .sub(this.camera.position)
            .normalize();
          this.camera.getWorldDirection(this.cameraDirection);
          const angle = this.cameraDirection.angleTo(this.objectDirection);
          if (angle < this.aimTolerance) {
            closestHit = {
              mesh: rootMesh,
              instance: rootInstance,
              point: intersect.point,
              distance: intersect.distance,
            };
            break;
          }
        }
      }
    }
    // Fallback to nearby check if raycast fails or on mobile?
    // Let's always fallback for now.
    return closestHit || this.findNearbyInteractable();
  }

  findNearbyInteractable(): TargetInfo | null {
    const playerPosition = this.player.mesh!.getWorldPosition(new Vector3());
    let closestDistSq = this.interactionDistance * this.interactionDistance;
    let closestInstance: any | null = null;
    this.interactableEntities.forEach((item) => {
      if (
        !item?.userData?.isInteractable ||
        item === this.player ||
        item === this.player.mesh
      )
        return; // Check against player and player mesh
      // Exclude dead characters
      if (item instanceof Character && item.isDead) return;
      if (
        item.userData?.isSimpleObject &&
        !(item as InteractableObject).isActive
      )
        return;

      const objMesh = (item as any).mesh ?? item;
      if (!objMesh || !objMesh.visible) return;
      this.objectPosition.copy(objMesh.getWorldPosition(new Vector3()));
      const distSq = playerPosition.distanceToSquared(this.objectPosition);
      if (distSq < closestDistSq) {
        this.player.mesh!.getWorldDirection(this.playerDirection);
        this.objectDirection
          .copy(this.objectPosition)
          .sub(playerPosition)
          .normalize();
        const angle = this.playerDirection.angleTo(this.objectDirection);
        if (angle < Math.PI / 2.5) {
          closestDistSq = distSq;
          closestInstance = item;
        }
      }
    });
    if (closestInstance) {
      const mesh = (closestInstance as any).mesh ?? closestInstance;
      this.objectPosition.copy(mesh.getWorldPosition(new Vector3()));
      return {
        mesh,
        instance: closestInstance,
        point: this.objectPosition.clone(),
        distance: this.player.mesh!.position.distanceTo(this.objectPosition),
      };
    }
    return null;
  }

  tryInteract(targetInstance: any): void {
    if (!targetInstance || !targetInstance.userData?.isInteractable) return;
    // Check if target is dead
    if (targetInstance instanceof Character && targetInstance.isDead) {
      this.showPrompt("Cannot interact with the deceased.", 2000);
      return;
    }

    let targetPosition: Vector3;
    const targetMesh = (targetInstance as any).mesh ?? targetInstance;
    if (targetMesh instanceof Object3D) {
      targetPosition = targetMesh.position;
    } else {
      console.warn("Target instance has no mesh or position", targetInstance);
      return;
    }

    const distance = this.player.mesh!.position.distanceTo(targetPosition);
    if (distance > this.interactionDistance * 1.1) {
      this.currentTarget = null;
      this.currentTargetMesh = null;
      this.hidePrompt();
      return;
    }
    let result: InteractionResult | null = null;
    if (typeof targetInstance.interact === "function") {
      result = targetInstance.interact(this.player); // Pass only player
    } else if (
      targetInstance.userData.interactionType === "gather" &&
      targetInstance.userData.resource
    ) {
      this.startGatherAction(targetInstance);
      result = { type: "gather_start" };
    } else {
      const message = `Examined ${targetInstance.name || "object"}.`;
      if (this.player.game)
        this.player.game.logEvent(
          this.player,
          "examine",
          message,
          targetInstance.name || targetInstance.id,
          {},
          targetPosition
        );
      result = { type: "message", message: "You look at the object." };
    }
    if (result) this.handleInteractionResult(result, targetInstance);
    if (
      result?.type !== "gather_start" &&
      !targetInstance.userData?.isInteractable
    ) {
      this.currentTarget = null;
      this.currentTargetMesh = null;
    }
  }

  // Updated handleInteractionResult
  handleInteractionResult(
    result: InteractionResult,
    targetInstance: any
  ): void {
    let promptDuration: number | null = 2000;
    let promptText: string | null = null;

    switch (result.type) {
      case "reward":
        if (result.item) {
          promptText =
            result.message ||
            `Received ${result.item.amount} ${result.item.name}.`;
          promptDuration = 3000;
        } else if (result.message) {
          promptText = result.message;
          promptDuration = 3000;
        }
        break;
      case "message":
        if (result.message) promptText = result.message;
        break;
      case "dialogue": // Keep dialogue for potential future use or simple interactions
        if (result.text) {
          promptText = `${targetInstance.name ?? "NPC"}: ${result.text}`;
          promptDuration = 4000;
          // Optionally handle options here if needed
        }
        break;
      case "chat": // Handle the new chat type
        if (targetInstance instanceof Character) {
          this.openChatInterface(targetInstance);
          promptDuration = null; // Don't show prompt, open UI instead
        } else {
          promptText = "Cannot chat with this.";
        }
        break;
      case "item_retrieved":
        promptDuration = null; // No prompt needed, log handles it
        break;
      case "error":
        if (result.message) promptText = result.message;
        break;
      case "gather_start":
        promptDuration = null; // Gather prompt handled separately
        break;
    }
    if (promptText && promptDuration !== null)
      this.showPrompt(promptText, promptDuration);
  }

  startGatherAction(targetInstance: any): void {
    if (this.activeGather) return;
    const resource = targetInstance.userData.resource as string;
    const gatherTime = (targetInstance.userData.gatherTime as number) || 2000;
    this.activeGather = {
      targetInstance,
      startTime: performance.now(),
      duration: gatherTime,
      resource,
    };
    this.showPrompt(`Gathering ${resource}... (0%)`);
    // Log gather start event
    if (this.player.game)
      this.player.game.logEvent(
        this.player,
        "gather_start",
        `Started gathering ${resource}...`,
        targetInstance.name || targetInstance.id,
        { resource },
        this.player.mesh!.position
      );
    this.player.velocity.x = 0;
    this.player.velocity.z = 0;
    this.player.isGathering = true; // Set gathering state
    this.player.gatherAttackTimer = 0; // Reset timer
    if (this.player.attackAction) {
      this.player.triggerAction("gather"); // Use triggerAction
    }
  }

  updateGatherAction(deltaTime: number): void {
    if (!this.activeGather) return;
    const elapsedTime = performance.now() - this.activeGather.startTime;
    const progress = Math.min(1, elapsedTime / this.activeGather.duration);
    this.showPrompt(
      `Gathering ${this.activeGather.resource}... (${Math.round(
        progress * 100
      )}%)`
    );
    if (progress >= 1) this.completeGatherAction();
  }

  completeGatherAction(): void {
    if (!this.activeGather) return;
    const { resource, targetInstance } = this.activeGather;
    const targetName = targetInstance.name || targetInstance.id;
    const targetPosition = (targetInstance.mesh ?? targetInstance).position;

    if (this.inventory.addItem(resource, 1)) {
      // Log gather success event
      if (this.player.game)
        this.player.game.logEvent(
          this.player,
          "gather_complete",
          `Gathered 1 ${resource}.`,
          targetName,
          { resource },
          targetPosition
        );

      if (targetInstance.userData.isDepletable) {
        targetInstance.userData.isInteractable = false;
        const meshToHide = targetInstance.mesh ?? targetInstance;
        if (meshToHide instanceof Object3D) meshToHide.visible = false;

        const respawnTime = targetInstance.userData.respawnTime || 15000;
        setTimeout(() => {
          if (targetInstance.userData) {
            targetInstance.userData.isInteractable = true;
            if (meshToHide instanceof Object3D) meshToHide.visible = true;
            // Optional: Log respawn event
            // if (this.player.game) this.player.game.logEvent(this.player, 'respawn_object', `${targetName} respawned.`, targetName, {}, targetPosition);
          }
        }, respawnTime);
      } else if (
        targetInstance.userData.isSimpleObject &&
        typeof (targetInstance as InteractableObject).removeFromWorld ===
          "function"
      ) {
        (targetInstance as InteractableObject).removeFromWorld();
      }
    } else {
      // Log gather fail (inventory full) event
      if (this.player.game)
        this.player.game.logEvent(
          this.player,
          "gather_fail",
          `Inventory full, could not gather ${resource}.`,
          targetName,
          { resource },
          targetPosition
        );
    }
    this.player.isGathering = false; // Reset gathering state
    this.player.gatherAttackTimer = 0; // Reset timer
    this.player.isPerformingAction = false; // Also reset performing action if gather uses it
    this.player.actionType = "none";
    if (this.player.attackAction && this.player.attackAction.isRunning()) {
      this.player.attackAction.stop(); // Stop attack animation if it was running
      if (this.player.idleAction) this.player.idleAction.reset().play();
    }
    this.activeGather = null;
    this.hidePrompt();
    this.currentTarget = null;
    this.currentTargetMesh = null;
  }

  cancelGatherAction(): void {
    if (!this.activeGather) return;
    const targetName =
      this.activeGather.targetInstance.name ||
      this.activeGather.targetInstance.id;
    const targetPosition = (
      this.activeGather.targetInstance.mesh ?? this.activeGather.targetInstance
    ).position;
    // Log gather cancel event
    if (this.player.game)
      this.player.game.logEvent(
        this.player,
        "gather_cancel",
        `Gathering ${this.activeGather.resource} cancelled.`,
        targetName,
        { resource: this.activeGather.resource },
        targetPosition
      );

    this.player.isGathering = false; // Reset gathering state
    this.player.gatherAttackTimer = 0; // Reset timer
    this.player.isPerformingAction = false; // Also reset performing action
    this.player.actionType = "none";
    if (this.player.attackAction && this.player.attackAction.isRunning()) {
      this.player.attackAction.stop(); // Stop attack animation
      // Optionally fade back to idle/walk
      if (this.player.idleAction) this.player.idleAction.reset().play();
    }
    this.activeGather = null;
    this.hidePrompt();
  }

  showPrompt(text: string, duration: number | null = null): void {
    if (
      !this.interactionPromptElement ||
      (this.activeGather && duration === null)
    )
      return;
    this.interactionPromptElement.textContent = text;
    this.interactionPromptElement.style.display = "block";
    clearTimeout(this.promptTimeout ?? undefined);
    this.promptTimeout = null;
    if (duration && duration > 0) {
      this.promptTimeout = setTimeout(() => {
        if (this.interactionPromptElement?.textContent === text)
          this.hidePrompt();
      }, duration);
    }
  }

  hidePrompt(): void {
    if (
      !this.interactionPromptElement ||
      this.activeGather ||
      this.promptTimeout
    )
      return;
    this.interactionPromptElement.style.display = "none";
    this.interactionPromptElement.textContent = "";
  }

  // --- Chat Interface Logic ---

  generateChatPrompt(target: Character, playerMessage: string): string {
    // Get last 5 events from the target's perspective
    const recentEvents = target.eventLog.entries
      .slice(-5)
      .map((entry) => entry.message)
      .join("\n");
    const persona = target.persona || "a friendly villager"; // Fallback persona

    return `
You are an NPC named ${target.name} with the following persona: ${persona}
The player character is named ${
      this.player.name
    } just said to you: "${playerMessage}"

Recent events observed by you:
${recentEvents || "Nothing significant recently."}

Respond to the player in brief 1-2 sentences.
`.trim();
  }

  async openChatInterface(target: Character): Promise<void> {
    if (!this.chatContainer || !this.chatInput || this.isChatOpen) return;
    this.game.setPauseState(true);
    this.isChatOpen = true;
    this.chatTarget = target;
    this.chatContainer.classList.remove("hidden");
    this.chatInput.value = "";
    this.chatInput.focus(); // Focus might bring up virtual keyboard

    // Define bound handlers if they don't exist
    if (!this.boundSendMessage) {
      this.boundSendMessage = async () => {
        if (!this.chatTarget || !this.chatInput) return;

        const message = this.chatInput.value.trim();
        if (!message) return;
        this.player.showTemporaryMessage(message);

        this.chatInput.value = "";
        this.chatInput.disabled = true; // Disable input while waiting for response

        // 2. Log player's message
        this.game.logEvent(
          this.player,
          "chat",
          `${this.player.name} said "${message}" to ${this.chatTarget.name}.`,
          this.chatTarget,
          { message: message },
          this.player.mesh!.position
        );

        // 3. Generate prompt and call API
        const prompt = this.generateChatPrompt(this.chatTarget, message);
        try {
          const responseJson = await sendToGemini(prompt);
          let npcMessage = "Hmm....";
          if (responseJson) {
            const parsedResponse = JSON.parse(responseJson)["response"];
            npcMessage = parsedResponse?.trim() || "Hmm....";
            console.log("NPC response:", npcMessage);
          }

          this.chatTarget.showTemporaryMessage(npcMessage);
          this.chatTarget.game?.logEvent(
            this.chatTarget,
            "chat",
            `${this.chatTarget.name} said "${npcMessage}" to ${this.player.name}.`,
            this.player,
            { message: npcMessage },
            this.chatTarget.mesh!.position
          );

          // Add quest completion check here
          this.game.checkQuestCompletion(this.chatTarget, npcMessage);
        } catch (error) {
          console.error("Error during chat API call:", error);
          this.chatTarget.showTemporaryMessage("I... don't know what to say.");
          this.game.logEvent(
            this.chatTarget,
            "chat_error",
            `${this.chatTarget.name} failed to respond to ${this.player.name}.`,
            this.player,
            { error: (error as Error).message },
            this.chatTarget.mesh!.position
          );
        } finally {
          this.closeChatInterface();
          // this.chatInput.disabled = false; // Re-enable input
          // this.chatInput.focus();
        }
      };
    }

    if (!this.boundHandleChatKeyDown) {
      this.boundHandleChatKeyDown = (e: KeyboardEvent) => {
        if (e.key === "Enter" && this.boundSendMessage) {
          this.boundSendMessage();
        }
      };
    }

    if (!this.boundCloseChat) {
      this.boundCloseChat = () => {
        this.closeChatInterface();
      };
    }

    // Add event listeners using bound handlers

    this.chatInput.addEventListener("keydown", this.boundHandleChatKeyDown);
  }

  closeChatInterface(): void {
    if (!this.isChatOpen || !this.chatContainer || !this.chatInput) return;

    this.isChatOpen = false;
    this.chatTarget = null;
    this.chatContainer.classList.add("hidden");
    this.game.setPauseState(false); // Unpause game

    if (this.boundHandleChatKeyDown) {
      this.chatInput.removeEventListener(
        "keydown",
        this.boundHandleChatKeyDown
      );
    }
  }
}

export class Physics {
  player: Character;
  collidableObjects: Object3D[];
  collisionCheckRadiusSq: number = 20 * 20;
  private overlap = new Vector3();
  private centerPlayer = new Vector3();
  private centerObject = new Vector3();
  private sizePlayer = new Vector3();
  private sizeObject = new Vector3();
  private pushVector = new Vector3();
  private objectBoundingBox = new Box3();

  constructor(player: Character, collidableObjects: Object3D[]) {
    this.player = player;
    this.collidableObjects = collidableObjects;
  }

  update(deltaTime: number): void {
    if (this.player.isDead || !this.player.mesh) return;
    const playerBox = this.player.boundingBox;
    if (!playerBox || playerBox.isEmpty()) this.player.updateBoundingBox();
    const playerPos = this.player.mesh!.position;
    this.collidableObjects.forEach((object) => {
      if (
        !object ||
        object === this.player.mesh ||
        !object.userData?.isCollidable ||
        object.userData?.isTerrain ||
        !object.parent
      )
        return;
      // Check if the collidable object is a dead character's mesh
      const entityRef = object.userData?.entityReference;
      if (entityRef instanceof Character && entityRef.isDead) return;

      const objectPosition = object.getWorldPosition(new Vector3());
      if (
        playerPos.distanceToSquared(objectPosition) >
        this.collisionCheckRadiusSq
      )
        return;
      let objectBox = object.userData.boundingBox as Box3 | undefined;
      if (!objectBox || objectBox.isEmpty()) {
        this.objectBoundingBox.setFromObject(object, true);
        objectBox = this.objectBoundingBox;
        if (objectBox.isEmpty()) return;
      }
      if (playerBox.intersectsBox(objectBox)) {
        this.resolveCollision(playerBox, objectBox, object);
        this.player.updateBoundingBox();
      }
    });
  }

  resolveCollision(playerBox: Box3, objectBox: Box3, object: Object3D): void {
    playerBox.getCenter(this.centerPlayer);
    objectBox.getCenter(this.centerObject);
    playerBox.getSize(this.sizePlayer);
    objectBox.getSize(this.sizeObject);
    this.overlap.x =
      this.sizePlayer.x / 2 +
      this.sizeObject.x / 2 -
      Math.abs(this.centerPlayer.x - this.centerObject.x);
    this.overlap.y =
      this.sizePlayer.y / 2 +
      this.sizeObject.y / 2 -
      Math.abs(this.centerPlayer.y - this.centerObject.y);
    this.overlap.z =
      this.sizePlayer.z / 2 +
      this.sizeObject.z / 2 -
      Math.abs(this.centerPlayer.z - this.centerObject.z);
    let minOverlap = Infinity;
    let pushAxis = -1;
    if (this.overlap.x > 0 && this.overlap.x < minOverlap) {
      minOverlap = this.overlap.x;
      pushAxis = 0;
    }
    if (this.overlap.y > 0 && this.overlap.y < minOverlap) {
      minOverlap = this.overlap.y;
      pushAxis = 1;
    }
    if (this.overlap.z > 0 && this.overlap.z < minOverlap) {
      minOverlap = this.overlap.z;
      pushAxis = 2;
    }
    if (pushAxis === -1 || minOverlap < 0.0001) return;
    this.pushVector.set(0, 0, 0);
    const pushMagnitude = minOverlap + 0.001;
    switch (pushAxis) {
      case 0:
        this.pushVector.x =
          this.centerPlayer.x > this.centerObject.x
            ? pushMagnitude
            : -pushMagnitude;
        if (Math.sign(this.player.velocity.x) === Math.sign(this.pushVector.x))
          this.player.velocity.x = 0;
        break;
      case 1:
        this.pushVector.y =
          this.centerPlayer.y > this.centerObject.y
            ? pushMagnitude
            : -pushMagnitude;
        if (this.pushVector.y > 0.01 && this.player.velocity.y <= 0) {
          this.player.velocity.y = 0;
          this.player.isOnGround = true;
          this.player.canJump = true;
        } else if (this.pushVector.y < -0.01 && this.player.velocity.y > 0) {
          this.player.velocity.y = 0;
        }
        break;
      case 2:
        this.pushVector.z =
          this.centerPlayer.z > this.centerObject.z
            ? pushMagnitude
            : -pushMagnitude;
        if (Math.sign(this.player.velocity.z) === Math.sign(this.pushVector.z))
          this.player.velocity.z = 0;
        break;
    }
    this.player.mesh!.position.add(this.pushVector);
  }
}

export class ThirdPersonCamera {
  camera: PerspectiveCamera;
  target: Object3D;
  idealOffset: Vector3 = new Vector3(0, 2.5, -2.5);
  minOffsetDistance: number = 1.5;
  maxOffsetDistance: number = 12.0;
  pitchAngle: number = 0.15;
  minPitch: number = -Math.PI / 3;
  maxPitch: number = Math.PI / 2.5;
  pitchSensitivity: number = 0.0025;
  lerpAlphaPositionBase: number = 0.05;
  lerpAlphaLookatBase: number = 0.1;
  collisionRaycaster: Raycaster;
  collisionOffset: number = 0.3;
  currentPosition: Vector3;
  currentLookat: Vector3;
  private targetPosition = new Vector3();
  private offset = new Vector3();
  private idealPosition = new Vector3();
  private finalPosition = new Vector3();
  private idealLookat = new Vector3();
  private rayOrigin = new Vector3();
  private cameraDirection = new Vector3();

  constructor(camera: PerspectiveCamera, target: Object3D) {
    this.camera = camera;
    this.target = target;
    this.collisionRaycaster = new Raycaster();
    this.collisionRaycaster.camera = camera;
    this.currentPosition = new Vector3();
    this.currentLookat = new Vector3();
    this.target.getWorldPosition(this.currentLookat);
    this.currentLookat.y += (target.userData?.height ?? 1.8) * 0.6;
    this.update(0.016, []);
    this.camera.position.copy(this.currentPosition);
    this.camera.lookAt(this.currentLookat);
  }

  handleMouseInput(deltaX: number, deltaY: number): void {
    // deltaX is now handled by player rotation directly in Controls/MobileControls
    this.pitchAngle -= deltaY * this.pitchSensitivity;
    this.pitchAngle = MathUtils.clamp(
      this.pitchAngle,
      this.minPitch,
      this.maxPitch
    );
  }

  update(deltaTime: number, collidables: Object3D[]): void {
    if (!this.target || !this.target.parent) return; // Ensure target is still valid and in scene
    this.target.getWorldPosition(this.targetPosition);
    const targetQuaternion = this.target.quaternion;
    this.offset
      .copy(this.idealOffset)
      .applyAxisAngle(new Vector3(1, 0, 0), this.pitchAngle)
      .applyQuaternion(targetQuaternion);
    this.idealPosition.copy(this.targetPosition).add(this.offset);
    this.cameraDirection.copy(this.idealPosition).sub(this.targetPosition);
    let idealDistance = this.cameraDirection.length();
    this.cameraDirection.normalize();
    this.rayOrigin
      .copy(this.targetPosition)
      .addScaledVector(this.cameraDirection, 0.2);
    this.collisionRaycaster.set(this.rayOrigin, this.cameraDirection);
    this.collisionRaycaster.far = Math.max(0, idealDistance - 0.2);
    const collisionCheckObjects = collidables.filter(
      (obj) => obj !== this.target && obj?.userData?.isCollidable
    );
    const intersects = this.collisionRaycaster.intersectObjects(
      collisionCheckObjects,
      true
    );
    let actualDistance = idealDistance;
    if (intersects.length > 0) {
      actualDistance =
        intersects.reduce(
          (minDist, intersect) => Math.min(minDist, intersect.distance),
          idealDistance
        ) +
        0.2 -
        this.collisionOffset;
      actualDistance = Math.max(this.minOffsetDistance, actualDistance);
    }
    actualDistance = MathUtils.clamp(
      actualDistance,
      this.minOffsetDistance,
      this.maxOffsetDistance
    );
    this.finalPosition
      .copy(this.targetPosition)
      .addScaledVector(this.cameraDirection, actualDistance);
    const targetHeight = this.target.userData?.height ?? 1.8;
    this.idealLookat
      .copy(this.targetPosition)
      .add(new Vector3(0, targetHeight * 0.6, 0));
    smoothVectorLerp(
      this.currentPosition,
      this.finalPosition,
      this.lerpAlphaPositionBase,
      deltaTime
    );
    smoothVectorLerp(
      this.currentLookat,
      this.idealLookat,
      this.lerpAlphaLookatBase,
      deltaTime
    );
    this.camera.position.copy(this.currentPosition);
    this.camera.lookAt(this.currentLookat);
  }
}

export class Controls {
  player: Character | null;
  cameraController: ThirdPersonCamera | null;
  domElement: HTMLElement;
  game: Game | null; // Add reference to the game instance
  keys: KeyState = {};
  mouse: MouseState = { x: 0, y: 0, dx: 0, dy: 0, buttons: {} };
  isPointerLocked: boolean = false;
  playerRotationSensitivity: number = 0.0025;
  moveState: MoveState = {
    forward: 0,
    right: 0,
    jump: false,
    sprint: false,
    interact: false,
    attack: false,
  };
  keyDownListeners: Record<string, Array<() => void>> = {};
  mouseClickListeners: Record<number, Array<(event: MouseEvent) => void>> = {};

  // keyboard parts
  boundOnKeyDown: (event: KeyboardEvent) => void;
  boundOnKeyUp: (event: KeyboardEvent) => void;
  boundOnMouseDown: (event: MouseEvent) => void;
  boundOnMouseUp: (event: MouseEvent) => void;
  boundOnMouseMove: (event: MouseEvent) => void;
  boundOnClick: (event: MouseEvent) => void;
  boundOnPointerLockChange: () => void;
  boundOnPointerLockError: () => void;

  constructor(
    player: Character | null,
    cameraController: ThirdPersonCamera | null,
    domElement: HTMLElement | null,
    game: Game | null
  ) {
    this.player = player;
    this.cameraController = cameraController;
    this.domElement = domElement ?? document.body;
    this.game = game;

    // Bind methods
    this.boundOnKeyDown = this.onKeyDown.bind(this);
    this.boundOnKeyUp = this.onKeyUp.bind(this);
    this.boundOnMouseDown = this.onMouseDown.bind(this);
    this.boundOnMouseUp = this.onMouseUp.bind(this);
    this.boundOnMouseMove = this.onMouseMove.bind(this);
    this.boundOnClick = this.onClick.bind(this);
    this.boundOnPointerLockChange = this.onPointerLockChange.bind(this);
    this.boundOnPointerLockError = this.onPointerLockError.bind(this);

    this.initListeners();
  }

  initListeners(): void {
    // Only add keyboard/mouse listeners if not on mobile
    if (!this.game?.mobileControls?.isActive()) {
      document.addEventListener("keydown", this.boundOnKeyDown, false);
      document.addEventListener("keyup", this.boundOnKeyUp, false);
      document.addEventListener("mousedown", this.boundOnMouseDown, false);
      document.addEventListener("mouseup", this.boundOnMouseUp, false);
      document.addEventListener("mousemove", this.boundOnMouseMove, false);
      this.domElement.addEventListener("click", this.boundOnClick, false);

      // Pointer Lock only for desktop
      document.addEventListener(
        "pointerlockchange",
        this.boundOnPointerLockChange,
        false
      );
      document.addEventListener(
        "pointerlockerror",
        this.boundOnPointerLockError,
        false
      );
    } else {
      // On mobile, maybe still listen for Escape key for UI?
      document.addEventListener("keydown", (e) => {
        if (e.code === "Escape") this.handleEscapeKey();
      });
    }
  }

  addKeyDownListener(keyCode: string, callback: () => void): void {
    if (!this.keyDownListeners[keyCode]) this.keyDownListeners[keyCode] = [];
    this.keyDownListeners[keyCode].push(callback);
  }

  addMouseClickListener(
    buttonIndex: number,
    callback: (event: MouseEvent) => void
  ): void {
    if (!this.mouseClickListeners[buttonIndex])
      this.mouseClickListeners[buttonIndex] = [];
    this.mouseClickListeners[buttonIndex].push(callback);
  }

  // --- Pointer Lock (Desktop) ---
  lockPointer(): void {
    // Only attempt lock if not on mobile
    if (
      !this.game?.mobileControls?.isActive() &&
      "requestPointerLock" in this.domElement &&
      document.pointerLockElement !== this.domElement
    ) {
      this.domElement.requestPointerLock();
    }
  }

  unlockPointer(): void {
    if (
      !this.game?.mobileControls?.isActive() &&
      document.pointerLockElement === this.domElement
    )
      document.exitPointerLock();
  }

  onPointerLockChange(): void {
    // This should only fire on desktop now
    if (document.pointerLockElement === this.domElement) {
      this.isPointerLocked = true;
      document.body.classList.add("pointer-locked"); // Add class to body
      this.mouse.dx = 0;
      this.mouse.dy = 0;
      // Attempt to unpause the game when pointer locks
      const inventoryIsOpen = this.game?.inventoryDisplay?.isOpen ?? false;
      const journalIsOpen = this.game?.journalDisplay?.isOpen ?? false;
      const chatIsOpen = this.game?.interactionSystem?.isChatOpen ?? false;
      if (!inventoryIsOpen && !journalIsOpen && !chatIsOpen) {
        this.game?.setPauseState(false);
      }
    } else {
      this.isPointerLocked = false;
      document.body.classList.remove("pointer-locked"); // Remove class from body
      // Reset keyboard state if lock is lost
      this.keys = {};
      this.mouse.buttons = {};
      this.mouse.dx = 0;
      this.mouse.dy = 0;
      this.updateContinuousMoveState(); // Reset keyboard movement

      // Pause the game when pointer unlocks, unless a UI element that requires interaction is open
      const inventoryIsOpen = this.game?.inventoryDisplay?.isOpen ?? false;
      const journalIsOpen = this.game?.journalDisplay?.isOpen ?? false;
      const chatIsOpen = this.game?.interactionSystem?.isChatOpen ?? false;
      if (!inventoryIsOpen && !journalIsOpen && !chatIsOpen) {
        this.game?.setPauseState(true);
      }
    }
  }

  onPointerLockError(): void {
    console.error("Pointer lock failed.");
    this.isPointerLocked = false;
    document.body.classList.remove("pointer-locked"); // Ensure class is removed on error
  }

  // --- Keyboard Input ---
  onKeyDown(event: KeyboardEvent): void {
    // Ignore if mobile controls are active
    if (this.game?.mobileControls?.isActive()) return;

    const keyCode = event.code;
    if (this.game?.interactionSystem?.isChatOpen && keyCode !== "Escape") {
      return; // Allow chat input
    }

    if (this.keys[keyCode]) return; // Prevent repeated triggers
    this.keys[keyCode] = true;
    this.keyDownListeners[keyCode]?.forEach((cb) => cb());

    // Handle specific key actions only if not handled by mobile
    if (keyCode === "Space") this.moveState.jump = true;
    if (keyCode === "KeyE") this.moveState.interact = true;
    if (keyCode === "KeyF") this.moveState.attack = true;
    if (keyCode === "Escape") this.handleEscapeKey(); // Handle escape separately

    this.updateContinuousMoveState();
  }

  onKeyUp(event: KeyboardEvent): void {
    // Ignore if mobile controls are active
    if (this.game?.mobileControls?.isActive()) return;

    const keyCode = event.code;
    this.keys[keyCode] = false;

    // Reset specific key actions only if not handled by mobile
    if (keyCode === "KeyF") this.moveState.attack = false;
    // Jump and Interact are consumed, not held continuously based on keyup

    this.updateContinuousMoveState();
  }

  // Centralized Escape key handling
  handleEscapeKey(): void {
    if (this.game?.interactionSystem?.isChatOpen) {
      this.game.interactionSystem.closeChatInterface();
    } else if (this.game?.inventoryDisplay?.isOpen) {
      this.game.inventoryDisplay.hide();
      this.game?.setPauseState(false);
    } else if (this.game?.journalDisplay?.isOpen) {
      this.game.journalDisplay.hide();
      this.game?.setPauseState(false);
    } else if (this.isPointerLocked) {
      this.unlockPointer();
    }
  }

  // --- Mouse Input ---
  onMouseDown(event: MouseEvent): void {
    // Ignore if mobile controls are active
    if (this.game?.mobileControls?.isActive()) return;
    if (this.game?.interactionSystem?.isChatOpen) return;
    this.mouse.buttons[event.button] = true;
    this.mouseClickListeners[event.button]?.forEach((cb) => cb(event));
  }

  onMouseUp(event: MouseEvent): void {
    // Ignore if mobile controls are active
    if (this.game?.mobileControls?.isActive()) return;
    this.mouse.buttons[event.button] = false;
  }

  onMouseMove(event: MouseEvent): void {
    // Ignore if mobile controls are active
    if (this.game?.mobileControls?.isActive()) return;

    if (this.isPointerLocked) {
      this.mouse.dx += event.movementX ?? 0;
      this.mouse.dy += event.movementY ?? 0;
    } else {
      this.mouse.x = event.clientX;
      this.mouse.y = event.clientY;
    }
  }

  onClick(event: MouseEvent): void {
    // Ignore if mobile controls are active
    if (this.game?.mobileControls?.isActive()) return;

    const targetElement = event.target as HTMLElement;
    const isGameContainerClick =
      targetElement === this.domElement ||
      (this.domElement.contains(targetElement) &&
        targetElement.closest(
          "#inventory-display, #journal-display, #chat-container, #minimap-canvas, #welcome-banner, #mobile-controls-layer" // Add mobile layer to exceptions
        ) === null);

    const inventoryIsOpen = this.game?.inventoryDisplay?.isOpen ?? false;
    const journalIsOpen = this.game?.journalDisplay?.isOpen ?? false;
    const chatIsOpen = this.game?.interactionSystem?.isChatOpen ?? false;
    const uiBlocksPointerLock = inventoryIsOpen || journalIsOpen || chatIsOpen;

    if (isGameContainerClick && !this.isPointerLocked && !uiBlocksPointerLock) {
      this.lockPointer();
    }
  }

  // --- Update Logic ---
  updateContinuousMoveState(): void {
    // This now primarily handles keyboard state, mobile state is set directly
    // Only update from keys if mobile is NOT active
    if (!this.game?.mobileControls?.isActive()) {
      const W = this.keys["KeyW"] || this.keys["ArrowUp"];
      const S = this.keys["KeyS"] || this.keys["ArrowDown"];
      const D = this.keys["KeyD"] || this.keys["ArrowRight"];
      const A = this.keys["KeyA"] || this.keys["ArrowLeft"];
      const Sprint = this.keys["ShiftLeft"] || this.keys["ShiftRight"];

      this.moveState.forward = (W ? 1 : 0) - (S ? 1 : 0);
      this.moveState.right = (A ? 1 : 0) - (D ? 1 : 0); // Swapped A/D
      this.moveState.sprint = Sprint ?? false;
    }
    // Note: Jump, Interact, Attack states are handled differently
    // Jump/Interact are set true on keydown/mobile press and consumed
    // Attack is set true/false based on key/button hold state
  }

  update(deltaTime: number): void {
    // --- Rotation Update (Mouse - Desktop Only) ---
    if (
      !this.game?.mobileControls?.isActive() &&
      this.isPointerLocked &&
      this.player &&
      this.player.mesh
    ) {
      const sensitivity = this.playerRotationSensitivity;

      if (Math.abs(this.mouse.dx) > 0) {
        const yawDelta = -this.mouse.dx * sensitivity;
        this.player.mesh!.rotateY(yawDelta);
      }
      if (this.cameraController && Math.abs(this.mouse.dy) > 0) {
        // Use negative dy for camera pitch control
        this.cameraController.handleMouseInput(this.mouse.dx, -this.mouse.dy);
      }
    }
    // Reset dx/dy after processing (only relevant for mouse)
    this.mouse.dx = 0;
    this.mouse.dy = 0;

    // --- Keyboard Movement Update (Desktop Only) ---
    // This ensures keyboard input is reflected if mobile is not active
    this.updateContinuousMoveState();

    // Mobile input (forward, right, attack, interact) is applied directly
    // by MobileControls.update() before this method is called.
    // Camera rotation from mobile joystick is also applied in MobileControls.update().
  }

  consumeInteraction(): boolean {
    // This works for both keyboard ('E' press) and mobile (tap Interact button)
    if (!this.moveState.interact) return false;
    this.moveState.interact = false; // Reset after consumption
    return true;
  }

  // Method to clean up listeners
  dispose(): void {
    // Remove listeners based on whether mobile is active or not
    if (!this.game?.mobileControls?.isActive()) {
      document.removeEventListener("keydown", this.boundOnKeyDown);
      document.removeEventListener("keyup", this.boundOnKeyUp);
      document.removeEventListener("mousedown", this.boundOnMouseDown);
      document.removeEventListener("mouseup", this.boundOnMouseUp);
      document.removeEventListener("mousemove", this.boundOnMouseMove);
      this.domElement.removeEventListener("click", this.boundOnClick);
      document.removeEventListener(
        "pointerlockchange",
        this.boundOnPointerLockChange
      );
      document.removeEventListener(
        "pointerlockerror",
        this.boundOnPointerLockError
      );
    } else {
      // Remove the minimal listener added for mobile
      // document.removeEventListener('keydown', ...); // Need to store the listener reference
    }
    // TODO: Properly remove the mobile escape listener if needed
  }
}

// File: /src/ui.ts

export class HUD {
  player: Character;
  healthBarElement: HTMLElement | null;
  staminaBarElement: HTMLElement | null;
  fpsDisplayElement: HTMLElement | null; // New property for FPS display
  frameTimes: number[] = []; // Array to store frame times
  MAX_SAMPLES: number = 60; // Number of frames to average (e.g., ~1 second at 60 FPS)
  lastUpdateTime: number; // Timestamp of the last update

  constructor(player: Character) {
    this.player = player;
    this.healthBarElement = document.getElementById("health-bar");
    this.staminaBarElement = document.getElementById("stamina-bar");
    this.fpsDisplayElement = document.getElementById("fps-display"); // Initialize FPS element
    this.lastUpdateTime = performance.now(); // Set initial time in milliseconds
    this.update(); // Initial call (existing behavior)
  }

  update(): void {
    // Calculate time since last frame
    const currentTime = performance.now(); // Current time in milliseconds
    const deltaTime = (currentTime - this.lastUpdateTime) / 1000; // Convert to seconds
    this.lastUpdateTime = currentTime; // Update last time

    // Update FPS calculation
    this.frameTimes.push(deltaTime); // Add new frame time
    if (this.frameTimes.length > this.MAX_SAMPLES) {
      this.frameTimes.shift(); // Remove oldest if exceeding sample limit
    }
    const averageDelta =
      this.frameTimes.reduce((a, b) => a + b, 0) / this.frameTimes.length; // Average frame time
    const fps = 1 / averageDelta; // FPS = 1 / average time per frame
    if (this.fpsDisplayElement) {
      this.fpsDisplayElement.textContent = `FPS: ${Math.round(fps)}`; // Update display
    }

    // Existing health and stamina update logic
    if (this.player.isDead) {
      if (this.healthBarElement) this.healthBarElement.style.width = `0%`;
      if (this.staminaBarElement) this.staminaBarElement.style.width = `0%`;
      return;
    }
    if (!this.healthBarElement || !this.staminaBarElement) return;
    const healthPercent = Math.max(
      0,
      (this.player.health / this.player.maxHealth) * 100
    );
    this.healthBarElement.style.width = `${healthPercent}%`;
    this.healthBarElement.style.backgroundColor =
      healthPercent < 30
        ? "#FF4500"
        : healthPercent < 60
          ? "#FFA500"
          : "#4CAF50";
    const staminaPercent = Math.max(
      0,
      (this.player.stamina / this.player.maxStamina) * 100
    );
    this.staminaBarElement.style.width = `${staminaPercent}%`;
    if (this.player.isExhausted) {
      this.staminaBarElement.style.backgroundColor = "#888";
      this.staminaBarElement.classList.add("exhausted");
    } else {
      this.staminaBarElement.style.backgroundColor = "#FF69B4";
      this.staminaBarElement.classList.remove("exhausted");
    }
  }
}

export class InventoryDisplay {
  inventory: Inventory;
  displayElement: HTMLElement | null;
  slotsContainer: HTMLElement | null;
  isOpen: boolean = false;
  boundUpdateDisplay: (items: Array<InventoryItem | null>) => void;

  constructor(inventory: Inventory) {
    this.inventory = inventory;
    this.displayElement = document.getElementById("inventory-display");
    this.slotsContainer = document.getElementById("inventory-slots");
    if (this.slotsContainer) this.createSlots();
    this.boundUpdateDisplay = this.updateDisplay.bind(this);
    this.inventory.onChange(this.boundUpdateDisplay);
    if (this.displayElement) this.displayElement.classList.add("hidden");
  }

  // Method to update the inventory reference
  setInventory(newInventory: Inventory): void {
    if (this.inventory === newInventory) return;

    // Remove listener from old inventory
    if (this.inventory) {
      this.inventory.onChangeCallbacks =
        this.inventory.onChangeCallbacks.filter(
          (cb) => cb !== this.boundUpdateDisplay
        );
    }

    this.inventory = newInventory;

    // Add listener to new inventory
    this.inventory.onChange(this.boundUpdateDisplay);

    // Update display if open
    if (this.isOpen) {
      this.updateDisplay(this.inventory.items);
    } else {
      // Ensure slots are created for the new inventory size if needed
      if (
        this.slotsContainer &&
        this.slotsContainer.children.length !== this.inventory.size
      ) {
        this.createSlots();
      }
    }
  }

  createSlots(): void {
    this.slotsContainer!.innerHTML = "";
    for (let i = 0; i < this.inventory.size; i++) {
      const slotElement = document.createElement("div");
      slotElement.classList.add("inventory-slot");
      slotElement.dataset.index = i.toString();
      slotElement.title = "Empty";
      slotElement.innerHTML = `<div class="item-icon" data-current-icon="empty" style="visibility: hidden;"></div><span class="item-count"></span>`;
      this.slotsContainer!.appendChild(slotElement);
    }
  }

  updateDisplay(items: Array<InventoryItem | null>): void {
    if (!this.isOpen || !this.slotsContainer) return;
    const slotElements =
      this.slotsContainer.querySelectorAll<HTMLElement>(".inventory-slot");
    if (slotElements.length !== this.inventory.size) this.createSlots(); // Recreate if size mismatch
    items.forEach((item, index) => {
      const slotElement = slotElements[index];
      if (!slotElement) return;
      const iconElement = slotElement.querySelector<HTMLElement>(".item-icon");
      const countElement =
        slotElement.querySelector<HTMLElement>(".item-count");
      if (item && iconElement && countElement) {
        const iconClass =
          item.icon ||
          item.name.toLowerCase().replace(/ /g, "_").replace(/'/g, ""); // Generate icon class if missing
        if (iconElement.dataset.currentIcon !== iconClass) {
          iconElement.className = `item-icon ${iconClass}`;
          iconElement.dataset.currentIcon = iconClass;
        }
        iconElement.style.visibility = "visible";
        countElement.textContent = item.count > 1 ? item.count.toString() : "";
        slotElement.title = `${item.name}${
          item.count > 1 ? ` (${item.count})` : ""
        }`;
      } else if (iconElement && countElement) {
        if (iconElement.dataset.currentIcon !== "empty") {
          iconElement.className = "item-icon";
          iconElement.style.visibility = "hidden";
          iconElement.dataset.currentIcon = "empty";
        }
        countElement.textContent = "";
        slotElement.title = "Empty";
      }
    });
  }

  toggle(): void {
    this.isOpen ? this.hide() : this.show();
  }

  show(): void {
    if (!this.displayElement || this.isOpen) return;
    this.isOpen = true;
    this.updateDisplay(this.inventory.items);
    this.displayElement.classList.remove("hidden");
  }

  hide(): void {
    if (!this.displayElement || !this.isOpen) return;
    this.isOpen = false;
    this.displayElement.classList.add("hidden");
  }
}

export class JournalDisplay {
  eventLog: EventLog;
  game: Game; // Add game reference
  displayElement: HTMLElement | null;
  eventListElement: HTMLElement | null;
  questListElement: HTMLElement | null; // Add quest list element
  isOpen: boolean = false;
  boundUpdateEvents: (entries: EventEntry[]) => void;
  boundUpdateQuests: () => void; // Add bound method for quests

  constructor(eventLog: EventLog, game: Game) {
    this.eventLog = eventLog;
    this.game = game; // Store game instance
    this.displayElement = document.getElementById("journal-display");
    this.eventListElement = document.getElementById("event-log");
    this.questListElement = document.getElementById("quest-log"); // Get quest log element
    this.boundUpdateEvents = this.updateEvents.bind(this);
    this.boundUpdateQuests = this.updateQuests.bind(this);
    this.eventLog.onChange(this.boundUpdateEvents);
    if (this.displayElement) this.displayElement.classList.add("hidden");
  }

  updateQuests(): void {
    if (!this.isOpen || !this.questListElement) return;
    this.questListElement.innerHTML = "";
    this.game?.quests?.forEach((quest) => {
      const li = document.createElement("li");
      li.textContent = `${quest.name}: ${
        quest.isCompleted ? "Completed" : "In Progress"
      }`;
      this.questListElement!.appendChild(li);
    });
  }

  // Method to change the event log being displayed
  setEventLog(newEventLog: EventLog): void {
    if (this.eventLog === newEventLog) return;

    // Remove listener from the old event log
    if (this.eventLog) {
      this.eventLog.onChangeCallbacks = this.eventLog.onChangeCallbacks.filter(
        (cb) => cb !== this.boundUpdateEvents
      );
    }

    this.eventLog = newEventLog;

    // Add listener to the new event log
    this.eventLog.onChange(this.boundUpdateEvents);

    // Update display if open
    if (this.isOpen) {
      this.updateEvents(this.eventLog.entries);
    }
  }

  updateEvents(entries: EventEntry[]): void {
    // Changed parameter type
    if (!this.isOpen || !this.eventListElement) return;
    this.eventListElement.innerHTML =
      entries.length === 0 ? "<li>No events recorded yet.</li>" : "";
    // Display entries in chronological order (newest at the bottom)
    entries.forEach((entry) => {
      const li = document.createElement("li");
      // Use the message field for display
      li.textContent = `[${entry.timestamp}] ${entry.message}`;
      this.eventListElement!.appendChild(li);
    });
    // Scroll to the bottom to show the latest entries
    this.eventListElement.scrollTop = this.eventListElement.scrollHeight;
  }

  toggle(): void {
    this.isOpen ? this.hide() : this.show();
  }

  show(): void {
    if (!this.displayElement || this.isOpen) return;
    this.isOpen = true;
    this.updateEvents(this.eventLog.entries);
    this.updateQuests(); // Update quests when showing
    this.displayElement.classList.remove("hidden");
  }

  hide(): void {
    if (!this.displayElement || !this.isOpen) return;
    this.isOpen = false;
    this.displayElement.classList.add("hidden");
  }
}

export class Minimap {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  player: Character;
  entities: Array<any>;
  worldSize: number;
  mapSize: number;
  mapScale: number;
  halfMapSize: number;
  halfWorldSize: number;
  bgColor: string = "rgba(100, 100, 100, 0.6)";
  playerColor: string = "yellow";
  npcColor: string = "cyan";
  dotSize: number = 3;
  playerDotSize: number = 4;
  playerTriangleSize: number;

  private entityPosition = new Vector3();
  private playerPosition = new Vector3();
  private playerForward = new Vector3();

  constructor(
    canvasElement: HTMLCanvasElement | null,
    player: Character,
    entities: Array<any>,
    worldSize: number
  ) {
    if (!canvasElement) {
      throw new Error("Minimap requires a valid canvas element.");
    }
    this.canvas = canvasElement;
    const context = this.canvas.getContext("2d");
    if (!context) {
      throw new Error("Could not get 2D rendering context for minimap canvas.");
    }
    this.ctx = context;

    this.player = player;
    this.entities = entities;
    this.worldSize = worldSize;

    this.mapSize = this.canvas.width;
    this.mapScale = this.mapSize / this.worldSize;
    this.halfMapSize = this.mapSize / 2;
    this.halfWorldSize = this.worldSize / 2;

    this.playerTriangleSize = this.playerDotSize * 1.5;
  }

  update(): void {
    this.ctx.fillStyle = this.bgColor;
    this.ctx.fillRect(0, 0, this.mapSize, this.mapSize);

    if (this.player.isDead || !this.player.mesh) {
      return;
    }

    this.player.mesh.getWorldPosition(this.playerPosition);
    this.player.mesh.getWorldDirection(this.playerForward);

    const playerRotationAngle = Math.atan2(
      this.playerForward.x,
      this.playerForward.z
    );

    this.ctx.save();

    this.ctx.translate(this.halfMapSize, this.halfMapSize);

    this.ctx.rotate(-playerRotationAngle);

    const playerMapX = this.worldToMapX(this.playerPosition.x);
    const playerMapZ = this.worldToMapZ(this.playerPosition.z);
    this.ctx.translate(-playerMapX, -playerMapZ);

    this.entities.forEach((entity) => {
      if (
        !entity ||
        entity === this.player ||
        (entity instanceof Character && entity.isDead)
      ) {
        return;
      }

      const mesh =
        entity instanceof Character || entity instanceof Object3D
          ? ((entity as any).mesh ?? entity)
          : null; // Handle non-mesh entities better
      if (
        !mesh ||
        !(mesh instanceof Object3D) ||
        !mesh.parent ||
        !mesh.visible
      ) {
        return;
      }

      mesh.getWorldPosition(this.entityPosition);

      const entityMapX = this.worldToMapX(this.entityPosition.x);
      const entityMapZ = this.worldToMapZ(this.entityPosition.z);

      let color = "gray";
      let size = this.dotSize;
      let draw = false;

      if (entity.userData?.resource) {
        switch (entity.userData.resource) {
          case "wood":
            color = "saddlebrown";
            break;
          case "stone":
            color = "darkgray";
            break;
          case "herb":
            color = "limegreen";
            break;
          default:
            color = "white";
        }
        draw = true;
      } else if (entity.userData?.isNPC) {
        // Use isNPC flag
        color = this.npcColor;
        size += 1;
        draw = true;
      } else if (entity.userData?.isEnemy) {
        // Assuming an isEnemy flag might exist
        color = "red";
        size += 1;
        draw = true;
      } else if (entity.userData?.isInteractable) {
        // Generic interactable
        color = "lightblue";
        draw = true;
      }

      if (draw) {
        this.drawDot(entityMapX, entityMapZ, color, size);
      }
    });

    this.ctx.restore();

    this.drawPlayerTriangle(
      this.halfMapSize,
      this.halfMapSize,
      this.playerColor,
      this.playerTriangleSize
    );
  }

  worldToMapX(worldX: number): number {
    // Invert Z axis for map coordinates (positive Z world is down on map)
    return (worldX + this.halfWorldSize) * this.mapScale;
  }

  worldToMapZ(worldZ: number): number {
    // Invert Z axis for map coordinates (positive Z world is down on map)
    return (this.halfWorldSize - worldZ) * this.mapScale;
  }

  drawDot(mapX: number, mapY: number, color: string, size: number): void {
    this.ctx.fillStyle = color;
    this.ctx.beginPath();
    this.ctx.arc(mapX, mapY, size, 0, Math.PI * 2);
    this.ctx.fill();
  }

  drawPlayerTriangle(
    centerX: number,
    centerY: number,
    color: string,
    size: number
  ): void {
    const height = size * 1.5;
    const width = size;

    this.ctx.fillStyle = color;
    this.ctx.beginPath();
    // Point triangle upwards (representing forward direction in rotated view)
    this.ctx.moveTo(centerX, centerY - height * 0.6);
    this.ctx.lineTo(centerX - width / 2, centerY + height * 0.4);
    this.ctx.lineTo(centerX + width / 2, centerY + height * 0.4);
    this.ctx.closePath();
    this.ctx.fill();
  }
}

// File: /src/ultils.ts

export interface EntityUserData {
  entityReference: any | null;
  isEntity: boolean;
  isPlayer: boolean;
  isNPC: boolean;
  isCollidable: boolean;
  isInteractable: boolean;
  interactionType?: string;
  prompt?: string;
  id: string;
  boundingBox?: Box3;
  height?: number;
  radius?: number;
  [key: string]: unknown;
}

export interface InteractionResult {
  type:
    | "reward"
    | "message"
    | "dialogue"
    | "item_retrieved"
    | "error"
    | "gather_start"
    | "chat"; // Added 'chat' type
  item?: { name: string; amount: number };
  message?: string;
  text?: string;
  state?: string;
  options?: string[]; // Added options for dialogue
}

export interface TargetInfo {
  mesh: Object3D;
  instance: any;
  point: Vector3;
  distance: number;
}

export interface ActiveGather {
  targetInstance: any;
  startTime: number;
  duration: number;
  resource: string;
}

export interface InventoryItem {
  name: string;
  count: number;
  icon?: string;
}

// Interface for structured event data
export interface GameEvent {
  actor: string; // ID or name of the character performing the action
  action: string; // e.g., "attack", "gather", "move", etc.
  target?: string; // ID or name of the target, if applicable
  details: Record<string, any>; // Additional details like damage, resource type, etc.
  location: Vector3; // Position where the event occurred
}

// src/ultils.ts
export interface Quest {
  name: string;
  description: string;
  isCompleted: boolean;
  checkCompletion: (
    interactionTarget: Character,
    chatResponse: string
  ) => boolean;
}

export interface EventEntry {
  timestamp: string;
  message: string;
  actorId?: string; // Unique ID of the actor
  actorName?: string; // Display name of the actor
  action?: string;
  targetId?: string; // Unique ID of the target
  targetName?: string; // Display name of the target
  details?: Record<string, any>;
  location?: Vector3;
}

export interface KeyState {
  [key: string]: boolean | undefined;
}

export interface MouseState {
  x: number;
  y: number;
  dx: number;
  dy: number;
  buttons: { [key: number]: boolean | undefined };
}

export interface MoveState {
  forward: number;
  right: number;
  jump: boolean;
  sprint: boolean;
  interact: boolean;
  attack: boolean; // Added attack property
}

export interface UpdateOptions {
  moveState?: MoveState;
  player?: any;
  collidables?: Object3D[];
}

export function degreesToRadians(degrees: number): number {
  return degrees * (Math.PI / 180);
}

export function randomFloat(min: number, max: number): number {
  return Math.random() * (max - min) + min;
}

export function smoothVectorLerp(
  current: Vector3,
  target: Vector3,
  alphaBase: number,
  deltaTime: number
): Vector3 {
  if (alphaBase <= 0) return current.copy(target);
  if (alphaBase >= 1) return current;
  const factor = 1 - Math.pow(alphaBase, deltaTime);
  return current.lerp(target, factor);
}

export function smoothQuaternionSlerp(
  current: Quaternion,
  target: Quaternion,
  alphaBase: number,
  deltaTime: number
): Quaternion {
  if (alphaBase <= 0) return current.copy(target);
  if (alphaBase >= 1) return current;
  const factor = 1 - Math.pow(alphaBase, deltaTime);
  return current.slerp(target, factor);
}

export function smoothstep(edge0: number, edge1: number, x: number): number {
  x = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return x * x * (3 - 2 * x);
}

export function getTerrainHeight(scene: Scene, x: number, z: number): number {
  const terrain = scene.getObjectByName("Terrain") as Mesh;
  if (!terrain) return 0;
  const raycaster = new Raycaster(
    new Vector3(x, 200, z),
    new Vector3(0, -1, 0)
  );
  const intersects = raycaster.intersectObject(terrain);
  return intersects.length > 0 ? intersects[0].point.y : 0;
}

export let nextEntityId = 0;

export function getNextEntityId(): number {
  return nextEntityId++;
}



export class EventLog {
  entries: EventEntry[];
  maxEntries: number;
  onChangeCallbacks: Array<(entries: EventEntry[]) => void>; // Changed to pass EventEntry[]

  constructor(maxEntries: number = 50) {
    this.entries = [];
    this.maxEntries = Math.max(1, maxEntries);
    this.onChangeCallbacks = [];
  }

  // Overload addEntry
  addEntry(message: string): void;
  addEntry(entry: EventEntry): void;
  addEntry(
    actor: string,
    action: string,
    message: string,
    target?: string,
    details?: Record<string, any>,
    location?: Vector3
  ): void;

  addEntry(...args: any[]): void {
    let entryToAdd: EventEntry;
    const timestamp = new Date().toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });

    if (args.length === 1 && typeof args[0] === "string") {
      // Simple message string
      const message = args[0];
      entryToAdd = {
        timestamp,
        message,
        actorId: undefined, // Or set default like 'System'
        actorName: undefined,
        action: undefined,
        targetId: undefined,
        details: {},
        location: undefined, // Or default Vector3
      };
    } else if (
      args.length === 1 &&
      typeof args[0] === "object" &&
      args[0].message &&
      args[0].timestamp
    ) {
      // Pre-constructed EventEntry object (used by game.logEvent distribution)
      entryToAdd = args[0];
      // Ensure timestamp is current if not provided or different format
      if (!entryToAdd.timestamp || entryToAdd.timestamp.length !== 8) {
        entryToAdd.timestamp = timestamp;
      }
    } else if (
      args.length >= 3 &&
      typeof args[0] === "string" &&
      typeof args[1] === "string" &&
      typeof args[2] === "string"
    ) {
      // Structured event data
      const [
        actor,
        action,
        message,
        target,
        details = {},
        location = new Vector3(),
      ] = args;
      entryToAdd = {
        timestamp,
        message,
        actorId: undefined, // Or set default like 'System'
        actorName: undefined,
        action: undefined,
        targetId: undefined,
        details: {},
        location: undefined, // Or default Vector3
      };
    } else {
      console.warn("Invalid arguments passed to EventLog.addEntry:", args);
      return; // Don't add invalid entries
    }

    this.entries.push(entryToAdd);
    if (this.entries.length > this.maxEntries) this.entries.shift();
    this.notifyChange();
  }

  getFormattedEntries(): string[] {
    // Return only the message part for simple display compatibility
    return [...this.entries]
      .reverse()
      .map((entry) => `[${entry.timestamp}] ${entry.message}`);
  }

  onChange(callback: (entries: EventEntry[]) => void): void {
    // Changed parameter type
    if (typeof callback === "function") this.onChangeCallbacks.push(callback);
  }

  notifyChange(): void {
    // Pass the raw entries array to callbacks
    const entriesCopy = [...this.entries];
    this.onChangeCallbacks.forEach((cb) => cb(entriesCopy));
  }
}
