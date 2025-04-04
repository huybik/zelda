// src/systems/Controls.ts
import {
  PerspectiveCamera,
  Object3D,
  Vector3,
  MathUtils,
  Raycaster,
} from "three";
import type { Character } from "../core/Character";
import type { KeyState, MouseState, MoveState } from "../types";
import { smoothVectorLerp } from "../utils";
import {
  CAMERA_COLLISION_OFFSET,
  CAMERA_MIN_DISTANCE,
  CAMERA_MAX_DISTANCE,
  CHARACTER_HEIGHT,
} from "../config";
import type { Game } from "../Game"; // Use type import
import type { MobileControls } from "./MobileControls"; // Use type import

// --- Third Person Camera Logic ---
export class ThirdPersonCamera {
  camera: PerspectiveCamera;
  target: Object3D; // The object the camera follows (usually player mesh)
  idealOffset: Vector3 = new Vector3(0, 2.5, -3.5); // Desired offset from target (behind, slightly above)
  minOffsetDistance: number = CAMERA_MIN_DISTANCE; // Closest camera can get
  maxOffsetDistance: number = CAMERA_MAX_DISTANCE; // Furthest camera can zoom out (or pushed back)
  pitchAngle: number = 0.15; // Initial downward tilt
  minPitch: number = -Math.PI / 3; // Limit looking down
  maxPitch: number = Math.PI / 2.5; // Limit looking up
  pitchSensitivity: number = 0.0025;
  lerpAlphaPositionBase: number = 0.05; // Smoothing factor for position (lower = smoother/slower)
  lerpAlphaLookatBase: number = 0.1; // Smoothing factor for lookat point

  // Collision handling
  collisionRaycaster: Raycaster;
  collisionOffset: number = CAMERA_COLLISION_OFFSET; // Push camera slightly away from collision point

  // Internal state vectors to avoid reallocation
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
    this.collisionRaycaster.camera = camera; // Associate camera for potential optimizations

    // Initialize current position and lookat based on target
    this.currentPosition = new Vector3();
    this.currentLookat = new Vector3();
    this.target.getWorldPosition(this.currentLookat);
    // Initial lookat point slightly above the target's base
    this.currentLookat.y += (target.userData?.height ?? CHARACTER_HEIGHT) * 0.6;

