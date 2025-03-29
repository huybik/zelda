
import { Player } from '../entities/player';

export class HUD {
    private player: Player;
    private healthBar: HTMLElement | null;
    private staminaBar: HTMLElement | null;

    constructor(player: Player) {
        this.player = player;
        this.healthBar = document.getElementById('health-bar');
        this.staminaBar = document.getElementById('stamina-bar');
        if (!this.healthBar) console.error("#health-bar not found");
        if (!this.staminaBar) console.error("#stamina-bar not found");
        this.update(); // Initial render
    }

    update(): void {
        // FIX: Check elements exist before updating styles
        if (!this.healthBar || !this.staminaBar || !this.player) return;

        // Handle dead player state gracefully
        const healthPercent = this.player.isDead ? 0 : Math.max(0, (this.player.health / this.player.maxHealth) * 100);
        // Ensure maxStamina is not zero to avoid NaN
        const staminaPercent = (this.player.isDead || this.player.maxStamina <= 0)
             ? 0
             : Math.max(0, (this.player.stamina / this.player.maxStamina) * 100);


        // Update Health
        this.healthBar.style.width = `${healthPercent}%`;
        // Determine color based on percentage
        let healthColor = '#4CAF50'; // Green default
        if (healthPercent < 30) healthColor = '#FF4500'; // Red (OrangeRed)
        else if (healthPercent < 60) healthColor = '#FFA500'; // Orange
        this.healthBar.style.backgroundColor = healthColor;


        // Update Stamina
        this.staminaBar.style.width = `${staminaPercent}%`;
        this.staminaBar.style.backgroundColor = this.player.isExhausted ? '#888' : '#FF69B4'; // Grey if exhausted, Pink otherwise
        // Toggle class for potential CSS animations/styling
        this.staminaBar.classList.toggle('exhausted', this.player.isExhausted);
    }
}