import {
  PerspectiveCamera, Object3D, Vector3, Quaternion, Raycaster, Box3, Matrix4,
  Vector2, MathUtils,
} from 'three';
import { Player } from './entities';
import { InteractableObject } from './objects';
import {
  Inventory, EventLog,  InteractionResult, TargetInfo, ActiveGather,
  MoveState,  smoothVectorLerp, KeyState, MouseState,
} from './ultils';

export class InteractionSystem {
  player: Player;
  camera: PerspectiveCamera;
  interactableEntities: Array<any>;
  controls: Controls;
  inventory: Inventory;
  eventLog: EventLog;
  raycaster: Raycaster;
  interactionDistance: number = 3.0;
  aimTolerance: number = Math.PI / 6;
  currentTarget: any | null = null;
  currentTargetMesh: Object3D | null = null;
  interactionPromptElement: HTMLElement | null;
  activeGather: ActiveGather | null = null;
  promptTimeout: ReturnType<typeof setTimeout> | null = null;
  private cameraDirection = new Vector3();
  private objectDirection = new Vector3();
  private playerDirection = new Vector3();
  private objectPosition = new Vector3();

  constructor(player: Player, camera: PerspectiveCamera, interactableEntities: Array<any>, controls: Controls, inventory: Inventory, eventLog: EventLog) {
    this.player = player;
    this.camera = camera;
    this.interactableEntities = interactableEntities;
    this.controls = controls;
    this.inventory = inventory;
    this.eventLog = eventLog;
    this.raycaster = new Raycaster();
    this.interactionPromptElement = document.getElementById('interaction-prompt');
  }

  update(deltaTime: number): void {
    if (this.activeGather) {
      const moved = this.player.velocity.lengthSq() * deltaTime > 0.001;
      if (moved || this.controls.consumeInteraction()) {
        this.cancelGatherAction();
        return;
      }
      this.updateGatherAction(deltaTime);
      return;
    }
    const targetInfo = this.findInteractableTarget();
    if (targetInfo?.instance?.userData?.isInteractable) {
      if (this.currentTarget !== targetInfo.instance) {
        this.currentTarget = targetInfo.instance;
        this.currentTargetMesh = targetInfo.mesh;
        this.showPrompt(targetInfo.instance.userData.prompt || "Press E to interact");
      }
      if (this.controls.consumeInteraction()) this.tryInteract(this.currentTarget);
    } else if (this.currentTarget) {
      this.currentTarget = null;
      this.currentTargetMesh = null;
      this.hidePrompt();
    }
  }

  findInteractableTarget(): TargetInfo | null {
    this.raycaster.setFromCamera(new Vector2(0, 0), this.camera);
    this.raycaster.far = this.interactionDistance;
    const meshesToCheck = this.interactableEntities
      .map(item => (item as any).mesh ?? item)
      .filter((mesh): mesh is Object3D => mesh instanceof Object3D && mesh.userData?.isInteractable && mesh.visible);
    let closestHit: TargetInfo | null = null;
    const intersects = this.raycaster.intersectObjects(meshesToCheck, true);
    if (intersects.length > 0) {
      for (const intersect of intersects) {
        let hitObject: Object3D | null = intersect.object;
        let rootInstance: any | null = null;
        let rootMesh: Object3D | null = null;
        while (hitObject) {
          if (hitObject.userData?.isInteractable && hitObject.userData?.entityReference) {
            rootInstance = hitObject.userData.entityReference;
            rootMesh = hitObject;
            break;
          }
          if (hitObject.userData?.isInteractable && hitObject.userData?.isSimpleObject) {
            rootInstance = this.interactableEntities.find(e => (e as any).mesh === hitObject) || hitObject.userData?.entityReference;
            rootMesh = hitObject;
            break;
          }
          hitObject = hitObject.parent;
        }
        if (rootInstance && rootMesh && rootInstance.userData?.isInteractable) {
          this.objectDirection.copy(intersect.point).sub(this.camera.position).normalize();
          this.camera.getWorldDirection(this.cameraDirection);
          const angle = this.cameraDirection.angleTo(this.objectDirection);
          if (angle < this.aimTolerance) {
            closestHit = { mesh: rootMesh, instance: rootInstance, point: intersect.point, distance: intersect.distance };
            break;
          }
        }
      }
    }
    return closestHit || this.findNearbyInteractable();
  }

