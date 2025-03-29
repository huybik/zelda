// File: /src/entities/npc.ts

import * as THREE from 'three';
import { Entity } from './entity';
import { Player } from './player';
import { QuestLog } from '../systems/quest'; // Removed QuestStatus
import { Inventory } from '../systems/inventory';
import { QuestData, InteractionResult } from '../types/common';
import { smoothQuaternionSlerp } from '../utils/helpers';

const _playerPos = new THREE.Vector3();
const _targetLookAt = new THREE.Vector3();
const _targetDirection = new THREE.Vector3();
const _targetQuaternion = new THREE.Quaternion();
const _tempMatrix = new THREE.Matrix4();

type AccessoryType = 'none' | 'straw_hat' | 'cap';
type DialogueState = 'idle' | 'greeting' | 'quest_offer' | 'quest_incomplete' | 'quest_complete' | 'post_quest' | 'available';

export class NPC extends Entity {
    public accessoryType: AccessoryType;
    public questLog: QuestLog | null;
    public inventory: Inventory | null; // Player inventory reference
    public assignedQuestId: string | null;
    private assignedQuestData: QuestData | null;

    public dialogueState: DialogueState;
    public interactionPrompt: string;

    private idleTimer: number;
    private idleLookTarget: THREE.Vector3;
    private baseQuaternion: THREE.Quaternion;
    private baseForward: THREE.Vector3;

    constructor(
        scene: THREE.Scene, position: THREE.Vector3, name: string,
        accessoryType: AccessoryType = 'none', questLog: QuestLog | null, inventory: Inventory | null
    ) {
        super(scene, position, name);
        this.userData.isNPC = true; this.userData.isCollidable = true; this.userData.isInteractable = true;
        this.userData.interactionType = 'talk'; this.interactionPrompt = `Press E to talk to ${this.name}`;
        this.userData.prompt = this.interactionPrompt;

        this.accessoryType = accessoryType; this.questLog = questLog; this.inventory = inventory;
        this.assignedQuestId = null; this.assignedQuestData = null; this.dialogueState = 'idle';

        this.createModel();

        this.idleTimer = 2 + Math.random() * 3;
        this.idleLookTarget = new THREE.Vector3();
        if (this.mesh) { // FIX: Check mesh exists
            this.mesh.updateMatrixWorld();
            this.baseQuaternion = this.mesh.quaternion.clone();
            this.baseForward = new THREE.Vector3(0, 0, 1).applyQuaternion(this.baseQuaternion);
            this.idleLookTarget.copy(this.mesh.position).addScaledVector(this.baseForward, 5); // Initial look forward
            this.updateBoundingBox();
        } else {
            // Handle case where mesh creation failed (though constructor should ensure it)
            this.baseQuaternion = new THREE.Quaternion();
            this.baseForward = new THREE.Vector3(0, 0, 1);
        }
    }

    private createModel(): void {
        if (!this.mesh) return; // Should not happen, but safe check

        const bodyMat = new THREE.MeshLambertMaterial({ color: Math.random() * 0xffffff });
        const headMat = new THREE.MeshLambertMaterial({ color: 0xffdab9 }); // PeachPuff
        const bodyHeight = 1.1, headRadius = 0.3;

        const bodyGeo = new THREE.BoxGeometry(0.7, bodyHeight, 0.4);
        const bodyMesh = new THREE.Mesh(bodyGeo, bodyMat);
        bodyMesh.position.y = bodyHeight / 2;
        bodyMesh.castShadow = true; bodyMesh.receiveShadow = true;
        this.mesh.add(bodyMesh);

        const headGeo = new THREE.SphereGeometry(headRadius, 16, 16);
        const headMesh = new THREE.Mesh(headGeo, headMat);
        headMesh.position.y = bodyHeight + headRadius;
        headMesh.castShadow = true;
        this.mesh.add(headMesh);

        this.addAccessory(headMesh.position);
        this.userData.height = bodyHeight + headRadius * 2;
    }

