import * as THREE from 'three';

// Reusable vectors
const _camDir = new THREE.Vector3();
const _objDir = new THREE.Vector3();
const _playerPos = new THREE.Vector3();
const _playerDir = new THREE.Vector3();
const _objPos = new THREE.Vector3();


// Class for simple interactable world items (like the hunter's bow, signs)
export class InteractableObject {
     constructor(id, position, interactionType, data, prompt, scene = null) {
         this.id = id;
         this.position = position.clone(); // THREE.Vector3
         this.interactionType = interactionType; // 'retrieve', 'read_sign', etc.
         this.data = data; // Could be item name to give, text to display, etc.
         this.prompt = prompt;
         this.mesh = null; // Optional visual representation in the world
         this.isActive = true; // To disable interaction after use

         // Flags for the system
         this.userData = {
             isInteractable: true,
             interactionType: this.interactionType,
             prompt: this.prompt,
             entityReference: this, // Link back to this instance
             data: this.data, // Make data accessible
             id: this.id, // Make ID accessible
             isSimpleObject: true // Differentiate from complex entities
         };

         // Optional: Create a default mesh if needed for visibility/raycasting
         if (scene && !this.mesh) {
             // Example: Simple sphere marker if no mesh provided
             // const markerGeo = new THREE.SphereGeometry(0.2);
             // const markerMat = new THREE.MeshBasicMaterial({ color: 0xffff00, transparent: true, opacity: 0.5 });
             // this.mesh = new THREE.Mesh(markerGeo, markerMat);
             // this.mesh.position.copy(this.position);
             // scene.add(this.mesh);
         }
         if (this.mesh) {
             this.mesh.userData = this.userData; // Link userData to mesh
         }
     }

     // Called when player interacts
     interact(player, inventory, eventLog) {
         if (!this.isActive) return { type: 'error', message: 'Already used.' };

         console.log(`Interacting with simple object: ${this.id} (${this.interactionType})`);
         switch (this.interactionType) {
             case 'retrieve':
                 const itemName = this.data;
                 if (inventory.addItem(itemName, 1)) {
                     if (eventLog) eventLog.addEntry(`You picked up: ${itemName}`);
                     // Remove object from world (or mark as interacted)
                     this.removeFromWorld();
                     return { type: 'item_retrieved', item: itemName };
                 } else {
                     if (eventLog) eventLog.addEntry(`Your inventory is full.`);
                     return { type: 'error', message: 'Inventory full' };
                 }

             case 'read_sign':
                 const signText = this.data || "The sign is worn and illegible.";
                 if (eventLog) eventLog.addEntry(`Sign: "${signText}"`);
                 // No state change needed for reading a sign usually
                 return { type: 'message', message: signText };

             default:
                console.warn(`Unhandled simple interaction type: ${this.interactionType}`);
                return { type: 'message', message: 'You look at the object.'};
         }
     }

     removeFromWorld() {
        this.isActive = false;
        this.userData.isInteractable = false; // Prevent further interaction checks
        if (this.mesh && this.mesh.parent) {
             this.mesh.visible = false; // Hide mesh
             // Optional: Actually remove from scene after a delay or manage lifecycle
             // this.mesh.parent.remove(this.mesh);
        }
        // TODO: Need a robust way to remove from the main interactableObjects array in Game.js
        // Maybe the InteractionSystem filters inactive objects periodically?
     }

      // Required methods for compatibility with entity list if needed
     update(deltaTime) {} // No updates needed for simple static objects
     updateBoundingBox() {
          if (this.mesh){
              // Ensure geometry and matrix are valid before calculating
              if (this.mesh.geometry && this.mesh.matrixWorld) {
                  if (!this.mesh.geometry.boundingBox) {
                      this.mesh.geometry.computeBoundingBox();
                  }
                  if (this.mesh.geometry.boundingBox) {
                      // Ensure userData.boundingBox is a new Box3 instance
                      if (!this.userData.boundingBox) this.userData.boundingBox = new THREE.Box3();
                      this.userData.boundingBox.copy(this.mesh.geometry.boundingBox).applyMatrix4(this.mesh.matrixWorld);
                  }
              }
          } else if (this.position) {
              // Fallback if no mesh - small box at position
              const size = new THREE.Vector3(0.5, 0.5, 0.5);
              if (!this.userData.boundingBox) this.userData.boundingBox = new THREE.Box3();
              this.userData.boundingBox.setFromCenterAndSize(this.position, size);
          }
     }
}