  findNearbyInteractable(): TargetInfo | null {
    const playerPosition = this.player.mesh!.getWorldPosition(new Vector3());
    let closestDistSq = this.interactionDistance * this.interactionDistance;
    let closestInstance: any | null = null;
    this.interactableEntities.forEach(item => {
      if (!item?.userData?.isInteractable || item === this.player.mesh) return;
      if (item.userData?.isSimpleObject && !(item as InteractableObject).isActive) return;
      const objMesh = (item as any).mesh ?? item;
      if (!objMesh || !objMesh.visible) return;
      this.objectPosition.copy(objMesh.getWorldPosition(new Vector3()));
      const distSq = playerPosition.distanceToSquared(this.objectPosition);
      if (distSq < closestDistSq) {
        this.player.mesh!.getWorldDirection(this.playerDirection);
        this.objectDirection.copy(this.objectPosition).sub(playerPosition).normalize();
        const angle = this.playerDirection.angleTo(this.objectDirection);
        if (angle < Math.PI / 2.5) {
          closestDistSq = distSq;
          closestInstance = item;
        }
      }
    });
    if (closestInstance) {
      const mesh = (closestInstance as any).mesh ?? closestInstance;
      this.objectPosition.copy(mesh.getWorldPosition(new Vector3()));
      return { mesh, instance: closestInstance, point: this.objectPosition.clone(), distance: this.player.mesh!.position.distanceTo(this.objectPosition) };
    }
    return null;
  }

  tryInteract(targetInstance: any): void {
    if (!targetInstance || !targetInstance.userData?.isInteractable) return;
    let targetPosition: Vector3;
    if (targetInstance instanceof Object3D && !(targetInstance instanceof Player) && !(targetInstance instanceof InteractableObject)) {
      targetPosition = targetInstance.position;
    } else if ((targetInstance as Player | InteractableObject).mesh) {
      targetPosition = (targetInstance as Player | InteractableObject).mesh!.position;
    } else {
      console.warn("Target instance has no mesh or position", targetInstance);
      return;
    }
    const distance = this.player.mesh!.position.distanceTo(targetPosition);
    if (distance > this.interactionDistance * 1.1) {
      this.currentTarget = null;
      this.currentTargetMesh = null;
      this.hidePrompt();
      return;
    }
    let result: InteractionResult | null = null;
    if (typeof (targetInstance as any).interact === 'function') {
      result = (targetInstance as any).interact(this.player, this.inventory, this.eventLog);
    } else if (targetInstance.userData.interactionType === 'gather' && targetInstance.userData.resource) {
      this.startGatherAction(targetInstance);
      result = { type: 'gather_start' };
      console.log(`Started gathering ${targetInstance.userData.resource}`);
    } else {
      result = { type: 'message', message: "You look at the object." };
    }
    if (result) this.handleInteractionResult(result, targetInstance);
    if (result?.type !== 'gather_start' && !targetInstance.userData?.isInteractable) {
      this.currentTarget = null;
      this.currentTargetMesh = null;
    }
  }

  handleInteractionResult(result: InteractionResult, targetInstance: any): void {
    let promptDuration: number | null = 2000;
    let promptText: string | null = null;
    switch (result.type) {
      case 'reward':
        if (result.item && this.inventory.addItem(result.item.name, result.item.amount)) {
          promptText = result.message || `Received ${result.item.amount} ${result.item.name}.`;
          promptDuration = 3000;
          this.eventLog.addEntry(promptText);
        } else if (result.item) {
          promptText = `Found ${result.item.name}, but inventory is full!`;
          promptDuration = 3000;
          this.eventLog.addEntry(promptText);
        } else if (result.message) {
          promptText = result.message;
          promptDuration = 3000;
          this.eventLog.addEntry(promptText);
        }
        break;
      case 'message':
        if (result.message) {
          promptText = result.message;
          this.eventLog.addEntry(promptText);
        }
        break;
      case 'dialogue':
        if (result.text) {
          promptText = `${targetInstance.name ?? 'NPC'}: ${result.text}`;
          promptDuration = 4000;
        }
        break;
      case 'item_retrieved':
        promptDuration = null;
        break;
      case 'error':
        if (result.message) {
          promptText = result.message;
          this.eventLog.addEntry(`Error: ${result.message}`);
        }
        break;
      case 'gather_start':
        promptDuration = null;
        break;
    }
    if (promptText) this.showPrompt(promptText, promptDuration);
  }

