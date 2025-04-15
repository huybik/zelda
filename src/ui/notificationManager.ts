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

export class NotificationManager {
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private activeSprites: ActiveSprite[] = []; // Combined array for all sprites

  private readonly spriteDuration = 2; // seconds
  private readonly spriteFlySpeed = 2; // world units per second
  private readonly spriteScale = 0.3;
  private readonly spritePositionRandomness = 0.7; // Max offset in world units (x/z)
  private readonly attackNumberFontSize = 40; // Smaller font size for attack numbers
  private readonly itemTextFontSize = 56; // Larger font size for item text

  constructor(
    scene: THREE.Scene,
    camera: THREE.PerspectiveCamera,
    uiContainer: HTMLElement // Keep uiContainer for potential future HTML notifications
  ) {
    this.scene = scene;
    this.camera = camera;
    // uiContainer is no longer used for item added text, but keep for future
  }

  /**
   * Creates a floating damage number sprite at a world position.
   * @param amount The damage amount to display.
   * @param position The world position where the damage occurred.
   */
  createAttackNumberSprite(amount: number, position: THREE.Vector3): void {
    const text = amount.toString();
    const color = "rgba(255, 50, 50, 1)"; // Red color
    this.createSpriteNotification(
      text,
      color,
      position,
      this.attackNumberFontSize
    );
  }

  /**
   * Creates a floating text notification sprite for items added to the inventory.
   * @param itemId The ID of the item added.
   * @param count The number of items added.
   * @param position The world position where the item was obtained.
   */
  createItemAddedSprite(
    itemId: string,
    count: number,
    position: THREE.Vector3
  ): void {
    const definition = getItemDefinition(itemId);
    const itemName = definition ? definition.name : itemId; // Fallback to ID
    const text = `+${count} ${itemName}`;
    const color = "rgba(144, 238, 144, 1)"; // Light green color
    this.createSpriteNotification(text, color, position, this.itemTextFontSize);
  }

  /**
   * Creates a floating text notification sprite for items removed from the inventory.
   * @param itemId The ID of the item removed.
   * @param count The number of items removed.
   * @param position The world position where the item was removed/used.
   */
  createItemRemovedSprite(
    itemId: string,
    count: number,
    position: THREE.Vector3
  ): void {
    const definition = getItemDefinition(itemId);
    const itemName = definition ? definition.name : itemId; // Fallback to ID
    const text = `-${count} ${itemName}`;
    const color = "rgba(255, 150, 150, 1)"; // Light red color
    this.createSpriteNotification(text, color, position, this.itemTextFontSize);
  }

  /**
   * Generic function to create a text sprite notification.
   * @param text The text content for the sprite.
   * @param color The CSS color string for the text.
   * @param position The world position for the sprite.
   * @param fontSize The font size in pixels.
   */
  private createSpriteNotification(
    text: string,
    color: string,
    position: THREE.Vector3,
    fontSize: number
  ): void {
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d");
    if (!context) return;

    context.font = `bold ${fontSize}px Arial`;
    const padding = 10;
    const textWidth = context.measureText(text).width;

    canvas.width = textWidth + padding * 2;
    canvas.height = fontSize + padding * 2;

    // Re-apply font and styles after resize
    context.font = `bold ${fontSize}px Arial`;
    context.fillStyle = color;
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.shadowColor = "rgba(0, 0, 0, 0.7)";
    context.shadowBlur = 5;
    context.shadowOffsetX = 2;
    context.shadowOffsetY = 2;

    context.fillText(text, canvas.width / 2, canvas.height / 2 + 2); // Adjust Y slightly

    const texture = new THREE.CanvasTexture(canvas);
    texture.needsUpdate = true;

    const material = new THREE.SpriteMaterial({
      map: texture,
      transparent: true,
      depthTest: true,
      depthWrite: false,
      sizeAttenuation: true,
    });

    const sprite = new THREE.Sprite(material);
    const aspectRatio = canvas.width / canvas.height;
    sprite.scale.set(
      this.spriteScale * aspectRatio,
      this.spriteScale,
      this.spriteScale
    );

    // Apply randomization to the initial position
    const randomOffsetX = (Math.random() - 0.5) * this.spritePositionRandomness;
    const randomOffsetZ = (Math.random() - 0.5) * this.spritePositionRandomness;
    const randomizedPosition = position.clone();
    randomizedPosition.x += randomOffsetX;
    randomizedPosition.z += randomOffsetZ;

    sprite.position.copy(randomizedPosition);
    sprite.center.set(0.5, 0.5);

    this.scene.add(sprite);

    this.activeSprites.push({
      sprite,
      startTime: performance.now() / 1000,
      initialPosition: randomizedPosition.clone(), // Store the randomized position
      texture,
      material,
    });
  }

  /**
   * Updates the position and opacity of active notifications.
   * @param deltaTime Time elapsed since the last frame.
   */
  update(deltaTime: number): void {
    const now = performance.now() / 1000;

    // Update Sprites
    for (let i = this.activeSprites.length - 1; i >= 0; i--) {
      const data = this.activeSprites[i];
      const elapsedTime = now - data.startTime;
      const progress = Math.min(1.0, elapsedTime / this.spriteDuration);

      if (progress >= 1.0) {
        // Remove sprite
        this.scene.remove(data.sprite);
        data.material.dispose();
        data.texture.dispose();
        this.activeSprites.splice(i, 1);
      } else {
        // Update position (fly up from initial randomized position)
        data.sprite.position.y =
          data.initialPosition.y + elapsedTime * this.spriteFlySpeed;
        // Keep the randomized x/z
        data.sprite.position.x = data.initialPosition.x;
        data.sprite.position.z = data.initialPosition.z;

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
  }

  /**
   * Cleans up any remaining notifications.
   */
  dispose(): void {
    // Dispose sprites
    this.activeSprites.forEach((data) => {
      this.scene.remove(data.sprite);
      data.material.dispose();
      data.texture.dispose();
    });
    this.activeSprites = [];
  }
}
