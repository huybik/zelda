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
  chatSuggestionsContainer: HTMLElement | null; // Added suggestions container
  chatSuggestionsList: HTMLElement | null; // Added suggestions list
  isChatOpen: boolean = false;
  chatTarget: Character | null = null;
  boundSendMessage: (() => Promise<void>) | null = null;
  boundHandleChatKeyDown: ((e: KeyboardEvent) => void) | null = null;
  boundCloseChat: (() => void) | null = null;
  boundHandleChatInput: (() => void) | null = null; // Added input handler
  boundHandleChatFocus: (() => void) | null = null; // Added focus handler
  boundHandleChatBlur: (() => void) | null = null; // Added blur handler
  boundHandleSuggestionClick: ((e: MouseEvent) => void) | null = null; // Added suggestion click handler
  droppedItemManager: DroppedItemManager; // Add reference
  public isSwitchTargetAvailable: boolean = false; // Flag for mobile switch button

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
    this.chatSuggestionsContainer = document.getElementById(
      "chat-suggestions-container"
    );
    this.chatSuggestionsList = document.getElementById("chat-suggestions-list");

    // Bind chat handlers
    this.boundHandleChatInput = this.handleChatInput.bind(this);
    this.boundHandleChatFocus = this.handleChatFocus.bind(this);
    this.boundHandleChatBlur = this.handleChatBlur.bind(this);
    this.boundHandleSuggestionClick = this.handleSuggestionClick.bind(this);

    if (this.chatInput) {
      this.chatInput.addEventListener("input", this.boundHandleChatInput);
      this.chatInput.addEventListener("focus", this.boundHandleChatFocus);
      this.chatInput.addEventListener("blur", this.boundHandleChatBlur);
    }
    if (this.chatSuggestionsList) {
      this.chatSuggestionsList.addEventListener(
        "mousedown",
        this.boundHandleSuggestionClick
      ); // Use mousedown to prevent blur
    }
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
    let canSwitchToTarget = false;

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
      // Check if switching is enabled and target is valid
      canSwitchToTarget =
        this.game.characterSwitchingEnabled &&
        newTarget instanceof Character &&
        newTarget !== this.player &&
        !newTarget.isDead;
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

    // Update switch target availability flag
    this.isSwitchTargetAvailable = canSwitchToTarget;

    // Check for 'E' key press (interact)
    if (this.controls.moveState.interact && this.currentTarget) {
      this.tryInteract(this.currentTarget, this.currentTargetType);
      // Reset interact state immediately after trying
      this.controls.moveState.interact = false;
    }

    // Attack logic is handled by Character.update based on moveState.attack
  }

  /**
   * Finds the nearest interactable Character within interaction distance.
   * Uses proximity check instead of raycasting. Angle check is removed.
   * @returns TargetInfo object for the closest character, or null.
   */
  findInteractableCharacterTarget(): TargetInfo | null {
    const playerPosition = this.player.mesh!.position;
    let closestDistSq = this.interactionDistance * this.interactionDistance;
    let closestCharacter: Character | null = null;

    for (const entity of this.interactableEntities) {
      // Check if it's a Character, not the player, and alive
      if (
        !(entity instanceof Character) ||
        entity === this.player ||
        entity.isDead ||
        !entity.mesh ||
        !entity.mesh.visible
      ) {
        continue;
      }

      const targetPosition = entity.mesh.getWorldPosition(new Vector3());
      const distSq = playerPosition.distanceToSquared(targetPosition);

      // Check if within range
      if (distSq < closestDistSq) {
        // No angle check needed for interaction
        closestDistSq = distSq;
        closestCharacter = entity;
      }
    }

    if (closestCharacter) {
      const mesh = closestCharacter.mesh!;
      const position = mesh.getWorldPosition(new Vector3());
      return {
        mesh: mesh,
        instance: closestCharacter,
        point: position.clone(), // Use object position as interaction point
        distance: Math.sqrt(closestDistSq),
      };
    }

    return null;
  }

  // Removed findNearbyCharacter as the logic is now consolidated in findInteractableCharacterTarget

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
      // Make player look at target before initiating interaction
      this.player.lookAt(target.mesh!.position);
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

  // --- Chat Interface Logic ---

  handleChatInput(): void {
    if (this.chatInput && this.chatInput.value.trim() !== "") {
      this.hideChatSuggestions();
    } else {
      this.showChatSuggestions();
    }
  }

  handleChatFocus(): void {
    if (this.chatInput && this.chatInput.value.trim() === "") {
      this.showChatSuggestions();
    }
  }

  handleChatBlur(): void {
    // Delay hiding slightly to allow clicks on suggestions
    setTimeout(() => {
      // Check if focus is still within the chat area (input or suggestions)
      if (
        document.activeElement !== this.chatInput &&
        !this.chatSuggestionsContainer?.contains(document.activeElement)
      ) {
        this.hideChatSuggestions();
      }
    }, 150);
  }

  handleSuggestionClick(event: MouseEvent): void {
    event.preventDefault(); // Prevent default behavior that might affect focus
    const target = event.target as HTMLElement;
    if (target.tagName === "LI" && this.chatInput) {
      const command = target.dataset.command;
      if (command) {
        const currentValue = this.chatInput.value;
        const newValue = command + " " + currentValue;
        this.chatInput.value = newValue;

        // Refocus and set cursor position using requestAnimationFrame
        requestAnimationFrame(() => {
          this.chatInput!.focus(); // Ensure focus is set
          if (document.activeElement !== this.chatInput) {
            this.chatInput!.focus(); // Re-focus if necessary
          }
          this.chatInput!.selectionStart = this.chatInput!.selectionEnd =
            newValue.length;
          this.hideChatSuggestions(); // Hide suggestions after focus and cursor are set
        });
      }
    }
  }

  showChatSuggestions(): void {
    if (this.chatSuggestionsContainer && this.isChatOpen) {
      this.chatSuggestionsContainer.classList.remove("hidden");
    }
  }

  hideChatSuggestions(): void {
    if (this.chatSuggestionsContainer) {
      this.chatSuggestionsContainer.classList.add("hidden");
    }
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
    this.handleChatInput(); // Show/hide suggestions based on initial (empty) value

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
        this.hideChatSuggestions(); // Hide suggestions when sending

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
            this.game.questManager.checkAllQuestsCompletion();
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
    this.hideChatSuggestions(); // Hide suggestions on close
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