    private addAccessory(headPosition: THREE.Vector3): void {
        if (!this.mesh) return; // Check mesh exists

        let accessory: THREE.Object3D | null = null;
        let color = 0x8B4513; // Brown default

        switch (this.accessoryType) {
            case 'straw_hat':
                color = 0xFFEC8B; // Light Yellow
                const brimGeo = new THREE.CylinderGeometry(0.6, 0.7, 0.1, 16);
                const topGeo = new THREE.CylinderGeometry(0.4, 0.3, 0.3, 16);
                accessory = new THREE.Group();
                accessory.add(new THREE.Mesh(brimGeo, new THREE.MeshLambertMaterial({color})));
                const topMesh = new THREE.Mesh(topGeo, new THREE.MeshLambertMaterial({color}));
                topMesh.position.y = 0.15; accessory.add(topMesh);
                accessory.position.set(headPosition.x, headPosition.y + 0.25, headPosition.z);
                break;
            case 'cap':
                color = 0x4682B4; // Steel Blue
                const capGeo = new THREE.SphereGeometry(0.35, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2);
                accessory = new THREE.Mesh(capGeo, new THREE.MeshLambertMaterial({color}));
                accessory.position.set(headPosition.x, headPosition.y + 0.1, headPosition.z);
                accessory.rotation.x = -0.1;
                break;
        }
        if (accessory) {
            accessory.traverse(child => { if (child instanceof THREE.Mesh) child.castShadow = true; });
            this.mesh.add(accessory);
        }
    }

    public assignQuest(questData: QuestData): void {
        if (this.assignedQuestId && this.questLog?.getQuestStatus(this.assignedQuestId) !== 'completed') {
            console.warn(`${this.name} already has active/available quest ${this.assignedQuestId}.`);
            return;
        }
        this.assignedQuestId = questData.id;
        this.assignedQuestData = questData;
        this.questLog?.makeQuestAvailable(questData.id);
        console.log(`${this.name} will offer quest: ${questData.id}`);
    }

    public interact(player: Player): InteractionResult | null {
        if (!this.mesh) return null; // Check mesh exists

        console.log(`Interacting with ${this.name}`);
        // FIX: Check player mesh exists
        if (player.mesh) {
            _playerPos.copy(player.mesh.position).setY(this.mesh.position.y);
            this.mesh.lookAt(_playerPos);
            this.idleLookTarget.copy(_playerPos);
        }
        this.idleTimer = 3.0; // Look towards player general direction even if mesh missing

        let dialogue: string = `Hello there, ${player.name}.`;
        let interactionResultType: InteractionResult['type'] = 'dialogue';

        if (this.assignedQuestId && this.questLog && this.inventory) {
            const questStatus = this.questLog.getQuestStatus(this.assignedQuestId);
            const questData = this.questLog.getQuestData(this.assignedQuestId) ?? this.assignedQuestData;

            if (!questData) {
                console.error(`Quest data missing for ${this.assignedQuestId}`);
                dialogue = "I seem to have forgotten what I needed..."; this.dialogueState = 'idle';
                this.assignedQuestId = null; this.assignedQuestData = null; // Clear broken quest
            } else if (questStatus === 'available') {
                this.dialogueState = 'quest_offer';
                dialogue = `${questData.description} Will you help me?`;
                if (this.questLog.acceptQuest(this.assignedQuestId)) {
                    dialogue = `Thank you! ${this.questLog.getQuestProgress(this.assignedQuestId, this.inventory)}`;
                    player.eventLog?.addEntry(`Quest accepted: ${questData.title}`);
                    this.dialogueState = 'quest_incomplete';
                } else dialogue = "Hmm, let me know if you change your mind.";
            } else if (questStatus === 'active') {
                if (this.questLog.checkQuestCompletion(this.assignedQuestId, this.inventory)) {
                    this.dialogueState = 'quest_complete';
                    if (this.questLog.completeQuest(this.assignedQuestId, this.inventory)) {
                        dialogue = `Ah, you've done it! Thank you! Here is your reward.`;
                        player.eventLog?.addEntry(`Quest completed: ${questData.title}`);
                    } else { dialogue = `Something went wrong turning that in... try again?`; this.dialogueState = 'quest_incomplete'; }
                } else { dialogue = `Have you completed the task yet? ${this.questLog.getQuestProgress(this.assignedQuestId, this.inventory)}`; this.dialogueState = 'quest_incomplete'; }
            } else if (questStatus === 'completed') { dialogue = "Thanks again for your help!"; this.dialogueState = 'post_quest'; }
        } else { dialogue = this.getRandomIdleDialogue(); this.dialogueState = 'greeting'; }

        console.log(`${this.name}: ${dialogue}`);
        player.eventLog?.addEntry(`${this.name}: "${dialogue}"`);
        return { type: interactionResultType, text: dialogue, state: this.dialogueState };
    }

