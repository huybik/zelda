import * as THREE from 'three';
import { Entity } from './entity';
import { Player } from './player';
import { InteractionResult } from '../types/common';

type AnimalType = 'Deer' | 'Wolf' | 'Rabbit' | 'Generic';
type AnimalState = 'wandering' | 'fleeing' | 'idle' | 'attacking' | 'dead';

// Reusable vectors for calculations
const _direction = new THREE.Vector3();
const _lookTarget = new THREE.Vector3();
const _fleeDirection = new THREE.Vector3();
const _attackDirection = new THREE.Vector3();
const _origin = new THREE.Vector3();
const _rayDirection = new THREE.Vector3(0, -1, 0);
const _tempVec = new THREE.Vector3(); // General purpose temporary vector

export class Animal extends Entity {
    public type: AnimalType;
    private worldSize: number;
    private isOnGround: boolean;
    private groundCheckTimer: number;
    private groundCheckInterval: number;

    // Behavior
    public state: AnimalState;
    private stateTimer: number;
    private wanderTarget: THREE.Vector3;
    public speed: number;
    private headMesh?: THREE.Mesh | THREE.Object3D; // Reference for animation/head position

    // Type-specific properties (example for Wolf)
    private detectionRange?: number;
    private attackRange?: number;
    private attackDamage?: number;
    private attackCooldown?: number;
    private lastAttackTime?: number;

    constructor(scene: THREE.Scene, position: THREE.Vector3, type: AnimalType, worldSize: number) {
        super(scene, position, type); // Use type as name
        this.userData.isAnimal = true;
        this.userData.isCollidable = true;
        this.type = type;
        this.worldSize = worldSize;
        this.isOnGround = false;
        this.groundCheckTimer = Math.random(); // Stagger checks
        this.groundCheckInterval = 0.15 + Math.random() * 0.1;

        this.state = 'wandering';
        this.stateTimer = 0;
        this.wanderTarget = new THREE.Vector3();
        this.speed = 1.5; // Base speed

        this.setupTypeSpecifics();
        this.createModel();
        this.updateBoundingBox(); // Initial calculation
        this.findNewWanderTarget(); // Start wandering
    }

    private setupTypeSpecifics(): void {
        switch (this.type) {
            case 'Deer':
                this.userData.isInteractable = true;
                this.userData.interactionType = 'pet';
                this.userData.prompt = "Press E to Pet Deer";
                this.speed = 2.0;
                this.health = 30; this.maxHealth = 30;
                break;
            case 'Wolf':
                this.userData.isInteractable = false;
                this.speed = 3.5;
                this.health = 50; this.maxHealth = 50;
                this.state = 'idle'; // Wolves might start idle
                this.detectionRange = 20;
                this.attackRange = 2.5;
                this.attackDamage = 8;
                this.attackCooldown = 2.0; // Seconds
                this.lastAttackTime = -Infinity;
                this.userData.isHostile = false; // Start non-hostile
                break;
            case 'Rabbit':
                this.userData.isInteractable = false;
                this.userData.isCollidable = false; // Rabbits might not need collision
                this.speed = 4.0;
                this.health = 10; this.maxHealth = 10;
                this.state = 'wandering';
                break;
            default: // Generic
                this.speed = 1.5;
                this.health = 20; this.maxHealth = 20;
                break;
        }
    }

