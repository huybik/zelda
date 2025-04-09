// File: src/core/animations.ts
import * as THREE from "three";
import {
  AnimationClip,
  KeyframeTrack,
  VectorKeyframeTrack,
  QuaternionKeyframeTrack,
  NumberKeyframeTrack,
  Vector3,
  Quaternion,
  Object3D,
  Bone,
} from "three";

// Helper function to find a bone by name (case-insensitive, partial match)
function findBone(skeletonRoot: Object3D, boneName: string): Bone | null {
  let foundBone: Bone | null = null;
  skeletonRoot.traverse((object) => {
    if (foundBone) return; // Stop searching if found
    if (
      object instanceof Bone &&
      object.name.toLowerCase().includes(boneName.toLowerCase())
    ) {
      foundBone = object;
    }
  });
  // Fallback: If not found by partial name, try finding the first available bone of a certain type (e.g., leg)
  if (!foundBone && (boneName.includes("Leg") || boneName.includes("Arm"))) {
    skeletonRoot.traverse((object) => {
      if (foundBone) return;
      if (
        object instanceof Bone &&
        object.name
          .toLowerCase()
          .includes(boneName.substring(0, 4).toLowerCase())
      ) {
        foundBone = object;
      }
    });
  }
  if (!foundBone && boneName.includes("Spine")) {
    skeletonRoot.traverse((object) => {
      if (foundBone) return;
      if (
        object instanceof Bone &&
        object.name.toLowerCase().includes("spine")
      ) {
        foundBone = object;
      }
    });
  }
  if (!foundBone && boneName.toLowerCase() === "hips") {
    skeletonRoot.traverse((object) => {
      if (foundBone) return;
      if (
        object instanceof Bone &&
        (object.name.toLowerCase().includes("hip") ||
          object.name.toLowerCase().includes("root") ||
          object.name.toLowerCase().includes("pelvis"))
      ) {
        foundBone = object;
      }
    });
  }
  if (!foundBone) {
    console.warn(`Bone containing "${boneName}" not found.`);
  }
  return foundBone;
}

// --- Animation Creation Functions ---

export function createIdleAnimation(
  skeletonRoot: Object3D,
  duration: number = 5
): AnimationClip {
  const spineBone = findBone(skeletonRoot, "Spine"); // Find a spine bone
  const tracks: KeyframeTrack[] = [];

  if (spineBone) {
    const spineNodeName = `${spineBone.name}.quaternion`;
    const qInitial = new Quaternion().copy(spineBone.quaternion);
    const qSlightBend = new Quaternion().setFromAxisAngle(
      new Vector3(1, 0, 0),
      0.03
    );
    const qSlightRotate = new Quaternion().setFromAxisAngle(
      new Vector3(0, 1, 0),
      0.02
    );

    const spineTimes = [0, duration / 2, duration];
    const spineValues = [
      ...qInitial.toArray(),
      ...qInitial
        .clone()
        .multiply(qSlightBend)
        .multiply(qSlightRotate)
        .toArray(),
      ...qInitial.toArray(),
    ];
    tracks.push(
      new QuaternionKeyframeTrack(spineNodeName, spineTimes, spineValues)
    );
  } else {
    // Fallback: No spine bone found, create an empty idle animation
    // Add a dummy track to make it a valid AnimationClip
    const dummyTimes = [0, duration];
    const dummyValues = [0, 0];
    tracks.push(
      new NumberKeyframeTrack(".dummy.opacity", dummyTimes, dummyValues)
    );
  }

  return new AnimationClip("Idle_Generated", duration, tracks);
}

