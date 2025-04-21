import nipplejs, {
  JoystickManager,
  EventData,
  JoystickOutputData,
} from "nipplejs";
import { Controls } from "./controls";
import { Game } from "../main";
import { Vector2, Vector3 } from "three";
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
  private hasMovedJoystick: boolean = false;

  // Added turn speed property
  private turnSpeed = Math.PI / 12;

  constructor(game: Game, controls: Controls) {
    this.game = game;
    this.controls = controls;

    this.joystickIndicatorCircle = document.getElementById(
      "joystick-indicator-circle"
    );

    if (!this.isMobile()) {
      document.getElementById("mobile-controls-layer")?.classList.add("hidden");
      return;
    }

    this.gameContainer = document.getElementById("game-container");
    this.moveZoneElement = document.getElementById("joystick-zone-left");
    this.setupMoveJoystick();
    this.setupActionButtons();
    document
      .getElementById("mobile-controls-layer")
      ?.classList.remove("hidden");

    if (!this.hasMovedJoystick)
      this.joystickIndicatorCircle?.classList.remove("hidden");
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

  update(deltaTime: number): void {
    if (!this.isMobile()) return;

    const threshold = 0.01;
    if (this.moveVector.lengthSq() > threshold) {
      // Rotation: Use moveVector.x to control turn speed
      const rotationSpeed = this.turnSpeed * this.moveVector.x;
      if (this.controls.player && this.controls.player.mesh) {
        this.controls.player.mesh.rotation.y -= rotationSpeed * deltaTime;
      }

      // Movement: Only move forward when moveVector.y > 0
      const speed = this.moveVector.y;
      this.controls.moveState.forward = speed;
      this.controls.moveState.right = 0;
    } else {
      this.controls.moveState.forward = 0;
      this.controls.moveState.right = 0;
    }

    this.controls.moveState.sprint = false;
    this.controls.moveState.jump = false;

    if (this.switchButton) {
      if (this.game.interactionSystem?.isSwitchTargetAvailable) {
        this.switchButton.classList.remove("hidden");
      } else {
        this.switchButton.classList.add("hidden");
      }
    }
  }

  isActive(): boolean {
    return this.isMobile();
  }

  destroy(): void {
    this.moveManager?.destroy();
  }
}
