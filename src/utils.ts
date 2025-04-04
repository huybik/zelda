// src/utils.ts
import {
  Vector3,
  MathUtils,
  Scene,
  Raycaster,
  Mesh,
  Group,
  AnimationClip,
} from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import {
  getApiUrl,
  getCurrentApiKey,
  switchApiKey,
  getSwitchedApiKeyFlag,
  setSwitchedApiKeyFlag,
} from "./config";
import type { LoadedModel } from "./types"; // Use type import

let nextEntityIdCounter = 0;
export function getNextEntityId(): number {
  return nextEntityIdCounter++;
}

export function randomFloat(min: number, max: number): number {
  return Math.random() * (max - min) + min;
}

export function smoothstep(edge0: number, edge1: number, x: number): number {
  x = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return x * x * (3 - 2 * x);
}

// Smoothly interpolates a Vector3 towards a target using an exponential decay based on deltaTime.
// alphaBase: Lower values mean faster interpolation (less smoothing). Value should be between 0 and 1.
// A value close to 0 (e.g., 0.01) means it reaches the target very quickly.
// A value close to 1 (e.g., 0.99) means it reaches the target very slowly.
export function smoothVectorLerp(
  current: Vector3,
  target: Vector3,
  alphaBase: number,
  deltaTime: number
): Vector3 {
  if (alphaBase <= 0) return current.copy(target); // Instant snap if alpha is 0 or less
  if (alphaBase >= 1) return current; // No movement if alpha is 1 or more
  // Calculate the interpolation factor based on deltaTime.
  // Math.pow(alphaBase, deltaTime) approaches 0 as deltaTime increases,
  // making the factor approach 1 (meaning more movement towards the target).
  const factor = 1.0 - Math.pow(alphaBase, deltaTime);
  return current.lerp(target, factor);
}

// Gets the Y coordinate of the terrain at a given X, Z position.
export function getTerrainHeight(scene: Scene, x: number, z: number): number {
  const terrain = scene.getObjectByName("Terrain") as Mesh;
  if (!terrain) return 0;
  // Use a single Raycaster instance if possible, or create locally if needed frequently
  const raycaster = new Raycaster(
    new Vector3(x, 200, z), // Start ray high above potential terrain
    new Vector3(0, -1, 0) // Cast downwards
  );
  const intersects = raycaster.intersectObject(terrain);
  return intersects.length > 0 ? intersects[0].point.y : 0;
}

// Loads multiple GLTF models asynchronously.
export async function loadModels(
  modelPaths: Record<string, string>
): Promise<Record<string, LoadedModel>> {
  const loader = new GLTFLoader();
  const models: Record<string, LoadedModel> = {};
  const loadPromises = Object.entries(modelPaths).map(async ([key, path]) => {
    try {
      const gltf = await loader.loadAsync(path);
      models[key] = { scene: gltf.scene, animations: gltf.animations };
      console.log(`Model loaded: ${key}`);
    } catch (error) {
      console.error(`Failed to load model ${key} from ${path}:`, error);
      // Provide a fallback or handle the error appropriately
      models[key] = { scene: new Group(), animations: [] }; // Example fallback
    }
  });
  await Promise.all(loadPromises);
  return models;
}

// Sends a prompt to the Gemini API and returns the text response.
export async function sendToGemini(prompt: string): Promise<string | null> {
  const apiKey = getCurrentApiKey();
  if (!apiKey) {
    console.warn("Gemini API key not configured.");
    return null;
  }

  let apiUrl = getApiUrl();

  try {
    const response = await fetch(apiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        // Request JSON response for easier parsing, even if we expect simple text
        generationConfig: { responseMimeType: "application/json" },
        // Safety settings (optional, adjust as needed)
        // safetySettings: [
        //   { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_MEDIUM_AND_ABOVE" },
        //   { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_MEDIUM_AND_ABOVE" },
        //   { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_MEDIUM_AND_ABOVE" },
        //   { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_MEDIUM_AND_ABOVE" },
        // ],
      }),
    });

    if (!response.ok) {
      // Handle rate limiting by switching keys
      if (response.status === 429 && !getSwitchedApiKeyFlag()) {
        console.warn(`Rate limit hit (429). Switching API key...`);
        if (switchApiKey()) {
          setSwitchedApiKeyFlag(true); // Mark that we switched
          return sendToGemini(prompt); // Retry with the new key
        } else {
          console.error("Rate limit hit, but no alternate key to switch to.");
          return null; // Could not switch key
        }
      }
      // Handle other errors
      console.error(`HTTP error! status: ${response.status}`);
      const errorData = await response.text();
      console.error("Error details:", errorData);
      // Check for specific block reasons if available in errorData
      try {
        const errorJson = JSON.parse(errorData);
        if (errorJson.error?.message) {
          console.error("API Error Message:", errorJson.error.message);
        }
      } catch (e) {
        /* Ignore if error data is not JSON */
      }
      return null;
    }

    setSwitchedApiKeyFlag(false); // Reset switch flag on success
    const data = await response.json();

    // Check for blocked content
    if (!data.candidates || data.candidates.length === 0) {
      if (data.promptFeedback?.blockReason) {
        console.warn(
          `Prompt blocked by API. Reason: ${data.promptFeedback.blockReason}`
        );
        // You might want to return a specific message indicating blockage
        return `(Content blocked: ${data.promptFeedback.blockReason})`;
      } else {
        console.error(
          "API returned no candidates without a specific block reason:",
          data
        );
        return "(No response from AI)";
      }
    }

    // Extract text, handling potential variations in response structure
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (typeof text === "string") {
      return text;
    } else {
      console.error("Unexpected API response format or missing text:", data);
      return null;
    }
  } catch (error) {
    console.error("Error during API call:", error);
    // Provide a fallback JSON string if the API call itself fails
    return JSON.stringify({
      action: "idle",
      intent: "Error fallback: API call failed",
    });
  }
}
