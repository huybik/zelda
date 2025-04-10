// File: /src/ui/minimap.ts
import { Character } from "../entities/character";
import { Animal } from "../entities/animals"; // Import Animal
import { Object3D, Vector3, Group } from "three";

export class Minimap {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  player: Character;
  entities: Array<any>;
  worldSize: number;
  mapSize: number;
  mapScale: number;
  halfMapSize: number;
  halfWorldSize: number;
  bgColor: string = "rgba(100, 100, 100, 0.6)";
  playerColor: string = "yellow";
  npcColor: string = "cyan";
  animalPassiveColor: string = "yellowgreen";
  animalAggressiveColor: string = "red";
  dotSize: number = 3;
  playerDotSize: number = 4;
  playerTriangleSize: number;
  exitPortal: Group | null = null;
  startPortal: Group | null = null;

  private entityPosition = new Vector3();
  private playerPosition = new Vector3();
  private playerForward = new Vector3();
  private portalPosition = new Vector3();

  constructor(
    canvasElement: HTMLCanvasElement | null,
    player: Character,
    entities: Array<any>,
    worldSize: number
  ) {
    if (!canvasElement)
      throw new Error("Minimap requires a valid canvas element.");
    this.canvas = canvasElement;
    const context = this.canvas.getContext("2d");
    if (!context)
      throw new Error("Could not get 2D rendering context for minimap canvas.");
    this.ctx = context;
    this.player = player;
    this.entities = entities;
    this.worldSize = worldSize;
    this.mapSize = this.canvas.width;
    this.mapScale = this.mapSize / this.worldSize;
    this.halfMapSize = this.mapSize / 2;
    this.halfWorldSize = this.worldSize / 2;
    this.playerTriangleSize = this.playerDotSize * 1.5;
  }

  setPortals(exitPortal: Group | null, startPortal: Group | null): void {
    this.exitPortal = exitPortal;
    this.startPortal = startPortal;
  }

  update(): void {
    this.ctx.fillStyle = this.bgColor;
    this.ctx.fillRect(0, 0, this.mapSize, this.mapSize);
    if (this.player.isDead || !this.player.mesh) return;

    this.player.mesh.getWorldPosition(this.playerPosition);
    this.player.mesh.getWorldDirection(this.playerForward);

    // Calculate player's map coordinates
    const playerMapX = this.worldToMapX(this.playerPosition.x);
    const playerMapZ = this.worldToMapZ(this.playerPosition.z);

    // Calculate player's rotation angle (North is 0 degrees)
    const playerRotationAngle = Math.atan2(
      this.playerForward.x,
      this.playerForward.z
    );

    // Draw other entities relative to the player's position
    this.entities.forEach((entity) => {
      if (
        !entity ||
        entity === this.player ||
        (entity instanceof Character && entity.isDead) ||
        (entity instanceof Animal && entity.isDead) || // Check if animal is dead
        entity.userData?.isPortal // Skip portals here as they are drawn separately
      )
        return;

      const mesh =
        entity instanceof Character ||
        entity instanceof Animal || // Include Animal
        entity instanceof Object3D
          ? ((entity as any).mesh ?? entity)
          : null;

      if (!mesh || !(mesh instanceof Object3D) || !mesh.parent || !mesh.visible)
        return;

      mesh.getWorldPosition(this.entityPosition);
      const entityMapX = this.worldToMapX(this.entityPosition.x);
      const entityMapZ = this.worldToMapZ(this.entityPosition.z);

      // Calculate position relative to the center of the minimap
      const drawX = this.halfMapSize + (playerMapX - entityMapX);
      const drawZ = this.halfMapSize + (entityMapZ - playerMapZ);

      // Check if the entity is within the minimap bounds before drawing
      if (
        drawX < 0 ||
        drawX > this.mapSize ||
        drawZ < 0 ||
        drawZ > this.mapSize
      ) {
        return; // Don't draw if outside the minimap view
      }

      let color = "gray";
      let size = this.dotSize;
      let draw = false;

      if (entity.userData?.resource) {
        switch (entity.userData.resource) {
          case "wood":
            color = "saddlebrown";
            return; // skip drawing wood
          case "stone":
            color = "darkgray";
            return; // skip drawing stone
          case "herb":
            color = "limegreen";
            break;
          default:
            color = "white";
        }
        draw = true;
      } else if (entity.userData?.isNPC) {
        color = this.npcColor;
        size += 1;
        draw = true;
      } else if (entity.userData?.isAnimal) {
        // Draw animals
        color = entity.userData.isAggressive
          ? this.animalAggressiveColor
          : this.animalPassiveColor;
        size += 1;
        draw = true;
      } else if (entity.userData?.isEnemy) {
        // Keep isEnemy check for potential non-animal enemies
        color = "red";
        size += 1;
        draw = true;
      } else if (entity.userData?.isInteractable) {
        color = "lightblue";
        draw = true;
      }

      if (draw) this.drawDot(drawX, drawZ, color, size);
    });

    // Draw Portals relative to the player's position
    const drawPortal = (portal: Group | null) => {
      if (portal && portal.visible && portal.userData?.isPortal) {
        portal.getWorldPosition(this.portalPosition);
        const portalMapX = this.worldToMapX(this.portalPosition.x);
        const portalMapZ = this.worldToMapZ(this.portalPosition.z);

        // Calculate position relative to the center of the minimap
        const drawX = this.halfMapSize + (portalMapX - playerMapX);
        const drawZ = this.halfMapSize + (portalMapZ - playerMapZ);

        // Check if the portal is within the minimap bounds before drawing
        if (
          drawX >= 0 &&
          drawX <= this.mapSize &&
          drawZ >= 0 &&
          drawZ <= this.mapSize
        ) {
          this.drawText(
            portal.userData.minimapLabel || "Portal",
            drawX,
            drawZ,
            "white" // i want white!
          );
        }
      }
    };
    drawPortal(this.exitPortal);
    drawPortal(this.startPortal);

    // Draw the player triangle at the center, rotated
    this.drawPlayerTriangle(
      this.halfMapSize,
      this.halfMapSize,
      this.playerColor,
      this.playerTriangleSize,
      playerRotationAngle
    );
  }

