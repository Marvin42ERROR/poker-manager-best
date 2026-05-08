export function PokerLogo({ size = 96 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 120 120"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <defs>
        <radialGradient id="chipGrad" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#1a1a1a" />
          <stop offset="100%" stopColor="#000000" />
        </radialGradient>
        <linearGradient id="goldGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#f5d77a" />
          <stop offset="50%" stopColor="#c9a24a" />
          <stop offset="100%" stopColor="#8a6a1f" />
        </linearGradient>
        <linearGradient id="cardGrad" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#1a1a1a" />
          <stop offset="100%" stopColor="#0a0a0a" />
        </linearGradient>
      </defs>

      {/* Poker chip behind */}
      <g transform="translate(60 64)">
        <circle r="44" fill="url(#chipGrad)" stroke="url(#goldGrad)" strokeWidth="2.5" />
        <circle r="38" fill="none" stroke="url(#goldGrad)" strokeWidth="1" strokeDasharray="3 4" />
        <circle r="26" fill="none" stroke="url(#goldGrad)" strokeWidth="1.5" />
        {/* Chip notches */}
        {[0, 45, 90, 135, 180, 225, 270, 315].map((a) => (
          <rect
            key={a}
            x="-4"
            y="-46"
            width="8"
            height="10"
            fill="url(#goldGrad)"
            transform={`rotate(${a})`}
          />
        ))}
      </g>

      {/* 4 fanned cards in front */}
      <g transform="translate(60 50)">
        {[
          { rot: -24, x: -30, suit: "♠" },
          { rot: -8, x: -10, suit: "♥" },
          { rot: 8, x: 10, suit: "♦" },
          { rot: 24, x: 30, suit: "♣" },
        ].map((c, i) => (
          <g key={i} transform={`translate(${c.x} 0) rotate(${c.rot})`}>
            <rect
              x="-9"
              y="-16"
              width="18"
              height="26"
              rx="2.5"
              fill="url(#cardGrad)"
              stroke="url(#goldGrad)"
              strokeWidth="1.2"
            />
            <text
              x="0"
              y="3"
              textAnchor="middle"
              fontSize="12"
              fontFamily="serif"
              fill="url(#goldGrad)"
              style={{ fontWeight: 700 }}
            >
              {c.suit}
            </text>
          </g>
        ))}
      </g>
    </svg>
  );
}
