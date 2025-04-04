// src/core/AIController.ts
import { Vector3, Object3D } from "three";
import { Character } from "./Character";
import type { MoveState, Observation, AIActionData } from "../types";
import { sendToGemini, getTerrainHeight } from "../utils";
import {
  INTERACTION_DISTANCE,
  API_CALL_COOLDOWN,
  AI_ACTION_TIMER_BASE,
  AI_ACTION_TIMER_RANDOM,
  DEFAULT_GATHER_TIME,
  DEFAULT_RESPAWN_TIME,
} from "../config";

export class AIController {
  character: Character;
  aiState: string = "idle"; // e.g., idle, roaming, movingToTarget, movingToResource, gathering, attacking, chatting
  previousAiState: string = "idle";
  homePosition: Vector3; // Position to return to or roam around
  destination: Vector3 | null = null; // Target position for roaming or moving
  targetResource: Object3D | null = null; // Target object for gathering
  target: Character | null = null; // Target character for interaction/attack
  targetAction: AIActionData["action"] | null = null; // Specific action planned for the target ('chat', 'attack', 'heal')
  message: string | null = null; // Message content for 'chat' action

  gatherTimer: number = 0; // Time elapsed gathering (in ms)
  gatherDuration: number = 0; // Total time needed for current gather (in ms)
  actionTimer: number; // Timer for triggering proactive decisions
  interactionDistance: number = INTERACTION_DISTANCE;
  searchRadius: number; // How far the AI 'sees'
  roamRadius: number; // How far the AI wanders from home
  persona: string = ""; // Description of the AI's personality/role
  currentIntent: string = ""; // The AI's current goal/reasoning (from API)

  observation: Observation | null = null; // Current snapshot of the AI's surroundings
  private lastObservation: Observation | null = null; // Previous observation for change detection
  private lastApiCallTime: number = 0;
  private apiCallCooldown: number = API_CALL_COOLDOWN; // Minimum time between API calls (ms)

  constructor(character: Character) {
    this.character = character;
    this.homePosition = character.mesh!.position.clone();
    this.searchRadius = character.searchRadius;
    this.roamRadius = character.roamRadius;
    this.persona = character.persona || "A generic villager."; // Use character's persona or default
    this.actionTimer =
      AI_ACTION_TIMER_BASE + Math.random() * AI_ACTION_TIMER_RANDOM; // Initial random timer
  }

