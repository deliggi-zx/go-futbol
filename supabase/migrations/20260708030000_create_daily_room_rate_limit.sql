-- Registra cada sala nueva creada en Daily.co (no cada llamada a
-- get-or-create — solo cuando efectivamente se crea, no en el cache-hit)
-- para poder limitar la tasa de creación desde la Edge Function daily-room
-- y evitar abuso de costo con salas fabricadas via matches sin dueño real.
CREATE TABLE IF NOT EXISTS daily_room_creations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id uuid,
  created_at timestamptz DEFAULT now()
);
