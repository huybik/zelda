
import { Inventory } from './inventory';
import { QuestData, QuestState, QuestStatus, EventEntry, Objective } from '../types/common';

// --- Quest Log ---
export class QuestLog {
    private quests: Record<string, QuestState> = {};
    private allQuestDefinitions: Record<string, QuestData> = {};
    private onChangeCallbacks: Array<(quests: QuestState[]) => void> = [];

    constructor(allQuestDefinitions: Record<string, QuestData> = {}) {
        this.allQuestDefinitions = allQuestDefinitions;
    }

    public addQuestDefinitions(definitions: Record<string, QuestData>): void {
        this.allQuestDefinitions = { ...this.allQuestDefinitions, ...definitions };
    }

    public getQuestData(questId: string): QuestData | null { return this.allQuestDefinitions[questId] ?? null; }

    public makeQuestAvailable(questId: string): boolean {
        const definition = this.getQuestData(questId);
        if (!definition) {
             console.error(`Quest definition not found for ID: ${questId}`);
             return false;
        }
        const currentState = this.quests[questId];
        if (!currentState || currentState.status === 'unknown') {
            this.quests[questId] = { data: definition, status: 'available' };
            console.log(`Quest available: ${definition.title}`);
            this.notifyChange(); return true;
        }
        return false; // Already known (or in a later state)
    }

    public acceptQuest(questId: string): boolean {
        const quest = this.quests[questId];
        if (quest?.status === 'available') {
            quest.status = 'active';
            console.log(`Quest accepted: ${quest.data.title}`);
            this.notifyChange(); return true;
        }
        console.warn(`Cannot accept quest ${questId}. Status: ${this.getQuestStatus(questId)}`);
        return false;
    }

    // FIX: Check inventory exists before use
    public checkQuestCompletion(questId: string, inventory: Inventory | null /*, otherState */): boolean {
        const quest = this.quests[questId];
        if (!quest || quest.status !== 'active' || !inventory) return false; // FIX: Added !inventory check

        return quest.data.objectives.every(obj => {
            const required = obj.amount ?? 1;
            switch (obj.type) {
                case 'gather': case 'retrieve':
                    if (!obj.item) { console.warn(`Quest ${questId} objective missing item name`); return false; }
                    return inventory.hasItem(obj.item, required);
                case 'kill': /* return otherState.getKillCount(obj.target) >= required; */
                     console.warn(`Kill objective type not implemented for quest ${questId}`);
                     return false; // Not implemented
                case 'explore': /* return otherState.hasVisited(obj.locationId); */
                     console.warn(`Explore objective type not implemented for quest ${questId}`);
                     return false; // Not implemented
                case 'talk_to': /* return otherState.hasTalkedTo(obj.npcId); */
                     console.warn(`Talk_to objective type not implemented for quest ${questId}`);
                     return false; // Not implemented
                default:
                    // Handle potential future exhaustive checks with a type assertion
                    const exhaustiveCheck: never = obj.type;
                    console.warn(`Unknown objective type: ${exhaustiveCheck} in quest ${questId}`);
                    return false;
            }
        });
    }

    // FIX: Check inventory exists before use
    public getQuestProgress(questId: string, inventory: Inventory | null /*, otherState */): string {
        const quest = this.quests[questId];
        if (!quest) return "Unknown";
        if (quest.status !== 'active') return `(${quest.status})`;
        if (!inventory) return `(${quest.status} - requires inventory check)`; // FIX: Handle null inventory

        if (quest.data.objectives.length === 0) return 'No objectives.';

        return quest.data.objectives.map(obj => this.getObjectiveProgressString(obj, inventory)).join(', ');
    }

    private getObjectiveProgressString(obj: Objective, inventory: Inventory): string {
        let current = 0; const required = obj.amount ?? 1;
        switch (obj.type) {
            case 'gather': case 'retrieve':
                if (!obj.item) return `Invalid Objective (no item)`;
                current = inventory.countItem(obj.item);
                return `${obj.item}: ${Math.min(current, required)}/${required}`;
            case 'kill': /* current = otherState.getKillCount(obj.target); */ return `${obj.target ?? 'target'}: ${current}/${required} (NI)`; // NI = Not Implemented
            case 'explore': /* current = otherState.hasVisited(obj.locationId) ? 1 : 0; */ return `Explore ${obj.locationHint ?? 'area'}: ${current}/${required} (NI)`;
            case 'talk_to': /* current = otherState.hasTalkedTo(obj.npcId) ? 1 : 0; */ return `Talk to ${obj.npcName ?? 'NPC'}: ${current}/${required} (NI)`;
            default:
                 const exhaustiveCheck: never = obj.type;
                 return `${exhaustiveCheck}: ?/?`;
        }
    }

