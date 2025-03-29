import Game from './game';
import WebGL from 'three/examples/jsm/capabilities/WebGL.js';

function checkWebGL(): boolean {
    if (WebGL.isWebGLAvailable()) return true;

    const warning = WebGL.getWebGLErrorMessage();
    const container = document.getElementById('game-container') ?? document.body;
    try {
         container.appendChild(warning);
         // Add styles to make warning more prominent if needed
         warning.style.position = 'absolute';
         warning.style.top = '10px';
         warning.style.left = '10px';
         warning.style.padding = '10px';
         warning.style.backgroundColor = 'rgba(255, 200, 200, 0.9)';
         warning.style.border = '1px solid red';
         warning.style.color = 'black';
         warning.style.zIndex = '1000';
    }
    catch (e) {
         console.error("Couldn't display WebGL warning element:", e);
         alert("WebGL is not available or supported by your browser/device."); // Fallback alert
    }
    return false;
}

if (checkWebGL()) {
    let game: Game | null = null;
    try {
        game = new Game();
        game.init();
        game.start();

        // Define resize handler correctly before adding listener
        const onResize = () => {
             // FIX: Check game instance exists before calling method
             if (game) {
                 game.onWindowResize();
             }
        };
        window.addEventListener('resize', onResize);

        // Cleanup on page unload
        window.addEventListener('beforeunload', () => {
            window.removeEventListener('resize', onResize);
             // FIX: Check game instance exists before calling method
            if (game) {
                game.dispose();
                game = null; // Help garbage collection
            }
        });
        console.log("Game Initialized and running.");

    } catch (error) {
        console.error("Game Initialization/Runtime Error:", error);
        // Display error overlay
        const errorDiv = document.createElement('div');
        errorDiv.setAttribute('id', 'error-overlay'); // Add ID for potential removal/styling
        errorDiv.style.cssText = `
            position: fixed; top: 0; left: 0; width: 100%; height: 100%;
            padding: 30px; background: rgba(150, 0, 0, 0.95); color: white;
            z-index: 1001; font-family: monospace; white-space: pre-wrap;
            overflow-y: auto; box-sizing: border-box; border: 5px solid darkred;
        `;
        const message = error instanceof Error
            ? `<h2>Unhandled Game Error</h2><p>An unexpected error occurred. Please try refreshing the page. If the problem persists, check the console for details.</p><hr><h3>Details:</h3><pre>${error.message}\n\nSTACK TRACE:\n${error.stack}</pre>`
            : `<h2>Unhandled Game Error</h2><p>An unexpected error occurred. Please try refreshing the page.</p><hr><h3>Details:</h3><pre>${String(error)}</pre>`;
        errorDiv.innerHTML = message;
        document.body.appendChild(errorDiv);

        // Attempt cleanup even after error
         if (game) {
            game.dispose();
            game = null;
         }
    }
} else {
    console.error("WebGL check failed. Game cannot start.");
    // Optionally display a user-friendly message on the page
    const noWebGLDiv = document.createElement('div');
    noWebGLDiv.innerHTML = '<h2>WebGL Not Supported</h2><p>This application requires WebGL, which is not available or enabled in your browser.</p><p>Please try updating your browser or graphics drivers, or use a different browser like Chrome or Firefox.</p>';
    noWebGLDiv.style.padding = '20px';
    noWebGLDiv.style.textAlign = 'center';
    noWebGLDiv.style.color = 'black';
    (document.getElementById('game-container') ?? document.body).appendChild(noWebGLDiv);
}
