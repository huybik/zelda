/* File: /src/controls/mobileControls.ts */
// File: /src/controls/mobileControls.ts
import nipplejs, {
  JoystickManager,
  EventData,
  JoystickOutputData,
} from "nipplejs";
import { Controls } from "./controls";
import { Game } from "../main";
import { Vector2 } from "three";

export class MobileControls {
  private game: Game;
  private controls: Controls;
  private moveJoystick: nipplejs.Joystick | null = null;
  private moveManager: JoystickManager | null = null;
  private moveVector = new Vector2(0, 0);
  private isDraggingCamera: boolean = false;
  private lastTouchPosition = new Vector2(0, 0);
  private cameraRotationDelta = new Vector2(0, 0);
  private currentTouchId: number | null = null;
  private gameContainer: HTMLElement | null = null;
  private moveZoneElement: HTMLElement | null = null;
  private interactButton: HTMLElement | null = null;
  private attackButton: HTMLElement | null = null;
  private inventoryButton: HTMLElement | null = null;
  private journalButton: HTMLElement | null = null;
  public attackHeld: boolean = false; // Public to be checked by Game loop
  private interactHeld: boolean = false;

  private boundHandleCameraTouchStart: (event: TouchEvent) => void;
  private boundHandleCameraTouchMove: (event: TouchEvent) => void;
  private boundHandleCameraTouchEnd: (event: TouchEvent) => void;

  constructor(game: Game, controls: Controls) {
    this.game = game;
    this.controls = controls;

    this.boundHandleCameraTouchStart = this.handleCameraTouchStart.bind(this);
    this.boundHandleCameraTouchMove = this.handleCameraTouchMove.bind(this);
    this.boundHandleCameraTouchEnd = this.handleCameraTouchEnd.bind(this);

    if (!this.isMobile()) {
      document.getElementById("mobile-controls-layer")?.classList.add("hidden");
      return;
    }

    this.gameContainer = document.getElementById("game-container");
    this.moveZoneElement = document.getElementById("joystick-zone-left");
    this.setupMoveJoystick();
    this.setupButtons();
    this.setupTouchCameraControls();
    document
      .getElementById("mobile-controls-layer")
      ?.classList.remove("hidden");
  }

  private isMobile(): boolean {
    const hasTouch = "ontouchstart" in window || navigator.maxTouchPoints > 0;
    const smallScreen = window.innerWidth < 768;
    return hasTouch || smallScreen;
  }

  private setupMoveJoystick(): void {
    const moveZone = this.moveZoneElement;
    if (!moveZone) return;
    const joystickSize = 100;
    const commonOptions: nipplejs.JoystickManagerOptions = {
      mode: "dynamic",
      color: "rgba(255, 255, 255, 0.5)",
      fadeTime: 150,
      size: joystickSize,
      position: { left: "50%", top: "50%" },
      zone: moveZone,
    };
    this.moveManager = nipplejs.create(commonOptions);
    const handleMove = (evt: EventData, nipple: JoystickOutputData) => {
      if (nipple.angle && nipple.force) {
        this.moveVector.set(
          Math.cos(nipple.angle.radian) * nipple.force,
          Math.sin(nipple.angle.radian) * nipple.force
        );
      } else {
        this.moveVector.set(0, 0);
      }
    };

    this.moveManager.on("move", handleMove);
    this.moveManager.on("end", () => this.moveVector.set(0, 0));
    this.moveJoystick = this.moveManager.get(this.moveManager.ids[0]);
  }

  private setupTouchCameraControls(): void {
    if (!this.gameContainer) return;
    this.gameContainer.addEventListener(
      "touchstart",
      this.boundHandleCameraTouchStart,
      { passive: false }
    );
    this.gameContainer.addEventListener(
      "touchmove",
      this.boundHandleCameraTouchMove,
      { passive: false }
    );
    this.gameContainer.addEventListener(
      "touchend",
      this.boundHandleCameraTouchEnd,
      { passive: false }
    );
    this.gameContainer.addEventListener(
      "touchcancel",
      this.boundHandleCameraTouchEnd,
      { passive: false }
    );
  }

  private isPointInsideRect(x: number, y: number, rect: DOMRect): boolean {
    return (
      x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom
    );
  }

  private handleCameraTouchStart(event: TouchEvent): void {
    if (this.isDraggingCamera || !this.moveZoneElement) return;
    const touch = event.changedTouches[0];
    if (!touch) return;
    const touchX = touch.clientX;
    const touchY = touch.clientY;
    const moveZoneRect = this.moveZoneElement.getBoundingClientRect();
    if (this.isPointInsideRect(touchX, touchY, moveZoneRect)) return;
    const buttons = [
      this.interactButton,
      this.attackButton,
      this.inventoryButton,
      this.journalButton,
    ];
    for (const button of buttons) {
      if (button) {
        const buttonRect = button.getBoundingClientRect();
        if (this.isPointInsideRect(touchX, touchY, buttonRect)) return;
      }
    }
    event.preventDefault();
    this.isDraggingCamera = true;
    this.currentTouchId = touch.identifier;
    this.lastTouchPosition.set(touchX, touchY);
    this.cameraRotationDelta.set(0, 0);
  }

  private handleCameraTouchMove(event: TouchEvent): void {
    if (!this.isDraggingCamera || this.currentTouchId === null) return;
    let currentTouch: Touch | null = null;
    for (let i = 0; i < event.changedTouches.length; i++) {
      if (event.changedTouches[i].identifier === this.currentTouchId) {
        currentTouch = event.changedTouches[i];
        break;
      }
    }
    if (!currentTouch) return;
    event.preventDefault();
    const touchX = currentTouch.clientX;
    const touchY = currentTouch.clientY;
    const deltaX = touchX - this.lastTouchPosition.x;
    // const deltaY = touchY - this.lastTouchPosition.y; // Removed Y-axis update
    this.cameraRotationDelta.x += deltaX * 8;
    // this.cameraRotationDelta.y += deltaY * 8; // Removed Y-axis update
    this.lastTouchPosition.set(touchX, touchY);
  }

