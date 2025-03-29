import * as THREE from 'three';
import { Player } from '../entities/player';
import { Controls } from './controls';
import { Inventory } from './inventory';
import { EventLog } from './quest';
import { Entity } from '../entities/entity';
import { InteractionResult, EntityUserData, TargetInfo, ActiveGather } from '../types/common';

const _camDir = new THREE.Vector3(); const _objDir = new THREE.Vector3();
const _playerPos = new THREE.Vector3(); const _playerDir = new THREE.Vector3();
const _objPos = new THREE.Vector3(); const _size = new THREE.Vector3();
// FIX: Removed unused _tempBox
// const _tempBox = new THREE.Box3();

// --- Interactable World Object ---
export class InteractableObject {
    public id: string; public position: THREE.Vector3;
    public interactionType: string; public data: any;
    public prompt: string; public mesh: THREE.Mesh | THREE.Group | null = null;
    public isActive: boolean = true; public userData: EntityUserData;

    // FIX: Removed unused scene parameter
    constructor(id: string, position: THREE.Vector3, interactionType: string, data: any, prompt: string /*, scene?: THREE.Scene*/) {
        this.id = id; this.position = position.clone(); this.interactionType = interactionType;
        this.data = data; this.prompt = prompt;
        this.userData = {
            id: this.id, entityReference: this, isInteractable: true, interactionType: this.interactionType,
            prompt: this.prompt, data: this.data, isSimpleObject: true, isEntity: false,
            isPlayer: false, isNPC: false, isAnimal: false, isCollidable: false,
        };
        // Optional: Add default visual marker if scene is provided
        // if (scene) this.createDefaultMesh(scene);
    }

    interact(player: Player, inventory: Inventory, eventLog: EventLog): InteractionResult | null {
        if (!this.isActive) return { type: 'error', message: 'Already used.' };
        console.log(`Interacting with simple object: ${this.id} (${this.interactionType})`);

        switch (this.interactionType) {
            case 'retrieve':
                const itemName = this.data as string;
                if (inventory.addItem(itemName, 1)) {
                    eventLog?.addEntry(`You picked up: ${itemName}`); // FIX: Optional chaining
                    this.removeFromWorld();
                    return { type: 'item_retrieved', item: { name: itemName, amount: 1 } };
                }
                eventLog?.addEntry(`Your inventory is full.`); // FIX: Optional chaining
                return { type: 'error', message: 'Inventory full' };
            case 'read_sign':
                const signText = this.data as string || "Illegible sign.";
                eventLog?.addEntry(`Sign: "${signText}"`); // FIX: Optional chaining
                return { type: 'message', message: signText };
            default:
                console.warn(`Unhandled simple interaction: ${this.interactionType}`);
                return { type: 'message', message: 'You look at the object.' };
        }
    }

    removeFromWorld(): void {
        this.isActive = false; this.userData.isInteractable = false;
        // FIX: Check mesh exists
        if (this.mesh) {
             this.mesh.visible = false;
             // Optionally remove from parent scene if managed externally
             // this.mesh.parent?.remove(this.mesh);
        }
        this.userData.isCollidable = false; // Update collision status
        // TODO: Proper scene removal handled by Game class or manager
    }

    // Required for compatibility if treated like an Entity
    // FIX: Removed unused parameters
    update(/*deltaTime: number, player: Player*/): void { /* Static objects don't update */ }

    updateBoundingBox(): void {
        this.userData.boundingBox ??= new THREE.Box3();
        if (this.mesh) { // FIX: Check mesh exists
            this.userData.boundingBox.setFromObject(this.mesh);
        } else {
            this.userData.boundingBox.setFromCenterAndSize(this.position, _size.set(0.5, 0.5, 0.5));
        }
    }

    // Assign mesh AFTER construction if needed
    setMesh(mesh: THREE.Mesh | THREE.Group): void {
        // FIX: Check mesh and parent exist before removing
        if (this.mesh && this.mesh.parent) {
            this.mesh.parent.remove(this.mesh); // Remove old mesh
        }
        this.mesh = mesh;
        this.mesh.position.copy(this.position);
        this.mesh.userData = this.userData; // Link user data
        this.userData.isCollidable = true; // Assume mesh is collidable
        this.updateBoundingBox();
    }
}


