// File: /src/entities/animal.ts
// Optimization: Refactored model creation using config objects and helper functions.
// Reduced repetition in setupTypeSpecifics and createModel. Simplified interaction logic slightly.

import * as THREE from 'three';
import { Entity } from './entity';
import { Player } from './player';
import { InteractionResult } from '../types/common';
import { Colors } from '../utils/helpers'; // Use shared colors

type AnimalType = 'Deer' | 'Wolf' | 'Rabbit' | 'Generic';
type AnimalState = 'wandering' | 'fleeing' | 'idle' | 'attacking' | 'dead';

interface AnimalConfig {
    speed: number;
    health: number;
    interaction?: { type: string; prompt: string };
    collidable: boolean;
    hostile?: { detection: number; attackRange: number; damage: number; cooldown: number; };
    body: { w: number; h: number; d: number; color: number; geo?: 'box' | 'sphere' };
    head: { w: number; h: number; d: number; color: number; geo?: 'box' | 'sphere' };
    limbColor: number;
    limbLength?: number;
    limbRadius?: number;
    addParts?: (mesh: THREE.Group, bodyMesh: THREE.Mesh, headMesh: THREE.Object3D, config: AnimalConfig) => void;
}

const _direction = new THREE.Vector3();
const _lookTarget = new THREE.Vector3();
const _fleeDirection = new THREE.Vector3();
const _attackDirection = new THREE.Vector3();
const _origin = new THREE.Vector3();
const _rayDirection = new THREE.Vector3(0, -1, 0);
const _tempVec = new THREE.Vector3();

export class Animal extends Entity {
    public type: AnimalType;
    private worldSize: number;
    private isOnGround: boolean;
    private groundCheckTimer: number;
    private groundCheckInterval: number;

    public state: AnimalState;
    private stateTimer: number;
    private wanderTarget: THREE.Vector3;
    public speed: number;
    private headMesh?: THREE.Object3D;

    // Behavior Config
    private detectionRange?: number;
    private attackRange?: number;
    private attackDamage?: number;
    private attackCooldown?: number;
    private lastAttackTime?: number;

    private static animalConfigs: Record<AnimalType, AnimalConfig> = {
        Deer: {
            speed: 2.0, health: 30, collidable: true,
            interaction: { type: 'pet', prompt: "Press E to Pet Deer" },
            body: { w: 1.2, h: 0.7, d: 0.6, color: Colors.SADDLE_BROWN },
            head: { w: 0.4, h: 0.4, d: 0.5, color: Colors.PEACH_PUFF },
            limbColor: Colors.PEACH_PUFF,
            addParts: (mesh, body, head, cfg) => {
                const antlerMat = new THREE.MeshLambertMaterial({ color: Colors.PEACH_PUFF });
                const antlerGeo = new THREE.ConeGeometry(0.05, 0.5, 4);
                [-0.15, 0.15].forEach((xOffset, i) => {
                    const antler = new THREE.Mesh(antlerGeo, antlerMat);
                    antler.castShadow = true;
                    antler.position.set(xOffset, 0.2, -0.2).add(head.position);
                    antler.rotation.z = i === 0 ? 0.5 : -0.5;
                    mesh.add(antler);
                });
            }
        },
        Wolf: {
            speed: 3.5, health: 50, collidable: true,
            hostile: { detection: 20, attackRange: 2.5, damage: 8, cooldown: 2.0 },
            body: { w: 1.0, h: 0.5, d: 0.4, color: Colors.DIM_GRAY },
            head: { w: 0.35, h: 0.35, d: 0.45, color: 0x808080 }, // Darker Grey
            limbColor: 0x808080,
            addParts: (mesh, body, head, cfg) => {
                const tailGeo = new THREE.BoxGeometry(0.1, 0.4, 0.1);
                const tailMat = new THREE.MeshLambertMaterial({ color: cfg.body.color });
                const tail = new THREE.Mesh(tailGeo, tailMat);
                tail.position.set(0, body.position.y + 0.1, body.position.z - cfg.body.d / 2 - 0.1);
                tail.rotation.x = -0.5; tail.castShadow = true;
                mesh.add(tail);
            }
        },
        Rabbit: {
            speed: 4.0, health: 10, collidable: false,
            body: { w: 0.4, h: 0.3, d: 0.3, color: Colors.BEIGE },
            head: { w: 0.3, h: 0.3, d: 0.3, color: Colors.SNOW_WHITE, geo: 'sphere' },
            limbColor: Colors.SNOW_WHITE, limbLength: 0.3, limbRadius: 0.06,
            addParts: (mesh, body, head, cfg) => {
                const earMat = new THREE.MeshLambertMaterial({ color: cfg.head.color });
                const earGeo = new THREE.BoxGeometry(0.05, 0.3, 0.05);
                [-0.05, 0.05].forEach((xOffset, i) => {
                    const ear = new THREE.Mesh(earGeo, earMat);
                    ear.castShadow = true;
                    ear.position.set(xOffset, 0.15, -0.05).add(head.position);
                    ear.rotation.z = i === 0 ? 0.2 : -0.2;
                    mesh.add(ear);
                });
            }
        },
        Generic: {
            speed: 1.5, health: 20, collidable: true,
            body: { w: 0.8, h: 0.5, d: 0.4, color: Colors.PASTEL_BROWN },
            head: { w: 0.4, h: 0.4, d: 0.4, color: Colors.PEACH_PUFF, geo: 'sphere' },
            limbColor: Colors.PASTEL_BROWN
        }
    };

