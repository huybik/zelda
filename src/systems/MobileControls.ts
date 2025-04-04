// src/systems/MobileControls.ts
import nipplejs, { JoystickManager, JoystickManagerOptions } from "nipplejs";
import { Vector2 } from "three";
import type { Controls } from "./Controls";
import type { Game } from "../Game"; // Use type import

export class MobileControls {
  private game: Game;
  private controls: Controls; // Reference to desktop controls to update shared moveState
  private moveManager: JoystickManager | null = null; // Left joystick for movement
  private lookManager: JoystickManager | null = null; // Right joystick for looking (optional)

  // State vectors
  private moveVector = new Vector2(0, 0); // Stores input from move joystick
  private lookVector = new Vector2(0, 0); // Stores input from look joystick
  private cameraRotationDelta = new Vector2(0, 0); // Accumulates touch drag rotation

  // Touch state for camera dragging
  private isDraggingCamera: boolean = false;
  private lastTouchPosition = new Vector2(0, 0);
  private currentTouchId: number | null = null;

  // DOM Elements
  private gameContainer: HTMLElement | null = null;
  private moveZoneElement: HTMLElement | null = null;
  private lookZoneElement: HTMLElement | null = null; // Optional look joystick zone
  private buttons: Record<string, HTMLElement | null> = {}; // Action buttons

  // Button states (pressed down)
  private buttonStates: Record<string, boolean> = {
    interact: false,
    attack: false,
    jump: false, // Added jump button state
    // Add other buttons as needed (e.g., sprint)
  };

  // Bound event handlers for touch camera
  private boundHandleCameraTouchStart: (event: TouchEvent) => void;
  private boundHandleCameraTouchMove: (event: TouchEvent) => void;
  private boundHandleCameraTouchEnd: (event: TouchEvent) => void;

  private isMobileDevice: boolean; // Flag indicating if mobile controls should be active

  constructor(game: Game, controls: Controls) {
    this.game = game;
    this.controls = controls; // Store reference to update moveState

    // Detect if it's likely a mobile device
    this.isMobileDevice =
      "ontouchstart" in window ||
      navigator.maxTouchPoints > 0 ||
      window.innerWidth < 768;

    // Bind touch handlers
    this.boundHandleCameraTouchStart = this.handleCameraTouchStart.bind(this);
    this.boundHandleCameraTouchMove = this.handleCameraTouchMove.bind(this);
    this.boundHandleCameraTouchEnd = this.handleCameraTouchEnd.bind(this);

    // Only initialize mobile controls if detected as mobile
    if (this.isMobileDevice) {
      this.initialize();
      // Make sure desktop listeners are removed if mobile is active
      this.controls.removeDesktopListeners();
    } else {
      // Hide the mobile controls layer if not on mobile
      document.getElementById("mobile-controls-layer")?.classList.add("hidden");
    }
  }

  // Returns true if mobile controls are currently active.
  isActive(): boolean {
    return this.isMobileDevice;
  }

  // Sets up all mobile control elements and listeners.
  private initialize(): void {
    console.log("Initializing Mobile Controls");
    this.gameContainer = document.getElementById("game-container");
    this.moveZoneElement = document.getElementById("joystick-zone-left");
    this.lookZoneElement = document.getElementById("joystick-zone-right"); // Get look zone

    if (!this.gameContainer || !this.moveZoneElement || !this.lookZoneElement) {
      console.error("Required mobile control DOM elements not found!");
      this.isMobileDevice = false; // Disable if elements are missing
      return;
    }

    this.setupMoveJoystick();
    this.setupLookJoystick(); // Setup the look joystick
    this.setupButtons();
    // this.setupTouchCameraControls(); // Keep touch drag as alternative/fallback? Or disable if using look stick? Choose one primary method. Let's keep it for now.
    document
      .getElementById("mobile-controls-layer")
      ?.classList.remove("hidden"); // Show controls
  }

