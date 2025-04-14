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

interface BoneRegexMap {
  [categoryKey: string]: RegExp[];
}

// Regex patterns to match common bone naming conventions
const boneMappings: BoneRegexMap = {
  // Existing mappings...
  LeftArm: [
    /^(left|l)[._\-\s]?(arm|hand|forearm|clavicle|shoulder)/i,
    /^(arm|hand|forearm|clavicle|shoulder)[._\-\s]?(left|l)/i,
    /^arm\.l/i,
    /^hand\.l/i,
  ],
  RightArm: [
    /^(right|r)[._\-\s]?(arm|hand|forearm|clavicle|shoulder)/i,
    /^(arm|hand|forearm|clavicle|shoulder)[._\-\s]?(right|r)/i,
    /^arm\.r/i,
    /^hand\.r/i,
  ],
  // Add new hand-specific categories
  RightHand: [
    /^(right|r)[._\-\s]?hand/i, // Matches "RightHand", "R_Hand"
    /^hand[._\-\s]?(right|r)/i, // Matches "HandRight", "Hand_R"
    /^hand\.r/i, // Matches "hand.r"
    /hand(r|right)/i, // Matches "handr", "HandR_026", "handR_metarig_man1"
  ],
  LeftHand: [
    /^(left|l)[._\-\s]?hand/i, // Matches "LeftHand", "L_Hand"
    /^hand[._\-\s]?(left|l)/i, // Matches "HandLeft", "Hand_L"
    /^hand\.l/i, // Matches "hand.l"
    /hand(l|left)/i, // Matches "handl", "HandL_025"
  ],
  LeftUpLeg: [
    /^(left|l)[._\-\s]?(up(per)?)[._\-\s]?leg/i,
    /^(up(per)?|thigh)[._\-\s]?leg[._\-\s]?(left|l)/i,
    /^upleg\.l/i,
    /^thigh\.l/i,
  ],
  RightUpLeg: [
    /^(right|r)[._\-\s]?(up(per)?|thigh)[._\-\s]?leg/i,
    /^(up(per)?|thigh)[._\-\s]?leg[._\-\s]?(right|r)/i,
    /^upleg\.r/i,
    /^thigh\.r/i,
  ],
  LeftLowLeg: [
    // Renamed from LeftLeg for clarity
    /^(left|l)[._\-\s]?(leg|shin|calf|lowerleg)(?![._\-\s]?up)/i, // Avoid matching upper leg
    /^(leg|shin|calf|lowerleg)[._\-\s]?(left|l)/i,
    /^(left|l)[._\-\s]?(shin|calf)/i,
    /^leg\.l/i,
  ],
  RightLowLeg: [
    // Renamed from RightLeg for clarity
    /^(right|r)[._\-\s]?(leg|shin|calf|lowerleg)(?![._\-\s]?up)/i,
    /^(leg|shin|calf|lowerleg)[._\-\s]?(right|r)/i,
    /^(right|r)[._\-\s]?(shin|calf)/i,
    /^leg\.r/i,
  ],
  LeftFoot: [/^(left|l)[._\-\s]?foot/i, /^foot[._\-\s]?(left|l)/i, /^foot\.l/i],
  RightFoot: [
    /^(right|r)[._\-\s]?foot/i,
    /^foot[._\-\s]?(right|r)/i,
    /^foot\.r/i,
  ],
  Spine: [/spine|chest|torso|upperbody/i],
  Hips: [/hips|pelvis|root|waist/i],
  Head: [/head/i],
  Neck: [/neck/i],
};

// Map common input names (like "LeftLeg") to the more specific keys used in boneMappings
const categoryNameMapping: { [inputName: string]: string } = {
  leftarm: "LeftArm",
  lefthand: "LeftHand", // Updated from "LeftArm" to "LeftHand"
  rightarm: "RightArm",
  righthand: "RightHand", // Updated from "RightArm" to "RightHand"
  leftupleg: "LeftUpLeg",
  leftthigh: "LeftUpLeg",
  rightupleg: "RightUpLeg",
  rightthigh: "RightUpLeg",
  leftleg: "LeftLowLeg",
  leftshin: "LeftLowLeg",
  leftcalf: "LeftLowLeg",
  rightleg: "RightLowLeg",
  rightshin: "RightLowLeg",
  rightcalf: "RightLowLeg",
  leftfoot: "LeftFoot",
  rightfoot: "RightFoot",
  spine: "Spine",
  chest: "Spine",
  torso: "Spine",
  hips: "Hips",
  pelvis: "Hips",
  root: "Hips",
  head: "Head",
  neck: "Neck",
};

