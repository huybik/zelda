import * as THREE from 'three';

export class Controls {
    constructor(player, cameraController, domElement) {
        this.player = player;
        this.cameraController = cameraController;
        this.domElement = domElement || document.body;

        this.keys = {}; // Track pressed keys
        this.mouse = { x: 0, y: 0, dx: 0, dy: 0, buttons: {} }; // Track mouse state
        this.isPointerLocked = false;

        // Movement state passed to player
        this.moveState = {
            forward: 0,
            right: 0,
            jump: false,
            sprint: false,
            interact: false, // Track interaction key press
        };

         // Listeners for specific key presses (e.g., UI toggles)
        this.keyListeners = {};
        this.mouseListeners = {}; // For clicks { buttonIndex: callback }

        this.initListeners();
    }

    initListeners() {
        document.addEventListener('keydown', (e) => this.onKeyDown(e), false);
        document.addEventListener('keyup', (e) => this.onKeyUp(e), false);
        this.domElement.addEventListener('mousedown', (e) => this.onMouseDown(e), false);
         document.addEventListener('mouseup', (e) => this.onMouseUp(e), false); // Listen on document for mouse up
        document.addEventListener('mousemove', (e) => this.onMouseMove(e), false);

        // Pointer Lock API for mouse look
        this.domElement.addEventListener('click', () => {
            if (!this.isPointerLocked) {
                this.domElement.requestPointerLock();
            }
        });

        document.addEventListener('pointerlockchange', () => this.onPointerLockChange(), false);
        document.addEventListener('pointerlockerror', () => this.onPointerLockError(), false);
    }

     addKeyListener(key, callback) {
         if (!this.keyListeners[key]) {
             this.keyListeners[key] = [];
         }
         this.keyListeners[key].push(callback);
     }
      addMouseListener(buttonIndex, callback) {
         if (!this.mouseListeners[buttonIndex]) {
             this.mouseListeners[buttonIndex] = [];
         }
         this.mouseListeners[buttonIndex].push(callback);
     }

    onKeyDown(event) {
        this.keys[event.code] = true;
         // Trigger specific key listeners if registered
         if (this.keyListeners[event.code]) {
             this.keyListeners[event.code].forEach(cb => cb());
             // Optionally prevent default browser behavior for registered keys
             // event.preventDefault();
         }

        // Update move state based on WASD, Shift, Space, E
        this.updateMoveState();
    }

    onKeyUp(event) {
        this.keys[event.code] = false;
        if (event.code === 'KeyE') {
            this.moveState.interact = false; // Reset interact on key up
        }
        this.updateMoveState();
    }

    onMouseDown(event) {
         this.mouse.buttons[event.button] = true;
         // Trigger mouse listeners
         if (this.mouseListeners[event.button]) {
             this.mouseListeners[event.button].forEach(cb => cb(event));
         }
        // Prevent default text selection, etc.
        // event.preventDefault();
    }
     onMouseUp(event) {
         this.mouse.buttons[event.button] = false;
     }


    onMouseMove(event) {
        if (this.isPointerLocked) {
            this.mouse.dx = event.movementX || 0;
            this.mouse.dy = event.movementY || 0;
        } else {
            // Store regular mouse position if needed, but reset deltas
            this.mouse.x = event.clientX;
            this.mouse.y = event.clientY;
            this.mouse.dx = 0;
            this.mouse.dy = 0;
        }
    }

    onPointerLockChange() {
        if (document.pointerLockElement === this.domElement) {
            console.log('Pointer Locked');
            this.isPointerLocked = true;
        } else {
            console.log('Pointer Unlocked');
            this.isPointerLocked = false;
            // Reset keys/mouse state if needed when unlocking?
            // this.keys = {};
             this.mouse.dx = 0;
             this.mouse.dy = 0;
            // this.updateMoveState();
        }
    }

    onPointerLockError() {
        console.error('Pointer Lock Error');
        this.isPointerLocked = false;
    }

    updateMoveState() {
        this.moveState.forward = (this.keys['KeyW'] || this.keys['ArrowUp'] ? 1 : 0) - (this.keys['KeyS'] || this.keys['ArrowDown'] ? 1 : 0);
        this.moveState.right = (this.keys['KeyD'] || this.keys['ArrowRight'] ? 1 : 0) - (this.keys['KeyA'] || this.keys['ArrowLeft'] ? 1 : 0);
        this.moveState.jump = this.keys['Space'] || false;
        this.moveState.sprint = this.keys['ShiftLeft'] || this.keys['ShiftRight'] || false;
        // Interaction key is tracked as a single press event in the interaction system
        if (this.keys['KeyE'] && !this.moveState.interact) { // Check if E is pressed *now* but wasn't pressed last frame
             this.moveState.interact = true; // Set flag for interaction system to consume
        }
        // Note: Jump might also need to be a single press event depending on player implementation
    }

    // Called once per frame in the game loop
    update(deltaTime) {
        // Rotate player based on mouse delta X
        if (this.isPointerLocked && this.player) {
            const yawDelta = -this.mouse.dx * 0.002; // Sensitivity factor
            this.player.mesh.rotateY(yawDelta);
        }

        // Update camera pitch based on mouse delta Y (handled by ThirdPersonCamera)
        if (this.isPointerLocked && this.cameraController) {
            this.cameraController.handleMouseInput(this.mouse.dx, this.mouse.dy);
        }


        // Reset mouse deltas after processing
        this.mouse.dx = 0;
        this.mouse.dy = 0;

        // Pass the updated moveState to the player object (usually done in Player.update)
        // this.player.update(deltaTime, this.moveState); // Or Game loop calls player.update

        // Reset single-press interaction flag after systems have had a chance to check it
        // This is better handled by the system consuming the event (InteractionSystem)
        // if (this.moveState.interact) {
        //     this.moveState.interact = false;
        // }
    }

     // Method for InteractionSystem to check and consume the interact press
     consumeInteraction() {
         if (this.moveState.interact) {
             this.moveState.interact = false; // Reset after consumption
             return true;
         }
         return false;
     }

    dispose() {
        document.removeEventListener('keydown', this.onKeyDown);
        document.removeEventListener('keyup', this.onKeyUp);
        this.domElement.removeEventListener('mousedown', this.onMouseDown);
         document.removeEventListener('mouseup', this.onMouseUp);
        document.removeEventListener('mousemove', this.onMouseMove);
        this.domElement.removeEventListener('click', this.domElement.requestPointerLock);
        document.removeEventListener('pointerlockchange', this.onPointerLockChange);
        document.removeEventListener('pointerlockerror', this.onPointerLockError);
        if (document.pointerLockElement === this.domElement) {
            document.exitPointerLock();
        }
    }
}