import * as THREE from 'three';
import { Entity } from './entity';
import { Player } from './player'; // Import Player for type checking
import { QuestLog } from '../systems/quest';
import { Inventory } from '../systems/inventory';
import { QuestData, InteractionResult } from '../types/common';
import { smoothQuaternionSlerp } from '../utils/helpers'; // Use helper for smooth rotation

// Reusable vectors/quaternions
const _playerPos = new THREE.Vector3();
const _targetLookAt = new THREE.Vector3();
const _targetDirection = new THREE.Vector3();
const _targetQuaternion = new THREE.Quaternion();
const _tempMatrix = new THREE.Matrix4();

type AccessoryType = 'none' | 'straw_hat' | 'cap';
type DialogueState = 'idle' | 'greeting' | 'quest_offer' | 'quest_incomplete' | 'quest_complete' | 'post_quest' | 'available';

export class NPC extends Entity {
    public accessoryType: AccessoryType;
    public questLog: QuestLog | null; // Can be null if NPC doesn't deal with quests
    public inventory: Inventory | null; // Player inventory reference
    public assignedQuestId: string | null;
    private assignedQuestData: QuestData | null; // Temporary store for assignment

    public dialogueState: DialogueState;
    public interactionPrompt: string;

    // Idle Behavior
    private idleTimer: number;
    private idleLookTarget: THREE.Vector3;
    private baseQuaternion: THREE.Quaternion; // Initial rotation
    private baseForward: THREE.Vector3; // Initial forward direction

    constructor(
        scene: THREE.Scene,
        position: THREE.Vector3,
        name: string,
        accessoryType: AccessoryType = 'none',
        questLog: QuestLog | null,
        inventory: Inventory | null // Player's inventory
    ) {
        super(scene, position, name);
        this.userData.isNPC = true;
        this.userData.isCollidable = true;
        this.userData.isInteractable = true;
        this.userData.interactionType = 'talk';

        this.accessoryType = accessoryType;
        this.questLog = questLog;
        this.inventory = inventory;
        this.assignedQuestId = null;
        this.assignedQuestData = null;

        this.dialogueState = 'idle';
        this.interactionPrompt = `Press E to talk to ${this.name}`;
        this.userData.prompt = this.interactionPrompt;

        this.createModel();

        // Idle behavior setup (after mesh creation)
        this.idleTimer = 2 + Math.random() * 3;
        this.idleLookTarget = new THREE.Vector3();
        this.mesh.updateMatrixWorld(); // Ensure world matrix is up-to-date
        this.baseQuaternion = this.mesh.quaternion.clone();
        this.baseForward = new THREE.Vector3(0, 0, 1).applyQuaternion(this.baseQuaternion); // Get initial forward direction
        // Find initial look target based on base rotation
        this.idleLookTarget.copy(this.mesh.position).addScaledVector(this.baseForward, 5);

        this.updateBoundingBox(); // Calculate initial box
    }

    private createModel(): void {
        const bodyMat = new THREE.MeshLambertMaterial({ color: Math.random() * 0xffffff });
        const headMat = new THREE.MeshLambertMaterial({ color: 0xffdab9 }); // PeachPuff

        const bodyHeight = 1.1;
        const headRadius = 0.3;

        // Body
        const bodyGeo = new THREE.BoxGeometry(0.7, bodyHeight, 0.4);
        const bodyMesh = new THREE.Mesh(bodyGeo, bodyMat);
        bodyMesh.position.y = bodyHeight / 2; // Place base at Y=0 relative to group
        bodyMesh.castShadow = true;
        bodyMesh.receiveShadow = true;
        this.mesh.add(bodyMesh);

        // Head
        const headGeo = new THREE.SphereGeometry(headRadius, 16, 16);
        const headMesh = new THREE.Mesh(headGeo, headMat);
        headMesh.position.y = bodyHeight + headRadius; // Place on top of body
        headMesh.castShadow = true;
        this.mesh.add(headMesh);

        // Accessory (position relative to head)
        this.addAccessory(headMesh.position);

        this.userData.height = bodyHeight + headRadius * 2; // Approx height
    }

