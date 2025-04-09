// File: /src/entities/ai.ts
import { Vector3, Object3D } from "three";
import { Entity } from "../entities/entitiy";
import { Character } from "../entities/character";
import { MoveState, getTerrainHeight } from "../core/utils";

const API_KEY1 = import.meta.env.VITE_API_KEY1;
const API_KEY2 = import.meta.env.VITE_API_KEY2;
let switched = false;

let currentApiKey = API_KEY1 || "";
let API_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${currentApiKey}`;

function switchApiKey(): void {
  if (currentApiKey === API_KEY1) {
    currentApiKey = API_KEY2;
    console.log("Switched to VITE_API_KEY2 due to rate limit.");
  } else if (currentApiKey === API_KEY2) {
    currentApiKey = API_KEY1;
    console.log("Switched back to VITE_API_KEY1.");
  } else {
    console.warn("No alternate API key available for rotation.");
  }
  API_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${currentApiKey}`;
}

export async function sendToGemini(prompt: string): Promise<string | null> {
  if (!currentApiKey) {
    console.warn("API_KEY is not configured.");
    return null;
  }
  try {
    const response = await fetch(API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { responseMimeType: "application/json" },
      }),
    });
    if (!response.ok) {
      if (response.status === 429 && !switched) {
        console.warn(`Rate limit hit (429). Switching API key...`);
        switchApiKey();
        switched = true;
      }
      console.error(`HTTP error! status: ${response.status}`);
      return null;
    }
    const data = await response.json();
    return data.candidates?.[0]?.content?.parts?.[0]?.text || null;
  } catch (error) {
    console.error("Error during API call:", error);
    return JSON.stringify({ action: "idle", intent: "Error fallback" });
  }
}

