import * as THREE from 'three';
import { NPC } from '../entities/npc.js';
import { Animal } from '../entities/animal.js';
import { InteractableObject } from '../systems/interaction.js';
import { Colors } from '../utils/helpers.js'; // Use shared colors

// --- Reusable Materials (optional performance boost) ---
const treeTrunkMat = new THREE.MeshLambertMaterial({ color: Colors.PASTEL_BROWN });
const treeFoliageMat = new THREE.MeshLambertMaterial({ color: Colors.PASTEL_GREEN });
const rockMat = new THREE.MeshLambertMaterial({ color: Colors.PASTEL_GRAY });
const herbMat = new THREE.MeshLambertMaterial({ color: Colors.FOREST_GREEN });
const cabinWallMat = new THREE.MeshLambertMaterial({ color: Colors.PASTEL_BROWN });
const cabinRoofMat = new THREE.MeshLambertMaterial({ color: Colors.PASTEL_ROOF });
const windmillBaseMat = new THREE.MeshLambertMaterial({ color: Colors.PASTEL_GRAY });
const windmillBladeMat = new THREE.MeshLambertMaterial({ color: Colors.PASTEL_BROWN });
const chestMat = new THREE.MeshLambertMaterial({ color: Colors.SADDLE_BROWN });
const bowMat = new THREE.MeshLambertMaterial({color: Colors.SIENNA});


// --- Helper Creation Functions ---

function createTree(position) {
    const trunkHeight = 3 + Math.random() * 2; // 3m to 5m
    const trunkRadius = 0.3 + Math.random() * 0.2;
    const foliageHeight = trunkHeight * 1.2 + Math.random() * 1;
    const foliageRadius = trunkRadius * 3 + Math.random() * 1.5;

    const treeGroup = new THREE.Group();
    treeGroup.name = "Tree";

    // Trunk (using shared material)
    const trunkGeo = new THREE.CylinderGeometry(trunkRadius * 0.8, trunkRadius, trunkHeight, 8);
    const trunkMesh = new THREE.Mesh(trunkGeo, treeTrunkMat);
    trunkMesh.position.y = trunkHeight / 2;
    trunkMesh.castShadow = true;
    trunkMesh.receiveShadow = true;
    treeGroup.add(trunkMesh);

    // Foliage (Low-poly cone, using shared material)
    const foliageGeo = new THREE.ConeGeometry(foliageRadius, foliageHeight, 6);
    const foliageMesh = new THREE.Mesh(foliageGeo, treeFoliageMat);
    foliageMesh.position.y = trunkHeight + foliageHeight / 3; // Position foliage base near trunk top
    foliageMesh.castShadow = true;
    treeGroup.add(foliageMesh);

    treeGroup.position.copy(position);
    treeGroup.position.y = 0; // Base at Y=0 initially, adjust later

    // Add Bounding Box for Collision (using geometry bounds)
    // Calculate combined box after placing meshes
    const box = new THREE.Box3().setFromObject(treeGroup);
    treeGroup.userData.boundingBox = box;
    treeGroup.userData.isCollidable = true;

    // Interaction Data
    treeGroup.userData.isInteractable = true;
    treeGroup.userData.interactionType = 'gather';
    treeGroup.userData.resource = 'wood';
    treeGroup.userData.gatherTime = 3000; // ms
    treeGroup.userData.prompt = "Press E to gather Wood";
    treeGroup.userData.isDepletable = true; // Flag for interaction system
    treeGroup.userData.respawnTime = 20000; // 20 seconds

    // Link back to instance for interaction system (though trees don't have methods)
    treeGroup.userData.entityReference = treeGroup; // Reference the group itself

    return treeGroup;
}

