import { QuestLog, EventLog } from '../systems/quest';
import { Inventory } from '../systems/inventory';
import { QuestState, QuestStatus } from '../types/common';

export class JournalDisplay {
    private questLog: QuestLog; private eventLog: EventLog; private inventory: Inventory;
    private displayElement: HTMLElement | null;
    private questListElement: HTMLElement | null; private eventListElement: HTMLElement | null;
    private _isOpen: boolean = false;
    // FIX: Use definite assignment assertions '!'
    private boundUpdateQuests!: (quests: QuestState[]) => void;
    private boundUpdateEvents!: (entries: string[]) => void;

    constructor(questLog: QuestLog, eventLog: EventLog, inventory: Inventory) {
        this.questLog = questLog; this.eventLog = eventLog; this.inventory = inventory;
        this.displayElement = document.getElementById('journal-display');
        this.questListElement = document.getElementById('quest-log');
        this.eventListElement = document.getElementById('event-log');

        if (!this.displayElement || !this.questListElement || !this.eventListElement) {
            console.error("Journal UI elements not found."); return;
        }

        // Initialization of bound methods happens here
        this.boundUpdateQuests = this.updateQuests.bind(this);
        this.boundUpdateEvents = this.updateEvents.bind(this);

        this.questLog.onChange(this.boundUpdateQuests);
        this.eventLog.onChange(this.boundUpdateEvents);
        this.hide();
    }

    public get isOpen(): boolean { return this._isOpen; }

    private updateDisplay(): void {
        if (!this._isOpen) return;
        this.updateQuests(); // Update quests using current log data
        this.updateEvents(); // Update events using current log data
    }

    private updateQuests(allQuests: QuestState[] = this.questLog.getAllKnownQuests()): void {
        if (!this._isOpen || !this.questListElement) return;
        this.questListElement.innerHTML = ''; // Clear previous entries

        // Group quests by status for ordering
        const questsByStatus: Record<QuestStatus, QuestState[]> = { active: [], available: [], completed: [], failed: [], unknown: [] };
        allQuests.forEach(q => (questsByStatus[q.status] ??= []).push(q));

        // Define display order
        const orderedQuests = [
            ...questsByStatus.active,
            ...questsByStatus.available,
            ...questsByStatus.completed,
            ...questsByStatus.failed,
            // Optionally include 'unknown' if needed
        ];

        if (orderedQuests.length === 0) {
            this.questListElement.innerHTML = '<li>No quests discovered.</li>';
            return;
        }

        orderedQuests.forEach(q => {
             if (this.questListElement) { // Check element still exists
                this.questListElement.appendChild(this.createQuestListItem(q));
             }
        });
    }

    private createQuestListItem(quest: QuestState): HTMLElement {
        const li = document.createElement('li');
        li.className = `quest-entry quest-${quest.status}`; // Add base class and status class
        const title = quest.data?.title ?? 'Unknown Quest';
        const desc = quest.data?.description ?? 'No description available.';
        let progressHtml = '';
        let statusText = `(${quest.status})`;

        if (quest.status === 'active') {
            // Pass inventory to get progress
            const progress = this.questLog.getQuestProgress(quest.data.id, this.inventory);
            progressHtml = `<div class="quest-progress"><em>Progress: ${progress || 'Started'}</em></div>`;
            statusText = ''; // Don't show status text for active quests with progress shown
        } else if (quest.status === 'available') {
             statusText = '(Available)';
        } else if (quest.status === 'unknown') {
             statusText = '(Unknown)';
        }
         // completed/failed handled by CSS class, but can add text too if desired

        li.innerHTML = `<strong class="quest-title">${title}</strong> ${statusText}<div class="quest-description">${desc}</div>${progressHtml}`;
        return li;
    }

    private updateEvents(entries: string[] = this.eventLog.getFormattedEntries()): void {
        if (!this._isOpen || !this.eventListElement) return;
        this.eventListElement.innerHTML = ''; // Clear previous entries
        if (entries.length === 0) {
            this.eventListElement.innerHTML = '<li>No events recorded.</li>';
            return;
        }
        entries.forEach(entryText => {
            const li = document.createElement('li');
            li.className = 'event-entry';
            li.textContent = entryText;
             if (this.eventListElement) { // Check element still exists
                this.eventListElement.appendChild(li);
             }
        });
        // Scroll to the bottom to show the latest events
        this.eventListElement.scrollTop = this.eventListElement.scrollHeight;
    }

    public toggle(): void { this._isOpen ? this.hide() : this.show(); }

    public show(): void {
        if (!this.displayElement || this._isOpen) return;
        this._isOpen = true;
        this.updateDisplay(); // Update content *before* showing
        this.displayElement.classList.remove('hidden');
        console.log("Journal opened");
    }

    public hide(): void {
        if (!this.displayElement || !this._isOpen) return;
        this._isOpen = false;
        this.displayElement.classList.add('hidden');
        console.log("Journal closed");
    }

    public dispose(): void {
        // Remove listeners when the display is disposed
        this.questLog.removeOnChange(this.boundUpdateQuests);
        this.eventLog.removeOnChange(this.boundUpdateEvents);
        console.log("JournalDisplay disposed.");
    }
}