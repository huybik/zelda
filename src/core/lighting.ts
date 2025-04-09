// File: /src/core/lighting.ts
import { Scene, AmbientLight, DirectionalLight, HemisphereLight } from "three";

export function setupLighting(scene: Scene): void {
  const ambientLight = new AmbientLight(0xadc1d4, 0.6);
  scene.add(ambientLight);
  const directionalLight = new DirectionalLight(0xfff5e1, 0.9);
  directionalLight.position.set(150, 200, 100);
  directionalLight.castShadow = true;
  directionalLight.target.position.set(0, 0, 0);
  // Increased shadow map size for better detail
  directionalLight.shadow.mapSize.width = 2048;
  directionalLight.shadow.mapSize.height = 2048;
  directionalLight.shadow.camera.near = 10;
  directionalLight.shadow.camera.far = 500;
  // Adjusted shadow camera frustum size
  const shadowCamSize = 100; // Reduced size for more focused shadows
  directionalLight.shadow.camera.left = -shadowCamSize;
  directionalLight.shadow.camera.right = shadowCamSize;
  directionalLight.shadow.camera.top = shadowCamSize;
  directionalLight.shadow.camera.bottom = -shadowCamSize;
  // Adjusted bias to potentially reduce shadow acne or peter-panning
  directionalLight.shadow.bias = -0.0005;
  scene.add(directionalLight);
  scene.add(directionalLight.target);
  const hemisphereLight = new HemisphereLight(0x87ceeb, 0x98fb98, 0.3);
  scene.add(hemisphereLight);
}