  // Computes the MoveState for the character based on the current AI state.
  computeAIMoveState(deltaTime: number): MoveState {
    const moveState: MoveState = {
      forward: 0,
      right: 0,
      jump: false,
      sprint: false,
      interact: false, // AI doesn't use interact button directly
      attack: false, // Attack triggered by state/action, not direct input
    };

    // Update observation before making decisions
    if (this.character.game) {
      this.updateObservation(this.character.game.entities);
    }

    // --- State Machine Logic ---
    switch (this.aiState) {
      case "idle":
        this.actionTimer -= deltaTime;
        const canCallApi =
          Date.now() - this.lastApiCallTime >= this.apiCallCooldown;
        // Decide next action if timer runs out, something significant changed, or just finished another action
        if (
          canCallApi &&
          (this.actionTimer <= 0 ||
            this.significantObservationChange() ||
            this.justCompletedAction())
        ) {
          this.decideNextAction(); // Asynchronous call to Gemini
          this.lastApiCallTime = Date.now();
          this.actionTimer =
            AI_ACTION_TIMER_BASE + Math.random() * AI_ACTION_TIMER_RANDOM; // Reset timer
        }
        // Ensure character plays idle animation if truly idle
        if (
          this.character.currentActionName !== "idle" &&
          !this.character.isPerformingAction
        ) {
          this.character.switchAction("idle");
        }
        break;

      case "roaming":
      case "movingToTarget":
      case "movingToResource":
        let targetPos: Vector3 | null = null;
        let stopDistance = 0.5; // Default stop distance for roaming

        if (this.aiState === "roaming" && this.destination) {
          targetPos = this.destination;
        } else if (this.aiState === "movingToTarget" && this.target?.mesh) {
          targetPos = this.target.mesh.position;
          stopDistance = this.interactionDistance * 0.9; // Stop slightly before interaction range
        } else if (this.aiState === "movingToResource" && this.targetResource) {
          targetPos = this.targetResource.position;
          stopDistance = this.interactionDistance * 0.9; // Stop slightly before interaction range
        }

        if (targetPos) {
          const direction = targetPos
            .clone()
            .sub(this.character.mesh!.position);
          direction.y = 0; // Move horizontally
          const distance = direction.length();

          if (distance > stopDistance) {
            // Move towards target
            direction.normalize();
            // Look towards movement direction (or target position if close enough?)
            this.character.lookAt(
              this.character.mesh!.position.clone().add(direction)
            );
            moveState.forward = 1; // Move forward
            // Optionally sprint if target is far?
            // moveState.sprint = distance > this.roamRadius * 0.5;
          } else {
            // Reached destination or target
            this.handleArrival();
          }
        } else {
          // Target position became invalid, revert to idle
          console.warn(
            `${this.character.name}: Target position lost in state ${this.aiState}. Reverting to idle.`
          );
          this.resetActionState();
        }
        break;

      case "gathering":
        // Face the resource while gathering
        if (this.targetResource) {
          this.character.lookAt(this.targetResource.position);
        }
        // Timer logic
        this.gatherTimer += deltaTime * 1000; // Increment timer in milliseconds
        if (this.gatherTimer >= this.gatherDuration) {
          this.completeGathering();
        }
        // Animation is handled by Character.updateAnimations based on isGathering flag
        break;

      case "attacking":
        // Logic for continuous attack state if needed (e.g., melee combat loop)
        // For now, attack is triggered as a one-off action via 'movingToTarget' arrival
        // or potentially a dedicated combat state.
        if (this.target && !this.target.isDead) {
          this.character.lookAt(this.target.mesh!.position);
          // Trigger attack animation periodically or based on cooldown
          if (!this.character.isPerformingAction) {
            this.character.triggerAction("attack");
            // Actual damage dealt in Character.performAttack after animation
          }
        } else {
          // Target died or lost, revert to idle
          this.resetActionState();
        }
        break;

      case "chatting":
        // AI is currently in a chat state (likely initiated by player)
        // Face the player during chat
        if (this.target instanceof Character) {
          this.character.lookAt(this.target.mesh!.position);
        }
        // AI doesn't actively *do* anything here, just waits.
        // State might be changed externally (e.g., player ends chat) or by API response if AI initiates.
        // For now, assume player interaction drives chat state changes.
        break;

      case "dead":
        // Do nothing if dead
        break;

      default:
        console.warn(
          `${this.character.name}: Unknown AI state: ${this.aiState}`
        );
        this.aiState = "idle";
        break;
    }

    // Minimal logging for state changes if needed for debugging
    if (this.aiState !== this.previousAiState) {
      // console.log(`${this.character.name} state: ${this.previousAiState} -> ${this.aiState} (Intent: ${this.currentIntent})`);
      this.previousAiState = this.aiState;
    }

    return moveState;
  }

  // Handles logic when the AI reaches its movement destination.
  private handleArrival(): void {
    if (this.aiState === "movingToResource" && this.targetResource) {
      // Arrived at resource, start gathering
      this.aiState = "gathering";
      this.gatherTimer = 0;
      // Use gatherTime from resource userData or default
      this.gatherDuration =
        (this.targetResource.userData.gatherTime as number) ||
        DEFAULT_GATHER_TIME;
      this.character.isGathering = true;
      this.character.triggerAction("gather"); // Start gather animation/state
    } else if (
      this.aiState === "movingToTarget" &&
      this.target &&
      this.targetAction
    ) {
      // Arrived at character target, perform planned action
      this.character.lookAt(this.target.mesh!.position); // Ensure facing target
      this.performTargetAction();
    } else if (this.aiState === "roaming") {
      // Finished roaming to a point, become idle
      this.resetActionState(); // Resets destination, target, etc.
    } else {
      // Arrived but state is unexpected, revert to idle
      this.resetActionState();
    }
  }

