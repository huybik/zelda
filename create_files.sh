#!/bin/bash

# Create directories
mkdir -p src/ai
mkdir -p src/core
mkdir -p src/controls
mkdir -p src/entities
mkdir -p src/systems
mkdir -p src/ui
mkdir -p src/utils
mkdir -p src/world

# Create empty files in src/ai
touch src/ai/aiController.ts
touch src/ai/geminiApi.ts

# Create empty files in src/core
touch src/core/game.ts
touch src/core/setup.ts

# Create empty files in src/controls
touch src/controls/desktopControls.ts
touch src/controls/mobileControls.ts

# Create empty files in src/entities
touch src/entities/character.ts
touch src/entities/entity.ts

# Create empty files in src/systems
touch src/systems/cameraSystem.ts
touch src/systems/interactionSystem.ts
touch src/systems/physics.ts

# Create empty files in src/ui
touch src/ui/chatInterface.ts
touch src/ui/hud.ts
touch src/ui/inventoryDisplay.ts
touch src/ui/journalDisplay.ts
touch src/ui/minimap.ts

# Create empty files in src/utils
touch src/utils/constants.ts
touch src/utils/eventLog.ts
touch src/utils/helpers.ts
touch src/utils/inventory.ts
touch src/utils/types.ts

# Create empty files in src/world
touch src/world/environment.ts
touch src/world/objects.ts
touch src/world/terrain.ts
