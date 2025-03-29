import * as THREE from 'three';
import { EntityUserData } from '../types/common';

let nextEntityId = 0;

export class Entity {
    public id: string;
    public scene: THREE.Scene | null; // Allow null after destroy
    public mesh: THREE.Group;
    public name: string;
    public velocity: THREE.Vector3;
    public boundingBox: THREE.Box3;
    public health: number;
    public maxHealth: number;
    public isDead: boolean;
    public userData: EntityUserData;

    constructor(scene: THREE.Scene, position: THREE.Vector3, name: string = 'Entity') {
        if (!scene || !position) {
            throw new Error("Scene and position are required for Entity creation.");
        }
        this.id = `${name}_${nextEntityId++}`;
        this.scene = scene;
        this.name = name;
        this.mesh = new THREE.Group();
        this.mesh.position.copy(position);
        this.velocity = new THREE.Vector3();
        this.boundingBox = new THREE.Box3(); // Initialized empty

        // Common properties
        this.health = 100;
        this.maxHealth = 100;
        this.isDead = false;

        // Flags for systems
        this.userData = {
            entityReference: this,
            isEntity: true,
            isPlayer: false,
            isNPC: false,
            isAnimal: false,
            isCollidable: true,
            isInteractable: false,
            id: this.id,
        };
        this.mesh.userData = this.userData; // Link to mesh
        this.mesh.name = this.name; // Group name for debugging

        this.scene.add(this.mesh);
        // Initial box calculation might be needed if size is known
        // this.updateBoundingBox(); // Call if initial size/shape is set
    }

    // Base update (override or extend in subclasses)
    update(deltaTime: number, player?: Entity, collidables?: THREE.Object3D[]): void {
        // Default behavior: simple velocity application
        // this.mesh.position.addScaledVector(this.velocity, deltaTime);
        // Ensure subclasses call updateBoundingBox if they move/change shape
    }

    updateBoundingBox(): void {
        if (!this.mesh) return;
        // Compute based on the group and its direct children for performance
        // Use recursive 'true' only if complex nested models require it.
        this.boundingBox.setFromObject(this.mesh, false);
        // Ensure the userData reference points to the *instance's* boundingBox
        this.userData.boundingBox = this.boundingBox;
    }

    setPosition(position: THREE.Vector3): void {
        if (this.mesh) {
            this.mesh.position.copy(position);
            this.updateBoundingBox();
        }
    }

    lookAt(targetPosition: THREE.Vector3): void {
        if (this.mesh) {
            // Ensure the mesh looks at the target position correctly
            // Need to handle the case where target is directly above/below
            const target = targetPosition.clone();
            target.y = this.mesh.position.y; // Often want to look horizontally
            if (target.distanceToSquared(this.mesh.position) < 0.001) return; // Avoid looking at self
            this.mesh.lookAt(target);
        }
    }

    takeDamage(amount: number): void {
        if (this.isDead || amount <= 0) return;

        this.health = Math.max(0, this.health - amount);
        console.log(`${this.name} took ${amount} damage. Health: ${this.health}/${this.maxHealth}`);

        if (this.health <= 0) {
            this.die();
        }
        // TODO: Trigger damage feedback (visual/audio)
    }

    heal(amount: number): void {
        if (this.isDead || amount <= 0) return;

        this.health = Math.min(this.maxHealth, this.health + amount);
        console.log(`${this.name} healed ${amount}. Health: ${this.health}/${this.maxHealth}`);
        // TODO: Trigger heal feedback
    }

    die(): void {
        if (this.isDead) return;
        console.log(`${this.name} has died.`);
        this.isDead = true;
        this.velocity.set(0, 0, 0);
        this.health = 0;
        this.userData.isCollidable = false; // Typically dead things aren't solid
        this.userData.isInteractable = false; // Or interactable
        // Subclasses handle specific death visuals/logic (drops, animations)
        // Removal from scene/arrays is handled externally (e.g., Game class)
    }

    destroy(): void {
        console.log(`Destroying ${this.name}...`);
        if (this.mesh && this.scene) {
            // Dispose geometry and materials
            this.mesh.traverse((child) => {
                if (child instanceof THREE.Mesh) {
                    child.geometry?.dispose();
                    if (child.material) {
                        if (Array.isArray(child.material)) {
                            child.material.forEach(mat => mat?.dispose());
                        } else {
                            child.material?.dispose();
                        }
                    }
                }
            });
            this.scene.remove(this.mesh);
        }
        // Clear references
        this.mesh = null!; // Use non-null assertion or handle null explicitly elsewhere
        this.scene = null;
        this.userData.entityReference = null; // Break cycle
        // TODO: Notify Game/EntityManager to remove this entity from lists
    }
}