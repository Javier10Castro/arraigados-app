import { useRef, useEffect, useState, useCallback, type ComponentType, type PointerEvent as ReactPointerEvent } from 'react';
import LanyardRibbon from './LanyardRibbon';
import MetalClasp from './MetalClasp';
import type { CredentialBadge } from '../credentialData';

const SEGMENTS = 5;
const SEGMENT_LENGTH = 28; // 5 * 28 = 140px rest lanyard ribbon length
const CLASP_LENGTH = 58.8; // Metal swivel clasp length
const PUNCH_HOLE_OFFSET = 28; // Distance from card top edge to punch hole center
const REST_RADIUS = SEGMENTS * SEGMENT_LENGTH + CLASP_LENGTH; // ~198.8px total hanging pivot distance

type Pt = { x: number; y: number };

export type Glare = { x: number; y: number; opacity: number };
export type CardProps = {
  badge: CredentialBadge;
  isFlipped: boolean;
  isTurning: boolean;
  glare: Glare;
  cardWidth: number;
  cardHeight: number;
};
export type PhysicsParams = { gravity: number; damping: number; stiffness: number; wind: number };

/**
 * Computes a smooth, realistic woven-fabric catenary curve for the lanyard ribbon
 * with natural transverse wave inertia and slack response.
 */
function generateRibbonPoints(p0: Pt, p1: Pt, theta: number, claspAngle: number, alpha: number, omega: number, slack: number, segments = 5) {
  const pts: Pt[] = [];
  const dx = p1.x - p0.x;
  const dy = p1.y - p0.y;
  const chordLen = Math.hypot(dx, dy) || 1;

  // Tangents at boundaries
  // Top anchor starts near-vertical down from ceiling rail
  const topAngle = theta * 0.35;
  const t0x = Math.sin(topAngle) * chordLen;
  const t0y = Math.cos(topAngle) * chordLen;

  // Bottom clasp aligns with clasp collar
  const t1x = Math.sin(claspAngle) * chordLen;
  const t1y = Math.cos(claspAngle) * chordLen;

  // Perpendicular normal vector for transverse wave / cloth bulging
  const normX = -dy / chordLen;
  const normY = dx / chordLen;
  const waveAmp = (-alpha * 0.40 - omega * 0.18) + (slack > 4 ? slack * 0.45 : 0);

  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    const t2 = t * t;
    const t3 = t2 * t;
    const h00 = 2 * t3 - 3 * t2 + 1;
    const h10 = t3 - 2 * t2 + t;
    const h01 = -2 * t3 + 3 * t2;
    const h11 = t3 - t2;

    let px = h00 * p0.x + h01 * p1.x + h10 * t0x + h11 * t1x;
    let py = h00 * p0.y + h01 * p1.y + h10 * t0y + h11 * t1y;

    // Bulge is zero at endpoints, maximum at center of ribbon
    const bulge = Math.sin(Math.PI * t);
    px += normX * waveAmp * bulge;
    py += normY * waveAmp * bulge;

    pts.push({ x: px, y: py });
  }

  return pts;
}

type Props = {
  badge: CredentialBadge;
  anchorX?: number;
  anchorY?: number;
  cardWidth?: number;
  cardHeight?: number;
  /** DEBE ser una referencia estable (está en las dependencias del bucle de animación). */
  physicsParams?: PhysicsParams;
  /** Componente que dibuja la tarjeta (la credencial). */
  cardComponent: ComponentType<CardProps>;
  isFlipped?: boolean;
  isTurning?: boolean;
  onToggleFlip?: () => void;
  /** Ángulo inicial del péndulo (rad). Con velocidad 0 el gafete "cae" y rebota. */
  initialAngle?: number;
  /** Velocidad radial inicial (px/s): da peso a la caída. */
  initialRadialVelocity?: number;
  /** Amortiguamiento radial por frame. */
  radialDamping?: number;
};

