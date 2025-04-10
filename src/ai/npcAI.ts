// File: /src/ai/npcAI.ts
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
} from "./api"; // Import from the new api file

export class AIController {
  character: Character;
  aiState: string = "idle";
  previousAiState: string = "idle";
  homePosition: Vector3;
  destination: Vector3 | null = null;
  targetResource: Object3D | null = null;
  gatherTimer: number = 0;
  gatherDuration: number = 0;
  actionTimer: number = 5;
  interactionDistance: number = 3;
  searchRadius: number;
  roamRadius: number;
  target: Entity | null = null;
  observation: Observation | null = null;
  persona: string = "";
  currentIntent: string = "";
  targetAction: string | null = null;
  message: string | null = null;
  private lastApiCallTime: number = 0;
  private apiCallCooldown: number = 20000;
  lastObservation: Observation | null = null;
  persistentAction: { type: string; targetType: string } | null = null;

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
    if (this.character.game)
      updateObservation(this, this.character.game.entities); // Use imported function
    switch (this.aiState) {
      case "idle":
        const currentTime = Date.now();
        const timeSinceLastCall = currentTime - this.lastApiCallTime;
        const canCallApi = timeSinceLastCall >= this.apiCallCooldown;
        if (this.isAffectedByEntities()) {
          this.decideNextAction();
          this.lastApiCallTime = currentTime;
          this.actionTimer = 5 + Math.random() * 5;
          break;
        }
        this.actionTimer -= deltaTime;
        if (this.actionTimer <= 0) {
          this.actionTimer = 5 + Math.random() * 5;
          if (canCallApi && this.justCompletedAction()) {
            this.decideNextAction();
            this.lastApiCallTime = currentTime;
          } else if (canCallApi) {
            this.decideNextAction();
            this.lastApiCallTime = currentTime;
          } else {
            this.fallbackToDefaultBehavior();
          }
        }
        break;
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
      case "movingToResource":
        if (
          this.targetResource &&
          this.targetResource.visible &&
          this.targetResource.userData.isInteractable
        ) {
          const direction = this.targetResource.position
            .clone()
            .sub(this.character.mesh!.position);
          direction.y = 0;
          const distance = direction.length();
          if (distance > 1) {
            direction.normalize();
            this.character.lookAt(this.targetResource.position);
            moveState.forward = 1;
          } else {
            this.aiState = "gathering";
            this.gatherTimer = 0;
            this.gatherDuration =
              this.targetResource.userData.gatherTime || 3000;
            this.character.isGathering = true;
          }
        } else {
          this.aiState = "idle";
          this.targetResource = null;
        }
        break;
      case "gathering":
        this.gatherTimer += deltaTime * 1000;
        if (this.gatherTimer >= this.gatherDuration) {
          if (this.targetResource && this.character.inventory) {
            const resourceName = this.targetResource.userData.resource;
            this.character.inventory.addItem(resourceName, 1);
            if (this.character.game) {
              this.character.game.logEvent(
                this.character,
                "gather",
                `${this.character.name} gathered 1 ${resourceName}.`,
                undefined,
                { resource: resourceName },
                this.character.mesh!.position
              );
            }
          }
          if (this.targetResource?.userData.isDepletable) {
            this.targetResource.visible = false;
            this.targetResource.userData.isInteractable = false;
            const respawnTime =
              this.targetResource.userData.respawnTime || 15000;
            const resourceToRespawn = this.targetResource;
            setTimeout(() => {
              if (resourceToRespawn && resourceToRespawn.userData) {
                resourceToRespawn.visible = true;
                resourceToRespawn.userData.isInteractable = true;
              }
            }, respawnTime);
          }
          this.targetResource = null;
          if (this.persistentAction?.type === "gather") {
            const nextResource = this.findNearestResource(
              this.persistentAction.targetType
            );
            if (nextResource) {
              this.targetResource = nextResource;
              this.aiState = "movingToResource";
            } else {
              this.persistentAction = null;
              this.aiState = "idle";
            }
          } else {
            this.aiState = "idle";
          }
          this.character.isGathering = false;
          this.currentIntent = "";
        }
        break;
      case "movingToTarget":
        if (
          this.target &&
          this.target.mesh &&
          this.targetAction &&
          !this.target.isDead
        ) {
          const direction = this.target.mesh.position
            .clone()
            .sub(this.character.mesh!.position);
          direction.y = 0;
          const distance = direction.length();
          if (distance > this.interactionDistance) {
            direction.normalize();
            this.character.lookAt(
              this.character.mesh!.position.clone().add(direction)
            );
            moveState.forward = 1;
          } else {
            this.character.lookAt(this.target.mesh.position);
            if (this.targetAction === "attack") {
              this.character.triggerAction("attack");
              if (this.target.isDead || distance > this.searchRadius) {
                if (this.persistentAction?.type === "attack") {
                  const nextTarget = this.findNearestAnimal(
                    this.persistentAction.targetType
                  );
                  if (nextTarget) {
                    this.target = nextTarget;
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
                }
              }
            } else if (this.targetAction === "chat" && this.message) {
              this.character.showTemporaryMessage(this.message);
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
    }
    if (this.aiState !== this.previousAiState) {
      if (this.character.game) {
        let message = "";
        switch (this.aiState) {
          case "idle":
            message = `${this.character.name} is now idle.`;
            break;
          case "roaming":
            message = `${this.character.name} is roaming.`;
            break;
          case "movingToResource":
            message = `${this.character.name} is moving to a resource.`;
            break;
          case "gathering":
            message = `${this.character.name} started gathering.`;
            break;
          case "movingToTarget":
            message = `${this.character.name} is moving towards ${
              this.target?.name || "target"
            } to ${this.targetAction}.`;
            break;
        }
        if (message) {
          this.character.game.logEvent(
            this.character,
            this.aiState,
            message,
            undefined,
            {},
            this.character.mesh!.position
          );
        }
      }
      this.previousAiState = this.aiState;
    }
    return moveState;
  }

  private justCompletedAction(): boolean {
    return this.previousAiState !== "idle" && this.aiState === "idle";
  }

  private isAffectedByEntities(): boolean {
    if (!this.observation || !this.lastObservation) return false;
    const currentCharacters = this.observation.nearbyCharacters;
    const lastCharacters = this.lastObservation.nearbyCharacters;
    for (const currChar of currentCharacters) {
      const matchingLastChar = lastCharacters.find((c) => c.id === currChar.id);
      if (!matchingLastChar) return true;
      if (
        currChar.health < matchingLastChar.health ||
        currChar.isDead !== matchingLastChar.isDead
      )
        return true;
    }
    const currentAnimals = this.observation.nearbyAnimals;
    const lastAnimals = this.lastObservation.nearbyAnimals;
    for (const currAnimal of currentAnimals) {
      const matchingLastAnimal = lastAnimals.find(
        (a) => a.id === currAnimal.id
      );
      if (!matchingLastAnimal) return true;
      if (
        currAnimal.health < matchingLastAnimal.health ||
        currAnimal.isDead !== matchingLastAnimal.isDead
      )
        return true;
    }
    return false;
  }

  async decideNextAction(): Promise<void> {
    const prompt = generatePrompt(this); // Use imported function
    try {
      console.log(`Prompt for ${this.character.name}:\n${prompt}\n\n`);
      const response = await sendToGemini(prompt); // Use imported function
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
    object_id?: string;
    target_id?: string;
    message?: string;
    intent: string;
  }): void {
    const { action, object_id, target_id, message, intent } = actionData;
    this.currentIntent = intent || "Thinking...";
    this.character.updateIntentDisplay(`${this.currentIntent}`);
    this.destination = null;
    this.targetResource = null;
    this.target = null;
    this.targetAction = null;
    this.message = null;
    this.persistentAction = null;

    if (action === "gather" && object_id) {
      const targetObject = this.character.scene?.children.find(
        (child) =>
          child.userData.id === object_id &&
          child.userData.isInteractable &&
          child.visible
      );
      if (targetObject) {
        const resourceType = targetObject.userData.resource;
        if (resourceType) {
          this.persistentAction = { type: "gather", targetType: resourceType };
          const nearestResource = this.findNearestResource(resourceType);
          if (nearestResource) {
            this.targetResource = nearestResource;
            this.aiState = "movingToResource";
          } else {
            this.aiState = "idle";
          }
        } else {
          this.aiState = "idle";
        }
      } else {
        this.aiState = "idle";
      }
    } else if (action === "attack" && target_id) {
      const targetEntity = this.character.game?.entities.find(
        (e) => e.id === target_id
      );
      if (targetEntity && targetEntity.mesh && !targetEntity.isDead) {
        if (
          targetEntity instanceof Animal &&
          targetEntity.userData.animalType
        ) {
          const animalType = String(targetEntity.userData.animalType);
          this.persistentAction = { type: "attack", targetType: animalType };
          const nearestTarget = this.findNearestAnimal(animalType);
          if (nearestTarget) {
            this.target = nearestTarget;
            this.targetAction = "attack";
            this.aiState = "movingToTarget";
          } else {
            this.aiState = "idle";
          }
        } else {
          this.target = targetEntity;
          this.targetAction = "attack";
          this.aiState = "movingToTarget";
        }
      } else {
        this.aiState = "idle";
      }
    } else if (action === "chat" && target_id) {
      const targetEntity = this.character.game?.entities.find(
        (e) => e.id === target_id
      );
      if (targetEntity && targetEntity.mesh && !targetEntity.isDead) {
        this.target = targetEntity;
        this.targetAction = "chat";
        this.message = message || "...";
        this.aiState = "movingToTarget";
      } else {
        this.aiState = "idle";
      }
    } else if (action === "moveTo" && target_id) {
      let targetPos: Vector3 | null = null;
      if (target_id.toLowerCase() === "home") {
        targetPos = this.homePosition.clone();
      }
      if (targetPos) {
        this.destination = targetPos;
        if (this.character.scene) {
          this.destination.y = getTerrainHeight(
            this.character.scene,
            this.destination.x,
            this.destination.z
          );
        }
        this.aiState = "roaming";
      } else {
        this.aiState = "idle";
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
        child.visible
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
        entity.userData.animalType === animalType &&
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
