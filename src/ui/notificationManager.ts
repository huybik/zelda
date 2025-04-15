/* File: /src/ui/notificationManager.ts */
import * as THREE from "three";
import { getItemDefinition } from "../core/items";

interface ActiveSprite {
  sprite: THREE.Sprite;
  startTime: number;
  initialPosition: THREE.Vector3;
  texture: THREE.CanvasTexture;
  material: THREE.SpriteMaterial;
}

interface ActiveText {
  element: HTMLElement;
  startTime: number;
}

export class NotificationManager {
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private uiContainer: HTMLElement;
  private activeAttackSprites: ActiveSprite[] = [];
  private activeItemTexts: ActiveText[] = [];

  private readonly spriteDuration = 1.2; // seconds
  private readonly spriteFlySpeed = 1.5; // world units per second
  private readonly spriteScale = 0.3;

  private readonly textDuration = 1.5; // seconds (CSS animation handles timing)

  constructor(
    scene: THREE.Scene,
    camera: THREE.PerspectiveCamera,
    uiContainer: HTMLElement
  ) {
    this.scene = scene;
    this.camera = camera;
    this.uiContainer = uiContainer; // Container for HTML notifications
  }

  /**
   * Creates a floating damage number sprite at a world position.
   * @param amount The damage amount to display.
   * @param position The world position where the damage occurred.
   */
  createAttackNumberSprite(amount: number, position: THREE.Vector3): void {
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d");
    if (!context) return;

    const fontSize = 48;
    const padding = 10;
    context.font = `bold ${fontSize}px Arial`;
    const textWidth = context.measureText(amount.toString()).width;

    canvas.width = textWidth + padding * 2;
    canvas.height = fontSize + padding * 2;

    // Re-apply font after resize
    context.font = `bold ${fontSize}px Arial`;
    context.fillStyle = "rgba(255, 50, 50, 1)"; // Red color
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.shadowColor = "rgba(0, 0, 0, 0.7)";
    context.shadowBlur = 5;
    context.shadowOffsetX = 2;
    context.shadowOffsetY = 2;

    context.fillText(
      amount.toString(),
      canvas.width / 2,
      canvas.height / 2 + 2
    ); // Adjust Y slightly for better centering

    const texture = new THREE.CanvasTexture(canvas);
    texture.needsUpdate = true;

    const material = new THREE.SpriteMaterial({
      map: texture,
      transparent: true,
      depthTest: true, // Enable depth testing
      depthWrite: false, // Keep depthWrite false for transparency
      sizeAttenuation: true, // Scale with distance
    });

    const sprite = new THREE.Sprite(material);
    const aspectRatio = canvas.width / canvas.height;
    sprite.scale.set(
      this.spriteScale * aspectRatio,
      this.spriteScale,
      this.spriteScale
    );
    sprite.position.copy(position);
    sprite.center.set(0.5, 0.5); // Ensure scaling is from center

    this.scene.add(sprite);

    this.activeAttackSprites.push({
      sprite,
      startTime: performance.now() / 1000,
      initialPosition: position.clone(),
      texture,
      material,
    });
  }

  /**
   * Creates a floating text notification for items added to the inventory.
   * @param itemId The ID of the item added.
   * @param count The number of items added.
   */
  createItemAddedText(itemId: string, count: number): void {
    const definition = getItemDefinition(itemId);
    const itemName = definition ? definition.name : itemId; // Fallback to ID if no definition

    const textElement = document.createElement("div");
    textElement.classList.add("item-added-notification");
    textElement.textContent = `+${count} ${itemName}`;

    this.uiContainer.appendChild(textElement);

    this.activeItemTexts.push({
      element: textElement,
      startTime: performance.now() / 1000,
    });

    // Remove the element after the CSS animation completes
    textElement.addEventListener(
      "animationend",
      () => {
        if (textElement.parentNode === this.uiContainer) {
          this.uiContainer.removeChild(textElement);
          // Also remove from active list to prevent memory leaks if animationend fires late
          const index = this.activeItemTexts.findIndex(
            (t) => t.element === textElement
          );
          if (index > -1) {
            this.activeItemTexts.splice(index, 1);
          }
        }
      },
      { once: true }
    );

    // Fallback removal in case animationend doesn't fire reliably
    setTimeout(
      () => {
        if (textElement.parentNode === this.uiContainer) {
          this.uiContainer.removeChild(textElement);
        }
        // Remove from active list
        const index = this.activeItemTexts.findIndex(
          (t) => t.element === textElement
        );
        if (index > -1) {
          this.activeItemTexts.splice(index, 1);
        }
      },
      this.textDuration * 1000 + 100
    ); // Add a small buffer
  }

  /**
   * Updates the position and opacity of active notifications.
   * @param deltaTime Time elapsed since the last frame.
   */
  update(deltaTime: number): void {
    const now = performance.now() / 1000;

    // Update Attack Sprites
    for (let i = this.activeAttackSprites.length - 1; i >= 0; i--) {
      const data = this.activeAttackSprites[i];
      const elapsedTime = now - data.startTime;
      const progress = Math.min(1.0, elapsedTime / this.spriteDuration);

      if (progress >= 1.0) {
        // Remove sprite
        this.scene.remove(data.sprite);
        data.material.dispose();
        data.texture.dispose();
        this.activeAttackSprites.splice(i, 1);
      } else {
        // Update position (fly up)
        data.sprite.position.y =
          data.initialPosition.y + elapsedTime * this.spriteFlySpeed;

        // Update opacity (fade out in the second half)
        if (progress > 0.5) {
          data.material.opacity = THREE.MathUtils.mapLinear(
            progress,
            0.5,
            1.0,
            1.0,
            0.0
          );
        } else {
          data.material.opacity = 1.0;
        }
        data.material.needsUpdate = true; // Important for opacity changes
      }
    }

    // Update Item Texts (CSS handles animation, just need cleanup check)
    // The primary cleanup is handled by animationend listener and setTimeout in createItemAddedText
    // This loop is mainly a fallback or for potential future logic
    for (let i = this.activeItemTexts.length - 1; i >= 0; i--) {
      const data = this.activeItemTexts[i];
      const elapsedTime = now - data.startTime;
      if (elapsedTime > this.textDuration + 0.5) {
        // Extra safety cleanup
        if (data.element.parentNode === this.uiContainer) {
          this.uiContainer.removeChild(data.element);
        }
        this.activeItemTexts.splice(i, 1);
      }
    }
  }

  /**
   * Cleans up any remaining notifications.
   */
  dispose(): void {
    // Dispose attack sprites
    this.activeAttackSprites.forEach((data) => {
      this.scene.remove(data.sprite);
      data.material.dispose();
      data.texture.dispose();
    });
    this.activeAttackSprites = [];

    // Remove item text elements
    this.activeItemTexts.forEach((data) => {
      if (data.element.parentNode === this.uiContainer) {
        this.uiContainer.removeChild(data.element);
      }
    });
    this.activeItemTexts = [];
  }
}
