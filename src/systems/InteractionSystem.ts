// src/systems/InteractionSystem.ts
import {
  PerspectiveCamera,
  Raycaster,
  Vector3,
  Vector2,
  Object3D,
} from "three";
import { Character } from "../core/Character";
import type { Inventory } from "../core/Inventory";
import type { EventLog } from "../core/EventLog";
import type { Controls } from "./Controls";
import type { Game } from "../Game"; // Use type import
import type {
  TargetInfo,
  ActiveGather,
  InteractionResult,
} from "../types";
import {
  INTERACTION_DISTANCE,
  INTERACTION_AIM_TOLERANCE,
  DEFAULT_GATHER_TIME,
  DEFAULT_RESPAWN_TIME,
} from "../config";
import { sendToGemini } from "../utils"; // For chat

export class InteractionSystem {
  player: Character; // The currently controlled player character
  camera: PerspectiveCamera;
  interactableEntities: Array<any>; // All potentially interactable entities/objects
  controls: Controls;
  inventory: Inventory; // Reference to the *active* player's inventory
  eventLog: EventLog; // Reference to the *active* player's event log
  game: Game;

  // Raycasting for targeting
  raycaster: Raycaster;
  interactionDistance: number = INTERACTION_DISTANCE;
  aimTolerance: number = INTERACTION_AIM_TOLERANCE; // Angle tolerance for raycast targeting

  // Interaction state
  currentTarget: any | null = null; // The entity/object currently targeted
  interactionPromptElement: HTMLElement | null;
  activeGather: ActiveGather | null = null; // Info about ongoing gather action
  promptTimeout: ReturnType<typeof setTimeout> | null = null; // Timer for hiding prompts

  // Chat UI state and elements
  chatContainer: HTMLElement | null;
  chatInput: HTMLInputElement | null;
  chatSendButton: HTMLElement | null; // Added send button
  isChatOpen: boolean = false;
  chatTarget: Character | null = null; // The NPC being chatted with
  private boundSendMessage: (() => Promise<void>) | null = null;
  private boundHandleChatKeyDown: ((e: KeyboardEvent) => void) | null = null;

  // Reusable vectors to avoid allocations
  private cameraDirection = new Vector3();
  private objectDirection = new Vector3();
  private playerDirection = new Vector3();
  private objectPosition = new Vector3();
  private playerPosition = new Vector3();

  constructor(
    player: Character,
    camera: PerspectiveCamera,
    interactableEntities: Array<any>,
    controls: Controls,
    game: Game
  ) {
    this.player = player;
    this.camera = camera;
    this.interactableEntities = interactableEntities;
    this.controls = controls;
    this.inventory = player.inventory!; // Assume player always has inventory
    this.eventLog = player.eventLog;
    this.game = game;

    // Initialize Raycaster
    this.raycaster = new Raycaster();
    this.raycaster.camera = camera; // Associate camera

    // Get UI Elements
    this.interactionPromptElement =
      document.getElementById("interaction-prompt");
    this.chatContainer = document.getElementById("chat-container");
    this.chatInput = document.getElementById("chat-input") as HTMLInputElement;
    this.chatSendButton = document.getElementById("chat-send-button");

    // Initialize bound functions for chat listeners
    this.initializeChatBindings();
  }

  // Called by Game when player control switches
  setActivePlayer(newPlayer: Character): void {
    if (this.player === newPlayer) return;

    console.log(
      `InteractionSystem: Active player switched to ${newPlayer.name}`
    );
    this.player = newPlayer;
    this.inventory = newPlayer.inventory!;
    this.eventLog = newPlayer.eventLog;
    this.currentTarget = null; // Reset target on switch
    this.cancelGatherAction(); // Cancel any ongoing gather
    this.closeChatInterface(); // Close chat if open
    this.hidePrompt();
  }