// Define relationships between categories for fallback searching
const relatedBoneCategories: { [categoryKey: string]: string[] } = {
  LeftLowLeg: ["LeftFoot"], // If looking for lower leg, foot might be relevant
  RightLowLeg: ["RightFoot"],
  LeftUpLeg: ["LeftLowLeg", "LeftFoot"], // If upper leg fails, try lower leg/foot
  RightUpLeg: ["RightLowLeg", "RightFoot"],
  // Add more relationships if needed
};

function getBoneCategoryKey(boneName: string): string | null {
  // Normalize input name (remove spaces, dots, underscores, dashes)
  const lowerName = boneName.toLowerCase().replace(/[._\-\s]/g, "");
  return categoryNameMapping[lowerName] || null;
}

export function findBone(
  skeletonRoot: Object3D,
  boneName: string
): Bone | null {
  const normalizedTarget = boneName.toLowerCase();
  let bestMatch: Bone | null = null;
  let bestMatchLevel = -1; // -1: No match, 0: Includes/Fallback, 1: Related Regex, 2: Primary Regex, 3: Exact

  const primaryCategoryKey = getBoneCategoryKey(boneName);
  const primaryRegexes = primaryCategoryKey
    ? boneMappings[primaryCategoryKey]
    : null;
  const relatedKeys = primaryCategoryKey
    ? relatedBoneCategories[primaryCategoryKey] || []
    : [];
  const relatedRegexesList = relatedKeys
    .map((key) => boneMappings[key])
    .filter((regexList) => regexList) as RegExp[][]; // Array of arrays of regexes

  skeletonRoot.traverse((object) => {
    if (bestMatchLevel === 3) return; // Already found exact match

    if (object instanceof Bone) {
      const currentBoneNameLower = object.name.toLowerCase();
      let currentMatchLevel = -1;

      // Level 3: Exact Match
      if (currentBoneNameLower === normalizedTarget) {
        currentMatchLevel = 3;
      }
      // Level 2: Primary Regex Match
      else if (primaryRegexes && bestMatchLevel < 3) {
        for (const regex of primaryRegexes) {
          if (regex.test(currentBoneNameLower)) {
            currentMatchLevel = Math.max(currentMatchLevel, 2);
            break;
          }
        }
      }
      // Level 1: Related Regex Match
      if (
        currentMatchLevel < 2 &&
        bestMatchLevel < 2 &&
        relatedRegexesList.length > 0
      ) {
        for (const regexList of relatedRegexesList) {
          for (const regex of regexList) {
            if (regex.test(currentBoneNameLower)) {
              currentMatchLevel = Math.max(currentMatchLevel, 1);
              break; // Found a related regex match
            }
          }
          if (currentMatchLevel >= 1) break; // Stop checking related categories if one matched
        }
      }
      // Level 0: Includes Match (Fallback)
      // Use a simplified target for includes check (remove common separators)
      const simpleTarget = normalizedTarget.replace(/[._\-\s]/g, "");
      if (
        currentMatchLevel < 1 &&
        bestMatchLevel < 1 &&
        currentBoneNameLower.includes(simpleTarget)
      ) {
        currentMatchLevel = Math.max(currentMatchLevel, 0);
      }

      // Update best match if current is better
      if (currentMatchLevel > bestMatchLevel) {
        bestMatch = object;
        bestMatchLevel = currentMatchLevel;
      }
    }
  });

  // Last resort fallback for common limb/side patterns if no match found yet (Level 0)
  if (
    bestMatchLevel < 1 &&
    (normalizedTarget.includes("leg") || normalizedTarget.includes("arm"))
  ) {
    const part = normalizedTarget.includes("left")
      ? "left"
      : normalizedTarget.includes("right")
        ? "right"
        : null;
    const limb = normalizedTarget.includes("leg") ? "leg" : "arm";
    if (part) {
      skeletonRoot.traverse((object) => {
        if (bestMatchLevel >= 1) return; // Don't overwrite better matches
        if (object instanceof Bone) {
          const nameLower = object.name.toLowerCase();
          if (nameLower.includes(part) && nameLower.includes(limb)) {
            if (bestMatchLevel < 0) {
              // Only take if absolutely no match found yet
              bestMatch = object;
              bestMatchLevel = 0;
            }
          }
        }
      });
    }
  }
  if (bestMatchLevel < 1 && normalizedTarget.includes("spine")) {
    skeletonRoot.traverse((object) => {
      if (bestMatchLevel >= 1) return;
      if (
        object instanceof Bone &&
        object.name.toLowerCase().includes("spine")
      ) {
        if (bestMatchLevel < 0) {
          bestMatch = object;
          bestMatchLevel = 0;
        }
      }
    });
  }
  if (
    bestMatchLevel < 1 &&
    (normalizedTarget.includes("hip") ||
      normalizedTarget.includes("pelvis") ||
      normalizedTarget.includes("root"))
  ) {
    skeletonRoot.traverse((object) => {
      if (bestMatchLevel >= 1) return;
      if (
        object instanceof Bone &&
        (object.name.toLowerCase().includes("hip") ||
          object.name.toLowerCase().includes("root") ||
          object.name.toLowerCase().includes("pelvis"))
      ) {
        if (bestMatchLevel < 0) {
          bestMatch = object;
          bestMatchLevel = 0;
        }
      }
    });
  }

  if (!bestMatch) {
    console.warn(`Bone matching "${boneName}" not found using any method.`);
  }
  // else {
  //     console.log(`Found bone for "${boneName}": "${bestMatch.name}" (Level: ${bestMatchLevel})`);
  // }
  return bestMatch;
}

