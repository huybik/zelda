import { Inventory } from '../systems/inventory';
import { InventoryItem } from '../types/common';

export class InventoryDisplay {
    private inventory: Inventory;
    private displayElement: HTMLElement | null;
    private slotsContainer: HTMLElement | null;
    private _isOpen: boolean;

    private boundUpdateDisplay!: (items: Array<InventoryItem | null>) => void;

    constructor(inventory: Inventory) {
        if (!inventory) throw new Error("Inventory instance is required for InventoryDisplay.");
        this.inventory = inventory;
        this._isOpen = false;

        this.displayElement = document.getElementById('inventory-display');
        this.slotsContainer = document.getElementById('inventory-slots');

        if (!this.displayElement || !this.slotsContainer) {
            console.error("Inventory UI elements not found (#inventory-display or #inventory-slots). Aborting setup.");
            return; // Don't proceed if elements are missing
        }

        this.createSlots();

        // Bind listener for inventory changes
        this.boundUpdateDisplay = this.updateDisplay.bind(this);
        this.inventory.onChange(this.boundUpdateDisplay);

        this.hide(); // Start hidden
    }

    public get isOpen(): boolean {
        return this._isOpen;
    }

    private createSlots(): void {
        if (!this.slotsContainer) return;
        this.slotsContainer.innerHTML = ''; // Clear previous slots

        for (let i = 0; i < this.inventory.size; i++) {
            const slotElement = document.createElement('div');
            slotElement.classList.add('inventory-slot');
            slotElement.dataset.index = i.toString();
            slotElement.title = 'Empty'; // Default tooltip
            slotElement.innerHTML = `
                <div class="item-icon" data-current-icon="empty" style="visibility: hidden;"></div>
                <span class="item-count"></span>
            `;
            // Add click/drag listeners here if needed
            // slotElement.addEventListener('click', (e) => this.onSlotClick(e, i));
            this.slotsContainer.appendChild(slotElement);
        }
    }

    // Update the visual representation based on inventory data
    private updateDisplay(items: Array<InventoryItem | null> = this.inventory.items): void {
        // Only update visuals if the panel is open and elements exist
        if (!this._isOpen || !this.slotsContainer) return;

        let slotElements = this.slotsContainer.querySelectorAll<HTMLElement>('.inventory-slot');

        // Basic check for mismatch, recreate if necessary (shouldn't happen often)
        if (slotElements.length !== this.inventory.size) {
             console.warn("Inventory size mismatch vs UI slots. Recreating slots.");
             this.createSlots();
             // Re-query elements
             slotElements = this.slotsContainer.querySelectorAll<HTMLElement>('.inventory-slot');
             if (slotElements.length !== this.inventory.size) {
                 console.error("Failed to recreate inventory slots correctly.");
                 return; // Critical error if slots still don't match
             }
        }

        items.forEach((item, index) => {
            const slotElement = slotElements[index];
            if (!slotElement) return; // Skip if somehow missing

            const iconElement = slotElement.querySelector<HTMLElement>('.item-icon');
            const countElement = slotElement.querySelector<HTMLElement>('.item-count');

            if (item && iconElement && countElement) {
                const iconClass = item.icon || 'default_icon'; // Use generated or default icon class
                // Update icon class only if changed
                if (iconElement.dataset.currentIcon !== iconClass) {
                    iconElement.className = `item-icon ${iconClass}`; // Set class for CSS background/styling
                    iconElement.dataset.currentIcon = iconClass;
                }
                 iconElement.style.visibility = 'visible';
                 countElement.textContent = item.count > 1 ? item.count.toString() : '';
                 slotElement.title = `${item.name}${item.count > 1 ? ` (${item.count})` : ''}`;
            } else if (iconElement && countElement) {
                // Clear the slot if item is null
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

    public toggle(): void {
        if (this._isOpen) {
            this.hide();
        } else {
            this.show();
        }
    }

    public show(): void {
        if (!this.displayElement) return;
        if (this._isOpen) return; // Already open

        this._isOpen = true;
        this.updateDisplay(this.inventory.items); // Update content *before* showing
        this.displayElement.classList.remove('hidden');
        console.log("Inventory opened");
        // Game class handles pausing and pointer lock release
    }

    public hide(): void {
        if (!this.displayElement) return;
        if (!this._isOpen) return; // Already hidden

        this._isOpen = false;
        this.displayElement.classList.add('hidden');
        console.log("Inventory closed");
        // Game class handles unpausing and pointer lock acquire (if appropriate)
    }

    public dispose(): void {
        this.inventory.removeOnChange(this.boundUpdateDisplay);
        console.log("InventoryDisplay disposed.");
        // Remove event listeners added to slots if any
    }
}