    // Calculate initial camera position
    this.update(0.016, []); // Run update once for initial placement
    this.camera.position.copy(this.currentPosition);
    this.camera.lookAt(this.currentLookat);
  }

  // Updates the camera's pitch based on vertical mouse movement.
  handleMouseInput(deltaX: number, deltaY: number): void {
    // Yaw (deltaX) rotation is typically handled by rotating the player character directly.
    // Update pitch based on deltaY
    this.pitchAngle += deltaY * this.pitchSensitivity;
    // Clamp pitch angle within limits
    this.pitchAngle = MathUtils.clamp(
      this.pitchAngle,
      this.minPitch,
      this.maxPitch
    );
  }

  // Updates the camera's position and lookat point, handling collisions.
  update(deltaTime: number, collidables: Object3D[]): void {
    // Ensure target is still valid and part of the scene
    if (!this.target?.parent) return;

    // Get current world position and orientation of the target
    this.target.getWorldPosition(this.targetPosition);
    const targetQuaternion = this.target.quaternion;

    // 1. Calculate Ideal Camera Position
    // Start with base offset, apply pitch rotation, then apply target's yaw rotation
    this.offset
      .copy(this.idealOffset)
      .applyAxisAngle(new Vector3(1, 0, 0), this.pitchAngle) // Apply pitch
      .applyQuaternion(targetQuaternion); // Apply target's rotation
    this.idealPosition.copy(this.targetPosition).add(this.offset);

    // 2. Collision Detection
    this.cameraDirection.copy(this.idealPosition).sub(this.targetPosition);
    let idealDistance = this.cameraDirection.length();
    this.cameraDirection.normalize();

    // Raycast from near the target towards the ideal camera position
    // Start ray slightly away from target center along the camera direction
    this.rayOrigin
      .copy(this.targetPosition)
      .addScaledVector(this.cameraDirection, 0.2);
    this.collisionRaycaster.set(this.rayOrigin, this.cameraDirection);
    // Set raycaster far distance to check only up to the ideal position
    this.collisionRaycaster.far = Math.max(0, idealDistance - 0.2);
    this.collisionRaycaster.near = 0;

    // Filter collidables to check against (exclude target itself, non-collidables)
    const collisionCheckObjects = collidables.filter(
      (obj) => obj !== this.target && obj?.userData?.isCollidable && obj.parent // Ensure in scene
    );
    const intersects = this.collisionRaycaster.intersectObjects(
      collisionCheckObjects,
      true
    ); // Check recursively

    let actualDistance = idealDistance;
    if (intersects.length > 0) {
      // Find the closest collision point distance along the ray
      const closestHitDist = intersects.reduce(
        (minDist, i) => Math.min(minDist, i.distance),
        idealDistance // Initialize minimum with ideal distance
      );
      // Adjust distance based on hit, push slightly away from collision, ensure minimum offset
      actualDistance = Math.max(
        this.minOffsetDistance,
        closestHitDist + 0.2 - this.collisionOffset // Add back the 0.2 offset from ray origin
      );
    }

    // Clamp final distance between min and max limits
    actualDistance = MathUtils.clamp(
      actualDistance,
      this.minOffsetDistance,
      this.maxOffsetDistance
    );

    // Calculate final camera position based on adjusted distance
    this.finalPosition
      .copy(this.targetPosition)
      .addScaledVector(this.cameraDirection, actualDistance);

    // 3. Calculate Ideal Lookat Point
    // Aim slightly above the target's base for a better view
    const targetHeight = this.target.userData?.height ?? CHARACTER_HEIGHT;
    this.idealLookat
      .copy(this.targetPosition)
      .add(new Vector3(0, targetHeight * 0.6, 0));

    // 4. Smooth Interpolation
    // Use smoothVectorLerp for smoother camera movement
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

    // 5. Apply Final Position and Lookat
    this.camera.position.copy(this.currentPosition);
    this.camera.lookAt(this.currentLookat);
  }

  // Method to update the target object the camera follows
  setTarget(newTarget: Object3D): void {
    if (newTarget && newTarget !== this.target) {
      this.target = newTarget;
      // Optionally reset pitch or smoothly transition lookat point
      // this.pitchAngle = 0.15; // Reset pitch?
      this.target.getWorldPosition(this.idealLookat);
      this.idealLookat.y +=
        (this.target.userData?.height ?? CHARACTER_HEIGHT) * 0.6;
      this.currentLookat.copy(this.idealLookat); // Snap lookat initially
    }
  }
}

// --- Desktop Controls Logic ---
export class Controls {
  player: Character | null;
  cameraController: ThirdPersonCamera | null;
  domElement: HTMLElement;
  game: Game; // Required reference to interact with game state (pause, UI)
  mobileControls: MobileControls | null = null; // Reference set by Game

  // Input states
  keys: KeyState = {};
  mouse: MouseState = { x: 0, y: 0, dx: 0, dy: 0, buttons: {} };
  isPointerLocked: boolean = false;
  playerRotationSensitivity: number = 0.0025; // Mouse sensitivity for player yaw

  // Player action state derived from inputs
  moveState: MoveState = {
    forward: 0,
    right: 0,
    sprint: false,
    interact: false,
    attack: false,
  };

  // Custom event listeners
  keyDownListeners: Record<string, Array<() => void>> = {};
  mouseClickListeners: Record<number, Array<(event: MouseEvent) => void>> = {};

