import Game from './game'; // Import default export
import WebGL from 'three/examples/jsm/capabilities/WebGL.js';

function checkWebGL(): boolean {
    if (WebGL.isWebGLAvailable()) {
        return true;
    } else {
        const warning = WebGL.getWebGLErrorMessage();
        try {
            const container = document.getElementById('game-container') ?? document.body;
            container.appendChild(warning);
        } catch (e) {
            console.error("Could not display WebGL error message:", e);
            alert("WebGL is not supported or enabled on your browser.");
        }
        return false;
    }
}

// --- Main Execution ---
if (checkWebGL()) {
    let gameInstance: Game | null = null;

    try {
        gameInstance = new Game();
        gameInstance.init();
        gameInstance.start();

        // Handle window resize
        const onResize = () => gameInstance?.onWindowResize();
        window.addEventListener('resize', onResize, false);

        console.log("Low-Poly Wilderness Quest (TypeScript) initialized.");

        // Cleanup on page unload/HMR
        window.addEventListener('beforeunload', () => {
            window.removeEventListener('resize', onResize);
            gameInstance?.dispose();
        });

    } catch (error: unknown) { // Use 'unknown' for better type safety
        console.error("An error occurred during game initialization or runtime:", error);
        // Display error overlay
        const errorDiv = document.createElement('div');
        errorDiv.style.cssText = `
            position: fixed; top: 0; left: 0; width: 100%; padding: 20px;
            background-color: rgba(200, 0, 0, 0.9); color: white; z-index: 1000;
            font-family: monospace; white-space: pre-wrap; border-bottom: 2px solid darkred;
        `;
        let errorMessage = "Unknown Error";
        if (error instanceof Error) {
            errorMessage = `<h2>Game Error</h2><p>An unexpected error occurred. Please try refreshing.</p><pre>${error.message}\n${error.stack}</pre>`;
        } else {
             errorMessage = `<h2>Game Error</h2><p>An unexpected error occurred. Please try refreshing.</p><pre>${String(error)}</pre>`;
        }
        errorDiv.innerHTML = errorMessage;
        document.body.appendChild(errorDiv);

        // Attempt cleanup
        gameInstance?.dispose();
    }
} else {
    console.error("WebGL check failed. Game cannot start.");
}