  // Main update loop for interaction system, called by Game.
  update(deltaTime: number): void {
    // If chat UI is open, interaction system pauses targeting/gathering
    if (this.isChatOpen) {
      if (this.interactionPromptElement?.style.display !== "none") {
        this.hidePrompt(); // Ensure prompt is hidden during chat
      }
      return;
    }

    // Handle ongoing gather action
    if (this.activeGather) {
      // Check if player moved or pressed interact again to cancel
      const moved = this.player.velocity.lengthSq() > 0.01; // Check significant movement
      const interactPressed = this.controls.consumeInteraction(); // Check and consume interact press

      if (moved || interactPressed) {
        if (moved) console.log("Gather cancelled due to movement.");
        if (interactPressed) console.log("Gather cancelled by interact press.");
        this.cancelGatherAction();
        return; // Stop processing this frame after cancellation
      }
      // Continue gathering progress
      this.updateGatherAction(deltaTime);
      return; // Don't look for new targets while gathering
    }

    // Find potential interaction target
    const targetInfo = this.findInteractableTarget();

    // Process found target
    if (targetInfo?.instance?.userData?.isInteractable) {
      // New target found or different from current
      if (this.currentTarget !== targetInfo.instance) {
        this.currentTarget = targetInfo.instance;
        // Determine prompt text (use custom prompt or default)
        const promptText = this.getInteractionPromptText(targetInfo.instance);
        this.showPrompt(promptText); // Show prompt without timeout initially
      }
      // Check for interaction input (E key or mobile button)
      if (this.controls.consumeInteraction()) {
        this.tryInteract(this.currentTarget);
      }
    } else if (this.currentTarget) {
      // No valid target found, but had one previously - clear target and prompt
      this.currentTarget = null;
      this.hidePrompt();
    }
  }

  // Determines the text to display in the interaction prompt.
  private getInteractionPromptText(targetInstance: any): string {
    let baseText = targetInstance.userData.prompt || "Interact"; // Default prompt
    if (targetInstance instanceof Character) {
      baseText =
        targetInstance.userData.prompt || `Talk to ${targetInstance.name}`;
    } else if (targetInstance.userData.interactionType === "gather") {
      baseText =
        targetInstance.userData.prompt ||
        `Gather ${targetInstance.userData.resource || "Resource"}`;
    }

    // Add key hint based on platform
    const keyHint = this.game.mobileControls?.isActive()
      ? "(Tap Interact)"
      : "[E]";
    return `${baseText} ${keyHint}`;
  }

