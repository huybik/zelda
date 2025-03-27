import * as THREE from 'three';

// Basic ID generator
let nextEntityId = 0;

export class Entity {
    constructor(scene, position, name = 'Entity') {
        this.id = `${name}_${nextEntityId++}`;
        this.scene = scene;
        this.mesh = new THREE.Group(); // Use Group to allow easier transformations/additions
        this.mesh.position.copy(position);
        this.name = name;
        this.velocity = new THREE.Vector3();
        this.boundingBox = new THREE.Box3(); // Will be updated based on mesh

        this.scene.add(this.mesh);

        // Common properties - subclasses can override or extend
        this.health = 100;
        this.maxHealth = 100;
        this.isDead = false;

        // Flags for systems
        this.userData = {
            isEntity: true,
            isPlayer: false,
            isNPC: false,
            isAnimal: false,
            isCollidable: true, // Most entities are collidable
            isInteractable: false, // Overridden by specific types
            entityReference: this, // Link back to the class instance
        };
        this.mesh.userData = this.userData; // Make accessible via raycasting/collision checks
    }

    update(deltaTime, player, collidables) {
        // Base update loop (movement based on velocity, basic physics)
        // Apply velocity
        this.mesh.position.addScaledVector(this.velocity, deltaTime);

        // Update bounding box after movement
        this.updateBoundingBox();

        // Subclasses will implement specific logic (AI, player controls, etc.)
    }

    updateBoundingBox() {
        // Ensure the bounding box is updated based on the current mesh state
        // This might need adjustment depending on how complex the entity meshes become
        if (this.mesh.children.length > 0) {
             // If using a Group with multiple children, compute based on children
             this.boundingBox.setFromObject(this.mesh, true); // true = recursive
        } else if (this.mesh instanceof THREE.Mesh && this.mesh.geometry) {
            // If it's a single mesh, compute based on its geometry
            if (!this.mesh.geometry.boundingBox) {
                this.mesh.geometry.computeBoundingBox();
            }
             this.boundingBox.copy(this.mesh.geometry.boundingBox).applyMatrix4(this.mesh.matrixWorld);
        } else {
             // Fallback for simple Group or placeholder
             this.boundingBox.setFromCenterAndSize(this.mesh.position, new THREE.Vector3(1, 1, 1)); // Default size
        }
         // Store on userData for physics system
         this.mesh.userData.boundingBox = this.boundingBox;
    }

    setPosition(position) {
        this.mesh.position.copy(position);
        this.updateBoundingBox();
    }

    lookAt(targetPosition) {
        this.mesh.lookAt(targetPosition);
    }

    takeDamage(amount) {
        if (this.isDead) return;
        this.health = Math.max(0, this.health - amount);
        console.log(`${this.name} took ${amount} damage. Health: ${this.health}`);
        if (this.health <= 0) {
            this.die();
        }
    }

    heal(amount) {
        if (this.isDead) return;
        this.health = Math.min(this.maxHealth, this.health + amount);
         console.log(`${this.name} healed ${amount}. Health: ${this.health}`);
    }


    die() {
        if (this.isDead) return;
        console.log(`${this.name} died.`);
        this.isDead = true;
        this.velocity.set(0, 0, 0); // Stop movement
        // Could trigger death animation, remove from scene after delay, etc.
        // For simplicity, we might just mark as dead and handle respawn/removal elsewhere
    }

    destroy() {
        this.scene.remove(this.mesh);
        // TODO: Remove from relevant arrays (entities, collidables, interactables) in the Game class
    }
}