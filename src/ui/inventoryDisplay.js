export class InventoryDisplay {
    constructor(inventory) {
        if (!inventory) throw new Error("Inventory instance is required for InventoryDisplay.");
        this.inventory = inventory;

        this.displayElement = document.getElementById('inventory-display');
        this.slotsContainer = document.getElementById('inventory-slots');
        this._isOpen = false; // Internal state for visibility

        if (!this.displayElement) console.error("Inventory UI element not found: #inventory-display");
        if (!this.slotsContainer) console.error("Inventory UI element not found: #inventory-slots");

        // Abort if elements are missing
        if (!this.displayElement || !this.slotsContainer) return;

        // Create initial slots visually
        this.createSlots();

        // Listen for inventory changes and bind 'this' context
        this.updateDisplay = this.updateDisplay.bind(this);
        this.inventory.onChange(this.updateDisplay);

        // Initially hidden
        this.hide();
    }

    get isOpen() {
        return this._isOpen;
    }

    createSlots() {
        if (!this.slotsContainer) return;
        this.slotsContainer.innerHTML = ''; // Clear previous slots
        for (let i = 0; i < this.inventory.size; i++) {
            const slotElement = document.createElement('div');
            slotElement.classList.add('inventory-slot');
            slotElement.dataset.index = i; // Store index for click handling
            // Tooltip will be set in updateDisplay
            slotElement.innerHTML = `
                <div class="item-icon"></div>
                <span class="item-count"></span>
            `;
            // Add event listener for potential drag/drop or context menu later
            // slotElement.addEventListener('click', (e) => this.onSlotClick(e, i));
            this.slotsContainer.appendChild(slotElement);
        }
    }

    // Update the visual representation of the inventory slots
    updateDisplay(items = this.inventory.items) { // Accept items array from notification
         if (!this.isOpen || !this.slotsContainer) return; // Only update visuals if open and container exists

        const slots = this.slotsContainer.querySelectorAll('.inventory-slot');
        // Recreate slots if size mismatch (should not happen with fixed size inventory)
        if (slots.length !== this.inventory.size) {
             console.warn("Inventory size mismatch, recreating slots.");
             this.createSlots();
             // Re-query slots after creation
             slots = this.slotsContainer.querySelectorAll('.inventory-slot');
             if (slots.length !== this.inventory.size) {
                console.error("Failed to recreate inventory slots correctly.");
                return;
             }
        }

        items.forEach((item, index) => {
            const slotElement = slots[index];
            if (!slotElement) return; // Should not happen if length check passed

            const iconElement = slotElement.querySelector('.item-icon');
            const countElement = slotElement.querySelector('.item-count');

            if (item && iconElement && countElement) {
                 const iconClass = item.icon || item.name.toLowerCase().replace(/ /g, '_');
                 // Only update classList if it changed to avoid unnecessary reflow
                 if (iconElement.dataset.currentIcon !== iconClass) {
                    iconElement.className = `item-icon ${iconClass}`; // Apply class for styling
                    iconElement.dataset.currentIcon = iconClass;
                 }
                 iconElement.style.visibility = 'visible';
                 countElement.textContent = item.count > 1 ? item.count : ''; // Show count only if > 1
                 slotElement.title = `${item.name}${item.count > 1 ? ' (' + item.count + ')' : ''}`; // Tooltip
            } else if (iconElement && countElement) {
                 // Clear slot if item is null
                 if (iconElement.dataset.currentIcon !== 'empty') {
                    iconElement.className = 'item-icon'; // Reset class
                    iconElement.style.visibility = 'hidden';
                    iconElement.dataset.currentIcon = 'empty';
                 }
                 countElement.textContent = '';
                 slotElement.title = 'Empty';
            }
        });
    }

    toggle() {
        if (this._isOpen) {
            this.hide();
        } else {
            this.show();
        }
    }

    show() {
        if (!this.displayElement) return;
        this._isOpen = true;
        this.updateDisplay(); // Update content *before* showing
        this.displayElement.classList.remove('hidden');
        console.log("Inventory opened");
        // Optional: Pause game or change input mode? Game class should handle this.
    }

    hide() {
        if (!this.displayElement) return;
        this._isOpen = false;
        this.displayElement.classList.add('hidden');
        console.log("Inventory closed");
        // Optional: Resume game or restore input mode? Game class should handle this.
    }

    // Clean up listeners when display is no longer needed
    dispose() {
        this.inventory.removeOnChange(this.updateDisplay);
        console.log("InventoryDisplay disposed.");
    }
}