  // Performs the action decided by the API upon reaching the target character.
  performTargetAction(): void {
    if (!this.target || !this.targetAction) {
      this.resetActionState(); // Invalid state, go idle
      return;
    }

    switch (this.targetAction) {
      case "chat":
        // AI initiates chat (shows bubble, logs event)
        if (this.message) {
          this.character.showTemporaryMessage(this.message); // Show thought/speech bubble
          this.character.game?.logEvent(
            this.character,
            "chat",
            `${this.character.name} said "${this.message}" to ${this.target.name}.`,
            this.target,
            { message: this.message },
            this.character.mesh!.position
          );
          // Potentially change state to 'chatting' to wait for response?
          this.aiState = "chatting"; // Wait after speaking
          // Reset action details but keep target and state
          this.targetAction = null;
          this.message = null;
          // Set a timer to revert to idle if no interaction happens?
          // setTimeout(() => { if (this.aiState === 'chatting') this.resetActionState(); }, 15000);
        } else {
          this.resetActionState(); // No message, go idle
        }
        break;
      case "attack":
        // Initiate attack state/action
        this.aiState = "attacking"; // Enter continuous attack state
        // First attack triggered immediately
        if (!this.character.isPerformingAction) {
          this.character.triggerAction("attack");
        }
        // Reset action details but keep target
        this.targetAction = null;
        this.message = null;
        break;
      case "heal":
        // Perform heal action on target (if target needs it)
        if (
          this.target instanceof Character &&
          this.target.health < this.target.maxHealth
        ) {
          // For now, AI heals self as an example, needs target healing logic
          console.log(
            `${this.character.name} intends to heal ${this.target.name} (Not Implemented - Healing Self Instead)`
          );
          this.character.selfHeal(); // Placeholder: AI heals itself
          // TODO: Implement target healing effect/animation trigger
          // this.character.triggerAction("heal"); // Animation triggers heal effect
        }
        this.resetActionState(); // Go idle after attempting heal
        break;
      default:
        console.warn(
          `${this.character.name}: Unknown target action ${this.targetAction}`
        );
        this.resetActionState();
        break;
    }
    // Don't reset state immediately for 'chat' or 'attack' as they transition to new states.
    // Reset happens within those states if target becomes invalid or action completes.
  }

  // Completes the gathering action, adds item to inventory, handles depletion.
  completeGathering(): void {
    if (
      !this.targetResource ||
      !this.character.inventory ||
      !this.character.game
    ) {
      this.resetGatherState();
      return;
    }

    const resourceName = this.targetResource.userData.resource as string;
    const targetId = this.targetResource.userData.id as string;

    if (resourceName) {
      if (this.character.inventory.addItem(resourceName, 1)) {
        // Successfully added item
        this.character.game.logEvent(
          this.character,
          "gather_complete",
          `${this.character.name} gathered 1 ${resourceName}.`,
          targetId, // Log target object ID
          { resource: resourceName },
          this.character.mesh!.position
        );

        // Handle depletion and respawn
        if (this.targetResource.userData.isDepletable) {
          this.targetResource.visible = false;
          this.targetResource.userData.isInteractable = false;
          const respawnTime =
            (this.targetResource.userData.respawnTime as number) ||
            DEFAULT_RESPAWN_TIME;
          const resourceToRespawn = this.targetResource; // Closure to capture the correct object

          setTimeout(() => {
            // Check if the object still exists and has userData before respawning
            if (resourceToRespawn?.userData) {
              resourceToRespawn.visible = true;
              resourceToRespawn.userData.isInteractable = true;
              // Optional: Log respawn event
              // this.character.game?.logEvent('System', 'respawn_object', `${resourceName} (${targetId}) respawned.`, undefined, { resource: resourceName }, resourceToRespawn.position);
            }
          }, respawnTime);
        }
      } else {
        // Inventory full
        this.character.game.logEvent(
          this.character,
          "gather_fail",
          `Inventory full, could not gather ${resourceName}.`,
          targetId,
          { resource: resourceName },
          this.character.mesh!.position
        );
        // AI might need to react to full inventory (e.g., go store items) - future enhancement
      }
    } else {
      console.warn(
        `${this.character.name} tried to gather from object ${targetId} with no resource defined.`
      );
    }

    this.resetGatherState();
  }

  // Resets the gathering-related state variables.
  private resetGatherState(): void {
    this.character.isGathering = false;
    this.gatherTimer = 0;
    this.gatherDuration = 0;
    this.targetResource = null; // Clear target resource
    this.resetActionState(); // Go back to idle decision making
  }

  // Resets the AI's current action, target, and destination. Sets state to idle.
  resetActionState(): void {
    this.aiState = "idle";
    this.target = null;
    this.targetAction = null;
    this.message = null;
    this.targetResource = null;
    this.destination = null;
    this.currentIntent = ""; // Clear intent until next decision
    this.character.setPersistentIntent(this.currentIntent); // Update display
    // Ensure character stops gathering/performing actions if reset happens abruptly
    if (this.character.isGathering) {
      this.character.isGathering = false;
      // May need to explicitly stop gather animation if reset happens mid-gather
      const gatherAnim =
        this.character.animations.gather || this.character.animations.attack;
      if (gatherAnim?.isRunning()) {
        gatherAnim.stop();
      }
    }
    if (this.character.isPerformingAction) {
      this.character.isPerformingAction = false;
      // May need to stop attack/heal/jump animation
    }
    // Ensure character goes back to idle animation if needed
    if (
      this.character.currentActionName !== "idle" &&
      !this.character.isPerformingAction
    ) {
      this.character.switchAction("idle");
    }
  }

