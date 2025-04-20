/* File: /src/core/gameLoop.ts */
import { Game } from "../main";
import { Character } from "../entities/character";
import { Animal } from "../entities/animals";
import { AIController } from "../ai/npcAI";
import { AnimalAIController } from "../ai/animalAI";
import { updateParticleEffects } from "../systems/particles";
import { Group } from "three";

/**
 * Executes a single step of the game loop.
 * @param game The main game instance.
 */
export function runGameLoopStep(game: Game): void {
  if (
    !game.clock ||
    !game.renderer ||
    !game.scene ||
    !game.camera ||
    !game.activeCharacter ||
    !game.isGameStarted
  )
    return;

  const deltaTime = Math.min(game.clock.getDelta(), 0.05);
  const elapsedTime = game.clock.elapsedTime;

  game.controls!.update(deltaTime);
  game.mobileControls?.update(deltaTime);

  if (!game.isPaused) {
    const currentTime = game.clock.elapsedTime;
    const timeSinceLastAiUpdate = currentTime - game.lastAiUpdateTime;
    const shouldUpdateAiLogic = timeSinceLastAiUpdate >= game.aiUpdateInterval;

    if (shouldUpdateAiLogic) {
      game.lastAiUpdateTime = currentTime;
    }

    if (game.controls?.moveState.attack || game.mobileControls?.attackHeld) {
      game.handlePlayerAttackInput();
    }

    game.activeCharacter.update(deltaTime, {
      moveState: game.controls!.moveState,
      collidables: game.collidableObjects,
    });

    game.physics!.update(deltaTime);

    game.entities.forEach((entity) => {
      if (entity === game.activeCharacter) return;

      if (
        entity instanceof Character &&
        entity.aiController instanceof AIController
      ) {
        if (shouldUpdateAiLogic) {
          entity.moveState = entity.aiController.computeAIMoveState(
            timeSinceLastAiUpdate
          );
        }
        entity.update(deltaTime, {
          moveState: entity.moveState,
          collidables: game.collidableObjects,
        });
      } else if (
        entity instanceof Animal &&
        entity.aiController instanceof AnimalAIController
      ) {
        if (shouldUpdateAiLogic) {
          entity.aiController.updateLogic(timeSinceLastAiUpdate);
        }
        entity.update(deltaTime, { collidables: game.collidableObjects });
      } else if (
        entity instanceof Group &&
        entity.userData?.mixer &&
        entity.userData?.isFalling
      ) {
        entity.userData.mixer.update(deltaTime);
        if (
          !entity.userData.fallAction.isRunning() &&
          entity.userData.isFalling
        ) {
          entity.userData.isFalling = false;
          entity.visible = false;
          entity.userData.isCollidable = false;
          entity.userData.isInteractable = false;
          const respawnTime = entity.userData.respawnTime || 20000;
          const maxHealth = entity.userData.maxHealth;
          setTimeout(() => {
            if (entity && entity.userData) {
              entity.visible = true;
              entity.userData.isCollidable = true;
              entity.userData.isInteractable = true;
              entity.userData.health = maxHealth;
              entity.rotation.set(0, 0, 0);
              entity.quaternion.set(0, 0, 0, 1);
            }
          }, respawnTime);
        }
      } else if (
        entity.update &&
        !(entity instanceof Character) &&
        !(entity instanceof Animal) &&
        !(entity instanceof Group && entity.userData?.mixer)
      ) {
        entity.update(deltaTime);
      }
    });

    game.combatSystem?.update(deltaTime);
    game.interactionSystem!.update(deltaTime);
    game.thirdPersonCamera!.update(deltaTime, game.collidableObjects);
    game.portalManager.animatePortals();
    game.portalManager.checkPortalCollisions();
    updateParticleEffects(game, elapsedTime);
    game.droppedItemManager?.update(deltaTime);
    game.checkRespawn();

    if (currentTime - game.lastQuestCheckTime > game.questCheckInterval) {
      game.questManager.checkAllQuestsCompletion();
      game.lastQuestCheckTime = currentTime;
    }

    if (game.activeCharacter.isDead) game.respawnPlayer();
  }

  game.hud!.update();
  game.minimap!.update();
  game.notificationManager?.update(deltaTime);

  game.renderer.render(game.scene, game.camera);
}
