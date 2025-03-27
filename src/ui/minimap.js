import * as THREE from 'three';

export class Minimap {
    constructor(canvasElement, player, entities, worldSize) {
        if (!canvasElement || !player || !entities || !worldSize) {
            throw new Error("Minimap requires canvas, player, entities array, and worldSize.");
        }
        this.canvas = canvasElement;
        this.ctx = this.canvas.getContext('2d');
        this.player = player;
        this.entities = entities; // Reference to the main entities array
        this.worldSize = worldSize;

        this.mapSize = this.canvas.width; // Assumes square canvas
        this.mapScale = this.mapSize / this.worldSize;
        this.halfMapSize = this.mapSize / 2;
        this.halfWorldSize = this.worldSize / 2;

        // Colors
        this.bgColor = 'rgba(100, 100, 100, 0.6)'; // Slightly more opaque
        this.playerColor = 'yellow';
        this.npcColor = 'cyan';
        this.friendlyAnimalColor = 'lime';
        this.neutralAnimalColor = 'white'; // e.g., Rabbit
        this.hostileAnimalColor = 'red';
        this.questNpcColor = '#FFD700'; // Gold color for quest NPCs

        this.dotSize = 3; // Base size of dots on map
        this.playerDotSize = 4;

        // Pre-calculate for performance
        this.playerTriangleSize = this.playerDotSize * 1.5;
        this.playerTriangleBase = this.playerTriangleSize / 2;

        // Reusable vectors
        this._entityPos = new THREE.Vector3();
        this._playerPos = new THREE.Vector3();
    }

    update() {
        if (!this.ctx || !this.player || this.player.isDead) {
            // Clear canvas even if player is dead or missing
            if (this.ctx) {
                 this.ctx.fillStyle = this.bgColor;
                 this.ctx.fillRect(0, 0, this.mapSize, this.mapSize);
            }
            return;
        }

        // Get player's current position and rotation
        this.player.mesh.getWorldPosition(this._playerPos);
        const playerRotationY = this.player.mesh.rotation.y; // Rotation around Y axis

        // Calculate player's position on the map coordinate system (0 to mapSize)
        const playerMapX = this.worldToMapX(this._playerPos.x);
        const playerMapY = this.worldToMapZ(this._playerPos.z); // Use Z for map Y

        // --- Clear and Prepare Canvas ---
        this.ctx.fillStyle = this.bgColor;
        this.ctx.fillRect(0, 0, this.mapSize, this.mapSize);

        // --- Set up transformation matrix for centered & rotated map ---
        this.ctx.save();
        // 1. Translate origin to center of canvas
        this.ctx.translate(this.halfMapSize, this.halfMapSize);
        // 2. Rotate opposite to player's rotation
        this.ctx.rotate(-playerRotationY);
        // 3. Translate so player's map position is at the origin (before rotation)
        // This effectively makes the player's world position the center of the map view
        this.ctx.translate(-playerMapX, -playerMapY);


        // --- Draw Entities ---
        // Iterate through the entities array (which should be kept up-to-date by Game.js)
        this.entities.forEach(entity => {
             // Skip self, dead, invalid entities, or entities without a mesh
             if (!entity || entity === this.player || entity.isDead || !entity.mesh || !entity.mesh.parent) return;

             entity.mesh.getWorldPosition(this._entityPos);
             const entityMapX = this.worldToMapX(this._entityPos.x);
             const entityMapY = this.worldToMapZ(this._entityPos.z);

             let color = this.neutralAnimalColor; // Default
             let size = this.dotSize;
             let draw = true;

             // Determine color and size based on entity type and state
             if (entity.userData.isNPC) {
                color = this.npcColor;
                // Check if NPC has an active/available quest (requires questLog access or flag)
                // Example check (requires QuestLog reference or flag on NPC):
                 if (entity.assignedQuestId && entity.questLog?.getQuestStatus(entity.assignedQuestId) === 'available') {
                     color = this.questNpcColor; // Highlight available quests
                 }
                 else if (entity.assignedQuestId && entity.questLog?.getQuestStatus(entity.assignedQuestId) === 'active' && entity.questLog?.checkQuestCompletion(entity.assignedQuestId, entity.inventory)) {
                     color = this.questNpcColor; // Highlight ready-to-complete quests
                 }

                size = this.dotSize + 1; // NPCs slightly larger
             } else if (entity.userData.isAnimal) {
                // Check animal type and hostility state for color
                if (entity.userData.isHostile) { // Check simple flag set by animal AI
                    color = this.hostileAnimalColor;
                } else if (entity.type === 'Deer') {
                    color = this.friendlyAnimalColor;
                } else if (entity.type === 'Rabbit') {
                     color = this.neutralAnimalColor;
                     size = this.dotSize - 1; // Rabbits smaller
                } // Add other animal types here
             } else {
                 draw = false; // Don't draw unknown entity types
             }

             // Draw dot for the entity if valid
             if (draw) {
                this.drawDot(entityMapX, entityMapY, color, size);
             }
        });

        // --- Restore canvas state before drawing player ---
        // All entities were drawn relative to the player's centered and rotated view
        this.ctx.restore();

        // --- Draw Player ---
        // Player is always in the center of the canvas, pointing upwards due to rotation logic
        this.drawPlayerTriangle(this.halfMapSize, this.halfMapSize, this.playerColor, this.playerTriangleSize);
    }

    // Helper to convert world X to map X
    worldToMapX(worldX) {
         return (worldX + this.halfWorldSize) * this.mapScale;
    }
    // Helper to convert world Z to map Y
    worldToMapZ(worldZ) {
         // Z+ in world might be Map Y- or Y+, depending on desired orientation.
         // Assuming World Z+ corresponds to Map Y+ (North up)
         return (worldZ + this.halfWorldSize) * this.mapScale;
         // If World Z+ should be Map Y- (North down):
         // return this.mapSize - ((worldZ + this.halfWorldSize) * this.mapScale);
    }

    // Draws a dot at the specified map coordinates (already transformed)
    drawDot(mapX, mapY, color, size) {
        // No clipping check needed here as canvas transform handles it
        this.ctx.fillStyle = color;
        this.ctx.beginPath();
        // Use rect for slightly better performance than arc?
        // this.ctx.fillRect(mapX - size/2, mapY - size/2, size, size);
        this.ctx.arc(mapX, mapY, size, 0, Math.PI * 2);
        this.ctx.fill();
    }

     // Draws player triangle at the center of the canvas, always pointing "up" (forward)
     drawPlayerTriangle(centerX, centerY, color, size) {
         this.ctx.fillStyle = color;
         this.ctx.beginPath();
         // Draw triangle pointing "up"
         this.ctx.moveTo(centerX, centerY - size * 0.6);       // Top point
         this.ctx.lineTo(centerX - size / 2, centerY + size * 0.4); // Bottom left
         this.ctx.lineTo(centerX + size / 2, centerY + size * 0.4);  // Bottom right
         this.ctx.closePath();
         this.ctx.fill();
     }
}