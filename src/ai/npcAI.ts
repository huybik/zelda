/* File: /src/ai/npcAI.ts */
import { Vector3, Object3D } from "three";
import { Entity } from "../entities/entitiy";
import { Character } from "../entities/character";
import { MoveState, getTerrainHeight } from "../core/utils";
import { Animal } from "../entities/animals";
import {
  sendToGemini,
  Observation,
  generatePrompt,
  updateObservation,
  handleChatResponse,
} from "./api";

export class AIController {
  character: Character;
  aiState: string = "idle";
  previousAiState: string = "idle";
  homePosition: Vector3;
  destination: Vector3 | null = null;
  actionTimer: number = 5;
  interactionDistance: number = 3; // Distance for chat
  attackDistance: number = 2; // Distance for attacking entities/resources
  searchRadius: number;
  roamRadius: number;
  target: Entity | Object3D | null = null; // Target can be Entity or resource Object3D
  observation: Observation | null = null;
  persona: string = "";
  currentIntent: string = "";
  targetAction: string | null = null; // "attack" or "chat"
  message: string | null = null;
  private lastApiCallTime: number = 0;
  private apiCallCooldown: number = 20000;
  lastObservation: Observation | null = null;
  persistentAction: { type: string; targetType: string } | null = null; // e.g., { type: "attack", targetType: "wood" } or { type: "attack", targetType: "Wolf" }
  private chatDecisionTimer: ReturnType<typeof setTimeout> | null = null;
  private lastAffectedTime: number = 0;
  private affectedCooldown: number = 10000;

  constructor(character: Character) {
    this.character = character;
    this.homePosition = character.mesh!.position.clone();
    this.searchRadius = character.searchRadius;
    this.roamRadius = character.roamRadius;
    this.persona = character.persona;
  }

