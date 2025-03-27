export class InventoryDisplay {
    constructor(inventory) {
        this.inventory = inventory;
        this.displayElement = document.getElementById('inventory-display');
        this.slotsContainer = document.getElementById('inventory-slots');
        this.isOpen = false; // Track visibility state

        if (!this.displayElement || !this.slotsContainer) {
            console.error("Inventory UI elements not found!");
            return;
        }

        // Create initial slots visually
        this.createSlots();

        // Listen for inventory changes
        this.inventory.onChange(() => this.update());

        // Initially hidden
        this.hide();
    }

    createSlots() {
        this.slotsContainer.innerHTML = ''; // Clear previous slots
        for (let i = 0; i < this.inventory.size; i++) {
            const slotElement = document.createElement('div');
            slotElement.classList.add('inventory-slot');
            slotElement.dataset.index = i; // Store index for click handling
            slotElement.innerHTML = `
                <div class="item-icon"></div>
                <span class="item-name"></span>
                <span class="item-count"></span>
            `;
            this.slotsContainer.appendChild(slotElement);
        }
    }

    update() {
         if (!this.isOpen) return; // Only update visuals if the inventory is open

        const slots = this.slotsContainer.querySelectorAll('.inventory-slot');
        if (slots.length !== this.inventory.size) {
             console.warn("Inventory size mismatch, recreating slots.");
             this.createSlots(); // Recreate if size changed (shouldn't happen often)
        }

        this.inventory.items.forEach((item, index) => {
            const slotElement = slots[index];
            if (!slotElement) return;

            const iconElement = slotElement.querySelector('.item-icon');
            const nameElement = slotElement.querySelector('.item-name'); // If needed
            const countElement = slotElement.querySelector('.item-count');

            if (item) {
                 iconElement.className = `item-icon ${item.icon || item.name.toLowerCase().replace(' ', '_')}`; // Apply class for styling
                 iconElement.style.visibility = 'visible';
                 // nameElement.textContent = item.name; // Display name if design allows
                 countElement.textContent = item.count > 1 ? item.count : ''; // Show count only if > 1
                 slotElement.title = `${item.name} (${item.count})`; // Tooltip
            } else {
                 iconElement.className = 'item-icon'; // Reset class
                 iconElement.style.visibility = 'hidden';
                 // nameElement.textContent = '';
                 countElement.textContent = '';
                 slotElement.title = 'Empty';
            }
        });
    }

    toggle() {
        if (this.isOpen) {
            this.hide();
        } else {
            this.show();
        }
    }

    show() {
        this.update(); // Update content before showing
        this.displayElement.classList.remove('hidden');
        this.isOpen = true;
        console.log("Inventory opened");
        // Optional: Pause game or change input mode?
    }

    hide() {
        this.displayElement.classList.add('hidden');
        this.isOpen = false;
        console.log("Inventory closed");
        // Optional: Resume game or restore input mode?
    }

     isOpen() {
         return this.isOpen;
     }
}