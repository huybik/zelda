import * as THREE from "three";
import { Game } from "../main";

export function spawnParticleEffect(
  game: Game,
  position: THREE.Vector3,
  colorName: "red" | "green"
): void {
  if (!game.scene || !game.clock) return;
  const particleCount = 10;
  const particleSize = 0.07;
  const effectDuration = 1;
  const spreadRadius = 0.3;
  const particleSpeed = 1.5;
  const color = colorName === "red" ? 0xff0000 : 0x00ff00;
  const effectGroup = new THREE.Group();
  effectGroup.position.copy(position);
  const geometry = new THREE.SphereGeometry(particleSize, 4, 2);
  for (let i = 0; i < particleCount; i++) {
    const material = new THREE.MeshBasicMaterial({
      color: color,
      transparent: true,
      opacity: 1.0,
    });
    const particle = new THREE.Mesh(geometry, material);
    const initialOffset = new THREE.Vector3(
      (Math.random() - 0.5) * spreadRadius,
      (Math.random() - 0.5) * spreadRadius,
      (Math.random() - 0.5) * spreadRadius
    );
    particle.position.copy(initialOffset);
    particle.userData.velocity = initialOffset
      .clone()
      .normalize()
      .multiplyScalar(particleSpeed * (0.5 + Math.random() * 0.5));
    effectGroup.add(particle);
  }
  effectGroup.userData.startTime = game.clock.elapsedTime;
  effectGroup.userData.duration = effectDuration;
  game.scene.add(effectGroup);
  game.particleEffects.push(effectGroup);
}

export function updateParticleEffects(game: Game, elapsedTime: number): void {
  if (!game.scene || !game.clock) return;
  const effectsToRemove: THREE.Group[] = [];
  const particleDeltaTime = game.isPaused ? 0 : game.clock.getDelta();
  for (let i = game.particleEffects.length - 1; i >= 0; i--) {
    const effect = game.particleEffects[i];
    const effectElapsedTime = elapsedTime - effect.userData.startTime;
    const progress = Math.min(
      1.0,
      effectElapsedTime / effect.userData.duration
    );
    if (progress >= 1.0) {
      effectsToRemove.push(effect);
      game.particleEffects.splice(i, 1);
      continue;
    }
    if (!game.isPaused) {
      effect.children.forEach((particle) => {
        if (particle instanceof THREE.Mesh && particle.userData.velocity) {
          particle.position.addScaledVector(
            particle.userData.velocity,
            particleDeltaTime
          );
        }
      });
    }
    effect.children.forEach((particle) => {
      if (particle instanceof THREE.Mesh) {
        if (Array.isArray(particle.material)) {
          particle.material.forEach((mat) => {
            if (mat instanceof THREE.MeshBasicMaterial) {
              mat.opacity = 1.0 - progress;
              mat.needsUpdate = true;
            }
          });
        } else if (particle.material instanceof THREE.MeshBasicMaterial) {
          particle.material.opacity = 1.0 - progress;
          particle.material.needsUpdate = true;
        }
      }
    });
  }
  effectsToRemove.forEach((effect) => {
    effect.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.geometry?.dispose();
        if (Array.isArray(child.material))
          child.material.forEach((mat) => mat.dispose());
        else child.material?.dispose();
      }
    });
    game.scene!.remove(effect);
  });
}