  computeAIMoveState(deltaTime: number): MoveState {
    const moveState: MoveState = {
      forward: 0,
      right: 0,
      jump: false,
      sprint: false,
      interact: false, // Interact (E key) is only for chat now
      attack: false, // Attack (F key / AI) is for combat and resources
    };

    if (this.character.game) {
      updateObservation(this, this.character.game.entities);
    }

    // Check for environmental changes to trigger immediate action decisions
    if (this.isAffectedByEntities()) {
      this.decideNextAction();
      this.actionTimer = 5 + Math.random() * 5; // Reset timer after triggering
    }

    const currentTime = Date.now();
    this.actionTimer -= deltaTime;
    const timeSinceLastCall = currentTime - this.lastApiCallTime;
    const canCallApi = timeSinceLastCall >= this.apiCallCooldown;

    if (this.actionTimer <= 0 && this.chatDecisionTimer === null) {
      this.actionTimer = 5 + Math.random() * 5;
      if (canCallApi) {
        this.decideNextAction();
        this.lastApiCallTime = currentTime;
      }
    }
    if (this.aiState !== this.previousAiState) {
      console.log(
        `AI state changed from ${this.previousAiState} to ${this.aiState}`
      );
    }

    switch (this.aiState) {
      case "deciding":
        // While waiting for API response, stop movement but keep the character responsive
        // No moveState changes needed; character idles until new action is set
        break;

      case "idle":
      // If the character is idle, do nothing
      case "roaming":
        if (this.destination) {
          const direction = this.destination
            .clone()
            .sub(this.character.mesh!.position);
          direction.y = 0;
          const distance = direction.length();
          if (distance > 0.5) {
            direction.normalize();
            this.character.lookAt(
              this.character.mesh!.position.clone().add(direction)
            );
            moveState.forward = 1;
          } else {
            this.aiState = "idle";
            this.destination = null;
          }
        } else {
          this.aiState = "idle";
        }
        break;

      case "movingToTarget":
        if (this.target && this.targetAction) {
          const targetPosition =
            this.target instanceof Entity
              ? this.target.mesh!.position
              : this.target.position; // Object3D position
          const isTargetResource = !(this.target instanceof Entity);
          const isTargetEntityDead =
            this.target instanceof Entity && this.target.isDead;
          const isTargetResourceDepleted =
            isTargetResource &&
            (this.target instanceof Object3D
              ? !this.target.visible || !this.target.userData.isInteractable
              : false);

          // Check if target is invalid (dead entity or depleted resource)
          if (isTargetEntityDead || isTargetResourceDepleted) {
            this.handleTargetLostOrDepleted();
            break; // Exit switch case for this frame
          }

          const direction = targetPosition
            .clone()
            .sub(this.character.mesh!.position);
          direction.y = 0;
          const distance = direction.length();
          const requiredDistance =
            this.targetAction === "attack"
              ? this.attackDistance
              : this.interactionDistance;

          if (distance > requiredDistance) {
            // Move towards target
            direction.normalize();
            this.character.lookAt(
              this.character.mesh!.position.clone().add(direction)
            );
            moveState.forward = 1;
            moveState.attack = false; // Ensure not attacking while moving
          } else {
            // Within range, perform action
            this.character.lookAt(targetPosition);
            moveState.forward = 0; // Stop moving

            if (this.targetAction === "attack") {
              // Keep signaling attack as long as in range and target is valid
              moveState.attack = true;

              // Check if target is depleted/dead *after* the attack might have happened
              // (This check might be slightly delayed, Character.performAttack handles immediate depletion)
              // Re-check target validity after potential attack
              const targetStillValid =
                this.target instanceof Entity
                  ? !this.target.isDead
                  : this.target.visible && this.target.userData.isInteractable;

              // If target becomes invalid OR moves out of search radius, handle it
              if (!targetStillValid || distance > this.searchRadius) {
                this.handleTargetLostOrDepleted();
                moveState.attack = false; // Stop attacking if target lost
              }
              // Note: Persistent action logic moved to handleTargetLostOrDepleted
            } else if (
              this.targetAction === "chat" &&
              this.message &&
              this.chatDecisionTimer === null &&
              this.target instanceof Character // Ensure target is a Character for chat
            ) {
              // Handle chat initiation
              if (this.target.aiController) {
                this.target.aiController.aiState = "idle";
                this.target.aiController.persistentAction = null;
              }
              this.character.updateIntentDisplay(this.message);
              if (this.character.game) {
                this.character.game.logEvent(
                  this.character,
                  "chat",
                  `${this.character.name} said "${this.message}" to ${this.target.name}.`,
                  this.target,
                  { message: this.message },
                  this.character.mesh!.position
                );
              }
              handleChatResponse(this.target, this.character, this.message);

              // Reset state after initiating chat
              this.aiState = "idle";
              this.target = null;
              this.targetAction = null;
              this.message = null;
            }
          }
        } else {
          // Target became null or action became null unexpectedly
          this.aiState = "idle";
          this.target = null;
          this.targetAction = null;
          this.message = null;
        }
        break;
      default:
        console.warn(`Unhandled AI state: ${this.aiState}`);
        this.aiState = "idle";
        break;
    }

    this.previousAiState = this.aiState;

    return moveState;
  }

  // Helper function to handle target loss or depletion
  private handleTargetLostOrDepleted(): void {
    if (this.persistentAction?.type === "attack") {
      const targetType = this.persistentAction.targetType;
      let nextTarget: Entity | Object3D | null = null;

      // Check if targetType corresponds to a resource or an animal type
      if (["wood", "stone", "herb"].includes(targetType)) {
        nextTarget = this.findNearestResource(targetType);
      } else {
        nextTarget = this.findNearestAnimal(targetType);
      }

      if (nextTarget) {
        this.target = nextTarget;
        // Keep aiState as "movingToTarget"
      } else {
        // No more targets of this type found
        this.persistentAction = null;
        this.aiState = "idle";
        this.target = null;
        this.targetAction = null;
      }
    } else {
      // No persistent action, just go idle
      this.aiState = "idle";
      this.target = null;
      this.targetAction = null;
      this.message = null; // Clear message too
    }
  }

