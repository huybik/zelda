/* File: /src/systems/camera.ts */
// File: /src/systems/camera.ts
import {
  OrthographicCamera,
  Object3D,
  Vector3,
  Raycaster,
  MathUtils,
  Sprite, // Import Sprite
  Intersection,
} from "three";
import { smoothVectorLerp } from "../core/utils";

export class ThirdPersonCamera {
  camera: OrthographicCamera;
  target: Object3D;
  idealOffset: Vector3 = new Vector3(0, 5, -5); // Offset in target's local space (Y up, Z back)
  minZoom: number = 2; // Minimum orthographic view size (e.g., half-height)
  maxZoom: number = 20; // Maximum orthographic view size
  zoomLevel: number = 10; // Current orthographic view size (controls zoom)
  pitchAngle: number = 0.15;
  minPitch: number = -Math.PI / 3;
  maxPitch: number = Math.PI / 2.5;
  pitchSensitivity: number = 0.0025;
  zoomSensitivity: number = 0.01; // Sensitivity for zoom control
  lerpAlphaPositionBase: number = 0.05;
  lerpAlphaLookatBase: number = 0.1;
  collisionRaycaster: Raycaster;
  collisionOffset: number = 0.3; // How much space to keep from obstacles
  currentPosition: Vector3;
  currentLookat: Vector3;
  public aspect: number; // Store aspect ratio

  // Horizon stabilization properties
  private targetPitchAngle: number = -0.1; // Desired stable pitch (looking slightly up)
  private lastUserPitchInputTime: number = 0;
  private readonly pitchReturnTimeout: number = 3.0; // seconds
  private readonly pitchReturnSpeed: number = 0.02; // Lerp factor base for return
  private readonly userPitchInputThreshold: number = 0.0005; // Minimum deltaY to count as input

  private targetPosition = new Vector3();
  private offset = new Vector3();
  private idealPosition = new Vector3();
  private finalPosition = new Vector3();
  private idealLookat = new Vector3();
  private rayOrigin = new Vector3();
  private cameraDirection = new Vector3();

  constructor(camera: OrthographicCamera, target: Object3D) {
    this.camera = camera;
    this.target = target;
    // Calculate initial aspect ratio from camera properties
    this.aspect =
      camera.right > 0 && camera.top > 0
        ? camera.right / camera.top // Assumes left = -right, bottom = -top
        : window.innerWidth / window.innerHeight; // Fallback
    this.collisionRaycaster = new Raycaster();
    // Raycaster doesn't need camera reference for world-space rays
    this.currentPosition = new Vector3();
    this.currentLookat = new Vector3();
    this.target.getWorldPosition(this.currentLookat);
    this.currentLookat.y += (target.userData?.height ?? 1.8) * 0.6;
    this.lastUserPitchInputTime = performance.now() / 1000; // Initialize timestamp
    this.updateFrustum(); // Initial setup
    this.update(0.016, []); // Initial update to set position
    this.camera.position.copy(this.currentPosition);
    this.camera.lookAt(this.currentLookat);
  }

  setAspect(newAspect: number): void {
    this.aspect = newAspect;
    this.updateFrustum(); // Update frustum immediately when aspect changes
  }

  handleMouseInput(deltaX: number, deltaY: number): void {
    // Update pitch based on user input
    this.pitchAngle -= deltaY * this.pitchSensitivity;
    this.pitchAngle = MathUtils.clamp(
      this.pitchAngle,
      this.minPitch,
      this.maxPitch
    );

    // Record time if input is significant
    if (Math.abs(deltaY) > this.userPitchInputThreshold) {
      this.lastUserPitchInputTime = performance.now() / 1000;
    }
  }

  handleZoom(deltaZoom: number): void {
    this.zoomLevel += deltaZoom * this.zoomSensitivity * this.zoomLevel; // Scale sensitivity by current zoom
    this.zoomLevel = MathUtils.clamp(
      this.zoomLevel,
      this.minZoom,
      this.maxZoom
    );
    this.updateFrustum();
  }

  updateFrustum(): void {
    const halfHeight = this.zoomLevel;
    const halfWidth = halfHeight * this.aspect; // Use stored aspect ratio
    this.camera.left = -halfWidth;
    this.camera.right = halfWidth;
    this.camera.top = halfHeight;
    this.camera.bottom = -halfHeight;
    this.camera.updateProjectionMatrix();
  }