export function createWalkAnimation(
  skeletonRoot: Object3D,
  duration: number = 1
): AnimationClip {
  const leftUpLeg = findBone(skeletonRoot, "LeftUpLeg");
  const rightUpLeg = findBone(skeletonRoot, "RightUpLeg");
  const leftLeg = findBone(skeletonRoot, "LeftLeg"); // Lower leg
  const rightLeg = findBone(skeletonRoot, "RightLeg"); // Lower leg
  const leftArm = findBone(skeletonRoot, "LeftArm");
  const rightArm = findBone(skeletonRoot, "RightArm");

  const tracks: KeyframeTrack[] = [];
  const swingAngle = 0.6; // Radians
  const kneeBendAngle = 0.8;
  const armSwingAngle = 0.4;

  // --- Legs ---
  if (leftUpLeg && rightUpLeg) {
    const qInitialL = new Quaternion().copy(leftUpLeg.quaternion);
    const qInitialR = new Quaternion().copy(rightUpLeg.quaternion);
    const qForward = new Quaternion().setFromAxisAngle(
      new Vector3(1, 0, 0),
      swingAngle
    );
    const qBackward = new Quaternion().setFromAxisAngle(
      new Vector3(1, 0, 0),
      -swingAngle
    );

    const legTimes = [0, duration / 2, duration];

    // Left Up Leg
    tracks.push(
      new QuaternionKeyframeTrack(`${leftUpLeg.name}.quaternion`, legTimes, [
        ...qInitialL.clone().multiply(qForward).toArray(),
        ...qInitialL.clone().multiply(qBackward).toArray(),
        ...qInitialL.clone().multiply(qForward).toArray(),
      ])
    );

    // Right Up Leg
    tracks.push(
      new QuaternionKeyframeTrack(`${rightUpLeg.name}.quaternion`, legTimes, [
        ...qInitialR.clone().multiply(qBackward).toArray(),
        ...qInitialR.clone().multiply(qForward).toArray(),
        ...qInitialR.clone().multiply(qBackward).toArray(),
      ])
    );
  }

  // --- Knees (Lower Legs) ---
  if (leftLeg && rightLeg) {
    const qKneeInitialL = new Quaternion().copy(leftLeg.quaternion);
    const qKneeInitialR = new Quaternion().copy(rightLeg.quaternion);
    const qKneeBent = new Quaternion().setFromAxisAngle(
      new Vector3(1, 0, 0),
      kneeBendAngle
    );

    const kneeTimes = [
      0,
      duration / 4,
      duration / 2,
      (3 * duration) / 4,
      duration,
    ];

    // Left Knee
    tracks.push(
      new QuaternionKeyframeTrack(`${leftLeg.name}.quaternion`, kneeTimes, [
        ...qKneeInitialL.toArray(), // Start straight
        ...qKneeInitialL.clone().multiply(qKneeBent).toArray(), // Bend as leg moves back
        ...qKneeInitialL.toArray(), // Straighten at back
        ...qKneeInitialL.toArray(), // Stay straight moving forward
        ...qKneeInitialL.toArray(), // End straight
      ])
    );

    // Right Knee
    tracks.push(
      new QuaternionKeyframeTrack(`${rightLeg.name}.quaternion`, kneeTimes, [
        ...qKneeInitialR.toArray(), // Start straight
        ...qKneeInitialR.toArray(), // Stay straight moving forward
        ...qKneeInitialR.toArray(), // End straight
        ...qKneeInitialR.clone().multiply(qKneeBent).toArray(), // Bend as leg moves back
        ...qKneeInitialR.toArray(), // Straighten at back
      ])
    );
  }

  // --- Arms ---
  if (leftArm && rightArm) {
    const qArmInitialL = new Quaternion().copy(leftArm.quaternion);
    const qArmInitialR = new Quaternion().copy(rightArm.quaternion);
    const qArmForward = new Quaternion().setFromAxisAngle(
      new Vector3(1, 0, 0),
      armSwingAngle
    );
    const qArmBackward = new Quaternion().setFromAxisAngle(
      new Vector3(1, 0, 0),
      -armSwingAngle
    );

    const armTimes = [0, duration / 2, duration];

    // Left Arm (Opposite to Right Leg)
    tracks.push(
      new QuaternionKeyframeTrack(`${leftArm.name}.quaternion`, armTimes, [
        ...qArmInitialL.clone().multiply(qArmForward).toArray(),
        ...qArmInitialL.clone().multiply(qArmBackward).toArray(),
        ...qArmInitialL.clone().multiply(qArmForward).toArray(),
      ])
    );

    // Right Arm (Opposite to Left Leg)
    tracks.push(
      new QuaternionKeyframeTrack(`${rightArm.name}.quaternion`, armTimes, [
        ...qArmInitialR.clone().multiply(qArmBackward).toArray(),
        ...qArmInitialR.clone().multiply(qArmForward).toArray(),
        ...qArmInitialR.clone().multiply(qArmBackward).toArray(),
      ])
    );
  }

  if (tracks.length === 0) {
    // Fallback: No bones found, create an empty walk animation
    const dummyTimes = [0, duration];
    const dummyValues = [0, 0];
    tracks.push(
      new NumberKeyframeTrack(".dummy.opacity", dummyTimes, dummyValues)
    );
  }

  return new AnimationClip("Walk_Generated", duration, tracks);
}

