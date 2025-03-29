import { Inventory } from '../systems/inventory';
import { InventoryItem } from '../types/common';

export class InventoryDisplay {
    private inventory: Inventory;
    private displayElement: HTMLElement | null;
    private slotsContainer: HTMLElement | null;
    private _isOpen: boolean = false;
    // FIX: Use definite assignment assertion '!' as it's initialized in constructor
    private boundUpdateDisplay!: (items: Array<InventoryItem | null>) => void;

    constructor(inventory: Inventory) {
        this.inventory = inventory;
        this.displayElement = document.getElementById('inventory-display');
        this.slotsContainer = document.getElementById('inventory-slots');

        if (!this.displayElement || !this.slotsContainer) {
            console.error("Inventory UI elements not found."); return;
        }
        // Initialization of bound method happens here
        this.boundUpdateDisplay = this.updateDisplay.bind(this);

        this.createSlots();
        this.inventory.onChange(this.boundUpdateDisplay);
        this.hide();
    }

    public get isOpen(): boolean { return this._isOpen; }

    private createSlots(): void {
        if (!this.slotsContainer) return;
        this.slotsContainer.innerHTML = ''; // Clear existing slots
        for (let i = 0; i < this.inventory.size; i++) {
            const slot = document.createElement('div');
            slot.className = 'inventory-slot';
            slot.dataset.index = i.toString();
            slot.title = 'Empty'; // Tooltip for empty slot
            // Use data-icon attribute for easier icon management via CSS/JS
            slot.innerHTML = `<div class="item-icon" data-icon="empty" style="visibility: hidden;"></div><span class="item-count"></span>`;
            // Add event listeners if needed (e.g., for drag/drop, clicking):
            // slot.addEventListener('click', (e) => this.onSlotClick(e, i));
            this.slotsContainer.appendChild(slot);
        }
    }

    private updateDisplay(items: Array<InventoryItem | null> = this.inventory.items): void {
        // Don't update if not open or container missing
        if (!this._isOpen || !this.slotsContainer) return;

        const slotElements = this.slotsContainer.querySelectorAll<HTMLElement>('.inventory-slot');
        // If the number of slots doesn't match inventory size, recreate them
        if (slotElements.length !== this.inventory.size) {
             console.warn("Inventory slot count mismatch. Recreating slots.");
             this.createSlots();
             // Re-query elements after creation
             this.updateDisplay(items); // Call self again to update the new slots
             return;
        }


        items.forEach((item, index) => {
            const slot = slotElements[index];
            if (!slot) return; // Should not happen if length matches

            const iconEl = slot.querySelector<HTMLElement>('.item-icon');
            const countEl = slot.querySelector<HTMLElement>('.item-count');

            if (!iconEl || !countEl) {
                 console.error(`Slot ${index} missing internal elements.`);
                 return; // Skip malformed slot
            }


            if (item) {
                const iconClass = item.icon || 'default_icon'; // Use item's icon or a default
                // Update icon class only if it changed
                if (iconEl.dataset.icon !== iconClass) {
                    iconEl.className = `item-icon ${iconClass}`; // Set class based on item name/type
                    iconEl.dataset.icon = iconClass; // Store current icon in data attribute
                }
                iconEl.style.visibility = 'visible'; // Make icon visible
                // Display count only if greater than 1
                countEl.textContent = item.count > 1 ? item.count.toString() : '';
                // Update tooltip
                slot.title = `${item.name}${item.count > 1 ? ` (${item.count})` : ''}`;
            } else { // Clear the slot if no item
                // Reset icon only if it wasn't already empty
                if (iconEl.dataset.icon !== 'empty') {
                    iconEl.className = 'item-icon'; // Reset to base class
                    iconEl.dataset.icon = 'empty'; // Mark as empty
                    iconEl.style.visibility = 'hidden'; // Hide icon
                }
                countEl.textContent = ''; // Clear count
                slot.title = 'Empty'; // Reset tooltip
            }
        });
    }

    public toggle(): void { this._isOpen ? this.hide() : this.show(); }

    public show(): void {
        if (!this.displayElement || this._isOpen) return;
        this._isOpen = true;
        this.updateDisplay(); // Update content *before* showing
        this.displayElement.classList.remove('hidden');
        console.log("Inventory opened");
    }

    public hide(): void {
        if (!this.displayElement || !this._isOpen) return;
        this._isOpen = false;
        this.displayElement.classList.add('hidden');
        console.log("Inventory closed");
    }

    public dispose(): void {
        // Remove the listener when the display is disposed
        this.inventory.removeOnChange(this.boundUpdateDisplay);
        console.log("InventoryDisplay disposed.");
    }
}