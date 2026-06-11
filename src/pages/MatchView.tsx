import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { QRCodeSVG } from 'qrcode.react'
import PlayerCard from './PlayerCard'

const orbitronLink = document.createElement('link')
orbitronLink.rel = 'stylesheet'
orbitronLink.href = 'https://fonts.googleapis.com/css2?family=Orbitron:wght@700;900&display=swap'
document.head.appendChild(orbitronLink)

function Avatar({ url, name, size = 32 }: { url?: string | null; name: string; size?: number }) {
  if (url) return <img src={url} alt={name} style={{ width: size, height: size, borderRadius: '50%', objectFit: 'cover', flexShrink: 0, border: '2px solid #C9A84C', boxShadow: '0 0 8px rgba(201,168,76,0.4)' }} />
  return (
    <div style={{ width: size, height: size, borderRadius: '50%', background: 'radial-gradient(circle, #0D4F28 0%, #062B14 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: size * 0.4, fontWeight: 700, color: '#C9A84C', flexShrink: 0, border: '2px solid #C9A84C', boxShadow: '0 0 8px rgba(201,168,76,0.4)' }}>
      {name.charAt(0).toUpperCase()}
    </div>
  )
}

function DigitalScore({ score, onTap, isAdmin, pendingCount = 0, overtime = false }:
  { score: number; onTap?: () => void; isAdmin?: boolean; pendingCount?: number; overtime?: boolean }) {
  const [displayScore, setDisplayScore] = useState(score)
  const [flash, setFlash] = useState(false)
  const prevScore = useRef(score)

  useEffect(() => {
    if (score !== prevScore.current) {
      setFlash(true)
      setTimeout(() => { setDisplayScore(score); setFlash(false) }, 150)
      prevScore.current = score
    }
  }, [score])

  const display = displayScore.toString().padStart(2, '0')
  const color = overtime ? '#ef4444' : '#00ff88'
  const glow = overtime ? 'rgba(239,68,68,0.9)' : 'rgba(0,255,136,0.9)'

  return (
    <div style={{ display: 'flex', flexDirection: 'column' as const, alignItems: 'center', gap: 6 }}>
      <div
        onClick={isAdmin && onTap ? onTap : undefined}
        style={{
          cursor: isAdmin && onTap ? 'pointer' : 'default',
          opacity: flash ? 0.2 : 1,
          transition: 'opacity 0.15s',
          fontFamily: "'Orbitron', monospace",
          fontSize: 72,
          fontWeight: 900,
          color,
          textShadow: `0 0 8px ${glow}, 0 0 20px ${glow}, 0 0 50px ${glow}`,
          letterSpacing: 6,
          lineHeight: 1,
          padding: '8px 12px',
          borderRadius: 12,
          background: 'rgba(0,0,0,0.5)',
          border: `2px solid ${color}44`,
          minWidth: 110,
          textAlign: 'center' as const,
        }}
      >
        {display}
      </div>
      {isAdmin && onTap && (
        <div style={{ fontSize: 10, color: pendingCount > 0 ? '#fb923c' : '#C9A84C', fontWeight: 700, letterSpacing: 1, fontFamily: 'Georgia, serif' }}>
          {pendingCount > 0 ? `${pendingCount} SIN ASIGNAR` : '+ GOL'}
        </div>
      )}
    </div>
  )
}

type Props = { match: any; tournament: any; onBack: () => void; isAdmin: boolean }

export default function MatchView({ match, tournament, onBack, isAdmin }: Props) {
  const [goals, setGoals] = useState<any[]>([])
  const [players, setPlayers] = useState<any[]>([])
  const [mvpVotes, setMvpVotes] = useState<any[]>([])
  const [mvpOfficial, setMvpOfficial] = useState<any>(null)
  const [period, setPeriod] = useState(match.chukker_current ?? 1)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [showQR, setShowQR] = useState(false)
  const [soundOn, setSoundOn] = useState(true)
  const [editingGoalId, setEditingGoalId] = useState<string | null>(null)
  const [cards, setCards] = useState<any[]>([])
  const [showCardPanel, setShowCardPanel] = useState(false)
  const soundOnRef = useRef(true)

  const [clock, setClock] = useState<any | null>(null)
  const clockRef = useRef<any | null>(null)
  const [liveElapsed, setLiveElapsed] = useState(0)
  const bellFiredRef = useRef(false)
  const whistleRef = useRef<HTMLAudioElement | null>(null)
  const crowdRef = useRef<HTMLAudioElement | null>(null)

  const periodSeconds = (tournament.chukker_duration_minutes ?? 45) * 60
  const totalPeriods = tournament.periods_per_match ?? 2

  function getBaseSeconds(periodNum: number): number {
    return (periodNum - 1) * periodSeconds
  }

  const deviceId = (() => {
    let id = localStorage.getItem('gofutbol_device_id')
    if (!id) { id = crypto.randomUUID(); localStorage.setItem('gofutbol_device_id', id) }
    return id
  })()

  useEffect(() => {
    const w = new Audio('/whistle.wav')
    w.volume = 1.0
    w.preload = 'auto'
    whistleRef.current = w
    const c = new Audio('/crowd.wav')
    c.volume = 0.7
    c.preload = 'auto'
    crowdRef.current = c
  }, [])

  function ringBell() {
    if (!soundOnRef.current) return
    try {
      if (whistleRef.current) { whistleRef.current.currentTime = 0; whistleRef.current.play().catch(() => {}) }
      if (crowdRef.current) { crowdRef.current.currentTime = 0; crowdRef.current.play().catch(() => {}) }
    } catch (e) {}
  }

  async function loadClock() {
    const { data, error } = await supabase.from('match_clock').select('*').eq('match_id', match.id).maybeSingle()
    if (error) return
    clockRef.current = data
    setClock(data)
    if (data) setPeriod(data.chukker)
  }

  useEffect(() => {
    loadData()
    loadClock()
    const channel = supabase
      .channel(`match-${match.id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'goals', filter: `match_id=eq.${match.id}` }, () => { ringBell(); loadData() })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'goals', filter: `match_id=eq.${match.id}` }, () => loadData())
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'goals', filter: `match_id=eq.${match.id}` }, () => loadData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'mvp_votes', filter: `match_id=eq.${match.id}` }, () => loadData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'mvp_official', filter: `match_id=eq.${match.id}` }, () => loadData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'match_clock', filter: `match_id=eq.${match.id}` }, () => loadClock())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'cards', filter: `match_id=eq.${match.id}` }, () => loadData())
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [match.id])

  async function loadData() {
    setLoading(true)
    const [g, p, v, m, c] = await Promise.all([
      supabase.from('goals').select('*, player:players(*)').eq('match_id', match.id).order('created_at'),
      supabase.from('players').select('*').in('team_id', [match.team_home_id, match.team_away_id]),
      supabase.from('mvp_votes').select('id, player_id, device_id, player:players(*)').eq('match_id', match.id),
      supabase.from('mvp_official').select('*, player:players(*)').eq('match_id', match.id).single(),
      supabase.from('cards').select('*, player:players(*)').eq('match_id', match.id).order('created_at'),
    ])
    setGoals(g.data ?? [])
    setPlayers(p.data ?? [])
    setMvpVotes(v.data ?? [])
    setMvpOfficial(m.data)
    setCards(c.data ?? [])
    setLoading(false)
  }

  useEffect(() => {
    if (clock?.status !== 'running') return
    const tick = () => {
      const now = Date.now() / 1000
      const startedAt = new Date(clock.started_at).getTime() / 1000
      const elapsed = clock.elapsed_seconds + (now - startedAt)
      setLiveElapsed(elapsed)
      const periodLimit = getBaseSeconds(clock.chukker) + periodSeconds
      if (elapsed >= periodLimit && !bellFiredRef.current) {
        bellFiredRef.current = true
        ringBell()
      }
    }
    tick()
    const id = setInterval(tick, 200)
    return () => clearInterval(id)
  }, [clock])

  const clockElapsed = clock?.status === 'running' ? liveElapsed : (clock?.elapsed_seconds ?? 0)
  const currentPeriodLimit = clock ? getBaseSeconds(clock.chukker) + periodSeconds : periodSeconds
  const clockIsOvertime = clockElapsed >= currentPeriodLimit

  function formatTime(seconds: number): string {
    const m = Math.floor(seconds / 60)
    const s = Math.floor(seconds % 60)
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
  }

  function getDisplayTime(): string {
    if (!clock) return '00:00'
    if (clock.status === 'stopped') return formatTime(clock.elapsed_seconds)
    return formatTime(clockElapsed)
  }

  const homeGoals = goals.filter(g => g.team_id === match.team_home_id).length
  const awayGoals = goals.filter(g => g.team_id === match.team_away_id).length
  const homePending = goals.filter(g => g.team_id === match.team_home_id && !g.player_id).length
  const awayPending = goals.filter(g => g.team_id === match.team_away_id && !g.player_id).length
  const hasVoted = mvpVotes.some(v => v.device_id === deviceId) || localStorage.getItem(`voted_match_${match.id}`) === 'true'

  async function addGoalNoPlayer(teamId: string) {
    if (saving) return
    if (!clock || clock.status !== 'running') {
      alert('Iniciá el cronómetro antes de registrar un gol.')
      return
    }
    setSaving(true)
    await supabase.from('goals').insert({ match_id: match.id, player_id: null, team_id: teamId, period: period })
    await supabase.from('matches').update({ status: 'live', period_current: period }).eq('id', match.id)
    await loadData()
    setSaving(false)
  }

  async function assignPlayer(playerId: string, teamId: string) {
    const pending = goals
      .filter(g => !g.player_id && g.team_id === teamId)
      .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
    if (pending.length === 0) return
    await supabase.from('goals').update({ player_id: playerId }).eq('id', pending[0].id)
    await loadData()
  }

  async function reassignGoal(goalId: string, playerId: string) {
    await supabase.from('goals').update({ player_id: playerId }).eq('id', goalId)
    setEditingGoalId(null)
    await loadData()
  }

  async function removeLastGoal() {
    const teamGoals = goals.filter(g => g.team_id !== null)
    if (teamGoals.length === 0) return
    const lastGoal = teamGoals[teamGoals.length - 1]
    if (!window.confirm(`¿Deshacer el último gol${lastGoal.player?.name ? ' de ' + lastGoal.player.name : ''}?`)) return
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
async function addCard(playerId: string, teamId: string, type: 'yellow' | 'red') {
    const playerYellows = cards.filter(c => c.player_id === playerId && c.card_type === 'yellow').length
    const isExpelled = cards.some(c => c.player_id === playerId && c.card_type === 'red')
    if (isExpelled || saving) return
    let finalType: 'yellow' | 'red' = type
    if (type === 'yellow' && playerYellows >= 1) {
      finalType = 'red'
    }
    setSaving(true)
    const { error } = await supabase.from('cards').insert({
      match_id: match.id,
      player_id: playerId,
      team_id: teamId,
      card_type: finalType,
      period: period,
    })
    if (error) { alert(`Error al registrar tarjeta: ${error.message}`); setSaving(false); return }
    await loadData()
    setSaving(false)
  }

  function isPlayerExpelled(playerId: string) {
    return cards.some(c => c.player_id === playerId && c.card_type === 'red')
  }

  function getPlayerYellows(playerId: string) {
    return cards.filter(c => c.player_id === playerId && c.card_type === 'yellow').length
  }
  async function setOfficialMvp(playerId: string) {
    await supabase.from('mvp_official').upsert({ match_id: match.id, player_id: playerId })
    await loadData()
  }

  async function startClock(periodNum: number) {
    const now = new Date().toISOString()
    bellFiredRef.current = false
    const baseSeconds = getBaseSeconds(periodNum)
    if (clock) {
      const { data, error } = await supabase.from('match_clock')
        .update({ chukker: periodNum, status: 'running', started_at: now, elapsed_seconds: baseSeconds, updated_at: now })
        .eq('match_id', match.id).select().single()
      if (error) { alert(`Error: ${error.message}`); return }
      clockRef.current = data; setClock(data); setPeriod(periodNum)
    } else {
      const { data, error } = await supabase.from('match_clock')
        .insert({ match_id: match.id, chukker: periodNum, status: 'running', started_at: now, elapsed_seconds: baseSeconds, updated_at: now })
        .select().single()
      if (error) { alert(`Error: ${error.message}`); return }
      clockRef.current = data; setClock(data); setPeriod(periodNum)
    }
    await supabase.from('matches').update({ status: 'live', chukker_current: periodNum }).eq('id', match.id)
  }

  async function pauseClock() {
    if (!clock) return
    const now = Date.now() / 1000
    const startedAt = new Date(clock.started_at).getTime() / 1000
    const currentElapsed = Math.floor(clock.elapsed_seconds + (now - startedAt))
    const { data, error } = await supabase.from('match_clock')
      .update({ status: 'paused', elapsed_seconds: currentElapsed, started_at: null, updated_at: new Date().toISOString() })
      .eq('match_id', match.id).select().single()
    if (error) { alert(`Error al pausar: ${error.message}`); return }
    clockRef.current = data; setClock(data)
  }

  async function resumeClock() {
    if (!clock) return
    const { data, error } = await supabase.from('match_clock')
      .update({ status: 'running', started_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq('match_id', match.id).select().single()
    if (error) return
    clockRef.current = data; setClock(data)
  }

  async function stopClock() {
    if (!clock) return
    const currentElapsed = Math.floor(clock.status === 'running' ? liveElapsed : clock.elapsed_seconds)
    const { data, error } = await supabase.from('match_clock')
      .update({ status: 'stopped', elapsed_seconds: currentElapsed, started_at: null, updated_at: new Date().toISOString() })
      .eq('match_id', match.id).select().single()
    if (error) { alert(`Error al finalizar tiempo: ${error.message}`); return }
    clockRef.current = data; setClock(data)
  }

  function getMvpVoteCount(playerId: string) {
    return mvpVotes.filter(v => v.player_id === playerId).length
  }

  const gold = '#C9A84C'
  const goldLight = '#E8C96A'
  const clockColor = clockIsOvertime ? '#ef4444' : '#00ff88'
  const clockGlow = clockIsOvertime ? 'rgba(239,68,68,0.9)' : 'rgba(0,255,136,0.9)'

  const periodLabel = clock
    ? clock.chukker === 1 ? '1° TIEMPO'
    : clock.chukker === 2 ? '2° TIEMPO'
    : clock.chukker === 3 ? '1° TIEMPO EXTRA'
    : clock.chukker === 4 ? '2° TIEMPO EXTRA'
    : `TIEMPO ${clock.chukker}`
    : ''

  if (loading) return (
    <div style={{ minHeight: '100vh', background: '#0A3D1F', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
      <p style={{ color: gold, fontSize: 16, fontFamily: 'Georgia, serif' }}>Cargando...</p>
    </div>
  )

  const qrUrl = `${window.location.origin}/?match=${match.id}`

  return (
    <div style={{
      minHeight: '100vh',
      background: `linear-gradient(rgba(0,0,0,0.55), rgba(0,0,0,0.55)), url('/grass.jpg') center center / cover`,
      color: '#fff',
    }}>

      {/* Header */}
      <div style={{ background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(8px)', padding: '12px 16px', borderBottom: `1px solid ${gold}44` }}>
        <button onClick={onBack} style={{ background: 'none', border: 'none', color: '#a8d5b5', cursor: 'pointer', fontSize: 14, marginBottom: 8, padding: 0, fontFamily: 'Georgia, serif', letterSpacing: 1 }}>
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
            <button onClick={() => { const next = !soundOn; soundOnRef.current = next; setSoundOn(next) }} style={{ background: 'rgba(0,0,0,0.5)', border: `1px solid ${gold}66`, borderRadius: 8, padding: '4px 10px', color: gold, cursor: 'pointer', fontSize: 14 }}>
              {soundOn ? '🔔' : '🔕'}
            </button>
            <button onClick={() => setShowQR(!showQR)} style={{ background: 'rgba(0,0,0,0.5)', border: `1px solid ${gold}66`, borderRadius: 8, padding: '4px 10px', color: gold, cursor: 'pointer', fontSize: 12 }}>
              QR
            </button>
          </div>
        </div>
      </div>

      {/* QR */}
      {showQR && (
        <div style={{ background: 'rgba(0,0,0,0.85)', padding: 20, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, borderBottom: '1px solid #334155' }}>
          <p style={{ color: '#94a3b8', fontSize: 13, margin: 0 }}>Escanea para votar al jugador destacado</p>
          <div style={{ background: '#fff', padding: 12, borderRadius: 12 }}>
            <QRCodeSVG value={qrUrl} size={180} />
          </div>
          <p style={{ color: '#475569', fontSize: 11, margin: 0 }}>{qrUrl}</p>
        </div>
      )}

      {/* TABLERO PRINCIPAL */}
      <div style={{ margin: '24px 16px 0', position: 'relative' as const }}>

        {/* Reloj — flota encima rompiendo el borde del tablero */}
        <div style={{
          position: 'absolute' as const,
          top: -28,
          left: '50%',
          transform: 'translateX(-50%)',
          zIndex: 10,
          background: clockIsOvertime
            ? 'linear-gradient(135deg, #3a0000, #600000)'
            : 'linear-gradient(135deg, #001a0a, #003318)',
          border: `2px solid ${clockColor}`,
          borderRadius: 16,
          padding: '8px 24px',
          boxShadow: `0 0 20px ${clockGlow}, 0 0 40px ${clockGlow}33`,
          backdropFilter: 'blur(4px)',
          minWidth: 200,
          textAlign: 'center' as const,
        }}>
          {periodLabel && (
            <div style={{ fontSize: 9, color: clockIsOvertime ? '#ef444488' : `${gold}99`, letterSpacing: 3, fontFamily: 'Georgia, serif', marginBottom: 2, textTransform: 'uppercase' as const }}>
              {periodLabel}{clockIsOvertime ? ' +' : ''}
            </div>
          )}
          <div style={{
            fontFamily: "'Orbitron', monospace",
            fontSize: 42,
            fontWeight: 900,
            color: clockColor,
            textShadow: `0 0 8px ${clockGlow}, 0 0 20px ${clockGlow}`,
            letterSpacing: 4,
            lineHeight: 1,
          }}>
            {getDisplayTime()}
          </div>
          {clock && (
            <div style={{ fontSize: 9, color: clock.status === 'running' ? '#4ade80' : clock.status === 'paused' ? gold : '#555', marginTop: 3, letterSpacing: 2, fontFamily: 'Georgia, serif' }}>
              {clock.status === 'running' ? '▶ EN JUEGO' : clock.status === 'paused' ? '⏸ PAUSADO' : '⏹ FINALIZADO'}
            </div>
          )}
        </div>

        {/* Tablero — vidrio oscuro */}
        <div style={{
          background: 'rgba(0,0,0,0.72)',
          backdropFilter: 'blur(12px)',
          borderRadius: 20,
          border: `1px solid ${gold}44`,
          boxShadow: `0 8px 40px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.05)`,
          padding: '48px 20px 24px',
          position: 'relative' as const,
          overflow: 'visible' as const,
        }}>

          {/* Equipos y scores */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>

            {/* Equipo local */}
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
              <Avatar url={match.team_home?.logo_url} name={match.team_home?.name ?? '?'} size={60} />
              <p style={{ fontSize: 15, fontWeight: 800, color: '#fff', margin: 0, textAlign: 'center' as const, fontFamily: 'Georgia, serif', letterSpacing: 1, textShadow: '0 2px 8px rgba(0,0,0,0.8)' }}>{match.team_home?.name}</p>
              <DigitalScore
                score={homeGoals}
                overtime={clockIsOvertime}
                isAdmin={isAdmin && match.status !== 'finished'}
                onTap={() => addGoalNoPlayer(match.team_home_id)}
                pendingCount={homePending}
              />
            </div>

            {/* Separador central */}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, paddingTop: 40 }}>
              <span style={{
                fontFamily: "'Orbitron', monospace",
                fontSize: 56, fontWeight: 900,
                color: clockIsOvertime ? '#ef4444' : '#00ff88',
                textShadow: `0 0 10px ${clockGlow}`,
                lineHeight: 1,
                opacity: 0.8,
              }}>:</span>
            </div>

            {/* Equipo visitante */}
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
              <Avatar url={match.team_away?.logo_url} name={match.team_away?.name ?? '?'} size={60} />
              <p style={{ fontSize: 15, fontWeight: 800, color: '#fff', margin: 0, textAlign: 'center' as const, fontFamily: 'Georgia, serif', letterSpacing: 1, textShadow: '0 2px 8px rgba(0,0,0,0.8)' }}>{match.team_away?.name}</p>
              <DigitalScore
                score={awayGoals}
                overtime={clockIsOvertime}
                isAdmin={isAdmin && match.status !== 'finished'}
                onTap={() => addGoalNoPlayer(match.team_away_id)}
                pendingCount={awayPending}
              />
            </div>
          </div>

          {/* Borde dorado inferior */}
          <div style={{ height: 2, background: `linear-gradient(90deg, transparent, ${gold}88, transparent)`, marginTop: 20 }} />

          {/* Amonestados y expulsados */}
          {cards.length > 0 && (
            <div style={{ marginTop: 12, display: 'flex', flexWrap: 'wrap' as const, gap: 6, justifyContent: 'center' }}>
              {cards.map(c => (
                <span key={c.id} style={{ fontSize: 11, color: c.card_type === 'red' ? '#ef4444' : '#facc15', fontFamily: 'Georgia, serif', background: 'rgba(0,0,0,0.4)', borderRadius: 20, padding: '2px 10px', border: `1px solid ${c.card_type === 'red' ? '#ef444444' : '#facc1544'}` }}>
                  {c.card_type === 'red' ? '🟥' : '🟨'} {c.player?.name ?? '?'}
                </span>
              ))}
            </div>
          )}

          {/* Botones cronómetro */}
          {isAdmin && match.status !== 'finished' && (
            <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginTop: 16, flexWrap: 'wrap' as const }}>
              {!clock && (
                <button onClick={() => startClock(1)}
                  style={{ background: 'linear-gradient(135deg, #0d3320, #166534)', border: '1px solid #4ade8066', borderRadius: 10, padding: '10px 24px', cursor: 'pointer', color: '#4ade80', fontWeight: 700, fontSize: 13, fontFamily: 'Georgia, serif', letterSpacing: 1 }}>
                  Iniciar 1° Tiempo
                </button>
              )}
              {clock?.status === 'running' && (
                clockIsOvertime ? (
                  <button onClick={stopClock}
                    style={{ background: 'linear-gradient(135deg, #3a0000, #600000)', border: '1px solid #ef444466', borderRadius: 10, padding: '10px 24px', cursor: 'pointer', color: '#ef4444', fontWeight: 700, fontSize: 13, fontFamily: 'Georgia, serif', letterSpacing: 1 }}>
                    Finalizar Tiempo
                  </button>
                ) : (
                  <>
                    <button onClick={pauseClock}
                      style={{ background: 'rgba(201,168,76,0.15)', border: `1px solid ${gold}66`, borderRadius: 10, padding: '10px 24px', cursor: 'pointer', color: gold, fontWeight: 700, fontSize: 13, fontFamily: 'Georgia, serif', letterSpacing: 1 }}>
                      Pausar
                    </button>
                    <button onClick={stopClock}
                      style={{ background: 'transparent', border: `1px solid ${gold}33`, borderRadius: 10, padding: '10px 16px', cursor: 'pointer', color: `${gold}77`, fontWeight: 700, fontSize: 12, fontFamily: 'Georgia, serif' }}>
                      Finalizar Tiempo
                    </button>
                  </>
                )
              )}
              {clock?.status === 'paused' && (
                <>
                  <button onClick={resumeClock}
                    style={{ background: 'linear-gradient(135deg, #0d3320, #166534)', border: '1px solid #4ade8066', borderRadius: 10, padding: '10px 24px', cursor: 'pointer', color: '#4ade80', fontWeight: 700, fontSize: 13, fontFamily: 'Georgia, serif', letterSpacing: 1 }}>
                    Reanudar
                  </button>
                  <button onClick={stopClock}
                    style={{ background: 'transparent', border: `1px solid ${gold}33`, borderRadius: 10, padding: '10px 16px', cursor: 'pointer', color: `${gold}77`, fontWeight: 700, fontSize: 12, fontFamily: 'Georgia, serif' }}>
                    Finalizar Tiempo
                  </button>
                </>
              )}
              {clock?.status === 'stopped' && clock.chukker < totalPeriods && (
                <button onClick={() => startClock(clock.chukker + 1)}
                  style={{ background: 'linear-gradient(135deg, #0d3320, #166534)', border: '1px solid #4ade8066', borderRadius: 10, padding: '10px 24px', cursor: 'pointer', color: '#4ade80', fontWeight: 700, fontSize: 13, fontFamily: 'Georgia, serif', letterSpacing: 1 }}>
                  Iniciar {clock.chukker + 1 === 2 ? '2° Tiempo' : `Tiempo ${clock.chukker + 1}`}
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Panel asignación */}
      {isAdmin && match.status !== 'finished' && (
        <div style={{ margin: '16px', background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(8px)', borderRadius: 16, border: `1px solid ${gold}33`, padding: 16 }}>
          <p style={{ color: goldLight, fontSize: 12, fontWeight: 700, letterSpacing: 2, marginBottom: 4, textAlign: 'center' as const, fontFamily: 'Georgia, serif' }}>ASIGNAR GOL</p>
          <p style={{ color: '#a8d5b5', fontSize: 11, textAlign: 'center' as const, marginBottom: 12 }}>Tocá el marcador para sumar un gol · Tocá un jugador para asignarlo</p>

          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16, justifyContent: 'center' }}>
            <span style={{ color: gold, fontSize: 14, fontFamily: 'Georgia, serif' }}>Tiempo:</span>
            <input style={{ background: 'rgba(0,0,0,0.5)', border: `1px solid ${gold}`, borderRadius: 8, padding: '8px 12px', color: gold, fontSize: 15, width: 60, textAlign: 'center' as const, fontFamily: 'Georgia, serif', fontWeight: 700 }}
              type="number" min={1} max={tournament.periods_per_match} value={period} onChange={e => setPeriod(Number(e.target.value))} />
          </div>

          <div style={{ display: 'flex', gap: 8 }}>
            <div style={{ flex: 1 }}>
              <p style={{ color: homePending > 0 ? '#fb923c' : gold, fontWeight: 700, fontSize: 13, marginBottom: 8, textAlign: 'center' as const, fontFamily: 'Georgia, serif', letterSpacing: 1 }}>
                {match.team_home?.name}{homePending > 0 ? ` (${homePending} ⚡)` : ''}
              </p>
              {players.filter(p => p.team_id === match.team_home_id && !isPlayerExpelled(p.id)).map(player => {
                const yellows = getPlayerYellows(player.id)
                return (
                  <button key={player.id} disabled={saving}
                    onClick={() => assignPlayer(player.id, player.team_id)}
                    style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', marginBottom: 6, background: homePending > 0 ? 'rgba(251,146,60,0.15)' : 'rgba(0,0,0,0.4)', border: `1px solid ${homePending > 0 ? '#fb923c88' : gold + '44'}`, borderRadius: 10, padding: '10px 12px', cursor: homePending > 0 ? 'pointer' : 'default', color: '#fff', fontSize: 13, textAlign: 'left' as const, opacity: homePending > 0 ? 1 : 0.5 }}>
                    <Avatar url={player.photo_url} name={player.name} size={32} />
                    <span style={{ fontFamily: 'Georgia, serif', flex: 1 }}>{player.name}</span>
                    {yellows > 0 && <span style={{ fontSize: 13 }}>{Array(yellows).fill('🟨').join('')}</span>}
                  </button>
                )
              })}
            </div>
            <div style={{ width: 1, background: `linear-gradient(180deg, transparent, ${gold}44, transparent)` }} />
            <div style={{ flex: 1 }}>
              <p style={{ color: awayPending > 0 ? '#fb923c' : gold, fontWeight: 700, fontSize: 13, marginBottom: 8, textAlign: 'center' as const, fontFamily: 'Georgia, serif', letterSpacing: 1 }}>
                {match.team_away?.name}{awayPending > 0 ? ` (${awayPending} ⚡)` : ''}
              </p>
              {players.filter(p => p.team_id === match.team_away_id && !isPlayerExpelled(p.id)).map(player => {
                const yellows = getPlayerYellows(player.id)
                return (
                  <button key={player.id} disabled={saving}
                    onClick={() => assignPlayer(player.id, player.team_id)}
                    style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', marginBottom: 6, background: awayPending > 0 ? 'rgba(251,146,60,0.15)' : 'rgba(0,0,0,0.4)', border: `1px solid ${awayPending > 0 ? '#fb923c88' : gold + '44'}`, borderRadius: 10, padding: '10px 12px', cursor: awayPending > 0 ? 'pointer' : 'default', color: '#fff', fontSize: 13, textAlign: 'left' as const, opacity: awayPending > 0 ? 1 : 0.5 }}>
                    <Avatar url={player.photo_url} name={player.name} size={32} />
                    <span style={{ fontFamily: 'Georgia, serif', flex: 1 }}>{player.name}</span>
                    {yellows > 0 && <span style={{ fontSize: 13 }}>{Array(yellows).fill('🟨').join('')}</span>}
                  </button>
                )
              })}
            </div>
          </div>

          <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
            {goals.length > 0 && (
              <button onClick={removeLastGoal}
                style={{ flex: 1, background: 'rgba(201,168,76,0.15)', border: `1px solid ${gold}66`, borderRadius: 10, padding: '14px', cursor: 'pointer', color: gold, fontWeight: 700, fontSize: 14, fontFamily: 'Georgia, serif', letterSpacing: 1 }}>
                Deshacer
              </button>
            )}
            <button onClick={finishMatch}
              style={{ flex: 1, background: 'rgba(22,101,52,0.6)', border: `1px solid #4ade8066`, borderRadius: 10, padding: '14px', cursor: 'pointer', color: '#4ade80', fontWeight: 700, fontSize: 14, fontFamily: 'Georgia, serif', letterSpacing: 1 }}>
              Finalizar partido
            </button>
          </div>
        </div>
      )}

{/* Panel tarjetas */}
      {isAdmin && match.status !== 'finished' && (
        <div style={{ margin: '0 16px 16px' }}>
          <button
            onClick={() => setShowCardPanel(!showCardPanel)}
            style={{ width: '100%', background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(8px)', borderRadius: 12, border: `1px solid ${gold}33`, padding: '12px 16px', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ color: goldLight, fontSize: 12, fontWeight: 700, letterSpacing: 2, fontFamily: 'Georgia, serif' }}>TARJETAS</span>
            <span style={{ fontSize: 18 }}>{showCardPanel ? '▲' : '▼'}</span>
          </button>

          {showCardPanel && (
            <div style={{ background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(8px)', borderRadius: '0 0 12px 12px', border: `1px solid ${gold}33`, borderTop: 'none', padding: 16 }}>
              {[
                { team: match.team_home, teamId: match.team_home_id },
                { team: match.team_away, teamId: match.team_away_id }
              ].map(({ team, teamId }) => (
                <div key={teamId} style={{ marginBottom: 16 }}>
                  <p style={{ color: gold, fontSize: 12, fontWeight: 700, letterSpacing: 1, marginBottom: 8, fontFamily: 'Georgia, serif' }}>{team?.name}</p>
                  {players.filter(p => p.team_id === teamId).map(player => {
                    const expelled = isPlayerExpelled(player.id)
                    const yellows = getPlayerYellows(player.id)
                    return (
                      <div key={player.id} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, opacity: expelled ? 0.5 : 1 }}>
                        <Avatar url={player.photo_url} name={player.name} size={28} />
                        <span style={{ flex: 1, fontSize: 13, fontFamily: 'Georgia, serif', color: expelled ? '#ef4444' : '#fff' }}>
                          {player.name}
                          {expelled ? ' 🟥 EXPULSADO' : yellows > 0 ? ' 🟨' : ''}
                        </span>
                        {!expelled && (
                          <div style={{ display: 'flex', gap: 6 }}>
                            <button onClick={() => addCard(player.id, teamId, 'yellow')}
                              style={{ background: '#ca8a04', border: 'none', borderRadius: 6, width: 32, height: 32, cursor: 'pointer', fontSize: 16, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                              🟨
                            </button>
                            <button onClick={() => addCard(player.id, teamId, 'red')}
                              style={{ background: '#dc2626', border: 'none', borderRadius: 6, width: 32, height: 32, cursor: 'pointer', fontSize: 16, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                              🟥
                            </button>
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Historial de goles */}
      {goals.length > 0 && (
        <div style={{ margin: '0 16px 16px' }}>
          <p style={{ color: goldLight, fontSize: 12, fontWeight: 700, letterSpacing: 2, marginBottom: 12, textAlign: 'center' as const, fontFamily: 'Georgia, serif' }}>GOLES</p>
          <div style={{ background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(8px)', borderRadius: 12, overflow: 'hidden', border: `1px solid ${gold}44` }}>
            {goals.map((g, i) => (
              <div key={g.id}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', borderBottom: `1px solid ${gold}22` }}>
                  <span style={{ color: gold, fontSize: 12, fontFamily: 'Georgia, serif', minWidth: 60 }}>#{i + 1} T.{g.chukker}</span>
                  <span style={{ fontWeight: 600, fontFamily: 'Georgia, serif', flex: 1, textAlign: 'center' as const, color: g.player_id ? '#fff' : '#fb923c' }}>
                    {g.player?.name ?? '⚡ Sin asignar'}
                  </span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 80, justifyContent: 'flex-end' }}>
                    <span style={{ color: '#a8d5b5', fontSize: 11 }}>{g.team_id === match.team_home_id ? match.team_home?.name : match.team_away?.name}</span>
                    {isAdmin && (
                      <button onClick={() => setEditingGoalId(editingGoalId === g.id ? null : g.id)}
                        style={{ background: 'none', border: `1px solid ${gold}44`, borderRadius: 6, padding: '2px 8px', color: gold, cursor: 'pointer', fontSize: 11 }}>
                        ✏️
                      </button>
                    )}
                  </div>
                </div>
                {editingGoalId === g.id && isAdmin && (
                  <div style={{ background: 'rgba(0,0,0,0.6)', padding: '10px 14px', borderBottom: `1px solid ${gold}22` }}>
                    <p style={{ color: gold, fontSize: 11, margin: '0 0 8px', fontFamily: 'Georgia, serif' }}>Reasignar a:</p>
                    <div style={{ display: 'flex', flexWrap: 'wrap' as const, gap: 6 }}>
                      {players.filter(p => p.team_id === g.team_id && !isPlayerExpelled(p.id)).map(player => (
                        <button key={player.id}
                          onClick={() => reassignGoal(g.id, player.id)}
                          style={{ background: g.player_id === player.id ? gold : 'rgba(0,0,0,0.5)', border: `1px solid ${gold}88`, borderRadius: 8, padding: '6px 12px', cursor: 'pointer', color: g.player_id === player.id ? '#0D4F28' : '#fff', fontSize: 12, fontFamily: 'Georgia, serif', fontWeight: g.player_id === player.id ? 700 : 400 }}>
                          {player.name}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* MVP */}
      <div style={{ margin: '0 16px 32px' }}>
        <p style={{ color: goldLight, fontSize: 12, fontWeight: 700, letterSpacing: 2, marginBottom: 12, textAlign: 'center' as const, fontFamily: 'Georgia, serif' }}>JUGADOR DESTACADO</p>
        {mvpOfficial ? (
          <div style={{ background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(8px)', borderRadius: 12, padding: 20, textAlign: 'center' as const, border: `1px solid ${gold}`, boxShadow: `0 0 20px rgba(201,168,76,0.2)` }}>
            <p style={{ color: '#a8d5b5', fontSize: 12, marginBottom: 4 }}>Destacado oficial</p>
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
                    style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', marginBottom: 6, background: 'rgba(0,0,0,0.5)', border: `1px solid ${gold}88`, borderRadius: 10, padding: '10px 14px', cursor: 'pointer', color: '#fff', fontSize: 13, textAlign: 'left' as const }}>
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
