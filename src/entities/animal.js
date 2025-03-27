import * as THREE from 'three';
import { Entity } from './entity.js';

export class Animal extends Entity {
    constructor(scene, position, type, worldSize) {
        super(scene, position, type); // Name = type (Deer, Wolf, Rabbit)
        this.userData.isAnimal = true;
        this.userData.isCollidable = true;
        this.type = type;
        this.worldSize = worldSize; // To know boundaries for wandering
        this.groundCheckTimer = Math.random(); // Initialize timer randomly to stagger checks
        this.groundCheckInterval = 0.2 + Math.random() * 0.2; // Check every 0.2-0.4 seconds

        // Behavior states
        this.state = 'wandering'; // 'wandering', 'fleeing', 'idle', 'attacking' (for wolf)
        this.stateTimer = 0;
        this.wanderTarget = new THREE.Vector3();
        this.speed = 1.5; // Base speed

        // Type-specific properties
        this.setupTypeSpecifics();

        this.createModel();
        this.updateBoundingBox(); // Initial calculation
    }

     setupTypeSpecifics() {
         switch (this.type) {
             case 'Deer':
                 this.userData.isInteractable = true;
                 this.userData.interactionType = 'pet';
                 this.userData.prompt = "Press E to Pet Deer";
                 this.speed = 2.0;
                 this.health = 30;
                 this.maxHealth = 30;
                 break;
             case 'Wolf':
                 this.userData.isInteractable = false; // Cannot 'pet' a wolf
                 this.speed = 3.5;
                 this.health = 50;
                 this.maxHealth = 50;
                 this.state = 'idle'; // Wolves might start idle or patrolling
                 this.detectionRange = 20; // How far wolf can see player
                 this.attackRange = 2.5;    // How close wolf needs to be to attack
                 this.attackDamage = 8;
                 this.attackCooldown = 2.0; // Seconds between attacks
                 this.lastAttackTime = 0;
                 break;
             case 'Rabbit':
                  this.userData.isInteractable = false;
                  this.speed = 4.0;
                  this.health = 10;
                  this.maxHealth = 10;
                  this.userData.isCollidable = false; // Rabbits might not collide
                  break;
             default:
                 this.speed = 1.5;
                 break;
         }
     }

