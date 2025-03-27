import * as THREE from 'three';

// Class for simple interactable world items (like the hunter's bow)
export class InteractableObject {
     constructor(id, position, interactionType, data, prompt) {
         this.id = id;
         this.position = position; // THREE.Vector3
         this.interactionType = interactionType; // 'retrieve', 'read_sign', etc.
         this.data = data; // Could be item name to give, text to display, etc.
         this.prompt = prompt;
         this.mesh = null; // Optional visual representation in the world

         // Flags for the system
         this.userData = {
             isInteractable: true,
             interactionType: this.interactionType,
             prompt: this.prompt,
             entityReference: this, // Link back to this instance
             data: this.data, // Make data accessible
             id: this.id // Make ID accessible
         };
     }

     // Called when player interacts
     interact(player, inventory, eventLog) {
         console.log(`Interacting with simple object: ${this.id}`);
         if (this.interactionType === 'retrieve') {
             const itemName = this.data;
             if (inventory.addItem(itemName, 1)) {
                 eventLog.addEntry(`You picked up: ${itemName}`);
                 // Remove object from world (or mark as interacted)
                 if (this.mesh) this.mesh.visible = false; // Hide mesh
                 this.userData.isInteractable = false; // Prevent further interaction
                 // TODO: Need a way to remove from the main interactableObjects array in Game.js
                 return { type: 'item_retrieved', item: itemName };
             } else {
                 eventLog.addEntry(`Your inventory is full.`);
                 return { type: 'error', message: 'Inventory full' };
             }
         }
         // Add other simple interaction types like 'read_sign' here
         return { type: 'message', message: 'You look at the object.'};
     }
      // Required methods even if empty for polymorphism
     update(deltaTime) {}
     updateBoundingBox() {
          if(this.mesh){
              if (!this.mesh.geometry.boundingBox) this.mesh.geometry.computeBoundingBox();
              this.userData.boundingBox = this.mesh.geometry.boundingBox.clone().applyMatrix4(this.mesh.matrixWorld);
          } else {
              // Fallback if no mesh - small box at position
              const size = new THREE.Vector3(0.5, 0.5, 0.5);
              this.userData.boundingBox = new THREE.Box3().setFromCenterAndSize(this.position, size);
          }
     }
}


export class InteractionSystem {
    constructor(player, camera, interactableObjects, controls, inventory, eventLog) {
        this.player = player;
        this.camera = camera;
        this.interactableObjects = interactableObjects; // Master list from Game.js
        this.controls = controls;
        this.inventory = inventory;
        this.eventLog = eventLog;

        this.raycaster = new THREE.Raycaster();
        this.interactionDistance = 3.0; // Max distance to interact
        this.aimTolerance = 0.1; // Radians; how forgiving the aim needs to be (~6 degrees)

        this.currentTarget = null; // The object currently in focus
        this.interactionPromptElement = document.getElementById('interaction-prompt');

        this.activeGather = null; // Info about ongoing gather action { target, startTime, duration }
    }

    update(deltaTime) {
         // Check if interactables array needs updating (e.g., if objects were removed)
         // A more robust system might use events or callbacks when objects are added/removed.
         // For now, we assume the array passed in constructor is managed externally.

        // Handle ongoing gather actions
        if (this.activeGather) {
            this.updateGatherAction(deltaTime);
            // While gathering, don't look for new targets
            return;
        }


        // Find potential target
        const targetInfo = this.findInteractableTarget();

        // Update UI Prompt
        if (targetInfo && targetInfo.object.userData.isInteractable) {
            this.currentTarget = targetInfo.object; // Store reference to the Three.js object/group
            const promptText = this.currentTarget.userData.prompt || "Press E to interact";
            this.showPrompt(promptText);

            // Check for interaction key press
            if (this.controls.consumeInteraction()) { // Use consume method
                this.tryInteract(this.currentTarget);
            }
        } else {
            this.currentTarget = null;
            this.hidePrompt();
        }
    }

