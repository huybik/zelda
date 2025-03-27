    import * as THREE from 'three';
    import { Entity } from './entity.js';

    // Reusable vectors for calculations
    const _direction = new THREE.Vector3();
    const _lookTarget = new THREE.Vector3();
    const _fleeDirection = new THREE.Vector3();
    const _fleeLookTarget = new THREE.Vector3();
    const _attackDirection = new THREE.Vector3();
    const _attackLookTarget = new THREE.Vector3();
    const _origin = new THREE.Vector3();
    const _rayDirection = new THREE.Vector3(0, -1, 0);


    export class Animal extends Entity {
        constructor(scene, position, type, worldSize) {
            super(scene, position, type); // Name = type (Deer, Wolf, Rabbit)
            this.userData.isAnimal = true;
            this.userData.isCollidable = true;
            this.type = type;
            this.worldSize = worldSize; // To know boundaries for wandering
            this.isOnGround = false; // Physics state
            this.groundCheckTimer = Math.random(); // Initialize timer randomly to stagger checks
            this.groundCheckInterval = 0.15 + Math.random() * 0.1; // Check more frequently (0.15-0.25s)

            // Behavior states
            this.state = 'wandering'; // 'wandering', 'fleeing', 'idle', 'attacking' (for wolf)
            this.stateTimer = 0;
            this.wanderTarget = new THREE.Vector3();
            this.speed = 1.5; // Base speed

            // Type-specific properties
            this.setupTypeSpecifics();

            this.createModel();
            this.updateBoundingBox(); // Initial calculation
            this.findNewWanderTarget(); // Start with a target
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
                    this.lastAttackTime = -Infinity; // Initialize to allow immediate attack if relevant
                    this.userData.isHostile = false; // Start non-hostile until player detected
                    break;
                case 'Rabbit':
                    this.userData.isInteractable = false;
                    this.speed = 4.0;
                    this.health = 10;
                    this.maxHealth = 10;
                    this.userData.isCollidable = false; // Rabbits might not collide
                    this.state = 'wandering';
                    break;
                default:
                    this.speed = 1.5;
                    this.health = 20;
                    this.maxHealth = 20;
                    break;
            }
        }

        createModel() {
            // Very simple blocky models
            let bodyColor = 0xCD853F; // Peru Brown (default)
            let headColor = 0xD2B48C; // Tan
            let limbColor = bodyColor; // Use let for potential modification

            let bodyGeo, headGeo, bodyHeight, bodyDepth, headDepth = 0.4; // Defaults
            const limbRadius = 0.1;
            const limbLength = 0.6; // Assuming legs are this long

            switch (this.type) {
                case 'Deer':
                    bodyColor = 0xA0522D; // Sienna
                    headColor = 0xBC8F8F; // Rosy Brown
                    limbColor = headColor;
                    bodyGeo = new THREE.BoxGeometry(1.2, 0.7, 0.6);
                    headGeo = new THREE.BoxGeometry(0.4, 0.4, 0.5); // Boxy head
                    bodyHeight = 0.7; bodyDepth = 0.6; headDepth = 0.5;
                    break;

                case 'Wolf':
                    bodyColor = 0x696969; // Dim Gray
                    headColor = 0x808080; // Gray
                    limbColor = headColor;
                    bodyGeo = new THREE.BoxGeometry(1.0, 0.5, 0.4);
                    headGeo = new THREE.BoxGeometry(0.35, 0.35, 0.45);
                    bodyHeight = 0.5; bodyDepth = 0.4; headDepth = 0.45;
                    // Add a tail (small box)
                    const tailGeo = new THREE.BoxGeometry(0.1, 0.4, 0.1);
                    const tailMat = new THREE.MeshLambertMaterial({ color: bodyColor });
                    const tailMesh = new THREE.Mesh(tailGeo, tailMat);
                    tailMesh.position.set(0, 0.1, -bodyDepth/2 - 0.05); // Attach to back of body (use variable)
                    tailMesh.rotation.x = -0.5;
                    tailMesh.castShadow = true;
                    // Add tail relative to body position later
                    break; // Tail added after main body

                case 'Rabbit':
                    bodyColor = 0xF5F5DC; // Beige
                    headColor = 0xFFFAFA; // Snow White
                    limbColor = headColor;
                    bodyGeo = new THREE.BoxGeometry(0.4, 0.3, 0.3);
                    headGeo = new THREE.SphereGeometry(0.15, 8, 6); // Sphere head
                    bodyHeight = 0.3; bodyDepth = 0.3; headDepth = 0.3; // Approx head depth from radius
                    break;

                default:
                    bodyGeo = new THREE.BoxGeometry(0.8, 0.5, 0.4);
                    headGeo = new THREE.SphereGeometry(0.25, 8, 8);
                    bodyHeight = 0.5; bodyDepth = 0.4; headDepth = 0.5; // Approx head depth from radius
                    break;
            }

            const bodyMat = new THREE.MeshLambertMaterial({ color: bodyColor });
            const headMat = new THREE.MeshLambertMaterial({ color: headColor });
            const limbMat = new THREE.MeshLambertMaterial({ color: limbColor });

            // Body
            const bodyMesh = new THREE.Mesh(bodyGeo, bodyMat);
            // Position body so its bottom is at limbLength height from the group origin (Y=0)
            bodyMesh.position.y = limbLength + bodyHeight / 2;
            bodyMesh.castShadow = true;
            bodyMesh.receiveShadow = true; // Animals can receive shadows too
            this.mesh.add(bodyMesh);

            // Head
            const headMesh = new THREE.Mesh(headGeo, headMat);
            // Position head relative to body front and top
            const headY = bodyMesh.position.y + bodyHeight / 2;
            const headZ = bodyDepth / 2 + headDepth / 2; // Relative Z position
            headMesh.position.set(0, headY, headZ);
            headMesh.castShadow = true;
            this.mesh.add(headMesh);
            this.headMesh = headMesh; // Store reference for head bobbing
            // Store original local position relative to the group for animation reset
            headMesh.userData.originalY = headMesh.position.y; // Use headMesh ref


            // Add Wolf Tail relative to body position
            if (this.type === 'Wolf') {
                const tailMesh = this.mesh.children.find(c => c.geometry instanceof THREE.BoxGeometry && c.geometry.parameters.width === 0.1); // Find the previously created tail
                if (tailMesh) {
                    tailMesh.position.y += bodyMesh.position.y; // Adjust Y based on body position
                    tailMesh.position.z += bodyMesh.position.z; // Adjust Z based on body position
                    // Re-add? No, it should already be in the group. Just adjust its position.
                }
            }


            // Add type-specific parts *after* head is created and added to group
            if (this.type === 'Deer') {
                const antlerMat = new THREE.MeshLambertMaterial({ color: 0xD2B48C });
                const antlerGeo = new THREE.ConeGeometry(0.05, 0.5, 4);
                const antlerL = new THREE.Mesh(antlerGeo, antlerMat);
                const antlerR = new THREE.Mesh(antlerGeo, antlerMat);
                antlerL.castShadow = true;
                antlerR.castShadow = true;
                // Position relative to head mesh's local position within the group
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
                earL.castShadow = true;
                earR.castShadow = true;
                // Position relative to head mesh's local position within the group
                earL.position.set(-0.05, 0.15, -0.05).add(headMesh.position);
                earR.position.set(0.05, 0.15, -0.05).add(headMesh.position);
                earL.rotation.z = 0.2;
                earR.rotation.z = -0.2;
                this.mesh.add(earL);
                this.mesh.add(earR);
            }


            // Legs (Simple Cylinders/Boxes)
            // Position legs relative to body corners and extending downwards
            const legOffsetX = bodyGeo.parameters.width / 2 - limbRadius;
            const legOffsetZ = bodyGeo.parameters.depth / 2 - limbRadius;
            const legPositions = [
                new THREE.Vector3(legOffsetX, bodyMesh.position.y - bodyHeight / 2, legOffsetZ), // Front Right Hip
                new THREE.Vector3(-legOffsetX, bodyMesh.position.y - bodyHeight / 2, legOffsetZ), // Front Left Hip
                new THREE.Vector3(legOffsetX, bodyMesh.position.y - bodyHeight / 2, -legOffsetZ), // Back Right Hip
                new THREE.Vector3(-legOffsetX, bodyMesh.position.y - bodyHeight / 2, -legOffsetZ) // Back Left Hip
            ];

            legPositions.forEach(pos => {
                const legGeo = new THREE.CylinderGeometry(limbRadius, limbRadius * 0.9, limbLength, 6);
                // Translate geometry so origin is at the TOP (hip)
                legGeo.translate(0, -limbLength / 2, 0);
                const legMesh = new THREE.Mesh(legGeo, limbMat);
                legMesh.position.copy(pos); // Position the top of the leg at the hip position
                legMesh.castShadow = true;
                this.mesh.add(legMesh);
            });

            // Total height approx from ground (Y=0) to top of head
            this.mesh.userData.height = limbLength + bodyHeight + headMesh.geometry.parameters.radius * 2;
            this.mesh.userData.width = bodyGeo.parameters.width;
            this.mesh.userData.depth = bodyGeo.parameters.depth;
        }

        interact(player) {
            if (this.isDead) return null; // Cannot interact with dead animals

            if (this.type === 'Deer') {
                console.log("Petting deer...");
                // Use player's eventLog if available
                const eventLog = player.eventLog;
                if (eventLog) eventLog.addEntry("You gently pet the deer.");

                this.state = 'idle'; // Stop wandering briefly
                this.stateTimer = 2.0 + Math.random() * 2; // Stay idle for 2-4 seconds
                _lookTarget.copy(player.mesh.position);
                _lookTarget.y = this.mesh.position.y; // Look at same height
                this.mesh.lookAt(_lookTarget); // Look at player

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

            const distanceToPlayer = this.mesh.position.distanceTo(player.mesh.position);
            if(this.stateTimer > 0) this.stateTimer -= deltaTime;

            // --- State Machine Logic ---
            switch (this.state) {
                case 'idle':
                    this.velocity.set(0, this.velocity.y, 0); // Keep Y velocity for gravity
                    // Transition conditions
                    if (this.stateTimer <= 0) {
                        this.findNewWanderTarget();
                        this.state = 'wandering';
                    } else if (this.type === 'Wolf' && distanceToPlayer < this.detectionRange) {
                        this.state = 'attacking';
                        this.userData.isHostile = true; // Ensure flag is set
                        // Only log if player has event log
                        if (player.eventLog) player.eventLog.addEntry("A wolf growls nearby!");
                    } else if ((this.type === 'Deer' || this.type === 'Rabbit') && distanceToPlayer < 10) {
                        this.state = 'fleeing';
                    }
                    break;

                case 'wandering':
                    // Move towards wanderTarget
                    _direction.copy(this.wanderTarget).sub(this.mesh.position);
                    _direction.y = 0; // Ignore height difference for movement direction
                    const distanceToTarget = _direction.length();

                    if (distanceToTarget < 1.0 || this.stateTimer <= 0) {
                        // Reached target or timer expired, find new one or become idle
                        if (Math.random() < 0.3) { // 30% chance to go idle
                            this.state = 'idle';
                            this.stateTimer = 2 + Math.random() * 3; // Idle for 2-5 seconds
                            this.velocity.x = 0;
                            this.velocity.z = 0;
                        } else {
                            this.findNewWanderTarget();
                            // Update direction towards new target immediately
                            _direction.copy(this.wanderTarget).sub(this.mesh.position).normalize();
                        }
                    } else {
                        _direction.normalize();
                    }

                    // Only set horizontal velocity if state is still wandering after potential target update
                    if(this.state === 'wandering') {
                        this.velocity.x = _direction.x * this.speed;
                        this.velocity.z = _direction.z * this.speed;
                        // Look in the direction of movement if moving significantly
                        if (_direction.lengthSq() > 0.01) {
                            _lookTarget.copy(this.mesh.position).add(_direction);
                            _lookTarget.y = this.mesh.position.y; // Look horizontally
                            this.mesh.lookAt(_lookTarget);
                        }
                    }


                    // Check for player proximity to flee (Deer/Rabbit) or attack (Wolf)
                    if (this.type === 'Wolf' && distanceToPlayer < this.detectionRange) {
                        this.state = 'attacking';
                        this.userData.isHostile = true;
                    } else if ((this.type === 'Deer' || this.type === 'Rabbit') && distanceToPlayer < 10) {
                        this.state = 'fleeing';
                    }
                    break;

                case 'fleeing':
                    // Run away from the player
                    _fleeDirection.copy(this.mesh.position).sub(player.mesh.position);
                    _fleeDirection.y = 0;
                    if (_fleeDirection.lengthSq() > 0.001) { // Avoid normalize(0,0,0)
                        _fleeDirection.normalize();
                        this.velocity.x = _fleeDirection.x * this.speed * 1.5; // Flee faster
                        this.velocity.z = _fleeDirection.z * this.speed * 1.5;

                        _fleeLookTarget.copy(this.mesh.position).add(_fleeDirection);
                        _fleeLookTarget.y = this.mesh.position.y; // Look horizontally
                        this.mesh.lookAt(_fleeLookTarget);
                    } else {
                        // If player is exactly at animal position, maybe move randomly?
                        this.velocity.x = (Math.random() - 0.5) * this.speed;
                        this.velocity.z = (Math.random() - 0.5) * this.speed;
                    }

                    // If player is far enough away, return to wandering
                    if (distanceToPlayer > 20) {
                        this.findNewWanderTarget();
                        this.state = 'wandering';
                    }
                    break;

                case 'attacking': // Wolf specific
                    this.userData.isHostile = true; // Remain hostile
                    if (distanceToPlayer > this.detectionRange * 1.2) { // Lose interest if player gets far away
                        this.state = 'idle';
                        this.userData.isHostile = false; // No longer hostile when idle
                        this.stateTimer = 1.0 + Math.random();
                        this.velocity.x = 0;
                        this.velocity.z = 0;
                        break;
                    }

                    _attackDirection.copy(player.mesh.position).sub(this.mesh.position);
                    _attackDirection.y = 0;
                    const distanceToAttackTarget = _attackDirection.length();

                    // Look at player
                    _attackLookTarget.copy(player.mesh.position);
                    _attackLookTarget.y = this.mesh.position.y;
                    this.mesh.lookAt(_attackLookTarget);


                    if (distanceToAttackTarget > this.attackRange) {
                        // Move towards player
                        _attackDirection.normalize();
                        this.velocity.x = _attackDirection.x * this.speed;
                        this.velocity.z = _attackDirection.z * this.speed;
                    } else {
                        // Close enough to attack
                        this.velocity.x = 0; // Stop moving to attack
                        this.velocity.z = 0;
                        // Use performance.now() for time, more reliable than potentially missing scene.userData.gameTime
                        const time = performance.now() / 1000;
                        if (time > this.lastAttackTime + this.attackCooldown) {
                            console.log("Wolf attacks!");
                            player.takeDamage(this.attackDamage);
                            // Use player's eventLog if available
                            if (player.eventLog) player.eventLog.addEntry(`The wolf bites you! (-${this.attackDamage} HP)`);
                            this.lastAttackTime = time;
                            // Optional: Add a small lunge animation/effect here
                        }
                    }
                    break;
            }

            // --- Apply gravity and check ground ---
            this.applyGravityAndGroundCheck(deltaTime, collidables);

            // --- Apply final velocity ---
            this.mesh.position.addScaledVector(this.velocity, deltaTime);

            // --- Keep within world bounds ---
            const halfSize = this.worldSize / 2 - 1; // Stay 1 unit from edge
            this.mesh.position.x = THREE.MathUtils.clamp(this.mesh.position.x, -halfSize, halfSize);
            this.mesh.position.z = THREE.MathUtils.clamp(this.mesh.position.z, -halfSize, halfSize);
            // Y position is handled by ground check/clamp

            // --- Animation ---
            this.animate(deltaTime);

            this.updateBoundingBox(); // Update bounds after movement
        }


        /**
         * Applies gravity and performs ground checking/snapping.
         * Modifies velocity.y and potentially mesh.position.y.
         */
        applyGravityAndGroundCheck(deltaTime, collidables) {
            // --- Apply Gravity ---
            // Apply gravity if airborne or moving upwards
            if (!this.isOnGround || this.velocity.y > 0) {
                this.velocity.y += -15 * deltaTime; // Gravity constant (adjust as needed)
            }

            // --- Ground Check (Scheduled) ---
            this.groundCheckTimer -= deltaTime;
            if (this.groundCheckTimer <= 0) {
                this.groundCheckTimer = this.groundCheckInterval; // Reset timer

                // Raycast origin slightly above feet (assuming origin Y=0 is feet level)
                _origin.copy(this.mesh.position).add(new THREE.Vector3(0, 0.1, 0)); // Ray origin 10cm above base
                const raycaster = new THREE.Raycaster(_origin, _rayDirection, 0, 0.5); // Short ray down (0.5m)

                // Check against terrain and other collidables
                const checkAgainst = collidables.filter(obj => obj !== this.mesh && obj.userData.isCollidable);
                const intersects = raycaster.intersectObjects(checkAgainst, true); // Recursive check

                let foundGround = false;
                let groundY = -Infinity;

                if (intersects.length > 0) {
                    // Find highest valid intersection point
                    for (const intersect of intersects) {
                        if (intersect.distance > 0.01) { // Ignore self-intersections
                            groundY = Math.max(groundY, intersect.point.y);
                            foundGround = true;
                        }
                    }
                }

                // --- Process Ground Detection ---
                if (foundGround) {
                    const snapThreshold = 0.2; // How close to ground to snap
                    // If entity base is below or within threshold of ground
                    if (this.mesh.position.y <= groundY + snapThreshold) {
                        this.mesh.position.y = groundY; // Snap to ground
                        // Only zero out downward velocity if landing or resting
                        if(this.velocity.y <= 0) {
                            this.velocity.y = 0;
                        }
                        this.isOnGround = true;
                    } else {
                        // Ground detected, but too far below
                        this.isOnGround = false;
                    }
                } else {
                    // No ground detected
                    this.isOnGround = false;
                }
            }
            // --- End Scheduled Ground Check ---

            // Safety clamp: If despite checks, we end up slightly below ground after velocity application, force snap
            // This check runs every frame, unlike the raycast.
            // We need a reliable groundY reference. Use the last known one? Risky.
            // Alternative: Rely on the physics system push-out? Player physics does that.
            // Let's trust the periodic raycast and snapping for now. If issues persist, add a constant safety clamp here.
            /*
            if (this.isOnGround && this.mesh.position.y < some_reliable_ground_y) {
                this.mesh.position.y = some_reliable_ground_y;
                if (this.velocity.y < 0) this.velocity.y = 0;
            }
            */
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
            // console.log(`${this.name} wandering towards ${this.wanderTarget.x.toFixed(1)}, ${this.wanderTarget.z.toFixed(1)}`);
        }

        animate(deltaTime) {
            const speed = new THREE.Vector3(this.velocity.x, 0, this.velocity.z).length();
            if (speed > 0.1 && this.headMesh) {
                // Head bobbing
                const bobFrequency = 8;
                const bobAmplitude = 0.03; // Reduced amplitude
                const time = performance.now() * 0.001; // Global time
                // Adjust head Y position based on sine wave
                const headBobY = Math.sin(time * bobFrequency) * bobAmplitude;
                // Make sure original Y is defined
                if (this.headMesh.userData.originalY === undefined && this.headMesh.parent) {
                    // If missing, recalculate from current local position
                    // This assumes the headMesh is directly added to this.mesh (the group)
                    this.headMesh.userData.originalY = this.headMesh.position.y;
                }

                // Apply bobbing relative to the original local Y position IF originalY is defined
                if (this.headMesh.userData.originalY !== undefined) {
                    this.headMesh.position.y = this.headMesh.userData.originalY + headBobY;
                }


                // TODO: Could add leg animations similar to player if needed
            } else if (this.headMesh && this.headMesh.userData.originalY !== undefined) {
                // Lerp head back to original position when idle
                this.headMesh.position.y = THREE.MathUtils.lerp(this.headMesh.position.y, this.headMesh.userData.originalY, 10 * deltaTime);
            }
        }

        // Override die for animal specific logic
        die() {
            if(this.isDead) return;
            super.die(); // Calls Entity.die() to set isDead = true, stop velocity
            console.log(`${this.name} died.`);
            this.state = 'dead'; // Set specific state
            this.userData.isCollidable = false;
            this.userData.isInteractable = false;
            this.userData.isHostile = false;

            // Could play death animation, make mesh fade out, or drop loot
            // For simplicity, just stop it and maybe rotate it onto its side after a short delay
            setTimeout(() => {
                if (this.mesh) { // Check if mesh still exists
                    this.mesh.rotation.z = Math.PI / 2 * (Math.random() > 0.5 ? 1 : -1);
                    this.mesh.rotation.x = (Math.random() - 0.5) * 0.5;
                    // Ensure Y position is maintained after rotation if it was grounded
                    this.applyGravityAndGroundCheck(0.1, []); // Force ground check after rotation? Risky.
                }
            }, 100); // Apply rotation shortly after death


            // TODO: Request removal from the main game arrays after a delay
            // This should be handled centrally in Game.js or via an event system
            // Example: this.scene.userData.requestEntityRemoval(this.id, 10000); // Remove after 10 seconds
        }


        // Override updateBoundingBox for animal specific size
        updateBoundingBox() {
            // Use dimensions stored during creation if available
            const height = this.mesh.userData.height || 1.0;
            const width = this.mesh.userData.width || ((this.type === 'Deer' || this.type === 'Wolf') ? 1.2 : 0.5);
            const depth = this.mesh.userData.depth || ((this.type === 'Deer' || this.type === 'Wolf') ? 0.6 : 0.4);

            // Center the box vertically based on group origin (Y=0) and calculated height
            const center = this.mesh.position.clone();
            center.y += height / 2; // Assuming model base is at Y=0 relative to group
            const size = new THREE.Vector3(width, height, depth);
            this.boundingBox.setFromCenterAndSize(center, size);
            // Store on userData for physics system
            this.mesh.userData.boundingBox = this.boundingBox;
        }
    }