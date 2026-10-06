import { brand as congresoBrand } from '../brand';

/**
 * Casquillo metálico del congreso: envuelve el extremo de la cinta y lleva el
 * logo RJDT grabado, como en el mockup. Se dibuja por encima de y=0 para tapar
 * el final de la cinta.
 */
function CongresoCrimp() {
  return (
    <g className="clasp-crimp">
      <rect x="8.5" y="-16" width="33" height="21.5" rx="2.6" fill="url(#crimpSteel)" stroke="#6f737c" strokeWidth="0.6" />
      <rect x="8.5" y="-16" width="33" height="3.2" rx="1.6" fill="#5b5f68" opacity="0.55" />
      <rect x="8.5" y="2.4" width="33" height="3.1" rx="1.5" fill="#43464e" opacity="0.5" />
      <image
        href={congresoBrand.assets.rjdtCream}
        x="11.5"
        y="-10.4"
        width="27"
        height="6.6"
        preserveAspectRatio="xMidYMid meet"
        style={{ filter: 'brightness(0.28) contrast(1.2)' }}
        opacity="0.85"
      />
    </g>
  );
}

/**
 * High-fidelity brushed chrome swivel lobster clasp.
 * Supports layer='back' | 'front' | 'full' so the metal hook
 * physically threads THROUGH the card's punch hole!
 */
