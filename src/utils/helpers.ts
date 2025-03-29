import * as THREE from 'three';

// Math Helpers
export function degreesToRadians(degrees: number): number { return degrees * (Math.PI / 180); }
export function radiansToDegrees(radians: number): number { return radians * (180 / Math.PI); }
export function distanceXZ(v1: THREE.Vector3, v2: THREE.Vector3): number { const dx = v1.x - v2.x, dz = v1.z - v2.z; return Math.sqrt(dx * dx + dz * dz); }
export function distanceXZSq(v1: THREE.Vector3, v2: THREE.Vector3): number { const dx = v1.x - v2.x, dz = v1.z - v2.z; return dx * dx + dz * dz; }
export function randomFloat(min: number, max: number): number { return Math.random() * (max - min) + min; }
export function randomInt(min: number, max: number): number { return Math.floor(Math.random() * (max - min + 1)) + Math.ceil(min); }

// Interpolation Helpers
export function smoothLerp(start: number, end: number, alphaBase: number, dt: number): number {
    if (alphaBase <= 0) return end; if (alphaBase >= 1) return start;
    return start + (end - start) * (1.0 - Math.pow(alphaBase, dt));
}
export function smoothVectorLerp(curr: THREE.Vector3, target: THREE.Vector3, alphaBase: number, dt: number): THREE.Vector3 {
     if (alphaBase <= 0) return curr.copy(target); if (alphaBase >= 1) return curr;
    return curr.lerp(target, 1.0 - Math.pow(alphaBase, dt));
}
export function smoothQuaternionSlerp(curr: THREE.Quaternion, target: THREE.Quaternion, alphaBase: number, dt: number): THREE.Quaternion {
     if (alphaBase <= 0) return curr.copy(target); if (alphaBase >= 1) return curr;
    return curr.slerp(target, 1.0 - Math.pow(alphaBase, dt));
}

// Shaping Function
export function smoothstep(edge0: number, edge1: number, x: number): number {
    x = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
    return x * x * (3 - 2 * x);
}

// Shared Colors
export const Colors = {
    PASTEL_GREEN: 0x98FB98, PASTEL_BROWN: 0xCD853F, PASTEL_GRAY: 0xB0C4DE, PASTEL_ROOF: 0xFFA07A,
    FOREST_GREEN: 0x228B22, SADDLE_BROWN: 0x8B4513, SIENNA: 0xA0522D, DIM_GRAY: 0x696969,
    PEACH_PUFF: 0xFFDAB9, SNOW_WHITE: 0xFFFAFA, BEIGE: 0xF5F5DC,
} as const;