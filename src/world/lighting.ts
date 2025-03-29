
import * as THREE from 'three';

export function setupLighting(scene: THREE.Scene): void {
    scene.add(new THREE.AmbientLight(0xadc1d4, 0.6));

    const sun = new THREE.DirectionalLight(0xfff5e1, 0.9);
    sun.position.set(150, 200, 100);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048); // Use set for Vector2
    sun.shadow.camera.near = 10; sun.shadow.camera.far = 500;
    const shadowCamSize = 150;
    sun.shadow.camera.left = -shadowCamSize; sun.shadow.camera.right = shadowCamSize;
    sun.shadow.camera.top = shadowCamSize; sun.shadow.camera.bottom = -shadowCamSize;
    sun.shadow.bias = -0.001;
    scene.add(sun);
    scene.add(sun.target); // Target defaults to (0,0,0)

    scene.add(new THREE.HemisphereLight(0x87CEEB, 0x98FB98, 0.3));

    // Optional: Shadow camera visualization
    // scene.add(new THREE.CameraHelper(sun.shadow.camera));

    console.log("Lighting setup complete.");
}