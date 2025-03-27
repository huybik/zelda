import * as THREE from 'three';
import { Entity } from './entity.js';

export class NPC extends Entity {
    constructor(scene, position, name, accessoryType = 'none', questLog, inventory) {
        super(scene, position, name);
        this.userData.isNPC = true;
        this.userData.isCollidable = true;
        this.userData.isInteractable = true; // NPCs can be talked to

        this.accessoryType = accessoryType; // 'straw_hat', 'cap', etc.
        this.questLog = questLog; // Reference to the main quest log
        this.inventory = inventory; // Reference to player inventory for quest checks/rewards
        this.assignedQuest = null; // Quest this NPC currently offers/tracks

        this.dialogueState = 'idle'; // 'idle', 'greeting', 'quest_offer', 'quest_incomplete', 'quest_complete'
        this.interactionPrompt = `Press E to talk to ${this.name}`;
        this.userData.prompt = this.interactionPrompt; // For interaction system

        this.createModel();
        this.updateBoundingBox();

        // Simple idle behavior
        this.idleTimer = 0;
        this.idleLookTarget = new THREE.Vector3();
        this.baseRotationY = this.mesh.rotation.y; // Store initial rotation
    }

    createModel() {
        const bodyMat = new THREE.MeshLambertMaterial({ color: Math.random() * 0xffffff }); // Random color body
        const headMat = new THREE.MeshLambertMaterial({ color: 0xffdab9 }); // Beige head

        // Basic blocky shape similar to player but maybe different proportions
        const bodyGeo = new THREE.BoxGeometry(0.7, 1.1, 0.4);
        const bodyMesh = new THREE.Mesh(bodyGeo, bodyMat);
        bodyMesh.position.y = 1.1 / 2;
        bodyMesh.castShadow = true;
        this.mesh.add(bodyMesh);

        const headGeo = new THREE.SphereGeometry(0.3, 16, 16);
        const headMesh = new THREE.Mesh(headGeo, headMat);
        headMesh.position.y = 1.1 + 0.3; // Place on top of body
        headMesh.castShadow = true;
        this.mesh.add(headMesh);

        // Accessory
        this.addAccessory(headMesh.position);

        this.mesh.userData.height = 1.1 + 0.6; // Approx height
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
            accessory.position.set(headPosition.x, headPosition.y + 0.25, headPosition.z); // Adjust position on head
        } else if (this.accessoryType === 'cap') {
            accessoryMat.color.set(0x4682B4); // Steel Blue
            const capGeo = new THREE.SphereGeometry(0.35, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2); // Half sphere
            accessory = new THREE.Mesh(capGeo, accessoryMat);
             accessory.position.set(headPosition.x, headPosition.y + 0.1, headPosition.z); // Adjust position
             accessory.rotation.x = -0.1; // Slight tilt
        }
        // Add more accessory types here...

