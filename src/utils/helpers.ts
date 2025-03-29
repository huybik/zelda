import * as THREE from 'three';

/** Converts degrees to radians. */
export function degreesToRadians(degrees: number): number {
    return degrees * (Math.PI / 180);
}

/** Converts radians to degrees. */
export function radiansToDegrees(radians: number): number {
    return radians * (180 / Math.PI);
}

/** Calculates distance on the XZ plane. */
export function distanceXZ(vec1: THREE.Vector3, vec2: THREE.Vector3): number {
    const dx = vec1.x - vec2.x;
    const dz = vec1.z - vec2.z;
    return Math.sqrt(dx * dx + dz * dz);
}

/** Calculates squared distance on the XZ plane (faster). */
export function distanceXZSq(vec1: THREE.Vector3, vec2: THREE.Vector3): number {
    const dx = vec1.x - vec2.x;
    const dz = vec1.z - vec2.z;
    return dx * dx + dz * dz;
}

/** Generates a random float between min (inclusive) and max (exclusive). */
export function randomFloat(min: number, max: number): number {
    return Math.random() * (max - min) + min;
}

/** Generates a random integer between min (inclusive) and max (inclusive). */
export function randomInt(min: number, max: number): number {
    min = Math.ceil(min);
    max = Math.floor(max);
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

/** Frame-rate independent interpolation (lerp) for numbers. */
export function smoothLerp(start: number, end: number, alphaBase: number, deltaTime: number): number {
    // Avoid Math.pow(0, dt) which is NaN or 0 depending on dt
    if (alphaBase <= 0) return end;
    if (alphaBase >= 1) return start;
    const factor = 1.0 - Math.pow(alphaBase, deltaTime);
    return start + (end - start) * factor;
}

/** Frame-rate independent interpolation (lerp) for THREE.Vector3. Modifies 'current'. */
export function smoothVectorLerp(current: THREE.Vector3, target: THREE.Vector3, alphaBase: number, deltaTime: number): THREE.Vector3 {
     if (alphaBase <= 0) return current.copy(target);
     if (alphaBase >= 1) return current;
    const factor = 1.0 - Math.pow(alphaBase, deltaTime);
    return current.lerp(target, factor);
}

/** Frame-rate independent interpolation (slerp) for THREE.Quaternion. Modifies 'current'. */
export function smoothQuaternionSlerp(current: THREE.Quaternion, target: THREE.Quaternion, alphaBase: number, deltaTime: number): THREE.Quaternion {
     if (alphaBase <= 0) return current.copy(target);
     if (alphaBase >= 1) return current;
    const factor = 1.0 - Math.pow(alphaBase, deltaTime);
    return current.slerp(target, factor);
}

/** Clamps x between 0 and 1 and returns value based on x * x * (3 - 2 * x). */
export function smoothstep(edge0: number, edge1: number, x: number): number {
    // Scale, saturate x to 0..1 range
    x = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
    // Evaluate polynomial
    return x * x * (3 - 2 * x);
}


// Shared color constants
export const Colors = {
    PASTEL_GREEN: 0x98FB98,
    PASTEL_BROWN: 0xCD853F,
    PASTEL_GRAY: 0xB0C4DE,
    PASTEL_ROOF: 0xFFA07A, // Light Salmon
    FOREST_GREEN: 0x228B22,
    SADDLE_BROWN: 0x8B4513,
    SIENNA: 0xA0522D,
    DIM_GRAY: 0x696969,
    PEACH_PUFF: 0xFFDAB9,
    SNOW_WHITE: 0xFFFAFA,
    BEIGE: 0xF5F5DC,
} as const; // Use 'as const' for stricter typing of color values if needed