  // Finds the best interactable target based on camera raycast and proximity/direction.
  findInteractableTarget(): TargetInfo | null {
    if (!this.player.mesh) return null;
    this.player.mesh.getWorldPosition(this.playerPosition);

    let bestTarget: TargetInfo | null = null;

    // --- Method 1: Raycast from Camera Center ---
    this.raycaster.setFromCamera(new Vector2(0, 0), this.camera); // Center of screen
    this.raycaster.far = this.interactionDistance * 1.5; // Slightly longer raycast check
    this.raycaster.near = 0.1;

    // Filter entities to check: must be interactable, visible, not dead, and reasonably close
    const meshesToCheck = this.interactableEntities
      .map((item) => (item as any).mesh ?? item) // Get mesh (Group or Mesh)
      .filter(
        (
          mesh
        ): mesh is Object3D => // Type guard
          mesh instanceof Object3D &&
          mesh.userData?.isInteractable &&
          mesh.visible &&
          mesh.parent && // Ensure it's added to the scene graph
          !(
            mesh.userData?.entityReference instanceof Character &&
            mesh.userData.entityReference.isDead
          ) &&
          this.playerPosition.distanceToSquared(
            mesh.getWorldPosition(this.objectPosition)
          ) <
            (this.interactionDistance * 2) ** 2 // Broad phase distance check
      );

    const intersects = this.raycaster.intersectObjects(meshesToCheck, true); // Check recursively

    if (intersects.length > 0) {
      for (const intersect of intersects) {
        // Traverse up from the hit mesh part to find the root interactable object/entity
        let hitObject: Object3D | null = intersect.object;
        let rootInstance: any | null = null; // The Character or simple object Group/Mesh
        let rootMesh: Object3D | null = null; // The top-level mesh/group of the instance

        while (hitObject) {
          // Check if this object has the interactable flag and a reference back to its instance
          if (
            hitObject.userData?.isInteractable &&
            (hitObject.userData?.entityReference ||
              hitObject.userData?.isSimpleObject)
          ) {
            // Find the corresponding instance in our interactableEntities list
            rootInstance = this.interactableEntities.find(
              (e) => e.mesh === hitObject || e === hitObject
            );
            if (rootInstance) {
              rootMesh = hitObject;
              break; // Found the root interactable
            }
          }
          hitObject = hitObject.parent; // Go up one level
        }

        // If a valid root instance was found
        if (
          rootInstance &&
          rootMesh &&
          rootInstance.userData?.isInteractable &&
          !(rootInstance instanceof Character && rootInstance.isDead)
        ) {
          // Check distance again (raycast distance might be slightly off from player center)
          const actualDistance = this.playerPosition.distanceTo(
            intersect.point
          );
          if (actualDistance <= this.interactionDistance) {
            // Check angle tolerance: is the object roughly in the center of the view?
            this.objectDirection
              .copy(intersect.point)
              .sub(this.camera.position)
              .normalize();
            this.camera.getWorldDirection(this.cameraDirection);
            if (
              this.cameraDirection.angleTo(this.objectDirection) <
              this.aimTolerance
            ) {
              bestTarget = {
                mesh: rootMesh,
                instance: rootInstance,
                point: intersect.point,
                distance: actualDistance,
              };
              break; // Found a good target via raycast, prioritize this
            }
          }
        }
      }
    }

    // --- Method 2: Fallback - Check Nearby Objects in Front of Player ---
    // If raycast didn't find a suitable target, check objects close to the player and in their view direction
    if (!bestTarget) {
      let closestDistSq = this.interactionDistance * this.interactionDistance;
      let closestInstance: any | null = null;
      let closestMesh = new Object3D();
      this.player.mesh.getWorldDirection(this.playerDirection); // Player's forward direction

      this.interactableEntities.forEach((item) => {
        if (
          !item?.userData?.isInteractable ||
          item === this.player ||
          (item instanceof Character && item.isDead)
        )
          return;

        const objMesh = (item as any).mesh ?? item;
        if (
          !(objMesh instanceof Object3D) ||
          !objMesh.visible ||
          !objMesh.parent
        )
          return;

        objMesh.getWorldPosition(this.objectPosition);
        const distSq = this.playerPosition.distanceToSquared(
          this.objectPosition
        );

        // Check if within interaction distance and closer than current best fallback
        if (distSq < closestDistSq) {
          this.objectDirection
            .copy(this.objectPosition)
            .sub(this.playerPosition)
            .normalize();
          // Check if the object is roughly in front of the player (dot product > ~cos(45deg))
          if (this.playerDirection.dot(this.objectDirection) > 0.707) {
            closestDistSq = distSq;
            closestInstance = item;
            closestMesh = objMesh;
          }
        }
      });

      // If a fallback target was found
      if (closestInstance && closestMesh) {
        bestTarget = {
          mesh: closestMesh,
          instance: closestInstance,
          point: closestMesh.getWorldPosition(new Vector3()), // Use object's position as interaction point
          distance: Math.sqrt(closestDistSq),
        };
      }
    }

    return bestTarget;
  }

