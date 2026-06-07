import GUI from 'lil-gui';
import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import {
  BloomEffect,
  BrightnessContrastEffect,
  EffectComposer,
  EffectPass,
  RenderPass,
  VignetteEffect,
} from 'postprocessing';
import { SparkRenderer, SplatMesh } from '@sparkjsdev/spark';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
await RAPIER.init();

/**
 * Environment GLB `ShadowMaterial` draws in the transparent pass after splats (`renderOrder`).
 * `depthWrite: false` keeps splats from being punched out; `depthTest: true` (on the material)
 * keeps shadows from drawing on top of opaque geometry like the character mesh (opaque pass runs first).
 */
const SHADOW_CATCHER_RENDER_ORDER = 1000;

/** Player visual (`public/`). Animations: idle, walk, run, fall, pick, heal. */
const CHARACTER_GLB_URL = '/silo.glb';

/**
 * **Swap the world here only:** Gaussian splat (`.spz`) + invisible collider mesh (`.glb`).
 * Vite serves paths from `public/`; the rest of the file uses generic names (`splatMesh`, `colliderGlbRoot`, …).
 */
const WORLD_ASSETS = {
  splatSpz: '/fantasy2.spz',
  colliderGlb: '/fantasy2-collider.glb',
  /** Uniform scale on the GLB root before Rapier trimesh bake (line up with splat authoring / game units). */
  colliderGlbUniformScale: 1,
} as const;

/** Total KCC capsule height (meters): cylinder section + two hemispheres = height + 2 * radius */
const CHARACTER_CAPSULE_HEIGHT = 4;
/** Orbit target Y = character feet Y + this (focuses upper body / head). */
const CAMERA_ORBIT_TARGET_Y_OFFSET = CHARACTER_CAPSULE_HEIGHT * 0.74;
/** Default third-person follow distance (world units). */
const TP_CAMERA_DISTANCE = 12;
/** How far up from the orbit target the camera sits at rest (elevation angle). */
const TP_CAMERA_HEIGHT_OFFSET = 4;
/** Cylinder radius: 50% wider than prior 0.55 m */
const characterRadiusStanding = 0.55 * 1.5;
const characterHeightStanding = CHARACTER_CAPSULE_HEIGHT - 2 * characterRadiusStanding;
const characterMass = 1000;
const maxSlopeAngle = (45 * Math.PI) / 180;
const characterPadding = 0.02;

const tuning = {
  moveSpeed: 5,
  /** Move speed multiplier while Shift is held */
  sprintMoveMultiplier: 1.85,
  /** Extra walk clip speed multiplier while Shift is held (stacks with walk anim speed) */
  sprintWalkAnimMultiplier: 1.4,
  jumpSpeed: 12,
  gravityY: -25,
  enableWalkStairs: true,
  enableStickToFloor: true,
  controlMovementDuringJump: true,
  enableCharacterInertia: true,
  /** World-space height of the character mesh (matches capsule) */
  dogHeight: 2.8,
  dogYawDeg: 0,
  dogOffsetX: 0,
  /** Extra vertical offset in rig space (positive lifts the dog along the capsule axis) */
  dogOffsetY: 0,
  dogOffsetZ: 0,
  /** Higher = dog snaps to move direction faster (~rad/s style exponential) */
  dogTurnSpeed: 6,
  /** Horizontal speed above this plays walk clip (m/s) */
  dogWalkSpeedThreshold: 0.08,
  /**
   * Seconds Rapier can report "not grounded" before dog anim treats you as airborne (reduces
   * happy/air flicker on small bumps; jump/input still uses instant physics grounding).
   */
  dogAnimGroundReleaseHold: 0.11,
  /** Larger = `dogWalkSpeedThreshold` reacts more slowly to horizontal speed spikes (reduces walk/idle flicker). */
  dogAnimWalkSpeedSmoothing: 40,
  /** Crossfade seconds between Idle and walk */
  dogAnimCrossfade: 0.28,
  /** Walk clip playback rate (1 = normal, 2 = double speed) */
  dogWalkAnimTimeScale: 0.85,
  showPhysicsDebug: false,
  debugBodies: true,
  /** Uniform scale for the Spark splat mesh (see `WORLD_ASSETS.splatSpz`). */
  splatUniformScale: 5,
  /** SparkRenderer DOF: distance to focal plane ([`focalDistance`](https://sparkjs.dev/docs/spark-renderer/#optional-parameters)). */
  sparkFocalDistance: 0,
  /** Full-width aperture angle for Spark in **degrees**; converted to radians for [`apertureAngle`](https://sparkjs.dev/docs/spark-renderer/#optional-parameters) (0 = off). */
  sparkApertureAngleDeg: 0,

  ambientIntensity: 0.38,
  sunIntensity: 1.62,
  /** When `sunShadowFollowCharacter` is true, these are **offsets in world space** from character feet → sun position. */
  sunPosX: -15.5,
  sunPosY: 102,
  sunPosZ: 12,
  /** Move the directional light and its shadow frustum with the player (shadow map stays high-res near you). */
  sunShadowFollowCharacter: true,
  sunColor: new THREE.Color(0xffe8c9),
  fillIntensity: 0.32,
  fillPosX: -26,
  fillPosY: 22,
  fillPosZ: -24,
  fillColor: new THREE.Color(0xa7cdff),

  shadowMapSize: 4096,
  shadowBias: 0,
  shadowNormalBias: 0,
  shadowRadius: 1,
  shadowCameraNear: 0.5,
  shadowCameraFar: 200,
  shadowCameraHalfExtent: 30,
  shadowMapType: 'PCFSoftShadowMap' as
    | 'BasicShadowMap'
    | 'PCFShadowMap'
    | 'PCFSoftShadowMap'
    | 'VSMShadowMap',
  /** How strongly shadows darken surfaces (`mix(1, shadow, intensity)`); lower feels softer. */
  shadowIntensity: 1,
  /** Blur quality for VSM shadow maps only (more = smoother, slower). */
  shadowBlurSamples: 8,
  /** Shared `ShadowMaterial` for collider GLB meshes (see `WORLD_ASSETS.colliderGlb`). */
  colliderGlbShadowOpacity: 0.23,
  colliderGlbShadowColor: new THREE.Color(0x000000),

  /** [pmndrs/postprocessing](https://github.com/pmndrs/postprocessing) */
  ppEnabled: true,
  ppBloomIntensity: 0.3,
  ppBloomThreshold: 0.29,
  ppBloomSmoothing: 0.5,
  ppBrightness: -0.1,
  ppContrast: 0.1,
  ppVignetteDarkness: 0.57,
  ppVignetteOffset: 0.5,
};