    private getRandomIdleDialogue(): string {
        const dialogues = ["Nice weather.", "Be careful.", "Seen any trouble?", "Secrets in the wild.", "Welcome.", "Need something?", "Don't wander too far."];
        return dialogues[Math.floor(Math.random() * dialogues.length)];
    }

    // FIX: Update signature to match base
    override update(deltaTime: number, _player?: Entity | undefined, _collidables?: THREE.Object3D[]): void {
        if (!this.mesh) return; // Check mesh exists

        this.idleTimer -= deltaTime;
        if (this.idleTimer <= 0) {
            this.idleTimer = 3 + Math.random() * 4;

            // FIX: Check if _player is Player and has mesh
            if (_player instanceof Player && _player.mesh) {
                const player = _player; // Now we know it's a Player
                const distanceToPlayerSq = this.mesh.position.distanceToSquared(player.mesh.position);

                if (distanceToPlayerSq < 225 && Math.random() < 0.3) { // Player nearby (15*15)
                    _targetLookAt.copy(player.mesh.position).setY(this.mesh.position.y);
                    this.idleLookTarget.copy(_targetLookAt);
                } else { // Look random direction or forward
                    const randomAngleOffset = (Math.random() - 0.5) * Math.PI * 1.5;
                    const direction = (Math.random() < 0.5) ? this.baseForward.clone().applyAxisAngle(THREE.Object3D.DEFAULT_UP, randomAngleOffset) : this.baseForward;
                    this.idleLookTarget.copy(this.mesh.position).addScaledVector(direction, 5);
                }
            } else { // Player not valid or nearby, look random/forward
                 const randomAngleOffset = (Math.random() - 0.5) * Math.PI * 1.5;
                 const direction = (Math.random() < 0.5) ? this.baseForward.clone().applyAxisAngle(THREE.Object3D.DEFAULT_UP, randomAngleOffset) : this.baseForward;
                 this.idleLookTarget.copy(this.mesh.position).addScaledVector(direction, 5);
            }
        }

        // Smooth Rotation
        _targetDirection.copy(this.idleLookTarget).sub(this.mesh.position).setY(0);
        if (_targetDirection.lengthSq() > 0.01) {
            _targetLookAt.copy(this.mesh.position).add(_targetDirection.normalize());
            _tempMatrix.lookAt(_targetLookAt, this.mesh.position, this.mesh.up);
            _targetQuaternion.setFromRotationMatrix(_tempMatrix);
            // Ensure mesh quaternion is not null/undefined before slerp
             if (this.mesh.quaternion) {
                 smoothQuaternionSlerp(this.mesh.quaternion, _targetQuaternion, 0.05, deltaTime);
             }
        }
    }

    override updateBoundingBox(): void {
        if (!this.mesh) { // FIX: Check mesh exists
            this.boundingBox.makeEmpty();
            this.userData.boundingBox = undefined;
            return;
        }
        const height = this.userData.height ?? 1.7; const radius = 0.4;
        const center = this.mesh.position.clone().add(new THREE.Vector3(0, height / 2, 0));
        this.boundingBox.setFromCenterAndSize(center, new THREE.Vector3(radius * 2, height, radius * 2));
        this.userData.boundingBox = this.boundingBox;
    }
}