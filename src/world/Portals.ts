// src/world/Portals.ts
import {
  Scene,
  Group,
  Vector3,
  Color,
  TorusGeometry,
  MeshPhongMaterial,
  CircleGeometry,
  MeshBasicMaterial,
  DoubleSide,
  CanvasTexture,
  PlaneGeometry,
  BufferGeometry,
  BufferAttribute,
  PointsMaterial,
  Points,
  Box3,
  ColorRepresentation,
  Mesh, // Import Mesh
} from "three";
import { getTerrainHeight } from "../utils";
import {
  Colors,
  PORTAL_RADIUS,
  PORTAL_TUBE,
  PORTAL_PARTICLE_COUNT,
  PORTAL_PARTICLE_SIZE,
  PORTAL_PARTICLE_OPACITY,
  PORTAL_LABEL_WIDTH_FACTOR,
  PORTAL_LABEL_HEIGHT,
  PORTAL_LABEL_OFFSET_Y,
  PORTAL_SPAWN_HEIGHT_OFFSET,
} from "../config";

// Creates the visual elements of a portal (torus, disc, particles, label).
export function createPortalGroup(
  scene: Scene,
  position: Vector3,
  color: ColorRepresentation,
  labelText: string | null,
  rotationY: number = 0
): { group: Group; particlesGeo: BufferGeometry | null; boundingBox: Box3 } {
  const group = new Group();
  // Place portal slightly above terrain
  group.position.copy(position);
  group.position.y =
    getTerrainHeight(scene, position.x, position.z) +
    PORTAL_SPAWN_HEIGHT_OFFSET;
  group.rotation.y = rotationY;

  const radius = PORTAL_RADIUS;
  const tube = PORTAL_TUBE;
  const portalColor = new Color(color);

  // Torus Ring
  const torusGeo = new TorusGeometry(radius, tube, 16, 100);
  const torusMat = new MeshPhongMaterial({
    color: portalColor,
    emissive: portalColor, // Make it glow
    emissiveIntensity: 0.8,
    transparent: true,
    opacity: 0.8,
  });
  group.add(new Mesh(torusGeo, torusMat));

  // Inner Disc (Swirl effect placeholder)
  const innerGeo = new CircleGeometry(radius - tube / 2, 32); // Slightly larger than inner radius
  const innerMat = new MeshBasicMaterial({
    color: portalColor,
    transparent: true,
    opacity: 0.5,
    side: DoubleSide,
  });
  group.add(new Mesh(innerGeo, innerMat));

  // Label (Optional)
  if (labelText) {
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d");
    if (context) {
      // Dynamic sizing based on text length? For now, fixed size.
      canvas.width = 512;
      canvas.height = 64;
      context.fillStyle = `#${portalColor.getHexString()}`; // Use portal color for text
      context.font = "bold 24px Arial";
      context.textAlign = "center";
      context.textBaseline = "middle";
      context.fillText(labelText, canvas.width / 2, canvas.height / 2);

      const texture = new CanvasTexture(canvas);
      texture.needsUpdate = true;

      const labelWidth = radius * PORTAL_LABEL_WIDTH_FACTOR;
      const labelGeo = new PlaneGeometry(labelWidth, PORTAL_LABEL_HEIGHT);
      const labelMat = new MeshBasicMaterial({
        map: texture,
        transparent: true,
        side: DoubleSide,
        depthTest: false, // Render label on top
      });
      const label = new Mesh(labelGeo, labelMat);
      label.position.y = radius + PORTAL_LABEL_OFFSET_Y; // Position above torus
      // Make label face forward relative to portal rotation (if needed)
      // label.rotation.y = -rotationY; // Counter-rotate if group rotation affects it undesirably
      group.add(label);
    }
  }

  // Particles
  const { geometry: particlesGeo, system: particleSystem } =
    createPortalParticles(radius, tube, portalColor);
  group.add(particleSystem);

  scene.add(group);

  // Calculate bounding box after adding all elements
  const boundingBox = new Box3().setFromObject(group);

  return { group, particlesGeo, boundingBox };
}

// Creates the particle system for a portal.
function createPortalParticles(
  radius: number,
  tube: number,
  color: Color
): { geometry: BufferGeometry; system: Points } {
  const count = PORTAL_PARTICLE_COUNT;
  const geometry = new BufferGeometry();
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const randomFactors = new Float32Array(count); // Store random factor for animation

  const baseColor = color;

  for (let i = 0; i < count; i++) {
    const idx = i * 3;
    const angle = Math.random() * Math.PI * 2;
    // Distribute particles within the torus volume
    const r = radius + (Math.random() - 0.5) * tube * 1.5; // Spread slightly beyond tube
    const particleRadius = Math.random() * tube * 0.5; // Distance from the torus center circle

    // Position around the torus ring
    positions[idx] = Math.cos(angle) * r; // X on the ring plane
    positions[idx + 1] = Math.sin(angle) * particleRadius; // Y offset from ring plane
    positions[idx + 2] = Math.sin(angle) * r; // Z on the ring plane

    // Add slight random color variation
    colors[idx] = baseColor.r + (Math.random() - 0.5) * 0.2;
    colors[idx + 1] = baseColor.g + (Math.random() - 0.5) * 0.2;
    colors[idx + 2] = baseColor.b + (Math.random() - 0.5) * 0.2;

    randomFactors[i] = Math.random(); // Store random factor for animation offset
  }
  geometry.setAttribute("position", new BufferAttribute(positions, 3));
  geometry.setAttribute("color", new BufferAttribute(colors, 3));
  geometry.setAttribute("randomFactor", new BufferAttribute(randomFactors, 1)); // Add random factor

  const material = new PointsMaterial({
    size: PORTAL_PARTICLE_SIZE,
    vertexColors: true,
    transparent: true,
    opacity: PORTAL_PARTICLE_OPACITY,
    depthWrite: false, // Prevent particles from obscuring things behind them incorrectly
  });
  const system = new Points(geometry, material);
  return { geometry, system };
}

// Animates the portal particles.
export function animatePortalParticles(
  particlesGeo: BufferGeometry | null,
  elapsedTime: number
): void {
  if (!particlesGeo) return;

  const positions = particlesGeo.attributes.position.array as Float32Array;
  const randomFactors = particlesGeo.attributes.randomFactor?.array as
    | Float32Array
    | undefined;

  if (!randomFactors) return; // Need random factors for this animation

  const speed = 0.5; // Speed of particle movement/oscillation

  for (let i = 0; i < positions.length / 3; i++) {
    const idx = i * 3;
    const random = randomFactors[i];

    // Example animation: Oscillate Y position based on time and random factor
    // Calculate current angle based on original XZ position
    const currentAngle = Math.atan2(positions[idx + 2], positions[idx]);
    // Add rotation over time
    const rotatedAngle =
      currentAngle + elapsedTime * speed * (0.5 + random * 0.5); // Vary speed slightly
    const radius = Math.sqrt(positions[idx] ** 2 + positions[idx + 2] ** 2); // Original radius

    // Update X and Z based on rotated angle
    positions[idx] = Math.cos(rotatedAngle) * radius;
    positions[idx + 2] = Math.sin(rotatedAngle) * radius;

    // Oscillate Y position (height)
    positions[idx + 1] +=
      Math.sin(elapsedTime * speed * 2 + random * Math.PI * 2) * 0.01; // Adjust amplitude/frequency
  }
  particlesGeo.attributes.position.needsUpdate = true;
}