/** Capsule center Y in world space = feet Y + this (matches `THREE.CapsuleGeometry` layout). */
const capsuleCenterY = 0.5 * characterHeightStanding + characterRadiusStanding;

const rapierWorld = new RAPIER.World({ x: 0, y: tuning.gravityY, z: 0 });

const characterController = rapierWorld.createCharacterController(characterPadding);
characterController.setUp({ x: 0, y: 1, z: 0 });
characterController.setSlideEnabled(true);
characterController.setMaxSlopeClimbAngle(maxSlopeAngle);
characterController.setMinSlopeSlideAngle((30 * Math.PI) / 180);
characterController.setApplyImpulsesToDynamicBodies(true);
characterController.setCharacterMass(characterMass);
characterController.enableAutostep(0.4, 0.2, true);
characterController.enableSnapToGround(0.5);

type CharacterState = {
  desiredVelocity: THREE.Vector3;
  linearVelocity: THREE.Vector3;
  allowSliding: boolean;
  /** Grounding from the last `computeColliderMovement` (Rapier [character controller](https://rapier.rs/docs/user_guides/bevy_plugin/character_controller/)). */
  grounded: boolean;
};

const characterState: CharacterState = {
  desiredVelocity: new THREE.Vector3(),
  linearVelocity: new THREE.Vector3(),
  allowSliding: false,
  grounded: false,
};

const spawnFeetY = 4;
const playerBodyDesc = RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(
  0,
  spawnFeetY + capsuleCenterY,
  0,
);
const playerBody = rapierWorld.createRigidBody(playerBodyDesc);
const playerColliderDesc = RAPIER.ColliderDesc.capsule(
  characterHeightStanding / 2,
  characterRadiusStanding,
);
const playerCollider = rapierWorld.createCollider(playerColliderDesc, playerBody);

/** Character feet (world) for sun + shadow follow; reused in `syncLightingAndShadowsFromTuning`. */
const _sunShadowFollowFeet = new THREE.Vector3();

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x87ceeb);

const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 500);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.NoToneMapping;
document.body.appendChild(renderer.domElement);

/** PMREM env from `public/pano.jpg` (character). */
let dogReflectionEnvMap: THREE.Texture | null = null;

rapierWorld.updateSceneQueries();


function tryApplyPanoReflectionEnv() {
  const env = dogReflectionEnvMap;
  if (!env) return;

  if (dogModel) {
    dogModel.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (!mesh.isMesh || !mesh.material) return;
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const mat of mats) {
        if (mat instanceof THREE.MeshStandardMaterial || mat instanceof THREE.MeshPhysicalMaterial) {
          mat.envMap = env;
          mat.envMapIntensity = 1;
        }
      }
    });
  }

}

new THREE.TextureLoader().load(
  '/pano.jpg',
  (tex) => {
    tex.mapping = THREE.EquirectangularReflectionMapping;
    tex.colorSpace = THREE.SRGBColorSpace;
    const pmrem = new THREE.PMREMGenerator(renderer);
    pmrem.compileEquirectangularShader();
    const { texture } = pmrem.fromEquirectangular(tex);
    tex.dispose();
    pmrem.dispose();
    dogReflectionEnvMap = texture;
    tryApplyPanoReflectionEnv();
  },
  undefined,
  (err) => {
    console.warn('Could not load /pano.jpg — add it under public/pano.jpg for character reflections', err);
  },
);

/** Gaussian splat background ([Spark docs](https://sparkjs.dev/docs/)); URL from `WORLD_ASSETS`. */
const sparkRenderer = new SparkRenderer({
  renderer,
  enableLod: true,
  /** Higher skips tinier screen-space splats; ~2 is often hard to notice ([performance tuning](https://sparkjs.dev/docs/)). */
  lodRenderScale: 2,
  focalDistance: tuning.sparkFocalDistance,
  apertureAngle: THREE.MathUtils.degToRad(tuning.sparkApertureAngleDeg),
});
scene.add(sparkRenderer);
const splatMesh = new SplatMesh({
  url: WORLD_ASSETS.splatSpz,
  /** Required so the asset gets a LoD tree (`lodSplats`); otherwise Spark renders the full splat count every frame. */
  lod: true,
});
/** Spark’s butterfly sample used a 180° X flip; this asset reads upright without it. */
splatMesh.quaternion.identity();
splatMesh.position.set(0, 0, 0);
splatMesh.scale.setScalar(tuning.splatUniformScale);
scene.add(splatMesh);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.enablePan = false;
/** Third-person distance clamp: close enough to read the character, far enough to see surroundings. */
controls.minDistance = 4;
controls.maxDistance = 28;
/** Prevent the camera going underground or flipping overhead. */
controls.minPolarAngle = Math.PI * 0.08;  // ~14° from straight up
controls.maxPolarAngle = Math.PI * 0.72;  // ~130° — stops before going below the floor
controls.target.set(0, spawnFeetY + CAMERA_ORBIT_TARGET_Y_OFFSET, 0);
camera.position.set(0, spawnFeetY + CAMERA_ORBIT_TARGET_Y_OFFSET + TP_CAMERA_HEIGHT_OFFSET, TP_CAMERA_DISTANCE);

const brightnessContrastEffect = new BrightnessContrastEffect({
  brightness: tuning.ppBrightness,
  contrast: tuning.ppContrast,
});
const bloomEffect = new BloomEffect({
  mipmapBlur: true,
  luminanceThreshold: tuning.ppBloomThreshold,
  luminanceSmoothing: tuning.ppBloomSmoothing,
  intensity: tuning.ppBloomIntensity,
  radius: 0.55,
});
const vignetteEffect = new VignetteEffect({
  darkness: tuning.ppVignetteDarkness,
  offset: tuning.ppVignetteOffset,
});
const effectPass = new EffectPass(camera, brightnessContrastEffect, bloomEffect, vignetteEffect);
const composer = new EffectComposer(renderer, {
  depthBuffer: true,
  stencilBuffer: false,
});
composer.addPass(new RenderPass(scene, camera));
composer.addPass(effectPass);
composer.setSize(window.innerWidth, window.innerHeight);

