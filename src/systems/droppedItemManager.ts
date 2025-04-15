// src/systems/droppedItemManager.ts
import * as THREE from "three";
import { Vector3 } from "three";
import { Game } from "../main";
import { Character } from "../entities/character";
import { getItemDefinition } from "../core/items";
import { getTerrainHeight } from "../core/utils";

interface DroppedItemData {
  id: string; // Unique ID for this dropped item instance
  itemId: string;
  count: number;
  orbMesh: THREE.Mesh;
  particleSystem: THREE.Points;
  light: THREE.PointLight;
  startTime: number;
  floatOffset: number; // For sine wave animation
  collectionCooldown: number; // Prevent instant re-collection if dropped by player
}

export class DroppedItemManager {
  private game: Game;
  private activeItems: Map<string, DroppedItemData> = new Map();
  private readonly orbRadius = 0.25;
  private readonly particleCount = 50;
  private readonly particleSize = 0.05;
  private readonly particleSpread = 0.5;
  private readonly floatFrequency = 1.5;
  private readonly floatAmplitude = 0.15;
  private readonly collectionRadiusSq = 1.5 * 1.5; // Squared radius for efficiency
  private readonly despawnTime = 60; // Seconds until item despawns
  private readonly initialCollectionCooldown = 1.0; // Seconds before item can be collected

  constructor(game: Game) {
    this.game = game;
  }

  /**
   * Creates a dropped item orb in the world.
   * @param itemId The ID of the item to drop.
   * @param count The number of items in the stack.
   * @param position The world position to drop the item at.
   */
  createDroppedItem(itemId: string, count: number, position: Vector3): void {
    if (!this.game.scene || count <= 0) return;

    const definition = getItemDefinition(itemId);
    if (!definition) {
      console.warn(`Cannot drop item: Definition not found for ID ${itemId}`);
      return;
    }

    const itemColor = definition.color ?? 0xffffff; // Use defined color or white fallback

    // --- Orb Mesh ---
    const orbGeometry = new THREE.SphereGeometry(this.orbRadius, 16, 8);
    const orbMaterial = new THREE.MeshPhongMaterial({
      color: itemColor,
      emissive: new THREE.Color(itemColor).multiplyScalar(0.5),
      transparent: true,
      opacity: 0.7,
      shininess: 50,
    });
    const orbMesh = new THREE.Mesh(orbGeometry, orbMaterial);

    // --- Particle System ---
    const particles = new THREE.BufferGeometry();
    const positions = new Float32Array(this.particleCount * 3);
    const colors = new Float32Array(this.particleCount * 3);
    const velocities = new Float32Array(this.particleCount * 3); // Store velocity for animation
    const baseColor = new THREE.Color(itemColor);

    for (let i = 0; i < this.particleCount; i++) {
      const i3 = i * 3;
      // Initial position spread around the orb
      positions[i3] = (Math.random() - 0.5) * this.particleSpread;
      positions[i3 + 1] = (Math.random() - 0.5) * this.particleSpread;
      positions[i3 + 2] = (Math.random() - 0.5) * this.particleSpread;

      // Store initial velocity (e.g., outward drift)
      velocities[i3] = (Math.random() - 0.5) * 0.1;
      velocities[i3 + 1] = (Math.random() - 0.5) * 0.1 + 0.05; // Slight upward bias
      velocities[i3 + 2] = (Math.random() - 0.5) * 0.1;

      // Color with slight variation
      const particleColor = baseColor.clone();
      particleColor.offsetHSL(
        (Math.random() - 0.5) * 0.1, // Hue variation
        (Math.random() - 0.5) * 0.2, // Saturation variation
        (Math.random() - 0.5) * 0.2 // Lightness variation
      );
      colors[i3] = particleColor.r;
      colors[i3 + 1] = particleColor.g;
      colors[i3 + 2] = particleColor.b;
    }
    particles.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    particles.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    particles.userData.velocities = velocities; // Attach velocities to geometry

    const particleMaterial = new THREE.PointsMaterial({
      size: this.particleSize,
      vertexColors: true,
      transparent: true,
      opacity: 0.8,
      sizeAttenuation: true,
      depthWrite: false, // Prevent particles obscuring orb too much
    });
    const particleSystem = new THREE.Points(particles, particleMaterial);

    // --- Point Light ---
    const light = new THREE.PointLight(itemColor, 0.8, 2); // color, intensity, distance
    light.position.set(0, 0.1, 0); // Slightly above orb center

    // --- Group and Position ---
    const itemGroup = new THREE.Group();
    itemGroup.add(orbMesh);
    itemGroup.add(particleSystem);
    itemGroup.add(light);

    // Adjust position based on terrain height + float offset
    const terrainY = getTerrainHeight(this.game.scene, position.x, position.z);
    const initialY = terrainY + this.orbRadius + this.floatAmplitude; // Start at peak float
    itemGroup.position.set(position.x, initialY, position.z);

    this.game.scene.add(itemGroup);

    // --- Store Data ---
    const droppedItemId = THREE.MathUtils.generateUUID();
    const droppedItemData: DroppedItemData = {
      id: droppedItemId,
      itemId: itemId,
      count: count,
      orbMesh: orbMesh, // Keep reference for potential interactions
      particleSystem: particleSystem,
      light: light,
      startTime: this.game.clock!.elapsedTime,
      floatOffset: Math.random() * Math.PI * 2, // Randomize starting float phase
      collectionCooldown:
        this.game.clock!.elapsedTime + this.initialCollectionCooldown,
    };
    itemGroup.userData.droppedItemId = droppedItemId; // Link group to data ID
    this.activeItems.set(droppedItemId, droppedItemData);
  }

