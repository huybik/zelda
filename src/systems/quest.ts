import { Inventory } from './inventory';
import { QuestData, QuestState, QuestStatus, EventEntry } from '../types/common';

// --- Quest Log ---
export class QuestLog {
    // Stores the runtime state of quests { questId: QuestState }
    private quests: Record<string, QuestState>;
    // Reference to static definitions (e.g., loaded from JSON)
    private allQuestDefinitions: Record<string, QuestData>;
    private onChangeCallbacks: Array<(quests: QuestState[]) => void>;

    constructor(allQuestDefinitions: Record<string, QuestData> = {}) {
        this.quests = {};
        this.allQuestDefinitions = allQuestDefinitions;
        this.onChangeCallbacks = [];
    }

    /** Adds or updates static quest definitions. */
    public addQuestDefinitions(definitions: Record<string, QuestData>): void {
        this.allQuestDefinitions = { ...this.allQuestDefinitions, ...definitions };
        // Potentially update existing quest states if definition changed? (optional)
    }

    /** Retrieves the static data definition for a quest. */
    public getQuestData(questId: string): QuestData | null {
        return this.allQuestDefinitions[questId] ?? null;
    }

    /** Marks a quest as available to the player (e.g., upon meeting NPC). */
    public makeQuestAvailable(questId: string): boolean {
        const definition = this.getQuestData(questId);
        if (!definition) {
            console.warn(`Quest definition not found for ID: ${questId}`);
            return false;
        }
        const currentState = this.quests[questId];
        if (!currentState || currentState.status === 'unknown') {
            this.quests[questId] = {
                data: definition,
                status: 'available'
            };
            console.log(`Quest now available: ${definition.title}`);
            this.notifyChange();
            return true;
        }
        return false; // Already known and not in 'unknown' state
    }

    /** Attempts to accept an available quest. */
    public acceptQuest(questId: string): boolean {
        const quest = this.quests[questId];
        if (quest?.status === 'available') {
            quest.status = 'active';
            console.log(`Quest accepted: ${quest.data.title}`);
            this.notifyChange();
            return true;
        }
        console.warn(`Cannot accept quest ${questId}. Status: ${this.getQuestStatus(questId)}`);
        return false;
    }

    /** Checks if all objectives for an active quest are met. */
    public checkQuestCompletion(questId: string, inventory: Inventory | null /*, otherGameState */): boolean {
        const quest = this.quests[questId];
        if (!quest || quest.status !== 'active') return false;
        if (!inventory) {
            console.error("Inventory reference missing for quest completion check!");
            return false;
        }

        for (const objective of quest.data.objectives) {
            let isComplete = false;
            switch (objective.type) {
                case 'gather':
                case 'retrieve':
                    isComplete = inventory.hasItem(objective.item!, objective.amount ?? 1);
                    break;
                case 'kill':
                    // Requires external kill tracking system
                    console.warn(`Kill objective check not implemented for quest ${questId}`);
                    // isComplete = otherGameState.getKillCount(objective.target) >= (objective.amount ?? 1);
                    isComplete = false; // Assume false if not implemented
                    break;
                case 'explore':
                    console.warn(`Explore objective check not implemented for quest ${questId}`);
                    isComplete = false;
                    break;
                case 'talk_to':
                    console.warn(`Talk_to objective check not implemented for quest ${questId}`);
                    isComplete = false;
                    break;
                default:
                    console.warn(`Unknown objective type "${objective.type}" in quest ${questId}`);
                    return false; // Cannot complete unknown objective
            }
            if (!isComplete) return false; // If any objective is incomplete, the quest is incomplete
        }
        return true; // All objectives met
    }

    /** Generates a string describing the current progress of an active quest. */
    public getQuestProgress(questId: string, inventory: Inventory | null /*, otherGameState */): string {
        const quest = this.quests[questId];
        if (!quest) return "Quest unknown.";
        if (quest.status !== 'active') return `(${quest.status})`;
        if (!inventory) return "Cannot check progress (no inventory).";

        const progressParts = quest.data.objectives.map(objective => {
            let current = 0;
            const required = objective.amount ?? 1;
            switch (objective.type) {
                case 'gather':
                case 'retrieve':
                    current = inventory.countItem(objective.item!);
                    return `${objective.item}: ${Math.min(current, required)} / ${required}`;
                case 'kill':
                    // current = otherGameState.getKillCount(objective.target);
                    return `${objective.target ?? 'enemies'}: ${current} / ${required}`;
                case 'explore':
                    // current = otherGameState.hasVisited(objective.locationId) ? 1 : 0;
                    return `Explore ${objective.locationHint ?? objective.locationId ?? 'area'}: ${current} / ${required}`;
                case 'talk_to':
                    // current = otherGameState.hasTalkedTo(objective.npcId) ? 1 : 0;
                    return `Talk to ${objective.npcName ?? objective.npcId ?? 'NPC'}: ${current} / ${required}`;
                default:
                    return `${objective.type}: ? / ?`;
            }
        });
        return progressParts.length > 0 ? progressParts.join(', ') : "No objectives defined.";
    }