  // Checks if the AI just finished an action and returned to idle.
  private justCompletedAction(): boolean {
    // True if the previous state was *not* idle/roaming and the current state *is* idle
    return (
      !["idle", "roaming"].includes(this.previousAiState) &&
      this.aiState === "idle"
    );
  }

  // Checks if there were significant changes in the observation since the last check.
  private significantObservationChange(): boolean {
    if (!this.observation || !this.lastObservation) return false;

    // Did the number of nearby characters change?
    if (
      this.observation.nearbyCharacters.length !==
      this.lastObservation.nearbyCharacters.length
    )
      return true;

    // Did a nearby character's health change significantly or did they die/respawn?
    for (const char of this.observation.nearbyCharacters) {
      const lastChar = this.lastObservation.nearbyCharacters.find(
        (c) => c.id === char.id
      );
      if (
        !lastChar ||
        lastChar.isDead !== char.isDead ||
        Math.abs(lastChar.health - char.health) > 10
      ) {
        return true;
      }
    }
    // Did the number of interactable objects change? (e.g., resource depleted/respawned)
    if (
      this.observation.nearbyObjects.length !==
      this.lastObservation.nearbyObjects.length
    )
      return true;
    // Could add more checks: player entered/left radius, specific events occurred, etc.

    return false;
  }

  // Updates the AI's observation of the environment.
  updateObservation(allEntities: Array<any>): void {
    // Store the previous observation (deep copy if complex)
    this.lastObservation = this.observation
      ? JSON.parse(JSON.stringify(this.observation))
      : null;

    const nearbyCharacters: Observation["nearbyCharacters"] = [];
    const nearbyObjects: Observation["nearbyObjects"] = [];
    const selfPosition = this.character.mesh!.position;
    const searchRadiusSq = this.searchRadius * this.searchRadius;

    // Self observation
    const self: Observation["self"] = {
      id: this.character.id,
      position: selfPosition.clone(),
      health: this.character.health,
      isDead: this.character.isDead,
      currentAction: this.aiState, // Report current AI state
    };

    // Observe other entities
    for (const entity of allEntities) {
      if (entity === this.character || !entity?.mesh?.parent) continue; // Skip self, ensure entity is in scene

      const entityMesh = entity.mesh as Object3D; // Assume mesh exists if passed checks
      const entityPosition = entityMesh.position;
      const distanceSq = selfPosition.distanceToSquared(entityPosition);

      if (distanceSq > searchRadiusSq) continue; // Skip entities outside search radius

      // Observe Characters
      if (entity instanceof Character) {
        nearbyCharacters.push({
          id: entity.id,
          position: entityPosition.clone(),
          health: entity.health,
          isDead: entity.isDead,
          currentAction:
            entity.aiController?.aiState ||
            (entity.userData.isPlayer
              ? "player_controlled"
              : entity.currentActionName || "unknown"),
        });
      }
      // Observe Interactable Objects (simple or complex)
      else if (entity.userData?.isInteractable && entity.visible) {
        // Use entity's name or a default type
        const type =
          entity.name ||
          (entity.userData.resource
            ? `${entity.userData.resource}_node`
            : "interactable_object");
        nearbyObjects.push({
          id: entity.userData.id || entity.uuid, // Use custom ID or UUID
          type: type,
          position: entityPosition.clone(),
          isInteractable: entity.userData.isInteractable, // Reflect current interactability
          resource: entity.userData.resource,
        });
      }
    }

    // Update the main observation object
    this.observation = {
      timestamp: Date.now(),
      self,
      nearbyCharacters,
      nearbyObjects,
    };
  }

