import * as THREE from 'three';
import { SimplexNoise } from 'three/examples/jsm/math/SimplexNoise.js';

// Noise instance (can be reused)
const simplex = new SimplexNoise();

/**
 * Creates a terrain mesh using Simplex noise.
 * @param {number} size The width and depth of the terrain plane.
 * @param {number} segments The number of segments along width and depth. Higher means more detail.
 * @returns {THREE.Mesh} The terrain mesh.
 */
export function createTerrain(size, segments = 100) {
    console.log(`Creating terrain: ${size}x${size} with ${segments}x${segments} segments.`);
    const geometry = new THREE.PlaneGeometry(size, size, segments, segments);

    // Apply noise to vertices for height variation
    applyNoiseToGeometry(geometry);

    // Rotate to make it horizontal (XY plane becomes XZ plane)
    geometry.rotateX(-Math.PI / 2);
    // Ensure bounding box is computed after rotation and noise application
    geometry.computeBoundingBox();
    geometry.computeVertexNormals(); // Recalculate normals for correct lighting after height changes

    const material = new THREE.MeshLambertMaterial({
        color: 0x88B04B, // Slightly different green - was 0x90ee90
    });

    const terrainMesh = new THREE.Mesh(geometry, material);
    terrainMesh.receiveShadow = true;
    terrainMesh.name = "Terrain";

    // Add flags for physics system
    terrainMesh.userData.isTerrain = true;
    terrainMesh.userData.isCollidable = true;

    // Store size/segments
    terrainMesh.userData.worldSize = size;
    terrainMesh.userData.segments = segments;

    console.log("Terrain mesh created.");
    return terrainMesh;
}

/**
 * Applies Simplex noise to the vertices of a PlaneGeometry.
 * Modifies the geometry in place.
 * @param {THREE.PlaneGeometry} geometry The geometry to modify.
 */
function applyNoiseToGeometry(geometry) {
    const vertices = geometry.attributes.position.array;
    // Significantly reduced noise strength for extremely smooth terrain
    const noiseStrength = 24; // Reduced from 12 for gentler slopes
    const noiseScale = 0.005; // Reduced from 0.02 for larger, smoother features
    // Removed additional noise layers to eliminate fine details


    const numVertices = geometry.attributes.position.count;

    for (let i = 0; i < numVertices; i++) {
        const index = i * 3;
        const x = vertices[index];     // Vertex X position
        const y = vertices[index + 1]; // Vertex Y position (becomes Z after rotation)
        let z = 0; // Height (becomes Y after rotation)

        // Apply primary noise layer
        z += simplex.noise(x * noiseScale, y * noiseScale) * noiseStrength;
        // Additional layers are disabled (strength = 0)
        // z += simplex.noise(x * noiseScale2, y * noiseScale2) * noiseStrength2;
        // z += simplex.noise(x * noiseScale3, y * noiseScale3) * noiseStrength3;

        // Optional: Flatten center area (unchanged)
        const distanceToCenter = Math.sqrt(x * x + y * y);
        const flattenRadius = 120;
        if (distanceToCenter < flattenRadius) {
            const flattenFactor = 1.0 - Math.smoothstep(0, flattenRadius, distanceToCenter);
            z = THREE.MathUtils.lerp(z, z * 0.05, flattenFactor);
        }

        vertices[index + 2] = z; // Apply height
    }

    // Mark attribute buffer as needing update
    geometry.attributes.position.needsUpdate = true;
}

// Helper for smoothstep function
if (!Math.smoothstep) {
    Math.smoothstep = function(edge0, edge1, x) {
        x = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
        return x * x * (3 - 2 * x);
    };
}