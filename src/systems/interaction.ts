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
  ActiveGather,
} from "../core/utils";
import { Controls } from "../controls/controls";
import { Game } from "../main";
import { sendToGemini, generateChatPrompt } from "../ai/api";
import { INTERACTION_DISTANCE, AIM_TOLERANCE } from "../core/constants";

export class InteractionSystem {
  player: Character;
  camera: PerspectiveCamera;
  interactableEntities: Array<any>;
  controls: Controls;
  inventory: Inventory;
  eventLog: EventLog;
  raycaster: Raycaster;
  interactionDistance: number = INTERACTION_DISTANCE;
  aimTolerance: number = AIM_TOLERANCE;
  currentTarget: any | null = null;
  currentTargetMesh: Object3D | null = null;
  interactionPromptElement: HTMLElement | null;
  activeGather: ActiveGather | null = null;
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
    if (this.activeGather) {
      const moved = this.player.velocity.lengthSq() * deltaTime > 0.001;
      if (!this.controls.moveState.interact || moved) {
        this.cancelGatherAction();
        return;
      }
      this.updateGatherAction(deltaTime);
      return;
    }
    const targetInfo = this.findInteractableTarget();
    if (
      targetInfo?.instance?.userData?.isInteractable &&
      targetInfo.instance !== this.player
    ) {
      if (this.currentTarget !== targetInfo.instance) {
        this.currentTarget = targetInfo.instance;
        this.currentTargetMesh = targetInfo.mesh;
        this.showPrompt(
          targetInfo.instance.userData.prompt ||
            (this.game.mobileControls?.isActive()
              ? "Tap Interact"
              : "Press E to interact")
        );
      }
      if (this.controls.moveState.interact && !this.activeGather)
        this.tryInteract(this.currentTarget);
    } else if (this.currentTarget) {
      this.currentTarget = null;
      this.currentTargetMesh = null;
      this.hidePrompt();
    }
  }

  findInteractableTarget(): TargetInfo | null {
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
        if (entityRef instanceof Character && entityRef.isDead) return false;
        const distSq = playerPosition.distanceToSquared(mesh.position);
        return distSq < 100;
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
            hitObject.userData?.entityReference
          ) {
            rootInstance = hitObject.userData.entityReference;
            rootMesh = hitObject;
            break;
          }
          if (
            hitObject.userData?.isInteractable &&
            hitObject.userData?.isSimpleObject
          ) {
            rootInstance =
              this.interactableEntities.find(
                (e) => (e as any).mesh === hitObject
              ) || hitObject.userData?.entityReference;
            rootMesh = hitObject;
            break;
          }
          hitObject = hitObject.parent;
        }
        if (
          rootInstance &&
          rootMesh &&
          rootInstance.userData?.isInteractable &&
          rootInstance !== this.player
        ) {
          if (rootInstance instanceof Character && rootInstance.isDead)
            continue;
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
    return closestHit || this.findNearbyInteractable();
  }

  findNearbyInteractable(): TargetInfo | null {
    const playerPosition = this.player.mesh!.getWorldPosition(new Vector3());
    let closestDistSq = this.interactionDistance * this.interactionDistance;
    let closestInstance: any | null = null;
    this.interactableEntities.forEach((item) => {
      if (
        !item?.userData?.isInteractable ||
        item === this.player ||
        item === this.player.mesh
      )
        return;
      if (item instanceof Character && item.isDead) return;
      if (item.userData?.isSimpleObject && !(item as any).isActive) return;
      const objMesh = (item as any).mesh ?? item;
      if (!objMesh || !objMesh.visible) return;
      this.objectPosition.copy(objMesh.getWorldPosition(new Vector3()));
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
      this.objectPosition.copy(mesh.getWorldPosition(new Vector3()));
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
    if (!targetInstance || !targetInstance.userData?.isInteractable) return;
    if (targetInstance instanceof Character && targetInstance.isDead) {
      this.showPrompt("Cannot interact with the deceased.", 2000);
      return;
    }
    let targetPosition: Vector3;
    const targetMesh = (targetInstance as any).mesh ?? targetInstance;
    if (targetMesh instanceof Object3D) {
      targetPosition = targetMesh.position;
    } else {
      return;
    }
    const distance = this.player.mesh!.position.distanceTo(targetPosition);
    if (distance > this.interactionDistance * 1.1) {
      this.currentTarget = null;
      this.currentTargetMesh = null;
      this.hidePrompt();
      return;
    }
    let result: InteractionResult | null = null;
    if (typeof targetInstance.interact === "function") {
      result = targetInstance.interact(this.player);
    } else if (
      targetInstance.userData.interactionType === "gather" &&
      targetInstance.userData.resource
    ) {
      this.startGatherAction(targetInstance);
      result = { type: "gather_start" };
    } else {
      const message = `${this.player.name} examined ${targetInstance.name || "object"}.`;
      if (this.player.game)
        this.player.game.logEvent(
          this.player,
          "examine",
          message,
          targetInstance.name || targetInstance.id,
          {},
          targetPosition
        );
      result = { type: "message", message: "You look at the object." };
    }
    if (result) this.handleInteractionResult(result, targetInstance);
    if (
      result?.type !== "gather_start" &&
      !targetInstance.userData?.isInteractable
    ) {
      this.currentTarget = null;
      this.currentTargetMesh = null;
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
          promptDuration = null;
        } else {
          promptText = "Cannot chat with this.";
        }
        break;
      case "item_retrieved":
        promptDuration = null;
        break;
      case "error":
        if (result.message) promptText = result.message;
        break;
      case "gather_start":
        promptDuration = null;
        break;
    }
    if (promptText && promptDuration !== null)
      this.showPrompt(promptText, promptDuration);
  }

  startGatherAction(targetInstance: any): void {
    if (this.activeGather) return;
    const resource = targetInstance.userData.resource as string;
    const gatherTime = (targetInstance.userData.gatherTime as number) || 2000;
    this.activeGather = {
      targetInstance,
      startTime: performance.now(),
      duration: gatherTime,
      resource,
    };
    this.showPrompt(`Gathering ${resource}... (0%)`);

    this.player.velocity.x = 0;
    this.player.velocity.z = 0;
    this.player.isGathering = true;
    this.player.gatherAttackTimer = 0;
    this.player.triggerAction("gather");
  }

  updateGatherAction(deltaTime: number): void {
    if (!this.activeGather) return;
    const elapsedTime = performance.now() - this.activeGather.startTime;
    const progress = Math.min(1, elapsedTime / this.activeGather.duration);
    this.showPrompt(
      `Gathering ${this.activeGather.resource}... (${Math.round(
        progress * 100
      )}%)`
    );
    if (progress >= 1) this.completeGatherAction();
  }

  completeGatherAction(): void {
    if (!this.activeGather) return;
    const { resource, targetInstance } = this.activeGather;
    const targetName = targetInstance.name || targetInstance.id;
    const targetPosition = (targetInstance.mesh ?? targetInstance).position;
    if (this.inventory.addItem(resource, 1)) {
      if (this.player.game)
        this.player.game.logEvent(
          this.player,
          "gather_complete",
          `${this.player.name} gathered 1 ${resource}.`,
          targetName,
          { resource },
          targetPosition
        );
      if (targetInstance.userData.isDepletable) {
        targetInstance.userData.isInteractable = false;
        const meshToHide = targetInstance.mesh ?? targetInstance;
        if (meshToHide instanceof Object3D) meshToHide.visible = false;
        const respawnTime = targetInstance.userData.respawnTime || 15000;
        setTimeout(() => {
          if (targetInstance.userData) {
            targetInstance.userData.isInteractable = true;
            if (meshToHide instanceof Object3D) meshToHide.visible = true;
          }
        }, respawnTime);
      } else if (
        targetInstance.userData.isSimpleObject &&
        typeof (targetInstance as any).removeFromWorld === "function"
      ) {
        (targetInstance as any).removeFromWorld();
      }
    } else {
      if (this.player.game)
        this.player.game.logEvent(
          this.player,
          "gather_fail",
          `${this.player.name}'s inventory full, could not gather ${resource}.`,
          targetName,
          { resource },
          targetPosition
        );
    }
    this.player.isGathering = false;
    this.player.gatherAttackTimer = 0;
    this.player.isPerformingAction = false;
    this.player.actionType = "none";
    if (this.player.attackAction && this.player.attackAction.isRunning()) {
      this.player.attackAction.stop();
      if (this.player.idleAction) this.player.idleAction.reset().play();
    }
    this.activeGather = null;
    this.hidePrompt();
    this.currentTarget = null;
    this.currentTargetMesh = null;
  }

  cancelGatherAction(): void {
    if (!this.activeGather) return;
    const targetName =
      this.activeGather.targetInstance.name ||
      this.activeGather.targetInstance.id;
    const targetPosition = (
      this.activeGather.targetInstance.mesh ?? this.activeGather.targetInstance
    ).position;
    if (this.player.game)
      this.player.game.logEvent(
        this.player,
        "gather_cancel",
        `Gathering ${this.activeGather.resource} cancelled.`,
        targetName,
        { resource: this.activeGather.resource },
        targetPosition
      );
    this.player.isGathering = false;
    this.player.gatherAttackTimer = 0;
    this.player.isPerformingAction = false;
    this.player.actionType = "none";
    if (this.player.attackAction && this.player.attackAction.isRunning()) {
      this.player.attackAction.stop();
      if (this.player.idleAction) this.player.idleAction.reset().play();
    }
    this.activeGather = null;
    this.hidePrompt();
  }

  showPrompt(text: string, duration: number | null = null): void {
    if (
      !this.interactionPromptElement ||
      (this.activeGather && duration === null)
    )
      return;
    this.interactionPromptElement.textContent = text;
    this.interactionPromptElement.style.display = "block";
    clearTimeout(this.promptTimeout ?? undefined);
    this.promptTimeout = null;
    if (duration && duration > 0) {
      this.promptTimeout = setTimeout(() => {
        if (this.interactionPromptElement?.textContent === text)
          this.hidePrompt();
      }, duration);
    }
  }

  hidePrompt(): void {
    if (
      !this.interactionPromptElement ||
      this.activeGather ||
      this.promptTimeout
    )
      return;
    this.interactionPromptElement.style.display = "none";
    this.interactionPromptElement.textContent = "";
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

        this.player.showTemporaryMessage(message);
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
            targetAtSendStart.showTemporaryMessage(npcMessage);
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
            targetAtSendStart.showTemporaryMessage(
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
