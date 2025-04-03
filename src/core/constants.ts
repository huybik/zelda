// Moved from utils.ts
export const Colors = {
  PASTEL_GREEN: 0x98fb98,
  PASTEL_BROWN: 0xcd853f,
  PASTEL_GRAY: 0xb0c4de,
  FOREST_GREEN: 0x228b22,
} as const;

export let nextEntityId = 0;

export function getNextEntityId(): number {
  return nextEntityId++;
}

// --- Character --- //
export const CHARACTER_HEIGHT = 1.8;
export const CHARACTER_RADIUS = 0.4;
export const CHARACTER_WALK_SPEED = 4.0;
export const CHARACTER_RUN_SPEED = 8.0;
export const CHARACTER_JUMP_FORCE = 8.0;
export const CHARACTER_MAX_HEALTH = 100;
export const CHARACTER_MAX_STAMINA = 100;
export const CHARACTER_STAMINA_DRAIN_RATE = 15;
export const CHARACTER_STAMINA_REGEN_RATE = 10;
export const CHARACTER_STAMINA_JUMP_COST = 10;
export const CHARACTER_EXHAUSTION_THRESHOLD = 20;
export const CHARACTER_GRAVITY = -25;
export const CHARACTER_GROUND_CHECK_DISTANCE = 0.15;
export const CHARACTER_GATHER_ATTACK_INTERVAL = 1.0;
export const CHARACTER_ATTACK_RANGE = 2.0;
export const CHARACTER_PLAYER_ATTACK_DAMAGE = 10;
export const CHARACTER_NPC_ATTACK_DAMAGE = 5;
export const CHARACTER_SELF_HEAL_AMOUNT = 25;

// --- Objects --- //
export const TREE_GATHER_TIME = 3000;
export const TREE_RESPAWN_TIME = 20000;
export const ROCK_GATHER_TIME = 4000;
export const ROCK_RESPAWN_TIME = 30000;
export const HERB_GATHER_TIME = 1500;
export const HERB_RESPAWN_TIME = 15000;

// --- System --- //
export const INTERACTION_DISTANCE = 3.0;
export const INTERACTION_AIM_TOLERANCE = Math.PI / 6;
export const PHYSICS_COLLISION_CHECK_RADIUS = 20; // Squared value used in code (20*20)
export const CAMERA_IDEAL_OFFSET_Y = 2.5;
export const CAMERA_IDEAL_OFFSET_Z = -2.5;
export const CAMERA_MIN_OFFSET_DISTANCE = 1.5;
export const CAMERA_MAX_OFFSET_DISTANCE = 12.0;
export const CAMERA_INITIAL_PITCH_ANGLE = 0.15;
export const CAMERA_MIN_PITCH = -Math.PI / 3;
export const CAMERA_MAX_PITCH = Math.PI / 2.5;
export const CAMERA_PITCH_SENSITIVITY = 0.0025;
export const CAMERA_LERP_ALPHA_POSITION_BASE = 0.05;
export const CAMERA_LERP_ALPHA_LOOKAT_BASE = 0.1;
export const CAMERA_COLLISION_OFFSET = 0.3;
export const CONTROLS_PLAYER_ROTATION_SENSITIVITY = 0.0025;

// --- AI --- //
export const AI_INTERACTION_DISTANCE = 3.0;
export const AI_SEARCH_RADIUS = 30;
export const AI_ROAM_RADIUS = 10;
export const AI_API_CALL_COOLDOWN_MS = 10000;
export const AI_ACTION_TIMER_BASE_S = 5;
export const AI_ACTION_TIMER_RANDOM_S = 5; 