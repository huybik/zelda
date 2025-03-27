import * as THREE from 'three';

// Example helper function
export function degreesToRadians(degrees) {
    return degrees * (Math.PI / 180);
}

// More utilities can be added here:
// - Vector math helpers
// - Random number generation within ranges
// - Color manipulation
// - etc.

// Get distance ignoring Y axis
export function distanceXZ(vec1, vec2) {
    const dx = vec1.x - vec2.x;
    const dz = vec1.z - vec2.z;
    return Math.sqrt(dx * dx + dz * dz);
}