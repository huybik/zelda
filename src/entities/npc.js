import * as THREE from 'three';
import { Entity } from './entity.js';

// Reusable vectors/quaternions
const _playerPos = new THREE.Vector3();
const _targetLookAt = new THREE.Vector3();
const _targetDirection = new THREE.Vector3();
const _targetQuaternion = new THREE.Quaternion();
const _forward = new THREE.Vector3(0,0,-1); // Assuming default forward is +Z

export class NPC extends Entity {
    constructor(scene, position, name, accessoryType = 'none', questLog, inventory) {
        super(scene, position, name);
        this.userData.isNPC = true;
        this.userData.isCollidable = true;
        this.userData.isInteractable = true; // NPCs can be talked to
        this.userData.interactionType = 'talk'; // Specific interaction type

        this.accessoryType = accessoryType; // 'straw_hat', 'cap', etc.
        this.questLog = questLog; // Reference to the main quest log
        this.inventory = inventory; // Reference to player inventory for quest checks/rewards
        this.assignedQuestId = null; // Store only the ID, quest data comes from QuestLog
        this.assignedQuestData = null; // Store the data temporarily when assigning

        this.dialogueState = 'idle'; // 'idle', 'greeting', 'quest_offer', 'quest_incomplete', 'quest_complete', 'post_quest'
        this.interactionPrompt = `Press E to talk to ${this.name}`;
        this.userData.prompt = this.interactionPrompt; // For interaction system

        this.createModel();
        this.updateBoundingBox();

        // Simple idle behavior
        this.idleTimer = 2 + Math.random() * 3; // Start with random delay
        this.idleLookTarget = new THREE.Vector3();
        // Store initial rotation - ensure mesh is created first
        this.mesh.updateMatrixWorld(); // Ensure world matrix is up-to-date
        this.baseQuaternion = this.mesh.quaternion.clone();
        this.baseForward = new THREE.Vector3(0, 0, 1).applyQuaternion(this.baseQuaternion); // Get initial forward direction

        // Find initial look target based on base rotation
        this.idleLookTarget.copy(this.mesh.position).addScaledVector(this.baseForward, 5);
    }

    createModel() {
        const bodyMat = new THREE.MeshLambertMaterial({ color: Math.random() * 0xffffff }); // Random color body
        const headMat = new THREE.MeshLambertMaterial({ color: 0xffdab9 }); // Beige head

        // Basic blocky shape similar to player but maybe different proportions
        const bodyHeight = 1.1;
        const headRadius = 0.3;
        const bodyGeo = new THREE.BoxGeometry(0.7, bodyHeight, 0.4);
        const bodyMesh = new THREE.Mesh(bodyGeo, bodyMat);
        bodyMesh.position.y = bodyHeight / 2; // Origin at feet
        bodyMesh.castShadow = true;
        bodyMesh.receiveShadow = true;
        this.mesh.add(bodyMesh);

        const headGeo = new THREE.SphereGeometry(headRadius, 16, 16);
        const headMesh = new THREE.Mesh(headGeo, headMat);
        headMesh.position.y = bodyHeight + headRadius; // Place on top of body
        headMesh.castShadow = true;
        this.mesh.add(headMesh);

        // Accessory
        this.addAccessory(headMesh.position); // Pass head's local position

        this.mesh.userData.height = bodyHeight + headRadius * 2; // Approx height
    }

    addAccessory(headPosition) {
        let accessory = null;
        const accessoryMat = new THREE.MeshLambertMaterial({ color: 0x8B4513 }); // Brown default

        if (this.accessoryType === 'straw_hat') {
            accessoryMat.color.set(0xFFEC8B); // Light Yellow
            const brimGeo = new THREE.CylinderGeometry(0.6, 0.7, 0.1, 16);
            const topGeo = new THREE.CylinderGeometry(0.4, 0.3, 0.3, 16);
            accessory = new THREE.Group();
            const brimMesh = new THREE.Mesh(brimGeo, accessoryMat);
            const topMesh = new THREE.Mesh(topGeo, accessoryMat);
            topMesh.position.y = 0.15; // Place top part above brim
            accessory.add(brimMesh);
            accessory.add(topMesh);
            // Position accessory relative to head position (which is local to the NPC group)
            accessory.position.set(headPosition.x, headPosition.y + 0.25, headPosition.z);
        } else if (this.accessoryType === 'cap') {
            accessoryMat.color.set(0x4682B4); // Steel Blue
            const capGeo = new THREE.SphereGeometry(0.35, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2); // Half sphere
            accessory = new THREE.Mesh(capGeo, accessoryMat);
             accessory.position.set(headPosition.x, headPosition.y + 0.1, headPosition.z); // Adjust position
             accessory.rotation.x = -0.1; // Slight tilt
        }
        // Add more accessory types here...

        if (accessory) {
            accessory.traverse(child => { if(child.isMesh) child.castShadow = true; });
            this.mesh.add(accessory); // Add to the main NPC group
        }
    }

