import { Inventory, InventoryItem } from "../core/helper";

export class InventoryDisplay {
  inventory: Inventory;
  displayElement: HTMLElement | null;
  slotsContainer: HTMLElement | null;
  isOpen: boolean = false;
  boundUpdateDisplay: (items: Array<InventoryItem | null>) => void;

  constructor(inventory: Inventory) {
    this.inventory = inventory;
    this.displayElement = document.getElementById("inventory-display");
    this.slotsContainer = document.getElementById("inventory-slots");
    if (this.slotsContainer) this.createSlots();
    this.boundUpdateDisplay = this.updateDisplay.bind(this);
    this.inventory.onChange(this.boundUpdateDisplay);
    if (this.displayElement) this.displayElement.classList.add("hidden");
  }

  setInventory(newInventory: Inventory): void {
    if (this.inventory === newInventory) return;
    if (this.inventory) {
      this.inventory.onChangeCallbacks =
        this.inventory.onChangeCallbacks.filter(
          (cb) => cb !== this.boundUpdateDisplay
        );
    }
    this.inventory = newInventory;
    this.inventory.onChange(this.boundUpdateDisplay);
    if (this.isOpen) this.updateDisplay(this.inventory.items);
    else if (
      this.slotsContainer &&
      this.slotsContainer.children.length !== this.inventory.size
    ) {
      this.createSlots();
    }
  }

  createSlots(): void {
    this.slotsContainer!.innerHTML = "";
    for (let i = 0; i < this.inventory.size; i++) {
      const slotElement = document.createElement("div");
      slotElement.classList.add("inventory-slot");
      slotElement.dataset.index = i.toString();
      slotElement.title = "Empty";
      slotElement.innerHTML = `<div class="item-icon" data-current-icon="empty" style="visibility: hidden;"></div><span class="item-count"></span>`;
      this.slotsContainer!.appendChild(slotElement);
    }
  }

  updateDisplay(items: Array<InventoryItem | null>): void {
    if (!this.isOpen || !this.slotsContainer) return;
    const slotElements =
      this.slotsContainer.querySelectorAll<HTMLElement>(".inventory-slot");
    if (slotElements.length !== this.inventory.size) this.createSlots();
    items.forEach((item, index) => {
      const slotElement = slotElements[index];
      if (!slotElement) return;
      const iconElement = slotElement.querySelector<HTMLElement>(".item-icon");
      const countElement =
        slotElement.querySelector<HTMLElement>(".item-count");
      if (item && iconElement && countElement) {
        const iconClass =
          item.icon ||
          item.name.toLowerCase().replace(/ /g, "_").replace(/'/g, "");
        if (iconElement.dataset.currentIcon !== iconClass) {
          iconElement.className = `item-icon ${iconClass}`;
          iconElement.dataset.currentIcon = iconClass;
        }
        iconElement.style.visibility = "visible";
        countElement.textContent = item.count > 1 ? item.count.toString() : "";
        slotElement.title = `${item.name}${item.count > 1 ? ` (${item.count})` : ""}`;
      } else if (iconElement && countElement) {
        if (iconElement.dataset.currentIcon !== "empty") {
          iconElement.className = "item-icon";
          iconElement.style.visibility = "hidden";
          iconElement.dataset.currentIcon = "empty";
        }
        countElement.textContent = "";
        slotElement.title = "Empty";
      }
    });
  }

  toggle(): void {
    this.isOpen ? this.hide() : this.show();
  }

  show(): void {
    if (!this.displayElement || this.isOpen) return;
    this.isOpen = true;
    this.updateDisplay(this.inventory.items);
    this.displayElement.classList.remove("hidden");
  }

  hide(): void {
    if (!this.displayElement || !this.isOpen) return;
    this.isOpen = false;
    this.displayElement.classList.add("hidden");
  }
}
