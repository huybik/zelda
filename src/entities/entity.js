import * as THREE from 'three';

// Basic ID generator
let nextEntityId = 0;

export class Entity {
    constructor(scene, position, name = 'Entity') {
        if (!scene || !position) {
            throw new Error("Scene and position are required for Entity creation.");
        }
        this.id = `${name}_${nextEntityId++}`;
        this.scene = scene;
        this.mesh = new THREE.Group(); // Use Group to allow easier transformations/additions
        this.mesh.position.copy(position);
        this.name = name;
        this.velocity = new THREE.Vector3();
        this.boundingBox = new THREE.Box3(); // Will be updated based on mesh

        // Common properties - subclasses can override or extend
        this.health = 100;
        this.maxHealth = 100;
        this.isDead = false;

        // Flags for systems - ensure entityReference links back to 'this' instance
        this.userData = {
            entityReference: this, // Link back to the class instance
            isEntity: true,
            isPlayer: false,
            isNPC: false,
            isAnimal: false,
            isCollidable: true, // Most entities are collidable
            isInteractable: false, // Overridden by specific types
            id: this.id, // Add ID here for easier lookup from mesh
        };
        this.mesh.userData = this.userData; // Make accessible via raycasting/collision checks
        this.mesh.name = this.name; // Set the name of the group/mesh for debugging

        this.scene.add(this.mesh);
    }

    // Base update loop (intended to be overridden or extended)
    update(deltaTime, player, collidables) {
        // Apply velocity (optional base behavior)
        // this.mesh.position.addScaledVector(this.velocity, deltaTime);

        // Update bounding box if entity moves (ensure subclasses call this if they move)
        // this.updateBoundingBox();
    }

    updateBoundingBox() {
        // Ensure the bounding box is updated based on the current mesh state
        // This is crucial for accurate collision detection
        if (this.mesh && this.mesh.parent) { // Ensure mesh is valid and in scene
             // Compute based on the group and its children
             // Set recursive flag to true only if necessary (complex nested models)
             // If models are simple (direct children of this.mesh), false might be faster.
             this.boundingBox.setFromObject(this.mesh, false); // Calculate based on direct children of the group

             // If setFromObject doesn't work well (e.g., mesh origin issues),
             // calculate manually from children's bounding boxes if needed.
        } else {
             // Fallback for simple Group or placeholder, or if mesh is removed
             this.boundingBox.setFromCenterAndSize(this.mesh.position, new THREE.Vector3(1, 1, 1)); // Default size
        }
        // Ensure the userData reference is updated for the physics system
        if (this.mesh) {
            this.mesh.userData.boundingBox = this.boundingBox;
        }
    }

    setPosition(position) {
        if (this.mesh) {
            this.mesh.position.copy(position);
            this.updateBoundingBox();
        }
    }

    lookAt(targetPosition) {
        if (this.mesh) {
            this.mesh.lookAt(targetPosition);
        }
    }

    takeDamage(amount) {
        if (this.isDead || amount <= 0) return;

        this.health = Math.max(0, this.health - amount);
        console.log(`${this.name} took ${amount} damage. Health: ${this.health}/${this.maxHealth}`);

        if (this.health <= 0) {
            this.die();
        }
        // TODO: Trigger damage animation or visual feedback
    }

    heal(amount) {
        if (this.isDead || amount <= 0) return;

        this.health = Math.min(this.maxHealth, this.health + amount);
        console.log(`${this.name} healed ${amount}. Health: ${this.health}/${this.maxHealth}`);
        // TODO: Trigger heal visual feedback
    }


    die() {
        if (this.isDead) return;
        console.log(`${this.name} has died.`);
        this.isDead = true;
        this.velocity.set(0, 0, 0); // Stop movement
        this.health = 0;
        // Subclasses should override for specific death behaviors (animations, drops etc.)
        // Removal from scene/game arrays is typically handled by the Game class or an entity manager
    }

    destroy() {
        // Remove mesh from scene
        if (this.mesh && this.mesh.parent) {
            // Dispose geometries and materials to free GPU memory
             this.mesh.traverse((child) => {
                if (child instanceof THREE.Mesh) {
                    if (child.geometry) child.geometry.dispose();
                    if (child.material) {
                        // If material is an array
                        if (Array.isArray(child.material)) {
                            child.material.forEach(mat => mat.dispose());
                        } else {
                            child.material.dispose();
                        }
                    }
                }
             });
            this.scene.remove(this.mesh);
        }
        this.mesh = null; // Remove reference
        this.scene = null; // Remove reference
        // TODO: Ensure this entity is removed from all relevant arrays (entities, collidables, interactables) in the Game class. This usually requires notifying the Game class.
        console.log(`${this.name} destroyed.`);
    }
}