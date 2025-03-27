import * as THREE from 'three';
import { NPC } from '../entities/npc.js';
import { Animal } from '../entities/animal.js';
import { InteractableObject } from '../systems/interaction.js';

const PASTEL_GREEN = 0x98FB98;
const PASTEL_BROWN = 0xCD853F;
const PASTEL_GRAY = 0xB0C4DE;
const PASTEL_ROOF = 0xFFA07A; // Light Salmon for roofs


// --- Helper Creation Functions ---

function createTree(position) {
    const trunkHeight = Math.random() * 2 + 3; // 3m to 5m
    const trunkRadius = 0.3 + Math.random() * 0.2;
    const foliageHeight = trunkHeight * 1.5 + Math.random() * 1;
    const foliageRadius = trunkRadius * 4 + Math.random() * 2;

    const treeGroup = new THREE.Group();
    treeGroup.name = "Tree";

    // Trunk
    const trunkGeo = new THREE.CylinderGeometry(trunkRadius * 0.8, trunkRadius, trunkHeight, 8);
    const trunkMat = new THREE.MeshLambertMaterial({ color: PASTEL_BROWN });
    const trunkMesh = new THREE.Mesh(trunkGeo, trunkMat);
    trunkMesh.position.y = trunkHeight / 2;
    trunkMesh.castShadow = true;
    trunkMesh.receiveShadow = true;
    treeGroup.add(trunkMesh);

    // Foliage (Low-poly cone)
    const foliageGeo = new THREE.ConeGeometry(foliageRadius, foliageHeight, 6); // Fewer segments for low-poly
    const foliageMat = new THREE.MeshLambertMaterial({ color: PASTEL_GREEN });
    const foliageMesh = new THREE.Mesh(foliageGeo, foliageMat);
    foliageMesh.position.y = trunkHeight + foliageHeight / 2.5; // Slightly lower cone placement
    foliageMesh.castShadow = true;
    // foliageMesh.receiveShadow = true; // Optional
    treeGroup.add(foliageMesh);

    treeGroup.position.copy(position);
    treeGroup.position.y = 0; // Ensure base is at ground level initially (will be adjusted)

    // Add Bounding Box for Collision
    const box = new THREE.Box3().setFromObject(treeGroup);
    treeGroup.userData.boundingBox = box;
    treeGroup.userData.isCollidable = true;

    // Interaction Data
    treeGroup.userData.isInteractable = true;
    treeGroup.userData.interactionType = 'gather';
    treeGroup.userData.resource = 'wood';
    treeGroup.userData.gatherTime = 3000; // 3 seconds
    treeGroup.userData.prompt = "Press E to gather Wood";

    return treeGroup;
}

function createRock(position, size) {
    const rockGroup = new THREE.Group();
    rockGroup.name = "Rock";

    // Use BoxGeometry with slight random scaling for blocky look
    const geo = new THREE.BoxGeometry(size, size * (0.6 + Math.random() * 0.4), size);
    // Add some randomness to vertices for irregular shape (optional, adds complexity)
    // ... (vertex manipulation logic) ...

    const mat = new THREE.MeshLambertMaterial({ color: PASTEL_GRAY });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.rotation.y = Math.random() * Math.PI * 2;
    mesh.rotation.x = (Math.random() - 0.5) * 0.1;
    mesh.rotation.z = (Math.random() - 0.5) * 0.1;

    rockGroup.add(mesh);
    rockGroup.position.copy(position);
    rockGroup.position.y = (size * (0.6 + Math.random() * 0.4)) / 2; // Adjust based on height

    // Add Bounding Box for Collision
    const box = new THREE.Box3().setFromObject(rockGroup);
    rockGroup.userData.boundingBox = box;
    rockGroup.userData.isCollidable = true;

    // Interaction Data
    rockGroup.userData.isInteractable = true;
    rockGroup.userData.interactionType = 'gather';
    rockGroup.userData.resource = 'stone';
    rockGroup.userData.gatherTime = 4000; // 4 seconds
    rockGroup.userData.prompt = "Press E to gather Stone";

    return rockGroup;
}

function createHerb(position) {
     const herbGroup = new THREE.Group();
     herbGroup.name = "Herb Plant";

     // Simple representation: a small green sphere or low cylinder
     const geo = new THREE.SphereGeometry(0.3, 5, 4);
     const mat = new THREE.MeshLambertMaterial({ color: 0x228B22 }); // Forest Green
     const mesh = new THREE.Mesh(geo, mat);
     mesh.castShadow = true;
     herbGroup.add(mesh);

     herbGroup.position.copy(position);
     herbGroup.position.y = 0.3; // Slightly above ground

     // No collision for herbs, player walks through
     herbGroup.userData.isCollidable = false;

     // Interaction Data
     herbGroup.userData.isInteractable = true;
     herbGroup.userData.interactionType = 'gather';
     herbGroup.userData.resource = 'herb';
     herbGroup.userData.gatherTime = 1500; // 1.5 seconds
     herbGroup.userData.prompt = "Press E to gather Herb";

     return herbGroup;
}


