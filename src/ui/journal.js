export class JournalDisplay {
    constructor(questLog, eventLog) {
        this.questLog = questLog;
        this.eventLog = eventLog;
        this.displayElement = document.getElementById('journal-display');
        this.questListElement = document.getElementById('quest-log');
        this.eventListElement = document.getElementById('event-log');
        this.isOpen = false;

        if (!this.displayElement || !this.questListElement || !this.eventListElement) {
            console.error("Journal UI elements not found!");
            return;
        }

        // Listen for changes in logs
        this.questLog.onChange(() => this.updateQuests());
        this.eventLog.onChange(() => this.updateEvents());

        // Initially hidden
        this.hide();
    }

    update() {
        if (!this.isOpen) return;
        this.updateQuests();
        this.updateEvents();
    }

    updateQuests() {
         if (!this.isOpen) return;
        this.questListElement.innerHTML = ''; // Clear previous entries
        const activeQuests = this.questLog.getActiveQuests();
         const completedQuests = this.questLog.getCompletedQuests();

         if (activeQuests.length === 0 && completedQuests.length === 0) {
             this.questListElement.innerHTML = '<li>No quests yet.</li>';
             return;
         }

        activeQuests.forEach(quest => {
            const li = document.createElement('li');
             const progress = this.questLog.getQuestProgress(quest.data.id, window.game?.inventory); // Access global game inventory hackily - improve this reference later
            li.innerHTML = `<strong>${quest.data.title} (Active)</strong><br>${quest.data.description}<br><em>Progress: ${progress || 'Started'}</em>`;
            this.questListElement.appendChild(li);
        });

         completedQuests.forEach(quest => {
            const li = document.createElement('li');
            li.style.textDecoration = 'line-through'; // Style completed quests
            li.style.color = '#666';
            li.innerHTML = `<strong>${quest.data.title} (Completed)</strong>`;
            this.questListElement.appendChild(li);
        });
    }

    updateEvents() {
         if (!this.isOpen) return;
        this.eventListElement.innerHTML = ''; // Clear previous entries
        const entries = this.eventLog.getEntries(); // Newest first
        if (entries.length === 0) {
            this.eventListElement.innerHTML = '<li>No events recorded yet.</li>';
            return;
        }
        entries.forEach(entry => {
            const li = document.createElement('li');
            li.textContent = entry;
            this.eventListElement.appendChild(li);
        });
    }


    toggle() {
        if (this.isOpen) {
            this.hide();
        } else {
            this.show();
        }
    }

    show() {
        this.update(); // Update content before showing
        this.displayElement.classList.remove('hidden');
        this.isOpen = true;
        console.log("Journal opened");
         // Optional: Pause game?
    }

    hide() {
        this.displayElement.classList.add('hidden');
        this.isOpen = false;
        console.log("Journal closed");
         // Optional: Resume game?
    }
     isOpen() {
         return this.isOpen;
     }
}