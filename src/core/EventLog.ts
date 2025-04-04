// src/core/EventLog.ts
import type { EventEntry } from "../types";
import { MAX_LOG_ENTRIES } from "../config";

export class EventLog {
  entries: EventEntry[];
  maxEntries: number;
  onChangeCallbacks: Array<(entries: EventEntry[]) => void>;

  constructor(maxEntries: number = MAX_LOG_ENTRIES) {
    this.entries = [];
    this.maxEntries = Math.max(1, maxEntries);
    this.onChangeCallbacks = [];
  }

  addEntry(entry: EventEntry): void;
  addEntry(message: string): void;
  addEntry(...args: any[]): void {
    let entryToAdd: EventEntry;
    const timestamp = new Date().toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });

    if (args.length === 1 && typeof args[0] === "string") {
      // Simple message string
      entryToAdd = { timestamp, message: args[0] };
    } else if (
      args.length === 1 &&
      typeof args[0] === "object" &&
      args[0].message // Check if it's an EventEntry-like object
    ) {
      // Pre-formatted EventEntry object
      entryToAdd = { ...args[0], timestamp: args[0].timestamp || timestamp };
    } else {
      console.warn("Invalid arguments passed to EventLog.addEntry:", args);
      return;
    }

    this.entries.push(entryToAdd);
    if (this.entries.length > this.maxEntries) {
      this.entries.shift(); // Remove the oldest entry
    }
    this.notifyChange();
  }

  // Register a callback function to be called when the log changes.
  onChange(callback: (entries: EventEntry[]) => void): void {
    if (typeof callback === "function") {
      this.onChangeCallbacks.push(callback);
    }
  }

  // Notify all registered callbacks about the change.
  private notifyChange(): void {
    // Provide a shallow copy to prevent external modification
    const entriesCopy = [...this.entries];
    this.onChangeCallbacks.forEach((cb) => cb(entriesCopy));
  }

  // Optional: Method to clear the log
  clear(): void {
    this.entries = [];
    this.notifyChange();
  }
}
