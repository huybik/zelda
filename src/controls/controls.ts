/* File: /src/controls/controls.ts */
import { Character } from "../entities/character";
import { ThirdPersonCamera } from "../systems/camera";
import { Game } from "../main";
import { KeyState, MouseState, MoveState } from "../core/utils";

export class Controls {
  player: Character | null;
  cameraController: ThirdPersonCamera | null;
  domElement: HTMLElement;
  game: Game | null;
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
    attack: false, // State indicating if attack input is active
  };
  keyDownListeners: Record<string, Array<() => void>> = {};
  mouseClickListeners: Record<number, Array<(event: MouseEvent) => void>> = {};

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
    if (!this.game?.mobileControls?.isActive()) {
      document.addEventListener("keydown", this.boundOnKeyDown, false);
      document.addEventListener("keyup", this.boundOnKeyUp, false);
      document.addEventListener("mousedown", this.boundOnMouseDown, false);
      document.addEventListener("mouseup", this.boundOnMouseUp, false);
      document.addEventListener("mousemove", this.boundOnMouseMove, false);
      this.domElement.addEventListener("click", this.boundOnClick, false);
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
      // Only listen for Escape key on mobile for menu closing
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

  lockPointer(): void {
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
    console.log(`current pointer lock to ${this.isPointerLocked}`);
    if (document.pointerLockElement === this.domElement) {
      this.isPointerLocked = true;
      document.body.classList.add("pointer-locked");
      this.mouse.dx = 0;
      this.mouse.dy = 0;
      if (!this.game?.isUIPaused()) {
        this.game?.setPauseState(false);
      }
    } else {
      this.isPointerLocked = false;
      document.body.classList.remove("pointer-locked");
      this.keys = {};
      this.mouse.buttons = {};
      this.mouse.dx = 0;
      this.mouse.dy = 0;
      this.updateContinuousMoveState(); // Reset movement states
      this.moveState.attack = false; // Ensure attack state is reset
      if (!this.game?.isUIPaused()) {
        this.game?.setPauseState(true);
      }
    }
    console.log(` pointer lock change to ${this.isPointerLocked}`);
  }

  onPointerLockError(): void {
    console.error("Pointer lock failed.");
    this.isPointerLocked = false;
    document.body.classList.remove("pointer-locked");
  }

  onKeyDown(event: KeyboardEvent): void {
    if (this.game?.mobileControls?.isActive()) return;
    const keyCode = event.code;
    if (this.game?.interactionSystem?.isChatOpen && keyCode !== "Escape")
      return;
    if (this.keys[keyCode]) return; // Prevent multiple triggers for held keys
    this.keys[keyCode] = true;
    this.keyDownListeners[keyCode]?.forEach((cb) => cb());
    if (keyCode === "KeyE") this.moveState.interact = true;
    if (keyCode === "KeyF") {
      this.moveState.attack = true; // Set attack state
    }
    if (keyCode === "Escape") this.handleEscapeKey();
    this.updateContinuousMoveState();
  }

  onKeyUp(event: KeyboardEvent): void {
    if (this.game?.mobileControls?.isActive()) return;
    const keyCode = event.code;
    this.keys[keyCode] = false;
    if (keyCode === "KeyE") this.moveState.interact = false;
    if (keyCode === "KeyF") this.moveState.attack = false; // Reset attack state
    this.updateContinuousMoveState();
  }

  handleEscapeKey(): void {
    // Delegate closing logic to UIManager
    this.game?.uiManager?.closeTopmostUI();
  }

  onMouseDown(event: MouseEvent): void {
    if (this.game?.mobileControls?.isActive()) return;
    if (this.game?.interactionSystem?.isChatOpen) return;
    this.mouse.buttons[event.button] = true;
    this.mouseClickListeners[event.button]?.forEach((cb) => cb(event));
    // Handle left mouse click (button 0) for attack
    if (event.button === 0 && this.isPointerLocked) {
      this.moveState.attack = true; // Set attack state
    }
  }

  onMouseUp(event: MouseEvent): void {
    if (this.game?.mobileControls?.isActive()) return;
    this.mouse.buttons[event.button] = false;
    if (event.button === 0) {
      this.moveState.attack = false; // Reset attack state
    }
  }

  onMouseMove(event: MouseEvent): void {
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
    if (this.game?.mobileControls?.isActive()) return;

    const targetElement = event.target as HTMLElement;
    const isClickOnUI =
      this.game?.uiManager?.isClickOnInteractableUI(targetElement);

    if (this.isPointerLocked) {
      // If pointer is locked, clicks should not interact with background UI or close menus
      return;
    }

    // If clicking outside interactable UI elements and a menu is open, close it
    if (!isClickOnUI) {
      const closedSomething = this.game?.uiManager?.closeOpenMenus();
      // If we closed something, don't try to lock pointer immediately
      if (closedSomething) {
        return;
      }
    }

    // If click was on the game container itself (not UI) and not pointer locked, request lock
    const isGameContainerClick =
      targetElement === this.domElement ||
      (this.domElement.contains(targetElement) && !isClickOnUI);

    if (isGameContainerClick && !this.isPointerLocked) {
      this.lockPointer();
    }
  }

  updateContinuousMoveState(): void {
    if (!this.game?.mobileControls?.isActive()) {
      const W = this.keys["KeyW"] || this.keys["ArrowUp"];
      const S = this.keys["KeyS"] || this.keys["ArrowDown"];
      const D = this.keys["KeyD"] || this.keys["ArrowRight"];
      const A = this.keys["KeyA"] || this.keys["ArrowLeft"];
      const Sprint = this.keys["ShiftLeft"] || this.keys["ShiftRight"];
      this.moveState.forward = (W ? 1 : 0) - (S ? 1 : 0);
      this.moveState.right = (A ? 1 : 0) - (D ? 1 : 0);
      this.moveState.sprint = Sprint ?? false;
      // Attack state is now managed by key/mouse down/up events directly
    }
  }

  update(deltaTime: number): void {
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
        this.cameraController.handleMouseInput(this.mouse.dx, -this.mouse.dy);
      }
    }
    this.mouse.dx = 0;
    this.mouse.dy = 0;
    this.updateContinuousMoveState();
  }

  dispose(): void {
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
      // Remove the specific listener added for mobile
      document.removeEventListener("keydown", this.handleEscapeKey);
    }
  }
}