export function createRunAnimation(
  skeletonRoot: Object3D,
  duration: number = 0.6
): AnimationClip {
  const leftUpLeg = findBone(skeletonRoot, "LeftUpLeg");
  const rightUpLeg = findBone(skeletonRoot, "RightUpLeg");
  const leftLeg = findBone(skeletonRoot, "LeftLeg");
  const rightLeg = findBone(skeletonRoot, "RightLeg");
  const leftArm = findBone(skeletonRoot, "LeftArm");
  const rightArm = findBone(skeletonRoot, "RightArm");
  const spineBone = findBone(skeletonRoot, "Spine");

  const tracks: KeyframeTrack[] = [];
  const swingAngle = 1.0; // Larger swing for running
  const kneeBendAngle = 1.2; // More bend
  const armSwingAngle = 0.8; // Larger arm swing
  const spineLeanAngle = 0.15; // Slight forward lean

  // --- Legs ---
  if (leftUpLeg && rightUpLeg) {
    const qInitialL = new Quaternion().copy(leftUpLeg.quaternion);
    const qInitialR = new Quaternion().copy(rightUpLeg.quaternion);
    const qForward = new Quaternion().setFromAxisAngle(
      new Vector3(1, 0, 0),
      swingAngle
    );
    const qBackward = new Quaternion().setFromAxisAngle(
      new Vector3(1, 0, 0),
      -swingAngle
    );

    const legTimes = [0, duration / 2, duration];

    tracks.push(
      new QuaternionKeyframeTrack(`${leftUpLeg.name}.quaternion`, legTimes, [
        ...qInitialL.clone().multiply(qForward).toArray(),
        ...qInitialL.clone().multiply(qBackward).toArray(),
        ...qInitialL.clone().multiply(qForward).toArray(),
      ])
    );
    tracks.push(
      new QuaternionKeyframeTrack(`${rightUpLeg.name}.quaternion`, legTimes, [
        ...qInitialR.clone().multiply(qBackward).toArray(),
        ...qInitialR.clone().multiply(qForward).toArray(),
        ...qInitialR.clone().multiply(qBackward).toArray(),
      ])
    );
  }

  // --- Knees ---
  if (leftLeg && rightLeg) {
    const qKneeInitialL = new Quaternion().copy(leftLeg.quaternion);
    const qKneeInitialR = new Quaternion().copy(rightLeg.quaternion);
    const qKneeBent = new Quaternion().setFromAxisAngle(
      new Vector3(1, 0, 0),
      kneeBendAngle
    );

    const kneeTimes = [
      0,
      duration / 4,
      duration / 2,
      (3 * duration) / 4,
      duration,
    ];

    tracks.push(
      new QuaternionKeyframeTrack(`${leftLeg.name}.quaternion`, kneeTimes, [
        ...qKneeInitialL.toArray(),
        ...qKneeInitialL.clone().multiply(qKneeBent).toArray(),
        ...qKneeInitialL.toArray(),
        ...qKneeInitialL.toArray(),
        ...qKneeInitialL.toArray(),
      ])
    );
    tracks.push(
      new QuaternionKeyframeTrack(`${rightLeg.name}.quaternion`, kneeTimes, [
        ...qKneeInitialR.toArray(),
        ...qKneeInitialR.toArray(),
        ...qKneeInitialR.toArray(),
        ...qKneeInitialR.clone().multiply(qKneeBent).toArray(),
        ...qKneeInitialR.toArray(),
      ])
    );
  }

  // --- Arms ---
  if (leftArm && rightArm) {
    const qArmInitialL = new Quaternion().copy(leftArm.quaternion);
    const qArmInitialR = new Quaternion().copy(rightArm.quaternion);
    const qArmForward = new Quaternion().setFromAxisAngle(
      new Vector3(1, 0, 0),
      armSwingAngle
    );
    const qArmBackward = new Quaternion().setFromAxisAngle(
      new Vector3(1, 0, 0),
      -armSwingAngle
    );

    const armTimes = [0, duration / 2, duration];

    tracks.push(
      new QuaternionKeyframeTrack(`${leftArm.name}.quaternion`, armTimes, [
        ...qArmInitialL.clone().multiply(qArmForward).toArray(),
        ...qArmInitialL.clone().multiply(qArmBackward).toArray(),
        ...qArmInitialL.clone().multiply(qArmForward).toArray(),
      ])
    );
    tracks.push(
      new QuaternionKeyframeTrack(`${rightArm.name}.quaternion`, armTimes, [
        ...qArmInitialR.clone().multiply(qArmBackward).toArray(),
        ...qArmInitialR.clone().multiply(qArmForward).toArray(),
        ...qArmInitialR.clone().multiply(qArmBackward).toArray(),
      ])
    );
  }

  // --- Spine Lean ---
  if (spineBone) {
    const qSpineInitial = new Quaternion().copy(spineBone.quaternion);
    const qSpineLean = new Quaternion().setFromAxisAngle(
      new Vector3(1, 0, 0),
      spineLeanAngle
    );
    const spineTimes = [0, duration]; // Constant lean
    tracks.push(
      new QuaternionKeyframeTrack(`${spineBone.name}.quaternion`, spineTimes, [
        ...qSpineInitial.clone().multiply(qSpineLean).toArray(),
        ...qSpineInitial.clone().multiply(qSpineLean).toArray(),
      ])
    );
  }

  if (tracks.length === 0) {
    // Fallback: No bones found, create an empty run animation
    const dummyTimes = [0, duration];
    const dummyValues = [0, 0];
    tracks.push(
      new NumberKeyframeTrack(".dummy.opacity", dummyTimes, dummyValues)
    );
  }

  return new AnimationClip("Run_Generated", duration, tracks);
}

