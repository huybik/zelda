import { Vector3, Object3D, Box3, Raycaster } from "three";
import { Game } from "../main";
import { Entity } from "../entities/entitiy";
import { Character } from "../entities/character";
import { Animal } from "../entities/animals";
import { getItemDefinition, Profession } from "../core/items";
import { MathUtils } from "three";

export class CombatSystem {
  private game: Game;
  private raycaster: Raycaster;

  constructor(game: Game) {
    this.game = game;
    this.raycaster = new Raycaster();
  }

  initiateAttack(attacker: Entity, target?: Entity | Object3D): void {
    if (attacker.isDead || attacker.isPerformingAction || !this.game.clock) {
      return;
    }

    const now = this.game.clock.elapsedTime;
    if (now < attacker.lastAttackTime + attacker.attackCooldown) {
      return;
    }

    attacker.lastAttackTime = now;
    attacker.playAttackAnimation();

    let finalTarget: Entity | Object3D | null = target ?? null;

    if (!finalTarget && attacker === this.game.activeCharacter) {
      const playerAttackSearchRadius = attacker.getAttackRange();
      finalTarget = this.findNearestTarget(attacker, playerAttackSearchRadius);
    }

    if (finalTarget) {
      const targetPosition =
        finalTarget instanceof Entity
          ? finalTarget.mesh!.position
          : finalTarget.position;
      attacker.lookAt(targetPosition);

      const distanceSq =
        attacker.mesh!.position.distanceToSquared(targetPosition);
      const attackRange = attacker.getAttackRange();
      if (distanceSq <= attackRange * attackRange) {
        this.executeAttack(attacker, finalTarget);
      } else {
        console.log(
          `${attacker.name} target moved out of attack range (${attackRange}m).`
        );
      }
    }
  }

  findNearestTarget(attacker: Entity, range: number): Entity | Object3D | null {
    if (!attacker.mesh || !this.game.scene) return null;

    const attackerPosition = attacker.mesh.position;
    const rangeSq = range * range;
    let closestTarget: Entity | Object3D | null = null;
    let minDistanceSq = rangeSq;

    for (const potentialTarget of this.game.interactableObjects) {
      if (potentialTarget === attacker || potentialTarget === attacker.mesh)
        continue;

      const targetMesh = (potentialTarget as any).mesh ?? potentialTarget;
      if (!(targetMesh instanceof Object3D) || !targetMesh.visible) continue;

      if (potentialTarget instanceof Entity && potentialTarget.isDead) continue;
      if (
        targetMesh.userData.resource &&
        (targetMesh.userData.health <= 0 || targetMesh.userData.isFalling)
      )
        continue;

      const targetPosition = targetMesh.getWorldPosition(new Vector3());
      const distanceSq = attackerPosition.distanceToSquared(targetPosition);

      if (distanceSq < minDistanceSq) {
        minDistanceSq = distanceSq;
        closestTarget = potentialTarget;
      }
    }

    return closestTarget;
  }

  private getTargetId(target: Entity | Object3D): string {
    if (target instanceof Entity) {
      return target.id;
    } else {
      return target.userData.id || target.uuid;
    }
  }

