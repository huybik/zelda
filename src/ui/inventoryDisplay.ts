
import { Inventory } from '../systems/inventory';
import { InventoryItem } from '../types/common';

export class InventoryDisplay {
    private inventory: Inventory;
    private displayElement: HTMLElement | null;
    private slotsContainer: HTMLElement | null;
    private _isOpen: boolean = false;
    private boundUpdateDisplay: (items: Array<InventoryItem | null>) => void;

    constructor(inventory: Inventory) {
        this.inventory = inventory;
        this.displayElement = document.getElementById('inventory-display');
        this.slotsContainer = document.getElementById('inventory-slots');

        if (!this.displayElement || !this.slotsContainer) {
            console.error("Inventory UI elements not found."); return;
        }
        this.createSlots();
        this.boundUpdateDisplay = this.updateDisplay.bind(this);
        this.inventory.onChange(this.boundUpdateDisplay);
        this.hide();
    }

    public get isOpen(): boolean { return this._isOpen; }

    private createSlots(): void {
        if (!this.slotsContainer) return;
        this.slotsContainer.innerHTML = ''; // Clear
        for (let i = 0; i < this.inventory.size; i++) {
            const slot = document.createElement('div');
            slot.className = 'inventory-slot';
            slot.dataset.index = i.toString();
            slot.title = 'Empty';
            slot.innerHTML = `<div class="item-icon" data-icon="empty" style="visibility: hidden;"></div><span class="item-count"></span>`;
            // Add click/drag listeners if needed: slot.addEventListener('click', (e) => this.onSlotClick(e, i));
            this.slotsContainer.appendChild(slot);
        }
    }

    private updateDisplay(items: Array<InventoryItem | null> = this.inventory.items): void {
        if (!this._isOpen || !this.slotsContainer) return;
        const slotElements = this.slotsContainer.querySelectorAll<HTMLElement>('.inventory-slot');
        if (slotElements.length !== this.inventory.size) this.createSlots(); // Recreate if mismatch

        items.forEach((item, index) => {
            const slot = slotElements[index];
            if (!slot) return;
            const iconEl = slot.querySelector<HTMLElement>('.item-icon');
            const countEl = slot.querySelector<HTMLElement>('.item-count');
            if (!iconEl || !countEl) return;

            if (item) {
                const iconClass = item.icon || 'default_icon';
                if (iconEl.dataset.icon !== iconClass) {
                    iconEl.className = `item-icon ${iconClass}`; // Update CSS class for background
                    iconEl.dataset.icon = iconClass;
                }
                iconEl.style.visibility = 'visible';
                countEl.textContent = item.count > 1 ? item.count.toString() : '';
                slot.title = `${item.name}${item.count > 1 ? ` (${item.count})` : ''}`;
            } else { // Clear slot
                if (iconEl.dataset.icon !== 'empty') {
                    iconEl.className = 'item-icon'; iconEl.dataset.icon = 'empty';
                    iconEl.style.visibility = 'hidden';
                }
                countEl.textContent = ''; slot.title = 'Empty';
            }
        });
    }

    public toggle(): void { this._isOpen ? this.hide() : this.show(); }

    public show(): void {
        if (!this.displayElement || this._isOpen) return;
        this._isOpen = true; this.updateDisplay(); // Update content before showing
        this.displayElement.classList.remove('hidden'); console.log("Inventory opened");
    }

    public hide(): void {
        if (!this.displayElement || !this._isOpen) return;
        this._isOpen = false; this.displayElement.classList.add('hidden'); console.log("Inventory closed");
    }

    public dispose(): void {
        this.inventory.removeOnChange(this.boundUpdateDisplay);
        console.log("InventoryDisplay disposed.");
    }
}