function createCabin(position, rotationY = 0) {
    const cabinGroup = new THREE.Group();
    cabinGroup.name = "Cabin";

    const wallHeight = 3;
    const wallWidth = 5;
    const wallDepth = 4;

    // Walls
    const wallGeo = new THREE.BoxGeometry(wallWidth, wallHeight, wallDepth);
    const wallMat = new THREE.MeshLambertMaterial({ color: PASTEL_BROWN });
    const wallMesh = new THREE.Mesh(wallGeo, wallMat);
    wallMesh.position.y = wallHeight / 2;
    wallMesh.castShadow = true;
    wallMesh.receiveShadow = true;
    cabinGroup.add(wallMesh);

    // Roof
    const roofHeight = 1.5;
    const roofGeo = new THREE.ConeGeometry(Math.max(wallWidth, wallDepth) * 0.7, roofHeight, 4); // 4 sides for pyramid roof
    const roofMat = new THREE.MeshLambertMaterial({ color: PASTEL_ROOF });
    const roofMesh = new THREE.Mesh(roofGeo, roofMat);
    roofMesh.position.y = wallHeight + roofHeight / 2;
    roofMesh.rotation.y = Math.PI / 4; // Align pyramid roof edges with walls
    roofMesh.castShadow = true;
    cabinGroup.add(roofMesh);

    cabinGroup.position.copy(position);
    cabinGroup.position.y = 0; // Base at ground level
    cabinGroup.rotation.y = rotationY;

    // Add Bounding Box for Collision
    // Make it slightly larger than the visual mesh for easier collision
    const box = new THREE.Box3().setFromObject(cabinGroup).expandByScalar(0.1);
    cabinGroup.userData.boundingBox = box;
    cabinGroup.userData.isCollidable = true;
    cabinGroup.userData.isInteractable = false; // Cabins aren't interactable by default

    return cabinGroup;
}

function createWindmill(position) {
     const windmillGroup = new THREE.Group();
     windmillGroup.name = "Windmill";
     const baseHeight = 8;
     const baseRadiusTop = 1.5;
     const baseRadiusBottom = 2.5;

     // Base Tower (Tapered Cylinder)
     const baseGeo = new THREE.CylinderGeometry(baseRadiusTop, baseRadiusBottom, baseHeight, 8);
     const baseMat = new THREE.MeshLambertMaterial({ color: PASTEL_GRAY });
     const baseMesh = new THREE.Mesh(baseGeo, baseMat);
     baseMesh.position.y = baseHeight / 2;
     baseMesh.castShadow = true;
     baseMesh.receiveShadow = true;
     windmillGroup.add(baseMesh);

     // Blades (simple boxes)
     const bladeLength = 5;
     const bladeWidth = 0.5;
     const bladeDepth = 0.1;
     const bladeMat = new THREE.MeshLambertMaterial({ color: PASTEL_BROWN });

     for (let i = 0; i < 4; i++) {
         const bladeGeo = new THREE.BoxGeometry(bladeWidth, bladeLength, bladeDepth);
         const bladeMesh = new THREE.Mesh(bladeGeo, bladeMat);
         bladeMesh.castShadow = true;

         // Position blade origin at center for easy rotation
         bladeMesh.position.y = bladeLength / 2;

         const angle = (i * Math.PI) / 2;
         const bladeContainer = new THREE.Group(); // Group to rotate the blade
         bladeContainer.add(bladeMesh);
         bladeContainer.position.set(0, baseHeight, baseRadiusTop); // Position at top-front of tower
         bladeContainer.rotation.z = angle; // Rotate the container

         windmillGroup.add(bladeContainer);
     }


     windmillGroup.position.copy(position);
     windmillGroup.position.y = 0;

     const box = new THREE.Box3().setFromObject(windmillGroup).expandByScalar(0.1);
     windmillGroup.userData.boundingBox = box;
     windmillGroup.userData.isCollidable = true;
     windmillGroup.userData.isInteractable = false;

     return windmillGroup;
}

