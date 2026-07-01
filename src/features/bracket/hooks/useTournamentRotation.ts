import { useRef, useCallback } from 'react';
import { useMotionValue, animate } from 'framer-motion';

interface UseTournamentRotationOptions {
  /** Cantidad de "muescas" de la ruleta (lo natural es usar el nro de nodos de la ronda externa). */
  tickSegments?: number;
  /** Umbral en px para decidir si el gesto es horizontal (gira la rueda) o vertical (scroll de página). */
  axisThreshold?: number;
  onTapMiss?: () => void;
}

/**
 * Hook que controla la rotación del bracket completo como una ruleta:
 * - Un único motionValue (`rotation`, en grados) gobierna todo el contenedor.
 * - Drag manual por pointer events (no el prop `drag` de Framer, porque ese
 *   trabaja en x/y y acá necesitamos ángulo respecto al centro del círculo).
 * - Al soltar, se aplica una animación de tipo `inertia` con desaceleración.
 * - Distingue gesto horizontal (rotar) de gesto vertical (scroll nativo) con
 *   un umbral de ejes, para no romper el scroll de la página en mobile.
 * - Dispara un click sintético (Web Audio) cada vez que la rotación cruza
 *   una muesca, con volumen/tono ligado a la velocidad angular.
 */
export function useTournamentRotation({
  tickSegments = 16,
  axisThreshold = 8,
}: UseTournamentRotationOptions = {}) {
  const rotation = useMotionValue(0);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);

  const draggingRef = useRef(false);
  const axisLockedRef = useRef<'rotate' | 'scroll' | null>(null);
  const startPointRef = useRef({ x: 0, y: 0 });
  const lastAngleRef = useRef(0);
  const centerRef = useRef({ x: 0, y: 0 });

  // Para inercia: historial corto de (timestamp, angle) para estimar velocidad real al soltar
  const historyRef = useRef<{ t: number; angle: number }[]>([]);
  const lastTickSegmentRef = useRef(0);

  const getAudioCtx = useCallback(() => {
    if (!audioCtxRef.current) {
      const Ctx = window.AudioContext || (window as any).webkitAudioContext;
      audioCtxRef.current = new Ctx();
    }
    return audioCtxRef.current;
  }, []);

  /** Click corto sintetizado, sin assets de audio. */
  const playTick = useCallback(
    (intensity: number) => {
      try {
        const ctx = getAudioCtx();
        if (ctx.state === 'suspended') ctx.resume();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'square';
        osc.frequency.value = 900 + Math.min(intensity, 1) * 500;
        gain.gain.setValueAtTime(0.0001, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.12 + 0.1 * Math.min(intensity, 1), ctx.currentTime + 0.002);
        gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.05);
        osc.connect(gain).connect(ctx.destination);
        osc.start();
        osc.stop(ctx.currentTime + 0.06);
      } catch {
        // Audio no disponible (ej. autoplay bloqueado antes del primer gesto): se ignora.
      }
    },
    [getAudioCtx]
  );

  const angleFromCenter = (clientX: number, clientY: number) => {
    const { x, y } = centerRef.current;
    return (Math.atan2(clientY - y, clientX - x) * 180) / Math.PI;
  };

  const stopMomentum = useCallback(() => {
    animate(rotation, rotation.get(), { duration: 0 });
  }, [rotation]);

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    const el = containerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    centerRef.current = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
    startPointRef.current = { x: e.clientX, y: e.clientY };
    lastAngleRef.current = angleFromCenter(e.clientX, e.clientY);
    draggingRef.current = true;
    axisLockedRef.current = null; // se decide en el primer move significativo
    historyRef.current = [{ t: performance.now(), angle: rotation.get() }];
    stopMomentum();
  }, [rotation, stopMomentum]);

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!draggingRef.current) return;

      const dx = e.clientX - startPointRef.current.x;
      const dy = e.clientY - startPointRef.current.y;

      if (axisLockedRef.current === null) {
        if (Math.abs(dx) < axisThreshold && Math.abs(dy) < axisThreshold) return; // aún indeterminado
        axisLockedRef.current = Math.abs(dx) > Math.abs(dy) ? 'rotate' : 'scroll';
      }

      if (axisLockedRef.current === 'scroll') {
        // Cede el gesto al scroll nativo de la página: no tocamos rotation ni preventDefault.
        return;
      }

      // Gesto de rotación: preventDefault para que el navegador no intente scrollear/zoomear.
      e.preventDefault();

      const currentAngle = angleFromCenter(e.clientX, e.clientY);
      let delta = currentAngle - lastAngleRef.current;
      if (delta > 180) delta -= 360;
      if (delta < -180) delta += 360;

      const next = rotation.get() + delta;
      rotation.set(next);
      lastAngleRef.current = currentAngle;

      const now = performance.now();
      historyRef.current.push({ t: now, angle: next });
      // Conserva solo los últimos ~120ms de historial para estimar velocidad de salida
      historyRef.current = historyRef.current.filter((h) => now - h.t < 120);

      // Sonido de "tac" al cruzar cada muesca de la rueda
      const segmentWidth = 360 / tickSegments;
      const segment = Math.floor(((next % 360) + 360) % 360 / segmentWidth);
      if (segment !== lastTickSegmentRef.current) {
        lastTickSegmentRef.current = segment;
        const speed = Math.min(Math.abs(delta) / segmentWidth, 1);
        playTick(speed);
      }
    },
    [axisThreshold, playTick, rotation, tickSegments]
  );

  const onPointerUp = useCallback(() => {
    if (!draggingRef.current) return;
    draggingRef.current = false;

    if (axisLockedRef.current === 'rotate') {
      const hist = historyRef.current;
      let velocity = 0;
      if (hist.length >= 2) {
        const first = hist[0];
        const last = hist[hist.length - 1];
        const dt = (last.t - first.t) / 1000;
        if (dt > 0) velocity = (last.angle - first.angle) / dt; // grados/segundo
      }

      // Inercia tipo ruleta: desacelera suavemente desde la velocidad de salida.
      animate(rotation, rotation.get() + velocity * 0.35, {
        type: 'inertia',
        velocity,
        power: 0.6,
        timeConstant: 280,
        restDelta: 0.4,
        onUpdate: (v) => {
          // Sigue tickeando mientras la inercia recorre muescas
          const segmentWidth = 360 / tickSegments;
          const segment = Math.floor(((v % 360) + 360) % 360 / segmentWidth);
          if (segment !== lastTickSegmentRef.current) {
            lastTickSegmentRef.current = segment;
            playTick(0.3);
          }
        },
      });
    }

    axisLockedRef.current = null;
  }, [playTick, rotation, tickSegments]);

  return {
    rotation,
    containerRef,
    stopMomentum,
    handlers: {
      onPointerDown,
      onPointerMove,
      onPointerUp,
      onPointerCancel: onPointerUp,
    },
  };
}
