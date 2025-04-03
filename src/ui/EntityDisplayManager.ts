import {
  Vector3,
  Sprite,
  SpriteMaterial,
  CanvasTexture,
  Scene,
  Camera,
} from "three";
import { Entity, Character } from "../entities"; // Adjust path as needed
import { Game } from "../main"; // Adjust path as needed
import { CHARACTER_HEIGHT } from "../core/constants"; // Adjust path as needed

interface EntityDisplayData {
  entity: Entity;
  intentSprite: Sprite | null;
  nameSprite: Sprite | null;
  intentCanvas: HTMLCanvasElement | null;
  intentContext: CanvasRenderingContext2D | null;
  intentTexture: CanvasTexture | null;
  nameCanvas: HTMLCanvasElement | null;
  nameContext: CanvasRenderingContext2D | null;
  nameTexture: CanvasTexture | null;
  currentIntentText: string; // Store the AI's intended text
  temporaryMessageTimeout: ReturnType<typeof setTimeout> | null;
}

export class EntityDisplayManager {
  private game: Game;
  private scene: Scene;
  private camera: Camera;
  private displayMap: Map<string, EntityDisplayData> = new Map();

  constructor(game: Game, scene: Scene, camera: Camera) {
    this.game = game;
    this.scene = scene;
    this.camera = camera;
  }

  addEntity(entity: Entity): void {
    if (this.displayMap.has(entity.id) || !(entity instanceof Character) || entity.userData.isPlayer) {
      // Don't add if already exists, not a character, or is the player
      return;
    }

    const displayData: EntityDisplayData = {
        entity,
        intentSprite: null,
        nameSprite: null,
        intentCanvas: null,
        intentContext: null,
        intentTexture: null,
        nameCanvas: null,
        nameContext: null,
        nameTexture: null,
        currentIntentText: entity.aiController?.currentIntent || "",
        temporaryMessageTimeout: null,
    };

    this.initNameDisplay(displayData);
    this.initIntentDisplay(displayData);
    this.displayMap.set(entity.id, displayData);

    // Initial update
    this.updateNameDisplay(displayData, entity.name);
    this.updateIntentDisplay(displayData, displayData.currentIntentText);
  }

  removeEntity(entity: Entity): void {
    const displayData = this.displayMap.get(entity.id);
    if (!displayData) return;

    if (displayData.intentSprite && displayData.entity.mesh) {
      displayData.entity.mesh.remove(displayData.intentSprite);
    }
    if (displayData.nameSprite && displayData.entity.mesh) {
        displayData.entity.mesh.remove(displayData.nameSprite);
    }

    // Clear any pending timeouts
    if (displayData.temporaryMessageTimeout) {
        clearTimeout(displayData.temporaryMessageTimeout);
    }

    // Dispose textures?
    displayData.intentTexture?.dispose();
    displayData.nameTexture?.dispose();

    this.displayMap.delete(entity.id);
  }

  private initNameDisplay(displayData: EntityDisplayData): void {
    const entity = displayData.entity;
    if (!entity.mesh) return;

    displayData.nameCanvas = document.createElement("canvas");
    displayData.nameCanvas.width = 200;
    displayData.nameCanvas.height = 30;
    displayData.nameContext = displayData.nameCanvas.getContext("2d")!;
    displayData.nameTexture = new CanvasTexture(displayData.nameCanvas);

    const material = new SpriteMaterial({ map: displayData.nameTexture });
    displayData.nameSprite = new Sprite(material);
    const aspectRatio = displayData.nameCanvas.width / displayData.nameCanvas.height;
    displayData.nameSprite.scale.set(aspectRatio * 0.3, 0.3, 1);
    displayData.nameSprite.position.set(0, CHARACTER_HEIGHT + 0.15, 0);
    entity.mesh.add(displayData.nameSprite);
  }

