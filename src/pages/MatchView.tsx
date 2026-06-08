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
      width: 52, height: 72,
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
        position: 'absolute' as const, left: 6, right: 6, top: 'calc(50% - 1px)', height: 2,
        background: highlight ? '#333' : '#8B6914',
      }} />
      {value}
    </div>
  )
}

function FlapScore({ score, highlight = false, onTap, isAdmin, pendingCount = 0 }:
  { score: number; highlight?: boolean; onTap?: () => void; isAdmin?: boolean; pendingCount?: number }) {
  const [displayScore, setDisplayScore] = useState(score)
  const [flipping, setFlipping] = useState(false)
  const prevScore = useRef(score)

  useEffect(() => {
    if (score !== prevScore.current) {
      setFlipping(true)
      setTimeout(() => { setDisplayScore(score); setFlipping(false) }, 100)
      prevScore.current = score
    }
  }, [score])

  const tens = Math.floor(displayScore / 10)
  const units = displayScore % 10

  return (
    <div style={{ display: 'flex', flexDirection: 'column' as const, alignItems: 'center', gap: 4 }}>
      <div
        onClick={isAdmin && onTap ? onTap : undefined}
        style={{
          display: 'flex', gap: 6,
          cursor: isAdmin && onTap ? 'pointer' : 'default',
          transform: isAdmin && onTap ? 'scale(1)' : 'scale(1)',
          transition: 'transform 0.1s',
        }}
      >
        <FlapDigit value={tens} flipping={flipping} highlight={highlight} />
        <FlapDigit value={units} flipping={flipping} highlight={highlight} />
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
  const [chukker, setChukker] = useState(match.chukker_current ?? 1)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [showQR, setShowQR] = useState(false)
  const [canchMode, setCanchMode] = useState(false)
  const [soundOn, setSoundOn] = useState(true)
  const [editingGoalId, setEditingGoalId] = useState<string | null>(null)
  const soundOnRef = useRef(true)

  const [clock, setClock] = useState<any | null>(null)
  const clockRef = useRef<any | null>(null)
  const [liveElapsed, setLiveElapsed] = useState(0)
  const bellFiredRef = useRef(false)
  const prevClockChukkerRef = useRef<number | null>(null)

  const deviceId = (() => {
    let id = localStorage.getItem('tribu_device_id')
    if (!id) { id = crypto.randomUUID(); localStorage.setItem('tribu_device_id', id) }
    return id
  })()

  function ringBell() {
    if (!soundOnRef.current) return
    try { const audio = new Audio('/bell.wav'); audio.volume = 1.0; audio.play().catch(() => {}) } catch (e) {}
  }

  async function loadClock() {
    const { data, error } = await supabase.from('match_clock').select('*').eq('match_id', match.id).maybeSingle()
    if (error) { console.error('[Clock] ERROR loadClock:', error); return }
    console.log('[Clock] loadClock data=', data)
    clockRef.current = data
    setClock(data)
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

  // Sync chukker state from clock and reset bell on new chukker
  useEffect(() => {
    if (!clock) return
    if (clock.chukker !== prevClockChukkerRef.current) {
      prevClockChukkerRef.current = clock.chukker
      setChukker(clock.chukker)
      const initialElapsed = clock.status === 'running'
        ? clock.elapsed_seconds + (Date.now() / 1000 - new Date(clock.started_at).getTime() / 1000)
        : clock.elapsed_seconds
      // Pre-fire bell if we loaded mid-game past the 30s warning mark
      bellFiredRef.current = initialElapsed >= 420
    }
  }, [clock?.chukker])

  // Live ticker: updates every 200ms while clock is running
  useEffect(() => {
    if (clock?.status !== 'running') return
    const tick = () => {
      const now = Date.now() / 1000
      const startedAt = new Date(clock.started_at).getTime() / 1000
      const elapsed = clock.elapsed_seconds + (now - startedAt)
      setLiveElapsed(elapsed)
      const remaining = 450 - elapsed
      if (remaining <= 30 && remaining > 0 && !bellFiredRef.current) {
        bellFiredRef.current = true
        ringBell()
      }
    }
    tick()
    const id = setInterval(tick, 200)
    return () => clearInterval(id)
  }, [clock])

  const clockElapsed = clock?.status === 'running' ? liveElapsed : (clock?.elapsed_seconds ?? 0)
  const clockRemaining = 450 - clockElapsed
  const clockIsOvertime = clockRemaining < 0

  function formatClockTime(seconds: number): string {
    const abs = Math.abs(seconds)
    const m = Math.floor(abs / 60)
    const s = Math.floor(abs % 60)
    return `${m}:${s.toString().padStart(2, '0')}`
  }

  const homeGoals = goals.filter(g => g.team_id === match.team_home_id).length
  const awayGoals = goals.filter(g => g.team_id === match.team_away_id).length
  const homePending = goals.filter(g => g.team_id === match.team_home_id && !g.player_id).length
  const awayPending = goals.filter(g => g.team_id === match.team_away_id && !g.player_id).length
  const hasVoted = mvpVotes.some(v => v.device_id === deviceId) || localStorage.getItem(`voted_match_${match.id}`) === 'true'

  // Sumar gol sin asignar jugador
  async function addGoalNoPlayer(teamId: string) {
    if (saving) return
    setSaving(true)
    await supabase.from('goals').insert({ match_id: match.id, player_id: null, team_id: teamId, chukker })
    await supabase.from('matches').update({ status: 'live', chukker_current: chukker }).eq('id', match.id)
    await loadData()
    setSaving(false)
  }

  // Asignar jugador al gol pendiente más antiguo del equipo
  async function assignPlayer(playerId: string, teamId: string) {
    const pending = goals
      .filter(g => g.team_id === teamId && !g.player_id)
      .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
    if (pending.length === 0) return
    await supabase.from('goals').update({ player_id: playerId }).eq('id', pending[0].id)
    await loadData()
  }

  // Reasignar jugador a un gol específico (para edición)
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

  async function setOfficialMvp(playerId: string) {
    await supabase.from('mvp_official').upsert({ match_id: match.id, player_id: playerId })
    await loadData()
  }

  async function startClock(chukkerNum: number) {
    console.log('[Clock] startClock, chukkerNum=', chukkerNum, 'clock=', clock)
    const now = new Date().toISOString()
    bellFiredRef.current = false
    if (clock) {
      const { data, error } = await supabase.from('match_clock')
        .update({ chukker: chukkerNum, status: 'running', started_at: now, elapsed_seconds: 0, updated_at: now })
        .eq('id', clock.id)
        .select()
        .single()
      if (error) { console.error('[Clock] ERROR startClock update:', error); alert(`Error: ${error.message}`); return }
      console.log('[Clock] startClock update OK, data=', data)
      clockRef.current = data; setClock(data)
    } else {
      const { data, error } = await supabase.from('match_clock')
        .insert({ match_id: match.id, chukker: chukkerNum, status: 'running', started_at: now, elapsed_seconds: 0, updated_at: now })
        .select()
        .single()
      if (error) { console.error('[Clock] ERROR startClock insert:', error); alert(`Error: ${error.message}`); return }
      console.log('[Clock] startClock insert OK, data=', data)
      clockRef.current = data; setClock(data)
    }
    const { error: matchErr } = await supabase.from('matches').update({ status: 'live', chukker_current: chukkerNum }).eq('id', match.id)
    if (matchErr) console.error('[Clock] ERROR match update:', matchErr)
  }

  async function pauseClock() {
    console.log('[Clock] pauseClock CALLED, clock=', clock)
    if (!clock) { console.warn('[Clock] pauseClock abortado: clock es null'); return }
    if (!clock.id) { console.error('[Clock] pauseClock abortado: clock.id es undefined', clock); alert('Error: clock.id no existe'); return }
    console.log('[Clock] pauseClock, clock.id=', clock.id, 'started_at=', clock.started_at)
    const now = Date.now() / 1000
    const startedAt = new Date(clock.started_at).getTime() / 1000
    const currentElapsed = clock.elapsed_seconds + (now - startedAt)
    console.log('[Clock] pauseClock elapsed calculado=', currentElapsed)
    const { data, error } = await supabase.from('match_clock')
      .update({ status: 'paused', elapsed_seconds: currentElapsed, started_at: null, updated_at: new Date().toISOString() })
      .eq('id', clock.id)
      .select()
      .single()
    if (error) { console.error('[Clock] ERROR pauseClock:', error); alert(`Error al pausar: ${error.message} (code: ${error.code})`); return }
    console.log('[Clock] pauseClock OK, data=', data)
    clockRef.current = data; setClock(data)
  }

  async function resumeClock() {
    if (!clock) return
    console.log('[Clock] resumeClock, clock.id=', clock.id)
    const { data, error } = await supabase.from('match_clock')
      .update({ status: 'running', started_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq('id', clock.id)
      .select()
      .single()
    if (error) { console.error('[Clock] ERROR resumeClock:', error); return }
    console.log('[Clock] resumeClock OK, data=', data)
    clockRef.current = data; setClock(data)
  }

  async function stopClock() {
    console.log('[Clock] stopClock CALLED, clock=', clock)
    if (!clock) { console.warn('[Clock] stopClock abortado: clock es null'); return }
    if (!clock.id) { console.error('[Clock] stopClock abortado: clock.id es undefined', clock); alert('Error: clock.id no existe'); return }
    console.log('[Clock] stopClock, clock.id=', clock.id, 'status=', clock.status)
    const currentElapsed = clock.status === 'running'
      ? liveElapsed
      : clock.elapsed_seconds
    console.log('[Clock] stopClock elapsed calculado=', currentElapsed)
    const { data, error } = await supabase.from('match_clock')
      .update({ status: 'stopped', elapsed_seconds: currentElapsed, started_at: null, updated_at: new Date().toISOString() })
      .eq('id', clock.id)
      .select()
      .single()
    if (error) { console.error('[Clock] ERROR stopClock:', error); alert(`Error al finalizar chukker: ${error.message} (code: ${error.code})`); return }
    console.log('[Clock] stopClock OK, data=', data)
    clockRef.current = data; setClock(data)
  }

  function getMvpVoteCount(playerId: string) {
    return mvpVotes.filter(v => v.player_id === playerId).length
  }

  const gold = '#C9A84C'
  const goldLight = '#E8C96A'
  const darkBg = '#2A0A12'

  if (loading) return (
    <div style={{ minHeight: '100vh', background: '#3D0A1A', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
      <p style={{ color: gold, fontSize: 16, fontFamily: 'Georgia, serif' }}>Cargando...</p>
    </div>
  )

  const qrUrl = `${window.location.origin}/?match=${match.id}`

  // Clock display values for stopped state
  const stoppedRemaining = clock ? 450 - clock.elapsed_seconds : 0

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

      {/* Marcador — tappable para admin */}
      <div style={{ margin: '16px', borderRadius: 16, overflow: 'hidden', boxShadow: `0 0 0 2px ${gold}, 0 0 0 5px #8B6914, 0 8px 32px rgba(0,0,0,0.8)`, position: 'relative' as const }}>
        <div style={{ background: `linear-gradient(90deg, ${darkBg}, #8B6914, ${gold}, #8B6914, ${darkBg})`, height: 4 }} />
        <div style={{ background: canchMode ? '#000' : 'linear-gradient(160deg, #3d2810 0%, #2a1c0a 30%, #1e1408 60%, #2a1c0a 100%)', padding: '16px 16px 24px' }}>

          {/* Cronómetro — centrado encima del marcador, visible para todos */}
          <div style={{ textAlign: 'center', marginBottom: 16 }}>
            {clock ? (
              <>
                <div style={{ fontSize: 10, color: `${gold}aa`, letterSpacing: 3, fontFamily: 'Georgia, serif', marginBottom: 4, textTransform: 'uppercase' as const }}>
                  Chukker {clock.chukker}
                </div>
                <div style={{
                  fontSize: clock.status === 'stopped' ? 36 : 52,
                  fontWeight: 900, fontFamily: 'monospace', letterSpacing: 3,
                  color: clockIsOvertime ? '#ef4444' : clock.status === 'stopped' ? `${gold}cc` : '#fff',
                  textShadow: clockIsOvertime
                    ? '0 0 28px rgba(239,68,68,0.7)'
                    : clock.status === 'stopped'
                      ? 'none'
                      : '0 0 16px rgba(255,255,255,0.2)',
                  transition: 'color 0.3s, text-shadow 0.3s',
                  opacity: clock.status === 'stopped' ? 0.75 : 1,
                }}>
                  {clockIsOvertime ? '+' : ''}{formatClockTime(clock.status === 'stopped' ? stoppedRemaining : clockRemaining)}
                </div>
                <div style={{ fontSize: 10, color: clock.status === 'running' ? '#4ade80' : clock.status === 'paused' ? gold : '#555', marginTop: 4, letterSpacing: 2, fontFamily: 'Georgia, serif' }}>
                  {clock.status === 'running' ? '▶ EN JUEGO' : clock.status === 'paused' ? '⏸ PAUSADO' : '⏹ CHUKKER FINALIZADO'}
                </div>
              </>
            ) : (
              <div style={{ fontSize: 11, color: `${gold}55`, fontFamily: 'Georgia, serif', letterSpacing: 2, padding: '4px 0' }}>
                — LISTO PARA INICIAR —
              </div>
            )}
          </div>

          {/* Botón cronómetro dentro del recuadro — solo admin */}
          {isAdmin && match.status !== 'finished' && (
            <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginBottom: 16, flexWrap: 'wrap' as const }}>
              {/* Estado: sin reloj → Iniciar Chukker */}
              {!clock && (
                <button onClick={() => { console.log('[Clock] click Iniciar Chukker'); startClock(1) }}
                  style={{ background: 'linear-gradient(135deg, #0d3320, #166534)', border: '1px solid #4ade8066', borderRadius: 10, padding: '11px 28px', cursor: 'pointer', color: '#4ade80', fontWeight: 700, fontSize: 14, fontFamily: 'Georgia, serif', letterSpacing: 1, boxShadow: '0 2px 8px rgba(74,222,128,0.2)' }}>
                  Iniciar Chukker
                </button>
              )}
              {/* Estado: corriendo → Pausar / Finalizar Chukker (cuando llega a 0) */}
              {clock?.status === 'running' && (
                clockRemaining <= 0 ? (
                  <button onClick={stopClock}
                    style={{ background: 'linear-gradient(135deg, #3D1020, #5A0A20)', border: '1px solid #ef444466', borderRadius: 10, padding: '11px 28px', cursor: 'pointer', color: '#ef4444', fontWeight: 700, fontSize: 14, fontFamily: 'Georgia, serif', letterSpacing: 1, boxShadow: '0 2px 8px rgba(239,68,68,0.25)' }}>
                    Finalizar Chukker
                  </button>
                ) : (
                  <>
                    <button onClick={pauseClock}
                      style={{ background: 'linear-gradient(135deg, #1a1400, #2a2000)', border: `1px solid ${gold}66`, borderRadius: 10, padding: '11px 28px', cursor: 'pointer', color: gold, fontWeight: 700, fontSize: 14, fontFamily: 'Georgia, serif', letterSpacing: 1 }}>
                      Pausar
                    </button>
                    <button onClick={stopClock}
                      style={{ background: 'transparent', border: `1px solid ${gold}33`, borderRadius: 10, padding: '11px 20px', cursor: 'pointer', color: `${gold}88`, fontWeight: 700, fontSize: 13, fontFamily: 'Georgia, serif', letterSpacing: 1 }}>
                      Finalizar Chukker
                    </button>
                  </>
                )
              )}
              {/* Estado: pausado → Reanudar / Finalizar */}
              {clock?.status === 'paused' && (
                <>
                  <button onClick={resumeClock}
                    style={{ background: 'linear-gradient(135deg, #0d3320, #166534)', border: '1px solid #4ade8066', borderRadius: 10, padding: '11px 28px', cursor: 'pointer', color: '#4ade80', fontWeight: 700, fontSize: 14, fontFamily: 'Georgia, serif', letterSpacing: 1 }}>
                    Reanudar
                  </button>
                  <button onClick={stopClock}
                    style={{ background: 'transparent', border: `1px solid ${gold}33`, borderRadius: 10, padding: '11px 20px', cursor: 'pointer', color: `${gold}88`, fontWeight: 700, fontSize: 13, fontFamily: 'Georgia, serif', letterSpacing: 1 }}>
                    Finalizar Chukker
                  </button>
                </>
              )}
              {/* Estado: detenido → Iniciar siguiente chukker */}
              {clock?.status === 'stopped' && (
                <button onClick={() => startClock(clock.chukker + 1)}
                  style={{ background: 'linear-gradient(135deg, #0d3320, #166534)', border: '1px solid #4ade8066', borderRadius: 10, padding: '11px 28px', cursor: 'pointer', color: '#4ade80', fontWeight: 700, fontSize: 14, fontFamily: 'Georgia, serif', letterSpacing: 1, boxShadow: '0 2px 8px rgba(74,222,128,0.2)' }}>
                  Iniciar Chukker {clock.chukker + 1}
                </button>
              )}
            </div>
          )}

          {/* Separador */}
          <div style={{ height: 1, background: `linear-gradient(90deg, transparent, ${gold}33, transparent)`, marginBottom: 16 }} />

          <div style={{ display: 'flex', alignItems: 'center' }}>

            {/* Equipo local */}
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
              <Avatar url={match.team_home?.logo_url} name={match.team_home?.name ?? '?'} size={52} />
              <p style={{ fontSize: 14, fontWeight: 700, color: canchMode ? '#FFE000' : gold, margin: 0, textAlign: 'center' as const, fontFamily: 'Georgia, serif', letterSpacing: 1 }}>{match.team_home?.name}</p>
              <p style={{ color: '#888', fontSize: 11, margin: 0 }}>H: {match.team_home?.handicap ?? 0}</p>
              <FlapScore
                score={homeGoals}
                highlight={canchMode}
                isAdmin={isAdmin && match.status !== 'finished'}
                onTap={() => addGoalNoPlayer(match.team_home_id)}
                pendingCount={homePending}
              />
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
              <FlapScore
                score={awayGoals}
                highlight={canchMode}
                isAdmin={isAdmin && match.status !== 'finished'}
                onTap={() => addGoalNoPlayer(match.team_away_id)}
                pendingCount={awayPending}
              />
            </div>
          </div>
        </div>
        <div style={{ background: `linear-gradient(90deg, ${darkBg}, #8B6914, ${gold}, #8B6914, ${darkBg})`, height: 4 }} />
      </div>

      {/* Panel asignación de jugadores — solo admin, solo partido en vivo */}
      {isAdmin && match.status !== 'finished' && (
        <div style={{ padding: '0 16px 16px' }}>
          <p style={{ color: goldLight, fontSize: 12, fontWeight: 700, letterSpacing: 2, marginBottom: 4, marginTop: 8, textAlign: 'center' as const, fontFamily: 'Georgia, serif' }}>ASIGNAR GOL</p>
          <p style={{ color: '#d4a0b0', fontSize: 11, textAlign: 'center' as const, marginBottom: 12 }}>Tocá el marcador para sumar un gol · Tocá un jugador para asignarlo</p>

          {/* Chukker */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16, justifyContent: 'center' }}>
            <span style={{ color: gold, fontSize: 14, fontFamily: 'Georgia, serif' }}>Chukker:</span>
            <input style={{ background: '#2A0A12', border: `1px solid ${gold}`, borderRadius: 8, padding: '8px 12px', color: gold, fontSize: 15, width: 60, textAlign: 'center' as const, fontFamily: 'Georgia, serif', fontWeight: 700 }}
              type="number" min={1} max={tournament.chukkers_per_match} value={chukker} onChange={e => setChukker(Number(e.target.value))} />
          </div>

          {/* Jugadores */}
          <div style={{ display: 'flex', gap: 8 }}>
            <div style={{ flex: 1 }}>
              <p style={{ color: homePending > 0 ? '#fb923c' : gold, fontWeight: 700, fontSize: 13, marginBottom: 8, textAlign: 'center' as const, fontFamily: 'Georgia, serif', letterSpacing: 1 }}>
                {match.team_home?.name}{homePending > 0 ? ` (${homePending} ⚡)` : ''}
              </p>
              {players.filter(p => p.team_id === match.team_home_id).map(player => (
                <button key={player.id} disabled={saving}
                  onClick={() => assignPlayer(player.id, match.team_home_id)}
                  style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', marginBottom: 6, background: homePending > 0 ? 'linear-gradient(135deg, #1a0a00 0%, #2a1800 100%)' : 'linear-gradient(135deg, #1a0808 0%, #2a1010 100%)', border: `1px solid ${homePending > 0 ? '#fb923c88' : gold + '88'}`, borderRadius: 10, padding: '10px 12px', cursor: homePending > 0 ? 'pointer' : 'default', color: '#fff', fontSize: 13, textAlign: 'left' as const, opacity: homePending > 0 ? 1 : 0.5 }}>
                  <Avatar url={player.photo_url} name={player.name} size={32} />
                  <span style={{ fontFamily: 'Georgia, serif' }}>{player.name}</span>
                </button>
              ))}
            </div>
            <div style={{ width: 1, background: `linear-gradient(180deg, transparent, ${gold}44, transparent)` }} />
            <div style={{ flex: 1 }}>
              <p style={{ color: awayPending > 0 ? '#fb923c' : gold, fontWeight: 700, fontSize: 13, marginBottom: 8, textAlign: 'center' as const, fontFamily: 'Georgia, serif', letterSpacing: 1 }}>
                {match.team_away?.name}{awayPending > 0 ? ` (${awayPending} ⚡)` : ''}
              </p>
              {players.filter(p => p.team_id === match.team_away_id).map(player => (
                <button key={player.id} disabled={saving}
                  onClick={() => assignPlayer(player.id, match.team_away_id)}
                  style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', marginBottom: 6, background: awayPending > 0 ? 'linear-gradient(135deg, #1a0a00 0%, #2a1800 100%)' : 'linear-gradient(135deg, #1a0808 0%, #2a1010 100%)', border: `1px solid ${awayPending > 0 ? '#fb923c88' : gold + '88'}`, borderRadius: 10, padding: '10px 12px', cursor: awayPending > 0 ? 'pointer' : 'default', color: '#fff', fontSize: 13, textAlign: 'left' as const, opacity: awayPending > 0 ? 1 : 0.5 }}>
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
              <div key={g.id}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', borderBottom: `1px solid ${gold}22` }}>
                  <span style={{ color: gold, fontSize: 12, fontFamily: 'Georgia, serif', minWidth: 60 }}>#{i + 1} Ch.{g.chukker}</span>
                  <span style={{ fontWeight: 600, fontFamily: 'Georgia, serif', flex: 1, textAlign: 'center' as const, color: g.player_id ? '#fff' : '#fb923c' }}>
                    {g.player?.name ?? '⚡ Sin asignar'}
                  </span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 80, justifyContent: 'flex-end' }}>
                    <span style={{ color: '#d4a0b0', fontSize: 11 }}>{g.team_id === match.team_home_id ? match.team_home?.name : match.team_away?.name}</span>
                    {isAdmin && (
                      <button onClick={() => setEditingGoalId(editingGoalId === g.id ? null : g.id)}
                        style={{ background: 'none', border: `1px solid ${gold}44`, borderRadius: 6, padding: '2px 8px', color: gold, cursor: 'pointer', fontSize: 11 }}>
                        ✏️
                      </button>
                    )}
                  </div>
                </div>

                {/* Panel de reasignación inline */}
                {editingGoalId === g.id && isAdmin && (
                  <div style={{ background: '#1a0808', padding: '10px 14px', borderBottom: `1px solid ${gold}22` }}>
                    <p style={{ color: gold, fontSize: 11, margin: '0 0 8px', fontFamily: 'Georgia, serif' }}>Reasignar a:</p>
                    <div style={{ display: 'flex', flexWrap: 'wrap' as const, gap: 6 }}>
                      {players.filter(p => p.team_id === g.team_id).map(player => (
                        <button key={player.id}
                          onClick={() => reassignGoal(g.id, player.id)}
                          style={{ background: g.player_id === player.id ? gold : '#2A0A12', border: `1px solid ${gold}88`, borderRadius: 8, padding: '6px 12px', cursor: 'pointer', color: g.player_id === player.id ? '#4A0B1E' : '#fff', fontSize: 12, fontFamily: 'Georgia, serif', fontWeight: g.player_id === player.id ? 700 : 400 }}>
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
