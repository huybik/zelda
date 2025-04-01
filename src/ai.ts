///// src/ai.ts
import { Vector3, Object3D } from 'three';
import { Character, Entity } from './entities';
import { MoveState, getTerrainHeight, EventEntry } from './ultils';
import type { Game } from './main';

const API_KEY = import.meta.env.VITE_API_KEY;
const API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=' + API_KEY;

export async function sendToGemini(prompt: string): Promise<string | null> {
  if (!API_KEY) {
    console.warn('API_KEY is not configured. Please set a valid API_KEY in .env file to use Gemini API.');
    return "I will roam around because I am exploring.";
  }
  try {
    const response = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        contents: [{
          parts: [{ text: prompt }],
        }],
      }),
    });

    if (!response.ok) {
      console.error(`HTTP error! status: ${response.status}`);
      const errorData = await response.json();
      console.error("Error details:", errorData);
      return null;
    }

    const data = await response.json();
    if (data.candidates && data.candidates.length > 0 && data.candidates[0].content && data.candidates[0].content.parts && data.candidates[0].content.parts.length > 0) {
      return data.candidates[0].content.parts[0].text as string;
    }
    else {
      console.error("No text content found in the API response.");
    }
  }
  catch (error) {
        console.error("Error during API call:", error);
        return "I will roam around because I am exploring.";
  }

  return null;
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
  aiState: string = 'idle';
  previousAiState: string = 'idle';
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

  // New properties for optimization
  private lastApiCallTime: number = 0;
  private apiCallCooldown: number = 5000; // 10 seconds minimum between API calls
  private lastObservation: Observation | null = null; // To track changes

  constructor(character: Character) {
    this.character = character;
    this.homePosition = character.mesh!.position.clone();
    this.searchRadius = character.searchRadius;
    this.roamRadius = character.roamRadius;
    this.persona = character.persona;
  }

  computeAIMoveState(deltaTime: number): MoveState {
    const moveState: MoveState = { forward: 0, right: 0, jump: false, sprint: false, interact: false, attack: false };

    // Update observation every frame to detect changes
    if (this.character.game) {
      this.updateObservation(this.character.game.entities);
    }

    switch (this.aiState) {
      case 'idle':
        const currentTime = Date.now();
        const timeSinceLastCall = currentTime - this.lastApiCallTime;
        const canCallApi = timeSinceLastCall >= this.apiCallCooldown;

        // --- Reactivity Check (Happens frequently while idle) ---
        // Should we call the API due to environment changes, even if timer hasn't run out?
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

            // Should we call the API because we finished an action or just been idle?
            if (canCallApi && this.justCompletedAction()) {
                 console.log(`AI (${this.character.name}) deciding action after completing task.`);
                 this.decideNextAction();
                 this.lastApiCallTime = currentTime;
            } else if (canCallApi) {
                // Optional: Call API even if nothing changed, just because idle timer ran out
                // console.log(`AI (${this.character.name}) deciding action after idle period.`);
                // this.decideNextAction();
                // this.lastApiCallTime = currentTime;

                // Or stick to fallback if nothing triggered the API
                 console.log(`AI (${this.character.name}) falling back to default after idle period.`);
                 this.fallbackToDefaultBehavior();
            }
             else {
                // Cooldown not met when timer expired, just roam for now
                console.log(`AI (${this.character.name}) falling back (cooldown) after idle period.`);
                this.fallbackToDefaultBehavior();
            }
        }
        // If none of the above happened, remain idle.
        break; // End of idle case

      case 'roaming':
        if (this.destination) {
          const direction = this.destination.clone().sub(this.character.mesh!.position);
          direction.y = 0;
          const distance = direction.length();
          if (distance > 0.5) {
            direction.normalize();
            this.character.lookAt(this.character.mesh!.position.clone().add(direction));
            moveState.forward = 1;
          } else {
            this.aiState = 'idle';
            this.destination = null;
            // Action completed, potentially trigger API in next idle cycle
          }
        } else {
          this.aiState = 'idle';
        }
        break;

      case 'movingToResource':
        if (this.targetResource && this.targetResource.visible && this.targetResource.userData.isInteractable) {
          const direction = this.targetResource.position.clone().sub(this.character.mesh!.position);
          direction.y = 0;
          const distance = direction.length();
          if (distance > 1) {
            direction.normalize();
            this.character.lookAt(this.targetResource.position);
            moveState.forward = 1;
          } else {
            this.aiState = 'gathering';
            this.gatherTimer = 0;
            this.gatherDuration = this.targetResource.userData.gatherTime || 3000;
            this.character.isGathering = true;
          }
        } else {
          this.aiState = 'idle';
          this.targetResource = null;
        }
        break;

      case 'gathering':
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
            const respawnTime = this.targetResource.userData.respawnTime || 15000;
            const resourceToRespawn = this.targetResource;
            setTimeout(() => {
              if (resourceToRespawn && resourceToRespawn.userData) {
                resourceToRespawn.visible = true;
                resourceToRespawn.userData.isInteractable = true;
              }
            }, respawnTime);
          }
          this.targetResource = null;
          this.aiState = 'idle';
          this.character.isGathering = false;
          this.currentIntent = '';
          // Action completed, API will be considered in next idle cycle
        }
        break;
    }

    // Log state changes
    if (this.aiState !== this.previousAiState) {
      if (this.character.game) {
        let message = '';
        switch (this.aiState) {
          case 'idle': message = `${this.character.name} is now idle.`; break;
          case 'roaming': message = `${this.character.name} is roaming.`; break;
          case 'movingToResource': message = `${this.character.name} is moving to a resource.`; break;
          case 'gathering': message = `${this.character.name} started gathering.`; break;
        }
        if (message) {
          this.character.game.logEvent(this.character, this.aiState, message, undefined, {}, this.character.mesh!.position);
        }
      }
      this.previousAiState = this.aiState;
    }

    return moveState;
  }

  // Check if an action just completed
  private justCompletedAction(): boolean {
    return this.previousAiState !== 'idle' && this.aiState === 'idle';
  }

  // Check if the character is affected by other entities
  private isAffectedByEntities(): boolean {
    if (!this.observation || !this.lastObservation) return false;

    const currentCharacters = this.observation.nearbyCharacters;
    const lastCharacters = this.lastObservation.nearbyCharacters;

    // Check for new characters or significant changes
    for (const currChar of currentCharacters) {
      const matchingLastChar = lastCharacters.find(c => c.id === currChar.id);
      if (!matchingLastChar) {
        // New character appeared
        return true;
      }
      // Check for significant state changes (e.g., health drop, action change)
      if (
        currChar.health < matchingLastChar.health ||
        currChar.currentAction !== matchingLastChar.currentAction ||
        currChar.isDead !== matchingLastChar.isDead
      ) {
        return true;
      }
    }

    // If no changes are detected, return false
    return false;
  }