function syncPostProcessingFromTuning() {
  if (!tuning.ppEnabled) {
    bloomEffect.intensity = 0;
    brightnessContrastEffect.brightness = 0;
    brightnessContrastEffect.contrast = 0;
    vignetteEffect.darkness = 0;
    return;
  }
  bloomEffect.intensity = tuning.ppBloomIntensity;
  bloomEffect.luminanceMaterial.threshold = tuning.ppBloomThreshold;
  bloomEffect.luminanceMaterial.smoothing = tuning.ppBloomSmoothing;
  brightnessContrastEffect.brightness = tuning.ppBrightness;
  brightnessContrastEffect.contrast = tuning.ppContrast;
  vignetteEffect.darkness = tuning.ppVignetteDarkness;
  vignetteEffect.offset = tuning.ppVignetteOffset;
}

const ambientLight = new THREE.AmbientLight(0xffffff, tuning.ambientIntensity);
scene.add(ambientLight);

const sun = new THREE.DirectionalLight(0xfff5e6, tuning.sunIntensity);
sun.castShadow = true;
scene.add(sun);
sun.target.position.set(0, 0, 0);
scene.add(sun.target);

const fillDirectional = new THREE.DirectionalLight(0xd4e8ff, tuning.fillIntensity);
fillDirectional.castShadow = false;
scene.add(fillDirectional);

/** One shadow-catcher material for every mesh in the collider GLB; created when the asset finishes loading. */
let colliderGlbShadowMaterial: THREE.ShadowMaterial | null = null;

function syncLightingAndShadowsFromTuning() {
  ambientLight.intensity = tuning.ambientIntensity;
  sun.color.copy(tuning.sunColor);
  sun.intensity = tuning.sunIntensity;
  if (tuning.sunShadowFollowCharacter) {
    const t = playerBody.translation();
    _sunShadowFollowFeet.set(t.x, t.y - capsuleCenterY, t.z);
    sun.target.position.copy(_sunShadowFollowFeet);
    sun.position.set(
      _sunShadowFollowFeet.x + tuning.sunPosX,
      _sunShadowFollowFeet.y + tuning.sunPosY,
      _sunShadowFollowFeet.z + tuning.sunPosZ,
    );
  } else {
    sun.target.position.set(0, 0, 0);
    sun.position.set(tuning.sunPosX, tuning.sunPosY, tuning.sunPosZ);
  }

  const shadowCam = sun.shadow.camera as THREE.OrthographicCamera;
  shadowCam.near = tuning.shadowCameraNear;
  shadowCam.far = tuning.shadowCameraFar;
  const half = tuning.shadowCameraHalfExtent;
  shadowCam.left = -half;
  shadowCam.right = half;
  shadowCam.top = half;
  shadowCam.bottom = -half;
  shadowCam.updateProjectionMatrix();

  sun.shadow.bias = tuning.shadowBias;
  sun.shadow.normalBias = tuning.shadowNormalBias;
  sun.shadow.radius = tuning.shadowRadius;
  sun.shadow.intensity = tuning.shadowIntensity;
  sun.shadow.blurSamples = Math.round(
    Math.min(32, Math.max(4, tuning.shadowBlurSamples)),
  );

  const ms = Math.min(4096, Math.max(256, Math.round(tuning.shadowMapSize / 128) * 128));
  if (sun.shadow.mapSize.width !== ms) {
    sun.shadow.map?.dispose();
    sun.shadow.map = null;
    sun.shadow.mapSize.set(ms, ms);
  }

  renderer.shadowMap.type = THREE[tuning.shadowMapType];

  fillDirectional.color.copy(tuning.fillColor);
  fillDirectional.intensity = tuning.fillIntensity;
  fillDirectional.position.set(tuning.fillPosX, tuning.fillPosY, tuning.fillPosZ);

  if (colliderGlbShadowMaterial) {
    colliderGlbShadowMaterial.color.copy(tuning.colliderGlbShadowColor);
    colliderGlbShadowMaterial.opacity = tuning.colliderGlbShadowOpacity;
    colliderGlbShadowMaterial.transparent = tuning.colliderGlbShadowOpacity < 0.999;
    colliderGlbShadowMaterial.depthWrite = false;
    colliderGlbShadowMaterial.depthTest = true;
  }
}

syncLightingAndShadowsFromTuning();
syncPostProcessingFromTuning();

const rapierDebugGeom = new THREE.BufferGeometry();
const rapierDebugPos = new THREE.BufferAttribute(new Float32Array(0), 3);
const rapierDebugCol = new THREE.BufferAttribute(new Float32Array(0), 3);
rapierDebugGeom.setAttribute('position', rapierDebugPos);
rapierDebugGeom.setAttribute('color', rapierDebugCol);
const rapierDebugLines = new THREE.LineSegments(
  rapierDebugGeom,
  new THREE.LineBasicMaterial({ vertexColors: true, toneMapped: false }),
);
rapierDebugLines.visible = false;
scene.add(rapierDebugLines);

const capsuleCylinderLength = characterHeightStanding;
const capsuleMat = new THREE.MeshStandardMaterial({
  color: 0xc45cff,
  roughness: 0.4,
  metalness: 0.15,
  transparent: true,
  opacity: 0,
  depthWrite: false,
  wireframe: false,
});
/** Visual capsule (Rapier capsule collider on the kinematic body — this mesh has no physics). */
const capsuleMesh = new THREE.Mesh(new THREE.CapsuleGeometry(characterRadiusStanding, capsuleCylinderLength, 6, 12), capsuleMat);
capsuleMesh.castShadow = false;

/** Feet at origin; follows character capsule center each frame */
const playerRoot = new THREE.Group();
scene.add(playerRoot);

/** CapsuleGeometry is centered on the mesh; mesh bottom in rig space is y = -capsuleCenterY */

