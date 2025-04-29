import nipplejs, {
  JoystickManager,
  EventData,
  JoystickOutputData,
} from "nipplejs";
import { Controls } from "./controls";
import { Game } from "../main";
import { Vector2 } from "three";
import { Character } from "../entities/character";

export class MobileControls {
  private game: Game;
  private controls: Controls;
  private moveJoystick: nipplejs.Joystick | null = null;
  private moveManager: JoystickManager | null = null;
  private moveVector = new Vector2(0, 0);
  private gameContainer: HTMLElement | null = null;
  private moveZoneElement: HTMLElement | null = null;
  private interactButton: HTMLElement | null = null;
  private attackButton: HTMLElement | null = null;
  private switchButton: HTMLElement | null = null;
  public attackHeld: boolean = false;
  private interactHeld: boolean = false;

  // Indicator elements and state
  private joystickIndicatorCircle: HTMLElement | null = null;
  private cameraArrowLeft: HTMLElement | null = null;
  private cameraArrowRight: HTMLElement | null = null;
  private hasMovedJoystick: boolean = false;
  private hasDraggedCamera: boolean = false;

  // Camera drag properties
  private isDraggingCamera: boolean = false;
  private lastTouchPosition = new Vector2(0, 0);
  private cameraRotationDelta = new Vector2(0, 0);
  private currentTouchId: number | null = null;

  // Tap detection properties
  private touchStartTime: number = 0;
  private touchStartPosition = new Vector2(0, 0);
  private readonly tapMaxDuration: number = 200; // milliseconds
  private readonly tapMaxDistance: number = 10; // pixels

  private boundHandleCameraTouchStart: (event: TouchEvent) => void;
  private boundHandleCameraTouchMove: (event: TouchEvent) => void;
  private boundHandleCameraTouchEnd: (event: TouchEvent) => void;

  constructor(game: Game, controls: Controls) {
    this.game = game;
    this.controls = controls;

    // Bind touch event handlers
    this.boundHandleCameraTouchStart = this.handleCameraTouchStart.bind(this);
    this.boundHandleCameraTouchMove = this.handleCameraTouchMove.bind(this);
    this.boundHandleCameraTouchEnd = this.handleCameraTouchEnd.bind(this);

    // Get indicator elements
    this.joystickIndicatorCircle = document.getElementById(
      "joystick-indicator-circle"
    );
    this.cameraArrowLeft = document.getElementById("camera-arrow-left");
    this.cameraArrowRight = document.getElementById("camera-arrow-right");

    if (!this.isMobile()) {
      document.getElementById("mobile-controls-layer")?.classList.add("hidden");
      return;
    }

    this.gameContainer = document.getElementById("game-container");
    this.moveZoneElement = document.getElementById("joystick-zone-left");
    this.setupMoveJoystick();
    this.setupActionButtons();
    this.setupTouchCameraControls();
    document
      .getElementById("mobile-controls-layer")
      ?.classList.remove("hidden");

    // Show initial indicators if mobile
    if (!this.hasMovedJoystick)
      this.joystickIndicatorCircle?.classList.remove("hidden");
    if (!this.hasDraggedCamera) {
      this.cameraArrowLeft?.classList.remove("hidden");
      this.cameraArrowRight?.classList.remove("hidden");
    }
  }

  /** Check if the device is mobile based on touch capability or screen size */
  private isMobile(): boolean {
    const hasTouch = "ontouchstart" in window || navigator.maxTouchPoints > 0;
    const smallScreen = window.innerWidth < 768;
    return hasTouch || smallScreen;
  }

  /** Set up the movement joystick */
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
      // Hide indicator permanently once move starts
      if (!this.hasMovedJoystick) {
        this.joystickIndicatorCircle?.classList.add("hidden");
        this.hasMovedJoystick = true;
      }

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

  /** Set up touch controls for camera dragging */
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

  /** Check if a point is inside a rectangle */
  private isPointInsideRect(x: number, y: number, rect: DOMRect): boolean {
    return (
      x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom
    );
  }

  /** Handle the start of a touch event for camera dragging */
  private handleCameraTouchStart(event: TouchEvent): void {
    if (this.isDraggingCamera || !this.moveZoneElement) return;
    const touch = event.changedTouches[0];
    if (!touch) return;
    const touchX = touch.clientX;
    const touchY = touch.clientY;

    // Check if touch starts inside any interactable UI element
    const targetElement = event.target as HTMLElement;
    if (this.game.uiManager?.isClickOnInteractableUI(targetElement)) {
      return; // Don't start camera drag if touching UI
    }

    // Check if touch starts inside joystick zone
    const moveZoneRect = this.moveZoneElement.getBoundingClientRect();
    if (this.isPointInsideRect(touchX, touchY, moveZoneRect)) return;

    // Start potential drag/tap
    event.preventDefault();
    this.isDraggingCamera = true;
    this.currentTouchId = touch.identifier;
    this.lastTouchPosition.set(touchX, touchY);
    this.cameraRotationDelta.set(0, 0);

    // Record tap start info
    this.touchStartTime = performance.now();
    this.touchStartPosition.set(touchX, touchY);

    // Hide arrows permanently once drag starts
    if (!this.hasDraggedCamera) {
      this.cameraArrowLeft?.classList.add("hidden");
      this.cameraArrowRight?.classList.add("hidden");
      this.hasDraggedCamera = true;
    }
  }

