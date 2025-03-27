import * as THREE from 'three';
import Game from './game.js';

// Basic check for WebGL support
if (!hasWebGL()) {
    const warning = WebGL.getWebGLErrorMessage();
    document.getElementById('game-container').appendChild(warning);
    throw new Error('WebGL is not supported or enabled.');
}

function hasWebGL() {
    try {
        const canvas = document.createElement('canvas');
        return !!(window.WebGLRenderingContext && (canvas.getContext('webgl') || canvas.getContext('experimental-webgl')));
    } catch (e) {
        return false;
    }
}

// Initialize and start the game
const game = new Game();
game.init();
game.start();

// Handle window resizing
window.addEventListener('resize', () => {
    game.onWindowResize();
}, false);

console.log("Low-Poly Wilderness Quest initialized.");