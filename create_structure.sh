#!/bin/bash
# Create main directory and subdirectories
mkdir -p src/core src/systems src/world src/ui

# Create empty files in src/
touch src/main.ts src/config.ts src/types.ts src/utils.ts src/Game.ts

# Create empty files in src/core/
touch src/core/Entity.ts src/core/Character.ts src/core/AIController.ts src/core/Inventory.ts src/core/EventLog.ts

# Create empty files in src/systems/
touch src/systems/Controls.ts src/systems/MobileControls.ts src/systems/Physics.ts src/systems/InteractionSystem.ts

# Create empty files in src/world/
touch src/world/WorldGenerator.ts src/world/Portals.ts

# Create empty files in src/ui/
touch src/ui/HUD.ts src/ui/InventoryDisplay.ts src/ui/JournalDisplay.ts src/ui/Minimap.ts

echo "Folder structure and files have been created."
