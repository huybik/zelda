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
  private cameraJoystick: Joystick | null = null;
  private moveManager: JoystickManager | null = null; // Store manager instance
  private cameraManager: JoystickManager | null = null; // Store manager instance
  private moveVector = new Vector2(0, 0);
  private cameraVector = new Vector2(0, 0);
  private interactButton: HTMLElement | null = null;
  private attackButton: HTMLElement | null = null;
  private inventoryButton: HTMLElement | null = null;
  private journalButton: HTMLElement | null = null;

  private attackHeld: boolean = false;
  private interactPressed: boolean = false;

  constructor(game: Game, controls: Controls) {
    this.game = game;
    this.controls = controls;

    if (!this.isMobile()) {
      console.log("Not a mobile device, skipping mobile controls setup.");
      // Hide mobile UI elements if they exist
      document.getElementById("mobile-controls-layer")?.classList.add("hidden");
      return;
    }

    console.log("Setting up mobile controls.");
    this.setupJoysticks();
    this.setupButtons();
    document
      .getElementById("mobile-controls-layer")
      ?.classList.remove("hidden");
  }

  private isMobile(): boolean {
    // Basic check for touch support or small screen width
    const hasTouch = "ontouchstart" in window || navigator.maxTouchPoints > 0;
    const smallScreen = window.innerWidth < 768; // Adjust threshold as needed
    return hasTouch || smallScreen;
  }

  private setupJoysticks(): void {
    const moveZone = document.getElementById("joystick-zone-left");
    const cameraZone = document.getElementById("joystick-zone-right");

    if (!moveZone || !cameraZone) {
      console.error("Joystick zones not found in HTML!");
      return;
    }

    const joystickSize = 100; // Define size here

    const commonOptions: JoystickManagerOptions = {
      mode: "static", // Keep joysticks in place
      color: "rgba(255, 255, 255, 0.5)",
      fadeTime: 150,
      size: joystickSize, // Use defined size
    };

    this.moveManager = nipplejs.create({
      ...commonOptions,
      zone: moveZone,
      position: { left: "50%", top: "50%" }, // Center within the zone
    });

    this.cameraManager = nipplejs.create({
      ...commonOptions,
      zone: cameraZone,
      position: { left: "50%", top: "50%" }, // Center within the zone
    });

    // Handler for move joystick
    const handleMove = (evt: EventData, nipple: JoystickOutputData) => {
      if (nipple.angle && nipple.force) {
        this.moveVector.set(
          Math.cos(nipple.angle.radian) * nipple.force,
          Math.sin(nipple.angle.radian) * nipple.force
        );
      } else {
        // Fallback if angle/force aren't available (shouldn't happen on move)
        this.moveVector.set(0, 0);
      }
    };

    // Handler for camera joystick
    const handleCameraMove = (evt: EventData, nipple: JoystickOutputData) => {
      if (nipple.angle && nipple.force) {
        // Use distance from center for camera movement speed
        // Access size from the options used to create the manager
        const managerSize = joystickSize; // Use the predefined joystick size
        const distance = nipple.distance / (managerSize / 2); // Normalize distance
        this.cameraVector.set(
          Math.cos(nipple.angle.radian) * distance,
          Math.sin(nipple.angle.radian) * distance
        );
      } else {
        this.cameraVector.set(0, 0);
      }
    };

    // Register listeners for move joystick
    this.moveManager.on("start", handleMove); // Update on start
    this.moveManager.on("move", handleMove); // Update on move
    this.moveManager.on("end", () => {
      // Reset on end
      this.moveVector.set(0, 0);
    });

    // Register listeners for camera joystick
    this.cameraManager.on("start", handleCameraMove); // Update on start
    this.cameraManager.on("move", handleCameraMove); // Update on move
    this.cameraManager.on("end", () => {
      // Reset on end
      this.cameraVector.set(0, 0);
    });

    // Get joystick instances (optional, if needed elsewhere)
    this.moveJoystick = this.moveManager.get(this.moveManager.ids[0]);
    this.cameraJoystick = this.cameraManager.get(this.cameraManager.ids[0]);
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

    // Interact Button (Tap)
    this.interactButton.addEventListener(
      "touchstart",
      (e) => {
        e.preventDefault(); // Prevent default touch behavior (like scrolling or zooming)
        this.interactPressed = true;
        this.interactButton?.classList.add("active");
      },
      { passive: false }
    ); // Use passive: false for preventDefault
    this.interactButton.addEventListener(
      "touchend",
      (e) => {
        e.preventDefault();
        this.interactPressed = false; // Reset immediately on touchend
        this.interactButton?.classList.remove("active");
      },
      { passive: false }
    );
    // Add mouse events as fallback for testing on desktop
    this.interactButton.addEventListener("mousedown", () => {
      this.interactPressed = true;
      this.interactButton?.classList.add("active");
    });
    this.interactButton.addEventListener("mouseup", () => {
      this.interactPressed = false;
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
    // Fallback mouse events
    this.attackButton.addEventListener("mousedown", () => {
      this.attackHeld = true;
      this.attackButton?.classList.add("active");
    });
    this.attackButton.addEventListener("mouseup", () => {
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
    ); // Visual feedback
    this.inventoryButton.addEventListener(
      "touchend",
      (e) => {
        e.preventDefault();
        this.inventoryButton?.classList.remove("active");
        // Trigger the action on touchend for better responsiveness
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
    ); // Visual feedback
    this.journalButton.addEventListener(
      "touchend",
      (e) => {
        e.preventDefault();
        this.journalButton?.classList.remove("active");
        // Trigger the action on touchend
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
    // Normalize move vector if needed, map to forward/right
    // Forward/Backward movement comes from Y component
    // Right/Left movement comes from X component (inverted)
    this.controls.moveState.forward = this.moveVector.y;
    this.controls.moveState.right = -this.moveVector.x; // Invert X for strafing

    // Clamp values to [-1, 1] if force exceeds 1 (though nipplejs usually caps force at 1)
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

    // --- Update Button States ---
    // Interact is consumed per frame in Controls.ts
    if (this.interactPressed) {
      this.controls.moveState.interact = true;
      this.interactPressed = false; // Consume the press immediately after setting
    }
    // Attack is held
    this.controls.moveState.attack = this.attackHeld;

    // Jump could be added (e.g., swipe up on right joystick or separate button)
    this.controls.moveState.jump = false; // Default to no jump

    // --- Update Camera/Rotation ---
    const cameraSensitivity = 2.5; // Adjust sensitivity
    const playerRotationSensitivity = 2.0; // Adjust sensitivity

    if (this.controls.player && this.controls.player.mesh) {
      // Apply Yaw rotation (left/right) from camera joystick X to the player model
      const yawDelta =
        -this.cameraVector.x * playerRotationSensitivity * deltaTime;
      this.controls.player.mesh.rotateY(yawDelta);
    }

    if (this.controls.cameraController) {
      // Apply Pitch rotation (up/down) from camera joystick Y to the camera controller
      // Invert Y because joystick up should mean camera look up (negative pitch change)
      const pitchDelta =
        -this.cameraVector.y * cameraSensitivity * deltaTime * 100; // Multiply by 100 because sensitivity is low for mouse
      this.controls.cameraController.handleMouseInput(0, pitchDelta); // Use the existing method
    }
  }

  // Expose a method to check if mobile controls are active
  isActive(): boolean {
    return this.isMobile();
  }

  // Optional: Add a destroy method to clean up listeners
  destroy(): void {
    this.moveManager?.destroy();
    this.cameraManager?.destroy();
    // TODO: Remove button event listeners if necessary
  }
}
