// File: /src/systems/controls.ts
// Optimization: Minor cleanup, consolidated movement state update.

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
        this.domElement = domElement ?? document.body;

        // Bind methods to ensure 'this' context
        this.boundOnKeyDown = this.onKeyDown.bind(this); this.boundOnKeyUp = this.onKeyUp.bind(this);
        this.boundOnMouseDown = this.onMouseDown.bind(this); this.boundOnMouseUp = this.onMouseUp.bind(this);
        this.boundOnMouseMove = this.onMouseMove.bind(this); this.boundOnClick = this.onClick.bind(this);
        this.boundOnPointerLockChange = this.onPointerLockChange.bind(this);
        this.boundOnPointerLockError = this.onPointerLockError.bind(this);

        this.initListeners();
    }

    private initListeners(): void {
        document.addEventListener('keydown', this.boundOnKeyDown); document.addEventListener('keyup', this.boundOnKeyUp);
        document.addEventListener('mousedown', this.boundOnMouseDown); document.addEventListener('mouseup', this.boundOnMouseUp);
        document.addEventListener('mousemove', this.boundOnMouseMove);
        this.domElement.addEventListener('click', this.boundOnClick);
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
        if ('requestPointerLock' in this.domElement && document.pointerLockElement !== this.domElement) {
            this.domElement.requestPointerLock().catch(err => console.error("Pointer lock failed:", err));
        }
    }

    public unlockPointer(): void {
        if (document.pointerLockElement === this.domElement) document.exitPointerLock();
    }

    private onKeyDown(event: KeyboardEvent): void {
        const code = event.code;
        if (this.keys[code] || event.repeat) return; // Prevent repeats
        this.keys[code] = true;
        this.keyDownListeners[code]?.forEach(cb => cb());
        if (code === 'Space') this.moveState.jump = true;
        if (code === 'KeyE') this.moveState.interact = true;
        this.updateContinuousMoveState();
    }

    private onKeyUp(event: KeyboardEvent): void {
        this.keys[event.code] = false;
        this.updateContinuousMoveState();
        // Single-frame flags (jump, interact) are reset by consumers
    }

    private onMouseDown(event: MouseEvent): void {
        this.mouse.buttons[event.button] = true;
        this.mouseClickListeners[event.button]?.forEach(cb => cb(event));
    }

    private onMouseUp(event: MouseEvent): void {
        this.mouse.buttons[event.button] = false;
    }

    private onMouseMove(event: MouseEvent): void {
        if (this.isPointerLocked) {
            this.mouse.dx += event.movementX ?? 0;
            this.mouse.dy += event.movementY ?? 0;
        } else {
            this.mouse.x = event.clientX; this.mouse.y = event.clientY;
        }
    }

    private onClick(event: MouseEvent): void {
        const gameIsPaused = (window as any).game?.isPaused ?? false;
        if (!this.isPointerLocked && !gameIsPaused) this.lockPointer();
    }

    private onPointerLockChange(): void {
        this.isPointerLocked = (document.pointerLockElement === this.domElement);
        console.log(`Pointer ${this.isPointerLocked ? 'Locked' : 'Unlocked'}`);
        this.mouse.dx = 0; this.mouse.dy = 0; // Reset deltas
        if (!this.isPointerLocked) { // Reset state on unlock
            this.keys = {}; this.mouse.buttons = {};
            this.updateContinuousMoveState(); // Resets WASD/Shift state
        }
    }

    private onPointerLockError(): void {
        console.error('Pointer Lock Error.'); this.isPointerLocked = false;
    }

    private updateContinuousMoveState(): void {
        this.moveState.forward = (this.keys['KeyW'] || this.keys['ArrowUp'] ? 1 : 0) - (this.keys['KeyS'] || this.keys['ArrowDown'] ? 1 : 0);
        this.moveState.right = (this.keys['KeyD'] || this.keys['ArrowRight'] ? 1 : 0) - (this.keys['KeyA'] || this.keys['ArrowLeft'] ? 1 : 0);
        this.moveState.sprint = (this.keys['ShiftLeft'] || this.keys['ShiftRight']) ?? false;
    }

    public update(deltaTime: number): void {
        if (!this.isPointerLocked) {
            this.mouse.dx = 0; this.mouse.dy = 0; return;
        }
        // Player Yaw Rotation
        if (this.player && Math.abs(this.mouse.dx) > 0) {
            this.player.mesh.rotateY(-this.mouse.dx * this.playerRotationSensitivity);
        }
        // Camera Pitch
        if (this.cameraController && Math.abs(this.mouse.dy) > 0) {
            this.cameraController.handleMouseInput(this.mouse.dx, this.mouse.dy);
        }
        this.mouse.dx = 0; this.mouse.dy = 0; // Reset deltas
    }

    // Consumers check and reset flags directly (e.g., player uses moveState.jump)
    // public consumeInteraction(): boolean { ... } // Removed if direct access is preferred
    // public consumeJump(): boolean { ... } // Removed if direct access is preferred

    public dispose(): void {
        document.removeEventListener('keydown', this.boundOnKeyDown); document.removeEventListener('keyup', this.boundOnKeyUp);
        document.removeEventListener('mousedown', this.boundOnMouseDown); document.removeEventListener('mouseup', this.boundOnMouseUp);
        document.removeEventListener('mousemove', this.boundOnMouseMove);
        this.domElement.removeEventListener('click', this.boundOnClick);
        document.removeEventListener('pointerlockchange', this.boundOnPointerLockChange);
        document.removeEventListener('pointerlockerror', this.boundOnPointerLockError);
        this.unlockPointer();
        console.log("Controls disposed.");
    }
}