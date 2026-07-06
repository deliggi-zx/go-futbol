type MatchLike = { round?: number | null; is_third_place?: boolean; stage?: string }

const ROUND_LABELS: Record<number, string> = {
  0: 'Final', 1: 'Semifinal', 2: 'Cuartos de Final', 3: 'Octavos de Final', 4: 'Dieciseisavos de Final',
}

const STAGE_LABELS: Record<string, string> = {
  final: 'Final', semi: 'Semifinal', quarter: 'Cuartos de Final', third: '3er Puesto',
}

export function knockoutRoundLabel(match: MatchLike, teamCount: number | null | undefined): string {
  if (match.is_third_place) return '3er Puesto'
  if (match.round == null || !teamCount) {
    return STAGE_LABELS[match.stage ?? ''] ?? (match.round != null ? `Ronda ${match.round}` : 'Eliminación directa')
  }
  const totalRounds = Math.ceil(Math.log2(teamCount))
  const roundsFromFinal = totalRounds - match.round
  return ROUND_LABELS[roundsFromFinal] ?? `Ronda ${match.round}`
}