    private createModel(): void {
        let bodyColor = 0xCD853F; // Peru Brown (default)
        let headColor = 0xD2B48C; // Tan
        let limbColor = bodyColor;

        let bodyGeo: THREE.BufferGeometry;
        let headGeo: THREE.BufferGeometry;
        let bodyDimensions = { w: 0.8, h: 0.5, d: 0.4 };
        let headDimensions = { w: 0.4, h: 0.4, d: 0.4 };
        const limbRadius = 0.1;
        const limbLength = 0.6;

        switch (this.type) {
            case 'Deer':
                bodyColor = 0xA0522D; headColor = 0xBC8F8F; limbColor = headColor;
                bodyDimensions = { w: 1.2, h: 0.7, d: 0.6 }; headDimensions = { w: 0.4, h: 0.4, d: 0.5 };
                bodyGeo = new THREE.BoxGeometry(bodyDimensions.w, bodyDimensions.h, bodyDimensions.d);
                headGeo = new THREE.BoxGeometry(headDimensions.w, headDimensions.h, headDimensions.d);
                break;
            case 'Wolf':
                bodyColor = 0x696969; headColor = 0x808080; limbColor = headColor;
                bodyDimensions = { w: 1.0, h: 0.5, d: 0.4 }; headDimensions = { w: 0.35, h: 0.35, d: 0.45 };
                bodyGeo = new THREE.BoxGeometry(bodyDimensions.w, bodyDimensions.h, bodyDimensions.d);
                headGeo = new THREE.BoxGeometry(headDimensions.w, headDimensions.h, headDimensions.d);
                break;
            case 'Rabbit':
                bodyColor = 0xF5F5DC; headColor = 0xFFFAFA; limbColor = headColor;
                bodyDimensions = { w: 0.4, h: 0.3, d: 0.3 }; headDimensions = { w: 0.3, h: 0.3, d: 0.3 }; // Sphere approx
                bodyGeo = new THREE.BoxGeometry(bodyDimensions.w, bodyDimensions.h, bodyDimensions.d);
                headGeo = new THREE.SphereGeometry(headDimensions.w / 2, 8, 6);
                break;
            default:
                bodyGeo = new THREE.BoxGeometry(bodyDimensions.w, bodyDimensions.h, bodyDimensions.d);
                headGeo = new THREE.SphereGeometry(headDimensions.w / 2, 8, 8);
                break;
        }

        const bodyMat = new THREE.MeshLambertMaterial({ color: bodyColor });
        const headMat = new THREE.MeshLambertMaterial({ color: headColor });
        const limbMat = new THREE.MeshLambertMaterial({ color: limbColor });

        // Body (position base at leg height)
        const bodyMesh = new THREE.Mesh(bodyGeo, bodyMat);
        bodyMesh.position.y = limbLength + bodyDimensions.h / 2;
        bodyMesh.castShadow = true;
        bodyMesh.receiveShadow = true;
        this.mesh.add(bodyMesh);

        // Head (position relative to body)
        const headMesh = new THREE.Mesh(headGeo, headMat);
        const headY = bodyMesh.position.y + bodyDimensions.h / 2;
        const headZ = bodyDimensions.d / 2 + headDimensions.d / 2;
        headMesh.position.set(0, headY, headZ);
        headMesh.castShadow = true;
        this.mesh.add(headMesh);
        this.headMesh = headMesh; // Store reference
        this.headMesh.userData.originalY = headMesh.position.y; // Store original local Y

        // Type-specific additions (after body/head created)
        this.addTypeSpecificParts(bodyMesh, headMesh, bodyDimensions, headDimensions, headColor);

        // Legs
        const legOffsetX = bodyDimensions.w / 2 - limbRadius;
        const legOffsetZ = bodyDimensions.d / 2 - limbRadius;
        const hipY = bodyMesh.position.y - bodyDimensions.h / 2; // Hip height

        const legPositions = [
            new THREE.Vector3(legOffsetX, hipY, legOffsetZ),  // Front Right Hip
            new THREE.Vector3(-legOffsetX, hipY, legOffsetZ), // Front Left Hip
            new THREE.Vector3(legOffsetX, hipY, -legOffsetZ), // Back Right Hip
            new THREE.Vector3(-legOffsetX, hipY, -legOffsetZ) // Back Left Hip
        ];

        legPositions.forEach(pos => {
            const legGeo = new THREE.CylinderGeometry(limbRadius, limbRadius * 0.9, limbLength, 6);
            legGeo.translate(0, -limbLength / 2, 0); // Pivot at top
            const legMesh = new THREE.Mesh(legGeo, limbMat);
            legMesh.position.copy(pos);
            legMesh.castShadow = true;
            this.mesh.add(legMesh);
        });

        // Store dimensions for bounding box
        this.userData.height = limbLength + bodyDimensions.h + headDimensions.h;
        this.userData.width = bodyDimensions.w;
        this.userData.depth = bodyDimensions.d;
    }