  private handleCameraTouchEnd(event: TouchEvent): void {
    if (!this.isDraggingCamera || this.currentTouchId === null) return;
    let touchEnded = false;
    for (let i = 0; i < event.changedTouches.length; i++) {
      if (event.changedTouches[i].identifier === this.currentTouchId) {
        touchEnded = true;
        break;
      }
    }
    if (touchEnded) {
      event.preventDefault();
      this.isDraggingCamera = false;
      this.currentTouchId = null;
    }
  }

  private setupButtons(): void {
    this.interactButton = document.getElementById("button-interact");
    this.attackButton = document.getElementById("button-attack");
    this.inventoryButton = document.getElementById("button-inventory");
    this.journalButton = document.getElementById("button-journal");
    if (
      !this.interactButton ||
      !this.attackButton ||
      !this.inventoryButton ||
      !this.journalButton
    ) {
      console.error("Mobile action buttons not found in HTML!");
      return;
    }
    this.interactButton.addEventListener(
      "touchstart",
      (e) => {
        e.preventDefault();
        this.interactHeld = true;
        this.interactButton?.classList.add("active");
        this.controls.moveState.interact = true; // Set interact state
      },
      { passive: false }
    );
    this.interactButton.addEventListener(
      "touchend",
      (e) => {
        e.preventDefault();
        this.interactHeld = false;
        this.interactButton?.classList.remove("active");
        this.controls.moveState.interact = false; // Reset interact state
      },
      { passive: false }
    );
    this.attackButton.addEventListener(
      "touchstart",
      (e) => {
        e.preventDefault();
        this.attackHeld = true; // Set held state
        this.attackButton?.classList.add("active");
        // Attack trigger is now handled by the game loop checking attackHeld
      },
      { passive: false }
    );
    this.attackButton.addEventListener(
      "touchend",
      (e) => {
        e.preventDefault();
        this.attackHeld = false; // Reset held state
        this.attackButton?.classList.remove("active");
      },
      { passive: false }
    );
    this.inventoryButton.addEventListener(
      "touchstart",
      (e) => {
        e.preventDefault();
        this.inventoryButton?.classList.add("active");
      },
      { passive: false }
    );
    this.inventoryButton.addEventListener(
      "touchend",
      (e) => {
        e.preventDefault();
        this.inventoryButton?.classList.remove("active");
        if (this.game.interactionSystem?.isChatOpen) return;
        this.game.journalDisplay?.hide();
        this.game.inventoryDisplay?.toggle();
        this.game.setPauseState(this.game.inventoryDisplay?.isOpen ?? false);
      },
      { passive: false }
    );
    this.journalButton.addEventListener(
      "touchstart",
      (e) => {
        e.preventDefault();
        this.journalButton?.classList.add("active");
      },
      { passive: false }
    );
    this.journalButton.addEventListener(
      "touchend",
      (e) => {
        e.preventDefault();
        this.journalButton?.classList.remove("active");
        if (this.game.interactionSystem?.isChatOpen) return;
        this.game.inventoryDisplay?.hide();
        this.game.journalDisplay?.toggle();
        this.game.setPauseState(this.game.journalDisplay?.isOpen ?? false);
      },
      { passive: false }
    );
  }

  update(deltaTime: number): void {
    if (!this.isMobile()) return;
    this.controls.moveState.forward = this.moveVector.y;
    this.controls.moveState.right = -this.moveVector.x;
    this.controls.moveState.forward = Math.max(
      -1,
      Math.min(1, this.controls.moveState.forward)
    );
    this.controls.moveState.right = Math.max(
      -1,
      Math.min(1, this.controls.moveState.right)
    );
    this.controls.moveState.sprint = false;
    // Attack state is no longer set directly here; game loop checks attackHeld
    this.controls.moveState.jump = false;
    // const touchCameraSensitivity = 0.3; // No longer needed for pitch
    const touchPlayerRotationSensitivity = 0.2;
    if (this.cameraRotationDelta.lengthSq() > 0) {
      if (this.controls.player && this.controls.player.mesh) {
        const yawDelta =
          -this.cameraRotationDelta.x *
          touchPlayerRotationSensitivity *
          deltaTime;
        this.controls.player.mesh.rotateY(yawDelta);
      }
      // Camera pitch is no longer controlled by touch delta Y
      // if (this.controls.cameraController) {
      //     const pitchDelta = -this.cameraRotationDelta.y * touchCameraSensitivity * deltaTime * 100;
      //     this.controls.cameraController.handleMouseInput(0, pitchDelta);
      // }
      this.cameraRotationDelta.set(0, 0);
    }
  }

  isActive(): boolean {
    return this.isMobile();
  }

  destroy(): void {
    this.moveManager?.destroy();
    if (this.gameContainer) {
      this.gameContainer.removeEventListener(
        "touchstart",
        this.boundHandleCameraTouchStart
      );
      this.gameContainer.removeEventListener(
        "touchmove",
        this.boundHandleCameraTouchMove
      );
      this.gameContainer.removeEventListener(
        "touchend",
        this.boundHandleCameraTouchEnd
      );
      this.gameContainer.removeEventListener(
        "touchcancel",
        this.boundHandleCameraTouchEnd
      );
    }
    // Remove button listeners if needed, though usually handled by element removal
  }
}