  // Bound event handlers for easy addition/removal
  private boundOnKeyDown: (event: KeyboardEvent) => void;
  private boundOnKeyUp: (event: KeyboardEvent) => void;
  private boundOnMouseDown: (event: MouseEvent) => void;
  private boundOnMouseUp: (event: MouseEvent) => void;
  private boundOnMouseMove: (event: MouseEvent) => void;
  private boundOnClick: (event: MouseEvent) => void;
  private boundOnPointerLockChange: () => void;
  private boundOnPointerLockError: () => void;
  private boundHandleEscape: (event: KeyboardEvent) => void;

  constructor(
    player: Character | null,
    cameraController: ThirdPersonCamera | null,
    domElement: HTMLElement,
    game: Game
  ) {
    this.player = player;
    this.cameraController = cameraController;
    this.domElement = domElement; // Typically the renderer's canvas container
    this.game = game;

    // Bind event handler methods to `this` instance
    this.boundOnKeyDown = this.onKeyDown.bind(this);
    this.boundOnKeyUp = this.onKeyUp.bind(this);
    this.boundOnMouseDown = this.onMouseDown.bind(this);
    this.boundOnMouseUp = this.onMouseUp.bind(this);
    this.boundOnMouseMove = this.onMouseMove.bind(this);
    this.boundOnClick = this.onClick.bind(this);
    this.boundOnPointerLockChange = this.onPointerLockChange.bind(this);
    this.boundOnPointerLockError = this.onPointerLockError.bind(this);
    // Specific handler for Escape key, always active
    this.boundHandleEscape = (e) => {
      if (e.code === "Escape") this.handleEscapeKey();
    };

    this.initListeners();
  }

  // Initialize event listeners (conditionally for desktop)
  initListeners(): void {
    // Escape key listener is always active
    document.addEventListener("keydown", this.boundHandleEscape, false);

    // Add other listeners only if not primarily a mobile setup
    // The check `!this.mobileControls?.isActive()` might be premature here if mobileControls isn't set yet.
    // A better approach might be to add them initially and remove if mobile becomes active,
    // or rely on the Game class to call a method here after mobile controls are initialized.
    // For now, assume desktop listeners are added unless explicitly told otherwise later.
    this.addDesktopListeners();
  }

  // Adds listeners typically used for desktop controls
  addDesktopListeners(): void {
    document.addEventListener("keydown", this.boundOnKeyDown, false);
    document.addEventListener("keyup", this.boundOnKeyUp, false);
    document.addEventListener("mousedown", this.boundOnMouseDown, false);
    document.addEventListener("mouseup", this.boundOnMouseUp, false);
    document.addEventListener("mousemove", this.boundOnMouseMove, false);
    this.domElement.addEventListener("click", this.boundOnClick, false); // Click on canvas to lock pointer
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
  }

  // Removes listeners typically used for desktop controls
  removeDesktopListeners(): void {
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
  }

  // --- Custom Event Listener Registration ---
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

  // --- Pointer Lock Handling ---
  lockPointer(): void {
    // Only attempt lock if not on mobile and pointer isn't already locked
    if (
      !this.mobileControls?.isActive() &&
      document.pointerLockElement !== this.domElement
    ) {
      this.domElement.requestPointerLock();
    }
  }

  unlockPointer(): void {
    if (
      !this.mobileControls?.isActive() &&
      document.pointerLockElement === this.domElement
    ) {
      document.exitPointerLock();
    }
  }

