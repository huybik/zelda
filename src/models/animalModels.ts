// File: src/models/animalModels.ts
import * as THREE from "three";
import {
  Group,
  Mesh,
  SkinnedMesh,
  Bone,
  Skeleton,
  CylinderGeometry,
  BoxGeometry,
  SphereGeometry,
  MeshLambertMaterial,
  Vector3,
  BufferGeometry,
  Float32BufferAttribute,
  Uint16BufferAttribute,
  ConeGeometry,
} from "three";
import { Colors } from "../core/constants";

// --- Materials ---
const deerFurMaterial = new MeshLambertMaterial({ color: 0x967969 }); // Brownish
const wolfFurMaterial = new MeshLambertMaterial({ color: 0x606060 }); // Grey
const antlerMaterial = new MeshLambertMaterial({ color: 0xd3c5aa }); // Light beige
const noseMaterial = new MeshLambertMaterial({ color: 0x333333 }); // Dark grey/black

// --- Helper Functions ---

function createLimb(
  parentBone: Bone,
  lengths: number[],
  radii: number[],
  names: string[],
  yOffset: number = 0
): Bone[] {
  const bones: Bone[] = [];
  let currentParent = parentBone;
  let totalLength = 0;

  for (let i = 0; i < lengths.length; i++) {
    const bone = new Bone();
    bone.name = names[i];
    bone.position.y = i === 0 ? yOffset : lengths[i - 1]; // Position relative to parent bone end
    currentParent.add(bone);
    bones.push(bone);
    currentParent = bone;
    totalLength += lengths[i];
  }
  return bones;
}

function createQuadrupedSkeleton(): { root: Bone; bones: Bone[] } {
  const allBones: Bone[] = [];

  // Root (Hips)
  const root = new Bone();
  root.name = "Hips";
  allBones.push(root);

  // Spine
  const spineBase = new Bone();
  spineBase.name = "SpineBase";
  spineBase.position.y = 0.1; // Slight offset forward from hips center
  root.add(spineBase);
  allBones.push(spineBase);

  const spineMid = new Bone();
  spineMid.name = "SpineMid";
  spineMid.position.y = 0.5; // Length of lower spine segment
  spineBase.add(spineMid);
  allBones.push(spineMid);

  const spineChest = new Bone();
  spineChest.name = "SpineChest";
  spineChest.position.y = 0.5; // Length of upper spine segment
  spineMid.add(spineChest);
  allBones.push(spineChest);

  // Neck
  const neck = new Bone();
  neck.name = "Neck";
  neck.position.y = 0.1; // Base of neck
  neck.position.z = -0.1; // Slightly forward
  spineChest.add(neck);
  allBones.push(neck);

  // Head
  const head = new Bone();
  head.name = "Head";
  head.position.y = 0.4; // Neck length
  neck.add(head);
  allBones.push(head);

  // Tail (Optional, add if needed)
  const tailBase = new Bone();
  tailBase.name = "TailBase";
  tailBase.position.y = -0.3; // Back from hips center
  root.add(tailBase);
  allBones.push(tailBase);

  const tailMid = new Bone();
  tailMid.name = "TailMid";
  tailMid.position.y = -0.3; // Tail segment length
  tailBase.add(tailMid);
  allBones.push(tailMid);

  const tailEnd = new Bone();
  tailEnd.name = "TailEnd";
  tailEnd.position.y = -0.3; // Tail segment length
  tailMid.add(tailEnd);
  allBones.push(tailEnd);

  // --- Legs ---
  const legYOffset = -0.1; // How far down legs start from hip/shoulder line
  const legXOffset = 0.3; // How far out legs are from center
  const frontLegZOffset = 0.8; // How far forward front legs are from hips
  const hindLegZOffset = 0.0; // Hind legs Z relative to hips

  // Hind Left Leg
  const hindLeftUpLeg = new Bone();
  hindLeftUpLeg.name = "HindLeftUpLeg";
  hindLeftUpLeg.position.set(-legXOffset, legYOffset, hindLegZOffset);
  root.add(hindLeftUpLeg);
  allBones.push(hindLeftUpLeg);
  const hindLeftLegBones = createLimb(
    hindLeftUpLeg,
    [0.5, 0.4],
    [0.1, 0.08],
    ["HindLeftLowLeg", "HindLeftFoot"]
  );
  allBones.push(...hindLeftLegBones);

  // Hind Right Leg
  const hindRightUpLeg = new Bone();
  hindRightUpLeg.name = "HindRightUpLeg";
  hindRightUpLeg.position.set(legXOffset, legYOffset, hindLegZOffset);
  root.add(hindRightUpLeg);
  allBones.push(hindRightUpLeg);
  const hindRightLegBones = createLimb(
    hindRightUpLeg,
    [0.5, 0.4],
    [0.1, 0.08],
    ["HindRightLowLeg", "HindRightFoot"]
  );
  allBones.push(...hindRightLegBones);

  // Front Left Leg
  const frontLeftUpLeg = new Bone();
  frontLeftUpLeg.name = "FrontLeftUpLeg";
  frontLeftUpLeg.position.set(-legXOffset, legYOffset, 0); // Relative to chest
  spineChest.add(frontLeftUpLeg);
  allBones.push(frontLeftUpLeg);
  const frontLeftLegBones = createLimb(
    frontLeftUpLeg,
    [0.5, 0.4],
    [0.1, 0.08],
    ["FrontLeftLowLeg", "FrontLeftFoot"]
  );
  allBones.push(...frontLeftLegBones);

  // Front Right Leg
  const frontRightUpLeg = new Bone();
  frontRightUpLeg.name = "FrontRightUpLeg";
  frontRightUpLeg.position.set(legXOffset, legYOffset, 0); // Relative to chest
  spineChest.add(frontRightUpLeg);
  allBones.push(frontRightUpLeg);
  const frontRightLegBones = createLimb(
    frontRightUpLeg,
    [0.5, 0.4],
    [0.1, 0.08],
    ["FrontRightLowLeg", "FrontRightFoot"]
  );
  allBones.push(...frontRightLegBones);

  return { root, bones: allBones };
}