function createChest(position, loot = { gold: 10, 'Health Potion': 1 }) {
    const chestGroup = new THREE.Group();
    chestGroup.name = "Chest";

    const baseSize = 0.8;
    const lidHeight = 0.2;

    // Base
    const baseGeo = new THREE.BoxGeometry(baseSize, baseSize * 0.6, baseSize * 0.5);
    const mat = new THREE.MeshLambertMaterial({ color: 0x8B4513 }); // Saddle Brown
    const baseMesh = new THREE.Mesh(baseGeo, mat);
    baseMesh.position.y = (baseSize * 0.6) / 2;
    baseMesh.castShadow = true;
    baseMesh.receiveShadow = true;
    chestGroup.add(baseMesh);

    // Lid (pivot point needs careful placement)
    const lidGeo = new THREE.BoxGeometry(baseSize, lidHeight, baseSize * 0.5);
    const lidMesh = new THREE.Mesh(lidGeo, mat);
    lidMesh.castShadow = true;
    // Position lid relative to its bottom-back edge for pivot
    lidMesh.geometry.translate(0, lidHeight / 2, 0); // Move geometry origin
    lidMesh.position.set(0, baseSize * 0.6, -baseSize * 0.25); // Position pivot point correctly

    chestGroup.add(lidMesh);
    chestGroup.userData.lid = lidMesh; // Reference for animation
    chestGroup.userData.isOpen = false;
    chestGroup.userData.openAngle = -Math.PI / 1.5; // Angle lid opens to
    chestGroup.userData.targetAngle = 0; // Target angle for animation

    chestGroup.position.copy(position);
    chestGroup.position.y = 0; // Place base on ground

    // Collision (usually small, might not need separate collision box)
    const box = new THREE.Box3().setFromObject(chestGroup);
    chestGroup.userData.boundingBox = box;
    chestGroup.userData.isCollidable = true;

    // Interaction
    chestGroup.userData.isInteractable = true;
    chestGroup.userData.interactionType = 'open';
    chestGroup.userData.prompt = "Press E to open Chest";
    chestGroup.userData.loot = loot; // Store loot data


    // Simple animation update function
    chestGroup.update = function(deltaTime) {
        const lerpFactor = 5 * deltaTime; // Animation speed
        if (this.userData.lid) {
            this.userData.lid.rotation.x = THREE.MathUtils.lerp(
                this.userData.lid.rotation.x,
                this.userData.targetAngle,
                lerpFactor
            );
        }
    };
    // Add this chest to a list of objects that need updating in the main game loop
    // (or handle interaction system triggering the update temporarily)


    return chestGroup;
}


// --- Main Population Function ---

