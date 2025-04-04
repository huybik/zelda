// src/ui/InventoryDisplay.ts
import { Inventory } from "../core/Inventory";
import type { InventoryItem } from "../types";

export class InventoryDisplay {
  inventory: Inventory; // Reference to the player's inventory instance
  displayElement: HTMLElement | null;
  slotsContainer: HTMLElement | null;
  isOpen: boolean = false;

  // Bound function reference for listener removal
  private boundUpdateDisplay: (items: Array<InventoryItem | null>) => void;

  constructor(inventory: Inventory) {
    this.inventory = inventory;
    this.displayElement = document.getElementById("inventory-display");
    this.slotsContainer = document.getElementById("inventory-slots");

    if (!this.displayElement || !this.slotsContainer) {
      console.error("Inventory UI elements not found in DOM.");
      // Optionally disable the display if elements are missing
      this.inventory = new Inventory(0); // Set to empty inventory to avoid errors
      this.boundUpdateDisplay = () => {}; // No-op function
      return;
    }

    // Bind the update function to this instance
    this.boundUpdateDisplay = this.updateDisplay.bind(this);
    // Register the bound function as a listener
    this.inventory.onChange(this.boundUpdateDisplay);

    this.createSlots(); // Create initial slot elements
    this.hide(); // Start hidden
  }

  // Updates the inventory instance being displayed (e.g., on player switch).
  setInventory(newInventory: Inventory): void {
    if (this.inventory === newInventory || !this.boundUpdateDisplay) return;

    // Remove listener from the old inventory instance
    this.inventory.onChangeCallbacks = this.inventory.onChangeCallbacks.filter(
      (cb) => cb !== this.boundUpdateDisplay
    );

    // Set the new inventory instance
    this.inventory = newInventory;

    // Add listener to the new inventory instance
    this.inventory.onChange(this.boundUpdateDisplay);

    // Recreate slots if the size differs
    if (
      this.slotsContainer &&
      this.slotsContainer.children.length !== this.inventory.size
    ) {
      this.createSlots();
    }

    // Update the display immediately if it's currently open
    if (this.isOpen) {
      this.updateDisplay(this.inventory.items);
    }
  }

  // Creates the required number of slot elements in the DOM.
  private createSlots(): void {
    if (!this.slotsContainer) return;

    this.slotsContainer.innerHTML = ""; // Clear any existing slots
    for (let i = 0; i < this.inventory.size; i++) {
      const slotElement = document.createElement("div");
      slotElement.classList.add("inventory-slot");
      slotElement.dataset.index = i.toString(); // Store index for potential interactions
      slotElement.title = "Empty"; // Tooltip for empty slot

      // Structure for icon and count
      slotElement.innerHTML = `
          <div class="item-icon" data-icon="empty" style="visibility: hidden;"></div>
          <span class="item-count"></span>
      `;
      this.slotsContainer.appendChild(slotElement);
    }
  }

  // Updates the visual representation of the inventory slots based on item data.
  updateDisplay(items: Array<InventoryItem | null>): void {
    if (!this.isOpen || !this.slotsContainer) return; // Only update if open and elements exist

    const slotElements =
      this.slotsContainer.querySelectorAll<HTMLElement>(".inventory-slot");

    // Ensure the number of slot elements matches the inventory size
    if (slotElements.length !== this.inventory.size) {
      console.warn("Inventory slot count mismatch. Recreating slots.");
      this.createSlots(); // Recreate slots if necessary
      // Re-query elements after creation
      this.updateDisplay(items); // Call again to update the newly created slots
      return;
    }

    items.forEach((item, index) => {
      const slotElement = slotElements[index];
      if (!slotElement) return; // Should not happen after check, but safety first

      const iconElement = slotElement.querySelector<HTMLElement>(".item-icon");
      const countElement =
        slotElement.querySelector<HTMLElement>(".item-count");

      if (!iconElement || !countElement) return; // Skip if slot structure is broken

      if (item) {
        // Item exists in this slot
        // Determine icon class name (use provided icon or generate from name)
        const iconClass =
          item.icon ||
          item.name.toLowerCase().replace(/ /g, "_").replace(/'/g, "");

        // Update icon only if it changed
        if (iconElement.dataset.icon !== iconClass) {
          iconElement.className = `item-icon ${iconClass}`; // Set class for background image via CSS
          iconElement.dataset.icon = iconClass; // Store current icon identifier
        }
        iconElement.style.visibility = "visible"; // Make icon visible

        // Update count display (show only if count > 1)
        countElement.textContent = item.count > 1 ? item.count.toString() : "";
        // Update tooltip
        slotElement.title = `${item.name}${item.count > 1 ? ` (${item.count})` : ""}`;
      } else {
        // Slot is empty
        // Reset icon if it wasn't already empty
        if (iconElement.dataset.icon !== "empty") {
          iconElement.className = "item-icon"; // Reset class
          iconElement.dataset.icon = "empty";
        }
        iconElement.style.visibility = "hidden"; // Hide icon element
        countElement.textContent = ""; // Clear count text
        slotElement.title = "Empty"; // Reset tooltip
      }
    });
  }

  // Toggles the visibility of the inventory display.
  toggle(): void {
    this.isOpen ? this.hide() : this.show();
  }

  // Shows the inventory display.
  show(): void {
    if (!this.displayElement || this.isOpen) return; // Do nothing if already open or element missing
    this.isOpen = true;
    this.updateDisplay(this.inventory.items); // Update content when showing
    this.displayElement.classList.remove("hidden");
    console.log("Inventory opened");
  }

  // Hides the inventory display.
  hide(): void {
    if (!this.displayElement || !this.isOpen) return; // Do nothing if already hidden or element missing
    this.isOpen = false;
    this.displayElement.classList.add("hidden");
    console.log("Inventory closed");
  }

  // Clean up listeners when the display is no longer needed.
  dispose(): void {
    // Remove the listener from the inventory instance
    if (this.inventory && this.boundUpdateDisplay) {
      this.inventory.onChangeCallbacks =
        this.inventory.onChangeCallbacks.filter(
          (cb) => cb !== this.boundUpdateDisplay
        );
    }
    console.log("InventoryDisplay disposed");
  }
}
