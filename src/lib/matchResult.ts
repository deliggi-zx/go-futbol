type MatchResultLike = {
  winner_id?: string | null
  penalty_home_score?: number | null
  penalty_away_score?: number | null
}

export function teamResultStyle(match: MatchResultLike, teamId: string | null | undefined): { color: string; opacity: number } {
  if (!match.winner_id) return { color: '#fff', opacity: 1 }
  return match.winner_id === teamId ? { color: '#C9A84C', opacity: 1 } : { color: '#fff', opacity: 0.5 }
}

export function penaltyScoreLabel(match: MatchResultLike): string | null {
  if (match.penalty_home_score == null || match.penalty_away_score == null) return null
  return `(${match.penalty_home_score}-${match.penalty_away_score})`
}