export class InteractionSystem {
    constructor(player, camera, interactableEntities, controls, inventory, eventLog) {
        this.player = player;
        this.camera = camera;
        // interactableEntities: Master list from Game.js (includes Entities and InteractableObjects)
        this.interactableEntities = interactableEntities;
        this.controls = controls;
        this.inventory = inventory;
        this.eventLog = eventLog;

        this.raycaster = new THREE.Raycaster();
        this.interactionDistance = 3.0; // Max distance to interact
        this.aimTolerance = Math.PI / 6; // Radians; how forgiving the aim needs to be (~30 degrees)

        this.currentTarget = null; // The entity/object instance currently in focus
        this.currentTargetMesh = null; // The THREE.Object3D mesh/group associated with the target
        this.interactionPromptElement = document.getElementById('interaction-prompt');

        this.activeGather = null; // Info about ongoing gather action { targetInstance, startTime, duration, resource }
        this.promptTimeout = null; // Timeout ID for temporary prompts
    }

    update(deltaTime) {
        // TODO: Periodically filter this.interactableEntities to remove inactive InteractableObjects?

        // Handle ongoing gather actions
        if (this.activeGather) {
            // Check if player moved significantly or pressed interact again to cancel
             const distanceMoved = this.player.velocity.clone().multiplyScalar(deltaTime).lengthSq();
             if (distanceMoved > 0.01 || this.controls.consumeInteraction()) {
                this.cancelGatherAction();
                return; // Don't look for new targets while cancelling
             }

            this.updateGatherAction(deltaTime);
            // While gathering, don't look for new targets
            return;
        }


        // Find potential target
        const targetInfo = this.findInteractableTarget();

        // Update UI Prompt and handle interaction press
        if (targetInfo && targetInfo.instance && targetInfo.instance.userData.isInteractable) {
             // Check if target changed
             if (this.currentTarget !== targetInfo.instance) {
                 this.currentTarget = targetInfo.instance;
                 this.currentTargetMesh = targetInfo.mesh; // Store the mesh reference
                 const promptText = this.currentTarget.userData.prompt || "Press E to interact";
                 this.showPrompt(promptText);
             }

            // Check for interaction key press AFTER updating the target
            if (this.controls.consumeInteraction()) {
                this.tryInteract(this.currentTarget, this.currentTargetMesh);
            }
        } else {
            // No target found or target is not interactable
            if (this.currentTarget) {
                this.currentTarget = null;
                this.currentTargetMesh = null;
                this.hidePrompt();
            }
        }
    }

    findInteractableTarget() {
        // Option 1: Raycast from camera center (crosshair aiming)
        this.raycaster.setFromCamera({ x: 0, y: 0 }, this.camera); // {x: 0, y: 0} is center of screen
        this.raycaster.far = this.interactionDistance;

        // Collect all potential THREE.Object3D instances from our interactable list
         const meshesToCheck = this.interactableEntities
             .map(item => item.mesh ? item.mesh : (item instanceof THREE.Object3D ? item : null))
             .filter(mesh => mesh && mesh.userData && mesh.userData.isInteractable && mesh.visible !== false);

        let closestHit = null;
        const intersects = this.raycaster.intersectObjects(meshesToCheck, true); // Check recursively

        if (intersects.length > 0) {
            // Find the root interactable object for the closest valid hit
            for (const intersect of intersects) {
                let hitObject = intersect.object;
                let rootInteractableMesh = null;
                let rootInstance = null;

                // Traverse up to find the object with the entityReference
                while (hitObject) {
                    if (hitObject.userData && hitObject.userData.entityReference && hitObject.userData.isInteractable) {
                        rootInteractableMesh = hitObject;
                        rootInstance = hitObject.userData.entityReference;
                        break; // Found the interactable root
                    }
                    hitObject = hitObject.parent;
                }

                // If found, check angle and distance
                if (rootInstance && rootInstance.userData.isInteractable) {
                     // Check angle between camera forward and vector to object center/hit point
                     this.camera.getWorldDirection(_camDir);
                     const targetPoint = intersect.point; // Use precise hit point
                     _objDir.copy(targetPoint).sub(this.camera.position).normalize();
                     const angle = _camDir.angleTo(_objDir);

                     if (angle < this.aimTolerance) {
                         // Found a valid target via raycast
                         closestHit = {
                             mesh: rootInteractableMesh,
                             instance: rootInstance,
                             point: intersect.point,
                             distance: intersect.distance
                         };
                         break; // Use the first valid hit (closest)
                     }
                }
            }
        }

        // Return if raycast found a target
        if (closestHit) {
            return closestHit;
        }

        // Fallback: Check proximity if raycasting fails
         const nearby = this.findNearbyInteractable();
         if(nearby) {
             _objPos.copy(nearby.mesh ? nearby.mesh.position : nearby.position);
             return {
                 mesh: nearby.mesh || nearby, // Mesh or the object itself if no mesh
                 instance: nearby,
                 point: _objPos, // Approximate point
                 distance: this.player.mesh.position.distanceTo(_objPos)
                };
         }


        return null; // No target found
    }

