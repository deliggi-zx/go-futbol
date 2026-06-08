-- Tabla para el cronómetro de chukker en tiempo real
CREATE TABLE IF NOT EXISTS match_clock (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id uuid NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  chukker int NOT NULL DEFAULT 1,
  status text NOT NULL DEFAULT 'stopped' CHECK (status IN ('running', 'paused', 'stopped')),
  started_at timestamptz,
  elapsed_seconds numeric NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (match_id)
);

ALTER TABLE match_clock ENABLE ROW LEVEL SECURITY;

-- Lectura pública (espectadores ven el reloj)
CREATE POLICY "match_clock_select_all"
  ON match_clock FOR SELECT
  USING (true);

-- Escritura pública (el admin se autentica vía scorer_password client-side)
CREATE POLICY "match_clock_insert_all"
  ON match_clock FOR INSERT
  WITH CHECK (true);

CREATE POLICY "match_clock_update_all"
  ON match_clock FOR UPDATE
  USING (true);
