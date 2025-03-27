// Manages the player's active and completed quests
export class QuestLog {
    constructor(allQuestDefinitions = {}) {
        this.quests = {}; // { questId: { data: {...}, status: 'unknown'/'available'/'active'/'completed'/'failed' } }
        this.allQuestDefinitions = allQuestDefinitions; // Reference to static quest data
        this.onChangeCallbacks = [];
    }

     // Add static quest definitions (e.g., loaded from a file)
     addQuestDefinitions(definitions) {
        this.allQuestDefinitions = { ...this.allQuestDefinitions, ...definitions };
     }

     // Get the static data for a quest
     getQuestData(questId) {
        return this.allQuestDefinitions[questId] || null;
     }

     // Called by NPC (or script) when a quest becomes available to the player
     makeQuestAvailable(questId) {
         if (!this.allQuestDefinitions[questId]) {
             console.warn(`Quest definition not found for ID: ${questId}`);
             return false;
         }
         if (!this.quests[questId]) {
             this.quests[questId] = {
                 data: this.allQuestDefinitions[questId], // Link static data
                 status: 'available'
             };
             console.log(`Quest now available: ${this.quests[questId].data.title}`);
             this.notifyChange();
             return true;
         } else if (this.quests[questId].status === 'unknown') {
             // If quest existed but was unknown, mark as available
             this.quests[questId].status = 'available';
             console.log(`Quest status changed to available: ${this.quests[questId].data.title}`);
             this.notifyChange();
             return true;
         }
         // console.log(`Quest ${questId} was already known.`);
         return false;
     }

     // Called by NPC or UI when offering a quest (transition from available -> offered?)
     // Currently simplified: NPC interaction directly offers if status is 'available'.
     offerQuest(questId, questData) {
        // This function might be redundant if makeQuestAvailable is used first.
        // Let's ensure the quest is known and available.
        this.makeQuestAvailable(questId); // Ensure it's at least available

        if (this.quests[questId] && this.quests[questId].status === 'available') {
            // console.log(`Offering quest: ${questData.title}`);
            // State remains 'available' until accepted.
            // The interaction system / UI should handle the actual acceptance step.
            return true; // Indicate offer is valid
        }
        // console.log(`Cannot offer quest ${questId}. Status: ${this.getQuestStatus(questId)}`);
        return false;
     }


    // Called when player accepts a quest (e.g., via UI or dialogue confirmation)
    acceptQuest(questId) {
        if (this.quests[questId] && this.quests[questId].status === 'available') {
            this.quests[questId].status = 'active';
            console.log(`Quest accepted: ${this.quests[questId].data.title}`);
            this.notifyChange();
            // Add to event log via callback or reference if needed
            return true;
        }
         console.log(`Cannot accept quest ${questId}. Status: ${this.getQuestStatus(questId)}`);
        return false;
    }

    // Check if all objectives for a quest are met
    // Requires reference to player inventory (and potentially other game state systems)
    checkQuestCompletion(questId, inventory /*, otherGameState */) {
        const quest = this.quests[questId];
        if (!quest || quest.status !== 'active') return false;
        if (!inventory) {
             console.error("Inventory reference missing for quest completion check!");
             return false;
        }

        for (const objective of quest.data.objectives) {
            switch (objective.type) {
                case 'gather': // Items player must collect (and usually turn in)
                case 'retrieve': // Items player must find/possess (might not be turned in)
                    if (!inventory.hasItem(objective.item, objective.amount)) {
                        return false; // Objective not met
                    }
                    break;
                case 'kill':
                    // Requires tracking kill counts externally (e.g., in player stats or game state)
                    // if (!otherGameState.getKillCount(objective.target) >= objective.amount) {
                    //    return false;
                    // }
                    console.warn(`Kill objective check not implemented for quest ${questId}`);
                    // return false; // Assume not implemented = not complete
                    break;
                 case 'explore':
                    // Requires tracking visited locations externally
                    // if (!otherGameState.hasVisited(objective.locationId)) {
                    //     return false;
                    // }
                     console.warn(`Explore objective check not implemented for quest ${questId}`);
                    // return false;
                    break;
                 case 'talk_to':
                    // Requires tracking NPC interaction flags externally
                    // if (!otherGameState.hasTalkedTo(objective.npcId)) {
                    //     return false;
                    // }
                     console.warn(`Talk_to objective check not implemented for quest ${questId}`);
                     // return false;
                     break;
                default:
                    console.warn(`Unknown objective type "${objective.type}" in quest ${questId}`);
                    return false; // Unknown objective type cannot be completed
            }
        }
        return true; // All objectives met
    }

