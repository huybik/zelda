import { Character } from "../entities/entities";
import { ThirdPersonCamera } from "../systems/camera";
import { Game } from "../main";
import { KeyState, MouseState, MoveState } from "../core/helper";

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
    attack: false,
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
    if (document.pointerLockElement === this.domElement) {
      this.isPointerLocked = true;
      document.body.classList.add("pointer-locked");
      this.mouse.dx = 0;
      this.mouse.dy = 0;
      const inventoryIsOpen = this.game?.inventoryDisplay?.isOpen ?? false;
      const journalIsOpen = this.game?.journalDisplay?.isOpen ?? false;
      const chatIsOpen = this.game?.interactionSystem?.isChatOpen ?? false;
      if (!inventoryIsOpen && !journalIsOpen && !chatIsOpen) {
        this.game?.setPauseState(false);
      }
    } else {
      this.isPointerLocked = false;
      document.body.classList.remove("pointer-locked");
      this.keys = {};
      this.mouse.buttons = {};
      this.mouse.dx = 0;
      this.mouse.dy = 0;
      this.updateContinuousMoveState();
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
    document.body.classList.remove("pointer-locked");
  }

  onKeyDown(event: KeyboardEvent): void {
    if (this.game?.mobileControls?.isActive()) return;
    const keyCode = event.code;
    if (this.game?.interactionSystem?.isChatOpen && keyCode !== "Escape")
      return;
    if (this.keys[keyCode]) return;
    this.keys[keyCode] = true;
    this.keyDownListeners[keyCode]?.forEach((cb) => cb());
    if (keyCode === "Space") this.moveState.jump = true;
    if (keyCode === "KeyE") this.moveState.interact = true;
    if (keyCode === "KeyF") this.moveState.attack = true;
    if (keyCode === "Escape") this.handleEscapeKey();
    this.updateContinuousMoveState();
  }

  onKeyUp(event: KeyboardEvent): void {
    if (this.game?.mobileControls?.isActive()) return;
    const keyCode = event.code;
    this.keys[keyCode] = false;
    if (keyCode === "KeyF") this.moveState.attack = false;
    this.updateContinuousMoveState();
  }

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

  onMouseDown(event: MouseEvent): void {
    if (this.game?.mobileControls?.isActive()) return;
    if (this.game?.interactionSystem?.isChatOpen) return;
    this.mouse.buttons[event.button] = true;
    this.mouseClickListeners[event.button]?.forEach((cb) => cb(event));
  }

  onMouseUp(event: MouseEvent): void {
    if (this.game?.mobileControls?.isActive()) return;
    this.mouse.buttons[event.button] = false;
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
    const isGameContainerClick =
      targetElement === this.domElement ||
      (this.domElement.contains(targetElement) &&
        targetElement.closest(
          "#inventory-display, #journal-display, #chat-container, #minimap-canvas, #welcome-banner, #mobile-controls-layer"
        ) === null);
    const inventoryIsOpen = this.game?.inventoryDisplay?.isOpen ?? false;
    const journalIsOpen = this.game?.journalDisplay?.isOpen ?? false;
    const chatIsOpen = this.game?.interactionSystem?.isChatOpen ?? false;
    const uiBlocksPointerLock = inventoryIsOpen || journalIsOpen || chatIsOpen;
    if (isGameContainerClick && !this.isPointerLocked && !uiBlocksPointerLock) {
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

  consumeInteraction(): boolean {
    if (!this.moveState.interact) return false;
    this.moveState.interact = false;
    return true;
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
    }
  }
}
