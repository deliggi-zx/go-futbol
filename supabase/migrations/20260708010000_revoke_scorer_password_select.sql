-- La función verify_scorer_password (SECURITY DEFINER) ya estaba diseñada
-- asumiendo que anon/authenticated no podían leer esta columna directo —
-- pero ese revoke nunca se aplicó, dejando scorer_password legible por
-- REST directo (bypassando el RPC por completo). Esto lo completa: el RPC
-- sigue funcionando porque SECURITY DEFINER corre con privilegios del
-- dueño de la función, no del que llama. INSERT/UPDATE quedan intactos.
REVOKE SELECT (scorer_password) ON tournaments FROM anon, authenticated;