  executeAttack(attacker: Entity, target: Entity | Object3D): void {
    if (attacker.isDead || !this.game.clock) return;

    const baseDamage = attacker.getAttackDamage();
    const targetMesh = (target as any).mesh ?? target;
    const targetPosition = targetMesh.getWorldPosition(new Vector3());
    const attackerPosition = attacker.mesh!.position.clone();

    let damageMultiplier = 1.0;
    const targetIsEntity = target instanceof Entity;
    const targetResource = targetMesh.userData.resource;
    const weaponId =
      attacker instanceof Character
        ? attacker.equippedWeapon?.definition.id
        : null;

    if (attacker instanceof Character && attacker.equippedWeapon) {
      const weaponDef = attacker.equippedWeapon.definition;
      let efficientProfession: Profession | null = null;
      if (weaponDef.id === "sword") efficientProfession = Profession.Hunter;
      else if (weaponDef.id === "pickaxe")
        efficientProfession = Profession.Blacksmith;
      else if (weaponDef.id === "axe") efficientProfession = Profession.Farmer;

      if (
        efficientProfession &&
        attacker.professions.has(efficientProfession)
      ) {
        damageMultiplier *= 1.5;
      }
    }

    if (weaponId === "sword" && targetIsEntity) {
      damageMultiplier *= 2.0;
    } else if (weaponId === "axe" && targetResource === "wood") {
      damageMultiplier *= 2.0;
    } else if (weaponId === "pickaxe" && targetResource === "stone") {
      damageMultiplier *= 2.0;
    }

    const bonusDamage =
      attacker instanceof Character ? attacker.bonusDamage : 0;
    const effectiveDamage = Math.max(
      1,
      Math.round(baseDamage * damageMultiplier) + bonusDamage
    );

    let targetName = "Object";
    let targetId = targetMesh.uuid;

    if (target instanceof Entity) {
      targetName = target.name;
      targetId = target.id;
      target.takeDamage(effectiveDamage, attacker, targetPosition);
    } else if (targetMesh.userData.resource) {
      targetName = targetMesh.userData.resource;
      targetId = targetMesh.userData.id || targetMesh.uuid;
      const currentHealth = targetMesh.userData.health as number;
      const maxHealth = targetMesh.userData.maxHealth as number;

      if (currentHealth > 0) {
        const newHealth = Math.max(0, currentHealth - effectiveDamage);
        targetMesh.userData.health = newHealth;

        if (newHealth <= 0) {
          this.handleResourceDepletion(attacker, targetMesh, targetPosition);
        }
      }
    } else {
      console.warn(
        `Attack target is neither Entity nor known Resource: ${targetMesh.name}`
      );
      return;
    }

    const numberSpawnPosition = attackerPosition.add(
      new Vector3(0, attacker.userData.height! * 0.8, 0)
    );
    this.game.notificationManager?.createAttackNumberSprite(
      effectiveDamage,
      numberSpawnPosition
    );
    this.game.spawnParticleEffect(targetPosition, "red");

    const currentTargetId = this.getTargetId(target);
    if (attacker.lastAttackedTargetId !== currentTargetId) {
      this.game.logEvent(
        attacker,
        "attack_hit",
        `${attacker.name} attacked ${targetName} for ${effectiveDamage.toFixed(0)} damage.`,
        target,
        { damage: effectiveDamage },
        attacker.mesh!.position
      );
      attacker.lastAttackedTargetId = currentTargetId;
    }

    if (attacker.aiController) {
      attacker.aiController.lastLoggedAttackTargetId = currentTargetId;
    }
  }

  private handleResourceDepletion(
    gatherer: Entity,
    resourceMesh: Object3D,
    position: Vector3
  ): void {
    const resource = resourceMesh.userData.resource as string;
    const maxHealth = resourceMesh.userData.maxHealth as number;
    let itemsToGrant: { id: string; count: number }[] = [];

    if (resource === "wood")
      itemsToGrant.push({ id: "wood", count: MathUtils.randInt(1, 3) });
    else if (resource === "stone")
      itemsToGrant.push({ id: "stone", count: MathUtils.randInt(1, 2) });
    else if (resource === "herb") itemsToGrant.push({ id: "herb", count: 1 });

    if (gatherer instanceof Character && gatherer.inventory) {
      for (const itemGrant of itemsToGrant) {
        const addResult = gatherer.inventory.addItem(
          itemGrant.id,
          itemGrant.count
        );
        if (addResult && addResult.added > 0) {
          if (gatherer === this.game.activeCharacter) {
            this.game.notificationManager?.createItemAddedSprite(
              itemGrant.id,
              addResult.added,
              position
            );
          }
          this.game.logEvent(
            gatherer,
            "gather_complete",
            `${gatherer.name} gathered ${addResult.totalAdded} ${itemGrant.id}.`,
            resourceMesh.userData.name || resourceMesh.userData.id,
            { resource: itemGrant.id },
            position
          );
        } else {
          this.game.logEvent(
            gatherer,
            "gather_fail",
            `${gatherer.name}'s inventory full, could not gather ${itemGrant.count} ${itemGrant.id}.`,
            resourceMesh.userData.name || resourceMesh.userData.id,
            { resource: itemGrant.id },
            position
          );
          break;
        }
      }
    } else if (gatherer instanceof Animal) {
      this.game.logEvent(
        gatherer,
        "destroy_resource",
        `${gatherer.name} destroyed a ${resource}.`,
        resourceMesh.userData.name || resourceMesh.userData.id,
        { resource: resource },
        position
      );
    }

    if (
      resourceMesh.userData.resource === "wood" &&
      resourceMesh.userData.mixer &&
      resourceMesh.userData.fallAction &&
      !resourceMesh.userData.isFalling
    ) {
      resourceMesh.userData.isFalling = true;
      resourceMesh.userData.fallAction.reset().play();
    } else if (resourceMesh.userData.isDepletable) {
      resourceMesh.userData.isInteractable = false;
      resourceMesh.userData.isCollidable = false;
      resourceMesh.visible = false;
      const respawnTime = resourceMesh.userData.respawnTime || 15000;
      setTimeout(() => {
        if (resourceMesh && resourceMesh.userData) {
          resourceMesh.userData.isInteractable = true;
          resourceMesh.userData.isCollidable = true;
          resourceMesh.userData.health = maxHealth;
          resourceMesh.visible = true;
        }
      }, respawnTime);
    }
  }

  update(deltaTime: number): void {
    // No per-frame updates needed
  }
}
