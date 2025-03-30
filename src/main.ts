import {
  Scene, PerspectiveCamera, WebGLRenderer, Clock, Vector3, Color, Fog, Mesh,
  PlaneGeometry, MeshLambertMaterial, AmbientLight, DirectionalLight, HemisphereLight,
  BoxGeometry, MeshBasicMaterial, DoubleSide, PCFSoftShadowMap, MathUtils, Object3D, Group,
} from 'three';
import { SimplexNoise } from 'three/examples/jsm/math/SimplexNoise.js';
import WebGL from 'three/examples/jsm/capabilities/WebGL.js';
import { Player, NPC } from './entities';
import { createTree, createRock, createHerb } from './objects';
import { InteractionSystem, Physics, ThirdPersonCamera, Controls } from './system';
import { HUD, InventoryDisplay, JournalDisplay, Minimap } from './ui';
import { Inventory, EventLog, getTerrainHeight, randomFloat, smoothstep } from './ultils';

const WORLD_SIZE = 100;
const TERRAIN_SEGMENTS = 15;

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
    let z = simplexTerrain.noise(x * noiseScale, y * noiseScale) * noiseStrength;
    const distanceToCenter = Math.sqrt(x * x + y * y);
    if (distanceToCenter < flattenRadius) {
      const flattenFactor = 1.0 - smoothstep(0, flattenRadius, distanceToCenter);
      z = MathUtils.lerp(z, z * (1.0 - flattenStrength), flattenFactor);
    }
    vertices[index + 2] = z;
  }
  geometry.attributes.position.needsUpdate = true;
  geometry.rotateX(-Math.PI / 2);
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  const material = new MeshLambertMaterial({ color: 0x88B04B });
  const terrainMesh = new Mesh(geometry, material);
  terrainMesh.receiveShadow = true;
  terrainMesh.name = "Terrain";
  terrainMesh.userData = { isTerrain: true, isCollidable: true, worldSize: size, segments };
  return terrainMesh;
}

function setupLighting(scene: Scene): void {
  const ambientLight = new AmbientLight(0xadc1d4, 0.6);
  scene.add(ambientLight);
  const directionalLight = new DirectionalLight(0xfff5e1, 0.9);
  directionalLight.position.set(150, 200, 100);
  directionalLight.castShadow = true;
  directionalLight.target.position.set(0, 0, 0);
  directionalLight.shadow.mapSize.width = 1024; // Reduced from 2048
  directionalLight.shadow.mapSize.height = 1024; // Reduced from 2048
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
  const hemisphereLight = new HemisphereLight(0x87CEEB, 0x98FB98, 0.3);
  scene.add(hemisphereLight);
}

function populateEnvironment(scene: Scene, worldSize: number, collidableObjects: Object3D[], interactableObjects: Array<any>, entities: Array<any>, inventory: Inventory): void {
  const halfSize = worldSize / 2;
  const villageCenter = new Vector3(5, 0, 10);
  const addNpc = (pos: Vector3, name: string, accessory: 'none' | 'straw_hat' | 'cap'): NPC => {
    const npc = new NPC(scene, pos, name, accessory, inventory);
    npc.mesh!.position.y = getTerrainHeight(scene, pos.x, pos.z);
    entities.push(npc);
    collidableObjects.push(npc.mesh!);
    interactableObjects.push(npc);
    return npc;
  };
  addNpc(villageCenter.clone().add(new Vector3(-12, 0, 2)), 'Farmer Giles', 'straw_hat');
  addNpc(villageCenter.clone().add(new Vector3(10, 0, -3)), 'Blacksmith Brynn', 'cap');
  addNpc(new Vector3(halfSize * 0.4, 0, -halfSize * 0.3), 'Hunter Rex', 'none');
  const addObject = (creator: (pos: Vector3, ...args: any[]) => Group, count: number, minDistSq: number, ...args: any[]) => {
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
    }
  };
  addObject(createTree, 100, 25 * 25); // Reduced from 150
  addObject(createRock, 50, 20 * 20, randomFloat(1, 2.5)); // Reduced from 80
  addObject(createHerb, 30, 10 * 10); // Reduced from 60
}