function createSkinnedMesh(
  geometry: BufferGeometry,
  material: THREE.Material,
  skeleton: Skeleton
): SkinnedMesh {
  const mesh = new SkinnedMesh(geometry, material);
  mesh.add(skeleton.bones[0]); // Add the root bone
  mesh.bind(skeleton);
  mesh.castShadow = true;
  mesh.receiveShadow = true; // Animals might receive shadows

  // Simple bounding box calculation (adjust if needed)
  mesh.geometry.computeBoundingBox();

  return mesh;
}

// --- Deer Model ---
export function createDeerModel(): Group {
  const group = new Group();
  group.name = "Deer";

  const { root: skeletonRoot, bones } = createQuadrupedSkeleton();
  const skeleton = new Skeleton(bones);

  // Basic Deer Geometry (using simple shapes)
  const bodyGeo = new BoxGeometry(0.6, 0.7, 1.2); // width, height, length
  const neckGeo = new CylinderGeometry(0.15, 0.12, 0.5, 8);
  const headGeo = new BoxGeometry(0.3, 0.35, 0.4);
  const legGeo = new CylinderGeometry(0.1, 0.08, 0.9, 6); // Combined leg geo for simplicity
  const tailGeo = new CylinderGeometry(0.05, 0.02, 0.4, 4);
  const noseGeo = new SphereGeometry(0.05, 6, 4);
  // Antlers (simple branching)
  const antlerBaseGeo = new CylinderGeometry(0.04, 0.03, 0.3, 5);
  const antlerBranchGeo = new CylinderGeometry(0.03, 0.02, 0.25, 5);

  // Combine geometries (placeholder - proper skinning needed)
  // For procedural skinning, you'd calculate vertex weights based on bone proximity.
  // This is complex. For now, we'll create a placeholder mesh.
  // A real implementation would use tools like Blender or code complex skinning logic.

  // Placeholder Geometry (Box representing the deer)
  const placeholderGeo = new BoxGeometry(1, 1.5, 1.8); // Approximate overall size
  const skinIndices: number[] = [];
  const skinWeights: number[] = [];
  const position = placeholderGeo.attributes.position;

  // Very basic skinning: Assign all vertices to the root bone
  for (let i = 0; i < position.count; i++) {
    skinIndices.push(0, 0, 0, 0); // Bone index (0 = root)
    skinWeights.push(1, 0, 0, 0); // Weight (1 = 100% influence)
  }
  placeholderGeo.setAttribute(
    "skinIndex",
    new Uint16BufferAttribute(skinIndices, 4)
  );
  placeholderGeo.setAttribute(
    "skinWeight",
    new Float32BufferAttribute(skinWeights, 4)
  );

  const skinnedMesh = createSkinnedMesh(
    placeholderGeo,
    deerFurMaterial,
    skeleton
  );
  skinnedMesh.name = "DeerMesh";
  group.add(skinnedMesh);

  // Add simple visual elements (not skinned, just attached to bones for visual aid)
  const headBone = skeleton.getBoneByName("Head");
  if (headBone) {
    const headMesh = new Mesh(headGeo, deerFurMaterial);
    headMesh.position.y = 0.15; // Adjust position relative to head bone origin
    headBone.add(headMesh);

    const noseMesh = new Mesh(noseGeo, noseMaterial);
    noseMesh.position.z = -0.2; // Forward from head center
    noseMesh.position.y = -0.05;
    headMesh.add(noseMesh); // Add to headMesh

    // Antlers
    const antlerLBase = new Mesh(antlerBaseGeo, antlerMaterial);
    antlerLBase.position.set(-0.1, 0.2, 0.1);
    antlerLBase.rotation.z = Math.PI / 6;
    antlerLBase.rotation.x = -Math.PI / 12;
    headMesh.add(antlerLBase);
    const antlerLBranch = new Mesh(antlerBranchGeo, antlerMaterial);
    antlerLBranch.position.y = 0.15;
    antlerLBranch.rotation.z = -Math.PI / 4;
    antlerLBase.add(antlerLBranch);

    const antlerRBase = new Mesh(antlerBaseGeo, antlerMaterial);
    antlerRBase.position.set(0.1, 0.2, 0.1);
    antlerRBase.rotation.z = -Math.PI / 6;
    antlerRBase.rotation.x = -Math.PI / 12;
    headMesh.add(antlerRBase);
    const antlerRBranch = new Mesh(antlerBranchGeo, antlerMaterial);
    antlerRBranch.position.y = 0.15;
    antlerRBranch.rotation.z = Math.PI / 4;
    antlerRBase.add(antlerRBranch);
  }

  group.userData = {
    isAnimal: true,
    animalType: "Deer",
    isCollidable: true, // Example
    isInteractable: false, // Example
    skeletonRoot: skeletonRoot, // Reference for animation system
  };

  // Adjust initial pose slightly (optional)
  const neckBone = skeleton.getBoneByName("Neck");
  if (neckBone) neckBone.rotation.x = -Math.PI / 12;
  const tailBaseBone = skeleton.getBoneByName("TailBase");
  if (tailBaseBone) tailBaseBone.rotation.x = Math.PI / 8;

  return group;
}

