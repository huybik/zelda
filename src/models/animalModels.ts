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
const deerFurMaterial = new MeshLambertMaterial({ color: 0xffff00 }); // Yellow
const wolfFurMaterial = new MeshLambertMaterial({ color: 0xff0000 }); // Red
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

// --- Deer Model ---
export function createDeerModel(): Group {
  const group = new Group();
  group.name = "Deer";

  const { root: skeletonRoot, bones } = createQuadrupedSkeleton();
  const skeleton = new Skeleton(bones); // Skeleton is created but not used for SkinnedMesh

  // --- Create Meshes and Attach to Bones ---
  const bodyGeo = new BoxGeometry(0.6, 0.7, 1.2); // width, height, length
  const bodyMesh = new Mesh(bodyGeo, deerFurMaterial);
  bodyMesh.position.y = 0.25; // Adjust position relative to bone origin
  const spineMidBone = skeleton.getBoneByName("SpineMid");
  if (spineMidBone) spineMidBone.add(bodyMesh);

  const neckGeo = new CylinderGeometry(0.15, 0.12, 0.5, 8);
  const neckMesh = new Mesh(neckGeo, deerFurMaterial);
  neckMesh.position.y = 0.2; // Half height + offset
  const neckBone = skeleton.getBoneByName("Neck");
  if (neckBone) neckBone.add(neckMesh);

  const headGeo = new BoxGeometry(0.3, 0.35, 0.4);
  const headMesh = new Mesh(headGeo, deerFurMaterial);
  headMesh.position.y = 0.15; // Adjust position relative to head bone origin
  const headBone = skeleton.getBoneByName("Head");
  if (headBone) headBone.add(headMesh);

  const noseGeo = new SphereGeometry(0.05, 6, 4);
  const noseMesh = new Mesh(noseGeo, noseMaterial);
  noseMesh.position.z = -0.2; // Forward from head center
  noseMesh.position.y = -0.05;
  headMesh.add(noseMesh); // Add to headMesh

  // Antlers (simple branching)
  const antlerBaseGeo = new CylinderGeometry(0.04, 0.03, 0.3, 5);
  const antlerBranchGeo = new CylinderGeometry(0.03, 0.02, 0.25, 5);
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

  // Add simple leg representations (optional, can look blocky)
  const createLegMesh = (boneName: string, length: number, radius: number) => {
    const legGeo = new CylinderGeometry(radius * 0.8, radius, length, 6);
    const legMesh = new Mesh(legGeo, deerFurMaterial);
    legMesh.position.y = length / 2; // Center the mesh along the bone
    const bone = skeleton.getBoneByName(boneName);
    if (bone) bone.add(legMesh);
  };
  createLegMesh("HindLeftUpLeg", 0.5, 0.1);
  createLegMesh("HindLeftLowLeg", 0.4, 0.08);
  createLegMesh("HindRightUpLeg", 0.5, 0.1);
  createLegMesh("HindRightLowLeg", 0.4, 0.08);
  createLegMesh("FrontLeftUpLeg", 0.5, 0.1);
  createLegMesh("FrontLeftLowLeg", 0.4, 0.08);
  createLegMesh("FrontRightUpLeg", 0.5, 0.1);
  createLegMesh("FrontRightLowLeg", 0.4, 0.08);

  // Add the skeleton root to the group
  group.add(skeletonRoot);

  group.userData = {
    isAnimal: true,
    animalType: "Deer",
    isCollidable: true, // Example
    isInteractable: true, // Example
    skeletonRoot: skeletonRoot, // Reference for animation system
  };

  // Adjust initial pose slightly (optional)
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

  // --- Create Meshes and Attach to Bones ---
  const bodyGeo = new BoxGeometry(0.5, 0.6, 1.1);
  const bodyMesh = new Mesh(bodyGeo, wolfFurMaterial);
  bodyMesh.position.y = 0.25;
  const spineMidBone = skeleton.getBoneByName("SpineMid");
  if (spineMidBone) spineMidBone.add(bodyMesh);

  const neckGeo = new CylinderGeometry(0.14, 0.11, 0.4, 8);
  const neckMesh = new Mesh(neckGeo, wolfFurMaterial);
  neckMesh.position.y = 0.2;
  const neckBone = skeleton.getBoneByName("Neck");
  if (neckBone) neckBone.add(neckMesh);

  const headGeo = new BoxGeometry(0.28, 0.3, 0.45); // Longer snout implied
  const headMesh = new Mesh(headGeo, wolfFurMaterial);
  headMesh.position.y = 0.1; // Adjust position relative to head bone origin
  const headBone = skeleton.getBoneByName("Head");
  if (headBone) headBone.add(headMesh);

  const noseGeo = new SphereGeometry(0.05, 6, 4);
  const noseMesh = new Mesh(noseGeo, noseMaterial);
  noseMesh.position.z = -0.22; // Further forward for snout
  noseMesh.position.y = -0.05;
  headMesh.add(noseMesh);

  // Ears
  const earGeo = new ConeGeometry(0.06, 0.15, 4);
  const earL = new Mesh(earGeo, wolfFurMaterial);
  earL.position.set(-0.08, 0.18, 0.05);
  earL.rotation.x = -Math.PI / 8;
  headMesh.add(earL);

  const earR = new Mesh(earGeo, wolfFurMaterial);
  earR.position.set(0.08, 0.18, 0.05);
  earR.rotation.x = -Math.PI / 8;
  headMesh.add(earR);

  // Add simple leg representations
  const createLegMesh = (boneName: string, length: number, radius: number) => {
    const legGeo = new CylinderGeometry(radius * 0.8, radius, length, 6);
    const legMesh = new Mesh(legGeo, wolfFurMaterial);
    legMesh.position.y = length / 2;
    const bone = skeleton.getBoneByName(boneName);
    if (bone) bone.add(legMesh);
  };
  createLegMesh("HindLeftUpLeg", 0.5, 0.09);
  createLegMesh("HindLeftLowLeg", 0.4, 0.07);
  createLegMesh("HindRightUpLeg", 0.5, 0.09);
  createLegMesh("HindRightLowLeg", 0.4, 0.07);
  createLegMesh("FrontLeftUpLeg", 0.5, 0.09);
  createLegMesh("FrontLeftLowLeg", 0.4, 0.07);
  createLegMesh("FrontRightUpLeg", 0.5, 0.09);
  createLegMesh("FrontRightLowLeg", 0.4, 0.07);

  // Add the skeleton root to the group
  group.add(skeletonRoot);

  group.userData = {
    isAnimal: true,
    animalType: "Wolf",
    isCollidable: true, // Example
    isInteractable: true, // Example
    isEnemy: true, // Example
    skeletonRoot: skeletonRoot, // Reference for animation system
  };

  // Adjust initial pose slightly (optional) - more alert/aggressive
  if (neckBone) neckBone.rotation.x = -Math.PI / 8;
  const tailBaseBone = skeleton.getBoneByName("TailBase");
  if (tailBaseBone) tailBaseBone.rotation.x = -Math.PI / 16; // Tail less raised than deer

  return group;
}
