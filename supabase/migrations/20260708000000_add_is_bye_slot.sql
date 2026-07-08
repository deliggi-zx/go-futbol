ALTER TABLE matches ADD COLUMN IF NOT EXISTS is_bye_slot boolean NOT NULL DEFAULT false;