  onPointerLockChange(): void {
    if (document.pointerLockElement === this.domElement) {
      this.isPointerLocked = true;
      document.body.classList.add("pointer-locked"); // Optional: CSS styling hook
      this.mouse.dx = 0; // Reset mouse delta on lock/unlock
      this.mouse.dy = 0;
      // Try to unpause game if pointer lock is acquired and no blocking UI is open
      if (!this.game.isUIBlockingGameplay()) {
        this.game.setPauseState(false);
      }
    } else {
      this.isPointerLocked = false;
      document.body.classList.remove("pointer-locked");
      // Reset input states when pointer is unlocked to prevent stuck actions
      this.keys = {};
      this.mouse.buttons = {};
      this.mouse.dx = 0;
      this.mouse.dy = 0;
      this.updateContinuousMoveState(); // Reset forward/right/sprint state
      // Pause the game if pointer lock is lost and no blocking UI is open
      if (!this.game.isUIBlockingGameplay()) {
        this.game.setPauseState(true);
      }
    }
  }

  onPointerLockError(): void {
    console.error("Pointer lock request failed.");
    this.isPointerLocked = false;
    document.body.classList.remove("pointer-locked");
  }

  // --- Keyboard Event Handlers ---
  onKeyDown(event: KeyboardEvent): void {
    // Ignore key presses if chat is open or key is already held down
    // Also ignore if mobile controls are active (prevents double input)
    if (
      this.game.interactionSystem?.isChatOpen ||
      this.keys[event.code] ||
      this.mobileControls?.isActive()
    ) {
      return;
    }

    this.keys[event.code] = true;

    // Trigger custom listeners for this key code
    this.keyDownListeners[event.code]?.forEach((cb) => cb());

    // Update single-press actions (consumed later)
    if (event.code === "KeyE") this.moveState.interact = true;
    if (event.code === "KeyF") this.moveState.attack = true; // Attack starts on press

    // Update continuous movement state (forward, right, sprint)
    this.updateContinuousMoveState();
  }

  onKeyUp(event: KeyboardEvent): void {
    if (this.mobileControls?.isActive()) return; // Ignore if mobile is active

    this.keys[event.code] = false;

    // Reset continuous actions tied to key release
    if (event.code === "KeyF") this.moveState.attack = false; // Attack stops on release

    // Update continuous movement state
    this.updateContinuousMoveState();
  }

  // Handles the Escape key press for various UI interactions.
  handleEscapeKey(): void {
    if (this.game.interactionSystem?.isChatOpen) {
      this.game.interactionSystem.closeChatInterface();
    } else if (this.game.inventoryDisplay?.isOpen) {
      this.game.inventoryDisplay.hide();
      this.game.setPauseState(false); // Unpause after closing UI
      this.lockPointer(); // Re-lock pointer if possible
    } else if (this.game.journalDisplay?.isOpen) {
      this.game.journalDisplay.hide();
      this.game.setPauseState(false);
      this.lockPointer();
    } else if (this.isPointerLocked) {
      // If no UI is open, Escape unlocks the pointer
      this.unlockPointer();
    }
    // If pointer is not locked and no UI is open, Escape does nothing here
  }

  // --- Mouse Event Handlers ---
  onMouseDown(event: MouseEvent): void {
    if (
      this.game.interactionSystem?.isChatOpen ||
      this.mobileControls?.isActive()
    )
      return;
    this.mouse.buttons[event.button] = true;
    // Trigger custom listeners for this mouse button
    this.mouseClickListeners[event.button]?.forEach((cb) => cb(event));
    // Example: Left click (button 0) could trigger attack
    // if (event.button === 0) this.moveState.attack = true;
  }

  onMouseUp(event: MouseEvent): void {
    if (this.mobileControls?.isActive()) return;
    this.mouse.buttons[event.button] = false;
    // Example: Stop attack on left click release
    // if (event.button === 0) this.moveState.attack = false;
  }

  onMouseMove(event: MouseEvent): void {
    if (this.mobileControls?.isActive()) return;
    if (this.isPointerLocked) {
      // Accumulate movement delta while pointer is locked
      this.mouse.dx += event.movementX ?? 0;
      this.mouse.dy += event.movementY ?? 0;
    } else {
      // Update absolute mouse position if pointer is not locked
      this.mouse.x = event.clientX;
      this.mouse.y = event.clientY;
    }
  }

