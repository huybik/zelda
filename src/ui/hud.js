export class HUD {
    constructor(player) {
        this.player = player;
        this.healthBarElement = document.getElementById('health-bar');
        this.staminaBarElement = document.getElementById('stamina-bar');
        // Interaction prompt is handled by InteractionSystem

        if (!this.healthBarElement || !this.staminaBarElement) {
            console.error("HUD elements not found!");
        }
    }

    update() {
        if (!this.player || !this.healthBarElement || !this.staminaBarElement) {
            return;
        }

        // Update Health Bar
        const healthPercent = (this.player.health / this.player.maxHealth) * 100;
        this.healthBarElement.style.width = `${Math.max(0, healthPercent)}%`;
        // Optional: Change color based on health?
        if (healthPercent < 30) {
            this.healthBarElement.style.backgroundColor = '#FF4500'; // OrangeRed
        } else {
            this.healthBarElement.style.backgroundColor = '#4CAF50'; // Green
        }


        // Update Stamina Bar
        const staminaPercent = (this.player.stamina / this.player.maxStamina) * 100;
        this.staminaBarElement.style.width = `${Math.max(0, staminaPercent)}%`;
         // Optional: Indicate exhaustion?
         if(this.player.isExhausted) {
             this.staminaBarElement.style.backgroundColor = '#888'; // Grey out when exhausted
         } else {
             this.staminaBarElement.style.backgroundColor = '#FF69B4'; // Pink
         }
    }
}