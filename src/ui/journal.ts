// File: /src/ui/journal.ts
import { EventLog, EventEntry } from "../core/utils";
import { Game } from "../main";

export class JournalDisplay {
  eventLog: EventLog;
  game: Game;
  displayElement: HTMLElement | null;
  eventListElement: HTMLElement | null;
  questListElement: HTMLElement | null;
  isOpen: boolean = false;
  boundUpdateEvents: (entries: EventEntry[]) => void;
  boundUpdateQuests: () => void;

  constructor(eventLog: EventLog, game: Game) {
    this.eventLog = eventLog;
    this.game = game;
    this.displayElement = document.getElementById("journal-display");
    this.eventListElement = document.getElementById("event-log");
    this.questListElement = document.getElementById("quest-log");
    this.boundUpdateEvents = this.updateEvents.bind(this);
    this.boundUpdateQuests = this.updateQuests.bind(this);
    this.eventLog.onChange(this.boundUpdateEvents);
    if (this.displayElement) this.displayElement.classList.add("hidden");
  }

  updateQuests(): void {
    if (!this.isOpen || !this.questListElement) return;
    this.questListElement.innerHTML = "";
    this.game?.quests?.forEach((quest) => {
      const li = document.createElement("li");
      li.textContent = `${quest.name}: ${quest.isCompleted ? "Completed" : "In Progress"}`;
      this.questListElement!.appendChild(li);
    });
  }

  setEventLog(newEventLog: EventLog): void {
    if (this.eventLog === newEventLog) return;
    if (this.eventLog) {
      this.eventLog.onChangeCallbacks = this.eventLog.onChangeCallbacks.filter(
        (cb) => cb !== this.boundUpdateEvents
      );
    }
    this.eventLog = newEventLog;
    this.eventLog.onChange(this.boundUpdateEvents);
    if (this.isOpen) this.updateEvents(this.eventLog.entries);
  }

  updateEvents(entries: EventEntry[]): void {
    if (!this.isOpen || !this.eventListElement) return;
    this.eventListElement.innerHTML =
      entries.length === 0 ? "<li>No events recorded yet.</li>" : "";
    entries.forEach((entry) => {
      const li = document.createElement("li");
      li.textContent = `[${entry.timestamp}] ${entry.message}`;
      this.eventListElement!.appendChild(li);
    });
    this.eventListElement.scrollTop = this.eventListElement.scrollHeight;
  }

  toggle(): void {
    this.isOpen ? this.hide() : this.show();
  }

  show(): void {
    if (!this.displayElement || this.isOpen) return;
    this.isOpen = true;
    this.updateEvents(this.eventLog.entries);
    this.updateQuests();
    this.displayElement.classList.remove("hidden");
  }

  hide(): void {
    if (!this.displayElement || !this.isOpen) return;
    this.isOpen = false;
    this.displayElement.classList.add("hidden");
  }
}