export function createAttackAnimation(
  skeletonRoot: Object3D,
  duration: number = 0.8
): AnimationClip {
  const rightArm = findBone(skeletonRoot, "RightArm");
  const rightForeArm = findBone(skeletonRoot, "RightForeArm");
  const spineBone = findBone(skeletonRoot, "Spine"); // For body rotation

  const tracks: KeyframeTrack[] = [];

  // --- Right Arm Swing ---
  if (rightArm) {
    const qInitial = new Quaternion().copy(rightArm.quaternion);
    const qRaise = new Quaternion().setFromEuler(
      new THREE.Euler(-Math.PI / 2.5, 0, -Math.PI / 4)
    ); // Raise arm back and slightly out
    const qSwing = new Quaternion().setFromEuler(new THREE.Euler(0.5, 0, 0.2)); // Swing forward

    const armTimes = [0, duration * 0.3, duration * 0.6, duration];
    tracks.push(
      new QuaternionKeyframeTrack(`${rightArm.name}.quaternion`, armTimes, [
        ...qInitial.toArray(),
        ...qInitial.clone().multiply(qRaise).toArray(), // Wind up
        ...qInitial.clone().multiply(qSwing).toArray(), // Swing
        ...qInitial.toArray(), // Return to initial
      ])
    );
  }

  // --- Forearm Action ---
  if (rightForeArm) {
    const qInitial = new Quaternion().copy(rightForeArm.quaternion);
    const qExtend = new Quaternion().setFromEuler(new THREE.Euler(-0.5, 0, 0)); // Extend forearm during swing

    const forearmTimes = [0, duration * 0.4, duration * 0.7, duration];
    tracks.push(
      new QuaternionKeyframeTrack(
        `${rightForeArm.name}.quaternion`,
        forearmTimes,
        [
          ...qInitial.toArray(),
          ...qInitial.toArray(), // Keep initial during wind up
          ...qInitial.clone().multiply(qExtend).toArray(), // Extend during swing
          ...qInitial.toArray(), // Return
        ]
      )
    );
  }

  // --- Spine Rotation ---
  if (spineBone) {
    const qInitial = new Quaternion().copy(spineBone.quaternion);
    const qRotate = new Quaternion().setFromAxisAngle(
      new Vector3(0, 1, 0),
      -0.3
    ); // Rotate body slightly for wind up
    const qRotateSwing = new Quaternion().setFromAxisAngle(
      new Vector3(0, 1, 0),
      0.2
    ); // Rotate during swing

    const spineTimes = [0, duration * 0.3, duration * 0.6, duration];
    tracks.push(
      new QuaternionKeyframeTrack(`${spineBone.name}.quaternion`, spineTimes, [
        ...qInitial.toArray(),
        ...qInitial.clone().multiply(qRotate).toArray(), // Rotate back
        ...qInitial.clone().multiply(qRotateSwing).toArray(), // Rotate forward
        ...qInitial.toArray(), // Return
      ])
    );
  }

  if (tracks.length === 0) {
    // Fallback: No bones found, create an empty attack animation
    const dummyTimes = [0, duration];
    const dummyValues = [0, 0];
    tracks.push(
      new NumberKeyframeTrack(".dummy.opacity", dummyTimes, dummyValues)
    );
  }

  const clip = new AnimationClip("Attack_Generated", duration, tracks);
  // clip.loop = THREE.LoopOnce; // Set loop mode if needed (handled in Character class now)
  return clip;
}

