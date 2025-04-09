// File: src/core/animalAnimations.ts
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
import { findBone } from "./animations"; // Reuse the bone finding utility

// --- Quadruped Idle ---
export function createAnimalIdleAnimation(
  skeletonRoot: Object3D,
  duration: number = 6
): AnimationClip {
  const spineBase = findBone(skeletonRoot, "SpineBase");
  const head = findBone(skeletonRoot, "Head");
  const tailBase = findBone(skeletonRoot, "TailBase");
  const tracks: KeyframeTrack[] = [];

  // Subtle spine bend/sway
  if (spineBase) {
    const qInitial = new Quaternion().copy(spineBase.quaternion);
    const qSwayY = new Quaternion().setFromAxisAngle(
      new Vector3(0, 1, 0),
      0.03
    );
    const qSwayZ = new Quaternion().setFromAxisAngle(
      new Vector3(0, 0, 1),
      0.02
    );
    const times = [0, duration / 3, (2 * duration) / 3, duration];
    tracks.push(
      new QuaternionKeyframeTrack(`${spineBase.name}.quaternion`, times, [
        ...qInitial.toArray(),
        ...qInitial.clone().multiply(qSwayY).toArray(),
        ...qInitial.clone().multiply(qSwayZ).toArray(),
        ...qInitial.toArray(),
      ])
    );
  }

  // Head look around
  if (head) {
    const qInitial = new Quaternion().copy(head.quaternion);
    const qLookLeft = new Quaternion().setFromAxisAngle(
      new Vector3(0, 1, 0),
      0.15
    );
    const qLookRight = new Quaternion().setFromAxisAngle(
      new Vector3(0, 1, 0),
      -0.1
    );
    const qLookDown = new Quaternion().setFromAxisAngle(
      new Vector3(1, 0, 0),
      0.1
    );
    const times = [0, duration * 0.2, duration * 0.5, duration * 0.7, duration];
    tracks.push(
      new QuaternionKeyframeTrack(`${head.name}.quaternion`, times, [
        ...qInitial.toArray(),
        ...qInitial.clone().multiply(qLookLeft).toArray(),
        ...qInitial.clone().multiply(qLookDown).toArray(), // Look down briefly
        ...qInitial.clone().multiply(qLookRight).toArray(),
        ...qInitial.toArray(),
      ])
    );
  }

  // Tail sway
  if (tailBase) {
    const qInitial = new Quaternion().copy(tailBase.quaternion);
    const qSway = new Quaternion().setFromAxisAngle(new Vector3(0, 0, 1), 0.2); // Sway side to side
    const times = [0, duration / 2, duration];
    tracks.push(
      new QuaternionKeyframeTrack(`${tailBase.name}.quaternion`, times, [
        ...qInitial.toArray(),
        ...qInitial.clone().multiply(qSway).toArray(),
        ...qInitial.toArray(),
      ])
    );
  }

  // Ensure there's at least one track
  if (tracks.length === 0) {
    const dummyTimes = [0, duration];
    const dummyValues = [0, 0];
    tracks.push(
      new NumberKeyframeTrack(".dummy.opacity", dummyTimes, dummyValues)
    );
  }

  return new AnimationClip("AnimalIdle_Generated", duration, tracks);
}

