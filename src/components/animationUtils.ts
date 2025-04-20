/* File: /src/components/animationUtils.ts */
import { AnimationAction, LoopOnce, LoopRepeat, MathUtils } from "three";
import { Character } from "../entities/character";
import { Animal } from "../entities/animals";
import { MoveState } from "../core/utils";

type AnimatableEntity = Character | Animal;

/**
 * Switches the currently active animation action for an entity.
 * @param entity The character or animal entity.
 * @param newAction The new animation action to play.
 * @param fadeDuration The duration for fading between animations.
 */
export function switchAction(
  entity: AnimatableEntity,
  newAction: AnimationAction | undefined,
  fadeDuration: number = 0.2
): void {
  const deathAction =
    entity instanceof Character ? entity.deadAction : entity.dieAction;
  if (entity.isDead && newAction !== deathAction) return;
  if (!newAction) return;

  const currentAction = entity.currentAction;

  if (newAction === currentAction) {
    if (!newAction.isRunning()) newAction.play();
    return;
  }

  if (currentAction) {
    currentAction.fadeOut(fadeDuration);
  }

  newAction
    .reset()
    .setEffectiveTimeScale(1)
    .setEffectiveWeight(1)
    .fadeIn(fadeDuration)
    .play();

  entity.currentAction = newAction;
}

/**
 * Transitions the entity's animation to the appropriate locomotion state (idle/walk/run).
 * @param entity The character or animal entity.
 * @param moveState The current movement state.
 */
export function transitionToLocomotion(
  entity: AnimatableEntity,
  moveState: MoveState
): void {
  if (entity.isDead) return;

  const isMoving =
    Math.abs(moveState.forward) > 0.1 || Math.abs(moveState.right) > 0.1;
  let targetAction: AnimationAction | undefined;

  if (isMoving) {
    const useRun =
      (entity instanceof Character && entity.isSprinting) ||
      (entity instanceof Animal && moveState.sprint); // Animals use moveState.sprint

    targetAction =
      useRun && entity.runAction ? entity.runAction : entity.walkAction;
    // Fallback if preferred action is missing
    if (!targetAction) targetAction = entity.runAction || entity.walkAction;
  } else {
    targetAction = entity.idleAction;
  }

  // Ensure we always have a fallback to idle if other actions are missing
  if (!targetAction && entity.idleAction) {
    targetAction = entity.idleAction;
  }

  switchAction(entity, targetAction);
}

/**
 * Plays the attack animation for the entity.
 * @param entity The character or animal entity.
 */
export function playAttackAnimation(entity: AnimatableEntity): void {
  if (entity.isDead || !entity.attackAction) return;
  entity.actionType = "attack";
  entity.isPerformingAction = true;
  switchAction(entity, entity.attackAction);
}

/**
 * Updates the entity's animation mixer and handles animation state transitions.
 * @param entity The character or animal entity.
 * @param deltaTime Time elapsed since the last frame.
 */
export function updateAnimations(
  entity: AnimatableEntity,
  deltaTime: number
): void {
  entity.mixer.update(deltaTime);

  if (entity.isDead) {
    const deathAction =
      entity instanceof Character ? entity.deadAction : entity.dieAction;
    if (entity.currentAction !== deathAction && deathAction) {
      switchAction(entity, deathAction);
    }
    return; // Don't update locomotion/action animations if dead
  }

  // If performing an attack, let the animation play out (handled by 'finished' listener in entity)
  if (entity.isPerformingAction && entity.actionType === "attack") {
    // Do nothing here, wait for animation to finish
  }
  // Otherwise, handle locomotion (idle/walk/run)
  else {
    transitionToLocomotion(entity, entity.moveState);
  }
}
