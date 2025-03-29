import * as THREE from 'three';
import { Player } from '../entities/player';
import { Entity } from '../entities/entity';
import { NPC } from '../entities/npc';
import { Animal } from '../entities/animal';
import { EntityUserData } from '../types/common'; // For userData typing

export class Minimap {
    private ctx: CanvasRenderingContext2D;
    private player: Player;
    private entities: Array<Entity | THREE.Object3D>;
    private worldSize: number;
    private mapSize: number; private mapScale: number;
    private halfMapSize: number; private halfWorldSize: number;

    private colors = {
        bg: 'rgba(100, 100, 100, 0.6)', player: 'yellow', npc: 'cyan', questNpc: '#FFD700',
        animalFriendly: 'lime', animalNeutral: 'white', animalHostile: 'red', default: 'gray'
    };
    private sizes = { dot: 3, player: 4, playerTriangle: 6 };

    private _entityPos = new THREE.Vector3(); private _playerPos = new THREE.Vector3();

    constructor(canvas: HTMLCanvasElement | null, player: Player, entities: Array<any>, worldSize: number) {
        if (!canvas || !player || !entities || !worldSize) throw new Error("Minimap requires valid arguments.");
        const context = canvas.getContext('2d');
        if (!context) throw new Error("Failed to get 2D context.");
        this.ctx = context; this.player = player; this.entities = entities; this.worldSize = worldSize;
        this.mapSize = canvas.width; this.mapScale = this.mapSize / this.worldSize;
        this.halfMapSize = this.mapSize / 2; this.halfWorldSize = this.worldSize / 2;
        this.sizes.playerTriangle = this.sizes.player * 1.5;
    }

    update(): void {
        // Clear
        this.ctx.fillStyle = this.colors.bg;
        this.ctx.fillRect(0, 0, this.mapSize, this.mapSize);
        if (this.player.isDead) return; // Don't draw if dead

        // Player Info
        this.player.mesh.getWorldPosition(this._playerPos);
        const playerRotY = this.player.mesh.rotation.y;
        const playerMapX = this.worldToMap(this._playerPos.x);
        const playerMapY = this.worldToMap(this._playerPos.z);

        // Transform canvas
        this.ctx.save();
        this.ctx.translate(this.halfMapSize, this.halfMapSize); // Center
        this.ctx.rotate(-playerRotY); // Rotate opposite to player
        this.ctx.translate(-playerMapX, -playerMapY); // Center on player

        // Draw Entities
        this.entities.forEach(entity => {
            const mesh = (entity instanceof Entity) ? entity.mesh : (entity instanceof THREE.Object3D ? entity : null);
            if (!mesh || !mesh.parent || !mesh.visible || entity === this.player || (entity instanceof Entity && entity.isDead)) return;

            mesh.getWorldPosition(this._entityPos);
            const mapX = this.worldToMap(this._entityPos.x);
            const mapY = this.worldToMap(this._entityPos.z);
            const { color, size } = this.getEntityStyle(entity);
            this.drawDot(mapX, mapY, color, size);
        });

        // Restore and Draw Player
        this.ctx.restore();
        this.drawPlayerTriangle(this.halfMapSize, this.halfMapSize, this.colors.player, this.sizes.playerTriangle);
    }

    // Determine dot style based on entity type/state
    private getEntityStyle(entity: Entity | THREE.Object3D): { color: string; size: number } {
        const userData = (entity as any).userData as EntityUserData | undefined;
        let color = this.colors.default;
        let size = this.sizes.dot;

        if (entity instanceof NPC) {
            color = this.colors.npc; size += 1;
            if (entity.assignedQuestId && entity.questLog) {
                 const status = entity.questLog.getQuestStatus(entity.assignedQuestId);
                 const isCompletable = status === 'active' && entity.questLog.checkQuestCompletion(entity.assignedQuestId, entity.inventory);
                 if (status === 'available' || isCompletable) color = this.colors.questNpc;
            }
        } else if (entity instanceof Animal) {
            if (userData?.isHostile) color = this.colors.animalHostile;
            else if (entity.type === 'Deer') color = this.colors.animalFriendly;
            else { color = this.colors.animalNeutral; if (entity.type === 'Rabbit') size -=1; }
        } else if (userData?.isInteractable && !userData?.isEntity) { // Simple interactables like Chests?
            color = 'orange'; size += 1;
        } else {
            // Don't draw unknown types by returning default/transparent?
             // color = 'transparent';
             return { color: this.colors.default, size: 0 }; // Return size 0 to skip drawing
        }
        return { color, size };
    }

    private worldToMap(worldCoord: number): number {
        return (worldCoord + this.halfWorldSize) * this.mapScale;
    }

    private drawDot(x: number, y: number, color: string, radius: number): void {
        if (radius <= 0) return;
        this.ctx.fillStyle = color; this.ctx.beginPath();
        this.ctx.arc(x, y, radius, 0, Math.PI * 2); this.ctx.fill();
    }

    private drawPlayerTriangle(x: number, y: number, color: string, size: number): void {
        this.ctx.fillStyle = color; this.ctx.beginPath();
        this.ctx.moveTo(x, y - size * 0.6); // Top
        this.ctx.lineTo(x - size / 2, y + size * 0.4); // Bottom left
        this.ctx.lineTo(x + size / 2, y + size * 0.4); // Bottom right
        this.ctx.closePath(); this.ctx.fill();
    }
}