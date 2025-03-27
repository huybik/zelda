export class Inventory {
    constructor(size = 20) {
        if (size <= 0) throw new Error("Inventory size must be positive.");
        this.size = size;
        this.items = new Array(size).fill(null); // Array of slots { name, count, icon?, data? }
        this.onChangeCallbacks = []; // Callbacks to notify UI/systems of changes

        // Define stack sizes (could be loaded from item database)
        this.itemMaxStack = {
            'default': 64, // Default stack size
            'wood': 99,
            'stone': 99,
            'herb': 30,
            'feather': 50,
            'Health Potion': 10,
            'gold': Infinity, // Or a very large number
            'Hunter\'s Bow': 1 // Unstackable example
        };
    }

    getMaxStack(itemName) {
        return this.itemMaxStack[itemName] || this.itemMaxStack['default'];
    }

    // Add item(s) to the inventory
    // Returns true if all items were added successfully, false otherwise
    addItem(itemName, count = 1) {
        if (!itemName || typeof itemName !== 'string' || count <= 0) {
            console.error("Invalid item name or count:", itemName, count);
            return false;
        }

        const maxStack = this.getMaxStack(itemName);
        let remainingCount = count;

        // 1. Try stacking onto existing non-full stacks
        for (let i = 0; i < this.size && remainingCount > 0; i++) {
            const slot = this.items[i];
            if (slot && slot.name === itemName && slot.count < maxStack) {
                const canAdd = maxStack - slot.count;
                const amountToAdd = Math.min(remainingCount, canAdd);
                slot.count += amountToAdd;
                remainingCount -= amountToAdd;
                console.log(`Stacked ${amountToAdd} ${itemName} in slot ${i}. Total: ${slot.count}`);
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
                        icon: itemName.toLowerCase().replace(/ /g, '_') // Generate icon name
                        // Add other item data here if needed (e.g., description, effects)
                    };
                    remainingCount -= amountToAdd;
                    console.log(`Added ${amountToAdd} ${itemName} to new slot ${i}.`);
                }
            }
        }

        // Notify listeners if any changes were made
        if (remainingCount < count) {
            this.notifyChange();
        }

        // Check if all items were added
        if (remainingCount > 0) {
            console.log(`Inventory full. Could not add ${remainingCount} of ${itemName}.`);
            return false; // Not all items were added
        }

        return true; // All items added successfully
    }

    // Remove item by name
    // Returns true if the full count was removed, false otherwise
    removeItem(itemName, count = 1) {
        if (!itemName || count <= 0) return false;

        let countRemoved = 0;
        let neededToRemove = count;

        // Iterate backwards to remove from later stacks first (optional strategy)
        for (let i = this.size - 1; i >= 0 && neededToRemove > 0; i--) {
            const slot = this.items[i];
            if (slot && slot.name === itemName) {
                const amountToRemove = Math.min(neededToRemove, slot.count);
                slot.count -= amountToRemove;
                countRemoved += amountToRemove;
                neededToRemove -= amountToRemove;

                console.log(`Removed ${amountToRemove} ${itemName} from slot ${i}. Remaining in slot: ${slot.count}`);

                if (slot.count === 0) {
                    this.items[i] = null; // Clear slot if empty
                }
            }
        }

        // Notify if changes occurred
        if (countRemoved > 0) {
            this.notifyChange();
        }

        if (neededToRemove > 0) {
             console.log(`Could not remove all ${count} of ${itemName}. Removed ${countRemoved}.`);
             return false; // Failed to remove the full amount
        }

        return true; // Successfully removed the full amount
    }

     // Remove a specific amount from a specific slot index
    // Returns true on success, false on failure (invalid index, not enough items)
    removeItemByIndex(index, count = 1) {
        if (index < 0 || index >= this.size || !this.items[index] || count <= 0) {
            console.error(`Invalid attempt to remove item from index ${index}`);
            return false;
        }

        const item = this.items[index];
        const removeCount = Math.min(count, item.count); // Don't remove more than exists

        if (removeCount <= 0) return false; // Trying to remove zero items

        item.count -= removeCount;
         console.log(`Removed ${removeCount} ${item.name} from slot ${index}. Remaining: ${item.count}`);

        if (item.count === 0) {
            this.items[index] = null; // Clear the slot
        }

        this.notifyChange();
        return true;
    }


    // Check if inventory contains at least 'count' of 'itemName'
    hasItem(itemName, count = 1) {
        if (count <= 0) return true; // Always have zero or negative items
        return this.countItem(itemName) >= count;
    }

     // Count total amount of a specific item
     countItem(itemName) {
         let totalCount = 0;
         for (let i = 0; i < this.size; i++) {
             if (this.items[i] && this.items[i].name === itemName) {
                 totalCount += this.items[i].count;
             }
         }
         return totalCount;
     }

    // Get item at a specific index
    getItem(index) {
        if (index >= 0 && index < this.size) {
            // Return a copy to prevent external modification? For now, return reference.
            return this.items[index];
        }
        return null;
    }

    // Get all items (e.g., for saving or display)
    getAllItems() {
        // Return a copy of the array with copies of the items to prevent external modification
        return this.items.map(item => item ? { ...item } : null);
    }

     // Get a filtered list of non-empty items
     getFilledSlots() {
         return this.items.filter(item => item !== null).map(item => ({ ...item }));
     }

    // Register a callback function to be called when inventory changes
    onChange(callback) {
        if (typeof callback === 'function') {
            this.onChangeCallbacks.push(callback);
        }
    }

    // Unregister a callback
    removeOnChange(callback) {
        this.onChangeCallbacks = this.onChangeCallbacks.filter(cb => cb !== callback);
    }

    // Notify all registered callbacks
    notifyChange() {
        // Pass a copy of the items array to listeners
        const itemsCopy = this.getAllItems();
        this.onChangeCallbacks.forEach(cb => {
            try {
                cb(itemsCopy);
            } catch (error) {
                console.error("Error in inventory onChange callback:", error);
            }
        });
    }

     // --- Save/Load ---
    getSaveData() {
        // Only save non-null slots
        return this.items.map(item => item ? { name: item.name, count: item.count } : null);
    }

    loadSaveData(savedItems) {
        if (!Array.isArray(savedItems) || savedItems.length !== this.size) {
            console.error("Invalid inventory save data format or size mismatch.");
            // Optionally clear inventory or attempt partial load
            this.items.fill(null);
        } else {
            this.items = savedItems.map(savedItem => {
                if (savedItem && savedItem.name && savedItem.count > 0) {
                    // Reconstruct item object, generate icon etc.
                    return {
                        ...savedItem,
                        icon: savedItem.name.toLowerCase().replace(/ /g, '_')
                    };
                }
                return null;
            });
        }
        console.log("Inventory loaded.");
        this.notifyChange(); // Notify UI about loaded state
    }
}