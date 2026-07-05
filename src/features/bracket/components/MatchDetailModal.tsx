import { AnimatePresence, motion } from 'framer-motion';
import type { MatchNode } from '../types';
import { Avatar } from '../../../components/Avatar';

interface MatchDetailModalProps {
  match: MatchNode | null;
  onClose: () => void;
}

function formatDate(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' });
}

function formatTime(iso: string) {
  const d = new Date(iso);
  return d.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
}

/**
 * Efecto de "zoom local": el nodo elegido se agranda y se presenta esta
 * tarjeta centrada sobre el resto (con backdrop), en vez de un modal genérico
 * de pantalla completa — mantiene la sensación de estar dentro de la rueda.
 * Usa layoutId compartido con el nodo de origen para que la transición de
 * tamaño se sienta continua.
 */
export function MatchDetailModal({ match, onClose }: MatchDetailModalProps) {
  return (
    <AnimatePresence>
      {match && (
        <motion.div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
        >
          <motion.div
            layoutId={`match-${match.id}`}
            className="relative w-full max-w-sm rounded-2xl border border-white/10 bg-slate-900 p-6 shadow-2xl shadow-black/60"
            initial={{ scale: 0.85, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.85, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 320, damping: 26 }}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={onClose}
              aria-label="Cerrar detalle del partido"
              className="absolute right-4 top-4 flex h-8 w-8 items-center justify-center rounded-full border border-white/10 text-slate-300 hover:bg-white/10 hover:text-white transition-colors"
            >
              ✕
            </button>

            <p className="text-xs uppercase tracking-widest text-amber-400/80 font-semibold">
              {match.roundLabel}
            </p>

            {match.status === 'live' && (
              <div className="mt-1 flex items-center gap-2">
                <span className="relative flex h-2.5 w-2.5">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-500 opacity-75" />
                  <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-red-500" />
                </span>
                <span className="text-xs font-bold tracking-wide text-red-400">EN VIVO</span>
              </div>
            )}

            <div className="mt-5 space-y-4">
              <TeamRow
                team={match.homeTeam}
                score={match.homeScore}
                status={match.status}
                isWinner={match.winnerId === match.homeTeam?.id}
              />
              <TeamRow
                team={match.awayTeam}
                score={match.awayScore}
                status={match.status}
                isWinner={match.winnerId === match.awayTeam?.id}
              />
            </div>

            <div className="mt-6 border-t border-white/10 pt-4 text-sm text-slate-400 space-y-1">
              <p className="capitalize">{formatDate(match.date)} · {formatTime(match.date)}</p>
              {match.venue && <p>{match.venue}</p>}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function TeamRow({
  team,
  score,
  status,
  isWinner,
}: {
  team: MatchNode['homeTeam'];
  score?: number;
  status: MatchNode['status'];
  isWinner: boolean;
}) {
  const dimmed = status === 'finished' && !isWinner && team;

  return (
    <div className={`flex items-center justify-between rounded-xl border border-white/5 bg-white/5 px-4 py-3 ${dimmed ? 'opacity-50' : ''}`}>
      <div className="flex items-center gap-3">
        {team ? (
          <Avatar url={team.logoUrl || null} name={team.name} size={40} bordered={false} />
        ) : (
          <span className="h-10 w-10 rounded-full bg-slate-700" />
        )}
        <span className={`font-medium ${isWinner ? 'text-amber-300' : 'text-slate-100'}`}>
          {team?.name ?? 'Por definir'}
        </span>
      </div>
      {status !== 'scheduled' && (
        <span className={`text-xl font-bold tabular-nums ${isWinner ? 'text-amber-300' : 'text-slate-200'}`}>
          {score ?? '-'}
        </span>
      )}
    </div>
  );
}
