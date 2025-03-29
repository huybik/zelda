import * as THREE from 'three';
import { Player } from '../entities/player';
import { Controls } from './controls';
import { Inventory } from './inventory';
import { EventLog } from './quest';
import { Entity } from '../entities/entity';
import { InteractionResult, EntityUserData, TargetInfo, ActiveGather } from '../types/common';

// --- Reusable vectors ---
const _camDir = new THREE.Vector3();
const _objDir = new THREE.Vector3();
const _playerPos = new THREE.Vector3();
const _playerDir = new THREE.Vector3();
const _objPos = new THREE.Vector3();
const _center = new THREE.Vector3();
const _size = new THREE.Vector3();
const _tempBox = new THREE.Box3();


// --- Interactable World Object (Simplified Entity) ---
export class InteractableObject {
    public id: string;
    public position: THREE.Vector3;
    public interactionType: string; // 'retrieve', 'read_sign', etc.
    public data: any; // Item name, sign text, etc.
    public prompt: string;
    public mesh: THREE.Mesh | THREE.Group | null; // Optional visual mesh
    public isActive: boolean;
    public userData: EntityUserData; // Use shared type for compatibility

    constructor(
        id: string,
        position: THREE.Vector3,
        interactionType: string,
        data: any,
        prompt: string,
        scene: THREE.Scene | null = null
    ) {
        this.id = id;
        this.position = position.clone();
        this.interactionType = interactionType;
        this.data = data;
        this.prompt = prompt;
        this.mesh = null; // Set later or create default
        this.isActive = true;

        this.userData = {
            id: this.id,
            entityReference: this,
            isInteractable: true,
            interactionType: this.interactionType,
            prompt: this.prompt,
            data: this.data,
            isSimpleObject: true, // Mark as simple object
            isEntity: false, isPlayer: false, isNPC: false, isAnimal: false,
            isCollidable: false, // Default simple objects non-collidable unless mesh is added
        };

        // Example: Create a default small sphere marker if no mesh provided and scene exists
        // if (scene && !this.mesh) {
        //     const markerGeo = new THREE.SphereGeometry(0.2);
        //     const markerMat = new THREE.MeshBasicMaterial({ color: 0xffff00, transparent: true, opacity: 0.5 });
        //     this.mesh = new THREE.Mesh(markerGeo, markerMat);
        //     this.mesh.position.copy(this.position);
        //     scene.add(this.mesh);
        //     this.userData.isCollidable = true; // Marker can be collidable if needed
        // }

        // If a mesh is assigned later, link userData
        // if (this.mesh) {
        //     this.mesh.userData = this.userData;
        //     this.updateBoundingBox();
        // }
    }

    // Called when player interacts
    interact(player: Player, inventory: Inventory, eventLog: EventLog): InteractionResult | null {
        if (!this.isActive) return { type: 'error', message: 'Already used.' };

        console.log(`Interacting with simple object: ${this.id} (${this.interactionType})`);
        switch (this.interactionType) {
            case 'retrieve':
                const itemName = this.data as string;
                if (inventory.addItem(itemName, 1)) {
                    eventLog?.addEntry(`You picked up: ${itemName}`);
                    this.removeFromWorld();
                    return { type: 'item_retrieved', item: { name: itemName, amount: 1 } };
                } else {
                    eventLog?.addEntry(`Your inventory is full.`);
                    return { type: 'error', message: 'Inventory full' };
                }

            case 'read_sign':
                const signText = this.data as string || "The sign is worn and illegible.";
                eventLog?.addEntry(`Sign: "${signText}"`);
                return { type: 'message', message: signText };

            default:
                console.warn(`Unhandled simple interaction type: ${this.interactionType}`);
                return { type: 'message', message: 'You look at the object.' };
        }
    }

    removeFromWorld(): void {
        this.isActive = false;
        this.userData.isInteractable = false;
        if (this.mesh) {
            this.mesh.visible = false; // Hide mesh
             this.userData.isCollidable = false; // Make non-collidable if mesh existed
            // TODO: Request proper removal from scene/arrays in Game class
            // Example: this.mesh.parent?.remove(this.mesh);
        }
    }

    // Required methods for compatibility if added to entity lists
    update(deltaTime: number): void { /* Static objects don't update */ }

    updateBoundingBox(): void {
        if (!this.userData.boundingBox) this.userData.boundingBox = new THREE.Box3();
        if (this.mesh) {
            this.userData.boundingBox.setFromObject(this.mesh);
        } else {
            // Fallback for meshless objects: small box at position
            this.userData.boundingBox.setFromCenterAndSize(this.position, _size.set(0.5, 0.5, 0.5));
        }
    }
}