export default function HangingBadge({
  badge,
  anchorX = 200,
  anchorY = 12,
  cardWidth = 255,
  cardHeight = 400,
  physicsParams = { gravity: 0.5, damping: 0.99, stiffness: 14, wind: 0 },
  cardComponent: BadgeComponent,
  isFlipped = false,
  onToggleFlip,
  isTurning = false,
  initialAngle = 0,
  initialRadialVelocity = 0,
  radialDamping = 0.85,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const animFrameRef = useRef<number | null>(null);

  // El gafete del congreso usa un mosquetón más grande con casquillo, como en el
  // mockup. El radio total no cambia: la cinta cede ese largo, así que la
  // credencial cuelga a la misma altura y la cinta visible queda más corta.
  const claspScale = 1.3;
  const claspLength = CLASP_LENGTH * claspScale;
  const claspW = 42 * claspScale;
  const claspH = 70 * claspScale;

  // 1. Primary Lanyard Pendulum State
  // `initialAngle` / `initialRadialVelocity` se aplican en el primer frame del
  // bucle (más abajo) para que la caída arranque ya con esas condiciones.
  const pendulumAngleRef = useRef(0); // theta in radians
  const pendulumAngularVelRef = useRef(0); // omega in rad/s
  const pendulumRadiusRef = useRef(REST_RADIUS); // R in px
  const radialVelRef = useRef(0);

  // 2. Secondary Card Flutter & Inertia Wiggle
  const cardFlutterRef = useRef(0); // psi (angle relative to strap)
  const cardFlutterVelRef = useRef(0);
  const cardTiltXRef = useRef(0); // 3D aerodynamic pitch
  const cardTiltYRef = useRef(0); // 3D aerodynamic twist

  // 3. Tracking Physical Coordinates
  const hookPosRef = useRef({ x: anchorX, y: anchorY + REST_RADIUS });
  const claspTopRef = useRef({ x: anchorX, y: anchorY + REST_RADIUS - claspLength });
  const cardTransformRef = useRef({
    x: anchorX - cardWidth / 2,
    y: anchorY + REST_RADIUS - PUNCH_HOLE_OFFSET,
  });

  // 4. Drag & Interaction State
  const isDraggingRef = useRef(false);
  const dragTargetRef = useRef<string | null>(null); // 'card' | 'clasp'
  const dragOffsetRef = useRef({ x: 0, y: 0 });
  const targetHookPosRef = useRef({ x: anchorX, y: anchorY + REST_RADIUS });
  const dragVelocityRef = useRef({ vx: 0, vy: 0 });
  const pointerHistoryRef = useRef<{ x: number; y: number; time: number }[]>([]);
  const isCardHoveredRef = useRef(false);
  const mousePosRef = useRef({ x: -1000, y: -1000, vx: 0, vy: 0, lastTime: 0 });

  // 5. React Render State
  const [renderPoints, setRenderPoints] = useState<Pt[]>(() => {
    const pts: Pt[] = [];
    for (let i = 0; i <= SEGMENTS; i++) {
      pts.push({ x: anchorX, y: anchorY + i * SEGMENT_LENGTH });
    }
    return pts;
  });

  const [cardTransform, setCardTransform] = useState({
    x: anchorX - cardWidth / 2,
    y: anchorY + REST_RADIUS - PUNCH_HOLE_OFFSET,
    rotateZ: 0,
    rotateX: 0,
    rotateY: 0,
    shadowOffsetX: 0,
    shadowOffsetY: 24,
    shadowBlur: 32,
    shadowOpacity: 0.38,
  });

  const [claspTransform, setClaspTransform] = useState({
    x: anchorX,
    y: anchorY + REST_RADIUS - claspLength,
    angle: 0,
  });

  const [glare, setGlare] = useState({ x: 50, y: 50, opacity: 0.12 });
  const [cursorDragging, setCursorDragging] = useState(false);

  // Main 60fps/120fps Real-World Physics Engine
  useEffect(() => {
    let lastTimestamp = performance.now();
    let windTime = 0;
    // Condiciones iniciales de la caída: se aplican una sola vez, en el primer
    // tick, para que el gafete arranque soltándose desde arriba.
    let firstFrame = true;

    const tick = (now: number) => {
      const dt = Math.min((now - lastTimestamp) / 1000, 0.025);
      lastTimestamp = now;
      if (dt <= 0) {
        animFrameRef.current = requestAnimationFrame(tick);
        return;
      }
      windTime += dt;

      // Suelta inicial del péndulo: theta con velocidad angular 0 hace que la
      // gravedad acelere el gafete hasta el centro y la inercia lo rebase.
      if (firstFrame) {
        firstFrame = false;
        pendulumAngleRef.current = initialAngle;
        pendulumAngularVelRef.current = 0;
        radialVelRef.current = initialRadialVelocity;
        const hookX0 = anchorX + pendulumRadiusRef.current * Math.sin(pendulumAngleRef.current);
        const hookY0 = anchorY + pendulumRadiusRef.current * Math.cos(pendulumAngleRef.current);
        hookPosRef.current = { x: hookX0, y: hookY0 };
        claspTopRef.current = { x: hookX0, y: hookY0 - claspLength };
        cardTransformRef.current = { x: hookX0 - cardWidth / 2, y: hookY0 - PUNCH_HOLE_OFFSET };
        setCardTransform((prev) => ({
          ...prev,
          x: hookX0 - cardWidth / 2,
          y: hookY0 - PUNCH_HOLE_OFFSET,
        }));
        setClaspTransform((prev) => ({ ...prev, x: hookX0, y: hookY0 - claspLength }));
      }

      // Realistic physical constants for an ID badge:
      // Balanced, smooth conference badge swing period ~1.3s (slightly slower, more elegant & weighted)
      const userGravity = physicsParams.gravity || 0.5;
      const omega0Sq = userGravity * 46.0;

      let currentAlpha = 0;

      // -------------------------------------------------------------
      // 1. SIMULATION STEP: DRAGGING VS FREE PENDULUM OSCILLATION
      // -------------------------------------------------------------
      if (isDraggingRef.current) {
        const targetHook = targetHookPosRef.current;
        const dx = targetHook.x - anchorX;
        const dy = targetHook.y - anchorY;

        const safeDy = Math.max(15, dy);
        const targetTheta = Math.atan2(dx, safeDy);

        // Realistic lanyard constraint: resists stretch firmly (woven polyester fabric)
        const rawDist = Math.hypot(dx, safeDy);
        let targetR;
        if (rawDist > REST_RADIUS) {
          // Subtle 10% elastic give under high pull
          targetR = REST_RADIUS + Math.min(22, (rawDist - REST_RADIUS) * 0.10);
        } else {
          // Pushed upwards towards ceiling rail: strap goes slack
          targetR = Math.max(50, rawDist);
        }

        const prevTheta = pendulumAngleRef.current;
        // Direct, snappy 1:1 control with realistic inertia smoothing
        pendulumAngleRef.current += (targetTheta - pendulumAngleRef.current) * 0.82;
        pendulumRadiusRef.current += (targetR - pendulumRadiusRef.current) * 0.82;
        pendulumAngularVelRef.current = (pendulumAngleRef.current - prevTheta) / dt;
        radialVelRef.current = 0;

        // Card flutter follows drag velocity with lag
        const dragLag = -Math.max(-0.22, Math.min(0.22, dragVelocityRef.current.vx * 0.0007));
        cardFlutterRef.current += (dragLag - cardFlutterRef.current) * 0.25;
        cardFlutterVelRef.current = 0;

        // 3D perspective tilt while dragging
        const targetTiltY = Math.max(-16, Math.min(16, -dragVelocityRef.current.vx * 0.020));
        const targetTiltX = Math.max(-12, Math.min(12, -dragVelocityRef.current.vy * 0.016));
        cardTiltYRef.current += (targetTiltY - cardTiltYRef.current) * 0.22;
        cardTiltXRef.current += (targetTiltX - cardTiltXRef.current) * 0.22;
      } else {
        // --- NATURAL PENDULUM SWING ---
        // Harmonic restoring torque: tau = -omega0^2 * sin(theta)
        const restoringTorque = -omega0Sq * Math.sin(pendulumAngleRef.current);

        // Ambient Wind Force
        const windForce = physicsParams.wind > 0
          ? (Math.sin(windTime * 2.5) * 0.70 + Math.cos(windTime * 4.6) * 0.30) * (physicsParams.wind * 1.4)
          : 0;

        // Proximity Breeze Deflection from Cursor
        const curHookX = anchorX + pendulumRadiusRef.current * Math.sin(pendulumAngleRef.current);
        const curHookY = anchorY + pendulumRadiusRef.current * Math.cos(pendulumAngleRef.current);
        const cardCenterX = curHookX;
        const cardCenterY = curHookY + cardHeight / 2 - PUNCH_HOLE_OFFSET;
        const dxM = mousePosRef.current.x - cardCenterX;
        const dyM = mousePosRef.current.y - cardCenterY;
        const distM = Math.hypot(dxM, dyM);

        let breezeTorque = 0;
        let hoverTiltY = 0;
        let hoverTiltX = 0;
        if (distM < 380) {
          const prox = 1 - distM / 380;
          breezeTorque = (mousePosRef.current.vx / 380) * prox * 1.7;
          hoverTiltY = Math.max(-14, Math.min(14, (dxM / 200) * 12));
          hoverTiltX = Math.max(-10, Math.min(10, -(dyM / 250) * 8));
        }

        currentAlpha = restoringTorque + windForce + breezeTorque;
        pendulumAngularVelRef.current += currentAlpha * dt;

        // Realistic air damping: long, graceful, hypnotic swing that oscillates 18-25+ times!
        // At default 0.990: decayRate = 0.9985 per frame (at 60fps)
        const userDamping = Math.max(0.94, Math.min(0.995, physicsParams.damping || 0.990));
        const decayRate = 0.994 + ((userDamping - 0.94) / (0.995 - 0.94)) * 0.005;
        pendulumAngularVelRef.current *= Math.pow(decayRate, dt * 60);

        pendulumAngleRef.current += pendulumAngularVelRef.current * dt;
        pendulumAngleRef.current = Math.max(-1.42, Math.min(1.42, pendulumAngleRef.current));

        // Radial spring return to taut rest length
        const targetRadius = REST_RADIUS;
        const radialSpring = -(pendulumRadiusRef.current - targetRadius) * 32.0;
        radialVelRef.current += radialSpring * dt;
        radialVelRef.current *= Math.pow(radialDamping, dt * 60);
        pendulumRadiusRef.current += radialVelRef.current * dt;
        pendulumRadiusRef.current = Math.max(REST_RADIUS * 0.5, Math.min(REST_RADIUS * 1.15, pendulumRadiusRef.current));

        // Secondary Card Flutter (trailing inertia on swing + kicking at apex)
        const flutterOmegaSq = 48.0; // flutter frequency ~7.0 rad/s
        const flutterTorque = -0.28 * currentAlpha - flutterOmegaSq * cardFlutterRef.current;
        cardFlutterVelRef.current += flutterTorque * dt;
        cardFlutterVelRef.current *= Math.pow(0.94, dt * 60);
        cardFlutterRef.current += cardFlutterVelRef.current * dt;
        cardFlutterRef.current = Math.max(-0.30, Math.min(0.30, cardFlutterRef.current)); // max +/- 17 deg

        // 3D Aerodynamic twist (Y-axis) and pitch (X-axis)
        const swingSpeed = pendulumAngularVelRef.current;
        const swingTwistY = Math.max(-15, Math.min(15, -swingSpeed * 3.2));
        const swingPitchX = Math.max(-10, Math.min(10, -Math.abs(swingSpeed) * 1.8));
        cardTiltYRef.current += (swingTwistY + hoverTiltY - cardTiltYRef.current) * 0.16;
        cardTiltXRef.current += (swingPitchX + hoverTiltX - cardTiltXRef.current) * 0.16;
      }

      // -------------------------------------------------------------
      // 2. KINEMATIC GEOMETRY & PHYSICAL CONNECTIONS
      // -------------------------------------------------------------
      const theta = pendulumAngleRef.current;
      const psi = cardFlutterRef.current;
      const R = pendulumRadiusRef.current;

      // Hook Position (where clasp hook pierces the card punch hole)
      const hookX = anchorX + R * Math.sin(theta);
      const hookY = anchorY + R * Math.cos(theta);
      hookPosRef.current = { x: hookX, y: hookY };

      // Clasp Angle (connects strap to punch hole)
      const claspAngle = theta + psi * 0.35;
      const claspDeg = -(claspAngle * 180) / Math.PI;

      // Clasp Top Position (where ribbon attaches to top clamp of clasp)
      const claspTopX = hookX - Math.sin(claspAngle) * claspLength;
      const claspTopY = hookY - Math.cos(claspAngle) * claspLength;
      claspTopRef.current = { x: claspTopX, y: claspTopY };

      // Total Card Angle in CSS degrees
      const totalCardAngle = theta + psi;
      const cardDeg = -(totalCardAngle * 180) / Math.PI;

      // Card Coordinates (punch hole centered at hookX, hookY)
      const cardX = hookX - cardWidth / 2;
      const cardY = hookY - PUNCH_HOLE_OFFSET;
      cardTransformRef.current = { x: cardX, y: cardY };

      // Dynamic studio lighting drop-shadow offset
      const shadowOffsetX = -Math.sin(theta) * 26;
      const shadowOffsetY = 20 + Math.cos(theta) * 14;
      const shadowBlur = 32 + Math.abs(theta) * 16;
      const shadowOpacity = 0.42 - Math.abs(theta) * 0.08;

      // -------------------------------------------------------------
      // 3. RIBBON CATENARY CURVE SIMULATION
      // -------------------------------------------------------------
      const slack = Math.max(0, REST_RADIUS - R);
      const ribbonPts = generateRibbonPoints(
        { x: anchorX, y: anchorY },
        { x: claspTopX, y: claspTopY },
        theta,
        claspAngle,
        currentAlpha,
        pendulumAngularVelRef.current,
        slack,
        SEGMENTS,
      );

      // Specular light glare on glossy plastic card
      const m = mousePosRef.current;
      let glareX: number, glareY: number, glareOpacity: number;
      if (isCardHoveredRef.current || isDraggingRef.current) {
        glareX = Math.max(0, Math.min(100, ((m.x - cardX) / cardWidth) * 100));
        glareY = Math.max(0, Math.min(100, ((m.y - cardY) / cardHeight) * 100));
        glareOpacity = isDraggingRef.current ? 0.28 : 0.18;
      } else {
        // Overhead studio spotlight reflection shifting dynamically with card swing
        glareX = Math.max(10, Math.min(90, 50 + Math.sin(totalCardAngle) * 42));
        glareY = Math.max(15, Math.min(85, 38 + Math.cos(totalCardAngle) * 18));
        glareOpacity = 0.12 + Math.abs(Math.sin(totalCardAngle)) * 0.10;
      }

      // -------------------------------------------------------------
      // 4. SYNC TO REACT COMPONENT STATE
      // -------------------------------------------------------------
      setRenderPoints(ribbonPts);

      setClaspTransform({
        x: claspTopX,
        y: claspTopY,
        angle: claspDeg,
      });

      setCardTransform({
        x: cardX,
        y: cardY,
        rotateZ: cardDeg,
        rotateX: cardTiltXRef.current,
        rotateY: cardTiltYRef.current,
        shadowOffsetX,
        shadowOffsetY,
        shadowBlur,
        shadowOpacity,
      });

      setGlare({ x: glareX, y: glareY, opacity: glareOpacity });

      animFrameRef.current = requestAnimationFrame(tick);
    };

    animFrameRef.current = requestAnimationFrame(tick);
    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };
  }, [
    anchorX,
    anchorY,
    cardWidth,
    cardHeight,
    claspLength,
    physicsParams,
    initialAngle,
    initialRadialVelocity,
    radialDamping,
  ]);

  // Pointer Down Interaction (Mouse or Touch Drag)
  const handlePointerDown = (e: ReactPointerEvent, target = 'card') => {
    e.preventDefault();
    isDraggingRef.current = true;
    dragTargetRef.current = target;
    setCursorDragging(true);


    const rect = containerRef.current?.getBoundingClientRect() ?? { left: 0, top: 0 };
    const clientX = e.clientX;
    const clientY = e.clientY;
    const relX = clientX - rect.left;
    const relY = clientY - rect.top;

    const hookPos = hookPosRef.current;
    dragOffsetRef.current = {
      x: relX - hookPos.x,
      y: relY - hookPos.y,
    };

    targetHookPosRef.current = { x: hookPos.x, y: hookPos.y };
    dragVelocityRef.current = { vx: 0, vy: 0 };
    pointerHistoryRef.current = [{ x: clientX, y: clientY, time: performance.now() }];
  };

  // Global Pointer Events
  useEffect(() => {
    const handleGlobalPointerMove = (e: PointerEvent) => {
      const rect = containerRef.current?.getBoundingClientRect() ?? { left: 0, top: 0 };
      const clientX = e.clientX;
      const clientY = e.clientY;
      const relX = clientX - rect.left;
      const relY = clientY - rect.top;

      const now = performance.now();
      const dt = Math.max((now - mousePosRef.current.lastTime) / 1000, 0.005);
      const m = mousePosRef.current;
      m.vx = (relX - m.x) / dt;
      m.vy = (relY - m.y) / dt;
      m.x = relX;
      m.y = relY;
      m.lastTime = now;

      if (!isDraggingRef.current) return;

      const pointerHist = pointerHistoryRef.current;
      pointerHist.push({ x: clientX, y: clientY, time: now });
      if (pointerHist.length > 6) pointerHist.shift();

      const desiredHookX = relX - dragOffsetRef.current.x;
      const desiredHookY = relY - dragOffsetRef.current.y;
      targetHookPosRef.current = { x: desiredHookX, y: desiredHookY };

      const oldest = pointerHist[0];
      const timeDelta = (now - oldest.time) / 1000;
      if (timeDelta > 0.008) {
        dragVelocityRef.current = {
          vx: (clientX - oldest.x) / timeDelta,
          vy: (clientY - oldest.y) / timeDelta,
        };
      }
    };

    const handleGlobalPointerUp = () => {
      if (!isDraggingRef.current) return;
      isDraggingRef.current = false;
      dragTargetRef.current = null;
      setCursorDragging(false);


      const hist = pointerHistoryRef.current;
      if (hist.length >= 2) {
        const oldest = hist[0];
        const newest = hist[hist.length - 1];
        const dt = Math.max((newest.time - oldest.time) / 1000, 0.008);
        const vx = (newest.x - oldest.x) / dt;
        const vy = (newest.y - oldest.y) / dt;
        const speed = Math.hypot(vx, vy);

        if (speed > 60) {
          const currentTheta = pendulumAngleRef.current;
          const tangentVel = vx * Math.cos(currentTheta) - vy * Math.sin(currentTheta);
          const flingOmega = tangentVel / REST_RADIUS;
          pendulumAngularVelRef.current = Math.max(
            -11,
            Math.min(11, pendulumAngularVelRef.current + flingOmega * 0.82)
          );
        }
      }
    };

    window.addEventListener('pointermove', handleGlobalPointerMove, { passive: true });
    window.addEventListener('pointerup', handleGlobalPointerUp);
    window.addEventListener('pointercancel', handleGlobalPointerUp);

    return () => {
      window.removeEventListener('pointermove', handleGlobalPointerMove);
      window.removeEventListener('pointerup', handleGlobalPointerUp);
      window.removeEventListener('pointercancel', handleGlobalPointerUp);
    };
  }, []);

  // Trigger manual impulse / nudge (from UI 'Sway' button or shake)
  const applyImpulse = useCallback((fx = 50, fy = 0) => {
    const impulseOmega = (fx / 100) * 3.6;
    pendulumAngularVelRef.current += impulseOmega;
    cardFlutterVelRef.current -= impulseOmega * 0.35;
    radialVelRef.current += Math.abs(fy) * 0.3 + 3.0;
  }, []);

  // Listen to global badge-impulse trigger
  useEffect(() => {
    const handleImpulseEvent = (e: Event) => {
      const { fx = 50, fy = 0 } = (e as CustomEvent<{ fx?: number; fy?: number }>).detail || {};
      const variance = (Math.random() - 0.5) * 16;
      applyImpulse(fx + variance, fy);
    };
    window.addEventListener('badge-impulse', handleImpulseEvent);
    return () => window.removeEventListener('badge-impulse', handleImpulseEvent);
  }, [applyImpulse]);

  return (
    <div
      ref={containerRef}
      className="hanging-badge-container"
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        pointerEvents: 'none',
      }}
    >
      {/* 1. Lanyard Ribbon SVG Layer */}
      <svg
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          overflow: 'visible',
          pointerEvents: 'none',
        }}
      >
        <LanyardRibbon
          points={renderPoints}
          width={32}
          text={badge.lanyardText}
          badgeNumber={badge.org}
          color={badge.strapColor}
          edgeColor={badge.strapEdge}
          variant={badge.theme}
        />
      </svg>

      {/* 2a. Clasp Back Layer (Behind card: hook passes through punch hole) */}
      <div
        className="clasp-container clasp-back"
        style={{
          position: 'absolute',
          left: `${claspTransform.x}px`,
          top: `${claspTransform.y}px`,
          width: `${claspW}px`,
          height: `${claspH}px`,
          marginLeft: `${-claspW / 2}px`,
          transformOrigin: `${claspW / 2}px 0px`,
          transform: `rotate(${claspTransform.angle}deg)`,
          pointerEvents: 'none',
          zIndex: 12,
        }}
      >
        <MetalClasp width={claspW} height={claspH} layer="back" variant={badge.theme} />
      </div>

      {/* 3. The 3D Hanging Badge Card */}
      <div
        className="badge-card-anchor"
        style={{
          position: 'absolute',
          left: `${cardTransform.x}px`,
          top: `${cardTransform.y}px`,
          width: `${cardWidth}px`,
          height: `${cardHeight}px`,
          transformOrigin: `50% ${PUNCH_HOLE_OFFSET}px`, // Rotates realistically around the punch hole!
          transform: `perspective(1000px) rotateZ(${cardTransform.rotateZ}deg) rotateX(${cardTransform.rotateX}deg) rotateY(${cardTransform.rotateY}deg)`,
          transformStyle: 'preserve-3d',
          filter: `drop-shadow(${cardTransform.shadowOffsetX}px ${cardTransform.shadowOffsetY}px ${cardTransform.shadowBlur}px rgba(0, 0, 0, ${cardTransform.shadowOpacity}))`,
          pointerEvents: 'auto',
          cursor: cursorDragging ? 'grabbing' : 'grab',
          zIndex: 15,
          touchAction: 'none',
        }}
        onPointerDown={(e) => handlePointerDown(e, 'card')}
        onPointerEnter={() => {
          isCardHoveredRef.current = true;
        }}
        onPointerLeave={() => {
          isCardHoveredRef.current = false;
        }}
        onDoubleClick={onToggleFlip}
      >
        <BadgeComponent
          badge={badge}
          isFlipped={isFlipped}
          isTurning={isTurning}
          glare={glare}
          cardWidth={cardWidth}
          cardHeight={cardHeight}
        />
      </div>

      {/* 2b. Clasp Front Layer (In front of card: buckle, swivel, front latch) */}
      <div
        className="clasp-container clasp-front"
        style={{
          position: 'absolute',
          left: `${claspTransform.x}px`,
          top: `${claspTransform.y}px`,
          width: `${claspW}px`,
          height: `${claspH}px`,
          marginLeft: `${-claspW / 2}px`,
          transformOrigin: `${claspW / 2}px 0px`,
          transform: `rotate(${claspTransform.angle}deg)`,
          pointerEvents: 'auto',
          cursor: cursorDragging ? 'grabbing' : 'grab',
          zIndex: 20,
        }}
        onPointerDown={(e) => handlePointerDown(e, 'clasp')}
      >
        <MetalClasp width={claspW} height={claspH} layer="front" variant={badge.theme} />
      </div>
    </div>
  );
}
