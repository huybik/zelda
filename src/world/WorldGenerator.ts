// src/world/WorldGenerator.ts
import {
  Scene,
  PlaneGeometry,
  MeshLambertMaterial,
  Mesh,
  AmbientLight,
  DirectionalLight,
  HemisphereLight,
  Vector3,
  MathUtils,
  Object3D,
  Group,
  BufferGeometry,
  Material,
  BoxGeometry,
  MeshBasicMaterial,
  DoubleSide,
  CylinderGeometry,
  ConeGeometry,
  SphereGeometry,
  Box3,
} from "three";
import { SimplexNoise } from "three/examples/jsm/math/SimplexNoise.js";
import {
  Colors,
  WORLD_SIZE,
  TERRAIN_SEGMENTS,
  CHARACTER_HEIGHT,
} from "../config";
import {
  smoothstep,
  randomFloat,
  getTerrainHeight,
  getNextEntityId,
} from "../utils";
import type { EntityUserData, LoadedModel } from "../types";
import { Character } from "../core/Character"; // Use type import
import { Inventory } from "../core/Inventory"; // Use direct import
import type { Game } from "../Game"; // Use type import

// --- Terrain Generation ---
export function createTerrain(
  size: number = WORLD_SIZE,
  segments: number = TERRAIN_SEGMENTS
): Mesh {
  const simplex = new SimplexNoise();
  const geometry = new PlaneGeometry(size, size, segments, segments);
  const vertices = geometry.attributes.position.array as Float32Array;

  const noiseStrength = 16; // How hilly the terrain is
  const noiseScale = 0.005; // How zoomed in/out the noise pattern is
  const flattenRadius = size * 0.24; // Radius around center to flatten (e.g., for village)
  const flattenStrength = 0.1; // How much to flatten (0 = no flatten, 1 = completely flat)

  for (let i = 0; i < vertices.length / 3; i++) {
    const index = i * 3;
    const x = vertices[index];
    const y = vertices[index + 1]; // Corresponds to world Z before rotation
    let z = simplex.noise(x * noiseScale, y * noiseScale) * noiseStrength; // Corresponds to world Y (height)

    // Flatten center area smoothly
    const distToCenterSq = x * x + y * y;
    if (distToCenterSq < flattenRadius * flattenRadius) {
      const distToCenter = Math.sqrt(distToCenterSq);
      // Smoothstep factor: 1 at center, 0 at flattenRadius edge
      const flattenFactor = 1.0 - smoothstep(0, flattenRadius, distToCenter);
      // Lerp the height towards 0 (or a base height) based on flattenFactor
      z = MathUtils.lerp(z, z * (1.0 - flattenStrength), flattenFactor);
    }

    vertices[index + 2] = z; // Assign height to the Z component (before rotation)
  }

  geometry.attributes.position.needsUpdate = true;
  geometry.rotateX(-Math.PI / 2); // Rotate to be flat on XZ plane
  geometry.computeVertexNormals(); // Calculate normals for lighting
  geometry.computeBoundingBox(); // Needed for physics/raycasting

  const material = new MeshLambertMaterial({ color: Colors.TERRAIN });
  const terrainMesh = new Mesh(geometry, material);
  terrainMesh.receiveShadow = true; // Allow terrain to receive shadows
  terrainMesh.name = "Terrain";
  // Mark terrain specifically for identification and collision
  terrainMesh.userData = { isTerrain: true, isCollidable: true };
  return terrainMesh;
}

// --- Lighting Setup ---
export function setupLighting(scene: Scene): void {
  // Ambient light for overall illumination
  scene.add(new AmbientLight(0xadc1d4, 0.6));

  // Directional light for simulating sunlight and casting shadows
  const dirLight = new DirectionalLight(0xfff5e1, 0.9);
  dirLight.position.set(150, 200, 100); // Position the light source
  dirLight.castShadow = true;

  // Configure shadow properties
  dirLight.shadow.mapSize.width = 1024; // Shadow map resolution
  dirLight.shadow.mapSize.height = 1024;
  dirLight.shadow.camera.near = 10; // Shadow camera frustum near plane
  dirLight.shadow.camera.far = 500; // Shadow camera frustum far plane
  const shadowCamSize = 150; // Area covered by shadows
  dirLight.shadow.camera.left = -shadowCamSize;
  dirLight.shadow.camera.right = shadowCamSize;
  dirLight.shadow.camera.top = shadowCamSize;
  dirLight.shadow.camera.bottom = -shadowCamSize;
  dirLight.shadow.bias = -0.001; // Adjust shadow bias to prevent artifacts

  scene.add(dirLight);
  scene.add(dirLight.target); // Add target for the light (defaults to 0,0,0)

  // Hemisphere light for softer ambient lighting from sky and ground
  scene.add(new HemisphereLight(Colors.BACKGROUND, Colors.PASTEL_GREEN, 0.3));
}

