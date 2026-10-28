"use client";
// The NOÊSIS tutor owl, drawn from the owl design supplied for the project (SVG + Motion, theme colours).
// Its state always comes from a real event: listening only while the microphone is live, speaking only
// while audio is playing, waiting only while a network request is in flight. It is decorative: the
// panel shows the same state as text, and the owl can be hidden.
import { motion, type Transition } from "motion/react";
import { useId } from "react";

export type OwlState = "ready" | "listening" | "waiting" | "speaking" | "guiding" | "encouraging" | "unavailable";

export const OWL_STATE_LABEL: Record<OwlState, string> = {
  ready: "Ready",
  listening: "Listening",
  waiting: "Waiting for a reply",
  speaking: "Speaking",
  guiding: "Pointing at the visual",
  encouraging: "Nice work",
  unavailable: "Connection or playback unavailable",
};

const still: Transition = { duration: 0 };

export function OwlTutor({ state, direction = "left", reduced, size = 88 }: { state: OwlState; direction?: "left" | "up"; reduced: boolean; size?: number }) {
  const uid = useId().replace(/[:]/g, "");
  const id = (n: string) => `${n}-${uid}`;
  const loop = (duration: number, extra: Transition = {}): Transition => (reduced ? still : { duration, repeat: Infinity, ease: "easeInOut", ...extra });

  // whole-body motion
  const root = reduced
    ? { y: state === "encouraging" ? -4 : 0, rotate: state === "unavailable" ? 3 : state === "listening" ? -4 : 0, scaleY: 1 }
    : state === "encouraging" ? { y: [0, -10, 0, -6, 0], rotate: 0, scaleY: [1, 0.96, 1.03, 0.98, 1] }
    : state === "listening" ? { y: 0, rotate: -5, scaleY: [1, 1.01, 1] }
    : state === "unavailable" ? { y: 3, rotate: 3, scaleY: 0.98 }
    : { y: 0, rotate: 0, scaleY: [1, 1.015, 1] };
  const rootT: Transition = reduced ? still : state === "encouraging" ? { duration: 1.2, ease: "easeOut" } : state === "unavailable" ? { duration: 0.4 } : loop(3.6);

  // where the eyes look
  const gaze = state === "guiding" ? (direction === "left" ? { x: -3.5, y: 0.5 } : { x: 0, y: -3.5 })
    : state === "waiting" ? { x: 2.5, y: -3 } : state === "listening" ? { x: -1, y: -1.5 } : { x: 0, y: 0 };

  // wings: the left wing points toward the visual while guiding; both flap when encouraging
  const leftWing = state === "guiding" ? { rotate: direction === "left" ? 58 : 120 }
    : state === "encouraging" && !reduced ? { rotate: [0, 35, 0, 35, 0] }
    : state === "speaking" && !reduced ? { rotate: [0, 6, 0] } : { rotate: 0 };
  const rightWing = state === "encouraging" && !reduced ? { rotate: [0, -35, 0, -35, 0] } : state === "listening" ? { rotate: -20 } : { rotate: 0 };
  const wingT: Transition = reduced ? still : state === "encouraging" ? { duration: 1.2 } : state === "speaking" ? loop(0.9) : { type: "spring", stiffness: 160, damping: 14 };

  // eyelids: half-closed when unavailable, happy squint when encouraging, blinking otherwise
  const lid = state === "unavailable" ? { scaleY: 0.5 } : state === "encouraging" ? { scaleY: 0.42 }
    : reduced ? { scaleY: 0 } : { scaleY: [0, 0, 1, 0] };
  const lidT: Transition = reduced || state === "unavailable" || state === "encouraging" ? (reduced ? still : { duration: 0.25 }) : { duration: 4.2, times: [0, 0.92, 0.96, 1], repeat: Infinity };

  // beak opens only while audio is actually playing
  const beak = state === "speaking" ? (reduced ? { scaleY: 1.18 } : { scaleY: [1, 1.28, 1] }) : { scaleY: 1 };
  const beakT: Transition = state === "speaking" ? loop(0.32) : { duration: 0.15 };

  return (
    <svg viewBox="-10 30 220 190" width={size} height={size * (190 / 220)} aria-hidden="true" focusable="false" className="owl" data-owl-state={state} data-reduced={reduced ? "true" : "false"} data-testid="owl">
      <defs>
        <linearGradient id={id("body")} x1="0%" y1="0%" x2="0%" y2="100%"><stop offset="0%" stopColor="#FE9400" /><stop offset="55%" stopColor="#F37F58" /><stop offset="100%" stopColor="#2F231A" /></linearGradient>
        <linearGradient id={id("face")} x1="0%" y1="0%" x2="0%" y2="100%"><stop offset="0%" stopColor="#FFF3EE" /><stop offset="60%" stopColor="#F7B198" /><stop offset="100%" stopColor="#EAA186" /></linearGradient>
        <linearGradient id={id("eye")} x1="0%" y1="0%" x2="0%" y2="100%"><stop offset="0%" stopColor="#050505" /><stop offset="60%" stopColor="#141517" /><stop offset="100%" stopColor="#2F231A" /></linearGradient>
        <linearGradient id={id("beak")} x1="0%" y1="0%" x2="0%" y2="100%"><stop offset="0%" stopColor="#FE9400" /><stop offset="100%" stopColor="#F37F58" /></linearGradient>
        <linearGradient id={id("wing")} x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stopColor="#FE9400" /><stop offset="50%" stopColor="#F37F58" /><stop offset="100%" stopColor="#2F231A" /></linearGradient>
        <clipPath id={id("lclip")}><ellipse cx="85" cy="114" rx="13.5" ry="16.5" /></clipPath>
        <clipPath id={id("rclip")}><ellipse cx="115" cy="114" rx="13.5" ry="16.5" /></clipPath>
      </defs>
      <ellipse cx="100" cy="202" rx="46" ry="7" fill="rgba(5,5,5,0.6)" />

      {/* listening: sound arcs beside the head, only while the microphone is live */}
      {state === "listening" && (
        <g stroke="#FE9400" strokeWidth="3" fill="none" strokeLinecap="round" data-testid="owl-listening">
          {[0, 1, 2].map((i) => (
            <motion.path key={i} d={`M${158 + i * 10},${88 - i * 4} q${8 + i * 2},${16 + i * 4} 0,${32 + i * 8}`}
              animate={reduced ? { opacity: 0.8 } : { opacity: [0.2, 1, 0.2] }} transition={reduced ? still : { duration: 1.2, repeat: Infinity, delay: i * 0.2 }} />
          ))}
        </g>
      )}
      {/* waiting: three dots, only while a request is in flight */}
      {state === "waiting" && (
        <g fill="#F7B198" data-testid="owl-waiting">
          {[0, 1, 2].map((i) => (
            <motion.circle key={i} cx={150 + i * 14} cy={58} r={4.5} animate={reduced ? { opacity: 0.9 } : { opacity: [0.25, 1, 0.25] }} transition={reduced ? still : { duration: 1, repeat: Infinity, delay: i * 0.18 }} />
          ))}
        </g>
      )}

      <motion.g style={{ transformOrigin: "100px 198px" }} animate={root} transition={rootT}>
        <path stroke="#141517" strokeWidth="2.2" fill="#FE9400" d="M73,196 C73,192 78,191 80,194 C81,190 87,190 88,194 C89,191 94,192 94,196 C94,200 73,200 73,196 Z" />
        <path stroke="#141517" strokeWidth="2.2" fill="#FE9400" d="M106,196 C106,192 111,191 113,194 C114,190 120,190 121,194 C122,191 127,192 127,196 C127,200 106,200 106,196 Z" />
        <path stroke="#050505" strokeWidth="3.2" strokeLinejoin="round" fill={`url(#${id("body")})`} d="M100,52 C84,52 74,56 68,64 C60,74 58,89 57,105 C55,123 54,147 61,167 C68,187 83,195 100,195 C117,195 132,187 139,167 C146,147 145,123 143,105 C142,89 140,74 132,64 C126,56 116,52 100,52 Z" />
        <path d="M78,57 C82,53 87,52 93,54" stroke="#F7B198" strokeWidth="2.2" strokeLinecap="round" fill="none" opacity="0.6" />
        <path d="M107,54 C113,52 118,53 122,57" stroke="#F7B198" strokeWidth="2.2" strokeLinecap="round" fill="none" opacity="0.6" />
        <g opacity="0.85" fill="none" stroke="#2F231A" strokeLinecap="round" strokeLinejoin="round">
          <path d="M84,166 L88,171 L93,167 L98,172 L103,167 L108,171 L112,166" strokeWidth="2.2" />
          <path d="M87,175 L91,179 L97,175 L102,179 L107,175" strokeWidth="2" />
          <path d="M91,183 L96,186 L101,183" strokeWidth="1.8" />
        </g>
        <path stroke="#141517" strokeWidth="2.2" strokeLinejoin="round" fill={`url(#${id("face")})`} d="M100,81 C92,72 80,71 74,77 C66,85 65,103 66,118 C67,130 73,139 83,142 C89,144 95,140 100,143 C105,140 111,144 117,142 C127,139 133,130 134,118 C135,103 134,85 126,77 C120,71 108,72 100,81 Z" />
        <ellipse cx="73" cy="126" rx="5" ry="3.5" fill="#F37F58" opacity={state === "encouraging" ? 0.75 : 0.4} />
        <ellipse cx="127" cy="126" rx="5" ry="3.5" fill="#F37F58" opacity={state === "encouraging" ? 0.75 : 0.4} />

        <motion.g style={{ transformOrigin: "58px 115px" }} animate={leftWing} transition={wingT} data-testid="owl-left-wing">
          <path stroke="#050505" strokeWidth="3.2" strokeLinejoin="round" fill={`url(#${id("wing")})`} d="M58,110 C52,112 48,122 47,135 C46,148 48,162 55,168 C61,173 66,167 67,157 C68,146 68,131 66,120 C65,114 62,110 58,110 Z" />
          <path d="M51,135 C52,148 55,158 59,164" stroke="#2F231A" strokeWidth="2" fill="none" strokeLinecap="round" />
        </motion.g>
        <motion.g style={{ transformOrigin: "142px 115px" }} animate={rightWing} transition={wingT}>
          <path stroke="#050505" strokeWidth="3.2" strokeLinejoin="round" fill={`url(#${id("wing")})`} d="M142,110 C148,112 152,122 153,135 C154,148 152,162 145,168 C139,173 134,167 133,157 C132,146 132,131 134,120 C135,114 138,110 142,110 Z" />
          <path d="M149,135 C148,148 145,158 141,164" stroke="#2F231A" strokeWidth="2" fill="none" strokeLinecap="round" />
        </motion.g>

        {([["l", 85], ["r", 115]] as const).map(([side, cx]) => (
          <g key={side}>
            <ellipse cx={cx} cy="114" rx="13.5" ry="16.5" fill={`url(#${id("eye")})`} stroke="#050505" strokeWidth="2" />
            <g clipPath={`url(#${id(side + "clip")})`}>
              <motion.g animate={gaze} transition={reduced ? still : { type: "spring", stiffness: 120, damping: 16 }}>
                <ellipse cx={cx} cy="115" rx="11" ry="13.5" fill="#050505" />
                <ellipse cx={cx} cy="123" rx="8" ry="5.5" fill="#F37F58" opacity="0.65" />
                <ellipse cx={cx - 3.5} cy="106.5" rx="5.2" ry="6.2" fill="#F5F5F5" />
                <circle cx={cx + 4.5} cy="120.5" r="2.4" fill="#F5F5F5" />
              </motion.g>
              <motion.rect x={cx - 20} y="88" width="40" height="36" fill="#F7B198" stroke="#141517" strokeWidth="2"
                style={{ transformOrigin: `${cx}px 95px` }} initial={{ scaleY: 0 }} animate={lid} transition={lidT} />
            </g>
          </g>
        ))}

        <motion.g style={{ transformOrigin: "100px 113px" }} animate={beak} transition={beakT} data-testid="owl-beak">
          <path stroke="#141517" strokeWidth="2.2" fill={`url(#${id("beak")})`} d="M95,116 C95,113 97,112 100,112 C103,112 105,113 105,116 C105,122 101.5,129 100,130 C98.5,129 95,122 95,116 Z" />
        </motion.g>

        <g>
          <rect x="69" y="98" width="31" height="31" rx="7" fill="rgba(247,177,152,0.08)" />
          <rect x="100" y="98" width="31" height="31" rx="7" fill="rgba(247,177,152,0.08)" />
          <line x1="74" y1="102" x2="80" y2="108" stroke="rgba(245,245,245,0.6)" strokeWidth="1.8" strokeLinecap="round" />
          <line x1="105" y1="102" x2="111" y2="108" stroke="rgba(245,245,245,0.6)" strokeWidth="1.8" strokeLinecap="round" />
          <rect x="69" y="98" width="31" height="31" rx="7" fill="none" stroke="#141517" strokeWidth="3.2" />
          <rect x="100" y="98" width="31" height="31" rx="7" fill="none" stroke="#141517" strokeWidth="3.2" />
          <path d="M69,110 L62,111 M131,110 L138,111" stroke="#141517" strokeWidth="3.2" strokeLinecap="round" />
        </g>
      </motion.g>

      {state === "unavailable" && (
        <g data-testid="owl-unavailable">
          <circle cx="170" cy="62" r="13" fill="#141517" stroke="#F37F58" strokeWidth="2.5" />
          <path d="M163,69 L177,55" stroke="#F37F58" strokeWidth="2.5" strokeLinecap="round" />
        </g>
      )}
    </svg>
  );
}

/** A small static owl face for buttons (decorative). */
export function OwlMark({ size = 22 }: { size?: number }) {
  return (
    <svg viewBox="0 0 32 32" width={size} height={size} aria-hidden="true" focusable="false" className="owl-mark">
      <path d="M6 9 L9 3 L13 8 Z M26 9 L23 3 L19 8 Z" fill="#C2410C" />
      <ellipse cx="16" cy="18" rx="12" ry="12" fill="#FC710C" />
      <ellipse cx="16" cy="22" rx="7" ry="7" fill="#FDBA8C" />
      <circle cx="11" cy="14" r="4.6" fill="#fff" /><circle cx="21" cy="14" r="4.6" fill="#fff" />
      <circle cx="11.6" cy="14.4" r="2.1" fill="#1F2937" /><circle cx="20.4" cy="14.4" r="2.1" fill="#1F2937" />
      <path d="M14.2 18 L17.8 18 L16 21 Z" fill="#B45309" />
    </svg>
  );
}
