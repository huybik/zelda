import * as THREE from 'three';

/**
 * Converts degrees to radians.
 * @param {number} degrees Angle in degrees.
 * @returns {number} Angle in radians.
 */
export function degreesToRadians(degrees) {
    return degrees * (Math.PI / 180);
}

/**
 * Converts radians to degrees.
 * @param {number} radians Angle in radians.
 * @returns {number} Angle in degrees.
 */
export function radiansToDegrees(radians) {
    return radians * (180 / Math.PI);
}

/**
 * Calculates the Euclidean distance between two Vector3 objects, ignoring the Y component.
 * @param {THREE.Vector3} vec1 The first vector.
 * @param {THREE.Vector3} vec2 The second vector.
 * @returns {number} The distance on the XZ plane.
 */
export function distanceXZ(vec1, vec2) {
    if (!vec1 || !vec2) return 0;
    const dx = vec1.x - vec2.x;
    const dz = vec1.z - vec2.z;
    return Math.sqrt(dx * dx + dz * dz);
}

/**
 * Calculates the squared Euclidean distance between two Vector3 objects, ignoring the Y component.
 * Faster than distanceXZ as it avoids the square root.
 * @param {THREE.Vector3} vec1 The first vector.
 * @param {THREE.Vector3} vec2 The second vector.
 * @returns {number} The squared distance on the XZ plane.
 */
export function distanceXZSq(vec1, vec2) {
    if (!vec1 || !vec2) return 0;
    const dx = vec1.x - vec2.x;
    const dz = vec1.z - vec2.z;
    return dx * dx + dz * dz;
}

/**
 * Generates a random float between min (inclusive) and max (exclusive).
 * @param {number} min Minimum value.
 * @param {number} max Maximum value.
 * @returns {number} Random float.
 */
export function randomFloat(min, max) {
    return Math.random() * (max - min) + min;
}

/**
 * Generates a random integer between min (inclusive) and max (inclusive).
 * @param {number} min Minimum value.
 * @param {number} max Maximum value.
 * @returns {number} Random integer.
 */
export function randomInt(min, max) {
    min = Math.ceil(min);
    max = Math.floor(max);
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

/**
 * Performs a frame-rate independent interpolation (lerp).
 * @param {number} start Start value.
 * @param {number} end End value.
 * @param {number} alpha The interpolation factor base (e.g., 0.1 for slow, 0.01 for very slow).
 * @param {number} deltaTime Time elapsed since last frame.
 * @returns {number} Interpolated value.
 */
export function smoothLerp(start, end, alpha, deltaTime) {
    const factor = 1.0 - Math.pow(alpha, deltaTime);
    return start + (end - start) * factor;
}

/**
 * Smoothly interpolates a THREE.Vector3 towards a target vector.
 * @param {THREE.Vector3} current The vector to modify.
 * @param {THREE.Vector3} target The target vector.
 * @param {number} alpha The interpolation factor base.
 * @param {number} deltaTime Time elapsed since last frame.
 * @returns {THREE.Vector3} The modified current vector.
 */
export function smoothVectorLerp(current, target, alpha, deltaTime) {
    const factor = 1.0 - Math.pow(alpha, deltaTime);
    return current.lerp(target, factor);
}

/**
 * Smoothly interpolates a THREE.Quaternion towards a target quaternion.
 * @param {THREE.Quaternion} current The quaternion to modify.
 * @param {THREE.Quaternion} target The target quaternion.
 * @param {number} alpha The interpolation factor base.
 * @param {number} deltaTime Time elapsed since last frame.
 * @returns {THREE.Quaternion} The modified current quaternion.
 */
export function smoothQuaternionSlerp(current, target, alpha, deltaTime) {
    const factor = 1.0 - Math.pow(alpha, deltaTime);
    return current.slerp(target, factor);
}


// Color constants can also go here
export const Colors = {
    PASTEL_GREEN: 0x98FB98,
    PASTEL_BROWN: 0xCD853F,
    PASTEL_GRAY: 0xB0C4DE,
    PASTEL_ROOF: 0xFFA07A, // Light Salmon
    FOREST_GREEN: 0x228B22,
    SADDLE_BROWN: 0x8B4513,
    SIENNA: 0xA0522D,
};