// --- Interaction System ---
export class InteractionSystem {
    private player: Player; private camera: THREE.PerspectiveCamera;
    private interactableSource: Array<any>; // Reference Game's list (Entity | InteractableObject | THREE.Object3D)
    private controls: Controls; private inventory: Inventory; private eventLog: EventLog;
    private raycaster: THREE.Raycaster = new THREE.Raycaster();
    private interactionDistance: number = 3.0; private aimTolerance: number = Math.PI / 6; // ~30 deg

    private currentTarget: any | null = null; // Entity | InteractableObject | THREE.Object3D
    private currentTargetMesh: THREE.Object3D | null = null;
    private interactionPromptElement: HTMLElement | null;
    private activeGather: ActiveGather | null = null;
    private promptTimeout: ReturnType<typeof setTimeout> | null = null;

    constructor(
        player: Player, camera: THREE.PerspectiveCamera, interactables: Array<any>,
        controls: Controls, inventory: Inventory, eventLog: EventLog
    ) {
        this.player = player; this.camera = camera; this.interactableSource = interactables;
        this.controls = controls; this.inventory = inventory; this.eventLog = eventLog;
        this.interactionPromptElement = document.getElementById('interaction-prompt');
        if (!this.interactionPromptElement) console.warn("#interaction-prompt not found.");
    }

    // FIX: Use _deltaTime if unused
    update(_deltaTime: number): void {
        // Handle Gather Action
        if (this.activeGather) {
            // Check for movement using velocity magnitude (less sensitive to tiny physics jitter)
            const moved = this.player.velocity.lengthSq() > 0.01; // Adjusted threshold
            // Check if interact key is pressed *during* gather to cancel
            if (moved || this.controls.moveState.interact) {
                 this.cancelGatherAction();
                 if(this.controls.moveState.interact) this.controls.moveState.interact = false; // Consume cancel press
                 return;
            }
            this.updateGatherAction(/*deltaTime*/); // Pass deltaTime if needed by gather logic
            return; // Skip target finding while gathering
        }

        // Check interact flag *before* finding target, consume if set
        let interactPressed = this.controls.moveState.interact;
        if (interactPressed) {
             this.controls.moveState.interact = false; // Consume interact flag early
        }

        // Find Target
        const targetInfo = this.findInteractableTarget();

        // Update UI Prompt & Handle Interaction Press
        if (targetInfo?.instance?.userData?.isInteractable) {
            if (this.currentTarget !== targetInfo.instance) {
                this.currentTarget = targetInfo.instance; this.currentTargetMesh = targetInfo.mesh;
                // FIX: Use optional chaining for prompt
                this.showPrompt(targetInfo.instance.userData?.prompt || "Press E to interact");
            }
            // Use the consumed flag
            if (interactPressed) {
                this.tryInteract(this.currentTarget, this.currentTargetMesh);
                // interactPressed is already false
            }
        } else if (this.currentTarget) { // No valid target found, but had one before
            this.currentTarget = null; this.currentTargetMesh = null; this.hidePrompt();
        }
    }

    private findInteractableTarget(): TargetInfo | null {
        // 1. Raycast from camera
        this.raycaster.setFromCamera(new THREE.Vector2(0, 0), this.camera);
        this.raycaster.far = this.interactionDistance;

        const meshesToCheck = this.interactableSource
            .map(item => (item as any).mesh ?? (item instanceof THREE.Object3D ? item : null))
            // FIX: Filter more robustly, check userData exists before accessing properties
            .filter((mesh): mesh is THREE.Object3D =>
                 mesh instanceof THREE.Object3D && mesh.visible !== false && mesh.userData?.isInteractable === true
             );


        const intersects = this.raycaster.intersectObjects(meshesToCheck, true);

        for (const intersect of intersects) {
            // Ensure we hit something interactive and not part of the player
            // FIX: Pass player to getInteractableFromHit to avoid self-interaction
            const targetInfo = this.getInteractableFromHit(intersect.object, this.player);
            if (targetInfo) {
                // Check angle tolerance
                _objDir.copy(intersect.point).sub(this.camera.position).normalize();
                this.camera.getWorldDirection(_camDir);
                if (_camDir.angleTo(_objDir) < this.aimTolerance) {
                    return { ...targetInfo, point: intersect.point, distance: intersect.distance };
                }
            }
        }

        // 2. Fallback: Proximity Check
        return this.findNearbyInteractable();
    }

