import * as THREE from 'three';
import { SimplexNoise } from 'three/examples/jsm/math/SimplexNoise.js';

// Using the built-in SimplexNoise, no need for external lib unless preferred

export function createTerrain(size) {
    const segments = 100; // Controls the detail level of the terrain geometry
    const geometry = new THREE.PlaneGeometry(size, size, segments, segments);
    geometry.rotateX(-Math.PI / 2); // Rotate to make it horizontal

    const simplex = new SimplexNoise();
    const vertices = geometry.attributes.position.array;
    const noiseStrength = 10; // Max height variation
    const noiseScale = 0.01; // How zoomed in/out the noise pattern is

    for (let i = 0; i < vertices.length; i += 3) {
        const x = vertices[i];
        const z = vertices[i + 2]; // y is the vertical axis after rotation

        // Apply noise to the y-coordinate (height)
        vertices[i + 1] = simplex.noise(x * noiseScale, z * noiseScale) * noiseStrength;
    }

    geometry.computeVertexNormals(); // Recalculate normals for correct lighting

    const material = new THREE.MeshLambertMaterial({
        color: 0x90ee90, // Light green for grass
        // wireframe: true // Uncomment for debugging geometry
    });

    const terrainMesh = new THREE.Mesh(geometry, material);
    terrainMesh.receiveShadow = true; // Terrain should receive shadows
    terrainMesh.name = "Terrain"; // For identification

     // Add a simple bounding box for broad phase collision if needed,
     // but vertex-level checks might be better for uneven terrain.
     // For simplicity, we'll mostly rely on the player's height check against terrain.
     terrainMesh.userData.isTerrain = true; // Flag for physics system

    return terrainMesh;
}