function createRock(position, size) {
    const rockGroup = new THREE.Group();
    rockGroup.name = "Rock";

    // Use BoxGeometry with slight random scaling for blocky look
    const height = size * (0.5 + Math.random() * 0.5);
    const geo = new THREE.BoxGeometry(size, height, size * (0.8 + Math.random()*0.4));

    const mesh = new THREE.Mesh(geo, rockMat); // Use shared material
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    // Apply random rotation for variety
    mesh.rotation.y = Math.random() * Math.PI * 2;
    mesh.rotation.x = (Math.random() - 0.5) * 0.2;
    mesh.rotation.z = (Math.random() - 0.5) * 0.2;

    rockGroup.add(mesh);
    rockGroup.position.copy(position);
    // Adjust base position based on calculated height
    rockGroup.position.y = height / 2; // Place center at this height, so base is at Y=0 initially

    const box = new THREE.Box3().setFromObject(rockGroup);
    rockGroup.userData.boundingBox = box;
    rockGroup.userData.isCollidable = true;
    rockGroup.userData.isInteractable = true;
    rockGroup.userData.interactionType = 'gather';
    rockGroup.userData.resource = 'stone';
    rockGroup.userData.gatherTime = 4000; // ms
    rockGroup.userData.prompt = "Press E to gather Stone";
    rockGroup.userData.isDepletable = true;
    rockGroup.userData.respawnTime = 30000; // 30 seconds
    rockGroup.userData.entityReference = rockGroup;

    return rockGroup;
}

function createHerb(position) {
     const herbGroup = new THREE.Group();
     herbGroup.name = "Herb Plant";

     // Simple representation: a small green sphere or low cylinder
     const geo = new THREE.SphereGeometry(0.25, 5, 4);
     const mesh = new THREE.Mesh(geo, herbMat); // Use shared material
     mesh.castShadow = true;
     herbGroup.add(mesh);

     herbGroup.position.copy(position);
     herbGroup.position.y = 0.25; // Base slightly above ground initially

     herbGroup.userData.isCollidable = false; // Herbs don't collide
     herbGroup.userData.isInteractable = true;
     herbGroup.userData.interactionType = 'gather';
     herbGroup.userData.resource = 'herb';
     herbGroup.userData.gatherTime = 1500; // ms
     herbGroup.userData.prompt = "Press E to gather Herb";
     herbGroup.userData.isDepletable = true; // Herbs can be depleted
     herbGroup.userData.respawnTime = 15000; // 15 seconds
     herbGroup.userData.entityReference = herbGroup;

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
    const wallMesh = new THREE.Mesh(wallGeo, cabinWallMat); // Use shared material
    wallMesh.position.y = wallHeight / 2;
    wallMesh.castShadow = true;
    wallMesh.receiveShadow = true;
    cabinGroup.add(wallMesh);

    // Roof (simple pyramid)
    const roofHeight = 1.5;
    // Base size matches wall dimensions for better fit
    const roofGeo = new THREE.ConeGeometry(Math.max(wallWidth, wallDepth) * 0.7, roofHeight, 4);
    const roofMesh = new THREE.Mesh(roofGeo, cabinRoofMat); // Use shared material
    roofMesh.position.y = wallHeight + roofHeight / 2;
    roofMesh.rotation.y = Math.PI / 4; // Align pyramid roof edges with walls
    roofMesh.castShadow = true;
    cabinGroup.add(roofMesh);

    cabinGroup.position.copy(position);
    cabinGroup.position.y = 0; // Base at ground level initially
    cabinGroup.rotation.y = rotationY;

    const box = new THREE.Box3().setFromObject(cabinGroup).expandByScalar(0.05); // Minimal expansion
    cabinGroup.userData.boundingBox = box;
    cabinGroup.userData.isCollidable = true;
    cabinGroup.userData.isInteractable = false; // Cabins aren't interactable by default
    cabinGroup.userData.entityReference = cabinGroup; // Reference itself

    return cabinGroup;
}

