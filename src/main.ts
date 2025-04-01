// src/main.ts

import {
  Scene, PerspectiveCamera, WebGLRenderer, Clock, Vector3, Color, Fog, Mesh,
  PlaneGeometry, MeshLambertMaterial, AmbientLight, DirectionalLight, HemisphereLight,
  BoxGeometry, MeshBasicMaterial, DoubleSide, PCFSoftShadowMap, MathUtils, Object3D, Group, AnimationClip, Vector2
} from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { SimplexNoise } from 'three/examples/jsm/math/SimplexNoise.js';
import WebGL from 'three/examples/jsm/capabilities/WebGL.js';
import { Character, Entity } from './entities'; // Removed Observation import
import { createTree, createRock, createHerb } from './objects';
import { InteractionSystem, Physics, ThirdPersonCamera, Controls } from './system';
import { HUD, InventoryDisplay, JournalDisplay, Minimap } from './ui';
import { Inventory, EventLog, getTerrainHeight, randomFloat, smoothstep, EventEntry } from './ultils';
import { AIController } from './ai';
// Removed sendToGemini import from here


const WORLD_SIZE = 100;
const TERRAIN_SEGMENTS = 15;

// Removed sendToGemini function from here

async function loadModels(): Promise<Record<string, { scene: Group; animations: AnimationClip[] }>> {
  const loader = new GLTFLoader();
  const modelPaths = {
    player: 'assets/player/scene.gltf',
    tavernMan: 'assets/the_tavern_man_2/scene.gltf',
    oldMan: 'assets/the_tavern_old_man/scene.gltf',
    woman: 'assets/the_tavern_woman_2/scene.gltf',
  };
  const models: Record<string, { scene: Group; animations: AnimationClip[] }> = {};
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
  const hemisphereLight = new HemisphereLight(0x87CEEB, 0x98FB98, 0.3);
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
  const addCharacter = (pos: Vector3, name: string, modelKey: string, isPlayer: boolean = false): Character => {
    const model = models[modelKey];
    const charInventory = new Inventory(9);
    const character = new Character(scene, pos, name, model.scene, model.animations, charInventory);
    character.mesh!.position.y = getTerrainHeight(scene, pos.x, pos.z);
    character.game = gameInstance; // Assign game instance
    if (isPlayer) {
        character.name = 'Character';
        character.userData.isPlayer = true;
        character.userData.isNPC = false;
         if (character.aiController) character.aiController = null; // Remove AI for player
    } else {
        character.userData.isPlayer = false;
        character.userData.isNPC = true;
        if (!character.aiController) console.warn(`NPC ${name} created without AIController!`); // Should be created in constructor
    }
    entities.push(character);
    collidableObjects.push(character.mesh!);
    interactableObjects.push(character);
    return character;
  };
  const farmerGiles = addCharacter(villageCenter.clone().add(new Vector3(-12, 0, 2)), 'Farmer Giles', 'tavernMan');
  farmerGiles.persona = "A hardworking farmer who values community and is always willing to help others. He is knowledgeable about crops and livestock but can be a bit stubborn. He prefers to stay close to his farm but will venture out if necessary.";
  if (farmerGiles.aiController) farmerGiles.aiController.persona = farmerGiles.persona; // Sync persona

  const blacksmithBrynn = addCharacter(villageCenter.clone().add(new Vector3(10, 0, -3)), 'Blacksmith Brynn', 'woman');
  blacksmithBrynn.persona = "A skilled artisan who takes pride in her work. She is strong-willed and independent, often focused on her craft. She can be gruff but has a kind heart, especially towards those in need.";
   if (blacksmithBrynn.aiController) blacksmithBrynn.aiController.persona = blacksmithBrynn.persona;

  const hunterRex = addCharacter(new Vector3(halfSize * 0.4, 0, -halfSize * 0.3), 'Hunter Rex', 'oldMan');
  hunterRex.persona = "An experienced tracker and survivalist. He is quiet and observant, preferring the wilderness over the village. He is resourceful and can be relied upon in tough situations but is not very social.";
   if (hunterRex.aiController) hunterRex.aiController.persona = hunterRex.persona;


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
      obj.userData.id = `${obj.name}_${obj.uuid.substring(0, 6)}`;
    }
  };
  addObject(createTree, 100, 25 * 25);
  addObject(createRock, 50, 20 * 20, randomFloat(1, 2.5));
  addObject(createHerb, 30, 10 * 10);
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

