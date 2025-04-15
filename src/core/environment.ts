/* File: /src/core/environment.ts */
import {
  Scene,
  Vector3,
  Object3D,
  Group,
  AnimationClip,
  MathUtils,
  Mesh,
  Box3,
} from "three";
import { Character } from "../entities/character";
import { Animal } from "../entities/animals"; // Import Animal
import {
  createTree,
  createRock,
  createHerb,
  createGrassPatch,
  createFlowerPatch,
} from "../models/objects";
import { getTerrainHeight, randomFloat, Inventory } from "./utils";
import { Game } from "../main";
import {
  Profession,
  ProfessionStartingWeapon,
  getItemDefinition,
  isWeapon,
} from "./items"; // Import Profession utils

export function populateEnvironment(
  scene: Scene,
  worldSize: number,
  collidableObjects: Object3D[],
  interactableObjects: Array<any>,
  entities: Array<any>,
  inventory: Inventory,
  models: Record<string, { scene: Group; animations: AnimationClip[] }>,
  gameInstance: Game
): void {
  const halfSize = worldSize / 2;
  const villageCenter = new Vector3(5, 0, 10);
  const villageRadiusSq = 15 * 15;

  // Retrieve the terrain mesh from the scene
  const terrain = scene.getObjectByName("Terrain") as Mesh;
  if (!terrain) {
    console.error("Terrain not found in scene!");
    return;
  }

  const addCharacter = (
    pos: Vector3,
    name: string,
    modelKey: string,
    profession: Profession, // Add profession parameter
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
    character.game = gameInstance;
    character.profession = profession; // Assign profession

    if (isPlayer) {
      character.name = "Player";
      character.userData.isPlayer = true;
      character.userData.isNPC = false;
      if (character.aiController) character.aiController = null;
    } else {
      character.userData.isPlayer = false;
      character.userData.isNPC = true;
      if (!character.aiController)
        console.warn(`NPC ${name} created without AIController!`);

      // Give starting weapon based on profession for NPCs
      const startingWeaponId = ProfessionStartingWeapon[profession];
      if (startingWeaponId) {
        const addResult = character.inventory?.addItem(startingWeaponId, 1);
        if (addResult && addResult.totalAdded > 0) {
          const weaponDef = getItemDefinition(startingWeaponId);
          if (weaponDef && isWeapon(weaponDef)) {
            // Use requestAnimationFrame to delay slightly, ensuring bones are ready.
            requestAnimationFrame(() => {
              character.equipWeapon(weaponDef);
            });
            console.log(
              `Gave starting weapon ${weaponDef.name} to NPC ${character.name} (${profession})`
            );
          }
        } else {
          console.warn(
            `Could not give starting weapon ${startingWeaponId} to NPC ${character.name} (inventory full?).`
          );
        }
      }
    }
    entities.push(character);
    collidableObjects.push(character.mesh!);
    interactableObjects.push(character);
    return character;
  };

  // Add NPCs with professions
  const farmerGiles = addCharacter(
    villageCenter.clone().add(new Vector3(-12, 0, 2)),
    "Farmer Giles",
    "tavernMan",
    Profession.Farmer // Assign Farmer profession
  );
  farmerGiles.persona =
    "A hardworking farmer who values community and is always willing to help others. He is knowledgeable about crops and livestock but can be a bit stubborn. He prefers to stay close to his farm but will venture out if necessary.";
  if (farmerGiles.aiController)
    farmerGiles.aiController.persona = farmerGiles.persona;

  const blacksmithBrynn = addCharacter(
    villageCenter.clone().add(new Vector3(10, 0, -3)),
    "Blacksmith Brynn",
    "woman",
    Profession.Blacksmith // Assign Blacksmith profession
  );
  blacksmithBrynn.persona =
    "A skilled artisan who takes pride in her work. She is strong-willed and independent, often focused on her craft. She can be gruff but has a kind heart, especially towards those in need.";
  if (blacksmithBrynn.aiController)
    blacksmithBrynn.aiController.persona = blacksmithBrynn.persona;

  const hunterRex = addCharacter(
    new Vector3(halfSize * 0.4, 0, -halfSize * 0.3),
    "Hunter Rex",
    "oldMan",
    Profession.Hunter // Assign Hunter profession
  );
  hunterRex.persona =
    "An experienced tracker and survivalist. He is quiet and observant, preferring the wilderness over the village. He is resourceful and can be relied upon in tough situations but is not very social.";
  if (hunterRex.aiController)
    hunterRex.aiController.persona = hunterRex.persona;

  // Add Objects (Trees, Rocks, Herbs)
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
      if (distSq < minDistSq) continue; // Avoid spawning too close to village

      const obj = creator(new Vector3(x, 0, z), ...args);
      const height = getTerrainHeight(scene, x, z);
      obj.position.y = height;
      if (obj.name === "Herb Plant") obj.position.y = height + 0.5; // Adjust herb height slightly

      scene.add(obj);
      if (obj.userData.isCollidable) collidableObjects.push(obj);
      // Resources are interactable in the sense that they can be targeted for attack
      if (obj.userData.isInteractable) interactableObjects.push(obj);
      entities.push(obj); // Add to entities for potential minimap display if needed later
      obj.userData.id = `${obj.name}_${obj.uuid.substring(0, 6)}`;

      // Update bounding box AFTER setting the final position
      obj.updateMatrixWorld(true); // Ensure world matrix is current
      if (obj.name === "Tree") {
        const trunk = obj.getObjectByName("TreeTrunk") as Mesh;
        if (trunk && obj.userData.boundingBox instanceof Box3) {
          // Recompute the bounding box from the trunk using its updated world matrix
          obj.userData.boundingBox.setFromObject(trunk, true);
        } else {
          // Fallback for non-trees or if trunk/box is missing
          obj.userData.boundingBox?.setFromObject(obj, true);
        }
      } else if (obj.userData.boundingBox instanceof Box3) {
        // Update box for other objects like rocks/herbs
        obj.userData.boundingBox.setFromObject(obj, true);
      } else {
        // If no box exists, create one (shouldn't happen with current setup)
        obj.userData.boundingBox = new Box3().setFromObject(obj, true);
      }
    }
  };

  addObject(createTree, worldSize, 25 * 25);
  addObject(
    createRock,
    Math.floor(worldSize / 2),
    20 * 20,
    randomFloat(1, 2.5)
  );
  addObject(createHerb, Math.floor(worldSize / 5), 10 * 10);

  // Add Animals
  const addAnimal = (
    animalType: string,
    modelKey: string,
    count: number,
    minDistSq: number
  ) => {
    const model = models[modelKey];
    if (!model) {
      console.warn(
        `Model key "${modelKey}" not found for animal ${animalType}`
      );
      return;
    }
    for (let i = 0; i < count; i++) {
      const x = randomFloat(-halfSize * 0.9, halfSize * 0.9);
      const z = randomFloat(-halfSize * 0.9, halfSize * 0.9);
      const distSq = (x - villageCenter.x) ** 2 + (z - villageCenter.z) ** 2;
      if (distSq < minDistSq) continue; // Avoid spawning too close to village

      const pos = new Vector3(x, 0, z);
      pos.y = getTerrainHeight(scene, x, z);

      const animal = new Animal(
        scene,
        pos,
        `${animalType} ${i + 1}`,
        animalType,
        model.scene.clone(), // Clone the model scene
        model.animations // Share animations
      );
      animal.game = gameInstance;

      entities.push(animal);
      collidableObjects.push(animal.mesh!);
      // Animals are interactable (can be targeted for attack)
      interactableObjects.push(animal);
    }
  };

  // Spawn some deer and wolves
  addAnimal("Deer", "deer_procedural", 5, 20 * 20); // Spawn 5 deer, further out
  addAnimal("Wolf", "wolf_procedural", 5, 35 * 35); // Spawn 3 wolves, even further out

  // Add Decorative Grass and Flowers
  const addDecoration = (
    creator: (pos: Vector3, terrain: Mesh) => Group,
    count: number,
    minDistSq: number
  ) => {
    for (let i = 0; i < count; i++) {
      const x = randomFloat(-halfSize * 0.95, halfSize * 0.95);
      const z = randomFloat(-halfSize * 0.95, halfSize * 0.95);
      const distSq = (x - villageCenter.x) ** 2 + (z - villageCenter.z) ** 2;
      if (distSq < minDistSq) continue;

      const decoration = creator(new Vector3(x, 0, z), terrain);
      const height = getTerrainHeight(scene, x, z);
      decoration.position.y = height;

      scene.add(decoration);
    }
  };

  // Add Grass Patches
  addDecoration(createGrassPatch, Math.floor(worldSize * 0.3), villageRadiusSq);

  // Add Flower Patches
  addDecoration(
    createFlowerPatch,
    Math.floor(worldSize * 0.15),
    villageRadiusSq
  );
}
