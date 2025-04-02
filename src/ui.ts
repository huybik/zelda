// File: /src/ui.ts
import { Character } from "./entities";
import { Inventory, EventLog, InventoryItem, EventEntry } from "./ultils"; // Added EventEntry
import { Object3D, Vector3 } from "three";

export class HUD {
  player: Character;
  healthBarElement: HTMLElement | null;
  staminaBarElement: HTMLElement | null;
  fpsDisplayElement: HTMLElement | null; // New property for FPS display
  frameTimes: number[] = []; // Array to store frame times
  MAX_SAMPLES: number = 60; // Number of frames to average (e.g., ~1 second at 60 FPS)
  lastUpdateTime: number; // Timestamp of the last update

  constructor(player: Character) {
    this.player = player;
    this.healthBarElement = document.getElementById("health-bar");
    this.staminaBarElement = document.getElementById("stamina-bar");
    this.fpsDisplayElement = document.getElementById("fps-display"); // Initialize FPS element
    this.lastUpdateTime = performance.now(); // Set initial time in milliseconds
    this.update(); // Initial call (existing behavior)
  }

  update(): void {
    // Calculate time since last frame
    const currentTime = performance.now(); // Current time in milliseconds
    const deltaTime = (currentTime - this.lastUpdateTime) / 1000; // Convert to seconds
    this.lastUpdateTime = currentTime; // Update last time

    // Update FPS calculation
    this.frameTimes.push(deltaTime); // Add new frame time
    if (this.frameTimes.length > this.MAX_SAMPLES) {
      this.frameTimes.shift(); // Remove oldest if exceeding sample limit
    }
    const averageDelta =
      this.frameTimes.reduce((a, b) => a + b, 0) / this.frameTimes.length; // Average frame time
    const fps = 1 / averageDelta; // FPS = 1 / average time per frame
    if (this.fpsDisplayElement) {
      this.fpsDisplayElement.textContent = `FPS: ${Math.round(fps)}`; // Update display
    }

    // Existing health and stamina update logic
    if (this.player.isDead) {
      if (this.healthBarElement) this.healthBarElement.style.width = `0%`;
      if (this.staminaBarElement) this.staminaBarElement.style.width = `0%`;
      return;
    }
    if (!this.healthBarElement || !this.staminaBarElement) return;
    const healthPercent = Math.max(
      0,
      (this.player.health / this.player.maxHealth) * 100
    );
    this.healthBarElement.style.width = `${healthPercent}%`;
    this.healthBarElement.style.backgroundColor =
      healthPercent < 30
        ? "#FF4500"
        : healthPercent < 60
        ? "#FFA500"
        : "#4CAF50";
    const staminaPercent = Math.max(
      0,
      (this.player.stamina / this.player.maxStamina) * 100
    );
    this.staminaBarElement.style.width = `${staminaPercent}%`;
    if (this.player.isExhausted) {
      this.staminaBarElement.style.backgroundColor = "#888";
      this.staminaBarElement.classList.add("exhausted");
    } else {
      this.staminaBarElement.style.backgroundColor = "#FF69B4";
      this.staminaBarElement.classList.remove("exhausted");
    }
  }
}

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

  // Method to update the inventory reference
  setInventory(newInventory: Inventory): void {
    if (this.inventory === newInventory) return;

    // Remove listener from old inventory
    if (this.inventory) {
      this.inventory.onChangeCallbacks =
        this.inventory.onChangeCallbacks.filter(
          (cb) => cb !== this.boundUpdateDisplay
        );
    }

    this.inventory = newInventory;

    // Add listener to new inventory
    this.inventory.onChange(this.boundUpdateDisplay);

    // Update display if open
    if (this.isOpen) {
      this.updateDisplay(this.inventory.items);
    } else {
      // Ensure slots are created for the new inventory size if needed
      if (
        this.slotsContainer &&
        this.slotsContainer.children.length !== this.inventory.size
      ) {
        this.createSlots();
      }
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
    if (slotElements.length !== this.inventory.size) this.createSlots(); // Recreate if size mismatch
    items.forEach((item, index) => {
      const slotElement = slotElements[index];
      if (!slotElement) return;
      const iconElement = slotElement.querySelector<HTMLElement>(".item-icon");
      const countElement =
        slotElement.querySelector<HTMLElement>(".item-count");
      if (item && iconElement && countElement) {
        const iconClass =
          item.icon ||
          item.name.toLowerCase().replace(/ /g, "_").replace(/'/g, ""); // Generate icon class if missing
        if (iconElement.dataset.currentIcon !== iconClass) {
          iconElement.className = `item-icon ${iconClass}`;
          iconElement.dataset.currentIcon = iconClass;
        }
        iconElement.style.visibility = "visible";
        countElement.textContent = item.count > 1 ? item.count.toString() : "";
        slotElement.title = `${item.name}${
          item.count > 1 ? ` (${item.count})` : ""
        }`;
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

export class JournalDisplay {
  eventLog: EventLog;
  displayElement: HTMLElement | null;
  eventListElement: HTMLElement | null;
  isOpen: boolean = false;
  boundUpdateEvents: (entries: EventEntry[]) => void; // Changed to accept EventEntry[]

  constructor(eventLog: EventLog) {
    this.eventLog = eventLog;
    this.displayElement = document.getElementById("journal-display");
    this.eventListElement = document.getElementById("event-log");
    this.boundUpdateEvents = this.updateEvents.bind(this);
    this.eventLog.onChange(this.boundUpdateEvents); // Register listener
    if (this.displayElement) this.displayElement.classList.add("hidden");
  }

  // Method to change the event log being displayed
  setEventLog(newEventLog: EventLog): void {
    if (this.eventLog === newEventLog) return;

    // Remove listener from the old event log
    if (this.eventLog) {
      this.eventLog.onChangeCallbacks = this.eventLog.onChangeCallbacks.filter(
        (cb) => cb !== this.boundUpdateEvents
      );
    }

    this.eventLog = newEventLog;

    // Add listener to the new event log
    this.eventLog.onChange(this.boundUpdateEvents);

    // Update display if open
    if (this.isOpen) {
      this.updateEvents(this.eventLog.entries);
    }
  }

  updateEvents(entries: EventEntry[]): void {
    // Changed parameter type
    if (!this.isOpen || !this.eventListElement) return;
    this.eventListElement.innerHTML =
      entries.length === 0 ? "<li>No events recorded yet.</li>" : "";
    // Display entries in chronological order (newest at the bottom)
    entries.forEach((entry) => {
      const li = document.createElement("li");
      // Use the message field for display
      li.textContent = `[${entry.timestamp}] ${entry.message}`;
      this.eventListElement!.appendChild(li);
    });
    // Scroll to the bottom to show the latest entries
    this.eventListElement.scrollTop = this.eventListElement.scrollHeight;
  }

  toggle(): void {
    this.isOpen ? this.hide() : this.show();
  }

  show(): void {
    if (!this.displayElement || this.isOpen) return;
    this.isOpen = true;
    this.updateEvents(this.eventLog.entries); // Pass raw entries
    this.displayElement.classList.remove("hidden");
  }

  hide(): void {
    if (!this.displayElement || !this.isOpen) return;
    this.isOpen = false;
    this.displayElement.classList.add("hidden");
  }
}

export class Minimap {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  player: Character;
  entities: Array<any>;
  worldSize: number;
  mapSize: number;
  mapScale: number;
  halfMapSize: number;
  halfWorldSize: number;
  bgColor: string = "rgba(100, 100, 100, 0.6)";
  playerColor: string = "yellow";
  npcColor: string = "cyan";
  dotSize: number = 3;
  playerDotSize: number = 4;
  playerTriangleSize: number;

  private entityPosition = new Vector3();
  private playerPosition = new Vector3();
  private playerForward = new Vector3();

  constructor(
    canvasElement: HTMLCanvasElement | null,
    player: Character,
    entities: Array<any>,
    worldSize: number
  ) {
    if (!canvasElement) {
      throw new Error("Minimap requires a valid canvas element.");
    }
    this.canvas = canvasElement;
    const context = this.canvas.getContext("2d");
    if (!context) {
      throw new Error("Could not get 2D rendering context for minimap canvas.");
    }
    this.ctx = context;

    this.player = player;
    this.entities = entities;
    this.worldSize = worldSize;

    this.mapSize = this.canvas.width;
    this.mapScale = this.mapSize / this.worldSize;
    this.halfMapSize = this.mapSize / 2;
    this.halfWorldSize = this.worldSize / 2;

    this.playerTriangleSize = this.playerDotSize * 1.5;
  }

  update(): void {
    this.ctx.fillStyle = this.bgColor;
    this.ctx.fillRect(0, 0, this.mapSize, this.mapSize);

    if (this.player.isDead || !this.player.mesh) {
      return;
    }

    this.player.mesh.getWorldPosition(this.playerPosition);
    this.player.mesh.getWorldDirection(this.playerForward);

    const playerRotationAngle = Math.atan2(
      this.playerForward.x,
      this.playerForward.z
    );

    this.ctx.save();

    this.ctx.translate(this.halfMapSize, this.halfMapSize);

    this.ctx.rotate(-playerRotationAngle);

    const playerMapX = this.worldToMapX(this.playerPosition.x);
    const playerMapZ = this.worldToMapZ(this.playerPosition.z);
    this.ctx.translate(-playerMapX, -playerMapZ);

    this.entities.forEach((entity) => {
      if (
        !entity ||
        entity === this.player ||
        (entity instanceof Character && entity.isDead)
      ) {
        return;
      }

      const mesh =
        entity instanceof Character || entity instanceof Object3D
          ? (entity as any).mesh ?? entity
          : null; // Handle non-mesh entities better
      if (
        !mesh ||
        !(mesh instanceof Object3D) ||
        !mesh.parent ||
        !mesh.visible
      ) {
        return;
      }

      mesh.getWorldPosition(this.entityPosition);

      const entityMapX = this.worldToMapX(this.entityPosition.x);
      const entityMapZ = this.worldToMapZ(this.entityPosition.z);

      let color = "gray";
      let size = this.dotSize;
      let draw = false;

      if (entity.userData?.resource) {
        switch (entity.userData.resource) {
          case "wood":
            color = "saddlebrown";
            break;
          case "stone":
            color = "darkgray";
            break;
          case "herb":
            color = "limegreen";
            break;
          default:
            color = "white";
        }
        draw = true;
      } else if (entity.userData?.isNPC) {
        // Use isNPC flag
        color = this.npcColor;
        size += 1;
        draw = true;
      } else if (entity.userData?.isEnemy) {
        // Assuming an isEnemy flag might exist
        color = "red";
        size += 1;
        draw = true;
      } else if (entity.userData?.isInteractable) {
        // Generic interactable
        color = "lightblue";
        draw = true;
      }

      if (draw) {
        this.drawDot(entityMapX, entityMapZ, color, size);
      }
    });

    this.ctx.restore();

    this.drawPlayerTriangle(
      this.halfMapSize,
      this.halfMapSize,
      this.playerColor,
      this.playerTriangleSize
    );
  }

  worldToMapX(worldX: number): number {
    // Invert Z axis for map coordinates (positive Z world is down on map)
    return (worldX + this.halfWorldSize) * this.mapScale;
  }

  worldToMapZ(worldZ: number): number {
    // Invert Z axis for map coordinates (positive Z world is down on map)
    return (this.halfWorldSize - worldZ) * this.mapScale;
  }

  drawDot(mapX: number, mapY: number, color: string, size: number): void {
    this.ctx.fillStyle = color;
    this.ctx.beginPath();
    this.ctx.arc(mapX, mapY, size, 0, Math.PI * 2);
    this.ctx.fill();
  }

  drawPlayerTriangle(
    centerX: number,
    centerY: number,
    color: string,
    size: number
  ): void {
    const height = size * 1.5;
    const width = size;

    this.ctx.fillStyle = color;
    this.ctx.beginPath();
    // Point triangle upwards (representing forward direction in rotated view)
    this.ctx.moveTo(centerX, centerY - height * 0.6);
    this.ctx.lineTo(centerX - width / 2, centerY + height * 0.4);
    this.ctx.lineTo(centerX + width / 2, centerY + height * 0.4);
    this.ctx.closePath();
    this.ctx.fill();
  }
}