    createModel() {
        // Very simple blocky models
        let bodyColor = 0xCD853F; // Peru Brown (default)
        let headColor = 0xD2B48C; // Tan
        const limbColor = bodyColor;

        let bodyGeo, headGeo;
        const limbRadius = 0.1;
        const limbLength = 0.6;

        switch (this.type) {
            case 'Deer':
                bodyColor = 0xA0522D; // Sienna
                headColor = 0xBC8F8F; // Rosy Brown
                bodyGeo = new THREE.BoxGeometry(1.2, 0.7, 0.6);
                headGeo = new THREE.BoxGeometry(0.4, 0.4, 0.5); // Boxy head

                // Antlers (simple cones/cylinders)
                const antlerMat = new THREE.MeshLambertMaterial({ color: 0xD2B48C });
                const antlerGeo = new THREE.ConeGeometry(0.05, 0.5, 4);
                const antlerL = new THREE.Mesh(antlerGeo, antlerMat);
                const antlerR = new THREE.Mesh(antlerGeo, antlerMat);
                antlerL.position.set(-0.15, 0.2, -0.2); // Position relative to head
                antlerR.position.set(0.15, 0.2, -0.2);
                antlerL.rotation.z = 0.5;
                antlerR.rotation.z = -0.5;
                // Head mesh needs to exist before adding antlers to it conceptually
                break; // Antlers added after head mesh created below

            case 'Wolf':
                bodyColor = 0x696969; // Dim Gray
                headColor = 0x808080; // Gray
                bodyGeo = new THREE.BoxGeometry(1.0, 0.5, 0.4);
                headGeo = new THREE.BoxGeometry(0.35, 0.35, 0.45);
                // Maybe add a tail (small box)
                const tailGeo = new THREE.BoxGeometry(0.1, 0.4, 0.1);
                const tailMat = new THREE.MeshLambertMaterial({ color: bodyColor });
                const tailMesh = new THREE.Mesh(tailGeo, tailMat);
                tailMesh.position.set(0, 0.1, -0.6); // Attach to back of body
                tailMesh.rotation.x = -0.5;
                 this.mesh.add(tailMesh); // Add tail directly to group
                break;

            case 'Rabbit':
                 bodyColor = 0xF5F5DC; // Beige
                 headColor = 0xFFFAFA; // Snow White
                 bodyGeo = new THREE.BoxGeometry(0.4, 0.3, 0.3);
                 headGeo = new THREE.SphereGeometry(0.15, 8, 6);
                 // Long ears
                 const earGeo = new THREE.BoxGeometry(0.05, 0.3, 0.05);
                 const earMat = new THREE.MeshLambertMaterial({ color: headColor });
                 const earL = new THREE.Mesh(earGeo, earMat);
                 const earR = new THREE.Mesh(earGeo, earMat);
                 earL.position.set(-0.05, 0.1, -0.05); // Relative to head
                 earR.position.set(0.05, 0.1, -0.05);
                 earL.rotation.z = 0.2;
                 earR.rotation.z = -0.2;
                 // Ears added after head created
                 break;

            default:
                bodyGeo = new THREE.BoxGeometry(0.8, 0.5, 0.4);
                headGeo = new THREE.SphereGeometry(0.25, 8, 8);
                break;
        }

        const bodyMat = new THREE.MeshLambertMaterial({ color: bodyColor });
        const headMat = new THREE.MeshLambertMaterial({ color: headColor });
        const limbMat = new THREE.MeshLambertMaterial({ color: limbColor });

        // Body
        const bodyMesh = new THREE.Mesh(bodyGeo, bodyMat);
        bodyMesh.position.y = limbLength + 0.5 * bodyGeo.parameters.height; // Body sits on top of legs
        bodyMesh.castShadow = true;
        this.mesh.add(bodyMesh);

        // Head
        const headMesh = new THREE.Mesh(headGeo, headMat);
        // Position head relative to body front and top
        headMesh.position.set(0, bodyMesh.position.y + 0.5 * bodyGeo.parameters.height, bodyGeo.parameters.depth / 2 + 0.5 * headGeo.parameters.depth );
        headMesh.castShadow = true;
        this.mesh.add(headMesh);
        this.headMesh = headMesh; // Store reference for head bobbing

        // Add type-specific parts after head is created
         if (this.type === 'Deer') {
             const antlerMat = new THREE.MeshLambertMaterial({ color: 0xD2B48C });
             const antlerGeo = new THREE.ConeGeometry(0.05, 0.5, 4);
             const antlerL = new THREE.Mesh(antlerGeo, antlerMat);
             const antlerR = new THREE.Mesh(antlerGeo, antlerMat);
             // Position relative to head mesh's position
             antlerL.position.set(-0.15, 0.2, -0.2).add(headMesh.position);
             antlerR.position.set(0.15, 0.2, -0.2).add(headMesh.position);
             antlerL.rotation.z = 0.5;
             antlerR.rotation.z = -0.5;
             this.mesh.add(antlerL);
             this.mesh.add(antlerR);
         } else if (this.type === 'Rabbit') {
             const earMat = new THREE.MeshLambertMaterial({ color: headColor });
             const earGeo = new THREE.BoxGeometry(0.05, 0.3, 0.05);
             const earL = new THREE.Mesh(earGeo, earMat);
             const earR = new THREE.Mesh(earGeo, earMat);
             earL.position.set(-0.05, 0.15, -0.05).add(headMesh.position); // Use head position as origin
             earR.position.set(0.05, 0.15, -0.05).add(headMesh.position);
             earL.rotation.z = 0.2;
             earR.rotation.z = -0.2;
             this.mesh.add(earL);
             this.mesh.add(earR);
         }


        // Legs (Simple Cylinders/Boxes)
        const legPositions = [
            new THREE.Vector3(bodyGeo.parameters.width / 2 - limbRadius, limbLength / 2, bodyGeo.parameters.depth / 2 - limbRadius), // Front Right
            new THREE.Vector3(-bodyGeo.parameters.width / 2 + limbRadius, limbLength / 2, bodyGeo.parameters.depth / 2 - limbRadius), // Front Left
            new THREE.Vector3(bodyGeo.parameters.width / 2 - limbRadius, limbLength / 2, -bodyGeo.parameters.depth / 2 + limbRadius), // Back Right
            new THREE.Vector3(-bodyGeo.parameters.width / 2 + limbRadius, limbLength / 2, -bodyGeo.parameters.depth / 2 + limbRadius) // Back Left
        ];

        legPositions.forEach(pos => {
            const legGeo = new THREE.CylinderGeometry(limbRadius, limbRadius * 0.9, limbLength, 6);
            const legMesh = new THREE.Mesh(legGeo, limbMat);
            legMesh.position.copy(pos);
            legMesh.castShadow = true;
            this.mesh.add(legMesh);
        });

        this.mesh.userData.height = limbLength + bodyGeo.parameters.height; // Approx height
    }