    // Helper to find the root interactable instance from a potentially nested hit object
    // FIX: Added player parameter to prevent self-interaction detection
    private getInteractableFromHit(hitObject: THREE.Object3D, playerToExclude: Player): { mesh: THREE.Object3D; instance: any } | null {
        let current: THREE.Object3D | null = hitObject;
        while (current) {
            const userData = current.userData as EntityUserData | undefined; // Type userData

            // Check if it's an entity reference and NOT the player
            if (userData?.isInteractable && userData.entityReference && userData.entityReference !== playerToExclude) {
                return { mesh: current, instance: userData.entityReference };
            }
             // Check for simple interactable objects (like InteractableObject class instance)
             // Ensure it's not the player object itself being checked
             if (userData?.isInteractable && userData.isSimpleObject && userData.entityReference !== playerToExclude) {
                 // The instance *is* the entityReference in this case
                 if (userData.entityReference) return { mesh: current, instance: userData.entityReference };
             }
             // Handle cases where the group itself is the interactable (e.g., Trees from env)
             // Ensure it's not the player's mesh group
             if (userData?.isInteractable && this.interactableSource.includes(current) && current !== playerToExclude.mesh) {
                 return { mesh: current, instance: current };
             }

            current = current.parent;
        }
        return null; // No valid, interactable, non-player target found up the hierarchy
    }


    private findNearbyInteractable(): TargetInfo | null {
        // FIX: Check player mesh exists
        if (!this.player.mesh) return null;

        this.player.mesh.getWorldPosition(_playerPos);
        this.player.mesh.getWorldDirection(_playerDir);
        let closestDistSq = this.interactionDistance * this.interactionDistance;
        let closestTarget: TargetInfo | null = null;

        this.interactableSource.forEach(item => {
            const mesh = (item as any).mesh ?? (item instanceof THREE.Object3D ? item : null);
            // FIX: Check item is not the player instance itself AND mesh is not player's mesh
            if (!mesh || item === this.player || mesh === this.player.mesh || !mesh.visible) return;

            const userData = mesh.userData as EntityUserData | undefined; // Type userData

            // FIX: Check userData exists, isInteractable, and associated entity (if any) is not dead
            if (!userData?.isInteractable || userData.entityReference?.isDead === true || (userData.isSimpleObject && !(item as InteractableObject).isActive)) {
                 return;
            }


            mesh.getWorldPosition(_objPos);
            const distSq = _playerPos.distanceToSquared(_objPos);

            if (distSq < closestDistSq) {
                _objDir.copy(_objPos).sub(_playerPos);
                // Check if object is roughly in front of the player
                if (_objDir.lengthSq() > 1e-6 && _playerDir.dot(_objDir.normalize()) > Math.cos(Math.PI / 2.5)) { // ~72 deg forward arc check using dot product
                    closestDistSq = distSq;
                     // Determine the actual instance (could be Entity, InteractableObject, or the mesh itself)
                    const instance = userData.entityReference ?? item;
                    closestTarget = { mesh: mesh, instance: instance, point: _objPos.clone(), distance: Math.sqrt(distSq) };
                }
            }
        });
        return closestTarget;
    }

     private tryInteract(targetInstance: any, targetMesh: THREE.Object3D | null): void {
         // FIX: Check player mesh exists
         if (!targetInstance || !targetMesh?.userData || !this.player.mesh) return;

         // Ensure target is interactable (check userData again)
         if (!targetMesh.userData.isInteractable) return;

        const distance = this.player.mesh.position.distanceTo(targetMesh.position);
        if (distance > this.interactionDistance * 1.1) {
             this.currentTarget = null; this.currentTargetMesh = null; this.hidePrompt(); return; // Too far
        }

        const interactionType = targetMesh.userData.interactionType as string; // Get type from mesh's userData
        const targetName = targetInstance.name ?? targetInstance.id ?? 'object';
        console.log(`Attempting interaction: ${interactionType} with ${targetName}`);

        let result: InteractionResult | null = null;

        // Check if the instance itself has an interact method (covers Entity, InteractableObject)
        if (typeof targetInstance.interact === 'function') {
            // Pass necessary dependencies
            result = targetInstance.interact(this.player, this.inventory, this.eventLog);
        } else if (interactionType === 'gather' && targetMesh.userData.resource) { // Check mesh userData for gather info
            this.startGatherAction(targetMesh); // Pass the mesh/group that has the data
            result = { type: 'gather_start' };
        } else if (interactionType === 'open' && typeof targetInstance.open === 'function') { // Check for Chest's open method on instance
             result = this.handleOpenAction(targetInstance);
        } else {
            console.warn(`Unknown interaction type/method for ${targetName}: ${interactionType}`);
            result = { type: 'message', message: "You look at the object." };
        }

        if (result) this.handleInteractionResult(result, targetInstance);

        // Deselect if interaction finished and made target non-interactable (check userData again)
        if (result?.type !== 'gather_start' && !targetMesh.userData?.isInteractable) {
            this.currentTarget = null; this.currentTargetMesh = null; this.hidePrompt();
        }
    }