updateObservation(allEntities: Array<any>): void {
  this.lastObservation = this.observation ? { ...this.observation } : null;

  const nearbyCharacters: Observation['nearbyCharacters'] = [];
  const nearbyObjects: Observation['nearbyObjects'] = [];
  const selfPosition = this.character.mesh!.position;
  const searchRadiusSq = this.searchRadius * this.searchRadius;

  // Add self to observation
  const self: Observation['self'] = {
    id: this.character.id,
    position: selfPosition.clone(),
    health: this.character.health,
    isDead: this.character.isDead,
    currentAction: this.aiState,
  };

  for (const entity of allEntities) {
    if (entity === this.character || entity === this.character.mesh) continue;

    const entityMesh = (entity instanceof Entity || entity instanceof Object3D) ? (entity as any).mesh ?? entity : null;
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
        currentAction: entity.aiController?.aiState || (entity === this.character.game?.activeCharacter ? 'player_controlled' : 'unknown'),
      });
    } else if (entity.userData?.isInteractable && entity.visible) {
      nearbyObjects.push({
        id: entity.userData.id || entity.uuid,
        type: entity.name || 'unknown',
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
  // Format event log to include IDs
  const eventLog = this.character.eventLog.entries.slice(-5).map(entry => {
    let logMessage = `[${entry.timestamp}] ${entry.message}`;
    if (entry.actorId) logMessage += ` (Actor ID: ${entry.actorId})`;
    if (entry.targetId) logMessage += ` (Target ID: ${entry.targetId})`;
    return logMessage;
  }).join('\n');

  const selfState = observation?.self
    ? `- Health: ${observation.self.health}\n- Current action: ${observation.self.currentAction}`
    : 'Unknown';

  let nearbyCharacters = 'None';
  if (observation && observation.nearbyCharacters.length > 0) {
    nearbyCharacters = observation.nearbyCharacters.map(c => 
      `- ${c.id} at (${c.position.x.toFixed(1)}, ${c.position.y.toFixed(1)}, ${c.position.z.toFixed(1)}), health: ${c.health}, ${c.isDead ? 'dead' : 'alive'}, action: ${c.currentAction}`
    ).join('\n');
  }

  let nearbyObjects = 'None';
  if (observation && observation.nearbyObjects.length > 0) {
    nearbyObjects = observation.nearbyObjects.map(o => 
      `- ${o.type} (${o.id}) at (${o.position.x.toFixed(1)}, ${o.position.y.toFixed(1)}, ${o.position.z.toFixed(1)}), interactable: ${o.isInteractable}${o.resource ? ', resource: ' + o.resource : ''}`
    ).join('\n');
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

  Based on this information, decide your next action, you may want to gather resource if there's nothing to do. Respond with a JSON object in the following format:
  {
    "action": "idle" | "roam" | "gather" | "moveTo" | "attack" | "interact"},
    "object_id": "object_id_here", // only if action is "gather", choose from nearby objects
    "target_id": "character_id_here", // only if action is "moveTo", "attack" or "interact", choose from nearby characters or "home"
    "intent": "less than 5 words reason here"
  }

  For example:  
  {
    "action": "gather",
    "object_id": "tree_abc123",
    "intent": "I need wood"
  }

  Or:
  {
    "action": "moveTo",
    "target_id": "Farmer Giles_1",
    "intent": "Ask for help"
  }
  `.trim();

    return prompt;
  }

  async decideNextAction(): Promise<void> {
  const prompt = this.generatePrompt();
  try {
    console.log(`AI (${this.character.name}) Prompt:`, prompt);
    const response = await sendToGemini(prompt);
    console.log(`AI (${this.character.name}) Response:`, response);
    if (response) {
      try {
        let jsonString = response;
        if (response.includes("```json")) {
          const jsonMatch = response.match(/```json\s*([\s\S]*?)\s*```/);
          jsonString = jsonMatch && jsonMatch[1] ? jsonMatch[1].trim() : response;
        }
        const actionData = JSON.parse(jsonString);
        
        this.setActionFromAPI(actionData);
      } catch (parseError) {
        console.error(`Failed to parse API response as JSON:`, parseError);
        this.fallbackToDefaultBehavior();
      }
    } else {
      this.fallbackToDefaultBehavior();
    }
  } catch (error) {
    console.error(`Error querying API for ${this.character.name}:`, error);
    this.fallbackToDefaultBehavior();
  }
}

  fallbackToDefaultBehavior(): void {
    this.aiState = 'roaming';
    const angle = Math.random() * Math.PI * 2;
    const distance = Math.random() * this.roamRadius;
    this.destination = this.homePosition.clone().add(new Vector3(Math.cos(angle) * distance, 0, Math.sin(angle) * distance));
    if (this.character.scene) {
      this.destination.y = getTerrainHeight(this.character.scene, this.destination.x, this.destination.z);
    }
  }

  setActionFromAPI(actionData: { action: string; object_id?: string; target_id?: string; intent: string }): void {
  const { action, object_id, target_id, intent } = actionData;
  this.currentIntent = intent || 'Thinking...';

  if (action === 'idle') {
    this.aiState = 'idle';
    this.destination = null;
    this.targetResource = null;
    this.target = null;
  } else if (action === 'roam') {
    this.aiState = 'roaming';
    const angle = Math.random() * Math.PI * 2;
    const distance = Math.random() * this.roamRadius;
    this.destination = this.homePosition.clone().add(new Vector3(Math.cos(angle) * distance, 0, Math.sin(angle) * distance));
    if (this.character.scene) {
      this.destination.y = getTerrainHeight(this.character.scene, this.destination.x, this.destination.z);
    }
  } else if (action === 'gather' && object_id) {
    const targetObject = this.character.scene?.children.find(child => child.userData.id === object_id && child.userData.isInteractable && child.visible);
    if (targetObject && this.observation?.nearbyObjects.some(o => o.id === object_id)) {
      this.targetResource = targetObject;
      this.aiState = 'movingToResource';
    } else {
      this.currentIntent += ` (couldn't find object ${object_id})`;
      this.aiState = 'idle';
    }
  } else if (action === 'moveTo' && target_id) {
    let targetPos: Vector3 | null = null;
    if (target_id.toLowerCase() === 'home') {
      targetPos = this.homePosition.clone();
    } else {
      const foundTarget = this.character.game?.entities.find(e => e.id === target_id);
      if (foundTarget && foundTarget.mesh && this.observation?.nearbyCharacters.some(c => c.id === target_id)) {
        targetPos = foundTarget.mesh.position.clone();
      }
    }
    if (targetPos) {
      this.destination = targetPos;
      if (this.character.scene) {
        this.destination.y = getTerrainHeight(this.character.scene, this.destination.x, this.destination.z);
      }
      this.aiState = 'roaming';
    } else {
      this.currentIntent += ` (couldn't find target ${target_id})`;
      this.aiState = 'idle';
    }
  console.log(`AI (${this.character.name}) ${this.currentIntent} ${target_id}`);
  
  } else {
    console.log(`AI (${this.character.name}) action not recognized or missing parameters: "${action}", defaulting to idle.`);
    this.aiState = 'idle';
  }

  // Log the decided action
  if (this.character.game) {
    let actionMessage = '';
    if (action === 'idle') actionMessage = 'idle';
    else if (action === 'roam') actionMessage = 'roam';
    else if (action === 'gather' && object_id) actionMessage = `gather from ${object_id}`;
    else if (action === 'moveTo' && target_id) actionMessage = `move to ${target_id}`;
    else actionMessage = action;
    const message = `Decided to ${actionMessage} because ${intent}`;
    this.character.game.logEvent(
      this.character,
      "decide_action",
      message,
      undefined,
      { action, object_id, target_id, intent },
      this.character.mesh!.position
    );
  }
  }

}