    interact(player) {
        if (this.type === 'Deer' && !this.isDead) {
            console.log("Petting deer...");
             if (player.eventLog) player.eventLog.addEntry("You gently pet the deer.");
            this.state = 'idle'; // Stop wandering briefly
            this.stateTimer = 2.0; // Stay idle for 2 seconds
             this.mesh.lookAt(player.mesh.position); // Look at player

            // Chance to get a feather
            if (Math.random() < 0.3) { // 30% chance
                return { type: 'reward', item: { name: 'feather', amount: 1 }, message: "The deer seems calm. You found a feather!" };
            } else {
                 return { type: 'message', message: "The deer looks at you curiously." };
            }
        }
         // Wolves/Rabbits cannot be interacted with via 'E'
         return null;
    }


    update(deltaTime, player, collidables) {
        if (this.isDead) return;

        super.update(deltaTime); // Handles basic velocity application if needed

        const distanceToPlayer = this.mesh.position.distanceTo(player.mesh.position);
        this.stateTimer -= deltaTime;

         // --- State Machine Logic ---
         switch (this.state) {
             case 'idle':
                 this.velocity.set(0, 0, 0);
                 // Transition conditions
                 if (this.stateTimer <= 0) {
                      this.findNewWanderTarget();
                      this.state = 'wandering';
                 }
                 if (this.type === 'Wolf' && distanceToPlayer < this.detectionRange) {
                      this.state = 'attacking';
                      if (player.eventLog) player.eventLog.addEntry("A wolf growls nearby!");
                 } else if ((this.type === 'Deer' || this.type === 'Rabbit') && distanceToPlayer < 10) {
                     this.state = 'fleeing';
                 }
                 break;

             case 'wandering':
                 // Move towards wanderTarget
                 const direction = this.wanderTarget.clone().sub(this.mesh.position);
                 direction.y = 0; // Ignore height difference for movement direction
                 const distanceToTarget = direction.length();

                 if (distanceToTarget < 1.0 || this.stateTimer <= 0) {
                     // Reached target or timer expired, find new one or become idle
                     if (Math.random() < 0.3) { // 30% chance to go idle
                         this.state = 'idle';
                         this.stateTimer = 2 + Math.random() * 3; // Idle for 2-5 seconds
                         this.velocity.set(0,0,0);
                     } else {
                          this.findNewWanderTarget();
                     }
                 } else {
                     direction.normalize();
                     this.velocity.set(direction.x * this.speed, this.velocity.y, direction.z * this.speed);
                     // Look in the direction of movement
                     const lookTarget = this.mesh.position.clone().add(direction);
                     this.mesh.lookAt(lookTarget);
                 }

                 // Check for player proximity to flee (Deer/Rabbit) or attack (Wolf)
                 if (this.type === 'Wolf' && distanceToPlayer < this.detectionRange) {
                      this.state = 'attacking';
                 } else if ((this.type === 'Deer' || this.type === 'Rabbit') && distanceToPlayer < 10) {
                     this.state = 'fleeing';
                 }
                 break;

             case 'fleeing':
                 // Run away from the player
                 const fleeDirection = this.mesh.position.clone().sub(player.mesh.position);
                 fleeDirection.y = 0;
                 fleeDirection.normalize();
                 this.velocity.set(fleeDirection.x * this.speed * 1.5, this.velocity.y, fleeDirection.z * this.speed * 1.5); // Flee faster

                 const fleeLookTarget = this.mesh.position.clone().add(fleeDirection);
                 this.mesh.lookAt(fleeLookTarget);

                 // If player is far enough away, return to wandering
                 if (distanceToPlayer > 20) {
                     this.findNewWanderTarget();
                     this.state = 'wandering';
                 }
                 break;

             case 'attacking': // Wolf specific
                 if (distanceToPlayer > this.detectionRange * 1.2) { // Lose interest if player gets far away
                      this.state = 'idle';
                      this.stateTimer = 1.0;
                      this.velocity.set(0,0,0);
                      break;
                 }

                 const attackDirection = player.mesh.position.clone().sub(this.mesh.position);
                 attackDirection.y = 0;
                 const distanceToAttackTarget = attackDirection.length();
                 attackDirection.normalize();

                  const attackLookTarget = this.mesh.position.clone().add(attackDirection);
                  this.mesh.lookAt(attackLookTarget);


                 if (distanceToAttackTarget > this.attackRange) {
                     // Move towards player
                     this.velocity.set(attackDirection.x * this.speed, this.velocity.y, attackDirection.z * this.speed);
                 } else {
                     // Close enough to attack
                     this.velocity.set(0, 0, 0); // Stop moving to attack
                     const time = this.scene.userData.gameTime || performance.now() / 1000; // Need game time access
                     if (time > this.lastAttackTime + this.attackCooldown) {
                         console.log("Wolf attacks!");
                         player.takeDamage(this.attackDamage);
                         if (player.eventLog) player.eventLog.addEntry(`The wolf attacks you! (-${this.attackDamage} HP)`);
                         this.lastAttackTime = time;
                         // Optional: Add a small lunge animation/effect
                     }
                 }
                 break;
         }

        // --- Apply movement and gravity ---
        // Simplified ground check - assume flat ground or use raycasting if needed
        this.applyGravity(deltaTime); // Use a simplified gravity application
        this.mesh.position.addScaledVector(this.velocity, deltaTime);

        // --- Animation ---
        this.animate(deltaTime);

        this.updateBoundingBox(); // Update bounds after movement
    }