     findNearbyInteractable() {
         this.player.mesh.getWorldPosition(_playerPos);
         let closestDistSq = this.interactionDistance * this.interactionDistance;
         let closestInstance = null;

         this.interactableEntities.forEach(item => {
             // Skip if not interactable or is self
             if (!item || !item.userData || !item.userData.isInteractable || item === this.player) return;
             // Skip simple objects that became inactive
             if (item.userData.isSimpleObject && !item.isActive) return;

             const objMesh = item.mesh || (item instanceof THREE.Object3D ? item : null);
              if (!objMesh || objMesh.visible === false) return; // Skip if no visible mesh

             objMesh.getWorldPosition(_objPos);
             const distSq = _playerPos.distanceToSquared(_objPos);

             if (distSq < closestDistSq) {
                 // Check if object is roughly in front of the player
                 this.player.mesh.getWorldDirection(_playerDir);
                 _objDir.copy(_objPos).sub(_playerPos).normalize();
                 const angle = _playerDir.angleTo(_objDir);

                 if (angle < Math.PI / 2.5) { // Check if within ~72 degrees forward arc
                     closestDistSq = distSq;
                     closestInstance = item;
                 }
             }
         });
         return closestInstance;
     }


    tryInteract(targetInstance, targetMesh) {
         if (!targetInstance || !targetMesh || !targetInstance.userData.isInteractable) {
             console.warn("Attempted interaction with invalid target:", targetInstance);
             return;
         }

         // Check distance again just to be sure
         const distance = this.player.mesh.position.distanceTo(targetMesh.position);
         if (distance > this.interactionDistance * 1.1) { // Allow slight tolerance
            console.log("Target too far away.");
            this.hidePrompt(); // Hide prompt if target moved away
            this.currentTarget = null;
            this.currentTargetMesh = null;
            return;
         }


         const interactionType = targetInstance.userData.interactionType;
         console.log(`Attempting interaction: ${interactionType} with ${targetInstance.name || targetInstance.id}`);

         // Use the instance's interact method if it exists
         if (typeof targetInstance.interact === 'function') {
            const result = targetInstance.interact(this.player, this.inventory, this.eventLog);
            // Handle results based on type (e.g., for petting, simple retrieve)
            if (result) {
                this.handleInteractionResult(result);
                // If interaction made the object non-interactable (e.g. retrieved item)
                if (!targetInstance.userData.isInteractable) {
                    this.currentTarget = null;
                    this.currentTargetMesh = null;
                    this.hidePrompt();
                }
            }

         }
         // Handle specific types known by the interaction system (Gather, Open)
         else if (interactionType === 'gather' && targetInstance.userData.resource) {
             this.startGatherAction(targetInstance);
         } else if (interactionType === 'open' && targetInstance.userData.loot) {
             this.handleOpenAction(targetInstance, targetMesh);
         } else {
             console.warn("Unknown interaction type or missing interact method:", interactionType, targetInstance);
         }
    }

