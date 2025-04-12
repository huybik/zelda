// File: /src/systems/interaction.ts
import {
  PerspectiveCamera,
  Object3D,
  Vector3,
  Raycaster,
  Vector2,
} from "three";
import { Character } from "../entities/character";
import {
  Inventory,
  EventLog,
  InteractionResult,
  TargetInfo,
  // ActiveGather, // Removed
} from "../core/utils";
import { Controls } from "../controls/controls";
import { Game } from "../main";
import { sendToGemini, generateChatPrompt } from "../ai/api";
import { INTERACTION_DISTANCE, AIM_TOLERANCE } from "../core/constants";

export class InteractionSystem {
  player: Character;
  camera: PerspectiveCamera;
  interactableEntities: Array<any>; // Includes Characters, Animals, Resources
  controls: Controls;
  inventory: Inventory;
  eventLog: EventLog;
  raycaster: Raycaster;
  interactionDistance: number = INTERACTION_DISTANCE; // For 'E' key interactions (chat)
  aimTolerance: number = AIM_TOLERANCE;
  currentTarget: any | null = null; // Can be Character, Animal, Resource Object3D
  currentTargetMesh: Object3D | null = null;
  interactionPromptElement: HTMLElement | null;
  // activeGather: ActiveGather | null = null; // Removed
  promptTimeout: ReturnType<typeof setTimeout> | null = null;
  game: Game;
  chatContainer: HTMLElement | null;
  chatInput: HTMLInputElement | null;
  isChatOpen: boolean = false;
  chatTarget: Character | null = null;
  boundSendMessage: (() => Promise<void>) | null = null;
  boundHandleChatKeyDown: ((e: KeyboardEvent) => void) | null = null;
  boundCloseChat: (() => void) | null = null;

  private cameraDirection = new Vector3();
  private objectDirection = new Vector3();
  private playerDirection = new Vector3();
  private objectPosition = new Vector3();

  constructor(
    player: Character,
    camera: PerspectiveCamera,
    interactableEntities: Array<any>,
    controls: Controls,
    inventory: Inventory,
    eventLog: EventLog,
    game: Game
  ) {
    this.player = player;
    this.camera = camera;
    this.interactableEntities = interactableEntities;
    this.controls = controls;
    this.inventory = inventory;
    this.eventLog = eventLog;
    this.game = game;
    this.raycaster = new Raycaster();
    this.interactionPromptElement =
      document.getElementById("interaction-prompt");
    this.chatContainer = document.getElementById("chat-container");
    this.chatInput = document.getElementById("chat-input") as HTMLInputElement;
  }

  update(deltaTime: number): void {
    if (this.isChatOpen) {
      if (this.interactionPromptElement?.style.display !== "none") {
        this.hidePrompt();
      }
      return;
    }
    // Removed activeGather check

    // Find target for 'E' interaction (chat)
    const targetInfo = this.findInteractableTarget();

    // Only show prompt for things that can be interacted with via 'E' (currently only Characters for chat)
    if (
      targetInfo?.instance instanceof Character && // Check if it's a Character
      targetInfo.instance !== this.player &&
      !targetInfo.instance.isDead // Check if alive
    ) {
      if (this.currentTarget !== targetInfo.instance) {
        this.currentTarget = targetInfo.instance;
        this.currentTargetMesh = targetInfo.mesh;
        this.showPrompt(
          targetInfo.instance.userData.prompt ||
            (this.game.mobileControls?.isActive()
              ? "Tap Interact"
              : "Press E to talk") // Changed prompt
        );
      }
      // Check for 'E' key press (interact)
      if (this.controls.moveState.interact) {
        this.tryInteract(this.currentTarget);
      }
    } else if (this.currentTarget) {
      // Clear target if it's no longer valid for 'E' interaction
      this.currentTarget = null;
      this.currentTargetMesh = null;
      this.hidePrompt();
    }

    // Attack logic is handled by Character.update based on moveState.attack
  }