export function createIdleAnimation(
  skeletonRoot: Object3D,
  duration: number = 5
): AnimationClip {
  const spineBone = findBone(skeletonRoot, "Spine");
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
  const leftLeg = findBone(skeletonRoot, "LeftLeg"); // Will map to LeftLowLeg, may find foot
  const rightLeg = findBone(skeletonRoot, "RightLeg"); // Will map to RightLowLeg, may find foot
  const leftArm = findBone(skeletonRoot, "LeftArm");
  const rightArm = findBone(skeletonRoot, "RightArm");

  const tracks: KeyframeTrack[] = [];
  const swingAngle = 0.6;
  const kneeBendAngle = 0.8;
  const armSwingAngle = 0.4;

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

  if (tracks.length === 0) {
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
  const swingAngle = 1.0;
  const kneeBendAngle = 1.2;
  const armSwingAngle = 0.8;
  const spineLeanAngle = 0.15;

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

  if (spineBone) {
    const qSpineInitial = new Quaternion().copy(spineBone.quaternion);
    const qSpineLean = new Quaternion().setFromAxisAngle(
      new Vector3(1, 0, 0),
      spineLeanAngle
    );
    const spineTimes = [0, duration];
    tracks.push(
      new QuaternionKeyframeTrack(`${spineBone.name}.quaternion`, spineTimes, [
        ...qSpineInitial.clone().multiply(qSpineLean).toArray(),
        ...qSpineInitial.clone().multiply(qSpineLean).toArray(),
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

  return new AnimationClip("Run_Generated", duration, tracks);
}
export function createAttackAnimation(
  skeletonRoot: Object3D,
  duration: number = 0.8
): AnimationClip {
  const rightArm = findBone(skeletonRoot, "RightArm");
  const spineBone = findBone(skeletonRoot, "Spine");

  const tracks: KeyframeTrack[] = [];

  if (rightArm) {
    const qInitial = new Quaternion().copy(rightArm.quaternion);
    const qRaise = new Quaternion().setFromEuler(
      new THREE.Euler(-Math.PI / 2.5, 0, -Math.PI / 4)
    );
    const qSwing = new Quaternion().setFromEuler(new THREE.Euler(0.5, 0, 0.2));

    const armTimes = [0, duration * 0.3, duration * 0.6, duration];
    tracks.push(
      new QuaternionKeyframeTrack(`${rightArm.name}.quaternion`, armTimes, [
        ...qInitial.toArray(),
        ...qInitial.clone().multiply(qRaise).toArray(),
        ...qInitial.clone().multiply(qSwing).toArray(),
        ...qInitial.toArray(),
      ])
    );
  }

  if (spineBone) {
    const qInitial = new Quaternion().copy(spineBone.quaternion);
    const qRotate = new Quaternion().setFromAxisAngle(
      new Vector3(0, 1, 0),
      -0.3
    );
    const qRotateSwing = new Quaternion().setFromAxisAngle(
      new Vector3(0, 1, 0),
      0.2
    );

    const spineTimes = [0, duration * 0.3, duration * 0.6, duration];
    tracks.push(
      new QuaternionKeyframeTrack(`${spineBone.name}.quaternion`, spineTimes, [
        ...qInitial.toArray(),
        ...qInitial.clone().multiply(qRotate).toArray(),
        ...qInitial.clone().multiply(qRotateSwing).toArray(),
        ...qInitial.toArray(),
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

  const clip = new AnimationClip("Attack_Generated", duration, tracks);
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
  relaxLimb(leftArm, new THREE.Euler(0.1, 0, 0.4));
  relaxLimb(rightArm, new THREE.Euler(0.1, 0, -0.4));

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