export interface Observation {
  timestamp: number;
  self: {
    id: string;
    position: Vector3;
    health: number;
    isDead: boolean;
    currentAction: string;
  };
  nearbyCharacters: Array<{
    id: string;
    position: Vector3;
    health: number;
    isDead: boolean;
    currentAction: string;
  }>;
  nearbyObjects: Array<{
    id: string;
    type: string;
    position: Vector3;
    isInteractable: boolean;
    resource?: string;
  }>;
}

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
  private lastObservation: Observation | null = null;

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
      this.updateObservation(this.character.game.entities);
    switch (this.aiState) {
      case "idle":
        const currentTime = Date.now();
        const timeSinceLastCall = currentTime - this.lastApiCallTime;
        const canCallApi = timeSinceLastCall >= this.apiCallCooldown;
        if (canCallApi && this.isAffectedByEntities()) {
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
          this.aiState = "idle";
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
            if (this.targetAction === "chat" && this.message) {
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
            } else if (this.targetAction === "attack") {
              this.character.triggerAction("attack");
              this.aiState = "idle";
              this.target = null;
              this.targetAction = null;
            } else {
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
    return false;
  }

  updateObservation(allEntities: Array<any>): void {
    this.lastObservation = this.observation
      ? JSON.parse(JSON.stringify(this.observation))
      : null;
    const nearbyCharacters: Observation["nearbyCharacters"] = [];
    const nearbyObjects: Observation["nearbyObjects"] = [];
    const selfPosition = this.character.mesh!.position;
    const searchRadiusSq = this.searchRadius * this.searchRadius;
    const self: Observation["self"] = {
      id: this.character.id,
      position: selfPosition.clone(),
      health: this.character.health,
      isDead: this.character.isDead,
      currentAction: this.aiState,
    };
    for (const entity of allEntities) {
      if (entity === this.character || entity === this.character.mesh) continue;
      const entityMesh =
        entity instanceof Entity || entity instanceof Object3D
          ? ((entity as any).mesh ?? entity)
          : null;
      if (!entityMesh || !entityMesh.parent) continue;
      const entityPosition = entityMesh.position;
      const distanceSq = selfPosition.distanceToSquared(entityPosition);
      if (distanceSq > searchRadiusSq) continue;
      if (entity instanceof Character) {
        nearbyCharacters.push({
          id: entity.id,
          position: entityPosition.clone(),
          health: entity.health,
          isDead: entity.isDead,
          currentAction:
            entity.aiController?.aiState ||
            (entity === this.character.game?.activeCharacter
              ? "player_controlled"
              : entity.isDead
                ? "dead"
                : "unknown"),
        });
      } else if (entity.userData?.isInteractable && entity.visible) {
        nearbyObjects.push({
          id: entity.userData.id || entity.uuid,
          type: entity.name || "unknown",
          position: entityPosition.clone(),
          isInteractable: entity.userData.isInteractable,
          resource: entity.userData.resource,
        });
      }
    }
    this.observation = {
      timestamp: Date.now(),
      self,
      nearbyCharacters,
      nearbyObjects,
    };
  }

  generatePrompt(): string {
    const persona = this.persona;
    const observation = this.observation;
    const eventLog = this.character.eventLog.entries
      .slice(-7)
      .map((entry) => `[${entry.timestamp}] ${entry.message}`)
      .join("\n");
    const selfState = observation?.self
      ? `- Health: ${observation.self.health}\n- Current action: ${observation.self.currentAction}`
      : "Unknown";
    let nearbyCharacters = observation?.nearbyCharacters.length
      ? observation.nearbyCharacters
          .map(
            (c) =>
              `- ${c.id} at (${c.position.x.toFixed(1)}, ${c.position.y.toFixed(
                1
              )}, ${c.position.z.toFixed(1)}), health: ${c.health}, ${
                c.isDead ? "dead" : "alive"
              }, action: ${c.currentAction}`
          )
          .join("\n")
      : "None";
    let nearbyObjects = "None";
    if (observation?.nearbyObjects?.length) {
      const typeCounts: Record<string, number> = {};
      const limitedObjects = observation.nearbyObjects.filter((o) => {
        const type = o.type;
        typeCounts[type] = typeCounts[type] || 0;
        if (typeCounts[type] < 3) {
          typeCounts[type]++;
          return true;
        }
        return false;
      });
      if (limitedObjects.length > 0) {
        nearbyObjects = limitedObjects
          .map(
            (o) =>
              `- ${o.type} (${o.id}) at (${o.position.x.toFixed(
                1
              )}, ${o.position.y.toFixed(1)}, ${o.position.z.toFixed(1)}${
                o.resource ? ", resource: " + o.resource : ""
              }`
          )
          .join("\n");
      }
    }
    const prompt = `
You are controlling an NPC named ${this.character.id} in a game. Here is your persona:
${persona}

Your current state:
${selfState}

Here are your recent observations:
Nearby characters:
${nearbyCharacters}

Nearby objects:
${nearbyObjects}

Here are the recent events you are aware of:
${eventLog}

Based on this information, decide your next action. Respond ONLY with a valid JSON object:
{
  "action": "gather" | "moveTo" | "attack" | "chat",
  "object_id": "object_id_here",
  "target_id": "character_id_here",
  "message": "message_here",
  "intent": "less than 5 words reason here"
}
`.trim();
    return prompt;
  }

  async decideNextAction(): Promise<void> {
    const prompt = this.generatePrompt();
    try {
      console.log(`Prompt for ${this.character.name}:\n${prompt}\n\n`);
      const response = await sendToGemini(prompt);
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
    // 'idle' and 'roam' are no longer expected from the API
    if (action === "gather" && object_id) {
      const targetObject = this.character.scene?.children.find(
        (child) =>
          child.userData.id === object_id &&
          child.userData.isInteractable &&
          child.visible
      );
      if (
        targetObject &&
        this.observation?.nearbyObjects.some((o) => o.id === object_id)
      ) {
        this.targetResource = targetObject;
        this.aiState = "movingToResource";
      } else {
        this.currentIntent += ` (couldn't find object ${object_id})`;
        this.aiState = "idle"; // Fallback to local idle if API suggests invalid gather
      }
    } else if (
      (action === "moveTo" || action === "attack" || action === "chat") &&
      target_id
    ) {
      let targetPos: Vector3 | null = null;
      let targetEntity: Entity | null = null;
      if (target_id.toLowerCase() === "home") {
        targetPos = this.homePosition.clone();
      } else {
        targetEntity =
          this.character.game?.entities.find((e) => e.id === target_id) || null;
        if (
          targetEntity &&
          targetEntity.mesh &&
          this.observation?.nearbyCharacters.some((c) => c.id === target_id) &&
          !targetEntity.isDead
        ) {
          targetPos = targetEntity.mesh.position.clone();
        } else if (targetEntity && targetEntity.isDead) {
          this.currentIntent += ` (target ${target_id} is dead)`;
          targetEntity = null;
        } else {
          this.currentIntent += `(couldn't find valid target ${target_id})`;
          targetEntity = null;
        }
      }
      if (targetPos) {
        this.destination = targetPos;
        if (this.character.scene && !targetEntity) {
          this.destination.y = getTerrainHeight(
            this.character.scene,
            this.destination.x,
            this.destination.z
          );
        }
        if (action === "moveTo") {
          this.aiState = "roaming"; // Treat API 'moveTo' as local 'roaming'
        } else if (targetEntity) {
          this.aiState = "movingToTarget";
          this.target = targetEntity;
          this.targetAction = action;
          if (action === "chat") this.message = message || "...";
        } else {
          this.aiState = "roaming"; // Fallback to local roam if target invalid for attack/chat
        }
      } else {
        this.currentIntent += ` (invalid target ${target_id})`;
        this.aiState = "idle"; // Fallback to local idle if target is invalid
      }
    } else {
      // If API returns an unknown or invalid action, default to local idle
      this.aiState = "idle";
    }
    if (this.character.game) {
      let actionMessage = "";
      if (this.aiState === "idle")
        actionMessage = "idle (fallback or API error)";
      else if (this.aiState === "roaming")
        actionMessage = `roam (moving to ${target_id || "destination"})`;
      else if (this.aiState === "movingToResource")
        actionMessage = `move to gather ${object_id}`;
      else if (
        this.aiState === "movingToTarget" &&
        this.targetAction === "attack"
      )
        actionMessage = `move to attack ${target_id}`;
      else if (
        this.aiState === "movingToTarget" &&
        this.targetAction === "chat"
      )
        actionMessage = `move to chat with ${target_id}`;
      else actionMessage = this.aiState; // Should cover 'gathering'
      const messageLog = `${this.character.name} decided to ${actionMessage} because: ${intent}`;
      this.character.game.logEvent(
        this.character,
        "decide_action",
        messageLog,
        this.target || undefined,
        { action, object_id, target_id, message, intent },
        this.character.mesh!.position
      );
    }
  }
}