/** Rig that moves with the character: cylinder mesh + skinned GLB (parent under Group, not the capsule Mesh). */
const capsuleRig = new THREE.Group();
capsuleRig.name = 'CapsuleRig';
capsuleRig.position.set(0, capsuleCenterY, 0);
playerRoot.add(capsuleRig);
capsuleMesh.position.set(0, 0, 0);
capsuleRig.add(capsuleMesh);

const dogHolder = new THREE.Group();
dogHolder.name = 'CharacterVisual';
capsuleRig.add(dogHolder);

/** Yaw toward movement; GLB stays child here so layout yaw stays separate */
const dogFacingPivot = new THREE.Group();
dogFacingPivot.name = 'CharacterFacing';
dogHolder.add(dogFacingPivot);

const _dogFwd = new THREE.Vector3();
const _dogInvQuat = new THREE.Quaternion();
let dogSmoothedFacingYaw = 0;

function shortestAngleDelta(from: number, to: number) {
  return Math.atan2(Math.sin(to - from), Math.cos(to - from));
}

function lerpAngleRad(current: number, target: number, t: number) {
  return current + shortestAngleDelta(current, target) * t;
}

function syncDogHolderPosition() {
  dogHolder.position.set(tuning.dogOffsetX, -capsuleCenterY + tuning.dogOffsetY, tuning.dogOffsetZ);
}

syncDogHolderPosition();

let dogModel: THREE.Object3D | null = null;

const CLIP_IDLE = 'idle';
const CLIP_FALL = 'fall';
const CLIP_WALK = 'walk';
const CLIP_RUN  = 'run';

function findAnimationClip(clips: THREE.AnimationClip[], name: string): THREE.AnimationClip | undefined {
  const exact = clips.find((c) => c.name === name);
  if (exact) return exact;
  const want = name.toLowerCase();
  return clips.find((c) => c.name.toLowerCase() === want);
}

let dogMixer: THREE.AnimationMixer | null = null;
let dogIdleAction: THREE.AnimationAction | null = null;
let dogFallAction: THREE.AnimationAction | null = null;
let dogWalkAction: THREE.AnimationAction | null = null;
let dogRunAction: THREE.AnimationAction | null = null;
let dogAnimPlaying: 'idle' | 'walk' | 'run' | 'fall' = 'idle';

/** Animation-only: stays true briefly after physics reports not grounded (see `dogAnimGroundReleaseHold`). */
let dogAnimStableGrounded = false;
let dogAnimAirAccum = 0;
/** Low-pass horizontal speed for walk vs idle (m/s). */
let dogSmoothedHSpeed = 0;

function updateDogAnimStability(deltaTime: number, physicsGrounded: boolean) {
  if (physicsGrounded) {
    dogAnimStableGrounded = true;
    dogAnimAirAccum = 0;
  } else {
    dogAnimAirAccum += deltaTime;
    if (dogAnimAirAccum >= tuning.dogAnimGroundReleaseHold) {
      dogAnimStableGrounded = false;
    }
  }

  const lv = characterState.linearVelocity;
  const h = Math.hypot(lv.x, lv.z);
  const k = tuning.dogAnimWalkSpeedSmoothing;
  const t = 1 - Math.exp(-k * deltaTime);
  dogSmoothedHSpeed += (h - dogSmoothedHSpeed) * t;
}

function dogClipActionFor(anim: typeof dogAnimPlaying): THREE.AnimationAction | null {
  switch (anim) {
    case 'idle':
      return dogIdleAction;
    case 'walk':
      return dogWalkAction;
    case 'run':
      return dogRunAction;
    case 'fall':
      return dogFallAction;
    default:
      return null;
  }
}

function layoutDogModel() {
  if (!dogModel) return;
  const previousParent = dogModel.parent;
  if (previousParent) previousParent.remove(dogModel);
  scene.add(dogModel);

  dogModel.position.set(0, 0, 0);
  dogModel.quaternion.identity();
  dogModel.scale.set(1, 1, 1);
  dogModel.updateMatrixWorld(true);

  const box = new THREE.Box3().setFromObject(dogModel);
  const h = Math.max(box.max.y - box.min.y, 1e-4);
  const s = tuning.dogHeight / h;
  dogModel.scale.setScalar(s);
  dogModel.updateMatrixWorld(true);
  box.setFromObject(dogModel);
  dogModel.position.set(-(box.min.x + box.max.x) / 2, -box.min.y, -(box.min.z + box.max.z) / 2);
  dogModel.rotation.y = THREE.MathUtils.degToRad(tuning.dogYawDeg);

  scene.remove(dogModel);
  dogFacingPivot.add(dogModel);
  syncDogHolderPosition();
}

function initDogAnimations(gltf: { animations: THREE.AnimationClip[] }) {
  if (!dogModel || gltf.animations.length === 0) return;

  dogMixer = new THREE.AnimationMixer(dogModel);
  const clips = gltf.animations;
  const names = clips.map((a) => a.name).join(', ');

  const idleClip = findAnimationClip(clips, CLIP_IDLE);
  const fallClip = findAnimationClip(clips, CLIP_FALL);
  const walkClip = findAnimationClip(clips, CLIP_WALK);
  const runClip = findAnimationClip(clips, CLIP_RUN);

  if (!idleClip) {
    console.warn(`[character] Missing "${CLIP_IDLE}" clip. Available: ${names}`);
  } else {
    dogIdleAction = dogMixer.clipAction(idleClip);
    dogIdleAction.setLoop(THREE.LoopRepeat, Infinity);
  }
  if (!fallClip) {
    console.warn(`[character] Missing "${CLIP_FALL}" clip. Available: ${names}`);
  } else {
    dogFallAction = dogMixer.clipAction(fallClip);
    dogFallAction.setLoop(THREE.LoopRepeat, Infinity);
  }
  if (!walkClip) {
    console.warn(`[character] Missing "${CLIP_WALK}" clip. Available: ${names}`);
  } else {
    dogWalkAction = dogMixer.clipAction(walkClip);
    dogWalkAction.setLoop(THREE.LoopRepeat, Infinity);
  }
  if (!runClip) {
    console.warn(`[character] Missing "${CLIP_RUN}" clip (sprint will use walk). Available: ${names}`);
  } else {
    dogRunAction = dogMixer.clipAction(runClip);
    dogRunAction.setLoop(THREE.LoopRepeat, Infinity);
  }

  dogIdleAction?.stop();
  dogFallAction?.stop();
  dogWalkAction?.stop();
  dogRunAction?.stop();

  if (dogIdleAction) {
    dogIdleAction.reset().setEffectiveWeight(1).play();
    dogAnimPlaying = 'idle';
  } else if (dogFallAction) {
    dogFallAction.reset().setEffectiveWeight(1).play();
    dogAnimPlaying = 'fall';
  } else if (dogWalkAction) {
    dogWalkAction.reset().setEffectiveWeight(1).play();
    dogAnimPlaying = 'walk';
  } else if (dogRunAction) {
    dogRunAction.reset().setEffectiveWeight(1).play();
    dogAnimPlaying = 'run';
  }
}

