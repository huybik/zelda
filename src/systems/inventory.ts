import { InventoryItem } from '../types/common';

export class Inventory {
    public readonly size: number;
    public items: Array<InventoryItem | null>;
    private onChangeCallbacks: Array<(items: Array<InventoryItem | null>) => void>;
    private itemMaxStack: Record<string, number>;

    constructor(size: number = 20) {
        if (size <= 0) throw new Error("Inventory size must be positive.");
        this.size = size;
        this.items = new Array(size).fill(null);
        this.onChangeCallbacks = [];

        // Define stack sizes (could be loaded from item database/config)
        this.itemMaxStack = {
            'default': 64,
            'wood': 99,
            'stone': 99,
            'herb': 30,
            'feather': 50,
            'Health Potion': 10,
            'gold': Infinity, // Effectively unlimited stack
            'Hunter\'s Bow': 1 // Unstackable
        };
    }

    private getMaxStack(itemName: string): number {
        return this.itemMaxStack[itemName] ?? this.itemMaxStack['default'];
    }

    /**
     * Adds item(s) to the inventory. Tries stacking first, then fills empty slots.
     * @returns True if all items were added, false otherwise (e.g., inventory full).
     */
    public addItem(itemName: string, count: number = 1): boolean {
        if (!itemName || typeof itemName !== 'string' || count <= 0) {
            console.error("Invalid item name or count:", itemName, count);
            return false;
        }

        const maxStack = this.getMaxStack(itemName);
        let remainingCount = count;
        let changed = false;

        // 1. Try stacking onto existing, non-full stacks
        for (let i = 0; i < this.size && remainingCount > 0; i++) {
            const slot = this.items[i];
            if (slot?.name === itemName && slot.count < maxStack) {
                const canAdd = maxStack - slot.count;
                const amountToAdd = Math.min(remainingCount, canAdd);
                slot.count += amountToAdd;
                remainingCount -= amountToAdd;
                changed = true;
                // console.log(`Stacked ${amountToAdd} ${itemName} in slot ${i}. Total: ${slot.count}`);
            }
        }

        // 2. Try adding to new empty slots
        if (remainingCount > 0) {
            for (let i = 0; i < this.size && remainingCount > 0; i++) {
                if (this.items[i] === null) {
                    const amountToAdd = Math.min(remainingCount, maxStack);
                    this.items[i] = {
                        name: itemName,
                        count: amountToAdd,
                        icon: this.generateIconName(itemName)
                        // Add other item data here if needed (description, effects)
                    };
                    remainingCount -= amountToAdd;
                    changed = true;
                    // console.log(`Added ${amountToAdd} ${itemName} to new slot ${i}.`);
                }
            }
        }

        if (changed) this.notifyChange();

        if (remainingCount > 0) {
            console.log(`Inventory full. Could not add ${remainingCount} of ${itemName}.`);
            return false; // Not all items added
        }

        return true; // All items added
    }

    /**
     * Removes a specified count of an item by name.
     * @returns True if the full count was removed, false otherwise.
     */
    public removeItem(itemName: string, count: number = 1): boolean {
        if (!itemName || count <= 0) return false;

        let countRemoved = 0;
        let neededToRemove = count;
        let changed = false;

        // Iterate backwards to remove from later stacks first (optional strategy)
        for (let i = this.size - 1; i >= 0 && neededToRemove > 0; i--) {
            const slot = this.items[i];
            if (slot?.name === itemName) {
                const amountToRemove = Math.min(neededToRemove, slot.count);
                slot.count -= amountToRemove;
                countRemoved += amountToRemove;
                neededToRemove -= amountToRemove;
                changed = true;
                // console.log(`Removed ${amountToRemove} ${itemName} from slot ${i}. Remaining: ${slot.count}`);

                if (slot.count === 0) {
                    this.items[i] = null; // Clear slot if empty
                }
            }
        }

        if (changed) this.notifyChange();

        if (neededToRemove > 0) {
            console.warn(`Could not remove all ${count} of ${itemName}. Removed ${countRemoved}.`);
            return false; // Failed to remove full amount
        }

        return true; // Successfully removed full amount
    }

