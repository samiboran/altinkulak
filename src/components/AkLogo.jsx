import { useId } from "react";

// Altınkulak — "Keskin Kulak" markı: soyut fasetli kulak (işitme + kesinlik).
export default function AkLogo({ size = 28, className = "" }) {
  const raw = useId();
  const id = "akg-" + raw.replace(/[^a-zA-Z0-9]/g, "");
  return (
    <svg width={size} height={size} viewBox="0 0 96 96" className={className} role="img" aria-label="Altınkulak">
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#F4D27A" />
          <stop offset="55%" stopColor="#E6B450" />
          <stop offset="100%" stopColor="#B7892F" />
        </linearGradient>
      </defs>
      <polygon points="58,16 32,22 20,48 30,76 54,78 64,56" fill={`url(#${id})`} />
      <polygon points="58,16 64,56 54,78 46,50" fill="#1A1305" opacity="0.22" />
      <path d="M54 34 L42 42 L48 54" fill="none" stroke="#13201E" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="45" cy="62" r="4.5" fill="#13201E" />
    </svg>
  );
}
