/**
 * Capi — the Lunas mascot. A tiny rubber stamp ("cap" = stamp in Indonesian).
 * Moods change the face; `motion` controls idle animation.
 */
export type CapiMood = "happy" | "wink" | "wow" | "think" | "love";

export function Capi({
  size = 120,
  mood = "happy",
  motion = "bob",
  className = "",
}: {
  size?: number;
  mood?: CapiMood;
  motion?: "bob" | "jump" | "none";
  className?: string;
}) {
  const ink = "#231942";
  return (
    <svg
      viewBox="0 0 120 140"
      width={size}
      height={(size * 140) / 120}
      className={`capi ${motion !== "none" ? motion : ""} ${className}`}
      role="img"
      aria-label="Capi, the Lunas stamp mascot"
    >
      {/* shadow */}
      <ellipse cx="60" cy="134" rx="40" ry="4" fill="rgba(35,25,66,.15)" />
      {/* knob + neck */}
      <circle cx="60" cy="20" r="15" fill="#FFAE7A" stroke={ink} strokeWidth="3" />
      <circle cx="54" cy="15" r="4" fill="#fff" opacity=".7" />
      <rect x="49" y="32" width="22" height="22" rx="6" fill="#FFD84D" stroke={ink} strokeWidth="3" />
      {/* body */}
      <rect x="16" y="52" width="88" height="58" rx="20" fill="#FF8FB1" stroke={ink} strokeWidth="3" />
      <path d="M26 64 q4-6 12-6" stroke="#fff" strokeWidth="4" strokeLinecap="round" fill="none" opacity=".75" />
      {/* base plate */}
      <rect x="10" y="104" width="100" height="22" rx="9" fill="#FF5A4E" stroke={ink} strokeWidth="3" />
      <path d="M22 115 h76" stroke={ink} strokeWidth="2" strokeDasharray="4 5" opacity=".35" />

      {/* cheeks */}
      <ellipse cx="33" cy="90" rx="7" ry="4.5" fill="#FF5C8A" opacity=".45" />
      <ellipse cx="87" cy="90" rx="7" ry="4.5" fill="#FF5C8A" opacity=".45" />

      {/* eyes */}
      {mood === "wink" ? (
        <>
          <ellipse className="eye" cx="44" cy="78" rx="5" ry="6.5" fill={ink} />
          <path d="M70 79 q6 -6 12 0" stroke={ink} strokeWidth="3.2" strokeLinecap="round" fill="none" />
        </>
      ) : mood === "love" ? (
        <>
          <path d="M44 84 l-6-6 a3.6 3.6 0 0 1 6-4 a3.6 3.6 0 0 1 6 4z" fill="#FF5A4E" stroke={ink} strokeWidth="2" />
          <path d="M76 84 l-6-6 a3.6 3.6 0 0 1 6-4 a3.6 3.6 0 0 1 6 4z" fill="#FF5A4E" stroke={ink} strokeWidth="2" />
        </>
      ) : mood === "think" ? (
        <>
          <ellipse className="eye" cx="46" cy="76" rx="4.5" ry="6" fill={ink} />
          <ellipse className="eye" cx="78" cy="76" rx="4.5" ry="6" fill={ink} />
          <circle cx="47.5" cy="73.5" r="1.6" fill="#fff" />
          <circle cx="79.5" cy="73.5" r="1.6" fill="#fff" />
        </>
      ) : (
        <>
          <ellipse className="eye" cx="44" cy="78" rx={mood === "wow" ? 6 : 5} ry={mood === "wow" ? 7.5 : 6.5} fill={ink} />
          <ellipse className="eye" cx="76" cy="78" rx={mood === "wow" ? 6 : 5} ry={mood === "wow" ? 7.5 : 6.5} fill={ink} />
          <circle cx="46" cy="75.5" r="1.8" fill="#fff" />
          <circle cx="78" cy="75.5" r="1.8" fill="#fff" />
        </>
      )}

      {/* mouth */}
      {mood === "wow" ? (
        <ellipse cx="60" cy="93" rx="5" ry="6" fill={ink} />
      ) : mood === "think" ? (
        <path d="M54 94 q6 -3 12 0" stroke={ink} strokeWidth="3" strokeLinecap="round" fill="none" />
      ) : (
        <path d="M51 89 q9 10 18 0" stroke={ink} strokeWidth="3.2" strokeLinecap="round" fill={mood === "love" ? "#FF5A4E" : "none"} />
      )}
    </svg>
  );
}
