
import * as THREE from 'three';
import { SimplexNoise } from 'three/examples/jsm/math/SimplexNoise.js';
import { smoothstep } from '../utils/helpers'; // Assuming smoothstep is available here

const simplex = new SimplexNoise();

export function createTerrain(size: number, segments: number = 150): THREE.Mesh {
    console.log(`Creating terrain: ${size}x${size} with ${segments}x${segments} segments.`);
    // Ensure segments are positive integers
    segments = Math.max(1, Math.floor(segments));
    const geometry = new THREE.PlaneGeometry(size, size, segments, segments);

    applyNoiseToGeometry(geometry);

    geometry.rotateX(-Math.PI / 2); // Rotate to be flat on XZ plane
    geometry.computeVertexNormals(); // Calculate normals for lighting
    geometry.computeBoundingBox();   // Calculate bounding box

    const material = new THREE.MeshLambertMaterial({
         color: 0x88B04B, // Mossy green
         // wireframe: true // Uncomment for debugging geometry
    });
    const terrainMesh = new THREE.Mesh(geometry, material);
    terrainMesh.receiveShadow = true; // Terrain should receive shadows
    terrainMesh.name = "Terrain";
    // Add relevant userData for identification and physics/raycasting
    terrainMesh.userData = {
         isTerrain: true,
         isCollidable: true,
         worldSize: size,
         segments: segments
     };
    console.log("Terrain mesh created.");
    return terrainMesh;
}

function applyNoiseToGeometry(geometry: THREE.PlaneGeometry): void {
    // FIX: Check geometry and attributes exist
    if (!geometry?.attributes?.position) {
         console.error("Cannot apply noise: Geometry or position attribute missing.");
         return;
    }
    const vertices = geometry.attributes.position.array as Float32Array;
    const numVertices = geometry.attributes.position.count;

    // Noise parameters (adjust for desired terrain appearance)
    const noiseStrength = 24; // Max height variation
    const noiseScale = 0.005; // How zoomed in/out the noise pattern is (smaller = larger features)
    const numOctaves = 4;     // Number of noise layers for detail
    const persistence = 0.5;  // How much each octave contributes (0-1)
    const lacunarity = 2.0;   // How much detail increases each octave (>1)


    // Center flattening parameters
    const flattenCenter = new THREE.Vector2(0, 0); // Point to flatten around
    const flattenRadius = 120; // Radius of the flattened area
    const flattenStrength = 0.9; // How much to flatten (0 = no flatten, 1 = completely flat) - Adjusted strength


    for (let i = 0; i < numVertices; i++) {
        const index = i * 3;
        const x = vertices[index];     // Plane X coordinate
        const y = vertices[index + 1]; // Plane Y coordinate (becomes Z after rotation)

        // --- Fractal Noise (Multiple Octaves) ---
        let totalNoise = 0;
        let amplitude = 1.0;
        let frequency = noiseScale;
        let maxAmplitude = 0; // For normalization

        for (let o = 0; o < numOctaves; o++) {
            totalNoise += simplex.noise(x * frequency, y * frequency) * amplitude;
            maxAmplitude += amplitude;
            amplitude *= persistence;
            frequency *= lacunarity;
        }
        // Normalize noise to roughly -1 to 1 range (depends on persistence)
        let normalizedNoise = maxAmplitude > 0 ? totalNoise / maxAmplitude : 0;
        let z = normalizedNoise * noiseStrength; // Apply overall strength

        // Flatten center smoothly
        const distToCenter = Math.sqrt((x - flattenCenter.x)**2 + (y - flattenCenter.y)**2);
        if (distToCenter < flattenRadius) {
            const flattenFactor = smoothstep(0, flattenRadius, distToCenter); // 0 = center, 1 = edge
            // Lerp between original height (z) and flattened height (z * (1-strength))
            // When flattenFactor is 0 (center), lerp alpha is flattenStrength
            // When flattenFactor is 1 (edge), lerp alpha is 0
            z = THREE.MathUtils.lerp(z, z * (1.0 - flattenStrength), 1.0 - flattenFactor);
        }

        vertices[index + 2] = z; // Apply calculated height (this is Z in PlaneGeometry, becomes Y after rotation)
    }
    geometry.attributes.position.needsUpdate = true; // Notify Three.js vertices have changed
}