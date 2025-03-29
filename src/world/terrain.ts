import * as THREE from 'three';
import { SimplexNoise } from 'three/examples/jsm/math/SimplexNoise.js';
import { smoothstep } from '../utils/helpers'; // Import from helpers

// Noise instance
const simplex = new SimplexNoise();

/**
 * Creates a terrain mesh using Simplex noise.
 */
export function createTerrain(size: number, segments: number = 150): THREE.Mesh {
    console.log(`Creating terrain: ${size}x${size} with ${segments}x${segments} segments.`);
    const geometry = new THREE.PlaneGeometry(size, size, segments, segments);

    applyNoiseToGeometry(geometry);

    // Rotate to lay flat and compute required data
    geometry.rotateX(-Math.PI / 2);
    geometry.computeVertexNormals(); // Crucial for lighting after modifying vertices
    geometry.computeBoundingBox(); // Needed for physics/raycasting

    const material = new THREE.MeshLambertMaterial({
        color: 0x88B04B, // Mossy green
        // wireframe: true, // Debug
    });

    const terrainMesh = new THREE.Mesh(geometry, material);
    terrainMesh.receiveShadow = true;
    terrainMesh.name = "Terrain";

    // UserData for identification and physics
    terrainMesh.userData = {
        isTerrain: true,
        isCollidable: true,
        worldSize: size,
        segments: segments,
        // Bounding box is inherent to geometry, no need to duplicate in userData unless transformed
    };

    console.log("Terrain mesh created.");
    return terrainMesh;
}

/**
 * Applies Simplex noise to the vertices of a PlaneGeometry. Modifies in place.
 */
function applyNoiseToGeometry(geometry: THREE.PlaneGeometry): void {
    const vertices = geometry.attributes.position.array as Float32Array;
    const numVertices = geometry.attributes.position.count;

    // Noise parameters - adjust for different terrain styles
    const noiseStrength = 24; // Max height variation
    const noiseScale = 0.005; // Controls feature size (lower = larger features)
    // Add more layers for detail if desired:
    // const noiseStrength2 = 4; const noiseScale2 = 0.03;
    // const noiseStrength3 = 1; const noiseScale3 = 0.1;

    // Center flattening parameters
    const flattenRadius = 120;
    const flattenStrength = 0.05; // How much to flatten (0 = no flatten, 1 = completely flat)


    for (let i = 0; i < numVertices; i++) {
        const index = i * 3;
        const x = vertices[index];     // Vertex X (on the plane)
        const y = vertices[index + 1]; // Vertex Y (on the plane) - becomes Z after rotation
        let z = 0; // Height (becomes Y after rotation)

        // Apply noise layers
        z += simplex.noise(x * noiseScale, y * noiseScale) * noiseStrength;
        // z += simplex.noise(x * noiseScale2, y * noiseScale2) * noiseStrength2;
        // z += simplex.noise(x * noiseScale3, y * noiseScale3) * noiseStrength3;


        // Flatten center area smoothly
        const distanceToCenter = Math.sqrt(x * x + y * y);
        if (distanceToCenter < flattenRadius) {
            // smoothstep(min, max, value) transitions from 0 to 1 between min and max
            const flattenFactor = 1.0 - smoothstep(0, flattenRadius, distanceToCenter);
            z = THREE.MathUtils.lerp(z, z * (1.0-flattenStrength), flattenFactor);
        }

        vertices[index + 2] = z; // Apply calculated height to Z (which becomes Y later)
    }

    geometry.attributes.position.needsUpdate = true; // Tell Three.js vertex data changed
}