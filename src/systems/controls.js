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
            forward: 0, // -1 (S), 0, 1 (W)
            right: 0,   // -1 (A), 0, 1 (D)
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
        this.onClick = this.onClick.bind(this); // Click listener to initiate lock
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

        // Request Pointer Lock on click of the DOM element (usually the canvas container)
        this.domElement.addEventListener('click', this.onClick, false);

        // Listen for pointer lock status changes
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
         // Check if pointer lock is supported and not already active
         if ('requestPointerLock' in this.domElement && document.pointerLockElement !== this.domElement) {
            console.log("Requesting pointer lock...");
            this.domElement.requestPointerLock();
         }
     }

     // Releases pointer lock if currently active
     unlockPointer() {
        if (document.pointerLockElement === this.domElement) {
            console.log("Exiting pointer lock...");
            document.exitPointerLock();
        }
     }


    onKeyDown(event) {
        // Allow key presses even if pointer isn't locked (e.g., for UI toggles)
        const keyCode = event.code;
        if (this.keys[keyCode]) return; // Prevent firing multiple times if key is held

        this.keys[keyCode] = true;

         // Trigger specific keydown listeners if registered (e.g., I, J, E)
         if (this.keyDownListeners[keyCode]) {
             // Execute callback, which might open UI and release pointer lock
             this.keyDownListeners[keyCode].forEach(cb => cb());
             // Optionally prevent default browser behavior for registered keys like 'I', 'J'
             // event.preventDefault(); // Use with caution, might block expected browser actions
         }

        // Update move state flags that should only trigger once per press
        if (keyCode === 'Space') {
            this.moveState.jump = true; // Set jump flag for player to consume
        }
        if (keyCode === 'KeyE') {
             this.moveState.interact = true; // Set interact flag for interaction system
        }

        // Update continuous move state (WASD, Shift) - needed for player movement
        this.updateContinuousMoveState();
    }

    onKeyUp(event) {
        const keyCode = event.code;
        this.keys[keyCode] = false;

        // Update continuous move state (WASD, Shift)
        this.updateContinuousMoveState();

        // Note: Single-frame flags (jump, interact) are consumed by their systems
    }

    onMouseDown(event) {
         this.mouse.buttons[event.button] = true;
         // Trigger mouse click listeners (e.g., for UI interactions)
         if (this.mouseClickListeners[event.button]) {
             this.mouseClickListeners[event.button].forEach(cb => cb(event));
         }
         // Prevent default text selection if interacting with game window (maybe redundant with lock)
         if (this.isPointerLocked || event.target === this.domElement) {
             // event.preventDefault(); // Can interfere with UI inputs if not careful
         }
    }

     onMouseUp(event) {
         this.mouse.buttons[event.button] = false;
     }


    onMouseMove(event) {
        // Only process mouse movement for camera/player rotation if pointer is locked
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

    // Handle click on the game canvas (or the specified domElement)
    onClick(event) {
        // If pointer is not locked, lock it.
        // Assumes the game is in a state where pointer lock should be active (e.g., not paused with UI open).
        if (!this.isPointerLocked && !window.game?.isPaused) { // Check game pause state via global ref (or pass game ref)
            this.lockPointer();
        }
        // If pointer IS locked, this click might be for an in-game action (handled by mouse down listeners, e.g., attack).
    }

    onPointerLockChange() {
        if (document.pointerLockElement === this.domElement) {
            console.log('Pointer Locked');
            this.isPointerLocked = true;
            // Reset accumulated deltas when lock is acquired to prevent sudden jump
            this.mouse.dx = 0;
            this.mouse.dy = 0;
            // Hide cursor (browser usually handles this, but can force with CSS if needed)
            // this.domElement.style.cursor = 'none';
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
             // Show cursor
             // this.domElement.style.cursor = 'default';

            // If unlock was unintentional (e.g., Alt+Tab), Game's pause logic might handle it.
            // If unlock was due to UI opening (Escape, I, J), Game.setPauseState already handled it.
        }
    }

    onPointerLockError() {
        console.error('Pointer Lock Error. Make sure the document has focus and is interacted with.');
        this.isPointerLocked = false; // Ensure state is correct on error
    }

    // Updates state based on currently held keys (WASD, Shift)
    updateContinuousMoveState() {
        // W = forward (+1), S = backward (-1)
        this.moveState.forward = (this.keys['KeyW'] || this.keys['ArrowUp'] ? 1 : 0) - (this.keys['KeyS'] || this.keys['ArrowDown'] ? 1 : 0);
        // D = right (+1), A = left (-1)
        this.moveState.right = (this.keys['KeyD'] || this.keys['ArrowRight'] ? 1 : 0) - (this.keys['KeyA'] || this.keys['ArrowLeft'] ? 1 : 0);
        this.moveState.sprint = this.keys['ShiftLeft'] || this.keys['ShiftRight'] || false;
    }

    // Called once per frame in the game loop
    update(deltaTime) {
        // Rotate player mesh around Y-axis based on accumulated mouse delta X
        // This happens ONLY when pointer lock is active.
        if (this.isPointerLocked && this.player && Math.abs(this.mouse.dx) > 0) {
            const yawDelta = -this.mouse.dx * this.playerRotationSensitivity;
            // Applying rotation directly to the player mesh.
            // The camera follows the player mesh's orientation.
            this.player.mesh.rotateY(yawDelta);
        }

        // Update camera pitch based on accumulated mouse delta Y (handled by ThirdPersonCamera)
        // This also happens ONLY when pointer lock is active.
        if (this.isPointerLocked && this.cameraController && Math.abs(this.mouse.dy) > 0) {
            // Pass raw delta Y for camera pitch control
            this.cameraController.handleMouseInput(this.mouse.dx, this.mouse.dy);
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
        this.unlockPointer(); // Use the helper method

        console.log("Controls disposed.");
    }
}