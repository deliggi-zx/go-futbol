-- Función RPC para verificar la contraseña del scorer sin exponerla al cliente.
-- SECURITY DEFINER permite leer scorer_password aunque el anon role no tenga acceso a la columna.
CREATE OR REPLACE FUNCTION verify_scorer_password(
  p_tournament_id uuid,
  p_password text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM tournaments
    WHERE id = p_tournament_id
      AND scorer_password = p_password
      AND scorer_password IS NOT NULL
  );
END;
$$;

-- Permitir ejecución desde sesiones anónimas y autenticadas
GRANT EXECUTE ON FUNCTION verify_scorer_password(uuid, text) TO anon;
GRANT EXECUTE ON FUNCTION verify_scorer_password(uuid, text) TO authenticated;
