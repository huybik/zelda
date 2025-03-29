import * as THREE from 'three';
import { Player } from '../entities/player';
import { ThirdPersonCamera } from './camera';
import { KeyState, MouseState, MoveState } from '../types/common';

type KeyCallback = () => void;
type MouseCallback = (event: MouseEvent) => void;

export class Controls {
    public player: Player | null;
    public cameraController: ThirdPersonCamera | null;
    public domElement: HTMLElement;

    public keys: KeyState = {};
    public mouse: MouseState = { x: 0, y: 0, dx: 0, dy: 0, buttons: {} };
    public isPointerLocked: boolean = false;
    private playerRotationSensitivity: number = 0.0025;

    // Movement state passed to Player
    public moveState: MoveState = {
        forward: 0, right: 0, jump: false, sprint: false, interact: false
    };

    // Listeners for specific actions
    private keyDownListeners: Record<string, KeyCallback[]> = {};
    private mouseClickListeners: Record<number, MouseCallback[]> = {};

    // Bound event handlers
    private boundOnKeyDown: (event: KeyboardEvent) => void;
    private boundOnKeyUp: (event: KeyboardEvent) => void;
    private boundOnMouseDown: (event: MouseEvent) => void;
    private boundOnMouseUp: (event: MouseEvent) => void;
    private boundOnMouseMove: (event: MouseEvent) => void;
    private boundOnClick: (event: MouseEvent) => void;
    private boundOnPointerLockChange: () => void;
    private boundOnPointerLockError: () => void;

