// src/ai.ts
import { NPC } from './entities';
import { Vector3, Scene, Object3D, Matrix4, Quaternion } from 'three';
import { UpdateOptions, getTerrainHeight, smoothQuaternionSlerp } from './ultils';

export function updateNPCAI(npc: NPC, deltaTime: number, options: UpdateOptions): void {
  const { player } = options;
  const scene = npc.scene;
  if (!player || !scene) return;

  // Check if player is within interaction distance
  const distanceToPlayer = npc.mesh.position.distanceTo(player.mesh.position);
  if (distanceToPlayer < npc.interactionDistance) {
    if (npc.state !== 'interacting') {
      npc.state = 'interacting';
      npc.velocity.set(0, 0, 0);
      npc.destination = null;
      npc.targetResource = null;
    }
    npc.lookAt(player.mesh.position);
  } else {
    if (npc.state === 'interacting') {
      npc.state = 'idle';
    }
    // Handle NPC behavior based on state
    switch (npc.state) {
      case 'idle':
        handleIdle(npc, deltaTime, scene);
        break;
      case 'roaming':
        handleRoaming(npc, deltaTime, scene);
        break;
      case 'movingToResource':
        handleMovingToResource(npc, deltaTime, scene);
        break;
      case 'gathering':
        handleGathering(npc, deltaTime);
        break;
    }
  }

  // Handle idle looking behavior
  if (npc.state === 'idle') {
    npc.idleTimer -= deltaTime;
    if (npc.idleTimer <= 0) {
      npc.idleTimer = 3 + Math.random() * 4;
      const distanceToPlayerSq = npc.mesh.position.distanceToSquared(player.mesh.position);
      if (distanceToPlayerSq < 15 * 15 && Math.random() < 0.3) {
        npc.targetLookAt.copy(player.mesh.position).setY(npc.mesh.position.y);
        npc.idleLookTarget.copy(npc.targetLookAt);
      } else {
        if (Math.random() < 0.5) {
          const randomAngleOffset = (Math.random() - 0.5) * Math.PI * 1.5;
          const randomDirection = npc.baseForward.clone().applyAxisAngle(new Vector3(0, 1, 0), randomAngleOffset);
          npc.idleLookTarget.copy(npc.mesh.position).addScaledVector(randomDirection, 5);
        } else {
          npc.idleLookTarget.copy(npc.mesh.position).addScaledVector(npc.baseForward, 5);
        }
      }
    }
    // Smoothly rotate towards idleLookTarget
    const targetDirection = npc.idleLookTarget.clone().sub(npc.mesh.position);
    targetDirection.y = 0;
    if (targetDirection.lengthSq() > 0.01) {
      targetDirection.normalize();
      const targetLookAt = npc.mesh.position.clone().add(targetDirection);
      const lookAtMatrix = new Matrix4().lookAt(targetLookAt, npc.mesh.position, npc.mesh.up);
      const targetQuaternion = new Quaternion().setFromRotationMatrix(lookAtMatrix);
      smoothQuaternionSlerp(npc.mesh.quaternion, targetQuaternion, 0.05, deltaTime);
    }
  }
}

function handleIdle(npc: NPC, deltaTime: number, scene: Scene): void {
  npc.actionTimer -= deltaTime;
  if (npc.actionTimer <= 0) {
    npc.actionTimer = 5 + Math.random() * 5; // Reset timer between 5-10 seconds
    // Search for nearby gatherable resources
    const resources = scene.children.filter(child =>
      child.userData.isInteractable &&
      child.userData.interactionType === 'gather' &&
      child.visible &&
      npc.mesh.position.distanceTo(child.position) < npc.searchRadius
    ) as Object3D[];
    if (resources.length > 0) {
      // Find the closest resource
      const closestResource = resources.reduce((closest, current) => {
        const distCurrent = npc.mesh.position.distanceTo(current.position);
        const distClosest = npc.mesh.position.distanceTo(closest.position);
        return distCurrent < distClosest ? current : closest;
      });
      npc.targetResource = closestResource;
      npc.state = 'movingToResource';
    } else {
      // Roam to a random point within roamRadius
      const angle = Math.random() * Math.PI * 2;
      const distance = Math.random() * npc.roamRadius;
      const offset = new Vector3(Math.cos(angle) * distance, 0, Math.sin(angle) * distance);
      npc.destination = npc.homePosition.clone().add(offset);
      npc.state = 'roaming';
    }
  }
}

function handleRoaming(npc: NPC, deltaTime: number, scene: Scene): void {
  if (!npc.destination) {
    npc.state = 'idle';
    return;
  }
  const direction = npc.destination.clone().sub(npc.mesh.position);
  direction.y = 0;
  const distance = direction.length();
  if (distance < 0.5) {
    npc.velocity.set(0, 0, 0);
    npc.state = 'idle';
    return;
  }
  direction.normalize();
  npc.velocity.copy(direction).multiplyScalar(npc.moveSpeed);
  npc.mesh.position.addScaledVector(npc.velocity, deltaTime);
  npc.mesh.position.y = getTerrainHeight(scene, npc.mesh.position.x, npc.mesh.position.z);
  npc.lookAt(npc.destination);
  npc.updateBoundingBox();
}

function handleMovingToResource(npc: NPC, deltaTime: number, scene: Scene): void {
  if (!npc.targetResource || !npc.targetResource.visible || !npc.targetResource.userData.isInteractable) {
    npc.targetResource = null;
    npc.state = 'idle';
    return;
  }
  const direction = npc.targetResource.position.clone().sub(npc.mesh.position);
  direction.y = 0;
  const distance = direction.length();
  if (distance < 1) {
    npc.velocity.set(0, 0, 0);
    npc.lookAt(npc.targetResource.position);
    npc.state = 'gathering';
    npc.gatherTimer = 0;
    npc.gatherDuration = npc.targetResource.userData.gatherTime || 3000;
    return;
  }
  direction.normalize();
  npc.velocity.copy(direction).multiplyScalar(npc.moveSpeed);
  npc.mesh.position.addScaledVector(npc.velocity, deltaTime);
  npc.mesh.position.y = getTerrainHeight(scene, npc.mesh.position.x, npc.mesh.position.z);
  npc.lookAt(npc.targetResource.position);
  npc.updateBoundingBox();
}

function handleGathering(npc: NPC, deltaTime: number): void {
  if (!npc.targetResource || !npc.targetResource.visible || !npc.targetResource.userData.isInteractable) {
    npc.targetResource = null;
    npc.state = 'idle';
    return;
  }
  npc.gatherTimer += deltaTime * 1000; // Convert to milliseconds
  if (npc.gatherTimer >= npc.gatherDuration) {
    const resourceName = npc.targetResource.userData.resource;
    if (resourceName && npc.inventory) {
      npc.inventory.addItem(resourceName, 1); // Add resource to inventory
    }
    // Handle resource depletion if applicable
    if (npc.targetResource.userData.isDepletable) {
      npc.targetResource.visible = false;
      npc.targetResource.userData.isInteractable = false;
      const respawnTime = npc.targetResource.userData.respawnTime || 15000;
      setTimeout(() => {
        if (npc.targetResource) {
          npc.targetResource.visible = true;
          npc.targetResource.userData.isInteractable = true;
        }
      }, respawnTime);
    }
    npc.targetResource = null;
    npc.state = 'idle';
  }
}