    private handleInteractionResult(result: InteractionResult, targetInstance: any): void {
        let promptDuration: number | null = 2000;
        let promptText: string | null = null;

        switch (result.type) {
            case 'reward':
                if (result.item) {
                    const success = this.inventory.addItem(result.item.name, result.item.amount);
                    const msg = success ? (result.message || `Received ${result.item.amount} ${result.item.name}.`)
                                        : `Found ${result.item.name}, but inventory is full!`;
                    this.eventLog?.addEntry(msg); promptText = msg; promptDuration = 3000;
                } else if (result.message) { this.eventLog?.addEntry(result.message); promptText = result.message; promptDuration = 3000; }
                break;
            case 'message': if (result.message) { this.eventLog?.addEntry(result.message); promptText = result.message; } break;
            case 'dialogue': if (result.text) { promptText = `${targetInstance?.name ?? 'NPC'}: ${result.text}`; promptDuration = 4000; } break;
            case 'item_retrieved': promptDuration = null; break; // Prompt hides as target becomes inactive
            case 'open_result': if (result.message) promptText = result.message; promptDuration = 3000; break;
            case 'error': if (result.message) { this.eventLog?.addEntry(`Error: ${result.message}`); promptText = result.message; } break;
            case 'gather_start': promptDuration = null; break; // Prompt handled by gather logic
            default: console.log("Unhandled interaction result:", result.type); break;
        }
        if (promptText) this.showPrompt(promptText, promptDuration);
        else if (!this.activeGather && promptDuration === null) {
             // If no prompt text and not gathering, ensure prompt is hidden
             this.hidePrompt();
        }
    }

    // FIX: targetInstance is likely the mesh/group with userData here
    private startGatherAction(targetObject: THREE.Object3D): void {
        if (this.activeGather || !targetObject.userData) return; // Check userData

        const userData = targetObject.userData;
        this.activeGather = {
            targetInstance: targetObject, // Store the object being gathered from
            startTime: performance.now(),
            duration: (userData.gatherTime as number) || 2000,
            resource: (userData.resource as string) || 'unknown resource'
        };
        this.showPrompt(`Gathering ${this.activeGather.resource}... (0%)`, null); // Persistent prompt
        this.eventLog?.addEntry(`Started gathering ${this.activeGather.resource}...`);
        this.player.velocity.x = 0; this.player.velocity.z = 0; // Stop player
    }

    // FIX: Removed unused deltaTime
    private updateGatherAction(/*deltaTime: number*/): void {
        if (!this.activeGather) return;
        const progress = Math.min(1, (performance.now() - this.activeGather.startTime) / this.activeGather.duration);
        this.showPrompt(`Gathering ${this.activeGather.resource}... (${Math.round(progress * 100)}%)`, null); // Persistent prompt
        if (progress >= 1) this.completeGatherAction();
    }