  startGatherAction(targetInstance: any): void {
    if (this.activeGather) return;
    const resource = targetInstance.userData.resource as string;
    const gatherTime = (targetInstance.userData.gatherTime as number) || 2000;
    this.activeGather = { targetInstance, startTime: performance.now(), duration: gatherTime, resource };
    this.showPrompt(`Gathering ${resource}... (0%)`);
    this.eventLog.addEntry(`Started gathering ${resource}...`);
    this.player.velocity.x = 0;
    this.player.velocity.z = 0;
  }

  updateGatherAction(deltaTime: number): void {
    if (!this.activeGather) return;
    const elapsedTime = performance.now() - this.activeGather.startTime;
    const progress = Math.min(1, elapsedTime / this.activeGather.duration);
    this.showPrompt(`Gathering ${this.activeGather.resource}... (${Math.round(progress * 100)}%)`);
    if (progress >= 1) this.completeGatherAction();
  }

  completeGatherAction(): void {
    if (!this.activeGather) return;
    const { resource, targetInstance } = this.activeGather;
    if (this.inventory.addItem(resource, 1)) {
      this.eventLog.addEntry(`Gathered 1 ${resource}.`);
      if (targetInstance.userData.isDepletable) {
        targetInstance.userData.isInteractable = false;
        if (targetInstance instanceof Player || targetInstance instanceof InteractableObject) {
          if (targetInstance.mesh) targetInstance.mesh.visible = false;
        } else {
          (targetInstance as Object3D).visible = false;
        }
        const respawnTime = targetInstance.userData.respawnTime || 15000;
        setTimeout(() => {
          if (targetInstance.userData) {
            targetInstance.userData.isInteractable = true;
            if (targetInstance instanceof Player || targetInstance instanceof InteractableObject) {
              if (targetInstance.mesh) targetInstance.mesh.visible = true;
            } else {
              (targetInstance as Object3D).visible = true;
            }
          }
        }, respawnTime);
      } else if (targetInstance.userData.isSimpleObject && typeof (targetInstance as InteractableObject).removeFromWorld === 'function') {
        (targetInstance as InteractableObject).removeFromWorld();
      }
    } else {
      this.eventLog.addEntry(`Inventory full, could not gather ${resource}.`);
    }
    this.activeGather = null;
    this.hidePrompt();
    this.currentTarget = null;
    this.currentTargetMesh = null;
  }

  cancelGatherAction(): void {
    if (!this.activeGather) return;
    this.eventLog.addEntry(`Gathering ${this.activeGather.resource} cancelled.`);
    this.activeGather = null;
    this.hidePrompt();
  }

  showPrompt(text: string, duration: number | null = null): void {
    if (!this.interactionPromptElement || (this.activeGather && duration === null)) return;
    this.interactionPromptElement.textContent = text;
    this.interactionPromptElement.style.display = 'block';
    clearTimeout(this.promptTimeout ?? undefined);
    this.promptTimeout = null;
    if (duration && duration > 0) {
      this.promptTimeout = setTimeout(() => {
        if (this.interactionPromptElement?.textContent === text) this.hidePrompt();
      }, duration);
    }
  }

  hidePrompt(): void {
    if (!this.interactionPromptElement || this.activeGather || this.promptTimeout) return;
    this.interactionPromptElement.style.display = 'none';
    this.interactionPromptElement.textContent = '';
  }
}

export class Physics {
  player: Player;
  collidableObjects: Object3D[];
  collisionCheckRadiusSq: number = 20 * 20;
  private overlap = new Vector3();
  private centerPlayer = new Vector3();
  private centerObject = new Vector3();
  private sizePlayer = new Vector3();
  private sizeObject = new Vector3();
  private pushVector = new Vector3();
  private objectBoundingBox = new Box3();

  constructor(player: Player, collidableObjects: Object3D[]) {
    this.player = player;
    this.collidableObjects = collidableObjects;
  }