    /**
     * Removes a specific amount from a specific slot index.
     * @returns True on success, false on failure (invalid index, not enough items).
     */
    public removeItemByIndex(index: number, count: number = 1): boolean {
        if (index < 0 || index >= this.size || !this.items[index] || count <= 0) {
            // console.error(`Invalid attempt to remove item from index ${index}`);
            return false;
        }

        const item = this.items[index]!; // Not null asserted by check above
        const removeCount = Math.min(count, item.count);

        if (removeCount <= 0) return false;

        item.count -= removeCount;
        // console.log(`Removed ${removeCount} ${item.name} from slot ${index}. Remaining: ${item.count}`);

        if (item.count === 0) {
            this.items[index] = null; // Clear the slot
        }

        this.notifyChange();
        return true;
    }

    /** Checks if the inventory contains at least 'count' of 'itemName'. */
    public hasItem(itemName: string, count: number = 1): boolean {
        if (count <= 0) return true;
        return this.countItem(itemName) >= count;
    }

    /** Counts the total amount of a specific item across all stacks. */
    public countItem(itemName: string): number {
        let totalCount = 0;
        for (const item of this.items) {
            if (item?.name === itemName) {
                totalCount += item.count;
            }
        }
        return totalCount;
    }

    /** Gets the item at a specific index (returns null if empty or invalid). */
    public getItem(index: number): InventoryItem | null {
        return (index >= 0 && index < this.size) ? this.items[index] : null;
    }

    /** Returns a copy of all items in the inventory. */
    public getAllItems(): Array<InventoryItem | null> {
        return this.items.map(item => item ? { ...item } : null);
    }

    /** Returns a filtered list of non-empty item slots (copies). */
    public getFilledSlots(): InventoryItem[] {
        return this.items.filter((item): item is InventoryItem => item !== null)
                         .map(item => ({ ...item }));
    }

    /** Registers a callback for inventory changes. */
    public onChange(callback: (items: Array<InventoryItem | null>) => void): void {
        if (typeof callback === 'function') {
            this.onChangeCallbacks.push(callback);
        }
    }

    /** Unregisters a callback. */
    public removeOnChange(callback: (items: Array<InventoryItem | null>) => void): void {
        this.onChangeCallbacks = this.onChangeCallbacks.filter(cb => cb !== callback);
    }

    /** Notifies all listeners about changes. */
    private notifyChange(): void {
        const itemsCopy = this.getAllItems(); // Pass copy to listeners
        this.onChangeCallbacks.forEach(cb => {
            try {
                cb(itemsCopy);
            } catch (error) {
                console.error("Error in inventory onChange callback:", error);
            }
        });
    }

    private generateIconName(itemName: string): string {
        return itemName.toLowerCase().replace(/ /g, '_').replace(/'/g, '');
    }

    // --- Save/Load ---
    public getSaveData(): Array<Pick<InventoryItem, 'name' | 'count'> | null> {
        // Only save essential data (name, count) for non-null slots
        return this.items.map(item => item ? { name: item.name, count: item.count } : null);
    }

    public loadSaveData(savedItems: Array<Pick<InventoryItem, 'name' | 'count'> | null>): void {
        if (!Array.isArray(savedItems) || savedItems.length !== this.size) {
            console.error("Invalid inventory save data format or size mismatch.");
            this.items.fill(null); // Clear inventory on error
        } else {
            this.items = savedItems.map(savedItem => {
                if (savedItem?.name && savedItem.count > 0) {
                    // Reconstruct item object, regenerate icon
                    return {
                        name: savedItem.name,
                        count: savedItem.count,
                        icon: this.generateIconName(savedItem.name)
                    };
                }
                return null;
            });
        }
        console.log("Inventory loaded.");
        this.notifyChange(); // Update UI
    }
}