export default function MetalClasp({
  width = 42,
  height = 70,
  layer = 'full',
  className = '',
  variant = 'default',
}: {
  width?: number;
  height?: number;
  layer?: string;
  className?: string;
  variant?: string;
}) {
  const isCongreso = variant === 'congreso';
  return (
    <svg
      width={width}
      height={height}
      viewBox="0 0 50 82"
      preserveAspectRatio="xMidYMin meet"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={`metal-clasp-svg ${className}`}
      style={{ overflow: 'visible', filter: 'drop-shadow(0 3px 5px rgba(0,0,0,0.3))' }}
    >
      <defs>
        {/* Chrome metallic gradient for D-Ring & Buckle */}
        <linearGradient id="chromeRing" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#ffffff" />
          <stop offset="25%" stopColor="#d5d9e0" />
          <stop offset="50%" stopColor="#8d94a1" />
          <stop offset="70%" stopColor="#eef1f6" />
          <stop offset="88%" stopColor="#6e7582" />
          <stop offset="100%" stopColor="#3d424b" />
        </linearGradient>

        {/* Shiny highlight gradient */}
        <linearGradient id="chromeShine" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#9aa0ad" />
          <stop offset="30%" stopColor="#ffffff" />
          <stop offset="55%" stopColor="#c2c7d2" />
          <stop offset="80%" stopColor="#7a818f" />
          <stop offset="100%" stopColor="#505663" />
        </linearGradient>

        {/* Clasp body chrome gradient */}
        <linearGradient id="chromeHook" x1="10%" y1="10%" x2="90%" y2="90%">
          <stop offset="0%" stopColor="#f8f9fa" />
          <stop offset="20%" stopColor="#cfd4dd" />
          <stop offset="40%" stopColor="#7b8290" />
          <stop offset="60%" stopColor="#e5e9f0" />
          <stop offset="75%" stopColor="#9fa6b4" />
          <stop offset="90%" stopColor="#5d6370" />
          <stop offset="100%" stopColor="#2c3038" />
        </linearGradient>

        {/* Metal clamp collar */}
        <linearGradient id="clampCollar" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#3a3d45" />
          <stop offset="35%" stopColor="#686e7a" />
          <stop offset="70%" stopColor="#2a2c33" />
          <stop offset="100%" stopColor="#15171b" />
        </linearGradient>

        <linearGradient id="crimpSteel" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#7d818a" />
          <stop offset="18%" stopColor="#d9dce2" />
          <stop offset="38%" stopColor="#f7f8fa" />
          <stop offset="62%" stopColor="#b6bac3" />
          <stop offset="84%" stopColor="#e3e5ea" />
          <stop offset="100%" stopColor="#6b6f78" />
        </linearGradient>
      </defs>

      {/* ================= BACK LAYER (Rendered behind the card) ================= */}
      {(layer === 'back' || layer === 'full') && (
        <g className="clasp-back-layer">
          {/* Back curve of the hook passing behind the card punch hole */}
          <path
            d="M 23 48
               C 21 54, 21 62, 22 67
               C 23 72, 27 72, 28 67"
            fill="none"
            stroke="url(#chromeHook)"
            strokeWidth="3.8"
            strokeLinecap="round"
          />
          {/* Shadow of hook behind card */}
          <path
            d="M 23 48
               C 21 54, 21 62, 22 67
               C 23 72, 27 72, 28 67"
            fill="none"
            stroke="rgba(0,0,0,0.5)"
            strokeWidth="1.2"
            strokeLinecap="round"
            transform="translate(0, 1.5)"
          />
        </g>
      )}

      {/* ================= FRONT LAYER (Rendered in front of the card) ================= */}
      {(layer === 'front' || layer === 'full') && (
        <g className="clasp-front-layer">
          {/* 1. Ribbon End Clamp Buckle */}
          {isCongreso ? <CongresoCrimp /> : (
            <>
              <rect
                x="11"
                y="0"
                width="28"
                height="7"
                rx="1.5"
                fill="url(#clampCollar)"
                stroke="#4a4f5b"
                strokeWidth="0.7"
              />
              <line x1="14" y1="3.5" x2="36" y2="3.5" stroke="#181a1e" strokeWidth="1" strokeDasharray="2 1.5" />
            </>
          )}

          {/* 2. D-Ring Buckle */}
          <path
            d="M 14 5 C 14 20, 36 20, 36 5"
            fill="none"
            stroke="url(#chromeRing)"
            strokeWidth="3.6"
            strokeLinecap="round"
          />
          {/* D-Ring specular highlight */}
          <path
            d="M 15.5 6 C 15.5 18.5, 34.5 18.5, 34.5 6"
            fill="none"
            stroke="#ffffff"
            strokeWidth="0.8"
            strokeOpacity="0.8"
          />

          {/* 3. Swivel Joint Collar & Cylinder */}
          <ellipse
            cx="25"
            cy="18"
            rx="5"
            ry="2.8"
            fill="none"
            stroke="url(#chromeShine)"
            strokeWidth="2.4"
          />
          <rect
            x="22"
            y="19"
            width="6"
            height="7"
            rx="2"
            fill="url(#chromeHook)"
            stroke="#454b56"
            strokeWidth="0.5"
          />
          <line x1="22.5" y1="22.5" x2="27.5" y2="22.5" stroke="#1d2026" strokeWidth="0.7" />

          {/* 4. Lobster Snap Hook Body & Trigger Arm */}
          {/* Main hook upper neck */}
          <path
            d="M 23 26
               C 21 31, 20 40, 21 50
               C 22 42, 23 32, 25 26
               Z"
            fill="url(#chromeHook)"
          />

          {/* Spring gate / outer arm */}
          <path
            d="M 27 26
               C 29 31, 30 42, 29 54
               C 28 44, 27 34, 25 26
               Z"
            fill="url(#chromeShine)"
          />

          {/* Trigger lever */}
          <path
            d="M 20 38
               C 16 39, 15 41, 16 43
               C 17 45, 19 44, 20 42
               Z"
            fill="url(#chromeRing)"
            stroke="#3d424b"
            strokeWidth="0.5"
          />

          {/* Pivot rivet pin */}
          <circle cx="24" cy="33" r="1.4" fill="#2d313a" />
          <circle cx="24" cy="33" r="0.9" fill="url(#chromeShine)" />

          {/* Front tip of the hook looping UP through the punch hole */}
          <path
            d="M 26 68
               C 28 66, 29 60, 28 54"
            fill="none"
            stroke="url(#chromeShine)"
            strokeWidth="3.4"
            strokeLinecap="round"
          />
          {/* Chrome Specular Shine on front hook tip */}
          <path
            d="M 26 67
               C 27.5 65, 28.5 60, 27.8 55"
            fill="none"
            stroke="#ffffff"
            strokeWidth="1"
            strokeLinecap="round"
          />
        </g>
      )}
    </svg>
  );
}