  update(deltaTime: number): void {
    if (this.player.isDead) return;
    const playerBox = this.player.boundingBox;
    if (!playerBox || playerBox.isEmpty()) this.player.updateBoundingBox();
    const playerPos = this.player.mesh!.position;
    this.collidableObjects.forEach(object => {
      if (!object || object === this.player.mesh || !object.userData?.isCollidable || object.userData?.isTerrain || !object.parent) return;
      if (object.userData?.entityReference?.isDead) return;
      const objectPosition = object.getWorldPosition(new Vector3());
      if (playerPos.distanceToSquared(objectPosition) > this.collisionCheckRadiusSq) return;
      let objectBox = object.userData.boundingBox as Box3 | undefined;
      if (!objectBox || objectBox.isEmpty()) {
        this.objectBoundingBox.setFromObject(object, true);
        objectBox = this.objectBoundingBox;
        if (objectBox.isEmpty()) return;
      }
      if (playerBox.intersectsBox(objectBox)) {
        this.resolveCollision(playerBox, objectBox, object);
        this.player.updateBoundingBox();
      }
    });
  }

  resolveCollision(playerBox: Box3, objectBox: Box3, object: Object3D): void {
    playerBox.getCenter(this.centerPlayer);
    objectBox.getCenter(this.centerObject);
    playerBox.getSize(this.sizePlayer);
    objectBox.getSize(this.sizeObject);
    this.overlap.x = (this.sizePlayer.x / 2 + this.sizeObject.x / 2) - Math.abs(this.centerPlayer.x - this.centerObject.x);
    this.overlap.y = (this.sizePlayer.y / 2 + this.sizeObject.y / 2) - Math.abs(this.centerPlayer.y - this.centerObject.y);
    this.overlap.z = (this.sizePlayer.z / 2 + this.sizeObject.z / 2) - Math.abs(this.centerPlayer.z - this.centerObject.z);
    let minOverlap = Infinity;
    let pushAxis = -1;
    if (this.overlap.x > 0 && this.overlap.x < minOverlap) { minOverlap = this.overlap.x; pushAxis = 0; }
    if (this.overlap.y > 0 && this.overlap.y < minOverlap) { minOverlap = this.overlap.y; pushAxis = 1; }
    if (this.overlap.z > 0 && this.overlap.z < minOverlap) { minOverlap = this.overlap.z; pushAxis = 2; }
    if (pushAxis === -1 || minOverlap < 0.0001) return;
    this.pushVector.set(0, 0, 0);
    const pushMagnitude = minOverlap + 0.001;
    switch (pushAxis) {
      case 0:
        this.pushVector.x = (this.centerPlayer.x > this.centerObject.x) ? pushMagnitude : -pushMagnitude;
        if (Math.sign(this.player.velocity.x) === Math.sign(this.pushVector.x)) this.player.velocity.x = 0;
        break;
      case 1:
        this.pushVector.y = (this.centerPlayer.y > this.centerObject.y) ? pushMagnitude : -pushMagnitude;
        if (this.pushVector.y > 0.01 && this.player.velocity.y <= 0) {
          this.player.velocity.y = 0;
          this.player.isOnGround = true;
          this.player.canJump = true;
        } else if (this.pushVector.y < -0.01 && this.player.velocity.y > 0) {
          this.player.velocity.y = 0;
        }
        break;
      case 2:
        this.pushVector.z = (this.centerPlayer.z > this.centerObject.z) ? pushMagnitude : -pushMagnitude;
        if (Math.sign(this.player.velocity.z) === Math.sign(this.pushVector.z)) this.player.velocity.z = 0;
        break;
    }
    this.player.mesh!.position.add(this.pushVector);
  }
}

