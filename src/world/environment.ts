import * as THREE from 'three';
import { NPC } from '../entities/npc';
import { Animal } from '../entities/animal';
import { Entity } from '../entities/entity';
import { InteractableObject } from '../systems/interaction';
import { Colors, randomFloat, randomInt, smoothstep } from '../utils/helpers';
import { QuestLog, EventLog } from '../systems/quest';
import { Inventory } from '../systems/inventory';
import { QuestData } from '../types/common';

// --- Reusable Materials ---
// Use MeshLambertMaterial for better performance than StandardMaterial if features aren't needed
const treeTrunkMat = new THREE.MeshLambertMaterial({ color: Colors.PASTEL_BROWN });
const treeFoliageMat = new THREE.MeshLambertMaterial({ color: Colors.PASTEL_GREEN });
const rockMat = new THREE.MeshLambertMaterial({ color: Colors.PASTEL_GRAY });
const herbMat = new THREE.MeshLambertMaterial({ color: Colors.FOREST_GREEN });
const cabinWallMat = new THREE.MeshLambertMaterial({ color: Colors.PASTEL_BROWN });
const cabinRoofMat = new THREE.MeshLambertMaterial({ color: Colors.PASTEL_ROOF });
const windmillBaseMat = new THREE.MeshLambertMaterial({ color: Colors.PASTEL_GRAY });
const windmillBladeMat = new THREE.MeshLambertMaterial({ color: Colors.PASTEL_BROWN });
const chestMat = new THREE.MeshLambertMaterial({ color: Colors.SADDLE_BROWN });
const bowMat = new THREE.MeshLambertMaterial({ color: Colors.SIENNA });

// --- Helper Creation Functions ---

function createTree(position: THREE.Vector3): THREE.Group {
    const trunkHeight = randomFloat(3, 5);
    const trunkRadius = randomFloat(0.3, 0.5);
    const foliageHeight = trunkHeight * 1.2 + randomFloat(0, 1);
    const foliageRadius = trunkRadius * 3 + randomFloat(0, 1.5);

    const treeGroup = new THREE.Group();
    treeGroup.name = "Tree";

    const trunkGeo = new THREE.CylinderGeometry(trunkRadius * 0.8, trunkRadius, trunkHeight, 8);
    const trunkMesh = new THREE.Mesh(trunkGeo, treeTrunkMat);
    trunkMesh.position.y = trunkHeight / 2;
    trunkMesh.castShadow = true;
    trunkMesh.receiveShadow = true;
    treeGroup.add(trunkMesh);

    const foliageGeo = new THREE.ConeGeometry(foliageRadius, foliageHeight, 6);
    const foliageMesh = new THREE.Mesh(foliageGeo, treeFoliageMat);
    foliageMesh.position.y = trunkHeight + foliageHeight / 3;
    foliageMesh.castShadow = true;
    treeGroup.add(foliageMesh);

    treeGroup.position.copy(position).setY(0); // Base at Y=0 initially

    // UserData setup
    treeGroup.userData = {
        ...treeGroup.userData, // Preserve any existing userData
        isCollidable: true,
        isInteractable: true,
        interactionType: 'gather',
        resource: 'wood',
        gatherTime: 3000, // ms
        prompt: "Press E to gather Wood",
        isDepletable: true,
        respawnTime: 20000, // 20 seconds
        entityReference: treeGroup, // Reference self for interaction system
        boundingBox: new THREE.Box3().setFromObject(treeGroup) // Calculate and store AABB
    };

    return treeGroup;
}

