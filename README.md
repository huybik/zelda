# Low-Poly Wilderness Quest

A simple open-world RPG prototype built with Three.js and Vite.

## Overview

"Low-Poly Wilderness Quest" is a single-player, open-world RPG that runs in a web browser. Players explore a minimalist, blocky wilderness, complete quests, gather resources, and interact with animals and objects. The game features a low-poly art style with a pastel color palette.

## Features Implemented (Current State)

*   **Engine Setup:** Basic Three.js scene, renderer, lighting, and fog.
*   **World:** Programmatically generated terrain using Perlin/Simplex noise, basic trees, rocks, herbs, cabins, and a windmill. Invisible world boundaries.
*   **Player:** Blocky humanoid model, WASD movement, mouse look (pointer lock), jumping (with gravity), sprinting (consumes stamina), health/stamina stats. Basic walking animation. Fall damage implemented. Respawn on death.
*   **NPCs:** Simple blocky models (Farmer, Blacksmith, Hunter) with accessories. Basic idle animations (looking around). Interaction via 'E' key for dialogue and quest assignment/completion.
*   **Animals:** Deer (can be petted for a chance of feathers, flees), Wolves (hostile, attack player), basic wandering/fleeing/attacking AI. Simple head-bob animation.
*   **Interaction:** Context-sensitive 'E' key interaction for talking to NPCs, petting deer, gathering resources (wood, stone, herbs - with timed progress bar), opening chests, picking up quest items. UI prompts indicate nearby interactables.
*   **Inventory:** Grid-based inventory system (20 slots). Items can be added, removed, stacked (basic). UI display toggled with 'I'. Basic item usage (Health Potion).
*   **Quests:** Simple quest system allowing NPCs to assign 'gather' or 'retrieve' quests. Quest log tracks active/completed quests. Rewards (gold, items) granted on completion.
*   **Journal:** UI display toggled with 'J', showing active/completed quests and a log of recent game events.
*   **UI:** HUD with health/stamina bars. Minimap showing player, NPCs, and animals. Interaction prompts. Inventory and Journal panels.
*   **Physics:** Simple gravity applied to player/animals. Basic AABB collision detection and response (push-out) between player and static objects/entities. Ground checking for player jumping and fall damage. Camera collision avoidance.
*   **Controls:** Standard WASD + Mouse look. Shift to sprint, Space to jump, E to interact, I for Inventory, J for Journal, Left Mouse to use inventory items (basic).

## Technical Details

*   **Library:** Three.js (via npm module)
*   **Bundler/Dev Server:** Vite
*   **Language:** JavaScript (ES Modules)
*   **Assets:** All models are programmatically generated using Three.js geometries (`BoxGeometry`, `CylinderGeometry`, `ConeGeometry`, `SphereGeometry`). Materials use `MeshLambertMaterial` for lighting interaction.

## Setup and Running

1.  **Prerequisites:** Node.js and npm (or yarn) installed.
2.  **Clone Repository:**
    ```bash
    git clone <repository-url>
    cd low-poly-wilderness-quest
    ```
3.  **Install Dependencies:**
    ```bash
    npm install
    ```
    *or*
    ```bash
    yarn install
    ```
4.  **Run Development Server:**
    ```bash
    npm run dev
    ```
    *or*
    ```bash
    yarn dev
    ```
5.  Open your web browser and navigate to the URL provided by Vite (usually `http://localhost:5173`).
6.  Click on the game window to enable pointer lock for mouse controls.

## Code Structure

*   `index.html`: Main HTML file with canvas and UI placeholders.
*   `style.css`: CSS for UI overlays.
*   `src/`: Contains all JavaScript source code.
    *   `main.js`: Entry point, initializes the game.
    *   `game.js`: Core `Game` class managing the scene, loop, and systems.
    *   `world/`: Modules for terrain, lighting, and environment population.
    *   `entities/`: Classes for `Player`, `NPC`, `Animal`, and base `Entity`.
    *   `systems/`: Modules for core mechanics like `Controls`, `Camera`, `Physics`, `Interaction`, `Inventory`, `Quest`.
    *   `ui/`: Modules for managing HUD, Minimap, Inventory display, Journal display.
    *   `utils/`: Helper functions.

## Potential Future Features / Improvements

*   Day/Night Cycle
*   Weather Effects
*   More complex AI behaviors
*   Crafting system
*   More diverse quests and NPCs
*   Saving/Loading game state
*   Sound effects and music
*   Improved animations (using skeletons or procedural methods)
*   Optimization (Instancing, LODs)
*   More sophisticated combat mechanics
*   Better terrain generation (biomes, rivers implemented fully)