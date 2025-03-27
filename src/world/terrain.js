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
        // map: texture, // Add texture later if desired
        // side: THREE.DoubleSide, // Usually not needed for terrain floor
        // wireframe: false // Uncomment for debugging geometry
    });

    const terrainMesh = new THREE.Mesh(geometry, material);
    terrainMesh.receiveShadow = true; // Terrain should receive shadows
    terrainMesh.name = "Terrain"; // For identification in scene graph and raycasting

    // Add flag for physics system to identify terrain (for ground checks)
    terrainMesh.userData.isTerrain = true;
    terrainMesh.userData.isCollidable = true; // Terrain is technically collidable for raycasting

    // Store size/segments for potential use later
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
    // --- FURTHER REDUCED noise strength for EVEN flatter terrain ---
    const noiseStrength = 2.5; // Reduced Max height variation significantly (was 6, originally 12)
    const noiseScale = 0.02;  // Slightly larger features (was 0.015)
    const numVertices = geometry.attributes.position.count;

    // Parameters for different noise layers (optional, adds detail) - reduced significantly
    const noiseStrength2 = 0.5; // Reduced (was 1.5)
    const noiseScale2 = 0.08;
    const noiseStrength3 = 0.1; // Reduced (was 0.3)
    const noiseScale3 = 0.3;


    for (let i = 0; i < numVertices; i++) {
        const index = i * 3;
        const x = vertices[index];     // Vertex X position (on the original plane)
        const y = vertices[index + 1]; // Vertex Y position (on the original plane) -> becomes Z after rotation
        let z = 0; // This will be the height (Y after rotation)

        // Apply multiple layers of noise for more interesting terrain
        z += simplex.noise(x * noiseScale, y * noiseScale) * noiseStrength;
        z += simplex.noise(x * noiseScale2, y * noiseScale2) * noiseStrength2;
        z += simplex.noise(x * noiseScale3, y * noiseScale3) * noiseStrength3;

        // Optional: Flatten center area slightly for village placement
        // Keep the flattening effect relative to the reduced noise.
        const distanceToCenter = Math.sqrt(x*x + y*y);
        const flattenRadius = 120; // Even larger radius for flattened center (was 100)
        if (distanceToCenter < flattenRadius) {
            const flattenFactor = 1.0 - Math.smoothstep(0, flattenRadius, distanceToCenter);
            // Interpolate towards almost completely flat (e.g., 5% of original noise height)
            z = THREE.MathUtils.lerp(z, z * 0.05, flattenFactor);
        }

        // Clamp minimum height to prevent holes below zero (optional, if noise goes too negative)
        // z = Math.max(z, -0.5); // Example clamp


        vertices[index + 2] = z; // Apply height to the Z coordinate of the PlaneGeometry (becomes Y after rotation)
    }

    // Mark attribute buffer as needing update
    geometry.attributes.position.needsUpdate = true;
}

// Helper for smoothstep function (used in optional flattening)
if (!Math.smoothstep) {
    Math.smoothstep = function(edge0, edge1, x) {
      x = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
      return x * x * (3 - 2 * x);
    };
}