    constructor(scene: THREE.Scene, position: THREE.Vector3, type: AnimalType, worldSize: number) {
        super(scene, position, type);
        this.userData.isAnimal = true;
        this.type = type;
        this.worldSize = worldSize;
        this.isOnGround = false;
        this.groundCheckTimer = Math.random();
        this.groundCheckInterval = 0.15 + Math.random() * 0.1;
        this.wanderTarget = new THREE.Vector3();
        
        

        this.setupFromConfig();
        this.createModel();
        this.updateBoundingBox();
        this.findNewWanderTarget();
    }

    private setupFromConfig(): void {
        const config = Animal.animalConfigs[this.type];
        if (!config) {
            console.error(`No config found for animal type: ${this.type}`);
            return; // Use defaults from Entity constructor?
        }

        this.speed = config.speed;
        this.health = config.health; this.maxHealth = config.health;
        this.userData.isCollidable = config.collidable;
        this.state = config.hostile ? 'idle' : 'wandering'; // Hostile start idle
        this.stateTimer = 0;

        if (config.interaction) {
            this.userData.isInteractable = true;
            this.userData.interactionType = config.interaction.type;
            this.userData.prompt = config.interaction.prompt;
        }
        if (config.hostile) {
            this.detectionRange = config.hostile.detection;
            this.attackRange = config.hostile.attackRange;
            this.attackDamage = config.hostile.damage;
            this.attackCooldown = config.hostile.cooldown;
            this.lastAttackTime = -Infinity;
            this.userData.isHostile = false; // Start non-hostile
        }
    }