    private addAccessory(headPosition: THREE.Vector3): void {
        let accessory: THREE.Object3D | null = null;
        let accessoryMat = new THREE.MeshLambertMaterial({ color: 0x8B4513 }); // Brown default

        switch (this.accessoryType) {
            case 'straw_hat':
                accessoryMat = new THREE.MeshLambertMaterial({ color: 0xFFEC8B }); // Light Yellow
                const brimGeo = new THREE.CylinderGeometry(0.6, 0.7, 0.1, 16);
                const topGeo = new THREE.CylinderGeometry(0.4, 0.3, 0.3, 16);
                accessory = new THREE.Group();
                const brimMesh = new THREE.Mesh(brimGeo, accessoryMat);
                const topMesh = new THREE.Mesh(topGeo, accessoryMat);
                topMesh.position.y = 0.15; // Place top part above brim
                accessory.add(brimMesh, topMesh);
                accessory.position.set(headPosition.x, headPosition.y + 0.25, headPosition.z);
                break;
            case 'cap':
                accessoryMat = new THREE.MeshLambertMaterial({ color: 0x4682B4 }); // Steel Blue
                const capGeo = new THREE.SphereGeometry(0.35, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2); // Half sphere
                accessory = new THREE.Mesh(capGeo, accessoryMat);
                accessory.position.set(headPosition.x, headPosition.y + 0.1, headPosition.z);
                accessory.rotation.x = -0.1; // Slight tilt
                break;
            // Add more accessory types here...
        }

        if (accessory) {
            accessory.traverse(child => { if (child instanceof THREE.Mesh) child.castShadow = true; });
            this.mesh.add(accessory);
        }
    }

    public assignQuest(questData: QuestData): void {
        // Check if NPC already has an active/available quest that isn't completed
        if (this.assignedQuestId && this.questLog?.getQuestStatus(this.assignedQuestId) !== 'completed') {
            console.warn(`${this.name} already has quest ${this.assignedQuestId}. Cannot assign new one yet.`);
            return;
        }
        // Store the quest template; QuestLog will manage active/completed status
        this.assignedQuestId = questData.id;
        this.assignedQuestData = questData; // Store temporarily for interaction logic
        this.questLog?.makeQuestAvailable(questData.id); // Ensure quest log knows it's available
        console.log(`${this.name} will offer quest: ${questData.id}`);
    }

    public interact(player: Player): InteractionResult | null {
        console.log(`Interacting with ${this.name}`);
        let dialogue: string = `Hello there, ${player.name}.`; // Default greeting
        let interactionResultType: InteractionResult['type'] = 'dialogue';

        // Turn to face the player
        _playerPos.copy(player.mesh.position);
        _playerPos.y = this.mesh.position.y; // Look at same height level
        this.mesh.lookAt(_playerPos);
        this.idleLookTarget.copy(_playerPos); // Set idle target to player temporarily
        this.idleTimer = 3.0; // Look at player for a bit

        // --- Quest Logic ---
        if (this.assignedQuestId && this.questLog && this.inventory) {
            const questStatus = this.questLog.getQuestStatus(this.assignedQuestId);
            // Get data preferentially from the log, fallback to temp data if needed
            const questData = this.questLog.getQuestData(this.assignedQuestId) ?? this.assignedQuestData;

            if (!questData) {
                console.error(`Quest data not found for ID: ${this.assignedQuestId}`);
                dialogue = "I seem to have forgotten what I needed...";
                this.dialogueState = 'idle';
                this.assignedQuestId = null; // Clear broken quest link
                this.assignedQuestData = null;
            } else if (questStatus === 'available') {
                // Offer the quest
                dialogue = `${questData.description} Will you help me?`;
                this.dialogueState = 'quest_offer';
                // OfferQuest is more conceptual; let's try to accept it directly here for simplicity
                if (this.questLog.acceptQuest(this.assignedQuestId)) {
                    dialogue = `Thank you! ${this.questLog.getQuestProgress(this.assignedQuestId, this.inventory)}`;
                    player.eventLog?.addEntry(`Quest accepted: ${questData.title}`);
                    this.dialogueState = 'quest_incomplete';
                } else {
                     // Should only fail if status wasn't actually 'available'
                    dialogue = "Hmm, let me know if you change your mind.";
                    this.dialogueState = 'available'; // Revert state? Or stay quest_offer?
                }
            } else if (questStatus === 'active') {
                if (this.questLog.checkQuestCompletion(this.assignedQuestId, this.inventory)) {
                    this.dialogueState = 'quest_complete';
                    if (this.questLog.completeQuest(this.assignedQuestId, this.inventory)) {
                        dialogue = `Ah, you've done it! Thank you so much! Here is your reward.`;
                        player.eventLog?.addEntry(`Quest completed: ${questData.title}`);
                        // Optionally remove quest or assign follow-up
                        // this.assignedQuestId = null; // Keep it assigned to show post-quest dialogue
                        // this.assignedQuestData = null;
                    } else {
                        dialogue = `Something went wrong turning that in... try again?`;
                        this.dialogueState = 'quest_incomplete'; // Revert state on failure
                    }
                } else {
                    dialogue = `Have you completed the task yet? ${this.questLog.getQuestProgress(this.assignedQuestId, this.inventory)}`;
                    this.dialogueState = 'quest_incomplete';
                }
            } else if (questStatus === 'completed') {
                dialogue = "Thanks again for your help!";
                this.dialogueState = 'post_quest';
            }
        } else {
            // Simple idle dialogue if no quest or missing system refs
            dialogue = this.getRandomIdleDialogue();
            this.dialogueState = 'greeting';
        }

        // Log dialogue to console and event log
        console.log(`${this.name}: ${dialogue}`);
        player.eventLog?.addEntry(`${this.name}: "${dialogue}"`);

        // Return value for InteractionSystem/UI
        return { type: interactionResultType, text: dialogue, state: this.dialogueState };
    }

