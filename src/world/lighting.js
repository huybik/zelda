import * as THREE from 'three';

export function setupLighting(scene) {
    // Ambient Light (overall illumination)
    const ambientLight = new THREE.AmbientLight(0xabcdef, 0.8); // Soft pastel ambient light
    scene.add(ambientLight);

    // Directional Light (simulates sunlight)
    const directionalLight = new THREE.DirectionalLight(0xffffff, 1.0); // White sunlight
    directionalLight.position.set(100, 150, 100); // Position the light source
    directionalLight.castShadow = true;

    // Configure shadow properties
    directionalLight.shadow.mapSize.width = 1024; // Higher resolution for sharper shadows
    // ***** CORRECTED LINE BELOW *****
    directionalLight.shadow.mapSize.height = 1024; // Was 'directionallight'
    // ***** END CORRECTION *****
    directionalLight.shadow.camera.near = 0.5;
    directionalLight.shadow.camera.far = 500;
    // Define the shadow camera's frustum (area that casts shadows)
    const shadowCamSize = 200;
    directionalLight.shadow.camera.left = -shadowCamSize;
    directionalLight.shadow.camera.right = shadowCamSize;
    directionalLight.shadow.camera.top = shadowCamSize;
    directionalLight.shadow.camera.bottom = -shadowCamSize;

    scene.add(directionalLight);
    scene.add(directionalLight.target); // Target defaults to (0,0,0)

    // Optional: Hemisphere Light for softer ground/sky transition
    // const hemisphereLight = new THREE.HemisphereLight(0x87CEEB, 0x90ee90, 0.5); // Sky color, ground color, intensity
    // scene.add(hemisphereLight);

    // Optional: visualize the shadow camera frustum
    // const shadowHelper = new THREE.CameraHelper(directionalLight.shadow.camera);
    // scene.add(shadowHelper);
}