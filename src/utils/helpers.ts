import * as THREE from 'three';

// Math Helpers
export function degreesToRadians(degrees: number): number { return degrees * (Math.PI / 180); }
export function radiansToDegrees(radians: number): number { return radians * (180 / Math.PI); }
export function distanceXZ(v1: THREE.Vector3, v2: THREE.Vector3): number { const dx = v1.x - v2.x, dz = v1.z - v2.z; return Math.sqrt(dx * dx + dz * dz); }
export function distanceXZSq(v1: THREE.Vector3, v2: THREE.Vector3): number { const dx = v1.x - v2.x, dz = v1.z - v2.z; return dx * dx + dz * dz; }
export function randomFloat(min: number, max: number): number { return Math.random() * (max - min) + min; }
export function randomInt(min: number, max: number): number { return Math.floor(Math.random() * (max - min + 1)) + min; } // Corrected implementation

// Interpolation Helpers - Frame rate independent lerp
// alphaBase: How much to approach the target per second (e.g., 0.1 = 10% per second approx)
// dt: deltaTime in seconds
export function smoothLerp(start: number, end: number, alphaBase: number, dt: number): number {
    if (alphaBase <= 0) return start; // No movement if alpha is zero or negative
    if (alphaBase >= 1) return end;  // Instant jump if alpha is 1 or more
    // Calculate the lerp factor for this frame
    const factor = 1.0 - Math.pow(1.0 - alphaBase, dt); // More standard frame-rate independent approach
    return start + (end - start) * factor;
    // Original formula was slightly different: 1.0 - Math.pow(alphaBase, dt)
    // Let's keep the provided one for consistency unless issues arise:
    // return start + (end - start) * (1.0 - Math.pow(alphaBase, dt));
}

export function smoothVectorLerp(curr: THREE.Vector3, target: THREE.Vector3, alphaBase: number, dt: number): THREE.Vector3 {
     if (alphaBase <= 0) return curr; // Return current vector, don't copy target
     if (alphaBase >= 1) return curr.copy(target); // Copy target for instant jump

    // Use the same factor calculation as smoothLerp for consistency
    const factor = 1.0 - Math.pow(1.0 - alphaBase, dt);
    return curr.lerp(target, factor);
    // Original formula:
    // return curr.lerp(target, 1.0 - Math.pow(alphaBase, dt));
}

export function smoothQuaternionSlerp(curr: THREE.Quaternion, target: THREE.Quaternion, alphaBase: number, dt: number): THREE.Quaternion {
     if (alphaBase <= 0) return curr; // Return current quaternion
     if (alphaBase >= 1) return curr.copy(target); // Copy target

    // Use the same factor calculation as smoothLerp for consistency
    const factor = 1.0 - Math.pow(1.0 - alphaBase, dt);
    return curr.slerp(target, factor);
     // Original formula:
     // return curr.slerp(target, 1.0 - Math.pow(alphaBase, dt));
}

// Shaping Function
export function smoothstep(edge0: number, edge1: number, x: number): number {
    // Scale, bias and saturate x to 0..1 range
    x = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
    // Evaluate polynomial
    return x * x * (3 - 2 * x);
}

// Shared Colors (using 'as const' for stricter typing)
export const Colors = {
    PASTEL_GREEN: 0x98FB98, PASTEL_BROWN: 0xCD853F, PASTEL_GRAY: 0xB0C4DE, PASTEL_ROOF: 0xFFA07A,
    FOREST_GREEN: 0x228B22, SADDLE_BROWN: 0x8B4513, SIENNA: 0xA0522D, DIM_GRAY: 0x696969,
    PEACH_PUFF: 0xFFDAB9, SNOW_WHITE: 0xFFFAFA, BEIGE: 0xF5F5DC,
} as const; // Ensures values are treated as literal types