  // Generates the prompt string for the Gemini API call.
  generatePrompt(): string {
    if (!this.observation) return "Error: No observation data.";

    const { self, nearbyCharacters, nearbyObjects } = this.observation;

    // Get recent relevant events from the character's log
    const eventLog = this.character.eventLog.entries
      .slice(-5) // Limit to last 5 events
      .map((e) => `[${e.timestamp}] ${e.message}`)
      .join("\n");

    // Format nearby characters, ensuring player is identifiable
    const nearbyCharsDesc =
      nearbyCharacters.length > 0
        ? nearbyCharacters
            .map(
              (c) =>
                `- ${c.id.startsWith("Player") ? "Player" : c.id} (${c.id}) at (${c.position.x.toFixed(1)}, ${c.position.z.toFixed(1)}), health: ${c.health}, ${c.isDead ? "dead" : "alive"}, action: ${c.currentAction}`
            )
            .join("\n")
        : "None";

    // Format nearby objects
    const maxObjectsToShow = 5;
    const limitedObjects = nearbyObjects.slice(0, maxObjectsToShow);
    let nearbyObjectsDesc =
      limitedObjects.length > 0
        ? limitedObjects
            .map(
              (o) =>
                `- ${o.type} (${o.id}) at (${o.position.x.toFixed(1)}, ${o.position.z.toFixed(1)})${o.resource ? ", resource: " + o.resource : ""}${!o.isInteractable ? " (depleted)" : ""}`
            )
            .join("\n")
        : "None";
    if (nearbyObjects.length > maxObjectsToShow) {
      nearbyObjectsDesc += `\n- ... and ${nearbyObjects.length - maxObjectsToShow} more`;
    }

    // Construct the prompt
    // Added inventory summary
    const inventorySummary =
      this.character.inventory?.items
        .filter((item) => item !== null)
        .map((item) => `${item!.name}: ${item!.count}`)
        .join(", ") || "Empty";

    // Simplified instruction focusing on JSON output
    // Removed explicit mention of specific actions to let the model choose more freely based on persona/context.
    return `
Persona: You are ${this.character.name}. ${this.persona}
Current Status: Health ${self.health}/${this.character.maxHealth}. Current Action: ${self.currentAction}. Position: (${self.position.x.toFixed(1)}, ${self.position.z.toFixed(1)}). Intent: ${this.currentIntent || "None"}.
Inventory: ${inventorySummary}

Nearby Characters:
${nearbyCharsDesc}

Nearby Objects:
${nearbyObjectsDesc}

Recent Events:
${eventLog || "None"}

Based on your persona, status, surroundings, and recent events, decide your next immediate action.
Output ONLY a JSON object with the following format:
{"action": "idle|roam|gather|moveTo|attack|heal|chat", "object_id": "ID_if_gathering", "target_id": "ID_if_targeting_character", "message": "message_if_chatting", "intent": "Your brief reasoning"}

Examples:
{"action": "gather", "object_id": "Tree_1", "intent": "Need wood for crafting."}
{"action": "moveTo", "target_id": "Player_0", "intent": "Player seems nearby, let's see what they want."}
{"action": "chat", "target_id": "Farmer Giles_2", "message": "Hello Giles, how are the crops?", "intent": "Greeting Farmer Giles."}
{"action": "roam", "intent": "Exploring the area."}
{"action": "idle", "intent": "Taking a break."}

Choose the most logical action NOW. Ensure IDs exist in the nearby lists if specified. Be concise.
`.trim();
  }

  // Calls the Gemini API to decide the next action and updates the AI state.
  async decideNextAction(): Promise<void> {
    const prompt = this.generatePrompt();
    // console.log(`--- AI Prompt (${this.character.name}) ---`);
    // console.log(prompt);
    // console.log(`------------------------------------------`);

    try {
      const response = await sendToGemini(prompt);
      // console.log(`--- AI Response (${this.character.name}) ---`);
      // console.log(response);
      // console.log(`-------------------------------------------`);

      if (response) {
        try {
          // Attempt to parse the response as JSON
          const actionData: AIActionData = JSON.parse(response);
          if (actionData && actionData.action && actionData.intent) {
            this.setActionFromAPI(actionData);
          } else {
            console.error(
              `AI (${this.character.name}) - Invalid JSON structure received:`,
              response
            );
            this.fallbackToDefaultBehavior("Invalid JSON structure");
          }
        } catch (parseError) {
          // Handle cases where the response might be plain text or malformed JSON
          console.warn(
            `AI (${this.character.name}) - Failed to parse API response as JSON. Response was:`,
            response,
            `\nError:`,
            parseError
          );
          // Attempt to use the response as an 'idle' intent if it looks like text
          if (
            typeof response === "string" &&
            response.length < 100 &&
            !response.includes("{")
          ) {
            this.setActionFromAPI({
              action: "idle",
              intent: `Received text: ${response}`,
            });
          } else {
            this.fallbackToDefaultBehavior("Malformed JSON response");
          }
        }
      } else {
        console.warn(
          `AI (${this.character.name}) received null or empty response from API.`
        );
        this.fallbackToDefaultBehavior("Null API response");
      }
    } catch (error) {
      console.error(`Error querying API for ${this.character.name}:`, error);
      this.fallbackToDefaultBehavior("API query error");
    }
  }

