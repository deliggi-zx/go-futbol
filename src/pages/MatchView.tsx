import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { QRCodeSVG } from 'qrcode.react'

function Avatar({ url, name, size = 32 }: { url?: string | null; name: string; size?: number }) {
  if (url) return <img src={url} alt={name} style={{ width: size, height: size, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />
  return (
    <div style={{ width: size, height: size, borderRadius: '50%', background: '#8B1A3A', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: size * 0.4, fontWeight: 700, color: '#C9A84C', flexShrink: 0 }}>
      {name.charAt(0).toUpperCase()}
    </div>
  )
}

function FlapDigit({ value, flipping, highlight = false }: { value: number; flipping: boolean; highlight?: boolean }) {
  return (
    <div style={{
      width: 56,
      height: 76,
      background: 'linear-gradient(180deg, #5a5a5a 0%, #3a3a3a 45%, #2a2a2a 50%, #3a3a3a 100%)',
      borderRadius: 8,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontFamily: highlight ? 'Arial Black, Arial, sans-serif' : 'Courier New, monospace',
      fontSize: highlight ? 54 : 52,
      fontWeight: highlight ? 900 : 700,
      color: highlight ? '#FFE000' : '#f0ead0',
      position: 'relative' as const,
      overflow: 'hidden' as const,
      boxShadow: 'inset 0 2px 4px rgba(255,255,255,0.08), inset 0 -2px 4px rgba(0,0,0,0.5), 0 4px 8px rgba(0,0,0,0.6)',
      border: '1px solid #555',
      transform: flipping ? 'scaleY(0.1)' : 'scaleY(1)',
      transition: flipping ? 'transform 0.08s ease-in' : 'transform 0.08s ease-out',
    }}>
      <div style={{
        position: 'absolute' as const, top: 0, left: 0, right: 0, height: '50%',
        background: 'linear-gradient(180deg, rgba(255,255,255,0.05) 0%, rgba(0,0,0,0.1) 100%)',
        borderBottom: '1px solid #222',
        borderRadius: '8px 8px 0 0',
      }} />
      <div style={{
        position: 'absolute' as const,
        left: 4, right: 4,
        top: 'calc(50% - 1px)',
        height: 2,
        background: '#111',
      }} />
      {value}
    </div>
  )
}

function FlapScore({ score, highlight = false }: { score: number; highlight?: boolean }) {
  const [displayScore, setDisplayScore] = useState(score)
  const [flipping, setFlipping] = useState(false)
  const prevScore = useRef(score)

  useEffect(() => {
    if (score !== prevScore.current) {
      setFlipping(true)
      setTimeout(() => {
        setDisplayScore(score)
        setFlipping(false)
      }, 100)
      prevScore.current = score
    }
  }, [score])

  const tens = Math.floor(displayScore / 10)
  const units = displayScore % 10

  return (
    <div style={{ display: 'flex', gap: 4 }}>
      <FlapDigit value={tens} flipping={flipping} highlight={highlight} />
      <FlapDigit value={units} flipping={flipping} highlight={highlight} />
    </div>
  )
}

type Props = { match: any; tournament: any; onBack: () => void; isAdmin: boolean }

export default function MatchView({ match, tournament, onBack, isAdmin }: Props) {
  const [goals, setGoals] = useState<any[]>([])
  const [players, setPlayers] = useState<any[]>([])
  const [mvpVotes, setMvpVotes] = useState<any[]>([])
  const [mvpOfficial, setMvpOfficial] = useState<any>(null)
  const [chukker, setChukker] = useState(match.chukker_current ?? 1)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [showQR, setShowQR] = useState(false)
  const [canchMode, setCanchMode] = useState(false)
  const [soundOn, setSoundOn] = useState(true)
  const soundOnRef = useRef(true)

  const deviceId = (() => {
    let id = localStorage.getItem('tribu_device_id')
    if (!id) {
      id = Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2)
      localStorage.setItem('tribu_device_id', id)
    }
    return id
  })()

  function ringBell() {
    if (!soundOnRef.current) return
    try {
      const audio = new Audio('/bell.wav')
      audio.volume = 1.0
      audio.play().catch(() => {})
    } catch (e) {}
  }

  useEffect(() => {
    loadData()

    const channel = supabase
      .channel(`match-${match.id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'goals', filter: `match_id=eq.${match.id}` }, () => {
        ringBell()
        loadData()
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'goals', filter: `match_id=eq.${match.id}` }, () => loadData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'mvp_votes', filter: `match_id=eq.${match.id}` }, () => loadData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'mvp_official', filter: `match_id=eq.${match.id}` }, () => loadData())
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [match.id])

  async function loadData() {
    setLoading(true)
    const [g, p, v, m] = await Promise.all([
      supabase.from('goals').select('*, player:players(*)').eq('match_id', match.id).order('created_at'),
      supabase.from('players').select('*').in('team_id', [match.team_home_id, match.team_away_id]),
      supabase.from('mvp_votes').select('id, player_id, device_id, player:players(*)').eq('match_id', match.id),
      supabase.from('mvp_official').select('*, player:players(*)').eq('match_id', match.id).single(),
    ])
    setGoals(g.data ?? [])
    setPlayers(p.data ?? [])
    setMvpVotes(v.data ?? [])
    setMvpOfficial(m.data)
    setLoading(false)
  }

  const homeGoals = goals.filter(g => g.team_id === match.team_home_id).length
  const awayGoals = goals.filter(g => g.team_id === match.team_away_id).length
  const hasVoted = mvpVotes.some(v => v.device_id === deviceId) || localStorage.getItem(`voted_match_${match.id}`) === 'true'

  async function addGoal(playerId: string, teamId: string) {
    setSaving(true)
    await supabase.from('goals').insert({ match_id: match.id, player_id: playerId, team_id: teamId, chukker })
    await supabase.from('matches').update({ status: 'live', chukker_current: chukker }).eq('id', match.id)
    await loadData()
    setSaving(false)
  }

  async function removeLastGoal() {
    const lastGoal = goals[goals.length - 1]
    if (!lastGoal) return
    await supabase.from('goals').delete().eq('id', lastGoal.id)
    await loadData()
  }

  async function finishMatch() {
    await supabase.from('matches').update({ status: 'finished', played_at: new Date().toISOString() }).eq('id', match.id)
    onBack()
  }

  async function votePlayer(playerId: string) {
    if (hasVoted) return
    await supabase.from('mvp_votes').insert({ match_id: match.id, player_id: playerId, device_id: deviceId })
    localStorage.setItem(`voted_match_${match.id}`, 'true')
    await loadData()
  }

  async function setOfficialMvp(playerId: string) {
    await supabase.from('mvp_official').upsert({ match_id: match.id, player_id: playerId })
    await loadData()
  }

  function getMvpVoteCount(playerId: string) {
    return mvpVotes.filter(v => v.player_id === playerId).length
  }

  const allPlayers = players

  const styles = {
    container: { minHeight: '100vh', background: canchMode ? '#0A0005' : '#6B0F2B', color: '#fff' },
    header: { background: '#4A0B1E', padding: '16px', borderBottom: '1px solid #8B1A3A' },
    backBtn: { background: 'none', border: 'none', color: '#d4a0b0', cursor: 'pointer', fontSize: 15, marginBottom: 12, padding: 0 },
    section: { padding: '0 16px 16px' },
    sectionTitle: { color: '#d4a0b0', fontSize: 12, fontWeight: 700, letterSpacing: 1, marginBottom: 12, marginTop: 16 },
    btn: (color: string) => ({ background: color, color: color === '#C9A84C' ? '#4A0B1E' : '#fff', border: 'none', borderRadius: 10, padding: '12px 16px', cursor: 'pointer', fontWeight: 700, fontSize: 14, flex: 1 }),
    playerBtn: (active: boolean) => ({ background: active ? '#8B1A3A' : '#4A0B1E', border: active ? '1px solid #C9A84C' : '1px solid #8B1A3A', borderRadius: 10, padding: '10px 14px', cursor: 'pointer', color: '#fff', fontSize: 14, textAlign: 'left' as const, width: '100%', marginBottom: 6 }),
    goalRow: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #5A1525' },
    input: { background: '#4A0B1E', border: '1px solid #8B1A3A', borderRadius: 8, padding: '8px 12px', color: '#fff', fontSize: 15, width: 60, textAlign: 'center' as const },
  }

  if (loading) return <div style={{ ...styles.container, display: 'flex', justifyContent: 'center', alignItems: 'center' }}><p style={{ color: '#fff' }}>Cargando...</p></div>

  const qrUrl = `${window.location.origin}/?match=${match.id}`

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <button style={styles.backBtn} onClick={onBack}>Volver al fixture</button>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ color: '#94a3b8', fontSize: 13 }}>
            {match.stage === 'group' ? `Grupo ${match.group_name}` : match.stage === 'semi' ? 'Semifinal' : 'Final'}
          </span>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 20, background: match.status === 'finished' ? '#166534' : match.status === 'live' ? '#dc2626' : '#334155', color: '#fff' }}>
              {match.status === 'finished' ? 'Finalizado' : match.status === 'live' ? 'En vivo' : 'Pendiente'}
            </span>
            <button onClick={() => { const next = !soundOn; soundOnRef.current = next; setSoundOn(next) }} style={{ background: '#334155', border: 'none', borderRadius: 8, padding: '4px 10px', color: '#fff', cursor: 'pointer', fontSize: 14 }}>
              {soundOn ? '\uD83D\uDD14' : '\uD83D\uDD15'}
            </button>
            <button onClick={() => setCanchMode(!canchMode)} style={{ background: canchMode ? '#FFE000' : '#334155', border: 'none', borderRadius: 8, padding: '4px 10px', color: canchMode ? '#000' : '#fff', cursor: 'pointer', fontSize: 12, fontWeight: canchMode ? 700 : 400 }}>
              {canchMode ? 'Normal' : 'Cancha'}
            </button>
            <button onClick={() => setShowQR(!showQR)} style={{ background: '#334155', border: 'none', borderRadius: 8, padding: '4px 10px', color: '#fff', cursor: 'pointer', fontSize: 12 }}>
              {showQR ? 'Cerrar QR' : 'QR'}
            </button>
          </div>
        </div>
      </div>

      {showQR && (
        <div style={{ background: '#1e293b', padding: 20, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, borderBottom: '1px solid #334155' }}>
          <p style={{ color: '#94a3b8', fontSize: 13, margin: 0 }}>Escanea para votar al jugador destacado</p>
          <div style={{ background: '#fff', padding: 12, borderRadius: 12 }}>
            <QRCodeSVG value={qrUrl} size={180} />
          </div>
          <p style={{ color: '#475569', fontSize: 11, margin: 0 }}>{qrUrl}</p>
        </div>
      )}

      {/* Marcador con chapas */}
      <div style={{ background: canchMode ? '#000' : 'linear-gradient(135deg, #2a2218 0%, #1a1510 100%)', margin: 16, borderRadius: 16, padding: '20px 16px', border: canchMode ? '2px solid #FFE000' : '2px solid #4a3a28', boxShadow: '0 8px 24px rgba(0,0,0,0.6)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
            <Avatar url={match.team_home?.logo_url} name={match.team_home?.name ?? '?'} size={40} />
            <p style={{ fontSize: 13, fontWeight: 600, color: canchMode ? '#FFE000' : '#f0ead0', margin: 0, textAlign: 'center' as const, letterSpacing: 1 }}>{match.team_home?.name}</p>
            <p style={{ color: '#888', fontSize: 11, margin: 0 }}>H: {match.team_home?.handicap ?? 0}</p>
            <FlapScore score={homeGoals} highlight={canchMode} />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, padding: '0 12px' }}>
            {match.status === 'live' && (
              <div style={{ background: '#8B1A2A', color: '#C9A84C', fontSize: 11, fontWeight: 700, letterSpacing: 1, padding: '3px 10px', borderRadius: 20 }}>
                Ch. {chukker}
              </div>
            )}
            <div style={{ width: 1, height: 40, background: 'linear-gradient(180deg, transparent, #4a3a28, transparent)' }} />
          </div>
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
            <Avatar url={match.team_away?.logo_url} name={match.team_away?.name ?? '?'} size={40} />
            <p style={{ fontSize: 13, fontWeight: 600, color: canchMode ? '#FFE000' : '#f0ead0', margin: 0, textAlign: 'center' as const, letterSpacing: 1 }}>{match.team_away?.name}</p>
            <p style={{ color: '#888', fontSize: 11, margin: 0 }}>H: {match.team_away?.handicap ?? 0}</p>
            <FlapScore score={awayGoals} highlight={canchMode} />
          </div>
        </div>
      </div>

      {/* Registro de goles - solo admin */}
      {isAdmin && match.status !== 'finished' && (
        <div style={styles.section}>
          <p style={styles.sectionTitle}>REGISTRAR GOL</p>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
            <span style={{ color: '#94a3b8', fontSize: 14 }}>Chukker:</span>
            <input style={styles.input} type="number" min={1} max={tournament.chukkers_per_match} value={chukker} onChange={e => setChukker(Number(e.target.value))} />
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <div style={{ flex: 1 }}>
              <p style={{ color: '#C9A84C', fontWeight: 700, fontSize: 13, marginBottom: 8, textAlign: 'center' as const }}>{match.team_home?.name}</p>
              {players.filter(p => p.team_id === match.team_home_id).map(player => (
                <button key={player.id} style={{ ...styles.playerBtn(false), display: 'flex', alignItems: 'center', gap: 8 }} onClick={() => addGoal(player.id, match.team_home_id)} disabled={saving}>
                  <Avatar url={player.photo_url} name={player.name} size={28} />
                  <span>{player.name}</span>
                </button>
              ))}
            </div>
            <div style={{ width: 1, background: '#8B1A3A' }} />
            <div style={{ flex: 1 }}>
              <p style={{ color: '#C9A84C', fontWeight: 700, fontSize: 13, marginBottom: 8, textAlign: 'center' as const }}>{match.team_away?.name}</p>
              {players.filter(p => p.team_id === match.team_away_id).map(player => (
                <button key={player.id} style={{ ...styles.playerBtn(false), display: 'flex', alignItems: 'center', gap: 8 }} onClick={() => addGoal(player.id, match.team_away_id)} disabled={saving}>
                  <Avatar url={player.photo_url} name={player.name} size={28} />
                  <span>{player.name}</span>
                </button>
              ))}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            {goals.length > 0 && (
              <button style={styles.btn('#334155')} onClick={removeLastGoal}>Deshacer</button>
            )}
            <button style={styles.btn('#166534')} onClick={finishMatch}>Finalizar partido</button>
          </div>
        </div>
      )}

      {/* Historial de goles */}
      {goals.length > 0 && (
        <div style={styles.section}>
          <p style={styles.sectionTitle}>GOLES</p>
          {goals.map((g, i) => (
            <div key={g.id} style={styles.goalRow}>
              <span style={{ color: '#94a3b8', fontSize: 12 }}>#{i + 1} Ch.{g.chukker}</span>
              <span style={{ fontWeight: 600 }}>{g.player?.name ?? 'Desconocido'}</span>
              <span style={{ color: '#94a3b8', fontSize: 12 }}>{g.team_id === match.team_home_id ? match.team_home?.name : match.team_away?.name}</span>
            </div>
          ))}
        </div>
      )}

      {/* MVP */}
      <div style={styles.section}>
        <p style={styles.sectionTitle}>JUGADOR DESTACADO</p>
        {mvpOfficial ? (
          <div style={{ background: '#4A0B1E', borderRadius: 12, padding: 16, textAlign: 'center' as const, border: '1px solid #8B1A3A' }}>
            <p style={{ color: '#d4a0b0', fontSize: 12, marginBottom: 4 }}>Destacado oficial</p>
            <p style={{ fontSize: 20, fontWeight: 800, color: '#C9A84C' }}>Estrella {mvpOfficial.player?.name}</p>
          </div>
        ) : (
          <>
            {!hasVoted ? (
              <>
                <p style={{ color: '#94a3b8', fontSize: 13, marginBottom: 12 }}>Vota al jugador destacado del partido:</p>
                {allPlayers.map(player => (
                  <button key={player.id} style={{ ...styles.playerBtn(false), display: 'flex', alignItems: 'center', gap: 8 }} onClick={() => votePlayer(player.id)}>
                    <Avatar url={player.photo_url} name={player.name} size={28} />
                    <span>{player.name}</span>
                    <span style={{ color: '#d4a0b0', fontSize: 12, marginLeft: 'auto' }}>({getMvpVoteCount(player.id)} votos)</span>
                  </button>
                ))}
              </>
            ) : (
              <div style={{ background: '#4A0B1E', borderRadius: 12, padding: 16, border: '1px solid #8B1A3A' }}>
                <p style={{ color: '#d4a0b0', fontSize: 13, marginBottom: 12 }}>Votos actuales:</p>
                {allPlayers.sort((a, b) => getMvpVoteCount(b.id) - getMvpVoteCount(a.id)).map(player => (
                  <div key={player.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid #5A1525' }}>
                    <span>{player.name}</span>
                    <span style={{ color: '#C9A84C', fontWeight: 700 }}>{getMvpVoteCount(player.id)} votos</span>
                  </div>
                ))}
              </div>
            )}
            {isAdmin && (
              <>
                <p style={{ ...styles.sectionTitle, marginTop: 16 }}>CONFIRMAR DESTACADO OFICIAL</p>
                {allPlayers.map(player => (
                  <button key={player.id} style={styles.playerBtn(false)} onClick={() => setOfficialMvp(player.id)}>
                    {player.name} ({getMvpVoteCount(player.id)} votos)
                  </button>
                ))}
              </>
            )}
          </>
        )}
      </div>
    </div>
  )
}
