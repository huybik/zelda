// Manages the player's active and completed quests
export class QuestLog {
    constructor() {
        this.quests = {}; // { questId: { data, status: 'available'/'active'/'completed'/'failed' } }
        this.onChangeCallbacks = [];
    }

     // Called by NPC when offering a quest
     offerQuest(questId, questData) {
         if (!this.quests[questId]) {
             this.quests[questId] = {
                 data: questData,
                 status: 'available' // Mark as offered but not yet accepted
             };
             console.log(`Quest offered: ${questData.title}`);
             this.notifyChange();
             // In a UI, this might show a prompt "Accept Quest Y/N?"
             // For simplicity, let's auto-accept for now or require another interaction
             this.acceptQuest(questId); // Auto-accept
         } else {
              console.log(`Quest ${questId} already known.`);
         }
     }


    // Called when player accepts a quest
    acceptQuest(questId) {
        if (this.quests[questId] && this.quests[questId].status === 'available') {
            this.quests[questId].status = 'active';
            console.log(`Quest accepted: ${this.quests[questId].data.title}`);
            this.notifyChange();
            // Add to event log via callback or direct call if reference exists
            return true;
        }
         console.log(`Cannot accept quest ${questId}. Status: ${this.quests[questId]?.status}`);
        return false;
    }

    // Check if all objectives for a quest are met
    checkQuestCompletion(questId, inventory) {
        const quest = this.quests[questId];
        if (!quest || quest.status !== 'active') return false;

        for (const objective of quest.data.objectives) {
            if (objective.type === 'gather' || objective.type === 'retrieve') {
                if (!inventory.hasItem(objective.item, objective.amount)) {
                    return false; // Objective not met
                }
            }
             // Add checks for other objective types ('kill', 'explore', 'talk_to') here
             // else if (objective.type === 'explore') { ... check if location visited flag is set ... }
        }
        return true; // All objectives met
    }

     // Get a string describing current progress
     getQuestProgress(questId, inventory) {
         const quest = this.quests[questId];
         if (!quest || quest.status !== 'active') return "Quest not active.";

         let progressText = [];
         for (const objective of quest.data.objectives) {
             if (objective.type === 'gather' || objective.type === 'retrieve') {
                  const currentAmount = inventory.countItem(objective.item);
                  const requiredAmount = objective.amount;
                  progressText.push(`${objective.item}: ${Math.min(currentAmount, requiredAmount)} / ${requiredAmount}`);
             }
              // Add progress for other types
         }
         return progressText.join(', ');
     }

    // Called by NPC when player turns in a completed quest
    completeQuest(questId, inventory) {
        const quest = this.quests[questId];
        if (!quest || quest.status !== 'active') {
             console.warn(`Attempted to complete non-active quest: ${questId}`);
             return false;
        }

        if (!this.checkQuestCompletion(questId, inventory)) {
            console.warn(`Attempted to complete quest ${questId} but objectives not met.`);
            return false;
        }

        console.log(`Completing quest: ${quest.data.title}`);

        // 1. Remove required items (if any)
        quest.data.objectives.forEach(objective => {
            if (objective.type === 'gather') { // Only remove 'gather' items, not 'retrieve' items usually
                inventory.removeItem(objective.item, objective.amount);
            }
        });

        // 2. Grant rewards
        const reward = quest.data.reward || {};
        if (reward.gold) {
            inventory.addItem('gold', reward.gold);
             console.log(`Received ${reward.gold} gold.`);
        }
        if (reward.items) {
            reward.items.forEach(item => {
                inventory.addItem(item.name, item.amount);
                 console.log(`Received ${item.amount} ${item.name}.`);
            });
        }
        // Add XP, reputation etc. here if implemented

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

    // Get all active quests
    getActiveQuests() {
        return Object.values(this.quests).filter(q => q.status === 'active');
    }
     // Get all completed quests
     getCompletedQuests() {
        return Object.values(this.quests).filter(q => q.status === 'completed');
     }
      // Get all quests (for display)
      getAllQuests() {
         return Object.values(this.quests);
      }


    // --- Save/Load ---
    getSaveData() {
        // Only save essential quest status, not full data object if data is static
        const saveData = {};
         Object.entries(this.quests).forEach(([id, quest]) => {
             saveData[id] = quest.status;
         });
        return saveData;
    }

    loadSaveData(saveData, allQuestDefinitions) {
         this.quests = {}; // Reset quests
         Object.entries(saveData).forEach(([id, status]) => {
             if (allQuestDefinitions[id]) { // Ensure the quest definition still exists
                 this.quests[id] = {
                     data: allQuestDefinitions[id], // Link back to the static data
                     status: status
                 };
             } else {
                 console.warn(`Quest definition not found for saved quest ID: ${id}`);
             }
         });
         this.notifyChange();
         console.log("Quest log loaded.");
     }


    // --- Callbacks for UI updates ---
    onChange(callback) {
        this.onChangeCallbacks.push(callback);
    }

    notifyChange() {
        this.onChangeCallbacks.forEach(cb => cb(this.getAllQuests()));
    }
}


// Simple log for tracking game events (finding items, alerts, etc.)
export class EventLog {
     constructor(maxEntries = 50) {
         this.entries = [];
         this.maxEntries = maxEntries;
         this.onChangeCallbacks = [];
     }

     addEntry(message) {
         const timestamp = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit'});
         const entry = `[${timestamp}] ${message}`;
         this.entries.push(entry);
         if (this.entries.length > this.maxEntries) {
             this.entries.shift(); // Remove oldest entry
         }
         console.log("Event Log:", entry); // Log to console as well
         this.notifyChange();
     }

     getEntries() {
         return [...this.entries].reverse(); // Return newest entries first
     }

     // --- Callbacks for UI updates ---
     onChange(callback) {
         this.onChangeCallbacks.push(callback);
     }

     notifyChange() {
         this.onChangeCallbacks.forEach(cb => cb(this.getEntries()));
     }
}