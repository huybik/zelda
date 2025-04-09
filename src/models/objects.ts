// File: /src/objects/objects.ts
import {
  Vector3,
  Mesh,
  Group,
  CylinderGeometry,
  ConeGeometry,
  BoxGeometry,
  SphereGeometry,
  MeshLambertMaterial,
  MeshBasicMaterial, // Use Basic for simple grass/flowers if lighting is not critical
  PlaneGeometry,
  Scene,
  Box3,
  Color,
  MathUtils,
  DoubleSide,
} from "three";
import { Character } from "../entities/character";
import { Inventory, InteractionResult, randomFloat } from "../core/utils";
import { Colors } from "../core/constants";

const treeTrunkMat = new MeshLambertMaterial({ color: Colors.PASTEL_BROWN });
const treeFoliageMat = new MeshLambertMaterial({ color: Colors.PASTEL_GREEN });
const rockMat = new MeshLambertMaterial({ color: Colors.PASTEL_GRAY });
const herbMat = new MeshLambertMaterial({ color: Colors.FOREST_GREEN });
const grassMat = new MeshBasicMaterial({
  color: 0x558b2f,
  side: DoubleSide,
}); // Darker green for grass

export class InteractableObject {
  id: string;
  name: string;
  position: Vector3;
  interactionType: string;
  data: any;
  prompt: string;
  mesh: Mesh | Group | null;
  isActive: boolean;
  userData: any;

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
      isCollidable: true,
    };
  }

  interact(player: Character): InteractionResult | null {
    if (!this.isActive) return { type: "error", message: "Already used." };
    let message = "";
    let action = "interact";
    let details: Record<string, any> = {};
    const inventory = player.inventory;
    const game = player.game;
    if (!inventory || !game)
      return { type: "error", message: "Internal error." };
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

// --- Decorative Elements ---

export function createGrassPatch(position: Vector3): Group {
  const patchGroup = new Group();
  patchGroup.name = "Grass Patch";
  const bladeCount = MathUtils.randInt(50, 150);
  const patchRadius = 5;

  for (let i = 0; i < bladeCount; i++) {
    const bladeHeight = randomFloat(0.2, 1);
    const bladeWidth = randomFloat(0.02, 0.04);
    const bladeGeo = new PlaneGeometry(bladeWidth, bladeHeight);
    const bladeMesh = new Mesh(bladeGeo, grassMat);

    // Position within the patch radius
    const angle = Math.random() * Math.PI * 2;
    const radius = Math.random() * patchRadius;
    bladeMesh.position.set(
      Math.cos(angle) * radius,
      bladeHeight / 2, // Pivot at base
      Math.sin(angle) * radius
    );

    // Random rotation and tilt
    bladeMesh.rotation.y = Math.random() * Math.PI * 2;
    bladeMesh.rotation.x = randomFloat(-0.2, 0.2);
    bladeMesh.rotation.z = randomFloat(-0.2, 0.2);

    patchGroup.add(bladeMesh);
  }

  patchGroup.position.copy(position);
  patchGroup.userData = { isDecoration: true }; // Mark as decoration
  return patchGroup;
}

const flowerColors = [0xff69b4, 0xffff00, 0x9370db, 0xffa500]; // Pink, Yellow, Purple, Orange

function createFlower(colorHex: number): Group {
  const flowerGroup = new Group();
  const stemHeight = randomFloat(0.15, 1);
  const stemRadius = 0.01;
  const petalSize = randomFloat(0.03, 0.05);
  const petalCount = MathUtils.randInt(4, 6);

  // Stem
  const stemGeo = new CylinderGeometry(stemRadius, stemRadius, stemHeight, 4);
  const stemMat = new MeshBasicMaterial({ color: 0x228b22 }); // Forest green
  const stemMesh = new Mesh(stemGeo, stemMat);
  stemMesh.position.y = stemHeight / 2;
  flowerGroup.add(stemMesh);

  // Petals
  const petalMat = new MeshBasicMaterial({
    color: colorHex,
    side: DoubleSide,
  });
  const petalGeo = new PlaneGeometry(petalSize, petalSize);
  for (let i = 0; i < petalCount; i++) {
    const petalMesh = new Mesh(petalGeo, petalMat);
    const angle = (i / petalCount) * Math.PI * 2;
    const petalRadius = petalSize * 0.6;

    petalMesh.position.set(
      Math.cos(angle) * petalRadius,
      stemHeight + petalSize * 0.2, // Slightly above stem top
      Math.sin(angle) * petalRadius
    );
    petalMesh.rotation.y = angle + Math.PI / 2; // Face outwards
    petalMesh.rotation.x = Math.PI / 4; // Angle upwards slightly

    flowerGroup.add(petalMesh);
  }

  return flowerGroup;
}

export function createFlowerPatch(position: Vector3): Group {
  const patchGroup = new Group();
  patchGroup.name = "Flower Patch";
  const flowerCount = MathUtils.randInt(30, 70);
  const patchRadius = 4;

  for (let i = 0; i < flowerCount; i++) {
    const randomColor =
      flowerColors[MathUtils.randInt(0, flowerColors.length - 1)];
    const flower = createFlower(randomColor);

    // Position within the patch radius
    const angle = Math.random() * Math.PI * 2;
    const radius = Math.random() * patchRadius;
    flower.position.set(
      Math.cos(angle) * radius,
      0, // Base of flower at patch y=0
      Math.sin(angle) * radius
    );
    flower.rotation.y = Math.random() * Math.PI * 2; // Random orientation

    patchGroup.add(flower);
  }

  patchGroup.position.copy(position);
  patchGroup.userData = { isDecoration: true }; // Mark as decoration
  return patchGroup;
}