    private createModel(): void {
        const config = Animal.animalConfigs[this.type];
        const bodyCfg = config.body;
        const headCfg = config.head;
        const limbLength = config.limbLength ?? 0.6;
        const limbRadius = config.limbRadius ?? 0.1;

        const bodyGeo = bodyCfg.geo === 'sphere' ? new THREE.SphereGeometry(bodyCfg.w / 2, 8, 6) : new THREE.BoxGeometry(bodyCfg.w, bodyCfg.h, bodyCfg.d);
        const headGeo = headCfg.geo === 'sphere' ? new THREE.SphereGeometry(headCfg.w / 2, 8, 6) : new THREE.BoxGeometry(headCfg.w, headCfg.h, headCfg.d);

        const bodyMat = new THREE.MeshLambertMaterial({ color: bodyCfg.color });
        const headMat = new THREE.MeshLambertMaterial({ color: headCfg.color });
        const limbMat = new THREE.MeshLambertMaterial({ color: config.limbColor });

        // Body
        const bodyMesh = new THREE.Mesh(bodyGeo, bodyMat);
        bodyMesh.position.y = limbLength + bodyCfg.h / 2;
        bodyMesh.castShadow = true; bodyMesh.receiveShadow = true;
        this.mesh.add(bodyMesh);

        // Head
        const headMesh = new THREE.Mesh(headGeo, headMat);
        headMesh.position.set(0, bodyMesh.position.y + bodyCfg.h / 2, bodyCfg.d / 2 + headCfg.d / 2);
        headMesh.castShadow = true;
        this.mesh.add(headMesh);
        this.headMesh = headMesh;
        this.headMesh.userData.originalY = headMesh.position.y;

        // Type-specific parts
        config.addParts?.(this.mesh, bodyMesh, headMesh, config);

        // Legs
        const legPositions = [
            new THREE.Vector3(bodyCfg.w / 2 - limbRadius, bodyMesh.position.y - bodyCfg.h / 2, bodyCfg.d / 2 - limbRadius),
            new THREE.Vector3(-bodyCfg.w / 2 + limbRadius, bodyMesh.position.y - bodyCfg.h / 2, bodyCfg.d / 2 - limbRadius),
            new THREE.Vector3(bodyCfg.w / 2 - limbRadius, bodyMesh.position.y - bodyCfg.h / 2, -bodyCfg.d / 2 + limbRadius),
            new THREE.Vector3(-bodyCfg.w / 2 + limbRadius, bodyMesh.position.y - bodyCfg.h / 2, -bodyCfg.d / 2 + limbRadius)
        ];
        legPositions.forEach(pos => {
            const legGeo = new THREE.CylinderGeometry(limbRadius, limbRadius * 0.9, limbLength, 6);
            legGeo.translate(0, -limbLength / 2, 0);
            const legMesh = new THREE.Mesh(legGeo, limbMat);
            legMesh.position.copy(pos); legMesh.castShadow = true;
            this.mesh.add(legMesh);
        });

        this.userData.height = limbLength + bodyCfg.h + headCfg.h;
        this.userData.width = bodyCfg.w; this.userData.depth = bodyCfg.d;
    }

    public interact(player: Player): InteractionResult | null {
        if (this.isDead || this.type !== 'Deer' || !this.userData.isInteractable) return null;

        console.log("Petting deer...");
        player.eventLog?.addEntry("You gently pet the deer.");
        this.state = 'idle';
        this.stateTimer = 2.0 + Math.random() * 2;
        this.lookAt(player.mesh.position);

        const gotFeather = Math.random() < 0.3;
        return {
            type: gotFeather ? 'reward' : 'message',
            item: gotFeather ? { name: 'feather', amount: 1 } : undefined,
            message: gotFeather ? "The deer seems calm. You found a feather!" : "The deer looks at you curiously."
        };
    }

    override update(deltaTime: number, player: Player, collidables: THREE.Object3D[]): void {
        if (this.isDead || this.state === 'dead') return;

        const distanceToPlayerSq = this.mesh.position.distanceToSquared(player.mesh.position);
        if (this.stateTimer > 0) this.stateTimer -= deltaTime;

        this.updateState(deltaTime, player, distanceToPlayerSq);
        this.applyGravityAndGroundCheck(deltaTime, collidables);
        this.mesh.position.addScaledVector(this.velocity, deltaTime);
        this.clampToWorldBounds();
        this.animate(deltaTime);
        this.updateBoundingBox();
    }

