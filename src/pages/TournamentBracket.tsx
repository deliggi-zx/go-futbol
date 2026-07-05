import { useState, useEffect, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { knockoutRoundLabel } from '../lib/knockout'
import { Bracket } from '../features/bracket/components/Bracket'
import type { MatchNode, MatchStatus } from '../features/bracket/types'
import { mockMatches } from '../features/bracket/utils/mockData'

const THIRD_PLACE_ID = 'R-THIRD-M1'

export default function TournamentBracket() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [tournament, setTournament] = useState<any>(null)
  const [rawMatches, setRawMatches] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  const size = useMemo(() => Math.min(window.innerWidth, window.innerHeight) - 48, [])

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
        .in('status', ['pending', 'scheduled', 'live', 'finished'])
        .order('round', { ascending: true })
        .order('match_number', { ascending: true }),
    ])

    setTournament(t)
    setRawMatches(m ?? [])
    setLoading(false)
  }

  /**
   * Arma el arbol COMPLETO de cruces a partir de tournament.team_count —
   * incluyendo rondas que todavia no se generaron en la base — y despues
   * lo "pinta" con los datos reales que existan. Los nodos sin fila real
   * quedan como placeholder ("Por definir"), salvo que se pueda inferir el
   * equipo por especulacion (ver mas abajo).
   */
  const mappedMatches = useMemo((): MatchNode[] => {
    const teamCount = tournament?.team_count ?? 0
    const totalRounds = teamCount >= 2 ? Math.ceil(Math.log2(teamCount)) : 0
    if (!tournament || totalRounds === 0) return mockMatches

    const nodes = new Map<string, MatchNode>()

    // 1. Esqueleto vacio de todas las rondas reales.
    for (let round = 1; round <= totalRounds; round++) {
      const count = Math.max(1, Math.round(teamCount / 2 ** round))
      for (let i = 0; i < count; i++) {
        const nodeId = `R${round}-M${i + 1}`
        nodes.set(nodeId, {
          id: nodeId,
          round,
          indexInRound: i,
          nextMatchId: round < totalRounds ? `R${round + 1}-M${Math.floor(i / 2) + 1}` : null,
          isThirdPlace: false,
          roundLabel: knockoutRoundLabel({ round, is_third_place: false }, teamCount),
          status: 'scheduled',
          date: new Date().toISOString(),
          homeTeam: null,
          awayTeam: null,
        })
      }
    }

    // 3er puesto: mismo "anillo" que semifinales, fuera del arbol principal.
    if (tournament.has_third_place && totalRounds >= 2) {
      nodes.set(THIRD_PLACE_ID, {
        id: THIRD_PLACE_ID,
        round: totalRounds,
        indexInRound: 0,
        nextMatchId: null,
        isThirdPlace: true,
        roundLabel: '3er Puesto',
        status: 'scheduled',
        date: new Date().toISOString(),
        homeTeam: null,
        awayTeam: null,
      })
    }

    // 2. Pintar con datos reales donde existan.
    function paint(node: MatchNode, real: any) {
      node.status = (real.status === 'pending' ? 'scheduled' : real.status) as MatchStatus
      node.date = real.played_at ?? node.date
      node.homeTeam = real.home_team
        ? { id: real.home_team.id, name: real.home_team.name, logoUrl: real.home_team.logo_url ?? '' }
        : null
      node.awayTeam = real.away_team
        ? { id: real.away_team.id, name: real.away_team.name, logoUrl: real.away_team.logo_url ?? '' }
        : null
      node.homeScore = real.home_score ?? undefined
      node.awayScore = real.away_score ?? undefined
      node.winnerId = real.winner_id ?? null
    }

    for (const real of rawMatches) {
      if (real.is_third_place) continue
      if (real.round == null || real.match_number == null) continue
      const node = nodes.get(`R${real.round}-M${real.match_number}`)
      if (node) paint(node, real)
    }

    const thirdPlaceReal = rawMatches.find((m) => m.is_third_place)
    const thirdNode = nodes.get(THIRD_PLACE_ID)
    if (thirdPlaceReal && thirdNode) paint(thirdNode, thirdPlaceReal)

    // 3. Especulacion: empujar ganadores hacia rondas futuras aunque todavia
    // no exista la fila real (para poder ver "quien se cruzaria con quien").
    // Solo llena un costado si no vino ya pintado por un dato real (arriba).
    for (let round = 1; round < totalRounds; round++) {
      const roundNodes = [...nodes.values()]
        .filter((n) => n.round === round && !n.isThirdPlace)
        .sort((a, b) => a.indexInRound - b.indexInRound)

      for (const m of roundNodes) {
        if (!m.winnerId || !m.nextMatchId) continue
        const parent = nodes.get(m.nextMatchId)
        if (!parent) continue
        const winnerTeam = m.winnerId === m.homeTeam?.id ? m.homeTeam : m.winnerId === m.awayTeam?.id ? m.awayTeam : null
        if (!winnerTeam) continue
        const slot: 'homeTeam' | 'awayTeam' = m.indexInRound % 2 === 0 ? 'homeTeam' : 'awayTeam'
        if (!parent[slot]) parent[slot] = winnerTeam
      }
    }

    // Perdedores de semifinal -> 3er puesto (misma logica, especulativa).
    if (thirdNode) {
      const semiRound = totalRounds - 1
      const semis = [...nodes.values()]
        .filter((n) => n.round === semiRound && !n.isThirdPlace)
        .sort((a, b) => a.indexInRound - b.indexInRound)

      semis.forEach((m, idx) => {
        if (!m.winnerId || !m.homeTeam || !m.awayTeam) return
        const loser = m.winnerId === m.homeTeam.id ? m.awayTeam : m.homeTeam
        const slot: 'homeTeam' | 'awayTeam' = idx === 0 ? 'homeTeam' : 'awayTeam'
        if (!thirdNode[slot]) thirdNode[slot] = loser
      })
    }

    return [...nodes.values()]
  }, [rawMatches, tournament])

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
    <div style={{ minHeight: '100svh', background: '#020617', color: '#fff', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', position: 'relative' }}>
      <button
        onClick={() => navigate(-1)}
        style={{ position: 'absolute', top: 16, left: 16, background: 'transparent', border: 'none', color: '#fbbf24', fontSize: 14, fontWeight: 700, cursor: 'pointer', padding: '4px 8px' }}
      >
        ← Volver
      </button>
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
