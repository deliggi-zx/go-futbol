import { useState, useEffect, useMemo } from 'react'
import { useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { Bracket } from '../features/bracket/components/Bracket'
import type { MatchNode } from '../features/bracket/types'
import { mockMatches } from '../features/bracket/utils/mockData'

export default function TournamentBracket() {
  const { id } = useParams<{ id: string }>()
  const [tournament, setTournament] = useState<any>(null)
  const [rawMatches, setRawMatches] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  const size = useMemo(() => Math.min(window.innerWidth - 32, 720), [])

  useEffect(() => {
    if (!id) return
    loadData(id)
  }, [id])

  async function loadData(tournamentId: string) {
    const [{ data: t }, { data: m }] = await Promise.all([
      supabase
        .from('tournaments')
        .select('id, name, team_count, has_third_place, format')
        .eq('id', tournamentId)
        .eq('app', 'futbol')
        .single(),
      supabase
        .from('matches')
        .select(`
          id, round, match_number, is_third_place, status, played_at,
          home_score, away_score, winner_id,
          home_team:teams!team_home_id(id, name, logo_url),
          away_team:teams!team_away_id(id, name, logo_url)
        `)
        .eq('tournament_id', tournamentId)
        .in('status', ['scheduled', 'live', 'finished'])
        .order('round', { ascending: true })
        .order('match_number', { ascending: true }),
    ])

    setTournament(t)
    setRawMatches(m ?? [])
    setLoading(false)
  }

  const mappedMatches = useMemo((): MatchNode[] => {
    const eliminationMatches = rawMatches.filter(
      (m) => !m.is_third_place && m.round != null
    )

    if (eliminationMatches.length === 0) return mockMatches

    const maxRound = Math.max(...eliminationMatches.map((m) => m.round))

    const nodes: MatchNode[] = eliminationMatches.map((m) => ({
      id: `R${m.round}-M${m.match_number}`,
      round: m.round,
      indexInRound: m.match_number - 1,
      nextMatchId:
        m.round < maxRound
          ? `R${m.round + 1}-M${Math.floor((m.match_number - 1) / 2) + 1}`
          : null,
      status: m.status as MatchNode['status'],
      date: m.played_at ?? new Date().toISOString(),
      homeTeam: m.home_team
        ? { id: m.home_team.id, name: m.home_team.name, flagUrl: m.home_team.logo_url ?? '' }
        : null,
      awayTeam: m.away_team
        ? { id: m.away_team.id, name: m.away_team.name, flagUrl: m.away_team.logo_url ?? '' }
        : null,
      homeScore: m.home_score ?? undefined,
      awayScore: m.away_score ?? undefined,
      winnerId: m.winner_id ?? null,
    }))

    const thirdPlace = rawMatches.find((m) => m.is_third_place)
    if (thirdPlace) {
      nodes.push({
        id: 'R6-M1',
        round: 6,
        indexInRound: 0,
        nextMatchId: null,
        status: thirdPlace.status as MatchNode['status'],
        date: thirdPlace.played_at ?? new Date().toISOString(),
        homeTeam: thirdPlace.home_team
          ? { id: thirdPlace.home_team.id, name: thirdPlace.home_team.name, flagUrl: thirdPlace.home_team.logo_url ?? '' }
          : null,
        awayTeam: thirdPlace.away_team
          ? { id: thirdPlace.away_team.id, name: thirdPlace.away_team.name, flagUrl: thirdPlace.away_team.logo_url ?? '' }
          : null,
        homeScore: thirdPlace.home_score ?? undefined,
        awayScore: thirdPlace.away_score ?? undefined,
        winnerId: thirdPlace.winner_id ?? null,
      })
    }

    return nodes
  }, [rawMatches])

  if (loading) {
    return (
      <div
        style={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          height: '100vh',
          background: '#020617',
        }}
      >
        <p style={{ color: '#C9A84C', fontSize: 18, fontWeight: 700 }}>Cargando bracket...</p>
      </div>
    )
  }

  return (
    <div style={{ minHeight: '100vh', background: '#020617', color: '#fff' }}>
      {tournament && (
        <div style={{ padding: '24px 16px 8px', textAlign: 'center' }}>
          <h1 style={{ fontSize: 20, fontWeight: 800, color: '#C9A84C', margin: 0 }}>
            {tournament.name}
          </h1>
          <p style={{ fontSize: 12, color: '#64748b', marginTop: 4 }}>Bracket eliminatorio</p>
        </div>
      )}
      <Bracket matches={mappedMatches} size={size} />
    </div>
  )
}