function createRock(position: THREE.Vector3, size: number): THREE.Group {
    const rockGroup = new THREE.Group();
    rockGroup.name = "Rock";
    const height = size * randomFloat(0.5, 1.0);
    const geo = new THREE.BoxGeometry(size, height, size * randomFloat(0.8, 1.2));
    const mesh = new THREE.Mesh(geo, rockMat);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.rotation.set(
        randomFloat(-0.1, 0.1) * Math.PI,
        randomFloat(0, 2) * Math.PI,
        randomFloat(-0.1, 0.1) * Math.PI
    );
    rockGroup.add(mesh);
    rockGroup.position.copy(position).setY(0); // Base at Y=0 initially

    // UserData setup
    rockGroup.userData = {
        ...rockGroup.userData,
        isCollidable: true,
        isInteractable: true,
        interactionType: 'gather',
        resource: 'stone',
        gatherTime: 4000, // ms
        prompt: "Press E to gather Stone",
        isDepletable: true,
        respawnTime: 30000, // 30 seconds
        entityReference: rockGroup,
        boundingBox: new THREE.Box3().setFromObject(rockGroup)
    };
     // Adjust position based on bounding box min Y after setting it
     // rockGroup.position.y -= rockGroup.userData.boundingBox.min.y; // Snap base to Y=0

    return rockGroup;
}


function createHerb(position: THREE.Vector3): THREE.Group {
    const herbGroup = new THREE.Group();
    herbGroup.name = "Herb Plant";
    const size = 0.25;
    const geo = new THREE.SphereGeometry(size, 5, 4); // Simple sphere
    const mesh = new THREE.Mesh(geo, herbMat);
    mesh.castShadow = true;
    herbGroup.add(mesh);
    herbGroup.position.copy(position).setY(size); // Place base slightly above ground

    herbGroup.userData = {
        ...herbGroup.userData,
        isCollidable: false,
        isInteractable: true,
        interactionType: 'gather',
        resource: 'herb',
        gatherTime: 1500, // ms
        prompt: "Press E to gather Herb",
        isDepletable: true,
        respawnTime: 15000, // 15 seconds
        entityReference: herbGroup,
         // Bounding box optional for non-collidable, but interaction might use it
         boundingBox: new THREE.Box3().setFromObject(herbGroup)
    };
    return herbGroup;
}

function createCabin(position: THREE.Vector3, rotationY: number = 0): THREE.Group {
    const cabinGroup = new THREE.Group();
    cabinGroup.name = "Cabin";
    const wallHeight = 3, wallWidth = 5, wallDepth = 4;

    const wallGeo = new THREE.BoxGeometry(wallWidth, wallHeight, wallDepth);
    const wallMesh = new THREE.Mesh(wallGeo, cabinWallMat);
    wallMesh.position.y = wallHeight / 2;
    wallMesh.castShadow = true;
    wallMesh.receiveShadow = true;
    cabinGroup.add(wallMesh);

    const roofHeight = 1.5;
    const roofGeo = new THREE.ConeGeometry(Math.max(wallWidth, wallDepth) * 0.7, roofHeight, 4);
    const roofMesh = new THREE.Mesh(roofGeo, cabinRoofMat);
    roofMesh.position.y = wallHeight + roofHeight / 2;
    roofMesh.rotation.y = Math.PI / 4; // Align roof edges
    roofMesh.castShadow = true;
    cabinGroup.add(roofMesh);

    cabinGroup.position.copy(position).setY(0);
    cabinGroup.rotation.y = rotationY;

    cabinGroup.userData = {
        ...cabinGroup.userData,
        isCollidable: true,
        isInteractable: false,
        entityReference: cabinGroup,
        boundingBox: new THREE.Box3().setFromObject(cabinGroup).expandByScalar(0.05)
    };
    return cabinGroup;
}

// Extends THREE.Group to include update method for animation
class Windmill extends THREE.Group {
    public bladeAssembly: THREE.Group;

