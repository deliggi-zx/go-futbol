import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import MatchView from './MatchView'
import AwardsView from './AwardsView'
import FixtureManager from './FixtureManager'

type Props = { tournament: any; onReset: () => void; initialMatchId?: string | null }

function Avatar({ url, name, size = 32 }: { url?: string | null; name: string; size?: number }) {
  if (url) return <img src={url} alt={name} style={{ width: size, height: size, borderRadius: '50%', objectFit: 'cover', flexShrink: 0, border: '2px solid #C9A84C', boxShadow: '0 0 8px rgba(201,168,76,0.3)' }} />
  return (
    <div style={{ width: size, height: size, borderRadius: '50%', background: 'radial-gradient(circle, #5A1525 0%, #3A0A15 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: size * 0.4, fontWeight: 700, color: '#C9A84C', flexShrink: 0, border: '2px solid #C9A84C', boxShadow: '0 0 8px rgba(201,168,76,0.3)' }}>
      {name.charAt(0).toUpperCase()}
    </div>
  )
}

const gold = '#C9A84C'
const goldLight = '#E8C96A'
const darkBg = '#2A0A12'
const cardBg = 'linear-gradient(160deg, #3d2810 0%, #2a1c0a 30%, #1e1408 60%, #2a1c0a 100%)'
const borderGold = `1px solid ${gold}55`

export default function TournamentView({ tournament, onReset, initialMatchId }: Props) {
  const [tab, setTab] = useState<'fixture' | 'standings' | 'stats' | 'teams' | 'awards'>('fixture')
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
      setIsAdmin(!!session)
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
        .single()
      if (!existing) {
        await supabase.from('tournament_visits').insert({
          tournament_id: tournament.id,
          visitor_id: visitorId
        })
      }
      const { count } = await supabase
        .from('tournament_visits')
        .select('*', { count: 'exact', head: true })
        .eq('tournament_id', tournament.id)
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
      .channel('tournament-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'goals' }, () => loadData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'matches' }, () => loadData())
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [tournament.id])

  async function loadData() {
    setLoading(true)
    const [m, t, g, p] = await Promise.all([
      supabase.from('matches').select('*, team_home:teams!matches_team_home_id_fkey(*), team_away:teams!matches_team_away_id_fkey(*)').eq('tournament_id', tournament.id).order('created_at'),
      supabase.from('teams').select('*').eq('tournament_id', tournament.id),
      supabase.from('goals').select('*, player:players(*), team:teams(*)').in('match_id', (await supabase.from('matches').select('id').eq('tournament_id', tournament.id)).data?.map((m: any) => m.id) ?? []),
      supabase.from('players').select('*, team:teams(*)').in('team_id', (await supabase.from('teams').select('id').eq('tournament_id', tournament.id)).data?.map((t: any) => t.id) ?? []),
    ])
    setMatches(m.data ?? [])
    setTeams(t.data ?? [])
    setGoals(g.data ?? [])
    setPlayers(p.data ?? [])
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
    return Object.values(counts).sort((a, b) => b.goals - a.goals).slice(0, 10)
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
        await supabase.from('players').update({ name: player.name, photo_url: photoUrl, handicap: player.handicap, position: player.position, bio: player.bio, mares: player.mares }).eq('id', player.id)
      }

      await loadData()
      setEditingTeam(null)
    } catch (e) {
      alert('Error al guardar')
    } finally {
      setSavingEdit(false)
    }
  }

  const groups = [...new Set(teams.filter(t => t.group_name).map(t => t.group_name))].sort()

  const styles = {
    container: {
      minHeight: '100vh',
      background: '#3D0A1A',
      color: '#fff',
      backgroundImage: `repeating-linear-gradient(45deg, transparent, transparent 40px, rgba(201,168,76,0.02) 40px, rgba(201,168,76,0.02) 41px), repeating-linear-gradient(-45deg, transparent, transparent 40px, rgba(201,168,76,0.02) 40px, rgba(201,168,76,0.02) 41px)`,
    },
    input: { width: '100%', background: darkBg, border: borderGold, borderRadius: 8, padding: '8px 12px', color: '#fff', fontSize: 14, boxSizing: 'border-box' as const, fontFamily: 'Georgia, serif' },
    adminBtn: { background: 'linear-gradient(135deg, #5A1525, #3A0A15)', color: gold, border: `1px solid ${gold}66`, borderRadius: 8, padding: '8px 16px', cursor: 'pointer', fontSize: 13, fontFamily: 'Georgia, serif', fontWeight: 700 },
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
          <button onClick={() => setEditingTeam(null)} style={{ background: 'none', border: 'none', color: '#d4a0b0', cursor: 'pointer', fontSize: 14, marginBottom: 8, padding: 0, fontFamily: 'Georgia, serif', letterSpacing: 1 }}>← Volver</button>
          <h2 style={{ fontSize: 18, fontWeight: 800, color: gold, margin: 0, fontFamily: 'Georgia, serif' }}>Editar equipo</h2>
        </div>
        <div style={{ padding: 16, maxWidth: 600, margin: '0 auto' }}>
          <div style={{ background: cardBg, borderRadius: 16, padding: 16, marginBottom: 12, border: borderGold, boxShadow: `0 4px 20px rgba(0,0,0,0.5), inset 0 1px 0 rgba(201,168,76,0.1)` }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
              <Avatar url={editingTeam._newLogo ? URL.createObjectURL(editingTeam._newLogo) : editingTeam.logo_url} name={editingTeam.name} size={56} />
              <div style={{ flex: 1 }}>
                <input style={{ ...styles.input, marginBottom: 8 }} value={editingTeam.name} onChange={e => setEditingTeam({ ...editingTeam, name: e.target.value })} placeholder="Nombre del equipo" />
                <label style={{ color: '#d4a0b0', fontSize: 11, display: 'block', marginBottom: 4, fontFamily: 'Georgia, serif' }}>Logo del equipo</label>
                <input type="file" accept="image/*" style={{ color: '#d4a0b0', fontSize: 12 }} onChange={e => setEditingTeam({ ...editingTeam, _newLogo: e.target.files?.[0] ?? null })} />
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
                  <input style={{ ...styles.input, marginBottom: 6 }} placeholder="Yeguas" value={player.mares ?? ''} onChange={e => {
                    const updated = [...editingTeam._players]
                    updated[j] = { ...updated[j], mares: e.target.value }
                    setEditingTeam({ ...editingTeam, _players: updated })
                  }} />
                  <input type="file" accept="image/*" style={{ color: '#d4a0b0', fontSize: 11 }} onChange={e => {
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

  function MatchCard({ match, group }: { match: any; group?: string }) {
    const clickable = isAdmin || isScorerAdmin || match.status !== 'pending'
    return (
      <div
        onClick={() => clickable ? setSelectedMatch(match) : null}
        style={{
          borderRadius: 14, marginBottom: 10, overflow: 'hidden',
          boxShadow: `0 0 0 1px ${gold}44, 0 4px 16px rgba(0,0,0,0.5)`,
          cursor: clickable ? 'pointer' : 'default',
          transition: 'transform 0.15s, box-shadow 0.15s',
        }}
        onMouseEnter={e => { if (clickable) { (e.currentTarget as HTMLDivElement).style.transform = 'translateY(-2px)'; (e.currentTarget as HTMLDivElement).style.boxShadow = `0 0 0 1px ${gold}88, 0 8px 24px rgba(0,0,0,0.6)` } }}
        onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.transform = 'translateY(0)'; (e.currentTarget as HTMLDivElement).style.boxShadow = `0 0 0 1px ${gold}44, 0 4px 16px rgba(0,0,0,0.5)` }}
      >
        {goldBar}
        <div style={{ background: cardBg, padding: '12px 14px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <span style={stageBadge(match.stage)}>
              {match.stage === 'group' ? `Grupo ${group}` : match.stage === 'semi' ? 'Semifinal' : 'Final'}
            </span>
            <span style={statusBadge(match.status)}>
              {match.status === 'finished' ? 'Finalizado' : match.status === 'live' ? `🔴 Ch.${match.chukker_current}` : 'Pendiente'}
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 8 }}>
              <Avatar url={match.team_home?.logo_url} name={match.team_home?.name ?? '?'} size={32} />
              <span style={{ fontSize: 14, fontWeight: 700, fontFamily: 'Georgia, serif', color: '#fff' }}>{match.team_home?.name ?? 'Por definir'}</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: 26, fontWeight: 900, color: gold, minWidth: 32, textAlign: 'center' as const, fontFamily: 'Georgia, serif', textShadow: `0 0 12px rgba(201,168,76,0.4)` }}>
                {match.status !== 'pending' ? getMatchGoals(match.id, match.team_home_id) : '–'}
              </span>
              <span style={{ color: '#666', fontSize: 14, fontFamily: 'Georgia, serif' }}>vs</span>
              <span style={{ fontSize: 26, fontWeight: 900, color: gold, minWidth: 32, textAlign: 'center' as const, fontFamily: 'Georgia, serif', textShadow: `0 0 12px rgba(201,168,76,0.4)` }}>
                {match.status !== 'pending' ? getMatchGoals(match.id, match.team_away_id) : '–'}
              </span>
            </div>
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'flex-end' }}>
              <span style={{ fontSize: 14, fontWeight: 700, fontFamily: 'Georgia, serif', color: '#fff', textAlign: 'right' as const }}>{match.team_away?.name ?? 'Por definir'}</span>
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
        <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to bottom, rgba(42,10,18,0.3) 0%, rgba(42,10,18,0.75) 60%, rgba(42,10,18,0.97) 100%)' }} />

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
          <p style={{ color: '#d4a0b0', fontSize: 13, margin: '0 0 10px', fontFamily: 'Georgia, serif', textShadow: '0 1px 4px rgba(0,0,0,0.8)' }}>
            {new Date(tournament.date).toLocaleDateString('es-AR')} · {tournament.chukkers_per_match} chukkers
          </p>

          {/* Botones admin */}
          {isAdmin && (
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                style={{ flex: 1, background: 'linear-gradient(135deg, #7f1d1d, #dc2626)', color: '#fff', border: '1px solid #ef444466', borderRadius: 8, padding: '8px', cursor: 'pointer', fontSize: 12, fontWeight: 700, fontFamily: 'Georgia, serif' }}
                onClick={async () => {
                  if (!confirm('Finalizar este torneo? Asegurate de haber cargado los premios en la tab Premios antes de continuar.')) return
                  const finalMatch = matches.find(m => m.stage === 'final' && m.status === 'finished')
                  let winnerName = null
                  if (finalMatch) {
                    const hg = getMatchGoals(finalMatch.id, finalMatch.team_home_id)
                    const ag = getMatchGoals(finalMatch.id, finalMatch.team_away_id)
                    const winnerId = hg >= ag ? finalMatch.team_home_id : finalMatch.team_away_id
                    winnerName = teams.find(t => t.id === winnerId)?.name ?? null
                  }
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
        {(['fixture', 'standings', 'stats', 'teams', 'awards'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)} style={{
            flex: 1, padding: '13px 6px', textAlign: 'center' as const, cursor: 'pointer',
            fontWeight: 700, fontSize: 12, fontFamily: 'Georgia, serif', letterSpacing: 1,
            color: tab === t ? gold : '#d4a0b0',
            background: tab === t ? `rgba(201,168,76,0.08)` : 'none',
            border: 'none',
            borderBottom: tab === t ? `2px solid ${gold}` : '2px solid transparent',
            whiteSpace: 'nowrap' as const,
            transition: 'color 0.2s',
          }}>
            {t === 'fixture' ? 'Fixture' : t === 'standings' ? 'Posiciones' : t === 'stats' ? 'Stats' : t === 'teams' ? 'Equipos' : 'Premios'}
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
              {groups.map(group => (
                <div key={group}>
                  <p style={styles.sectionLabel}>GRUPO {group}</p>
                  {groupMatches.filter(m => m.group_name === group).map(match => (
                    <MatchCard key={match.id} match={match} group={group} />
                  ))}
                </div>
              ))}

              {knockoutMatches.length > 0 && (
                <>
                  <p style={styles.sectionLabel}>ELIMINACIÓN DIRECTA</p>
                  {knockoutMatches.map(match => (
                    <MatchCard key={match.id} match={match} />
                  ))}
                </>
              )}

              {isAdmin && knockoutMatches.length === 0 && groupMatches.length > 0 && groupMatches.every(m => m.status === 'finished') && (
                <button
                  style={{ background: `linear-gradient(135deg, ${gold}, #B8960C)`, color: darkBg, fontWeight: 700, border: 'none', borderRadius: 10, padding: '14px 24px', cursor: 'pointer', width: '100%', marginTop: 16, fontFamily: 'Georgia, serif', fontSize: 15, letterSpacing: 1 }}
                  onClick={async () => {
                    const standingsA = getStandings('A')
                    const standingsB = getStandings('B')
                    await supabase.from('matches').insert([
                      { tournament_id: tournament.id, team_home_id: standingsA[0].id, team_away_id: standingsB[1].id, stage: 'semi', status: 'pending' },
                      { tournament_id: tournament.id, team_home_id: standingsB[0].id, team_away_id: standingsA[1].id, stage: 'semi', status: 'pending' },
                    ])
                    loadData()
                  }}>
                  Generar semifinales →
                </button>
              )}

              {isAdmin && knockoutMatches.filter(m => m.stage === 'semi').every(m => m.status === 'finished') && knockoutMatches.filter(m => m.stage === 'semi').length === 2 && !knockoutMatches.find(m => m.stage === 'final') && (
                <button
                  style={{ background: `linear-gradient(135deg, ${gold}, #B8960C)`, color: darkBg, fontWeight: 700, border: 'none', borderRadius: 10, padding: '14px 24px', cursor: 'pointer', width: '100%', marginTop: 16, fontFamily: 'Georgia, serif', fontSize: 15, letterSpacing: 1 }}
                  onClick={async () => {
                    const semis = knockoutMatches.filter(m => m.stage === 'semi')
                    const winners = semis.map(m => {
                      const hg = getMatchGoals(m.id, m.team_home_id)
                      const ag = getMatchGoals(m.id, m.team_away_id)
                      return hg >= ag ? m.team_home_id : m.team_away_id
                    })
                    await supabase.from('matches').insert({ tournament_id: tournament.id, team_home_id: winners[0], team_away_id: winners[1], stage: 'final', status: 'pending' })
                    loadData()
                  }}>
                  Generar final →
                </button>
              )}
            </>

          /* ── POSICIONES ── */
          ) : tab === 'standings' ? (
            <>
              {groups.map(group => {
                const standing = getStandings(group)
                return (
                  <div key={group} style={{ marginBottom: 24 }}>
                    <p style={styles.sectionLabel}>GRUPO {group}</p>
                    <div style={{ borderRadius: 14, overflow: 'hidden', boxShadow: `0 0 0 1px ${gold}44, 0 4px 16px rgba(0,0,0,0.5)` }}>
                      {goldBar}
                      <div style={{ background: cardBg }}>
                        <div style={{ display: 'flex', color: '#d4a0b0', fontSize: 12, padding: '8px 14px', borderBottom: `1px solid ${gold}33`, fontFamily: 'Georgia, serif', letterSpacing: 1 }}>
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
                              <span key={idx} style={{ width: 28, textAlign: 'center' as const, color: '#d4a0b0', fontSize: 13 }}>{val}</span>
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
              <p style={styles.sectionLabel}>GOLEADORES</p>
              <div style={{ borderRadius: 14, overflow: 'hidden', marginBottom: 24, boxShadow: `0 0 0 1px ${gold}44, 0 4px 16px rgba(0,0,0,0.5)` }}>
                {goldBar}
                <div style={{ background: cardBg }}>
                  {getTopScorers().length === 0
                    ? <p style={{ color: '#d4a0b0', padding: 20, textAlign: 'center', fontFamily: 'Georgia, serif' }}>Sin goles registrados</p>
                    : getTopScorers().map((s, i) => (
                      <div key={s.player.id} style={{ display: 'flex', alignItems: 'center', padding: '10px 14px', borderBottom: `1px solid ${gold}22`, gap: 10 }}>
                        <span style={{ color: i === 0 ? gold : '#d4a0b0', width: 22, fontFamily: 'Georgia, serif', fontWeight: i === 0 ? 900 : 400 }}>{i + 1}</span>
                        <Avatar url={s.player.photo_url} name={s.player.name} size={34} />
                        <span style={{ flex: 1, fontWeight: i === 0 ? 800 : 400, fontFamily: 'Georgia, serif', marginLeft: 4 }}>{s.player.name}</span>
                        <span style={{ color: '#d4a0b0', fontSize: 12, fontFamily: 'Georgia, serif' }}>{teams.find(t => t.id === s.player.team_id)?.name}</span>
                        <span style={{ color: gold, fontWeight: 900, fontSize: 20, fontFamily: 'Georgia, serif', marginLeft: 10, textShadow: `0 0 10px rgba(201,168,76,0.4)` }}>{s.goals}</span>
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
                            <p style={{ color: '#d4a0b0', fontSize: 12, margin: '2px 0 0', fontFamily: 'Georgia, serif' }}>Grupo {team.group_name} · H: {team.handicap}</p>
                          </div>
                        </div>
                        {isAdmin && (
                          <button
                            onClick={() => setEditingTeam({ ...team, _players: teamPlayers.map(p => ({ ...p, _newPhoto: null })), _newLogo: null })}
                            style={{ background: 'linear-gradient(135deg, #5A1525, #3A0A15)', border: `1px solid ${gold}66`, borderRadius: 8, padding: '6px 12px', color: gold, cursor: 'pointer', fontSize: 12, fontFamily: 'Georgia, serif' }}>
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
