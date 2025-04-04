// src/core/Inventory.ts
import type { InventoryItem } from "../types";
import { DEFAULT_INVENTORY_SIZE } from "../config";

export class Inventory {
  size: number;
  items: Array<InventoryItem | null>;
  onChangeCallbacks: Array<(items: Array<InventoryItem | null>) => void>;
  // Defines the maximum stack size for specific items. 'default' applies if not specified.
  itemMaxStack: Record<string, number>;

  constructor(size: number = DEFAULT_INVENTORY_SIZE) {
    this.size = size;
    this.items = new Array(size).fill(null);
    this.onChangeCallbacks = [];
    // Example stack sizes - customize as needed
    this.itemMaxStack = {
      default: 64,
      wood: 99,
      stone: 99,
      herb: 30,
      feather: 50,
      "Health Potion": 10,
      gold: Infinity, // Gold might not have a practical stack limit
    };
  }

  // Returns the maximum stack size for a given item name.
  getMaxStack(itemName: string): number {
    return this.itemMaxStack[itemName] ?? this.itemMaxStack["default"];
  }

  // Adds items to the inventory, stacking where possible.
  // Returns true if all items were added successfully, false otherwise.
  addItem(itemName: string, count: number = 1): boolean {
    if (!itemName || count <= 0) return false;

    const maxStack = this.getMaxStack(itemName);
    let remainingCount = count;
    let changed = false;

    // 1. Try stacking onto existing items
    for (let i = 0; i < this.size && remainingCount > 0; i++) {
      const slot = this.items[i];
      if (slot?.name === itemName && slot.count < maxStack) {
        const canAdd = maxStack - slot.count;
        const amountToAdd = Math.min(remainingCount, canAdd);
        slot.count += amountToAdd;
        remainingCount -= amountToAdd;
        changed = true;
      }
    }

    // 2. Try adding to empty slots
    if (remainingCount > 0) {
      for (let i = 0; i < this.size && remainingCount > 0; i++) {
        if (!this.items[i]) {
          const amountToAdd = Math.min(remainingCount, maxStack);
          // Generate a simple icon name based on item name
          const iconName = itemName
            .toLowerCase()
            .replace(/ /g, "_")
            .replace(/'/g, "");
          this.items[i] = {
            name: itemName,
            count: amountToAdd,
            icon: iconName, // Assign generated icon name
          };
          remainingCount -= amountToAdd;
          changed = true;
        }
      }
    }

    if (changed) {
      this.notifyChange();
    }

    // Return true if all items were added (remainingCount is 0)
    return remainingCount === 0;
  }

  // Removes items from the inventory.
  // Returns true if the specified count was successfully removed, false otherwise.
  removeItem(itemName: string, count: number = 1): boolean {
    if (!itemName || count <= 0) return false;

    let neededToRemove = count;
    let changed = false;

    // Iterate backwards to remove from later stacks first (optional strategy)
    for (let i = this.size - 1; i >= 0 && neededToRemove > 0; i--) {
      const slot = this.items[i];
      if (slot?.name === itemName) {
        const amountToRemove = Math.min(neededToRemove, slot.count);
        slot.count -= amountToRemove;
        neededToRemove -= amountToRemove;
        changed = true;
        if (slot.count === 0) {
          this.items[i] = null; // Clear the slot if empty
        }
      }
    }

    if (changed) {
      this.notifyChange();
    }

    // Return true if the required amount was removed
    return neededToRemove === 0;
  }

  // Counts the total number of a specific item across all stacks.
  countItem(itemName: string): number {
    return this.items.reduce((total, item) => {
      return total + (item?.name === itemName ? item.count : 0);
    }, 0);
  }

  // Gets the item at a specific inventory index.
  getItem(index: number): InventoryItem | null {
    if (index >= 0 && index < this.size) {
      return this.items[index];
    }
    return null;
  }

  // Registers a callback function to be called when the inventory changes.
  onChange(callback: (items: Array<InventoryItem | null>) => void): void {
    if (typeof callback === "function") {
      this.onChangeCallbacks.push(callback);
    }
  }

  // Notifies all registered callbacks about the change.
  private notifyChange(): void {
    // Provide a shallow copy of items to prevent external modification
    const itemsCopy = this.items.map((item) => (item ? { ...item } : null));
    this.onChangeCallbacks.forEach((cb) => cb(itemsCopy));
  }

  // Optional: Method to clear the inventory
  clear(): void {
    this.items.fill(null);
    this.notifyChange();
  }
}