// --- Interaction System ---
export class InteractionSystem {
    private player: Player;
    private camera: THREE.PerspectiveCamera;
    private interactableEntities: Array<Entity | InteractableObject | THREE.Object3D>; // Master list
    private controls: Controls;
    private inventory: Inventory;
    private eventLog: EventLog;

    private raycaster: THREE.Raycaster;
    private interactionDistance: number;
    private aimTolerance: number; // Angle tolerance (radians)

    private currentTarget: Entity | InteractableObject | THREE.Object3D | null = null;
    private currentTargetMesh: THREE.Object3D | null = null;
    private interactionPromptElement: HTMLElement | null;

    private activeGather: ActiveGather | null = null;
    private promptTimeout: ReturnType<typeof setTimeout> | null = null;

    constructor(
        player: Player,
        camera: THREE.PerspectiveCamera,
        interactableEntities: Array<Entity | InteractableObject | THREE.Object3D>,
        controls: Controls,
        inventory: Inventory,
        eventLog: EventLog
    ) {
        this.player = player;
        this.camera = camera;
        this.interactableEntities = interactableEntities; // Reference to Game's list
        this.controls = controls;
        this.inventory = inventory;
        this.eventLog = eventLog;

        this.raycaster = new THREE.Raycaster();
        this.interactionDistance = 3.0;
        this.aimTolerance = Math.PI / 6; // ~30 degrees tolerance

        this.interactionPromptElement = document.getElementById('interaction-prompt');
        if (!this.interactionPromptElement) {
            console.warn("Interaction prompt element (#interaction-prompt) not found.");
        }
    }

    update(deltaTime: number): void {
        // Handle ongoing gather action
        if (this.activeGather) {
            // Check for movement or cancel key press
            const moved = this.player.velocity.lengthSq() * deltaTime > 0.001;
            if (moved || this.controls.consumeInteraction()) {
                this.cancelGatherAction();
                return; // Skip finding new target this frame
            }
            this.updateGatherAction(deltaTime);
            return; // Don't look for new targets while gathering
        }

        // Find potential target
        const targetInfo = this.findInteractableTarget();

        // Update UI Prompt and handle interaction press
        if (targetInfo?.instance?.userData?.isInteractable) {
            if (this.currentTarget !== targetInfo.instance) {
                this.currentTarget = targetInfo.instance;
                this.currentTargetMesh = targetInfo.mesh;
                const promptText = targetInfo.instance.userData.prompt || "Press E to interact";
                this.showPrompt(promptText);
            }

            if (this.controls.consumeInteraction()) {
                this.tryInteract(this.currentTarget, this.currentTargetMesh);
            }
        } else {
            // No target or target not interactable
            if (this.currentTarget) {
                this.currentTarget = null;
                this.currentTargetMesh = null;
                this.hidePrompt();
            }
        }
    }

