/* File: /src/ui/minimap.ts */
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
    this.playerTriangleSize = this.playerDotSize * 2.5;
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
    // Get the forward direction vector in world space
    this.player.mesh.getWorldDirection(this.playerForward);

    this.ctx.save();
    this.ctx.translate(this.halfMapSize, this.halfMapSize);
    const playerMapX = this.worldToMapX(this.playerPosition.x);
    const playerMapZ = this.worldToMapZ(this.playerPosition.z);
    this.ctx.translate(-playerMapX, -playerMapZ);

    // Draw other entities
    this.entities.forEach((entity) => {
      if (
        !entity ||
        entity === this.player ||
        (entity instanceof Character && entity.isDead) ||
        (entity instanceof Animal && entity.isDead) || // Check if animal is dead
        entity.userData?.isPortal // Skip portals here as they are drawn above
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

      // Optimization: Skip drawing static resources like trees and rocks
      if (
        mesh.userData?.resource === "wood" ||
        mesh.userData?.resource === "stone"
      ) {
        return;
      }

      mesh.getWorldPosition(this.entityPosition);
      const entityMapX = this.worldToMapX(this.entityPosition.x);
      const entityMapZ = this.worldToMapZ(this.entityPosition.z);
      let color = "gray";
      let size = this.dotSize;
      let draw = false;
      if (entity.userData.isAnimal) {
        // Draw animals
        color = entity.userData.isAggressive
          ? this.animalAggressiveColor
          : this.animalPassiveColor;
        size += 1;
        draw = true;
      } else if (entity.userData?.resource) {
        // Only draw herbs now, others are skipped above
        if (entity.userData.resource === "herb") {
          color = "limegreen";
          draw = true;
        }
      } else if (entity.userData?.isNPC) {
        color = this.npcColor;
        size += 1;
        draw = true;
      }
      if (draw) this.drawDot(entityMapX, entityMapZ, color, size);
    });

    // Draw Portals First (if they exist)
    const drawPortal = (portal: Group | null) => {
      if (portal && portal.visible && portal.userData?.isPortal) {
        portal.getWorldPosition(this.portalPosition);
        const portalMapX = this.worldToMapX(this.portalPosition.x);
        const portalMapZ = this.worldToMapZ(this.portalPosition.z);
        this.drawText(
          portal.userData.minimapLabel || "Portal",
          portalMapX,
          portalMapZ,
          "white" // i want white!
        );
      }
    };
    drawPortal(this.exitPortal);
    drawPortal(this.startPortal);

    this.ctx.restore();

    // Calculate player angle for minimap.
    // Map X corresponds to World X. Map Y corresponds to World -Z.
    // Angle is counter-clockwise from positive X-axis in the map coordinate system.
    const playerAngle = Math.atan2(-this.playerForward.z, this.playerForward.x);

    this.drawPlayerTriangle(
      this.halfMapSize,
      this.halfMapSize,
      this.playerColor,
      this.playerTriangleSize,
      playerAngle // Pass the calculated angle
    );
  }

  worldToMapX(worldX: number): number {
    return (worldX + this.halfWorldSize) * this.mapScale;
  }

  worldToMapZ(worldZ: number): number {
    // Invert Z axis for map coordinates (map Y increases downwards, world +Z is often 'out' or 'back')
    return (this.halfWorldSize + worldZ) * this.mapScale;
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
    angle: number // Angle in radians relative to positive X-axis (counter-clockwise)
  ): void {
    const length = size * 1.5; // Use length for the pointing dimension
    const width = size;

    this.ctx.save(); // Save context state before transformation
    this.ctx.translate(centerX, centerY); // Move origin to center point

    // Canvas rotation is clockwise for positive angles.
    // Our angle is calculated counter-clockwise from +X.
    // To make the triangle point in the CCW direction 'angle',
    // we need to rotate the canvas clockwise by 'angle'.
    // However, if the perceived rotation is inverse, it means
    // the canvas rotation direction needs to be flipped relative to the angle.
    // Let's try negating the angle passed to rotate.
    this.ctx.rotate(-angle); // Reverted the negation based on re-evaluation. If this is still wrong, the issue might be elsewhere.

    this.ctx.fillStyle = color;
    this.ctx.beginPath();
    // Draw triangle pointing towards positive X axis (angle = 0) before rotation
    this.ctx.moveTo(length * 0.6, 0); // Tip point along positive X
    this.ctx.lineTo(-length * 0.4, -width / 2); // Back left point
    this.ctx.lineTo(-length * 0.4, width / 2); // Back right point
    this.ctx.closePath();
    this.ctx.fill();

    this.ctx.restore(); // Restore context state
  }
}
