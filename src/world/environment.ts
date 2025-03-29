
import * as THREE from 'three';
import { NPC } from '../entities/npc';
import { Animal } from '../entities/animal';
import { Entity } from '../entities/entity';
import { InteractableObject } from '../systems/interaction';
import { Colors, randomFloat, randomInt, smoothstep } from '../utils/helpers';
import { QuestLog, EventLog } from '../systems/quest';
import { Inventory } from '../systems/inventory';
import { QuestData, EntityUserData } from '../types/common'; // Import EntityUserData

// --- Materials ---
const treeTrunkMat = new THREE.MeshLambertMaterial({ color: Colors.SADDLE_BROWN }); // Changed color
const treeFoliageMat = new THREE.MeshLambertMaterial({ color: Colors.FOREST_GREEN }); // Changed color
const rockMat = new THREE.MeshLambertMaterial({ color: Colors.DIM_GRAY }); // Changed color
const herbMat = new THREE.MeshLambertMaterial({ color: Colors.FOREST_GREEN });
const cabinWallMat = new THREE.MeshLambertMaterial({ color: Colors.PASTEL_BROWN });
const cabinRoofMat = new THREE.MeshLambertMaterial({ color: Colors.PASTEL_ROOF });
const windmillBaseMat = new THREE.MeshLambertMaterial({ color: Colors.PASTEL_GRAY });
const windmillBladeMat = new THREE.MeshLambertMaterial({ color: Colors.PASTEL_BROWN });
const chestMat = new THREE.MeshLambertMaterial({ color: Colors.SADDLE_BROWN });
const bowMat = new THREE.MeshLambertMaterial({ color: Colors.SIENNA });

// --- Helper Function for UserData ---
function setupInteractableData(
    object: THREE.Object3D,
    interactionType: string,
    prompt: string,
    isCollidable: boolean,
    additionalData: Partial<EntityUserData> = {}
): void {
    object.userData = {
        ...object.userData,
        entityReference: object, // Reference self (group or mesh)
        isInteractable: true,
        interactionType: interactionType,
        prompt: prompt,
        isCollidable: isCollidable,
        boundingBox: new THREE.Box3().setFromObject(object), // Calculate AABB
        ...additionalData // Merge gather/depletion data etc.
    };
}

// --- Creation Functions ---
function createTree(pos: THREE.Vector3): THREE.Group {
    const trunkH = randomFloat(3, 5), trunkR = randomFloat(0.3, 0.5);
    const foliageH = trunkH * 1.2 + randomFloat(0, 1), foliageR = trunkR * 3 + randomFloat(0, 1.5);
    const tree = new THREE.Group(); tree.name = "Tree";

    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(trunkR * 0.8, trunkR, trunkH, 8), treeTrunkMat);
    trunk.position.y = trunkH / 2; trunk.castShadow = true; trunk.receiveShadow = true; tree.add(trunk);
    const foliage = new THREE.Mesh(new THREE.ConeGeometry(foliageR, foliageH, 6), treeFoliageMat);
    foliage.position.y = trunkH + foliageH / 3; foliage.castShadow = true; tree.add(foliage);
    tree.position.copy(pos); // Set final position

    setupInteractableData(tree, 'gather', "Press E to gather Wood", true, {
        resource: 'wood', gatherTime: 3000, isDepletable: true, respawnTime: 20000
    });
    return tree;
}

function createRock(pos: THREE.Vector3, size: number): THREE.Group {
    const rock = new THREE.Group(); rock.name = "Rock";
    const height = size * randomFloat(0.5, 1.0);
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(size, height, size * randomFloat(0.8, 1.2)), rockMat);
    mesh.castShadow = true; mesh.receiveShadow = true;
    mesh.rotation.set(randomFloat(-0.1, 0.1) * Math.PI, randomFloat(0, 2) * Math.PI, randomFloat(-0.1, 0.1) * Math.PI);
    rock.add(mesh); rock.position.copy(pos);

    setupInteractableData(rock, 'gather', "Press E to gather Stone", true, {
        resource: 'stone', gatherTime: 4000, isDepletable: true, respawnTime: 30000
    });
    // rock.position.y -= rock.userData.boundingBox.min.y; // Optional: Snap base perfectly to 0
    return rock;
}

function createHerb(pos: THREE.Vector3): THREE.Group {
    const herb = new THREE.Group(); herb.name = "Herb Plant";
    const size = 0.25;
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(size, 5, 4), herbMat);
    mesh.castShadow = true; herb.add(mesh);
    herb.position.copy(pos).setY(pos.y + size); // Place base slightly above ground

    setupInteractableData(herb, 'gather', "Press E to gather Herb", false, {
        resource: 'herb', gatherTime: 1500, isDepletable: true, respawnTime: 15000
    });
    return herb;
}