    constructor(position: THREE.Vector3) {
        super();
        this.name = "Windmill";
        const baseHeight = 8, baseRadiusTop = 1.5, baseRadiusBottom = 2.5;
        const bladeLength = 5, bladeWidth = 0.5, bladeDepth = 0.1;

        const baseGeo = new THREE.CylinderGeometry(baseRadiusTop, baseRadiusBottom, baseHeight, 12);
        const baseMesh = new THREE.Mesh(baseGeo, windmillBaseMat);
        baseMesh.position.y = baseHeight / 2;
        baseMesh.castShadow = true; baseMesh.receiveShadow = true;
        this.add(baseMesh);

        this.bladeAssembly = new THREE.Group();
        this.bladeAssembly.position.set(0, baseHeight, baseRadiusTop * 0.8);
        this.add(this.bladeAssembly);

        for (let i = 0; i < 4; i++) {
            const bladeGeo = new THREE.BoxGeometry(bladeWidth, bladeLength, bladeDepth);
            bladeGeo.translate(0, bladeLength / 2, 0); // Pivot at base
            const bladeMesh = new THREE.Mesh(bladeGeo, windmillBladeMat);
            bladeMesh.castShadow = true;
            bladeMesh.rotation.z = (i * Math.PI) / 2; // Rotate blade around assembly point
            this.bladeAssembly.add(bladeMesh);
        }

        this.position.copy(position).setY(0);

        this.userData = {
            isCollidable: true, // Base is collidable
            isInteractable: false,
            entityReference: this,
             // Simple box for base, could be expanded dynamically
            boundingBox: new THREE.Box3().setFromObject(baseMesh).expandByScalar(0.1)
        };
    }

    // Update method for animation
    public update(deltaTime: number): void {
        this.bladeAssembly.rotation.z += 0.5 * deltaTime;
        // Note: Bounding box doesn't update with blades unless implemented
    }
}


// Extends THREE.Group to include state and methods for chest animation/interaction
class Chest extends THREE.Group {
    public lid: THREE.Group;
    private isOpen: boolean;
    private openAngle: number;
    private closedAngle: number;
    private targetAngle: number;
    private isAnimating: boolean;
    public loot: Record<string, number>; // Make loot public for interaction system

    constructor(position: THREE.Vector3, lootData: Record<string, number> = { gold: 10 }) {
        super();
        this.name = "Chest";
        const baseSize = 0.8, lidHeight = 0.2, baseHeight = baseSize * 0.6;

        const baseGeo = new THREE.BoxGeometry(baseSize, baseHeight, baseSize * 0.5);
        const baseMesh = new THREE.Mesh(baseGeo, chestMat);
        baseMesh.position.y = baseHeight / 2;
        baseMesh.castShadow = true; baseMesh.receiveShadow = true;
        this.add(baseMesh);

        this.lid = new THREE.Group();
        this.lid.position.set(0, baseHeight, -baseSize * 0.25); // Pivot point
        this.add(this.lid);

        const lidGeo = new THREE.BoxGeometry(baseSize, lidHeight, baseSize * 0.5);
        const lidMesh = new THREE.Mesh(lidGeo, chestMat);
        lidMesh.position.y = lidHeight / 2; // Position relative to pivot
        lidMesh.castShadow = true;
        this.lid.add(lidMesh);

        this.isOpen = false;
        this.openAngle = -Math.PI / 1.5;
        this.closedAngle = 0;
        this.targetAngle = 0;
        this.isAnimating = false;
        this.loot = { ...lootData }; // Store copy

        this.position.copy(position).setY(0); // Base at Y=0

        this.userData = {
            isCollidable: true,
            isInteractable: true,
            interactionType: 'open',
            prompt: "Press E to open Chest",
            entityReference: this,
            boundingBox: new THREE.Box3().setFromObject(this),
            isOpen: this.isOpen, // Expose state to interaction system if needed
            loot: this.loot // Expose loot data
        };
    }

    public update(deltaTime: number): void {
        if (!this.isAnimating) return;
        // Use smoothLerp helper for rotation
        const lerpFactor = 1.0 - Math.pow(0.05, deltaTime); // Adjust base (0.05) for speed
        this.lid.rotation.x = THREE.MathUtils.lerp(this.lid.rotation.x, this.targetAngle, lerpFactor);

        if (Math.abs(this.lid.rotation.x - this.targetAngle) < 0.01) {
            this.lid.rotation.x = this.targetAngle; // Snap to final angle
            this.isAnimating = false;
            // console.log("Chest animation finished.");
        }
    }