// --- Quadruped Walk ---
export function createAnimalWalkAnimation(
  skeletonRoot: Object3D,
  duration: number = 1.2 // Slower than human walk
): AnimationClip {
  // Find bones - adjust names if your skeleton uses different conventions
  const frontLeftUpLeg = findBone(skeletonRoot, "FrontLeftUpLeg");
  const frontRightUpLeg = findBone(skeletonRoot, "FrontRightUpLeg");
  const hindLeftUpLeg = findBone(skeletonRoot, "HindLeftUpLeg");
  const hindRightUpLeg = findBone(skeletonRoot, "HindRightUpLeg");
  const frontLeftLowLeg = findBone(skeletonRoot, "FrontLeftLowLeg");
  const frontRightLowLeg = findBone(skeletonRoot, "FrontRightLowLeg");
  const hindLeftLowLeg = findBone(skeletonRoot, "HindLeftLowLeg");
  const hindRightLowLeg = findBone(skeletonRoot, "HindRightLowLeg");
  const spineBase = findBone(skeletonRoot, "SpineBase");

  const tracks: KeyframeTrack[] = [];
  const upLegSwingAngle = 0.4;
  const lowLegBendAngle = 0.6; // Knee/Elbow bend
  const spineSwayAngle = 0.05;

  // Gait pattern (diagonal pairs): FL+HR move, then FR+HL move
  const times = [0, duration / 2, duration];
  const timesShifted = [0, duration / 2, duration].map(
    (t) => (t + duration / 2) % duration
  ); // Offset by half duration

  const createLegTracks = (
    upLeg: Bone | null,
    lowLeg: Bone | null,
    forwardAngle: number,
    bendAngle: number,
    isFront: boolean
  ) => {
    if (!upLeg || !lowLeg) return;

    const qUpInitial = new Quaternion().copy(upLeg.quaternion);
    const qLowInitial = new Quaternion().copy(lowLeg.quaternion);

    const qUpForward = new Quaternion().setFromAxisAngle(
      new Vector3(1, 0, 0),
      forwardAngle
    );
    const qUpBackward = new Quaternion().setFromAxisAngle(
      new Vector3(1, 0, 0),
      -forwardAngle
    );
    const qLowBent = new Quaternion().setFromAxisAngle(
      new Vector3(1, 0, 0),
      bendAngle
    );

    // Upper Leg Swing
    tracks.push(
      new QuaternionKeyframeTrack(`${upLeg.name}.quaternion`, times, [
        ...qUpInitial.clone().multiply(qUpForward).toArray(),
        ...qUpInitial.clone().multiply(qUpBackward).toArray(),
        ...qUpInitial.clone().multiply(qUpForward).toArray(),
      ])
    );

    // Lower Leg Bend (bends when leg is moving forward)
    const kneeTimes = [
      0,
      duration / 4,
      duration / 2,
      (3 * duration) / 4,
      duration,
    ];
    tracks.push(
      new QuaternionKeyframeTrack(`${lowLeg.name}.quaternion`, kneeTimes, [
        ...qLowInitial.toArray(), // Start extended backward
        ...qLowInitial.clone().multiply(qLowBent).toArray(), // Bend as it comes forward
        ...qLowInitial.toArray(), // Extend forward
        ...qLowInitial.toArray(), // Stay extended backward
        ...qLowInitial.toArray(), // Back to start
      ])
    );
  };

  // Front Left & Hind Right (move together)
  createLegTracks(
    frontLeftUpLeg,
    frontLeftLowLeg,
    upLegSwingAngle,
    lowLegBendAngle,
    true
  );
  createLegTracks(
    hindRightUpLeg,
    hindRightLowLeg,
    upLegSwingAngle,
    lowLegBendAngle,
    false
  );

  // Front Right & Hind Left (move together, offset phase)
  // Need to adjust the keyframe values for the offset phase
  const createOffsetLegTracks = (
    upLeg: Bone | null,
    lowLeg: Bone | null,
    forwardAngle: number,
    bendAngle: number,
    isFront: boolean
  ) => {
    if (!upLeg || !lowLeg) return;

    const qUpInitial = new Quaternion().copy(upLeg.quaternion);
    const qLowInitial = new Quaternion().copy(lowLeg.quaternion);

    const qUpForward = new Quaternion().setFromAxisAngle(
      new Vector3(1, 0, 0),
      forwardAngle
    );
    const qUpBackward = new Quaternion().setFromAxisAngle(
      new Vector3(1, 0, 0),
      -forwardAngle
    );
    const qLowBent = new Quaternion().setFromAxisAngle(
      new Vector3(1, 0, 0),
      bendAngle
    );

    // Upper Leg Swing (starts backward)
    tracks.push(
      new QuaternionKeyframeTrack(`${upLeg.name}.quaternion`, times, [
        ...qUpInitial.clone().multiply(qUpBackward).toArray(),
        ...qUpInitial.clone().multiply(qUpForward).toArray(),
        ...qUpInitial.clone().multiply(qUpBackward).toArray(),
      ])
    );

    // Lower Leg Bend (bends when leg is moving forward - phase shifted)
    const kneeTimes = [
      0,
      duration / 4,
      duration / 2,
      (3 * duration) / 4,
      duration,
    ];
    tracks.push(
      new QuaternionKeyframeTrack(`${lowLeg.name}.quaternion`, kneeTimes, [
        ...qLowInitial.toArray(), // Start extended forward
        ...qLowInitial.toArray(), // Stay extended forward
        ...qLowInitial.toArray(), // Start bending backward
        ...qLowInitial.clone().multiply(qLowBent).toArray(), // Bend as it comes forward (end of cycle)
        ...qLowInitial.toArray(), // Back to start (extended forward)
      ])
    );
  };

  createOffsetLegTracks(
    frontRightUpLeg,
    frontRightLowLeg,
    upLegSwingAngle,
    lowLegBendAngle,
    true
  );
  createOffsetLegTracks(
    hindLeftUpLeg,
    hindLeftLowLeg,
    upLegSwingAngle,
    lowLegBendAngle,
    false
  );

  // Spine sway (subtle side-to-side)
  if (spineBase) {
    const qInitial = new Quaternion().copy(spineBase.quaternion);
    const qSwayLeft = new Quaternion().setFromAxisAngle(
      new Vector3(0, 0, 1),
      spineSwayAngle
    );
    const qSwayRight = new Quaternion().setFromAxisAngle(
      new Vector3(0, 0, 1),
      -spineSwayAngle
    );
    tracks.push(
      new QuaternionKeyframeTrack(`${spineBase.name}.quaternion`, times, [
        ...qInitial.clone().multiply(qSwayLeft).toArray(),
        ...qInitial.clone().multiply(qSwayRight).toArray(),
        ...qInitial.clone().multiply(qSwayLeft).toArray(),
      ])
    );
  }

  if (tracks.length === 0) {
    const dummyTimes = [0, duration];
    const dummyValues = [0, 0];
    tracks.push(
      new NumberKeyframeTrack(".dummy.opacity", dummyTimes, dummyValues)
    );
  }

  return new AnimationClip("AnimalWalk_Generated", duration, tracks);
}