function createCabin(pos: THREE.Vector3, rotY: number = 0): THREE.Group {
    const cabin = new THREE.Group(); cabin.name = "Cabin";
    const wallH = 3, wallW = 5, wallD = 4;
    const wall = new THREE.Mesh(new THREE.BoxGeometry(wallW, wallH, wallD), cabinWallMat);
    wall.position.y = wallH / 2; wall.castShadow = true; wall.receiveShadow = true; cabin.add(wall);
    const roofH = 1.5;
    const roof = new THREE.Mesh(new THREE.ConeGeometry(Math.max(wallW, wallD) * 0.7, roofH, 4), cabinRoofMat);
    roof.position.y = wallH + roofH / 2; roof.rotation.y = Math.PI / 4; roof.castShadow = true; cabin.add(roof);
    cabin.position.copy(pos); cabin.rotation.y = rotY;

    cabin.userData = { entityReference: cabin, isCollidable: true, isInteractable: false, boundingBox: new THREE.Box3().setFromObject(cabin) };
    return cabin;
}

// --- Windmill Class (Included here) ---
class Windmill extends THREE.Group {
    private bladeAssembly: THREE.Group;
    constructor(position: THREE.Vector3) {
        super(); this.name = "Windmill";
        const baseH = 8, baseRTop = 1.5, baseRBot = 2.5, bladeL = 5, bladeW = 0.5;
        const base = new THREE.Mesh(new THREE.CylinderGeometry(baseRTop, baseRBot, baseH, 12), windmillBaseMat);
        base.position.y = baseH / 2; base.castShadow = true; base.receiveShadow = true; this.add(base);
        this.bladeAssembly = new THREE.Group(); this.bladeAssembly.position.set(0, baseH, baseRTop * 0.8); this.add(this.bladeAssembly);
        for (let i = 0; i < 4; i++) {
            const bladeGeo = new THREE.BoxGeometry(bladeW, bladeL, 0.1); bladeGeo.translate(0, bladeL / 2, 0);
            const blade = new THREE.Mesh(bladeGeo, windmillBladeMat); blade.castShadow = true; blade.rotation.z = (i * Math.PI) / 2;
            this.bladeAssembly.add(blade);
        }
        this.position.copy(position);
        this.userData = { entityReference: this, isCollidable: true, isInteractable: false, boundingBox: new THREE.Box3().setFromObject(base) };
    }
    public update(deltaTime: number): void { this.bladeAssembly.rotation.z += 0.5 * deltaTime; }
}

// --- Chest Class (Included here) ---
class Chest extends THREE.Group {
    private lid: THREE.Group; private isOpen: boolean = false; private isAnimating: boolean = false;
    private openAngle: number = -Math.PI / 1.5; private closedAngle: number = 0; private targetAngle: number = 0;

    constructor(position: THREE.Vector3, lootData: Record<string, number> = { gold: 10 }) {
        super(); this.name = "Chest";
        const baseSize = 0.8, lidH = 0.2, baseH = baseSize * 0.6;
        const base = new THREE.Mesh(new THREE.BoxGeometry(baseSize, baseH, baseSize * 0.5), chestMat);
        base.position.y = baseH / 2; base.castShadow = true; base.receiveShadow = true; this.add(base);
        this.lid = new THREE.Group(); this.lid.position.set(0, baseH, -baseSize * 0.25); this.add(this.lid);
        const lidMesh = new THREE.Mesh(new THREE.BoxGeometry(baseSize, lidH, baseSize * 0.5), chestMat);
        lidMesh.position.y = lidH / 2; lidMesh.castShadow = true; this.lid.add(lidMesh);
        this.position.copy(position);

        setupInteractableData(this, 'open', "Press E to open Chest", true, {
            isOpen: this.isOpen, loot: { ...lootData } // Copy loot
        });
    }

    public update(deltaTime: number): void {
        if (!this.isAnimating) return;
        this.lid.rotation.x = smoothLerp(this.lid.rotation.x, this.targetAngle, 0.1, deltaTime); // Smoother lerp
        if (Math.abs(this.lid.rotation.x - this.targetAngle) < 0.01) {
            this.lid.rotation.x = this.targetAngle; this.isAnimating = false;
        }
    }

    public open(): boolean {
        if (this.isOpen || this.isAnimating) return false;
        this.isOpen = true; this.targetAngle = this.openAngle; this.isAnimating = true;
        this.userData.isOpen = true; this.userData.isInteractable = false; this.userData.prompt = "Empty Chest";
        return true;
    }
}