    public open(): boolean {
        if (this.isOpen || this.isAnimating) return false; // Prevent opening if already open or moving
        this.isOpen = true;
        this.targetAngle = this.openAngle;
        this.isAnimating = true;
        this.userData.isOpen = true; // Update userData state
        this.userData.isInteractable = false; // Disable interaction after opening
        this.userData.prompt = "Empty Chest";
        return true;
    }

    public close(): void { // Optional close functionality
        if (!this.isOpen || this.isAnimating) return;
        this.isOpen = false;
        this.targetAngle = this.closedAngle;
        this.isAnimating = true;
        this.userData.isOpen = false;
         // Make interactable again? Depends on design.
        // this.userData.isInteractable = true;
        // this.userData.prompt = "Press E to open Chest";
    }
}


// --- Main Population Function ---

// Define simplified Quest Definition structure locally or import full QuestData type
interface SimpleQuestDef extends Partial<QuestData> {
    id: string;
    title: string;
    description: string;
    objectives: QuestData['objectives']; // Use the objectives type from common.ts
    reward?: QuestData['reward'];
}

export function populateEnvironment(
    scene: THREE.Scene,
    worldSize: number,
    collidableObjects: THREE.Object3D[], // Add meshes/groups
    interactableObjects: Array<Entity | InteractableObject | THREE.Object3D>, // Add class instances or groups with interactable data
    entities: Array<Entity | THREE.Object3D>, // Add instances needing .update() call (Player, NPC, Animal, Windmill, Chest)
    questLog: QuestLog,
    inventory: Inventory,
    eventLog: EventLog
): void {
    const halfSize = worldSize / 2;
    const terrain = scene.getObjectByName("Terrain") as THREE.Mesh | undefined; // Type cast

    // Helper to get terrain height safely
    const getTerrainHeight = (x: number, z: number): number => {
        if (!terrain?.geometry) return 0;
        // Consider using a more robust method like raycasting if terrain is complex
        const raycaster = new THREE.Raycaster(new THREE.Vector3(x, 100, z), new THREE.Vector3(0, -1, 0));
        const intersects = raycaster.intersectObject(terrain);
        return intersects.length > 0 ? intersects[0].point.y : 0;
    };

    // --- Village ---
    const villageCenter = new THREE.Vector3(5, 0, 10);
    const cabinPositions = [
        villageCenter.clone().add(new THREE.Vector3(-10, 0, 0)),
        villageCenter.clone().add(new THREE.Vector3(8, 0, -5)),
        villageCenter.clone().add(new THREE.Vector3(-5, 0, 10)),
    ];
    const cabinRotations = [Math.PI / 16, -Math.PI / 8, Math.PI / 2];

    cabinPositions.forEach((pos, i) => {
        const cabin = createCabin(pos, cabinRotations[i]);
        cabin.position.y = getTerrainHeight(pos.x, pos.z);
        scene.add(cabin);
        collidableObjects.push(cabin); // Add group to collidables
    });

    // --- NPCs ---
    const addNpc = (pos: THREE.Vector3, name: string, accessory: 'none' | 'straw_hat' | 'cap'): NPC => {
        const npc = new NPC(scene, pos, name, accessory, questLog, inventory);
        npc.mesh.position.y = getTerrainHeight(pos.x, pos.z);
        entities.push(npc); // Add instance for updates
        collidableObjects.push(npc.mesh); // Add mesh for collision
        interactableObjects.push(npc); // Add instance for interaction
        return npc;
    };
    const farmer = addNpc(villageCenter.clone().add(new THREE.Vector3(-12, 0, 2)), 'Farmer Giles', 'straw_hat');
    const blacksmith = addNpc(villageCenter.clone().add(new THREE.Vector3(10, 0, -3)), 'Blacksmith Brynn', 'cap');
    const hunter = addNpc(new THREE.Vector3(halfSize * 0.4, 0, -halfSize * 0.3), 'Hunter Rex', 'none');

    // --- Quest Definitions & Assignment ---
    const questDefinitions: Record<string, SimpleQuestDef> = {
        gatherWood: {
            id: 'gatherWood', title: 'Wood for the Winter',
            description: 'Farmer Giles looks worried. "The nights are getting colder. Could you gather 5 Wood for me?"',
            objectives: [{ type: 'gather', item: 'wood', amount: 5, turnIn: true }],
            reward: { gold: 10, items: [{ name: 'Health Potion', amount: 1 }] }
        },
        findBow: {
            id: 'findBow', title: 'Lost Bow',
            description: 'Hunter Rex sighs. "Blast it! I left my favorite bow near the old cave entrance to the southeast. Can you retrieve it for me?"',
            objectives: [{ type: 'retrieve', item: 'Hunter\'s Bow', amount: 1, locationHint: 'old cave SE', turnIn: true }],
            reward: { gold: 25 }
        }
        // Add blacksmith quest definition here...
    };
    questLog.addQuestDefinitions(questDefinitions as Record<string, QuestData>); // Add definitions
    farmer.assignQuest(questDefinitions.gatherWood as QuestData);
    hunter.assignQuest(questDefinitions.findBow as QuestData);


    // --- Environmental Objects ---
    const addObject = (creator: (pos: THREE.Vector3, ...args: any[]) => THREE.Group, count: number, minDistSq: number, ...args: any[]) => {
        for (let i = 0; i < count; i++) {
            const x = randomFloat(-halfSize * 0.95, halfSize * 0.95);
            const z = randomFloat(-halfSize * 0.95, halfSize * 0.95);
            const distSq = (x - villageCenter.x)**2 + (z - villageCenter.z)**2;
            if (distSq < minDistSq) continue;

            const obj = creator(new THREE.Vector3(x, 0, z), ...args);
             // Adjust Y pos based on computed bounding box if needed, or use raycast height
             const height = getTerrainHeight(x, z);
             // Adjust based on object's base: for trees/rocks, base is at Y=0 of group initially
             obj.position.y = height;
             // For herbs, base is slightly above ground
             if (obj.name === "Herb Plant") obj.position.y = height + 0.1;

            scene.add(obj);
            if (obj.userData.isCollidable) collidableObjects.push(obj);
            if (obj.userData.isInteractable) interactableObjects.push(obj); // Push the group/object itself
        }
    };

    addObject(createTree, 150, 25 * 25);
    addObject(createRock, 80, 20 * 20, randomFloat(1, 2.5)); // Pass random size
    addObject(createHerb, 60, 10 * 10);

    // --- Animals ---
    const addAnimal = (type: 'Deer' | 'Wolf' | 'Rabbit', count: number, area?: { x: number, z: number, range: number }) => {
        for (let i = 0; i < count; i++) {
            let x, z;
            if (area) {
                x = area.x + randomFloat(-area.range, area.range);
                z = area.z + randomFloat(-area.range, area.range);
            } else {
                x = randomFloat(-halfSize * 0.85, halfSize * 0.85);
                z = randomFloat(-halfSize * 0.85, halfSize * 0.85);
            }
            const pos = new THREE.Vector3(x, 0, z);
            const animal = new Animal(scene, pos, type, worldSize);
            animal.mesh.position.y = getTerrainHeight(x, z); // Place on terrain
            entities.push(animal);
            if (animal.userData.isCollidable) collidableObjects.push(animal.mesh);
            if (animal.userData.isInteractable) interactableObjects.push(animal); // Add instance if interactable
        }
    };

    addAnimal('Deer', 12);
    addAnimal('Wolf', 6, { x: halfSize * 0.6, z: -halfSize * 0.6, range: halfSize * 0.35 });
    addAnimal('Rabbit', 15);

    // --- Landmarks ---
    const windmillPos = new THREE.Vector3(-halfSize * 0.6, 0, -halfSize * 0.2);
    const windmill = new Windmill(windmillPos);
    windmill.position.y = getTerrainHeight(windmillPos.x, windmillPos.z);
    scene.add(windmill);
    collidableObjects.push(windmill); // Add group for collision
    entities.push(windmill); // Add instance for animation update

    // Cave Entrance Area & Hunter's Bow Item
    const caveAreaCenter = new THREE.Vector3(halfSize * 0.7, 0, halfSize * 0.6);
    // Add cave visual indicator maybe
    const bowPos = caveAreaCenter.clone().add(new THREE.Vector3(3, 0, 2));
    bowPos.y = getTerrainHeight(bowPos.x, bowPos.z) + 0.1; // Place slightly above ground
    const huntersBowItem = new InteractableObject(
        'hunters_bow_item', bowPos, 'retrieve', 'Hunter\'s Bow', 'Press E to pick up Bow', scene
    );
    // Create a visual mesh for the bow item
    const bowGeo = new THREE.BoxGeometry(0.1, 1.2, 0.1); // Simple representation
    huntersBowItem.mesh = new THREE.Mesh(bowGeo, bowMat);
    huntersBowItem.mesh.position.copy(huntersBowItem.position).add(new THREE.Vector3(0, 0.6, 0)); // Adjust visual position
    huntersBowItem.mesh.rotation.z = Math.PI / 2.5; // Lean it
    huntersBowItem.mesh.rotation.x = Math.PI / 8;
    huntersBowItem.mesh.castShadow = true;
    huntersBowItem.mesh.userData = huntersBowItem.userData; // Link userData!
    scene.add(huntersBowItem.mesh);
    interactableObjects.push(huntersBowItem); // Add the InteractableObject instance
    // Optionally add the mesh to collidables if it should block
    // collidableObjects.push(huntersBowItem.mesh);


    // --- Chests ---
    const addChest = (pos: THREE.Vector3, loot: Record<string, number>) => {
        const chest = new Chest(pos, loot);
        chest.position.y = getTerrainHeight(pos.x, pos.z);
        scene.add(chest);
        collidableObjects.push(chest);
        interactableObjects.push(chest); // Add Chest instance
        entities.push(chest); // Add for animation update
    };
    addChest(villageCenter.clone().add(new THREE.Vector3(3, 0, 15)), { gold: 15, 'Health Potion': 1 });
    addChest(new THREE.Vector3(halfSize * 0.6 + 5, 0, -halfSize * 0.6 + 15), { wood: 5, stone: 3, herb: 2 }); // In forest


    console.log("Environment populated.");
    // Log counts after population is complete
    console.log("Total Collidables:", collidableObjects.length);
    console.log("Total Interactables:", interactableObjects.length);
    console.log("Total Entities:", entities.length);
}