  // Sets a fallback behavior (like roaming) if the API call fails or returns invalid data.
  fallbackToDefaultBehavior(reason: string): void {
    console.log(
      `AI (${this.character.name}) falling back to roam. Reason: ${reason}`
    );
    this.aiState = "roaming";
    const angle = Math.random() * Math.PI * 2;
    const distance = Math.random() * this.roamRadius;
    this.destination = this.homePosition
      .clone()
      .add(
        new Vector3(Math.cos(angle) * distance, 0, Math.sin(angle) * distance)
      );
    // Ensure destination is on terrain
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
    this.targetResource = null;
    this.currentIntent = "Exploring (fallback)";
    this.character.setPersistentIntent(this.currentIntent); // Update display
  }

  // Processes the action data received from the API and sets the AI's state.
  setActionFromAPI(actionData: AIActionData): void {
    const { action, object_id, target_id, message, intent } = actionData;

    // Update intent display first
    this.currentIntent = intent || "Thinking...";
    this.character.setPersistentIntent(this.currentIntent);

    // Reset previous action specifics before setting new ones
    this.destination = null;
    this.targetResource = null;
    this.target = null;
    this.targetAction = null;
    this.message = null;

    // Validate targets exist in observation if IDs are provided
    const targetCharacterExists =
      target_id &&
      this.observation?.nearbyCharacters.some(
        (c) => c.id === target_id && !c.isDead
      );
    const targetObjectExists =
      object_id &&
      this.observation?.nearbyObjects.some(
        (o) => o.id === object_id && o.isInteractable
      );

    switch (action) {
      case "idle":
        this.aiState = "idle";
        break;

      case "roam":
        this.aiState = "roaming";
        const angle = Math.random() * Math.PI * 2;
        const distance = Math.random() * this.roamRadius;
        this.destination = this.homePosition
          .clone()
          .add(
            new Vector3(
              Math.cos(angle) * distance,
              0,
              Math.sin(angle) * distance
            )
          );
        if (this.character.scene) {
          this.destination.y = getTerrainHeight(
            this.character.scene,
            this.destination.x,
            this.destination.z
          );
        }
        break;

      case "gather":
        if (object_id && targetObjectExists) {
          // Find the actual Object3D/Group in the game entities
          const targetObject = this.character.game?.entities.find(
            (e) => e.userData?.id === object_id || e.uuid === object_id
          );
          if (targetObject?.userData?.isInteractable && targetObject.visible) {
            this.targetResource = targetObject;
            this.aiState = "movingToResource";
          } else {
            console.warn(
              `AI (${this.character.name}) wanted to gather ${object_id}, but it's not interactable/visible.`
            );
            this.fallbackToDefaultBehavior(
              `Invalid gather target ${object_id}`
            );
          }
        } else {
          console.warn(
            `AI (${this.character.name}) wanted to gather, but object_id "${object_id}" is invalid or missing.`
          );
          this.fallbackToDefaultBehavior(
            `Missing/Invalid gather target ${object_id}`
          );
        }
        break;

      case "moveTo":
      case "attack":
      case "heal":
      case "chat":
        if (target_id && targetCharacterExists) {
          // Find the actual Character instance
          const targetEntity = this.character.game?.entities.find(
            (e): e is Character => e instanceof Character && e.id === target_id
          );
          if (targetEntity && !targetEntity.isDead) {
            this.target = targetEntity;
            this.targetAction = action; // Store the intended action
            this.aiState = "movingToTarget";
            if (action === "chat") {
              this.message = message || "..."; // Store message for chat
            }
          } else {
            console.warn(
              `AI (${this.character.name}) wanted to target ${target_id}, but Character instance not found or dead.`
            );
            this.fallbackToDefaultBehavior(
              `Invalid character target ${target_id}`
            );
          }
        } else {
          console.warn(
            `AI (${this.character.name}) wanted to target character, but target_id "${target_id}" is invalid, missing, or dead.`
          );
          this.fallbackToDefaultBehavior(
            `Missing/Invalid character target ${target_id}`
          );
        }
        break;

      default:
        console.warn(
          `AI (${this.character.name}) received unknown action: ${action}. Intent: ${intent}`
        );
        this.fallbackToDefaultBehavior(`Unknown action ${action}`);
        break;
    }
  }
}