  /** Handle touch movement for camera dragging */
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
    this.cameraRotationDelta.x += deltaX * 8; // Horizontal rotation only
    this.lastTouchPosition.set(touchX, touchY);
  }

  /** Handle the end of a touch event, including tap detection */
  private handleCameraTouchEnd(event: TouchEvent): void {
    if (!this.isDraggingCamera || this.currentTouchId === null) return;

    let endedTouch: Touch | null = null;
    for (let i = 0; i < event.changedTouches.length; i++) {
      if (event.changedTouches[i].identifier === this.currentTouchId) {
        endedTouch = event.changedTouches[i];
        break;
      }
    }

    if (endedTouch) {
      event.preventDefault();
      this.isDraggingCamera = false;
      this.currentTouchId = null;

      // Tap detection
      const touchEndTime = performance.now();
      const touchDuration = touchEndTime - this.touchStartTime;
      const touchEndX = endedTouch.clientX;
      const touchEndY = endedTouch.clientY;
      const distanceMoved = this.touchStartPosition.distanceTo(
        new Vector2(touchEndX, touchEndY)
      );

      if (
        touchDuration < this.tapMaxDuration &&
        distanceMoved < this.tapMaxDistance
      ) {
        const targetElement = document.elementFromPoint(
          touchEndX,
          touchEndY
        ) as HTMLElement | null;
        if (
          targetElement &&
          !this.game.uiManager?.isClickOnInteractableUI(targetElement)
        ) {
          this.game.uiManager?.closeOpenMenus();
        }
      }

      // Reset tap tracking
      this.touchStartTime = 0;
      this.touchStartPosition.set(0, 0);
    }
  }

  /** Set up action buttons (interact, attack, switch) */
  private setupActionButtons(): void {
    this.interactButton = document.getElementById("button-interact");
    this.attackButton = document.getElementById("button-attack");
    this.switchButton = document.getElementById("button-switch");

    if (!this.interactButton || !this.attackButton || !this.switchButton) {
      console.error(
        "Mobile action buttons (Interact/Attack/Switch) not found!"
      );
      return;
    }

    this.interactButton.addEventListener(
      "touchstart",
      (e) => {
        e.preventDefault();
        this.interactHeld = true;
        this.interactButton?.classList.add("active");
        this.controls.moveState.interact = true;
      },
      { passive: false }
    );
    this.interactButton.addEventListener(
      "touchend",
      (e) => {
        e.preventDefault();
        this.interactHeld = false;
        this.interactButton?.classList.remove("active");
        this.controls.moveState.interact = false;
      },
      { passive: false }
    );

    this.attackButton.addEventListener(
      "touchstart",
      (e) => {
        e.preventDefault();
        this.attackHeld = true;
        this.attackButton?.classList.add("active");
      },
      { passive: false }
    );
    this.attackButton.addEventListener(
      "touchend",
      (e) => {
        e.preventDefault();
        this.attackHeld = false;
        this.attackButton?.classList.remove("active");
      },
      { passive: false }
    );

    this.switchButton.addEventListener(
      "touchstart",
      (e) => {
        e.preventDefault();
        if (
          this.game.interactionSystem?.isSwitchTargetAvailable &&
          this.game.interactionSystem.currentTarget instanceof Character
        ) {
          this.game.switchControlTo(this.game.interactionSystem.currentTarget);
        }
        this.switchButton?.classList.add("active");
      },
      { passive: false }
    );
    this.switchButton.addEventListener(
      "touchend",
      (e) => {
        e.preventDefault();
        this.switchButton?.classList.remove("active");
      },
      { passive: false }
    );
  }

  /** Update movement and camera rotation */
  update(deltaTime: number): void {
    if (!this.isMobile()) return;

    // Set movement states from joystick (forward and right)
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

    // Apply camera rotation from drag
    const touchPlayerRotationSensitivity = 0.2;
    if (this.cameraRotationDelta.lengthSq() > 0) {
      if (this.controls.player && this.controls.player.mesh) {
        const yawDelta =
          -this.cameraRotationDelta.x *
          touchPlayerRotationSensitivity *
          deltaTime;
        this.controls.player.mesh.rotateY(yawDelta);
      }
      this.cameraRotationDelta.set(0, 0);
    }

    // Update switch button visibility
    if (this.switchButton) {
      if (this.game.interactionSystem?.isSwitchTargetAvailable) {
        this.switchButton.classList.remove("hidden");
      } else {
        this.switchButton.classList.add("hidden");
      }
    }
  }

  /** Check if mobile controls are active */
  isActive(): boolean {
    return this.isMobile();
  }

  /** Clean up resources */
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
  }
}
