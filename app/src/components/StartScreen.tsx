/**
 * StartScreen — the title overlay that sits in front of the WorldViewer
 * until the user clicks PLAY.
 *
 * Design choices:
 *
 *   • The 3D scene MOUNTS UNDERNEATH this overlay (not after click), so
 *     the world's heavy assets (21M-splat SPZ, 5 creature GLBs, audio)
 *     are decoding while the user enjoys the title art. By the time
 *     they click PLAY the world is usually warm enough to drop straight
 *     into.
 *
 *   • The background video is `muted + autoPlay + loop + playsInline`:
 *       - `muted` is non-negotiable for autoplay in every modern browser
 *         (Chrome/Safari/Firefox all block audio-having autoplay).
 *       - `playsInline` stops iOS Safari from kicking video into the
 *         fullscreen native player on mobile.
 *       - `loop` does what it says; videos with a clean loop point are
 *         seamless, but if there's a visible "snap" we can crossfade
 *         later.
 *
 *   • Title + button are SEPARATE assets (silo-title.png /
 *     silo-play.png, split from the original combined PNG). Reasons
 *     covered in the chat: only the button should be clickable, the
 *     button needs hover/press states, and they need to lay out and
 *     animate independently on small screens.
 *
 *   • Click handling: BOTH `pointerdown` and a button `onClick` are
 *     used. The pointerdown call lets a single user gesture also
 *     un-mute / start the AudioContext in the world below (browsers
 *     gate audio on a user gesture); deferring to React's onClick alone
 *     would lose that gesture by the time the world's audio code asks.
 *     `useState(false)` + a "leaving" boolean drives a CSS fade-out so
 *     the title doesn't just snap away.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { useAllCreaturesLoaded } from '../modules/creatures/creatureLoadStatus'

interface StartScreenProps {
  /** Fires when the user clicks PLAY. The parent should then dismount
   *  the start screen (typically by setting its own `started` state
   *  and rendering null instead of `<StartScreen />`). The fade-out
   *  takes ~400 ms so the parent should keep us mounted that long;
   *  the easiest pattern is to pass a setter that flips a boolean
   *  immediately, then unmount only when WE call `onAfterLeave`. */
  onStart: () => void
}

// Fade duration in ms — also encoded in the inline transition style so
// they stay in sync.
const FADE_MS = 400

/**
 * Hard upper bound (ms) we'll hold the start screen waiting for
 * creature GLBs after the user clicks PLAY. Even if assets STILL
 * aren't ready by then we drop into the world rather than make the
 * user stare at a "Loading..." screen indefinitely — better to see
 * a creature pop in late once than to be stuck at the title forever
 * on a slow connection. 20 seconds is plenty for the largest GLB
 * (66 MB verdant-sentinel) on a typical broadband link.
 */
const MAX_LOAD_WAIT_MS = 20_000