    handleInteractionResult(result) {
        if (!result) return;

         switch(result.type) {
            case 'reward':
                if (result.item) {
                    if (this.inventory.addItem(result.item.name, result.item.amount)) {
                        const msg = result.message || `Received ${result.item.amount} ${result.item.name}.`;
                        if(this.eventLog) this.eventLog.addEntry(msg);
                        this.showPrompt(msg, 3000);
                    } else {
                        const failMsg = `Found ${result.item.name}, but inventory is full!`;
                        if(this.eventLog) this.eventLog.addEntry(failMsg);
                        this.showPrompt(failMsg, 3000);
                    }
                }
                break;
            case 'message':
                if (result.message) {
                    if(this.eventLog) this.eventLog.addEntry(result.message);
                    this.showPrompt(result.message, 2000);
                }
                break;
            case 'dialogue': // From NPC
                if (result.text) {
                    // Event log entry already handled by NPC.interact
                    this.showPrompt(`${targetInstance.name}: ${result.text}`, 4000); // Show dialogue briefly
                }
                break;
            case 'item_retrieved':
                // Already handled in InteractableObject.interact, prompt hides automatically
                break;
            case 'error':
                if (result.message) {
                    if(this.eventLog) this.eventLog.addEntry(`Error: ${result.message}`);
                    this.showPrompt(result.message, 2000);
                }
                break;
             default:
                 console.log("Unhandled interaction result type:", result.type);
                 break;
         }

         // Deselect target after most interactions unless it's an ongoing one like gather
          if (result.type !== 'gather_start') { // Need a type for starting gather
                // Deselect target to allow prompt to update or hide
                // Only clear if the interaction didn't immediately lead to another state (like gather)
                 // Let the main update loop handle clearing the target naturally if needed
                 // this.currentTarget = null;
                 // this.currentTargetMesh = null;
                 // Don't hide prompt if timed
                 // if (!this.promptTimeout) this.hidePrompt();
          }

    }


    startGatherAction(targetInstance) {
        if (this.activeGather) return; // Already gathering something

        const resource = targetInstance.userData.resource;
        const gatherTime = targetInstance.userData.gatherTime || 2000; // Default 2s

        this.activeGather = {
            targetInstance: targetInstance,
            startTime: performance.now(),
            duration: gatherTime,
            resource: resource
        };

        this.showPrompt(`Gathering ${resource}... (0%)`);
        console.log(`Started gathering ${resource}`);
         if(this.eventLog) this.eventLog.addEntry(`Started gathering ${resource}...`);

        // TODO: Player should probably play an interacting animation
        this.player.velocity.x = 0; // Stop player horizontal movement
        this.player.velocity.z = 0;
    }

    updateGatherAction(deltaTime) {
        if (!this.activeGather) return;

        const elapsedTime = performance.now() - this.activeGather.startTime;
        const progress = Math.min(1, elapsedTime / this.activeGather.duration);

        // Update prompt with progress
        this.showPrompt(`Gathering ${this.activeGather.resource}... (${Math.round(progress * 100)}%)`);

        if (progress >= 1) {
            this.completeGatherAction();
        }
    }

    completeGatherAction() {
        if (!this.activeGather) return;
        const { resource, targetInstance } = this.activeGather;
        console.log(`Finished gathering ${resource}`);

        if (this.inventory.addItem(resource, 1)) {
             if(this.eventLog) this.eventLog.addEntry(`Gathered 1 ${resource}.`);

            // Optional: Make resource node temporarily depleted or remove it
            // This logic could be on the targetInstance itself
            if (targetInstance.userData.isDepletable) { // Add this flag to trees/rocks if needed
                targetInstance.userData.isInteractable = false;
                targetInstance.mesh.visible = false; // Hide
                const respawnTime = targetInstance.userData.respawnTime || 15000; // Default 15s
                 setTimeout(() => {
                     if (targetInstance && targetInstance.mesh) { // Check if still valid
                        targetInstance.mesh.visible = true;
                        targetInstance.userData.isInteractable = true;
                        console.log(`${resource} node respawned.`);
                     }
                 }, respawnTime);
            } else if (targetInstance.userData.isSimpleObject) {
                // Simple objects might just be removed permanently
                targetInstance.removeFromWorld();
            }


        } else {
             if(this.eventLog) this.eventLog.addEntry(`Inventory full, could not gather ${resource}.`);
        }

        this.activeGather = null;
        this.hidePrompt(); // Hide gather prompt, allowing normal prompts again
        this.currentTarget = null; // Clear target after gathering
        this.currentTargetMesh = null;
    }