    private updateState(deltaTime: number, player: Player, distanceToPlayerSq: number): void {
        switch (this.state) {
            case 'idle':
                this.velocity.x = 0; this.velocity.z = 0;
                if (this.stateTimer <= 0) {
                    this.findNewWanderTarget();
                    this.state = 'wandering';
                } else {
                    this.checkProximityTriggers(player, distanceToPlayerSq);
                }
                break;

            case 'wandering':
                _direction.copy(this.wanderTarget).sub(this.mesh.position).setY(0);
                const distToTarget = _direction.length();

                if (distToTarget < 1.0 || this.stateTimer <= 0) {
                    if (Math.random() < 0.3) { // Chance to idle
                        this.state = 'idle'; this.stateTimer = 2 + Math.random() * 3;
                        this.velocity.x = 0; this.velocity.z = 0;
                    } else {
                        this.findNewWanderTarget();
                        _direction.copy(this.wanderTarget).sub(this.mesh.position).normalize(); // Update direction now
                    }
                } else {
                    _direction.normalize();
                }

                if (this.state === 'wandering') {
                    this.velocity.x = _direction.x * this.speed;
                    this.velocity.z = _direction.z * this.speed;
                    if (_direction.lengthSq() > 0.01) this.lookAt(this.mesh.position.clone().add(_direction));
                }
                this.checkProximityTriggers(player, distanceToPlayerSq);
                break;

            case 'fleeing':
                _fleeDirection.copy(this.mesh.position).sub(player.mesh.position).setY(0);
                if (_fleeDirection.lengthSq() > 0.001) {
                    _fleeDirection.normalize();
                    const fleeSpeed = this.speed * 1.5;
                    this.velocity.x = _fleeDirection.x * fleeSpeed;
                    this.velocity.z = _fleeDirection.z * fleeSpeed;
                    this.lookAt(this.mesh.position.clone().add(_fleeDirection));
                } else { // Move randomly if player is too close
                    this.velocity.x = (Math.random() - 0.5) * this.speed;
                    this.velocity.z = (Math.random() - 0.5) * this.speed;
                }
                if (distanceToPlayerSq > 400) { // Stop fleeing if player is 20 units away
                    this.findNewWanderTarget(); this.state = 'wandering';
                }
                break;

            case 'attacking':
                if (!this.detectionRange || !this.attackRange || !this.attackDamage || !this.attackCooldown || this.lastAttackTime === undefined) {
                    this.state = 'idle'; break; // Revert if config missing
                }
                this.userData.isHostile = true;
                if (distanceToPlayerSq > (this.detectionRange * 1.2) ** 2) { // Lose interest if too far
                    this.state = 'idle'; this.userData.isHostile = false; this.stateTimer = 1.0 + Math.random();
                    this.velocity.x = 0; this.velocity.z = 0; break;
                }

                _attackDirection.copy(player.mesh.position).sub(this.mesh.position).setY(0);
                this.lookAt(player.mesh.position);

                if (_attackDirection.length() > this.attackRange) { // Move towards player
                    _attackDirection.normalize();
                    this.velocity.x = _attackDirection.x * this.speed;
                    this.velocity.z = _attackDirection.z * this.speed;
                } else { // Attack
                    this.velocity.x = 0; this.velocity.z = 0; // Stop moving
                    const time = performance.now() / 1000;
                    if (time > this.lastAttackTime + this.attackCooldown) {
                        console.log("Wolf attacks!");
                        player.takeDamage(this.attackDamage);
                        player.eventLog?.addEntry(`The wolf bites you! (-${this.attackDamage} HP)`);
                        this.lastAttackTime = time;
                    }
                }
                break;
        }
    }

    private checkProximityTriggers(player: Player, distanceSq: number): void {
        if (this.type === 'Wolf' && this.detectionRange && distanceSq < this.detectionRange ** 2) {
            this.state = 'attacking'; this.userData.isHostile = true;
            player.eventLog?.addEntry("A wolf growls nearby!");
        } else if ((this.type === 'Deer' || this.type === 'Rabbit') && distanceSq < 100) { // 10 units
            this.state = 'fleeing';
        }
    }

