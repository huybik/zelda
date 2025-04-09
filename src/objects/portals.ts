// File: /src/objects/portals.ts
import * as THREE from "three";
import { getTerrainHeight } from "../core/utils";
import { Game } from "../main";
import { Vector3 } from "three";

export function createExitPortal(scene: THREE.Scene, game: Game): void {
  const exitPortalGroup = new THREE.Group();
  exitPortalGroup.position.set(-30, 10, -40);
  exitPortalGroup.rotation.x = 0;
  exitPortalGroup.rotation.y = Math.PI / 4;
  exitPortalGroup.position.y = getTerrainHeight(
    scene,
    exitPortalGroup.position.x,
    exitPortalGroup.position.z
  );
  exitPortalGroup.position.y += 5;
  const portalRadius = 5;
  const portalTube = 1.5;
  const exitPortalGeometry = new THREE.TorusGeometry(
    portalRadius,
    portalTube,
    16,
    100
  );
  const exitPortalMaterial = new THREE.MeshPhongMaterial({
    color: 0x00ff00,
    emissive: 0x00ff00,
    transparent: true,
    opacity: 0.8,
  });
  const exitPortal = new THREE.Mesh(exitPortalGeometry, exitPortalMaterial);
  exitPortalGroup.add(exitPortal);
  const exitPortalInnerGeometry = new THREE.CircleGeometry(
    portalRadius - portalTube,
    32
  );
  const exitPortalInnerMaterial = new THREE.MeshBasicMaterial({
    color: 0x00ff00,
    transparent: true,
    opacity: 0.5,
    side: THREE.DoubleSide,
  });
  const exitPortalInner = new THREE.Mesh(
    exitPortalInnerGeometry,
    exitPortalInnerMaterial
  );
  exitPortalGroup.add(exitPortalInner);
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");
  if (context) {
    canvas.width = 512;
    canvas.height = 64;
    context.fillStyle = "#00ff00";
    context.font = "bold 16px Arial";
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillText("VIBEVERSE PORTAL", canvas.width / 2, canvas.height / 2);
    const texture = new THREE.CanvasTexture(canvas);
    const labelGeometry = new THREE.PlaneGeometry(portalRadius * 2, 5);
    const labelMaterial = new THREE.MeshBasicMaterial({
      map: texture,
      transparent: true,
      side: THREE.DoubleSide,
    });
    const label = new THREE.Mesh(labelGeometry, labelMaterial);
    label.position.y = portalRadius + 2;
    exitPortalGroup.add(label);
  }
  const exitPortalParticleCount = 1000;
  const exitPortalParticles = new THREE.BufferGeometry();
  const exitPortalPositions = new Float32Array(exitPortalParticleCount * 3);
  const exitPortalColors = new Float32Array(exitPortalParticleCount * 3);
  for (let i = 0; i < exitPortalParticleCount * 3; i += 3) {
    const angle = Math.random() * Math.PI * 2;
    const radius = portalRadius + (Math.random() - 0.5) * portalTube * 2;
    exitPortalPositions[i] = Math.cos(angle) * radius;
    exitPortalPositions[i + 1] = Math.sin(angle) * radius;
    exitPortalPositions[i + 2] = (Math.random() - 0.5) * 4;
    exitPortalColors[i] = 0;
    exitPortalColors[i + 1] = 0.8 + Math.random() * 0.2;
    exitPortalColors[i + 2] = 0;
  }
  exitPortalParticles.setAttribute(
    "position",
    new THREE.BufferAttribute(exitPortalPositions, 3)
  );
  exitPortalParticles.setAttribute(
    "color",
    new THREE.BufferAttribute(exitPortalColors, 3)
  );
  const exitPortalParticleMaterial = new THREE.PointsMaterial({
    size: 0.2,
    vertexColors: true,
    transparent: true,
    opacity: 0.6,
  });
  const exitPortalParticleSystem = new THREE.Points(
    exitPortalParticles,
    exitPortalParticleMaterial
  );
  exitPortalGroup.add(exitPortalParticleSystem);

  // Add userData for Minimap
  exitPortalGroup.userData = {
    ...exitPortalGroup.userData,
    isPortal: true,
    name: "Exit Portal",
    color: "#00ff00",
    minimapLabel: "Portal",
  };

  scene.add(exitPortalGroup);
  game.exitPortalGroup = exitPortalGroup;
  game.exitPortalBox = new THREE.Box3().setFromObject(exitPortalGroup);
  game.exitPortalParticles = exitPortalParticles;
  game.exitPortalInnerMaterial = exitPortalInnerMaterial;
}

