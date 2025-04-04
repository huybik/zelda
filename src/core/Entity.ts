// src/core/Entity.ts
import {
  Object3D,
  Vector3,
  Box3,
  Group,
  Mesh,
  Material,
  Sprite,
  CanvasTexture,
  SpriteMaterial,
  Scene,
} from "three";
import type { EntityUserData, UpdateOptions } from "../types";
import { getNextEntityId } from "../utils";
import { CHARACTER_HEIGHT, CHARACTER_RADIUS } from "../config";
import type { Game } from "../Game"; // Use type import to avoid circular dependency issues at runtime

export class Entity {
  id: string;
  mesh: Group | null; // Use Group to allow complex models
  scene: Scene | null;
  name: string;
  velocity: Vector3;
  boundingBox: Box3;
  health: number;
  maxHealth: number;
  isDead: boolean;
  userData: EntityUserData;
  game: Game | null = null; // Reference to the main game instance, set after creation

  // Optional display elements for name/intent (primarily for Characters, but could be generic)
  intentSprite: Sprite | null = null;
  nameSprite: Sprite | null = null;
  private intentCanvas: HTMLCanvasElement | null = null;
  private intentContext: CanvasRenderingContext2D | null = null;
  private intentTexture: CanvasTexture | null = null;
  private nameCanvas: HTMLCanvasElement | null = null;
  private nameContext: CanvasRenderingContext2D | null = null;
  private nameTexture: CanvasTexture | null = null;

  constructor(scene: Scene, position: Vector3, name: string = "Entity") {
    this.id = `${name}_${getNextEntityId()}`;
    this.scene = scene;
    this.name = name;
    this.mesh = new Group(); // Use Group as the base mesh container
    this.mesh.position.copy(position);
    this.velocity = new Vector3();
    this.boundingBox = new Box3(); // Initialize empty, calculated later
    this.health = 100;
    this.maxHealth = 100;
    this.isDead = false;

    // Initialize basic UserData
    this.userData = {
      entityReference: this, // Reference back to this Entity instance
      isEntity: true,
      isPlayer: false,
      isNPC: false,
      isCollidable: true, // Default to collidable
      isInteractable: false, // Default to not interactable
      id: this.id,
      height: CHARACTER_HEIGHT, // Default height
      radius: CHARACTER_RADIUS, // Default radius
    };

    // Assign userData to the mesh for raycasting/interaction checks
    if (this.mesh) {
      this.mesh.userData = this.userData;
      this.mesh.name = this.name; // Assign name to the Group for easier debugging
      this.scene.add(this.mesh);
    }

    // Initial bounding box calculation (can be refined in subclasses)
    this.updateBoundingBox();
  }

  // Basic update method, intended to be overridden by subclasses like Character.
  update(deltaTime: number, options: UpdateOptions = {}): void {
    // Base entity might not do anything on update unless specified
  }

  // Updates the entity's bounding box based on its current position and dimensions.
  updateBoundingBox(): void {
    if (!this.mesh) return;

    // Use dimensions from userData if available, otherwise defaults
    const height = this.userData.height ?? CHARACTER_HEIGHT;
    const radius = this.userData.radius ?? CHARACTER_RADIUS;

    // Calculate center based on mesh position and half height
    const center = this.mesh.position
      .clone()
      .add(new Vector3(0, height / 2, 0));
    // Size based on radius (for X/Z) and height (for Y)
    const size = new Vector3(radius * 2, height, radius * 2);

    this.boundingBox.setFromCenterAndSize(center, size);
    // Keep the boundingBox reference in userData up-to-date if needed elsewhere
    this.userData.boundingBox = this.boundingBox;
  }

  // Sets the entity's position and updates its bounding box.
  setPosition(position: Vector3): void {
    if (!this.mesh) return;
    this.mesh.position.copy(position);
    this.updateBoundingBox(); // Update BB after position change
  }

  // Makes the entity look at a target position horizontally.
  lookAt(targetPosition: Vector3): void {
    if (!this.mesh) return;
    const target = targetPosition.clone();
    target.y = this.mesh.position.y; // Look horizontally only

    // Avoid looking at self if target is too close
    if (target.distanceToSquared(this.mesh.position) < 0.001) return;

    this.mesh.lookAt(target);
  }

  // Applies damage to the entity.
  takeDamage(amount: number, attacker?: Entity): void {
    if (this.isDead || amount <= 0) return;

    this.health = Math.max(0, this.health - amount);

    // Log the event via the Game instance
    this.game?.logEvent(
      this, // Actor taking damage
      "take_damage",
      `${this.name} took ${amount} damage${attacker ? ` from ${attacker.name}` : ""}.`,
      attacker, // Target is the attacker
      { damage: amount },
      this.mesh?.position // Location of the event
    );

    if (this.health <= 0) {
      this.die(attacker);
    }
  }

