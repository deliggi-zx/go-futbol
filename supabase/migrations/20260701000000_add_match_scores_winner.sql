ALTER TABLE matches ADD COLUMN IF NOT EXISTS winner_id uuid REFERENCES teams(id);
ALTER TABLE matches ADD COLUMN IF NOT EXISTS home_score integer;
ALTER TABLE matches ADD COLUMN IF NOT EXISTS away_score integer;