export class ThirdPersonCamera {
  camera: PerspectiveCamera;
  target: Object3D;
  idealOffset: Vector3 = new Vector3(0, 2.5, 5.0);
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
    this.pitchAngle = MathUtils.clamp(this.pitchAngle, this.minPitch, this.maxPitch);
  }

  update(deltaTime: number, collidables: Object3D[]): void {
    if (!this.target) return;
    this.target.getWorldPosition(this.targetPosition);
    const targetQuaternion = this.target.quaternion;
    this.offset.copy(this.idealOffset)
      .applyAxisAngle(new Vector3(1, 0, 0), this.pitchAngle)
      .applyQuaternion(targetQuaternion);
    this.idealPosition.copy(this.targetPosition).add(this.offset);
    this.cameraDirection.copy(this.idealPosition).sub(this.targetPosition);
    let idealDistance = this.cameraDirection.length();
    this.cameraDirection.normalize();
    this.rayOrigin.copy(this.targetPosition).addScaledVector(this.cameraDirection, 0.2);
    this.collisionRaycaster.set(this.rayOrigin, this.cameraDirection);
    this.collisionRaycaster.far = Math.max(0, idealDistance - 0.2);
    const collisionCheckObjects = collidables.filter(obj => obj !== this.target && obj?.userData?.isCollidable);
    const intersects = this.collisionRaycaster.intersectObjects(collisionCheckObjects, true);
    let actualDistance = idealDistance;
    if (intersects.length > 0) {
      actualDistance = intersects.reduce((minDist, intersect) => Math.min(minDist, intersect.distance), idealDistance) + 0.2 - this.collisionOffset;
      actualDistance = Math.max(this.minOffsetDistance, actualDistance);
    }
    actualDistance = MathUtils.clamp(actualDistance, this.minOffsetDistance, this.maxOffsetDistance);
    this.finalPosition.copy(this.targetPosition).addScaledVector(this.cameraDirection, actualDistance);
    const targetHeight = this.target.userData?.height ?? 1.8;
    this.idealLookat.copy(this.targetPosition).add(new Vector3(0, targetHeight * 0.6, 0));
    smoothVectorLerp(this.currentPosition, this.finalPosition, this.lerpAlphaPositionBase, deltaTime);
    smoothVectorLerp(this.currentLookat, this.idealLookat, this.lerpAlphaLookatBase, deltaTime);
    this.camera.position.copy(this.currentPosition);
    this.camera.lookAt(this.currentLookat);
  }
}

export class Controls {
  player: Player | null;
  cameraController: ThirdPersonCamera | null;
  domElement: HTMLElement;
  keys: KeyState = {};
  mouse: MouseState = { x: 0, y: 0, dx: 0, dy: 0, buttons: {} };
  isPointerLocked: boolean = false;
  playerRotationSensitivity: number = 0.0025;
  moveState: MoveState = { forward: 0, right: 0, jump: false, sprint: false, interact: false };
  keyDownListeners: Record<string, Array<() => void>> = {};
  mouseClickListeners: Record<number, Array<(event: MouseEvent) => void>> = {};
  boundOnKeyDown: (event: KeyboardEvent) => void;
  boundOnKeyUp: (event: KeyboardEvent) => void;
  boundOnMouseDown: (event: MouseEvent) => void;
  boundOnMouseUp: (event: MouseEvent) => void;
  boundOnMouseMove: (event: MouseEvent) => void;
  boundOnClick: (event: MouseEvent) => void;
  boundOnPointerLockChange: () => void;
  boundOnPointerLockError: () => void;

  constructor(player: Player | null, cameraController: ThirdPersonCamera | null, domElement: HTMLElement | null) {
    this.player = player;
    this.cameraController = cameraController;
    this.domElement = domElement ?? document.body;
    this.boundOnKeyDown = this.onKeyDown.bind(this);
    this.boundOnKeyUp = this.onKeyUp.bind(this);
    this.boundOnMouseDown = this.onMouseDown.bind(this);
    this.boundOnMouseUp = this.onMouseUp.bind(this);
    this.boundOnMouseMove = this.onMouseMove.bind(this);
    this.boundOnClick = this.onClick.bind(this);
    this.boundOnPointerLockChange = this.onPointerLockChange.bind(this);
    this.boundOnPointerLockError = this.onPointerLockError.bind(this);
    this.initListeners();
  }

  initListeners(): void {
    document.addEventListener('keydown', this.boundOnKeyDown, false);
    document.addEventListener('keyup', this.boundOnKeyUp, false);
    document.addEventListener('mousedown', this.boundOnMouseDown, false);
    document.addEventListener('mouseup', this.boundOnMouseUp, false);
    document.addEventListener('mousemove', this.boundOnMouseMove, false);
    this.domElement.addEventListener('click', this.boundOnClick, false);
    document.addEventListener('pointerlockchange', this.boundOnPointerLockChange, false);
    document.addEventListener('pointerlockerror', this.boundOnPointerLockError, false);
  }

