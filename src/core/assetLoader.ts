// File: /src/core/assetLoader.ts
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import {
  Group,
  AnimationClip,
  BoxGeometry,
  MeshBasicMaterial,
  Mesh,
} from "three";
import { createDeerModel, createWolfModel } from "../models/animalModels"; // Import procedural models

export async function loadModels(): Promise<
  Record<string, { scene: Group; animations: AnimationClip[] }>
> {
  const loader = new GLTFLoader();
  const modelPaths = {
    player: "assets/player/scene.gltf",
    tavernMan: "assets/player/scene.gltf",
    oldMan: "assets/player/scene.gltf",
    woman: "assets/player/scene.gltf",
    // Add paths for GLTF animals if you have them
    // wolf_gltf: "assets/animals/wolf.gltf",
    // deer_gltf: "assets/animals/deer.gltf",
  };
  const models: Record<string, { scene: Group; animations: AnimationClip[] }> =
    {};

  // Load GLTF models
  for (const [key, path] of Object.entries(modelPaths)) {
    try {
      const gltf = await loader.loadAsync(path);
      models[key] = { scene: gltf.scene, animations: gltf.animations };
    } catch (error) {
      console.error(`Failed to load GLTF model ${key} from ${path}:`, error);
      // Provide a fallback or handle the error appropriately
      // For example, use a simple cube as a fallback
      const fallbackGeometry = new BoxGeometry(1, 1, 1);
      const fallbackMaterial = new MeshBasicMaterial({ color: 0xff0000 });
      const fallbackMesh = new Mesh(fallbackGeometry, fallbackMaterial);
      const fallbackGroup = new Group();
      fallbackGroup.add(fallbackMesh);
      models[key] = { scene: fallbackGroup, animations: [] };
    }
  }

  // Add procedurally generated models
  // These don't have pre-made animations, they will rely on generated ones
  try {
    models["deer_procedural"] = { scene: createDeerModel(), animations: [] };
  } catch (error) {
    console.error("Failed to create procedural deer model:", error);
  }
  try {
    models["wolf_procedural"] = { scene: createWolfModel(), animations: [] };
  } catch (error) {
    console.error("Failed to create procedural wolf model:", error);
  }

  return models;
}