// --- World Boundary ---
export function createWorldBoundary(
  scene: Scene,
  worldSize: number,
  collidableObjects: Object3D[]
): void {
  const thickness = 20; // Make boundaries thick but invisible
  const height = 100; // Make boundaries high
  const halfSize = worldSize / 2;
  // Invisible material
  const boundaryMaterial = new MeshBasicMaterial({
    visible: false, // Make walls invisible
    side: DoubleSide, // Render both sides if needed for debugging
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
    wallMesh.position.set(px, height / 2, pz); // Center vertically
    wallMesh.name = name;
    wallMesh.userData = { isCollidable: true }; // Mark as collidable

    // Pre-compute and store world bounding box for static objects
    wallMesh.geometry.computeBoundingBox(); // Compute local bounding box
    wallMesh.updateMatrixWorld(true); // Ensure world matrix is up-to-date
    wallMesh.userData.boundingBox = wallMesh.geometry
      .boundingBox!.clone()
      .applyMatrix4(wallMesh.matrixWorld);

    scene.add(wallMesh);
    collidableObjects.push(wallMesh); // Add to the list for physics checks
  };

  // Create walls slightly outside the worldSize to fully enclose it
  const buffer = thickness / 2;
  createWall(
    halfSize + buffer,
    0,
    thickness,
    worldSize + thickness * 2,
    "Boundary+X"
  );
  createWall(
    -halfSize - buffer,
    0,
    thickness,
    worldSize + thickness * 2,
    "Boundary-X"
  );
  createWall(
    0,
    halfSize + buffer,
    worldSize + thickness * 2,
    thickness,
    "Boundary+Z"
  );
  createWall(
    0,
    -halfSize - buffer,
    worldSize + thickness * 2,
    thickness,
    "Boundary-Z"
  );
}

// --- Simple Object Creation ---
// Reusable materials for common objects
const treeTrunkMat = new MeshLambertMaterial({ color: Colors.PASTEL_BROWN });
const treeFoliageMat = new MeshLambertMaterial({ color: Colors.PASTEL_GREEN });
const rockMat = new MeshLambertMaterial({ color: Colors.PASTEL_GRAY });
const herbMat = new MeshLambertMaterial({ color: Colors.FOREST_GREEN });

// Generic function to create a simple world object (Mesh inside a Group)
function createWorldObject(
  name: string,
  geometry: BufferGeometry,
  material: Material | Material[],
  options: Partial<EntityUserData> & {
    scale?: number | Vector3;
    rotation?: Vector3;
    castShadow?: boolean;
    receiveShadow?: boolean;
  } = {}
): Group {
  const group = new Group();
  group.name = name; // Name the group for identification

  const mesh = new Mesh(geometry, material);
  mesh.castShadow = options.castShadow ?? true; // Default to casting shadows
  mesh.receiveShadow = options.receiveShadow ?? true; // Default to receiving shadows
  group.add(mesh);

  // Apply scaling if provided
  if (options.scale) {
    if (typeof options.scale === "number") group.scale.setScalar(options.scale);
    else group.scale.copy(options.scale);
  }
  // Apply rotation if provided
  if (options.rotation) {
    group.rotation.set(
      options.rotation.x,
      options.rotation.y,
      options.rotation.z
    );
  }

  // Assign UserData to the Group (the interactable/collidable entity)
  group.userData = {
    id: `${name}_${getNextEntityId()}`,
    isEntity: false, // Not a full Entity subclass instance
    isSimpleObject: true, // Mark as a simple interactable object
    isCollidable: options.isCollidable ?? false,
    isInteractable: options.isInteractable ?? false,
    interactionType: options.interactionType,
    resource: options.resource,
    gatherTime: options.gatherTime,
    prompt: options.prompt,
    isDepletable: options.isDepletable,
    respawnTime: options.respawnTime,
    entityReference: group, // Reference to the group itself for interaction system
    ...options, // Spread any other custom data provided
  };

  // Compute and store bounding box after scaling/rotation
  group.userData.boundingBox = new Box3().setFromObject(group);

  return group;
}

// Creates a simple tree object.
function createTree(): Group {
  const trunkHeight = randomFloat(3, 5);
  const trunkRadius = randomFloat(0.3, 0.5);
  const foliageHeight = trunkHeight * 1.2 + randomFloat(0, 1);
  const foliageRadius = trunkRadius * 3 + randomFloat(0, 1.5);

  const treeGroup = new Group();
  treeGroup.name = "Tree";

  // Trunk
  const trunkGeo = new CylinderGeometry(
    trunkRadius * 0.8,
    trunkRadius,
    trunkHeight,
    8
  );
  const trunkMesh = new Mesh(trunkGeo, treeTrunkMat);
  trunkMesh.position.y = trunkHeight / 2; // Center trunk vertically
  trunkMesh.castShadow = true;
  trunkMesh.receiveShadow = true;
  treeGroup.add(trunkMesh);

  // Foliage (simple cone)
  const foliageGeo = new ConeGeometry(foliageRadius, foliageHeight, 6);
  const foliageMesh = new Mesh(foliageGeo, treeFoliageMat);
  // Position foliage relative to the top of the trunk
  foliageMesh.position.y = trunkHeight + foliageHeight * 0.4; // Adjust based on cone geometry origin
  foliageMesh.castShadow = true;
  // foliageMesh.receiveShadow = false; // Foliage might not receive shadows well
  treeGroup.add(foliageMesh);

  // Assign UserData to the main Group
  treeGroup.userData = {
    id: `Tree_${getNextEntityId()}`,
    isEntity: false,
    isSimpleObject: true,
    isCollidable: true,
    isInteractable: true,
    interactionType: "gather",
    resource: "wood",
    gatherTime: 3000,
    prompt: "Gather Wood",
    isDepletable: true,
    respawnTime: 20000,
    entityReference: treeGroup,
  };
  treeGroup.userData.boundingBox = new Box3().setFromObject(treeGroup); // Calculate BB for the whole tree
  return treeGroup;
}

// Creates a simple rock object.
function createRock(size: number): Group {
  const height = size * randomFloat(0.5, 1.0);
  // Use BoxGeometry for simpler rocks, could use Sphere or custom geometry
  const geo = new BoxGeometry(size, height, size * randomFloat(0.8, 1.2));

  const group = createWorldObject("Rock", geo, rockMat, {
    isCollidable: true,
    isInteractable: true,
    interactionType: "gather",
    resource: "stone",
    gatherTime: 4000,
    prompt: "Gather Stone",
    isDepletable: true,
    respawnTime: 30000,
    // Add random rotation for variety
    rotation: new Vector3(
      randomFloat(-0.1, 0.1) * Math.PI,
      randomFloat(0, 2) * Math.PI,
      randomFloat(-0.1, 0.1) * Math.PI
    ),
  });
  // Adjust position so the bottom of the rock sits near y=0 before placing on terrain
  group.position.y = height / 2;
  // Bounding box is calculated in createWorldObject after transformations
  return group;
}

// Creates a simple herb object.
function createHerb(): Group {
  const size = 0.25;
  // Simple sphere geometry for herbs
  const geo = new SphereGeometry(size, 5, 4);
  const group = createWorldObject("Herb Plant", geo, herbMat, {
    isCollidable: false, // Herbs usually don't block movement
    isInteractable: true,
    interactionType: "gather",
    resource: "herb",
    gatherTime: 1500,
    prompt: "Gather Herb",
    isDepletable: true,
    respawnTime: 15000,
    castShadow: true, // Small objects can still cast shadows
  });
  // Position slightly above ground
  group.position.y = size * 0.5; // Adjust based on geometry origin
  return group;
}

// --- Environment Population ---
export function populateEnvironment(
  scene: Scene,
  worldSize: number,
  collidableObjects: Object3D[],
  interactableObjects: Array<any>, // Can contain Characters or simple Object3Ds
  entities: Array<any>, // List containing Characters and simple objects for tracking
  models: Record<string, LoadedModel>,
  game: Game // Pass Game instance for Character setup
): void {
  const halfSize = worldSize / 2;
  const villageCenter = new Vector3(5, 0, 10); // Define a central point for the village area
  const villageRadiusSq = 20 * 20; // Squared radius around the village center

  // --- Add Characters ---
  const addCharacter = (
    spawnPos: Vector3,
    name: string,
    modelKey: string,
    persona: string
  ): Character | null => {
    const modelData = models[modelKey];
    if (!modelData) {
      console.error(
        `Model data not found for key: ${modelKey}. Cannot create character ${name}.`
      );
      return null;
    }
    // Need Character class imported
    // const CharacterClass = game.characterClassRef; // Assuming Game stores a ref
    // if (!CharacterClass) {
    //   console.error(
    //     "Character class reference not available in Game instance."
    //   );
    //   return null;
    // }
    const charInventory = new Inventory(9); // NPCs get a small inventory
    spawnPos.y =
      getTerrainHeight(scene, spawnPos.x, spawnPos.z) + CHARACTER_HEIGHT / 2; // Set Y position from model
    const character = new Character(
      scene,
      spawnPos,
      name,
      modelData.scene.clone(), // Clone the scene graph
      modelData.animations, // Share animations
      charInventory,
      game
    );
    character.persona = persona;
    if (character.aiController) character.aiController.persona = persona; // Sync persona to AI

    // Place character on terrain
    character.updateBoundingBox(); // Update BB after placement

    // Add to tracking lists
    entities.push(character);
    collidableObjects.push(character.mesh!);
    interactableObjects.push(character); // Characters are interactable

    // Initialize NPC displays
    character.initNameDisplay();
    character.initIntentDisplay();

    console.log(
      `Added character: ${name} at (${spawnPos.x.toFixed(1)}, ${character.mesh!.position.y.toFixed(1)}, ${spawnPos.z.toFixed(1)})`
    );
    return character;
  };

  //   Example NPC placements
  addCharacter(
    villageCenter.clone().add(new Vector3(-12, 0, 2)),
    "Farmer Giles",
    "oldMan", // Using placeholder model key
    "Hardworking farmer, values community, knowledgeable about crops, a bit stubborn."
  );
  addCharacter(
    villageCenter.clone().add(new Vector3(10, 0, -3)),
    "Blacksmith Brynn",
    "tavernMan", // Using placeholder model key
    "Skilled artisan, proud, strong-willed, independent, focused on craft, gruff but kind."
  );
  addCharacter(
    new Vector3(halfSize * 0.4, 0, -halfSize * 0.3), // Hunter further out
    "Hunter Rex",
    "woman", // Using placeholder model key
    "Experienced tracker, quiet, observant, prefers wilderness, resourceful, not very social."
  );

  // --- Add Objects ---
  const addObject = (
    creator: (...args: any[]) => Group, // Function that creates the object Group
    count: number,
    minDistSqFromCenter: number, // Minimum squared distance from village center
    maxDistSqFromCenter: number, // Maximum squared distance
    ...args: any[] // Arguments for the creator function (e.g., size for rocks)
  ) => {
    let added = 0;
    let attempts = 0;
    const maxAttempts = count * 10; // Increase attempts to avoid infinite loops in sparse areas

    console.log(`Attempting to add ${count} of ${creator.name || "object"}...`);

    while (added < count && attempts < maxAttempts) {
      attempts++;
      // Generate random position within world bounds
      const x = randomFloat(-halfSize * 0.95, halfSize * 0.95);
      const z = randomFloat(-halfSize * 0.95, halfSize * 0.95);
      const distSq = (x - villageCenter.x) ** 2 + (z - villageCenter.z) ** 2;

      // Check placement constraints
      if (distSq < minDistSqFromCenter || distSq > maxDistSqFromCenter) {
        continue; // Skip if too close or too far from center
      }

      // Create the object instance
      const objGroup = creator(...args);
      if (!objGroup) continue; // Skip if creation failed

      // Place object on terrain
      const height = getTerrainHeight(scene, x, z);
      // Adjust Y position based on object type/origin if needed (already handled in createRock/Herb)
      objGroup.position.set(x, height + (objGroup.position.y || 0), z); // Add object's internal Y offset

      // Add to scene and tracking lists
      scene.add(objGroup);
      entities.push(objGroup); // Add simple objects to entities list for minimap etc.
      if (objGroup.userData.isCollidable) collidableObjects.push(objGroup);
      if (objGroup.userData.isInteractable) interactableObjects.push(objGroup);
      added++;
    }
    if (added < count) {
      console.warn(
        `Could only place ${added}/${count} of ${creator.name || "object"}`
      );
    } else {
      console.log(
        `Successfully placed ${added}/${count} of ${creator.name || "object"}`
      );
    }
  };

  // Populate with different object types
  // Trees: Further out from the village center
  addObject(createTree, 100, villageRadiusSq * 1.5, (halfSize * 0.9) ** 2);
  // Rocks: Scattered, avoiding the immediate village center
  addObject(
    () => createRock(randomFloat(1, 2.5)),
    50,
    villageRadiusSq * 0.8,
    (halfSize * 0.8) ** 2
  );
  // Herbs: Can be closer to the village, but not right in the middle
  addObject(createHerb, 30, villageRadiusSq * 0.5, (halfSize * 0.7) ** 2);

  console.log("Environment population complete.");
  console.log(`Total entities: ${entities.length}`);
  console.log(`Total collidables: ${collidableObjects.length}`);
  console.log(`Total interactables: ${interactableObjects.length}`);
}