  // Configures the left joystick for movement.
  private setupMoveJoystick(): void {
    if (!this.moveZoneElement) return;
    const options: JoystickManagerOptions = {
      mode: "dynamic", // Joystick appears where touched
      color: "rgba(255, 255, 255, 0.5)",
      fadeTime: 150,
      size: 100, // Size of the joystick base
      threshold: 0.1, // Minimum movement threshold
      position: { left: "50%", top: "50%" }, // Centered within the zone
      zone: this.moveZoneElement, // Restrict to left zone
    };
    this.moveManager = nipplejs.create(options);

    // Update moveVector on joystick movement
    this.moveManager.on("move", (evt, nipple) => {
      if (nipple.angle && nipple.force) {
        // Map force and angle to a Vector2 (invert Y for forward/backward)
        this.moveVector.set(
          Math.cos(nipple.angle.radian) * nipple.force,
          -Math.sin(nipple.angle.radian) * nipple.force // Y is forward/backward
        );
      }
    });

    // Reset moveVector when joystick is released
    this.moveManager.on("end", () => {
      this.moveVector.set(0, 0);
    });
  }

  // Configures the right joystick for looking (camera/player rotation).
  private setupLookJoystick(): void {
    if (!this.lookZoneElement) return;
    const options: JoystickManagerOptions = {
      mode: "dynamic",
      color: "rgba(255, 255, 255, 0.5)",
      fadeTime: 150,
      size: 100,
      threshold: 0.1,
      position: { left: "50%", top: "50%" },
      zone: this.lookZoneElement, // Restrict to right zone
      lockX: false, // Allow horizontal movement
      lockY: false, // Allow vertical movement
    };
    this.lookManager = nipplejs.create(options);

    // Update lookVector on joystick movement
    this.lookManager.on("move", (evt, nipple) => {
      if (nipple.vector) {
        // nipple.vector gives { x, y } relative to center, range -1 to 1
        this.lookVector.set(nipple.vector.x, nipple.vector.y);
      }
    });

    // Reset lookVector when joystick is released
    this.lookManager.on("end", () => {
      this.lookVector.set(0, 0);
    });
  }