export function populateEnvironment(scene, worldSize, collidableObjects, interactableObjects, entities, questLog, inventory) {
    const halfSize = worldSize / 2;
    const terrain = scene.getObjectByName("Terrain"); // Assumes terrain exists

    function getTerrainHeight(x, z) {
        if (!terrain) return 0;
        const raycaster = new THREE.Raycaster(new THREE.Vector3(x, 50, z), new THREE.Vector3(0, -1, 0));
        const intersects = raycaster.intersectObject(terrain);
        return intersects.length > 0 ? intersects[0].point.y : 0;
    }

    // --- Village ---
    const villageCenter = new THREE.Vector3(0, 0, 0);
    const cabin1 = createCabin(new THREE.Vector3(villageCenter.x - 10, 0, villageCenter.z), Math.PI / 16);
    const cabin2 = createCabin(new THREE.Vector3(villageCenter.x + 8, 0, villageCenter.z - 5), -Math.PI / 8);
    const cabin3 = createCabin(new THREE.Vector3(villageCenter.x - 5, 0, villageCenter.z + 10), Math.PI / 2);
    [cabin1, cabin2, cabin3].forEach(cabin => {
        cabin.position.y = getTerrainHeight(cabin.position.x, cabin.position.z);
        scene.add(cabin);
        collidableObjects.push(cabin);
    });

    // --- NPCs ---
    const farmer = new NPC(scene, new THREE.Vector3(villageCenter.x - 12, 0, villageCenter.z + 2), 'Farmer', 'straw_hat', questLog, inventory);
    farmer.mesh.position.y = getTerrainHeight(farmer.mesh.position.x, farmer.mesh.position.z);
    entities.push(farmer);
    collidableObjects.push(farmer.mesh); // NPCs are collidable
    interactableObjects.push(farmer); // NPCs are interactable

    const blacksmith = new NPC(scene, new THREE.Vector3(villageCenter.x + 10, 0, villageCenter.z - 3), 'Blacksmith', 'cap', questLog, inventory);
    blacksmith.mesh.position.y = getTerrainHeight(blacksmith.mesh.position.x, blacksmith.mesh.position.z);
    entities.push(blacksmith);
    collidableObjects.push(blacksmith.mesh);
    interactableObjects.push(blacksmith);

    const hunter = new NPC(scene, new THREE.Vector3(halfSize * 0.4, 0, -halfSize * 0.3), 'Hunter', 'cap', questLog, inventory); // Near forest edge
    hunter.mesh.position.y = getTerrainHeight(hunter.mesh.position.x, hunter.mesh.position.z);
    entities.push(hunter);
    collidableObjects.push(hunter.mesh);
    interactableObjects.push(hunter);

    // Assign initial quests
    farmer.assignQuest({
        id: 'gatherWood',
        title: 'Wood for the Winter',
        description: 'Gather 5 Wood for me. The nights are getting colder.',
        objectives: [{ type: 'gather', item: 'wood', amount: 5, targetNPC: farmer.id }],
        reward: { gold: 10, items: [{ name: 'Health Potion', amount: 1 }] },
        status: 'available'
    });
     hunter.assignQuest({
        id: 'findBow',
        title: 'Lost Bow',
        description: 'I left my favorite bow near the old cave entrance. Can you find it?',
        objectives: [{ type: 'retrieve', item: 'hunters_bow', locationHint: 'old cave', targetNPC: hunter.id }],
        reward: { gold: 20 },
        status: 'available'
    });
     // TODO: Add blacksmith trade quest/dialogue


    // --- Trees ---
    const treeCount = 150;
    for (let i = 0; i < treeCount; i++) {
        const x = (Math.random() - 0.5) * worldSize * 0.9; // Avoid edges slightly
        const z = (Math.random() - 0.5) * worldSize * 0.9;
        // Avoid placing trees too close to the village center
        if (Math.sqrt(x*x + z*z) < 20) continue;

        const tree = createTree(new THREE.Vector3(x, 0, z));
        tree.position.y = getTerrainHeight(x, z);
        scene.add(tree);
        collidableObjects.push(tree);
        interactableObjects.push(tree); // Trees are interactable for wood
    }

    // --- Rocks ---
    const rockCount = 80;
    for (let i = 0; i < rockCount; i++) {
        const x = (Math.random() - 0.5) * worldSize * 0.9;
        const z = (Math.random() - 0.5) * worldSize * 0.9;
         if (Math.sqrt(x*x + z*z) < 15) continue; // Avoid rocks in immediate village center

        const size = 1 + Math.random() * 2; // Size from 1m to 3m
        const rock = createRock(new THREE.Vector3(x, 0, z), size);
        rock.position.y = getTerrainHeight(x, z); // Adjust based on actual height later
        scene.add(rock);
        collidableObjects.push(rock);
        interactableObjects.push(rock); // Rocks are interactable for stone
    }

     // --- Herbs ---
    const herbCount = 50;
    for (let i = 0; i < herbCount; i++) {
        const x = (Math.random() - 0.5) * worldSize * 0.9;
        const z = (Math.random() - 0.5) * worldSize * 0.9;
         if (Math.sqrt(x*x + z*z) < 10) continue; // Less dense near center

        const herb = createHerb(new THREE.Vector3(x, 0, z));
        herb.position.y = getTerrainHeight(x, z) + 0.1; // Place slightly above terrain
        scene.add(herb);
        // No collision for herbs
        interactableObjects.push(herb);
    }

    // --- Animals ---
    const deerCount = 10;
    for (let i = 0; i < deerCount; i++) {
        const x = (Math.random() - 0.5) * worldSize * 0.7; // Keep deer away from deep forest/edges initially
        const z = (Math.random() - 0.5) * worldSize * 0.7;
        const deer = new Animal(scene, new THREE.Vector3(x, 0, z), 'Deer', worldSize);
        deer.mesh.position.y = getTerrainHeight(x, z);
        entities.push(deer);
        collidableObjects.push(deer.mesh); // Animals collide
        interactableObjects.push(deer); // Deer are interactable
    }
    const wolfCount = 5;
     const forestArea = { x: halfSize * 0.6, z: -halfSize * 0.6, range: halfSize * 0.3 }; // Define rough forest center and range
    for (let i = 0; i < wolfCount; i++) {
        const x = forestArea.x + (Math.random() - 0.5) * forestArea.range * 2;
        const z = forestArea.z + (Math.random() - 0.5) * forestArea.range * 2;
        const wolf = new Animal(scene, new THREE.Vector3(x, 0, z), 'Wolf', worldSize);
        wolf.mesh.position.y = getTerrainHeight(x, z);
        entities.push(wolf);
        collidableObjects.push(wolf.mesh);
        // Wolves aren't directly 'interactable' with E, they react to player proximity
        // interactionSystem needs logic to handle hostile entities if needed, or combat system
    }
     // TODO: Rabbits (non-interactable, faster movement)


    // --- Landmarks ---
    const windmillPos = new THREE.Vector3(-halfSize * 0.6, 0, -halfSize * 0.2);
    const windmill = createWindmill(windmillPos);
    windmill.position.y = getTerrainHeight(windmillPos.x, windmillPos.z);
    scene.add(windmill);
    collidableObjects.push(windmill);

    // TODO: Cave entrance (maybe just a darker textured area on terrain or simple rock arch)
    const caveEntrancePos = new THREE.Vector3(halfSize * 0.7, 0, halfSize * 0.5);
     // Could place a special interactable item here for the hunter's quest
      const huntersBowItem = new InteractableObject(
          'hunters_bow',
          new THREE.Vector3(caveEntrancePos.x + 2, getTerrainHeight(caveEntrancePos.x+2, caveEntrancePos.z) + 0.5, caveEntrancePos.z + 1),
          'retrieve',
          'Hunter\'s Bow', // Item name to add to inventory
          'Press E to pick up Bow'
      );
      // Add a simple visual representation for the bow (e.g., small brown stick/box)
      const bowGeo = new THREE.BoxGeometry(0.1, 1, 0.1);
      const bowMat = new THREE.MeshBasicMaterial({color: 0xA0522D}); // Sienna
      huntersBowItem.mesh = new THREE.Mesh(bowGeo, bowMat);
      huntersBowItem.mesh.position.copy(huntersBowItem.position);
      huntersBowItem.mesh.rotation.z = Math.PI / 2.5; // Lean it
      scene.add(huntersBowItem.mesh);
      interactableObjects.push(huntersBowItem);


    // TODO: Ruined tower

    // --- Chests ---
    const chest1Pos = new THREE.Vector3(5, 0, 15); // Near village edge
    const chest1 = createChest(chest1Pos, { gold: 15, 'Health Potion': 1 });
    chest1.position.y = getTerrainHeight(chest1Pos.x, chest1Pos.z);
    scene.add(chest1);
    collidableObjects.push(chest1);
    interactableObjects.push(chest1);
    entities.push(chest1); // Add to entities if it needs an update loop for animation

     const chest2Pos = new THREE.Vector3(forestArea.x, 0, forestArea.z + 10); // Hidden in forest
     const chest2 = createChest(chest2Pos, { wood: 5, stone: 3 });
     chest2.position.y = getTerrainHeight(chest2Pos.x, chest2Pos.z);
     scene.add(chest2);
     collidableObjects.push(chest2);
     interactableObjects.push(chest2);
     entities.push(chest2);

    console.log("Environment populated.");
    console.log("Collidable objects:", collidableObjects.length);
    console.log("Interactable objects:", interactableObjects.length);
    console.log("Entities:", entities.length);
}


