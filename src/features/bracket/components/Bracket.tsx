import { useMemo, useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import type { MatchNode } from '../types';
import { layoutMatches, buildConnectors, THIRD_PLACE_ROUND } from '../utils/bracketMath';
import { useTournamentRotation } from '../hooks/useTournamentRotation';
import { MatchNodeView } from './MatchNode';
import { MatchDetailModal } from './MatchDetailModal';

interface BracketProps {
  matches: MatchNode[];
  size?: number;
  trophyUrl?: string;
}

const BASE_RADIUS_RATIO = 0.46; // proporción del tamaño del lienzo
const ROUND_SPACING_RATIO = 0.082;
const R1_TICK_COUNT = 16;

export function Bracket({ matches, size = 720, trophyUrl }: BracketProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const { rotation, containerRef, stopMomentum, handlers } = useTournamentRotation({
    tickSegments: R1_TICK_COUNT,
  });

  // --- Cálculos pesados: memoizados, NO se recalculan en cada frame de rotación ---
  const radiusConfig = useMemo(
    () => ({ baseRadius: size * BASE_RADIUS_RATIO, roundSpacing: size * ROUND_SPACING_RATIO }),
    [size]
  );

  const positioned = useMemo(
    () => layoutMatches(matches, size, radiusConfig),
    [matches, size, radiusConfig]
  );

  const connectors = useMemo(() => buildConnectors(positioned), [positioned]);

  const selectedMatch = useMemo(
    () => positioned.find((m) => m.id === selectedId) ?? null,
    [positioned, selectedId]
  );

  const handleSelect = useCallback(
    (id: string) => {
      stopMomentum(); // 1. Detener inercia activa
      setSelectedId(id); // 2. Foco / zoom
    },
    [stopMomentum]
  );

  const handleClose = useCallback(() => setSelectedId(null), []);

  return (
    <div className="relative w-full overflow-hidden bg-slate-950 py-10">
      <div
        ref={containerRef}
        className="relative mx-auto select-none"
        style={{ width: size, height: size, touchAction: 'pan-y' }}
        {...handlers}
      >
        {/* Capa que rota como conjunto: líneas + nodos comparten un único motionValue */}
        <motion.div
          className="absolute inset-0"
          style={{ rotate: rotation, transformOrigin: '50% 50%' }}
        >
          <svg
            className="absolute inset-0 h-full w-full"
            viewBox={`0 0 ${size} ${size}`}
            fill="none"
          >
            {connectors.map((line) => (
              <path
                key={line.id}
                d={line.d}
                stroke={line.highlighted ? '#fbbf24' : '#334155'}
                strokeWidth={line.highlighted ? 2.5 : 1.5}
                strokeLinecap="round"
                opacity={line.highlighted ? 0.95 : 0.5}
                style={{ transition: 'stroke 300ms ease, opacity 300ms ease' }}
              />
            ))}
          </svg>

          {positioned.map((m) => (
            <MatchNodeView
              key={m.id}
              match={m}
              x={m.x}
              y={m.y}
              wheelRotation={rotation}
              isSelected={m.id === selectedId}
              onSelect={handleSelect}
            />
          ))}
        </motion.div>

        {/* Centro fijo: no rota junto con la rueda */}
        <div
          className="pointer-events-none absolute left-1/2 top-1/2 flex h-28 w-28 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-amber-400/30 bg-gradient-to-b from-slate-900 to-slate-950 shadow-[0_0_40px_rgba(251,191,36,0.15)]"
        >
          {trophyUrl ? (
            <img src={trophyUrl} alt="Trofeo del Mundial" className="h-16 w-16 object-contain" />
          ) : (
            <span className="text-4xl">🏆</span>
          )}
        </div>
      </div>

      <MatchDetailModal match={selectedMatch} onClose={handleClose} />
    </div>
  );
}
