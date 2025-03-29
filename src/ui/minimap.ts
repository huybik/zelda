import * as THREE from 'three';
import { Player } from '../entities/player';
import { Entity } from '../entities/entity';
import { NPC } from '../entities/npc';
import { Animal } from '../entities/animal';
import { EntityUserData } from '../types/common';

export class Minimap {
    private ctx: CanvasRenderingContext2D;
    private player: Player;
    // FIX: Type more specifically if possible, otherwise use a base type or 'any'
    private entities: Array<Entity | THREE.Object3D>;
    private worldSize: number;
    private mapSize: number; private mapScale: number;
    private halfMapSize: number; private halfWorldSize: number;

    private colors = {
        bg: 'rgba(100, 100, 100, 0.6)', player: 'yellow', npc: 'cyan', questNpc: '#FFD700', // Gold for quest NPC
        animalFriendly: 'lime', animalNeutral: 'white', animalHostile: 'red',
        interactable: 'orange', default: 'gray' // Added interactable color
    };
    private sizes = { dot: 3, player: 4, playerTriangle: 6 };

    private _entityPos = new THREE.Vector3(); private _playerPos = new THREE.Vector3();

    constructor(canvas: HTMLCanvasElement | null, player: Player, entities: Array<any>, worldSize: number) {
        if (!canvas) throw new Error("Minimap requires a valid canvas element.");
        if (!player) throw new Error("Minimap requires a valid player instance.");
        if (!entities) throw new Error("Minimap requires a valid entities array.");
        if (!worldSize || worldSize <= 0) throw new Error("Minimap requires a positive worldSize.");

        const context = canvas.getContext('2d');
        if (!context) throw new Error("Failed to get 2D context for minimap canvas.");

        this.ctx = context; this.player = player;
        // Filter entities slightly better on init? Or rely on update filtering.
        this.entities = entities;
        this.worldSize = worldSize;
        this.mapSize = canvas.width; // Use actual canvas size
        this.mapScale = this.mapSize / this.worldSize;
        this.halfMapSize = this.mapSize / 2;
        this.halfWorldSize = this.worldSize / 2;
        // Adjust player triangle size relative to map/dot size
        this.sizes.playerTriangle = this.sizes.player * 1.5;
    }

    update(): void {
        // Clear
        this.ctx.fillStyle = this.colors.bg;
        this.ctx.fillRect(0, 0, this.mapSize, this.mapSize);

        // FIX: Check player mesh exists and player is not dead
        if (this.player.isDead || !this.player.mesh) return;

        // Player Info
        this.player.mesh.getWorldPosition(this._playerPos);
        // Use rotation directly (assuming player object itself rotates)
        const playerRotY = this.player.mesh.rotation.y;
        const playerMapX = this.worldToMap(this._playerPos.x);
        const playerMapY = this.worldToMap(this._playerPos.z); // Use Z for map Y

        // Transform canvas for player-centric view
        this.ctx.save();
        this.ctx.translate(this.halfMapSize, this.halfMapSize); // Center origin on minimap center
        this.ctx.rotate(-playerRotY);                   // Rotate opposite to player facing
        this.ctx.translate(-playerMapX, -playerMapY);   // Shift viewport so player position is at the origin

        // Draw Entities
        this.entities.forEach(entity => {
            // FIX: Check entity is not the player itself
            if (entity === this.player) return;

            // Determine the mesh to use
            const mesh = (entity instanceof Entity) ? entity.mesh : (entity instanceof THREE.Object3D ? entity : null);

            // FIX: Add null/visibility checks for the mesh
            if (!mesh || !mesh.parent || !mesh.visible) return;

            // Skip dead entities
            if (entity instanceof Entity && entity.isDead) return;

            mesh.getWorldPosition(this._entityPos);
            const mapX = this.worldToMap(this._entityPos.x);
            const mapY = this.worldToMap(this._entityPos.z); // Use Z for map Y
            const { color, size } = this.getEntityStyle(entity); // Pass the original entity/object

            // Only draw if size > 0
            if (size > 0) {
                 this.drawDot(mapX, mapY, color, size);
            }
        });

        // Restore canvas transform
        this.ctx.restore();

        // Draw Player indicator at the center of the map (after restoring transform)
        this.drawPlayerTriangle(this.halfMapSize, this.halfMapSize, this.colors.player, this.sizes.playerTriangle);
    }

