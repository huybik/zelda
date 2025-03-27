export class HUD {
    constructor(player) {
        if (!player) throw new Error("Player instance is required for HUD.");
        this.player = player;

        this.healthBarElement = document.getElementById('health-bar');
        this.staminaBarElement = document.getElementById('stamina-bar');
        // Interaction prompt is handled by InteractionSystem and its own element

        if (!this.healthBarElement) console.error("HUD element not found: #health-bar");
        if (!this.staminaBarElement) console.error("HUD element not found: #stamina-bar");

        // Initial update
        this.update();
    }

    update() {
        // Guard clauses for missing elements or player
        if (!this.player || this.player.isDead) { // Optionally hide/dim HUD when dead?
            // Could set bars to 0% width or hide HUD container
             if (this.healthBarElement) this.healthBarElement.style.width = `0%`;
             if (this.staminaBarElement) this.staminaBarElement.style.width = `0%`;
            return;
        }
        if (!this.healthBarElement || !this.staminaBarElement) return;


        // Update Health Bar
        const healthPercent = Math.max(0, (this.player.health / this.player.maxHealth) * 100);
        this.healthBarElement.style.width = `${healthPercent}%`;

        // Change color based on health percentage
        if (healthPercent < 30) {
            this.healthBarElement.style.backgroundColor = '#FF4500'; // OrangeRed
        } else if (healthPercent < 60) {
            this.healthBarElement.style.backgroundColor = '#FFA500'; // Orange
        } else {
            this.healthBarElement.style.backgroundColor = '#4CAF50'; // Green
        }


        // Update Stamina Bar
        const staminaPercent = Math.max(0, (this.player.stamina / this.player.maxStamina) * 100);
        this.staminaBarElement.style.width = `${staminaPercent}%`;

         // Change style to indicate exhaustion
         if(this.player.isExhausted) {
             this.staminaBarElement.style.backgroundColor = '#888'; // Grey out when exhausted
             this.staminaBarElement.classList.add('exhausted'); // Add class for potential pulsing/styling
         } else {
             this.staminaBarElement.style.backgroundColor = '#FF69B4'; // Pink
             this.staminaBarElement.classList.remove('exhausted');
         }
    }
}