export function createGatherAnimation(
  skeletonRoot: Object3D,
  duration: number = 1.2
): AnimationClip {
  const spineBone = findBone(skeletonRoot, "Spine"); // Bend down
  const rightArm = findBone(skeletonRoot, "RightArm"); // Reach
  const rightForeArm = findBone(skeletonRoot, "RightForeArm");

  const tracks: KeyframeTrack[] = [];

  // --- Spine Bend ---
  if (spineBone) {
    const qInitial = new Quaternion().copy(spineBone.quaternion);
    const qBend = new Quaternion().setFromEuler(
      new THREE.Euler(Math.PI / 4, 0, 0)
    ); // Bend forward

    const spineTimes = [0, duration * 0.4, duration * 0.7, duration];
    tracks.push(
      new QuaternionKeyframeTrack(`${spineBone.name}.quaternion`, spineTimes, [
        ...qInitial.toArray(),
        ...qInitial.clone().multiply(qBend).toArray(), // Bend down
        ...qInitial.clone().multiply(qBend).toArray(), // Hold bend
        ...qInitial.toArray(), // Straighten up
      ])
    );
  }

  // --- Arm Reach ---
  if (rightArm) {
    const qInitial = new Quaternion().copy(rightArm.quaternion);
    const qReach = new Quaternion().setFromEuler(
      new THREE.Euler(Math.PI / 3, 0, 0)
    ); // Reach arm forward/down

    const armTimes = [0, duration * 0.4, duration * 0.7, duration];
    tracks.push(
      new QuaternionKeyframeTrack(`${rightArm.name}.quaternion`, armTimes, [
        ...qInitial.toArray(),
        ...qInitial.clone().multiply(qReach).toArray(), // Reach
        ...qInitial.clone().multiply(qReach).toArray(), // Hold reach
        ...qInitial.toArray(), // Return
      ])
    );
  }
  if (rightForeArm) {
    const qInitial = new Quaternion().copy(rightForeArm.quaternion);
    const qExtend = new Quaternion().setFromEuler(new THREE.Euler(-0.3, 0, 0)); // Slight forearm extension

    const forearmTimes = [0, duration * 0.4, duration * 0.7, duration];
    tracks.push(
      new QuaternionKeyframeTrack(
        `${rightForeArm.name}.quaternion`,
        forearmTimes,
        [
          ...qInitial.toArray(),
          ...qInitial.clone().multiply(qExtend).toArray(),
          ...qInitial.clone().multiply(qExtend).toArray(),
          ...qInitial.toArray(),
        ]
      )
    );
  }

  if (tracks.length === 0) {
    // Fallback: No bones found, create an empty gather animation
    const dummyTimes = [0, duration];
    const dummyValues = [0, 0];
    tracks.push(
      new NumberKeyframeTrack(".dummy.opacity", dummyTimes, dummyValues)
    );
  }

  const clip = new AnimationClip("Gather_Generated", duration, tracks);
  // clip.loop = THREE.LoopOnce; // Set loop mode if needed
  return clip;
}