    applyGravity(deltaTime) {
     // Update timer
     this.groundCheckTimer -= deltaTime;

     let performGroundCheck = this.groundCheckTimer <= 0;

     if (performGroundCheck) {
         this.groundCheckTimer = this.groundCheckInterval; // Reset timer

         const terrain = this.scene.getObjectByName("Terrain");
         if (terrain) {
             // Raycast origin slightly above feet
             const origin = this.mesh.position.clone().add(new THREE.Vector3(0, 0.5, 0));
             const raycaster = new THREE.Raycaster(origin, new THREE.Vector3(0, -1, 0), 0, 1.0); // Short ray down
             const intersects = raycaster.intersectObject(terrain);

             if (intersects.length > 0) {
                 const groundY = intersects[0].point.y;
                 // Snap or smoothly adjust Y position
                 this.mesh.position.y = THREE.MathUtils.lerp(this.mesh.position.y, groundY, 10 * deltaTime);
                 this.velocity.y = 0;
                 this.isOnGround = true; // Add an isOnGround flag if needed elsewhere
             } else {
                 // In air - apply gravity
                 this.velocity.y += -15 * deltaTime;
                 this.isOnGround = false;
             }
         } else {
              this.velocity.y += -15 * deltaTime; // Apply gravity if no terrain
              this.isOnGround = false;
         }
     } else {
         // If not performing ground check this frame, still apply gravity if airborne
         if (!this.isOnGround) { // Use the last known state
              this.velocity.y += -15 * deltaTime;
         }
         // Simple ground clamp if we know we were on ground last check and haven't jumped
          else if (this.isOnGround && this.velocity.y < 0) {
               this.velocity.y = 0;
               // Optionally do a quick check against terrain Y if available without raycast?
          }
     }
    }

