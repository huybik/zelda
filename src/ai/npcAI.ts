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
  // Updated persistentAction to support both targetType and targetId
  persistentAction: {
    type: string;
    targetType?: string;
    targetId?: string;
  } | null = null;
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
      interact: false,
      attack: false,
    };

    if (this.character.game) {
      updateObservation(this, this.character.game.entities);
    }

    if (this.isAffectedByEntities()) {
      this.decideNextAction();
      this.actionTimer = 5 + Math.random() * 5;
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
        break;

      case "idle":
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
              : this.target.position;
          const isTargetResource = !(this.target instanceof Entity);
          const isTargetEntityDead =
            this.target instanceof Entity && this.target.isDead;
          const isTargetResourceDepleted =
            isTargetResource &&
            (this.target instanceof Object3D
              ? !this.target.visible || !this.target.userData.isInteractable
              : false);

          if (isTargetEntityDead || isTargetResourceDepleted) {
            this.handleTargetLostOrDepleted();
            break;
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
            direction.normalize();
            this.character.lookAt(
              this.character.mesh!.position.clone().add(direction)
            );
            moveState.forward = 1;
            moveState.attack = false;
          } else {
            this.character.lookAt(targetPosition);
            moveState.forward = 0;

            if (this.targetAction === "attack") {
              moveState.attack = true;

              const targetStillValid =
                this.target instanceof Entity
                  ? !this.target.isDead
                  : this.target.visible && this.target.userData.isInteractable;

              if (!targetStillValid || distance > this.searchRadius) {
                this.handleTargetLostOrDepleted();
                moveState.attack = false;
              }
            } else if (
              this.targetAction === "chat" &&
              this.message &&
              this.chatDecisionTimer === null &&
              this.target instanceof Character
            ) {
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

              this.aiState = "idle";
              this.target = null;
              this.targetAction = null;
              this.message = null;
            }
          }
        } else {
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

  private handleTargetLostOrDepleted(): void {
    if (this.persistentAction?.type === "attack") {
      if (this.persistentAction.targetId) {
        // Handle specific character target by ID
        const targetEntity = this.character.game?.entities.find(
          (e) => e.id === this.persistentAction?.targetId && !e.isDead
        );
        if (
          targetEntity &&
          this.character.mesh!.position.distanceTo(
            targetEntity.mesh!.position
          ) < this.searchRadius
        ) {
          this.target = targetEntity;
          this.aiState = "movingToTarget"; // Explicitly set to ensure state consistency
        } else {
          this.persistentAction = null;
          this.aiState = "idle";
          this.target = null;
          this.targetAction = null;
        }
      } else if (this.persistentAction.targetType) {
        // Handle target types (resources or animals)
        let nextTarget: Entity | Object3D | null = null;
        const targetType = this.persistentAction.targetType;

        if (["wood", "stone", "herb"].includes(targetType)) {
          nextTarget = this.findNearestResource(targetType);
        } else {
          nextTarget = this.findNearestAnimal(targetType);
        }

        if (nextTarget) {
          this.target = nextTarget;
          this.aiState = "movingToTarget"; // Explicitly set to ensure state consistency
        } else {
          this.persistentAction = null;
          this.aiState = "idle";
          this.target = null;
          this.targetAction = null;
        }
      } else {
        this.persistentAction = null;
        this.aiState = "idle";
        this.target = null;
        this.targetAction = null;
      }
    } else {
      this.aiState = "idle";
      this.target = null;
      this.targetAction = null;
      this.message = null;
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
    const affectedCooldown = 5000;

    if (currentTime < this.lastAffectedTime + affectedCooldown) {
      return false;
    }

    if (!this.observation || !this.lastObservation) return false;

    if (this.observation.self.health < this.lastObservation.self.health) {
      this.lastAffectedTime = currentTime;
      return true;
    }

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

    this.actionTimer = 5 + Math.random() * 5;

    if (action === "attack" && target_id) {
      let foundTarget: Entity | Object3D | null = null;

      foundTarget =
        this.character.game?.entities.find((e) => e.id === target_id) ?? null;

      if (!foundTarget) {
        foundTarget =
          this.character.scene?.children.find(
            (child) =>
              child.userData.id === target_id &&
              child.userData.isInteractable &&
              child.visible
          ) ?? null;
      }

      if (foundTarget) {
        if (foundTarget instanceof Character) {
          // Set persistent action for specific character ID
          this.persistentAction = { type: "attack", targetId: foundTarget.id };
          this.target = foundTarget;
          this.targetAction = "attack";
          this.aiState = "movingToTarget";
        } else {
          // Handle resources and animals with targetType
          let targetType: string | null = null;
          if (foundTarget instanceof Animal) {
            targetType = foundTarget.animalType;
          } else if (
            foundTarget instanceof Object3D &&
            foundTarget.userData.resource
          ) {
            targetType = foundTarget.userData.resource;
          }

          if (targetType) {
            this.persistentAction = { type: "attack", targetType };
            const nearestTarget = ["wood", "stone", "herb"].includes(targetType)
              ? this.findNearestResource(targetType)
              : this.findNearestAnimal(targetType);
            if (nearestTarget) {
              this.target = nearestTarget;
              this.targetAction = "attack";
              this.aiState = "movingToTarget";
            } else {
              this.handleTargetLostOrDepleted();
            }
          } else {
            this.target = foundTarget;
            this.targetAction = "attack";
            this.aiState = "movingToTarget";
          }
        }
      } else {
        this.handleTargetLostOrDepleted();
      }
    } else if (action === "chat" && target_id) {
      const targetEntity = this.character.game?.entities.find(
        (e) => e.id === target_id && e instanceof Character && !e.isDead
      );
      if (targetEntity) {
        this.target = targetEntity;
        this.targetAction = "chat";
        this.message = message || "...";
        this.aiState = "movingToTarget";
      } else {
        this.handleTargetLostOrDepleted();
      }
    } else {
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
        child.userData.isInteractable &&
        child.userData.resource === resourceType &&
        child.visible &&
        child.userData.health > 0
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
        entity.animalType === animalType &&
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
