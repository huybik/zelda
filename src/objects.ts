// File: /src/objects.ts
import {
  Vector3,
  Mesh,
  Group,
  CylinderGeometry,
  ConeGeometry,
  BoxGeometry,
  SphereGeometry,
  MeshLambertMaterial,
  Scene,
  Box3,
} from "three";
import { Character } from "./entities";
import {
  EntityUserData,
  InteractionResult,
} from "./core/types";
import {
  Colors,
  TREE_GATHER_TIME,
  TREE_RESPAWN_TIME,
  ROCK_GATHER_TIME,
  ROCK_RESPAWN_TIME,
  HERB_GATHER_TIME,
  HERB_RESPAWN_TIME,
  getNextEntityId,
} from "./core/constants";
import { randomFloat } from "./core/utils";
// Inventory and EventLog are used within the 'interact' method via player object,
// so direct imports might not be needed here unless used elsewhere.

const treeTrunkMat = new MeshLambertMaterial({ color: Colors.PASTEL_BROWN });
const treeFoliageMat = new MeshLambertMaterial({ color: Colors.PASTEL_GREEN });
const rockMat = new MeshLambertMaterial({ color: Colors.PASTEL_GRAY });
const herbMat = new MeshLambertMaterial({ color: Colors.FOREST_GREEN });

export class InteractableObject {
  id: string;
  name: string;
  position: Vector3;
  interactionType: string;
  data: any;
  prompt: string;
  mesh: Mesh | Group | null;
  isActive: boolean;
  userData: EntityUserData;

  constructor(
    id: string,
    name: string,
    position: Vector3,
    interactionType: string,
    data: any,
    prompt: string,
    mesh: Mesh | Group | null = null,
    scene: Scene | null = null
  ) {
    this.id = id;
    this.name = name;
    this.position = position.clone();
    this.interactionType = interactionType;
    this.data = data;
    this.prompt = prompt;
    this.mesh = mesh;
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
      isCollidable: false,
    };

    if (this.mesh) {
      this.mesh.userData = this.userData;
      this.mesh.position.copy(this.position);
    }
  }

  interact(player: Character): InteractionResult | null {
    if (!this.isActive) return { type: "error", message: "Already used." };
    let message = "";
    let action = "interact";
    let details: Record<string, any> = {};

    const inventory = player.inventory;
    const game = player.game;

    if (!inventory || !game) {
      console.error(
        "Player inventory or game instance not found for interaction."
      );
      return { type: "error", message: "Internal error." };
    }

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

export class ResourceNode extends InteractableObject {
  resourceName: string;
  gatherTime: number;
  respawnTime: number;
  isDepletable: boolean;
  isDepleted: boolean = false;
  respawnTimeout: ReturnType<typeof setTimeout> | null = null;

  constructor(
    id: string,
    name: string,
    position: Vector3,
    mesh: Group,
    resourceName: string,
    gatherTime: number,
    respawnTime: number,
    isDepletable: boolean,
    isCollidable: boolean,
    prompt: string
  ) {
    super(id, name, position, "gather", {}, prompt, mesh);

    this.resourceName = resourceName;
    this.gatherTime = gatherTime;
    this.respawnTime = respawnTime;
    this.isDepletable = isDepletable;

    this.userData.resource = this.resourceName;
    this.userData.gatherTime = this.gatherTime;
    this.userData.isDepletable = this.isDepletable;
    this.userData.respawnTime = this.respawnTime;
    this.userData.isCollidable = isCollidable;
    this.userData.isSimpleObject = false;
    this.userData.boundingBox = new Box3().setFromObject(mesh);
    if (mesh) {
      mesh.userData = this.userData;
    }
  }

  interact(player: Character): InteractionResult | null {
    if (this.isDepleted || !this.isActive) {
      return { type: "error", message: `${this.name} is depleted.` };
    }
    return { type: "gather_start" };
  }

  deplete(): void {
    if (!this.isDepletable || this.isDepleted) return;

    this.isDepleted = true;
    this.isActive = false;
    this.userData.isInteractable = false;
    if (this.mesh) {
      this.mesh.visible = false;
    }
    console.log(`${this.name} depleted.`);

    if (this.respawnTimeout) {
      clearTimeout(this.respawnTimeout);
      this.respawnTimeout = null;
    }

    this.respawnTimeout = setTimeout(() => {
      this.respawn();
    }, this.respawnTime);
  }

  respawn(): void {
    if (!this.isDepletable || !this.isDepleted) return;

    this.isDepleted = false;
    this.isActive = true;
    this.userData.isInteractable = true;
    if (this.mesh) {
      this.mesh.visible = true;
    }
    this.respawnTimeout = null;
    console.log(`${this.name} respawned.`);
  }

  removeFromWorld(): void {
    super.removeFromWorld();
    if (this.respawnTimeout) {
      clearTimeout(this.respawnTimeout);
      this.respawnTimeout = null;
    }
  }
}

export function createTree(position: Vector3): ResourceNode {
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

  const node = new ResourceNode(
    `${treeGroup.name}_${getNextEntityId()}`,
    treeGroup.name,
    position,
    treeGroup,
    "wood",
    TREE_GATHER_TIME,
    TREE_RESPAWN_TIME,
    true,
    true,
    "Press E to gather Wood"
  );
  return node;
}

export function createRock(position: Vector3, size: number): ResourceNode {
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

  const node = new ResourceNode(
    `${rockGroup.name}_${getNextEntityId()}`,
    rockGroup.name,
    position,
    rockGroup,
    "stone",
    ROCK_GATHER_TIME,
    ROCK_RESPAWN_TIME,
    true,
    true,
    "Press E to gather Stone"
  );
  return node;
}

export function createHerb(position: Vector3): ResourceNode {
  const herbGroup = new Group();
  herbGroup.name = "Herb Plant";
  const size = 0.25;
  const geo = new SphereGeometry(size, 5, 4);
  const mesh = new Mesh(geo, herbMat);
  mesh.castShadow = true;
  herbGroup.add(mesh);

  const node = new ResourceNode(
    `${herbGroup.name}_${getNextEntityId()}`,
    herbGroup.name,
    position,
    herbGroup,
    "herb",
    HERB_GATHER_TIME,
    HERB_RESPAWN_TIME,
    true,
    false,
    "Press E to gather Herb"
  );
  node.mesh!.position.copy(position).setY(size);
  return node;
}
