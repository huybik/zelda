import { Character } from "../entities/entities";
import { Object3D, Vector3 } from "three";

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
  dotSize: number = 3;
  playerDotSize: number = 4;
  playerTriangleSize: number;

  private entityPosition = new Vector3();
  private playerPosition = new Vector3();
  private playerForward = new Vector3();

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

  update(): void {
    this.ctx.fillStyle = this.bgColor;
    this.ctx.fillRect(0, 0, this.mapSize, this.mapSize);
    if (this.player.isDead || !this.player.mesh) return;
    this.player.mesh.getWorldPosition(this.playerPosition);
    this.player.mesh.getWorldDirection(this.playerForward);
    const playerRotationAngle = Math.atan2(
      this.playerForward.x,
      this.playerForward.z
    );
    this.ctx.save();
    this.ctx.translate(this.halfMapSize, this.halfMapSize);
    this.ctx.rotate(-playerRotationAngle);
    const playerMapX = this.worldToMapX(this.playerPosition.x);
    const playerMapZ = this.worldToMapZ(this.playerPosition.z);
    this.ctx.translate(-playerMapX, -playerMapZ);
    this.entities.forEach((entity) => {
      if (
        !entity ||
        entity === this.player ||
        (entity instanceof Character && entity.isDead)
      )
        return;
      const mesh =
        entity instanceof Character || entity instanceof Object3D
          ? ((entity as any).mesh ?? entity)
          : null;
      if (!mesh || !(mesh instanceof Object3D) || !mesh.parent || !mesh.visible)
        return;
      mesh.getWorldPosition(this.entityPosition);
      const entityMapX = this.worldToMapX(this.entityPosition.x);
      const entityMapZ = this.worldToMapZ(this.entityPosition.z);
      let color = "gray";
      let size = this.dotSize;
      let draw = false;
      if (entity.userData?.resource) {
        switch (entity.userData.resource) {
          case "wood":
            color = "saddlebrown";
            break;
          case "stone":
            color = "darkgray";
            break;
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
      } else if (entity.userData?.isEnemy) {
        color = "red";
        size += 1;
        draw = true;
      } else if (entity.userData?.isInteractable) {
        color = "lightblue";
        draw = true;
      }
      if (draw) this.drawDot(entityMapX, entityMapZ, color, size);
    });
    this.ctx.restore();
    this.drawPlayerTriangle(
      this.halfMapSize,
      this.halfMapSize,
      this.playerColor,
      this.playerTriangleSize
    );
  }

  worldToMapX(worldX: number): number {
    return (worldX + this.halfWorldSize) * this.mapScale;
  }

  worldToMapZ(worldZ: number): number {
    return (this.halfWorldSize - worldZ) * this.mapScale;
  }

  drawDot(mapX: number, mapY: number, color: string, size: number): void {
    this.ctx.fillStyle = color;
    this.ctx.beginPath();
    this.ctx.arc(mapX, mapY, size, 0, Math.PI * 2);
    this.ctx.fill();
  }

  drawPlayerTriangle(
    centerX: number,
    centerY: number,
    color: string,
    size: number
  ): void {
    const height = size * 1.5;
    const width = size;
    this.ctx.fillStyle = color;
    this.ctx.beginPath();
    this.ctx.moveTo(centerX, centerY - height * 0.6);
    this.ctx.lineTo(centerX - width / 2, centerY + height * 0.4);
    this.ctx.lineTo(centerX + width / 2, centerY + height * 0.4);
    this.ctx.closePath();
    this.ctx.fill();
  }
}