    private findInteractableTarget(): TargetInfo | null {
        // 1. Raycast from camera center
        this.raycaster.setFromCamera(new THREE.Vector2(0, 0), this.camera);
        this.raycaster.far = this.interactionDistance;

        // Collect mesh references from the interactable list
        const meshesToCheck = this.interactableEntities
            .map(item => (item as any).mesh ?? (item instanceof THREE.Object3D ? item : null))
            .filter((mesh): mesh is THREE.Object3D =>
                mesh instanceof THREE.Object3D &&
                mesh.userData?.isInteractable === true &&
                mesh.visible !== false
            );

        let closestHit: TargetInfo | null = null;
        const intersects = this.raycaster.intersectObjects(meshesToCheck, true);

        if (intersects.length > 0) {
             // Find the root interactable instance for the closest valid hit
             for (const intersect of intersects) {
                let hitObject: THREE.Object3D | null = intersect.object;
                let rootInstance: any = null;
                let rootMesh: THREE.Object3D | null = null;

                // Traverse up to find the object with entityReference/userData.isInteractable
                while (hitObject) {
                    if (hitObject.userData?.isInteractable && hitObject.userData?.entityReference) {
                        rootInstance = hitObject.userData.entityReference;
                        rootMesh = hitObject;
                        break;
                    }
                    // Handle cases where the interactable object *is* the mesh (e.g., simple objects)
                    if (hitObject.userData?.isInteractable && hitObject.userData?.isSimpleObject) {
                        // Find the InteractableObject instance in the main list
                        rootInstance = this.interactableEntities.find(e => (e as any).mesh === hitObject);
                        if (!rootInstance) rootInstance = hitObject.userData?.entityReference; // Fallback
                        rootMesh = hitObject;
                        break;
                    }
                     // Handle cases where the interactable is the mesh itself (e.g. Tree, Rock groups)
                     if (hitObject.userData?.isInteractable && hitObject === intersect.object) {
                         // Check if this hitObject is directly in our interactables list
                         rootInstance = this.interactableEntities.find(e => e === hitObject);
                         if (!rootInstance) rootInstance = hitObject.userData?.entityReference; // Fallback
                         rootMesh = hitObject;
                         break;
                     }

                    hitObject = hitObject.parent;
                }

                // If a valid root was found, check distance and angle
                if (rootInstance && rootMesh && rootInstance.userData?.isInteractable) {
                    // Use precise hit point for angle check
                    _objDir.copy(intersect.point).sub(this.camera.position).normalize();
                    this.camera.getWorldDirection(_camDir);
                    const angle = _camDir.angleTo(_objDir);

                    if (angle < this.aimTolerance) {
                        closestHit = {
                            mesh: rootMesh,
                            instance: rootInstance,
                            point: intersect.point,
                            distance: intersect.distance
                        };
                        break; // Use the first valid hit
                    }
                }
             }
        }

        // Return if raycast found target
        if (closestHit) return closestHit;

        // 2. Fallback: Proximity Check (if raycast missed or hit nothing)
        const nearby = this.findNearbyInteractable();
        if (nearby) {
             const mesh = (nearby as any).mesh ?? (nearby instanceof THREE.Object3D ? nearby : null);
             if (mesh) {
                 mesh.getWorldPosition(_objPos);
                 return {
                     mesh: mesh,
                     instance: nearby,
                     point: _objPos.clone(), // Approximate point
                     distance: this.player.mesh.position.distanceTo(_objPos)
                 };
             }
        }

        return null; // No target found
    }

    private findNearbyInteractable(): Entity | InteractableObject | THREE.Object3D | null {
        this.player.mesh.getWorldPosition(_playerPos);
        let closestDistSq = this.interactionDistance * this.interactionDistance;
        let closestInstance: Entity | InteractableObject | THREE.Object3D | null = null;

        this.interactableEntities.forEach(item => {
            if (!item?.userData?.isInteractable || item === this.player.mesh) return;
             // Skip simple objects marked inactive
             if (item.userData?.isSimpleObject && !(item as InteractableObject).isActive) return;

             const objMesh = (item as any).mesh ?? (item instanceof THREE.Object3D ? item : null);
             if (!objMesh || objMesh.visible === false) return;

             objMesh.getWorldPosition(_objPos);
             const distSq = _playerPos.distanceToSquared(_objPos);

             if (distSq < closestDistSq) {
                 // Check if roughly in front of player
                 this.player.mesh.getWorldDirection(_playerDir);
                 _objDir.copy(_objPos).sub(_playerPos).normalize();
                 const angle = _playerDir.angleTo(_objDir);

                 if (angle < Math.PI / 2.5) { // ~72 degrees forward arc
                     closestDistSq = distSq;
                     closestInstance = item;
                 }
             }
        });
        return closestInstance;
    }

    private tryInteract(targetInstance: any, targetMesh: THREE.Object3D | null): void {
        if (!targetInstance || !targetMesh || !targetInstance.userData?.isInteractable) {
            console.warn("Attempted interaction with invalid target:", targetInstance);
            return;
        }

        // Re-check distance
        const distance = this.player.mesh.position.distanceTo(targetMesh.position);
        if (distance > this.interactionDistance * 1.1) { // Allow tolerance
            console.log("Target too far away.");
            this.currentTarget = null; this.currentTargetMesh = null;
            this.hidePrompt();
            return;
        }

        const interactionType = targetInstance.userData.interactionType as string;
        const targetName = targetInstance.name ?? targetInstance.id ?? 'object';
        console.log(`Attempting interaction: ${interactionType} with ${targetName}`);

        let result: InteractionResult | null = null;

        // Use the instance's interact method if available
        if (typeof targetInstance.interact === 'function') {
            result = targetInstance.interact(this.player, this.inventory, this.eventLog);
        }
        // Handle specific types known directly by the InteractionSystem
        else if (interactionType === 'gather' && targetInstance.userData.resource) {
            this.startGatherAction(targetInstance);
            result = { type: 'gather_start' }; // Indicate gather started
        } else if (interactionType === 'open' && targetInstance.userData.loot) {
             result = this.handleOpenAction(targetInstance);
        } else {
            console.warn(`Unknown interaction type or missing interact method for ${targetName}:`, interactionType);
            result = { type: 'message', message: "You look at the object." };
        }

        // Process the result (show messages, handle state changes)
        if (result) {
            this.handleInteractionResult(result, targetInstance);
        }

        // Deselect target if interaction made it non-interactable or was not 'gather_start'
        if (result?.type !== 'gather_start' && !targetInstance.userData?.isInteractable) {
            this.currentTarget = null;
            this.currentTargetMesh = null;
            // Prompt will hide naturally or via timer
        }
    }