    private completeGatherAction(): void {
        if (!this.activeGather) return;
        const { resource, targetInstance } = this.activeGather; // targetInstance is the THREE.Object3D here
        const success = this.inventory.addItem(resource, 1);
        this.eventLog?.addEntry(success ? `Gathered 1 ${resource}.` : `Inventory full, could not gather ${resource}.`);

        // Check userData on the targetInstance (THREE.Object3D)
        const userData = targetInstance?.userData as EntityUserData | undefined;

        if (success && userData) {
             if (userData.isDepletable) {
                 userData.isInteractable = false;
                 if (targetInstance instanceof THREE.Mesh || targetInstance instanceof THREE.Group) {
                      targetInstance.visible = false;
                 }
                 const respawnTime = userData.respawnTime || 15000;
                 setTimeout(() => {
                      // Check instance and userData still exist
                      if (targetInstance?.userData) {
                          targetInstance.userData.isInteractable = true;
                           if (targetInstance instanceof THREE.Mesh || targetInstance instanceof THREE.Group) {
                                targetInstance.visible = true;
                           }
                          console.log(`${resource} node respawned.`);
                      }
                 }, respawnTime);
            } else if (userData.isSimpleObject && typeof (userData.entityReference as InteractableObject)?.removeFromWorld === 'function') {
                 // If it's linked to an InteractableObject instance, call its remove method
                 (userData.entityReference as InteractableObject).removeFromWorld();
            }
         }


        this.activeGather = null; this.hidePrompt();
        // Clear target only if it was the gathered object
        if (this.currentTarget === targetInstance || this.currentTargetMesh === targetInstance) {
             this.currentTarget = null; this.currentTargetMesh = null;
        }
    }

    public cancelGatherAction(): void { // Made public for Game class access on death
        if (!this.activeGather) return;
        this.eventLog?.addEntry(`Gathering ${this.activeGather.resource} cancelled.`);
        this.activeGather = null; this.hidePrompt();
        // Don't necessarily clear currentTarget, player might still be looking at it
    }

    // FIX: targetInstance is likely the Chest instance here
    private handleOpenAction(targetInstance: any): InteractionResult | null {
         // Check instance has necessary methods/properties and userData
        if (!targetInstance?.open || !targetInstance.userData) {
             return { type: 'error', message: "Cannot open this." };
        }
        if (targetInstance.userData.isOpen === true) { // Check the flag correctly
            return { type: 'message', message: "The chest is empty." };
        }

        this.eventLog?.addEntry("You open the chest...");
        // Call the open method on the instance
        if (!targetInstance.open()) {
             return { type: 'error', message: "Cannot open chest now." }; // Might be animating or locked
        }

        const loot = targetInstance.userData.loot as Record<string, number> | undefined;
        let lootMessages: string[] = []; let itemsFound = false;
        if (loot) {
            Object.entries(loot).forEach(([name, amount]) => {
                if (amount <= 0) return;
                itemsFound = true;
                const success = this.inventory.addItem(name, amount);
                lootMessages.push(success ? `Found ${amount} ${name}` : `Found ${amount} ${name}, but inventory is full!`);
            });
            targetInstance.userData.loot = {}; // Clear loot after attempting to add
        }
        const finalMessage = itemsFound ? lootMessages.join('. ') : "The chest is empty.";
        this.eventLog?.addEntry(finalMessage + ".");
        return { type: 'open_result', message: finalMessage };
    }

    private showPrompt(text: string, duration: number | null = null): void {
        // FIX: Check element exists
        if (!this.interactionPromptElement) return;

        // Prevent overriding gathering prompt with timed prompts
        if (this.activeGather && duration !== null) return;

        this.interactionPromptElement.textContent = text;
        this.interactionPromptElement.style.display = 'block';

        // Clear existing timeout *before* setting a new one
        if (this.promptTimeout !== null) {
             clearTimeout(this.promptTimeout);
             this.promptTimeout = null;
        }

        if (duration && duration > 0) {
            this.promptTimeout = setTimeout(() => {
                // Check if the text is still the same before hiding, prevents race conditions
                if (this.interactionPromptElement?.textContent === text) {
                     this.hidePrompt();
                }
                this.promptTimeout = null; // Clear timeout ID after execution
            }, duration);
        }
    }

    private hidePrompt(): void {
        // FIX: Check element exists
        if (!this.interactionPromptElement) return;

        // Hide only if not gathering AND no timed prompt is pending completion
        if (!this.activeGather && this.promptTimeout === null) {
            this.interactionPromptElement.style.display = 'none';
            this.interactionPromptElement.textContent = '';
        } else if (!this.activeGather && this.promptTimeout !== null) {
             // If a timed prompt *was* active but we're hiding prematurely, clear its timeout
             clearTimeout(this.promptTimeout);
             this.promptTimeout = null;
             this.interactionPromptElement.style.display = 'none';
             this.interactionPromptElement.textContent = '';
        }
         // If gathering, the prompt remains until gathering ends/cancels
    }
}