// Myka brand mark, vector copy of the badge on the MYKA container stickers (Myka design canvas):
// deep-green shield badge, yellow keyline, green/white palm-oil drop and the MYKA wordmark.
export function MykaLogo({ className, title = 'Myka' }: { className?: string; title?: string }) {
  return (
    <svg className={className} viewBox="12.5 0 21 12.4" role="img" aria-label={title}>
      <path d="M12.5 0 H33.5 V8.5 Q33.5 9.3 32.7 9.5 L30.6 9.9 Q28.8 10.3 27.3 11.2 Q25.2 12.4 23 12.4 Q20.8 12.4 18.7 11.2 Q17.2 10.3 15.4 9.9 L13.3 9.5 Q12.5 9.3 12.5 8.5 Z" fill="#075C25" />
      <path d="M13.3 0 V8.1 Q13.3 8.7 13.9 8.85 L16 9.2 Q17.9 9.6 19.4 10.5 Q21.2 11.6 23 11.6 Q24.8 11.6 26.6 10.5 Q28.1 9.6 30 9.2 L32.1 8.85 Q32.7 8.7 32.7 8.1 V0" fill="none" stroke="#F2E04A" strokeWidth="0.25" strokeLinejoin="round" />
      <g transform="translate(16.3 3.3)">
        <path d="M1.4 0.4 C0.6 1.4 0 2 0 2.8 C0 3.6 0.7 4.1 1.5 4.1 C1.9 4.1 2.2 3.9 2.3 3.7 C1.5 3.5 1.1 2.6 1.1 1.8 C1.1 1.3 1.2 0.8 1.4 0.4 Z" fill="#3DDC2C" />
        <path d="M1.5 0 C2.8 0.8 3.2 2 3.1 3 C3 3.5 2.7 3.9 2.2 4.2 C2.5 3.9 2.7 3.4 2.6 2.8 C2.5 1.8 2 1 1.5 0 Z" fill="#FFFFFF" />
      </g>
      <text x="20.1" y="6.7" fontFamily="Montserrat, 'Arial Black', sans-serif" fontWeight={700} fontSize="2.9" fill="#4BE02F">MYKA</text>
    </svg>
  )
}

/** The sticker's golden "sunburst" (radial glow + rays), used behind the brand on the sign-in page. */
export function Sunburst({ className }: { className?: string }) {
  const rays = Array.from({ length: 16 }, (_, i) => i * 22.5)
  return (
    <svg className={className} viewBox="0 0 100 100" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <defs>
        <radialGradient id="myka-sun" cx="50%" cy="42%" r="70%">
          <stop offset="0%" stopColor="#FFFBE3" /><stop offset="38%" stopColor="#FFE766" />
          <stop offset="72%" stopColor="#FFC21A" /><stop offset="100%" stopColor="#F58A20" />
        </radialGradient>
      </defs>
      <rect width="100" height="100" fill="url(#myka-sun)" />
      <g fill="#FFFFFF" fillOpacity="0.22">
        {rays.map(a => <polygon key={a} points="50,42 40,160 60,160" transform={`rotate(${a} 50 42)`} />)}
      </g>
    </svg>
  )
}
