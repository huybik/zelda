// File: /src/system.ts
import {
  PerspectiveCamera,
  Object3D,
  Vector3,
  Quaternion,
  Raycaster,
  Box3,
  Matrix4,
  Vector2,
  MathUtils,
} from "three";
import { Character, Entity } from "./entities"; // Added Entity import
import { InteractableObject } from "./objects";
import {
  Inventory,
  EventLog,
  InteractionResult,
  TargetInfo,
  ActiveGather,
  MoveState,
  smoothVectorLerp,
  KeyState,
  MouseState,
} from "./utils";
import type { Game } from "./main"; // Import Game type
import { sendToGemini } from "./ai"; // Import sendToGemini
import { MobileControls } from "./mobileControls"; // Import MobileControls

export class InteractionSystem {
  player: Character;
  camera: PerspectiveCamera;
  interactableEntities: Array<any>;
  controls: Controls;
  inventory: Inventory;
  eventLog: EventLog; // Now references the current player's event log
  raycaster: Raycaster;
  interactionDistance: number = 3.0;
  aimTolerance: number = Math.PI / 6;
  currentTarget: any | null = null;
  currentTargetMesh: Object3D | null = null;
  interactionPromptElement: HTMLElement | null;
  activeGather: ActiveGather | null = null;
  promptTimeout: ReturnType<typeof setTimeout> | null = null;
  game: Game; // Added reference to the game instance

  // Chat UI elements
  chatContainer: HTMLElement | null;
  chatInput: HTMLInputElement | null;
  isChatOpen: boolean = false;
  chatTarget: Character | null = null;

  // Bound event handlers for chat
  boundSendMessage: (() => Promise<void>) | null = null;
  boundHandleChatKeyDown: ((e: KeyboardEvent) => void) | null = null;
  boundCloseChat: (() => void) | null = null; // Added bound close handler

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
    // Added game parameter
    this.player = player;
    this.camera = camera;
    this.interactableEntities = interactableEntities;
    this.controls = controls;
    this.inventory = inventory;
    this.eventLog = eventLog; // Initial event log
    this.game = game; // Store game instance
    this.raycaster = new Raycaster();
    this.interactionPromptElement =
      document.getElementById("interaction-prompt");

