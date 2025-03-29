
import Game from './game';
import WebGL from 'three/examples/jsm/capabilities/WebGL.js';

function checkWebGL(): boolean {
    if (WebGL.isWebGLAvailable()) return true;
    const warning = WebGL.getWebGLErrorMessage();
    try { (document.getElementById('game-container') ?? document.body).appendChild(warning); }
    catch (e) { console.error("Couldn't display WebGL warning:", e); alert("WebGL not available."); }
    return false;
}

if (checkWebGL()) {
    let game: Game | null = null;
    try {
        game = new Game();
        game.init();
        game.start();

        const onResize = () => game?.onWindowResize();
        window.addEventListener('resize', onResize);
        window.addEventListener('beforeunload', () => { // Cleanup
            window.removeEventListener('resize', onResize);
            game?.dispose();
        });
        console.log("Game Initialized.");

    } catch (error) {
        console.error("Game Initialization/Runtime Error:", error);
        const errorDiv = document.createElement('div');
        errorDiv.style.cssText = `position:fixed;top:0;left:0;width:100%;padding:20px;background:rgba(200,0,0,0.9);color:white;z-index:1000;font-family:monospace;white-space:pre-wrap;border-bottom:2px solid darkred;`;
        const msg = error instanceof Error ? `<h2>Error</h2><p>Refresh may fix.</p><pre>${error.message}\n${error.stack}</pre>` : `<h2>Error</h2><p>Refresh may fix.</p><pre>${String(error)}</pre>`;
        errorDiv.innerHTML = msg;
        document.body.appendChild(errorDiv);
        game?.dispose(); // Attempt cleanup
    }
} else {
    console.error("WebGL check failed. Aborting.");
}