export class Game {
  scene: Scene | null = null;
  renderer: WebGLRenderer | null = null;
  camera: PerspectiveCamera | null = null;
  clock: Clock | null = null;
  activeCharacter: Character | null = null;
  thirdPersonCamera: ThirdPersonCamera | null = null;
  controls: Controls | null = null;
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

  constructor() {}

  async init(): Promise<void> {
    this.clock = new Clock();
    this.initRenderer();
    this.initScene();
    this.initCamera();
    this.initInventory();
    const models = await loadModels();
    this.initPlayer(models);
    this.initControls();
    this.initPhysics();
    this.initEnvironment(models); // Environment needs player inventory, so call after player init
    this.initSystems();
    this.initUI();
    this.setupUIControls();

    // Assign game instance after all entities (including player) are created
     this.entities.forEach(entity => {
       if (entity instanceof Character) {
         entity.game = this;
       }
     });

    this.activeCharacter!.eventLog.addEntry("Welcome! Click window to lock controls. [I] Inventory, [J] Journal, [E] Interact, [C] Switch Control, [Esc] Unlock/Close UI");
  }

  initRenderer(): void {
    this.renderer = new WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(window.devicePixelRatio);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = PCFSoftShadowMap;
    document.getElementById('game-container')?.appendChild(this.renderer.domElement);
    this.intentContainer = document.getElementById('intent-container');
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

   initInventory(): void {
    this.inventory = new Inventory(9);
  }

  initPlayer(models: Record<string, { scene: Group; animations: AnimationClip[] }>): void {
    const playerSpawnPos = new Vector3(0, 0, 5);
    playerSpawnPos.y = getTerrainHeight(this.scene!, playerSpawnPos.x, playerSpawnPos.z);

    const playerModel = models.player;
    this.activeCharacter = new Character(this.scene!, playerSpawnPos, 'Character', playerModel.scene, playerModel.animations, this.inventory!);
    this.activeCharacter.userData.isPlayer = true;
    this.activeCharacter.userData.isNPC = false;
    if (this.activeCharacter.aiController) {
        this.activeCharacter.aiController = null; // Ensure player doesn't have AI controller
    }
    this.entities.push(this.activeCharacter);
    this.collidableObjects.push(this.activeCharacter.mesh!);
    this.interactableObjects.push(this.activeCharacter); // Player can be interacted with (for switching control)
  }

  initControls(): void {
    this.thirdPersonCamera = new ThirdPersonCamera(this.camera!, this.activeCharacter!.mesh!);
    this.controls = new Controls(this.activeCharacter, this.thirdPersonCamera, this.renderer!.domElement);
  }

  initPhysics(): void {
    this.physics = new Physics(this.activeCharacter!, this.collidableObjects);
  }

  initEnvironment(models: Record<string, { scene: Group; animations: AnimationClip[] }>): void {
    populateEnvironment(this.scene!, WORLD_SIZE, this.collidableObjects, this.interactableObjects, this.entities, this.inventory!, models, this);
  }

  initSystems(): void {
    this.interactionSystem = new InteractionSystem(this.activeCharacter!, this.camera!, this.interactableObjects, this.controls!, this.inventory!, this.activeCharacter!.eventLog);
  }

   initUI(): void {
    this.hud = new HUD(this.activeCharacter!);
    this.minimap = new Minimap(document.getElementById('minimap-canvas') as HTMLCanvasElement, this.activeCharacter!, this.entities, WORLD_SIZE);
    this.inventoryDisplay = new InventoryDisplay(this.inventory!);
    this.journalDisplay = new JournalDisplay(this.activeCharacter!.eventLog);
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
    this.controls!.addKeyDownListener('KeyC', () => {
      if (this.interactionSystem!.currentTarget instanceof Character && this.interactionSystem!.currentTarget !== this.activeCharacter) {
        this.switchControlTo(this.interactionSystem!.currentTarget);
      }
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
    this.logEvent(this.activeCharacter!, 'examine', `Examined ${item.name}.`, undefined, { item: item.name }, this.activeCharacter!.mesh!.position);
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
    if (!this.clock || !this.renderer || !this.scene || !this.camera || !this.activeCharacter) return;
    const deltaTime = Math.min(this.clock.getDelta(), 0.05);
    this.controls!.update(deltaTime);
    if (!this.isPaused) {
      this.activeCharacter.update(deltaTime, {
        moveState: this.controls!.moveState,
        collidables: this.collidableObjects
      });
      this.physics!.update(deltaTime);

      this.entities.forEach(entity => {
        if (entity === this.activeCharacter) return;
        if (entity instanceof Character && entity.aiController) {
          const aiMoveState = entity.aiController.computeAIMoveState(deltaTime);
          entity.update(deltaTime, { moveState: aiMoveState, collidables: this.collidableObjects });
        } else if (entity.update && !(entity instanceof Character)) {
            entity.update(deltaTime);
        }
      });

      this.entities.forEach(entity => {
        if (entity instanceof Character && entity.aiController) {
          entity.aiController.updateObservation(this.entities);
        }
      });


      this.interactionSystem!.update(deltaTime);
      this.thirdPersonCamera!.update(deltaTime, this.collidableObjects);
      if (this.activeCharacter.isDead) this.respawnPlayer();
    }
     this.hud!.update();
     this.updateIntentDisplays();
     this.renderer.render(this.scene, this.camera);
     this.minimap!.update();

      }

  updateIntentDisplays(): void {
    if (!this.intentContainer) return;
    this.entities.forEach(entity => {
      if (entity instanceof Character && entity.aiController && entity.aiController.currentIntent) {
        let intentElement = document.getElementById(`intent-${entity.id}`) as HTMLElement;
        if (!intentElement) {
          intentElement = document.createElement('div');
          intentElement.id = `intent-${entity.id}`;
          intentElement.classList.add('intent-text');
          this.intentContainer!.appendChild(intentElement);
        }
        intentElement.textContent = `${entity.name}: ${entity.aiController.currentIntent}`;
        const screenPos = this.worldToScreenPosition(entity.mesh!.position.clone().add(new Vector3(0, entity.userData.height! + 0.5, 0)));
        if (screenPos) {
          intentElement.style.left = `${screenPos.x}px`;
          intentElement.style.top = `${screenPos.y}px`;
          intentElement.style.display = 'block';
        } else {
          intentElement.style.display = 'none';
        }
      } else if (entity instanceof Character) {
        const intentElement = document.getElementById(`intent-${entity.id}`);
        if (intentElement) {
          intentElement.style.display = 'none';
        }
      }
    });
  }

  worldToScreenPosition(worldPos: Vector3): {x: number, y: number} | null {
    if (!this.camera || !this.renderer) return null;
    const vector = worldPos.clone().project(this.camera);
    const x = (vector.x * 0.5 + 0.5) * this.renderer.domElement.width;
    const y = (vector.y * -0.5 + 0.5) * this.renderer.domElement.height;
    if (vector.z > 1.0 || vector.z < -1.0) return null;
    return {x, y};
  }

  respawnPlayer(): void {
    const respawnMessage = `${this.activeCharacter!.name} blacked out and woke up back near the village...`;
    this.logEvent(this.activeCharacter!, 'respawn_start', respawnMessage, undefined, {}, this.activeCharacter!.mesh!.position);

    const goldCount = this.inventory!.countItem('gold');
    const goldPenalty = Math.min(10, Math.floor(goldCount * 0.1));
    if (goldPenalty > 0) {
      this.inventory!.removeItem('gold', goldPenalty);
      const penaltyMessage = `Lost ${goldPenalty} gold.`;
      this.logEvent(this.activeCharacter!, 'penalty', penaltyMessage, undefined, { item: 'gold', amount: goldPenalty }, this.activeCharacter!.mesh!.position);
    }
    const respawnPos = new Vector3(0, 0, 10);
    respawnPos.y = getTerrainHeight(this.scene!, respawnPos.x, respawnPos.z);
    this.activeCharacter!.respawn(respawnPos);
    this.setPauseState(false);
    this.interactionSystem!.cancelGatherAction();
  }

  switchControlTo(targetCharacter: Character): void {
    if (targetCharacter === this.activeCharacter || !targetCharacter.mesh) return;

    const oldPlayer = this.activeCharacter!;
    const newPlayer = targetCharacter;

    const switchMessage = `Switched control to ${newPlayer.name}.`;
    this.logEvent(oldPlayer, "control_switch_out", switchMessage, newPlayer.name, {}, oldPlayer.mesh!.position);
    this.logEvent(newPlayer, "control_switch_in", switchMessage, oldPlayer.name, {}, newPlayer.mesh!.position);

    oldPlayer.userData.isPlayer = false;
    oldPlayer.userData.isNPC = true;
    if (!oldPlayer.aiController) {
      console.warn(`Creating AIController for ${oldPlayer.name} on switch-out.`);
      oldPlayer.aiController = new AIController(oldPlayer);
      oldPlayer.aiController.persona = oldPlayer.persona;
    }
    oldPlayer.aiController!.aiState = 'idle';
    oldPlayer.aiController!.previousAiState = 'idle';


    this.activeCharacter = newPlayer;
    newPlayer.userData.isPlayer = true;
    newPlayer.userData.isNPC = false;
    if (newPlayer.aiController) {
         newPlayer.aiController = null; // Player doesn't need AI Controller active
    }

    this.controls!.player = newPlayer;
    this.thirdPersonCamera!.target = newPlayer.mesh!;
    this.physics!.player = newPlayer;
    this.interactionSystem!.player = newPlayer;
    this.interactionSystem!.eventLog = newPlayer.eventLog;
    this.inventory = newPlayer.inventory;
    // this.inventoryDisplay!.setInventory(this.inventory!);
    this.hud!.player = newPlayer;
    this.minimap!.player = newPlayer;
    this.journalDisplay!.setEventLog(newPlayer.eventLog);

    // this.interactionSystem!.cancelInteraction();
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

  logEvent(actor: Character, action: string, message: string, target?: string, details: Record<string, any> = {}, location: Vector3 = actor.mesh!.position): void {
    const eventEntry: EventEntry = {
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
      message,
      actor: actor.name,
      action,
      target,
      details,
      location: location.clone(),
    };
    actor.eventLog.addEntry(eventEntry);
    this.entities.forEach(entity => {
      if (entity instanceof Character && entity !== actor && entity.aiController) {
        const distanceSq = location.distanceToSquared(entity.mesh!.position);
        if (distanceSq <= entity.searchRadius * entity.searchRadius) {
           entity.eventLog.addEntry(eventEntry);
        }
      }
    });
  }
}

declare global {
    interface Window { game: Game; }
}


if (WebGL.isWebGL2Available()) {
  async function startGame() {
    const gameInstance = new Game();
    window.game = gameInstance;
    await gameInstance.init();
    gameInstance.start();
    const onResize = () => gameInstance.onWindowResize();
    window.addEventListener('resize', onResize, false);
    window.addEventListener('beforeunload', () => window.removeEventListener('resize', onResize));
  }
  startGame();
} else {
  const warning = WebGL.getWebGLErrorMessage();
  document.getElementById('game-container')?.appendChild(warning);
}