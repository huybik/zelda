/* File: /src/entities/entitiy.ts */
import {
  Scene,
  Vector3,
  Box3,
  Group,
  Mesh,
  Material,
  CanvasTexture,
  Sprite,
  SpriteMaterial,
  Raycaster, // Import Raycaster
} from "three";
import {
  EntityUserData,
  UpdateOptions,
  getNextEntityId,
  getTerrainHeight,
} from "../core/utils";
// Removed Raycaster import from here as it's imported above
import { Game } from "../main";
import type { AIController } from "../ai/npcAI";
import type { AnimalAIController } from "../ai/animalAI"; // Import Animal AI
import { CHARACTER_HEIGHT, CHARACTER_RADIUS } from "../core/constants";

export class Entity {
  id: string;
  mesh: Group | null;
  scene: Scene | null;
  name: string;
  velocity: Vector3;
  boundingBox: Box3;
  health: number;
  maxHealth: number;
  isDead: boolean;
  userData: EntityUserData;
  game: Game | null = null;
  intentCanvas: HTMLCanvasElement | null = null;
  intentContext: CanvasRenderingContext2D | null = null;
  intentTexture: CanvasTexture | null = null;
  intentSprite: Sprite | null = null;
  nameCanvas: HTMLCanvasElement | null = null;
  nameContext: CanvasRenderingContext2D | null = null;
  nameTexture: CanvasTexture | null = null;
  nameSprite: Sprite | null = null;
  // Use a union type for the AI controller
  aiController: AIController | AnimalAIController | null = null;
  rayCaster: Raycaster | null = null; // Raycaster can be null initially
  deathTimestamp: number | null = null;
  homePosition: Vector3 | null = null; // Added home position for respawning

  constructor(scene: Scene, position: Vector3, name: string = "Entity") {
    this.id = `${name}_${getNextEntityId()}`;
    this.scene = scene;
    this.name = name;
    this.mesh = new Group();
    this.mesh.position.copy(position);
    this.homePosition = position.clone(); // Initialize home position
    this.velocity = new Vector3();
    this.boundingBox = new Box3();
    this.health = 100;
    this.maxHealth = 100;
    this.isDead = false;

    this.userData = {
      entityReference: this,
      isEntity: true,
      isPlayer: false,
      isNPC: false,
      isCollidable: true,
      isInteractable: false, // Default to false, set by subclasses
      id: this.id,
    };
    if (this.mesh) {
      this.mesh.userData = this.userData;
      this.mesh.name = this.name;
      this.scene.add(this.mesh);
    }
  }

  update(deltaTime: number, options: UpdateOptions = {}): void {}

  initNameDisplay(): void {
    // Allow for NPCs and Animals, but not the player
    if (this.userData.isPlayer || !this.mesh) return;

    if (!this.nameCanvas) {
      this.nameCanvas = document.createElement("canvas");
      this.nameCanvas.width = 200;
      this.nameCanvas.height = 30;
      this.nameContext = this.nameCanvas.getContext("2d")!;
      this.nameTexture = new CanvasTexture(this.nameCanvas);
    }
    if (!this.nameSprite) {
      const material = new SpriteMaterial({ map: this.nameTexture });
      this.nameSprite = new Sprite(material);
      const aspectRatio = this.nameCanvas.width / this.nameCanvas.height;
      this.nameSprite.scale.set(aspectRatio * 0.3, 0.3, 1);
      // Position above the entity based on its height
      const displayHeight = (this.userData.height ?? CHARACTER_HEIGHT) + 0.15;
      this.nameSprite.position.set(0, displayHeight, 0);
      this.mesh!.add(this.nameSprite);
    }
    this.updateNameDisplay(this.name);
  }

  updateNameDisplay(name: string): void {
    if (!this.nameContext || !this.nameCanvas || !this.nameTexture) return;

    // Determine the name to display (Type for animals, full name for others)
    const displayName = this.userData.isAnimal
      ? (this.userData.animalType ?? this.name) // Use animalType if available
      : name;

    const ctx = this.nameContext;
    const canvas = this.nameCanvas;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.font = "16px Arial";
    ctx.fillStyle = this.userData.isAggressive ? "red" : "blue"; // Different color for animals?
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(String(displayName), canvas.width / 2, canvas.height / 2);
    this.nameTexture.needsUpdate = true;
  }