export function StartScreen({ onStart }: StartScreenProps) {
  const [leaving, setLeaving] = useState(false)
  // "clicked" is the user-intent flag — true once they've hit PLAY,
  // independent of whether we've actually started fading. We fade
  // out only when (clicked && all assets ready), or when the
  // MAX_LOAD_WAIT_MS timeout fires.
  const [clicked, setClicked] = useState(false)
  const videoRef = useRef<HTMLVideoElement>(null)
  const allCreaturesLoaded = useAllCreaturesLoaded()

  // Once both conditions are true (user wants to start AND every
  // creature has rendered at least once), kick off the fade and call
  // onStart. This effect runs whenever either flag changes — so if
  // the user clicks while creatures are still loading, the moment
  // the last one resolves we transition automatically.
  useEffect(() => {
    if (!clicked || leaving) return
    if (!allCreaturesLoaded) return
    setLeaving(true)
    onStart()
  }, [clicked, leaving, allCreaturesLoaded, onStart])

  // Safety valve: if assets are STILL loading 20 seconds after the
  // click, give up waiting and let the user in anyway. Better a late
  // pop-in than a soft-lock on a slow connection. Effect resets if
  // the user un-clicks (currently can't happen, but cheap to model).
  useEffect(() => {
    if (!clicked || leaving) return
    const timer = window.setTimeout(() => {
      if (!leaving) {
        console.warn(
          `[StartScreen] creature load took >${MAX_LOAD_WAIT_MS}ms — ` +
          'entering world without waiting',
        )
        setLeaving(true)
        onStart()
      }
    }, MAX_LOAD_WAIT_MS)
    return () => window.clearTimeout(timer)
  }, [clicked, leaving, onStart])

  const handleStart = useCallback(() => {
    if (clicked || leaving) return
    setClicked(true)
    // We do NOT immediately fire onStart here — the effect above
    // owns that, and gates it on assets being ready. The button's
    // visual state changes (pointer-events disabled + label swap
    // to "Entering world…") via the `clicked` flag.
  }, [clicked, leaving])

  // Show a small "Entering world…" indicator below the button after
  // the user clicks but BEFORE assets are ready. This gives feedback
  // that the click registered and the game is loading — without it,
  // the user would click PLAY and see nothing change for several
  // seconds, prompting them to click again or assume the button is
  // broken.
  const showLoadingHint = clicked && !leaving && !allCreaturesLoaded

  // Some browsers (Safari iOS in low-power mode) won't autoplay
  // even with `muted` until you call play() explicitly after the
  // element has loaded. The onCanPlay handler covers that.
  const handleVideoCanPlay = useCallback(() => {
    const v = videoRef.current
    if (!v) return
    const p = v.play()
    if (p && typeof p.catch === 'function') {
      // Promise-returning play() — log but don't crash. The video
      // will appear as a still frame if play fails; the title +
      // button remain functional.
      p.catch((err) => {
        console.warn('[StartScreen] video.play() rejected:', err)
      })
    }
  }, [])

  return (
    <div
      className={[
        'fixed inset-0 z-50 flex flex-col items-center justify-between',
        'pointer-events-auto select-none',
        'transition-opacity duration-[400ms] ease-out',
        leaving ? 'opacity-0' : 'opacity-100',
      ].join(' ')}
      style={{
        // Inline so it definitely matches the Tailwind arbitrary value
        // above even if PurgeCSS hasn't picked up the class on first
        // render.
        transitionDuration: `${FADE_MS}ms`,
      }}
      aria-hidden={leaving}
    >
      {/* Background video — fills the viewport, may be cropped on
       *  extreme aspect ratios. Z-stack: this is the lowest layer
       *  inside the overlay, with the title + button on top. */}
      <video
        ref={videoRef}
        src="/silo-intro.mp4"
        autoPlay
        loop
        muted
        playsInline
        preload="auto"
        onCanPlay={handleVideoCanPlay}
        className="absolute inset-0 w-full h-full object-cover -z-10"
      />
      {/* Subtle dark gradient over the video so light pixels in the
       *  video don't fight the title art. Keeps the title legible
       *  regardless of what frame is currently visible. */}
      <div
        aria-hidden
        className="absolute inset-0 -z-10 bg-gradient-to-b from-black/30 via-black/10 to-black/40"
      />

      {/* Title block — sits in the upper-middle of the screen.
       *  mt-[20vh] pushes it down off the top edge so it doesn't
       *  hug the browser chrome; max-w/-h are sized so it reads as
       *  the dominant visual element. Bounded by both px and vw so
       *  it scales down on phones without getting absurd on 4K. */}
      <div className="w-full flex justify-center px-6 mt-[20vh]">
        <img
          src="/silo-title.png"
          alt="SILO"
          draggable={false}
          className="w-auto h-auto max-w-[min(1200px,92vw)] max-h-[52vh] object-contain drop-shadow-[0_4px_18px_rgba(0,0,0,0.55)]"
        />
      </div>

      {/* Play button + loading hint. Both share the same bottom-anchored
       *  container so the hint sits directly under the button without
       *  shifting its position. */}
      <div className="flex flex-col items-center mb-[8vh] gap-3">
        <button
          type="button"
          onClick={handleStart}
          onPointerDown={(e) => {
            // Pointer events fire before click — using this gives us
            // the freshest user-gesture timestamp the browser will
            // honour for audio/video unlock. We still wire onClick
            // for keyboard activation (Enter / Space).
            if (e.pointerType !== 'mouse' && e.pointerType !== 'touch' && e.pointerType !== 'pen') return
            handleStart()
          }}
          autoFocus
          disabled={clicked || leaving}
          className={[
            'cursor-pointer bg-transparent border-0 p-0',
            // Hover / focus pulses the button up subtly. active:
            // shrinks back so the click feels tactile. Disabled
            // pointer events while leaving so a double-click can't
            // re-fire after we've started dismissing. Also pulses
            // gently after click so the user knows the loading
            // gate is doing something.
            'transition-transform duration-200 ease-out',
            (clicked || leaving)
              ? 'pointer-events-none animate-pulse'
              : 'hover:scale-[1.04] active:scale-[0.96]',
            'focus:outline-none focus-visible:outline-none',
            // Soft glow on focus for keyboard users — no rectangular
            // ring (would look ugly against the ornate art).
            'focus-visible:drop-shadow-[0_0_24px_rgba(120,220,255,0.7)]',
          ].join(' ')}
          aria-label="Play"
        >
          <img
            src="/silo-play.png"
            alt=""
            draggable={false}
            className="w-auto h-auto max-w-[min(520px,60vw)] max-h-[22vh] object-contain drop-shadow-[0_6px_22px_rgba(0,0,0,0.55)]"
          />
        </button>
        {/* Loading hint — only visible AFTER click, while creatures
         *  are still being decoded/rendered. Keeps the user informed
         *  during the gate without taking real estate from the
         *  pre-click composition. Uses an aria-live region so screen
         *  readers announce the state change. */}
        <div
          aria-live="polite"
          className={[
            'text-white/85 text-base md:text-lg tracking-[0.18em] font-semibold uppercase',
            'drop-shadow-[0_2px_8px_rgba(0,0,0,0.7)]',
            'transition-opacity duration-300',
            showLoadingHint ? 'opacity-100' : 'opacity-0',
          ].join(' ')}
        >
          Entering world…
        </div>
      </div>
    </div>
  )
}