     assignQuest(questData) {
         // Store the quest template; QuestLog will manage active/completed status
         // Check if NPC already has an active/available quest?
         if(this.assignedQuestId && this.questLog.getQuestStatus(this.assignedQuestId) !== 'completed') {
            console.warn(`${this.name} already has quest ${this.assignedQuestId}. Cannot assign new one yet.`);
            return;
         }
         this.assignedQuestId = questData.id;
         this.assignedQuestData = questData; // Store temporarily for interaction
         console.log(`${this.name} will offer quest: ${questData.id}`);
         // QuestLog doesn't need to know until offered/accepted
     }

    interact(player) {
         console.log(`Interacting with ${this.name}`);
         let dialogue = `Hello there, ${player.name}.`; // Default greeting

         // Turn to face the player smoothly (handled in update, but snap here for immediate feedback)
         _playerPos.copy(player.mesh.position);
         _playerPos.y = this.mesh.position.y; // Look at same height level
         this.mesh.lookAt(_playerPos);
         this.idleLookTarget.copy(_playerPos); // Set idle target to player temporarily
         this.idleTimer = 3.0; // Look at player for a bit


         // Quest Logic
         if (this.assignedQuestId && this.questLog) {
             const questStatus = this.questLog.getQuestStatus(this.assignedQuestId);
             const questData = this.questLog.getQuestData(this.assignedQuestId) || this.assignedQuestData; // Get data from log or temp storage

              if (!questData) {
                 console.error(`Quest data not found for ID: ${this.assignedQuestId}`);
                 dialogue = "I seem to have forgotten what I needed...";
                 this.assignedQuestId = null; // Clear broken quest link
              }
              else if (questStatus === 'unknown' || questStatus === 'available') {
                 // Offer the quest
                 dialogue = `${questData.description} Will you help me?`;
                 this.dialogueState = 'quest_offer';
                 // Let QuestLog handle the state transition if player accepts (e.g., via UI)
                 // For simplicity, assume acceptance on next interact or via UI prompt later
                 // We just present the offer here.
                 // Consider adding a temporary flag or specific return type for UI to handle acceptance.
                  if (this.questLog.offerQuest(this.assignedQuestId, questData)) {
                        if (player.eventLog) player.eventLog.addEntry(`Quest offered: ${questData.title}`);
                        // Auto-accept for simplicity now:
                         if (this.questLog.acceptQuest(this.assignedQuestId)) {
                           dialogue = `Thank you! ${this.questLog.getQuestProgress(this.assignedQuestId, this.inventory)}`;
                            if (player.eventLog) player.eventLog.addEntry(`Quest accepted: ${questData.title}`);
                           this.dialogueState = 'quest_incomplete';
                         }
                  } else {
                      // This case should not happen if logic is correct, but handle anyway
                      dialogue = "I've already asked you about this, haven't I?";
                      this.dialogueState = 'quest_incomplete'; // Treat as if already active
                  }

             } else if (questStatus === 'active') {
                 if (this.questLog.checkQuestCompletion(this.assignedQuestId, this.inventory)) {
                     dialogue = `Ah, you've done it! Thank you so much! Here is your reward.`;
                     this.dialogueState = 'quest_complete';
                     if (this.questLog.completeQuest(this.assignedQuestId, this.inventory)) {
                         if (player.eventLog) player.eventLog.addEntry(`Quest completed: ${questData.title}`);
                         // Optionally remove quest from NPC or assign a follow-up
                         // this.assignedQuestId = null;
                         // this.assignedQuestData = null;
                     } else {
                          dialogue = `Something went wrong turning that in... try again?`;
                     }
                 } else {
                     dialogue = `Have you completed the task yet? ${this.questLog.getQuestProgress(this.assignedQuestId, this.inventory)}`;
                     this.dialogueState = 'quest_incomplete';
                 }
             } else if (questStatus === 'completed') {
                dialogue = "Thanks again for your help!";
                this.dialogueState = 'post_quest'; // Or 'idle'
             }
         } else {
             // Simple idle dialogue if no quest
             dialogue = this.getRandomIdleDialogue();
             this.dialogueState = 'greeting';
         }


        // Display dialogue bubble or update UI prompt
        console.log(`${this.name}: ${dialogue}`);
        // Use player's eventLog if available
         if (player.eventLog) {
            player.eventLog.addEntry(`${this.name}: "${dialogue}"`);
         }

        // Return value could indicate success or follow-up action needed (like showing UI choice)
        return { type: 'dialogue', text: dialogue, state: this.dialogueState };
    }

