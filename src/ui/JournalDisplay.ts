// src/ui/JournalDisplay.ts
import { EventLog } from "../core/EventLog";
import type { EventEntry } from "../types";
import type { Game } from "../Game"; // Use type import

export class JournalDisplay {
  eventLog: EventLog; // Reference to the player's event log
  game: Game; // Reference to the game instance to access quests
  displayElement: HTMLElement | null;
  eventListElement: HTMLElement | null;
  questListElement: HTMLElement | null;
  isOpen: boolean = false;

  // Bound function references for listener removal
  private boundUpdateEvents: (entries: EventEntry[]) => void;

  constructor(eventLog: EventLog, game: Game) {
    this.eventLog = eventLog;
    this.game = game;
    this.displayElement = document.getElementById("journal-display");
    this.eventListElement = document.getElementById("event-log"); // Target specific list element
    this.questListElement = document.getElementById("quest-log"); // Target specific list element

    if (
      !this.displayElement ||
      !this.eventListElement ||
      !this.questListElement
    ) {
      console.error("Journal UI elements not found in DOM.");
      // Optionally disable if elements are missing
      this.eventLog = new EventLog(0); // Use dummy log
      this.boundUpdateEvents = () => {};
      return;
    }

    // Bind methods
    this.boundUpdateEvents = this.updateEvents.bind(this);

    // Register listener for event log changes
    this.eventLog.onChange(this.boundUpdateEvents);

    this.hide(); // Start hidden
  }

  // Updates the event log instance being displayed (e.g., on player switch).
  setEventLog(newEventLog: EventLog): void {
    if (this.eventLog === newEventLog || !this.boundUpdateEvents) return;

    // Remove listener from the old event log instance
    this.eventLog.onChangeCallbacks = this.eventLog.onChangeCallbacks.filter(
      (cb) => cb !== this.boundUpdateEvents
    );

    // Set the new event log instance
    this.eventLog = newEventLog;

    // Add listener to the new event log instance
    this.eventLog.onChange(this.boundUpdateEvents);

    // Update the display immediately if it's currently open
    if (this.isOpen) {
      this.updateEvents(this.eventLog.entries);
    }
  }

  // Updates the event list in the UI.
  updateEvents(entries: EventEntry[]): void {
    if (!this.isOpen || !this.eventListElement) return; // Only update if open

    this.eventListElement.innerHTML = ""; // Clear previous entries

    if (entries.length === 0) {
      this.eventListElement.innerHTML = "<li>No events recorded.</li>";
      return;
    }

    // Display newest events at the top by iterating reversed copy
    [...entries].reverse().forEach((entry) => {
      const li = document.createElement("li");
      // Format the message (add actor/target info if available?)
      let formattedMessage = `[${entry.timestamp}] ${entry.message}`;
      // Example: Add actor name if present and not the current player
      // if (entry.actorName && entry.actorId !== this.game.activeCharacter?.id) {
      //     formattedMessage = `[${entry.timestamp}] ${entry.actorName}: ${entry.message}`;
      // }
      li.textContent = formattedMessage;
      // Add tooltip with more details?
      // li.title = JSON.stringify(entry.details);
      this.eventListElement!.appendChild(li);
    });

    // Scroll to the top of the event list
    this.eventListElement.scrollTop = 0;
  }

  // Updates the quest list in the UI. Called manually when shown or quest state changes.
  updateQuests(): void {
    if (!this.isOpen || !this.questListElement) return; // Only update if open

    this.questListElement.innerHTML = ""; // Clear previous entries
    const quests = this.game.quests || []; // Get quests from Game instance

    if (quests.length === 0) {
      this.questListElement.innerHTML = "<li>No active quests.</li>";
      return;
    }

    quests.forEach((quest) => {
      const li = document.createElement("li");
      li.textContent = `${quest.name}: ${quest.isCompleted ? "✓ Completed" : "▫ In Progress"}`;
      li.title = quest.description; // Add description as tooltip
      if (quest.isCompleted) {
        li.classList.add("completed");
      } else {
        li.classList.remove("completed");
      }
      this.questListElement!.appendChild(li);
    });
  }

  // Toggles the visibility of the journal display.
  toggle(): void {
    this.isOpen ? this.hide() : this.show();
  }

  // Shows the journal display and updates its content.
  show(): void {
    if (!this.displayElement || this.isOpen) return; // Do nothing if already open or element missing
    this.isOpen = true;
    this.updateEvents(this.eventLog.entries); // Update events when showing
    this.updateQuests(); // Update quests when showing
    this.displayElement.classList.remove("hidden");
    console.log("Journal opened");
  }

  // Hides the journal display.
  hide(): void {
    if (!this.displayElement || !this.isOpen) return; // Do nothing if already hidden or element missing
    this.isOpen = false;
    this.displayElement.classList.add("hidden");
    console.log("Journal closed");
  }

  // Clean up listeners when the display is no longer needed.
  dispose(): void {
    // Remove the listener from the event log instance
    if (this.eventLog && this.boundUpdateEvents) {
      this.eventLog.onChangeCallbacks = this.eventLog.onChangeCallbacks.filter(
        (cb) => cb !== this.boundUpdateEvents
      );
    }
    console.log("JournalDisplay disposed");
  }
}
