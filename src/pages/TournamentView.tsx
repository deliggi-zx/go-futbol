import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { knockoutRoundLabel } from '../lib/knockout'
import { teamResultStyle, penaltyScoreLabel } from '../lib/matchResult'
import { Avatar } from '../components/Avatar'
import MatchView from './MatchView'
import AwardsView from './AwardsView'
import FixtureManager from './FixtureManager'

type Props = { tournament: any; onReset: () => void; initialMatchId?: string | null }

const gold = '#C9A84C'
const goldLight = '#E8C96A'
const darkBg = '#062B14'
const cardBg = 'linear-gradient(160deg, #3d2810 0%, #2a1c0a 30%, #1e1408 60%, #2a1c0a 100%)'
const borderGold = `1px solid ${gold}55`

const WEEKDAYS_SHORT = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb']
const WEEKDAYS_LONG = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado']

function dateKey(iso: string): string {
  const d = new Date(iso)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function formatTimeOnly(iso: string): string {
  const d = new Date(iso)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

function formatShortDateTime(iso: string): string {
  const d = new Date(iso)
  return `${WEEKDAYS_SHORT[d.getDay()]} ${d.getDate()}/${d.getMonth() + 1} · ${formatTimeOnly(iso)}hs`
}

function formatLongDate(iso: string): string {
  const d = new Date(iso)
  return `${WEEKDAYS_LONG[d.getDay()]} ${d.getDate()}/${d.getMonth() + 1}`
}

function timeOnDate(iso: string | null, dateStr: string): string {
  if (!iso || !dateStr) return ''
  if (dateKey(iso) !== dateStr) return ''
  return formatTimeOnly(iso)
}

export default function TournamentView({ tournament, onReset, initialMatchId }: Props) {
  const navigate = useNavigate()
  const [tab, setTab] = useState<'fixture' | 'schedule' | 'standings' | 'stats' | 'teams' | 'awards'>('fixture')
  const [expandedRounds, setExpandedRounds] = useState<Set<number>>(new Set())
  const [scheduleDate, setScheduleDate] = useState('')
  const [scheduleTimes, setScheduleTimes] = useState<Record<string, string>>({})
  const [savingSchedule, setSavingSchedule] = useState(false)
  const [matches, setMatches] = useState<any[]>([])
  const [teams, setTeams] = useState<any[]>([])
  const [goals, setGoals] = useState<any[]>([])
  const [players, setPlayers] = useState<any[]>([])
  const [selectedMatch, setSelectedMatch] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [editingTeam, setEditingTeam] = useState<any>(null)
  const [savingEdit, setSavingEdit] = useState(false)
  const [showFixtureManager, setShowFixtureManager] = useState(false)
  const [isAdmin, setIsAdmin] = useState(false)
  const [isScorerAdmin, setIsScorerAdmin] = useState(false)
  const [cards, setCards] = useState<any[]>([])
  const [visitorsNow, setVisitorsNow] = useState(0)
  const [totalVisits, setTotalVisits] = useState(0)

  async function handleScorerLogin() {
    const pwd = prompt('Contraseña de cargador:')
    if (pwd === null) return
    const { data: ok } = await supabase.rpc('verify_scorer_password', {
      p_tournament_id: tournament.id,
      p_password: pwd
    })
    if (ok) setIsScorerAdmin(true)
    else alert('Contraseña incorrecta')
  }

  
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) { setIsAdmin(false); return }
      supabase
        .from('organizations')
        .select('id')
        .eq('owner_id', session.user.id)
        .eq('app', 'futbol')
        .single()
        .then(({ data: org }) => {
          if (org && org.id === tournament.org_id) setIsAdmin(true)
        })
    })
  }, [])

  useEffect(() => {
    let visitorId = localStorage.getItem('visitor_id')
    if (!visitorId) {
      visitorId = crypto.randomUUID()
      localStorage.setItem('visitor_id', visitorId)
    }

    async function registerVisit() {
      const { data: existing } = await supabase
        .from('tournament_visits')
        .select('id')
        .eq('tournament_id', tournament.id)
        .eq('visitor_id', visitorId)
        .eq('app', 'futbol')
        .single()
      if (!existing) {
        await supabase.from('tournament_visits').insert({
          tournament_id: tournament.id,
          visitor_id: visitorId,
          app: 'futbol',
        })
      }
      const { count } = await supabase
        .from('tournament_visits')
        .select('*', { count: 'exact', head: true })
        .eq('tournament_id', tournament.id)
        .eq('app', 'futbol')
      setTotalVisits(count ?? 0)
    }
    registerVisit()

    const room = supabase.channel(`presence:${tournament.id}`, {
      config: { presence: { key: visitorId } }
    })
    room
      .on('presence', { event: 'sync' }, () => {
        const state = room.presenceState()
        setVisitorsNow(Object.keys(state).length)
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          await room.track({ tournament_id: tournament.id })
        }
      })

    return () => { supabase.removeChannel(room) }
  }, [tournament.id])

  useEffect(() => {
    loadData().then((loadedMatches) => {
      if (initialMatchId && loadedMatches) {
        const match = loadedMatches.find((m: any) => m.id === initialMatchId)
        if (match) setSelectedMatch(match)
      }
    })

    const channel = supabase
      .channel(`tournament-changes-${tournament.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'goals' }, () => loadData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'matches' }, () => loadData())
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [tournament.id])

  async function loadData() {
    setLoading(true)
    const [m, t] = await Promise.all([
      supabase.from('matches').select('*, team_home:teams!matches_team_home_id_fkey(*), team_away:teams!matches_team_away_id_fkey(*)').eq('tournament_id', tournament.id).eq('app', 'futbol').order('created_at'),
      supabase.from('teams').select('*').eq('tournament_id', tournament.id).eq('app', 'futbol'),
    ])
    const matchIds = (m.data ?? []).map((x: any) => x.id)
    const teamIds = (t.data ?? []).map((x: any) => x.id)
    const [g, p, ca] = await Promise.all([
      matchIds.length > 0 ? supabase.from('goals').select('*, player:players(*), team:teams(*)').in('match_id', matchIds).eq('app', 'futbol') : Promise.resolve({ data: [] }),
      teamIds.length > 0 ? supabase.from('players').select('*, team:teams(*)').in('team_id', teamIds).eq('app', 'futbol') : Promise.resolve({ data: [] }),
      matchIds.length > 0 ? supabase.from('cards').select('*, player:players(*), team:teams(*)').in('match_id', matchIds).eq('app', 'futbol') : Promise.resolve({ data: [] }),
    ])
    setMatches(m.data ?? [])
    setTeams(t.data ?? [])
    setGoals(g.data ?? [])
    setPlayers(p.data ?? [])
    setCards(ca.data ?? [])
    setLoading(false)
    return m.data ?? []
  }

  function getMatchGoals(matchId: string, teamId: string) {
    return goals.filter(g => g.match_id === matchId && g.team_id === teamId).length
  }

  function getStandings(group: string) {
    const groupTeams = teams.filter(t => t.group_name === group)
    return groupTeams.map(team => {
      const teamMatches = matches.filter(m =>
        m.stage === 'group' && m.group_name === group && m.status === 'finished' &&
        (m.team_home_id === team.id || m.team_away_id === team.id)
      )
      let pts = 0, gf = 0, gc = 0, w = 0, l = 0, d = 0
      for (const m of teamMatches) {
        const isHome = m.team_home_id === team.id
        const myGoals = getMatchGoals(m.id, team.id)
        const oppId = isHome ? m.team_away_id : m.team_home_id
        const oppGoals = getMatchGoals(m.id, oppId)
        gf += myGoals; gc += oppGoals
        if (myGoals > oppGoals) { pts += 3; w++ }
        else if (myGoals === oppGoals) { pts += 1; d++ }
        else l++
      }
      return { ...team, pts, gf, gc, gd: gf - gc, w, d, l, pj: teamMatches.length }
    }).sort((a, b) => b.pts - a.pts || b.gd - a.gd)
  }

  function getTopScorers() {
    const counts: Record<string, { player: any; goals: number }> = {}
    for (const g of goals) {
      if (!g.player) continue
      if (!counts[g.player.id]) counts[g.player.id] = { player: g.player, goals: 0 }
      counts[g.player.id].goals++
    }
    return Object.values(counts).sort((a, b) => b.goals - a.goals)
  }

  function getAllTeamStandings() {
    return teams.map(team => {
      const teamMatches = matches.filter(m =>
        m.stage === 'group' && m.status === 'finished' &&
        (m.team_home_id === team.id || m.team_away_id === team.id)
      )
      let pts = 0, gf = 0, gc = 0, w = 0, l = 0, d = 0
      for (const m of teamMatches) {
        const myGoals = getMatchGoals(m.id, team.id)
        const oppId = m.team_home_id === team.id ? m.team_away_id : m.team_home_id
        const oppGoals = getMatchGoals(m.id, oppId)
        gf += myGoals; gc += oppGoals
        if (myGoals > oppGoals) { pts += 3; w++ }
        else if (myGoals === oppGoals) { pts += 1; d++ }
        else l++
      }
      return { ...team, pts, gf, gc, gd: gf - gc, w, d, l, pj: teamMatches.length }
    }).sort((a, b) => b.pts - a.pts || b.gd - a.gd)
  }

  function getDisciplineTable() {
    const map: Record<string, { player: any; team: any; yellows: number; reds: number }> = {}
    for (const c of cards) {
      if (!c.player) continue
      if (!map[c.player_id]) map[c.player_id] = { player: c.player, team: c.team, yellows: 0, reds: 0 }
      if (c.card_type === 'yellow') map[c.player_id].yellows++
      else if (c.card_type === 'red') map[c.player_id].reds++
    }
    return Object.values(map).sort((a, b) => (b.reds * 10 + b.yellows) - (a.reds * 10 + a.yellows))
  }

  async function uploadImage(file: File, path: string): Promise<string | null> {
    const { error } = await supabase.storage.from('avatars').upload(path, file, { upsert: true })
    if (error) return null
    const { data } = supabase.storage.from('avatars').getPublicUrl(path)
    return data.publicUrl
  }

  async function saveTeamEdit() {
    if (!editingTeam) return
    setSavingEdit(true)
    try {
      let logoUrl = editingTeam.logo_url
      if (editingTeam._newLogo) {
        logoUrl = await uploadImage(editingTeam._newLogo, `logos/${editingTeam.id}.jpg`)
      }
      await supabase.from('teams').update({ name: editingTeam.name, logo_url: logoUrl }).eq('id', editingTeam.id)

      for (const player of editingTeam._players) {
        let photoUrl = player.photo_url
        if (player._newPhoto) {
          photoUrl = await uploadImage(player._newPhoto, `players/${player.id}.jpg`)
        }
        await supabase.from('players').update({ name: player.name, photo_url: photoUrl, handicap: player.handicap, position: player.position, bio: player.bio }).eq('id', player.id)
      }

      await loadData()
      setEditingTeam(null)
    } catch (e) {
      alert('Error al guardar')
    } finally {
      setSavingEdit(false)
    }
  }

  async function generateNextKnockoutRound() {
    const nonTPMatches = matches.filter((m: any) => m.round != null && !m.is_third_place)
    if (nonTPMatches.length === 0) return
    const currentRound = Math.max(...nonTPMatches.map((m: any) => m.round))
    const currentRoundMatches = nonTPMatches
      .filter((m: any) => m.round === currentRound)
      .sort((a: any, b: any) => a.match_number - b.match_number)
    if (!currentRoundMatches.every((m: any) => m.winner_id)) return

    const nextRound = currentRound + 1
    const nextMatchCount = currentRoundMatches.length / 2
    const nextStage = nextMatchCount === 1 ? 'final' : nextMatchCount === 2 ? 'semi' : 'quarter'

    const inserts = []
    for (let i = 0; i < currentRoundMatches.length; i += 2) {
      inserts.push({
        tournament_id: tournament.id,
        team_home_id: currentRoundMatches[i].winner_id,
        team_away_id: currentRoundMatches[i + 1].winner_id,
        stage: nextStage,
        status: 'pending',
        round: nextRound,
        match_number: i / 2 + 1,
        app: 'futbol',
      })
    }
    await supabase.from('matches').insert(inserts)

    // Generar 3er/4to puesto con los PERDEDORES de las semis, al avanzar a la final
    if (nextStage === 'final' && tournament.has_third_place) {
      const losers = currentRoundMatches.map((m: any) =>
        m.winner_id === m.team_home_id ? m.team_away_id : m.team_home_id
      )
      await supabase.from('matches').insert({
        tournament_id: tournament.id,
        team_home_id: losers[0],
        team_away_id: losers[1],
        stage: 'third',
        status: 'pending',
        round: nextRound,
        match_number: 1,
        is_third_place: true,
        app: 'futbol',
      })
    }
    loadData()
  }

  // Arma la primera ronda del cuadro de eliminación con los clasificados de
  // TODOS los grupos (no solo A/B), usando tournaments.num_groups. Los
  // partidos quedan con round/match_number, así que las rondas siguientes
  // las genera generateNextKnockoutRound() como en el formato knockout puro.
  async function generateKnockoutBracketFromGroups() {
    const numGroups = tournament.num_groups ?? groups.length
    const groupLetters = Array.from({ length: numGroups }, (_, i) => String.fromCharCode(65 + i))
    const standingsByGroup = groupLetters.map(g => getStandings(g))
    if (standingsByGroup.some(s => s.length < 2)) {
      alert('Cada grupo necesita al menos 2 equipos para clasificar al cuadro de eliminación.')
      return
    }

    const firsts = standingsByGroup.map(s => s[0])
    const seconds = standingsByGroup.map(s => s[1])
    const qualifierCount = firsts.length + seconds.length
    if ((qualifierCount & (qualifierCount - 1)) !== 0) {
      alert(`Con ${numGroups} grupos clasifican ${qualifierCount} equipos, y eso no arma un cuadro parejo de eliminación directa (hace falta una potencia de 2: 4, 8, 16...). No se soportan cuadros con "bye".`)
      return
    }

    // 1° de cada grupo vs 2° del grupo siguiente (rotado), para evitar que
    // se crucen dos equipos del mismo grupo en la primera ronda.
    const pairs = firsts.map((first, i) => [first, seconds[(i + 1) % seconds.length]])
    const stage = pairs.length === 1 ? 'final' : pairs.length === 2 ? 'semi' : 'quarter'

    await supabase.from('matches').insert(
      pairs.map((pair, i) => ({
        tournament_id: tournament.id,
        team_home_id: pair[0].id,
        team_away_id: pair[1].id,
        stage,
        status: 'pending',
        round: 1,
        match_number: i + 1,
        app: 'futbol',
      }))
    )
    loadData()
  }

  // Todos contra todos: la final sale directo del 1° y 2° de la tabla general
  // (mismo desempate que getAllTeamStandings: puntos, luego diferencia de gol).
  async function generateRoundRobinFinal() {
    const standings = getAllTeamStandings()
    if (standings.length < 2) return
    await supabase.from('matches').insert({
      tournament_id: tournament.id,
      team_home_id: standings[0].id,
      team_away_id: standings[1].id,
      stage: 'final',
      status: 'pending',
      app: 'futbol',
    })
    loadData()
  }

  async function saveSchedule() {
    if (!scheduleDate) { alert('Elegí una fecha primero.'); return }
    const updates = matches
      .map(m => {
        const time = scheduleTimes[m.id] ?? timeOnDate(m.scheduled_at, scheduleDate)
        if (!time) return null
        return { id: m.id, scheduled_at: new Date(`${scheduleDate}T${time}:00`).toISOString() }
      })
      .filter((u): u is { id: string; scheduled_at: string } => u !== null)
    if (updates.length === 0) { alert('Cargá al menos un horario antes de guardar.'); return }
    setSavingSchedule(true)
    await Promise.all(updates.map(u => supabase.from('matches').update({ scheduled_at: u.scheduled_at }).eq('id', u.id)))
    setScheduleTimes({})
    await loadData()
    setSavingSchedule(false)
  }

  async function clearSchedule(matchId: string) {
    await supabase.from('matches').update({ scheduled_at: null }).eq('id', matchId)
    loadData()
  }

  function toggleRound(round: number) {
    setExpandedRounds(prev => {
      const next = new Set(prev)
      next.has(round) ? next.delete(round) : next.add(round)
      return next
    })
  }

  const groups = [...new Set(teams.filter(t => t.group_name).map(t => t.group_name))].sort()

  const scheduledMatches = matches.filter(m => m.scheduled_at).sort((a, b) => new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime())
  const unscheduledMatches = matches.filter(m => !m.scheduled_at)
  const scheduleDateGroups: any[][] = []
  for (const m of scheduledMatches) {
    const lastGroup = scheduleDateGroups[scheduleDateGroups.length - 1]
    if (lastGroup && dateKey(lastGroup[0].scheduled_at) === dateKey(m.scheduled_at)) {
      lastGroup.push(m)
    } else {
      scheduleDateGroups.push([m])
    }
  }

  const styles = {
    container: {
      minHeight: '100vh',
      background: `linear-gradient(rgba(0,0,0,0.60), rgba(0,0,0,0.60)), url('/grass.jpg') center center / cover fixed`,
      color: '#fff',
    },
    input: { width: '100%', background: darkBg, border: borderGold, borderRadius: 8, padding: '8px 12px', color: '#fff', fontSize: 14, boxSizing: 'border-box' as const, fontFamily: 'Georgia, serif' },
    adminBtn: { background: 'linear-gradient(135deg, #0D4F28, #062B14)', color: gold, border: `1px solid ${gold}66`, borderRadius: 8, padding: '8px 16px', cursor: 'pointer', fontSize: 13, fontFamily: 'Georgia, serif', fontWeight: 700 },
    sectionLabel: { color: goldLight, fontSize: 12, fontWeight: 700, letterSpacing: 2, marginBottom: 12, marginTop: 8, textAlign: 'center' as const, fontFamily: 'Georgia, serif' },
  }

  if (selectedMatch) {
    return <MatchView match={selectedMatch} tournament={tournament} onBack={() => { setSelectedMatch(null); loadData() }} isAdmin={isAdmin || isScorerAdmin} />
  }

  // Panel edición equipo
  if (editingTeam) {
    return (
      <div style={styles.container}>
        <div style={{ background: 'rgba(30,5,15,0.95)', padding: '12px 16px', borderBottom: `1px solid ${gold}44` }}>
          <button onClick={() => setEditingTeam(null)} style={{ background: 'none', border: 'none', color: '#a8d5b5', cursor: 'pointer', fontSize: 14, marginBottom: 8, padding: 0, fontFamily: 'Georgia, serif', letterSpacing: 1 }}>← Volver</button>
          <h2 style={{ fontSize: 18, fontWeight: 800, color: gold, margin: 0, fontFamily: 'Georgia, serif' }}>Editar equipo</h2>
        </div>
        <div style={{ padding: 16, maxWidth: 600, margin: '0 auto' }}>
          <div style={{ background: cardBg, borderRadius: 16, padding: 16, marginBottom: 12, border: borderGold, boxShadow: `0 4px 20px rgba(0,0,0,0.5), inset 0 1px 0 rgba(201,168,76,0.1)` }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
              <Avatar url={editingTeam._newLogo ? URL.createObjectURL(editingTeam._newLogo) : editingTeam.logo_url} name={editingTeam.name} size={56} />
              <div style={{ flex: 1 }}>
                <input style={{ ...styles.input, marginBottom: 8 }} value={editingTeam.name} onChange={e => setEditingTeam({ ...editingTeam, name: e.target.value })} placeholder="Nombre del equipo" />
                <label style={{ color: '#a8d5b5', fontSize: 11, display: 'block', marginBottom: 4, fontFamily: 'Georgia, serif' }}>Logo del equipo</label>
                <input type="file" accept="image/*" style={{ color: '#a8d5b5', fontSize: 12 }} onChange={e => setEditingTeam({ ...editingTeam, _newLogo: e.target.files?.[0] ?? null })} />
              </div>
            </div>
          </div>

          <p style={styles.sectionLabel}>JUGADORES</p>
          {editingTeam._players.map((player: any, j: number) => (
            <div key={player.id} style={{ background: cardBg, borderRadius: 12, padding: 12, marginBottom: 8, border: borderGold }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <Avatar url={player._newPhoto ? URL.createObjectURL(player._newPhoto) : player.photo_url} name={player.name} size={44} />
                <div style={{ flex: 1 }}>
                  <input style={{ ...styles.input, marginBottom: 6 }} value={player.name} onChange={e => {
                    const updated = [...editingTeam._players]
                    updated[j] = { ...updated[j], name: e.target.value }
                    setEditingTeam({ ...editingTeam, _players: updated })
                  }} placeholder="Nombre del jugador" />
                  <div style={{ display: 'flex', gap: 4, marginBottom: 6 }}>
                    <input style={{ ...styles.input, width: 80 }} type="number" placeholder="Hcp" min={0} max={10} value={player.handicap ?? 0} onChange={e => {
                      const updated = [...editingTeam._players]
                      updated[j] = { ...updated[j], handicap: Number(e.target.value) }
                      setEditingTeam({ ...editingTeam, _players: updated })
                    }} />
                    <input style={{ ...styles.input, width: 80 }} type="number" placeholder="Pos" min={1} max={4} value={player.position ?? 0} onChange={e => {
                      const updated = [...editingTeam._players]
                      updated[j] = { ...updated[j], position: Number(e.target.value) }
                      setEditingTeam({ ...editingTeam, _players: updated })
                    }} />
                  </div>
                  <input style={{ ...styles.input, marginBottom: 6 }} placeholder="Reseña breve" value={player.bio ?? ''} onChange={e => {
                    const updated = [...editingTeam._players]
                    updated[j] = { ...updated[j], bio: e.target.value }
                    setEditingTeam({ ...editingTeam, _players: updated })
                  }} />
                  <input type="file" accept="image/*" style={{ color: '#a8d5b5', fontSize: 11 }} onChange={e => {
                    const updated = [...editingTeam._players]
                    updated[j] = { ...updated[j], _newPhoto: e.target.files?.[0] ?? null }
                    setEditingTeam({ ...editingTeam, _players: updated })
                  }} />
                </div>
              </div>
            </div>
          ))}

          <button onClick={saveTeamEdit} disabled={savingEdit} style={{ background: `linear-gradient(135deg, ${gold}, #B8960C)`, color: darkBg, fontWeight: 700, fontSize: 16, border: 'none', borderRadius: 10, padding: '14px 24px', cursor: 'pointer', width: '100%', marginTop: 8, fontFamily: 'Georgia, serif', letterSpacing: 1 }}>
            {savingEdit ? 'Guardando...' : '✓ Guardar cambios'}
          </button>
        </div>
      </div>
    )
  }

  if (showFixtureManager) {
    return <FixtureManager
      tournament={tournament}
      matches={matches}
      teams={teams}
      onClose={() => setShowFixtureManager(false)}
      onRefresh={loadData}
    />
  }

  const groupMatches = matches.filter(m => m.stage === 'group')
  const knockoutMatches = matches.filter(m => m.stage !== 'group')

  // Helpers de estilo
  const goldBar = <div style={{ background: `linear-gradient(90deg, ${darkBg}, #8B6914, ${gold}, #8B6914, ${darkBg})`, height: 3 }} />

  function stageBadge(stage: string) {
    const colors: Record<string, string> = { group: '#1e40af', semi: '#7e22ce', final: '#b45309' }
    return {
      display: 'inline-block' as const, padding: '2px 10px', borderRadius: 20, fontSize: 11, fontWeight: 700,
      background: colors[stage] ?? '#334155', color: '#fff', fontFamily: 'Georgia, serif', letterSpacing: 1
    }
  }

  function statusBadge(s: string) {
    return {
      fontSize: 11, padding: '3px 10px', borderRadius: 20, fontWeight: 700, letterSpacing: 1,
      background: s === 'finished' ? '#166534' : s === 'live' ? '#dc2626' : '#334155', color: '#fff'
    }
  }

  const round1MatchCount = knockoutMatches.filter(m => !m.is_third_place && m.round === 1).length
  // En groups_knockout el cuadro arranca con los clasificados de los grupos
  // (menos equipos que tournament.team_count), así que la cantidad real de
  // rondas se calcula a partir del tamaño de la ronda 1, no del total inicial.
  const knockoutTeamCount = tournament.format === 'groups_knockout'
    ? (round1MatchCount > 0 ? round1MatchCount * 2 : null)
    : tournament.team_count ?? (round1MatchCount > 0 ? round1MatchCount * 2 : null)

  function MatchCard({ match, group }: { match: any; group?: string }) {
    return (
      <div
        onClick={() => setSelectedMatch(match)}
        style={{
          borderRadius: 14, marginBottom: 10, overflow: 'hidden',
          boxShadow: `0 0 0 1px ${gold}44, 0 4px 16px rgba(0,0,0,0.5)`,
          cursor: 'pointer',
          transition: 'transform 0.15s, box-shadow 0.15s',
        }}
        onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.transform = 'translateY(-2px)'; (e.currentTarget as HTMLDivElement).style.boxShadow = `0 0 0 1px ${gold}88, 0 8px 24px rgba(0,0,0,0.6)` }}
        onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.transform = 'translateY(0)'; (e.currentTarget as HTMLDivElement).style.boxShadow = `0 0 0 1px ${gold}44, 0 4px 16px rgba(0,0,0,0.5)` }}
      >
        {goldBar}
        <div style={{ background: cardBg, padding: '12px 14px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <span style={stageBadge(match.stage)}>
              {match.stage === 'group' ? `Grupo ${group}` : knockoutRoundLabel(match, knockoutTeamCount)}
            </span>
            <span style={statusBadge(match.status)}>
              {match.status === 'finished' ? 'Finalizado' : match.status === 'live' ? `🔴 T.${match.chukker_current}` : 'Pendiente'}
            </span>
          </div>
          {match.scheduled_at && (
            <p style={{ textAlign: 'center' as const, fontSize: 11, color: '#a8d5b5', margin: '0 0 8px', fontFamily: 'Georgia, serif' }}>
              {formatShortDateTime(match.scheduled_at)}
            </p>
          )}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 8 }}>
              <Avatar url={match.team_home?.logo_url} name={match.team_home?.name ?? '?'} size={32} />
              <span style={{ fontSize: 14, fontWeight: 700, fontFamily: 'Georgia, serif', ...teamResultStyle(match, match.team_home_id) }}>{match.team_home?.name ?? 'Por definir'}</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: 26, fontWeight: 900, color: gold, minWidth: 32, textAlign: 'center' as const, fontFamily: 'Georgia, serif', textShadow: `0 0 12px rgba(201,168,76,0.4)` }}>
                {match.status !== 'pending' ? getMatchGoals(match.id, match.team_home_id) : '–'}
              </span>
              <span style={{ color: '#666', fontSize: 14, fontFamily: 'Georgia, serif' }}>vs</span>
              <span style={{ fontSize: 26, fontWeight: 900, color: gold, minWidth: 32, textAlign: 'center' as const, fontFamily: 'Georgia, serif', textShadow: `0 0 12px rgba(201,168,76,0.4)` }}>
                {match.status !== 'pending' ? getMatchGoals(match.id, match.team_away_id) : '–'}
              </span>
              {penaltyScoreLabel(match) && (
                <span style={{ fontSize: 10, color: gold, fontFamily: 'Georgia, serif', marginLeft: 2, opacity: 0.85 }}>
                  {penaltyScoreLabel(match)}
                </span>
              )}
            </div>
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'flex-end' }}>
              <span style={{ fontSize: 14, fontWeight: 700, fontFamily: 'Georgia, serif', textAlign: 'right' as const, ...teamResultStyle(match, match.team_away_id) }}>{match.team_away?.name ?? 'Por definir'}</span>
              <Avatar url={match.team_away?.logo_url} name={match.team_away?.name ?? '?'} size={32} />
            </div>
          </div>
        </div>
        {goldBar}
      </div>
    )
  }

  return (
    <div style={styles.container}>

      {/* Header con logo */}
      <div style={{ position: 'relative', overflow: 'hidden', borderBottom: `1px solid ${gold}44` }}>
        <img src="/logo.png" alt="Logo" style={{ width: '100%', display: 'block', objectFit: 'cover', objectPosition: 'center' }} />
        <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to bottom, rgba(10,61,31,0.3) 0%, rgba(10,61,31,0.75) 60%, rgba(10,61,31,0.97) 100%)' }} />

        <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', padding: '12px 16px' }}>

          {/* Métricas — arriba izquierda */}
          {isAdmin && (
            <div style={{ position: 'absolute', top: 12, left: 12, background: 'rgba(30,5,15,0.7)', borderRadius: 8, padding: '4px 8px', fontSize: 10, color: `${gold}99`, border: `1px solid ${gold}22` }}>
              <div>🟢 {visitorsNow} conectados</div>
              <div>👁 {totalVisits} visitas totales</div>
            </div>
          )}

          {/* Badges admin / cargador — arriba derecha */}
          <div style={{ position: 'absolute', top: 12, right: 12, display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}>
            {isAdmin && <span style={{ ...styles.adminBtn, display: 'inline-block', cursor: 'default' }}>✓ Admin</span>}
            {!isAdmin && !isScorerAdmin && (
              <button style={styles.adminBtn} onClick={handleScorerLogin}>Ingresar</button>
            )}
            {isScorerAdmin && <span style={{ ...styles.adminBtn, display: 'inline-block', background: 'linear-gradient(135deg, #0d3320, #166534)', borderColor: '#4ade8066', color: '#4ade80', cursor: 'default' }}>✓ Cargador</span>}
          </div>

          {/* Título */}
          <h1 style={{ fontSize: 22, fontWeight: 900, color: gold, margin: '60px 0 2px', fontFamily: 'Georgia, serif', textShadow: `0 2px 12px rgba(0,0,0,0.9), 0 0 20px rgba(201,168,76,0.3)`, letterSpacing: 1 }}>{tournament.name}</h1>
          <p style={{ color: '#a8d5b5', fontSize: 13, margin: '0 0 10px', fontFamily: 'Georgia, serif', textShadow: '0 1px 4px rgba(0,0,0,0.8)' }}>
            {new Date(tournament.date).toLocaleDateString('es-AR')} · {tournament.periods_per_match} tiempos
          </p>

          <button
            onClick={() => navigate(`/tournament/${tournament.id}/bracket`)}
            style={{ background: 'rgba(201,168,76,0.12)', border: `1px solid ${gold}55`, borderRadius: 8, padding: '7px 16px', color: gold, cursor: 'pointer', fontSize: 12, fontWeight: 700, fontFamily: 'Georgia, serif', letterSpacing: 1, marginBottom: 10, alignSelf: 'flex-start' }}
          >
            🏆 Ver Bracket
          </button>

          {/* Botones admin */}
          {isAdmin && (
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                style={{ flex: 1, background: 'linear-gradient(135deg, #7f1d1d, #dc2626)', color: '#fff', border: '1px solid #ef444466', borderRadius: 8, padding: '8px', cursor: 'pointer', fontSize: 12, fontWeight: 700, fontFamily: 'Georgia, serif' }}
                onClick={async () => {
                  if (!confirm('Finalizar este torneo? Asegurate de haber cargado los premios en la tab Premios antes de continuar.')) return
                  const finalMatch = matches.find(m => m.stage === 'final' && m.status === 'finished')
                  const winnerName = finalMatch?.winner_id
                    ? teams.find(t => t.id === finalMatch.winner_id)?.name ?? null
                    : null
                  await supabase.from('tournaments').update({ status: 'finished', finished_at: new Date().toISOString(), winner_team_name: winnerName }).eq('id', tournament.id)
                  setTab('awards')
                  alert('Torneo finalizado. Revisa la tab Premios para cargar los ganadores.')
                  onReset()
                }}>
                Finalizar
              </button>
              <button style={{ flex: 1, ...styles.adminBtn, fontSize: 12 }} onClick={onReset}>
                Nuevo torneo
              </button>
              <button style={{ flex: 1, background: 'linear-gradient(135deg, #1e3a8a, #1e40af)', color: '#93c5fd', border: '1px solid #3b82f666', borderRadius: 8, padding: '8px', cursor: 'pointer', fontSize: 12, fontWeight: 700, fontFamily: 'Georgia, serif' }} onClick={() => setShowFixtureManager(true)}>
                Fixture
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', background: 'rgba(30,5,15,0.95)', borderBottom: `1px solid ${gold}44`, overflowX: 'auto' as const }}>
        {(['fixture', 'schedule', 'standings', 'stats', 'teams', 'awards'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)} style={{
            flex: 1, padding: '13px 6px', textAlign: 'center' as const, cursor: 'pointer',
            fontWeight: 700, fontSize: 12, fontFamily: 'Georgia, serif', letterSpacing: 1,
            color: tab === t ? gold : '#a8d5b5',
            background: tab === t ? `rgba(201,168,76,0.08)` : 'none',
            border: 'none',
            borderBottom: tab === t ? `2px solid ${gold}` : '2px solid transparent',
            whiteSpace: 'nowrap' as const,
            transition: 'color 0.2s',
          }}>
            {t === 'fixture' ? 'Fixture' : t === 'schedule' ? 'Cronograma' : t === 'standings' ? 'Posiciones' : t === 'stats' ? 'Estadísticas' : t === 'teams' ? 'Equipos' : 'Premios'}
          </button>
        ))}
      </div>

      {/* Contenido */}
      <div style={{ padding: 16, maxWidth: 600, margin: '0 auto' }}>
        {loading ? (
          <p style={{ color: gold, textAlign: 'center', marginTop: 40, fontFamily: 'Georgia, serif' }}>Cargando...</p>
        ) : (

          /* ── FIXTURE ── */
          tab === 'fixture' ? (
            <>
              {tournament.format !== 'knockout' && groups.map(group => (
                <div key={group}>
                  <p style={styles.sectionLabel}>GRUPO {group}</p>
                  {groupMatches.filter(m => m.group_name === group).map(match => (
                    <MatchCard key={match.id} match={match} group={group} />
                  ))}
                </div>
              ))}

              {knockoutMatches.length > 0 && (() => {
                const thirdPlaceMatch = knockoutMatches.find(m => m.is_third_place)
                const bracketMatches = knockoutMatches.filter(m => !m.is_third_place && m.round != null)
                const flatMatches = knockoutMatches.filter(m => !m.is_third_place && m.round == null)
                const rounds = [...new Set(bracketMatches.map(m => m.round))].sort((a, b) => b - a)
                const maxRound = rounds.length > 0 ? rounds[0] : null

                return (
                  <>
                    {flatMatches.length > 0 && (
                      <>
                        <p style={styles.sectionLabel}>ELIMINACIÓN DIRECTA</p>
                        {flatMatches.map(match => (
                          <MatchCard key={match.id} match={match} />
                        ))}
                      </>
                    )}

                    {rounds.map(round => {
                      const roundMatches = bracketMatches.filter(m => m.round === round).sort((a, b) => a.match_number - b.match_number)
                      const isLatest = round === maxRound
                      const isComplete = roundMatches.every(m => m.winner_id)
                      const isOpen = isLatest || expandedRounds.has(round)
                      const label = knockoutRoundLabel(roundMatches[0], knockoutTeamCount).toUpperCase()
                      return (
                        <div key={round}>
                          <p
                            style={{ ...styles.sectionLabel, cursor: isLatest ? 'default' : 'pointer', userSelect: 'none' as const }}
                            onClick={isLatest ? undefined : () => toggleRound(round)}
                          >
                            {label}
                            {!isLatest && isComplete && <span style={{ color: '#4ade80', marginLeft: 6 }}>✓</span>}
                            {!isLatest && <span style={{ marginLeft: 6, fontSize: 10 }}>{isOpen ? '▲' : '▼'}</span>}
                          </p>
                          {isOpen && roundMatches.map(match => (
                            <MatchCard key={match.id} match={match} />
                          ))}
                        </div>
                      )
                    })}

                    {thirdPlaceMatch && <MatchCard match={thirdPlaceMatch} />}
                  </>
                )
              })()}

              {isAdmin && tournament.format === 'groups_knockout' && knockoutMatches.length === 0 && groupMatches.length > 0 && groupMatches.every(m => m.status === 'finished') && (
                <button
                  style={{ background: `linear-gradient(135deg, ${gold}, #B8960C)`, color: darkBg, fontWeight: 700, border: 'none', borderRadius: 10, padding: '14px 24px', cursor: 'pointer', width: '100%', marginTop: 16, fontFamily: 'Georgia, serif', fontSize: 15, letterSpacing: 1 }}
                  onClick={generateKnockoutBracketFromGroups}>
                  Generar cuadro de eliminación →
                </button>
              )}

              {isAdmin && tournament.format === 'round_robin' && knockoutMatches.length === 0 && groupMatches.length > 0 && groupMatches.every(m => m.status === 'finished') && (
                <button
                  style={{ background: `linear-gradient(135deg, ${gold}, #B8960C)`, color: darkBg, fontWeight: 700, border: 'none', borderRadius: 10, padding: '14px 24px', cursor: 'pointer', width: '100%', marginTop: 16, fontFamily: 'Georgia, serif', fontSize: 15, letterSpacing: 1 }}
                  onClick={generateRoundRobinFinal}>
                  Generar final →
                </button>
              )}

              {isAdmin && (tournament.format === 'knockout' || tournament.format === 'groups_knockout') && (() => {
                const nonTP = matches.filter((m: any) => m.round != null && !m.is_third_place)
                if (nonTP.length === 0) return null
                const currentRound = Math.max(...nonTP.map((m: any) => m.round))
                const roundMatches = nonTP.filter((m: any) => m.round === currentRound)
                const hasNextRound = nonTP.some((m: any) => m.round === currentRound + 1)
                const isFinalDone = roundMatches.length === 1 && roundMatches[0].winner_id
                const allHaveWinner = roundMatches.every((m: any) => m.winner_id)
                if (hasNextRound || isFinalDone || !allHaveWinner) return null
                return (
                  <button
                    style={{ background: `linear-gradient(135deg, ${gold}, #B8960C)`, color: darkBg, fontWeight: 700, border: 'none', borderRadius: 10, padding: '14px 24px', cursor: 'pointer', width: '100%', marginTop: 16, fontFamily: 'Georgia, serif', fontSize: 15, letterSpacing: 1 }}
                    onClick={generateNextKnockoutRound}
                  >
                    Generar siguiente ronda →
                  </button>
                )
              })()}
            </>

          /* ── CRONOGRAMA ── */
          ) : tab === 'schedule' ? (
            <>
              {isAdmin && (
                <div style={{ borderRadius: 14, marginBottom: 20, overflow: 'hidden', boxShadow: `0 0 0 1px ${gold}44, 0 4px 16px rgba(0,0,0,0.5)` }}>
                  {goldBar}
                  <div style={{ background: cardBg, padding: 16 }}>
                    <p style={{ color: goldLight, fontSize: 12, fontWeight: 700, letterSpacing: 2, marginBottom: 12, textAlign: 'center' as const, fontFamily: 'Georgia, serif' }}>CARGAR HORARIOS</p>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12, justifyContent: 'center' }}>
                      <span style={{ color: gold, fontSize: 13, fontFamily: 'Georgia, serif' }}>Fecha:</span>
                      <input type="date" value={scheduleDate} onChange={e => setScheduleDate(e.target.value)}
                        style={{ background: 'rgba(0,0,0,0.5)', border: `1px solid ${gold}`, borderRadius: 8, padding: '8px 12px', color: gold, fontSize: 14, fontFamily: 'Georgia, serif' }} />
                    </div>
                    {scheduleDate && (
                      <>
                        <p style={{ color: '#a8d5b5', fontSize: 11, textAlign: 'center' as const, marginBottom: 12 }}>
                          Cargá la hora de los partidos que se juegan este día · dejá vacío el resto
                        </p>
                        {matches.map(m => (
                          <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 0', borderBottom: `1px solid ${gold}22` }}>
                            <span style={{ flex: 1, color: '#fff', fontSize: 13, fontFamily: 'Georgia, serif' }}>
                              {m.team_home?.name ?? 'Por definir'} vs {m.team_away?.name ?? 'Por definir'}
                            </span>
                            <input type="time"
                              value={scheduleTimes[m.id] ?? timeOnDate(m.scheduled_at, scheduleDate)}
                              onChange={e => setScheduleTimes(prev => ({ ...prev, [m.id]: e.target.value }))}
                              style={{ background: 'rgba(0,0,0,0.5)', border: `1px solid ${gold}66`, borderRadius: 8, padding: '6px 8px', color: gold, fontSize: 13, fontFamily: 'Georgia, serif', width: 96 }} />
                            {m.scheduled_at && (
                              <button onClick={() => clearSchedule(m.id)} title="Quitar horario"
                                style={{ background: 'none', border: 'none', color: '#a8d5b5', cursor: 'pointer', fontSize: 16, padding: '0 4px' }}>
                                ✕
                              </button>
                            )}
                          </div>
                        ))}
                        <button onClick={saveSchedule} disabled={savingSchedule}
                          style={{ background: `linear-gradient(135deg, ${gold}, #B8960C)`, color: darkBg, fontWeight: 700, border: 'none', borderRadius: 10, padding: '12px 24px', cursor: 'pointer', width: '100%', marginTop: 16, fontFamily: 'Georgia, serif', fontSize: 14, letterSpacing: 1, opacity: savingSchedule ? 0.6 : 1 }}>
                          {savingSchedule ? 'Guardando...' : 'Guardar horarios'}
                        </button>
                      </>
                    )}
                  </div>
                  {goldBar}
                </div>
              )}

              <p style={styles.sectionLabel}>PROGRAMACIÓN</p>
              {scheduleDateGroups.length === 0 && unscheduledMatches.length === 0 && (
                <p style={{ color: '#a8d5b5', textAlign: 'center' as const, fontFamily: 'Georgia, serif' }}>Todavía no hay partidos cargados.</p>
              )}
              {scheduleDateGroups.map(group => (
                <div key={dateKey(group[0].scheduled_at)} style={{ marginBottom: 20 }}>
                  <p style={{ color: gold, fontWeight: 700, fontSize: 14, marginBottom: 8, fontFamily: 'Georgia, serif' }}>
                    {formatLongDate(group[0].scheduled_at)}
                  </p>
                  <div style={{ borderRadius: 14, overflow: 'hidden', boxShadow: `0 0 0 1px ${gold}44, 0 4px 16px rgba(0,0,0,0.5)` }}>
                    {goldBar}
                    <div style={{ background: cardBg }}>
                      {group.map(m => (
                        <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderBottom: `1px solid ${gold}22` }}>
                          <span style={{ color: gold, fontWeight: 700, fontSize: 13, fontFamily: 'Georgia, serif', minWidth: 46 }}>
                            {formatTimeOnly(m.scheduled_at)}
                          </span>
                          <span style={{ flex: 1, color: '#fff', fontSize: 13, fontFamily: 'Georgia, serif' }}>
                            {m.team_home?.name ?? 'Por definir'} vs {m.team_away?.name ?? 'Por definir'}
                          </span>
                        </div>
                      ))}
                    </div>
                    {goldBar}
                  </div>
                </div>
              ))}
              {unscheduledMatches.length > 0 && (
                <div>
                  <p style={{ color: '#a8d5b5', fontWeight: 700, fontSize: 14, marginBottom: 8, fontFamily: 'Georgia, serif' }}>Sin programar</p>
                  <div style={{ borderRadius: 14, overflow: 'hidden', boxShadow: `0 0 0 1px ${gold}44, 0 4px 16px rgba(0,0,0,0.5)`, opacity: 0.7 }}>
                    {goldBar}
                    <div style={{ background: cardBg }}>
                      {unscheduledMatches.map(m => (
                        <div key={m.id} style={{ display: 'flex', alignItems: 'center', padding: '10px 14px', borderBottom: `1px solid ${gold}22` }}>
                          <span style={{ flex: 1, color: '#fff', fontSize: 13, fontFamily: 'Georgia, serif' }}>
                            {m.team_home?.name ?? 'Por definir'} vs {m.team_away?.name ?? 'Por definir'}
                          </span>
                        </div>
                      ))}
                    </div>
                    {goldBar}
                  </div>
                </div>
              )}
            </>

          /* ── POSICIONES ── */
          ) : tab === 'standings' ? (
            <>
              {tournament.format !== 'knockout' && groups.map(group => {
                const standing = getStandings(group)
                return (
                  <div key={group} style={{ marginBottom: 24 }}>
                    <p style={styles.sectionLabel}>GRUPO {group}</p>
                    <div style={{ borderRadius: 14, overflow: 'hidden', boxShadow: `0 0 0 1px ${gold}44, 0 4px 16px rgba(0,0,0,0.5)` }}>
                      {goldBar}
                      <div style={{ background: cardBg }}>
                        <div style={{ display: 'flex', color: '#a8d5b5', fontSize: 12, padding: '8px 14px', borderBottom: `1px solid ${gold}33`, fontFamily: 'Georgia, serif', letterSpacing: 1 }}>
                          <span style={{ flex: 1 }}>Equipo</span>
                          {['PJ','G','E','P','GF','GC'].map(h => <span key={h} style={{ width: 28, textAlign: 'center' as const }}>{h}</span>)}
                          <span style={{ width: 36, textAlign: 'center' as const, color: gold, fontWeight: 700 }}>PTS</span>
                        </div>
                        {standing.map((team, i) => (
                          <div key={team.id} style={{ display: 'flex', alignItems: 'center', padding: '10px 14px', borderBottom: `1px solid ${gold}22`, background: i < 2 ? `rgba(201,168,76,0.07)` : 'transparent' }}>
                            <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 8 }}>
                              <Avatar url={team.logo_url} name={team.name} size={26} />
                              <span style={{ fontWeight: i < 2 ? 700 : 400, fontFamily: 'Georgia, serif', fontSize: 13 }}>{i < 2 ? '→ ' : ''}{team.name}</span>
                            </div>
                            {[team.pj, team.w, team.d, team.l, team.gf, team.gc].map((val, idx) => (
                              <span key={idx} style={{ width: 28, textAlign: 'center' as const, color: '#a8d5b5', fontSize: 13 }}>{val}</span>
                            ))}
                            <span style={{ width: 36, textAlign: 'center' as const, fontWeight: 900, color: gold, fontSize: 15, fontFamily: 'Georgia, serif' }}>{team.pts}</span>
                          </div>
                        ))}
                      </div>
                      {goldBar}
                    </div>
                  </div>
                )
              })}
            </>

          /* ── STATS ── */
          ) : tab === 'stats' ? (
            <>
              {/* Tabla de Posiciones */}
              <p style={styles.sectionLabel}>TABLA DE POSICIONES</p>
              <div style={{ borderRadius: 14, overflow: 'hidden', marginBottom: 24, boxShadow: `0 0 0 1px ${gold}44, 0 4px 16px rgba(0,0,0,0.5)` }}>
                {goldBar}
                <div style={{ background: cardBg, overflowX: 'auto' as const }}>
                  <div style={{ display: 'flex', color: '#a8d5b5', fontSize: 11, padding: '8px 10px', borderBottom: `1px solid ${gold}33`, fontFamily: 'Georgia, serif', letterSpacing: 1, minWidth: 360 }}>
                    <span style={{ flex: 1 }}>Equipo</span>
                    {['PJ','PG','PE','PP','GF','GC','DG'].map(h => <span key={h} style={{ width: 26, textAlign: 'center' as const }}>{h}</span>)}
                    <span style={{ width: 34, textAlign: 'center' as const, color: gold, fontWeight: 700 }}>PTS</span>
                  </div>
                  {getAllTeamStandings().length === 0
                    ? <p style={{ color: '#a8d5b5', padding: 20, textAlign: 'center' as const, fontFamily: 'Georgia, serif' }}>Sin partidos finalizados</p>
                    : getAllTeamStandings().map((team, i) => (
                      <div key={team.id} style={{ display: 'flex', alignItems: 'center', padding: '9px 10px', borderBottom: `1px solid ${gold}22`, background: i < 2 ? `rgba(201,168,76,0.07)` : 'transparent', minWidth: 360 }}>
                        <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span style={{ color: '#a8d5b5', fontSize: 11, width: 14 }}>{i + 1}</span>
                          <Avatar url={team.logo_url} name={team.name} size={22} />
                          <span style={{ fontWeight: i < 2 ? 700 : 400, fontFamily: 'Georgia, serif', fontSize: 12 }}>{team.name}</span>
                        </div>
                        {[team.pj, team.w, team.d, team.l, team.gf, team.gc].map((val, idx) => (
                          <span key={idx} style={{ width: 26, textAlign: 'center' as const, color: '#a8d5b5', fontSize: 12 }}>{val}</span>
                        ))}
                        <span style={{ width: 26, textAlign: 'center' as const, fontSize: 12, color: team.gd > 0 ? '#4ade80' : team.gd < 0 ? '#ef4444' : '#a8d5b5' }}>
                          {team.gd > 0 ? `+${team.gd}` : team.gd}
                        </span>
                        <span style={{ width: 34, textAlign: 'center' as const, fontWeight: 900, color: gold, fontSize: 14, fontFamily: 'Georgia, serif' }}>{team.pts}</span>
                      </div>
                    ))
                  }
                </div>
                {goldBar}
              </div>

              {/* Goleadores */}
              <p style={styles.sectionLabel}>GOLEADORES</p>
              <div style={{ borderRadius: 14, overflow: 'hidden', marginBottom: 24, boxShadow: `0 0 0 1px ${gold}44, 0 4px 16px rgba(0,0,0,0.5)` }}>
                {goldBar}
                <div style={{ background: cardBg }}>
                  <div style={{ display: 'flex', color: '#a8d5b5', fontSize: 11, padding: '8px 14px', borderBottom: `1px solid ${gold}33`, fontFamily: 'Georgia, serif', letterSpacing: 1 }}>
                    <span style={{ width: 20 }}>#</span>
                    <span style={{ flex: 1 }}>Jugador</span>
                    <span style={{ width: 90, textAlign: 'right' as const }}>Equipo</span>
                    <span style={{ width: 48, textAlign: 'center' as const, color: gold, fontWeight: 700 }}>Goles</span>
                  </div>
                  {getTopScorers().length === 0
                    ? <p style={{ color: '#a8d5b5', padding: 20, textAlign: 'center' as const, fontFamily: 'Georgia, serif' }}>Sin goles registrados</p>
                    : getTopScorers().map((s, i) => (
                      <div key={s.player.id} style={{ display: 'flex', alignItems: 'center', padding: '9px 14px', borderBottom: `1px solid ${gold}22`, gap: 8 }}>
                        <span style={{ color: i === 0 ? gold : '#a8d5b5', width: 20, fontFamily: 'Georgia, serif', fontWeight: i === 0 ? 900 : 400, fontSize: 12 }}>{i + 1}</span>
                        <Avatar url={s.player.photo_url} name={s.player.name} size={28} />
                        <span style={{ flex: 1, fontWeight: i === 0 ? 800 : 400, fontFamily: 'Georgia, serif', fontSize: 13 }}>{s.player.name}</span>
                        <span style={{ width: 90, color: '#a8d5b5', fontSize: 11, fontFamily: 'Georgia, serif', textAlign: 'right' as const }}>{teams.find(t => t.id === s.player.team_id)?.name}</span>
                        <span style={{ width: 48, textAlign: 'center' as const, color: gold, fontWeight: 900, fontSize: 18, fontFamily: 'Georgia, serif', textShadow: `0 0 10px rgba(201,168,76,0.4)` }}>{s.goals}</span>
                      </div>
                    ))
                  }
                </div>
                {goldBar}
              </div>

              {/* Disciplina */}
              <p style={styles.sectionLabel}>DISCIPLINA</p>
              <div style={{ borderRadius: 14, overflow: 'hidden', marginBottom: 24, boxShadow: `0 0 0 1px ${gold}44, 0 4px 16px rgba(0,0,0,0.5)` }}>
                {goldBar}
                <div style={{ background: cardBg }}>
                  <div style={{ display: 'flex', color: '#a8d5b5', fontSize: 11, padding: '8px 14px', borderBottom: `1px solid ${gold}33`, fontFamily: 'Georgia, serif', letterSpacing: 1 }}>
                    <span style={{ flex: 1 }}>Jugador</span>
                    <span style={{ width: 90, textAlign: 'right' as const }}>Equipo</span>
                    <span style={{ width: 40, textAlign: 'center' as const }}>🟨</span>
                    <span style={{ width: 40, textAlign: 'center' as const }}>🟥</span>
                  </div>
                  {getDisciplineTable().length === 0
                    ? <p style={{ color: '#a8d5b5', padding: 20, textAlign: 'center' as const, fontFamily: 'Georgia, serif' }}>Sin tarjetas registradas</p>
                    : getDisciplineTable().map(entry => (
                      <div key={entry.player.id} style={{ display: 'flex', alignItems: 'center', padding: '9px 14px', borderBottom: `1px solid ${gold}22`, gap: 8 }}>
                        <Avatar url={entry.player.photo_url} name={entry.player.name} size={28} />
                        <span style={{ flex: 1, fontFamily: 'Georgia, serif', fontSize: 13 }}>{entry.player.name}</span>
                        <span style={{ width: 90, color: '#a8d5b5', fontSize: 11, fontFamily: 'Georgia, serif', textAlign: 'right' as const }}>{entry.team?.name}</span>
                        <span style={{ width: 40, textAlign: 'center' as const, fontWeight: 700, color: '#facc15', fontSize: 14 }}>{entry.yellows > 0 ? entry.yellows : '–'}</span>
                        <span style={{ width: 40, textAlign: 'center' as const, fontWeight: 700, color: '#ef4444', fontSize: 14 }}>{entry.reds > 0 ? entry.reds : '–'}</span>
                      </div>
                    ))
                  }
                </div>
                {goldBar}
              </div>
            </>

          /* ── EQUIPOS ── */
          ) : tab === 'teams' ? (
            <>
              <p style={styles.sectionLabel}>EQUIPOS</p>
              {teams.map(team => {
                const teamPlayers = players.filter(p => p.team_id === team.id)
                return (
                  <div key={team.id} style={{ borderRadius: 14, marginBottom: 12, overflow: 'hidden', boxShadow: `0 0 0 1px ${gold}44, 0 4px 16px rgba(0,0,0,0.5)` }}>
                    {goldBar}
                    <div style={{ background: cardBg, padding: 16 }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                          <Avatar url={team.logo_url} name={team.name} size={48} />
                          <div>
                            <p style={{ fontWeight: 800, fontSize: 16, margin: 0, color: '#fff', fontFamily: 'Georgia, serif' }}>{team.name}</p>
                            <p style={{ color: '#a8d5b5', fontSize: 12, margin: '2px 0 0', fontFamily: 'Georgia, serif' }}>Grupo {team.group_name}</p>
                          </div>
                        </div>
                        {isAdmin && (
                          <button
                            onClick={() => setEditingTeam({ ...team, _players: teamPlayers.map(p => ({ ...p, _newPhoto: null })), _newLogo: null })}
                            style={{ background: 'linear-gradient(135deg, #0D4F28, #062B14)', border: `1px solid ${gold}66`, borderRadius: 8, padding: '6px 12px', color: gold, cursor: 'pointer', fontSize: 12, fontFamily: 'Georgia, serif' }}>
                            ✏️ Editar
                          </button>
                        )}
                      </div>
                      <div style={{ display: 'flex', flexWrap: 'wrap' as const, gap: 8 }}>
                        {teamPlayers.map(player => (
                          <div key={player.id} style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'rgba(201,168,76,0.08)', border: `1px solid ${gold}33`, borderRadius: 20, padding: '4px 12px 4px 4px' }}>
                            <Avatar url={player.photo_url} name={player.name} size={28} />
                            <span style={{ fontSize: 13, color: '#fff', fontFamily: 'Georgia, serif' }}>{player.name}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                    {goldBar}
                  </div>
                )
              })}
            </>

          /* ── PREMIOS ── */
          ) : (
            <AwardsView tournament={tournament} isAdmin={isAdmin} />
          )
        )}
      </div>
    </div>
  )
}
