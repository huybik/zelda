/* File: /src/components/movementUtils.ts */
import { Vector3, MathUtils } from "three";
import { Character } from "../entities/character";
import { Animal } from "../entities/animals";
import { MoveState, getTerrainHeight } from "../core/utils";

type MovableEntity = Character | Animal;

/**
 * Handles stamina consumption and regeneration for a character.
 * @param character The character entity.
 * @param deltaTime Time elapsed since the last frame.
 */
export function handleStamina(character: Character, deltaTime: number): void {
  if (character.isDead) return;

  const isMoving =
    character.moveState.forward !== 0 || character.moveState.right !== 0;
  character.isSprinting =
    character.moveState.sprint &&
    isMoving &&
    !character.isExhausted &&
    character.stamina > 0;

  if (character.isSprinting) {
    character.stamina -= character.staminaDrainRate * deltaTime;
    if (character.stamina <= 0) {
      character.stamina = 0;
      character.isExhausted = true;
      character.isSprinting = false;
      if (character.game)
        character.game.logEvent(
          character,
          "exhausted",
          `${character.name} is exhausted!`,
          undefined,
          {},
          character.mesh!.position
        );
    }
  } else {
    let regenRate = character.staminaRegenRate;
    if (character.isExhausted) {
      regenRate /= 2; // Slower regen when exhausted
      if (character.stamina >= character.exhaustionThreshold) {
        character.isExhausted = false;
        if (character.game)
          character.game.logEvent(
            character,
            "recovered",
            `${character.name} feels recovered.`,
            undefined,
            {},
            character.mesh!.position
          );
      }
    }
    character.stamina = Math.min(
      character.maxStamina,
      character.stamina + regenRate * deltaTime
    );
  }
}

/**
 * Calculates the entity's velocity based on its current move state and speed.
 * @param entity The character or animal entity.
 * @param deltaTime Time elapsed since the last frame.
 */
export function handleMovement(entity: MovableEntity, deltaTime: number): void {
  if (entity.isDead || !entity.mesh) return;

  let currentMoveState: MoveState;
  let currentSpeed: number;

  if (entity instanceof Character) {
    currentMoveState = entity.moveState;
    currentSpeed = entity.isSprinting ? entity.runSpeed : entity.walkSpeed;
    const forward = new Vector3(0, 0, 1).applyQuaternion(
      entity.mesh.quaternion
    );
    const right = new Vector3(1, 0, 0).applyQuaternion(entity.mesh.quaternion);
    const moveDirection = new Vector3(
      currentMoveState.right,
      0,
      currentMoveState.forward
    ).normalize();
    const moveVelocity = new Vector3()
      .addScaledVector(forward, moveDirection.z)
      .addScaledVector(right, moveDirection.x);

    if (moveDirection.lengthSq() > 0) {
      moveVelocity.normalize().multiplyScalar(currentSpeed);
    }
    entity.velocity.x = moveVelocity.x;
    entity.velocity.z = moveVelocity.z;
  } else if (entity instanceof Animal) {
    // Animals get move state from AI controller
    currentMoveState =
      entity.aiController?.computeAIMovement() ?? entity.moveState;
    currentSpeed = currentMoveState.sprint ? entity.runSpeed : entity.walkSpeed;
    const forward = new Vector3(0, 0, 1).applyQuaternion(
      entity.mesh.quaternion
    );
    const moveDirection = new Vector3(
      0,
      0,
      currentMoveState.forward
    ).normalize(); // Only forward/backward based on AI
    const moveVelocity = new Vector3();

    if (moveDirection.lengthSq() > 0) {
      moveVelocity.addScaledVector(forward, moveDirection.z * currentSpeed);
    }
    entity.velocity.x = moveVelocity.x;
    entity.velocity.z = moveVelocity.z;
    // Update the animal's internal moveState for animation purposes
    entity.moveState = currentMoveState;
  }
}

/**
 * Applies the entity's velocity to its position and handles ground clamping.
 * @param entity The character or animal entity.
 * @param deltaTime Time elapsed since the last frame.
 */
export function applyMovement(entity: MovableEntity, deltaTime: number): void {
  if (entity.isDead || !entity.mesh) return;

  entity.mesh.position.x += entity.velocity.x * deltaTime;
  entity.mesh.position.z += entity.velocity.z * deltaTime;

  // Ground clamping
  if (entity.scene) {
    const groundY = getTerrainHeight(
      entity.scene,
      entity.mesh.position.x,
      entity.mesh.position.z
    );
    entity.mesh.position.y = groundY; // Simple clamp for animals
  }
  entity.velocity.y = 0; // Reset vertical velocity after clamping/lerping
}
