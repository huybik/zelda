// src/main.ts
import { Game } from "./Game";
import WebGL from "three/examples/jsm/capabilities/WebGL.js";

// Declare global game instance for debugging (optional)
declare global {
  interface Window {
    game: Game | undefined; // Use undefined initially
  }
}

// Main entry point
async function main() {
  const gameContainer = document.getElementById("game-container");
  if (!gameContainer) {
    console.error(
      "Fatal Error: Game container element (#game-container) not found."
    );
    return;
  }

  // Check for WebGL2 support first
  if (!WebGL.isWebGL2Available()) {
    const warning = WebGL.getWebGLErrorMessage();
    gameContainer.appendChild(warning);
    console.error("WebGL 2 not available.");
    return;
  }

  let gameInstance: Game | null = null;

  try {
    console.log("Creating game instance...");
    gameInstance = new Game();
    window.game = gameInstance; // Assign to global scope for debugging

    console.log("Initializing game...");
    await gameInstance.init(); // Asynchronous initialization

    console.log("Starting game loop...");
    gameInstance.start(); // Starts the animation loop

    // --- Event Listeners ---
    // Debounced resize handler
    let resizeTimeout: ReturnType<typeof setTimeout>;
    const handleResize = () => {
      clearTimeout(resizeTimeout);
      resizeTimeout = setTimeout(() => {
        gameInstance?.onWindowResize();
      }, 150); // Debounce resize events (150ms delay)
    };
    window.addEventListener("resize", handleResize, false);

    // Cleanup listener on unload/beforeunload
    const cleanup = () => {
      console.log("Cleaning up game instance...");
      window.removeEventListener("resize", handleResize);
      gameInstance?.dispose(); // Call game's cleanup method
      window.game = undefined; // Remove global reference
    };
    window.addEventListener("beforeunload", cleanup);
    // Note: 'unload' might not always fire reliably, especially on mobile.
    // 'pagehide' can be an alternative.

    console.log("Game running.");
  } catch (error) {
    console.error("Game Initialization or Startup Failed:", error);
    // Display error message to the user
    const errorDiv = document.createElement("div");
    errorDiv.style.color = "red";
    errorDiv.style.backgroundColor = "white";
    errorDiv.style.padding = "20px";
    errorDiv.style.margin = "20px";
    errorDiv.style.border = "1px solid black";
    errorDiv.style.fontFamily = "monospace";
    errorDiv.innerHTML = `<h2>Game Error</h2><p>${(error as Error).message}</p><pre>${(error as Error).stack}</pre>`;
    gameContainer.innerHTML = ""; // Clear previous content
    gameContainer.appendChild(errorDiv);
    // Ensure cleanup happens even if init fails partially
    if (gameInstance) {
      gameInstance.dispose();
      window.game = undefined;
    }
  }
}

// Run the main function when the DOM is ready
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", main);
} else {
  main(); // DOM is already ready
}
