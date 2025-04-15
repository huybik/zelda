/* File: /src/systems/interaction.ts */
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
} from "../core/utils";
import { Controls } from "../controls/controls";
import { Game } from "../main";
import { sendToGemini, generateChatPrompt } from "../ai/api";
import { INTERACTION_DISTANCE, AIM_TOLERANCE } from "../core/constants";
import { DroppedItemManager, DroppedItemData } from "./droppedItemManager"; // Import DroppedItemManager and Data
import { getItemDefinition } from "../core/items"; // Import for item names

export class InteractionSystem {
  player: Character;
  camera: PerspectiveCamera;
  interactableEntities: Array<any>; // Includes Characters, Animals, Resources
  controls: Controls;
  inventory: Inventory;
  eventLog: EventLog;
  raycaster: Raycaster;
  interactionDistance: number = INTERACTION_DISTANCE; // For 'E' key interactions (chat, pickup)
  aimTolerance: number = AIM_TOLERANCE;
  currentTarget: any | null = null; // Can be Character, Animal, Resource Object3D, DroppedItemData
  currentTargetMesh: Object3D | null = null; // Mesh for Characters/Resources
  currentTargetType: "character" | "item" | "none" = "none"; // Track target type
  interactionPromptElement: HTMLElement | null;
  promptTimeout: ReturnType<typeof setTimeout> | null = null;
  game: Game;
  chatContainer: HTMLElement | null;
  chatInput: HTMLInputElement | null;
  isChatOpen: boolean = false;
  chatTarget: Character | null = null;
  boundSendMessage: (() => Promise<void>) | null = null;
  boundHandleChatKeyDown: ((e: KeyboardEvent) => void) | null = null;
  boundCloseChat: (() => void) | null = null;
  droppedItemManager: DroppedItemManager; // Add reference

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
    game: Game,
    droppedItemManager: DroppedItemManager // Inject DroppedItemManager
  ) {
    this.player = player;
    this.camera = camera;
    this.interactableEntities = interactableEntities;
    this.controls = controls;
    this.inventory = inventory;
    this.eventLog = eventLog;
    this.game = game;
    this.droppedItemManager = droppedItemManager; // Store reference
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

    // 1. Find Character Target (Highest Priority)
    const characterTargetInfo = this.findInteractableCharacterTarget();

    // 2. Find Dropped Item Target (Lower Priority)
    const itemTargetData = this.droppedItemManager.findClosestItemToPlayer(
      this.player.mesh!.position,
      this.interactionDistance * this.interactionDistance // Use squared distance
    );

    let newTarget: any | null = null;
    let newTargetMesh: Object3D | null = null;
    let newTargetType: "character" | "item" | "none" = "none";
    let promptText: string | null = null;

    // Prioritize Character interaction
    if (characterTargetInfo) {
      newTarget = characterTargetInfo.instance;
      newTargetMesh = characterTargetInfo.mesh;
      newTargetType = "character";
      promptText =
        characterTargetInfo.instance.userData.prompt ||
        (this.game.mobileControls?.isActive()
          ? "Tap Interact"
          : "Press E to talk");
    } else if (itemTargetData) {
      // If no character target, check for item target
      newTarget = itemTargetData; // Store the data object
      newTargetMesh = null; // No specific mesh for item target logic here
      newTargetType = "item";
      const itemDef = getItemDefinition(itemTargetData.itemId);
      const itemName = itemDef ? itemDef.name : itemTargetData.itemId;
      promptText = this.game.mobileControls?.isActive()
        ? `Tap Interact to pick up ${itemName}`
        : `Press E to pick up ${itemName}`;
    }

    // Update current target and prompt if changed
    if (
      newTarget !== this.currentTarget ||
      newTargetType !== this.currentTargetType
    ) {
      this.currentTarget = newTarget;
      this.currentTargetMesh = newTargetMesh;
      this.currentTargetType = newTargetType;

      if (promptText) {
        this.showPrompt(promptText);
      } else {
        this.hidePrompt();
      }
    }

    // Check for 'E' key press (interact)
    if (this.controls.moveState.interact && this.currentTarget) {
      this.tryInteract(this.currentTarget, this.currentTargetType);
      // Reset interact state immediately after trying
      this.controls.moveState.interact = false;
    }

    // Attack logic is handled by Character.update based on moveState.attack
  }

  // Renamed to specifically find Characters for 'E' interaction
  findInteractableCharacterTarget(): TargetInfo | null {
    this.raycaster.setFromCamera(new Vector2(0, 0), this.camera);
    this.raycaster.far = this.interactionDistance;
    const playerPosition = this.player.mesh!.position;

    const meshesToCheck = this.interactableEntities
      .map((item) => (item as any).mesh ?? item)
      .filter((mesh): mesh is Object3D => {
        if (
          !(mesh instanceof Object3D) ||
          !mesh.userData?.isInteractable ||
          !mesh.visible ||
          mesh === this.player.mesh
        )
          return false;

        const entityRef = mesh.userData?.entityReference;
        if (!(entityRef instanceof Character) || entityRef.isDead) return false;

        const distSq = playerPosition.distanceToSquared(mesh.position);
        return distSq < this.interactionDistance * this.interactionDistance * 4;
      });

    let closestHit: TargetInfo | null = null;
    const intersects = this.raycaster.intersectObjects(meshesToCheck, true);

    if (intersects.length > 0) {
      for (const intersect of intersects) {
        let hitObject: Object3D | null = intersect.object;
        let rootInstance: any | null = null;
        let rootMesh: Object3D | null = null;

        while (hitObject) {
          if (
            hitObject.userData?.isInteractable &&
            hitObject.userData?.entityReference instanceof Character
          ) {
            rootInstance = hitObject.userData.entityReference;
            rootMesh = hitObject;
            break;
          }
          hitObject = hitObject.parent;
        }

        if (
          rootInstance instanceof Character &&
          rootMesh &&
          !rootInstance.isDead &&
          rootInstance !== this.player
        ) {
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
            break;
          }
        }
      }
    }

    return closestHit || this.findNearbyCharacter();
  }

  findNearbyCharacter(): TargetInfo | null {
    const playerPosition = this.player.mesh!.getWorldPosition(new Vector3());
    let closestDistSq = this.interactionDistance * this.interactionDistance;
    let closestInstance: Character | null = null;

    this.interactableEntities.forEach((item) => {
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

  tryInteract(target: any, targetType: "character" | "item" | "none"): void {
    if (targetType === "character") {
      if (!(target instanceof Character) || target.isDead) {
        this.showPrompt("Cannot interact with this.", 2000);
        return;
      }
      const targetPosition = target.mesh!.position;
      const distance = this.player.mesh!.position.distanceTo(targetPosition);
      if (distance > this.interactionDistance * 1.1) {
        this.currentTarget = null;
        this.currentTargetMesh = null;
        this.currentTargetType = "none";
        this.hidePrompt();
        return;
      }
      const result = target.interact(this.player);
      if (result) this.handleInteractionResult(result, target);
    } else if (targetType === "item") {
      const itemData = target as DroppedItemData;
      const success = this.droppedItemManager.collectItem(
        itemData.id,
        this.player
      );
      if (success) {
        // Item collected, clear target and prompt
        this.currentTarget = null;
        this.currentTargetMesh = null;
        this.currentTargetType = "none";
        this.hidePrompt();
      } else {
        // Collection failed (e.g., inventory full), keep prompt visible
        // The collectItem method handles the "Inventory Full" notification
      }
    }
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
    }
    if (promptText && promptDuration !== null)
      this.showPrompt(promptText, promptDuration);
  }

  showPrompt(text: string, duration: number | null = null): void {
    if (!this.interactionPromptElement) return;

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
            // console.log(this.chatTarget.id, responseJson);
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
            this.game.questManager.checkQuestCompletion(
              targetAtSendStart,
              npcMessage
            );
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
