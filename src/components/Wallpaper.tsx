type Props = { className?: string };

export default function Wallpaper({ className }: Props) {
  return (
    <svg
      className={className ? `wp ${className}` : 'wp'}
      viewBox="0 0 1080 2188"
      preserveAspectRatio="xMidYMid slice"
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <linearGradient id="gBase" x1="0" y1="0" x2="0" y2="1785" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#1c0b80" />
          <stop offset=".3" stopColor="#3418c4" />
          <stop offset=".6" stopColor="#2410a0" />
          <stop offset="1" stopColor="#3a1ac8" />
        </linearGradient>
        <radialGradient id="gShadow" cx="470" cy="900" r="330" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#0d0348" stopOpacity=".7" />
          <stop offset="1" stopColor="#0d0348" stopOpacity="0" />
        </radialGradient>
        <radialGradient id="gShadowTop" cx="300" cy="200" r="300" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#0d0348" stopOpacity=".8" />
          <stop offset="1" stopColor="#0d0348" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="gTL" x1="80" y1="330" x2="200" y2="600" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#6a4ce6" />
          <stop offset=".45" stopColor="#b9a9f4" />
          <stop offset=".8" stopColor="#f2f7b6" />
          <stop offset="1" stopColor="#f6fbc0" />
        </linearGradient>
        <linearGradient id="gSheetTL" x1="0" y1="170" x2="260" y2="420" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#3a1cc0" stopOpacity=".9" />
          <stop offset="1" stopColor="#7d66ef" stopOpacity=".9" />
        </linearGradient>
        <linearGradient id="gTR" x1="730" y1="260" x2="860" y2="640" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#2a12a8" />
          <stop offset=".3" stopColor="#7b5be6" />
          <stop offset=".62" stopColor="#eef3b0" />
          <stop offset="1" stopColor="#f6fbc0" />
        </linearGradient>
        <linearGradient id="gVeil" x1="0" y1="480" x2="400" y2="700" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#7c62ee" stopOpacity=".75" />
          <stop offset="1" stopColor="#c3b8f4" stopOpacity=".55" />
        </linearGradient>
        <linearGradient id="gLeftBig" x1="60" y1="700" x2="330" y2="1060" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#f4f9b8" />
          <stop offset=".3" stopColor="#eef2b6" />
          <stop offset=".5" stopColor="#a98ae8" />
          <stop offset=".8" stopColor="#4a26c8" />
          <stop offset="1" stopColor="#2a0f9a" />
        </linearGradient>
        <linearGradient id="gRightCream" x1="720" y1="700" x2="800" y2="960" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#f4f9b8" />
          <stop offset="1" stopColor="#e9efb0" />
        </linearGradient>
        <linearGradient id="gRightLow" x1="690" y1="950" x2="881" y2="1290" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#f0f5b6" />
          <stop offset=".35" stopColor="#c9c2ee" />
          <stop offset="1" stopColor="#5a38dc" />
        </linearGradient>
        <linearGradient id="gPurpleSheet" x1="400" y1="960" x2="700" y2="1300" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#4a26d0" />
          <stop offset="1" stopColor="#1c0a78" />
        </linearGradient>
        <linearGradient id="gBL1" x1="60" y1="1150" x2="330" y2="1400" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#4f2fd8" />
          <stop offset=".6" stopColor="#8c76ec" />
          <stop offset="1" stopColor="#d4d0f2" />
        </linearGradient>
        <linearGradient id="gBL2" x1="0" y1="1200" x2="110" y2="1500" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#6a52e6" />
          <stop offset="1" stopColor="#b6aaf0" />
        </linearGradient>
        <linearGradient id="gBC" x1="0" y1="1500" x2="300" y2="1700" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#f4f9b8" />
          <stop offset="1" stopColor="#eef3b2" />
        </linearGradient>
        <linearGradient id="gBot" x1="200" y1="1620" x2="560" y2="1785" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#b9b0f0" />
          <stop offset="1" stopColor="#6c56e2" />
        </linearGradient>
        <linearGradient id="gStreak" x1="380" y1="1120" x2="700" y2="1500" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#f1f6b8" stopOpacity=".9" />
          <stop offset="1" stopColor="#7a63e6" stopOpacity=".2" />
        </linearGradient>
        <linearGradient id="gBand" x1="360" y1="130" x2="650" y2="420" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#6b4ee8" stopOpacity="0" />
          <stop offset=".55" stopColor="#b7a9f6" stopOpacity=".75" />
          <stop offset="1" stopColor="#f2f7b6" stopOpacity=".9" />
        </linearGradient>
        <radialGradient id="gGlow" gradientUnits="objectBoundingBox">
          <stop offset="0" stopColor="#fbffd0" stopOpacity=".95" />
          <stop offset=".5" stopColor="#f0f5b6" stopOpacity=".45" />
          <stop offset="1" stopColor="#f0f5b6" stopOpacity="0" />
        </radialGradient>
        <radialGradient id="gVig" cx="440" cy="890" r="900" gradientUnits="userSpaceOnUse">
          <stop offset=".6" stopColor="#0a0240" stopOpacity="0" />
          <stop offset="1" stopColor="#0a0240" stopOpacity=".45" />
        </radialGradient>
        <filter id="blur40" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="34" />
        </filter>
        <filter id="blur14" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="16" />
        </filter>
        <filter id="frostFilter" x="0" y="0" width="100%" height="100%">
          <feTurbulence type="fractalNoise" baseFrequency=".035 .06" numOctaves="4" seed="3" result="n" />
          <feColorMatrix
            in="n"
            type="matrix"
            values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 3 -1.5"
          />
        </filter>
        <mask id="mFrost">
          <g filter="url(#blur40)" fill="#fff">
            <ellipse cx="350" cy="230" rx="260" ry="70" transform="rotate(38 350 230)" />
            <ellipse cx="350" cy="1120" rx="200" ry="70" transform="rotate(55 350 1120)" />
            <ellipse cx="560" cy="1350" rx="240" ry="60" transform="rotate(55 560 1350)" />
            <ellipse cx="150" cy="500" rx="140" ry="100" />
            <ellipse cx="800" cy="520" rx="110" ry="140" />
            <ellipse cx="200" cy="1600" rx="150" ry="150" />
            <ellipse cx="830" cy="1000" rx="90" ry="200" />
          </g>
        </mask>
      </defs>

      <g transform="scale(1.2258)">
        <g className="wp-base">
          <rect width="881" height="1785" fill="url(#gBase)" />
          <rect width="881" height="700" fill="url(#gShadowTop)" />
          <rect y="500" width="881" height="800" fill="url(#gShadow)" />
        </g>

        <g className="wp-motion">
          <path
            className="wp-sheet"
            d="M0 150 C100 190 200 290 285 442 L0 335Z"
            fill="url(#gSheetTL)"
            opacity=".85"
          />
          <path
            className="wp-band"
            d="M340 120 C430 210 520 310 640 400 L780 470 L700 300 C600 230 480 150 400 60Z"
            fill="url(#gBand)"
            filter="url(#blur14)"
          />

          <path
            d="M0 312 C95 318 205 355 283 442 C222 535 120 605 0 648Z"
            fill="url(#gTL)"
          />
          <path
            className="wp-veil"
            d="M0 540 C170 595 330 655 405 705 C450 625 520 605 615 625 C700 635 765 600 795 555 L560 505 C420 520 200 470 0 478Z"
            fill="url(#gVeil)"
            filter="url(#blur14)"
            opacity=".8"
          />
          <path d="M881 222 C805 285 735 365 721 470 C726 565 790 640 881 700Z" fill="url(#gTR)" />

          <path
            className="wp-sheet"
            d="M395 1050 C450 990 570 955 678 942 C630 1010 560 1080 480 1195 L881 1530 L881 1290 L700 1000Z"
            fill="url(#gPurpleSheet)"
            opacity=".9"
          />
          <path
            d="M881 672 C790 690 715 790 683 930 C678 940 679 945 681 950 C740 940 810 950 881 985Z"
            fill="url(#gRightCream)"
          />
          <path
            d="M678 945 C700 1060 780 1180 881 1290 L881 985 C810 950 740 940 678 945Z"
            fill="url(#gRightLow)"
          />

          <path
            className="wp-lobe"
            d="M0 668 C110 658 195 675 255 722 C345 795 392 935 388 1062 C380 1122 330 1106 280 1100 C180 1090 60 1050 0 995Z"
            fill="url(#gLeftBig)"
          />
          <path
            className="wp-rim"
            d="M255 722 C345 795 392 935 388 1062 C380 1122 330 1106 280 1100"
            fill="none"
            stroke="#cfc6f4"
            strokeOpacity=".55"
            strokeWidth="3"
          />

          <path
            className="wp-lobe"
            d="M0 1250 C50 1180 200 1112 330 1100 C385 1112 392 1185 332 1290 C270 1372 180 1432 80 1482 L0 1505Z"
            fill="url(#gBL1)"
            opacity=".92"
          />
          <path
            d="M0 1190 C60 1195 106 1250 108 1322 C105 1402 60 1462 0 1520Z"
            fill="url(#gBL2)"
          />
          <path
            className="wp-streak"
            d="M380 1130 C470 1210 600 1350 700 1500 L640 1520 C540 1400 430 1290 350 1200Z"
            fill="url(#gStreak)"
            filter="url(#blur14)"
          />
          <path
            d="M0 1560 C120 1450 262 1382 352 1310 C362 1402 322 1542 252 1642 C202 1722 172 1760 150 1785 L0 1785Z"
            fill="url(#gBC)"
          />
          <path
            d="M150 1785 C205 1700 330 1610 450 1605 C542 1605 592 1662 592 1785Z"
            fill="url(#gBot)"
            opacity=".95"
          />

          <ellipse
            className="wp-mist"
            cx="470"
            cy="330"
            rx="260"
            ry="60"
            transform="rotate(30 470 330)"
            fill="#b6a6f6"
            opacity=".34"
            filter="url(#blur40)"
          />
          <g className="wp-glows" filter="url(#blur40)">
            <ellipse cx="130" cy="520" rx="190" ry="95" fill="url(#gGlow)" />
            <ellipse cx="640" cy="410" rx="210" ry="110" fill="url(#gGlow)" />
            <ellipse cx="835" cy="520" rx="110" ry="170" fill="url(#gGlow)" />
            <ellipse cx="810" cy="800" rx="120" ry="160" fill="url(#gGlow)" />
            <ellipse cx="130" cy="1620" rx="190" ry="180" fill="url(#gGlow)" opacity=".7" />
          </g>
        </g>

        <g className="wp-top">
          <rect width="881" height="1785" fill="url(#gVig)" />
          <rect
            width="881"
            height="1785"
            filter="url(#frostFilter)"
            opacity=".25"
            mask="url(#mFrost)"
            style={{ mixBlendMode: 'soft-light' }}
          />
        </g>
      </g>
    </svg>
  );
}