  // Attempts to interact with the given target instance.
  tryInteract(targetInstance: any): void {
    // Validate target
    if (
      !targetInstance?.userData?.isInteractable ||
      (targetInstance instanceof Character && targetInstance.isDead)
    ) {
      this.showPrompt("Cannot interact.", 1500); // Show temporary message
      return;
    }

    const targetMesh = (targetInstance as any).mesh ?? targetInstance;
    if (!(targetMesh instanceof Object3D)) return; // Ensure it has a mesh

    // Check distance again just before interaction
    const distance = this.player.mesh!.position.distanceTo(targetMesh.position);
    if (distance > this.interactionDistance * 1.1) {
      // Allow slight tolerance
      console.log("Interaction failed: Target too far.");
      this.currentTarget = null; // Target moved out of range
      this.hidePrompt();
      return;
    }

    let result: InteractionResult | null = null;

    // --- Determine Interaction Type ---
    // 1. If the instance has an `interact` method (like Character), call it.
    if (typeof targetInstance.interact === "function") {
      result = targetInstance.interact(this.player);
    }
    // 2. If it's a gatherable object
    else if (
      targetInstance.userData.interactionType === "gather" &&
      targetInstance.userData.resource
    ) {
      this.startGatherAction(targetInstance);
      result = { type: "gather_start" }; // Indicate gather started
    }
    // 3. Default "examine" action for other interactables
    else {
      const objectName =
        targetInstance.name || targetInstance.userData.id || "object";
      this.game.logEvent(
        this.player,
        "examine",
        `Examined ${objectName}.`,
        targetInstance.userData.id || targetInstance.uuid,
        {},
        targetMesh.position
      );
      result = { type: "message", message: `You examine the ${objectName}.` };
    }

    // Handle the result of the interaction (show messages, open UI, etc.)
    if (result) {
      this.handleInteractionResult(result, targetInstance);
    }

    // Clear target if interaction made it non-interactable (e.g., depleted resource)
    // Don't clear immediately if gathering started, as it needs the target reference.
    if (
      result?.type !== "gather_start" &&
      !targetInstance.userData?.isInteractable
    ) {
      this.currentTarget = null;
      this.hidePrompt();
    }
  }

  // Processes the result returned by an interaction attempt.
  handleInteractionResult(
    result: InteractionResult,
    targetInstance: any
  ): void {
    let promptDuration: number | null = 2000; // Default duration for messages
    let promptText: string | null = null;

    switch (result.type) {
      case "reward": // e.g., Quest reward message
      case "message": // Simple feedback message
      case "error": // Error message
        promptText = result.message || "Interacted.";
        break;

      case "dialogue": // Simple dialogue display (could be expanded)
        promptText = result.text
          ? `${targetInstance.name ?? "NPC"}: ${result.text}`
          : "Hmm...";
        promptDuration = 4000; // Longer duration for dialogue
        break;

      case "chat": // Open chat UI with the target character
        if (targetInstance instanceof Character) {
          this.openChatInterface(targetInstance);
          promptDuration = null; // No temporary prompt needed, UI handles feedback
        } else {
          promptText = "Cannot chat with this."; // Cannot chat with objects
        }
        break;

      case "item_retrieved": // Feedback handled by inventory UI/log
      case "gather_start": // Feedback handled by gather progress prompt
        promptDuration = null; // No temporary prompt needed
        break;

      default:
        console.warn("Unhandled interaction result type:", result.type);
        break;
    }

    // Show temporary prompt if text and duration are set
    if (promptText && promptDuration !== null) {
      this.showPrompt(promptText, promptDuration);
    }
  }

  // --- Gathering Logic ---

  startGatherAction(targetInstance: any): void {
    if (this.activeGather || !targetInstance.userData.resource) return; // Already gathering or no resource defined

    const resource = targetInstance.userData.resource as string;
    const gatherTime =
      (targetInstance.userData.gatherTime as number) || DEFAULT_GATHER_TIME;
    const targetId = targetInstance.userData.id || targetInstance.uuid;

    // Check inventory space *before* starting the action
    if (!this.canInventoryAccept(resource)) {
      this.showPrompt(`Inventory full for ${resource}.`, 2000);
      this.game.logEvent(
        this.player,
        "gather_fail",
        `Inventory full, cannot start gathering ${resource}.`,
        targetId,
        { resource },
        this.player.mesh!.position
      );
      return;
    }

    // Start gathering
    this.activeGather = {
      targetInstance,
      startTime: performance.now(), // Use high-resolution timer
      duration: gatherTime,
      resource,
    };
    this.showPrompt(`Gathering ${resource}... (0%)`); // Show initial progress (no timeout)
    this.game.logEvent(
      this.player,
      "gather_start",
      `Started gathering ${resource}...`,
      targetId,
      { resource },
      this.player.mesh!.position
    );

    // Player stops moving and starts gather animation/state
    this.player.velocity.set(0, 0, 0); // Stop player movement
    this.player.triggerAction("gather"); // Trigger gather state/animation in Character
  }