function createWorldBoundary(scene: Scene, worldSize: number, collidableObjects: Object3D[]): void {
  const thickness = 20;
  const height = 100;
  const halfSize = worldSize / 2;
  const boundaryMaterial = new MeshBasicMaterial({ transparent: true, opacity: 0.0, side: DoubleSide, visible: false });
  const createWall = (px: number, pz: number, sx: number, sz: number, name: string) => {
    const wallGeo = new BoxGeometry(sx, height, sz);
    const wallMesh = new Mesh(wallGeo, boundaryMaterial);
    wallMesh.position.set(px, height / 2, pz);
    wallMesh.name = name;
    wallMesh.userData.isCollidable = true;
    wallMesh.geometry.computeBoundingBox();
    wallMesh.updateMatrixWorld(true);
    wallMesh.userData.boundingBox = wallMesh.geometry.boundingBox!.clone().applyMatrix4(wallMesh.matrixWorld);
    scene.add(wallMesh);
    collidableObjects.push(wallMesh);
  };
  createWall(halfSize + thickness / 2, 0, thickness, worldSize + thickness * 2, "Boundary+X");
  createWall(-halfSize - thickness / 2, 0, thickness, worldSize + thickness * 2, "Boundary-X");
  createWall(0, halfSize + thickness / 2, worldSize + thickness * 2, thickness, "Boundary+Z");
  createWall(0, -halfSize - thickness / 2, worldSize + thickness * 2, thickness, "Boundary-Z");
}

class Game {
  scene: Scene | null = null;
  renderer: WebGLRenderer | null = null;
  camera: PerspectiveCamera | null = null;
  clock: Clock | null = null;
  player: Player | null = null;
  thirdPersonCamera: ThirdPersonCamera | null = null;
  controls: Controls | null = null;
  physics: Physics | null = null;
  inventory: Inventory | null = null;
  eventLog: EventLog | null = null;
  interactionSystem: InteractionSystem | null = null;
  hud: HUD | null = null;
  minimap: Minimap | null = null;
  inventoryDisplay: InventoryDisplay | null = null;
  journalDisplay: JournalDisplay | null = null;
  entities: Array<any> = [];
  collidableObjects: Object3D[] = [];
  interactableObjects: Array<any> = [];
  isPaused: boolean = false;
  

  constructor() {}

  init(): void {
    this.clock = new Clock();
    this.initRenderer();
    this.initScene();
    this.initCamera();
    this.initInventoryAndEventLog();
    this.initPlayer();
    this.initControls();
    this.initPhysics();
    this.initEnvironment();
    this.initSystems();
    this.initUI();
    this.setupUIControls();
    this.eventLog!.addEntry("Welcome! Click window to lock controls. [I] Inventory, [J] Journal, [E] Interact, [Esc] Unlock/Close UI");
  }

  initRenderer(): void {
    this.renderer = new WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(window.devicePixelRatio);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = PCFSoftShadowMap;
    document.getElementById('game-container')?.appendChild(this.renderer.domElement);
  }

  initScene(): void {
    this.scene = new Scene();
    this.scene.background = new Color(0x87CEEB);
    this.scene.fog = new Fog(0x87CEEB, 150, 600);
    setupLighting(this.scene);
    const terrain = createTerrain(WORLD_SIZE, TERRAIN_SEGMENTS);
    this.scene.add(terrain);
    this.collidableObjects.push(terrain);
    createWorldBoundary(this.scene, WORLD_SIZE, this.collidableObjects);
  }

