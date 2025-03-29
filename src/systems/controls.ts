import { Player } from '../entities/player';
import { ThirdPersonCamera } from './camera';
import { KeyState, MouseState, MoveState } from '../types/common';

type KeyCallback = () => void;
type MouseCallback = (event: MouseEvent) => void;

export class Controls {
    public player: Player | null;
    public cameraController: ThirdPersonCamera | null;
    public domElement: HTMLElement | null; // FIX: Allow null

    public keys: KeyState = {};
    public mouse: MouseState = { x: 0, y: 0, dx: 0, dy: 0, buttons: {} };
    public isPointerLocked: boolean = false;
    private playerRotationSensitivity: number = 0.0025;
    // Move state updated here, consumed by Player
    public moveState: MoveState = { forward: 0, right: 0, jump: false, sprint: false, interact: false };

    private keyDownListeners: Record<string, KeyCallback[]> = {};
    private mouseClickListeners: Record<number, MouseCallback[]> = {};

    // Bound event handlers need explicit types
    private boundOnKeyDown: (event: KeyboardEvent) => void;
    private boundOnKeyUp: (event: KeyboardEvent) => void;
    private boundOnMouseDown: (event: MouseEvent) => void;
    private boundOnMouseUp: (event: MouseEvent) => void;
    private boundOnMouseMove: (event: MouseEvent) => void;
    private boundOnClick: (event: MouseEvent) => void;
    private boundOnPointerLockChange: () => void;
    private boundOnPointerLockError: () => void;

    constructor(player: Player | null, cameraController: ThirdPersonCamera | null, domElement: HTMLElement | null) {
        this.player = player; this.cameraController = cameraController;
        // FIX: Assign potentially null domElement
        this.domElement = domElement;

        // Bind methods to ensure 'this' context
        this.boundOnKeyDown = this.onKeyDown.bind(this); this.boundOnKeyUp = this.onKeyUp.bind(this);
        this.boundOnMouseDown = this.onMouseDown.bind(this); this.boundOnMouseUp = this.onMouseUp.bind(this);
        this.boundOnMouseMove = this.onMouseMove.bind(this); this.boundOnClick = this.onClick.bind(this);
        this.boundOnPointerLockChange = this.onPointerLockChange.bind(this);
        this.boundOnPointerLockError = this.onPointerLockError.bind(this);

        this.initListeners();
    }

    private initListeners(): void {
        // Add listeners to document or specific element if available
        const targetElement = this.domElement ?? document;
        document.addEventListener('keydown', this.boundOnKeyDown); document.addEventListener('keyup', this.boundOnKeyUp);
        document.addEventListener('mousedown', this.boundOnMouseDown); document.addEventListener('mouseup', this.boundOnMouseUp);
        document.addEventListener('mousemove', this.boundOnMouseMove);
        targetElement.addEventListener('click', this.boundOnClick); // Click listener on target/document
        document.addEventListener('pointerlockchange', this.boundOnPointerLockChange);
        document.addEventListener('pointerlockerror', this.boundOnPointerLockError);
    }

    public addKeyDownListener(keyCode: string, callback: KeyCallback): void {
        (this.keyDownListeners[keyCode] ??= []).push(callback);
    }

    public addMouseClickListener(buttonIndex: number, callback: MouseCallback): void {
        (this.mouseClickListeners[buttonIndex] ??= []).push(callback);
    }

    public lockPointer(): void {
        // FIX: Check domElement exists and has requestPointerLock
        if (this.domElement && 'requestPointerLock' in this.domElement && document.pointerLockElement !== this.domElement) {
            this.domElement.requestPointerLock().catch(err => console.error("Pointer lock failed:", err));
        } else if (!this.domElement) {
             console.warn("Cannot lock pointer: domElement is null.");
        }
    }

    public unlockPointer(): void {
        // FIX: Check domElement exists
        if (this.domElement && document.pointerLockElement === this.domElement) document.exitPointerLock();
    }

    private onKeyDown(event: KeyboardEvent): void {
        const code = event.code;
        if (this.keys[code] || event.repeat) return; // Prevent repeats
        this.keys[code] = true;
        this.keyDownListeners[code]?.forEach(cb => cb());

        // Set single-frame flags (consumed elsewhere)
        if (code === 'Space' && !this.moveState.jump) this.moveState.jump = true; // Only set if not already set
        if (code === 'KeyE' && !this.moveState.interact) this.moveState.interact = true; // Only set if not already set

        this.updateContinuousMoveState();
        // Update player moveState immediately if needed, or let player read it in its update
         if (this.player) this.player.moveState = this.moveState;
    }