function resolveDogAnimWant(
  inAir: boolean,
  movingOnGround: boolean,
  sprinting: boolean,
): typeof dogAnimPlaying {
  if (inAir) {
    if (dogFallAction) return 'fall';
    if (dogIdleAction) return 'idle';
    if (dogWalkAction) return 'walk';
    return 'run';
  }
  if (movingOnGround) {
    if (sprinting && dogRunAction) return 'run';
    if (dogWalkAction) return 'walk';
    if (dogRunAction) return 'run';
    if (dogIdleAction) return 'idle';
    return 'fall';
  }
  if (dogIdleAction) return 'idle';
  if (dogFallAction) return 'fall';
  return 'walk';
}

function updateDogAnimations(deltaTime: number) {
  if (!dogMixer) return;

  if (dogWalkAction) {
    let ts = tuning.dogWalkAnimTimeScale;
    if (input.sprintPressed && dogAnimPlaying === 'walk') {
      ts *= tuning.sprintWalkAnimMultiplier;
    }
    dogWalkAction.setEffectiveTimeScale(ts);
  }
  if (dogRunAction) {
    let ts = tuning.dogWalkAnimTimeScale;
    if (input.sprintPressed && dogAnimPlaying === 'run') {
      ts *= tuning.sprintWalkAnimMultiplier;
    }
    dogRunAction.setEffectiveTimeScale(ts);
  }

  const inAir = !dogAnimStableGrounded;
  const movingOnGround = dogSmoothedHSpeed > tuning.dogWalkSpeedThreshold;
  const sprinting = input.sprintPressed && movingOnGround && !inAir;
  const want = resolveDogAnimWant(inAir, movingOnGround, sprinting);

  if (want !== dogAnimPlaying) {
    const next = dogClipActionFor(want);
    const prev = dogClipActionFor(dogAnimPlaying);
    if (next) {
      const d = tuning.dogAnimCrossfade;
      next.reset().setEffectiveWeight(1).play();
      if (prev && prev !== next) {
        prev.crossFadeTo(next, d, false);
      } else {
        next.fadeIn(d);
      }
      dogAnimPlaying = want;
    }
  }

  dogMixer.update(deltaTime);
}

const _envTriWorld = new THREE.Vector3();

/** Merge all `Mesh` geometry under `root` into one triangle soup in world space (for `triangleMesh`). */
function mergeWorldSpaceTrianglesForPhysics(root: THREE.Object3D): { positions: number[]; indices: number[] } {
  const positions: number[] = [];
  const indices: number[] = [];
  let vertexBase = 0;
  const worldMat = new THREE.Matrix4();
  root.updateMatrixWorld(true);
  root.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (!mesh.isMesh) return;
    const geom = mesh.geometry;
    const posAttr = geom.getAttribute('position') as THREE.BufferAttribute | undefined;
    if (!posAttr) return;
    worldMat.copy(mesh.matrixWorld);
    for (let i = 0; i < posAttr.count; i++) {
      _envTriWorld.fromBufferAttribute(posAttr, i).applyMatrix4(worldMat);
      positions.push(_envTriWorld.x, _envTriWorld.y, _envTriWorld.z);
    }
    const indexAttr = geom.getIndex();
    if (indexAttr) {
      for (let i = 0; i < indexAttr.count; i++) {
        indices.push(vertexBase + indexAttr.getX(i));
      }
    } else {
      for (let i = 0; i + 2 < posAttr.count; i += 3) {
        indices.push(vertexBase + i, vertexBase + i + 1, vertexBase + i + 2);
      }
    }
    vertexBase += posAttr.count;
  });
  return { positions, indices };
}

new GLTFLoader().load(
  CHARACTER_GLB_URL,
  (gltf) => {
    dogModel = gltf.scene;
    dogModel.traverse((obj) => {
      const m = obj as THREE.Mesh;
      if (m.isMesh) {
        m.castShadow = true;
        m.receiveShadow = false;
        // SkinnedMesh bounding spheres are computed at load time and never updated,
        // so animated bones can push vertices outside the original sphere and cause
        // the mesh to be incorrectly frustum-culled (disappears mid-animation).
        m.frustumCulled = false;
      }
    });
    dogFacingPivot.add(dogModel);
    layoutDogModel();
    initDogAnimations(gltf);
    tryApplyPanoReflectionEnv();
  },
  undefined,
  (err) => {
    console.warn(`Could not load ${CHARACTER_GLB_URL} — add the file under public/`, err);
  },
);

const colliderGlbRoot = new THREE.Group();
colliderGlbRoot.name = 'ColliderEnvironmentGLB';
scene.add(colliderGlbRoot);

const colliderGlbPublicPath = `public${WORLD_ASSETS.colliderGlb}`;