  private initIntentDisplay(displayData: EntityDisplayData): void {
      const entity = displayData.entity;
      if (!entity.mesh) return;

      displayData.intentCanvas = document.createElement("canvas");
      displayData.intentCanvas.width = 200;
      displayData.intentCanvas.height = 70;
      displayData.intentContext = displayData.intentCanvas.getContext("2d")!;
      displayData.intentTexture = new CanvasTexture(displayData.intentCanvas);

      const material = new SpriteMaterial({ map: displayData.intentTexture });
      displayData.intentSprite = new Sprite(material);
      const aspectRatio = displayData.intentCanvas.width / displayData.intentCanvas.height;
      displayData.intentSprite.scale.set(aspectRatio * 0.6, 0.6, 1);
      displayData.intentSprite.position.set(0, CHARACTER_HEIGHT + 0.6, 0);
      entity.mesh.add(displayData.intentSprite);
  }

  updateNameDisplay(displayData: EntityDisplayData, name: string): void {
      if (!displayData.nameContext || !displayData.nameCanvas || !displayData.nameTexture) return;

      const ctx = displayData.nameContext;
      const canvas = displayData.nameCanvas;

      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.font = "16px Arial";
      ctx.fillStyle = "blue"; // Or get from entity type/state?
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(name, canvas.width / 2, canvas.height / 2);

      displayData.nameTexture.needsUpdate = true;
  }

  updateIntentDisplay(displayData: EntityDisplayData, text: string): void {
    if (!displayData.intentContext || !displayData.intentCanvas || !displayData.intentTexture || !displayData.intentSprite) return;

    // Store the intended text
    displayData.currentIntentText = text;

    // If currently showing temporary message, don't overwrite it immediately
    if (displayData.temporaryMessageTimeout) {
        return;
    }

    this._drawIntentText(displayData, text);
  }

  // Internal drawing function
  private _drawIntentText(displayData: EntityDisplayData, text: string): void {
    if (!displayData.intentContext || !displayData.intentCanvas || !displayData.intentTexture || !displayData.intentSprite)
        return;

    const sprite = displayData.intentSprite;
    const ctx = displayData.intentContext;
    const canvas = displayData.intentCanvas;

    if (!text || text.trim() === "") {
        sprite.visible = false;
        return;
    }
    sprite.visible = true;

    const maxWidth = canvas.width - 10;
    const lineHeight = 20;
    const x = canvas.width / 2;
    const borderRadius = 10;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "rgba(0, 0, 0, 0.5)";
    ctx.beginPath();
    ctx.roundRect(0, 0, canvas.width, canvas.height, borderRadius);
    ctx.fill();

    ctx.font = "13px Arial";
    ctx.fillStyle = "white";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    // --- Text Wrapping Logic (simplified from Entity) ---
    const words = text.split(" ");
    let lines = [];
    let currentLine = "";
    for (let word of words) {
        const testLine = currentLine + word + " ";
        if (ctx.measureText(testLine).width > maxWidth && currentLine !== "") {
            lines.push(currentLine.trim());
            currentLine = word + " ";
        } else {
            currentLine = testLine;
        }
    }
    lines.push(currentLine.trim());
    // --- End Text Wrapping ---

    const totalTextHeight = lines.length * lineHeight;
    let startY = (canvas.height - totalTextHeight) / 2 + lineHeight / 2;

    for (let i = 0; i < lines.length && i < 3; i++) { // Limit lines
        if (i === 2 && lines.length > 3) { // Add ellipsis if more than 3 lines
            ctx.fillText(lines[i].substring(0, lines[i].length - 3) + "...", x, startY + i * lineHeight);
        } else {
            ctx.fillText(lines[i], x, startY + i * lineHeight);
        }
    }

    displayData.intentTexture.needsUpdate = true;
  }

  showTemporaryMessage(entity: Entity, message: string, duration: number = 7000): void {
    const displayData = this.displayMap.get(entity.id);
    if (!displayData || !displayData.intentSprite) return;

    // Clear any existing timeout
    if (displayData.temporaryMessageTimeout) {
        clearTimeout(displayData.temporaryMessageTimeout);
    }

    // Draw the temporary message
    this._drawIntentText(displayData, message);

    // Set timeout to revert to original intent text
    displayData.temporaryMessageTimeout = setTimeout(() => {
        displayData.temporaryMessageTimeout = null;
        // Redraw with the stored intended text
        this._drawIntentText(displayData, displayData.currentIntentText);
    }, duration);
  }

  // Update loop (called by Game)
  update(): void {
    // Could add logic here to update sprite visibility based on distance, etc.
    // For now, Three.js handles frustum culling.
  }

} 