    /** Attempts to complete an active quest (turn in). */
    public completeQuest(questId: string, inventory: Inventory | null /*, otherGameState */): boolean {
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

        // 1. Remove required items (if flagged)
        let itemsRemovedSuccessfully = true;
        quest.data.objectives.forEach(objective => {
            if (objective.turnIn && objective.item && objective.amount && objective.amount > 0) {
                if (!inventory.removeItem(objective.item, objective.amount)) {
                    console.error(`CRITICAL: Failed to remove required item ${objective.item} x${objective.amount} for quest ${questId}! Completion failed.`);
                    // Maybe alert player?
                    itemsRemovedSuccessfully = false;
                }
            }
        });

        if (!itemsRemovedSuccessfully) return false; // Stop completion if items couldn't be removed

        // 2. Grant rewards
        const reward = quest.data.reward;
        if (reward) {
            if (reward.gold) inventory.addItem('gold', reward.gold);
            reward.items?.forEach(item => {
                if (!inventory.addItem(item.name, item.amount)) {
                    console.warn(`Inventory full. Could not grant reward: ${item.amount} ${item.name}`);
                    // TODO: Notify player, maybe drop item?
                }
            });
            // if (reward.xp) otherGameState.addExperience(reward.xp);
        }

        // 3. Update quest status
        quest.status = 'completed';
        this.notifyChange();
        console.log(`Quest ${questId} completed!`);
        return true;
    }

    /** Gets the status of a specific quest. */
    public getQuestStatus(questId: string): QuestStatus {
        return this.quests[questId]?.status ?? 'unknown';
    }

    /** Returns an array of all known quest states. */
    public getAllKnownQuests(): QuestState[] {
        return Object.values(this.quests);
    }

    /** Returns quests filtered by status. */
    public getQuestsByStatus(status: QuestStatus): QuestState[] {
        return Object.values(this.quests).filter(q => q.status === status);
    }
    public getActiveQuests(): QuestState[] { return this.getQuestsByStatus('active'); }
    public getCompletedQuests(): QuestState[] { return this.getQuestsByStatus('completed'); }
    public getAvailableQuests(): QuestState[] { return this.getQuestsByStatus('available'); }

    // --- Save/Load ---
    public getSaveData(): Record<string, QuestStatus> {
        const saveData: Record<string, QuestStatus> = {};
        Object.entries(this.quests).forEach(([id, questState]) => {
            saveData[id] = questState.status;
            // Optionally save progress counters here if needed
        });
        return saveData;
    }

    public loadSaveData(saveData: Record<string, QuestStatus> | null): void {
        this.quests = {}; // Reset
        if (!saveData) return;

        Object.entries(saveData).forEach(([id, status]) => {
            const definition = this.getQuestData(id);
            if (definition) {
                this.quests[id] = {
                    data: definition, // Link static data
                    status: status
                    // TODO: Load progress counters if saved
                };
            } else {
                console.warn(`Quest definition not found for saved quest ID: ${id}. Skipping load.`);
            }
        });
        this.notifyChange();
        console.log("Quest log loaded.");
    }

    // --- Callbacks for UI ---
    public onChange(callback: (quests: QuestState[]) => void): void {
        if (typeof callback === 'function') {
            this.onChangeCallbacks.push(callback);
        }
    }
    public removeOnChange(callback: (quests: QuestState[]) => void): void {
        this.onChangeCallbacks = this.onChangeCallbacks.filter(cb => cb !== callback);
    }

    private notifyChange(): void {
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


// --- Event Log ---
export class EventLog {
    private entries: EventEntry[];
    private readonly maxEntries: number;
    private onChangeCallbacks: Array<(entries: string[]) => void>;

    constructor(maxEntries: number = 50) {
        this.entries = [];
        this.maxEntries = Math.max(1, maxEntries);
        this.onChangeCallbacks = [];
    }

    public addEntry(message: string): void {
        if (!message || typeof message !== 'string') return;

        const timestamp = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        const entry: EventEntry = { timestamp, message };
        this.entries.push(entry);

        // Trim old entries if exceeding max size
        if (this.entries.length > this.maxEntries) {
            this.entries.shift();
        }
        console.log("Event Log:", `[${timestamp}] ${message}`);
        this.notifyChange();
    }

    /** Returns entries, newest first. */
    public getEntries(): EventEntry[] {
        return [...this.entries].reverse();
    }

    /** Returns entries as formatted strings, newest first. */
    public getFormattedEntries(): string[] {
        return this.getEntries().map(entry => `[${entry.timestamp}] ${entry.message}`);
    }

    // --- Callbacks for UI ---
    public onChange(callback: (entries: string[]) => void): void {
        if (typeof callback === 'function') {
            this.onChangeCallbacks.push(callback);
        }
    }
    public removeOnChange(callback: (entries: string[]) => void): void {
        this.onChangeCallbacks = this.onChangeCallbacks.filter(cb => cb !== callback);
    }

    private notifyChange(): void {
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
    public getSaveData(): EventEntry[] {
        // Save maybe the last 20 entries?
        return this.entries.slice(-20);
    }
    public loadSaveData(savedEntries: EventEntry[] | null): void {
        if (Array.isArray(savedEntries)) {
            // Replace current entries, ensure max size
            this.entries = savedEntries.slice(-this.maxEntries);
            this.notifyChange();
            console.log("Event log loaded.");
        }
    }
}