    private addTypeSpecificParts(
        bodyMesh: THREE.Mesh,
        headMesh: THREE.Mesh | THREE.Object3D,
        bodyDim: { w: number, h: number, d: number },
        headDim: { w: number, h: number, d: number },
        headColor: number
    ): void {
        const headPos = headMesh.position;

        if (this.type === 'Deer') {
            const antlerMat = new THREE.MeshLambertMaterial({ color: 0xD2B48C });
            const antlerGeo = new THREE.ConeGeometry(0.05, 0.5, 4);
            const addAntler = (xOffset: number, zRot: number) => {
                const antler = new THREE.Mesh(antlerGeo, antlerMat);
                antler.castShadow = true;
                // Position relative to head mesh's local position
                antler.position.set(xOffset, 0.2, -0.2).add(headPos);
                antler.rotation.z = zRot;
                this.mesh.add(antler);
            };
            addAntler(-0.15, 0.5); // Left
            addAntler(0.15, -0.5); // Right
        } else if (this.type === 'Rabbit') {
            const earMat = new THREE.MeshLambertMaterial({ color: headColor });
            const earGeo = new THREE.BoxGeometry(0.05, 0.3, 0.05);
             const addEar = (xOffset: number, zRot: number) => {
                const ear = new THREE.Mesh(earGeo, earMat);
                ear.castShadow = true;
                ear.position.set(xOffset, 0.15, -0.05).add(headPos);
                ear.rotation.z = zRot;
                this.mesh.add(ear);
             };
             addEar(-0.05, 0.2); // Left
             addEar(0.05, -0.2); // Right
        } else if (this.type === 'Wolf') {
            // Add a tail (small box)
            const tailGeo = new THREE.BoxGeometry(0.1, 0.4, 0.1);
            const tailMat = new THREE.MeshLambertMaterial({ color: bodyMesh.material.color });
            const tailMesh = new THREE.Mesh(tailGeo, tailMat);
            // Attach relative to body's back-center
            tailMesh.position.set(0, bodyMesh.position.y + 0.1, bodyMesh.position.z - bodyDim.d / 2 - 0.1);
            tailMesh.rotation.x = -0.5;
            tailMesh.castShadow = true;
            this.mesh.add(tailMesh);
        }
    }


