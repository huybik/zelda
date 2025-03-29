// File: /src/systems/interaction.ts

import * as THREE from 'three';
import { Player } from '../entities/player';
import { Controls } from './controls';
import { Inventory } from './inventory';
import { EventLog } from './quest';
import { Entity } from '../entities/entity';
import { InteractionResult, EntityUserData, TargetInfo, ActiveGather } from '../types/common';

const _camDir = new THREE.Vector3(); const _objDir = new THREE.Vector3();
const _playerPos = new THREE.Vector3(); const _playerDir = new THREE.Vector3();
const _objPos = new THREE.Vector3(); const _size = new THREE.Vector3(); const _tempBox = new THREE.Box3();

// --- Interactable World Object ---
export class InteractableObject {
    public id: string; public position: THREE.Vector3;
    public interactionType: string; public data: any;
    public prompt: string; public mesh: THREE.Mesh | THREE.Group | null = null;
    public isActive: boolean = true; public userData: EntityUserData;

    constructor(id: string, position: THREE.Vector3, interactionType: string, data: any, prompt: string, scene?: THREE.Scene) {
        this.id = id; this.position = position.clone(); this.interactionType = interactionType;
        this.data = data; this.prompt = prompt;
        this.userData = {
            id: this.id, entityReference: this, isInteractable: true, interactionType: this.interactionType,
            prompt: this.prompt, data: this.data, isSimpleObject: true, isEntity: false,
            isPlayer: false, isNPC: false, isAnimal: false, isCollidable: false,
        };
        // Optional: Add default visual marker if scene is provided
        // this.createDefaultMesh(scene);
    }

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
                }
                eventLog?.addEntry(`Your inventory is full.`);
                return { type: 'error', message: 'Inventory full' };
            case 'read_sign':
                const signText = this.data as string || "Illegible sign.";
                eventLog?.addEntry(`Sign: "${signText}"`);
                return { type: 'message', message: signText };
            default:
                console.warn(`Unhandled simple interaction: ${this.interactionType}`);
                return { type: 'message', message: 'You look at the object.' };
        }
    }

    removeFromWorld(): void {
        this.isActive = false; this.userData.isInteractable = false;
        if (this.mesh) { this.mesh.visible = false; this.userData.isCollidable = false; }
        // TODO: Proper scene removal handled by Game class or manager
    }

    // Required for compatibility if treated like an Entity
    update(deltaTime: number): void { /* Static */ }
    updateBoundingBox(): void {
        this.userData.boundingBox ??= new THREE.Box3();
        if (this.mesh) this.userData.boundingBox.setFromObject(this.mesh);
        else this.userData.boundingBox.setFromCenterAndSize(this.position, _size.set(0.5, 0.5, 0.5));
    }

    // Assign mesh AFTER construction if needed
    setMesh(mesh: THREE.Mesh | THREE.Group): void {
        if (this.mesh && this.mesh.parent) this.mesh.parent.remove(this.mesh); // Remove old mesh
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
    private interactableSource: Array<Entity | InteractableObject | THREE.Object3D>; // Reference Game's list
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

    update(deltaTime: number): void {
        // Handle Gather Action
        if (this.activeGather) {
            const moved = this.player.velocity.lengthSq() * deltaTime > 0.001;
            if (moved || this.controls.moveState.interact) return this.cancelGatherAction();
            this.updateGatherAction(deltaTime);
            return; // Skip target finding
        }
        this.controls.moveState.interact = false; // Consume interact flag if not gathering

        // Find Target
        const targetInfo = this.findInteractableTarget();

        // Update UI Prompt & Handle Interaction Press
        if (targetInfo?.instance?.userData?.isInteractable) {
            if (this.currentTarget !== targetInfo.instance) {
                this.currentTarget = targetInfo.instance; this.currentTargetMesh = targetInfo.mesh;
                this.showPrompt(targetInfo.instance.userData.prompt || "Press E to interact");
            }
            if (this.controls.moveState.interact) { // Check interact flag again
                this.tryInteract(this.currentTarget, this.currentTargetMesh);
                this.controls.moveState.interact = false; // Consume interact flag
            }
        } else if (this.currentTarget) { // No valid target found
            this.currentTarget = null; this.currentTargetMesh = null; this.hidePrompt();
        }
    }

    private findInteractableTarget(): TargetInfo | null {
        // 1. Raycast from camera
        this.raycaster.setFromCamera(new THREE.Vector2(0, 0), this.camera);
        this.raycaster.far = this.interactionDistance;

        const meshesToCheck = this.interactableSource
            .map(item => (item as any).mesh ?? (item instanceof THREE.Object3D ? item : null))
            .filter((mesh): mesh is THREE.Object3D => mesh instanceof THREE.Object3D && mesh.userData?.isInteractable === true && mesh.visible !== false);

        const intersects = this.raycaster.intersectObjects(meshesToCheck, true);

        for (const intersect of intersects) {
            const targetInfo = this.getInteractableFromHit(intersect.object);
            if (targetInfo) {
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
    private getInteractableFromHit(hitObject: THREE.Object3D): { mesh: THREE.Object3D; instance: any } | null {
        let current: THREE.Object3D | null = hitObject;
        while (current) {
            const userData = current.userData;
            if (userData?.isInteractable && userData.entityReference) {
                return { mesh: current, instance: userData.entityReference };
            }
            // Handle InteractableObject directly (where instance *is* the reference)
             if (userData?.isInteractable && userData.isSimpleObject) {
                 const instance = this.interactableSource.find(e => (e as any).mesh === current || e === current);
                 if (instance) return { mesh: current, instance: instance };
             }
             // Handle cases where the group itself is the interactable (e.g., Trees from env)
             if (userData?.isInteractable && this.interactableSource.includes(current)) {
                 return { mesh: current, instance: current };
             }

            current = current.parent;
        }
        return null;
    }

    private findNearbyInteractable(): TargetInfo | null {
        this.player.mesh.getWorldPosition(_playerPos);
        this.player.mesh.getWorldDirection(_playerDir);
        let closestDistSq = this.interactionDistance * this.interactionDistance;
        let closestTarget: TargetInfo | null = null;

        this.interactableSource.forEach(item => {
            const userData = (item as any)?.userData;
            if (!userData?.isInteractable || item === this.player || (userData.entityReference?.isDead) || (userData.isSimpleObject && !(item as InteractableObject).isActive)) return;

            const mesh = (item as any).mesh ?? (item instanceof THREE.Object3D ? item : null);
            if (!mesh || !mesh.visible) return;

            mesh.getWorldPosition(_objPos);
            const distSq = _playerPos.distanceToSquared(_objPos);

            if (distSq < closestDistSq) {
                _objDir.copy(_objPos).sub(_playerPos).normalize();
                if (_playerDir.angleTo(_objDir) < Math.PI / 2.5) { // ~72 deg forward arc
                    closestDistSq = distSq;
                    closestTarget = { mesh: mesh, instance: item, point: _objPos.clone(), distance: Math.sqrt(distSq) };
                }
            }
        });
        return closestTarget;
    }

    private tryInteract(targetInstance: any, targetMesh: THREE.Object3D | null): void {
        if (!targetInstance || !targetMesh || !targetInstance.userData?.isInteractable) return;

        const distance = this.player.mesh.position.distanceTo(targetMesh.position);
        if (distance > this.interactionDistance * 1.1) {
             this.currentTarget = null; this.currentTargetMesh = null; this.hidePrompt(); return; // Too far
        }

        const interactionType = targetInstance.userData.interactionType as string;
        const targetName = targetInstance.name ?? targetInstance.id ?? 'object';
        console.log(`Attempting interaction: ${interactionType} with ${targetName}`);

        let result: InteractionResult | null = null;

        if (typeof targetInstance.interact === 'function') {
            result = targetInstance.interact(this.player, this.inventory, this.eventLog);
        } else if (interactionType === 'gather' && targetInstance.userData.resource) {
            this.startGatherAction(targetInstance); result = { type: 'gather_start' };
        } else if (interactionType === 'open' && typeof targetInstance.open === 'function') { // Check for Chest's open method
             result = this.handleOpenAction(targetInstance);
        } else {
            console.warn(`Unknown interaction type/method for ${targetName}: ${interactionType}`);
            result = { type: 'message', message: "You look at the object." };
        }

        if (result) this.handleInteractionResult(result, targetInstance);

        // Deselect if interaction finished and made target non-interactable
        if (result?.type !== 'gather_start' && !targetInstance.userData?.isInteractable) {
            this.currentTarget = null; this.currentTargetMesh = null;
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
    }

    private startGatherAction(targetInstance: any): void {
        if (this.activeGather) return;
        this.activeGather = {
            targetInstance: targetInstance, startTime: performance.now(),
            duration: (targetInstance.userData.gatherTime as number) || 2000,
            resource: targetInstance.userData.resource as string
        };
        this.showPrompt(`Gathering ${this.activeGather.resource}... (0%)`); // Persistent prompt
        this.eventLog?.addEntry(`Started gathering ${this.activeGather.resource}...`);
        this.player.velocity.x = 0; this.player.velocity.z = 0; // Stop player
    }

    private updateGatherAction(deltaTime: number): void {
        if (!this.activeGather) return;
        const progress = Math.min(1, (performance.now() - this.activeGather.startTime) / this.activeGather.duration);
        this.showPrompt(`Gathering ${this.activeGather.resource}... (${Math.round(progress * 100)}%)`);
        if (progress >= 1) this.completeGatherAction();
    }

    private completeGatherAction(): void {
        if (!this.activeGather) return;
        const { resource, targetInstance } = this.activeGather;
        const success = this.inventory.addItem(resource, 1);
        this.eventLog?.addEntry(success ? `Gathered 1 ${resource}.` : `Inventory full, could not gather ${resource}.`);

        if (success && targetInstance.userData.isDepletable) { // Handle depletion/removal
            targetInstance.userData.isInteractable = false;
            if (targetInstance.mesh) targetInstance.mesh.visible = false;
            const respawnTime = targetInstance.userData.respawnTime || 15000;
            setTimeout(() => {
                if (targetInstance?.userData && targetInstance.mesh) {
                    targetInstance.userData.isInteractable = true; targetInstance.mesh.visible = true;
                    console.log(`${resource} node respawned.`);
                }
            }, respawnTime);
        } else if (success && targetInstance.userData.isSimpleObject && typeof targetInstance.removeFromWorld === 'function') {
             targetInstance.removeFromWorld();
        }

        this.activeGather = null; this.hidePrompt();
        this.currentTarget = null; this.currentTargetMesh = null; // Clear target
    }

    public cancelGatherAction(): void { // Made public for Game class access on death
        if (!this.activeGather) return;
        this.eventLog?.addEntry(`Gathering ${this.activeGather.resource} cancelled.`);
        this.activeGather = null; this.hidePrompt();
    }

    private handleOpenAction(targetInstance: any): InteractionResult | null {
        if (!targetInstance?.open || !targetInstance.userData) return { type: 'error', message: "Cannot open this." };
        if (targetInstance.userData.isOpen) return { type: 'message', message: "The chest is empty." };

        this.eventLog?.addEntry("You open the chest...");
        if (!targetInstance.open()) return { type: 'error', message: "Cannot open chest now." }; // Animation/state check

        const loot = targetInstance.userData.loot as Record<string, number> | undefined;
        let lootMessages: string[] = []; let itemsFound = false;
        if (loot) {
            Object.entries(loot).forEach(([name, amount]) => {
                if (amount <= 0) return;
                itemsFound = true;
                const success = this.inventory.addItem(name, amount);
                lootMessages.push(success ? `Found ${amount} ${name}` : `Found ${amount} ${name}, but inventory is full!`);
            });
            targetInstance.userData.loot = {}; // Clear loot
        }
        const finalMessage = itemsFound ? lootMessages.join('. ') : "The chest is empty.";
        this.eventLog?.addEntry(finalMessage + ".");
        return { type: 'open_result', message: finalMessage };
    }

    private showPrompt(text: string, duration: number | null = null): void {
        if (!this.interactionPromptElement || (this.activeGather && duration === null)) return;
        this.interactionPromptElement.textContent = text;
        this.interactionPromptElement.style.display = 'block';
        clearTimeout(this.promptTimeout ?? undefined); this.promptTimeout = null;
        if (duration && duration > 0) {
            this.promptTimeout = setTimeout(() => {
                if (this.interactionPromptElement?.textContent === text) this.hidePrompt();
            }, duration);
        }
    }

    private hidePrompt(): void {
        if (!this.interactionPromptElement) return;
        // Hide only if not gathering AND no timed prompt is waiting
        if (!this.activeGather && !this.promptTimeout) {
            this.interactionPromptElement.style.display = 'none';
            this.interactionPromptElement.textContent = '';
        }
    }
}