  // Checks if the player's inventory has space for at least one more of the specified item.
  private canInventoryAccept(itemName: string): boolean {
    if (!this.inventory) return false;
    const maxStack = this.inventory.getMaxStack(itemName);

    // Check 1: Is there an existing stack with space?
    for (const item of this.inventory.items) {
      if (item?.name === itemName && item.count < maxStack) {
        return true; // Found a stack with space
      }
    }
    // Check 2: Is there an empty slot?
    if (this.inventory.items.includes(null)) {
      return true; // Found an empty slot
    }
    // If neither, inventory is full for this item
    return false;
  }

  updateGatherAction(_deltaTime: number): void {
    if (!this.activeGather) return;

    const elapsedTime = performance.now() - this.activeGather.startTime;
    const progress = Math.min(1, elapsedTime / this.activeGather.duration);

    // Update the prompt with progress (no timeout)
    this.showPrompt(
      `Gathering ${this.activeGather.resource}... (${Math.round(progress * 100)}%)`
    );

    // Complete action when progress reaches 1
    if (progress >= 1) {
      this.completeGatherAction();
    }
  }

  completeGatherAction(): void {
    if (!this.activeGather) return;

    const { resource, targetInstance } = this.activeGather;
    const targetMesh = targetInstance.mesh ?? targetInstance;
    const targetId = targetInstance.userData.id || targetInstance.uuid;

    // Attempt to add item to inventory
    if (this.inventory.addItem(resource, 1)) {
      // Success
      this.game.logEvent(
        this.player,
        "gather_complete",
        `Gathered 1 ${resource}.`,
        targetId,
        { resource },
        targetMesh.position
      );
      // Handle depletion and respawn if applicable
      if (targetInstance.userData.isDepletable) {
        targetInstance.userData.isInteractable = false;
        targetMesh.visible = false; // Hide the object
        const respawnTime =
          (targetInstance.userData.respawnTime as number) ||
          DEFAULT_RESPAWN_TIME;

        // Schedule respawn
        setTimeout(() => {
          // Check if instance still exists and has userData before respawning
          if (targetInstance?.userData) {
            targetInstance.userData.isInteractable = true;
            targetMesh.visible = true; // Make visible again
            // Optional: Log respawn
            // this.game.logEvent('System', 'respawn_object', `${resource} (${targetId}) respawned.`, undefined, { resource }, targetMesh.position);
          }
        }, respawnTime);
      }
    } else {
      // Inventory was full (should ideally be caught by pre-check, but double-check)
      this.game.logEvent(
        this.player,
        "gather_fail",
        `Inventory full, could not gather ${resource}.`,
        targetId,
        { resource },
        targetMesh.position
      );
      this.showPrompt("Inventory full!", 2000); // Show error message
    }

    this.resetGatherState(); // Clean up gather state
  }

  cancelGatherAction(): void {
    if (!this.activeGather) return;

    const targetId =
      this.activeGather.targetInstance.userData.id ||
      this.activeGather.targetInstance.uuid;
    this.game.logEvent(
      this.player,
      "gather_cancel",
      `Gathering ${this.activeGather.resource} cancelled.`,
      targetId,
      { resource: this.activeGather.resource },
      this.player.mesh!.position
    );
    this.resetGatherState(); // Clean up gather state
  }