  removeDisplays(): void {
    if (this.intentSprite && this.mesh) {
      this.mesh.remove(this.intentSprite);
      this.intentSprite = null;
    }
    if (this.nameSprite && this.mesh) {
      this.mesh.remove(this.nameSprite);
      this.nameSprite = null;
    }
  }

  updateBoundingBox(): void {
    if (!this.mesh) return;
    // Use specific height/radius if available, otherwise fallback
    const height = this.userData.height ?? CHARACTER_HEIGHT;
    const radius = this.userData.radius ?? CHARACTER_RADIUS;
    const center = this.mesh.position
      .clone()
      .add(new Vector3(0, height / 2, 0));
    const size = new Vector3(radius * 2, height, radius * 2);
    this.boundingBox.setFromCenterAndSize(center, size);
    this.userData.boundingBox = this.boundingBox;
  }

  setPosition(position: Vector3): void {
    if (!this.mesh) return;
    this.mesh.position.copy(position);
    this.updateBoundingBox();
  }

  lookAt(targetPosition: Vector3): void {
    if (!this.mesh) return;
    const target = targetPosition.clone();
    target.y = this.mesh.position.y;
    if (target.distanceToSquared(this.mesh.position) < 0.001) return;
    this.mesh.lookAt(target);
  }

  takeDamage(
    amount: number,
    attacker: Entity | null = null,
    hitPosition?: Vector3
  ): void {
    if (this.isDead || amount <= 0) return;
    this.health = Math.max(0, this.health - amount);

    // Use provided hitPosition or estimate based on bounding box center
    const displayPosition =
      hitPosition ??
      this.boundingBox.getCenter(new Vector3()).add(new Vector3(0, 0.2, 0)); // Slightly above center

    if (this.game) {
      const message = `${this.name} took ${amount} damage${
        attacker ? ` from ${attacker.name}` : ""
      }.`;
      this.game.logEvent(
        this,
        "take_damage",
        message,
        attacker || undefined,
        { damage: amount },
        this.mesh!.position
      );
      // Spawn damage number notification
      this.game.notificationManager?.createAttackNumberSprite(
        amount,
        displayPosition
      );
      // Spawn particle effect
      this.game.spawnParticleEffect(displayPosition, "red");
    }

    if (this.health <= 0) this.die(attacker);
  }

  die(attacker: Entity | null = null): void {
    if (this.isDead) return;
    this.isDead = true;
    this.velocity.set(0, 0, 0); // Stop movement
    this.health = 0;
    this.userData.isCollidable = false; // Make non-collidable
    this.userData.isInteractable = false; // Make non-interactable
    this.deathTimestamp = performance.now(); // Record time of death
    this.mesh!.visible = false; // Hide mesh immediately on death

    // Stop AI updates
    if (this.aiController) {
      this.aiController.aiState = "dead";
    }
    this.removeDisplays(); // Remove name/intent displays on death
  }

  destroy(): void {
    if (!this.mesh || !this.scene) return;

    this.removeDisplays();

    this.intentTexture?.dispose();
    this.nameTexture?.dispose();
    this.intentCanvas = null;
    this.nameCanvas = null;
    this.intentContext = null;
    this.nameContext = null;

    this.mesh.traverse((child) => {
      if (child instanceof Mesh) {
        child.geometry?.dispose();
        if (Array.isArray(child.material)) {
          child.material.forEach((mat: Material) => mat?.dispose());
        } else {
          (child.material as Material)?.dispose();
        }
      } else if (child instanceof Sprite) {
        child.material?.map?.dispose();
        child.material?.dispose();
      }
    });
    this.scene.remove(this.mesh);
    this.mesh = null;
    this.scene = null;
    this.userData.entityReference = null;
    this.aiController = null;
    this.game = null;
  }
}
