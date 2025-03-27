import * as THREE from 'three';

export class Controls {
    constructor(player, cameraController, domElement) {
        this.player = player;
        this.cameraController = cameraController;
        this.domElement = domElement || document.body;

        this.keys = {}; // Track currently pressed keys (using event.code)
        this.mouse = { x: 0, y: 0, dx: 0, dy: 0, buttons: {} }; // Track mouse state
        this.isPointerLocked = false;
        this.playerRotationSensitivity = 0.0025; // Sensitivity factor for player yaw

        // Movement state passed to player
        this.moveState = {
            forward: 0, // -1, 0, 1
            right: 0,   // -1, 0, 1
            jump: false, // Set true only on keydown for one frame
            sprint: false,
            interact: false, // Set true only on keydown for one frame
        };

         // Listeners for specific key presses (e.g., UI toggles) - Use event.code for keys
        this.keyDownListeners = {}; // Callbacks triggered once on keydown
        this.mouseClickListeners = {}; // For clicks { buttonIndex: callback }

        // Bind methods to ensure 'this' context
        this.onKeyDown = this.onKeyDown.bind(this);
        this.onKeyUp = this.onKeyUp.bind(this);
        this.onMouseDown = this.onMouseDown.bind(this);
        this.onMouseUp = this.onMouseUp.bind(this);
        this.onMouseMove = this.onMouseMove.bind(this);
        this.onClick = this.onClick.bind(this);
        this.onPointerLockChange = this.onPointerLockChange.bind(this);
        this.onPointerLockError = this.onPointerLockError.bind(this);

        this.initListeners();
    }

    initListeners() {
        document.addEventListener('keydown', this.onKeyDown, false);
        document.addEventListener('keyup', this.onKeyUp, false);
        // Mouse down/up on document to catch release outside canvas
        document.addEventListener('mousedown', this.onMouseDown, false);
        document.addEventListener('mouseup', this.onMouseUp, false);
        document.addEventListener('mousemove', this.onMouseMove, false);

        // Request Pointer Lock on click
        this.domElement.addEventListener('click', this.onClick, false);

        document.addEventListener('pointerlockchange', this.onPointerLockChange, false);
        document.addEventListener('pointerlockerror', this.onPointerLockError, false);
    }

     // Register a callback for a specific keydown event (triggered once)
     addKeyDownListener(keyCode, callback) {
         if (!this.keyDownListeners[keyCode]) {
             this.keyDownListeners[keyCode] = [];
         }
         this.keyDownListeners[keyCode].push(callback);
     }

     // Register a callback for a specific mouse button click (triggered on mousedown)
      addMouseClickListener(buttonIndex, callback) {
         if (!this.mouseClickListeners[buttonIndex]) {
             this.mouseClickListeners[buttonIndex] = [];
         }
         this.mouseClickListeners[buttonIndex].push(callback);
     }

     // Requests pointer lock if not already locked
     lockPointer() {
         if (!this.isPointerLocked) {
            this.domElement.requestPointerLock();
         }
     }

    onKeyDown(event) {
        const keyCode = event.code;
        if (this.keys[keyCode]) return; // Prevent firing multiple times if key is held

        this.keys[keyCode] = true;

         // Trigger specific keydown listeners if registered
         if (this.keyDownListeners[keyCode]) {
             this.keyDownListeners[keyCode].forEach(cb => cb());
             // Optionally prevent default browser behavior for registered keys like 'I', 'J'
             // event.preventDefault();
         }

        // Update move state flags that should only trigger once per press
        if (keyCode === 'Space') {
            this.moveState.jump = true; // Set jump flag for player to consume
        }
        if (keyCode === 'KeyE') {
             this.moveState.interact = true; // Set interact flag for interaction system
        }

        // Update continuous move state (WASD, Shift)
        this.updateContinuousMoveState();
    }

    onKeyUp(event) {
        const keyCode = event.code;
        this.keys[keyCode] = false;

        // Update continuous move state (WASD, Shift)
        this.updateContinuousMoveState();

        // Reset single-frame flags (handled by consumers, but ensure they are false if key is up)
        // if (keyCode === 'Space') this.moveState.jump = false; // Player consumes this
        // if (keyCode === 'KeyE') this.moveState.interact = false; // InteractionSystem consumes this
    }

