// File: /src/systems/inventory.ts

import { InventoryItem } from '../types/common';

export class Inventory {
    public readonly size: number;
    public items: Array<InventoryItem | null>;
    private onChangeCallbacks: Array<(items: Array<InventoryItem | null>) => void>;
    private itemMaxStack: Record<string, number>;

    constructor(size: number = 20) {
        this.size = Math.max(1, size);
        this.items = new Array(this.size).fill(null);
        this.onChangeCallbacks = [];
        // Define stack sizes (can be externalized to config/data file)
        this.itemMaxStack = {
            'default': 64, 'wood': 99, 'stone': 99, 'herb': 30, 'feather': 50,
            'Health Potion': 10, 'gold': Infinity, 'Hunter\'s Bow': 1,
        };
    }

    private getMaxStack(itemName: string): number {
        return this.itemMaxStack[itemName] ?? this.itemMaxStack['default'];
    }

    public addItem(itemName: string, count: number = 1): boolean {
        if (!itemName || count <= 0) return false;

        const maxStack = this.getMaxStack(itemName);
        let remaining = count;
        let changed = false;

        // 1. Stack existing
        for (let i = 0; i < this.size && remaining > 0; i++) {
            const slot = this.items[i];
            if (slot?.name === itemName && slot.count < maxStack) {
                const canAdd = Math.min(remaining, maxStack - slot.count);
                slot.count += canAdd; remaining -= canAdd; changed = true;
            }
        }
        // 2. Add new stacks
        for (let i = 0; i < this.size && remaining > 0; i++) {
            if (!this.items[i]) {
                const amountToAdd = Math.min(remaining, maxStack);
                this.items[i] = { name: itemName, count: amountToAdd, icon: this.generateIconName(itemName) };
                remaining -= amountToAdd; changed = true;
            }
        }

        if (changed) this.notifyChange();
        if (remaining > 0) console.log(`Inventory full. Could not add ${remaining} ${itemName}.`);
        return remaining <= 0;
    }

    public removeItem(itemName: string, count: number = 1): boolean {
        if (!itemName || count <= 0) return false;
        let needed = count;
        let changed = false;
        // Iterate backwards (optional strategy)
        for (let i = this.size - 1; i >= 0 && needed > 0; i--) {
            const slot = this.items[i];
            if (slot?.name === itemName) {
                const amountToRemove = Math.min(needed, slot.count);
                slot.count -= amountToRemove; needed -= amountToRemove; changed = true;
                if (slot.count === 0) this.items[i] = null;
            }
        }
        if (changed) this.notifyChange();
        if (needed > 0) console.warn(`Could not remove all ${count} ${itemName}. Remaining needed: ${needed}.`);
        return needed <= 0;
    }

    public removeItemByIndex(index: number, count: number = 1): boolean {
        const item = this.getItem(index);
        if (!item || count <= 0) return false;
        const removeCount = Math.min(count, item.count);
        item.count -= removeCount;
        if (item.count === 0) this.items[index] = null;
        this.notifyChange();
        return true;
    }

    public hasItem(itemName: string, count: number = 1): boolean {
        return count <= 0 || this.countItem(itemName) >= count;
    }

    public countItem(itemName: string): number {
        return this.items.reduce((sum, item) => sum + (item?.name === itemName ? item.count : 0), 0);
    }

    public getItem(index: number): InventoryItem | null {
        return (index >= 0 && index < this.size) ? this.items[index] : null;
    }

    public getAllItems(): Array<InventoryItem | null> {
        return this.items.map(item => item ? { ...item } : null);
    }

    public getFilledSlots(): InventoryItem[] {
        return this.items.filter((item): item is InventoryItem => item !== null).map(item => ({ ...item }));
    }

    public onChange(callback: (items: Array<InventoryItem | null>) => void): void {
        if (typeof callback === 'function') this.onChangeCallbacks.push(callback);
    }

    public removeOnChange(callback: (items: Array<InventoryItem | null>) => void): void {
        this.onChangeCallbacks = this.onChangeCallbacks.filter(cb => cb !== callback);
    }

    private notifyChange(): void {
        const itemsCopy = this.getAllItems();
        this.onChangeCallbacks.forEach(cb => { try { cb(itemsCopy); } catch (e) { console.error("Inv onChange CB error:", e); } });
    }

    private generateIconName(itemName: string): string {
        return itemName.toLowerCase().replace(/ /g, '_').replace(/'/g, '');
    }

    public getSaveData(): Array<Pick<InventoryItem, 'name' | 'count'> | null> {
        return this.items.map(item => item ? { name: item.name, count: item.count } : null);
    }

    public loadSaveData(savedItems: Array<Pick<InventoryItem, 'name' | 'count'> | null> | null): void {
        if (!Array.isArray(savedItems) || savedItems.length !== this.size) {
            console.error("Invalid inventory save data.");
            this.items.fill(null);
        } else {
            this.items = savedItems.map(saved => (saved?.name && saved.count > 0)
                ? { name: saved.name, count: saved.count, icon: this.generateIconName(saved.name) }
                : null
            );
        }
        console.log("Inventory loaded.");
        this.notifyChange();
    }
}