    findNewWanderTarget() {
        const wanderDistance = 10 + Math.random() * 15; // 10m to 25m
        const angle = Math.random() * Math.PI * 2;
        const targetX = this.mesh.position.x + Math.cos(angle) * wanderDistance;
        const targetZ = this.mesh.position.z + Math.sin(angle) * wanderDistance;

        // Clamp target within world bounds
        const halfSize = this.worldSize / 2 - 5; // Keep slightly away from edge
        this.wanderTarget.x = THREE.MathUtils.clamp(targetX, -halfSize, halfSize);
        this.wanderTarget.z = THREE.MathUtils.clamp(targetZ, -halfSize, halfSize);
        this.wanderTarget.y = this.mesh.position.y; // Keep target at current height level for simplicity

        this.stateTimer = 5 + Math.random() * 5; // Wander for 5-10 seconds
    }

    animate(deltaTime) {
        const speed = new THREE.Vector3(this.velocity.x, 0, this.velocity.z).length();
        if (speed > 0.1 && this.headMesh) {
            // Head bobbing
            const bobFrequency = 8;
            const bobAmplitude = 0.05;
            const time = performance.now() * 0.001;
             // Adjust head Y position based on sine wave
             const headBobY = Math.sin(time * bobFrequency) * bobAmplitude;
             // We need to adjust the local position, assuming headMesh is a direct child of this.mesh
             // Find original local Y position if not already stored
             if (this.headMesh.userData.originalY === undefined) {
                  this.headMesh.userData.originalY = this.headMesh.position.y;
             }
             this.headMesh.position.y = this.headMesh.userData.originalY + headBobY;

            // Could add leg animations similar to player if needed
        } else if (this.headMesh && this.headMesh.userData.originalY !== undefined) {
             // Lerp head back to original position when idle
             this.headMesh.position.y = THREE.MathUtils.lerp(this.headMesh.position.y, this.headMesh.userData.originalY, 5 * deltaTime);
        }
    }

     // Override die for animal specific logic
     die() {
         if(this.isDead) return;
         super.die();
         console.log(`${this.name} died.`);
         this.velocity.set(0,0,0);
         // Could play death animation, make mesh fade out, or drop loot
         // For simplicity, just stop it and maybe rotate it onto its side
          this.mesh.rotation.z = Math.PI / 2;

         // Remove from interactables/collidables after a delay?
         this.userData.isCollidable = false;
         this.userData.isInteractable = false;

         // TODO: Remove the entity from the main game arrays after a delay
         // setTimeout(() => this.destroy(), 10000); // Example: remove after 10 seconds
     }


     // Override updateBoundingBox for animal specific size
     updateBoundingBox() {
         const height = this.mesh.userData.height || 1.0;
         const width = (this.type === 'Deer' || this.type === 'Wolf') ? 1.2 : 0.5;
         const depth = (this.type === 'Deer' || this.type === 'Wolf') ? 0.6 : 0.4;

         const center = this.mesh.position.clone();
         center.y += height / 2;
         const size = new THREE.Vector3(width, height, depth);
         this.boundingBox.setFromCenterAndSize(center, size);
          this.mesh.userData.boundingBox = this.boundingBox;
     }
}