///// src/ai.ts
import { Vector3, Object3D } from "three";
import { Character, Entity } from "./entities";
import { MoveState, getTerrainHeight, EventEntry } from "./ultils";
import type { Game } from "./main";

// Define both API keys
const API_KEY1 = import.meta.env.VITE_API_KEY1;
const API_KEY2 = import.meta.env.VITE_API_KEY2;
let switched = false;

// Store the current API key and URL globally, with ability to switch
let currentApiKey = API_KEY1 || "";
let API_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${currentApiKey}`;

// Function to switch API key
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
    console.warn(
      "API_KEY is not configured. Please set a valid API_KEY in .env file to use Gemini API."
    );
    return null;
  }

  try {
    const response = await fetch(API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        contents: [
          {
            parts: [{ text: prompt }],
          },
        ],
        generationConfig: {
          responseMimeType: "application/json",
        },
      }),
    });

    if (!response.ok) {
      if (response.status === 429 && !switched) {
        // Rate limit hit, switch key and retry once
        console.warn(`Rate limit hit (429). Switching API key...`);
        switchApiKey();
        switched = true;
      }
      console.error(`HTTP error! status: ${response.status}`);
      const errorData = await response.json();
      console.error("Error details:", errorData);
      return null;
    }

    const data = await response.json();
    if (
      data.candidates &&
      data.candidates.length > 0 &&
      data.candidates[0].content &&
      data.candidates[0].content.parts &&
      data.candidates[0].content.parts.length > 0
    ) {
      return data.candidates[0].content.parts[0].text as string;
    } else {
      console.error(
        "No text content found in the API response or unexpected format:",
        data
      );
      return null;
    }
  } catch (error) {
    console.error("Error during API call:", error);
    return JSON.stringify({
      action: "idle",
      intent: "Error fallback",
    });
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
  interactionDistance: number = 3; // Increased slightly for actions
  searchRadius: number;
  roamRadius: number;
  target: Entity | null = null;
  observation: Observation | null = null;
  persona: string = "";
  currentIntent: string = "";

  // New properties for actions
  targetAction: string | null = null; // 'chat', 'attack', 'heal'
  message: string | null = null; // For chat action

  // New properties for optimization
  private lastApiCallTime: number = 0;
  private apiCallCooldown: number = 10000; // 5 seconds minimum between API calls
  private lastObservation: Observation | null = null; // To track changes

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

    // Update observation every frame to detect changes
    if (this.character.game) {
      this.updateObservation(this.character.game.entities);
    }

    switch (this.aiState) {
      case "idle":
        const currentTime = Date.now();
        const timeSinceLastCall = currentTime - this.lastApiCallTime;
        const canCallApi = timeSinceLastCall >= this.apiCallCooldown;

        // --- Reactivity Check (Happens frequently while idle) ---
        if (canCallApi && this.isAffectedByEntities()) {
          console.log(`AI (${this.character.name}) reacting to entity change.`);
          this.decideNextAction();
          this.lastApiCallTime = currentTime;
          this.actionTimer = 5 + Math.random() * 5; // Reset idle timer after API call
          break; // Exit idle state processing for this frame
        }

        // --- Regular Idle Timer Check ---
        this.actionTimer -= deltaTime;
        if (this.actionTimer <= 0) {
          this.actionTimer = 5 + Math.random() * 5; // Reset timer

          if (canCallApi && this.justCompletedAction()) {
            console.log(
              `AI (${this.character.name}) deciding action after completing task.`
            );
            this.decideNextAction();
            this.lastApiCallTime = currentTime;
          } else if (canCallApi) {
            console.log(
              `AI (${this.character.name}) deciding action after idle period.`
            );
            this.decideNextAction(); // Decide action even if idle
            this.lastApiCallTime = currentTime;
          } else {
            // Cooldown not met when timer expired, just roam for now
            console.log(
              `AI (${this.character.name}) falling back (cooldown) after idle period.`
            );
            this.fallbackToDefaultBehavior();
          }
        }
        break; // End of idle case

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

      // New state for moving towards a character target for an action
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
          direction.y = 0; // Ignore vertical distance for movement
          const distance = direction.length();

          if (distance > this.interactionDistance) {
            // Move towards target
            direction.normalize();
            this.character.lookAt(
              this.character.mesh!.position.clone().add(direction)
            );
            moveState.forward = 1;
          } else {
            // In range, perform the action
            this.character.lookAt(this.target.mesh.position); // Look at target before action

            if (this.targetAction === "chat" && this.message) {
              this.character.updateIntentDisplay(this.message);
              // Log the event
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
              // Chat is instant, go back to idle
              this.aiState = "idle";
              this.target = null;
              this.targetAction = null;
              this.message = null;
            } else if (this.targetAction === "attack") {
              this.character.triggerAction("attack"); // Trigger animation, actual attack happens on finish
              // Stay in this state until animation finishes? No, let animation handler reset state.
              // For now, assume action is triggered and go idle. Re-evaluation will happen.
              this.aiState = "idle";
              this.target = null;
              this.targetAction = null;
            } else if (this.targetAction === "heal") {
              if (
                this.target instanceof Character &&
                this.target.health < this.target.maxHealth
              ) {
                this.character.triggerAction("heal"); // Trigger animation, heal happens on finish
              }
              // Go idle after triggering heal attempt
              this.aiState = "idle";
              this.target = null;
              this.targetAction = null;
            } else {
              // Unknown target action, go idle
              this.aiState = "idle";
              this.target = null;
              this.targetAction = null;
              this.message = null;
            }
          }
        } else {
          // Target lost, dead, or no action defined, go idle
          this.aiState = "idle";
          this.target = null;
          this.targetAction = null;
          this.message = null;
        }
        break;
    }

    // Log state changes
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
            break; // Added movingToTarget log
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

  // Check if an action just completed
  private justCompletedAction(): boolean {
    // Consider completion if moving from an active state to idle
    return this.previousAiState !== "idle" && this.aiState === "idle";
  }

  // Check if the character is affected by other entities
  private isAffectedByEntities(): boolean {
    if (!this.observation || !this.lastObservation) return false;

    const currentCharacters = this.observation.nearbyCharacters;
    const lastCharacters = this.lastObservation.nearbyCharacters;

    // Check for new characters or significant changes
    for (const currChar of currentCharacters) {
      const matchingLastChar = lastCharacters.find((c) => c.id === currChar.id);
      if (!matchingLastChar) {
        // New character appeared
        return true;
      }
      // Check for significant state changes (e.g., health drop, action change, death)
      if (
        currChar.health < matchingLastChar.health ||
        // currChar.currentAction !== matchingLastChar.currentAction || // Action changes too frequently
        currChar.isDead !== matchingLastChar.isDead
      ) {
        return true;
      }
    }
    // Check if characters disappeared (might be less critical)
    for (const lastChar of lastCharacters) {
      if (!currentCharacters.some((c) => c.id === lastChar.id)) {
        // Character disappeared
        // return true; // Optional: react to disappearance
      }
    }

    // If no significant changes are detected, return false
    return false;
  }

  updateObservation(allEntities: Array<any>): void {
    this.lastObservation = this.observation
      ? JSON.parse(JSON.stringify(this.observation))
      : null; // Deep copy needed for comparison

    const nearbyCharacters: Observation["nearbyCharacters"] = [];
    const nearbyObjects: Observation["nearbyObjects"] = [];
    const selfPosition = this.character.mesh!.position;
    const searchRadiusSq = this.searchRadius * this.searchRadius;

    // Add self to observation
    const self: Observation["self"] = {
      id: this.character.id,
      position: selfPosition.clone(),
      health: this.character.health,
      isDead: this.character.isDead,
      currentAction: this.aiState, // Use AI state for current action
    };

    for (const entity of allEntities) {
      if (entity === this.character || entity === this.character.mesh) continue;

      const entityMesh =
        entity instanceof Entity || entity instanceof Object3D
          ? (entity as any).mesh ?? entity
          : null;
      if (!entityMesh || !entityMesh.parent) continue; // Ensure mesh exists and is in the scene

      const entityPosition = entityMesh.position;
      const distanceSq = selfPosition.distanceToSquared(entityPosition);

      if (distanceSq > searchRadiusSq) continue;

      if (entity instanceof Character) {
        nearbyCharacters.push({
          id: entity.id,
          position: entityPosition.clone(),
          health: entity.health,
          isDead: entity.isDead,
          // Use AI state if available, otherwise check if player controlled
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

  // Updated generatePrompt
  generatePrompt(): string {
    const persona = this.persona;
    const observation = this.observation;
    // Format event log to include IDs
    const eventLog = this.character.eventLog.entries
      .slice(-10)
      .map((entry) => {
        let logMessage = `[${entry.timestamp}] ${entry.message}`;

        return logMessage;
      })
      .join("\n");

    const selfState = observation?.self
      ? `- Health: ${observation.self.health}\n- Current action: ${observation.self.currentAction}`
      : "Unknown";

    let nearbyCharacters = "None";
    if (observation && observation.nearbyCharacters.length > 0) {
      nearbyCharacters = observation.nearbyCharacters
        .map(
          (c) =>
            `- ${c.id} at (${c.position.x.toFixed(1)}, ${c.position.y.toFixed(
              1
            )}, ${c.position.z.toFixed(1)}), health: ${c.health}, ${
              c.isDead ? "dead" : "alive"
            }, action: ${c.currentAction}`
        )
        .join("\n");
    }

    let nearbyObjects = "None";
    if (observation && observation.nearbyObjects.length > 0) {
      nearbyObjects = observation.nearbyObjects
        .map(
          (o) =>
            `- ${o.type} (${o.id}) at (${o.position.x.toFixed(
              1
            )}, ${o.position.y.toFixed(1)}, ${o.position.z.toFixed(1)}), ${
              o.resource ? ", resource: " + o.resource : ""
            }`
        )
        .join("\n");
    }

    // Updated prompt with new actions and response format
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

Based on this information, decide your next action. You may want to gather resources, chat with others, attack enemies, or heal allies if necessary. Imediately proceed to gather resource if player request. Respond ONLY with a valid JSON object in the following format:
{
  "action": "idle" | "roam" | "gather" | "moveTo" | "attack" | "heal" | "chat",
  "object_id": "object_id_here", // only if action is "gather", choose from nearby objects
  "target_id": "character_id_here", // only if action is "moveTo", "attack", "heal", or "chat", choose from nearby characters or "home"
  "message": "message_here", // only if action is "chat"
  "intent": "less than 5 words reason here"
}

Example - Chat:
{
  "action": "chat",
  "target_id": "Farmer Giles_1",
  "message": "Nice weather we're having!",
  "intent": "Make small talk"
}
Example - Attack:
{
  "action": "attack",
  "target_id": "Hunter Rex_2",
  "intent": "Defend territory"
}
Example - Heal:
{
  "action": "heal",
  "target_id": "Blacksmith Brynn_3",
  "intent": "Help injured ally"
}
Example - Gather:
{
  "action": "gather",
  "object_id": "Herb Plant_d8a868",
  "intent": "Need wood"
}
Example - Idle:
{
  "action": "idle",
  "intent": "Resting"
}
Choose an appropriate action based on your persona and the current situation. Ensure the target_id exists in the nearby characters list if applicable and is not dead (unless the action is something like 'examine body'). Ensure object_id exists if gathering.
`.trim();

    return prompt;
  }

  async decideNextAction(): Promise<void> {
    const prompt = this.generatePrompt();
    try {
      console.log(`AI (${this.character.name}) Prompt:`, prompt);
      const response = await sendToGemini(prompt);
      if (response) {
        try {
          // Gemini API with JSON mode should return just the JSON string
          const actionData = JSON.parse(response);
          console.log(`AI (${this.character.name}) Response:`, actionData);

          this.setActionFromAPI(actionData);
        } catch (parseError) {
          console.error(
            `Failed to parse API response as JSON:`,
            parseError,
            "\nResponse:",
            response
          );
          this.fallbackToDefaultBehavior();
        }
      } else {
        console.warn(
          `AI (${this.character.name}) received null response from API.`
        );
        this.fallbackToDefaultBehavior();
      }
    } catch (error) {
      console.error(`Error querying API for ${this.character.name}:`, error);
      this.fallbackToDefaultBehavior();
    }
  }

  fallbackToDefaultBehavior(): void {
    console.log(
      `AI (${this.character.name}) falling back to default behavior (roam).`
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

  // Updated setActionFromAPI
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

    // Reset action-specific properties
    this.destination = null;
    this.targetResource = null;
    this.target = null;
    this.targetAction = null;
    this.message = null;

    if (action === "idle") {
      this.aiState = "idle";
    } else if (action === "roam") {
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
    } else if (action === "gather" && object_id) {
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
        this.aiState = "idle";
      }
    } else if (
      (action === "moveTo" ||
        action === "attack" ||
        action === "heal" ||
        action === "chat") &&
      target_id
    ) {
      let targetPos: Vector3 | null = null;
      let targetEntity: Entity | null = null;

      if (target_id.toLowerCase() === "home") {
        targetPos = this.homePosition.clone();
      } else {
        targetEntity =
          this.character.game?.entities.find((e) => e.id === target_id) || null;
        // Ensure target exists, is nearby, and is not dead (unless action allows targeting dead)
        if (
          targetEntity &&
          targetEntity.mesh &&
          this.observation?.nearbyCharacters.some((c) => c.id === target_id) &&
          !targetEntity.isDead
        ) {
          targetPos = targetEntity.mesh.position.clone();
        } else if (targetEntity && targetEntity.isDead) {
          this.currentIntent += ` (target ${target_id} is dead)`;
          targetEntity = null; // Don't target dead entities for most actions
        } else {
          this.currentIntent += `(couldn't find valid target ${target_id})`;
          console.warn(`couldn't find valid target ${target_id}`);
          targetEntity = null; // Target not valid
        }
      }

      if (targetPos) {
        this.destination = targetPos;
        if (this.character.scene) {
          // Adjust Y for terrain height if moving to a position, not an entity
          if (!targetEntity) {
            this.destination.y = getTerrainHeight(
              this.character.scene,
              this.destination.x,
              this.destination.z
            );
          }
        }

        if (action === "moveTo") {
          this.aiState = "roaming"; // Just moving to a location/entity
        } else if (targetEntity) {
          // Only set action states if we have a valid entity target
          this.aiState = "movingToTarget";
          this.target = targetEntity;
          this.targetAction = action;
          if (action === "chat") {
            this.message = message || "..."; // Use provided message or default
          }
        } else {
          // Target position valid, but entity invalid for action, just move there
          this.aiState = "roaming";
        }
      } else {
        // No valid target position found
        this.currentIntent += ` (invalid target ${target_id})`;
        this.aiState = "idle";
      }
    } else {
      console.log(
        `AI (${this.character.name}) action not recognized or missing parameters: "${action}", defaulting to idle.`
      );
      this.aiState = "idle";
    }

    // Log the decided action
    if (this.character.game) {
      let actionMessage = "";
      if (action === "idle") actionMessage = "idle";
      else if (action === "roam") actionMessage = "roam";
      else if (action === "gather" && object_id)
        actionMessage = `gather from ${object_id}`;
      else if (action === "moveTo" && target_id)
        actionMessage = `move to ${target_id}`;
      else if (action === "attack" && target_id)
        actionMessage = `attack ${target_id}`;
      else if (action === "heal" && target_id)
        actionMessage = `heal ${target_id}`;
      else if (action === "chat" && target_id)
        actionMessage = `chat with ${target_id}`;
      else actionMessage = action; // Fallback

      const messageLog = `${this.character.name} decided to ${actionMessage} because: ${intent}`;
      this.character.game.logEvent(
        this.character,
        "decide_action",
        messageLog,
        this.target || undefined, // Log the entity target if available
        { action, object_id, target_id, message, intent },
        this.character.mesh!.position
      );
    }
  }
}
