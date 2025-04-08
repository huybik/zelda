// File: /src/mobileControls.ts
import nipplejs, {
  JoystickManager,
  Joystick,
  JoystickManagerOptions,
  EventData,
  JoystickOutputData,
} from "nipplejs";
import { Controls } from "./system";
import { Game } from "./main";
import { Vector2 } from "three";

export class MobileControls {
  private game: Game;
  private controls: Controls;
  private moveJoystick: Joystick | null = null;
  // private cameraJoystick: Joystick | null = null; // Removed
  private moveManager: JoystickManager | null = null; // Store manager instance
  // private cameraManager: JoystickManager | null = null; // Removed
  private moveVector = new Vector2(0, 0);
  // private cameraVector = new Vector2(0, 0); // Removed - will calculate delta directly

  // Touch camera control state
  private isDraggingCamera: boolean = false;
  private lastTouchPosition = new Vector2(0, 0);
  private cameraRotationDelta = new Vector2(0, 0); // Stores delta calculated from touchmove
  private currentTouchId: number | null = null;
  private gameContainer: HTMLElement | null = null;
  private moveZoneElement: HTMLElement | null = null; // Cache move zone element

  private interactButton: HTMLElement | null = null;
  private attackButton: HTMLElement | null = null;
  private inventoryButton: HTMLElement | null = null;
  private journalButton: HTMLElement | null = null;

  private attackHeld: boolean = false;
  private interactPressed: boolean = false;

  // Bound event handlers for removal
  private boundHandleCameraTouchStart: (event: TouchEvent) => void;
  private boundHandleCameraTouchMove: (event: TouchEvent) => void;
  private boundHandleCameraTouchEnd: (event: TouchEvent) => void;

  constructor(game: Game, controls: Controls) {
    this.game = game;
    this.controls = controls;

    // Bind handlers
    this.boundHandleCameraTouchStart = this.handleCameraTouchStart.bind(this);
    this.boundHandleCameraTouchMove = this.handleCameraTouchMove.bind(this);
    this.boundHandleCameraTouchEnd = this.handleCameraTouchEnd.bind(this);

    if (!this.isMobile()) {
      console.log("Not a mobile device, skipping mobile controls setup.");
      document.getElementById("mobile-controls-layer")?.classList.add("hidden");
      return;
    }

    console.log("Setting up mobile controls.");
    this.gameContainer = document.getElementById("game-container");
    this.moveZoneElement = document.getElementById("joystick-zone-left"); // Cache element

    this.setupMoveJoystick(); // Renamed from setupJoysticks
    this.setupButtons();
    this.setupTouchCameraControls(); // New setup method
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
    // Renamed and simplified
    const moveZone = this.moveZoneElement; // Use cached element

    if (!moveZone) {
      console.error("Move joystick zone not found in HTML!");
      return;
    }

    const joystickSize = 100;

    const commonOptions: JoystickManagerOptions = {
      mode: "dynamic", // Static is often better for movement
      color: "rgba(255, 255, 255, 0.5)",
      fadeTime: 150,
      size: joystickSize,
      position: { left: "50%", top: "50%" }, // Center within the zone
      zone: moveZone, // Assign zone here
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

    this.moveManager.on(["start", "move"], handleMove);
    this.moveManager.on("end", () => {
      this.moveVector.set(0, 0);
    });

    this.moveJoystick = this.moveManager.get(this.moveManager.ids[0]);
  }

  private setupTouchCameraControls(): void {
    if (!this.gameContainer) {
      console.error("Game container not found for touch camera controls!");
      return;
    }
    console.log("Setting up touch camera listeners on game container.");
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
      this.boundHandleCameraTouchEnd, // Treat cancel like end
      { passive: false }
    );
  }

  private isPointInsideRect(x: number, y: number, rect: DOMRect): boolean {
    return (
      x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom
    );
  }

  private handleCameraTouchStart(event: TouchEvent): void {
    if (this.isDraggingCamera || !this.moveZoneElement) return; // Already dragging or move zone not found

    const touch = event.changedTouches[0]; // Get the first touch that changed state
    if (!touch) return;

    const touchX = touch.clientX;
    const touchY = touch.clientY;

    // Check if touch is inside the move joystick zone
    const moveZoneRect = this.moveZoneElement.getBoundingClientRect();
    if (this.isPointInsideRect(touchX, touchY, moveZoneRect)) {
      // console.log("Touch started inside move zone, ignoring for camera.");
      return;
    }

    // Check if touch is inside any button area
    const buttons = [
      this.interactButton,
      this.attackButton,
      this.inventoryButton,
      this.journalButton,
    ];
    for (const button of buttons) {
      if (button) {
        const buttonRect = button.getBoundingClientRect();
        if (this.isPointInsideRect(touchX, touchY, buttonRect)) {
          // console.log("Touch started inside button, ignoring for camera.");
          return;
        }
      }
    }

    // If touch is outside joystick zone and buttons, start camera drag
    // console.log("Starting camera drag");
    event.preventDefault(); // Prevent default actions like scrolling
    this.isDraggingCamera = true;
    this.currentTouchId = touch.identifier;
    this.lastTouchPosition.set(touchX, touchY);
    this.cameraRotationDelta.set(0, 0); // Reset delta on new touch start
  }