  addKeyDownListener(keyCode: string, callback: () => void): void {
    if (!this.keyDownListeners[keyCode]) this.keyDownListeners[keyCode] = [];
    this.keyDownListeners[keyCode].push(callback);
  }

  addMouseClickListener(buttonIndex: number, callback: (event: MouseEvent) => void): void {
    if (!this.mouseClickListeners[buttonIndex]) this.mouseClickListeners[buttonIndex] = [];
    this.mouseClickListeners[buttonIndex].push(callback);
  }

  lockPointer(): void {
    if ('requestPointerLock' in this.domElement && document.pointerLockElement !== this.domElement) {
      this.domElement.requestPointerLock();
    }
  }

  unlockPointer(): void {
    if (document.pointerLockElement === this.domElement) document.exitPointerLock();
  }

  onKeyDown(event: KeyboardEvent): void {
    const keyCode = event.code;
    if (this.keys[keyCode]) return;
    this.keys[keyCode] = true;
    this.keyDownListeners[keyCode]?.forEach(cb => cb());
    if (keyCode === 'Space') this.moveState.jump = true;
    if (keyCode === 'KeyE') this.moveState.interact = true;
    this.updateContinuousMoveState();
  }

  onKeyUp(event: KeyboardEvent): void {
    this.keys[event.code] = false;
    this.updateContinuousMoveState();
  }

  onMouseDown(event: MouseEvent): void {
    this.mouse.buttons[event.button] = true;
    this.mouseClickListeners[event.button]?.forEach(cb => cb(event));
  }

  onMouseUp(event: MouseEvent): void {
    this.mouse.buttons[event.button] = false;
  }

  onMouseMove(event: MouseEvent): void {
    if (this.isPointerLocked) {
      this.mouse.dx += event.movementX ?? 0;
      this.mouse.dy += event.movementY ?? 0;
    } else {
      this.mouse.x = event.clientX;
      this.mouse.y = event.clientY;
    }
  }

  onClick(event: MouseEvent): void {
    const gameIsPaused = (window as any).game?.isPaused ?? false;
    if (!this.isPointerLocked && !gameIsPaused) this.lockPointer();
  }

  onPointerLockChange(): void {
    if (document.pointerLockElement === this.domElement) {
      this.isPointerLocked = true;
      this.mouse.dx = 0;
      this.mouse.dy = 0;
    } else {
      this.isPointerLocked = false;
      this.keys = {};
      this.mouse.buttons = {};
      this.mouse.dx = 0;
      this.mouse.dy = 0;
      this.updateContinuousMoveState();
    }
  }

  onPointerLockError(): void {
    this.isPointerLocked = false;
  }

  updateContinuousMoveState(): void {
    const W = this.keys['KeyW'] || this.keys['ArrowUp'];
    const S = this.keys['KeyS'] || this.keys['ArrowDown'];
    const D = this.keys['KeyD'] || this.keys['ArrowRight'];
    const A = this.keys['KeyA'] || this.keys['ArrowLeft'];
    const Sprint = this.keys['ShiftLeft'] || this.keys['ShiftRight'];
    this.moveState.forward = (W ? 1 : 0) - (S ? 1 : 0);
    this.moveState.right = (D ? 1 : 0) - (A ? 1 : 0);
    this.moveState.sprint = Sprint ?? false;
  }

  update(deltaTime: number): void {
    if (!this.isPointerLocked) {
      this.mouse.dx = 0;
      this.mouse.dy = 0;
      return;
    }
    if (this.player && Math.abs(this.mouse.dx) > 0) {
      const yawDelta = -this.mouse.dx * this.playerRotationSensitivity;
      this.player.mesh!.rotateY(yawDelta);
    }
    if (this.cameraController && Math.abs(this.mouse.dy) > 0) {
      this.cameraController.handleMouseInput(this.mouse.dx, this.mouse.dy);
    }
    this.mouse.dx = 0;
    this.mouse.dy = 0;
  }

  consumeInteraction(): boolean {
    if (!this.moveState.interact) return false;
    this.moveState.interact = false;
    return true;
  }
}