function createWindmill(position) {
     const windmillGroup = new THREE.Group();
     windmillGroup.name = "Windmill";
     const baseHeight = 8;
     const baseRadiusTop = 1.5;
     const baseRadiusBottom = 2.5;
     const bladeLength = 5;

     // Base Tower (Tapered Cylinder)
     const baseGeo = new THREE.CylinderGeometry(baseRadiusTop, baseRadiusBottom, baseHeight, 12); // Smoother cylinder
     const baseMesh = new THREE.Mesh(baseGeo, windmillBaseMat); // Use shared material
     baseMesh.position.y = baseHeight / 2;
     baseMesh.castShadow = true;
     baseMesh.receiveShadow = true;
     windmillGroup.add(baseMesh);

     // Blade Assembly Group (for rotation)
     const bladeAssembly = new THREE.Group();
     bladeAssembly.position.set(0, baseHeight, baseRadiusTop * 0.8); // Position at top-front of tower
     windmillGroup.add(bladeAssembly);
     windmillGroup.userData.bladeAssembly = bladeAssembly; // Store reference for animation

     // Create Blades attached to the assembly
     const bladeWidth = 0.5;
     const bladeDepth = 0.1;

     for (let i = 0; i < 4; i++) {
         const bladeGeo = new THREE.BoxGeometry(bladeWidth, bladeLength, bladeDepth);
         // Offset geometry so rotation happens around one end
         bladeGeo.translate(0, bladeLength / 2, 0);
         const bladeMesh = new THREE.Mesh(bladeGeo, windmillBladeMat); // Use shared material
         bladeMesh.castShadow = true;
         bladeMesh.rotation.z = (i * Math.PI) / 2; // Rotate blade itself
         bladeAssembly.add(bladeMesh);
     }

     windmillGroup.position.copy(position);
     windmillGroup.position.y = 0; // Base at ground initially

     // Bounding box should encompass the blades' rotation if precise collision is needed,
     // but a simpler box around the base might suffice.
     const box = new THREE.Box3().setFromObject(baseMesh).expandByScalar(0.1); // Box for base only initially
     windmillGroup.userData.boundingBox = box; // Start with base box
     windmillGroup.userData.isCollidable = true; // Base is collidable
     windmillGroup.userData.isInteractable = false;
     windmillGroup.userData.entityReference = windmillGroup;

     // Add simple rotation update function (will be called from Game loop if added to entities)
     windmillGroup.update = function(deltaTime) {
        if (this.userData.bladeAssembly) {
            this.userData.bladeAssembly.rotation.z += 0.5 * deltaTime; // Rotate around Z axis of assembly point

            // Optionally update bounding box to include blades (more complex)
            // For now, collision is likely just with the base.
        }
     };

     return windmillGroup;
}