  findInteractableTarget(): TargetInfo | null {
    this.raycaster.setFromCamera(new Vector2(0, 0), this.camera);
    this.raycaster.far = this.interactionDistance; // Use interactionDistance for 'E' key targeting
    const playerPosition = this.player.mesh!.position;

    // Filter potential targets for 'E' interaction (currently only living Characters)
    const meshesToCheck = this.interactableEntities
      .map((item) => (item as any).mesh ?? item)
      .filter((mesh): mesh is Object3D => {
        if (
          !(mesh instanceof Object3D) ||
          !mesh.userData?.isInteractable || // Must be interactable
          !mesh.visible ||
          mesh === this.player.mesh
        )
          return false;

        const entityRef = mesh.userData?.entityReference;
        // Only consider living Characters for 'E' interaction
        if (!(entityRef instanceof Character) || entityRef.isDead) return false;

        // Basic distance check (optional optimization)
        const distSq = playerPosition.distanceToSquared(mesh.position);
        return distSq < this.interactionDistance * this.interactionDistance * 4; // Check slightly larger radius
      });

    let closestHit: TargetInfo | null = null;
    const intersects = this.raycaster.intersectObjects(meshesToCheck, true);

    if (intersects.length > 0) {
      for (const intersect of intersects) {
        let hitObject: Object3D | null = intersect.object;
        let rootInstance: any | null = null;
        let rootMesh: Object3D | null = null;

        // Traverse up to find the root interactable object/entity
        while (hitObject) {
          if (
            hitObject.userData?.isInteractable &&
            hitObject.userData?.entityReference instanceof Character // Ensure it's a Character
          ) {
            rootInstance = hitObject.userData.entityReference;
            rootMesh = hitObject;
            break;
          }
          hitObject = hitObject.parent;
        }

        // Validate the found instance
        if (
          rootInstance instanceof Character && // Must be a Character
          rootMesh &&
          !rootInstance.isDead && // Must be alive
          rootInstance !== this.player
        ) {
          // Check aiming angle
          this.objectDirection
            .copy(intersect.point)
            .sub(this.camera.position)
            .normalize();
          this.camera.getWorldDirection(this.cameraDirection);
          const angle = this.cameraDirection.angleTo(this.objectDirection);

          if (angle < this.aimTolerance) {
            closestHit = {
              mesh: rootMesh,
              instance: rootInstance,
              point: intersect.point,
              distance: intersect.distance,
            };
            break; // Found the closest valid target in the aim cone
          }
        }
      }
    }

    // If raycast fails, check nearby Characters (for proximity interaction)
    return closestHit || this.findNearbyCharacter();
  }

  // Simplified nearby check specifically for Characters (for 'E' interaction)
  findNearbyCharacter(): TargetInfo | null {
    const playerPosition = this.player.mesh!.getWorldPosition(new Vector3());
    let closestDistSq = this.interactionDistance * this.interactionDistance;
    let closestInstance: Character | null = null;

    this.interactableEntities.forEach((item) => {
      // Only consider living Characters
      if (
        !(item instanceof Character) ||
        item === this.player ||
        item.isDead ||
        !item.mesh ||
        !item.mesh.visible
      )
        return;

      this.objectPosition.copy(item.mesh.getWorldPosition(new Vector3()));
      const distSq = playerPosition.distanceToSquared(this.objectPosition);

      if (distSq < closestDistSq) {
        this.player.mesh!.getWorldDirection(this.playerDirection);
        this.objectDirection
          .copy(this.objectPosition)
          .sub(playerPosition)
          .normalize();
        const angle = this.playerDirection.angleTo(this.objectDirection);

        // Check if roughly in front
        if (angle < Math.PI / 2.5) {
          closestDistSq = distSq;
          closestInstance = item;
        }
      }
    });

    if (closestInstance) {
      const mesh = (closestInstance as any).mesh ?? closestInstance;
      this.objectPosition.copy(mesh!.getWorldPosition(new Vector3()));
      return {
        mesh,
        instance: closestInstance,
        point: this.objectPosition.clone(),
        distance: this.player.mesh!.position.distanceTo(this.objectPosition),
      };
    }
    return null;
  }