    findInteractableTarget() {
        // Option 1: Raycast from camera center (crosshair aiming)
        this.raycaster.setFromCamera({ x: 0, y: 0 }, this.camera); // {x: 0, y: 0} is center of screen

        // Option 2: Raycast from player forward direction (more realistic for character)
        // const direction = new THREE.Vector3();
        // this.player.mesh.getWorldDirection(direction);
        // const origin = this.player.mesh.position.clone().add(new THREE.Vector3(0, this.player.mesh.userData.height * 0.75, 0)); // Ray origin near head/chest
        // this.raycaster.set(origin, direction);

        this.raycaster.far = this.interactionDistance;

        // Collect all potential THREE.Object3D instances from our interactable list
         const meshesToCheck = this.interactableObjects
             .map(item => item.mesh ? item.mesh : (item instanceof THREE.Object3D ? item : null)) // Get mesh or the item itself if it's an Object3D
             .filter(mesh => mesh && mesh.userData && mesh.userData.isInteractable && mesh.visible !== false); // Filter for valid, interactable, visible meshes


        const intersects = this.raycaster.intersectObjects(meshesToCheck, true); // Check recursively

        if (intersects.length > 0) {
            // Find the root interactable object (could be a group like a Tree or NPC mesh)
            let hitObject = intersects[0].object;
            while (hitObject.parent && !hitObject.userData.isInteractable) {
                hitObject = hitObject.parent;
            }

            // Check if the root object is indeed interactable
            if (hitObject.userData && hitObject.userData.isInteractable) {
                 // Optional: Check angle between camera forward and vector to object center
                 // This prevents interacting with things behind the player even if ray hits
                 const camDir = new THREE.Vector3();
                 this.camera.getWorldDirection(camDir);
                 const objDir = hitObject.position.clone().sub(this.camera.position).normalize();
                 const angle = camDir.angleTo(objDir);

                 if (angle < this.aimTolerance * 5) { // More generous angle check
                     return { object: hitObject, point: intersects[0].point, distance: intersects[0].distance };
                 }
            }
        }

        // Fallback: Check proximity (sphere around player) if raycasting fails or is not preferred
        // This is simpler but less precise for aiming.
         const nearby = this.findNearbyInteractable();
         if(nearby) {
             return { object: nearby, point: nearby.position, distance: this.player.mesh.position.distanceTo(nearby.position) };
         }


        return null; // No target found
    }

     findNearbyInteractable() {
         const playerPos = this.player.mesh.position;
         let closestDist = this.interactionDistance;
         let closestObj = null;

         this.interactableObjects.forEach(item => {
             const obj = item.mesh || item; // Get the THREE.Object3D
              if (!obj || !obj.userData || !obj.userData.isInteractable || obj.visible === false) return;

             const dist = playerPos.distanceTo(obj.position);
             if (dist < closestDist) {
                 // Check if object is roughly in front of the player
                 const playerDir = new THREE.Vector3();
                 this.player.mesh.getWorldDirection(playerDir);
                 const objDir = obj.position.clone().sub(playerPos).normalize();
                 const angle = playerDir.angleTo(objDir);

                 if (angle < Math.PI / 2) { // Check if within 90 degrees forward arc
                     closestDist = dist;
                     closestObj = obj;
                 }
             }
         });
         return closestObj;
     }


    tryInteract(targetObject) {
         if (!targetObject || !targetObject.userData.isInteractable) return;

         // Get the actual entity/object instance using the reference
         const interactableInstance = targetObject.userData.entityReference;
         if (!interactableInstance) {
             console.warn("Interactable object missing entityReference:", targetObject);
             return;
         }

         const interactionType = targetObject.userData.interactionType;
         console.log(`Attempting interaction: ${interactionType} with ${targetObject.name || targetObject.id}`);

         switch (interactionType) {
             case 'gather':
                 this.startGatherAction(targetObject, interactableInstance);
                 break;
             case 'open': // Chests
                 this.handleOpenAction(targetObject, interactableInstance);
                 break;
             case 'pet': // Deer
                 this.handlePetAction(interactableInstance);
                 break;
             case 'talk': // NPCs (NPC instance handles this)
             case 'npc_interaction': // Fallback if type isn't 'talk'
                 if (interactableInstance.interact) {
                      interactableInstance.interact(this.player); // NPC handles dialogue/quest logic
                 }
                 break;
             case 'retrieve': // Simple objects like hunter's bow
                  if (interactableInstance.interact) {
                      interactableInstance.interact(this.player, this.inventory, this.eventLog);
                      // Check if object became non-interactable and remove prompt etc.
                       if(!interactableInstance.userData.isInteractable) {
                            this.currentTarget = null;
                            this.hidePrompt();
                       }
                  }
                  break;

             default:
                 console.log("Unknown interaction type:", interactionType);
                 if (interactableInstance.interact) { // Generic fallback
                      interactableInstance.interact(this.player, this.inventory, this.eventLog);
                 }
                 break;
         }
    }

    startGatherAction(targetObject, targetInstance) {
        if (this.activeGather) return; // Already gathering something

        const resource = targetObject.userData.resource;
        const gatherTime = targetObject.userData.gatherTime || 2000; // Default 2s

        this.activeGather = {
            target: targetObject,
            instance: targetInstance,
            startTime: performance.now(),
            duration: gatherTime,
            resource: resource
        };

        this.showPrompt(`Gathering ${resource}...`);
        console.log(`Started gathering ${resource}`);
         if(this.eventLog) this.eventLog.addEntry(`Started gathering ${resource}...`);

        // TODO: Player should probably play an interacting animation
        this.player.velocity.set(0,0,0); // Stop player movement while gathering
    }