export function createWorldBoundary(scene, worldSize, collidableObjects) {
    const thickness = 10; // How thick the invisible walls are
    const height = 100; // How high they are
    const halfSize = worldSize / 2;

    const boundaryMaterial = new THREE.MeshBasicMaterial({
        // color: 0xff0000, // Make visible for debugging
        transparent: true,
        opacity: 0.0, // Make invisible
        side: THREE.DoubleSide
    });

    const planes = [
        // +X wall
        { size: [thickness, height, worldSize + thickness*2], position: [halfSize + thickness/2, height/2, 0] },
        // -X wall
        { size: [thickness, height, worldSize + thickness*2], position: [-halfSize - thickness/2, height/2, 0] },
        // +Z wall
        { size: [worldSize + thickness*2, height, thickness], position: [0, height/2, halfSize + thickness/2] },
        // -Z wall
        { size: [worldSize + thickness*2, height, thickness], position: [0, height/2, -halfSize - thickness/2] },
    ];

    planes.forEach(p => {
        const wallGeo = new THREE.BoxGeometry(...p.size);
        const wallMesh = new THREE.Mesh(wallGeo, boundaryMaterial);
        wallMesh.position.set(...p.position);
        wallMesh.userData.isCollidable = true;
        wallMesh.name = "WorldBoundary";
        // Calculate bounding box manually if needed, or rely on geometry
        wallMesh.geometry.computeBoundingBox();
        wallMesh.userData.boundingBox = wallMesh.geometry.boundingBox.clone().applyMatrix4(wallMesh.matrixWorld);

        scene.add(wallMesh);
        collidableObjects.push(wallMesh);
    });
}