export function createWorldBoundary(scene: THREE.Scene, worldSize: number, collidableObjects: THREE.Object3D[]): void {
    const thickness = 20; // Thick walls for robustness
    const height = 100; // High walls
    const halfSize = worldSize / 2;

    // Invisible material
    const boundaryMaterial = new THREE.MeshBasicMaterial({
        transparent: true, opacity: 0.0, side: THREE.DoubleSide, visible: false // Make invisible
    });

    const createWall = (px: number, pz: number, sx: number, sz: number, name: string) => {
        const wallGeo = new THREE.BoxGeometry(sx, height, sz);
        const wallMesh = new THREE.Mesh(wallGeo, boundaryMaterial);
        wallMesh.position.set(px, height / 2, pz);
        wallMesh.name = name;
        wallMesh.userData.isCollidable = true;
        // Pre-calculate and store world AABB
        wallMesh.geometry.computeBoundingBox();
        // Ensure matrix is updated before applying
        wallMesh.updateMatrixWorld(true);
        wallMesh.userData.boundingBox = wallMesh.geometry.boundingBox!.clone().applyMatrix4(wallMesh.matrixWorld); // Non-null assertion
        scene.add(wallMesh);
        collidableObjects.push(wallMesh);
    };

    createWall(halfSize + thickness / 2, 0, thickness, worldSize + thickness * 2, "Boundary+X");
    createWall(-halfSize - thickness / 2, 0, thickness, worldSize + thickness * 2, "Boundary-X");
    createWall(0, halfSize + thickness / 2, worldSize + thickness * 2, thickness, "Boundary+Z");
    createWall(0, -halfSize - thickness / 2, worldSize + thickness * 2, thickness, "Boundary-Z");

    console.log("World boundaries created.");
}