  private handleCameraTouchMove(event: TouchEvent): void {
    if (!this.isDraggingCamera || this.currentTouchId === null) return;

    // Find the touch that matches the one we started dragging with
    let currentTouch: Touch | null = null;
    for (let i = 0; i < event.changedTouches.length; i++) {
      if (event.changedTouches[i].identifier === this.currentTouchId) {
        currentTouch = event.changedTouches[i];
        break;
      }
    }

    if (!currentTouch) return; // Our touch didn't move

    event.preventDefault(); // Prevent scrolling during drag

    const touchX = currentTouch.clientX;
    const touchY = currentTouch.clientY;

    // Calculate delta movement since the last move event
    const deltaX = touchX - this.lastTouchPosition.x;
    const deltaY = touchY - this.lastTouchPosition.y;

    // Accumulate the delta for this frame's update
    this.cameraRotationDelta.x += deltaX * 8;
    this.cameraRotationDelta.y += deltaY * 8;

    // Update last touch position for the next move event
    this.lastTouchPosition.set(touchX, touchY);
    // console.log("Camera drag move:", this.cameraRotationDelta);
  }

  private handleCameraTouchEnd(event: TouchEvent): void {
    if (!this.isDraggingCamera || this.currentTouchId === null) return;

    // Check if the touch that ended/cancelled is the one we were tracking
    let touchEnded = false;
    for (let i = 0; i < event.changedTouches.length; i++) {
      if (event.changedTouches[i].identifier === this.currentTouchId) {
        touchEnded = true;
        break;
      }
    }

    if (touchEnded) {
      // console.log("Ending camera drag");
      event.preventDefault();
      this.isDraggingCamera = false;
      this.currentTouchId = null;
      // Don't reset cameraRotationDelta here, let the update loop consume it one last time
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

    // --- Button Event Listeners (No changes needed here) ---
    // Interact Button (Tap)
    this.interactButton.addEventListener(
      "touchstart",
      (e) => {
        e.preventDefault();
        this.interactPressed = true;
        this.interactButton?.classList.add("active");
      },
      { passive: false }
    );
    this.interactButton.addEventListener(
      "touchend",
      (e) => {
        e.preventDefault();
        // interactPressed is reset in update after being consumed
        this.interactButton?.classList.remove("active");
      },
      { passive: false }
    );
    this.interactButton.addEventListener("mousedown", () => {
      // Desktop fallback
      this.interactPressed = true;
      this.interactButton?.classList.add("active");
    });
    this.interactButton.addEventListener("mouseup", () => {
      // Desktop fallback
      this.interactButton?.classList.remove("active");
    });

    // Attack Button (Hold)
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
    this.attackButton.addEventListener("mousedown", () => {
      // Desktop fallback
      this.attackHeld = true;
      this.attackButton?.classList.add("active");
    });
    this.attackButton.addEventListener("mouseup", () => {
      // Desktop fallback
      this.attackHeld = false;
      this.attackButton?.classList.remove("active");
    });

    // Inventory Button (Tap)
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

    // Journal Button (Tap)
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

    // --- Update Move State ---
    this.controls.moveState.forward = this.moveVector.y;
    this.controls.moveState.right = -this.moveVector.x; // Invert X for strafing

    this.controls.moveState.forward = Math.max(
      -1,
      Math.min(1, this.controls.moveState.forward)
    );
    this.controls.moveState.right = Math.max(
      -1,
      Math.min(1, this.controls.moveState.right)
    );
    this.controls.moveState.sprint = false;

    // --- Update Button States ---
    if (this.interactPressed) {
      this.controls.moveState.interact = true;
      this.interactPressed = false; // Consume the press
    } else {
      this.controls.moveState.interact = false; // Ensure it's false if not pressed
    }
    this.controls.moveState.attack = this.attackHeld;
    this.controls.moveState.jump = false;

    // --- Update Camera/Rotation from Touch Input ---
    // Sensitivity values might need significant tuning for touch
    const touchCameraSensitivity = 0.3; // Lower sensitivity for touch pixel delta
    const touchPlayerRotationSensitivity = 0.2; // Lower sensitivity for touch pixel delta

    if (this.cameraRotationDelta.lengthSq() > 0) {
      // Only rotate if there was movement
      if (this.controls.player && this.controls.player.mesh) {
        const yawDelta =
          -this.cameraRotationDelta.x *
          touchPlayerRotationSensitivity *
          deltaTime;
        this.controls.player.mesh.rotateY(yawDelta);
      }

      if (this.controls.cameraController) {
        const pitchDelta =
          -this.cameraRotationDelta.y *
          touchCameraSensitivity *
          deltaTime *
          100; // Keep multiplier for existing method scale
        this.controls.cameraController.handleMouseInput(0, pitchDelta);
      }

      // Reset delta *after* applying it for this frame
      this.cameraRotationDelta.set(0, 0);
    }
  }

  isActive(): boolean {
    return this.isMobile();
  }

  destroy(): void {
    this.moveManager?.destroy();

    // Remove touch listeners
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

    // TODO: Remove button event listeners if necessary (usually not needed if elements are removed/hidden)
    // If buttons remain but controls are destroyed, listeners should be removed.
    // Example (repeat for all buttons):
    // this.interactButton?.removeEventListener('touchstart', ...);
    // this.interactButton?.removeEventListener('touchend', ...);
  }
}
