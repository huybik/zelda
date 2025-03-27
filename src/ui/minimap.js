export class Minimap {
    constructor(canvasElement, player, entities, worldSize) {
        this.canvas = canvasElement;
        this.ctx = this.canvas.getContext('2d');
        this.player = player;
        this.entities = entities; // Array of all entities (NPCs, Animals)
        this.worldSize = worldSize; // The total size of the game world (e.g., 1000)

        this.mapSize = this.canvas.width; // Assumes square canvas
        this.mapScale = this.mapSize / this.worldSize;

        // Colors
        this.bgColor = 'rgba(100, 100, 100, 0.5)';
        this.playerColor = 'yellow';
        this.npcColor = 'cyan';
        this.animalColor = 'lime'; // Friendly animal color
        this.hostileColor = 'red'; // Hostile animal color
        this.dotSize = 3; // Size of dots on map
    }

    update() {
        if (!this.ctx || !this.player) return;

        // Clear canvas
        this.ctx.fillStyle = this.bgColor;
        this.ctx.fillRect(0, 0, this.mapSize, this.mapSize);

        // Calculate center of map based on player position
        const playerMapX = this.worldToMap(this.player.mesh.position.x);
        const playerMapY = this.worldToMap(this.player.mesh.position.z); // Use Z for map Y

        // --- Draw Entities ---
        this.entities.forEach(entity => {
             if (!entity || entity === this.player || !entity.mesh || entity.isDead) return; // Skip self, dead or invalid entities

            const entityMapX = this.worldToMap(entity.mesh.position.x);
            const entityMapY = this.worldToMap(entity.mesh.position.z);

            let color = this.animalColor; // Default
             let size = this.dotSize;

            if (entity.userData.isNPC) {
                color = this.npcColor;
                 size = this.dotSize + 1; // NPCs slightly larger
            } else if (entity.userData.isAnimal) {
                // Check animal type for color
                if (entity.type === 'Wolf' && entity.state === 'attacking') {
                    color = this.hostileColor;
                } else if (entity.type === 'Wolf') {
                     color = '#FFA500'; // Orange for non-aggro wolf
                } else if (entity.type === 'Deer') {
                    color = this.animalColor;
                } else {
                    color = 'white'; // Other animals (rabbits?)
                }
            } else {
                 return; // Don't draw unknown entity types
            }

             // Draw dot for the entity
             this.drawDot(entityMapX, entityMapY, color, size);
        });


        // --- Draw Player ---
        // Player is always in the center of the minimap
        const centerX = this.mapSize / 2;
        const centerY = this.mapSize / 2;

         // Draw player dot (or triangle indicating direction)
         // this.drawDot(centerX, centerY, this.playerColor, this.dotSize + 1);

         // Draw player triangle
         this.drawPlayerTriangle(centerX, centerY, this.player.mesh.rotation.y, this.playerColor, this.dotSize * 1.5);


         // Optional: Rotate the *entire map* around the player instead of player being centered
         // This requires drawing everything relative to the player center and applying a rotation transform
         // ctx.save();
         // ctx.translate(centerX, centerY);
         // ctx.rotate(-this.player.mesh.rotation.y); // Rotate opposite to player rotation
         // ctx.translate(-centerX, -centerY);
         // ... draw all entities relative to playerMapX/Y offsets ...
         // ... draw player marker fixed at center, pointing up ...
         // ctx.restore();
    }

    // Helper to convert world coords (X, Z) to map coords (X, Y)
    worldToMap(worldCoord) {
         // Centered coordinate system conversion
         // World ranges from -worldSize/2 to +worldSize/2
         // Map ranges from 0 to mapSize
         return (worldCoord + this.worldSize / 2) * this.mapScale;
    }

    drawDot(x, y, color, size) {
        // Adjust position based on player offset for centered map
        const playerMapX = this.worldToMap(this.player.mesh.position.x);
        const playerMapY = this.worldToMap(this.player.mesh.position.z);
        const drawX = x - playerMapX + this.mapSize / 2;
        const drawY = y - playerMapY + this.mapSize / 2;

        // Only draw if dot is within map bounds
        if (drawX >= 0 && drawX <= this.mapSize && drawY >= 0 && drawY <= this.mapSize) {
            this.ctx.fillStyle = color;
            this.ctx.beginPath();
            this.ctx.arc(drawX, drawY, size, 0, Math.PI * 2);
            this.ctx.fill();
        }
    }

     drawPlayerTriangle(x, y, angle, color, size) {
         this.ctx.save();
         this.ctx.translate(x, y);
         this.ctx.rotate(angle); // Rotate based on player's Y rotation
         this.ctx.fillStyle = color;
         this.ctx.beginPath();
         // Draw triangle pointing "up" in local coords (which is forward after rotation)
         this.ctx.moveTo(0, -size);       // Top point
         this.ctx.lineTo(-size / 2, size / 2); // Bottom left
         this.ctx.lineTo(size / 2, size / 2);  // Bottom right
         this.ctx.closePath();
         this.ctx.fill();
         this.ctx.restore();
     }
}