    updateGatherAction(deltaTime) {
        if (!this.activeGather) return;

        const elapsedTime = performance.now() - this.activeGather.startTime;
        const progress = Math.min(1, elapsedTime / this.activeGather.duration);

        // Update prompt with progress (optional)
        this.showPrompt(`Gathering ${this.activeGather.resource}... (${Math.round(progress * 100)}%)`);

        // Check if player moved or pressed interact again to cancel? (optional)

        if (progress >= 1) {
            this.completeGatherAction();
        }
    }

    completeGatherAction() {
        const { resource, target } = this.activeGather;
        console.log(`Finished gathering ${resource}`);

        if (this.inventory.addItem(resource, 1)) {
             if(this.eventLog) this.eventLog.addEntry(`Gathered 1 ${resource}.`);
            // Optional: Make resource node temporarily depleted or remove it
            // target.visible = false; // Example: hide the object
            // target.userData.isInteractable = false; // Disable interaction
            // setTimeout(() => { // Respawn after some time
            //     target.visible = true;
            //     target.userData.isInteractable = true;
            // }, 15000); // Respawn after 15 seconds

        } else {
             if(this.eventLog) this.eventLog.addEntry(`Inventory full, could not gather ${resource}.`);
        }

        this.activeGather = null;
        this.hidePrompt(); // Hide gather prompt, allowing normal prompts again
    }

     cancelGatherAction() {
          if(!this.activeGather) return;
          console.log("Gathering cancelled.");
          if(this.eventLog) this.eventLog.addEntry("Gathering cancelled.");
          this.activeGather = null;
          this.hidePrompt();
     }


    handleOpenAction(targetObject, targetInstance) {
         if (targetInstance.userData.isOpen) {
              console.log("Chest is already open.");
              if(this.eventLog) this.eventLog.addEntry("The chest is empty.");
              return; // Already open
         }

         console.log("Opening chest...");
         targetInstance.userData.isOpen = true;
         targetInstance.userData.targetAngle = targetInstance.userData.openAngle; // Trigger lid animation

          // Disable further interaction immediately
         targetObject.userData.isInteractable = false; // Only open once
         targetObject.userData.prompt = "Empty Chest"; // Change prompt if targeted again

         const loot = targetInstance.userData.loot || {};
         let lootMessages = [];

         Object.entries(loot).forEach(([itemName, amount]) => {
             if (this.inventory.addItem(itemName, amount)) {
                 lootMessages.push(`Found ${amount} ${itemName}`);
             } else {
                 lootMessages.push(`Found ${amount} ${itemName}, but inventory is full!`);
                 // TODO: Drop item on ground?
             }
         });

         if (lootMessages.length > 0) {
              const combinedMessage = lootMessages.join('. ');
               if(this.eventLog) this.eventLog.addEntry(combinedMessage + ".");
               this.showPrompt(combinedMessage, 3000); // Show message briefly
         } else {
               if(this.eventLog) this.eventLog.addEntry("The chest is empty.");
               this.showPrompt("Chest is empty", 2000);
         }

          // Ensure the target is deselected after interaction
          this.currentTarget = null;
          // Prompt will hide automatically if shown temporarily, or hidePrompt() needed if not timed
    }

     handlePetAction(targetInstance) {
         if (targetInstance.interact) {
              const result = targetInstance.interact(this.player); // Let the Animal handle the logic
              if (result) {
                 if (result.type === 'reward' && result.item) {
                      if (this.inventory.addItem(result.item.name, result.item.amount)) {
                           if(this.eventLog) this.eventLog.addEntry(result.message || `Received ${result.item.amount} ${result.item.name}.`);
                           this.showPrompt(result.message || `Received ${result.item.amount} ${result.item.name}.`, 3000);
                      } else {
                           const failMsg = `Found ${result.item.name}, but inventory is full!`;
                            if(this.eventLog) this.eventLog.addEntry(failMsg);
                            this.showPrompt(failMsg, 3000);
                      }
                 } else if (result.type === 'message') {
                      if(this.eventLog) this.eventLog.addEntry(result.message);
                      this.showPrompt(result.message, 2000);
                 }
              }
         }
          this.currentTarget = null; // Deselect after petting
          // Prompt hides automatically if shown temporarily
     }


    showPrompt(text, duration = null) {
        if (!this.interactionPromptElement) return;
        this.interactionPromptElement.textContent = text;
        this.interactionPromptElement.style.display = 'block';

        // If duration is set, hide after timeout
        if (duration) {
             clearTimeout(this.promptTimeout); // Clear previous timeout if any
             this.promptTimeout = setTimeout(() => this.hidePrompt(), duration);
        }
    }

    hidePrompt() {
        if (!this.interactionPromptElement) return;
        // Only hide if not currently gathering
        if (!this.activeGather) {
             this.interactionPromptElement.style.display = 'none';
             this.interactionPromptElement.textContent = '';
             clearTimeout(this.promptTimeout); // Clear timeout if hidden manually
        }
    }
}