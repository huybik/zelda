import { QuestLog, EventLog } from '../systems/quest';
import { Inventory } from '../systems/inventory'; // Needed for progress checks
import { QuestState, EventEntry } from '../types/common';

export class JournalDisplay {
    private questLog: QuestLog;
    private eventLog: EventLog;
    private inventory: Inventory; // Reference to player inventory
    private displayElement: HTMLElement | null;
    private questListElement: HTMLElement | null;
    private eventListElement: HTMLElement | null;
    private _isOpen: boolean;

    // Bound listeners
    private boundUpdateQuests!: (quests: QuestState[]) => void;
    private boundUpdateEvents!: (entries: string[]) => void;


    constructor(questLog: QuestLog, eventLog: EventLog, inventory: Inventory) {
        if (!questLog || !eventLog || !inventory) {
            throw new Error("QuestLog, EventLog, and Inventory instances are required for JournalDisplay.");
        }
        this.questLog = questLog;
        this.eventLog = eventLog;
        this.inventory = inventory; // Store inventory reference
        this._isOpen = false;

        this.displayElement = document.getElementById('journal-display');
        this.questListElement = document.getElementById('quest-log');
        this.eventListElement = document.getElementById('event-log');

        if (!this.displayElement || !this.questListElement || !this.eventListElement) {
            console.error("Journal UI elements not found (#journal-display, #quest-log, or #event-log). Aborting setup.");
            return;
        }

        // Bind listeners
        this.boundUpdateQuests = this.updateQuests.bind(this);
        this.boundUpdateEvents = this.updateEvents.bind(this);
        this.questLog.onChange(this.boundUpdateQuests);
        this.eventLog.onChange(this.boundUpdateEvents);

        this.hide(); // Start hidden
    }

    public get isOpen(): boolean {
        return this._isOpen;
    }

    // Update both sections if the journal is open
    private updateDisplay(): void {
        if (!this._isOpen) return;
        this.updateQuests(this.questLog.getAllKnownQuests()); // Update with current data
        this.updateEvents(this.eventLog.getFormattedEntries()); // Update with current data
    }

    private updateQuests(allQuests: QuestState[] = this.questLog.getAllKnownQuests()): void {
        if (!this._isOpen || !this.questListElement) return;

        // Separate quests by status for display order
        const active = allQuests.filter(q => q.status === 'active');
        const available = allQuests.filter(q => q.status === 'available');
        const completed = allQuests.filter(q => q.status === 'completed');
        const failed = allQuests.filter(q => q.status === 'failed');

        this.questListElement.innerHTML = ''; // Clear previous entries

        if ([...active, ...available, ...completed, ...failed].length === 0) {
            this.questListElement.innerHTML = '<li>No quests discovered yet.</li>';
            return;
        }

        // Helper to create list item HTML
        const createListItem = (quest: QuestState): HTMLElement => {
            const li = document.createElement('li');
            const statusClass = `quest-${quest.status}`;
            li.classList.add(statusClass);

            const title = quest.data?.title ?? 'Unknown Quest';
            const description = quest.data?.description ?? 'No description available.';
            let progressHtml = '';

            if (quest.status === 'active') {
                // Pass inventory to get progress string
                const progress = this.questLog.getQuestProgress(quest.data.id, this.inventory);
                progressHtml = `<br><em>Progress: ${progress || 'Started'}</em>`;
            } else if (quest.status !== 'available' && quest.status !== 'unknown') {
                progressHtml = `<br><em>(${quest.status})</em>`; // Show status like completed/failed
            }

            li.innerHTML = `<strong>${title}</strong><br>${description}${progressHtml}`;
            return li;
        };

        // Display order: Active -> Available -> Completed -> Failed
        active.forEach(q => this.questListElement?.appendChild(createListItem(q)));
        available.forEach(q => this.questListElement?.appendChild(createListItem(q)));
        completed.forEach(q => this.questListElement?.appendChild(createListItem(q)));
        failed.forEach(q => this.questListElement?.appendChild(createListItem(q)));
    }

    private updateEvents(entries: string[] = this.eventLog.getFormattedEntries()): void {
        if (!this._isOpen || !this.eventListElement) return;
        this.eventListElement.innerHTML = ''; // Clear previous entries

        if (entries.length === 0) {
            this.eventListElement.innerHTML = '<li>No events recorded yet.</li>';
            return;
        }
        entries.forEach(entryText => {
            const li = document.createElement('li');
            li.textContent = entryText;
            this.eventListElement?.appendChild(li);
        });

        // Scroll to bottom (most recent) - optional
        this.eventListElement.scrollTop = this.eventListElement.scrollHeight;
    }


    public toggle(): void {
        if (this._isOpen) {
            this.hide();
        } else {
            this.show();
        }
    }

    public show(): void {
        if (!this.displayElement || this._isOpen) return;
        this._isOpen = true;
        this.updateDisplay(); // Update content *before* showing
        this.displayElement.classList.remove('hidden');
        console.log("Journal opened");
        // Game class handles pausing/pointer lock
    }

    public hide(): void {
        if (!this.displayElement || !this._isOpen) return;
        this._isOpen = false;
        this.displayElement.classList.add('hidden');
        console.log("Journal closed");
        // Game class handles unpausing/pointer lock
    }

    public dispose(): void {
        this.questLog.removeOnChange(this.boundUpdateQuests);
        this.eventLog.removeOnChange(this.boundUpdateEvents);
        console.log("JournalDisplay disposed.");
    }
}