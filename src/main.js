// Import THREE globally for examples/jsm components if needed, or rely on module imports
// import * as THREE from 'three';
import Game from './game.js';
import WebGL from 'three/examples/jsm/capabilities/WebGL.js'; // Correct path for capabilities

// --- WebGL Support Check ---
function checkWebGL() {
    if (WebGL.isWebGLAvailable()) {
        // WebGL is available
        return true;
    } else {
        const warning = WebGL.getWebGLErrorMessage();
        try { // Try appending to DOM, handle potential errors
             const container = document.getElementById('game-container') || document.body;
             container.appendChild(warning);
        } catch (e) {
            console.error("Could not display WebGL error message:", e);
            alert("WebGL is not supported or enabled on your browser."); // Fallback alert
        }
        return false;
    }
}


// --- Main Execution ---
if (checkWebGL()) {
    let gameInstance = null;
    try {
        // Initialize and start the game
        gameInstance = new Game();
        gameInstance.init();
        gameInstance.start();

        // Handle window resizing
        const onResize = () => {
            if (gameInstance) {
                gameInstance.onWindowResize();
            }
        };
        window.addEventListener('resize', onResize, false);

        console.log("Low-Poly Wilderness Quest initialized and running.");

        // Optional: Add cleanup logic for HMR (Hot Module Replacement) or page unload
        window.addEventListener('beforeunload', () => {
            if (gameInstance) {
                window.removeEventListener('resize', onResize);
                gameInstance.dispose(); // Clean up Three.js resources
            }
        });

    } catch (error) {
        console.error("An error occurred during game initialization or runtime:", error);
        // Display error to the user gracefully
        const errorDiv = document.createElement('div');
        errorDiv.style.position = 'fixed';
        errorDiv.style.top = '0';
        errorDiv.style.left = '0';
        errorDiv.style.width = '100%';
        errorDiv.style.padding = '20px';
        errorDiv.style.backgroundColor = 'rgba(255, 0, 0, 0.8)';
        errorDiv.style.color = 'white';
        errorDiv.style.zIndex = '1000';
        errorDiv.innerHTML = `<h2>Game Error</h2><p>An unexpected error occurred. Please try refreshing the page.</p><pre>${error.message}\n${error.stack}</pre>`;
        document.body.appendChild(errorDiv);

        // Clean up partially initialized game if possible
        if (gameInstance && typeof gameInstance.dispose === 'function') {
            gameInstance.dispose();
        }
    }
} else {
    // WebGL check failed, error message already displayed
    console.error("WebGL check failed. Game cannot start.");
}