// --- Wolf Model ---
export function createWolfModel(): Group {
  const group = new Group();
  group.name = "Wolf";

  const { root: skeletonRoot, bones } = createQuadrupedSkeleton();
  const skeleton = new Skeleton(bones);

  // Basic Wolf Geometry (using simple shapes) - slightly different proportions
  const bodyGeo = new BoxGeometry(0.5, 0.6, 1.1);
  const neckGeo = new CylinderGeometry(0.14, 0.11, 0.4, 8);
  const headGeo = new BoxGeometry(0.28, 0.3, 0.45); // Longer snout implied
  const legGeo = new CylinderGeometry(0.09, 0.07, 0.8, 6);
  const tailGeo = new CylinderGeometry(0.06, 0.03, 0.5, 4);
  const noseGeo = new SphereGeometry(0.05, 6, 4);
  const earGeo = new ConeGeometry(0.06, 0.15, 4);

  // Placeholder Geometry (Box representing the wolf)
  const placeholderGeo = new BoxGeometry(0.8, 1.3, 1.6); // Approximate overall size
  const skinIndices: number[] = [];
  const skinWeights: number[] = [];
  const position = placeholderGeo.attributes.position;

  // Very basic skinning: Assign all vertices to the root bone
  for (let i = 0; i < position.count; i++) {
    skinIndices.push(0, 0, 0, 0); // Bone index (0 = root)
    skinWeights.push(1, 0, 0, 0); // Weight (1 = 100% influence)
  }
  placeholderGeo.setAttribute(
    "skinIndex",
    new Uint16BufferAttribute(skinIndices, 4)
  );
  placeholderGeo.setAttribute(
    "skinWeight",
    new Float32BufferAttribute(skinWeights, 4)
  );

  const skinnedMesh = createSkinnedMesh(
    placeholderGeo,
    wolfFurMaterial,
    skeleton
  );
  skinnedMesh.name = "WolfMesh";
  group.add(skinnedMesh);

  // Add simple visual elements (not skinned)
  const headBone = skeleton.getBoneByName("Head");
  if (headBone) {
    const headMesh = new Mesh(headGeo, wolfFurMaterial);
    headMesh.position.y = 0.1; // Adjust position relative to head bone origin
    headBone.add(headMesh);

    const noseMesh = new Mesh(noseGeo, noseMaterial);
    noseMesh.position.z = -0.22; // Further forward for snout
    noseMesh.position.y = -0.05;
    headMesh.add(noseMesh);

    // Ears
    const earL = new Mesh(earGeo, wolfFurMaterial);
    earL.position.set(-0.08, 0.18, 0.05);
    earL.rotation.x = -Math.PI / 8;
    headMesh.add(earL);

    const earR = new Mesh(earGeo, wolfFurMaterial);
    earR.position.set(0.08, 0.18, 0.05);
    earR.rotation.x = -Math.PI / 8;
    headMesh.add(earR);
  }

  group.userData = {
    isAnimal: true,
    animalType: "Wolf",
    isCollidable: true, // Example
    isInteractable: false, // Example
    isEnemy: true, // Example
    skeletonRoot: skeletonRoot, // Reference for animation system
  };

  // Adjust initial pose slightly (optional) - more alert/aggressive
  const neckBone = skeleton.getBoneByName("Neck");
  if (neckBone) neckBone.rotation.x = -Math.PI / 8;
  const tailBaseBone = skeleton.getBoneByName("TailBase");
  if (tailBaseBone) tailBaseBone.rotation.x = -Math.PI / 16; // Tail less raised than deer

  return group;
}