    // FIX: Check inventory exists before use
    public completeQuest(questId: string, inventory: Inventory | null /*, otherState */): boolean {
        const quest = this.quests[questId];
        // FIX: Add !inventory check
        if (!quest || quest.status !== 'active' || !inventory || !this.checkQuestCompletion(questId, inventory)) return false;
        console.log(`Completing quest: ${quest.data.title}`);

        // Remove required items (if flagged)
        let itemsRemoved = true; // Assume success unless removal fails
        for (const obj of quest.data.objectives) {
            if (obj.turnIn && obj.item && obj.amount && obj.amount > 0) {
                 if (!inventory.removeItem(obj.item, obj.amount)) {
                      console.error(`Failed to remove required item ${obj.amount}x ${obj.item} for ${questId}!`);
                      itemsRemoved = false;
                      break; // Stop trying to remove items if one fails
                 }
            }
        }

        if (!itemsRemoved) {
             console.error(`Cannot complete quest ${questId} due to failure removing items.`);
             return false; // Do not proceed to grant rewards or change status
        }

        // Grant rewards (only if items were successfully removed)
        const reward = quest.data.reward;
        if (reward) {
            if (reward.gold && reward.gold > 0) {
                 inventory.addItem('gold', reward.gold)
                 console.log(`Granted ${reward.gold} gold.`);
            };
            reward.items?.forEach(item => {
                if (item.amount > 0) {
                    if (!inventory.addItem(item.name, item.amount)) {
                         console.warn(`Inventory full, couldn't grant reward: ${item.amount} ${item.name}`);
                    } else {
                         console.log(`Granted ${item.amount} ${item.name}.`);
                    }
                }
            });
            // if (reward.xp) otherState.addExperience(reward.xp);
        }

        quest.status = 'completed'; this.notifyChange();
        console.log(`Quest ${questId} completed!`); return true;
    }

    public getQuestStatus(questId: string): QuestStatus { return this.quests[questId]?.status ?? 'unknown'; }
    public getAllKnownQuests(): QuestState[] { return Object.values(this.quests); }
    public getQuestsByStatus(status: QuestStatus): QuestState[] { return Object.values(this.quests).filter(q => q.status === status); }
    public getActiveQuests(): QuestState[] { return this.getQuestsByStatus('active'); }
    public getCompletedQuests(): QuestState[] { return this.getQuestsByStatus('completed'); }
    public getAvailableQuests(): QuestState[] { return this.getQuestsByStatus('available'); }

    public getSaveData(): Record<string, QuestStatus> {
        return Object.fromEntries(Object.entries(this.quests).map(([id, state]) => [id, state.status]));
    }

    public loadSaveData(saveData: Record<string, QuestStatus> | null): void {
        this.quests = {}; if (!saveData) return;
        Object.entries(saveData).forEach(([id, status]) => {
            const definition = this.getQuestData(id);
            if (definition) this.quests[id] = { data: definition, status: status };
            else console.warn(`Quest definition missing for saved quest ID ${id}. Skipping load for this quest.`);
        });
        this.notifyChange(); console.log("Quest log loaded.");
    }

    public onChange(callback: (quests: QuestState[]) => void): void { if (typeof callback === 'function') this.onChangeCallbacks.push(callback); }
    public removeOnChange(callback: (quests: QuestState[]) => void): void { this.onChangeCallbacks = this.onChangeCallbacks.filter(cb => cb !== callback); }
    private notifyChange(): void {
        const allQuests = this.getAllKnownQuests();
        this.onChangeCallbacks.forEach(cb => { try { cb(allQuests); } catch (e) { console.error("QuestLog onChange CB error:", e); } });
    }
}

// --- Event Log ---
export class EventLog {
    private entries: EventEntry[] = [];
    private readonly maxEntries: number;
    private onChangeCallbacks: Array<(entries: string[]) => void> = [];

    constructor(maxEntries: number = 50) {
        this.maxEntries = Math.max(1, maxEntries);
    }

    public addEntry(message: string): void {
        if (!message || typeof message !== 'string' || message.trim() === '') return; // Add validation
        // Basic timestamp, consider more robust library if needed
        const timestamp = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
        this.entries.push({ timestamp, message });
        // Maintain max entries
        while (this.entries.length > this.maxEntries) {
            this.entries.shift();
        }
        console.log("Event Log:", `[${timestamp}] ${message}`);
        this.notifyChange();
    }

    // Return entries newest first for typical display
    public getEntries(): EventEntry[] { return [...this.entries].reverse(); }
    public getFormattedEntries(): string[] { return this.getEntries().map(e => `[${e.timestamp}] ${e.message}`); }

    public onChange(callback: (entries: string[]) => void): void { if (typeof callback === 'function') this.onChangeCallbacks.push(callback); }
    public removeOnChange(callback: (entries: string[]) => void): void { this.onChangeCallbacks = this.onChangeCallbacks.filter(cb => cb !== callback); }
    private notifyChange(): void {
        const formatted = this.getFormattedEntries();
        this.onChangeCallbacks.forEach(cb => { try { cb(formatted); } catch (e) { console.error("EventLog onChange CB error:", e); } });
    }

    // Save only a subset if log gets very large
    public getSaveData(): EventEntry[] { return this.entries.slice(-Math.min(this.maxEntries, 100)); } // Save last 100 or maxEntries

    public loadSaveData(savedEntries: EventEntry[] | null): void {
        if (Array.isArray(savedEntries)) {
            // Ensure loaded entries don't exceed max capacity immediately
            this.entries = savedEntries.slice(-this.maxEntries);
            this.notifyChange(); console.log("Event log loaded.");
        } else {
             this.entries = []; // Clear if save data is invalid/null
             this.notifyChange(); console.log("Event log cleared due to invalid save data.");
        }
    }
}