  worldToMapX(worldX: number): number {
    // Invert X calculation if needed based on your world coordinate system
    return (worldX + this.halfWorldSize) * this.mapScale;
  }

  worldToMapZ(worldZ: number): number {
    // Invert Z calculation to match typical screen coordinates (Y down)
    return (this.halfWorldSize - worldZ) * this.mapScale;
  }

  drawDot(mapX: number, mapY: number, color: string, size: number): void {
    this.ctx.fillStyle = color;
    this.ctx.beginPath();
    this.ctx.arc(mapX, mapY, size, 0, Math.PI * 2);
    this.ctx.fill();
  }

  drawText(text: string, mapX: number, mapY: number, color: string): void {
    this.ctx.fillStyle = color;
    this.ctx.font = "12px Arial"; // Small font for minimap
    this.ctx.textAlign = "center";
    this.ctx.textBaseline = "middle";
    this.ctx.shadowColor = "black";
    this.ctx.shadowBlur = 2;
    this.ctx.fillText(text, mapX, mapY);
    this.ctx.shadowBlur = 0; // Reset shadow
  }

  drawPlayerTriangle(
    centerX: number,
    centerY: number,
    color: string,
    size: number,
    angle: number // Add angle parameter
  ): void {
    const height = size * 1.5;
    const width = size;

    this.ctx.save(); // Save context state
    this.ctx.translate(centerX, centerY); // Translate to the center point
    this.ctx.rotate(-angle); // Rotate around the center point

    this.ctx.fillStyle = color;
    this.ctx.beginPath();
    // Draw triangle centered around (0, 0) after translation
    this.ctx.moveTo(0, -height * 0.6); // Top point
    this.ctx.lineTo(-width / 2, height * 0.4); // Bottom left
    this.ctx.lineTo(width / 2, height * 0.4); // Bottom right
    this.ctx.closePath();
    this.ctx.fill();

    this.ctx.restore(); // Restore context state (removes translation and rotation)
  }
}