new GLTFLoader().load(
  WORLD_ASSETS.colliderGlb,
  (gltf) => {
    const model = gltf.scene;
    colliderGlbRoot.add(model);

    colliderGlbRoot.scale.setScalar(WORLD_ASSETS.colliderGlbUniformScale);
    colliderGlbRoot.updateMatrixWorld(true);

    if (!colliderGlbShadowMaterial) {
      colliderGlbShadowMaterial = new THREE.ShadowMaterial({
        opacity: tuning.colliderGlbShadowOpacity,
        color: tuning.colliderGlbShadowColor,
      });
      colliderGlbShadowMaterial.transparent = tuning.colliderGlbShadowOpacity < 0.999;
      colliderGlbShadowMaterial.depthWrite = false;
      colliderGlbShadowMaterial.depthTest = true;
    }

    model.traverse((child) => {
      const mesh = child as THREE.Mesh;
      if (!mesh.isMesh) return;

      const prev = mesh.material;
      const list = Array.isArray(prev) ? prev : [prev];
      for (const mat of list) {
        mat?.dispose();
      }

      mesh.material = colliderGlbShadowMaterial!;
      mesh.castShadow = false;
      mesh.receiveShadow = true;
      mesh.renderOrder = SHADOW_CATCHER_RENDER_ORDER;
    });

    const { positions, indices } = mergeWorldSpaceTrianglesForPhysics(colliderGlbRoot);
    if (indices.length < 3) {
      console.warn(`${WORLD_ASSETS.colliderGlb}: no mesh triangles found for static collider`);
      return;
    }
    try {
      const verts = new Float32Array(positions);
      const idx = new Uint32Array(indices);
      const colliderBody = rapierWorld.createRigidBody(RAPIER.RigidBodyDesc.fixed());
      const colliderDesc = RAPIER.ColliderDesc.trimesh(verts, idx);
      rapierWorld.createCollider(colliderDesc, colliderBody);
      rapierWorld.updateSceneQueries();
    } catch (e) {
      console.error(`${WORLD_ASSETS.colliderGlb}: failed to build triangle-mesh collider`, e);
    }
  },
  undefined,
  (err) => {
    console.warn(
      `Could not load ${WORLD_ASSETS.colliderGlb} — add the file under ${colliderGlbPublicPath}`,
      err,
    );
  },
);

function syncRapierDebugFromTuning() {
  rapierDebugLines.visible = tuning.showPhysicsDebug && tuning.debugBodies;
}

function updateRapierDebugLines() {
  if (!rapierDebugLines.visible) return;
  const buffers = rapierWorld.debugRender();
  const v = buffers.vertices;
  const c = buffers.colors;
  const nVert = v.length / 3;
  const colors3 = new Float32Array(nVert * 3);
  for (let i = 0; i < nVert; i++) {
    colors3[i * 3 + 0] = c[i * 4 + 0];
    colors3[i * 3 + 1] = c[i * 4 + 1];
    colors3[i * 3 + 2] = c[i * 4 + 2];
  }
  rapierDebugGeom.setAttribute('position', new THREE.BufferAttribute(v.slice(), 3));
  rapierDebugGeom.setAttribute('color', new THREE.BufferAttribute(colors3, 3));
  rapierDebugGeom.getAttribute('position').needsUpdate = true;
  rapierDebugGeom.getAttribute('color').needsUpdate = true;
}

function syncPlayerRoot() {
  const t = playerBody.translation();
  playerRoot.position.set(t.x, t.y - capsuleCenterY, t.z);
  playerRoot.quaternion.identity();
  syncDogHolderPosition();
  playerRoot.updateMatrixWorld(true);
}

/**
 * Smooth yaw toward where you are steering (camera-relative input). Using physics velocity
 * only when there is no steer input avoids snapping when `hSpeed` crosses a threshold: while
 * circling, intent and velocity are not always the same vector.
 */
function updateDogMovementFacing(deltaTime: number, inputDirWorld: THREE.Vector3) {
  if (!dogModel) return;
  const inLen = inputDirWorld.length();
  let dx: number;
  let dz: number;
  if (inLen > 1e-5) {
    dx = inputDirWorld.x / inLen;
    dz = inputDirWorld.z / inLen;
  } else {
    const lv = characterState.linearVelocity;
    const hSpeed = Math.hypot(lv.x, lv.z);
    if (hSpeed < 1e-5) return;
    dx = lv.x / hSpeed;
    dz = lv.z / hSpeed;
  }
  _dogFwd.set(dx, 0, dz);
  _dogInvQuat.copy(playerRoot.quaternion).invert();
  _dogFwd.applyQuaternion(_dogInvQuat);
  const targetYaw = Math.atan2(_dogFwd.x, _dogFwd.z);
  const t = 1 - Math.exp(-tuning.dogTurnSpeed * deltaTime);
  dogSmoothedFacingYaw = lerpAngleRad(dogSmoothedFacingYaw, targetYaw, t);
  dogFacingPivot.rotation.y = dogSmoothedFacingYaw;
}

const input = {
  forwardPressed: false,
  backwardPressed: false,
  leftPressed: false,
  rightPressed: false,
  jump: false,
  sprintPressed: false,
};

document.addEventListener('keydown', (event) => {
  switch (event.code) {
    case 'KeyW':
      input.forwardPressed = true;
      break;
    case 'KeyS':
      input.backwardPressed = true;
      break;
    case 'KeyA':
      input.leftPressed = true;
      break;
    case 'KeyD':
      input.rightPressed = true;
      break;
    case 'Space':
      input.jump = true;
      event.preventDefault();
      break;
    case 'ShiftLeft':
    case 'ShiftRight':
      input.sprintPressed = true;
      break;
  }
});

document.addEventListener('keyup', (event) => {
  switch (event.code) {
    case 'KeyW':
      input.forwardPressed = false;
      break;
    case 'KeyS':
      input.backwardPressed = false;
      break;
    case 'KeyA':
      input.leftPressed = false;
      break;
    case 'KeyD':
      input.rightPressed = false;
      break;
    case 'Space':
      input.jump = false;
      break;
    case 'ShiftLeft':
    case 'ShiftRight':
      input.sprintPressed = false;
      break;
  }
});

const _mdTmp = new THREE.Vector3();