    private onKeyUp(event: KeyboardEvent): void {
        const code = event.code;
        this.keys[code] = false;
        // Reset single-frame flags if the key is released (optional, depends on consumption logic)
        // if (code === 'Space') this.moveState.jump = false; // Usually consumed, not reset here
        // if (code === 'KeyE') this.moveState.interact = false; // Usually consumed, not reset here

        this.updateContinuousMoveState();
         // Update player moveState immediately if needed
         if (this.player) this.player.moveState = this.moveState;
    }

    private onMouseDown(event: MouseEvent): void {
        this.mouse.buttons[event.button] = true;
        this.mouseClickListeners[event.button]?.forEach(cb => cb(event));
    }

    // FIX: Mark event as unused if needed
    private onMouseUp(_event: MouseEvent): void {
        this.mouse.buttons[_event.button] = false; // Use parameter name
    }

    private onMouseMove(event: MouseEvent): void {
        if (this.isPointerLocked) {
            this.mouse.dx += event.movementX ?? 0;
            this.mouse.dy += event.movementY ?? 0;
        } else {
            // Update absolute position only if not locked (relevant for UI interaction?)
            this.mouse.x = event.clientX; this.mouse.y = event.clientY;
        }
    }

    private onClick(_event: MouseEvent): void { // Mark event unused
        const gameIsPaused = (window as any).game?.isPaused ?? false;
        if (!this.isPointerLocked && !gameIsPaused) this.lockPointer();
    }

    private onPointerLockChange(): void {
        // FIX: Check domElement exists
        this.isPointerLocked = !!(this.domElement && document.pointerLockElement === this.domElement);
        console.log(`Pointer ${this.isPointerLocked ? 'Locked' : 'Unlocked'}`);
        this.mouse.dx = 0; this.mouse.dy = 0; // Reset deltas
        if (!this.isPointerLocked) { // Reset state on unlock
            this.keys = {}; this.mouse.buttons = {};
            this.updateContinuousMoveState(); // Resets WASD/Shift state
            // Ensure jump/interact flags are false on unlock
            this.moveState.jump = false;
            this.moveState.interact = false;
             // Update player moveState immediately if needed
             if (this.player) this.player.moveState = this.moveState;
        }
    }

    private onPointerLockError(): void {
        console.error('Pointer Lock Error.'); this.isPointerLocked = false;
    }

    // Updates the continuous movement state (WASD, sprint) based on current keys
    private updateContinuousMoveState(): void {
        this.moveState.forward = (this.keys['KeyW'] || this.keys['ArrowUp'] ? 1 : 0) - (this.keys['KeyS'] || this.keys['ArrowDown'] ? 1 : 0);
        this.moveState.right = (this.keys['KeyD'] || this.keys['ArrowRight'] ? 1 : 0) - (this.keys['KeyA'] || this.keys['ArrowLeft'] ? 1 : 0);
        this.moveState.sprint = !!(this.keys['ShiftLeft'] || this.keys['ShiftRight']); // Ensure boolean
        // Jump and Interact are handled in onKeyDown/onKeyUp or consumed elsewhere
    }

    // FIX: Removed unused deltaTime parameter
    public update(/*deltaTime: number*/): void {
        if (!this.isPointerLocked) {
            this.mouse.dx = 0; this.mouse.dy = 0; return;
        }
        // Player Yaw Rotation
        if (this.player?.mesh && Math.abs(this.mouse.dx) > 0) { // FIX: Check player and mesh
            this.player.mesh.rotateY(-this.mouse.dx * this.playerRotationSensitivity);
        }
        // Camera Pitch
        if (this.cameraController && Math.abs(this.mouse.dy) > 0) {
            this.cameraController.handleMouseInput(/*this.mouse.dx,*/ this.mouse.dy); // FIX: Pass only dy
        }
        this.mouse.dx = 0; this.mouse.dy = 0; // Reset deltas AFTER applying them
    }

    public dispose(): void {
        // FIX: Use correct target element for removeEventListener
         const targetElement = this.domElement ?? document;
        document.removeEventListener('keydown', this.boundOnKeyDown); document.removeEventListener('keyup', this.boundOnKeyUp);
        document.removeEventListener('mousedown', this.boundOnMouseDown); document.removeEventListener('mouseup', this.boundOnMouseUp);
        document.removeEventListener('mousemove', this.boundOnMouseMove);
        targetElement.removeEventListener('click', this.boundOnClick);
        document.removeEventListener('pointerlockchange', this.boundOnPointerLockChange);
        document.removeEventListener('pointerlockerror', this.boundOnPointerLockError);
        this.unlockPointer();
        console.log("Controls disposed.");
    }
}