  // Resets gathering state and player animation/flags.
  private resetGatherState(): void {
    if (!this.activeGather) return;

    this.player.isGathering = false; // Reset character's gathering flag
    // Stop the gather animation if it's playing
    const gatherAnim =
      this.player.animations.gather || this.player.animations.attack;
    if (gatherAnim?.isRunning()) {
      gatherAnim.stop();
      // Optionally transition smoothly back to idle/walk
      this.player.switchAction("idle");
    }

    this.activeGather = null; // Clear active gather info
    this.hidePrompt(); // Hide the progress prompt
    // Don't clear currentTarget here, let the main update loop re-evaluate targeting
  }

  // --- UI Prompt Management ---

  showPrompt(text: string, duration: number | null = null): void {
    if (!this.interactionPromptElement) return;

    // Don't overwrite gather progress prompt unless it's a timed message
    if (this.activeGather && duration === null) return;

    this.interactionPromptElement.textContent = text;
    this.interactionPromptElement.style.display = "block";

    // Clear any existing timeout for hiding the prompt
    if (this.promptTimeout !== null) {
      clearTimeout(this.promptTimeout);
      this.promptTimeout = null;
    }

    // Set a new timeout if a duration is provided
    if (duration && duration > 0) {
      this.promptTimeout = setTimeout(() => {
        // Only hide if the text hasn't changed in the meantime
        // This prevents hiding a new prompt that appeared quickly after
        if (this.interactionPromptElement?.textContent === text) {
          this.hidePrompt();
        }
      }, duration);
    }
  }

  hidePrompt(): void {
    if (!this.interactionPromptElement) return;

    // Don't hide if gathering is in progress (it manages its own prompt)
    if (this.activeGather) return;

    this.interactionPromptElement.style.display = "none";
    this.interactionPromptElement.textContent = "";

    // Clear any active timeout
    if (this.promptTimeout !== null) {
      clearTimeout(this.promptTimeout);
      this.promptTimeout = null;
    }
  }

  // --- Chat ---

  // Initialize bound functions once to avoid creating new functions repeatedly.
  private initializeChatBindings(): void {
    this.boundSendMessage = async () => {
      if (!this.chatTarget || !this.chatInput || this.chatInput.disabled)
        return;
      const message = this.chatInput.value.trim();
      if (!message) return;

      // Show player message bubble immediately
      this.player.showTemporaryMessage(message);
      this.game.logEvent(
        this.player,
        "chat",
        `${this.player.name} said "${message}" to ${this.chatTarget.name}.`,
        this.chatTarget,
        { message },
        this.player.mesh!.position
      );

      this.chatInput.value = "";
      this.chatInput.disabled = true; // Disable input while waiting for response
      this.chatSendButton?.setAttribute("disabled", "true");

      const prompt = this.generateChatPrompt(this.chatTarget, message);
      try {
        const responseJson = await sendToGemini(prompt);
        let npcMessage = "Hmm..."; // Default response

        if (responseJson) {
          // Gemini response might be plain text or JSON containing the text
          try {
            // First, try parsing as JSON (if API was configured for JSON output)
            const parsed = JSON.parse(responseJson);
            // Look for common response structures
            npcMessage =
              parsed.response || parsed.text || parsed.message || responseJson;
          } catch (e) {
            // If parsing fails, assume it's plain text
            npcMessage = responseJson;
          }
          npcMessage = npcMessage.trim() || "Hmm..."; // Ensure not empty
        }

        // Show NPC response bubble
        this.chatTarget.showTemporaryMessage(npcMessage);
        this.game.logEvent(
          this.chatTarget,
          "chat",
          `${this.chatTarget.name} said "${npcMessage}" to ${this.player.name}.`,
          this.player,
          { message: npcMessage },
          this.chatTarget.mesh!.position
        );
        // Check if this response completes any quests
        this.game.checkQuestCompletion(this.chatTarget, npcMessage);
      } catch (error) {
        console.error("Error during chat API call:", error);
        this.chatTarget.showTemporaryMessage("I... don't know what to say.");
        this.game.logEvent(
          this.chatTarget,
          "chat_error",
          `${this.chatTarget.name} failed to respond.`,
          this.player,
          { error: (error as Error).message },
          this.chatTarget.mesh!.position
        );
      } finally {
        // Re-enable input regardless of success/failure
        if (this.chatInput) this.chatInput.disabled = false;
        this.chatSendButton?.removeAttribute("disabled");
        // Keep chat open for player to type again, or close automatically?
        // Let's keep it open for now. Player uses Escape to close.
        this.chatInput?.focus(); // Refocus input field
        // Optionally close after response: this.closeChatInterface();
      }
    };

    this.boundHandleChatKeyDown = (e: KeyboardEvent) => {
      if (
        e.key === "Enter" &&
        this.boundSendMessage &&
        !this.chatInput?.disabled
      ) {
        e.preventDefault(); // Prevent default form submission/newline
        this.boundSendMessage();
      }
      // Escape key handling is done globally in Controls.ts
    };
  }