  tryInteract(targetInstance: any): void {
    // This function is now primarily for 'E' key interactions (chat)
    if (!(targetInstance instanceof Character) || targetInstance.isDead) {
      this.showPrompt("Cannot interact with this.", 2000);
      return;
    }

    const targetPosition = targetInstance.mesh!.position;
    const distance = this.player.mesh!.position.distanceTo(targetPosition);

    if (distance > this.interactionDistance * 1.1) {
      this.currentTarget = null;
      this.currentTargetMesh = null;
      this.hidePrompt();
      return;
    }

    // Call the Character's interact method (which should handle chat)
    const result = targetInstance.interact(this.player);

    if (result) this.handleInteractionResult(result, targetInstance);

    // Clear target if interaction makes it invalid (e.g., quest completion changes state)
    // For chat, we usually keep the target until chat closes.
    // if (!targetInstance.userData?.isInteractable) {
    //     this.currentTarget = null;
    //     this.currentTargetMesh = null;
    // }
  }

  handleInteractionResult(
    result: InteractionResult,
    targetInstance: any
  ): void {
    let promptDuration: number | null = 2000;
    let promptText: string | null = null;
    switch (result.type) {
      case "reward":
        if (result.item) {
          promptText =
            result.message ||
            `Received ${result.item.amount} ${result.item.name}.`;
          promptDuration = 3000;
        } else if (result.message) {
          promptText = result.message;
          promptDuration = 3000;
        }
        break;
      case "message":
        if (result.message) promptText = result.message;
        break;
      case "dialogue":
        if (result.text) {
          promptText = `${targetInstance.name ?? "NPC"}: ${result.text}`;
          promptDuration = 4000;
        }
        break;
      case "chat":
        if (targetInstance instanceof Character) {
          this.openChatInterface(targetInstance);
          promptDuration = null; // Chat interface handles display
        } else {
          promptText = "Cannot chat with this.";
        }
        break;
      case "item_retrieved":
        promptDuration = null; // No prompt needed for simple pickup
        break;
      case "error":
        if (result.message) promptText = result.message;
        break;
      // case "gather_start": // Removed
      //   promptDuration = null;
      //   break;
    }
    if (promptText && promptDuration !== null)
      this.showPrompt(promptText, promptDuration);
  }

  // Removed startGatherAction, updateGatherAction, completeGatherAction, cancelGatherAction

  showPrompt(text: string, duration: number | null = null): void {
    if (!this.interactionPromptElement) return;
    // Removed activeGather check

    this.interactionPromptElement.textContent = text;
    this.interactionPromptElement.style.display = "block";

    // Clear any existing timeout
    clearTimeout(this.promptTimeout ?? undefined);
    this.promptTimeout = null;

    // Set new timeout if duration is provided
    if (duration && duration > 0) {
      this.promptTimeout = setTimeout(() => {
        // Only hide if the text hasn't changed (prevents hiding a new prompt)
        if (this.interactionPromptElement?.textContent === text) {
          this.hidePrompt();
        }
      }, duration);
    }
  }

  hidePrompt(): void {
    if (!this.interactionPromptElement) return;
    // Removed activeGather check
    // Don't hide if there's an active timeout (meaning a timed prompt is still showing)
    // if (this.promptTimeout) return;

    this.interactionPromptElement.style.display = "none";
    this.interactionPromptElement.textContent = "";
    // It's okay to clear timeout here, as hiding means the timed prompt is done or irrelevant
    clearTimeout(this.promptTimeout ?? undefined);
    this.promptTimeout = null;
  }

