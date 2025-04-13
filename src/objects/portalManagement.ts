// File: /src/objects/portalManager.ts
import * as THREE from "three";
import { Game } from "../main";
import { createExitPortal, createStartPortal } from "../models/portals";

// Define the Portal interface to represent portal properties
interface Portal {
  group: THREE.Group;
  box: THREE.Box3;
  particles: THREE.BufferGeometry;
  innerMaterial: THREE.MeshBasicMaterial;
  refUrl?: string; // Optional for start portal
  originalParams?: URLSearchParams; // Optional for start portal
}

export class PortalManager {
  private game: Game;
  public exitPortal: Portal | null = null;
  public startPortal: Portal | null = null;

  constructor(game: Game) {
    this.game = game;
  }

  /**
   * Initializes the exit and start portals based on game state.
   * @param scene The THREE.Scene to add portals to
   * @param hasEnteredFromPortal Whether the player entered via a portal
   * @param startPortalRefUrl The reference URL for the start portal
   * @param startPortalOriginalParams URL parameters for the start portal
   */
  public initPortals(
    scene: THREE.Scene,
    hasEnteredFromPortal: boolean,
    startPortalRefUrl: string | null,
    startPortalOriginalParams: URLSearchParams | null
  ): void {
    this.exitPortal = createExitPortal(scene);
    if (
      hasEnteredFromPortal &&
      startPortalRefUrl !== null &&
      startPortalOriginalParams !== null
    ) {
      this.startPortal = createStartPortal(
        scene,
        startPortalRefUrl,
        startPortalOriginalParams
      );
    }
  }

  /**
   * Animates the particle effects of both portals.
   */
  public animatePortals(): void {
    if (this.exitPortal && this.exitPortal.particles) {
      const positions = this.exitPortal.particles.attributes.position
        .array as Float32Array;
      for (let i = 0; i < positions.length; i += 3) {
        positions[i + 1] += 0.05 * Math.sin(Date.now() * 0.001 + i);
      }
      this.exitPortal.particles.attributes.position.needsUpdate = true;
    }
    if (this.startPortal && this.startPortal.particles) {
      const positions = this.startPortal.particles.attributes.position
        .array as Float32Array;
      for (let i = 0; i < positions.length; i += 3) {
        positions[i + 1] += 0.05 * Math.sin(Date.now() * 0.001 + i);
      }
      this.startPortal.particles.attributes.position.needsUpdate = true;
    }
  }

  /**
   * Checks for player collisions with portals and handles navigation.
   */
  public checkPortalCollisions(): void {
    const player = this.game.activeCharacter;
    if (!player || !player.mesh) return;
    const playerBox = new THREE.Box3().setFromObject(player.mesh);
    const playerCenter = playerBox.getCenter(new THREE.Vector3());

    // Check exit portal collision
    if (this.exitPortal) {
      const portalCenter = this.exitPortal.box.getCenter(new THREE.Vector3());
      const portalDistance = playerCenter.distanceTo(portalCenter);
      const interactionThreshold = 15;
      if (portalDistance < interactionThreshold) {
        const currentSpeed = player.velocity.length();
        const selfUsername = player.name;
        const ref = window.location.href;
        const newParams = new URLSearchParams();
        newParams.append("username", selfUsername);
        newParams.append("color", "white");
        newParams.append("speed", currentSpeed.toFixed(2));
        newParams.append("ref", ref);
        newParams.append("speed_x", player.velocity.x.toFixed(2));
        newParams.append("speed_y", player.velocity.y.toFixed(2));
        newParams.append("speed_z", player.velocity.z.toFixed(2));
        const paramString = newParams.toString();
        const nextPage =
          "http://portal.pieter.com" + (paramString ? "?" + paramString : "");
        if (playerBox.intersectsBox(this.exitPortal.box)) {
          window.location.href = nextPage;
        }
      }
    }

    // Check start portal collision
    if (
      this.startPortal &&
      this.startPortal.refUrl &&
      this.startPortal.originalParams
    ) {
      const portalCenter = this.startPortal.box.getCenter(new THREE.Vector3());
      const portalDistance = playerCenter.distanceTo(portalCenter);
      const interactionThreshold = 15;
      if (
        portalDistance < interactionThreshold &&
        playerBox.intersectsBox(this.startPortal.box)
      ) {
        let url = this.startPortal.refUrl;
        if (!url.startsWith("http://") && !url.startsWith("https://")) {
          url = "https://" + url;
        }
        const newParams = new URLSearchParams();
        for (const [key, value] of this.startPortal.originalParams) {
          if (key !== "ref" && key !== "portal") {
            newParams.append(key, value);
          }
        }
        const paramString = newParams.toString();
        window.location.href = url + (paramString ? "?" + paramString : "");
      }
    }
  }
}
