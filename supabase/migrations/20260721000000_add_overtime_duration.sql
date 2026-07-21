-- Duración elegida por el admin para el/los período(s) de tiempo extra de
-- un partido puntual — no toca la config general del torneo
-- (chukker_duration_minutes), es una decisión puntual de ese partido.
ALTER TABLE matches ADD COLUMN IF NOT EXISTS overtime_duration_minutes int;