// --- Main Population Function ---
export function populateEnvironment(
    scene: THREE.Scene, worldSize: number, collidables: THREE.Object3D[],
    interactables: Array<any>, entities: Array<any>, // Use 'any' for brevity here
    questLog: QuestLog, inventory: Inventory, eventLog: EventLog
): void {
    const halfSize = worldSize / 2;
    const terrain = scene.getObjectByName("Terrain") as THREE.Mesh | undefined;
    const getTerrainHeight = (x: number, z: number): number => { // Local helper
        if (!terrain?.geometry) return 0;
        const raycaster = new THREE.Raycaster(new THREE.Vector3(x, 200, z), new THREE.Vector3(0, -1, 0));
        const intersects = raycaster.intersectObject(terrain);
        return intersects.length > 0 ? intersects[0].point.y : 0;
    };

    // --- Helper to Add Entity/Object ---
    const addToLists = (obj: any, isEntity: boolean = false, isCollidable?: boolean, isInteractable?: boolean) => {
        scene.add(obj instanceof Entity ? obj.mesh : obj);
        if (isEntity || typeof obj.update === 'function') entities.push(obj); // Add if Entity instance or has update method
        if (isCollidable ?? obj.userData?.isCollidable) collidables.push(obj instanceof Entity ? obj.mesh : obj);
        if (isInteractable ?? obj.userData?.isInteractable) interactables.push(obj); // Instance or Group
    };

    // --- Village ---
    const villageCenter = new THREE.Vector3(5, 0, 10);
    [[-10, 0, 0], [8, 0, -5], [-5, 0, 10]].forEach((offset, i) => {
        const pos = villageCenter.clone().add(new THREE.Vector3(...offset));
        const cabin = createCabin(pos, [Math.PI/16, -Math.PI/8, Math.PI/2][i]);
        cabin.position.y = getTerrainHeight(pos.x, pos.z);
        addToLists(cabin, false, true, false); // Not an entity, collidable, not interactable
    });

    // --- NPCs ---
    const farmer = new NPC(scene, villageCenter.clone().add(new THREE.Vector3(-12, 0, 2)), 'Farmer Giles', 'straw_hat', questLog, inventory);
    const blacksmith = new NPC(scene, villageCenter.clone().add(new THREE.Vector3(10, 0, -3)), 'Blacksmith Brynn', 'cap', questLog, inventory);
    const hunter = new NPC(scene, new THREE.Vector3(halfSize * 0.4, 0, -halfSize * 0.3), 'Hunter Rex', 'none', questLog, inventory);
    [farmer, blacksmith, hunter].forEach(npc => {
        npc.mesh.position.y = getTerrainHeight(npc.mesh.position.x, npc.mesh.position.z);
        addToLists(npc, true, true, true); // Entity, collidable, interactable
    });

    // --- Quests ---
    const questDefs: Record<string, QuestData> = { // Use full QuestData type
        gatherWood: { id: 'gatherWood', title: 'Wood for Winter', description: 'Gather 5 Wood for Farmer Giles.', objectives: [{ type: 'gather', item: 'wood', amount: 5, turnIn: true }], reward: { gold: 10, items: [{ name: 'Health Potion', amount: 1 }] } },
        findBow: { id: 'findBow', title: 'Lost Bow', description: 'Retrieve Hunter Rex\'s bow near the SE cave entrance.', objectives: [{ type: 'retrieve', item: 'Hunter\'s Bow', amount: 1, locationHint: 'SE cave', turnIn: true }], reward: { gold: 25 } },
    };
    questLog.addQuestDefinitions(questDefs);
    farmer.assignQuest(questDefs.gatherWood); hunter.assignQuest(questDefs.findBow);

    // --- Environmental Objects ---
    const placeObject = (creator: (pos: THREE.Vector3, ...args: any[]) => THREE.Group, count: number, minDistSq: number, ...args: any[]) => {
        for (let i = 0; i < count; i++) {
            const x = randomFloat(-halfSize * 0.95, halfSize * 0.95);
            const z = randomFloat(-halfSize * 0.95, halfSize * 0.95);
            if ((x - villageCenter.x)**2 + (z - villageCenter.z)**2 < minDistSq) continue;
            const pos = new THREE.Vector3(x, getTerrainHeight(x, z), z);
            const obj = creator(pos, ...args);
            addToLists(obj, false); // Let userData determine collidable/interactable flags
        }
    };
    placeObject(createTree, 150, 625); // 25*25
    placeObject(createRock, 80, 400, randomFloat(1, 2.5)); // Pass random size
    placeObject(createHerb, 60, 100);

    // --- Animals ---
    ['Deer', 'Wolf', 'Rabbit'].forEach((type: any) => { // Use 'any' for type casting brevity
        const count = type === 'Deer' ? 12 : (type === 'Wolf' ? 6 : 15);
        const area = type === 'Wolf' ? { x: halfSize * 0.6, z: -halfSize * 0.6, range: halfSize * 0.35 } : undefined;
        for (let i = 0; i < count; i++) {
            let x, z;
            if (area) { x = area.x + randomFloat(-area.range, area.range); z = area.z + randomFloat(-area.range, area.range); }
            else { x = randomFloat(-halfSize * 0.85, halfSize * 0.85); z = randomFloat(-halfSize * 0.85, halfSize * 0.85); }
            const pos = new THREE.Vector3(x, getTerrainHeight(x, z), z);
            const animal = new Animal(scene, pos, type, worldSize);
            addToLists(animal, true); // Let animal userData flags determine lists
        }
    });

    // --- Landmarks ---
    const windmillPos = new THREE.Vector3(-halfSize * 0.6, 0, -halfSize * 0.2);
    windmillPos.y = getTerrainHeight(windmillPos.x, windmillPos.z);
    const windmill = new Windmill(windmillPos);
    addToLists(windmill, true, true, false); // Has update, collidable, not interactable

    // --- Specific Items (Hunter's Bow) ---
    const caveAreaCenter = new THREE.Vector3(halfSize * 0.7, 0, halfSize * 0.6);
    const bowPos = caveAreaCenter.clone().add(new THREE.Vector3(3, getTerrainHeight(caveAreaCenter.x + 3, caveAreaCenter.z + 2) + 0.1, 2));
    const huntersBowItem = new InteractableObject('hunters_bow_item', bowPos, 'retrieve', 'Hunter\'s Bow', 'Press E to pick up Bow');
    const bowMesh = new THREE.Mesh(new THREE.BoxGeometry(0.1, 1.2, 0.1), bowMat); // Visual for the item
    bowMesh.position.y += 0.6; // Offset visual center
    bowMesh.rotation.set(Math.PI / 8, 0, Math.PI / 2.5); // Lean it
    bowMesh.castShadow = true;
    huntersBowItem.setMesh(bowMesh); // Assign mesh and link userData
    addToLists(huntersBowItem, false, true, true); // Add InteractableObject instance

    // --- Chests ---
    const chestPositions = [
        villageCenter.clone().add(new THREE.Vector3(3, 0, 15)),
        new THREE.Vector3(halfSize * 0.6 + 5, 0, -halfSize * 0.6 + 15)
    ];
    const chestLoot = [{ gold: 15, 'Health Potion': 1 }, { wood: 5, stone: 3, herb: 2 }];
    chestPositions.forEach((pos, i) => {
        pos.y = getTerrainHeight(pos.x, pos.z);
        const chest = new Chest(pos, chestLoot[i]);
        addToLists(chest, true, true, true); // Has update, collidable, interactable
    });

    console.log(`Environment populated: C:${collidables.length}, I:${interactables.length}, E:${entities.length}`);
}

