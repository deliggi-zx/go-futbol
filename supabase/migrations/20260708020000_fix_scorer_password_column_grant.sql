-- La migración anterior (20260708010000) no alcanzó: anon/authenticated
-- también tienen GRANT SELECT a nivel de TABLA sobre tournaments (todas
-- las columnas), y en Postgres un REVOKE a nivel de columna no achica un
-- privilegio ya otorgado a nivel de tabla — el grant más amplio gana.
-- Para que el revoke funcione hay que sacar el SELECT de tabla completo
-- y volver a otorgarlo columna por columna, excluyendo scorer_password.
REVOKE SELECT ON tournaments FROM anon, authenticated;

GRANT SELECT (
  id, name, date, chukkers_per_match, status, created_at, winner_team_name,
  finished_at, format, num_groups, has_third_place, org_id,
  chukker_duration_minutes, app, periods_per_match, team_count, slug
) ON tournaments TO anon, authenticated;
