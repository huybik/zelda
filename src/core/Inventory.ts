import { InventoryItem } from "./types";

// Moved from utils.ts
export class Inventory {
  size: number;
  items: Array<InventoryItem | null>;
  onChangeCallbacks: Array<(items: Array<InventoryItem | null>) => void>;
  itemMaxStack: Record<string, number>;

  constructor(size: number = 20) {
    this.size = size;
    this.items = new Array(size).fill(null);
    this.onChangeCallbacks = [];
    this.itemMaxStack = {
      default: 64,
      wood: 99,
      stone: 99,
      herb: 30,
      feather: 50,
      "Health Potion": 10,
      gold: Infinity,
    };
  }

  getMaxStack(itemName: string): number {
    return this.itemMaxStack[itemName] ?? this.itemMaxStack["default"];
  }

  addItem(itemName: string, count: number = 1): boolean {
    if (!itemName || count <= 0) return false;
    const maxStack = this.getMaxStack(itemName);
    let remainingCount = count;
    let changed = false;
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
    if (remainingCount > 0) {
      for (let i = 0; i < this.size && remainingCount > 0; i++) {
        if (!this.items[i]) {
          const amountToAdd = Math.min(remainingCount, maxStack);
          this.items[i] = {
            name: itemName,
            count: amountToAdd,
            icon: itemName.toLowerCase().replace(/ /g, "_").replace(/'/g, ""),
          };
          remainingCount -= amountToAdd;
          changed = true;
        }
      }
    }
    if (changed) this.notifyChange();
    return remainingCount === 0;
  }

  removeItem(itemName: string, count: number = 1): boolean {
    if (!itemName || count <= 0) return false;
    let neededToRemove = count;
    let changed = false;
    for (let i = this.size - 1; i >= 0 && neededToRemove > 0; i--) {
      const slot = this.items[i];
      if (slot?.name === itemName) {
        const amountToRemove = Math.min(neededToRemove, slot.count);
        slot.count -= amountToRemove;
        neededToRemove -= amountToRemove;
        changed = true;
        if (slot.count === 0) this.items[i] = null;
      }
    }
    if (changed) this.notifyChange();
    return neededToRemove === 0;
  }

  removeItemByIndex(index: number, count: number = 1): boolean {
    if (index < 0 || index >= this.size || !this.items[index] || count <= 0)
      return false;
    const item = this.items[index]!;
    const removeCount = Math.min(count, item.count);
    item.count -= removeCount;
    if (item.count === 0) this.items[index] = null;
    this.notifyChange();
    return true;
  }

  countItem(itemName: string): number {
    return this.items.reduce(
      (total, item) => total + (item?.name === itemName ? item.count : 0),
      0
    );
  }

  getItem(index: number): InventoryItem | null {
    return index >= 0 && index < this.size ? this.items[index] : null;
  }

  onChange(callback: (items: Array<InventoryItem | null>) => void): void {
    if (typeof callback === "function") this.onChangeCallbacks.push(callback);
  }

  notifyChange(): void {
    const itemsCopy = this.items.map((item) => (item ? { ...item } : null));
    this.onChangeCallbacks.forEach((cb) => cb(itemsCopy));
  }
} 