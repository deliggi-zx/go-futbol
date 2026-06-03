import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import MatchView from './MatchView'
import AwardsView from './AwardsView'

type Props = { tournament: any; onReset: () => void; initialMatchId?: string | null }

function Avatar({ url, name, size = 32 }: { url?: string | null; name: string; size?: number }) {
  if (url) return <img src={url} alt={name} style={{ width: size, height: size, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />
  return (
    <div style={{ width: size, height: size, borderRadius: '50%', background: '#8B1A3A', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: size * 0.4, fontWeight: 700, color: '#C9A84C', flexShrink: 0 }}>
      {name.charAt(0).toUpperCase()}
    </div>
  )
}

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
  const isAdmin = localStorage.getItem('tribu_admin') === 'true'

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
      // Logo del equipo
      let logoUrl = editingTeam.logo_url
      if (editingTeam._newLogo) {
        logoUrl = await uploadImage(editingTeam._newLogo, `logos/${editingTeam.id}.jpg`)
      }
      await supabase.from('teams').update({ name: editingTeam.name, logo_url: logoUrl }).eq('id', editingTeam.id)

      // Jugadores
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

  const styles = {
    container: { minHeight: '100vh', background: '#6B0F2B', color: '#fff' },
    header: { background: '#4A0B1E', padding: '20px 16px', borderBottom: '1px solid #8B1A3A' },
    title: { fontSize: 22, fontWeight: 800, color: '#C9A84C', margin: 0 },
    sub: { color: '#d4a0b0', fontSize: 13, marginTop: 4 },
    tabs: { display: 'flex', background: '#4A0B1E', borderBottom: '1px solid #8B1A3A', overflowX: 'auto' as const },
    tab: (active: boolean) => ({ flex: 1, padding: '12px 6px', textAlign: 'center' as const, cursor: 'pointer', fontWeight: 600, fontSize: 12, color: active ? '#C9A84C' : '#d4a0b0', borderBottom: active ? '2px solid #C9A84C' : '2px solid transparent', background: 'none', border: 'none', borderBottomStyle: 'solid' as const, borderBottomWidth: active ? 2 : 0, borderBottomColor: active ? '#C9A84C' : 'transparent', whiteSpace: 'nowrap' as const }),
    content: { padding: 16, maxWidth: 600, margin: '0 auto' },
    matchCard: { background: '#4A0B1E', borderRadius: 12, padding: 16, marginBottom: 10, cursor: 'pointer', border: '1px solid #8B1A3A' },
    stageBadge: (stage: string) => ({ display: 'inline-block', padding: '2px 8px', borderRadius: 20, fontSize: 11, fontWeight: 700, background: stage === 'group' ? '#1e40af' : stage === 'semi' ? '#7e22ce' : '#b45309', color: '#fff', marginBottom: 8 }),
    scoreRow: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
    teamName: { flex: 1, fontSize: 15, fontWeight: 600 },
    score: { fontSize: 28, fontWeight: 800, color: '#C9A84C', minWidth: 40, textAlign: 'center' as const },
    statusBadge: (s: string) => ({ fontSize: 11, padding: '2px 8px', borderRadius: 20, background: s === 'finished' ? '#166534' : s === 'live' ? '#dc2626' : '#5A1525', color: '#fff' }),
    tableHeader: { display: 'flex', color: '#d4a0b0', fontSize: 12, padding: '8px 12px', borderBottom: '1px solid #8B1A3A' },
    tableRow: { display: 'flex', alignItems: 'center', padding: '10px 12px', borderBottom: '1px solid #5A1525' },
    adminBtn: { background: '#8B1A3A', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 16px', cursor: 'pointer', fontSize: 13 },
    input: { width: '100%', background: '#6B0F2B', border: '1px solid #8B1A3A', borderRadius: 8, padding: '8px 12px', color: '#fff', fontSize: 14, boxSizing: 'border-box' as const },
  }

  if (selectedMatch) {
    return <MatchView match={selectedMatch} tournament={tournament} onBack={() => { setSelectedMatch(null); loadData() }} isAdmin={isAdmin} />
  }

  // Panel edición equipo
  if (editingTeam) {
    return (
      <div style={styles.container}>
        <div style={styles.header}>
          <button onClick={() => setEditingTeam(null)} style={{ background: 'none', border: 'none', color: '#d4a0b0', cursor: 'pointer', fontSize: 15, marginBottom: 8, padding: 0 }}>← Volver</button>
          <h2 style={{ ...styles.title, fontSize: 18 }}>Editar equipo</h2>
        </div>
        <div style={{ padding: 16, maxWidth: 600, margin: '0 auto' }}>
          {/* Logo y nombre del equipo */}
          <div style={{ background: '#4A0B1E', borderRadius: 12, padding: 16, marginBottom: 12, border: '1px solid #8B1A3A' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
              <Avatar url={editingTeam._newLogo ? URL.createObjectURL(editingTeam._newLogo) : editingTeam.logo_url} name={editingTeam.name} size={56} />
              <div style={{ flex: 1 }}>
                <input style={{ ...styles.input, marginBottom: 8 }} value={editingTeam.name} onChange={e => setEditingTeam({ ...editingTeam, name: e.target.value })} placeholder="Nombre del equipo" />
                <label style={{ color: '#d4a0b0', fontSize: 11, display: 'block', marginBottom: 4 }}>Logo del equipo</label>
                <input type="file" accept="image/*" style={{ color: '#d4a0b0', fontSize: 12 }} onChange={e => setEditingTeam({ ...editingTeam, _newLogo: e.target.files?.[0] ?? null })} />
              </div>
            </div>
          </div>

          {/* Jugadores */}
          <p style={{ color: '#d4a0b0', fontSize: 12, fontWeight: 700, letterSpacing: 1, marginBottom: 8 }}>JUGADORES</p>
          {editingTeam._players.map((player: any, j: number) => (
            <div key={player.id} style={{ background: '#4A0B1E', borderRadius: 12, padding: 12, marginBottom: 8, border: '1px solid #8B1A3A' }}>
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
                  <input style={{ ...styles.input, marginBottom: 6 }} placeholder="Resena breve" value={player.bio ?? ''} onChange={e => {
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

          <button onClick={saveTeamEdit} disabled={savingEdit} style={{ background: '#C9A84C', color: '#4A0B1E', fontWeight: 700, fontSize: 16, border: 'none', borderRadius: 10, padding: '14px 24px', cursor: 'pointer', width: '100%', marginTop: 8 }}>
            {savingEdit ? 'Guardando...' : '✓ Guardar cambios'}
          </button>
        </div>
      </div>
    )
  }

  const groupMatches = matches.filter(m => m.stage === 'group')
  const knockoutMatches = matches.filter(m => m.stage !== 'group')

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <img src="/logo.jpg" alt="Logo" style={{ width: 72, height: 72, borderRadius: 10, objectFit: 'cover' }} />
            <div>
              <h1 style={styles.title}>{tournament.name}</h1>
              <p style={styles.sub}>{new Date(tournament.date).toLocaleDateString('es-AR')} · {tournament.chukkers_per_match} chukkers</p>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, flexDirection: 'column', alignItems: 'flex-end' }}>
            <button style={styles.adminBtn} onClick={() => {
              const pwd = prompt('Contraseña admin:')
              if (pwd === 'tribu2026') { localStorage.setItem('tribu_admin', 'true'); window.location.reload() }
              else if (pwd !== null) alert('Incorrecta')
            }}>{isAdmin ? '✓ Admin' : 'Admin'}</button>
            {isAdmin && <button style={{ ...styles.adminBtn, fontSize: 11, background: '#dc2626' }} onClick={async () => {
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
            }}>Finalizar torneo</button>}
          </div>
        </div>
      </div>

      <div style={styles.tabs}>
        {(['fixture', 'standings', 'stats', 'teams', 'awards'] as const).map(t => (
          <button key={t} style={styles.tab(tab === t)} onClick={() => setTab(t)}>
            {t === 'fixture' ? 'Fixture' : t === 'standings' ? 'Posiciones' : t === 'stats' ? 'Stats' : t === 'teams' ? 'Equipos' : 'Premios'}
          </button>
        ))}
      </div>

      <div style={styles.content}>
        {loading ? <p style={{ color: '#94a3b8', textAlign: 'center', marginTop: 40 }}>Cargando...</p> : (

          tab === 'fixture' ? (
            <>
              {['A', 'B'].map(group => (
                <div key={group}>
                  <p style={{ color: '#C9A84C', fontWeight: 700, fontSize: 13, letterSpacing: 1, marginBottom: 8 }}>GRUPO {group}</p>
                  {groupMatches.filter(m => m.group_name === group).map(match => (
                    <div key={match.id} style={styles.matchCard} onClick={() => isAdmin || match.status !== 'pending' ? setSelectedMatch(match) : null}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                        <span style={styles.stageBadge('group')}>Grupo {group}</span>
                        <span style={styles.statusBadge(match.status)}>{match.status === 'finished' ? 'Finalizado' : match.status === 'live' ? `🔴 Ch.${match.chukker_current}` : 'Pendiente'}</span>
                      </div>
                      <div style={styles.scoreRow}>
                        <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 6 }}>
                          <Avatar url={match.team_home?.logo_url} name={match.team_home?.name ?? '?'} size={28} />
                          <span style={styles.teamName}>{match.team_home?.name}</span>
                        </div>
                        <span style={styles.score}>{match.status !== 'pending' ? getMatchGoals(match.id, match.team_home_id) : '-'}</span>
                        <span style={{ color: '#94a3b8' }}>vs</span>
                        <span style={styles.score}>{match.status !== 'pending' ? getMatchGoals(match.id, match.team_away_id) : '-'}</span>
                        <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'flex-end' }}>
                          <span style={{ ...styles.teamName, textAlign: 'right' as const }}>{match.team_away?.name}</span>
                          <Avatar url={match.team_away?.logo_url} name={match.team_away?.name ?? '?'} size={28} />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ))}
              {knockoutMatches.length > 0 && (
                <>
                  <p style={{ color: '#C9A84C', fontWeight: 700, fontSize: 13, letterSpacing: 1, marginTop: 16, marginBottom: 8 }}>ELIMINACIÓN DIRECTA</p>
                  {knockoutMatches.map(match => (
                    <div key={match.id} style={styles.matchCard} onClick={() => setSelectedMatch(match)}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                        <span style={styles.stageBadge(match.stage)}>{match.stage === 'semi' ? 'Semifinal' : 'Final'}</span>
                        <span style={styles.statusBadge(match.status)}>{match.status === 'finished' ? 'Finalizado' : match.status === 'live' ? '🔴 En vivo' : 'Pendiente'}</span>
                      </div>
                      <div style={styles.scoreRow}>
                        <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 6 }}>
                          <Avatar url={match.team_home?.logo_url} name={match.team_home?.name ?? '?'} size={28} />
                          <span style={styles.teamName}>{match.team_home?.name ?? 'Por definir'}</span>
                        </div>
                        <span style={styles.score}>{match.status !== 'pending' ? getMatchGoals(match.id, match.team_home_id) : '-'}</span>
                        <span style={{ color: '#94a3b8' }}>vs</span>
                        <span style={styles.score}>{match.status !== 'pending' ? getMatchGoals(match.id, match.team_away_id) : '-'}</span>
                        <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'flex-end' }}>
                          <span style={{ ...styles.teamName, textAlign: 'right' as const }}>{match.team_away?.name ?? 'Por definir'}</span>
                          <Avatar url={match.team_away?.logo_url} name={match.team_away?.name ?? '?'} size={28} />
                        </div>
                      </div>
                    </div>
                  ))}
                </>
              )}
              {isAdmin && knockoutMatches.length === 0 && groupMatches.every(m => m.status === 'finished') && (
                <button style={{ background: '#C9A84C', color: '#4A0B1E', fontWeight: 700, border: 'none', borderRadius: 10, padding: '14px 24px', cursor: 'pointer', width: '100%', marginTop: 16 }}
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
                <button style={{ background: '#C9A84C', color: '#4A0B1E', fontWeight: 700, border: 'none', borderRadius: 10, padding: '14px 24px', cursor: 'pointer', width: '100%', marginTop: 16 }}
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
          ) : tab === 'standings' ? (
            <>
              {['A', 'B'].map(group => {
                const standing = getStandings(group)
                return (
                  <div key={group} style={{ marginBottom: 24 }}>
                    <p style={{ color: '#C9A84C', fontWeight: 700, fontSize: 13, letterSpacing: 1, marginBottom: 8 }}>GRUPO {group}</p>
                    <div style={{ background: '#4A0B1E', borderRadius: 12, overflow: 'hidden', border: '1px solid #8B1A3A' }}>
                      <div style={styles.tableHeader}>
                        <span style={{ flex: 1 }}>Equipo</span>
                        <span style={{ width: 28, textAlign: 'center' }}>PJ</span>
                        <span style={{ width: 28, textAlign: 'center' }}>G</span>
                        <span style={{ width: 28, textAlign: 'center' }}>E</span>
                        <span style={{ width: 28, textAlign: 'center' }}>P</span>
                        <span style={{ width: 28, textAlign: 'center' }}>GF</span>
                        <span style={{ width: 28, textAlign: 'center' }}>GC</span>
                        <span style={{ width: 36, textAlign: 'center', color: '#C9A84C' }}>PTS</span>
                      </div>
                      {standing.map((team, i) => (
                        <div key={team.id} style={{ ...styles.tableRow, background: i < 2 ? 'rgba(201,168,76,0.08)' : 'transparent' }}>
                          <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 8 }}>
                            <Avatar url={team.logo_url} name={team.name} size={24} />
                            <span style={{ fontWeight: i < 2 ? 700 : 400 }}>{i < 2 && '→ '}{team.name}</span>
                          </div>
                          <span style={{ width: 28, textAlign: 'center', color: '#d4a0b0' }}>{team.pj}</span>
                          <span style={{ width: 28, textAlign: 'center', color: '#d4a0b0' }}>{team.w}</span>
                          <span style={{ width: 28, textAlign: 'center', color: '#d4a0b0' }}>{team.d}</span>
                          <span style={{ width: 28, textAlign: 'center', color: '#d4a0b0' }}>{team.l}</span>
                          <span style={{ width: 28, textAlign: 'center', color: '#d4a0b0' }}>{team.gf}</span>
                          <span style={{ width: 28, textAlign: 'center', color: '#d4a0b0' }}>{team.gc}</span>
                          <span style={{ width: 36, textAlign: 'center', fontWeight: 800, color: '#C9A84C' }}>{team.pts}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )
              })}
            </>
          ) : tab === 'stats' ? (
            <>
              <p style={{ color: '#C9A84C', fontWeight: 700, fontSize: 13, letterSpacing: 1, marginBottom: 12 }}>GOLEADORES</p>
              <div style={{ background: '#4A0B1E', borderRadius: 12, overflow: 'hidden', marginBottom: 24, border: '1px solid #8B1A3A' }}>
                {getTopScorers().length === 0
                  ? <p style={{ color: '#d4a0b0', padding: 16, textAlign: 'center' }}>Sin goles registrados</p>
                  : getTopScorers().map((s, i) => (
                    <div key={s.player.id} style={{ ...styles.tableRow, justifyContent: 'space-between' }}>
                      <span style={{ color: '#d4a0b0', width: 24 }}>{i + 1}</span>
                      <Avatar url={s.player.photo_url} name={s.player.name} size={32} />
                      <span style={{ flex: 1, fontWeight: i === 0 ? 700 : 400, marginLeft: 8 }}>{s.player.name}</span>
                      <span style={{ color: '#d4a0b0', fontSize: 12 }}>{teams.find(t => t.id === s.player.team_id)?.name}</span>
                      <span style={{ color: '#C9A84C', fontWeight: 800, marginLeft: 12, fontSize: 18 }}>{s.goals}</span>
                    </div>
                  ))
                }
              </div>
            </>
          ) : tab === 'teams' ? (
            <>
              <p style={{ color: '#C9A84C', fontWeight: 700, fontSize: 13, letterSpacing: 1, marginBottom: 12 }}>EQUIPOS</p>
              {teams.map(team => {
                const teamPlayers = players.filter(p => p.team_id === team.id)
                return (
                  <div key={team.id} style={{ background: '#4A0B1E', borderRadius: 12, padding: 16, marginBottom: 12, border: '1px solid #8B1A3A' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <Avatar url={team.logo_url} name={team.name} size={44} />
                        <div>
                          <p style={{ fontWeight: 700, fontSize: 16, margin: 0, color: '#fff' }}>{team.name}</p>
                          <p style={{ color: '#d4a0b0', fontSize: 12, margin: 0 }}>Grupo {team.group_name} · H: {team.handicap}</p>
                        </div>
                      </div>
                      {isAdmin && (
                        <button onClick={() => setEditingTeam({ ...team, _players: teamPlayers.map(p => ({ ...p, _newPhoto: null })), _newLogo: null })}
                          style={{ background: '#8B1A3A', border: 'none', borderRadius: 8, padding: '6px 12px', color: '#fff', cursor: 'pointer', fontSize: 12 }}>
                          ✏️ Editar
                        </button>
                      )}
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap' as const, gap: 8 }}>
                      {teamPlayers.map(player => (
                        <div key={player.id} style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#6B0F2B', borderRadius: 20, padding: '4px 10px 4px 4px' }}>
                          <Avatar url={player.photo_url} name={player.name} size={28} />
                          <span style={{ fontSize: 13, color: '#fff' }}>{player.name}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )
              })}
            </>
          ) : (
            <AwardsView tournament={tournament} isAdmin={isAdmin} />
          )
        )}
      </div>
    </div>
  )
}
