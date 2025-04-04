// src/ui/Minimap.ts
import { Vector3, Object3D } from "three";
import { Character } from "../core/Character";
import { MINIMAP_DOT_SIZE, MINIMAP_PLAYER_DOT_SIZE } from "../config";

export class Minimap {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  player: Character; // The character the minimap is centered on
  entities: Array<any>; // All entities to potentially display (Characters, simple objects)
  worldSize: number; // The total size of the world (width/depth)

  // Calculated properties
  mapSize: number; // Pixel size of the canvas
  mapScale: number; // Ratio of map pixels to world units
  halfMapSize: number;
  halfWorldSize: number;

  // Styling
  bgColor: string = "rgba(100, 100, 100, 0.6)"; // Background color of the map
  playerColor: string = "yellow"; // Color for the player indicator
  npcColor: string = "cyan"; // Color for other NPCs
  resourceColorMap: Record<string, string> = {
    // Colors for different resource types
    wood: "saddlebrown",
    stone: "darkgray",
    herb: "limegreen",
    default: "white", // Fallback color
  };
  interactableColor: string = "lightblue"; // Color for generic interactables
  dotSize: number = MINIMAP_DOT_SIZE; // Default size for entity dots
  playerDotSize: number = MINIMAP_PLAYER_DOT_SIZE; // Size for the player indicator
  playerTriangleSize: number; // Size of the player direction triangle

  // Reusable vectors to avoid allocations in the update loop
  private entityPosition = new Vector3();
  private playerPosition = new Vector3();
  private playerForward = new Vector3();

  constructor(
    canvasElement: HTMLCanvasElement,
    player: Character,
    entities: Array<any>,
    worldSize: number
  ) {
    this.canvas = canvasElement;
    const context = this.canvas.getContext("2d");
    if (!context) {
      throw new Error("Could not get 2D context for minimap.");
    }
    this.ctx = context;
    this.player = player;
    this.entities = entities; // Keep reference to the game's entity list
    this.worldSize = worldSize;

    // Calculate map dimensions and scale (assuming square canvas)
    this.mapSize = this.canvas.width;
    this.mapScale = this.mapSize / this.worldSize;
    this.halfMapSize = this.mapSize / 2;
    this.halfWorldSize = this.worldSize / 2;

    // Calculate player indicator size based on dot size
    this.playerTriangleSize = this.playerDotSize * 1.5;
  }

  // Update the player reference (e.g., when control switches)
  setActivePlayer(newPlayer: Character): void {
    this.player = newPlayer;
  }

  // Main update loop for the minimap, called each frame by the Game.
  update(): void {
    // Clear the canvas with the background color
    this.ctx.fillStyle = this.bgColor;
    this.ctx.fillRect(0, 0, this.mapSize, this.mapSize);

    // Don't draw if player is dead or mesh is missing
    if (this.player.isDead || !this.player.mesh) return;

    // --- Calculate Player Position and Rotation ---
    this.player.mesh.getWorldPosition(this.playerPosition);
    // Get player's forward direction vector (already normalized)
    this.player.mesh.getWorldDirection(this.playerForward);
    // Calculate rotation angle relative to positive Z axis (0 degrees is forward)
    // atan2(x, z) gives angle in radians from +Z axis
    const playerRotationAngle = Math.atan2(
      this.playerForward.x,
      this.playerForward.z
    );

    // --- Set up Transformation Matrix ---
    // Save the default context state
    this.ctx.save();
    // Translate origin to the center of the canvas
    this.ctx.translate(this.halfMapSize, this.halfMapSize);
    // Rotate the canvas opposite to the player's facing direction
    this.ctx.rotate(-playerRotationAngle);
    // Translate the canvas so the player's world position is at the center
    const playerMapX = this.worldToMapX(this.playerPosition.x);
    const playerMapZ = this.worldToMapZ(this.playerPosition.z);
    this.ctx.translate(-playerMapX, -playerMapZ);

    // --- Draw Entities ---
    // Iterate through all entities provided by the game
    this.entities.forEach((entity) => {
      // Skip self, dead characters, or entities without a mesh/group
      if (
        !entity ||
        entity === this.player ||
        (entity instanceof Character && entity.isDead)
      )
        return;

      const mesh = (entity as any).mesh ?? entity; // Get the Object3D
      // Ensure it's a valid Object3D, visible, and added to the scene
      if (!(mesh instanceof Object3D) || !mesh.parent || !mesh.visible) return;

      // Get entity's world position
      mesh.getWorldPosition(this.entityPosition);
      // Convert world coordinates to map coordinates
      const entityMapX = this.worldToMapX(this.entityPosition.x);
      const entityMapZ = this.worldToMapZ(this.entityPosition.z);

      // Determine color and size based on entity type/properties
      let color = "gray"; // Default color
      let size = this.dotSize;
      let draw = false; // Flag to determine if this entity should be drawn

      if (entity.userData?.isNPC) {
        color = this.npcColor;
        size += 1; // Make NPCs slightly larger
        draw = true;
      } else if (entity.userData?.resource) {
        // Use resource map color, fallback to default
        color =
          this.resourceColorMap[entity.userData.resource] ||
          this.resourceColorMap.default;
        draw = true;
      } else if (entity.userData?.isInteractable) {
        // Generic interactable fallback color
        color = this.interactableColor;
        draw = true;
      }
      // Add more conditions here for other entity types if needed

      // Draw the entity as a dot if flagged
      if (draw) {
        this.drawDot(entityMapX, entityMapZ, color, size);
      }
    });

    // --- Restore Context and Draw Player ---
    // Restore the context to its state before transformations (origin at top-left, no rotation)
    this.ctx.restore();

    // Draw the player indicator (triangle) at the center of the minimap, pointing upwards
    this.drawPlayerTriangle(
      this.halfMapSize,
      this.halfMapSize,
      this.playerColor,
      this.playerTriangleSize
    );
  }

  // Converts world X coordinate to map X coordinate.
  private worldToMapX(worldX: number): number {
    return (worldX + this.halfWorldSize) * this.mapScale;
  }

  // Converts world Z coordinate to map Y coordinate (Y is inverted in 2D canvas).
  private worldToMapZ(worldZ: number): number {
    // Invert Z axis: higher Z in world means lower Y on map
    return (this.halfWorldSize - worldZ) * this.mapScale;
  }

  // Draws a simple circular dot on the map.
  private drawDot(
    mapX: number,
    mapY: number,
    color: string,
    size: number
  ): void {
    this.ctx.fillStyle = color;
    this.ctx.beginPath();
    // Draw arc at (mapX, mapY) with radius `size`
    this.ctx.arc(mapX, mapY, size, 0, Math.PI * 2);
    this.ctx.fill();
  }

  // Draws the player indicator as an upward-pointing triangle.
  private drawPlayerTriangle(
    centerX: number,
    centerY: number,
    color: string,
    size: number
  ): void {
    const height = size * 1.5; // Triangle height
    const width = size; // Triangle base width

    this.ctx.fillStyle = color;
    this.ctx.beginPath();
    // Define triangle points relative to center (pointing up)
    this.ctx.moveTo(centerX, centerY - height * 0.6); // Top point
    this.ctx.lineTo(centerX - width / 2, centerY + height * 0.4); // Bottom left point
    this.ctx.lineTo(centerX + width / 2, centerY + height * 0.4); // Bottom right point
    this.ctx.closePath(); // Close the path to form a triangle
    this.ctx.fill();
  }
}