    private getRandomIdleDialogue(): string {
        const dialogues = [
            "Nice weather today.",
            "Be careful out there.",
            "Seen any trouble makers around?",
            "The wilderness holds many secrets.",
            "Welcome to our village.",
            "Need something?",
            "Don't wander too far from the village.",
        ];
        return dialogues[Math.floor(Math.random() * dialogues.length)];
    }

    override update(deltaTime: number, player: Player, collidables?: THREE.Object3D[]): void {
        // --- Idle Look Behavior ---
        this.idleTimer -= deltaTime;
        if (this.idleTimer <= 0) {
            this.idleTimer = 3 + Math.random() * 4; // Reset timer

            const distanceToPlayerSq = this.mesh.position.distanceToSquared(player.mesh.position);
            // Check if player is nearby and NPC isn't currently focused from interaction
            if (distanceToPlayerSq < 15 * 15 && Math.random() < 0.3) {
                _targetLookAt.copy(player.mesh.position).setY(this.mesh.position.y); // Look horizontally at player
                this.idleLookTarget.copy(_targetLookAt);
            } else {
                // Look in a random direction or back to default forward
                if (Math.random() < 0.5) {
                    const randomAngleOffset = (Math.random() - 0.5) * Math.PI * 1.5;
                    const randomDirection = this.baseForward.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), randomAngleOffset);
                    this.idleLookTarget.copy(this.mesh.position).addScaledVector(randomDirection, 5);
                } else {
                    // Look forward relative to base rotation
                    this.idleLookTarget.copy(this.mesh.position).addScaledVector(this.baseForward, 5);
                }
            }
        }

        // --- Smooth Rotation ---
        _targetDirection.copy(this.idleLookTarget).sub(this.mesh.position);
        _targetDirection.y = 0; // Keep looking horizontal
        if (_targetDirection.lengthSq() > 0.01) {
            _targetDirection.normalize();
            // Calculate target quaternion using lookAt logic
             _targetLookAt.copy(this.mesh.position).add(_targetDirection);
             _tempMatrix.lookAt(_targetLookAt, this.mesh.position, this.mesh.up); // Use temp matrix
             _targetQuaternion.setFromRotationMatrix(_tempMatrix);

             // Slerp towards target rotation
             smoothQuaternionSlerp(this.mesh.quaternion, _targetQuaternion, 0.05, deltaTime);
        }

        // NPCs don't move, so bounding box updates infrequently unless needed by physics push-out
        // this.updateBoundingBox(); // Only if needed
    }

    override updateBoundingBox(): void {
        if (!this.mesh) return;
        const height = this.userData.height ?? 1.7;
        const radius = 0.4;
        const center = this.mesh.position.clone().add(new THREE.Vector3(0, height / 2, 0));
        const size = new THREE.Vector3(radius * 2, height, radius * 2);
        this.boundingBox.setFromCenterAndSize(center, size);
        this.userData.boundingBox = this.boundingBox;
    }
}