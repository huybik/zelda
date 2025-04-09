// File: /src/core/environment.ts
import {
  Scene,
  Vector3,
  Object3D,
  Group,
  AnimationClip,
  MathUtils,
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
  const villageRadiusSq = 15 * 15; // Don't spawn decorations too close to village center

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
    character.game = gameInstance;
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
    }
    entities.push(character);
    collidableObjects.push(character.mesh!);
    interactableObjects.push(character);
    return character;
  };

  // Add NPCs
  const farmerGiles = addCharacter(
    villageCenter.clone().add(new Vector3(-12, 0, 2)),
    "Farmer Giles",
    "tavernMan"
  );
  farmerGiles.persona =
    "A hardworking farmer who values community and is always willing to help others. He is knowledgeable about crops and livestock but can be a bit stubborn. He prefers to stay close to his farm but will venture out if necessary.";
  if (farmerGiles.aiController)
    farmerGiles.aiController.persona = farmerGiles.persona;

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
      if (obj.name === "Herb Plant") obj.position.y = height + 0.1; // Adjust herb height slightly

      scene.add(obj);
      if (obj.userData.isCollidable) collidableObjects.push(obj);
      if (obj.userData.isInteractable) interactableObjects.push(obj);
      entities.push(obj); // Add to entities for potential minimap display if needed later
      obj.userData.id = `${obj.name}_${obj.uuid.substring(0, 6)}`;
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
      // Animals are not typically interactable directly
      // interactableObjects.push(animal);
    }
  };

  // Spawn some deer and wolves
  addAnimal("Deer", "deer_procedural", 5, 20 * 20); // Spawn 5 deer, further out
  addAnimal("Wolf", "wolf_procedural", 3, 40 * 40); // Spawn 3 wolves, even further out

  // Add Decorative Grass and Flowers
  const addDecoration = (
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

      const decoration = creator(new Vector3(x, 0, z), ...args);
      const height = getTerrainHeight(scene, x, z);
      decoration.position.y = height;

      // Add directly to scene, NOT to collidables, interactables, or entities list for game logic
      scene.add(decoration);
    }
  };

  // Add Grass Patches (more numerous)
  addDecoration(createGrassPatch, worldSize * 0.5, villageRadiusSq);

  // Add Flower Patches (less numerous)
  addDecoration(
    createFlowerPatch,
    Math.floor(worldSize * 0.15),
    villageRadiusSq
  );
}
