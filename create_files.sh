# Create directories
mkdir -p src/core
mkdir -p src/entities
mkdir -p src/systems
mkdir -p src/controls
mkdir -p src/ui
mkdir -p src/objects

# Create empty files in src/core
touch src/core/constants.ts
touch src/core/helper.ts

# Create empty files in src/entities
touch src/entities/entities.ts
touch src/entities/ai.ts

# Create empty files in src/systems
touch src/systems/interaction.ts
touch src/systems/physics.ts
touch src/systems/camera.ts

# Create empty files in src/controls
touch src/controls/controls.ts
touch src/controls/mobileControls.ts

# Create empty files in src/ui
touch src/ui/hud.ts
touch src/ui/inventory.ts
touch src/ui/journal.ts
touch src/ui/minimap.ts

# Create empty file in src/objects
touch src/objects/objects.ts

# Create main.ts at the root level
touch src/main.ts