    private handleInteractionResult(result: InteractionResult, targetInstance: any): void {
        let promptDuration: number | null = 2000; // Default duration for messages
        let promptText: string | null = null;

        switch (result.type) {
            case 'reward':
                if (result.item) {
                    if (this.inventory.addItem(result.item.name, result.item.amount)) {
                        const msg = result.message || `Received ${result.item.amount} ${result.item.name}.`;
                        this.eventLog?.addEntry(msg);
                        promptText = msg;
                        promptDuration = 3000;
                    } else {
                        const failMsg = `Found ${result.item.name}, but inventory is full!`;
                        this.eventLog?.addEntry(failMsg);
                        promptText = failMsg;
                        promptDuration = 3000;
                    }
                } else if (result.message) {
                     this.eventLog?.addEntry(result.message);
                     promptText = result.message;
                     promptDuration = 3000;
                }
                break;
            case 'message':
                if (result.message) {
                    this.eventLog?.addEntry(result.message);
                    promptText = result.message;
                }
                break;
            case 'dialogue': // From NPC
                if (result.text) {
                    // Event log entry handled by NPC.interact
                    const npcName = targetInstance?.name ?? 'NPC';
                    promptText = `${npcName}: ${result.text}`;
                    promptDuration = 4000; // Show dialogue longer
                }
                break;
            case 'item_retrieved':
                 // Event log handled by InteractableObject.interact
                 // Prompt hides automatically as target becomes inactive
                 promptDuration = null;
                break;
            case 'open_result':
                 // Event log handled by handleOpenAction
                 if (result.message) promptText = result.message;
                 promptDuration = 3000;
                 break;
            case 'error':
                if (result.message) {
                    this.eventLog?.addEntry(`Error: ${result.message}`);
                    promptText = result.message;
                }
                break;
            case 'gather_start':
                 // Prompt handled by startGatherAction
                 promptDuration = null;
                 break;
            default:
                console.log("Unhandled interaction result type:", result.type);
                break;
        }

        if (promptText) {
            this.showPrompt(promptText, promptDuration);
        }
    }

    private startGatherAction(targetInstance: any): void {
        if (this.activeGather) return;

        const resource = targetInstance.userData.resource as string;
        const gatherTime = (targetInstance.userData.gatherTime as number) || 2000; // ms

        this.activeGather = {
            targetInstance: targetInstance,
            startTime: performance.now(),
            duration: gatherTime,
            resource: resource
        };

        this.showPrompt(`Gathering ${resource}... (0%)`); // Show persistent prompt
        console.log(`Started gathering ${resource}`);
        this.eventLog?.addEntry(`Started gathering ${resource}...`);

        // Stop player movement during gather
        this.player.velocity.x = 0;
        this.player.velocity.z = 0;
        // TODO: Player should play an interacting animation
    }

    private updateGatherAction(deltaTime: number): void {
        if (!this.activeGather) return;

        const elapsedTime = performance.now() - this.activeGather.startTime;
        const progress = Math.min(1, elapsedTime / this.activeGather.duration);

        // Update persistent prompt with progress
        this.showPrompt(`Gathering ${this.activeGather.resource}... (${Math.round(progress * 100)}%)`);

        if (progress >= 1) {
            this.completeGatherAction();
        }
    }