  scheduleNextActionDecision(): void {
    if (this.chatDecisionTimer !== null) {
      clearTimeout(this.chatDecisionTimer);
    }
    this.chatDecisionTimer = setTimeout(() => {
      this.decideNextAction();
      this.chatDecisionTimer = null;
    }, 7000);
  }

  private justCompletedAction(): boolean {
    return this.previousAiState !== "idle" && this.aiState === "idle";
  }

  private isAffectedByEntities(): boolean {
    const currentTime = Date.now();
    const affectedCooldown = 5000; // Reduced from 10000ms to 5000ms for faster reaction

    if (currentTime < this.lastAffectedTime + affectedCooldown) {
      return false;
    }

    if (!this.observation || !this.lastObservation) return false;

    // Check self health change
    if (this.observation.self.health < this.lastObservation.self.health) {
      this.lastAffectedTime = currentTime;
      return true;
    }

    // Check nearby characters
    const currentCharacters = this.observation.nearbyCharacters;
    const lastCharacters = this.lastObservation.nearbyCharacters;
    for (const currChar of currentCharacters) {
      const matchingLastChar = lastCharacters.find((c) => c.id === currChar.id);
      if (
        !matchingLastChar ||
        currChar.health < matchingLastChar.health ||
        currChar.isDead !== matchingLastChar.isDead
      ) {
        this.lastAffectedTime = currentTime;
        return true;
      }
    }

    return false;
  }

  async decideNextAction(): Promise<void> {
    // Set a "deciding" state immediately to signal that an action is being determined
    this.aiState = "deciding";

    const prompt = generatePrompt(this);
    try {
      console.log(
        `time since last call in seconds: ${(Date.now() - this.lastApiCallTime) / 1000}`
      );
      console.log(`Prompt for ${this.character.name}:\n${prompt}\n\n`);
      const response = await sendToGemini(prompt);
      this.lastApiCallTime = Date.now();
      if (response) {
        const actionData = JSON.parse(response);
        console.log(
          `Response from API for ${this.character.name}:\n${response}\n\n`
        );
        this.setActionFromAPI(actionData);
      } else {
        this.fallbackToDefaultBehavior();
      }
    } catch (error) {
      console.error(`Error querying API for ${this.character.name}:`, error);
      this.fallbackToDefaultBehavior();
    }
  }

  fallbackToDefaultBehavior(): void {
    console.warn(
      `Falling back to default behavior for ${this.character.name}.`
    );
    this.aiState = "roaming";
    const angle = Math.random() * Math.PI * 2;
    const distance = Math.random() * this.roamRadius;
    this.destination = this.homePosition
      .clone()
      .add(
        new Vector3(Math.cos(angle) * distance, 0, Math.sin(angle) * distance)
      );
    if (this.character.scene) {
      this.destination.y = getTerrainHeight(
        this.character.scene,
        this.destination.x,
        this.destination.z
      );
    }
    this.target = null;
    this.targetAction = null;
    this.message = null;
    this.currentIntent = "Exploring";
  }

