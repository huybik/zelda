import { Vector3 } from "three";
import { EventEntry } from "./types";

// Moved from utils.ts
export class EventLog {
  entries: EventEntry[];
  maxEntries: number;
  onChangeCallbacks: Array<(entries: EventEntry[]) => void>;

  constructor(maxEntries: number = 50) {
    this.entries = [];
    this.maxEntries = Math.max(1, maxEntries);
    this.onChangeCallbacks = [];
  }

  // Overload addEntry
  addEntry(message: string): void;
  addEntry(entry: EventEntry): void;
  addEntry(
    actor: string,
    action: string,
    message: string,
    target?: string,
    details?: Record<string, any>,
    location?: Vector3
  ): void;

  addEntry(...args: any[]): void {
    let entryToAdd: EventEntry;
    const timestamp = new Date().toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });

    if (args.length === 1 && typeof args[0] === "string") {
      // Simple message string
      const message = args[0];
      entryToAdd = {
        timestamp,
        message,
        actorId: undefined,
        actorName: undefined,
        action: undefined,
        targetId: undefined,
        details: {},
        location: undefined,
      };
    } else if (
      args.length === 1 &&
      typeof args[0] === "object" &&
      args[0].message &&
      args[0].timestamp
    ) {
      // Pre-constructed EventEntry object
      entryToAdd = args[0];
      if (!entryToAdd.timestamp || entryToAdd.timestamp.length !== 8) {
        entryToAdd.timestamp = timestamp;
      }
    } else if (
      args.length >= 3 &&
      typeof args[0] === "string" &&
      typeof args[1] === "string" &&
      typeof args[2] === "string"
    ) {
      // Structured event data (Note: This overload seems unused based on current usage, might remove later)
      const [
        actor,
        action,
        message,
        target,
        details = {},
        location = new Vector3(),
      ] = args;
      entryToAdd = {
        timestamp,
        message,
        actorId: actor, // Assuming actor string is ID
        actorName: actor, // Assuming actor string is Name (needs refinement)
        action: action,
        targetId: target,
        targetName: target,
        details: details,
        location: location,
      };
    } else {
      console.warn("Invalid arguments passed to EventLog.addEntry:", args);
      return;
    }

    this.entries.push(entryToAdd);
    if (this.entries.length > this.maxEntries) this.entries.shift();
    this.notifyChange();
  }

  getFormattedEntries(): string[] {
    return [...this.entries]
      .reverse()
      .map((entry) => `[${entry.timestamp}] ${entry.message}`);
  }

  onChange(callback: (entries: EventEntry[]) => void): void {
    if (typeof callback === "function") this.onChangeCallbacks.push(callback);
  }

  notifyChange(): void {
    const entriesCopy = [...this.entries];
    this.onChangeCallbacks.forEach((cb) => cb(entriesCopy));
  }
} 