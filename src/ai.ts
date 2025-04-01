// src/ai.ts
import { Vector3, Object3D } from 'three';
import { Character, Entity, Observation } from './entities';
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


export class AIController {
  character: Character;
  aiState: string = 'idle';
  previousAiState: string = 'idle';
  homePosition: Vector3;
  roamRadius: number = 10;
  destination: Vector3 | null = null;
  targetResource: Object3D | null = null;
  gatherTimer: number = 0;
  gatherDuration: number = 0;
  actionTimer: number = 5;
  interactionDistance: number = 3;
  searchRadius: number = 120;
  target: Entity | null = null;
  observation: Observation | null = null;
  persona: string = "";
  currentIntent: string = "";

  constructor(character: Character) {
    this.character = character;
    this.homePosition = character.mesh!.position.clone();
    this.searchRadius = character.searchRadius;
    this.roamRadius = character.roamRadius;
    this.persona = character.persona;
  }

  computeAIMoveState(deltaTime: number): MoveState {
    const moveState: MoveState = { forward: 0, right: 0, jump: false, sprint: false, interact: false, attack: false };
    switch (this.aiState) {
      case 'idle':
        this.actionTimer -= deltaTime;
        if (this.actionTimer <= 0) {
          this.actionTimer = 5 + Math.random() * 5;
          const useAPI = true;
          if (useAPI && this.character.game) {
             this.decideNextAction();
          } else {
             const resources = this.character.scene!.children.filter(child =>
              child.userData.isInteractable &&
              child.userData.interactionType === 'gather' &&
              child.visible &&
              this.character.mesh!.position.distanceTo(child.position) < this.searchRadius
            );
            if (resources.length > 0) {
              this.targetResource = resources[Math.floor(Math.random() * resources.length)];
              this.aiState = 'movingToResource';
            } else {
              const angle = Math.random() * Math.PI * 2;
              const distance = Math.random() * this.roamRadius;
              this.destination = this.homePosition.clone().add(new Vector3(Math.cos(angle) * distance, 0, Math.sin(angle) * distance));
              this.destination.y = getTerrainHeight(this.character.scene!, this.destination.x, this.destination.z);
              this.aiState = 'roaming';
            }
          }
        }
        break;

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
              this.character.game.logEvent(this.character, "gather", `${this.character.name} gathered 1 ${resourceName}.`, undefined, { resource: resourceName }, this.character.mesh!.position);
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
        }
        break;
    }

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

  handleInteraction(player: Character): { type: string; text: string; state: string; options?: string[] } | null {
    this.character.lookAt(player.mesh!.position);
    const dialogue = this.getRandomIdleDialogue();
    this.aiState = 'idle';
    if (this.character.game) this.character.game.logEvent(this.character, "interact", `${this.character.name}: "${dialogue}"`, player.name, { dialogue }, this.character.mesh!.position);
    return { type: 'dialogue', text: dialogue, state: 'greeting', options: ['Switch Control'] };
  }

  getRandomIdleDialogue(): string {
    const dialogues = [
      "Nice weather today.", "Be careful out there.", "Seen any troublemakers around?",
      "The wilderness holds many secrets.", "Welcome to our village.", "Need something?",
      "Don't wander too far from the village."
    ];
    return dialogues[Math.floor(Math.random() * dialogues.length)];
  }