// --- Quadruped Run ---
export function createAnimalRunAnimation(
  skeletonRoot: Object3D,
  duration: number = 0.7 // Faster than walk
): AnimationClip {
  // Find bones
  const frontLeftUpLeg = findBone(skeletonRoot, "FrontLeftUpLeg");
  const frontRightUpLeg = findBone(skeletonRoot, "FrontRightUpLeg");
  const hindLeftUpLeg = findBone(skeletonRoot, "HindLeftUpLeg");
  const hindRightUpLeg = findBone(skeletonRoot, "HindRightUpLeg");
  const frontLeftLowLeg = findBone(skeletonRoot, "FrontLeftLowLeg");
  const frontRightLowLeg = findBone(skeletonRoot, "FrontRightLowLeg");
  const hindLeftLowLeg = findBone(skeletonRoot, "HindLeftLowLeg");
  const hindRightLowLeg = findBone(skeletonRoot, "HindRightLowLeg");
  const spineBase = findBone(skeletonRoot, "SpineBase");
  const spineMid = findBone(skeletonRoot, "SpineMid");

  const tracks: KeyframeTrack[] = [];
  const upLegSwingAngle = 0.9; // Larger swing
  const lowLegBendAngle = 1.1; // More bend
  const spineBendAngle = 0.2; // More spine flex

  // Gait pattern (Gallop-like): Hind legs push, front legs reach, suspension, front legs land, hind legs swing under
  // Simplified: Exaggerated diagonal pairs or bounding motion

  // --- Bounding Motion Approximation ---
  // Hind legs push together, front legs reach together (with slight offset)

  const times = [0, duration / 2, duration];
  const midTime = duration / 2;

  // Hind Legs (Push together)
  const createHindLegTracks = (upLeg: Bone | null, lowLeg: Bone | null) => {
    if (!upLeg || !lowLeg) return;
    const qUpInitial = new Quaternion().copy(upLeg.quaternion);
    const qLowInitial = new Quaternion().copy(lowLeg.quaternion);
    const qUpForward = new Quaternion().setFromAxisAngle(
      new Vector3(1, 0, 0),
      upLegSwingAngle * 0.8
    ); // Swing under body
    const qUpBackward = new Quaternion().setFromAxisAngle(
      new Vector3(1, 0, 0),
      -upLegSwingAngle
    ); // Push back
    const qLowBent = new Quaternion().setFromAxisAngle(
      new Vector3(1, 0, 0),
      lowLegBendAngle
    ); // Tuck under

    // Upper Leg
    tracks.push(
      new QuaternionKeyframeTrack(`${upLeg.name}.quaternion`, times, [
        ...qUpInitial.clone().multiply(qUpBackward).toArray(), // Start back (push off)
        ...qUpInitial.clone().multiply(qUpForward).toArray(), // Swing forward under body
        ...qUpInitial.clone().multiply(qUpBackward).toArray(), // Back to push off
      ])
    );
    // Lower Leg
    tracks.push(
      new QuaternionKeyframeTrack(`${lowLeg.name}.quaternion`, times, [
        ...qLowInitial.toArray(), // Extended back
        ...qLowInitial.clone().multiply(qLowBent).toArray(), // Tucked under
        ...qLowInitial.toArray(), // Extended back
      ])
    );
  };
  createHindLegTracks(hindLeftUpLeg, hindLeftLowLeg);
  createHindLegTracks(hindRightUpLeg, hindRightLowLeg);

  // Front Legs (Reach together)
  const createFrontLegTracks = (upLeg: Bone | null, lowLeg: Bone | null) => {
    if (!upLeg || !lowLeg) return;
    const qUpInitial = new Quaternion().copy(upLeg.quaternion);
    const qLowInitial = new Quaternion().copy(lowLeg.quaternion);
    const qUpForward = new Quaternion().setFromAxisAngle(
      new Vector3(1, 0, 0),
      upLegSwingAngle
    ); // Reach forward
    const qUpBackward = new Quaternion().setFromAxisAngle(
      new Vector3(1, 0, 0),
      -upLegSwingAngle * 0.5
    ); // Pull back slightly
    const qLowBent = new Quaternion().setFromAxisAngle(
      new Vector3(1, 0, 0),
      lowLegBendAngle * 0.5
    ); // Slight bend

    // Upper Leg
    tracks.push(
      new QuaternionKeyframeTrack(`${upLeg.name}.quaternion`, times, [
        ...qUpInitial.clone().multiply(qUpForward).toArray(), // Start forward (reaching)
        ...qUpInitial.clone().multiply(qUpBackward).toArray(), // Pull back under body
        ...qUpInitial.clone().multiply(qUpForward).toArray(), // Reach forward again
      ])
    );
    // Lower Leg
    tracks.push(
      new QuaternionKeyframeTrack(`${lowLeg.name}.quaternion`, times, [
        ...qLowInitial.toArray(), // Extended forward
        ...qLowInitial.clone().multiply(qLowBent).toArray(), // Bend slightly under
        ...qLowInitial.toArray(), // Extended forward
      ])
    );
  };
  // Add slight offset for front legs if desired (e.g., using timesShifted)
  createFrontLegTracks(frontLeftUpLeg, frontLeftLowLeg);
  createFrontLegTracks(frontRightUpLeg, frontRightLowLeg);

  // Spine Flexion/Extension
  if (spineBase && spineMid) {
    const qBaseInitial = new Quaternion().copy(spineBase.quaternion);
    const qMidInitial = new Quaternion().copy(spineMid.quaternion);
    const qBaseFlex = new Quaternion().setFromAxisAngle(
      new Vector3(1, 0, 0),
      spineBendAngle
    ); // Bend down
    const qBaseExtend = new Quaternion().setFromAxisAngle(
      new Vector3(1, 0, 0),
      -spineBendAngle
    ); // Arch up
    const qMidFlex = new Quaternion().setFromAxisAngle(
      new Vector3(1, 0, 0),
      spineBendAngle * 0.8
    );
    const qMidExtend = new Quaternion().setFromAxisAngle(
      new Vector3(1, 0, 0),
      -spineBendAngle * 0.8
    );

    // Spine flexes when hind legs are forward, extends when hind legs push back
    tracks.push(
      new QuaternionKeyframeTrack(`${spineBase.name}.quaternion`, times, [
        ...qBaseInitial.clone().multiply(qBaseExtend).toArray(), // Start extended
        ...qBaseInitial.clone().multiply(qBaseFlex).toArray(), // Flex
        ...qBaseInitial.clone().multiply(qBaseExtend).toArray(), // Extend
      ])
    );
    tracks.push(
      new QuaternionKeyframeTrack(`${spineMid.name}.quaternion`, times, [
        ...qMidInitial.clone().multiply(qMidExtend).toArray(), // Start extended
        ...qMidInitial.clone().multiply(qMidFlex).toArray(), // Flex
        ...qMidInitial.clone().multiply(qMidExtend).toArray(), // Extend
      ])
    );
  }

  if (tracks.length === 0) {
    const dummyTimes = [0, duration];
    const dummyValues = [0, 0];
    tracks.push(
      new NumberKeyframeTrack(".dummy.opacity", dummyTimes, dummyValues)
    );
  }

  return new AnimationClip("AnimalRun_Generated", duration, tracks);
}

