// src/ui/HUD.ts
import type { Character } from "../core/Character";
import { HUD_FPS_SAMPLES } from "../config";

export class HUD {
  player: Character; // Reference to the currently controlled player
  healthBarElement: HTMLElement | null;
  staminaBarElement: HTMLElement | null;
  fpsDisplayElement: HTMLElement | null;

  // FPS calculation variables
  private frameTimes: number[] = [];
  private lastUpdateTime: number;
  private readonly MAX_SAMPLES: number = HUD_FPS_SAMPLES;

  constructor(player: Character) {
    this.player = player;
    this.healthBarElement = document.getElementById("health-bar"); // Target the inner fill element
    this.staminaBarElement = document.getElementById("stamina-bar"); // Target the inner fill element
    this.fpsDisplayElement = document.getElementById("fps-display");
    this.lastUpdateTime = performance.now();

    if (
      !this.healthBarElement ||
      !this.staminaBarElement ||
      !this.fpsDisplayElement
    ) {
      console.warn(
        "HUD elements not found in DOM. HUD will not function correctly."
      );
    }

    this.update(); // Initial update to set values
  }

  // Update the player reference (e.g., when control switches)
  setActivePlayer(newPlayer: Character): void {
    this.player = newPlayer;
    this.update(); // Update immediately with new player data
  }

  // Updates the HUD elements based on current player stats and FPS.
  update(): void {
    // --- FPS Calculation ---
    const currentTime = performance.now();
    // Calculate delta time, ensuring it's not zero or negative
    const deltaTime = Math.max(
      1e-6,
      (currentTime - this.lastUpdateTime) / 1000
    ); // Avoid division by zero
    this.lastUpdateTime = currentTime;

    // Add current frame time and maintain sample window
    this.frameTimes.push(deltaTime);
    if (this.frameTimes.length > this.MAX_SAMPLES) {
      this.frameTimes.shift(); // Remove oldest sample
    }

    // Calculate average frame time and FPS
    const averageDelta =
      this.frameTimes.reduce((a, b) => a + b, 0) / this.frameTimes.length;
    const fps = 1 / averageDelta;

    // Update FPS display element
    if (this.fpsDisplayElement) {
      this.fpsDisplayElement.textContent = `FPS: ${Math.round(fps)}`;
    }

    // --- Health & Stamina Bars ---
    if (!this.healthBarElement || !this.staminaBarElement) return; // Exit if elements are missing

    // Handle dead player state
    if (this.player.isDead) {
      this.healthBarElement.style.width = `0%`;
      this.staminaBarElement.style.width = `0%`;
      this.staminaBarElement.classList.remove("exhausted"); // Ensure exhausted class is removed
      return; // No further updates needed if dead
    }

    // Calculate health percentage and update bar width and color
    const healthPercent = Math.max(
      0,
      (this.player.health / this.player.maxHealth) * 100
    );
    this.healthBarElement.style.width = `${healthPercent}%`;
    // Change color based on health level
    this.healthBarElement.style.backgroundColor =
      healthPercent < 30
        ? "#FF4500" // OrangeRed below 30%
        : healthPercent < 60
          ? "#FFA500" // Orange below 60%
          : "#4CAF50"; // Green otherwise

    // Calculate stamina percentage and update bar width
    const staminaPercent = Math.max(
      0,
      (this.player.stamina / this.player.maxStamina) * 100
    );
    this.staminaBarElement.style.width = `${staminaPercent}%`;

    // Update visual state based on exhaustion
    if (this.player.isExhausted) {
      this.staminaBarElement.style.backgroundColor = "#888"; // Greyed out when exhausted
      this.staminaBarElement.classList.add("exhausted"); // Add class for potential CSS effects (e.g., pulsing)
    } else {
      this.staminaBarElement.style.backgroundColor = "#2196F3"; // Blue stamina (or choose another color)
      this.staminaBarElement.classList.remove("exhausted");
    }
  }
}