  updateObservation(allEntities: Array<any>): void {
    const nearbyCharacters: Observation['nearbyCharacters'] = [];
    const nearbyObjects: Observation['nearbyObjects'] = [];
    const selfPosition = this.character.mesh!.position;
    const searchRadiusSq = this.searchRadius * this.searchRadius;

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
      nearbyCharacters,
      nearbyObjects,
    };
  }

  generatePrompt(): string {
    const persona = this.persona;
    const observation = this.observation;
    const eventLog = this.character.eventLog.getFormattedEntries().slice(-5).join('\n');

    let nearbyCharacters = 'None';
    if (observation && observation.nearbyCharacters.length > 0) {
      nearbyCharacters = observation.nearbyCharacters.map(c => `- ${c.id} at (${c.position.x.toFixed(1)}, ${c.position.y.toFixed(1)}, ${c.position.z.toFixed(1)}), health: ${c.health}, ${c.isDead ? 'dead' : 'alive'}, action: ${c.currentAction}`).join('\n');
    }

    let nearbyObjects = 'None';
    if (observation && observation.nearbyObjects.length > 0) {
      nearbyObjects = observation.nearbyObjects.map(o => `- ${o.type} (${o.id}) at (${o.position.x.toFixed(1)}, ${o.position.y.toFixed(1)}, ${o.position.z.toFixed(1)}), interactable: ${o.isInteractable}${o.resource ? ', resource: ' + o.resource : ''}`).join('\n');
    }

    const prompt = `
You are controlling an NPC named ${this.character.name} in a game. Here is your persona:

${persona}

Here are your recent observations:

Nearby characters:
${nearbyCharacters}

Nearby objects:
${nearbyObjects}

Here are the recent events you are aware of:

${eventLog}

Based on this information, decide your next action. Respond with a single sentence describing your action and intent, for example: "I will go to the forest to gather wood because I need materials for my farm."
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
        this.setActionFromAPI(response);
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

  setActionFromAPI(response: string): void {
    const parts = response.split(' because ');
    const action = parts[0].trim().toLowerCase();
    this.currentIntent = parts[1] ? parts[1].trim() : 'Thinking...';

    if (action.includes('idle') || action.includes('rest') || action.includes('wait')) {
      this.aiState = 'idle';
      this.destination = null;
      this.targetResource = null;
      this.target = null;
    } else if (action.includes('roam') || action.includes('wander') || action.includes('explore') || action.includes('patrol')) {
      this.aiState = 'roaming';
      const angle = Math.random() * Math.PI * 2;
      const distance = Math.random() * this.roamRadius;
      this.destination = this.homePosition.clone().add(new Vector3(Math.cos(angle) * distance, 0, Math.sin(angle) * distance));
      if (this.character.scene) {
          this.destination.y = getTerrainHeight(this.character.scene, this.destination.x, this.destination.z);
      }
    } else if (action.includes('gather') || action.includes('collect') || action.includes('get')) {
       let resourceType: string | null = null;
       if (action.includes('wood') || action.includes('log') || action.includes('tree')) resourceType = 'wood';
       else if (action.includes('stone') || action.includes('rock')) resourceType = 'stone';
       else if (action.includes('herb') || action.includes('plant')) resourceType = 'herb';

       if (resourceType && this.character.scene) {
            const resources = this.character.scene.children.filter(child =>
                child.userData.resource === resourceType && child.visible && child.userData.isInteractable
            );
            if (resources.length > 0) {
                const nearestResource = resources.reduce((closest, res) => {
                    const dist = this.character.mesh!.position.distanceToSquared(res.position);
                    return dist < closest.dist ? { res, dist } : closest;
                }, { res: resources[0], dist: Infinity }).res;
                this.targetResource = nearestResource;
                this.aiState = 'movingToResource';
                return;
            } else {
                this.currentIntent += ` (but couldn't find any ${resourceType})`;
            }
       }
       this.aiState = 'idle';

    } else if (action.includes('go to') || action.includes('move to')) {
        // Basic location parsing - could be improved
        let targetPos: Vector3 | null = null;
        if (action.includes('home') || action.includes('village center')) {
            targetPos = this.homePosition.clone();
        } else {
             // Attempt to find a named location or character mentioned
             const targetNameMatch = action.match(/(?:go to|move to|head towards)\s+(.+)/);
             if (targetNameMatch && targetNameMatch[1]) {
                const targetName = targetNameMatch[1].trim();
                const foundTarget = this.character.game?.entities.find(e => e.name?.toLowerCase() === targetName);
                if (foundTarget && foundTarget.mesh) {
                    targetPos = foundTarget.mesh.position.clone();
                }
             }
        }

        if (targetPos) {
            this.destination = targetPos;
            if (this.character.scene) {
                 this.destination.y = getTerrainHeight(this.character.scene, this.destination.x, this.destination.z);
            }
            this.aiState = 'roaming'; // Use roaming state to move to a point
        } else {
             this.currentIntent += " (but couldn't determine destination)";
             this.aiState = 'idle';
        }

    } else {
      console.log(`AI (${this.character.name}) action not recognized: "${action}", defaulting to idle.`);
      this.aiState = 'idle';
    }
  }

}