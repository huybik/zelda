// Game world constants
export const WORLD_SIZE = 100;
export const TERRAIN_SEGMENTS = 15;

// Character constants
export const CHARACTER_HEIGHT = 1.8;
export const CHARACTER_RADIUS = 0.4;

// Color constants
export const Colors = {
  PASTEL_GREEN: 0x98fb98,
  PASTEL_BROWN: 0xcd853f,
  PASTEL_GRAY: 0xb0c4de,
  FOREST_GREEN: 0x228b22,
} as const;

// Inventory constants
export const DEFAULT_INVENTORY_SIZE = 20;
export const ITEM_MAX_STACK = {
  default: 64,
  wood: 99,
  stone: 99,
  herb: 30,
  feather: 50,
  "Health Potion": 10,
  gold: Infinity,
} as const;

// Interaction constants
export const INTERACTION_DISTANCE = 3.0;
export const AIM_TOLERANCE = Math.PI / 6;

// Portal constants
export const PORTAL_RADIUS = 2;
export const PORTAL_TUBE = 0.2;
export const PORTAL_PARTICLE_COUNT = 1000;
