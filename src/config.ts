// src/config.ts
import { ColorRepresentation } from "three";

export const WORLD_SIZE = 100;
export const TERRAIN_SEGMENTS = 15;
export const CHARACTER_HEIGHT = 1.8;
export const CHARACTER_RADIUS = 0.4;
export const INTERACTION_DISTANCE = 3.0;

// API Keys - It's generally better to handle these purely via environment variables
// where they are used, but keeping the logic here for structural similarity to the original.
const API_KEY1 = import.meta.env.VITE_API_KEY1;
const API_KEY2 = import.meta.env.VITE_API_KEY2;

let currentApiKey = API_KEY1 || "";
let switchedApiKey = false;

export function getCurrentApiKey(): string {
  return currentApiKey;
}

export function getApiUrl(): string {
  return `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${currentApiKey}`;
}

export function getSwitchedApiKeyFlag(): boolean {
  return switchedApiKey;
}

export function setSwitchedApiKeyFlag(value: boolean): void {
  switchedApiKey = value;
}

export function switchApiKey(): boolean {
  if (currentApiKey === API_KEY1 && API_KEY2) {
    currentApiKey = API_KEY2;
    console.log("Switched to VITE_API_KEY2 due to rate limit.");
    return true;
  } else if (currentApiKey === API_KEY2 && API_KEY1) {
    currentApiKey = API_KEY1;
    console.log("Switched back to VITE_API_KEY1.");
    return true;
  } else {
    console.warn("No alternate API key available or configured.");
    return false; // No switch possible
  }
}

export const Colors: { [key: string]: ColorRepresentation } = {
  PASTEL_GREEN: 0x98fb98,
  PASTEL_BROWN: 0xcd853f,
  PASTEL_GRAY: 0xb0c4de,
  FOREST_GREEN: 0x228b22,
  BACKGROUND: 0x87ceeb,
  TERRAIN: 0x88b04b,
  EXIT_PORTAL: 0x00ff00,
  START_PORTAL: 0xff0000,
} as const;

// Other constants if needed
export const PARTICLE_EFFECT_DURATION = 1.0;
export const RESPAWN_HEALTH_FACTOR = 0.75;
export const DEFAULT_RESPAWN_TIME = 15000;
export const DEFAULT_GATHER_TIME = 2000;
export const PLAYER_ATTACK_DAMAGE = 10;
export const NPC_ATTACK_DAMAGE = 5;
export const ATTACK_RANGE = 2.0;
export const HEAL_AMOUNT = 25;
export const API_CALL_COOLDOWN = 10000; // ms
export const AI_ACTION_TIMER_BASE = 5; // seconds
export const AI_ACTION_TIMER_RANDOM = 5; // seconds
export const MAX_LOG_ENTRIES = 50;
export const DEFAULT_INVENTORY_SIZE = 9;
export const CAMERA_COLLISION_OFFSET = 0.3;
export const CAMERA_MIN_DISTANCE = 1.5;
export const CAMERA_MAX_DISTANCE = 12.0;
export const PHYSICS_COLLISION_CHECK_RADIUS_SQ = 20 * 20;
export const INTERACTION_AIM_TOLERANCE = Math.PI / 6;
export const HUD_FPS_SAMPLES = 60;
export const MINIMAP_DOT_SIZE = 3;
export const MINIMAP_PLAYER_DOT_SIZE = 4;
export const PORTAL_RADIUS = 5;
export const PORTAL_TUBE = 1.5;
export const PORTAL_PARTICLE_COUNT = 1000;
export const PORTAL_PARTICLE_SIZE = 0.2;
export const PORTAL_PARTICLE_OPACITY = 0.6;
export const PORTAL_LABEL_WIDTH_FACTOR = 2;
export const PORTAL_LABEL_HEIGHT = 3;
export const PORTAL_LABEL_OFFSET_Y = 2;
export const PORTAL_SPAWN_HEIGHT_OFFSET = 5;
