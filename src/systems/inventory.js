export class Inventory {
    constructor(size = 20) {
        this.size = size;
        this.items = new Array(size).fill(null); // Array of slots { name, count, icon? }
        this.onChangeCallbacks = []; // Callbacks to notify UI of changes
    }

    // Add item to the first available slot or stack if possible
    addItem(itemName, count = 1) {
        if (!itemName || count <= 0) return false;

        // Try stacking first (assuming items have a max stack size, e.g., 99)
        // For simplicity now, we just look for existing stacks
        for (let i = 0; i < this.size; i++) {
            if (this.items[i] && this.items[i].name === itemName) {
                // Basic stacking - add more logic for max stack size if needed
                this.items[i].count += count;
                this.notifyChange();
                console.log(`Added ${count} ${itemName} to stack. Total: ${this.items[i].count}`);
                return true;
            }
        }

        // Find empty slot if no stack found
        const emptySlotIndex = this.items.findIndex(slot => slot === null);
        if (emptySlotIndex !== -1) {
            this.items[emptySlotIndex] = { name: itemName, count: count, icon: itemName.toLowerCase().replace(' ', '_') };
            this.notifyChange();
            console.log(`Added ${count} ${itemName} to new slot ${emptySlotIndex}.`);
            return true;
        }

        console.log(`Inventory full. Could not add ${itemName}.`);
        return false; // Inventory is full
    }

    // Remove item by name
    removeItem(itemName, count = 1) {
        if (!itemName || count <= 0) return false;
        let countToRemove = count;

        // Iterate backwards to remove from later stacks first (optional strategy)
        for (let i = this.size - 1; i >= 0; i--) {
            if (this.items[i] && this.items[i].name === itemName) {
                if (this.items[i].count >= countToRemove) {
                    this.items[i].count -= countToRemove;
                     console.log(`Removed ${countToRemove} ${itemName}. Remaining: ${this.items[i].count}`);
                    if (this.items[i].count === 0) {
                        this.items[i] = null; // Clear slot if empty
                    }
                    this.notifyChange();
                    return true; // Removed sufficient amount
                } else {
                    // Remove entire stack and continue searching
                     countToRemove -= this.items[i].count;
                     console.log(`Removed stack of ${this.items[i].count} ${itemName}. Need ${countToRemove} more.`);
                    this.items[i] = null;
                }
            }
        }

        this.notifyChange(); // Notify even if only partial removal occurred

        if (countToRemove < count) {
             console.log(`Removed partial amount of ${itemName}. Could not remove all ${count}.`);
             return true; // Partially successful
        } else {
             console.log(`Item ${itemName} not found in sufficient quantity.`);
             return false; // Item not found or not enough quantity
        }
    }

     // Remove item by specific slot index
    removeItemByIndex(index, count = 1) {
        if (index < 0 || index >= this.size || !this.items[index] || count <= 0) {
            return false;
        }

        const item = this.items[index];
        const removeCount = Math.min(count, item.count); // Don't remove more than exists

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
        let totalCount = 0;
        for (let i = 0; i < this.size; i++) {
            if (this.items[i] && this.items[i].name === itemName) {
                totalCount += this.items[i].count;
            }
        }
        return totalCount >= count;
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
            return this.items[index];
        }
        return null;
    }

    // Get all items (e.g., for saving)
    getAllItems() {
        return this.items.filter(item => item !== null); // Return only non-empty slots
    }

    // Register a callback function to be called when inventory changes
    onChange(callback) {
        this.onChangeCallbacks.push(callback);
    }

    // Notify all registered callbacks
    notifyChange() {
        this.onChangeCallbacks.forEach(cb => cb(this.items));
    }
}