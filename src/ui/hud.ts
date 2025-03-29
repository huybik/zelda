import { Player } from '../entities/player';

export class HUD {
    private player: Player;
    private healthBarElement: HTMLElement | null;
    private staminaBarElement: HTMLElement | null;
    // Interaction prompt is handled separately by InteractionSystem

    constructor(player: Player) {
        if (!player) throw new Error("Player instance is required for HUD.");
        this.player = player;

        this.healthBarElement = document.getElementById('health-bar');
        this.staminaBarElement = document.getElementById('stamina-bar');

        if (!this.healthBarElement) console.error("HUD element not found: #health-bar");
        if (!this.staminaBarElement) console.error("HUD element not found: #stamina-bar");

        this.update(); // Initial update
    }

    update(): void {
        // Handle dead player state
        if (this.player.isDead) {
            if (this.healthBarElement) this.healthBarElement.style.width = `0%`;
            if (this.staminaBarElement) this.staminaBarElement.style.width = `0%`;
            // Optionally hide the entire HUD or add a 'dead' class
            return;
        }

        // Guard clauses for missing elements
        if (!this.healthBarElement || !this.staminaBarElement) return;

        // Update Health Bar
        const healthPercent = Math.max(0, (this.player.health / this.player.maxHealth) * 100);
        this.healthBarElement.style.width = `${healthPercent}%`;
        // Update health bar color based on percentage
        if (healthPercent < 30) this.healthBarElement.style.backgroundColor = '#FF4500'; // OrangeRed
        else if (healthPercent < 60) this.healthBarElement.style.backgroundColor = '#FFA500'; // Orange
        else this.healthBarElement.style.backgroundColor = '#4CAF50'; // Green

        // Update Stamina Bar
        const staminaPercent = Math.max(0, (this.player.stamina / this.player.maxStamina) * 100);
        this.staminaBarElement.style.width = `${staminaPercent}%`;
        // Update stamina bar style/color based on exhaustion
        if (this.player.isExhausted) {
            this.staminaBarElement.style.backgroundColor = '#888'; // Grey out
            this.staminaBarElement.classList.add('exhausted');
        } else {
            this.staminaBarElement.style.backgroundColor = '#FF69B4'; // Pink
            this.staminaBarElement.classList.remove('exhausted');
        }
    }
}