// --- Quadruped Attack (Example: Wolf Bite) ---
export function createAnimalAttackAnimation(
  skeletonRoot: Object3D,
  duration: number = 0.8
): AnimationClip {
  const head = findBone(skeletonRoot, "Head");
  const neck = findBone(skeletonRoot, "Neck");
  const spineChest = findBone(skeletonRoot, "SpineChest"); // Upper spine for lunge

  const tracks: KeyframeTrack[] = [];

  // Lunge forward and bite motion
  if (head && neck && spineChest) {
    const qHeadInitial = new Quaternion().copy(head.quaternion);
    const qNeckInitial = new Quaternion().copy(neck.quaternion);
    const qSpineInitial = new Quaternion().copy(spineChest.quaternion);

    // Wind up slightly
    const qHeadWindUp = new Quaternion().setFromEuler(
      new THREE.Euler(0.1, 0.1, 0)
    ); // Look slightly up/side
    const qNeckWindUp = new Quaternion().setFromEuler(
      new THREE.Euler(0.05, 0.05, 0)
    );
    const qSpineWindUp = new Quaternion().setFromEuler(
      new THREE.Euler(-0.05, 0, 0)
    ); // Coil back slightly

    // Lunge/Bite
    const qHeadBite = new Quaternion().setFromEuler(new THREE.Euler(0.3, 0, 0)); // Head down for bite
    const qNeckLunge = new Quaternion().setFromEuler(
      new THREE.Euler(-0.2, 0, 0)
    ); // Neck forward/down
    const qSpineLunge = new Quaternion().setFromEuler(
      new THREE.Euler(0.15, 0, 0)
    ); // Spine forward

    const times = [0, duration * 0.3, duration * 0.6, duration]; // Wind up, Bite, Recover

    tracks.push(
      new QuaternionKeyframeTrack(`${head.name}.quaternion`, times, [
        ...qHeadInitial.toArray(),
        ...qHeadInitial.clone().multiply(qHeadWindUp).toArray(),
        ...qHeadInitial.clone().multiply(qHeadBite).toArray(),
        ...qHeadInitial.toArray(),
      ])
    );
    tracks.push(
      new QuaternionKeyframeTrack(`${neck.name}.quaternion`, times, [
        ...qNeckInitial.toArray(),
        ...qNeckInitial.clone().multiply(qNeckWindUp).toArray(),
        ...qNeckInitial.clone().multiply(qNeckLunge).toArray(),
        ...qNeckInitial.toArray(),
      ])
    );
    tracks.push(
      new QuaternionKeyframeTrack(`${spineChest.name}.quaternion`, times, [
        ...qSpineInitial.toArray(),
        ...qSpineInitial.clone().multiply(qSpineWindUp).toArray(),
        ...qSpineInitial.clone().multiply(qSpineLunge).toArray(),
        ...qSpineInitial.toArray(),
      ])
    );
  }

  if (tracks.length === 0) {
    const dummyTimes = [0, duration];
    const dummyValues = [0, 0];
    tracks.push(
      new NumberKeyframeTrack(".dummy.opacity", dummyTimes, dummyValues)
    );
  }

  return new AnimationClip("AnimalAttack_Generated", duration, tracks);
}