export function createDeadAnimation(
  skeletonRoot: Object3D,
  duration: number = 1.5
): AnimationClip {
  const hipsBone = findBone(skeletonRoot, "Hips");
  const spineBone = findBone(skeletonRoot, "Spine");
  const leftUpLeg = findBone(skeletonRoot, "LeftUpLeg");
  const rightUpLeg = findBone(skeletonRoot, "RightUpLeg");
  const leftLeg = findBone(skeletonRoot, "LeftLeg");
  const rightLeg = findBone(skeletonRoot, "RightLeg");
  const leftArm = findBone(skeletonRoot, "LeftArm");
  const rightArm = findBone(skeletonRoot, "RightArm");
  const leftForeArm = findBone(skeletonRoot, "LeftForeArm");
  const rightForeArm = findBone(skeletonRoot, "RightForeArm");

  const tracks: KeyframeTrack[] = [];
  const fallEndTime = duration * 0.9;
  const lieStartTime = duration;

  if (hipsBone) {
    const posInitial = new Vector3().copy(hipsBone.position);
    const qInitial = new Quaternion().copy(hipsBone.quaternion);

    const qFallen = new Quaternion().setFromEuler(
      new THREE.Euler(Math.PI / 2, 0, 0)
    );
    const qTarget = qInitial.clone().multiply(qFallen);

    const finalY = posInitial.y > 0.2 ? 0.1 : posInitial.y * 0.5;
    const posFallen = posInitial.clone().setY(finalY);

    const times = [0, fallEndTime, lieStartTime];

    tracks.push(
      new VectorKeyframeTrack(`${hipsBone.name}.position`, times, [
        ...posInitial.toArray(),
        ...posFallen.toArray(),
        ...posFallen.toArray(),
      ])
    );

    tracks.push(
      new QuaternionKeyframeTrack(`${hipsBone.name}.quaternion`, times, [
        ...qInitial.toArray(),
        ...qTarget.toArray(),
        ...qTarget.toArray(),
      ])
    );
  }

  if (spineBone && hipsBone) {
    const qInitial = new Quaternion().copy(spineBone.quaternion);
    const qCollapse = new Quaternion().setFromEuler(new THREE.Euler(0.3, 0, 0));
    const qTarget = qInitial.clone().multiply(qCollapse);

    const times = [0, fallEndTime * 0.8, lieStartTime];
    tracks.push(
      new QuaternionKeyframeTrack(`${spineBone.name}.quaternion`, times, [
        ...qInitial.toArray(),
        ...qTarget.toArray(),
        ...qTarget.toArray(),
      ])
    );
  }

  const relaxLimb = (bone: Bone | null, relaxEuler: THREE.Euler) => {
    if (!bone) return;
    const qInitial = new Quaternion().copy(bone.quaternion);
    const qRelax = new Quaternion().setFromEuler(relaxEuler);
    const qTarget = qInitial.clone().multiply(qRelax);
    const times = [0, fallEndTime, lieStartTime];
    tracks.push(
      new QuaternionKeyframeTrack(`${bone.name}.quaternion`, times, [
        ...qInitial.toArray(),
        ...qTarget.toArray(),
        ...qTarget.toArray(),
      ])
    );
  };

  relaxLimb(leftUpLeg, new THREE.Euler(0.1, 0, 0));
  relaxLimb(rightUpLeg, new THREE.Euler(0.1, 0, 0));
  relaxLimb(leftLeg, new THREE.Euler(0.2, 0, 0));
  relaxLimb(rightLeg, new THREE.Euler(0.2, 0, 0));
  relaxLimb(leftArm, new THREE.Euler(0.1, 0, 0.4)); // Splay slightly out
  relaxLimb(rightArm, new THREE.Euler(0.1, 0, -0.4)); // Splay slightly out
  relaxLimb(leftForeArm, new THREE.Euler(0.3, 0, 0)); // Slight bend
  relaxLimb(rightForeArm, new THREE.Euler(0.3, 0, 0)); // Slight bend

  if (tracks.length === 0) {
    const dummyTimes = [0, duration];
    const dummyValues = [0, 0];
    tracks.push(
      new NumberKeyframeTrack(".dummy.opacity", dummyTimes, dummyValues)
    );
  }

  const clip = new AnimationClip("Dead_Generated", duration, tracks);
  return clip;
}