  // Heals the entity.
  heal(amount: number): void {
    if (this.isDead || amount <= 0 || this.health >= this.maxHealth) return;

    const actualHeal = Math.min(amount, this.maxHealth - this.health);
    this.health += actualHeal;

    // Logging for healing is often handled by the action/item that triggers it
    // e.g., in Character.selfHeal or an item usage effect.
    // this.game?.logEvent(this, 'heal', `${this.name} healed for ${actualHeal}.`, undefined, { amount: actualHeal }, this.mesh?.position);
  }

  // Handles the entity's death.
  die(attacker: Entity | null = null): void {
    if (this.isDead) return;

    this.isDead = true;
    this.velocity.set(0, 0, 0); // Stop movement
    this.health = 0;
    this.userData.isCollidable = false; // Usually becomes non-collidable
    this.userData.isInteractable = false; // Usually becomes non-interactable

    // Logging handled in Character.die or specific death logic
  }

  // Removes the entity's mesh and associated resources from the scene.
  destroy(): void {
    this.removeDisplays(); // Clean up name/intent sprites

    if (!this.mesh || !this.scene) return;

    // Traverse the mesh group to dispose of geometries and materials
    this.mesh.traverse((child) => {
      if (child instanceof Mesh) {
        child.geometry?.dispose();
        if (Array.isArray(child.material)) {
          child.material.forEach((mat: Material) => mat?.dispose());
        } else if (child.material) {
          (child.material as Material).dispose();
        }
      }
    });

    this.scene.remove(this.mesh);
    this.mesh = null;
    this.scene = null; // Break reference to scene
    this.userData.entityReference = null; // Clear reference in userData
  }

  // --- Display Methods (for Name Tags, Intent Bubbles) ---

  initNameDisplay(): void {
    if (this.userData.isPlayer || this.nameSprite || !this.mesh) return; // Don't show for player, prevent re-init

    this.nameCanvas = document.createElement("canvas");
    this.nameCanvas.width = 200; // Adjust resolution as needed
    this.nameCanvas.height = 30;
    this.nameContext = this.nameCanvas.getContext("2d");
    if (!this.nameContext) return;

    this.nameTexture = new CanvasTexture(this.nameCanvas);
    const material = new SpriteMaterial({
      map: this.nameTexture,
      depthTest: false,
      transparent: true,
    }); // Disable depth test to render on top
    this.nameSprite = new Sprite(material);

    const aspectRatio = this.nameCanvas.width / this.nameCanvas.height;
    const displayHeight = 0.3; // Size in world units
    this.nameSprite.scale.set(aspectRatio * displayHeight, displayHeight, 1);
    // Position above the character's head, adjust Y offset as needed
    this.nameSprite.position.set(
      0,
      (this.userData.height ?? CHARACTER_HEIGHT) + 0.15,
      0
    );
    this.mesh.add(this.nameSprite); // Add to the entity's mesh group

    this.updateNameDisplay(this.name); // Initial render
  }

  updateNameDisplay(name: string): void {
    if (!this.nameContext || !this.nameCanvas || !this.nameTexture) return;
    const ctx = this.nameContext;
    const canvas = this.nameCanvas;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.font = "16px Arial"; // Font size and style
    ctx.fillStyle = "blue"; // Text color
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(name, canvas.width / 2, canvas.height / 2);

    this.nameTexture.needsUpdate = true; // Important: update the texture
  }

  initIntentDisplay(): void {
    if (this.intentSprite || !this.mesh) return; // Prevent re-init

    this.intentCanvas = document.createElement("canvas");
    this.intentCanvas.width = 200; // Wider for potentially longer text
    this.intentCanvas.height = 70; // Taller for multiple lines
    this.intentContext = this.intentCanvas.getContext("2d");
    if (!this.intentContext) return;

    this.intentTexture = new CanvasTexture(this.intentCanvas);
    const material = new SpriteMaterial({
      map: this.intentTexture,
      depthTest: false,
      transparent: true,
    }); // Disable depth test
    this.intentSprite = new Sprite(material);

    const aspectRatio = this.intentCanvas.width / this.intentCanvas.height;
    const displayHeight = 0.6; // Larger size for intent bubble
    this.intentSprite.scale.set(aspectRatio * displayHeight, displayHeight, 1);
    // Position above the name tag
    this.intentSprite.position.set(
      0,
      (this.userData.height ?? CHARACTER_HEIGHT) + 0.6,
      0
    );
    this.mesh.add(this.intentSprite);

    this.updateIntentDisplay(""); // Start hidden
  }