    private completeGatherAction(): void {
        if (!this.activeGather) return;
        const { resource, targetInstance } = this.activeGather;
        console.log(`Finished gathering ${resource}`);

        if (this.inventory.addItem(resource, 1)) {
            this.eventLog?.addEntry(`Gathered 1 ${resource}.`);

            // Handle depletion/removal
            if (targetInstance.userData.isDepletable) {
                targetInstance.userData.isInteractable = false;
                if (targetInstance.mesh) targetInstance.mesh.visible = false;
                const respawnTime = targetInstance.userData.respawnTime || 15000;
                setTimeout(() => {
                    if (targetInstance?.userData && targetInstance.mesh) {
                        targetInstance.userData.isInteractable = true;
                        targetInstance.mesh.visible = true;
                        console.log(`${resource} node respawned.`);
                    }
                }, respawnTime);
            } else if (targetInstance.userData.isSimpleObject && typeof targetInstance.removeFromWorld === 'function') {
                targetInstance.removeFromWorld();
            }

        } else {
            this.eventLog?.addEntry(`Inventory full, could not gather ${resource}.`);
        }

        this.activeGather = null;
        this.hidePrompt(); // Hide gather prompt
        this.currentTarget = null; // Clear target after gathering
        this.currentTargetMesh = null;
    }

    private cancelGatherAction(): void {
        if (!this.activeGather) return;
        const resource = this.activeGather.resource;
        console.log(`Gathering ${resource} cancelled.`);
        this.eventLog?.addEntry(`Gathering ${resource} cancelled.`);
        this.activeGather = null;
        this.hidePrompt();
        // Target remains selected, prompt will reappear if still looking
    }

     private handleOpenAction(targetInstance: any): InteractionResult | null {
         // Chest logic (opening animation trigger, loot distribution)
         if (!targetInstance || !targetInstance.userData || typeof targetInstance.open !== 'function') {
             console.warn("Invalid target for open action.");
             return { type: 'error', message: "Cannot open this." };
         }

         if (targetInstance.userData.isOpen) {
              console.log("Chest is already open.");
              this.eventLog?.addEntry("The chest is empty.");
              // No need to show prompt again if already open
              return { type: 'message', message: "The chest is empty." };
         }

         console.log("Opening chest...");
         this.eventLog?.addEntry("You open the chest...");

         // Trigger the chest's own open method (handles animation, state)
         if (!targetInstance.open()) {
            // Opening failed for some reason (e.g., already animating)
            return { type: 'error', message: "Cannot open chest right now." };
         }

         // Distribute Loot
         const loot = targetInstance.userData.loot as Record<string, number> | undefined;
         let lootMessages: string[] = [];
         let itemsFound = false;

         if (loot) {
             Object.entries(loot).forEach(([itemName, amount]) => {
                 if (amount > 0 && this.inventory.addItem(itemName, amount)) {
                     lootMessages.push(`Found ${amount} ${itemName}`);
                     itemsFound = true;
                 } else if (amount > 0) {
                     lootMessages.push(`Found ${amount} ${itemName}, but inventory is full!`);
                     itemsFound = true;
                     // TODO: Drop item on ground? Needs item drop system.
                 }
             });
             // Clear loot after distribution
             targetInstance.userData.loot = {};
         }

         const finalMessage = itemsFound ? lootMessages.join('. ') : "The chest is empty.";
         this.eventLog?.addEntry(finalMessage + ".");

         // Chest is now open and non-interactable (handled by chest.open())
         // The result message will be shown by handleInteractionResult
         return { type: 'open_result', message: finalMessage };
     }


    private showPrompt(text: string, duration: number | null = null): void {
        if (!this.interactionPromptElement) return;
        // Don't overwrite persistent gather prompt unless forcing a timed message
        if (this.activeGather && duration === null) return;

        this.interactionPromptElement.textContent = text;
        this.interactionPromptElement.style.display = 'block';

        // Clear previous timeout if setting a new one or showing persistent prompt
        clearTimeout(this.promptTimeout ?? undefined);
        this.promptTimeout = null;

        if (duration && duration > 0) {
            this.promptTimeout = setTimeout(() => {
                // Only hide if the prompt text hasn't changed and it's still the current target
                // Or if target is lost while timed prompt is up
                if (this.interactionPromptElement?.textContent === text) {
                    this.hidePrompt();
                }
            }, duration);
        }
    }

    private hidePrompt(): void {
        if (!this.interactionPromptElement) return;
        // Only hide if not actively gathering AND no timed prompt is active
        if (!this.activeGather && !this.promptTimeout) {
            this.interactionPromptElement.style.display = 'none';
            this.interactionPromptElement.textContent = '';
        }
        // // Also hide if timed prompt finishes or target is lost
        // else if (this.promptTimeout && !this.currentTarget) {
        //      clearTimeout(this.promptTimeout);
        //      this.promptTimeout = null;
        //      this.interactionPromptElement.style.display = 'none';
        //      this.interactionPromptElement.textContent = '';
        // }
    }
}