  // Generates the prompt for the Gemini API based on chat context.
  generateChatPrompt(target: Character, playerMessage: string): string {
    // Get recent events relevant to the target NPC
    const recentEvents = target.eventLog.entries
      .slice(-5) // Limit context
      .map((e) => e.message)
      .join("\n");
    const persona = target.persona || "a villager";

    // Construct the prompt
    return `
You are the character ${target.name}. Your persona: ${persona}.
The player (${this.player.name}) approaches you and says: "${playerMessage}"

Your recent memory includes these events:
${recentEvents || "None"}

Respond briefly and in character (1-2 sentences maximum). Do not use formatting like markdown. Just provide the dialogue text.
`.trim();
  }

  // Opens the chat UI for interaction with the target character.
  async openChatInterface(target: Character): Promise<void> {
    if (
      !this.chatContainer ||
      !this.chatInput ||
      !this.chatSendButton ||
      this.isChatOpen
    )
      return;

    console.log(`Opening chat with ${target.name}`);
    this.game.setPauseState(true); // Pause game during chat
    this.isChatOpen = true;
    this.chatTarget = target;
    this.chatContainer.classList.remove("hidden"); // Show UI
    this.chatInput.value = "";
    this.chatInput.disabled = false; // Ensure input is enabled initially
    this.chatSendButton.removeAttribute("disabled");
    this.chatInput.focus(); // Focus the input field
    this.hidePrompt(); // Hide interaction prompt

    // Add listeners using the bound functions
    if (this.boundHandleChatKeyDown) {
      this.chatInput.addEventListener("keydown", this.boundHandleChatKeyDown);
    }
    if (this.boundSendMessage) {
      this.chatSendButton.addEventListener("click", this.boundSendMessage);
    }
  }

  // Closes the chat UI.
  closeChatInterface(): void {
    if (
      !this.isChatOpen ||
      !this.chatContainer ||
      !this.chatInput ||
      !this.chatSendButton
    )
      return;

    console.log("Closing chat interface");
    this.isChatOpen = false;
    this.chatTarget = null;
    this.chatContainer.classList.add("hidden"); // Hide UI
    this.chatInput.disabled = false; // Ensure input is re-enabled
    this.chatSendButton.removeAttribute("disabled");

    // Remove listeners using the bound functions
    if (this.boundHandleChatKeyDown) {
      this.chatInput.removeEventListener(
        "keydown",
        this.boundHandleChatKeyDown
      );
    }
    if (this.boundSendMessage) {
      this.chatSendButton.removeEventListener("click", this.boundSendMessage);
    }

    // Unpause the game only if no other UI is blocking
    if (!this.game.isUIBlockingGameplay()) {
      this.game.setPauseState(false);
      // Attempt to re-lock pointer on desktop after closing chat
      this.controls.lockPointer();
    }
  }
}
