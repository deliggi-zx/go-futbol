import { motion, MotionValue, useTransform } from 'framer-motion';
import type { MatchNode } from '../types';

interface MatchNodeProps {
  match: MatchNode;
  x: number;
  y: number;
  /** Rotación actual de la rueda completa: se usa para contra-rotar el contenido y que quede siempre legible. */
  wheelRotation: MotionValue<number>;
  isSelected: boolean;
  onSelect: (id: string) => void;
}

const statusDotClass: Record<MatchNode['status'], string> = {
  scheduled: 'bg-slate-500',
  live: 'bg-red-500 animate-pulse',
  finished: 'bg-amber-400',
};

export function MatchNodeView({ match, x, y, wheelRotation, isSelected, onSelect }: MatchNodeProps) {
  // Contra-rotación: el nodo gira con la rueda en posición, pero su contenido
  // interno se mantiene siempre "para arriba" para el usuario.
  const counterRotate = useTransform(wheelRotation, (r) => -r);

  const winner = match.winnerId;

  return (
    <motion.button
      type="button"
      onClick={() => onSelect(match.id)}
      className="absolute flex items-center justify-center rounded-full border border-white/10 bg-slate-900/90 shadow-lg shadow-black/40 backdrop-blur-sm outline-none focus-visible:ring-2 focus-visible:ring-amber-400"
      style={{
        left: x,
        top: y,
        width: 64,
        height: 64,
        translateX: '-50%',
        translateY: '-50%',
      }}
      animate={{ scale: isSelected ? 1.55 : 1, zIndex: isSelected ? 50 : 1 }}
      whileHover={{ scale: isSelected ? 1.55 : 1.08 }}
      transition={{ type: 'spring', stiffness: 300, damping: 22 }}
    >
      <motion.div style={{ rotate: counterRotate }} className="flex flex-col items-center gap-0.5">
        <span className={`absolute -top-1 -right-1 h-2 w-2 rounded-full ${statusDotClass[match.status]}`} />
        <div className="flex items-center gap-1">
          {match.homeTeam ? (
            <img
              src={match.homeTeam.flagUrl}
              alt={match.homeTeam.name}
              className={`h-4 w-6 rounded-sm object-cover ${
                match.status === 'finished' && winner && winner !== match.homeTeam.id ? 'opacity-40' : 'opacity-100'
              }`}
            />
          ) : (
            <span className="h-4 w-6 rounded-sm bg-slate-700" />
          )}
          {match.status !== 'scheduled' && (
            <span className="text-[10px] font-semibold tabular-nums text-slate-200">
              {match.homeScore}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          {match.awayTeam ? (
            <img
              src={match.awayTeam.flagUrl}
              alt={match.awayTeam.name}
              className={`h-4 w-6 rounded-sm object-cover ${
                match.status === 'finished' && winner && winner !== match.awayTeam.id ? 'opacity-40' : 'opacity-100'
              }`}
            />
          ) : (
            <span className="h-4 w-6 rounded-sm bg-slate-700" />
          )}
          {match.status !== 'scheduled' && (
            <span className="text-[10px] font-semibold tabular-nums text-slate-200">
              {match.awayScore}
            </span>
          )}
        </div>
      </motion.div>
    </motion.button>
  );
}