    constructor(
        player: Player | null,
        cameraController: ThirdPersonCamera | null,
        domElement: HTMLElement | null
    ) {
        this.player = player;
        this.cameraController = cameraController;
        this.domElement = domElement ?? document.body;

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

    private initListeners(): void {
        document.addEventListener('keydown', this.boundOnKeyDown, false);
        document.addEventListener('keyup', this.boundOnKeyUp, false);
        document.addEventListener('mousedown', this.boundOnMouseDown, false);
        document.addEventListener('mouseup', this.boundOnMouseUp, false);
        document.addEventListener('mousemove', this.boundOnMouseMove, false);
        this.domElement.addEventListener('click', this.boundOnClick, false); // Lock on canvas click
        document.addEventListener('pointerlockchange', this.boundOnPointerLockChange, false);
        document.addEventListener('pointerlockerror', this.boundOnPointerLockError, false);
    }

    public addKeyDownListener(keyCode: string, callback: KeyCallback): void {
        if (!this.keyDownListeners[keyCode]) {
            this.keyDownListeners[keyCode] = [];
        }
        this.keyDownListeners[keyCode].push(callback);
    }

    public addMouseClickListener(buttonIndex: number, callback: MouseCallback): void {
        if (!this.mouseClickListeners[buttonIndex]) {
            this.mouseClickListeners[buttonIndex] = [];
        }
        this.mouseClickListeners[buttonIndex].push(callback);
    }

    public lockPointer(): void {
        if ('requestPointerLock' in this.domElement && document.pointerLockElement !== this.domElement) {
            // console.log("Requesting pointer lock...");
            this.domElement.requestPointerLock().catch(err => {
                console.error("Pointer lock request failed:", err);
            });
        }
    }

    public unlockPointer(): void {
        if (document.pointerLockElement === this.domElement) {
            // console.log("Exiting pointer lock...");
            document.exitPointerLock();
        }
    }

    private onKeyDown(event: KeyboardEvent): void {
        const keyCode = event.code;
        if (this.keys[keyCode]) return; // Prevent repeat firing for held keys

        this.keys[keyCode] = true;

        // Trigger single-press listeners (UI toggles, etc.)
        this.keyDownListeners[keyCode]?.forEach(cb => cb());

        // Update single-frame action flags
        if (keyCode === 'Space') this.moveState.jump = true;
        if (keyCode === 'KeyE') this.moveState.interact = true;

        // Update continuous movement state (WASD, Shift)
        this.updateContinuousMoveState();
    }

    private onKeyUp(event: KeyboardEvent): void {
        const keyCode = event.code;
        this.keys[keyCode] = false;
        // Update continuous movement state
        this.updateContinuousMoveState();
        // Note: Single-frame flags (jump, interact) are consumed/reset by their systems
    }

    private onMouseDown(event: MouseEvent): void {
        this.mouse.buttons[event.button] = true;
        // Trigger general mouse click listeners (e.g., for UI)
        this.mouseClickListeners[event.button]?.forEach(cb => cb(event));
        // Prevent default text selection if interacting with game window
        // if (this.isPointerLocked || event.target === this.domElement) {
        //     event.preventDefault(); // Use cautiously
        // }
    }

    private onMouseUp(event: MouseEvent): void {
        this.mouse.buttons[event.button] = false;
    }

    private onMouseMove(event: MouseEvent): void {
        if (this.isPointerLocked) {
            // Accumulate mouse movement for camera/player rotation
            this.mouse.dx += event.movementX ?? 0;
            this.mouse.dy += event.movementY ?? 0;
        } else {
            // Update regular mouse coords if needed for UI
            this.mouse.x = event.clientX;
            this.mouse.y = event.clientY;
        }
    }

    private onClick(event: MouseEvent): void {
        // Request pointer lock on click if not locked and game isn't paused
        // Assumes global `window.game` reference exists or Game class passed in
        const gameIsPaused = (window as any).game?.isPaused ?? false;
        if (!this.isPointerLocked && !gameIsPaused) {
            this.lockPointer();
        }
    }

    private onPointerLockChange(): void {
        if (document.pointerLockElement === this.domElement) {
            // console.log('Pointer Locked');
            this.isPointerLocked = true;
            this.mouse.dx = 0; // Reset deltas on lock acquire
            this.mouse.dy = 0;
        } else {
            // console.log('Pointer Unlocked');
            this.isPointerLocked = false;
            // Reset keys and movement state when unlocking
            this.keys = {};
            this.mouse.buttons = {};
            this.mouse.dx = 0;
            this.mouse.dy = 0;
            this.updateContinuousMoveState(); // Resets forward/right/sprint
            // Game pause logic handles pausing if UI was opened
        }
    }

    private onPointerLockError(): void {
        console.error('Pointer Lock Error.');
        this.isPointerLocked = false;
    }

    // Updates forward/right/sprint based on currently held keys
    private updateContinuousMoveState(): void {
        const W = this.keys['KeyW'] || this.keys['ArrowUp'];
        const S = this.keys['KeyS'] || this.keys['ArrowDown'];
        const D = this.keys['KeyD'] || this.keys['ArrowRight'];
        const A = this.keys['KeyA'] || this.keys['ArrowLeft'];
        const Sprint = this.keys['ShiftLeft'] || this.keys['ShiftRight'];

        this.moveState.forward = (W ? 1 : 0) - (S ? 1 : 0);
        this.moveState.right = (D ? 1 : 0) - (A ? 1 : 0);
        this.moveState.sprint = Sprint ?? false;
    }

    // Called once per frame in the game loop
    public update(deltaTime: number): void {
        if (!this.isPointerLocked) {
            // Reset deltas if pointer isn't locked
            this.mouse.dx = 0;
            this.mouse.dy = 0;
            return; // Don't process rotation if not locked
        }

        // Apply Player Yaw Rotation (left/right)
        if (this.player && Math.abs(this.mouse.dx) > 0) {
            const yawDelta = -this.mouse.dx * this.playerRotationSensitivity;
            this.player.mesh.rotateY(yawDelta);
        }

        // Apply Camera Pitch (up/down) via Camera Controller
        if (this.cameraController && Math.abs(this.mouse.dy) > 0) {
            this.cameraController.handleMouseInput(this.mouse.dx, this.mouse.dy);
        }

        // Reset mouse deltas for the next frame
        this.mouse.dx = 0;
        this.mouse.dy = 0;
    }

    // Methods for other systems to consume single-frame actions
    public consumeInteraction(): boolean {
        if (this.moveState.interact) {
            this.moveState.interact = false;
            return true;
        }
        return false;
    }

    public consumeJump(): boolean {
        if (this.moveState.jump) {
            this.moveState.jump = false;
            return true;
        }
        return false;
    }

    public dispose(): void {
        document.removeEventListener('keydown', this.boundOnKeyDown);
        document.removeEventListener('keyup', this.boundOnKeyUp);
        document.removeEventListener('mousedown', this.boundOnMouseDown);
        document.removeEventListener('mouseup', this.boundOnMouseUp);
        document.removeEventListener('mousemove', this.boundOnMouseMove);
        this.domElement.removeEventListener('click', this.boundOnClick);
        document.removeEventListener('pointerlockchange', this.boundOnPointerLockChange);
        document.removeEventListener('pointerlockerror', this.boundOnPointerLockError);
        this.unlockPointer(); // Attempt to unlock if active
        console.log("Controls disposed.");
    }
}