function createChest(position, loot = { gold: 10, 'Health Potion': 1 }) {
    const chestGroup = new THREE.Group();
    chestGroup.name = "Chest";

    const baseSize = 0.8;
    const lidHeight = 0.2;
    const baseHeight = baseSize * 0.6;

    // Base
    const baseGeo = new THREE.BoxGeometry(baseSize, baseHeight, baseSize * 0.5);
    const baseMesh = new THREE.Mesh(baseGeo, chestMat); // Use shared material
    baseMesh.position.y = baseHeight / 2; // Center of base geometry
    baseMesh.castShadow = true;
    baseMesh.receiveShadow = true;
    chestGroup.add(baseMesh);

    // Lid Group (for pivoting)
    const lidGroup = new THREE.Group();
    // Position the pivot point at the back-top edge of the base
    lidGroup.position.set(0, baseHeight, -baseSize * 0.25);
    chestGroup.add(lidGroup);

    // Lid Mesh (relative to lidGroup)
    const lidGeo = new THREE.BoxGeometry(baseSize, lidHeight, baseSize * 0.5);
    const lidMesh = new THREE.Mesh(lidGeo, chestMat); // Use shared material
    lidMesh.castShadow = true;
    // Position lid geometry so its bottom aligns with the lidGroup origin
    lidMesh.position.y = lidHeight / 2;
    lidGroup.add(lidMesh);


    // Store references and state in userData
    chestGroup.userData.lid = lidGroup; // Reference the pivot group
    chestGroup.userData.isOpen = false;
    chestGroup.userData.openAngle = -Math.PI / 1.5; // Angle lid opens to (around X axis)
    chestGroup.userData.closedAngle = 0;
    chestGroup.userData.targetAngle = 0; // Target angle for animation
    chestGroup.userData.isAnimating = false;

    chestGroup.position.copy(position);
    chestGroup.position.y = 0; // Place base on ground initially

    const box = new THREE.Box3().setFromObject(chestGroup);
    chestGroup.userData.boundingBox = box;
    chestGroup.userData.isCollidable = true; // Chests are collidable

    // Interaction
    chestGroup.userData.isInteractable = true;
    chestGroup.userData.interactionType = 'open';
    chestGroup.userData.prompt = "Press E to open Chest";
    chestGroup.userData.loot = { ...loot }; // Store a copy of loot data
    chestGroup.userData.entityReference = chestGroup;


    // Simple animation update function (called from Game loop if added to entities)
    chestGroup.update = function(deltaTime) {
        const lid = this.userData.lid;
        if (!lid || !this.userData.isAnimating) return;

        const lerpFactor = 1.0 - Math.pow(0.05, deltaTime); // Speed of opening/closing
        lid.rotation.x = THREE.MathUtils.lerp(lid.rotation.x, this.userData.targetAngle, lerpFactor);

        // Stop animating when close enough to target angle
        if (Math.abs(lid.rotation.x - this.userData.targetAngle) < 0.01) {
            lid.rotation.x = this.userData.targetAngle; // Snap to final angle
            this.userData.isAnimating = false;
            // console.log("Chest animation finished.");
        }
    };

     // Trigger opening (called by InteractionSystem)
     chestGroup.open = function() {
         if (!this.userData.isOpen) {
            this.userData.isOpen = true;
            this.userData.targetAngle = this.userData.openAngle;
            this.userData.isAnimating = true;
            this.userData.isInteractable = false; // Can't interact while opening or after open
            this.userData.prompt = "Empty Chest";
             // Loot distribution handled by InteractionSystem after calling open()
             return true;
         }
         return false;
     }
      // Optional: Trigger closing
     chestGroup.close = function() {
         if (this.userData.isOpen) {
            this.userData.isOpen = false;
            this.userData.targetAngle = this.userData.closedAngle;
            this.userData.isAnimating = true;
             // Make interactable again? Depends on game design.
             // this.userData.isInteractable = true;
             // this.userData.prompt = "Press E to open Chest";
         }
     }

    return chestGroup;
}


// --- Main Population Function ---