// --- Quadruped Die ---
export function createAnimalDieAnimation(
  skeletonRoot: Object3D,
  duration: number = 1.8
): AnimationClip {
  const hips = findBone(skeletonRoot, "Hips"); // Root bone
  const spineBase = findBone(skeletonRoot, "SpineBase");
  const spineMid = findBone(skeletonRoot, "SpineMid");
  const neck = findBone(skeletonRoot, "Neck");
  const head = findBone(skeletonRoot, "Head");
  // Find representative leg bones for collapsing
  const frontLeftUpLeg = findBone(skeletonRoot, "FrontLeftUpLeg");
  const hindRightUpLeg = findBone(skeletonRoot, "HindRightUpLeg");

  const tracks: KeyframeTrack[] = [];
  const fallEndTime = duration * 0.8;
  const lieStartTime = duration;

  // Root collapses (position and rotation)
  if (hips) {
    const posInitial = new Vector3().copy(hips.position);
    const qInitial = new Quaternion().copy(hips.quaternion);

    // Fall sideways and down
    const qFallen = new Quaternion().setFromEuler(
      new THREE.Euler(0, 0, Math.PI / 2.5)
    ); // Roll onto side (Z-axis)
    const qTarget = qInitial.clone().multiply(qFallen);

    // Adjust final Y position based on model size (needs refinement)
    const finalY = posInitial.y > 0.2 ? 0.1 : posInitial.y * 0.5;
    const posFallen = posInitial.clone().setY(finalY);

    const times = [0, fallEndTime, lieStartTime];

    tracks.push(
      new VectorKeyframeTrack(`${hips.name}.position`, times, [
        ...posInitial.toArray(),
        ...posFallen.toArray(),
        ...posFallen.toArray(),
      ])
    );
    tracks.push(
      new QuaternionKeyframeTrack(`${hips.name}.quaternion`, times, [
        ...qInitial.toArray(),
        ...qTarget.toArray(),
        ...qTarget.toArray(),
      ])
    );
  }

  // Spine/Neck/Head collapse
  const relaxLimb = (
    bone: Bone | null,
    relaxEuler: THREE.Euler,
    delayFactor: number = 0.1
  ) => {
    if (!bone) return;
    const qInitial = new Quaternion().copy(bone.quaternion);
    const qRelax = new Quaternion().setFromEuler(relaxEuler);
    const qTarget = qInitial.clone().multiply(qRelax);
    const startTime = duration * delayFactor;
    const times = [0, startTime, fallEndTime, lieStartTime];
    tracks.push(
      new QuaternionKeyframeTrack(`${bone.name}.quaternion`, times, [
        ...qInitial.toArray(),
        ...qInitial.toArray(), // Hold initial pose briefly
        ...qTarget.toArray(),
        ...qTarget.toArray(),
      ])
    );
  };

  relaxLimb(spineBase, new THREE.Euler(0.3, 0, 0.1), 0.1); // Slight bend and twist
  relaxLimb(spineMid, new THREE.Euler(0.4, 0, 0.2), 0.2);
  relaxLimb(neck, new THREE.Euler(0.6, 0, 0.3), 0.3); // Neck flops more
  relaxLimb(head, new THREE.Euler(0.8, 0, 0.4), 0.4); // Head flops most

  // Legs relax/splay
  relaxLimb(frontLeftUpLeg, new THREE.Euler(0.2, 0, 0.5), 0.2); // Splay out
  relaxLimb(hindRightUpLeg, new THREE.Euler(0.2, 0, -0.5), 0.2); // Splay out

  if (tracks.length === 0) {
    const dummyTimes = [0, duration];
    const dummyValues = [0, 0];
    tracks.push(
      new NumberKeyframeTrack(".dummy.opacity", dummyTimes, dummyValues)
    );
  }

  return new AnimationClip("AnimalDie_Generated", duration, tracks);
}
