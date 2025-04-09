// File: /src/core/animalAnimations.ts
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
  mixerRoot: Object3D, // Changed parameter name
  duration: number = 6
): AnimationClip {
  // Find bones by searching within the mixerRoot
  const spineBase = findBone(mixerRoot, "SpineBase");
  const head = findBone(mixerRoot, "Head");
  const tailBase = findBone(mixerRoot, "TailBase");
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
  mixerRoot: Object3D, // Changed parameter name
  duration: number = 1.2 // Slower than human walk
): AnimationClip {
  // Find bones by searching within the mixerRoot
  const frontLeftUpLeg = findBone(mixerRoot, "FrontLeftUpLeg");
  const frontRightUpLeg = findBone(mixerRoot, "FrontRightUpLeg");
  const hindLeftUpLeg = findBone(mixerRoot, "HindLeftUpLeg");
  const hindRightUpLeg = findBone(mixerRoot, "HindRightUpLeg");
  const frontLeftLowLeg = findBone(mixerRoot, "FrontLeftLowLeg");
  const frontRightLowLeg = findBone(mixerRoot, "FrontRightLowLeg");
  const hindLeftLowLeg = findBone(mixerRoot, "HindLeftLowLeg");
  const hindRightLowLeg = findBone(mixerRoot, "HindRightLowLeg");
  const spineBase = findBone(mixerRoot, "SpineBase");

  const tracks: KeyframeTrack[] = [];
  const upLegSwingAngle = 0.5; // Reduced swing angle
  const lowLegBendAngle = 0.7; // Reduced bend angle
  const spineSwayAngle = 0.05;

  // Gait pattern (diagonal pairs): FL+HR move, then FR+HL move
  const times = [0, duration / 2, duration];

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

    // Upper Leg Swing (Starts Forward, moves Backward)
    tracks.push(
      new QuaternionKeyframeTrack(`${upLeg.name}.quaternion`, times, [
        ...qUpInitial.clone().multiply(qUpForward).toArray(), // Start forward
        ...qUpInitial.clone().multiply(qUpBackward).toArray(), // Midpoint: backward
        ...qUpInitial.clone().multiply(qUpForward).toArray(), // End: forward (loop)
      ])
    );

    // Lower Leg Bend (bends most when leg is moving forward/up)
    const kneeTimes = [
      0,
      duration / 4,
      duration / 2,
      (3 * duration) / 4,
      duration,
    ];
    tracks.push(
      new QuaternionKeyframeTrack(`${lowLeg.name}.quaternion`, kneeTimes, [
        ...qLowInitial.clone().multiply(qLowBent).toArray(), // 0: Start bent (leg forward)
        ...qLowInitial.toArray(), // duration / 4: Extending (moving back)
        ...qLowInitial.toArray(), // duration / 2: Extended (leg back)
        ...qLowInitial.toArray(), // 3 * duration / 4: Still extended (moving forward)
        ...qLowInitial.clone().multiply(qLowBent).toArray(), // duration: End bent (leg forward, loop)
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

    // Upper Leg Swing (Starts Backward, moves Forward)
    tracks.push(
      new QuaternionKeyframeTrack(`${upLeg.name}.quaternion`, times, [
        ...qUpInitial.clone().multiply(qUpBackward).toArray(), // Start backward
        ...qUpInitial.clone().multiply(qUpForward).toArray(), // Midpoint: forward
        ...qUpInitial.clone().multiply(qUpBackward).toArray(), // End: backward (loop)
      ])
    );

    // Lower Leg Bend (bends most when leg is moving forward/up - phase shifted)
    const kneeTimes = [
      0,
      duration / 4,
      duration / 2,
      (3 * duration) / 4,
      duration,
    ];
    tracks.push(
      new QuaternionKeyframeTrack(`${lowLeg.name}.quaternion`, kneeTimes, [
        ...qLowInitial.toArray(), // 0: Start extended (leg back)
        ...qLowInitial.toArray(), // duration / 4: Still extended (moving forward)
        ...qLowInitial.clone().multiply(qLowBent).toArray(), // duration / 2: Bent (leg forward)
        ...qLowInitial.toArray(), // 3 * duration / 4: Extending (moving back)
        ...qLowInitial.toArray(), // duration: End extended (leg back, loop)
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
    // Sway should align with leg movement (e.g., sway left when right legs are forward)
    tracks.push(
      new QuaternionKeyframeTrack(`${spineBase.name}.quaternion`, times, [
        ...qInitial.clone().multiply(qSwayRight).toArray(), // Start sway right (FR/HL forward)
        ...qInitial.clone().multiply(qSwayLeft).toArray(), // Midpoint sway left (FL/HR forward)
        ...qInitial.clone().multiply(qSwayRight).toArray(), // End sway right (loop)
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
  mixerRoot: Object3D, // Changed parameter name
  duration: number = 0.7 // Faster than walk
): AnimationClip {
  // Find bones by searching within the mixerRoot
  const frontLeftUpLeg = findBone(mixerRoot, "FrontLeftUpLeg");
  const frontRightUpLeg = findBone(mixerRoot, "FrontRightUpLeg");
  const hindLeftUpLeg = findBone(mixerRoot, "HindLeftUpLeg");
  const hindRightUpLeg = findBone(mixerRoot, "HindRightUpLeg");
  const frontLeftLowLeg = findBone(mixerRoot, "FrontLeftLowLeg");
  const frontRightLowLeg = findBone(mixerRoot, "FrontRightLowLeg");
  const hindLeftLowLeg = findBone(mixerRoot, "HindLeftLowLeg");
  const hindRightLowLeg = findBone(mixerRoot, "HindRightLowLeg");
  const spineBase = findBone(mixerRoot, "SpineBase");
  const spineMid = findBone(mixerRoot, "SpineMid");

  const tracks: KeyframeTrack[] = [];
  const upLegSwingAngle = 0.7; // Reduced swing angle
  const lowLegBendAngle = 0.9; // Reduced bend angle
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
  mixerRoot: Object3D, // Changed parameter name
  duration: number = 0.8
): AnimationClip {
  // Find bones by searching within the mixerRoot
  const head = findBone(mixerRoot, "Head");
  const neck = findBone(mixerRoot, "Neck");
  const spineChest = findBone(mixerRoot, "SpineChest"); // Upper spine for lunge

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
  mixerRoot: Object3D, // Changed parameter name
  duration: number = 1.8
): AnimationClip {
  // Find bones by searching within the mixerRoot
  const hips = findBone(mixerRoot, "Hips"); // Root bone
  const spineBase = findBone(mixerRoot, "SpineBase");
  const spineMid = findBone(mixerRoot, "SpineMid");
  const neck = findBone(mixerRoot, "Neck");
  const head = findBone(mixerRoot, "Head");
  // Find representative leg bones for collapsing
  const frontLeftUpLeg = findBone(mixerRoot, "FrontLeftUpLeg");
  const hindRightUpLeg = findBone(mixerRoot, "HindRightUpLeg");

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
