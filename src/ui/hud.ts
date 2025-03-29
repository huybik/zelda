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
        if (!this.healthBar || !this.staminaBar) return;

        // Handle dead player state gracefully
        const healthPercent = this.player.isDead ? 0 : Math.max(0, (this.player.health / this.player.maxHealth) * 100);
        const staminaPercent = this.player.isDead ? 0 : Math.max(0, (this.player.stamina / this.player.maxStamina) * 100);

        // Update Health
        this.healthBar.style.width = `${healthPercent}%`;
        this.healthBar.style.backgroundColor = healthPercent < 30 ? '#FF4500' : healthPercent < 60 ? '#FFA500' : '#4CAF50';

        // Update Stamina
        this.staminaBar.style.width = `${staminaPercent}%`;
        this.staminaBar.style.backgroundColor = this.player.isExhausted ? '#888' : '#FF69B4';
        this.staminaBar.classList.toggle('exhausted', this.player.isExhausted);
    }
}