     cancelGatherAction() {
          if(!this.activeGather) return;
          const resource = this.activeGather.resource;
          console.log(`Gathering ${resource} cancelled.`);
          if(this.eventLog) this.eventLog.addEntry(`Gathering ${resource} cancelled.`);
          this.activeGather = null;
          this.hidePrompt();
          // Target remains the currentTarget, prompt will reappear on next update if still looking
     }


    handleOpenAction(targetInstance, targetMesh) {
         // Chest logic moved mostly to environment.js createChest's update function
         // This just handles the initial trigger and loot distribution

         if (targetInstance.userData.isOpen) {
              console.log("Chest is already open.");
              if(this.eventLog) this.eventLog.addEntry("The chest is empty.");
              this.showPrompt("Chest is empty", 2000);
              return;
         }

         console.log("Opening chest...");
         if(this.eventLog) this.eventLog.addEntry("You open the chest...");
         targetInstance.userData.isOpen = true;
         targetInstance.userData.targetAngle = targetInstance.userData.openAngle; // Trigger lid animation via chest's own update

          // Disable further interaction immediately
         targetInstance.userData.isInteractable = false;
         targetInstance.userData.prompt = "Empty Chest"; // Change prompt if targeted again

         const loot = targetInstance.userData.loot || {};
         let lootMessages = [];
         let itemsFound = false;

         Object.entries(loot).forEach(([itemName, amount]) => {
             if (amount > 0 && this.inventory.addItem(itemName, amount)) {
                 lootMessages.push(`Found ${amount} ${itemName}`);
                 itemsFound = true;
             } else if (amount > 0) {
                 lootMessages.push(`Found ${amount} ${itemName}, but inventory is full!`);
                 itemsFound = true;
                 // TODO: Drop item on ground? Needs item drop system.
             }
         });

         // Clear loot after giving it out to prevent reopening exploit if state isn't saved
         targetInstance.userData.loot = {};

         let finalMessage = "The chest is empty.";
         if (itemsFound) {
            finalMessage = lootMessages.join('. ');
         }

         if(this.eventLog) this.eventLog.addEntry(finalMessage + ".");
         this.showPrompt(finalMessage, 3000); // Show message briefly


          // Ensure the target is deselected after interaction
          this.currentTarget = null;
          this.currentTargetMesh = null;
          // Prompt will hide automatically due to timer or target change
    }

    // Pet action handled via generic interact call and result handling now


    showPrompt(text, duration = null) {
        if (!this.interactionPromptElement) return;
        // Don't overwrite gathering prompt unless forcing a timed message
        if (this.activeGather && !duration) return;

        this.interactionPromptElement.textContent = text;
        this.interactionPromptElement.style.display = 'block';

        // Clear previous timeout if setting a new one or showing persistent prompt
        clearTimeout(this.promptTimeout);
        this.promptTimeout = null;

        // If duration is set, hide after timeout
        if (duration && duration > 0) {
             this.promptTimeout = setTimeout(() => {
                 // Only hide if the prompt text hasn't changed since timeout was set
                 if (this.interactionPromptElement.textContent === text) {
                     this.hidePrompt();
                 }
             }, duration);
        }
    }

    hidePrompt() {
        if (!this.interactionPromptElement) return;
        // Only hide if not currently gathering or showing a timed prompt
        if (!this.activeGather && !this.promptTimeout) {
             this.interactionPromptElement.style.display = 'none';
             this.interactionPromptElement.textContent = '';
        }
        // Also hide if timed prompt is active but target is lost
         else if (this.promptTimeout && !this.currentTarget) {
              clearTimeout(this.promptTimeout);
              this.promptTimeout = null;
              this.interactionPromptElement.style.display = 'none';
              this.interactionPromptElement.textContent = '';
         }
    }
}