CREATE TABLE IF NOT EXISTS match_lineups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id uuid REFERENCES matches(id),
  team_id uuid REFERENCES teams(id),
  player_id uuid REFERENCES players(id),
  org_id uuid REFERENCES organizations(id),
  app text DEFAULT 'futbol',
  created_at timestamptz DEFAULT now()
);