const handleCharacterInput = (state: CharacterState, deltaTime: number, movementDir: THREE.Vector3) => {
  const playerControlsHorizontalVelocity = tuning.controlMovementDuringJump || state.grounded;

  const moveSpeed =
    tuning.moveSpeed * (input.sprintPressed ? tuning.sprintMoveMultiplier : 1);

  _mdTmp.copy(movementDir);
  const movementLength = _mdTmp.length();
  if (movementLength > 1e-6) {
    _mdTmp.multiplyScalar(1 / movementLength);
  }

  if (playerControlsHorizontalVelocity) {
    state.allowSliding = movementLength > 1e-6;
    if (tuning.enableCharacterInertia) {
      if (movementLength > 1e-6) {
        state.desiredVelocity.multiplyScalar(0.75);
        state.desiredVelocity.addScaledVector(_mdTmp, 0.25 * moveSpeed);
      } else {
        state.desiredVelocity.set(0, 0, 0);
      }
    } else {
      state.desiredVelocity.copy(_mdTmp).multiplyScalar(moveSpeed);
    }
  } else {
    state.allowSliding = true;
  }

  const characterUp = new THREE.Vector3(0, 1, 0);
  const linearVelocity = state.linearVelocity.clone();
  const currentVerticalVelocity = characterUp.clone().multiplyScalar(linearVelocity.dot(characterUp));
  const groundVelocity = new THREE.Vector3(0, 0, 0);
  const gravity = new THREE.Vector3(0, tuning.gravityY, 0);

  const newVelocity = new THREE.Vector3();
  const verticalRelativeVel = currentVerticalVelocity.clone().sub(groundVelocity).dot(characterUp);
  const movingTowardsGround = verticalRelativeVel < 0.1;

  if (state.grounded) {
    const shouldStickToGround = tuning.enableCharacterInertia ? movingTowardsGround : true;

    if (shouldStickToGround) {
      newVelocity.copy(groundVelocity);
      if (input.jump && movingTowardsGround) {
        newVelocity.addScaledVector(characterUp, tuning.jumpSpeed);
      }
    } else {
      newVelocity.copy(currentVerticalVelocity);
    }
  } else {
    newVelocity.copy(currentVerticalVelocity);
  }

  newVelocity.addScaledVector(gravity, deltaTime);

  if (playerControlsHorizontalVelocity) {
    newVelocity.add(state.desiredVelocity);
  } else {
    const currentHorizontalVelocity = linearVelocity.clone().sub(currentVerticalVelocity);
    newVelocity.add(currentHorizontalVelocity);
  }

  state.linearVelocity.copy(newVelocity);
};

function syncCharacterControllerFromTuning() {
  if (tuning.enableWalkStairs) {
    characterController.enableAutostep(0.4, 0.2, true);
  } else {
    characterController.disableAutostep();
  }
  if (tuning.enableStickToFloor) {
    characterController.enableSnapToGround(0.5);
  } else {
    characterController.disableSnapToGround();
  }
}
const maxDelta = 1 / 30;
let lastTime = performance.now();

const gui = new GUI({ title: 'Character controller' });
const moveFolder = gui.addFolder('Movement');
moveFolder.add(tuning, 'moveSpeed', 1, 40, 0.5).name('Move speed');
moveFolder.add(tuning, 'sprintMoveMultiplier', 1, 3, 0.05).name('Sprint move × (Shift)');
moveFolder.add(tuning, 'sprintWalkAnimMultiplier', 1, 2.5, 0.05).name('Sprint walk anim ×');
moveFolder.add(tuning, 'jumpSpeed', 2, 35, 0.5).name('Jump impulse');
moveFolder.add(tuning, 'controlMovementDuringJump').name('Air control');
moveFolder.add(tuning, 'enableCharacterInertia').name('Move inertia');

const physFolder = gui.addFolder('Physics');
physFolder.add(tuning, 'gravityY', -60, -5, 0.5).name('Gravity Y');
physFolder.add(tuning, 'enableWalkStairs').name('Walk stairs');
physFolder.add(tuning, 'enableStickToFloor').name('Stick to floor');

const lightingFolder = gui.addFolder('Lighting');
lightingFolder.add(tuning, 'ambientIntensity', 0, 2, 0.01).name('Ambient');
lightingFolder.add(tuning, 'sunIntensity', 0, 3, 0.02).name('Sun intensity');
lightingFolder.addColor(tuning, 'sunColor').name('Sun color');
lightingFolder.add(tuning, 'sunShadowFollowCharacter').name('Sun + shadow map follow character');
lightingFolder.add(tuning, 'sunPosX', -120, 120, 0.5).name('Sun X (offset if follow)');
lightingFolder.add(tuning, 'sunPosY', -20, 120, 0.5).name('Sun Y (offset if follow)');
lightingFolder.add(tuning, 'sunPosZ', -120, 120, 0.5).name('Sun Z (offset if follow)');
lightingFolder.add(tuning, 'fillIntensity', 0, 2, 0.02).name('Fill intensity');
lightingFolder.addColor(tuning, 'fillColor').name('Fill color');
lightingFolder.add(tuning, 'fillPosX', -120, 120, 0.5).name('Fill X');
lightingFolder.add(tuning, 'fillPosY', -20, 120, 0.5).name('Fill Y');
lightingFolder.add(tuning, 'fillPosZ', -120, 120, 0.5).name('Fill Z');

const shadowFolder = gui.addFolder('Shadows');
shadowFolder.add(tuning, 'shadowMapSize', 256, 4096, 128).name('Map size (px)');
shadowFolder.add(tuning, 'shadowBias', -0.002, 0.002, 0.00005).name('Bias');
shadowFolder.add(tuning, 'shadowNormalBias', 0, 0.05, 0.0005).name('Normal bias');
shadowFolder.add(tuning, 'shadowRadius', 0, 8, 0.1).name('Radius (soft blur)');
shadowFolder.add(tuning, 'shadowIntensity', 0, 1, 0.01).name('Shadow intensity');
shadowFolder.add(tuning, 'shadowBlurSamples', 4, 32, 1).name('VSM blur samples');
shadowFolder.add(tuning, 'shadowCameraNear', 0.1, 50, 0.1).name('Cam near');
shadowFolder.add(tuning, 'shadowCameraFar', 50, 400, 1).name('Cam far');
shadowFolder.add(tuning, 'shadowCameraHalfExtent', 20, 200, 1).name('Cam half-extent');
shadowFolder
  .add(tuning, 'shadowMapType', ['BasicShadowMap', 'PCFShadowMap', 'PCFSoftShadowMap', 'VSMShadowMap'])
  .name('Map filter');

shadowFolder.addColor(tuning, 'colliderGlbShadowColor').name('Collider GLB shadow tint');

const ppFolder = gui.addFolder('Post-processing');
ppFolder.add(tuning, 'ppEnabled').name('Enabled');