  initCamera(): void {
    this.camera = new PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 2000);
  }

  initInventoryAndEventLog(): void {
    this.inventory = new Inventory(24);
    this.eventLog = new EventLog(75);
  }

  initPlayer(): void {
    const playerSpawnPos = new Vector3(0, 0, 5);
    playerSpawnPos.y = getTerrainHeight(this.scene!, playerSpawnPos.x, playerSpawnPos.z) + 0.5;
    this.player = new Player(this.scene!, playerSpawnPos);
    this.entities.push(this.player);
    this.collidableObjects.push(this.player.mesh!);
    this.player.setEventLog(this.eventLog!);
  }

  initControls(): void {
    this.thirdPersonCamera = new ThirdPersonCamera(this.camera!, this.player!.mesh!);
    this.controls = new Controls(this.player, this.thirdPersonCamera, this.renderer!.domElement);
  }

  initPhysics(): void {
    this.physics = new Physics(this.player!, this.collidableObjects);
  }

  initEnvironment(): void {
    populateEnvironment(this.scene!, WORLD_SIZE, this.collidableObjects, this.interactableObjects, this.entities, this.inventory!);
  }

  initSystems(): void {
    this.interactionSystem = new InteractionSystem(this.player!, this.camera!, this.interactableObjects, this.controls!, this.inventory!, this.eventLog!);
  }

  initUI(): void {
    this.hud = new HUD(this.player!);
    this.minimap = new Minimap(document.getElementById('minimap-canvas') as HTMLCanvasElement, this.player!, this.entities, WORLD_SIZE);
    this.inventoryDisplay = new InventoryDisplay(this.inventory!);
    this.journalDisplay = new JournalDisplay(this.eventLog!);
  }

  setupUIControls(): void {
    this.controls!.addKeyDownListener('KeyI', () => {
      this.journalDisplay!.hide();
      this.inventoryDisplay!.toggle();
      this.setPauseState(this.inventoryDisplay!.isOpen);
    });
    this.controls!.addKeyDownListener('KeyJ', () => {
      this.inventoryDisplay!.hide();
      this.journalDisplay!.toggle();
      this.setPauseState(this.journalDisplay!.isOpen);
    });
    this.controls!.addKeyDownListener('Escape', () => {
      if (this.inventoryDisplay!.isOpen) {
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
    const slotElement = (event.target as HTMLElement)?.closest('.inventory-slot') as HTMLElement | null;
    if (!slotElement) return;
    const index = parseInt(slotElement.dataset.index ?? '-1', 10);
    if (index === -1) return;
    const item = this.inventory!.getItem(index);
    if (!item) return;
    if (item.name === 'Health Potion') {
      if (this.player!.health < this.player!.maxHealth) {
        this.player!.heal(25);
        if (this.inventory!.removeItemByIndex(index, 1)) this.eventLog!.addEntry(`Used a Health Potion. Ahh, refreshing!`);
      } else {
        this.eventLog!.addEntry(`Your health is already full.`);
      }
    } else {
      this.eventLog!.addEntry(`You examine the ${item.name}.`);
    }
    event.stopPropagation();
  }

  setPauseState(paused: boolean): void {
    if (this.isPaused === paused) return;
    this.isPaused = paused;
    if (this.isPaused) {
      this.controls!.unlockPointer();
    } else if (!this.inventoryDisplay!.isOpen && !this.journalDisplay!.isOpen) {
      this.controls!.lockPointer();
    }
  }

  start(): void {
    if (!this.renderer || !this.clock) return;
    this.renderer.setAnimationLoop(this.update.bind(this));
  }

  update(): void {
    if (!this.clock || !this.renderer || !this.scene || !this.camera || !this.player) return;
    const deltaTime = Math.min(this.clock.getDelta(), 0.05);
    this.controls!.update(deltaTime);
    if (!this.isPaused) {
      this.player.update(deltaTime, {
        moveState: this.controls!.moveState,
        collidables: this.collidableObjects
      });
      this.physics!.update(deltaTime);
      this.entities.forEach(entity => {
        if (entity instanceof Player && entity === this.player) return;
        if (typeof (entity as any).update === 'function') {
          (entity as any).update(deltaTime, { player: this.player });
        }
      });
      this.interactionSystem!.update(deltaTime);
      this.thirdPersonCamera!.update(deltaTime, this.collidableObjects);
      if (this.player.isDead) this.respawnPlayer();
    }
    this.hud!.update();
    this.minimap!.update();
    this.renderer.render(this.scene, this.camera);
  }

  respawnPlayer(): void {
    this.eventLog!.addEntry("You blacked out and woke up back near the village...");
    const goldCount = this.inventory!.countItem('gold');
    const goldPenalty = Math.min(10, Math.floor(goldCount * 0.1));
    if (goldPenalty > 0) {
      this.inventory!.removeItem('gold', goldPenalty);
      this.eventLog!.addEntry(`You lost ${goldPenalty} gold.`);
    }
    const respawnPos = new Vector3(0, 0, 10);
    respawnPos.y = getTerrainHeight(this.scene!, respawnPos.x, respawnPos.z) + 0.5;
    this.player!.respawn(respawnPos);
    this.setPauseState(false);
    this.interactionSystem!.cancelGatherAction();
  }

  onWindowResize(): void {
    if (this.camera && this.renderer) {
      this.camera.aspect = window.innerWidth / window.innerHeight;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(window.innerWidth, window.innerHeight);
    }
  }
}

if (WebGL.isWebGL2Available()) {
  const gameInstance = new Game();
  gameInstance.init();
  gameInstance.start();
  const onResize = () => gameInstance.onWindowResize();
  window.addEventListener('resize', onResize, false);
  window.addEventListener('beforeunload', () => window.removeEventListener('resize', onResize));
} else {
  const warning = WebGL.getWebGLErrorMessage();
  document.getElementById('game-container')?.appendChild(warning);
}