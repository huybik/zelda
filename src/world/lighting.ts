import * as THREE from 'three';

export function setupLighting(scene: THREE.Scene): void {
    // Ambient light provides overall base lighting
    scene.add(new THREE.AmbientLight(0xadc1d4, 0.6)); // Soft cool ambient

    // Directional light simulates the sun
    const sun = new THREE.DirectionalLight(0xfff5e1, 0.9); // Warm sun color, slightly reduced intensity
    sun.position.set(150, 200, 100); // Position high and angled
    sun.castShadow = true;

    // Configure shadow properties
    sun.shadow.mapSize.set(2048, 2048); // FIX: Use set() for mapSize Vector2
    sun.shadow.camera.near = 10;
    sun.shadow.camera.far = 500;
    const shadowCamSize = 150; // Area covered by shadow camera
    sun.shadow.camera.left = -shadowCamSize;
    sun.shadow.camera.right = shadowCamSize;
    sun.shadow.camera.top = shadowCamSize;
    sun.shadow.camera.bottom = -shadowCamSize;
    sun.shadow.bias = -0.001; // Adjust shadow bias to prevent shadow acne
    // sun.shadow.normalBias = 0.02; // May need normal bias adjustment too

    scene.add(sun);
    // The target is implicitly (0,0,0) but can be added explicitly if needed later
    // scene.add(sun.target); // sun.target.position.set(...) can move where light points

    // Hemisphere light adds soft sky/ground bounce lighting
    // Sky color, ground color, intensity
    scene.add(new THREE.HemisphereLight(0x87CEEB, 0x98FB98, 0.3)); // Sky blue to light green ground

    // Optional: Visualize the shadow camera frustum for debugging
    // const shadowHelper = new THREE.CameraHelper(sun.shadow.camera);
    // scene.add(shadowHelper);

    console.log("Lighting setup complete.");
}