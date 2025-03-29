import * as THREE from 'three';

export function setupLighting(scene: THREE.Scene): void {
    // Ambient Light
    const ambientLight = new THREE.AmbientLight(0xadc1d4, 0.6); // Soft grayish-blue
    scene.add(ambientLight);

    // Directional Light (Sun)
    const directionalLight = new THREE.DirectionalLight(0xfff5e1, 0.9); // Warm white
    directionalLight.position.set(150, 200, 100); // Position determines angle
    directionalLight.castShadow = true;
    directionalLight.target.position.set(0, 0, 0); // Target origin

    // Shadow Settings
    directionalLight.shadow.mapSize.width = 2048;
    directionalLight.shadow.mapSize.height = 2048;
    directionalLight.shadow.camera.near = 10;
    directionalLight.shadow.camera.far = 500;
    // Adjust frustum size based on world/viewable area
    const shadowCamSize = 150;
    directionalLight.shadow.camera.left = -shadowCamSize;
    directionalLight.shadow.camera.right = shadowCamSize;
    directionalLight.shadow.camera.top = shadowCamSize;
    directionalLight.shadow.camera.bottom = -shadowCamSize;
    directionalLight.shadow.bias = -0.001; // Mitigate shadow acne
    // directionalLight.shadow.radius = 1; // Soften shadows (requires WebGL2 and specific shadow map types)

    scene.add(directionalLight);
    scene.add(directionalLight.target); // Required for directional light positioning

    // Hemisphere Light (Optional: softer ambient)
    const hemisphereLight = new THREE.HemisphereLight(0x87CEEB, 0x98FB98, 0.3); // Sky, Ground, Intensity
    scene.add(hemisphereLight);

    // Debug: Visualize Shadow Camera Frustum
    // const shadowHelper = new THREE.CameraHelper(directionalLight.shadow.camera);
    // scene.add(shadowHelper);

    console.log("Lighting setup complete.");
}