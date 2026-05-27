/**
 * Shared, mutable runtime state for the wizard character — values that need to
 * be read every frame from *other* R3F components (SparkleScene, WizardLighting,
 * etc.) without paying for a React re-render or a Rapier API call.
 *
 * Lives in its own data-only module (NOT inside `WizardController.tsx`) so
 * React Fast Refresh doesn't refuse to HMR-update WizardController every time
 * we edit it. Mixing a non-component export with React components in the same
 * file triggers vite-plugin-react's "incompatible export" warning, which forces
 * a full re-import cascade through every consumer (SparkleScene, WizardLighting,
 * etc.) — and can briefly leave the scene with two Sparkle instances/SparkRenderers
 * mid-swap, which is enough to wedge Spark's WASM splat sorter.
 *
 * Everything here is a singleton that WizardController writes to each frame.
 * Default values are safe to read before WizardController mounts (Vector3 starts
 * at origin) so consumers don't have to guard for "not initialized yet".
 */
import * as THREE from 'three'

/**
 * Live wizard feet world-position. Updated each frame by `WizardController` so
 * other Wizard-mode subsystems (sun-follow lighting, character-following
 * particles, etc.) can read it cheaply without going through Rapier or React
 * state. Initialized at world origin; nothing crashes if read before the
 * character has mounted.
 */
export const wizardFeetPos = new THREE.Vector3()