export function populateEnvironment(scene, worldSize, collidableObjects, interactableObjects, entities, questLog, inventory, eventLog) {
    const halfSize = worldSize / 2;
    const terrain = scene.getObjectByName("Terrain");

    // Helper to get terrain height safely
    function getTerrainHeight(x, z) {
        if (!terrain || !terrain.geometry) return 0;
        // Simple approach: Use geometry vertices (faster than raycast if terrain isn't too complex)
        // More robust: Raycast
        const raycaster = new THREE.Raycaster(new THREE.Vector3(x, 100, z), new THREE.Vector3(0, -1, 0), 0, 200);
        const intersects = raycaster.intersectObject(terrain);
        return intersects.length > 0 ? intersects[0].point.y : 0;
    }

    // --- Static Objects Arrays ---
    const staticCollidables = []; // Objects to add to main collidable list
    const staticInteractables = []; // Objects to add to main interactable list

    // --- Village ---
    const villageCenter = new THREE.Vector3(5, 0, 10); // Slightly offset village center
    const cabinPositions = [
        new THREE.Vector3(villageCenter.x - 10, 0, villageCenter.z),
        new THREE.Vector3(villageCenter.x + 8, 0, villageCenter.z - 5),
        new THREE.Vector3(villageCenter.x - 5, 0, villageCenter.z + 10),
    ];
    const cabinRotations = [Math.PI / 16, -Math.PI / 8, Math.PI / 2];

    cabinPositions.forEach((pos, i) => {
        const cabin = createCabin(pos, cabinRotations[i]);
        cabin.position.y = getTerrainHeight(cabin.position.x, cabin.position.z);
        scene.add(cabin);
        staticCollidables.push(cabin); // Add cabin mesh group
    });

    // --- NPCs --- (Add to main entities list directly)
    const farmerPos = new THREE.Vector3(villageCenter.x - 12, 0, villageCenter.z + 2);
    const farmer = new NPC(scene, farmerPos, 'Farmer Giles', 'straw_hat', questLog, inventory);
    farmer.mesh.position.y = getTerrainHeight(farmerPos.x, farmerPos.z);
    entities.push(farmer);
    collidableObjects.push(farmer.mesh); // Add NPC mesh group to collidables
    interactableObjects.push(farmer); // Add NPC instance to interactables

    const blacksmithPos = new THREE.Vector3(villageCenter.x + 10, 0, villageCenter.z - 3);
    const blacksmith = new NPC(scene, blacksmithPos, 'Blacksmith Brynn', 'cap', questLog, inventory);
    blacksmith.mesh.position.y = getTerrainHeight(blacksmithPos.x, blacksmithPos.z);
    entities.push(blacksmith);
    collidableObjects.push(blacksmith.mesh);
    interactableObjects.push(blacksmith);

    const hunterPos = new THREE.Vector3(halfSize * 0.4, 0, -halfSize * 0.3); // Near forest edge
    const hunter = new NPC(scene, hunterPos, 'Hunter Rex', 'none', questLog, inventory); // No hat
    hunter.mesh.position.y = getTerrainHeight(hunterPos.x, hunterPos.z);
    entities.push(hunter);
    collidableObjects.push(hunter.mesh);
    interactableObjects.push(hunter);

    // Assign initial quests using quest definitions (assuming they are loaded into QuestLog)
    // Quest definitions would ideally be in a separate file/object
    const questDefinitions = {
        gatherWood: {
            id: 'gatherWood',
            title: 'Wood for the Winter',
            description: 'Farmer Giles looks worried. "The nights are getting colder. Could you gather 5 Wood for me?"',
            objectives: [{ type: 'gather', item: 'wood', amount: 5, turnIn: true }], // turnIn flag means item is consumed
            reward: { gold: 10, items: [{ name: 'Health Potion', amount: 1 }] }
        },
        findBow: {
            id: 'findBow',
            title: 'Lost Bow',
            description: 'Hunter Rex sighs. "Blast it! I left my favorite bow near the old cave entrance to the southeast. Can you retrieve it for me?"',
            objectives: [{ type: 'retrieve', item: 'Hunter\'s Bow', amount: 1, locationHint: 'old cave SE', turnIn: true }], // Retrieve and turn in
            reward: { gold: 25 }
        }
        // Add blacksmith quest definition here...
    };
    questLog.addQuestDefinitions(questDefinitions); // Add definitions to the log

    farmer.assignQuest(questDefinitions.gatherWood); // Assign by passing the data object
    hunter.assignQuest(questDefinitions.findBow);


    // --- Trees ---
    const treeCount = 150;
    const minTreeDistFromCenterSq = 25 * 25; // Squared distance check
    for (let i = 0; i < treeCount; i++) {
        const x = (Math.random() - 0.5) * worldSize * 0.95; // Cover more area
        const z = (Math.random() - 0.5) * worldSize * 0.95;
        const distSq = (x - villageCenter.x)**2 + (z - villageCenter.z)**2;
        // Avoid placing trees too close to the village center or each other (simple check)
        if (distSq < minTreeDistFromCenterSq) continue;
        // Add simple density check later if needed

        const tree = createTree(new THREE.Vector3(x, 0, z));
        tree.position.y = getTerrainHeight(x, z);
        scene.add(tree);
        staticCollidables.push(tree);
        staticInteractables.push(tree); // Use the group which holds interaction data
    }

    // --- Rocks ---
    const rockCount = 80;
    const minRockDistFromCenterSq = 20 * 20;
    for (let i = 0; i < rockCount; i++) {
        const x = (Math.random() - 0.5) * worldSize * 0.9;
        const z = (Math.random() - 0.5) * worldSize * 0.9;
        const distSq = (x - villageCenter.x)**2 + (z - villageCenter.z)**2;
         if (distSq < minRockDistFromCenterSq) continue;

        const size = 1 + Math.random() * 1.5; // Size from 1m to 2.5m
        const rock = createRock(new THREE.Vector3(x, 0, z), size);
        rock.position.y = getTerrainHeight(x, z); // Adjust base to terrain height
        scene.add(rock);
        staticCollidables.push(rock);
        staticInteractables.push(rock);
    }

     // --- Herbs ---
    const herbCount = 60;
    const minHerbDistFromCenterSq = 10 * 10;
    for (let i = 0; i < herbCount; i++) {
        const x = (Math.random() - 0.5) * worldSize * 0.9;
        const z = (Math.random() - 0.5) * worldSize * 0.9;
        const distSq = (x - villageCenter.x)**2 + (z - villageCenter.z)**2;
         if (distSq < minHerbDistFromCenterSq) continue;

        const herb = createHerb(new THREE.Vector3(x, 0, z));
        herb.position.y = getTerrainHeight(x, z) + 0.1; // Place slightly above terrain
        scene.add(herb);
        // No collision for herbs
        staticInteractables.push(herb);
    }

    // --- Animals --- (Add to main entities list directly)
    const deerCount = 12;
    for (let i = 0; i < deerCount; i++) {
        const x = (Math.random() - 0.5) * worldSize * 0.8; // Wider range
        const z = (Math.random() - 0.5) * worldSize * 0.8;
        const deerPos = new THREE.Vector3(x, 0, z);
        const deer = new Animal(scene, deerPos, 'Deer', worldSize);
        deer.mesh.position.y = getTerrainHeight(x, z);
        entities.push(deer);
        if (deer.userData.isCollidable) collidableObjects.push(deer.mesh);
        if (deer.userData.isInteractable) interactableObjects.push(deer);
    }
    const wolfCount = 6;
     const forestArea = { x: halfSize * 0.6, z: -halfSize * 0.6, range: halfSize * 0.35 };
    for (let i = 0; i < wolfCount; i++) {
        const x = forestArea.x + (Math.random() - 0.5) * forestArea.range * 2;
        const z = forestArea.z + (Math.random() - 0.5) * forestArea.range * 2;
        const wolfPos = new THREE.Vector3(x, 0, z);
        const wolf = new Animal(scene, wolfPos, 'Wolf', worldSize);
        wolf.mesh.position.y = getTerrainHeight(x, z);
        entities.push(wolf);
        if (wolf.userData.isCollidable) collidableObjects.push(wolf.mesh);
        // Wolves aren't directly 'interactable' with E
    }
    const rabbitCount = 15;
     for (let i = 0; i < rabbitCount; i++) {
        const x = (Math.random() - 0.5) * worldSize * 0.85;
        const z = (Math.random() - 0.5) * worldSize * 0.85;
        const rabbitPos = new THREE.Vector3(x, 0, z);
        const rabbit = new Animal(scene, rabbitPos, 'Rabbit', worldSize);
        rabbit.mesh.position.y = getTerrainHeight(x, z);
        entities.push(rabbit);
        // Rabbits are non-collidable and non-interactable
     }


    // --- Landmarks ---
    const windmillPos = new THREE.Vector3(-halfSize * 0.6, 0, -halfSize * 0.2);
    const windmill = createWindmill(windmillPos);
    windmill.position.y = getTerrainHeight(windmillPos.x, windmillPos.z);
    scene.add(windmill);
    staticCollidables.push(windmill);
    entities.push(windmill); // Add windmill to entities to update blade animation

    // Cave entrance area (Southeast)
    const caveAreaCenter = new THREE.Vector3(halfSize * 0.7, 0, halfSize * 0.6);
    // TODO: Add visual representation of cave entrance (e.g., texture, simple mesh)

     // Place Hunter's Bow item using InteractableObject class
      const bowPos = new THREE.Vector3(caveAreaCenter.x + 3, 0, caveAreaCenter.z + 2);
      bowPos.y = getTerrainHeight(bowPos.x, bowPos.z) + 0.4; // Place on ground
      const huntersBowItem = new InteractableObject(
          'hunters_bow_item', // Unique ID
          bowPos,
          'retrieve',
          'Hunter\'s Bow', // Item name to add to inventory (matches quest objective)
          'Press E to pick up Bow',
          scene // Pass scene to potentially add a default marker if no mesh is set
      );
      // Add a simple visual representation for the bow
      const bowGeo = new THREE.BoxGeometry(0.1, 1.2, 0.1);
      huntersBowItem.mesh = new THREE.Mesh(bowGeo, bowMat); // Use shared material
      huntersBowItem.mesh.position.copy(huntersBowItem.position);
      huntersBowItem.mesh.rotation.z = Math.PI / 2.5; // Lean it
      huntersBowItem.mesh.rotation.x = Math.PI / 8;
      huntersBowItem.mesh.castShadow = true;
      huntersBowItem.mesh.userData = huntersBowItem.userData; // Link userData to mesh!
      scene.add(huntersBowItem.mesh);
      staticInteractables.push(huntersBowItem); // Add the InteractableObject instance

    // TODO: Ruined tower landmark

    // --- Chests ---
    const chest1Pos = new THREE.Vector3(villageCenter.x + 3, 0, villageCenter.z + 15); // Near village edge
    const chest1 = createChest(chest1Pos, { gold: 15, 'Health Potion': 1 });
    chest1.position.y = getTerrainHeight(chest1Pos.x, chest1Pos.z);
    scene.add(chest1);
    staticCollidables.push(chest1);
    staticInteractables.push(chest1); // Add chest group
    entities.push(chest1); // Add to entities for animation update loop

    const chest2Pos = new THREE.Vector3(forestArea.x + 5, 0, forestArea.z + 15); // Hidden in forest
    const chest2 = createChest(chest2Pos, { wood: 5, stone: 3, herb: 2 });
    chest2.position.y = getTerrainHeight(chest2Pos.x, chest2Pos.z);
    scene.add(chest2);
    staticCollidables.push(chest2);
    staticInteractables.push(chest2);
    entities.push(chest2);

    // Add static objects to the main game arrays
    collidableObjects.push(...staticCollidables);
    interactableObjects.push(...staticInteractables);


    console.log("Environment populated.");
    console.log("Total Collidables:", collidableObjects.length);
    console.log("Total Interactables:", interactableObjects.length);
    console.log("Total Entities:", entities.length);
}