  setActionFromAPI(actionData: {
    action: string;
    target_id?: string;
    message?: string;
    intent: string;
  }): void {
    const { action, target_id, message, intent } = actionData;
    this.currentIntent = intent || "Thinking...";
    this.character.updateIntentDisplay(`${this.currentIntent}`);
    this.destination = null;
    this.target = null;
    this.targetAction = null;
    this.message = null;
    this.persistentAction = null;

    // Reset actionTimer to prevent immediate re-triggering
    this.actionTimer = 5 + Math.random() * 5;

    if (action === "attack" && target_id) {
      // Target can be an Entity (Character/Animal) or a resource Object3D
      let foundTarget: Entity | Object3D | null = null;

      // First, check Entities
      foundTarget =
        this.character.game?.entities.find((e) => e.id === target_id) ?? null;

      // If not found in entities, check scene children (for resources)
      if (!foundTarget) {
        foundTarget =
          this.character.scene?.children.find(
            (child) =>
              child.userData.id === target_id &&
              child.userData.isInteractable && // Resources are interactable (to be attackable)
              child.visible
          ) ?? null;
      }

      if (foundTarget) {
        // Determine if it's a resource or an entity for persistent action
        let targetType: string | null = null;
        if (foundTarget instanceof Entity) {
          if (foundTarget instanceof Animal) {
            targetType = foundTarget.animalType; // e.g., "Wolf"
          } else if (foundTarget instanceof Character) {
            targetType = "Character"; // Or use specific name/ID if needed
          }
        } else if (
          foundTarget instanceof Object3D &&
          foundTarget.userData.resource
        ) {
          targetType = foundTarget.userData.resource; // e.g., "wood", "stone"
        }

        if (targetType) {
          // Set persistent action based on the type
          this.persistentAction = { type: "attack", targetType: targetType };

          // Find the *nearest* valid target of that type to start with
          let nearestTarget: Entity | Object3D | null = null;
          if (["wood", "stone", "herb"].includes(targetType)) {
            nearestTarget = this.findNearestResource(targetType);
          } else {
            nearestTarget = this.findNearestAnimal(targetType);
            // Could add findNearestCharacter if needed
          }

          if (nearestTarget) {
            this.target = nearestTarget;
            this.targetAction = "attack";
            this.aiState = "movingToTarget";
          } else {
            // No valid target of this type found nearby
            this.aiState = "idle";
          }
        } else {
          // Target found, but couldn't determine type for persistent action (e.g., generic entity)
          // Just attack the specific target
          this.target = foundTarget;
          this.targetAction = "attack";
          this.aiState = "movingToTarget";
        }
      } else {
        // Target ID not found
        this.aiState = "idle";
      }
    } else if (action === "chat" && target_id) {
      const targetEntity = this.character.game?.entities.find(
        (e) => e.id === target_id && e instanceof Character && !e.isDead // Ensure it's a living character
      );
      if (targetEntity) {
        this.target = targetEntity;
        this.targetAction = "chat";
        this.message = message || "...";
        this.aiState = "movingToTarget";
      } else {
        this.aiState = "idle";
      }
    } else {
      // Default to idle if action is unknown or target_id missing when required
      this.aiState = "idle";
    }
  }

  findNearestResource(resourceType: string): Object3D | null {
    if (!this.character.scene) return null;
    let nearest: Object3D | null = null;
    let minDistanceSq = Infinity;
    const selfPosition = this.character.mesh!.position;
    const searchRadiusSq = this.searchRadius * this.searchRadius;
    this.character.scene.traverse((child) => {
      if (
        child.userData.isInteractable && // Resources are interactable
        child.userData.resource === resourceType &&
        child.visible &&
        child.userData.health > 0 // Only target resources with health > 0
      ) {
        const distanceSq = selfPosition.distanceToSquared(child.position);
        if (distanceSq < searchRadiusSq && distanceSq < minDistanceSq) {
          minDistanceSq = distanceSq;
          nearest = child;
        }
      }
    });
    return nearest;
  }

  findNearestAnimal(animalType: string): Animal | null {
    if (!this.character.game) return null;
    let nearest: Animal | null = null;
    let minDistanceSq = Infinity;
    const selfPosition = this.character.mesh!.position;
    const searchRadiusSq = this.searchRadius * this.searchRadius;
    for (const entity of this.character.game.entities) {
      if (
        entity instanceof Animal &&
        entity.animalType === animalType && // Match specific type from persistent action
        !entity.isDead
      ) {
        const distanceSq = selfPosition.distanceToSquared(
          entity.mesh!.position
        );
        if (distanceSq < searchRadiusSq && distanceSq < minDistanceSq) {
          minDistanceSq = distanceSq;
          nearest = entity;
        }
      }
    }
    return nearest;
  }
}
