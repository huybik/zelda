// File: /src/ai/animalAI.ts
import { Vector3 } from "three";
import { Animal } from "../entities/animals";
import { MoveState, getTerrainHeight } from "../core/utils";
import { Character } from "../entities/character";

export class AnimalAIController {
  animal: Animal;
  aiState: string = "idle";
  previousAiState: string = "idle";
  homePosition: Vector3;
  destination: Vector3 | null = null;
  actionTimer: number = 5; // Time until next decision in idle state
  attackCooldown: number = 2.0;
  lastAttackTime: number = 0;
  target: Character | null = null; // Target for attacking
  attackRange: number = 2.0;
  detectionRange: number = 15.0;
  roamRadius: number = 20.0;
  persona: string = ""; // Default persona
  targetResource: string | null = null; // Target resource for gathering
  targetAction: string | null = null; // Action to perform on target resource
  message: string | null = null; // Message to display
  persistentAction: { type: string; targetType: string } | null = null;

  constructor(animal: Animal) {
    this.animal = animal;
    this.homePosition = animal.mesh!.position.clone();
  }

  async decideNextAction(): Promise<void> {}
  scheduleNextActionDecision(): void {}

  computeAIMoveState(deltaTime: number): MoveState {
    const moveState: MoveState = {
      forward: 0,
      right: 0,
      jump: false,
      sprint: false, // Animals might always "run" or have different speeds
      interact: false,
      attack: false,
    };

    if (this.animal.isDead) {
      this.aiState = "dead";
      return moveState; // No actions if dead
    }

    // Simple target detection (player or other characters)
    this.findTarget();

    switch (this.aiState) {
      case "idle":
        this.actionTimer -= deltaTime;
        if (this.target && this.animal.userData.isAggressive) {
          this.aiState = "attacking";
        } else if (this.actionTimer <= 0) {
          this.aiState = "roaming";
          this.actionTimer = 5 + Math.random() * 10; // Reset timer for next roam
          this.setNewRoamDestination();
        }
        break;

      case "roaming":
        if (this.target && this.animal.userData.isAggressive) {
          this.aiState = "attacking";
          this.destination = null; // Stop roaming
          break;
        }
        if (this.destination) {
          const direction = this.destination
            .clone()
            .sub(this.animal.mesh!.position);
          direction.y = 0; // Ignore vertical distance for movement decision
          const distance = direction.length();

          if (distance > 1.0) {
            // Threshold to stop near destination
            direction.normalize();
            this.animal.lookAt(
              this.animal.mesh!.position.clone().add(direction)
            );
            moveState.forward = 1; // Move forward
            // Potentially set sprint based on animal type or state
            moveState.sprint = true; // Example: Animals usually run when moving
          } else {
            // Reached destination
            this.aiState = "idle";
            this.destination = null;
            this.actionTimer = 2 + Math.random() * 4; // Idle for a bit
          }
        } else {
          // No destination, go back to idle
          this.aiState = "idle";
        }
        break;

      case "attacking":
        if (!this.target || this.target.isDead) {
          this.aiState = "idle";
          this.target = null;
          this.actionTimer = 3 + Math.random() * 3; // Cooldown after losing target
          break;
        }

        const targetPosition = this.target.mesh!.position;
        const directionToTarget = targetPosition
          .clone()
          .sub(this.animal.mesh!.position);
        directionToTarget.y = 0;
        const distanceToTarget = directionToTarget.length();

        this.animal.lookAt(targetPosition); // Always face the target

        if (distanceToTarget > this.attackRange) {
          // Move towards target
          moveState.forward = 1;
          moveState.sprint = true; // Run towards target
        } else {
          // Within attack range
          moveState.forward = 0; // Stop moving
          const now = performance.now();
          if (now - this.lastAttackTime > this.attackCooldown * 1000) {
            moveState.attack = true; // Trigger attack animation/logic
            this.lastAttackTime = now;
          }
        }
        // Check if target moved too far away
        if (distanceToTarget > this.detectionRange * 1.5) {
          this.aiState = "idle"; // Lose target if too far
          this.target = null;
          this.actionTimer = 5 + Math.random() * 5;
        }
        break;

      case "dead":
        // No movement or actions
        break;
    }

    // Log state changes (optional, for debugging)
    if (this.aiState !== this.previousAiState) {
      // console.log(`${this.animal.name} state changed to: ${this.aiState}`);
      this.previousAiState = this.aiState;
    }

    return moveState;
  }

  findTarget(): void {
    if (!this.animal.game || !this.animal.mesh) return;

    let closestTarget: Character | null = null;
    let minDistanceSq = this.detectionRange * this.detectionRange;
    const currentPosition = this.animal.mesh.position;

    for (const entity of this.animal.game.entities) {
      if (entity instanceof Character && !entity.isDead && entity.mesh) {
        // Basic check: target player or NPCs, could add faction logic later
        const distanceSq = currentPosition.distanceToSquared(
          entity.mesh.position
        );
        if (distanceSq < minDistanceSq) {
          minDistanceSq = distanceSq;
          closestTarget = entity;
        }
      }
    }
    this.target = closestTarget;
  }

  setNewRoamDestination(): void {
    const angle = Math.random() * Math.PI * 2;
    const distance = Math.random() * this.roamRadius;
    this.destination = this.homePosition
      .clone()
      .add(
        new Vector3(Math.cos(angle) * distance, 0, Math.sin(angle) * distance)
      );

    // Clamp destination within world bounds (approximate)
    const worldHalfSize = this.animal.game?.worldSize
      ? this.animal.game.worldSize / 2 - 2
      : 48; // Fallback
    this.destination.x = Math.max(
      -worldHalfSize,
      Math.min(worldHalfSize, this.destination.x)
    );
    this.destination.z = Math.max(
      -worldHalfSize,
      Math.min(worldHalfSize, this.destination.z)
    );

    // Set Y based on terrain height
    if (this.animal.scene) {
      this.destination.y = getTerrainHeight(
        this.animal.scene,
        this.destination.x,
        this.destination.z
      );
    }
  }
}