// World Boundary creation unchanged, seems optimal.
export function createWorldBoundary(scene: THREE.Scene, worldSize: number, collidableObjects: THREE.Object3D[]): void {
    const thickness = 20, height = 100, halfSize = worldSize / 2;
    const mat = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.0, visible: false });
    const createWall = (px: number, pz: number, sx: number, sz: number, name: string) => {
        const wall = new THREE.Mesh(new THREE.BoxGeometry(sx, height, sz), mat);
        wall.position.set(px, height / 2, pz); wall.name = name; wall.userData.isCollidable = true;
        wall.geometry.computeBoundingBox(); wall.updateMatrixWorld(true);
        wall.userData.boundingBox = wall.geometry.boundingBox!.clone().applyMatrix4(wall.matrixWorld);
        scene.add(wall); collidableObjects.push(wall);
    };
    createWall(halfSize + thickness / 2, 0, thickness, worldSize + thickness * 2, "B+X");
    createWall(-halfSize - thickness / 2, 0, thickness, worldSize + thickness * 2, "B-X");
    createWall(0, halfSize + thickness / 2, worldSize + thickness * 2, thickness, "B+Z");
    createWall(0, -halfSize - thickness / 2, worldSize + thickness * 2, thickness, "B-Z");
    console.log("World boundaries created.");
}