    onMouseDown(event) {
         this.mouse.buttons[event.button] = true;
         // Trigger mouse click listeners
         if (this.mouseClickListeners[event.button]) {
             this.mouseClickListeners[event.button].forEach(cb => cb(event));
         }
        // Prevent default text selection if interacting with game window
        if (document.pointerLockElement === this.domElement || event.target === this.domElement) {
             // event.preventDefault(); // Can interfere with UI inputs if not careful
        }
    }

     onMouseUp(event) {
         this.mouse.buttons[event.button] = false;
     }


    onMouseMove(event) {
        if (this.isPointerLocked) {
            // Accumulate deltas, will be processed in update()
            this.mouse.dx += event.movementX || 0;
            this.mouse.dy += event.movementY || 0;
        } else {
            // Update regular mouse position if needed for UI outside pointer lock
            this.mouse.x = event.clientX;
            this.mouse.y = event.clientY;
        }
    }

    // Handle click on the game canvas
    onClick(event) {
        // If pointer is not locked, lock it.
        // If pointer IS locked, this click might be for an in-game action (handled by mouse down listeners).
        if (!this.isPointerLocked) {
            this.lockPointer();
        }
    }

    onPointerLockChange() {
        if (document.pointerLockElement === this.domElement) {
            console.log('Pointer Locked');
            this.isPointerLocked = true;
            // Reset accumulated deltas when lock is acquired
            this.mouse.dx = 0;
            this.mouse.dy = 0;
        } else {
            console.log('Pointer Unlocked');
            this.isPointerLocked = false;
            // Reset continuous movement keys when unlocking to prevent unwanted movement
            this.keys = {}; // Clear all keys
            this.mouse.buttons = {}; // Clear mouse buttons
            this.updateContinuousMoveState(); // Reset forward/right/sprint states
             // Reset deltas
             this.mouse.dx = 0;
             this.mouse.dy = 0;
        }
    }

    onPointerLockError() {
        console.error('Pointer Lock Error. Make sure the document has focus.');
        this.isPointerLocked = false;
    }

    // Updates state based on currently held keys (WASD, Shift)
    updateContinuousMoveState() {
        this.moveState.forward = (this.keys['KeyW'] || this.keys['ArrowUp'] ? 1 : 0) - (this.keys['KeyS'] || this.keys['ArrowDown'] ? 1 : 0);
        this.moveState.right = (this.keys['KeyD'] || this.keys['ArrowRight'] ? 1 : 0) - (this.keys['KeyA'] || this.keys['ArrowLeft'] ? 1 : 0);
        this.moveState.sprint = this.keys['ShiftLeft'] || this.keys['ShiftRight'] || false;
    }

    // Called once per frame in the game loop
    update(deltaTime) {
        // Rotate player based on accumulated mouse delta X
        if (this.isPointerLocked && this.player && Math.abs(this.mouse.dx) > 0) {
            const yawDelta = -this.mouse.dx * this.playerRotationSensitivity;
            this.player.mesh.rotateY(yawDelta);
        }

        // Update camera pitch based on accumulated mouse delta Y (handled by ThirdPersonCamera)
        if (this.isPointerLocked && this.cameraController && Math.abs(this.mouse.dy) > 0) {
            this.cameraController.handleMouseInput(this.mouse.dx, this.mouse.dy); // Pass raw delta
        }


        // Reset mouse deltas after processing for this frame
        this.mouse.dx = 0;
        this.mouse.dy = 0;

        // Note: Single-press flags (jump, interact) are reset by their respective consumers (Player, InteractionSystem)
    }

     // Method for InteractionSystem to check and consume the interact press
     consumeInteraction() {
         if (this.moveState.interact) {
             this.moveState.interact = false; // Reset after consumption
             return true;
         }
         return false;
     }
     // Method for Player to check and consume the jump press
     consumeJump() {
         if (this.moveState.jump) {
             this.moveState.jump = false; // Reset after consumption
             return true;
         }
         return false;
     }


    dispose() {
        document.removeEventListener('keydown', this.onKeyDown);
        document.removeEventListener('keyup', this.onKeyUp);
        document.removeEventListener('mousedown', this.onMouseDown);
        document.removeEventListener('mouseup', this.onMouseUp);
        document.removeEventListener('mousemove', this.onMouseMove);
        this.domElement.removeEventListener('click', this.onClick);
        document.removeEventListener('pointerlockchange', this.onPointerLockChange);
        document.removeEventListener('pointerlockerror', this.onPointerLockError);

        // Attempt to exit pointer lock if active
        if (document.pointerLockElement === this.domElement) {
            document.exitPointerLock();
        }
        console.log("Controls disposed.");
    }
}