export function createStartPortal(scene: THREE.Scene, game: Game): void {
  if (!game.startPortalRefUrl) return;
  const spawnPoint = new Vector3(0, 0, 5);
  spawnPoint.y = getTerrainHeight(scene, spawnPoint.x, spawnPoint.z);
  const startPortalGroup = new THREE.Group();
  startPortalGroup.position.copy(spawnPoint);
  startPortalGroup.position.y += 5;
  startPortalGroup.rotation.x = 0;
  startPortalGroup.rotation.y = -Math.PI / 2;
  const portalRadius = 10;
  const portalTube = 1.5;
  const startPortalGeometry = new THREE.TorusGeometry(
    portalRadius,
    portalTube,
    16,
    100
  );
  const startPortalMaterial = new THREE.MeshPhongMaterial({
    color: 0xff0000,
    emissive: 0xff0000,
    transparent: true,
    opacity: 0.8,
  });
  const startPortal = new THREE.Mesh(startPortalGeometry, startPortalMaterial);
  startPortalGroup.add(startPortal);
  const startPortalInnerGeometry = new THREE.CircleGeometry(
    portalRadius - portalTube,
    32
  );
  const startPortalInnerMaterial = new THREE.MeshBasicMaterial({
    color: 0xff0000,
    transparent: true,
    opacity: 0.5,
    side: THREE.DoubleSide,
  });
  const startPortalInner = new THREE.Mesh(
    startPortalInnerGeometry,
    startPortalInnerMaterial
  );
  startPortalGroup.add(startPortalInner);
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");
  if (context) {
    canvas.width = 512;
    canvas.height = 64;
    context.fillStyle = "#ff0000";
    context.font = "bold 28px Arial";
    context.textAlign = "center";
    context.textBaseline = "middle";
    let displayUrl = game.startPortalRefUrl;
    try {
      const urlObj = new URL(
        displayUrl.startsWith("http") ? displayUrl : "https://" + displayUrl
      );
      displayUrl = urlObj.hostname;
    } catch (e) {}
    context.fillText(
      `Return to: ${displayUrl}`,
      canvas.width / 2,
      canvas.height / 2
    );
    const texture = new THREE.CanvasTexture(canvas);
    const labelGeometry = new THREE.PlaneGeometry(portalRadius * 2, 5);
    const labelMaterial = new THREE.MeshBasicMaterial({
      map: texture,
      transparent: true,
      side: THREE.DoubleSide,
    });
    const label = new THREE.Mesh(labelGeometry, labelMaterial);
    label.position.y = portalRadius + 2;
    startPortalGroup.add(label);
  }
  const startPortalParticleCount = 1000;
  const startPortalParticles = new THREE.BufferGeometry();
  const startPortalPositions = new Float32Array(startPortalParticleCount * 3);
  const startPortalColors = new Float32Array(startPortalParticleCount * 3);
  for (let i = 0; i < startPortalParticleCount * 3; i += 3) {
    const angle = Math.random() * Math.PI * 2;
    const radius = portalRadius + (Math.random() - 0.5) * portalTube * 2;
    startPortalPositions[i] = Math.cos(angle) * radius;
    startPortalPositions[i + 1] = Math.sin(angle) * radius;
    startPortalPositions[i + 2] = (Math.random() - 0.5) * 4;
    startPortalColors[i] = 0.8 + Math.random() * 0.2;
    startPortalColors[i + 1] = 0;
    startPortalColors[i + 2] = 0;
  }
  startPortalParticles.setAttribute(
    "position",
    new THREE.BufferAttribute(startPortalPositions, 3)
  );
  startPortalParticles.setAttribute(
    "color",
    new THREE.BufferAttribute(startPortalColors, 3)
  );
  const startPortalParticleMaterial = new THREE.PointsMaterial({
    size: 0.2,
    vertexColors: true,
    transparent: true,
    opacity: 0.6,
  });
  const startPortalParticleSystem = new THREE.Points(
    startPortalParticles,
    startPortalParticleMaterial
  );
  startPortalGroup.add(startPortalParticleSystem);

  // Add userData for Minimap
  startPortalGroup.userData = {
    ...startPortalGroup.userData,
    isPortal: true,
    name: "Start Portal",
    color: "#ff0000",
    minimapLabel: "Portal",
  };

  scene.add(startPortalGroup);
  game.startPortalGroup = startPortalGroup;
  game.startPortalBox = new THREE.Box3().setFromObject(startPortalGroup);
  game.startPortalParticles = startPortalParticles;
  game.startPortalInnerMaterial = startPortalInnerMaterial;
}
