
import * as THREE from 'three';
import { SimplexNoise } from 'three/examples/jsm/math/SimplexNoise.js';
import { smoothstep } from '../utils/helpers';

const simplex = new SimplexNoise();

export function createTerrain(size: number, segments: number = 150): THREE.Mesh {
    console.log(`Creating terrain: ${size}x${size} with ${segments}x${segments} segments.`);
    const geometry = new THREE.PlaneGeometry(size, size, segments, segments);
    applyNoiseToGeometry(geometry);

    geometry.rotateX(-Math.PI / 2);
    geometry.computeVertexNormals();
    geometry.computeBoundingBox();

    const material = new THREE.MeshLambertMaterial({ color: 0x88B04B }); // Mossy green
    const terrainMesh = new THREE.Mesh(geometry, material);
    terrainMesh.receiveShadow = true;
    terrainMesh.name = "Terrain";
    terrainMesh.userData = { isTerrain: true, isCollidable: true, worldSize: size, segments: segments };
    console.log("Terrain mesh created.");
    return terrainMesh;
}

function applyNoiseToGeometry(geometry: THREE.PlaneGeometry): void {
    const vertices = geometry.attributes.position.array as Float32Array;
    const numVertices = geometry.attributes.position.count;

    // Noise parameters
    const noiseStrength = 24, noiseScale = 0.005;
    // Center flattening parameters
    const flattenRadius = 120, flattenStrength = 0.05;

    for (let i = 0; i < numVertices; i++) {
        const index = i * 3;
        const x = vertices[index], y = vertices[index + 1]; // Plane coordinates
        let z = simplex.noise(x * noiseScale, y * noiseScale) * noiseStrength; // Height

        // Flatten center smoothly
        const distToCenter = Math.sqrt(x * x + y * y);
        if (distToCenter < flattenRadius) {
            const flattenFactor = 1.0 - smoothstep(0, flattenRadius, distToCenter);
            z = THREE.MathUtils.lerp(z, z * (1.0 - flattenStrength), flattenFactor);
        }
        vertices[index + 2] = z; // Apply height (becomes Y after rotation)
    }
    geometry.attributes.position.needsUpdate = true;
}