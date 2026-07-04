type MatchLike = { round?: number | null; is_third_place?: boolean }

const ROUND_LABELS: Record<number, string> = {
  0: 'Final', 1: 'Semifinal', 2: 'Cuartos de Final', 3: 'Octavos de Final', 4: 'Dieciseisavos de Final',
}

export function knockoutRoundLabel(match: MatchLike, teamCount: number | null | undefined): string {
  if (match.is_third_place) return '3er Puesto'
  if (match.round == null || !teamCount) return `Ronda ${match.round}`
  const totalRounds = Math.ceil(Math.log2(teamCount))
  const roundsFromFinal = totalRounds - match.round
  return ROUND_LABELS[roundsFromFinal] ?? `Ronda ${match.round}`
}
