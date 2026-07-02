ALTER TABLE tournaments ADD COLUMN IF NOT EXISTS has_third_place boolean DEFAULT false;
ALTER TABLE matches ADD COLUMN IF NOT EXISTS is_third_place boolean DEFAULT false;
ALTER TABLE matches ADD COLUMN IF NOT EXISTS match_number integer;