  update(deltaTime: number, collidables: Object3D[]): void {
    if (!this.target || !this.target.parent) return;

    // --- Horizon Stabilization Logic ---
    const currentTime = performance.now() / 1000;
    if (currentTime - this.lastUserPitchInputTime > this.pitchReturnTimeout) {
      const returnFactor =
        1.0 - Math.pow(1.0 - this.pitchReturnSpeed, deltaTime * 60);
      this.pitchAngle = MathUtils.lerp(
        this.pitchAngle,
        this.targetPitchAngle,
        returnFactor
      );
      if (Math.abs(this.pitchAngle - this.targetPitchAngle) < 0.001) {
        this.pitchAngle = this.targetPitchAngle;
      }
    }
    this.pitchAngle = MathUtils.clamp(
      this.pitchAngle,
      this.minPitch,
      this.maxPitch
    );
    // --- End Horizon Stabilization Logic ---

    this.target.getWorldPosition(this.targetPosition);
    const targetQuaternion = this.target.quaternion;

    // Calculate ideal camera position based on target orientation and offset
    // Pitch affects the offset vector before applying target rotation
    this.offset
      .copy(this.idealOffset)
      .applyAxisAngle(new Vector3(1, 0, 0), this.pitchAngle)
      .applyQuaternion(targetQuaternion);
    this.idealPosition.copy(this.targetPosition).add(this.offset);

    // Calculate ideal lookat point (slightly above target center)
    const targetHeight = this.target.userData?.height ?? 1.8;
    this.idealLookat
      .copy(this.targetPosition)
      .add(new Vector3(0, targetHeight * 0.6, 0)); // Adjust lookAt height

    // Collision detection: Raycast from lookAt point towards ideal camera position
    this.cameraDirection.copy(this.idealPosition).sub(this.idealLookat);
    let idealDistance = this.cameraDirection.length();
    this.cameraDirection.normalize();

    this.rayOrigin.copy(this.idealLookat); // Start ray from lookAt point

    this.collisionRaycaster.set(this.rayOrigin, this.cameraDirection);
    this.collisionRaycaster.far = idealDistance;

    // Filter collidables more carefully: exclude target, ensure collidable flag, exclude sprites, ensure parent exists
    const collisionCheckObjects = collidables.filter(
      (obj) =>
        obj &&
        obj !== this.target &&
        obj.userData?.isCollidable &&
        !(obj instanceof Sprite) && // Explicitly exclude Sprites
        obj.parent // Ensure it's attached to the scene graph
    );

    let intersects: Intersection[] = [];
    if (collisionCheckObjects.length > 0) {
      try {
        intersects = this.collisionRaycaster.intersectObjects(
          collisionCheckObjects,
          true // Check descendants
        );
      } catch (error) {
        console.error("Raycaster intersection error:", error, {
          origin: this.rayOrigin.toArray(),
          direction: this.cameraDirection.toArray(),
          far: this.collisionRaycaster.far,
          objects: collisionCheckObjects.map((o) => ({
            name: o.name,
            type: o.type,
            visible: o.visible,
            parent: o.parent?.uuid,
            collidable: o.userData?.isCollidable,
          })),
        });
        // Optionally, handle the error, e.g., skip collision adjustment for this frame
        intersects = [];
      }
    }

    let actualDistance = idealDistance;
    if (intersects.length > 0) {
      actualDistance = intersects[0].distance - this.collisionOffset;
      actualDistance = Math.max(0.1, actualDistance); // Prevent camera going inside target
    }

    // Calculate final camera position based on collision-adjusted distance
    this.finalPosition
      .copy(this.idealLookat)
      .addScaledVector(this.cameraDirection, actualDistance);

    // Smoothly interpolate current position and lookat towards their targets
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

    // Apply final position and lookat to the camera
    this.camera.position.copy(this.currentPosition);
    this.camera.lookAt(this.currentLookat);

    // Update frustum based on zoom level (might be adjusted by controls)
    // This is now called within handleZoom and setAspect
    // this.updateFrustum();
  }
}