    public interact(player: Player): InteractionResult | null {
        if (this.isDead) return null;

        if (this.type === 'Deer' && this.userData.isInteractable) {
            console.log("Petting deer...");
            player.eventLog?.addEntry("You gently pet the deer.");

            this.state = 'idle'; // Stop wandering briefly
            this.stateTimer = 2.0 + Math.random() * 2; // Stay idle for 2-4 seconds
            this.lookAt(player.mesh.position); // Look at player

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


    override update(deltaTime: number, player: Player, collidables: THREE.Object3D[]): void {
        if (this.isDead || this.state === 'dead') return;

        const distanceToPlayerSq = this.mesh.position.distanceToSquared(player.mesh.position);
        if (this.stateTimer > 0) this.stateTimer -= deltaTime;

        // --- State Machine ---
        this.updateState(deltaTime, player, distanceToPlayerSq);

        // --- Physics & Movement ---
        this.applyGravityAndGroundCheck(deltaTime, collidables);
        this.mesh.position.addScaledVector(this.velocity, deltaTime);
        this.clampToWorldBounds();

        // --- Animation & BBox ---
        this.animate(deltaTime);
        this.updateBoundingBox(); // Update bounds after movement
    }

    private updateState(deltaTime: number, player: Player, distanceToPlayerSq: number): void {
        switch (this.state) {
            case 'idle':
                this.velocity.set(0, this.velocity.y, 0); // Keep Y velocity for gravity
                if (this.stateTimer <= 0) {
                    this.findNewWanderTarget();
                    this.state = 'wandering';
                } else {
                    this.checkProximityTriggers(player, distanceToPlayerSq);
                }
                break;

            case 'wandering':
                _direction.copy(this.wanderTarget).sub(this.mesh.position);
                _direction.y = 0; // Ignore height difference for movement direction
                const distanceToTarget = _direction.length();

                if (distanceToTarget < 1.0 || this.stateTimer <= 0) {
                    if (Math.random() < 0.3) { // 30% chance to go idle
                        this.state = 'idle';
                        this.stateTimer = 2 + Math.random() * 3;
                        this.velocity.x = 0; this.velocity.z = 0;
                    } else {
                        this.findNewWanderTarget();
                        // Update direction immediately
                        _direction.copy(this.wanderTarget).sub(this.mesh.position).normalize();
                    }
                } else {
                    _direction.normalize();
                }

                // Apply velocity only if still wandering
                if (this.state === 'wandering') {
                    this.velocity.x = _direction.x * this.speed;
                    this.velocity.z = _direction.z * this.speed;
                    // Look in direction of movement
                    if (_direction.lengthSq() > 0.01) {
                        this.lookAt(this.mesh.position.clone().add(_direction));
                    }
                }

                this.checkProximityTriggers(player, distanceToPlayerSq);
                break;

            case 'fleeing':
                _fleeDirection.copy(this.mesh.position).sub(player.mesh.position);
                _fleeDirection.y = 0;
                if (_fleeDirection.lengthSq() > 0.001) {
                    _fleeDirection.normalize();
                    const fleeSpeed = this.speed * 1.5;
                    this.velocity.x = _fleeDirection.x * fleeSpeed;
                    this.velocity.z = _fleeDirection.z * fleeSpeed;
                    this.lookAt(this.mesh.position.clone().add(_fleeDirection));
                } else {
                    // If player is exactly at animal pos, move randomly
                    this.velocity.x = (Math.random() - 0.5) * this.speed;
                    this.velocity.z = (Math.random() - 0.5) * this.speed;
                }

                // Stop fleeing if player is far away
                if (distanceToPlayerSq > 20 * 20) { // Use squared distance
                    this.findNewWanderTarget();
                    this.state = 'wandering';
                }
                break;

            case 'attacking': // Wolf specific
                if (!this.detectionRange || !this.attackRange || !this.attackDamage || !this.attackCooldown || typeof this.lastAttackTime === 'undefined') {
                    this.state = 'idle'; // Revert if properties missing
                    break;
                }

                this.userData.isHostile = true; // Remain hostile

                // Lose interest if player gets too far
                if (distanceToPlayerSq > (this.detectionRange * 1.2) ** 2) {
                    this.state = 'idle';
                    this.userData.isHostile = false;
                    this.stateTimer = 1.0 + Math.random();
                    this.velocity.x = 0; this.velocity.z = 0;
                    break;
                }

                _attackDirection.copy(player.mesh.position).sub(this.mesh.position);
                _attackDirection.y = 0;
                const distanceToAttackTarget = _attackDirection.length();

                this.lookAt(player.mesh.position); // Look at player

                if (distanceToAttackTarget > this.attackRange) {
                    // Move towards player
                    _attackDirection.normalize();
                    this.velocity.x = _attackDirection.x * this.speed;
                    this.velocity.z = _attackDirection.z * this.speed;
                } else {
                    // Close enough to attack
                    this.velocity.x = 0; this.velocity.z = 0; // Stop moving
                    const time = performance.now() / 1000;
                    if (time > this.lastAttackTime + this.attackCooldown) {
                        console.log("Wolf attacks!");
                        player.takeDamage(this.attackDamage);
                        player.eventLog?.addEntry(`The wolf bites you! (-${this.attackDamage} HP)`);
                        this.lastAttackTime = time;
                        // TODO: Attack animation/effect
                    }
                }
                break;
        }
    }

     // Checks proximity to player to potentially change state (flee/attack)
    private checkProximityTriggers(player: Player, distanceSq: number): void {
        if (this.type === 'Wolf' && this.detectionRange && distanceSq < this.detectionRange ** 2) {
             this.state = 'attacking';
             this.userData.isHostile = true;
             player.eventLog?.addEntry("A wolf growls nearby!");
        } else if ((this.type === 'Deer' || this.type === 'Rabbit') && distanceSq < 10 * 10) {
             this.state = 'fleeing';
        }
    }

    private applyGravityAndGroundCheck(deltaTime: number, collidables: THREE.Object3D[]): void {
        // Apply Gravity
        if (!this.isOnGround || this.velocity.y > 0) {
            this.velocity.y += -15 * deltaTime; // Gravity constant
        }

        // Scheduled Ground Check
        this.groundCheckTimer -= deltaTime;
        if (this.groundCheckTimer <= 0) {
            this.groundCheckTimer = this.groundCheckInterval; // Reset timer

            _origin.copy(this.mesh.position).y += 0.1; // Ray origin slightly above feet
            const raycaster = new THREE.Raycaster(_origin, _rayDirection, 0, 0.5); // Short ray down
            const checkAgainst = collidables.filter(obj => obj !== this.mesh && obj?.userData?.isCollidable);
            const intersects = raycaster.intersectObjects(checkAgainst, true);

            let foundGround = false;
            let groundY = -Infinity;

            if (intersects.length > 0) {
                for (const intersect of intersects) {
                    if (intersect.distance > 0.01) { // Ignore self-intersections
                        groundY = Math.max(groundY, intersect.point.y);
                        foundGround = true;
                    }
                }
            }

            // Process Ground Detection
            const snapThreshold = 0.2;
            if (foundGround && this.mesh.position.y <= groundY + snapThreshold) {
                if (!this.isOnGround) { // Just landed
                     this.mesh.position.y = groundY; // Snap to ground
                     if (this.velocity.y < 0) this.velocity.y = 0; // Stop downward velocity on land
                }
                this.isOnGround = true;
            } else {
                this.isOnGround = false; // In air or too high above ground
            }
        }

        // Ensure velocity is zeroed if on ground and not moving up
        if (this.isOnGround && this.velocity.y < 0) {
             this.velocity.y = 0;
        }
    }


    private clampToWorldBounds(): void {
        const halfSize = this.worldSize / 2 - 1; // Stay 1 unit from edge
        this.mesh.position.x = THREE.MathUtils.clamp(this.mesh.position.x, -halfSize, halfSize);
        this.mesh.position.z = THREE.MathUtils.clamp(this.mesh.position.z, -halfSize, halfSize);
        // Y position handled by ground check/gravity
    }

    private findNewWanderTarget(): void {
        const wanderDistance = 10 + Math.random() * 15; // 10m to 25m
        const angle = Math.random() * Math.PI * 2;
        _tempVec.set(
            Math.cos(angle) * wanderDistance,
            0,
            Math.sin(angle) * wanderDistance
        ).add(this.mesh.position);

        // Clamp target within world bounds
        const halfSize = this.worldSize / 2 - 5; // Keep slightly away from edge
        this.wanderTarget.x = THREE.MathUtils.clamp(_tempVec.x, -halfSize, halfSize);
        this.wanderTarget.z = THREE.MathUtils.clamp(_tempVec.z, -halfSize, halfSize);
        this.wanderTarget.y = this.mesh.position.y; // Keep target at current height level

        this.stateTimer = 5 + Math.random() * 5; // Wander for 5-10 seconds
    }

    private animate(deltaTime: number): void {
        if (!this.headMesh) return;
        const horizontalSpeed = Math.sqrt(this.velocity.x ** 2 + this.velocity.z ** 2);

        if (horizontalSpeed > 0.1 && this.isOnGround) {
            // Head bobbing
            const bobFrequency = 8;
            const bobAmplitude = 0.03;
            const time = performance.now() * 0.001;
            const headBobY = Math.sin(time * bobFrequency) * bobAmplitude;
            const originalY = this.headMesh.userData.originalY ?? this.headMesh.position.y; // Fallback
            this.headMesh.position.y = originalY + headBobY;
            // TODO: Leg animations
        } else if (this.headMesh.userData.originalY !== undefined) {
            // Lerp head back to original position when idle
            const originalY = this.headMesh.userData.originalY;
            this.headMesh.position.y = THREE.MathUtils.lerp(this.headMesh.position.y, originalY, 10 * deltaTime);
        }
    }

    override die(): void {
        if (this.isDead) return;
        super.die(); // Calls Entity.die()
        console.log(`${this.name} died.`);
        this.state = 'dead'; // Set specific state
        this.userData.isHostile = false; // Ensure flags are cleared

        // Simple death effect: rotate onto side after a delay
        setTimeout(() => {
            if (this.mesh) { // Check if mesh still exists
                this.mesh.rotation.z = Math.PI / 2 * (Math.random() > 0.5 ? 1 : -1);
                this.mesh.rotation.x = (Math.random() - 0.5) * 0.5;
                // Try to re-snap to ground after rotation (might be glitchy)
                // this.applyGravityAndGroundCheck(0.1, []);
            }
        }, 200);

        // TODO: Request removal from game arrays (handled by Game class or EntityManager)
    }

    override updateBoundingBox(): void {
        if (!this.mesh) return;
        const height = this.userData.height ?? 1.0;
        const width = this.userData.width ?? 0.8;
        const depth = this.userData.depth ?? 0.6;

        // Center the box vertically based on group origin (Y=0) and calculated height
        const center = this.mesh.position.clone().add(new THREE.Vector3(0, height / 2, 0));
        const size = new THREE.Vector3(width, height, depth);
        this.boundingBox.setFromCenterAndSize(center, size);
        this.userData.boundingBox = this.boundingBox;
    }
}