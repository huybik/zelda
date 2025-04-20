/* File: /src/core/items.ts */
import { Object3D, Bone } from "three";

export enum ItemType {
  Weapon = "Weapon",
  Consumable = "Consumable",
  Resource = "Resource",
  Currency = "Currency",
  Tool = "Tool", // For Axe/Pickaxe distinction
}

export enum EquipSlot {
  RightHand = "RightHand",
  // Add other slots if needed (e.g., Head, Chest)
}

// Define Professions
export enum Profession {
  None = "None",
  Hunter = "Hunter",
  Blacksmith = "Blacksmith",
  Farmer = "Farmer",
}

// Map professions to their efficient weapon types
export const ProfessionWeaponMap: Record<
  Profession,
  ItemType.Weapon | ItemType.Tool | null
> = {
  [Profession.None]: null,
  [Profession.Hunter]: ItemType.Weapon, // Hunter uses Swords (Weapon type)
  [Profession.Blacksmith]: ItemType.Tool, // Blacksmith uses Pickaxe (Tool type)
  [Profession.Farmer]: ItemType.Tool, // Farmer uses Axe (Tool type)
};

// Map professions to specific starting weapon IDs
export const ProfessionStartingWeapon: Record<Profession, string | null> = {
  [Profession.None]: null,
  [Profession.Hunter]: "sword",
  [Profession.Blacksmith]: "pickaxe",
  [Profession.Farmer]: "axe",
};

// Base interface for all items
export interface ItemDefinition {
  id: string; // Unique identifier (e.g., 'wood', 'sword_basic')
  name: string; // Display name (e.g., 'Wood', 'Basic Sword')
  description: string;
  icon: string; // Filename in assets/items/icons/ (e.g., 'wood.png')
  type: ItemType;
  stackable: boolean;
  maxStack: number;
  color?: number; // Optional color hint for effects/orbs
}

// Interface for Weapons and Tools that can be equipped
export interface WeaponDefinition extends ItemDefinition {
  type: ItemType.Weapon | ItemType.Tool;
  damage: number;
  equipSlot: EquipSlot;
  modelFileName: string; // e.g., 'sword.gltf' - assumes path assets/items/weapons/
  // Add other weapon stats like range, attack speed, etc. if needed
}

// Interface for Consumables
export interface ConsumableDefinition extends ItemDefinition {
  type: ItemType.Consumable;
  healAmount?: number; // Optional heal amount
  // Add other effects like stamina boost, temporary buffs, etc.
}

// Union type for any possible item definition
export type AnyItemDefinition =
  | ItemDefinition
  | WeaponDefinition
  | ConsumableDefinition;

// Type guard functions
export function isWeapon(item: ItemDefinition): item is WeaponDefinition {
  // Check if the item type is Weapon or Tool, as both can be equipped and deal damage
  return item.type === ItemType.Weapon || item.type === ItemType.Tool;
}

export function isConsumable(
  item: ItemDefinition
): item is ConsumableDefinition {
  return item.type === ItemType.Consumable;
}

// --- Item Database ---
// Use the union type for the database to allow specific properties
const itemDatabase: Record<string, AnyItemDefinition> = {
  // Resources
  wood: {
    id: "wood",
    name: "Wood",
    description: "A sturdy piece of wood, useful for crafting and building.",
    icon: "wood.png",
    type: ItemType.Resource,
    stackable: true,
    maxStack: 99,
    color: 0x8b4513, // Brown
  },
  stone: {
    id: "stone",
    name: "Stone",
    description: "A common grey stone, good for building and tool making.",
    icon: "stone.png",
    type: ItemType.Resource,
    stackable: true,
    maxStack: 99,
    color: 0x808080, // Grey
  },
  // Consumables
  herb: {
    id: "herb",
    name: "Herb",
    description: "A fragrant herb with minor healing properties.",
    icon: "herb.png",
    type: ItemType.Consumable,
    stackable: true,
    maxStack: 99,
    healAmount: 30, // Specific to ConsumableDefinition
    color: 0x228b22, // Forest Green
  },
  meat: {
    id: "meat",
    name: "Meat",
    description:
      "Raw meat obtained from animals. Cooking might enhance its effects.",
    icon: "meat.png",
    type: ItemType.Consumable, // Could also be Resource if used in crafting
    stackable: true,
    maxStack: 99,
    healAmount: 100, // Specific to ConsumableDefinition
    color: 0xff4500, // Orangey-Red
  },
  potion: {
    id: "potion",
    name: "Health Potion",
    description: "A brewed potion that restores a moderate amount of health.",
    icon: "potion.png",
    type: ItemType.Consumable,
    stackable: true,
    maxStack: 99,
    healAmount: 200, // Specific to ConsumableDefinition
    color: 0xff00ff, // Magenta/Pink
  },
  // Tools (also act as weapons)
  axe: {
    id: "axe",
    name: "Axe",
    description:
      "A basic axe, effective for chopping wood and as a makeshift weapon. Favored by Farmers.",
    icon: "axe.png",
    type: ItemType.Tool,
    stackable: false,
    maxStack: 1,
    damage: 8,
    equipSlot: EquipSlot.RightHand,
    modelFileName: "axe.glb", // Specific to WeaponDefinition
    color: 0xadd8e6, // Light Blue (generic equipment color)
  },
  pickaxe: {
    id: "pickaxe",
    name: "Pickaxe",
    description:
      "A sturdy pickaxe, good for mining stone and breaking rocks. Favored by Blacksmiths.",
    icon: "pickaxe.png",
    type: ItemType.Tool,
    stackable: false,
    maxStack: 1,
    damage: 8,
    equipSlot: EquipSlot.RightHand,
    modelFileName: "pickaxe.glb", // Specific to WeaponDefinition
    color: 0xadd8e6, // Light Blue
  },
  // Weapons
  sword: {
    id: "sword",
    name: "Sword",
    description:
      "A simple but reliable iron sword for combat. Favored by Hunters.",
    icon: "sword.png",
    type: ItemType.Weapon,
    stackable: false,
    maxStack: 1,
    damage: 8,
    equipSlot: EquipSlot.RightHand,
    modelFileName: "sword.glb", // Specific to WeaponDefinition
    color: 0xadd8e6, // Light Blue
  },
  // Currency
  coin: {
    id: "coin",
    name: "Coin",
    description: "A shiny gold coin. Used for trading.",
    icon: "coin.png",
    type: ItemType.Currency,
    stackable: true,
    maxStack: 9999, // Use a large number for stack limit
    color: 0xffd700, // Gold
  },
};

// Function to get item definition by ID
export function getItemDefinition(id: string): AnyItemDefinition | undefined {
  return itemDatabase[id];
}

// Function to get all item definitions (useful for iterating)
export function getAllItemDefinitions(): AnyItemDefinition[] {
  return Object.values(itemDatabase);
}

// --- Equipped Item Representation ---
// Stores runtime information about an equipped item
export interface EquippedItem {
  definition: WeaponDefinition; // The static definition of the item
  modelInstance: Object3D; // The loaded and cloned 3D model instance
  attachedBone: Bone; // The bone the model is attached to
}
