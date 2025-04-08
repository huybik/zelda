import {
  PerspectiveCamera,
  Object3D,
  Vector3,
  Raycaster,
  MathUtils,
} from "three";
import { smoothVectorLerp } from "../core/helper";

export class ThirdPersonCamera {
  camera: PerspectiveCamera;
  target: Object3D;
  idealOffset: Vector3 = new Vector3(0, 2.5, -2.5);
  minOffsetDistance: number = 1.5;
  maxOffsetDistance: number = 12.0;
  pitchAngle: number = 0.15;
  minPitch: number = -Math.PI / 3;
  maxPitch: number = Math.PI / 2.5;
  pitchSensitivity: number = 0.0025;
  lerpAlphaPositionBase: number = 0.05;
  lerpAlphaLookatBase: number = 0.1;
  collisionRaycaster: Raycaster;
  collisionOffset: number = 0.3;
  currentPosition: Vector3;
  currentLookat: Vector3;

  private targetPosition = new Vector3();
  private offset = new Vector3();
  private idealPosition = new Vector3();
  private finalPosition = new Vector3();
  private idealLookat = new Vector3();
  private rayOrigin = new Vector3();
  private cameraDirection = new Vector3();

  constructor(camera: PerspectiveCamera, target: Object3D) {
    this.camera = camera;
    this.target = target;
    this.collisionRaycaster = new Raycaster();
    this.collisionRaycaster.camera = camera;
    this.currentPosition = new Vector3();
    this.currentLookat = new Vector3();
    this.target.getWorldPosition(this.currentLookat);
    this.currentLookat.y += (target.userData?.height ?? 1.8) * 0.6;
    this.update(0.016, []);
    this.camera.position.copy(this.currentPosition);
    this.camera.lookAt(this.currentLookat);
  }

  handleMouseInput(deltaX: number, deltaY: number): void {
    this.pitchAngle -= deltaY * this.pitchSensitivity;
    this.pitchAngle = MathUtils.clamp(
      this.pitchAngle,
      this.minPitch,
      this.maxPitch
    );
  }

  update(deltaTime: number, collidables: Object3D[]): void {
    if (!this.target || !this.target.parent) return;
    this.target.getWorldPosition(this.targetPosition);
    const targetQuaternion = this.target.quaternion;
    this.offset
      .copy(this.idealOffset)
      .applyAxisAngle(new Vector3(1, 0, 0), this.pitchAngle)
      .applyQuaternion(targetQuaternion);
    this.idealPosition.copy(this.targetPosition).add(this.offset);
    this.cameraDirection.copy(this.idealPosition).sub(this.targetPosition);
    let idealDistance = this.cameraDirection.length();
    this.cameraDirection.normalize();
    this.rayOrigin
      .copy(this.targetPosition)
      .addScaledVector(this.cameraDirection, 0.2);
    this.collisionRaycaster.set(this.rayOrigin, this.cameraDirection);
    this.collisionRaycaster.far = Math.max(0, idealDistance - 0.2);
    const collisionCheckObjects = collidables.filter(
      (obj) => obj !== this.target && obj?.userData?.isCollidable
    );
    const intersects = this.collisionRaycaster.intersectObjects(
      collisionCheckObjects,
      true
    );
    let actualDistance = idealDistance;
    if (intersects.length > 0) {
      actualDistance =
        intersects.reduce(
          (minDist, intersect) => Math.min(minDist, intersect.distance),
          idealDistance
        ) +
        0.2 -
        this.collisionOffset;
      actualDistance = Math.max(this.minOffsetDistance, actualDistance);
    }
    actualDistance = MathUtils.clamp(
      actualDistance,
      this.minOffsetDistance,
      this.maxOffsetDistance
    );
    this.finalPosition
      .copy(this.targetPosition)
      .addScaledVector(this.cameraDirection, actualDistance);
    const targetHeight = this.target.userData?.height ?? 1.8;
    this.idealLookat
      .copy(this.targetPosition)
      .add(new Vector3(0, targetHeight * 0.6, 0));
    smoothVectorLerp(
      this.currentPosition,
      this.finalPosition,
      this.lerpAlphaPositionBase,
      deltaTime
    );
    smoothVectorLerp(
      this.currentLookat,
      this.idealLookat,
      this.lerpAlphaLookatBase,
      deltaTime
    );
    this.camera.position.copy(this.currentPosition);
    this.camera.lookAt(this.currentLookat);
  }
}