    // Initialize chat UI elements
    this.chatContainer = document.getElementById("chat-container");
    this.chatInput = document.getElementById("chat-input") as HTMLInputElement;
  }

  update(deltaTime: number): void {
    // Don't update interaction system if chat is open
    if (this.isChatOpen) {
      // Optionally hide interaction prompt while chatting
      if (this.interactionPromptElement?.style.display !== "none") {
        this.hidePrompt();
      }
      return;
    }

    if (this.activeGather) {
      const moved = this.player.velocity.lengthSq() * deltaTime > 0.001;
      if (moved || this.controls.consumeInteraction()) {
        this.cancelGatherAction();
        return;
      }
      this.updateGatherAction(deltaTime);
      return;
    }
    const targetInfo = this.findInteractableTarget();
    if (targetInfo?.instance?.userData?.isInteractable) {
      if (this.currentTarget !== targetInfo.instance) {
        this.currentTarget = targetInfo.instance;
        this.currentTargetMesh = targetInfo.mesh;
        this.showPrompt(
          targetInfo.instance.userData.prompt ||
            (this.game.mobileControls?.isActive()
              ? "Tap Interact"
              : "Press E to interact") // Mobile specific prompt
        );
      }
      if (this.controls.consumeInteraction())
        this.tryInteract(this.currentTarget);
    } else if (this.currentTarget) {
      this.currentTarget = null;
      this.currentTargetMesh = null;
      this.hidePrompt();
    }
  }

  findInteractableTarget(): TargetInfo | null {
    // On mobile, prioritize nearby check over raycasting from center screen?
    // Or keep raycasting as primary? Let's keep raycasting for now.
    // if (this.game.mobileControls?.isActive()) {
    //     return this.findNearbyInteractable();
    // }

    this.raycaster.setFromCamera(new Vector2(0, 0), this.camera);
    this.raycaster.far = this.interactionDistance;
    const playerPosition = this.player.mesh!.position;
    const meshesToCheck = this.interactableEntities
      .map((item) => (item as any).mesh ?? item)
      .filter((mesh): mesh is Object3D => {
        if (
          !(mesh instanceof Object3D) ||
          !mesh.userData?.isInteractable ||
          !mesh.visible
        )
          return false;
        // Exclude dead characters unless interaction allows it
        const entityRef = mesh.userData?.entityReference;
        if (entityRef instanceof Character && entityRef.isDead) return false;
        const distSq = playerPosition.distanceToSquared(mesh.position);
        return distSq < 100; // Only check objects within 10 units (10^2 = 100)
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
        if (rootInstance && rootMesh && rootInstance.userData?.isInteractable) {
          // Check if the root instance is a dead character
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
    // Fallback to nearby check if raycast fails or on mobile?
    // Let's always fallback for now.
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
        return; // Check against player and player mesh
      // Exclude dead characters
      if (item instanceof Character && item.isDead) return;
      if (
        item.userData?.isSimpleObject &&
        !(item as InteractableObject).isActive
      )
        return;

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
    // Check if target is dead
    if (targetInstance instanceof Character && targetInstance.isDead) {
      this.showPrompt("Cannot interact with the deceased.", 2000);
      return;
    }

    let targetPosition: Vector3;
    const targetMesh = (targetInstance as any).mesh ?? targetInstance;
    if (targetMesh instanceof Object3D) {
      targetPosition = targetMesh.position;
    } else {
      console.warn("Target instance has no mesh or position", targetInstance);
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
      result = targetInstance.interact(this.player); // Pass only player
    } else if (
      targetInstance.userData.interactionType === "gather" &&
      targetInstance.userData.resource
    ) {
      this.startGatherAction(targetInstance);
      result = { type: "gather_start" };
    } else {
      const message = `Examined ${targetInstance.name || "object"}.`;
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

  // Updated handleInteractionResult
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
      case "dialogue": // Keep dialogue for potential future use or simple interactions
        if (result.text) {
          promptText = `${targetInstance.name ?? "NPC"}: ${result.text}`;
          promptDuration = 4000;
          // Optionally handle options here if needed
        }
        break;
      case "chat": // Handle the new chat type
        if (targetInstance instanceof Character) {
          this.openChatInterface(targetInstance);
          promptDuration = null; // Don't show prompt, open UI instead
        } else {
          promptText = "Cannot chat with this.";
        }
        break;
      case "item_retrieved":
        promptDuration = null; // No prompt needed, log handles it
        break;
      case "error":
        if (result.message) promptText = result.message;
        break;
      case "gather_start":
        promptDuration = null; // Gather prompt handled separately
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
    // Log gather start event
    if (this.player.game)
      this.player.game.logEvent(
        this.player,
        "gather_start",
        `Started gathering ${resource}...`,
        targetInstance.name || targetInstance.id,
        { resource },
        this.player.mesh!.position
      );
    this.player.velocity.x = 0;
    this.player.velocity.z = 0;
    this.player.isGathering = true; // Set gathering state
    this.player.gatherAttackTimer = 0; // Reset timer
    if (this.player.attackAction) {
      this.player.triggerAction("gather"); // Use triggerAction
    }
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
      // Log gather success event
      if (this.player.game)
        this.player.game.logEvent(
          this.player,
          "gather_complete",
          `Gathered 1 ${resource}.`,
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
            // Optional: Log respawn event
            // if (this.player.game) this.player.game.logEvent(this.player, 'respawn_object', `${targetName} respawned.`, targetName, {}, targetPosition);
          }
        }, respawnTime);
      } else if (
        targetInstance.userData.isSimpleObject &&
        typeof (targetInstance as InteractableObject).removeFromWorld ===
          "function"
      ) {
        (targetInstance as InteractableObject).removeFromWorld();
      }
    } else {
      // Log gather fail (inventory full) event
      if (this.player.game)
        this.player.game.logEvent(
          this.player,
          "gather_fail",
          `Inventory full, could not gather ${resource}.`,
          targetName,
          { resource },
          targetPosition
        );
    }
    this.player.isGathering = false; // Reset gathering state
    this.player.gatherAttackTimer = 0; // Reset timer
    this.player.isPerformingAction = false; // Also reset performing action if gather uses it
    this.player.actionType = "none";
    if (this.player.attackAction && this.player.attackAction.isRunning()) {
      this.player.attackAction.stop(); // Stop attack animation if it was running
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
    // Log gather cancel event
    if (this.player.game)
      this.player.game.logEvent(
        this.player,
        "gather_cancel",
        `Gathering ${this.activeGather.resource} cancelled.`,
        targetName,
        { resource: this.activeGather.resource },
        targetPosition
      );

    this.player.isGathering = false; // Reset gathering state
    this.player.gatherAttackTimer = 0; // Reset timer
    this.player.isPerformingAction = false; // Also reset performing action
    this.player.actionType = "none";
    if (this.player.attackAction && this.player.attackAction.isRunning()) {
      this.player.attackAction.stop(); // Stop attack animation
      // Optionally fade back to idle/walk
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

  // --- Chat Interface Logic ---

  generateChatPrompt(target: Character, playerMessage: string): string {
    // Get last 5 events from the target's perspective
    const recentEvents = target.eventLog.entries
      .slice(-5)
      .map((entry) => entry.message)
      .join("\n");
    const persona = target.persona || "a friendly villager"; // Fallback persona

    return `
You are an NPC named ${target.name} with the following persona: ${persona}
The player character is named ${
      this.player.name
    } just said to you: "${playerMessage}"

Recent events observed by you:
${recentEvents || "Nothing significant recently."}

Respond to the player in brief 1-2 sentences.
`.trim();
  }

  async openChatInterface(target: Character): Promise<void> {
    if (!this.chatContainer || !this.chatInput || this.isChatOpen) return;
    this.game.setPauseState(true);
    this.isChatOpen = true;
    this.chatTarget = target;
    this.chatContainer.classList.remove("hidden");
    this.chatInput.value = "";
    this.chatInput.focus(); // Focus might bring up virtual keyboard

    // Define bound handlers if they don't exist
    if (!this.boundSendMessage) {
      this.boundSendMessage = async () => {
        if (!this.chatTarget || !this.chatInput) return;

        const message = this.chatInput.value.trim();
        if (!message) return;
        this.player.showTemporaryMessage(message);

        this.chatInput.value = "";
        this.chatInput.disabled = true; // Disable input while waiting for response

        // 2. Log player's message
        this.game.logEvent(
          this.player,
          "chat",
          `${this.player.name} said "${message}" to ${this.chatTarget.name}.`,
          this.chatTarget,
          { message: message },
          this.player.mesh!.position
        );

        // 3. Generate prompt and call API
        const prompt = this.generateChatPrompt(this.chatTarget, message);
        try {
          const responseJson = await sendToGemini(prompt);
          let npcMessage = "Hmm....";
          if (responseJson) {
            const parsedResponse = JSON.parse(responseJson)["response"];
            npcMessage = parsedResponse?.trim() || "Hmm....";
            console.log("NPC response:", npcMessage);
          }

          this.chatTarget.showTemporaryMessage(npcMessage);
          this.chatTarget.game?.logEvent(
            this.chatTarget,
            "chat",
            `${this.chatTarget.name} said "${npcMessage}" to ${this.player.name}.`,
            this.player,
            { message: npcMessage },
            this.chatTarget.mesh!.position
          );

          // Add quest completion check here
          this.game.checkQuestCompletion(this.chatTarget, npcMessage);
        } catch (error) {
          console.error("Error during chat API call:", error);
          this.chatTarget.showTemporaryMessage("I... don't know what to say.");
          this.game.logEvent(
            this.chatTarget,
            "chat_error",
            `${this.chatTarget.name} failed to respond to ${this.player.name}.`,
            this.player,
            { error: (error as Error).message },
            this.chatTarget.mesh!.position
          );
        } finally {
          this.closeChatInterface();
          // this.chatInput.disabled = false; // Re-enable input
          // this.chatInput.focus();
        }
      };
    }

    if (!this.boundHandleChatKeyDown) {
      this.boundHandleChatKeyDown = (e: KeyboardEvent) => {
        if (e.key === "Enter" && this.boundSendMessage) {
          this.boundSendMessage();
        }
      };
    }

    if (!this.boundCloseChat) {
      this.boundCloseChat = () => {
        this.closeChatInterface();
      };
    }

    // Add event listeners using bound handlers

    this.chatInput.addEventListener("keydown", this.boundHandleChatKeyDown);
  }

  closeChatInterface(): void {
    if (!this.isChatOpen || !this.chatContainer || !this.chatInput) return;

    this.isChatOpen = false;
    this.chatTarget = null;
    this.chatContainer.classList.add("hidden");
    this.game.setPauseState(false); // Unpause game

    if (this.boundHandleChatKeyDown) {
      this.chatInput.removeEventListener(
        "keydown",
        this.boundHandleChatKeyDown
      );
    }
  }
}

export class Physics {
  player: Character;
  collidableObjects: Object3D[];
  collisionCheckRadiusSq: number = 20 * 20;
  private overlap = new Vector3();
  private centerPlayer = new Vector3();
  private centerObject = new Vector3();
  private sizePlayer = new Vector3();
  private sizeObject = new Vector3();
  private pushVector = new Vector3();
  private objectBoundingBox = new Box3();

  constructor(player: Character, collidableObjects: Object3D[]) {
    this.player = player;
    this.collidableObjects = collidableObjects;
  }

  update(deltaTime: number): void {
    if (this.player.isDead || !this.player.mesh) return;
    const playerBox = this.player.boundingBox;
    if (!playerBox || playerBox.isEmpty()) this.player.updateBoundingBox();
    const playerPos = this.player.mesh!.position;
    this.collidableObjects.forEach((object) => {
      if (
        !object ||
        object === this.player.mesh ||
        !object.userData?.isCollidable ||
        object.userData?.isTerrain ||
        !object.parent
      )
        return;
      // Check if the collidable object is a dead character's mesh
      const entityRef = object.userData?.entityReference;
      if (entityRef instanceof Character && entityRef.isDead) return;

      const objectPosition = object.getWorldPosition(new Vector3());
      if (
        playerPos.distanceToSquared(objectPosition) >
        this.collisionCheckRadiusSq
      )
        return;
      let objectBox = object.userData.boundingBox as Box3 | undefined;
      if (!objectBox || objectBox.isEmpty()) {
        this.objectBoundingBox.setFromObject(object, true);
        objectBox = this.objectBoundingBox;
        if (objectBox.isEmpty()) return;
      }
      if (playerBox.intersectsBox(objectBox)) {
        this.resolveCollision(playerBox, objectBox, object);
        this.player.updateBoundingBox();
      }
    });
  }

  resolveCollision(playerBox: Box3, objectBox: Box3, object: Object3D): void {
    playerBox.getCenter(this.centerPlayer);
    objectBox.getCenter(this.centerObject);
    playerBox.getSize(this.sizePlayer);
    objectBox.getSize(this.sizeObject);
    this.overlap.x =
      this.sizePlayer.x / 2 +
      this.sizeObject.x / 2 -
      Math.abs(this.centerPlayer.x - this.centerObject.x);
    this.overlap.y =
      this.sizePlayer.y / 2 +
      this.sizeObject.y / 2 -
      Math.abs(this.centerPlayer.y - this.centerObject.y);
    this.overlap.z =
      this.sizePlayer.z / 2 +
      this.sizeObject.z / 2 -
      Math.abs(this.centerPlayer.z - this.centerObject.z);
    let minOverlap = Infinity;
    let pushAxis = -1;
    if (this.overlap.x > 0 && this.overlap.x < minOverlap) {
      minOverlap = this.overlap.x;
      pushAxis = 0;
    }
    if (this.overlap.y > 0 && this.overlap.y < minOverlap) {
      minOverlap = this.overlap.y;
      pushAxis = 1;
    }
    if (this.overlap.z > 0 && this.overlap.z < minOverlap) {
      minOverlap = this.overlap.z;
      pushAxis = 2;
    }
    if (pushAxis === -1 || minOverlap < 0.0001) return;
    this.pushVector.set(0, 0, 0);
    const pushMagnitude = minOverlap + 0.001;
    switch (pushAxis) {
      case 0:
        this.pushVector.x =
          this.centerPlayer.x > this.centerObject.x
            ? pushMagnitude
            : -pushMagnitude;
        if (Math.sign(this.player.velocity.x) === Math.sign(this.pushVector.x))
          this.player.velocity.x = 0;
        break;
      case 1:
        this.pushVector.y =
          this.centerPlayer.y > this.centerObject.y
            ? pushMagnitude
            : -pushMagnitude;
        if (this.pushVector.y > 0.01 && this.player.velocity.y <= 0) {
          this.player.velocity.y = 0;
          this.player.isOnGround = true;
          this.player.canJump = true;
        } else if (this.pushVector.y < -0.01 && this.player.velocity.y > 0) {
          this.player.velocity.y = 0;
        }
        break;
      case 2:
        this.pushVector.z =
          this.centerPlayer.z > this.centerObject.z
            ? pushMagnitude
            : -pushMagnitude;
        if (Math.sign(this.player.velocity.z) === Math.sign(this.pushVector.z))
          this.player.velocity.z = 0;
        break;
    }
    this.player.mesh!.position.add(this.pushVector);
  }
}

export class ThirdPersonCamera {
  camera: PerspectiveCamera;
  target: Object3D;
  idealOffset: Vector3 = new Vector3(0, 2.5, -2.5);
  minOffsetDistance: number = 1.5;
  maxOffsetDistance: number = 12.0;
  pitchAngle: number = 0.15;
  minPitch: number = -Math.PI / 3;
  maxPitch: number = Math.PI / 2.5;
  pitchSensitivity: number = 0.0025;
  lerpAlphaPositionBase: number = 0.05;
  lerpAlphaLookatBase: number = 0.1;
  collisionRaycaster: Raycaster;
  collisionOffset: number = 0.3;
  currentPosition: Vector3;
  currentLookat: Vector3;
  private targetPosition = new Vector3();
  private offset = new Vector3();
  private idealPosition = new Vector3();
  private finalPosition = new Vector3();
  private idealLookat = new Vector3();
  private rayOrigin = new Vector3();
  private cameraDirection = new Vector3();

  constructor(camera: PerspectiveCamera, target: Object3D) {
    this.camera = camera;
    this.target = target;
    this.collisionRaycaster = new Raycaster();
    this.collisionRaycaster.camera = camera;
    this.currentPosition = new Vector3();
    this.currentLookat = new Vector3();
    this.target.getWorldPosition(this.currentLookat);
    this.currentLookat.y += (target.userData?.height ?? 1.8) * 0.6;
    this.update(0.016, []);
    this.camera.position.copy(this.currentPosition);
    this.camera.lookAt(this.currentLookat);
  }

  handleMouseInput(deltaX: number, deltaY: number): void {
    // deltaX is now handled by player rotation directly in Controls/MobileControls
    this.pitchAngle -= deltaY * this.pitchSensitivity;
    this.pitchAngle = MathUtils.clamp(
      this.pitchAngle,
      this.minPitch,
      this.maxPitch
    );
  }

  update(deltaTime: number, collidables: Object3D[]): void {
    if (!this.target || !this.target.parent) return; // Ensure target is still valid and in scene
    this.target.getWorldPosition(this.targetPosition);
    const targetQuaternion = this.target.quaternion;
    this.offset
      .copy(this.idealOffset)
      .applyAxisAngle(new Vector3(1, 0, 0), this.pitchAngle)
      .applyQuaternion(targetQuaternion);
    this.idealPosition.copy(this.targetPosition).add(this.offset);
    this.cameraDirection.copy(this.idealPosition).sub(this.targetPosition);
    let idealDistance = this.cameraDirection.length();
    this.cameraDirection.normalize();
    this.rayOrigin
      .copy(this.targetPosition)
      .addScaledVector(this.cameraDirection, 0.2);
    this.collisionRaycaster.set(this.rayOrigin, this.cameraDirection);
    this.collisionRaycaster.far = Math.max(0, idealDistance - 0.2);
    const collisionCheckObjects = collidables.filter(
      (obj) => obj !== this.target && obj?.userData?.isCollidable
    );
    const intersects = this.collisionRaycaster.intersectObjects(
      collisionCheckObjects,
      true
    );
    let actualDistance = idealDistance;
    if (intersects.length > 0) {
      actualDistance =
        intersects.reduce(
          (minDist, intersect) => Math.min(minDist, intersect.distance),
          idealDistance
        ) +
        0.2 -
        this.collisionOffset;
      actualDistance = Math.max(this.minOffsetDistance, actualDistance);
    }
    actualDistance = MathUtils.clamp(
      actualDistance,
      this.minOffsetDistance,
      this.maxOffsetDistance
    );
    this.finalPosition
      .copy(this.targetPosition)
      .addScaledVector(this.cameraDirection, actualDistance);
    const targetHeight = this.target.userData?.height ?? 1.8;
    this.idealLookat
      .copy(this.targetPosition)
      .add(new Vector3(0, targetHeight * 0.6, 0));
    smoothVectorLerp(
      this.currentPosition,
      this.finalPosition,
      this.lerpAlphaPositionBase,
      deltaTime
    );
    smoothVectorLerp(
      this.currentLookat,
      this.idealLookat,
      this.lerpAlphaLookatBase,
      deltaTime
    );
    this.camera.position.copy(this.currentPosition);
    this.camera.lookAt(this.currentLookat);
  }
}

export class Controls {
  player: Character | null;
  cameraController: ThirdPersonCamera | null;
  domElement: HTMLElement;
  game: Game | null; // Add reference to the game instance
  keys: KeyState = {};
  mouse: MouseState = { x: 0, y: 0, dx: 0, dy: 0, buttons: {} };
  isPointerLocked: boolean = false;
  playerRotationSensitivity: number = 0.0025;
  moveState: MoveState = {
    forward: 0,
    right: 0,
    jump: false,
    sprint: false,
    interact: false,
    attack: false,
  };
  keyDownListeners: Record<string, Array<() => void>> = {};
  mouseClickListeners: Record<number, Array<(event: MouseEvent) => void>> = {};

  // keyboard parts
  boundOnKeyDown: (event: KeyboardEvent) => void;
  boundOnKeyUp: (event: KeyboardEvent) => void;
  boundOnMouseDown: (event: MouseEvent) => void;
  boundOnMouseUp: (event: MouseEvent) => void;
  boundOnMouseMove: (event: MouseEvent) => void;
  boundOnClick: (event: MouseEvent) => void;
  boundOnPointerLockChange: () => void;
  boundOnPointerLockError: () => void;

  constructor(
    player: Character | null,
    cameraController: ThirdPersonCamera | null,
    domElement: HTMLElement | null,
    game: Game | null
  ) {
    this.player = player;
    this.cameraController = cameraController;
    this.domElement = domElement ?? document.body;
    this.game = game;

    // Bind methods
    this.boundOnKeyDown = this.onKeyDown.bind(this);
    this.boundOnKeyUp = this.onKeyUp.bind(this);
    this.boundOnMouseDown = this.onMouseDown.bind(this);
    this.boundOnMouseUp = this.onMouseUp.bind(this);
    this.boundOnMouseMove = this.onMouseMove.bind(this);
    this.boundOnClick = this.onClick.bind(this);
    this.boundOnPointerLockChange = this.onPointerLockChange.bind(this);
    this.boundOnPointerLockError = this.onPointerLockError.bind(this);

    this.initListeners();
  }

  initListeners(): void {
    // Only add keyboard/mouse listeners if not on mobile
    if (!this.game?.mobileControls?.isActive()) {
      document.addEventListener("keydown", this.boundOnKeyDown, false);
      document.addEventListener("keyup", this.boundOnKeyUp, false);
      document.addEventListener("mousedown", this.boundOnMouseDown, false);
      document.addEventListener("mouseup", this.boundOnMouseUp, false);
      document.addEventListener("mousemove", this.boundOnMouseMove, false);
      this.domElement.addEventListener("click", this.boundOnClick, false);

      // Pointer Lock only for desktop
      document.addEventListener(
        "pointerlockchange",
        this.boundOnPointerLockChange,
        false
      );
      document.addEventListener(
        "pointerlockerror",
        this.boundOnPointerLockError,
        false
      );
    } else {
      // On mobile, maybe still listen for Escape key for UI?
      document.addEventListener("keydown", (e) => {
        if (e.code === "Escape") this.handleEscapeKey();
      });
    }
  }

  addKeyDownListener(keyCode: string, callback: () => void): void {
    if (!this.keyDownListeners[keyCode]) this.keyDownListeners[keyCode] = [];
    this.keyDownListeners[keyCode].push(callback);
  }

  addMouseClickListener(
    buttonIndex: number,
    callback: (event: MouseEvent) => void
  ): void {
    if (!this.mouseClickListeners[buttonIndex])
      this.mouseClickListeners[buttonIndex] = [];
    this.mouseClickListeners[buttonIndex].push(callback);
  }

  // --- Pointer Lock (Desktop) ---
  lockPointer(): void {
    // Only attempt lock if not on mobile
    if (
      !this.game?.mobileControls?.isActive() &&
      "requestPointerLock" in this.domElement &&
      document.pointerLockElement !== this.domElement
    ) {
      this.domElement.requestPointerLock();
    }
  }

  unlockPointer(): void {
    if (
      !this.game?.mobileControls?.isActive() &&
      document.pointerLockElement === this.domElement
    )
      document.exitPointerLock();
  }

  onPointerLockChange(): void {
    // This should only fire on desktop now
    if (document.pointerLockElement === this.domElement) {
      this.isPointerLocked = true;
      document.body.classList.add("pointer-locked"); // Add class to body
      this.mouse.dx = 0;
      this.mouse.dy = 0;
      // Attempt to unpause the game when pointer locks
      const inventoryIsOpen = this.game?.inventoryDisplay?.isOpen ?? false;
      const journalIsOpen = this.game?.journalDisplay?.isOpen ?? false;
      const chatIsOpen = this.game?.interactionSystem?.isChatOpen ?? false;
      if (!inventoryIsOpen && !journalIsOpen && !chatIsOpen) {
        this.game?.setPauseState(false);
      }
    } else {
      this.isPointerLocked = false;
      document.body.classList.remove("pointer-locked"); // Remove class from body
      // Reset keyboard state if lock is lost
      this.keys = {};
      this.mouse.buttons = {};
      this.mouse.dx = 0;
      this.mouse.dy = 0;
      this.updateContinuousMoveState(); // Reset keyboard movement

      // Pause the game when pointer unlocks, unless a UI element that requires interaction is open
      const inventoryIsOpen = this.game?.inventoryDisplay?.isOpen ?? false;
      const journalIsOpen = this.game?.journalDisplay?.isOpen ?? false;
      const chatIsOpen = this.game?.interactionSystem?.isChatOpen ?? false;
      if (!inventoryIsOpen && !journalIsOpen && !chatIsOpen) {
        this.game?.setPauseState(true);
      }
    }
  }

  onPointerLockError(): void {
    console.error("Pointer lock failed.");
    this.isPointerLocked = false;
    document.body.classList.remove("pointer-locked"); // Ensure class is removed on error
  }

  // --- Keyboard Input ---
  onKeyDown(event: KeyboardEvent): void {
    // Ignore if mobile controls are active
    if (this.game?.mobileControls?.isActive()) return;

    const keyCode = event.code;
    if (this.game?.interactionSystem?.isChatOpen && keyCode !== "Escape") {
      return; // Allow chat input
    }

    if (this.keys[keyCode]) return; // Prevent repeated triggers
    this.keys[keyCode] = true;
    this.keyDownListeners[keyCode]?.forEach((cb) => cb());

    // Handle specific key actions only if not handled by mobile
    if (keyCode === "Space") this.moveState.jump = true;
    if (keyCode === "KeyE") this.moveState.interact = true;
    if (keyCode === "KeyF") this.moveState.attack = true;
    if (keyCode === "Escape") this.handleEscapeKey(); // Handle escape separately

    this.updateContinuousMoveState();
  }

  onKeyUp(event: KeyboardEvent): void {
    // Ignore if mobile controls are active
    if (this.game?.mobileControls?.isActive()) return;

    const keyCode = event.code;
    this.keys[keyCode] = false;

    // Reset specific key actions only if not handled by mobile
    if (keyCode === "KeyF") this.moveState.attack = false;
    // Jump and Interact are consumed, not held continuously based on keyup

    this.updateContinuousMoveState();
  }

  // Centralized Escape key handling
  handleEscapeKey(): void {
    if (this.game?.interactionSystem?.isChatOpen) {
      this.game.interactionSystem.closeChatInterface();
    } else if (this.game?.inventoryDisplay?.isOpen) {
      this.game.inventoryDisplay.hide();
      this.game?.setPauseState(false);
    } else if (this.game?.journalDisplay?.isOpen) {
      this.game.journalDisplay.hide();
      this.game?.setPauseState(false);
    } else if (this.isPointerLocked) {
      this.unlockPointer();
    }
  }

  // --- Mouse Input ---
  onMouseDown(event: MouseEvent): void {
    // Ignore if mobile controls are active
    if (this.game?.mobileControls?.isActive()) return;
    if (this.game?.interactionSystem?.isChatOpen) return;
    this.mouse.buttons[event.button] = true;
    this.mouseClickListeners[event.button]?.forEach((cb) => cb(event));
  }

  onMouseUp(event: MouseEvent): void {
    // Ignore if mobile controls are active
    if (this.game?.mobileControls?.isActive()) return;
    this.mouse.buttons[event.button] = false;
  }

  onMouseMove(event: MouseEvent): void {
    // Ignore if mobile controls are active
    if (this.game?.mobileControls?.isActive()) return;

    if (this.isPointerLocked) {
      this.mouse.dx += event.movementX ?? 0;
      this.mouse.dy += event.movementY ?? 0;
    } else {
      this.mouse.x = event.clientX;
      this.mouse.y = event.clientY;
    }
  }

  onClick(event: MouseEvent): void {
    // Ignore if mobile controls are active
    if (this.game?.mobileControls?.isActive()) return;

    const targetElement = event.target as HTMLElement;
    const isGameContainerClick =
      targetElement === this.domElement ||
      (this.domElement.contains(targetElement) &&
        targetElement.closest(
          "#inventory-display, #journal-display, #chat-container, #minimap-canvas, #welcome-banner, #mobile-controls-layer" // Add mobile layer to exceptions
        ) === null);

    const inventoryIsOpen = this.game?.inventoryDisplay?.isOpen ?? false;
    const journalIsOpen = this.game?.journalDisplay?.isOpen ?? false;
    const chatIsOpen = this.game?.interactionSystem?.isChatOpen ?? false;
    const uiBlocksPointerLock = inventoryIsOpen || journalIsOpen || chatIsOpen;

    if (isGameContainerClick && !this.isPointerLocked && !uiBlocksPointerLock) {
      this.lockPointer();
    }
  }

  // --- Update Logic ---
  updateContinuousMoveState(): void {
    // This now primarily handles keyboard state, mobile state is set directly
    // Only update from keys if mobile is NOT active
    if (!this.game?.mobileControls?.isActive()) {
      const W = this.keys["KeyW"] || this.keys["ArrowUp"];
      const S = this.keys["KeyS"] || this.keys["ArrowDown"];
      const D = this.keys["KeyD"] || this.keys["ArrowRight"];
      const A = this.keys["KeyA"] || this.keys["ArrowLeft"];
      const Sprint = this.keys["ShiftLeft"] || this.keys["ShiftRight"];

      this.moveState.forward = (W ? 1 : 0) - (S ? 1 : 0);
      this.moveState.right = (A ? 1 : 0) - (D ? 1 : 0); // Swapped A/D
      this.moveState.sprint = Sprint ?? false;
    }
    // Note: Jump, Interact, Attack states are handled differently
    // Jump/Interact are set true on keydown/mobile press and consumed
    // Attack is set true/false based on key/button hold state
  }

  update(deltaTime: number): void {
    // --- Rotation Update (Mouse - Desktop Only) ---
    if (
      !this.game?.mobileControls?.isActive() &&
      this.isPointerLocked &&
      this.player &&
      this.player.mesh
    ) {
      const sensitivity = this.playerRotationSensitivity;

      if (Math.abs(this.mouse.dx) > 0) {
        const yawDelta = -this.mouse.dx * sensitivity;
        this.player.mesh!.rotateY(yawDelta);
      }
      if (this.cameraController && Math.abs(this.mouse.dy) > 0) {
        // Use negative dy for camera pitch control
        this.cameraController.handleMouseInput(this.mouse.dx, -this.mouse.dy);
      }
    }
    // Reset dx/dy after processing (only relevant for mouse)
    this.mouse.dx = 0;
    this.mouse.dy = 0;

    // --- Keyboard Movement Update (Desktop Only) ---
    // This ensures keyboard input is reflected if mobile is not active
    this.updateContinuousMoveState();

    // Mobile input (forward, right, attack, interact) is applied directly
    // by MobileControls.update() before this method is called.
    // Camera rotation from mobile joystick is also applied in MobileControls.update().
  }

  consumeInteraction(): boolean {
    // This works for both keyboard ('E' press) and mobile (tap Interact button)
    if (!this.moveState.interact) return false;
    this.moveState.interact = false; // Reset after consumption
    return true;
  }

  // Method to clean up listeners
  dispose(): void {
    // Remove listeners based on whether mobile is active or not
    if (!this.game?.mobileControls?.isActive()) {
      document.removeEventListener("keydown", this.boundOnKeyDown);
      document.removeEventListener("keyup", this.boundOnKeyUp);
      document.removeEventListener("mousedown", this.boundOnMouseDown);
      document.removeEventListener("mouseup", this.boundOnMouseUp);
      document.removeEventListener("mousemove", this.boundOnMouseMove);
      this.domElement.removeEventListener("click", this.boundOnClick);
      document.removeEventListener(
        "pointerlockchange",
        this.boundOnPointerLockChange
      );
      document.removeEventListener(
        "pointerlockerror",
        this.boundOnPointerLockError
      );
    } else {
      // Remove the minimal listener added for mobile
      // document.removeEventListener('keydown', ...); // Need to store the listener reference
    }
    // TODO: Properly remove the mobile escape listener if needed
  }
}