  // Handles clicks on the DOM element (e.g., game canvas).
  onClick(event: MouseEvent): void {
    if (this.mobileControls?.isActive()) return;
    const targetElement = event.target as HTMLElement;

    // Check if the click is directly on the game's rendering canvas/container
    // and not on any overlay UI elements.
    const isGameCanvasClick =
      targetElement === this.domElement ||
      (this.domElement.contains(targetElement) &&
        targetElement.closest(
          "#hud, #mobile-controls-layer, #inventory-display, #journal-display, #chat-container, #minimap-canvas, #interaction-prompt, #welcome-banner"
        ) === null);

    // If clicked on the game area, pointer isn't locked, and no UI is blocking, request pointer lock.
    if (
      isGameCanvasClick &&
      !this.isPointerLocked &&
      !this.game.isUIBlockingGameplay()
    ) {
      this.lockPointer();
    }
  }

  // Updates the continuous movement state (forward, right, sprint) based on currently held keys.
  updateContinuousMoveState(): void {
    // Only update from keyboard if mobile controls are not active
    if (!this.mobileControls?.isActive()) {
      const W = this.keys["KeyW"] || this.keys["ArrowUp"];
      const S = this.keys["KeyS"] || this.keys["ArrowDown"];
      const A = this.keys["KeyA"] || this.keys["ArrowLeft"];
      const D = this.keys["KeyD"] || this.keys["ArrowRight"];
      const Sprint = this.keys["ShiftLeft"] || this.keys["ShiftRight"];

      this.moveState.forward = (W ? 1 : 0) - (S ? 1 : 0); // 1 for W, -1 for S
      this.moveState.right = (A ? 1 : 0) - (D ? 1 : 0); // 1 for D]!, -1 for D(strafe)
      this.moveState.sprint = Sprint ?? false;
    }
    // If mobile controls are active, they will directly modify moveState.forward/right/sprint
    // in the MobileControls.update() method. This function ensures keyboard input
    // doesn't interfere when mobile is active.
  }

  // Main update loop for controls, called each frame by the Game loop.
  update(deltaTime: number): void {
    // --- Player Rotation (Mouse Input - Desktop Only) ---
    if (
      !this.mobileControls?.isActive() &&
      this.isPointerLocked &&
      this.player?.mesh
    ) {
      // Apply yaw rotation to the player based on horizontal mouse movement
      if (Math.abs(this.mouse.dx) > 0) {
        const yawDelta = -this.mouse.dx * this.playerRotationSensitivity;
        this.player.mesh.rotateY(yawDelta);
      }
      // Apply pitch rotation to the camera based on vertical mouse movement
      if (this.cameraController && Math.abs(this.mouse.dy) > 0) {
        this.cameraController.handleMouseInput(this.mouse.dx, this.mouse.dy);
      }
    }
    // Reset mouse delta accumulation for the next frame
    this.mouse.dx = 0;
    this.mouse.dy = 0;

    // --- Keyboard Movement State Update (Desktop Only) ---
    // This ensures the moveState reflects currently held keys for this frame
    this.updateContinuousMoveState();

    // Note: Mobile input (joystick, buttons) is applied directly to this.moveState
    // by the MobileControls.update() method, which should be called *before*
    // the player character's update method in the main game loop.
  }

  // Consumes the interact action state (resets it after checking).
  consumeInteraction(): boolean {
    if (this.moveState.interact) {
      this.moveState.interact = false; // Reset after consumption
      return true;
    }
    return false;
  }

  // Cleans up event listeners when controls are no longer needed.
  dispose(): void {
    document.removeEventListener("keydown", this.boundHandleEscape);
    this.removeDesktopListeners(); // Remove desktop-specific listeners

    // Clear custom listener arrays
    this.keyDownListeners = {};
    this.mouseClickListeners = {};

    // Ensure pointer lock is released if active
    this.unlockPointer();
  }
}
