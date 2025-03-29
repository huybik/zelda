import { QuestLog, EventLog } from '../systems/quest';
import { Inventory } from '../systems/inventory';
import { QuestState, QuestStatus } from '../types/common'; // Only QuestState needed

export class JournalDisplay {
    private questLog: QuestLog; private eventLog: EventLog; private inventory: Inventory;
    private displayElement: HTMLElement | null;
    private questListElement: HTMLElement | null; private eventListElement: HTMLElement | null;
    private _isOpen: boolean = false;
    private boundUpdateQuests: (quests: QuestState[]) => void;
    private boundUpdateEvents: (entries: string[]) => void;

    constructor(questLog: QuestLog, eventLog: EventLog, inventory: Inventory) {
        this.questLog = questLog; this.eventLog = eventLog; this.inventory = inventory;
        this.displayElement = document.getElementById('journal-display');
        this.questListElement = document.getElementById('quest-log');
        this.eventListElement = document.getElementById('event-log');

        if (!this.displayElement || !this.questListElement || !this.eventListElement) {
            console.error("Journal UI elements not found."); return;
        }

        this.boundUpdateQuests = this.updateQuests.bind(this); this.questLog.onChange(this.boundUpdateQuests);
        this.boundUpdateEvents = this.updateEvents.bind(this); this.eventLog.onChange(this.boundUpdateEvents);
        this.hide();
    }

    public get isOpen(): boolean { return this._isOpen; }

    private updateDisplay(): void {
        if (!this._isOpen) return;
        this.updateQuests(); this.updateEvents();
    }

    private updateQuests(allQuests: QuestState[] = this.questLog.getAllKnownQuests()): void {
        if (!this._isOpen || !this.questListElement) return;
        this.questListElement.innerHTML = ''; // Clear

        const questsByStatus: Record<QuestStatus, QuestState[]> = { active: [], available: [], completed: [], failed: [], unknown: [] };
        allQuests.forEach(q => (questsByStatus[q.status] ??= []).push(q));

        const orderedQuests = [...questsByStatus.active, ...questsByStatus.available, ...questsByStatus.completed, ...questsByStatus.failed];

        if (orderedQuests.length === 0) {
            this.questListElement.innerHTML = '<li>No quests discovered.</li>'; return;
        }

        orderedQuests.forEach(q => this.questListElement?.appendChild(this.createQuestListItem(q)));
    }

    private createQuestListItem(quest: QuestState): HTMLElement {
        const li = document.createElement('li');
        li.className = `quest-${quest.status}`;
        const title = quest.data?.title ?? 'Unknown Quest';
        const desc = quest.data?.description ?? 'No description.';
        let progressHtml = '';

        if (quest.status === 'active') {
            const progress = this.questLog.getQuestProgress(quest.data.id, this.inventory);
            progressHtml = `<br><em>Progress: ${progress || 'Started'}</em>`;
        } else if (quest.status !== 'available' && quest.status !== 'unknown') {
            progressHtml = `<br><em>(${quest.status})</em>`;
        }
        li.innerHTML = `<strong>${title}</strong><br>${desc}${progressHtml}`;
        return li;
    }

    private updateEvents(entries: string[] = this.eventLog.getFormattedEntries()): void {
        if (!this._isOpen || !this.eventListElement) return;
        this.eventListElement.innerHTML = ''; // Clear
        if (entries.length === 0) {
            this.eventListElement.innerHTML = '<li>No events recorded.</li>'; return;
        }
        entries.forEach(entryText => {
            const li = document.createElement('li'); li.textContent = entryText;
            this.eventListElement?.appendChild(li);
        });
        this.eventListElement.scrollTop = this.eventListElement.scrollHeight; // Scroll down
    }

    public toggle(): void { this._isOpen ? this.hide() : this.show(); }

    public show(): void {
        if (!this.displayElement || this._isOpen) return;
        this._isOpen = true; this.updateDisplay(); // Update before showing
        this.displayElement.classList.remove('hidden'); console.log("Journal opened");
    }

    public hide(): void {
        if (!this.displayElement || !this._isOpen) return;
        this._isOpen = false; this.displayElement.classList.add('hidden'); console.log("Journal closed");
    }

    public dispose(): void {
        this.questLog.removeOnChange(this.boundUpdateQuests);
        this.eventLog.removeOnChange(this.boundUpdateEvents);
        console.log("JournalDisplay disposed.");
    }
}