export function createWorldBoundary(scene, worldSize, collidableObjects) {
    const thickness = 20; // Make walls thicker for robustness
    const height = 100;
    const halfSize = worldSize / 2;

    // Use a slightly more visible material for easier debugging if needed
    const boundaryMaterial = new THREE.MeshBasicMaterial({
        // color: 0xff0000,
        transparent: true,
        opacity: 0.0, // Invisible
        side: THREE.DoubleSide,
        wireframe: false
    });

    const wallPositions = [
        [halfSize, height / 2, 0],          // +X
        [-halfSize, height / 2, 0],         // -X
        [0, height / 2, halfSize],          // +Z
        [0, height / 2, -halfSize],         // -Z
    ];
    const wallSizes = [
        [thickness, height, worldSize + thickness], // X walls
        [worldSize + thickness, height, thickness], // Z walls
    ];

    wallPositions.forEach((pos, i) => {
        const size = (i < 2) ? wallSizes[0] : wallSizes[1];
        const wallGeo = new THREE.BoxGeometry(...size);
        const wallMesh = new THREE.Mesh(wallGeo, boundaryMaterial);
        wallMesh.position.set(...pos);
        wallMesh.userData.isCollidable = true;
        wallMesh.name = `WorldBoundary_${i}`;

        // Pre-calculate and store bounding box in world coordinates
        wallMesh.geometry.computeBoundingBox();
        wallMesh.userData.boundingBox = wallMesh.geometry.boundingBox.clone().applyMatrix4(wallMesh.matrixWorld);

        scene.add(wallMesh);
        collidableObjects.push(wallMesh);
    });
     console.log("World boundaries created.");
}