ppFolder.add(tuning, 'ppBloomThreshold', 0, 1, 0.01).name('Bloom threshold');
ppFolder.add(tuning, 'ppBloomSmoothing', 0, 1, 0.01).name('Bloom smoothing');
ppFolder.add(tuning, 'ppBrightness', -1, 1, 0.02).name('Brightness');
ppFolder.add(tuning, 'ppContrast', -1, 1, 0.02).name('Contrast');
ppFolder.add(tuning, 'ppVignetteDarkness', 0, 1, 0.01).name('Vignette darkness');
ppFolder.add(tuning, 'ppVignetteOffset', 0, 1, 0.01).name('Vignette offset');

const splatFolder = gui.addFolder('Background splat (Spark)');
splatFolder
  .add(tuning, 'splatUniformScale', 0.05, 8, 0.01)
  .name('Uniform scale')
  .onChange(() => {
    splatMesh.scale.setScalar(tuning.splatUniformScale);
  });

const sparkRendererFolder = gui.addFolder('Spark renderer');
sparkRendererFolder
  .add(tuning, 'sparkFocalDistance', 0, 120, 0.05)
  .name('Focal distance (Ln)')
  .onChange(() => {
    sparkRenderer.focalDistance = tuning.sparkFocalDistance;
  });
sparkRendererFolder
  .add(tuning, 'sparkApertureAngleDeg', 0, 45, 0.05)
  .name('Aperture angle (°)')
  .onChange(() => {
    sparkRenderer.apertureAngle = THREE.MathUtils.degToRad(tuning.sparkApertureAngleDeg);
  });

const dogFolder = gui.addFolder('Character model');
dogFolder.add(tuning, 'dogYawDeg', -180, 180, 1).name('Mesh yaw (°)').onChange(() => layoutDogModel());
dogFolder.add(tuning, 'dogTurnSpeed', 0.5, 24, 0.25).name('Turn toward move');
dogFolder.add(tuning, 'dogWalkSpeedThreshold', 0.02, 0.35, 0.01).name('Walk speed threshold');
dogFolder.add(tuning, 'dogAnimGroundReleaseHold', 0, 0.35, 0.01).name('Air anim delay (s)');

dogFolder.add(tuning, 'dogAnimCrossfade', 0.05, 0.8, 0.01).name('Anim crossfade (s)');

const dogOffsetFolder = dogFolder.addFolder('Position offset (rig space)');
dogOffsetFolder.add(tuning, 'dogOffsetX', -5, 2, 0.01).name('X');
dogOffsetFolder.add(tuning, 'dogOffsetY', -5, 6, 0.01).name('Y (up)');
dogOffsetFolder.add(tuning, 'dogOffsetZ', -5, 2, 0.01).name('Z');

const dbgFolder = gui.addFolder('Physics debug (Rapier)');
dbgFolder.add(tuning, 'showPhysicsDebug').name('Enabled');
dbgFolder.add(tuning, 'debugBodies').name('Collider wireframe');

gui.add(
  {
    resetCharacter() {
      playerBody.setTranslation({ x: 0, y: spawnFeetY + capsuleCenterY, z: 0 }, true);
      playerBody.setLinvel({ x: 0, y: 0, z: 0 }, true);
      characterState.linearVelocity.set(0, 0, 0);
      characterState.desiredVelocity.set(0, 0, 0);
      characterState.grounded = false;
      dogAnimStableGrounded = false;
      dogAnimAirAccum = 0;
      dogSmoothedHSpeed = 0;
    },
  },
  'resetCharacter',
).name('Reset position');

function animate() {
  requestAnimationFrame(animate);

  const currentTime = performance.now();
  const deltaTime = Math.min((currentTime - lastTime) / 1000, maxDelta);
  lastTime = currentTime;

  rapierWorld.gravity = { x: 0, y: tuning.gravityY, z: 0 };

  syncCharacterControllerFromTuning();

  const cameraRotation = new THREE.Quaternion();
  camera.getWorldQuaternion(cameraRotation);
  const forward = input.forwardPressed ? 1 : input.backwardPressed ? -1 : 0;
  const right = input.rightPressed ? 1 : input.leftPressed ? -1 : 0;
  const cameraDirection = new THREE.Vector3(right, 0, -forward).applyQuaternion(cameraRotation);
  cameraDirection.y = 0;
  if (cameraDirection.lengthSq() > 1e-8) {
    cameraDirection.normalize();
  }

  handleCharacterInput(characterState, deltaTime, cameraDirection);

  characterController.setSlideEnabled(characterState.allowSliding);

  const oldFeet = new THREE.Vector3();
  {
    const t = playerBody.translation();
    oldFeet.set(t.x, t.y - capsuleCenterY, t.z);
  }

  const desired = new THREE.Vector3(
    characterState.linearVelocity.x * deltaTime,
    characterState.linearVelocity.y * deltaTime,
    characterState.linearVelocity.z * deltaTime,
  );
  characterController.computeColliderMovement(playerCollider, desired);
  const movement = characterController.computedMovement();

  const t0 = playerBody.translation();
  playerBody.setNextKinematicTranslation({
    x: t0.x + movement.x,
    y: t0.y + movement.y,
    z: t0.z + movement.z,
  });

  rapierWorld.timestep = deltaTime;
  rapierWorld.step();

  characterState.grounded = characterController.computedGrounded();
  if (deltaTime > 1e-8) {
    characterState.linearVelocity.set(
      movement.x / deltaTime,
      movement.y / deltaTime,
      movement.z / deltaTime,
    );
  }

  updateDogAnimStability(deltaTime, characterState.grounded);

  const newFeet = new THREE.Vector3(
    playerBody.translation().x,
    playerBody.translation().y - capsuleCenterY,
    playerBody.translation().z,
  );
  const deltaPos = new THREE.Vector3().subVectors(newFeet, oldFeet);
  camera.position.add(deltaPos);
  controls.target.set(
    newFeet.x,
    newFeet.y + CAMERA_ORBIT_TARGET_Y_OFFSET,
    newFeet.z,
  );

  syncLightingAndShadowsFromTuning();
  syncPostProcessingFromTuning();
  syncRapierDebugFromTuning();
  updateRapierDebugLines();

  syncPlayerRoot();
  updateDogMovementFacing(deltaTime, cameraDirection);
  updateDogAnimations(deltaTime);
  controls.update();
  composer.render(deltaTime);
}

syncPlayerRoot();
animate();

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  composer.setSize(window.innerWidth, window.innerHeight);
});