    // Determine dot style based on entity type/state
    // FIX: Accept Entity | THREE.Object3D
    private getEntityStyle(entityOrObject: Entity | THREE.Object3D): { color: string; size: number } {
        // Access userData safely
        const mesh = (entityOrObject instanceof Entity) ? entityOrObject.mesh : entityOrObject;
        const userData = mesh?.userData as EntityUserData | undefined; // Check mesh first

        let color = this.colors.default;
        let size = this.sizes.dot;

        if (entityOrObject instanceof NPC) { // Check specific type first
            color = this.colors.npc; size += 1;
            // Check quest status if available
            if (entityOrObject.assignedQuestId && entityOrObject.questLog && entityOrObject.inventory) {
                 const status = entityOrObject.questLog.getQuestStatus(entityOrObject.assignedQuestId);
                 const isCompletable = status === 'active' && entityOrObject.questLog.checkQuestCompletion(entityOrObject.assignedQuestId, entityOrObject.inventory);
                 if (status === 'available' || isCompletable) color = this.colors.questNpc;
            }
        } else if (entityOrObject instanceof Animal) {
            if (userData?.isHostile) color = this.colors.animalHostile;
            else if (entityOrObject.type === 'Deer' || entityOrObject.type === 'Rabbit') color = this.colors.animalFriendly; // Deer/Rabbit friendly
            else color = this.colors.animalNeutral; // Generic/other neutral

            if (entityOrObject.type === 'Rabbit') size -= 1; // Smaller dot for rabbits
        } else if (userData?.isInteractable && !userData?.isEntity) { // Simple interactables (not Entities)
            color = this.colors.interactable; size += 1;
        } else if (userData?.isCollidable && !userData?.isEntity && !userData?.isInteractable) {
            // Non-entity, non-interactable collidable (e.g., rocks, trees *after* depletion?)
             color = this.colors.default; size = this.sizes.dot -1; // Smaller grey dot?
        } else {
            // Unknown type or non-collidable/non-interactable object - don't draw
             return { color: this.colors.default, size: 0 };
        }
        return { color, size };
    }

    private worldToMap(worldCoord: number): number {
        // Clamp world coordinate to bounds before scaling? Optional.
        // const clampedCoord = THREE.MathUtils.clamp(worldCoord, -this.halfWorldSize, this.halfWorldSize);
        // return (clampedCoord + this.halfWorldSize) * this.mapScale;
        return (worldCoord + this.halfWorldSize) * this.mapScale;
    }

    private drawDot(x: number, y: number, color: string, radius: number): void {
        if (radius <= 0 || !color || color === 'transparent') return; // Don't draw zero-size or transparent
        this.ctx.fillStyle = color; this.ctx.beginPath();
        this.ctx.arc(x, y, radius, 0, Math.PI * 2); this.ctx.fill();
    }

    // Draws player triangle pointing 'up' relative to the *map's* orientation
    private drawPlayerTriangle(x: number, y: number, color: string, size: number): void {
        this.ctx.fillStyle = color; this.ctx.beginPath();
        // Triangle points upwards (negative Y direction in canvas coords)
        this.ctx.moveTo(x, y - size * 0.6);          // Top point
        this.ctx.lineTo(x - size / 2, y + size * 0.4); // Bottom left
        this.ctx.lineTo(x + size / 2, y + size * 0.4); // Bottom right
        this.ctx.closePath(); this.ctx.fill();
    }
}