     getRandomIdleDialogue() {
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

    update(deltaTime, player) {
        // super.update(deltaTime); // Base entity update (not moving NPCs currently)

        // Simple idle behavior: occasionally look around
        this.idleTimer -= deltaTime;
        if (this.idleTimer <= 0) {
            this.idleTimer = 3 + Math.random() * 4; // Reset timer

            // If player is nearby and NPC isn't actively looking at them from interaction, look towards them sometimes
            const distanceToPlayer = this.mesh.position.distanceTo(player.mesh.position);
            if (distanceToPlayer < 15 && Math.random() < 0.3) {
                 _targetLookAt.copy(player.mesh.position);
                 _targetLookAt.y = this.mesh.position.y; // Look at same height
                 this.idleLookTarget.copy(_targetLookAt);
            } else {
                 // Look in a random direction or back to default
                 if (Math.random() < 0.5) {
                     const randomAngleOffset = (Math.random() - 0.5) * Math.PI * 1.5; // Wider random angle range
                     const randomDirection = this.baseForward.clone().applyAxisAngle(new THREE.Vector3(0,1,0), randomAngleOffset);
                     this.idleLookTarget.copy(this.mesh.position).addScaledVector(randomDirection, 5);

                 } else {
                     // Look forward relative to base rotation
                     this.idleLookTarget.copy(this.mesh.position).addScaledVector(this.baseForward, 5);
                 }
            }
        }

        // Smoothly turn towards the idle look target using Quaternion slerp
        _targetDirection.copy(this.idleLookTarget).sub(this.mesh.position);
        _targetDirection.y = 0; // Keep looking horizontal
        if (_targetDirection.lengthSq() > 0.01) { // Avoid normalizing zero vector
            _targetDirection.normalize();

            // Calculate target quaternion using lookAt logic internally (more robust than setFromUnitVectors)
             _targetLookAt.copy(this.mesh.position).add(_targetDirection);
             const tempMatrix = new THREE.Matrix4();
             tempMatrix.lookAt(_targetLookAt, this.mesh.position, this.mesh.up);
             _targetQuaternion.setFromRotationMatrix(tempMatrix);

             // Slerp (interpolate rotation) - Frame rate independent
             const slerpFactor = 1.0 - Math.pow(0.05, deltaTime); // Adjust 0.05 to control speed (lower = slower)
             this.mesh.quaternion.slerp(_targetQuaternion, slerpFactor);
        }

         // Ensure bounding box is updated if needed (though NPCs likely won't move)
         // Only update if position or rotation significantly changed
         // this.updateBoundingBox(); // Could be optimized
    }

     // Override for NPC specific bounding box if needed
     updateBoundingBox() {
        // Approximate using a box around the main body/head
         const height = this.mesh.userData.height || 1.7;
         const radius = 0.4;
         const center = this.mesh.position.clone();
         center.y += height / 2; // Center vertically
         const size = new THREE.Vector3(radius * 2, height, radius * 2);
         this.boundingBox.setFromCenterAndSize(center, size);
         // Ensure the userData reference is updated for the physics system
         this.mesh.userData.boundingBox = this.boundingBox;
     }
}