     // Get a string describing current progress
     getQuestProgress(questId, inventory /*, otherGameState */) {
         const quest = this.quests[questId];
         if (!quest) return "Quest unknown.";
         if (quest.status !== 'active') return `(${quest.status})`;
         if (!inventory) return "Cannot check progress (no inventory).";


         let progressText = [];
         for (const objective of quest.data.objectives) {
              let current = 0;
              let required = objective.amount || 1; // Default required amount to 1

             switch (objective.type) {
                 case 'gather':
                 case 'retrieve':
                      current = inventory.countItem(objective.item);
                      progressText.push(`${objective.item}: ${Math.min(current, required)} / ${required}`);
                      break;
                  case 'kill':
                      // current = otherGameState.getKillCount(objective.target);
                      progressText.push(`${objective.target || 'enemies'}: ${current} / ${required}`);
                      break;
                   case 'explore':
                       // current = otherGameState.hasVisited(objective.locationId) ? 1 : 0;
                       progressText.push(`Explore ${objective.locationHint || objective.locationId}: ${current} / ${required}`);
                       break;
                   case 'talk_to':
                        // current = otherGameState.hasTalkedTo(objective.npcId) ? 1 : 0;
                       progressText.push(`Talk to ${objective.npcName || objective.npcId}: ${current} / ${required}`);
                       break;
                 default:
                     progressText.push(`${objective.type}: ? / ?`);
                     break;
             }
         }
         return progressText.length > 0 ? progressText.join(', ') : "No objectives defined.";
     }

    // Called by NPC (or script) when player turns in a completed quest
    completeQuest(questId, inventory /*, otherGameState */) {
        const quest = this.quests[questId];
        if (!quest || quest.status !== 'active') {
             console.warn(`Attempted to complete non-active quest: ${questId}`);
             return false;
        }
        if (!inventory) {
             console.error("Inventory reference missing for quest completion!");
             return false;
        }

        if (!this.checkQuestCompletion(questId, inventory /*, otherGameState */)) {
            console.warn(`Attempted to complete quest ${questId} but objectives not met.`);
            return false;
        }

        console.log(`Completing quest: ${quest.data.title}`);

        // 1. Remove required items (check objective flag if needed)
        quest.data.objectives.forEach(objective => {
            // Only remove 'gather' items by default, unless 'turnIn' flag exists
            if ((objective.type === 'gather' || objective.turnIn) && objective.item && objective.amount > 0) {
                if (!inventory.removeItem(objective.item, objective.amount)) {
                    console.warn(`Failed to remove required item ${objective.item} x${objective.amount} for quest ${questId}. Continuing anyway...`);
                    // Decide if completion should fail here. For now, let it continue.
                }
            }
        });

        // 2. Grant rewards
        const reward = quest.data.reward || {};
        if (reward.gold) {
            inventory.addItem('gold', reward.gold);
             console.log(`Received ${reward.gold} gold.`);
             // TODO: Add to event log
        }
        if (reward.items) {
            reward.items.forEach(item => {
                if (!inventory.addItem(item.name, item.amount)) {
                    console.warn(`Inventory full. Could not grant reward item ${item.name} x${item.amount}`);
                    // TODO: Drop item? Add to event log about full inventory.
                } else {
                    console.log(`Received ${item.amount} ${item.name}.`);
                    // TODO: Add to event log
                }
            });
        }
        // Grant XP, reputation etc. here if implemented
        // if (reward.xp) { otherGameState.addExperience(reward.xp); }

        // 3. Update quest status
        quest.status = 'completed';
        this.notifyChange();
        console.log(`Quest ${questId} completed!`);
        return true;
    }

    // Get status of a specific quest
    getQuestStatus(questId) {
        return this.quests[questId]?.status || 'unknown';
    }

