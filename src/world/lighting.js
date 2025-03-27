import * as THREE from 'three';

export function setupLighting(scene) {
    // Ambient Light (overall subtle illumination, less saturation)
    const ambientLight = new THREE.AmbientLight(0xadc1d4, 0.6); // Soft grayish-blue ambient
    scene.add(ambientLight);

    // Directional Light (simulates sunlight)
    const directionalLight = new THREE.DirectionalLight(0xfff5e1, 0.9); // Slightly warm white sunlight
    directionalLight.position.set(150, 200, 100); // Adjust position for desired angle (more from side/top)
    directionalLight.castShadow = true;
    directionalLight.target.position.set(0, 0, 0); // Target the center of the scene

    // Configure shadow properties
    directionalLight.shadow.mapSize.width = 2048; // Increased resolution for sharper shadows
    directionalLight.shadow.mapSize.height = 2048; // Fixed typo: was 'directionallight'
    directionalLight.shadow.camera.near = 10;     // Adjust near/far based on world size
    directionalLight.shadow.camera.far = 500;
    // Define the shadow camera's frustum (area that casts shadows)
    // Needs to cover the playable area reasonably well
    const shadowCamSize = 150; // Adjust size based on viewable area and performance
    directionalLight.shadow.camera.left = -shadowCamSize;
    directionalLight.shadow.camera.right = shadowCamSize;
    directionalLight.shadow.camera.top = shadowCamSize;
    directionalLight.shadow.camera.bottom = -shadowCamSize;
    directionalLight.shadow.bias = -0.001; // Adjust bias to prevent shadow acne (stripes)
    // directionalLight.shadow.radius = 1; // Soften shadow edges slightly (PCFSoftShadowMap helps too)

    scene.add(directionalLight);
    scene.add(directionalLight.target); // Target needs to be added to the scene

    // Optional: Hemisphere Light for softer ground/sky color transition
    const hemisphereLight = new THREE.HemisphereLight(0x87CEEB, 0x98FB98, 0.3); // Sky color, ground color, intensity
    scene.add(hemisphereLight);

    // Optional: visualize the shadow camera frustum for debugging
    // const shadowHelper = new THREE.CameraHelper(directionalLight.shadow.camera);
    // scene.add(shadowHelper);

    console.log("Lighting setup complete.");
}