        if (accessory) {
            accessory.castShadow = true;
            this.mesh.add(accessory);
        }
    }

     assignQuest(questData) {
         // Store the quest template; QuestLog will manage active/completed status
         this.assignedQuest = questData;
         console.log(`${this.name} assigned quest: ${questData.id}`);
     }

    interact(player) {
         console.log(`Interacting with ${this.name}`);
         let dialogue = `Hello, ${player.name}!`; // Default greeting

         // Turn to face the player
         const playerPos = player.mesh.position.clone();
         playerPos.y = this.mesh.position.y; // Look at same height level
         this.mesh.lookAt(playerPos);

         // Quest Logic
         if (this.assignedQuest) {
             const questStatus = this.questLog.getQuestStatus(this.assignedQuest.id);

             if (questStatus === 'available') {
                 dialogue = `${this.assignedQuest.description} Will you help me?`;
                 this.dialogueState = 'quest_offer';
                 // Offer the quest - clicking again or a UI prompt accepts it
                 this.questLog.offerQuest(this.assignedQuest.id, this.assignedQuest); // Let QuestLog handle the state transition
             } else if (questStatus === 'active') {
                 if (this.questLog.checkQuestCompletion(this.assignedQuest.id, this.inventory)) {
                     dialogue = `Ah, you've done it! Thank you so much! Here is your reward.`;
                     this.dialogueState = 'quest_complete';
                     this.questLog.completeQuest(this.assignedQuest.id, this.inventory); // Complete and give reward
                     this.assignedQuest = null; // NPC no longer offers this quest (can be expanded)
                 } else {
                     dialogue = `Have you completed the task yet? ${this.questLog.getQuestProgress(this.assignedQuest.id, this.inventory)}`;
                     this.dialogueState = 'quest_incomplete';
                 }
             } else if (questStatus === 'completed') {
                dialogue = "Thanks again for your help!";
                this.dialogueState = 'idle'; // Or post-quest dialogue
             }
         } else {
             // Simple idle dialogue if no quest
             dialogue = this.getRandomIdleDialogue();
             this.dialogueState = 'greeting';
         }


        // Display dialogue bubble or update UI prompt
        // For now, just log it and update the interaction prompt temporarily
        console.log(`${this.name}: ${dialogue}`);
         if (player.eventLog) {
            player.eventLog.addEntry(`${this.name}: "${dialogue}"`);
         }

        // Return value could indicate success or follow-up action needed
        return { type: 'dialogue', text: dialogue, state: this.dialogueState };
    }

     getRandomIdleDialogue() {
         const dialogues = [
             "Nice weather today.",
             "Be careful out there.",
             "Seen any deer around?",
             "The wilderness holds many secrets.",
             "Welcome to our village."
         ];
         return dialogues[Math.floor(Math.random() * dialogues.length)];
     }

    update(deltaTime, player) {
        super.update(deltaTime); // Basic entity update (like position if velocity is applied)

        // Simple idle behavior: occasionally look around
        this.idleTimer -= deltaTime;
        if (this.idleTimer <= 0) {
            // If player is nearby, look towards them sometimes
            const distanceToPlayer = this.mesh.position.distanceTo(player.mesh.position);
            if (distanceToPlayer < 10 && Math.random() < 0.3) {
                const targetPos = player.mesh.position.clone();
                 targetPos.y = this.mesh.position.y; // Look at same height
                 this.idleLookTarget.copy(targetPos);
            } else {
                 // Look in a random direction or back to default
                 if (Math.random() < 0.5) {
                     const randomAngle = this.baseRotationY + (Math.random() - 0.5) * Math.PI;
                     this.idleLookTarget.set(
                         this.mesh.position.x + Math.sin(randomAngle) * 5,
                         this.mesh.position.y,
                         this.mesh.position.z + Math.cos(randomAngle) * 5
                     );
                 } else {
                     // Look forward relative to base rotation
                      this.idleLookTarget.set(
                         this.mesh.position.x + Math.sin(this.baseRotationY) * 5,
                         this.mesh.position.y,
                         this.mesh.position.z + Math.cos(this.baseRotationY) * 5
                     );
                 }
            }

            this.idleTimer = 3 + Math.random() * 4; // Look for 3-7 seconds
        }

        // Smoothly turn towards the idle look target
         const currentLookAt = new THREE.Vector3();
         this.mesh.getWorldDirection(currentLookAt); // Get current direction
         currentLookAt.add(this.mesh.position); // Convert direction to world position target

         const targetDirection = this.idleLookTarget.clone().sub(this.mesh.position);
         targetDirection.y = 0; // Keep looking horizontal
         targetDirection.normalize();

         // Calculate target quaternion
         const targetQuaternion = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,0,1), targetDirection);

         // Slerp (interpolate rotation)
         this.mesh.quaternion.slerp(targetQuaternion, 0.5 * deltaTime);


    }

     // Override for NPC specific bounding box if needed
     updateBoundingBox() {
        // Approximate using a box around the main body/head
         const height = this.mesh.userData.height || 1.7;
         const radius = 0.4;
         const center = this.mesh.position.clone();
         center.y += height / 2;
         const size = new THREE.Vector3(radius * 2, height, radius * 2);
         this.boundingBox.setFromCenterAndSize(center, size);
         this.mesh.userData.boundingBox = this.boundingBox;
     }
}