  updateIntentDisplay(text: string): void {
    if (
      !this.intentContext ||
      !this.intentCanvas ||
      !this.intentTexture ||
      !this.intentSprite
    )
      return;

    // Hide sprite if text is empty
    if (!text || text.trim() === "") {
      this.intentSprite.visible = false;
      return;
    }
    this.intentSprite.visible = true;

    const ctx = this.intentContext;
    const canvas = this.intentCanvas;
    const maxWidth = canvas.width - 10; // Padding
    const lineHeight = 20;
    const x = canvas.width / 2; // Center alignment
    const borderRadius = 10;

    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Draw background bubble
    ctx.fillStyle = "rgba(0, 0, 0, 0.6)"; // Semi-transparent black background
    ctx.beginPath();
    // Use roundRect for rounded corners (check browser compatibility if needed)
    if (ctx.roundRect) {
      ctx.roundRect(0, 0, canvas.width, canvas.height, borderRadius);
    } else {
      // Fallback for browsers without roundRect
      ctx.rect(0, 0, canvas.width, canvas.height);
    }
    ctx.fill();

    // Set text properties
    ctx.font = "13px Arial"; // Smaller font for intent
    ctx.fillStyle = "white"; // White text
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    // Basic word wrapping
    const words = text.split(" ");
    let lines: string[] = [];
    let currentLine = "";
    for (const word of words) {
      const testLine = currentLine + word + " ";
      if (ctx.measureText(testLine).width > maxWidth && currentLine !== "") {
        lines.push(currentLine.trim());
        currentLine = word + " ";
      } else {
        currentLine = testLine;
      }
    }
    lines.push(currentLine.trim());

    // Limit lines and draw text centered vertically
    const maxLines = 3; // Limit to 3 lines
    const linesToDraw = lines.slice(0, maxLines);
    const totalTextHeight = linesToDraw.length * lineHeight;
    let startY = (canvas.height - totalTextHeight) / 2 + lineHeight / 2; // Calculate starting Y

    for (let i = 0; i < linesToDraw.length; i++) {
      let line = linesToDraw[i];
      // Add ellipsis if text is truncated
      if (i === maxLines - 1 && lines.length > maxLines) {
        // Attempt to fit ellipsis
        while (
          ctx.measureText(line + "...").width > maxWidth &&
          line.length > 0
        ) {
          line = line.slice(0, -1); // Remove characters until ellipsis fits
        }
        line += "...";
      }
      ctx.fillText(line, x, startY + i * lineHeight);
    }

    this.intentTexture.needsUpdate = true; // Update the texture
  }

  // Shows a message temporarily in the intent display bubble.
  showTemporaryMessage(message: string, duration: number = 7000): void {
    if (!this.intentSprite || !this.mesh) return;

    // Try to get the current persistent intent (e.g., from AIController)
    // This requires Character to have a way to access its AI's current intent
    // For simplicity, we'll store the *previous* text shown in the sprite's userData
    const previousText = this.intentSprite.userData.persistentText || "";

    // Store the message being shown temporarily
    this.intentSprite.userData.temporaryText = message;
    this.updateIntentDisplay(message); // Show the temporary message

    // Clear any existing timeout for temporary messages
    if (this.intentSprite.userData.timeoutId) {
      clearTimeout(this.intentSprite.userData.timeoutId);
    }

    // Set a timeout to revert to the previous text
    this.intentSprite.userData.timeoutId = setTimeout(() => {
      // Only revert if the currently displayed text is still the temporary message
      // This prevents reverting if a new temporary message or persistent intent was set in the meantime
      if (this.intentSprite?.userData.temporaryText === message) {
        this.updateIntentDisplay(previousText); // Revert to original/previous text
        this.intentSprite.userData.temporaryText = null; // Clear temporary text flag
      }
      this.intentSprite!.userData.timeoutId = null; // Clear timeout ID
    }, duration);
  }

  // Stores the persistent text (like AI intent) for the display bubble
  setPersistentIntent(text: string): void {
    if (!this.intentSprite) return;
    this.intentSprite.userData.persistentText = text;
    // Only update the display if no temporary message is currently shown
    if (!this.intentSprite.userData.temporaryText) {
      this.updateIntentDisplay(text);
    }
  }

  // Removes and disposes of the name and intent display elements.
  removeDisplays(): void {
    if (this.intentSprite && this.mesh) {
      this.mesh.remove(this.intentSprite);
      this.intentSprite.material.map?.dispose();
      this.intentSprite.material.dispose();
      this.intentSprite = null;
      this.intentTexture?.dispose();
      this.intentTexture = null;
      this.intentCanvas = null;
      this.intentContext = null;
    }
    if (this.nameSprite && this.mesh) {
      this.mesh.remove(this.nameSprite);
      this.nameSprite.material.map?.dispose();
      this.nameSprite.material.dispose();
      this.nameSprite = null;
      this.nameTexture?.dispose();
      this.nameTexture = null;
      this.nameCanvas = null;
      this.nameContext = null;
    }
  }
}
