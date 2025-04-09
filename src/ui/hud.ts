import { Character } from "../entities/character";

export class HUD {
  player: Character;
  healthBarElement: HTMLElement | null;
  staminaBarElement: HTMLElement | null;
  fpsDisplayElement: HTMLElement | null;
  frameTimes: number[] = [];
  MAX_SAMPLES: number = 60;
  lastUpdateTime: number;

  constructor(player: Character) {
    this.player = player;
    this.healthBarElement = document.getElementById("health-bar");
    this.staminaBarElement = document.getElementById("stamina-bar");
    this.fpsDisplayElement = document.getElementById("fps-display");
    this.lastUpdateTime = performance.now();
    this.update();
  }

  update(): void {
    const currentTime = performance.now();
    const deltaTime = (currentTime - this.lastUpdateTime) / 1000;
    this.lastUpdateTime = currentTime;
    this.frameTimes.push(deltaTime);
    if (this.frameTimes.length > this.MAX_SAMPLES) this.frameTimes.shift();
    const averageDelta =
      this.frameTimes.reduce((a, b) => a + b, 0) / this.frameTimes.length;
    const fps = 1 / averageDelta;
    if (this.fpsDisplayElement)
      this.fpsDisplayElement.textContent = `FPS: ${Math.round(fps)}`;
    if (this.player.isDead) {
      if (this.healthBarElement) this.healthBarElement.style.width = `0%`;
      if (this.staminaBarElement) this.staminaBarElement.style.width = `0%`;
      return;
    }
    if (!this.healthBarElement || !this.staminaBarElement) return;
    const healthPercent = Math.max(
      0,
      (this.player.health / this.player.maxHealth) * 100
    );
    this.healthBarElement.style.width = `${healthPercent}%`;
    this.healthBarElement.style.backgroundColor =
      healthPercent < 30
        ? "#FF4500"
        : healthPercent < 60
          ? "#FFA500"
          : "#4CAF50";
    const staminaPercent = Math.max(
      0,
      (this.player.stamina / this.player.maxStamina) * 100
    );
    this.staminaBarElement.style.width = `${staminaPercent}%`;
    if (this.player.isExhausted) {
      this.staminaBarElement.style.backgroundColor = "#888";
      this.staminaBarElement.classList.add("exhausted");
    } else {
      this.staminaBarElement.style.backgroundColor = "#FF69B4";
      this.staminaBarElement.classList.remove("exhausted");
    }
  }
}
