import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { QRCodeSVG } from 'qrcode.react'
import PlayerCard from './PlayerCard'

function Avatar({ url, name, size = 32 }: { url?: string | null; name: string; size?: number }) {
  if (url) return <img src={url} alt={name} style={{ width: size, height: size, borderRadius: '50%', objectFit: 'cover', flexShrink: 0, border: '2px solid #C9A84C', boxShadow: '0 0 8px rgba(201,168,76,0.4)' }} />
  return (
    <div style={{ width: size, height: size, borderRadius: '50%', background: 'radial-gradient(circle, #5A1525 0%, #3A0A15 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: size * 0.4, fontWeight: 700, color: '#C9A84C', flexShrink: 0, border: '2px solid #C9A84C', boxShadow: '0 0 8px rgba(201,168,76,0.4)' }}>
      {name.charAt(0).toUpperCase()}
    </div>
  )
}

function FlapDigit({ value, flipping, highlight = false }: { value: number; flipping: boolean; highlight?: boolean }) {
  return (
    <div style={{
      width: 52,
      height: 72,
      background: highlight ? '#000' : 'linear-gradient(180deg, #f5e6c8 0%, #e8d4a0 45%, #d4b870 50%, #e8d4a0 100%)',
      borderRadius: 10,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontFamily: 'Georgia, serif',
      fontSize: highlight ? 48 : 46,
      fontWeight: 900,
      color: highlight ? '#FFE000' : '#6B0F2B',
      position: 'relative' as const,
      overflow: 'hidden' as const,
      boxShadow: highlight
        ? '0 0 20px rgba(255,224,0,0.5), inset 0 2px 4px rgba(255,255,255,0.1)'
        : 'inset 0 2px 6px rgba(255,255,255,0.4), inset 0 -2px 6px rgba(0,0,0,0.3), 0 4px 12px rgba(0,0,0,0.6)',
      border: highlight ? '2px solid #FFE000' : '2px solid #B8960C',
      transform: flipping ? 'scaleY(0.1)' : 'scaleY(1)',
      transition: flipping ? 'transform 0.08s ease-in' : 'transform 0.08s ease-out',
    }}>
      <div style={{
        position: 'absolute' as const, top: 0, left: 0, right: 0, height: '50%',
        background: highlight
          ? 'linear-gradient(180deg, rgba(255,255,255,0.05) 0%, rgba(0,0,0,0.1) 100%)'
          : 'linear-gradient(180deg, rgba(255,255,255,0.3) 0%, rgba(255,255,255,0.05) 100%)',
        borderBottom: highlight ? '2px solid #333' : '2px solid #8B6914',
        borderRadius: '10px 10px 0 0',
      }} />
      <div style={{
        position: 'absolute' as const,
        left: 6, right: 6,
        top: 'calc(50% - 1px)',
        height: 2,
        background: highlight ? '#333' : '#8B6914',
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
    <div style={{ display: 'flex', gap: 6 }}>
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
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'goals', filter: `match_id=eq.${match.id}` }, () => { ringBell(); loadData() })
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
    const confirm = window.confirm(`¿Deshacer el último gol de ${lastGoal.player?.name ?? 'jugador desconocido'}?`)
    if (!confirm) return
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

  const bgPattern = canchMode ? '#0A0005' : '#4A0B1E'
  const gold = '#C9A84C'
  const goldLight = '#E8C96A'
  const darkBg = '#2A0A12'

  if (loading) return (
    <div style={{ minHeight: '100vh', background: bgPattern, display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
      <p style={{ color: gold, fontSize: 16, fontFamily: 'Georgia, serif' }}>Cargando...</p>
    </div>
  )

  const qrUrl = `${window.location.origin}/?match=${match.id}`

  return (
    <div style={{ minHeight: '100vh', background: canchMode ? '#0A0005' : '#3D0A1A', color: '#fff', backgroundImage: canchMode ? 'none' : `repeating-linear-gradient(45deg, transparent, transparent 40px, rgba(201,168,76,0.03) 40px, rgba(201,168,76,0.03) 41px), repeating-linear-gradient(-45deg, transparent, transparent 40px, rgba(201,168,76,0.03) 40px, rgba(201,168,76,0.03) 41px)` }}>

      {/* Header */}
      <div style={{ background: 'rgba(30,5,15,0.95)', padding: '12px 16px', borderBottom: `1px solid ${gold}44` }}>
        <button onClick={onBack} style={{ background: 'none', border: 'none', color: '#d4a0b0', cursor: 'pointer', fontSize: 14, marginBottom: 8, padding: 0, fontFamily: 'Georgia, serif', letterSpacing: 1 }}>
          ← Volver al fixture
        </button>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ color: gold, fontSize: 12, fontFamily: 'Georgia, serif', letterSpacing: 2, textTransform: 'uppercase' as const }}>
            {match.stage === 'group' ? `Grupo ${match.group_name}` : match.stage === 'semi' ? 'Semifinal' : 'Final'}
          </span>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <span style={{ fontSize: 11, padding: '3px 10px', borderRadius: 20, background: match.status === 'finished' ? '#166534' : match.status === 'live' ? '#dc2626' : '#334155', color: '#fff', fontWeight: 700, letterSpacing: 1 }}>
              {match.status === 'finished' ? 'Finalizado' : match.status === 'live' ? 'En vivo' : 'Pendiente'}
            </span>
            <button onClick={() => { const next = !soundOn; soundOnRef.current = next; setSoundOn(next) }} style={{ background: '#2A0A12', border: `1px solid ${gold}66`, borderRadius: 8, padding: '4px 10px', color: gold, cursor: 'pointer', fontSize: 14 }}>
              {soundOn ? '🔔' : '🔕'}
            </button>
            <button onClick={() => setCanchMode(!canchMode)} style={{ background: canchMode ? '#FFE000' : '#2A0A12', border: `1px solid ${canchMode ? '#FFE000' : gold + '66'}`, borderRadius: 8, padding: '4px 10px', color: canchMode ? '#000' : gold, cursor: 'pointer', fontSize: 12, fontWeight: 700 }}>
              {canchMode ? 'Normal' : 'Cancha'}
            </button>
            <button onClick={() => setShowQR(!showQR)} style={{ background: '#2A0A12', border: `1px solid ${gold}66`, borderRadius: 8, padding: '4px 10px', color: gold, cursor: 'pointer', fontSize: 12 }}>
              QR
            </button>
          </div>
        </div>
      </div>

      {/* QR */}
      {showQR && (
        <div style={{ background: '#1e293b', padding: 20, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, borderBottom: '1px solid #334155' }}>
          <p style={{ color: '#94a3b8', fontSize: 13, margin: 0 }}>Escanea para votar al jugador destacado</p>
          <div style={{ background: '#fff', padding: 12, borderRadius: 12 }}>
            <QRCodeSVG value={qrUrl} size={180} />
          </div>
          <p style={{ color: '#475569', fontSize: 11, margin: 0 }}>{qrUrl}</p>
        </div>
      )}

      {/* Marcador */}
      <div style={{ margin: '16px', borderRadius: 16, overflow: 'hidden', boxShadow: `0 0 0 2px ${gold}, 0 0 0 5px #8B6914, 0 8px 32px rgba(0,0,0,0.8)`, position: 'relative' as const }}>
        
        {/* Marco ornamental top */}
        <div style={{ background: `linear-gradient(90deg, ${darkBg}, #8B6914, ${gold}, #8B6914, ${darkBg})`, height: 4 }} />
        <div style={{ background: canchMode ? '#000' : 'linear-gradient(160deg, #3d2810 0%, #2a1c0a 30%, #1e1408 60%, #2a1c0a 100%)', padding: '20px 16px 24px' }}>

          {/* Equipos y marcador */}
          <div style={{ display: 'flex', alignItems: 'center' }}>
            {/* Equipo local */}
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
              <Avatar url={match.team_home?.logo_url} name={match.team_home?.name ?? '?'} size={52} />
              <p style={{ fontSize: 14, fontWeight: 700, color: canchMode ? '#FFE000' : gold, margin: 0, textAlign: 'center' as const, fontFamily: 'Georgia, serif', letterSpacing: 1 }}>{match.team_home?.name}</p>
              <p style={{ color: '#888', fontSize: 11, margin: 0 }}>H: {match.team_home?.handicap ?? 0}</p>
              <FlapScore score={homeGoals} highlight={canchMode} />
            </div>

            {/* Chukker medallón */}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, width: 68, flexShrink: 0 }}>
              <div style={{ width: 52, height: 52, borderRadius: '50%', background: match.status === 'live' ? `radial-gradient(circle, #B8960C 0%, #8B6914 50%, #6B4F10 100%)` : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column' as const, boxShadow: match.status === 'live' ? `0 0 0 2px ${gold}, 0 4px 12px rgba(0,0,0,0.6)` : 'none' }}>
                {match.status === 'live' && <>
                  <span style={{ color: '#fff', fontSize: 9, fontWeight: 700, letterSpacing: 1 }}>Ch.</span>
                  <span style={{ color: '#fff', fontSize: 18, fontWeight: 900, lineHeight: 1 }}>{chukker}</span>
                </>}
              </div>
              <div style={{ width: 1, height: 30, background: `linear-gradient(180deg, transparent, ${gold}66, transparent)` }} />
            </div>

            {/* Equipo visitante */}
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
              <Avatar url={match.team_away?.logo_url} name={match.team_away?.name ?? '?'} size={52} />
              <p style={{ fontSize: 14, fontWeight: 700, color: canchMode ? '#FFE000' : gold, margin: 0, textAlign: 'center' as const, fontFamily: 'Georgia, serif', letterSpacing: 1 }}>{match.team_away?.name}</p>
              <p style={{ color: '#888', fontSize: 11, margin: 0 }}>H: {match.team_away?.handicap ?? 0}</p>
              <FlapScore score={awayGoals} highlight={canchMode} />
            </div>
          </div>
        </div>
        {/* Marco ornamental bottom */}
        <div style={{ background: `linear-gradient(90deg, ${darkBg}, #8B6914, ${gold}, #8B6914, ${darkBg})`, height: 4 }} />
      </div>

      {/* Registro de goles */}
      {isAdmin && match.status !== 'finished' && (
        <div style={{ padding: '0 16px 16px' }}>
          <p style={{ color: goldLight, fontSize: 12, fontWeight: 700, letterSpacing: 2, marginBottom: 12, marginTop: 8, textAlign: 'center' as const, fontFamily: 'Georgia, serif' }}>REGISTRAR GOL</p>

          {/* Chukker */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16, justifyContent: 'center' }}>
            <span style={{ color: gold, fontSize: 14, fontFamily: 'Georgia, serif' }}>Chukker:</span>
            <input style={{ background: '#2A0A12', border: `1px solid ${gold}`, borderRadius: 8, padding: '8px 12px', color: gold, fontSize: 15, width: 60, textAlign: 'center' as const, fontFamily: 'Georgia, serif', fontWeight: 700 }}
              type="number" min={1} max={tournament.chukkers_per_match} value={chukker} onChange={e => setChukker(Number(e.target.value))} />
          </div>

          {/* Jugadores */}
          <div style={{ display: 'flex', gap: 8 }}>
            <div style={{ flex: 1 }}>
              <p style={{ color: gold, fontWeight: 700, fontSize: 13, marginBottom: 8, textAlign: 'center' as const, fontFamily: 'Georgia, serif', letterSpacing: 1 }}>{match.team_home?.name}</p>
              {players.filter(p => p.team_id === match.team_home_id).map(player => (
                <button key={player.id} disabled={saving}
                  onClick={() => addGoal(player.id, match.team_home_id)}
                  style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', marginBottom: 6, background: 'linear-gradient(135deg, #1a0808 0%, #2a1010 100%)', border: `1px solid ${gold}88`, borderRadius: 10, padding: '10px 12px', cursor: 'pointer', color: '#fff', fontSize: 13, textAlign: 'left' as const, boxShadow: `inset 0 1px 0 rgba(201,168,76,0.2), inset 0 -1px 0 rgba(201,168,76,0.1), 0 2px 8px rgba(0,0,0,0.4)`, outline: `1px solid ${gold}33`, outlineOffset: '-3px' }}>
                  <Avatar url={player.photo_url} name={player.name} size={32} />
                  <span style={{ fontFamily: 'Georgia, serif' }}>{player.name}</span>
                </button>
              ))}
            </div>
            <div style={{ width: 1, background: `linear-gradient(180deg, transparent, ${gold}44, transparent)` }} />
            <div style={{ flex: 1 }}>
              <p style={{ color: gold, fontWeight: 700, fontSize: 13, marginBottom: 8, textAlign: 'center' as const, fontFamily: 'Georgia, serif', letterSpacing: 1 }}>{match.team_away?.name}</p>
              {players.filter(p => p.team_id === match.team_away_id).map(player => (
                <button key={player.id} disabled={saving}
                  onClick={() => addGoal(player.id, match.team_away_id)}
                  style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', marginBottom: 6, background: 'linear-gradient(135deg, #1a0808 0%, #2a1010 100%)', border: `1px solid ${gold}88`, borderRadius: 10, padding: '10px 12px', cursor: 'pointer', color: '#fff', fontSize: 13, textAlign: 'left' as const, boxShadow: `inset 0 1px 0 rgba(201,168,76,0.1)` }}>
                  <Avatar url={player.photo_url} name={player.name} size={32} />
                  <span style={{ fontFamily: 'Georgia, serif' }}>{player.name}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Botones acción */}
          <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
            {goals.length > 0 && (
              <button onClick={removeLastGoal}
                style={{ flex: 1, background: 'linear-gradient(135deg, #2A0A12, #3D1020)', border: `1px solid ${gold}66`, borderRadius: 10, padding: '14px', cursor: 'pointer', color: gold, fontWeight: 700, fontSize: 14, fontFamily: 'Georgia, serif', letterSpacing: 1 }}>
                Deshacer
              </button>
            )}
            <button onClick={finishMatch}
              style={{ flex: 1, background: 'linear-gradient(135deg, #0d3320, #166534)', border: `1px solid #4ade8066`, borderRadius: 10, padding: '14px', cursor: 'pointer', color: '#4ade80', fontWeight: 700, fontSize: 14, fontFamily: 'Georgia, serif', letterSpacing: 1 }}>
              Finalizar partido
            </button>
          </div>
        </div>
      )}

      {/* Historial de goles */}
      {goals.length > 0 && (
        <div style={{ padding: '0 16px 16px' }}>
          <p style={{ color: goldLight, fontSize: 12, fontWeight: 700, letterSpacing: 2, marginBottom: 12, textAlign: 'center' as const, fontFamily: 'Georgia, serif' }}>GOLES</p>
          <div style={{ background: 'rgba(30,5,15,0.8)', borderRadius: 12, overflow: 'hidden', border: `1px solid ${gold}44` }}>
            {goals.map((g, i) => (
              <div key={g.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', borderBottom: `1px solid ${gold}22` }}>
                <span style={{ color: gold, fontSize: 12, fontFamily: 'Georgia, serif' }}>#{i + 1} Ch.{g.chukker}</span>
                <span style={{ fontWeight: 600, fontFamily: 'Georgia, serif' }}>{g.player?.name ?? 'Desconocido'}</span>
                <span style={{ color: '#d4a0b0', fontSize: 12 }}>{g.team_id === match.team_home_id ? match.team_home?.name : match.team_away?.name}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* MVP */}
      <div style={{ padding: '0 16px 32px' }}>
        <p style={{ color: goldLight, fontSize: 12, fontWeight: 700, letterSpacing: 2, marginBottom: 12, textAlign: 'center' as const, fontFamily: 'Georgia, serif' }}>JUGADOR DESTACADO</p>
        {mvpOfficial ? (
          <div style={{ background: 'rgba(30,5,15,0.9)', borderRadius: 12, padding: 20, textAlign: 'center' as const, border: `1px solid ${gold}`, boxShadow: `0 0 20px rgba(201,168,76,0.2)` }}>
            <p style={{ color: '#d4a0b0', fontSize: 12, marginBottom: 4 }}>Destacado oficial</p>
            <p style={{ fontSize: 20, fontWeight: 800, color: gold, fontFamily: 'Georgia, serif' }}>⭐ {mvpOfficial.player?.name}</p>
          </div>
        ) : (
          <>
            <PlayerCard
              players={players}
              onVote={votePlayer}
              onChangeVote={async (_oldId, newId) => {
                await supabase.from('mvp_votes').delete().eq('match_id', match.id).eq('device_id', deviceId)
                await supabase.from('mvp_votes').insert({ match_id: match.id, player_id: newId, device_id: deviceId })
                localStorage.setItem(`voted_match_${match.id}`, 'true')
                await loadData()
              }}
              voteCount={getMvpVoteCount}
              votedPlayerId={mvpVotes.find(v => v.device_id === deviceId)?.player_id ?? null}
            />
            {isAdmin && (
              <>
                <p style={{ color: goldLight, fontSize: 12, fontWeight: 700, letterSpacing: 2, marginTop: 20, marginBottom: 12, textAlign: 'center' as const, fontFamily: 'Georgia, serif' }}>CONFIRMAR DESTACADO OFICIAL</p>
                {players.map(player => (
                  <button key={player.id}
                    onClick={() => setOfficialMvp(player.id)}
                    style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', marginBottom: 6, background: 'linear-gradient(135deg, #1a0808 0%, #2a1010 100%)', border: `1px solid ${gold}88`, borderRadius: 10, padding: '10px 14px', cursor: 'pointer', color: '#fff', fontSize: 13, textAlign: 'left' as const }}>
                    <Avatar url={player.photo_url} name={player.name} size={32} />
                    <span style={{ fontFamily: 'Georgia, serif', flex: 1 }}>{player.name}</span>
                    <span style={{ color: gold, fontSize: 12 }}>{getMvpVoteCount(player.id)} votos</span>
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