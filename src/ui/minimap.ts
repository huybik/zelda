import * as THREE from 'three';
import { Player } from '../entities/player';
import { Entity } from '../entities/entity'; // Base type for entities array
import { NPC } from '../entities/npc'; // Need for quest check
import { Animal } from '../entities/animal'; // Need for type/hostility check

export class Minimap {
    private canvas: HTMLCanvasElement;
    private ctx: CanvasRenderingContext2D | null;
    private player: Player;
    private entities: Array<Entity | THREE.Object3D>; // More general type for things to draw
    private worldSize: number;

    // Map properties
    private mapSize: number;
    private mapScale: number;
    private halfMapSize: number;
    private halfWorldSize: number;

    // Colors & Styles
    private bgColor: string = 'rgba(100, 100, 100, 0.6)';
    private playerColor: string = 'yellow';
    private npcColor: string = 'cyan';
    private questNpcColor: string = '#FFD700'; // Gold
    private friendlyAnimalColor: string = 'lime';
    private neutralAnimalColor: string = 'white';
    private hostileAnimalColor: string = 'red';
    private defaultColor: string = 'gray';

    private dotSize: number = 3;
    private playerDotSize: number = 4;
    private playerTriangleSize: number;

    // Reusable vectors
    private _entityPos = new THREE.Vector3();
    private _playerPos = new THREE.Vector3();

    constructor(
        canvasElement: HTMLCanvasElement | null,
        player: Player,
        entities: Array<Entity | THREE.Object3D>,
        worldSize: number
    ) {
        if (!canvasElement || !player || !entities || !worldSize) {
            throw new Error("Minimap requires canvas, player, entities array, and worldSize.");
        }
        this.canvas = canvasElement;
        this.ctx = this.canvas.getContext('2d');
        this.player = player;
        this.entities = entities; // Reference to the main list
        this.worldSize = worldSize;

        if (!this.ctx) {
             throw new Error("Failed to get 2D context from minimap canvas.");
        }

        this.mapSize = this.canvas.width; // Assume square
        this.mapScale = this.mapSize / this.worldSize;
        this.halfMapSize = this.mapSize / 2;
        this.halfWorldSize = this.worldSize / 2;
        this.playerTriangleSize = this.playerDotSize * 1.5;
    }

    update(): void {
        if (!this.ctx) return;

        // Clear canvas
        this.ctx.fillStyle = this.bgColor;
        this.ctx.fillRect(0, 0, this.mapSize, this.mapSize);

        // Don't draw if player is dead, but keep canvas clear
        if (this.player.isDead) return;

        // Get player's current world position and Y rotation
        this.player.mesh.getWorldPosition(this._playerPos);
        const playerRotationY = this.player.mesh.rotation.y;

        // Calculate player's position on the map's coordinate system (0 to mapSize)
        const playerMapX = this.worldToMapX(this._playerPos.x);
        const playerMapY = this.worldToMapZ(this._playerPos.z); // Use world Z for map Y

        // --- Set up transformation for centered & rotated view ---
        this.ctx.save();
        // 1. Translate origin to canvas center
        this.ctx.translate(this.halfMapSize, this.halfMapSize);
        // 2. Rotate opposite to player's rotation (makes player arrow point up)
        this.ctx.rotate(-playerRotationY);
        // 3. Translate map so player's calculated map position is at the origin
        this.ctx.translate(-playerMapX, -playerMapY);

        // --- Draw Entities ---
        this.entities.forEach(entity => {
            // Skip invalid entries, self, or dead entities
            if (!entity || (entity instanceof Player && entity === this.player) || (entity instanceof Entity && entity.isDead)) {
                 return;
            }
            // Get the mesh to determine position
             const mesh = (entity instanceof Entity) ? entity.mesh : (entity instanceof THREE.Object3D ? entity : null);
             if (!mesh || !mesh.parent || !mesh.visible) return; // Skip if no mesh, not in scene, or invisible

             mesh.getWorldPosition(this._entityPos);
             const entityMapX = this.worldToMapX(this._entityPos.x);
             const entityMapY = this.worldToMapZ(this._entityPos.z);

             let color = this.defaultColor;
             let size = this.dotSize;
             let draw = true;

             // Determine color/size based on type/state
             if (entity instanceof NPC) {
                color = this.npcColor;
                // Highlight if offering or ready to complete quest
                if (entity.assignedQuestId && entity.questLog) {
                     const status = entity.questLog.getQuestStatus(entity.assignedQuestId);
                     if (status === 'available' || (status === 'active' && entity.questLog.checkQuestCompletion(entity.assignedQuestId, entity.inventory))) {
                         color = this.questNpcColor;
                     }
                }
                size += 1;
             } else if (entity instanceof Animal) {
                 if (entity.userData.isHostile) color = this.hostileAnimalColor;
                 else if (entity.type === 'Deer') color = this.friendlyAnimalColor;
                 else if (entity.type === 'Rabbit') { color = this.neutralAnimalColor; size -=1; }
                 else color = this.neutralAnimalColor; // Default animal
             } else {
                 draw = false; // Don't draw unknown types by default
             }

             if (draw) {
                 this.drawDot(entityMapX, entityMapY, color, size);
             }
        });

        // --- Restore canvas state before drawing player ---
        this.ctx.restore();

        // --- Draw Player Triangle ---
        // Player is always in the center, pointing "up" due to the rotation logic
        this.drawPlayerTriangle(this.halfMapSize, this.halfMapSize, this.playerColor, this.playerTriangleSize);
    }

    private worldToMapX(worldX: number): number {
        return (worldX + this.halfWorldSize) * this.mapScale;
    }

    private worldToMapZ(worldZ: number): number {
        // Map Z+ to map Y+ (North up)
        return (worldZ + this.halfWorldSize) * this.mapScale;
        // Alt: Map Z+ to map Y- (North down):
        // return this.mapSize - ((worldZ + this.halfWorldSize) * this.mapScale);
    }

    // Draws a dot (already in transformed map coordinates)
    private drawDot(mapX: number, mapY: number, color: string, size: number): void {
        if (!this.ctx) return;
        this.ctx.fillStyle = color;
        this.ctx.beginPath();
        this.ctx.arc(mapX, mapY, size, 0, Math.PI * 2);
        this.ctx.fill();
    }

    // Draws player triangle (always at center, pointing up)
    private drawPlayerTriangle(centerX: number, centerY: number, color: string, size: number): void {
        if (!this.ctx) return;
        this.ctx.fillStyle = color;
        this.ctx.beginPath();
        // Triangle points upwards
        this.ctx.moveTo(centerX, centerY - size * 0.6);       // Top point
        this.ctx.lineTo(centerX - size / 2, centerY + size * 0.4); // Bottom left
        this.ctx.lineTo(centerX + size / 2, centerY + size * 0.4); // Bottom right
        this.ctx.closePath();
        this.ctx.fill();
    }
}