    // Get data for all known quests, regardless of status
    getAllKnownQuests() {
        return Object.values(this.quests);
    }

    // Get quests filtered by status
    getQuestsByStatus(status) {
        return Object.values(this.quests).filter(q => q.status === status);
    }
    getActiveQuests() { return this.getQuestsByStatus('active'); }
    getCompletedQuests() { return this.getQuestsByStatus('completed'); }
    getAvailableQuests() { return this.getQuestsByStatus('available'); }


    // --- Save/Load ---
    getSaveData() {
        // Only save status of known quests
        const saveData = {};
         Object.entries(this.quests).forEach(([id, quest]) => {
             saveData[id] = quest.status; // Save only the status string
             // Optionally save progress counters if needed for complex quests
         });
        return saveData;
    }

    loadSaveData(saveData) {
         this.quests = {}; // Reset quests
         if (!saveData) return;

         Object.entries(saveData).forEach(([id, status]) => {
             const definition = this.allQuestDefinitions[id];
             if (definition) { // Ensure the quest definition still exists
                 this.quests[id] = {
                     data: definition, // Link back to the static data
                     status: status
                     // TODO: Load progress counters if saved
                 };
             } else {
                 console.warn(`Quest definition not found for saved quest ID: ${id}. Skipping.`);
             }
         });
         this.notifyChange();
         console.log("Quest log loaded.");
     }


    // --- Callbacks for UI updates ---
    onChange(callback) {
        if (typeof callback === 'function') {
            this.onChangeCallbacks.push(callback);
        }
    }
    removeOnChange(callback) {
        this.onChangeCallbacks = this.onChangeCallbacks.filter(cb => cb !== callback);
    }

    notifyChange() {
        // Pass all known quests to listeners
        const allQuests = this.getAllKnownQuests();
        this.onChangeCallbacks.forEach(cb => {
             try {
                 cb(allQuests);
             } catch (error) {
                 console.error("Error in questLog onChange callback:", error);
             }
        });
    }
}


// Simple log for tracking game events (finding items, alerts, dialogue hints, etc.)
export class EventLog {
     constructor(maxEntries = 50) {
         this.entries = [];
         this.maxEntries = Math.max(1, maxEntries); // Ensure at least 1 entry
         this.onChangeCallbacks = [];
     }

     addEntry(message) {
         if (!message || typeof message !== 'string') return;

         const timestamp = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit'});
         const entry = { timestamp, message }; // Store as object
         this.entries.push(entry);
         // Remove oldest entry if exceeding max size
         if (this.entries.length > this.maxEntries) {
             this.entries.shift();
         }
         console.log("Event Log:", `[${timestamp}] ${message}`); // Log to console as well
         this.notifyChange();
     }

     // Get entries, newest first
     getEntries() {
         return [...this.entries].reverse();
     }

     // Get entries as formatted strings, newest first
     getFormattedEntries() {
          return this.getEntries().map(entry => `[${entry.timestamp}] ${entry.message}`);
     }


     // --- Callbacks for UI updates ---
     onChange(callback) {
        if (typeof callback === 'function') {
             this.onChangeCallbacks.push(callback);
        }
     }
     removeOnChange(callback) {
        this.onChangeCallbacks = this.onChangeCallbacks.filter(cb => cb !== callback);
    }

     notifyChange() {
         // Pass formatted entries (newest first) to listeners
         const formattedEntries = this.getFormattedEntries();
         this.onChangeCallbacks.forEach(cb => {
            try {
                cb(formattedEntries);
            } catch (error) {
                console.error("Error in eventLog onChange callback:", error);
            }
         });
     }

     // --- Save/Load (Optional) ---
     getSaveData() {
        // Save recent entries (maybe fewer than maxEntries for smaller save file)
        const entriesToSave = 20;
        return this.entries.slice(-entriesToSave); // Save last N entries
     }
     loadSaveData(savedEntries) {
        if (Array.isArray(savedEntries)) {
            // Basic load: just replace current entries
            this.entries = savedEntries.slice(-this.maxEntries); // Ensure max size isn't exceeded
            this.notifyChange();
            console.log("Event log loaded.");
        }
     }
}