  // Configures touch listeners on the game container for camera dragging.
  private setupTouchCameraControls(): void {
    if (!this.gameContainer) return;
    // Use { passive: false } to allow preventDefault()
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

  // Checks if a touch point is inside a given DOM rectangle.
  private isPointInsideRect(x: number, y: number, rect: DOMRect): boolean {
    return (
      x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom
    );
  }

  // Handles the start of a touch event for camera dragging.
  private handleCameraTouchStart(event: TouchEvent): void {
    // Ignore if already dragging or if touch starts inside joystick zones or on buttons
    if (this.isDraggingCamera || !this.moveZoneElement || !this.lookZoneElement)
      return;

    const touch = event.changedTouches[0];
    if (!touch) return;

    const touchX = touch.clientX;
    const touchY = touch.clientY;

    // Check if touch started in move zone, look zone, or on any button
    if (
      this.isPointInsideRect(
        touchX,
        touchY,
        this.moveZoneElement.getBoundingClientRect()
      ) ||
      this.isPointInsideRect(
        touchX,
        touchY,
        this.lookZoneElement.getBoundingClientRect()
      )
    ) {
      return;
    }
    for (const btnName in this.buttons) {
      if (
        this.buttons[btnName] &&
        this.isPointInsideRect(
          touchX,
          touchY,
          this.buttons[btnName]!.getBoundingClientRect()
        )
      ) {
        return;
      }
    }

    // If touch is outside restricted areas, start camera drag
    event.preventDefault(); // Prevent browser default actions like scrolling
    this.isDraggingCamera = true;
    this.currentTouchId = touch.identifier;
    this.lastTouchPosition.set(touchX, touchY);
    this.cameraRotationDelta.set(0, 0); // Reset delta accumulation
  }

  // Handles touch movement for camera dragging.
  private handleCameraTouchMove(event: TouchEvent): void {
    if (!this.isDraggingCamera || this.currentTouchId === null) return;

    // Find the touch associated with the current drag
    let currentTouch: Touch | null = null;
    for (let i = 0; i < event.changedTouches.length; i++) {
      if (event.changedTouches[i].identifier === this.currentTouchId) {
        currentTouch = event.changedTouches[i];
        break;
      }
    }
    if (!currentTouch) return; // Touch not found

    event.preventDefault(); // Prevent browser default actions
    const touchX = currentTouch.clientX;
    const touchY = currentTouch.clientY;

    // Accumulate the change in position
    this.cameraRotationDelta.x += touchX - this.lastTouchPosition.x;
    this.cameraRotationDelta.y += touchY - this.lastTouchPosition.y;

    // Update last touch position for the next move event
    this.lastTouchPosition.set(touchX, touchY);
  }

  // Handles the end of a touch event for camera dragging.
  private handleCameraTouchEnd(event: TouchEvent): void {
    if (!this.isDraggingCamera || this.currentTouchId === null) return;

    // Check if the ended touch was the one we were tracking
    let touchEnded = false;
    for (let i = 0; i < event.changedTouches.length; i++) {
      if (event.changedTouches[i].identifier === this.currentTouchId) {
        touchEnded = true;
        break;
      }
    }

    if (touchEnded) {
      event.preventDefault(); // Prevent potential click events
      this.isDraggingCamera = false;
      this.currentTouchId = null;
      // Rotation delta is applied in the update() loop
    }
  }

  // Sets up listeners for the on-screen action buttons.
  private setupButtons(): void {
    const buttonIds = ["interact", "attack", "jump", "inventory", "journal"]; // Added jump
    buttonIds.forEach((id) => {
      this.buttons[id] = document.getElementById(`button-${id}`);
      if (!this.buttons[id]) {
        console.error(`Mobile button not found: button-${id}`);
      } else {
        this.setupButtonListener(id);
      }
    });
  }

  // Helper to set up listeners for a single button.
  private setupButtonListener(id: string): void {
    const buttonElement = this.buttons[id];
    if (!buttonElement) return;

    // Use touchend for tap actions (inventory, journal)
    if (id === "inventory" || id === "journal") {
      buttonElement.addEventListener(
        "touchstart",
        (e) => {
          e.preventDefault();
          buttonElement.classList.add("active");
        },
        { passive: false }
      );
      buttonElement.addEventListener(
        "touchend",
        (e) => {
          e.preventDefault();
          buttonElement.classList.remove("active");
          if (this.game.interactionSystem?.isChatOpen) return; // Don't open UI over chat

          if (id === "inventory") {
            this.game.journalDisplay?.hide(); // Close other UI
            this.game.inventoryDisplay?.toggle();
            this.game.setPauseState(
              this.game.inventoryDisplay?.isOpen ?? false
            );
          } else if (id === "journal") {
            this.game.inventoryDisplay?.hide(); // Close other UI
            this.game.journalDisplay?.toggle();
            this.game.setPauseState(this.game.journalDisplay?.isOpen ?? false);
          }
        },
        { passive: false }
      );
    }
    // Use touchstart/touchend for hold actions (interact, attack, jump)
    else if (id === "interact" || id === "attack" || id === "jump") {
      buttonElement.addEventListener(
        "touchstart",
        (e) => {
          e.preventDefault();
          this.buttonStates[id] = true; // Set state on press
          buttonElement.classList.add("active");
        },
        { passive: false }
      );
      buttonElement.addEventListener(
        "touchend",
        (e) => {
          e.preventDefault();
          this.buttonStates[id] = false; // Reset state on release
          buttonElement.classList.remove("active");
        },
        { passive: false }
      );
      buttonElement.addEventListener(
        "touchcancel",
        (e) => {
          // Handle cancel case
          e.preventDefault();
          this.buttonStates[id] = false;
          buttonElement.classList.remove("active");
        },
        { passive: false }
      );
    }
  }

  // Main update loop for mobile controls, called each frame by the Game loop.
  update(deltaTime: number): void {
    if (!this.isActive()) return; // Do nothing if not on a mobile device

    // --- Update Move State from Joystick ---
    // Apply the moveVector directly to the shared controls.moveState
    // Y component of moveVector controls forward/backward
    this.controls.moveState.forward = this.moveVector.y;
    // X component of moveVector controls strafing left/right
    this.controls.moveState.right = this.moveVector.x;

    // Clamp values to ensure they are within [-1, 1] range
    this.controls.moveState.forward = Math.max(
      -1,
      Math.min(1, this.controls.moveState.forward)
    );
    this.controls.moveState.right = Math.max(
      -1,
      Math.min(1, this.controls.moveState.right)
    );

    // Sprinting could be added (e.g., double tap joystick or separate button)
    this.controls.moveState.sprint = false; // Default to no sprint for now

    // --- Update Action States from Buttons ---
    // Jump state (held down)
    this.controls.moveState.jump = this.buttonStates.jump ?? false;
    // Attack state (held down)
    this.controls.moveState.attack = this.buttonStates.attack ?? false;
    // Interact state (consumed on press)
    if (this.buttonStates.interact) {
      this.controls.moveState.interact = true;
      this.buttonStates.interact = false; // Consume the press immediately
    } else {
      this.controls.moveState.interact = false;
    }

    // --- Update Camera/Rotation from Look Joystick ---
    const lookSensitivity = 2.5; // Adjust sensitivity for look stick
    if (this.lookVector.lengthSq() > 0.01) {
      // Check if look stick is moved significantly
      if (this.controls.player?.mesh) {
        const yawDelta =
          -this.lookVector.x *
          this.controls.playerRotationSensitivity *
          lookSensitivity;
        this.controls.player.mesh.rotateY(yawDelta);
      }
      if (this.controls.cameraController) {
        const pitchDelta =
          this.lookVector.y *
          this.controls.cameraController.pitchSensitivity *
          lookSensitivity *
          2; // Invert Y? Adjust multiplier as needed
        this.controls.cameraController.handleMouseInput(0, pitchDelta); // Use existing method
      }
    }

    // --- Update Camera/Rotation from Touch Drag (Alternative/Fallback) ---
    // Apply accumulated rotation delta from touch dragging
    // const touchCameraSensitivity = 0.002; // Adjusted sensitivity for touch
    // const touchPlayerRotationSensitivity = 0.0025;
    // if (this.cameraRotationDelta.lengthSq() > 0) {
    //   if (this.controls.player?.mesh) {
    //     const yawDelta = -this.cameraRotationDelta.x * touchPlayerRotationSensitivity;
    //     this.controls.player.mesh.rotateY(yawDelta);
    //   }
    //   if (this.controls.cameraController) {
    //     const pitchDelta = this.cameraRotationDelta.y; // Pass raw deltaY
    //     this.controls.cameraController.handleMouseInput(0, pitchDelta); // Use existing method
    //   }
    //   this.cameraRotationDelta.set(0, 0); // Reset delta after applying
    // }
  }

  // Cleans up joysticks and listeners.
  destroy(): void {
    if (!this.isActive()) return;

    this.moveManager?.destroy();
    this.lookManager?.destroy();
    this.moveManager = null;
    this.lookManager = null;

    // Remove touch listeners if they were added
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

    // Basic button listener removal (more robust needed if dynamically adding/removing)
    // This requires storing the bound listeners for each button event type.
    // For simplicity here, we assume the listeners added in setupButtonListener
    // are the only ones and might rely on element removal to clean up.
    // A better approach involves storing listener references and removing them explicitly.
    console.log(
      "Mobile controls destroyed (listeners might need manual removal if complex)"
    );
  }
}