  update(deltaTime: number): void {
    if (!this.game.clock || !this.game.activeCharacter) return;

    const elapsedTime = this.game.clock.elapsedTime;
    const itemsToRemove: string[] = [];

    this.activeItems.forEach((data, id) => {
      const itemGroup = this.game.scene?.getObjectByProperty(
        "droppedItemId",
        id
      ) as THREE.Group | undefined;
      if (!itemGroup) {
        itemsToRemove.push(id); // Group missing, mark for removal
        return;
      }

      // --- Despawn Check ---
      if (elapsedTime - data.startTime > this.despawnTime) {
        itemsToRemove.push(id);
        return;
      }

      // --- Floating Animation ---
      const terrainY = getTerrainHeight(
        this.game.scene!,
        itemGroup.position.x,
        itemGroup.position.z
      );
      const floatY =
        Math.sin(elapsedTime * this.floatFrequency + data.floatOffset) *
        this.floatAmplitude;
      itemGroup.position.y =
        terrainY + this.orbRadius + this.floatAmplitude + floatY;

      // --- Particle Animation ---
      const positions = data.particleSystem.geometry.attributes.position
        .array as Float32Array;
      const velocities = data.particleSystem.geometry.userData
        .velocities as Float32Array;
      for (let i = 0; i < this.particleCount; i++) {
        const i3 = i * 3;
        positions[i3] += velocities[i3] * deltaTime;
        positions[i3 + 1] += velocities[i3 + 1] * deltaTime;
        positions[i3 + 2] += velocities[i3 + 2] * deltaTime;

        // Optional: Reset particles that drift too far, or fade them
        const distSq =
          positions[i3] ** 2 + positions[i3 + 1] ** 2 + positions[i3 + 2] ** 2;
        if (distSq > this.particleSpread * this.particleSpread * 1.5) {
          // Reset to center-ish
          positions[i3] = (Math.random() - 0.5) * 0.1;
          positions[i3 + 1] = (Math.random() - 0.5) * 0.1;
          positions[i3 + 2] = (Math.random() - 0.5) * 0.1;
        }
      }
      data.particleSystem.geometry.attributes.position.needsUpdate = true;

      // --- Collection Check ---
      if (
        elapsedTime >= data.collectionCooldown &&
        !this.game.activeCharacter!.isDead
      ) {
        const playerPos = this.game.activeCharacter!.mesh!.position;
        const itemPos = itemGroup.position;
        const distanceSq = playerPos.distanceToSquared(itemPos);

        if (distanceSq < this.collectionRadiusSq) {
          const addResult = this.game.activeCharacter!.inventory?.addItem(
            data.itemId,
            data.count
          );
          if (addResult && addResult.totalAdded > 0) {
            // Item collected successfully
            this.game.notificationManager?.createItemAddedSprite(
              data.itemId,
              addResult.totalAdded, // Show how many were actually added
              itemPos.clone().add(new Vector3(0, 0.5, 0)) // Position above orb
            );
            this.game.logEvent(
              this.game.activeCharacter!,
              "collect_item",
              `Collected ${addResult.totalAdded}x ${data.itemId}`,
              undefined,
              { item: data.itemId, count: addResult.totalAdded },
              playerPos
            );
            itemsToRemove.push(id); // Mark for removal
          } else {
            // Inventory full or other add error
            if (addResult?.totalAdded === 0 && addResult.added === 0) {
              // Only show "Inventory Full" if truly no space
              this.game.notificationManager?.createItemAddedSprite(
                "Inventory Full",
                0, // Special case for message
                playerPos.clone().add(new Vector3(0, 1.5, 0))
              );
              // Prevent spamming "Inventory Full" by adding a small cooldown?
              // Or maybe just don't try to collect again for a short time.
              data.collectionCooldown = elapsedTime + 0.5; // Short delay before trying again
            }
          }
        }
      }
    });

    // --- Remove Collected/Despawned Items ---
    itemsToRemove.forEach((id) => {
      this.removeDroppedItem(id);
    });
  }

  private removeDroppedItem(id: string): void {
    const data = this.activeItems.get(id);
    if (!data || !this.game.scene) return;

    const itemGroup = this.game.scene.getObjectByProperty("droppedItemId", id);
    if (itemGroup) {
      // Dispose geometries and materials
      itemGroup.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          child.geometry?.dispose();
          if (Array.isArray(child.material)) {
            child.material.forEach((mat) => mat.dispose());
          } else {
            child.material?.dispose();
          }
        } else if (child instanceof THREE.Points) {
          child.geometry?.dispose();
          child.material?.dispose();
        } else if (child instanceof THREE.PointLight) {
          child.dispose(); // Dispose light
        }
      });
      this.game.scene.remove(itemGroup);
    }

    this.activeItems.delete(id);
    console.log(`Removed dropped item: ${data.itemId} (ID: ${id})`);
  }

  dispose(): void {
    // Remove all active items when game stops/manager is destroyed
    this.activeItems.forEach((_, id) => {
      this.removeDroppedItem(id);
    });
    this.activeItems.clear();
  }
}
