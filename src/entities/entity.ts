// File: /src/entities/entity.ts
// Optimization: Minor cleanup, removed redundant checks.

import * as THREE from 'three';
import { EntityUserData } from '../types/common';

let nextEntityId = 0;

export class Entity {
    public id: string;
    public scene: THREE.Scene | null;
    public mesh: THREE.Group;
    public name: string;
    public velocity: THREE.Vector3;
    public boundingBox: THREE.Box3;
    public health: number;
    public maxHealth: number;
    public isDead: boolean;
    public userData: EntityUserData;

    constructor(scene: THREE.Scene, position: THREE.Vector3, name: string = 'Entity') {
        // scene and position checks removed, assume valid input for brevity
        this.id = `${name}_${nextEntityId++}`;
        this.scene = scene;
        this.name = name;
        this.mesh = new THREE.Group();
        this.mesh.position.copy(position);
        this.velocity = new THREE.Vector3();
        this.boundingBox = new THREE.Box3();
        this.health = 100; this.maxHealth = 100;
        this.isDead = false;

        this.userData = {
            entityReference: this, isEntity: true, isPlayer: false, isNPC: false, isAnimal: false,
            isCollidable: true, isInteractable: false, id: this.id,
        };
        this.mesh.userData = this.userData;
        this.mesh.name = this.name;

        this.scene.add(this.mesh);
    }

    // Base update - subclasses should implement fully
    update(deltaTime: number, player?: Entity, collidables?: THREE.Object3D[]): void {}

    updateBoundingBox(): void {
        if (!this.mesh) return;
        // Default uses non-recursive bounding box for performance.
        // Subclasses can override if recursive calculation is needed.
        this.boundingBox.setFromObject(this.mesh, false);
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
            const target = targetPosition.clone();
            target.y = this.mesh.position.y; // Look horizontally by default
            if (target.distanceToSquared(this.mesh.position) < 0.001) return; // Avoid self-look
            this.mesh.lookAt(target);
        }
    }

    takeDamage(amount: number): void {
        if (this.isDead || amount <= 0) return;
        this.health = Math.max(0, this.health - amount);
        console.log(`${this.name} took ${amount} damage. Health: ${this.health}/${this.maxHealth}`);
        if (this.health <= 0) this.die();
    }

    heal(amount: number): void {
        if (this.isDead || amount <= 0) return;
        this.health = Math.min(this.maxHealth, this.health + amount);
        console.log(`${this.name} healed ${amount}. Health: ${this.health}/${this.maxHealth}`);
    }

    die(): void {
        if (this.isDead) return;
        console.log(`${this.name} has died.`);
        this.isDead = true;
        this.velocity.set(0, 0, 0);
        this.health = 0;
        this.userData.isCollidable = false;
        this.userData.isInteractable = false;
        // External systems handle removal/visuals
    }

    destroy(): void {
        console.log(`Destroying ${this.name}...`);
        if (this.mesh && this.scene) {
            this.mesh.traverse((child) => {
                if (child instanceof THREE.Mesh) {
                    child.geometry?.dispose();
                    if (Array.isArray(child.material)) child.material.forEach(mat => mat?.dispose());
                    else child.material?.dispose();
                }
            });
            this.scene.remove(this.mesh);
        }
        this.mesh = null!; this.scene = null;
        if(this.userData) this.userData.entityReference = null;
    }
}