  async openChatInterface(target: Character): Promise<void> {
    if (this.chatInput) {
      this.chatInput.disabled = false;
      this.chatInput.value = "";
    }

    if (!this.chatContainer || !this.chatInput || this.isChatOpen) {
      if (this.isChatOpen && this.chatInput && !this.chatInput.disabled) {
        requestAnimationFrame(() => {
          this.chatInput?.focus();
        });
      }
      return;
    }

    this.game.setPauseState(true);
    this.isChatOpen = true;
    this.chatTarget = target;
    this.chatContainer.classList.remove("hidden");

    if (this.chatTarget && this.chatTarget.aiController) {
      this.chatTarget.aiController.aiState = "idle";
      this.chatTarget.aiController.persistentAction = null;
    }

    requestAnimationFrame(() => {
      this.chatInput?.focus();
    });

    if (!this.boundSendMessage) {
      this.boundSendMessage = async () => {
        if (!this.chatTarget || !this.chatInput) return;
        const message = this.chatInput.value.trim();
        if (!message) return;

        const targetAtSendStart = this.chatTarget;

        this.player.updateIntentDisplay(message);
        this.game.logEvent(
          this.player,
          "chat",
          `${this.player.name} said "${message}" to ${targetAtSendStart.name}.`,
          targetAtSendStart,
          { message: message },
          this.player.mesh!.position
        );

        this.chatInput.value = "";
        this.chatInput.disabled = true;

        const prompt = generateChatPrompt(
          targetAtSendStart,
          this.player,
          message
        );
        try {
          const responseJson = await sendToGemini(prompt);

          let npcMessage = "Hmm....";
          if (responseJson) {
            console.log(this.chatTarget.id, responseJson);
            try {
              const parsedText = JSON.parse(responseJson);
              if (
                parsedText &&
                typeof parsedText === "object" &&
                parsedText.response
              ) {
                npcMessage = parsedText.response.trim() || "Hmm....";
              } else {
                npcMessage = responseJson.trim() || "Hmm....";
              }
            } catch (parseError) {
              npcMessage = responseJson.trim() || "Hmm....";
              console.log(
                "Chat response was not JSON, treating as string:",
                responseJson
              );
            }
          }

          if (this.isChatOpen && this.chatTarget === targetAtSendStart) {
            targetAtSendStart.updateIntentDisplay(npcMessage);
            targetAtSendStart.game?.logEvent(
              targetAtSendStart,
              "chat",
              `${targetAtSendStart.name} said "${npcMessage}" to ${this.player.name}.`,
              this.player,
              { message: npcMessage },
              targetAtSendStart.mesh!.position
            );
            this.game.checkQuestCompletion(targetAtSendStart, npcMessage);
          } else {
            console.log("Chat closed or target changed before NPC response.");
          }
        } catch (error) {
          console.error("Error during chat API call:", error);
          if (this.isChatOpen && this.chatTarget === targetAtSendStart) {
            targetAtSendStart.updateIntentDisplay(
              "I... don't know what to say."
            );
            this.game.logEvent(
              targetAtSendStart,
              "chat_error",
              `${targetAtSendStart.name} failed to respond to ${this.player.name}.`,
              this.player,
              { error: (error as Error).message },
              targetAtSendStart.mesh!.position
            );
          }
        } finally {
          targetAtSendStart.aiController?.scheduleNextActionDecision();
          this.closeChatInterface();
        }
      };
    }

    if (!this.boundHandleChatKeyDown) {
      this.boundHandleChatKeyDown = (e: KeyboardEvent) => {
        if (
          e.key === "Enter" &&
          this.boundSendMessage &&
          !this.chatInput?.disabled
        ) {
          this.boundSendMessage();
        }
      };
    }

    if (!this.boundCloseChat) {
      this.boundCloseChat = () => {
        this.closeChatInterface();
      };
    }

    this.chatInput.removeEventListener("keydown", this.boundHandleChatKeyDown);
    this.chatInput.addEventListener("keydown", this.boundHandleChatKeyDown);
  }

  closeChatInterface(): void {
    if (!this.isChatOpen || !this.chatContainer || !this.chatInput) return;

    this.isChatOpen = false;
    this.chatTarget = null;
    this.chatContainer.classList.add("hidden");
    this.chatInput.disabled = false;
    this.chatInput.blur();

    if (this.boundHandleChatKeyDown) {
      this.chatInput.removeEventListener(
        "keydown",
        this.boundHandleChatKeyDown
      );
    }

    this.game.setPauseState(false);

    requestAnimationFrame(() => {
      this.game.renderer?.domElement.focus();
    });
  }
}