    private applyGravityAndGroundCheck(deltaTime: number, collidables: THREE.Object3D[]): void {
        if (!this.isOnGround || this.velocity.y > 0) this.velocity.y -= 15 * deltaTime;

        this.groundCheckTimer -= deltaTime;
        if (this.groundCheckTimer <= 0) {
            this.groundCheckTimer = this.groundCheckInterval;
            _origin.copy(this.mesh.position).y += 0.1;
            const raycaster = new THREE.Raycaster(_origin, _rayDirection, 0, 0.5);
            const checkAgainst = collidables.filter(obj => obj !== this.mesh && obj?.userData?.isCollidable);
            const intersects = raycaster.intersectObjects(checkAgainst, true);

            let groundY = -Infinity;
            const foundGround = intersects.some(intersect => {
                if (intersect.distance > 0.01) {
                    groundY = Math.max(groundY, intersect.point.y);
                    return true;
                }
                return false;
            });

            if (foundGround && this.mesh.position.y <= groundY + 0.2) {
                if (!this.isOnGround) { // Landed
                    this.mesh.position.y = groundY;
                    if (this.velocity.y < 0) this.velocity.y = 0;
                }
                this.isOnGround = true;
            } else {
                this.isOnGround = false;
            }
        }
        if (this.isOnGround && this.velocity.y < 0) this.velocity.y = 0;
    }

    private clampToWorldBounds(): void {
        const limit = this.worldSize / 2 - 1;
        this.mesh.position.x = THREE.MathUtils.clamp(this.mesh.position.x, -limit, limit);
        this.mesh.position.z = THREE.MathUtils.clamp(this.mesh.position.z, -limit, limit);
    }

    private findNewWanderTarget(): void {
        const wanderDistance = 10 + Math.random() * 15;
        const angle = Math.random() * Math.PI * 2;
        _tempVec.set(Math.cos(angle) * wanderDistance, 0, Math.sin(angle) * wanderDistance).add(this.mesh.position);
        const limit = this.worldSize / 2 - 5;
        this.wanderTarget.set(
            THREE.MathUtils.clamp(_tempVec.x, -limit, limit),
            this.mesh.position.y,
            THREE.MathUtils.clamp(_tempVec.z, -limit, limit)
        );
        this.stateTimer = 5 + Math.random() * 5;
    }

    private animate(deltaTime: number): void {
        if (!this.headMesh) return;
        const horizontalSpeed = Math.sqrt(this.velocity.x ** 2 + this.velocity.z ** 2);
        const originalY = this.headMesh.userData.originalY ?? this.headMesh.position.y;

        if (horizontalSpeed > 0.1 && this.isOnGround) {
            const bobFrequency = 8; const bobAmplitude = 0.03;
            const time = performance.now() * 0.001;
            this.headMesh.position.y = originalY + Math.sin(time * bobFrequency) * bobAmplitude;
        } else {
            // Lerp head back smoothly
            this.headMesh.position.y = THREE.MathUtils.lerp(this.headMesh.position.y, originalY, 10 * deltaTime);
        }
    }

    override die(): void {
        if (this.isDead) return;
        super.die();
        console.log(`${this.name} died.`);
        this.state = 'dead'; this.userData.isHostile = false;
        setTimeout(() => {
            if (this.mesh) { // Check existence
                this.mesh.rotation.z = Math.PI / 2 * (Math.random() > 0.5 ? 1 : -1);
                this.mesh.rotation.x = (Math.random() - 0.5) * 0.5;
            }
        }, 200);
    }

    override updateBoundingBox(): void {
        if (!this.mesh) return;
        const height = this.userData.height ?? 1.0;
        const width = this.userData.width ?? 0.8;
        const depth = this.userData.depth ?? 0.6;
        const center = this.mesh.position.clone().add(new THREE.Vector3(0, height / 2, 0));
        this.boundingBox.setFromCenterAndSize(center, new THREE.Vector3(width, height, depth));
        this.userData.boundingBox = this.boundingBox;
    }
}