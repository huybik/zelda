export class JournalDisplay {
    constructor(questLog, eventLog, inventory) { // Receive inventory reference
        if (!questLog) throw new Error("QuestLog instance is required for JournalDisplay.");
        if (!eventLog) throw new Error("EventLog instance is required for JournalDisplay.");
        if (!inventory) throw new Error("Inventory instance is required for JournalDisplay."); // Add inventory check

        this.questLog = questLog;
        this.eventLog = eventLog;
        this.inventory = inventory; // Store inventory reference
        this.displayElement = document.getElementById('journal-display');
        this.questListElement = document.getElementById('quest-log');
        this.eventListElement = document.getElementById('event-log');
        this._isOpen = false; // Internal state

        if (!this.displayElement) console.error("Journal UI element not found: #journal-display");
        if (!this.questListElement) console.error("Journal UI element not found: #quest-log");
        if (!this.eventListElement) console.error("Journal UI element not found: #event-log");

        // Abort if elements are missing
        if (!this.displayElement || !this.questListElement || !this.eventListElement) return;

        // Listen for changes in logs and bind 'this' context
        this.updateQuests = this.updateQuests.bind(this);
        this.updateEvents = this.updateEvents.bind(this);
        this.questLog.onChange(this.updateQuests);
        this.eventLog.onChange(this.updateEvents);

        // Initially hidden
        this.hide();
    }

    get isOpen() {
        return this._isOpen;
    }

    // Update both sections if the journal is open
    updateDisplay() {
        if (!this._isOpen) return;
        this.updateQuests();
        this.updateEvents();
    }

    updateQuests(allQuests = this.questLog.getAllKnownQuests()) { // Accept quests array from notification
         if (!this._isOpen || !this.questListElement) return;

         // Separate quests by status for display order
         const activeQuests = allQuests.filter(q => q.status === 'active');
         const availableQuests = allQuests.filter(q => q.status === 'available');
         const completedQuests = allQuests.filter(q => q.status === 'completed');
         const failedQuests = allQuests.filter(q => q.status === 'failed');

         this.questListElement.innerHTML = ''; // Clear previous entries

         if (activeQuests.length === 0 && availableQuests.length === 0 && completedQuests.length === 0 && failedQuests.length === 0) {
             this.questListElement.innerHTML = '<li>No quests discovered yet.</li>';
             return;
         }

         const createListItem = (quest, statusClass = '') => {
            const li = document.createElement('li');
            li.classList.add(statusClass);
            // Safely access quest data title and description
            const title = quest.data?.title || 'Unknown Quest';
            const description = quest.data?.description || 'No description available.';
            let progressHtml = '';
            if (quest.status === 'active') {
                 // Use the stored inventory reference
                 const progress = this.questLog.getQuestProgress(quest.data.id, this.inventory);
                 progressHtml = `<br><em>Progress: ${progress || 'Started'}</em>`;
            } else if (quest.status !== 'available') {
                 progressHtml = `<br><em>(${quest.status})</em>`; // Show status like completed/failed
            }
            li.innerHTML = `<strong>${title}</strong><br>${description}${progressHtml}`;
            return li;
         }

         // Display order: Active -> Available -> Completed -> Failed
         activeQuests.forEach(quest => this.questListElement.appendChild(createListItem(quest, 'quest-active')));
         availableQuests.forEach(quest => this.questListElement.appendChild(createListItem(quest, 'quest-available')));
         completedQuests.forEach(quest => this.questListElement.appendChild(createListItem(quest, 'quest-completed')));
         failedQuests.forEach(quest => this.questListElement.appendChild(createListItem(quest, 'quest-failed')));
    }

    updateEvents(entries = this.eventLog.getFormattedEntries()) { // Accept entries array from notification
         if (!this._isOpen || !this.eventListElement) return;
        this.eventListElement.innerHTML = ''; // Clear previous entries

        if (entries.length === 0) {
            this.eventListElement.innerHTML = '<li>No events recorded yet.</li>';
            return;
        }
        entries.forEach(entryText => {
            const li = document.createElement('li');
            li.textContent = entryText;
            this.eventListElement.appendChild(li);
        });

        // Scroll to the bottom (most recent) event - optional
        this.eventListElement.scrollTop = this.eventListElement.scrollHeight;
    }


    toggle() {
        if (this._isOpen) {
            this.hide();
        } else {
            this.show();
        }
    }

    show() {
        if (!this.displayElement) return;
        this._isOpen = true;
        this.updateDisplay(); // Update content *before* showing
        this.displayElement.classList.remove('hidden');
        console.log("Journal opened");
         // Optional: Pause game? Game class should handle this.
    }

    hide() {
        if (!this.displayElement) return;
        this._isOpen = false;
        this.displayElement.classList.add('hidden');
        console.log("Journal closed");
         // Optional: Resume game? Game class should handle this.
    }

     // Clean up listeners when display is no longer needed
    dispose() {
        this.questLog.removeOnChange(this.updateQuests);
        this.eventLog.removeOnChange(this.updateEvents);
        console.log("JournalDisplay disposed.");
    }
}