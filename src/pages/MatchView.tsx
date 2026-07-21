import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { knockoutRoundLabel } from '../lib/knockout'
import { teamResultStyle, penaltyScoreLabel } from '../lib/matchResult'
import { QRCodeSVG } from 'qrcode.react'
import { Hand, PartyPopper, MicVocal, Radio } from 'lucide-react'
import Daily from '@daily-co/daily-js'
import { Avatar } from '../components/Avatar'
import PlayerCard from './PlayerCard'

const COUNTDOWN_SECONDS = 9
const COUNTDOWN_FADE_SECONDS = 0.5

const orbitronLink = document.createElement('link')
orbitronLink.rel = 'stylesheet'
orbitronLink.href = 'https://fonts.googleapis.com/css2?family=Orbitron:wght@700;900&display=swap'
document.head.appendChild(orbitronLink)

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
          fontSize: 'clamp(40px, 12vw, 72px)',
          fontWeight: 900,
          color,
          textShadow: `0 0 8px ${glow}, 0 0 20px ${glow}, 0 0 50px ${glow}`,
          letterSpacing: 4,
          lineHeight: 1,
          padding: '8px 10px',
          borderRadius: 12,
          background: 'rgba(0,0,0,0.5)',
          border: `2px solid ${color}44`,
          minWidth: 0,
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
  const [overtimeMinutesInput, setOvertimeMinutesInput] = useState(15)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [showQR, setShowQR] = useState(false)
  const [soundOn, setSoundOn] = useState(true)
  const [editingGoalId, setEditingGoalId] = useState<string | null>(null)
  const [cards, setCards] = useState<any[]>([])
  const [showCardPanel, setShowCardPanel] = useState(false)
  const [substitutions, setSubstitutions] = useState<any[]>([])
  const [showSubPanel, setShowSubPanel] = useState(false)
  const [subTeamId, setSubTeamId] = useState<string | null>(null)
  const [subOutId, setSubOutId] = useState<string | null>(null)
  const [lineups, setLineups] = useState<any[]>([])
  const [showLineupPanel, setShowLineupPanel] = useState(false)
  const [starterIds, setStarterIds] = useState<Set<string>>(new Set())
  const [liveMatchFields, setLiveMatchFields] = useState<any>(match)
  const [shotBusy, setShotBusy] = useState(false)
  const soundOnRef = useRef(true)

  const [micOn, setMicOn] = useState(false)
  // true cuando Daily confirmó el acceso local al hardware pero no confirmó que el audio se esté enviando — no se solapa con dailyStatus porque no implica que la radio/recepción también esté rota.
  const [micConfirmError, setMicConfirmError] = useState(false)
  // Arranca muteado: todavía no hay conexión a Daily.co hasta que alguien
  // toque mic (admin) o radio (espectador).
  const [narrationMuted, setNarrationMuted] = useState(true)
  // El navegador bloqueó el autoplay del audio remoto — hace falta un gesto real del usuario (tocar un botón) para reintentarlo.
  const [narrationBlocked, setNarrationBlocked] = useState(false)
  const [dailyStatus, setDailyStatus] = useState<'idle' | 'connecting' | 'connected' | 'error'>('idle')
  const [dailyError, setDailyError] = useState<string | null>(null)
  const dailyCallRef = useRef<any>(null)
  const dailyConnectPromiseRef = useRef<Promise<any | null> | null>(null)
  const dailyIntentionalLeaveRef = useRef(false)
  const micRequestedRef = useRef(false)
  const narrationMutedRef = useRef(true)
  const remoteAudioElsRef = useRef<HTMLAudioElement[]>([])

  const [clock, setClock] = useState<any | null>(null)
  const clockRef = useRef<any | null>(null)
  const [liveElapsed, setLiveElapsed] = useState(0)
  const bellFiredRef = useRef(false)
  const whistleRef = useRef<HTMLAudioElement | null>(null)
  const crowdRef = useRef<HTMLAudioElement | null>(null)
  const applauseRef = useRef<HTMLAudioElement | null>(null)
  const channelRef = useRef<any>(null)
  const [realtimeStatus, setRealtimeStatus] = useState<'connecting' | 'connected' | 'error'>('connecting')

  const periodSeconds = (tournament.chukker_duration_minutes ?? 45) * 60
  const totalPeriods = tournament.periods_per_match ?? 2
  const isKnockoutMatch = match.stage !== 'group'
  // Una vez que se arrancó algún período extra (chukker > totalPeriods), queda
  // desbloqueado permanentemente para este partido — se deriva del propio clock,
  // sin columna nueva.
  const extraTimeUnlocked = !!clock && clock.chukker > totalPeriods
  const effectiveTotalPeriods = extraTimeUnlocked ? totalPeriods + 2 : totalPeriods

  const displayMatch = { ...match, ...liveMatchFields }
  const DEFAULT_OVERTIME_MINUTES = 15
  const overtimeSeconds = (displayMatch.overtime_duration_minutes ?? DEFAULT_OVERTIME_MINUTES) * 60

  // Los períodos reglamentarios usan periodSeconds (config del torneo); los de
  // tiempo extra (periodNum > totalPeriods) usan la duración elegida puntualmente
  // para este partido — otSecondsOverride sirve para el instante exacto en que se
  // arranca el primer tiempo extra, cuando el estado todavía no reflejó el valor
  // recién guardado en la base.
  function getPeriodSeconds(periodNum: number, otSecondsOverride?: number): number {
    return periodNum > totalPeriods ? (otSecondsOverride ?? overtimeSeconds) : periodSeconds
  }

  function getBaseSeconds(periodNum: number, otSecondsOverride?: number): number {
    let base = 0
    for (let p = 1; p < periodNum; p++) base += getPeriodSeconds(p, otSecondsOverride)
    return base
  }

  function currentSequence(team: 'home' | 'away'): boolean[] {
    return (team === 'home' ? displayMatch.penalty_home_sequence : displayMatch.penalty_away_sequence) ?? []
  }

  const shootoutActive = displayMatch.status !== 'finished'
    && (displayMatch.penalty_home_sequence != null || displayMatch.penalty_away_sequence != null)

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
    const c = new Audio('/Goal.mp3')
    c.volume = 0.7
    c.preload = 'auto'
    crowdRef.current = c
    const a = new Audio('/Aplausos.wav')
    a.volume = 0.7
    a.preload = 'auto'
    applauseRef.current = a
  }, [])

  function playTriggeredSound(sound: 'whistle' | 'applause' | 'crowd') {
    if (!soundOnRef.current) return
    const ref = sound === 'whistle' ? whistleRef : sound === 'applause' ? applauseRef : crowdRef
    if (!ref.current) return
    try { ref.current.currentTime = 0; ref.current.play().catch(() => {}) } catch (e) {}
  }

  function triggerSound(sound: 'whistle' | 'applause' | 'crowd') {
    channelRef.current?.send({ type: 'broadcast', event: 'play_sound', payload: { sound } })
  }

  function ringBell() {
    if (!soundOnRef.current) return
    try {
      if (whistleRef.current) { whistleRef.current.currentTime = 0; whistleRef.current.play().catch(() => {}) }
    } catch (e) {}
  }

  async function loadClock() {
    const { data, error } = await supabase.from('match_clock').select('*').eq('match_id', match.id).eq('app', 'futbol').maybeSingle()
    if (error) return
    clockRef.current = data
    setClock(data)
    if (data) setPeriod(data.chukker)
  }

  async function loadMatchRow() {
    const { data, error } = await supabase.from('matches').select('*').eq('id', match.id).single()
    if (error || !data) return
    setLiveMatchFields((prev: any) => ({ ...prev, ...data }))
  }

  useEffect(() => {
    loadData()
    loadClock()
    loadMatchRow()

    let cancelled = false
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null

    // Reconecta el canal si se cae (CHANNEL_ERROR/TIMED_OUT/CLOSED) — sin
    // esto, un corte de red o un restart de Supabase (como el pause del
    // free tier) deja goles/tarjetas/sonido sin llegar en vivo hasta que
    // el usuario sale y vuelve a entrar a la pantalla.
    function subscribeToMatchChannel() {
      setRealtimeStatus('connecting')
      const channel = supabase
        .channel(`match-${match.id}`, { config: { broadcast: { self: true } } })
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'goals', filter: `match_id=eq.${match.id}` }, () => loadData())
        .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'goals', filter: `match_id=eq.${match.id}` }, () => loadData())
        .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'goals', filter: `match_id=eq.${match.id}` }, () => loadData())
        .on('postgres_changes', { event: '*', schema: 'public', table: 'mvp_votes', filter: `match_id=eq.${match.id}` }, () => loadData())
        .on('postgres_changes', { event: '*', schema: 'public', table: 'mvp_official', filter: `match_id=eq.${match.id}` }, () => loadData())
        .on('postgres_changes', { event: '*', schema: 'public', table: 'match_clock', filter: `match_id=eq.${match.id}` }, () => loadClock())
        .on('postgres_changes', { event: '*', schema: 'public', table: 'cards', filter: `match_id=eq.${match.id}` }, () => loadData())
        .on('postgres_changes', { event: '*', schema: 'public', table: 'substitutions', filter: `match_id=eq.${match.id}` }, () => loadData())
        .on('postgres_changes', { event: '*', schema: 'public', table: 'match_lineups', filter: `match_id=eq.${match.id}` }, () => loadData())
        .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'matches', filter: `id=eq.${match.id}` }, () => loadMatchRow())
        .on('broadcast', { event: 'play_sound' }, ({ payload }) => playTriggeredSound(payload.sound))
        .subscribe((status) => {
          if (cancelled) return
          if (status === 'SUBSCRIBED') {
            setRealtimeStatus('connected')
            loadData(true)
            loadClock()
            loadMatchRow()
          } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
            setRealtimeStatus('error')
            supabase.removeChannel(channel)
            reconnectTimer = setTimeout(() => { if (!cancelled) subscribeToMatchChannel() }, 3000)
          }
        })
      channelRef.current = channel
    }

    subscribeToMatchChannel()

    return () => {
      cancelled = true
      if (reconnectTimer) clearTimeout(reconnectTimer)
      if (channelRef.current) supabase.removeChannel(channelRef.current)
    }
  }, [match.id])

  // Relato en vivo (Daily.co): NO se conecta a la sala al abrir el partido.
  // La conexión es bajo demanda — recién se dispara cuando el admin toca
  // mic (para relatar) o un espectador toca radio (para escuchar). Si nadie
  // toca ninguno de los dos, no hay ningún intento de red hacia Daily.co.
  function attachRemoteAudio(event: any) {
    if (event.participant?.local) return
    if (event.track.kind !== 'audio') return
    const audioEl = document.createElement('audio')
    audioEl.autoplay = true
    audioEl.muted = narrationMutedRef.current
    audioEl.srcObject = new MediaStream([event.track])
    // Sin esto el autoplay queda librado a cada navegador — colgado del DOM, oculto, es lo que hace que reproduzca de forma confiable (sobre todo en mobile).
    audioEl.style.display = 'none'
    document.body.appendChild(audioEl)
    // El atributo autoplay no siempre alcanza (Safari/iOS puede bloquearlo silenciosamente) — con el .play() explícito nos enteramos si lo bloqueó y podemos ofrecer un botón para reintentar con un gesto real del usuario.
    audioEl.play().catch(() => setNarrationBlocked(true))
    remoteAudioElsRef.current.push(audioEl)
  }

  function retryNarrationPlayback() {
    remoteAudioElsRef.current.forEach(el => { el.play().catch(() => {}) })
    setNarrationBlocked(false)
  }

  // Se llama cuando la sala se cae DESPUES de haber conectado con éxito
  // (sala expirada del lado de Daily, corte de red, etc.) — no cuando
  // nosotros mismos cortamos la llamada al cerrar la pantalla, eso lo marca
  // dailyIntentionalLeaveRef para no mostrar un error de una salida a propósito.
  function handleDailyDisconnect() {
    if (dailyIntentionalLeaveRef.current) return
    const call = dailyCallRef.current
    if (call) call.destroy().catch(() => {})
    dailyCallRef.current = null
    micRequestedRef.current = false
    remoteAudioElsRef.current.forEach(el => { el.pause(); el.srcObject = null })
    remoteAudioElsRef.current = []
    narrationMutedRef.current = true
    setMicOn(false)
    setNarrationMuted(true)
    setDailyStatus('error')
    setDailyError('Se perdió la conexión al relato en vivo. Tocá de nuevo para reintentar.')
  }

  // Conecta a la sala (ya creada de forma lazy por la Edge Function) la
  // primera vez que se necesita, y reutiliza la misma conexión para mic y
  // radio. Deduplica llamadas concurrentes con dailyConnectPromiseRef.
  async function ensureDailyCall(): Promise<any | null> {
    if (dailyCallRef.current) {
      // No confío en el objeto cacheado solo porque existe: la sala pudo expulsarlo (eject_at_room_exp) sin disparar 'error'/'left-meeting'.
      if (dailyCallRef.current.meetingState?.() === 'joined-meeting') return dailyCallRef.current
      dailyCallRef.current.destroy().catch(() => {})
      dailyCallRef.current = null
      micRequestedRef.current = false
    }
    if (dailyConnectPromiseRef.current) return dailyConnectPromiseRef.current
    setDailyStatus('connecting')
    setDailyError(null)
    const promise = (async () => {
      try {
        const { data, error } = await supabase.functions.invoke('daily-room', {
          body: { match_id: match.id, action: 'get-or-create' },
        })
        if (error || !data?.url) throw new Error('No se pudo acceder a la sala de relato')
        const call = Daily.createCallObject()
        call.on('track-started', attachRemoteAudio)
        call.on('error', handleDailyDisconnect)
        call.on('left-meeting', handleDailyDisconnect)
        await call.join({ url: data.url, videoSource: false, audioSource: false })
        dailyIntentionalLeaveRef.current = false
        dailyCallRef.current = call
        setDailyStatus('connected')
        return call
      } catch (e) {
        setDailyStatus('error')
        setDailyError('No se pudo conectar al relato en vivo. Tocá de nuevo para reintentar.')
        return null
      } finally {
        dailyConnectPromiseRef.current = null
      }
    })()
    dailyConnectPromiseRef.current = promise
    return promise
  }

  useEffect(() => {
    return () => {
      remoteAudioElsRef.current.forEach(el => { el.pause(); el.srcObject = null; el.remove() })
      remoteAudioElsRef.current = []
      const call = dailyCallRef.current
      if (call) {
        dailyIntentionalLeaveRef.current = true
        call.leave().catch(() => {}); call.destroy().catch(() => {})
      }
      dailyCallRef.current = null
      dailyConnectPromiseRef.current = null
      micRequestedRef.current = false
    }
  }, [match.id])

  // tracks.audio.state === 'playable' del lado local solo confirma que Daily pudo capturar el hardware — según la doc de Daily, NO garantiza que el track se haya publicado a la sala. audioSendBitsPerSecond > 0 en getNetworkStats() sí mide bits salientes reales sobre la conexión, así que es la señal que efectivamente prueba que el audio está saliendo.
  async function waitForAudioActuallySending(call: any, timeoutMs = 8000): Promise<boolean> {
    const start = Date.now()
    while (Date.now() - start < timeoutMs) {
      try {
        const netStats = await call.getNetworkStats()
        const bps = netStats?.stats?.latest?.audioSendBitsPerSecond
        if (typeof bps === 'number' && bps > 0) return true
      } catch (e) { /* seguimos reintentando hasta el timeout */ }
      await new Promise(resolve => setTimeout(resolve, 1000))
    }
    return false
  }

  async function toggleMic() {
    if (micOn) {
      dailyCallRef.current?.setLocalAudio(false)
      setMicOn(false)
      return
    }
    const call = await ensureDailyCall()
    if (!call) return
    setMicConfirmError(false)
    try {
      if (!micRequestedRef.current) {
        await call.setInputDevicesAsync({ audioSource: true })
        micRequestedRef.current = true
      } else {
        call.setLocalAudio(true)
      }
      const confirmed = await waitForAudioActuallySending(call)
      if (confirmed) {
        setMicOn(true)
      } else {
        call.setLocalAudio(false)
        setMicOn(false)
        setMicConfirmError(true)
      }
    } catch (e) {
      setDailyStatus('error')
      setDailyError('No se pudo activar el micrófono. Revisá el permiso del navegador.')
    }
  }

  async function toggleNarrationMuted() {
    if (!narrationMuted) {
      narrationMutedRef.current = true
      remoteAudioElsRef.current.forEach((el) => { el.muted = true })
      setNarrationMuted(true)
      setNarrationBlocked(false)
      return
    }
    const call = await ensureDailyCall()
    if (!call) return
    narrationMutedRef.current = false
    remoteAudioElsRef.current.forEach((el) => { el.muted = false })
    setNarrationMuted(false)
  }

  async function closeDailyRoom() {
    try {
      await supabase.functions.invoke('daily-room', { body: { match_id: match.id, action: 'close' } })
    } catch (e) {
      // No bloquea el cierre del partido si esto falla.
    }
  }

  async function loadData(silent = false) {
    if (!silent) setLoading(true)
    const [g, p, v, m, c, s, l] = await Promise.all([
      supabase.from('goals').select('*, player:players(*)').eq('match_id', match.id).eq('app', 'futbol').order('created_at'),
      supabase.from('players').select('*').in('team_id', [match.team_home_id, match.team_away_id]).eq('app', 'futbol'),
      supabase.from('mvp_votes').select('id, player_id, device_id, player:players(*)').eq('match_id', match.id).eq('app', 'futbol'),
      supabase.from('mvp_official').select('*, player:players(*)').eq('match_id', match.id).eq('app', 'futbol').single(),
      supabase.from('cards').select('*, player:players(*)').eq('match_id', match.id).eq('app', 'futbol').order('created_at'),
      supabase.from('substitutions').select('*, player_out:players!player_out_id(*), player_in:players!player_in_id(*)').eq('match_id', match.id).eq('app', 'futbol').order('created_at'),
      supabase.from('match_lineups').select('*').eq('match_id', match.id).eq('app', 'futbol'),
    ])
    setGoals(g.data ?? [])
    setPlayers(p.data ?? [])
    setMvpVotes(v.data ?? [])
    setMvpOfficial(m.data)
    setCards(c.data ?? [])
    setSubstitutions(s.data ?? [])
    setLineups(l.data ?? [])
    setStarterIds(new Set((l.data ?? []).map((row: any) => row.player_id)))
    if (!silent) setLoading(false)
  }

  // Respaldo del Realtime: el canal puede reportar SUBSCRIBED de inmediato aunque el tenant todavía esté "en frío" (recién reactivado tras estar sin suscriptores) y tarde en empezar a transmitir postgres_changes de verdad. Corre siempre mientras la pantalla está montada, sin importar el estado del partido — un espectador puede entrar antes de que arranque o quedarse mirando después de que termine.
  useEffect(() => {
    const interval = setInterval(() => {
      loadData(true)
      loadMatchRow()
      loadClock()
    }, 6000)
    return () => clearInterval(interval)
  }, [match.id])

  useEffect(() => {
    if (clock?.status !== 'running') return
    const tick = () => {
      const now = Date.now() / 1000
      const startedAt = new Date(clock.started_at).getTime() / 1000
      const elapsed = clock.elapsed_seconds + (now - startedAt)
      setLiveElapsed(elapsed)
      const periodLimit = getBaseSeconds(clock.chukker) + getPeriodSeconds(clock.chukker)
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
  const currentPeriodLimit = clock ? getBaseSeconds(clock.chukker) + getPeriodSeconds(clock.chukker) : periodSeconds
  const clockIsOvertime = clockElapsed >= currentPeriodLimit

  const isKickoffCountdown = !!clock && clock.chukker === 1 && clock.status === 'running' && clockElapsed < COUNTDOWN_FADE_SECONDS
  const countdownNumber = isKickoffCountdown ? Math.max(0, COUNTDOWN_SECONDS - Math.floor(COUNTDOWN_SECONDS + clockElapsed)) : null
  const countdownEnded = isKickoffCountdown && clockElapsed >= 0

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
  // Terminó el último período reglamentario, sigue empatado, y todavía no se jugó
  // tiempo extra ni se habilitaron los penales: hay que ofrecer el tiempo extra.
  const regulationJustEndedTied = isKnockoutMatch
    && !shootoutActive
    && !extraTimeUnlocked
    && clock?.status === 'stopped'
    && clock.chukker === totalPeriods
    && homeGoals === awayGoals
  const homePending = goals.filter(g => g.team_id === match.team_home_id && !g.player_id).length
  const awayPending = goals.filter(g => g.team_id === match.team_away_id && !g.player_id).length
  const hasVoted = mvpVotes.some(v => v.device_id === deviceId) || localStorage.getItem(`voted_match_${match.id}`) === 'true'

  const timelineEvents = [
    ...goals.map(g => ({ kind: 'goal' as const, id: g.id, created_at: g.created_at, item: g })),
    ...cards.map(c => ({ kind: 'card' as const, id: c.id, created_at: c.created_at, item: c })),
    ...substitutions.map(s => ({ kind: 'sub' as const, id: s.id, created_at: s.created_at, item: s })),
  ].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())

  async function addGoalNoPlayer(teamId: string) {
    if (saving) return
    if (!clock || clock.status !== 'running') {
      alert('Iniciá el cronómetro antes de registrar un gol.')
      return
    }
    setSaving(true)
    const minute = Math.max(0, Math.floor(clockElapsed / 60))
    const { error } = await supabase.from('goals').insert({ match_id: match.id, player_id: null, team_id: teamId, chukker: period, minute, app: 'futbol' })
    if (error) { alert(`Error al registrar gol: ${error.message}`); setSaving(false); return }
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

  async function goToPenalties() {
    const { data, error } = await supabase.from('matches')
      .update({ penalty_home_sequence: [], penalty_away_sequence: [] })
      .eq('id', match.id).select().single()
    if (!error && data) setLiveMatchFields((prev: any) => ({ ...prev, ...data }))
  }

  async function finishMatch() {
    const isKnockout = match.stage !== 'group'
    if (isKnockout && homeGoals === awayGoals) {
      await goToPenalties()
      return
    }
    // El reloj se frena siempre al finalizar, hayan tocado "Finalizar tiempo" antes o no.
    await stopClock()
    const winnerId = isKnockout
      ? (homeGoals > awayGoals ? match.team_home_id : match.team_away_id)
      : null
    await supabase.from('matches').update({
      status: 'finished',
      played_at: new Date().toISOString(),
      home_score: homeGoals,
      away_score: awayGoals,
      winner_id: winnerId,
    }).eq('id', match.id)
    closeDailyRoom()
    onBack()
  }

  // Acepta el empate como resultado final — a diferencia de finishMatch(), acá
  // el llamador ya sabe que el marcador va a quedar empatado a propósito (el
  // admin lo elige tras el tiempo reglamentario o durante el tiempo extra), así
  // que no redirige a penales: cierra el partido sin winner_id. Esa llave del
  // bracket queda sin resolver hasta que se cargue un resultado corregido.
  async function finishMatchAsDraw() {
    await stopClock()
    await supabase.from('matches').update({
      status: 'finished',
      played_at: new Date().toISOString(),
      home_score: homeGoals,
      away_score: awayGoals,
      winner_id: null,
    }).eq('id', match.id)
    closeDailyRoom()
    onBack()
  }

  async function recordShot(team: 'home' | 'away', scored: boolean) {
    if (shotBusy) return
    const seq = currentSequence(team)
    if (seq.length >= 5) return
    setShotBusy(true)
    const next = [...seq, scored]
    const column = team === 'home' ? 'penalty_home_sequence' : 'penalty_away_sequence'
    const { data, error } = await supabase.from('matches').update({ [column]: next }).eq('id', match.id).select().single()
    if (!error && data) setLiveMatchFields((prev: any) => ({ ...prev, ...data }))
    setShotBusy(false)
  }

  async function undoShot(team: 'home' | 'away') {
    if (shotBusy) return
    const seq = currentSequence(team)
    if (seq.length === 0) return
    setShotBusy(true)
    const next = seq.slice(0, -1)
    const column = team === 'home' ? 'penalty_home_sequence' : 'penalty_away_sequence'
    const { data, error } = await supabase.from('matches').update({ [column]: next }).eq('id', match.id).select().single()
    if (!error && data) setLiveMatchFields((prev: any) => ({ ...prev, ...data }))
    setShotBusy(false)
  }

  async function cancelPenalties() {
    const { data, error } = await supabase.from('matches')
      .update({ penalty_home_sequence: null, penalty_away_sequence: null })
      .eq('id', match.id).select().single()
    if (!error && data) setLiveMatchFields((prev: any) => ({ ...prev, ...data }))
  }

  async function finishMatchWithPenalties() {
    const homeSeq = currentSequence('home')
    const awaySeq = currentSequence('away')
    const penaltyHome = homeSeq.filter(Boolean).length
    const penaltyAway = awaySeq.filter(Boolean).length
    if (penaltyHome === penaltyAway) {
      alert('Los penales no pueden terminar empatados — tiene que haber un ganador.')
      return
    }
    const winnerId = penaltyHome > penaltyAway ? match.team_home_id : match.team_away_id
    // El reloj se frena siempre al finalizar, hayan tocado "Finalizar tiempo" antes o no.
    await stopClock()
    await supabase.from('matches').update({
      status: 'finished',
      played_at: new Date().toISOString(),
      home_score: homeGoals,
      away_score: awayGoals,
      penalty_home_score: penaltyHome,
      penalty_away_score: penaltyAway,
      penalty_home_sequence: homeSeq,
      penalty_away_sequence: awaySeq,
      winner_id: winnerId,
    }).eq('id', match.id)
    closeDailyRoom()
    onBack()
  }

  async function votePlayer(playerId: string) {
    if (hasVoted) return
    await supabase.from('mvp_votes').insert({ match_id: match.id, player_id: playerId, device_id: deviceId, app: 'futbol' })
    localStorage.setItem(`voted_match_${match.id}`, 'true')
    await loadData()
  }
async function addCard(playerId: string, teamId: string, type: 'yellow' | 'red') {
    const playerYellows = cards.filter(c => c.player_id === playerId && c.type === 'yellow').length
    const isExpelled = cards.some(c => c.player_id === playerId && c.type === 'red')
    if (isExpelled || saving) return
    let finalType: 'yellow' | 'red' = type
    if (type === 'yellow' && playerYellows >= 1) {
      finalType = 'red'
    }
    setSaving(true)
    const minute = Math.max(0, Math.floor(clockElapsed / 60))
    const { error } = await supabase.from('cards').insert({
      match_id: match.id,
      player_id: playerId,
      team_id: teamId,
      type: finalType,
      period: period,
      minute,
      app: 'futbol',
    })
    if (error) { alert(`Error al registrar tarjeta: ${error.message}`); setSaving(false); return }
    await loadData()
    setSaving(false)
  }

  function toggleStarter(playerId: string) {
    setStarterIds(prev => {
      const next = new Set(prev)
      if (next.has(playerId)) next.delete(playerId); else next.add(playerId)
      return next
    })
  }

  async function saveLineups() {
    if (saving) return
    setSaving(true)
    await supabase.from('match_lineups').delete().eq('match_id', match.id).eq('app', 'futbol')
    const rows = Array.from(starterIds)
      .map(playerId => players.find(p => p.id === playerId))
      .filter((p): p is any => !!p)
      .map(p => ({ match_id: match.id, team_id: p.team_id, player_id: p.id, org_id: tournament.org_id ?? null, app: 'futbol' }))
    if (rows.length > 0) {
      const { error } = await supabase.from('match_lineups').insert(rows)
      if (error) { alert(`Error al guardar titulares: ${error.message}`); setSaving(false); return }
    }
    await loadData()
    setSaving(false)
  }

  // Jugadores "en cancha" para un equipo: arranca de los titulares cargados
  // (o del plantel completo si no se cargó lineup) y se recalcula aplicando
  // en orden cronológico cada cambio — así un jugador puede volver a entrar
  // después de haber salido, sin restricción.
  function onFieldIds(teamId: string): Set<string> {
    const teamPlayerIds = players.filter(p => p.team_id === teamId).map(p => p.id)
    const starters = lineups.filter(l => l.team_id === teamId).map(l => l.player_id)
    const onField = new Set(starters.length > 0 ? starters : teamPlayerIds)
    substitutions
      .filter(s => s.team_id === teamId)
      .forEach(s => { onField.delete(s.player_out_id); onField.add(s.player_in_id) })
    return onField
  }

  async function addSubstitution(teamId: string, outPlayerId: string, inPlayerId: string) {
    if (saving) return
    setSaving(true)
    const { error } = await supabase.from('substitutions').insert({
      match_id: match.id,
      team_id: teamId,
      player_out_id: outPlayerId,
      player_in_id: inPlayerId,
      period: period,
      org_id: tournament.org_id ?? null,
      app: 'futbol',
    })
    if (error) { alert(`Error al registrar cambio: ${error.message}`); setSaving(false); return }
    setSubTeamId(null)
    setSubOutId(null)
    await loadData()
    setSaving(false)
  }

  function isPlayerExpelled(playerId: string) {
    return cards.some(c => c.player_id === playerId && c.type === 'red')
  }

  function getPlayerYellows(playerId: string) {
    return cards.filter(c => c.player_id === playerId && c.type === 'yellow').length
  }
  async function setOfficialMvp(playerId: string) {
    await supabase.from('mvp_official').upsert({ match_id: match.id, player_id: playerId })
    await loadData()
  }

  // overtimeMinutesOverride: solo lo pasa startOvertime() al arrancar el
  // primer tiempo extra, para no depender de que el estado ya haya recargado
  // el overtime_duration_minutes recién guardado en la base.
  async function startClock(periodNum: number, overtimeMinutesOverride?: number) {
    const now = new Date().toISOString()
    bellFiredRef.current = false
    const otSecondsOverride = overtimeMinutesOverride != null ? overtimeMinutesOverride * 60 : undefined
    const baseSeconds = getBaseSeconds(periodNum, otSecondsOverride)
    const initialSeconds = periodNum === 1 ? baseSeconds - COUNTDOWN_SECONDS : baseSeconds
    if (clock) {
      const { data, error } = await supabase.from('match_clock')
        .update({ chukker: periodNum, status: 'running', started_at: now, elapsed_seconds: initialSeconds, updated_at: now })
        .eq('match_id', match.id).select().single()
      if (error) { alert(`Error: ${error.message}`); return }
      clockRef.current = data; setClock(data); setPeriod(periodNum)
    } else {
      const { data, error } = await supabase.from('match_clock')
        .insert({ match_id: match.id, chukker: periodNum, status: 'running', started_at: now, elapsed_seconds: initialSeconds, updated_at: now, app: 'futbol' })
        .select().single()
      if (error) { alert(`Error: ${error.message}`); return }
      clockRef.current = data; setClock(data); setPeriod(periodNum)
    }
    await supabase.from('matches').update({ status: 'live', chukker_current: periodNum }).eq('id', match.id)
  }

  // Guarda la duración elegida para el tiempo extra de este partido puntual
  // (no toca tournament.chukker_duration_minutes) y recién ahí arranca el reloj.
  async function startOvertime(minutes: number) {
    const mins = Math.max(1, Math.round(minutes) || DEFAULT_OVERTIME_MINUTES)
    const { data, error } = await supabase.from('matches')
      .update({ overtime_duration_minutes: mins }).eq('id', match.id).select().single()
    if (error) { alert(`Error: ${error.message}`); return }
    if (data) setLiveMatchFields((prev: any) => ({ ...prev, ...data }))
    await startClock(totalPeriods + 1, mins)
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

  function periodLabelFor(chukkerNum: number): string {
    if (chukkerNum <= totalPeriods) {
      return chukkerNum === 1 ? '1° TIEMPO' : chukkerNum === 2 ? '2° TIEMPO' : `TIEMPO ${chukkerNum}`
    }
    const extraIndex = chukkerNum - totalPeriods
    return extraIndex === 1 ? '1° TIEMPO EXTRA' : extraIndex === 2 ? '2° TIEMPO EXTRA' : `TIEMPO EXTRA ${extraIndex}`
  }

  const periodLabel = clock ? periodLabelFor(clock.chukker) : ''

  if (loading) return (
    <div style={{ minHeight: '100vh', background: '#0A3D1F', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
      <p style={{ color: gold, fontSize: 16, fontFamily: 'Georgia, serif' }}>Cargando...</p>
    </div>
  )

  // MatchView solo se renderiza dentro de TournamentView, que a su vez solo
  // vive en las rutas públicas /t/:slug o /:orgSlug — nunca bajo /admin — así
  // que el pathname actual ya es la ruta pública correcta a compartir.
  const qrUrl = `${window.location.origin}${window.location.pathname}?match=${match.id}`

  return (
    <div style={{
      minHeight: '100vh',
      background: `linear-gradient(rgba(0,0,0,0.55), rgba(0,0,0,0.55)), url('/grass.jpg') center center / cover`,
      color: '#fff',
    }}>

      {/* Cuenta regresiva de arranque — overlay en tiempo real para todos */}
      {isKickoffCountdown && (
        <div style={{
          position: 'fixed' as const, inset: 0, zIndex: 999,
          background: 'rgba(6,43,20,0.97)',
          display: 'flex', flexDirection: 'column' as const, alignItems: 'center', justifyContent: 'center',
          transition: 'opacity 0.4s ease, transform 0.4s ease',
          opacity: countdownEnded ? 0 : 1,
          transform: countdownEnded ? 'scale(1.1)' : 'scale(1)',
          pointerEvents: countdownEnded ? 'none' as const : 'auto' as const,
        }}>
          <p style={{ color: gold, fontSize: 16, fontWeight: 700, letterSpacing: 4, fontFamily: 'Georgia, serif', marginBottom: 16, textTransform: 'uppercase' as const, textShadow: '0 2px 8px rgba(0,0,0,0.8)' }}>
            Arranca el partido
          </p>
          <span
            key={countdownNumber}
            style={{
              fontFamily: "'Orbitron', monospace",
              fontSize: 'clamp(120px, 40vh, 320px)',
              fontWeight: 900,
              color: gold,
              textShadow: `0 0 40px rgba(201,168,76,0.6), 0 0 80px rgba(201,168,76,0.3)`,
              lineHeight: 1,
              animation: 'countdownPop 0.5s ease-out',
            }}
          >
            {countdownNumber}
          </span>
        </div>
      )}

      {/* Header */}
      <div style={{ background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(8px)', padding: '12px 16px', borderBottom: `1px solid ${gold}44` }}>
        <button onClick={onBack} style={{ background: 'none', border: 'none', color: '#a8d5b5', cursor: 'pointer', fontSize: 14, marginBottom: 8, padding: 0, fontFamily: 'Georgia, serif', letterSpacing: 1 }}>
          ← Volver al fixture
        </button>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ color: gold, fontSize: 12, fontFamily: 'Georgia, serif', letterSpacing: 2, textTransform: 'uppercase' as const }}>
            {match.stage === 'group' ? `Grupo ${match.group_name}` : knockoutRoundLabel(match, tournament.team_count)}
          </span>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' as const }}>
            <span style={{ fontSize: 11, padding: '3px 10px', borderRadius: 20, background: match.status === 'finished' ? '#166534' : match.status === 'live' ? '#dc2626' : '#334155', color: '#fff', fontWeight: 700, letterSpacing: 1 }}>
              {match.status === 'finished' ? 'Finalizado' : match.status === 'live' ? 'En vivo' : 'Pendiente'}
            </span>
            {realtimeStatus !== 'connected' && (
              <span title="Reconectando la sincronización en vivo…" style={{ width: 8, height: 8, borderRadius: '50%', background: '#fb923c', display: 'inline-block', flexShrink: 0 }} />
            )}
            {isAdmin && (
              <>
                <button onClick={() => triggerSound('applause')} title="Aplausos" style={{ background: 'rgba(0,0,0,0.5)', border: `1px solid ${gold}66`, borderRadius: 8, padding: '4px 10px', color: gold, cursor: 'pointer', display: 'flex', alignItems: 'center' }}>
                  <Hand size={15} />
                </button>
                <button
                  onClick={toggleMic}
                  title={micOn ? 'Dejar de relatar' : micConfirmError ? 'No se pudo confirmar que el micrófono esté saliendo en vivo (tocá para reintentar)' : dailyStatus === 'error' ? `${dailyError} (tocá para reintentar)` : dailyStatus === 'connecting' ? 'Conectando…' : 'Relatar en vivo'}
                  style={{
                    position: 'relative' as const,
                    background: micOn ? 'rgba(220,38,38,0.25)' : 'rgba(0,0,0,0.5)',
                    border: `1px solid ${micOn ? '#ef4444' : gold + '66'}`,
                    borderRadius: 8, padding: '4px 10px', color: micOn ? '#ef4444' : gold, cursor: 'pointer', display: 'flex', alignItems: 'center',
                    opacity: dailyStatus === 'connecting' ? 0.6 : 1,
                  }}
                >
                  <MicVocal size={15} />
                  {(dailyStatus === 'error' || micConfirmError) && !micOn && (
                    <span style={{ position: 'absolute' as const, top: -4, right: -4, background: '#ef4444', color: '#fff', borderRadius: '50%', width: 14, height: 14, fontSize: 10, lineHeight: '14px', textAlign: 'center' as const, fontWeight: 700 }}>!</span>
                  )}
                </button>
                <button onClick={() => triggerSound('whistle')} title="Silbato" style={{ background: 'rgba(0,0,0,0.5)', border: `1px solid ${gold}66`, borderRadius: 8, padding: '4px 10px', cursor: 'pointer', display: 'flex', alignItems: 'center' }}>
                  {/* silbato.png viene en celeste — se usa como máscara para pintarlo del mismo gold que el resto */}
                  <span role="img" aria-label="Silbato" style={{
                    width: 16, height: 16, display: 'inline-block',
                    backgroundColor: gold,
                    WebkitMaskImage: 'url(/icons/silbato.png)',
                    maskImage: 'url(/icons/silbato.png)',
                    WebkitMaskSize: 'contain',
                    maskSize: 'contain',
                    WebkitMaskRepeat: 'no-repeat',
                    maskRepeat: 'no-repeat',
                    WebkitMaskPosition: 'center',
                    maskPosition: 'center',
                  }} />
                </button>
                <button onClick={() => triggerSound('crowd')} title="Grito de gol" style={{ background: 'rgba(0,0,0,0.5)', border: `1px solid ${gold}66`, borderRadius: 8, padding: '4px 10px', color: gold, cursor: 'pointer', display: 'flex', alignItems: 'center' }}>
                  <PartyPopper size={15} />
                </button>
              </>
            )}
            <button
              onClick={toggleNarrationMuted}
              title={!narrationMuted ? 'Silenciar relato en vivo' : dailyStatus === 'error' ? `${dailyError} (tocá para reintentar)` : dailyStatus === 'connecting' ? 'Conectando…' : 'Escuchar relato en vivo'}
              style={{ position: 'relative' as const, background: 'rgba(0,0,0,0.5)', border: `1px solid ${gold}66`, borderRadius: 8, padding: '4px 10px', color: narrationMuted ? '#666' : gold, cursor: 'pointer', display: 'flex', alignItems: 'center', opacity: dailyStatus === 'connecting' ? 0.6 : 1 }}
            >
              <Radio size={15} />
              {dailyStatus === 'error' && narrationMuted && (
                <span style={{ position: 'absolute' as const, top: -4, right: -4, background: '#ef4444', color: '#fff', borderRadius: '50%', width: 14, height: 14, fontSize: 10, lineHeight: '14px', textAlign: 'center' as const, fontWeight: 700 }}>!</span>
              )}
            </button>
            <button onClick={() => { const next = !soundOn; soundOnRef.current = next; setSoundOn(next) }} style={{ background: 'rgba(0,0,0,0.5)', border: `1px solid ${gold}66`, borderRadius: 8, padding: '4px 10px', color: gold, cursor: 'pointer', fontSize: 14 }}>
              {soundOn ? '🔔' : '🔕'}
            </button>
            <button onClick={() => setShowQR(!showQR)} style={{ background: 'rgba(0,0,0,0.5)', border: `1px solid ${gold}66`, borderRadius: 8, padding: '4px 10px', color: gold, cursor: 'pointer', fontSize: 12 }}>
              QR
            </button>
          </div>
        </div>
      </div>

      {/* El navegador bloqueó el autoplay del relato — hace falta un toque real para reintentar */}
      {narrationBlocked && (
        <div style={{ background: 'rgba(201,168,76,0.15)', borderBottom: `1px solid ${gold}66`, padding: '10px 16px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
          <button onClick={retryNarrationPlayback} style={{ background: gold, border: 'none', borderRadius: 8, padding: '8px 16px', color: '#0A3D1F', fontWeight: 700, fontSize: 13, cursor: 'pointer', fontFamily: 'Georgia, serif' }}>
            🔊 Tocá para escuchar el relato
          </button>
        </div>
      )}

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
          padding: '70px 20px 24px',
          position: 'relative' as const,
          overflow: 'visible' as const,
        }}>

          {/* Equipos y scores */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>

            {/* Equipo local */}
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
              <Avatar url={match.team_home?.logo_url} name={match.team_home?.name ?? '?'} size={60} />
              <p style={{ fontSize: 15, fontWeight: 800, margin: 0, textAlign: 'center' as const, fontFamily: 'Georgia, serif', letterSpacing: 1, textShadow: '0 2px 8px rgba(0,0,0,0.8)', ...teamResultStyle(displayMatch, match.team_home_id) }}>{match.team_home?.name}</p>
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
              {penaltyScoreLabel(displayMatch) && (
                <span style={{ fontSize: 11, color: gold, fontFamily: 'Georgia, serif', letterSpacing: 1 }}>
                  {penaltyScoreLabel(displayMatch)}
                </span>
              )}
            </div>

            {/* Equipo visitante */}
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
              <Avatar url={match.team_away?.logo_url} name={match.team_away?.name ?? '?'} size={60} />
              <p style={{ fontSize: 15, fontWeight: 800, margin: 0, textAlign: 'center' as const, fontFamily: 'Georgia, serif', letterSpacing: 1, textShadow: '0 2px 8px rgba(0,0,0,0.8)', ...teamResultStyle(displayMatch, match.team_away_id) }}>{match.team_away?.name}</p>
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
                <span key={c.id} style={{ fontSize: 11, color: c.type === 'red' ? '#ef4444' : '#facc15', fontFamily: 'Georgia, serif', background: 'rgba(0,0,0,0.4)', borderRadius: 20, padding: '2px 10px', border: `1px solid ${c.type === 'red' ? '#ef444444' : '#facc1544'}` }}>
                  {c.type === 'red' ? '🟥' : '🟨'} {c.player?.name ?? '?'}
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
              {clock?.status === 'stopped' && clock.chukker < effectiveTotalPeriods && (
                <button onClick={() => startClock(clock.chukker + 1)}
                  style={{ background: 'linear-gradient(135deg, #0d3320, #166534)', border: '1px solid #4ade8066', borderRadius: 10, padding: '10px 24px', cursor: 'pointer', color: '#4ade80', fontWeight: 700, fontSize: 13, fontFamily: 'Georgia, serif', letterSpacing: 1 }}>
                  Iniciar {clock.chukker + 1 <= totalPeriods
                    ? (clock.chukker + 1 === 2 ? '2° Tiempo' : `Tiempo ${clock.chukker + 1}`)
                    : (clock.chukker + 1 - totalPeriods === 1 ? '1° Tiempo Extra' : '2° Tiempo Extra')}
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Panel empate al cierre del tiempo reglamentario — el admin elige entre
          jugar tiempo extra, ir directo a penales, o aceptar el empate. */}
      {isAdmin && regulationJustEndedTied && (
        <div style={{ margin: '16px', background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(8px)', borderRadius: 16, border: `1px solid ${gold}33`, padding: 16 }}>
          <p style={{ color: goldLight, fontSize: 12, fontWeight: 700, letterSpacing: 2, marginBottom: 4, textAlign: 'center' as const, fontFamily: 'Georgia, serif' }}>EMPATE AL CIERRE DEL TIEMPO REGLAMENTARIO</p>
          <p style={{ color: '#a8d5b5', fontSize: 11, textAlign: 'center' as const, marginBottom: 16 }}>
            {homeGoals}-{awayGoals} · Elegí cómo seguir
          </p>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, justifyContent: 'center' }}>
            <span style={{ color: '#fb923c', fontSize: 12, fontFamily: 'Georgia, serif' }}>Duración del tiempo extra (min):</span>
            <input type="number" min={1} max={90} value={overtimeMinutesInput}
              onChange={e => setOvertimeMinutesInput(Number(e.target.value))}
              style={{ background: 'rgba(0,0,0,0.5)', border: '1px solid #fb923c66', borderRadius: 8, padding: '6px 10px', color: '#fb923c', fontSize: 14, width: 56, textAlign: 'center' as const, fontFamily: 'Georgia, serif', fontWeight: 700 }} />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 8 }}>
            <button onClick={() => startOvertime(overtimeMinutesInput)}
              style={{ background: 'linear-gradient(135deg, #7c2d12, #9a3412)', border: '1px solid #fb923c66', borderRadius: 10, padding: '12px', cursor: 'pointer', color: '#fb923c', fontWeight: 700, fontSize: 13, fontFamily: 'Georgia, serif', letterSpacing: 1 }}>
              Jugar tiempo extra
            </button>
            <button onClick={goToPenalties}
              style={{ background: 'rgba(201,168,76,0.15)', border: `1px solid ${gold}66`, borderRadius: 10, padding: '12px', cursor: 'pointer', color: gold, fontWeight: 700, fontSize: 13, fontFamily: 'Georgia, serif', letterSpacing: 1 }}>
              Ir a penales
            </button>
            <button onClick={finishMatchAsDraw}
              style={{ background: 'transparent', border: `1px solid ${gold}44`, borderRadius: 10, padding: '12px', cursor: 'pointer', color: `${gold}bb`, fontWeight: 700, fontSize: 13, fontFamily: 'Georgia, serif', letterSpacing: 1 }}>
              Finalizar partido (empate)
            </button>
          </div>
        </div>
      )}

      {/* Panel definición por penales — lucecitas visibles para todos, botones solo admin */}
      {shootoutActive && (
        <div style={{ margin: '16px', background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(8px)', borderRadius: 16, border: `1px solid ${gold}33`, padding: 16 }}>
          <p style={{ color: goldLight, fontSize: 12, fontWeight: 700, letterSpacing: 2, marginBottom: 4, textAlign: 'center' as const, fontFamily: 'Georgia, serif' }}>DEFINICIÓN POR PENALES</p>
          <p style={{ color: '#a8d5b5', fontSize: 11, textAlign: 'center' as const, marginBottom: 16 }}>
            Empate {extraTimeUnlocked ? 'tras el tiempo extra' : 'en tiempo regular'} ({homeGoals}-{awayGoals}){isAdmin ? ' · Cargá cada penal a medida que se patea' : ''}
          </p>

          {([
            { key: 'home' as const, name: match.team_home?.name },
            { key: 'away' as const, name: match.team_away?.name },
          ]).map(team => {
            const sequence = currentSequence(team.key)
            return (
              <div key={team.key} style={{ marginBottom: 16 }}>
                <p style={{ color: gold, fontSize: 12, fontFamily: 'Georgia, serif', marginBottom: 8, textAlign: 'center' as const }}>{team.name}</p>
                <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginBottom: 10 }}>
                  {Array.from({ length: 5 }).map((_, slot) => {
                    const taken = slot < sequence.length
                    const scored = taken ? sequence[slot] : null
                    return (
                      <div key={slot} style={{
                        width: 22, height: 22, borderRadius: '50%',
                        background: taken ? (scored ? '#22c55e' : '#ef4444') : 'transparent',
                        border: `2px solid ${taken ? (scored ? '#22c55e' : '#ef4444') : gold + '55'}`,
                        boxShadow: taken ? `0 0 8px ${scored ? 'rgba(34,197,94,0.6)' : 'rgba(239,68,68,0.6)'}` : 'none',
                      }} />
                    )
                  })}
                </div>
                {isAdmin && (
                  <div style={{ display: 'flex', justifyContent: 'center', gap: 8 }}>
                    <button
                      disabled={sequence.length >= 5 || shotBusy}
                      onClick={() => recordShot(team.key, true)}
                      style={{ background: 'rgba(22,101,52,0.5)', border: '1px solid #4ade8066', borderRadius: 8, padding: '6px 14px', cursor: sequence.length >= 5 || shotBusy ? 'default' : 'pointer', color: '#4ade80', fontWeight: 700, fontSize: 12, fontFamily: 'Georgia, serif', opacity: sequence.length >= 5 || shotBusy ? 0.4 : 1 }}>
                      ✓ Convertido
                    </button>
                    <button
                      disabled={sequence.length >= 5 || shotBusy}
                      onClick={() => recordShot(team.key, false)}
                      style={{ background: 'rgba(127,29,29,0.5)', border: '1px solid #ef444466', borderRadius: 8, padding: '6px 14px', cursor: sequence.length >= 5 || shotBusy ? 'default' : 'pointer', color: '#ef4444', fontWeight: 700, fontSize: 12, fontFamily: 'Georgia, serif', opacity: sequence.length >= 5 || shotBusy ? 0.4 : 1 }}>
                      ✗ Errado
                    </button>
                    <button
                      disabled={sequence.length === 0 || shotBusy}
                      onClick={() => undoShot(team.key)}
                      style={{ background: 'transparent', border: `1px solid ${gold}33`, borderRadius: 8, padding: '6px 10px', cursor: sequence.length === 0 || shotBusy ? 'default' : 'pointer', color: `${gold}99`, fontWeight: 700, fontSize: 12, fontFamily: 'Georgia, serif', opacity: sequence.length === 0 || shotBusy ? 0.4 : 1 }}>
                      ↩ Deshacer
                    </button>
                  </div>
                )}
              </div>
            )
          })}

          <p style={{ color: gold, fontSize: 18, fontWeight: 900, textAlign: 'center' as const, fontFamily: 'Georgia, serif', marginBottom: isAdmin ? 16 : 0 }}>
            {currentSequence('home').filter(Boolean).length} - {currentSequence('away').filter(Boolean).length}
          </p>

          {isAdmin && (
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={cancelPenalties}
                style={{ flex: 1, background: 'rgba(201,168,76,0.15)', border: `1px solid ${gold}66`, borderRadius: 10, padding: '14px', cursor: 'pointer', color: gold, fontWeight: 700, fontSize: 14, fontFamily: 'Georgia, serif', letterSpacing: 1 }}>
                Cancelar
              </button>
              <button onClick={finishMatchWithPenalties}
                style={{ flex: 1, background: 'rgba(22,101,52,0.6)', border: `1px solid #4ade8066`, borderRadius: 10, padding: '14px', cursor: 'pointer', color: '#4ade80', fontWeight: 700, fontSize: 14, fontFamily: 'Georgia, serif', letterSpacing: 1 }}>
                Confirmar penales
              </button>
            </div>
          )}
        </div>
      )}

      {/* Panel titulares — opcional, solo antes de arrancar el partido */}
      {isAdmin && !clock && match.status !== 'finished' && (
        <div style={{ margin: '16px' }}>
          <button
            onClick={() => setShowLineupPanel(!showLineupPanel)}
            style={{ width: '100%', background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(8px)', borderRadius: 12, border: `1px solid ${gold}33`, padding: '12px 16px', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ color: goldLight, fontSize: 12, fontWeight: 700, letterSpacing: 2, fontFamily: 'Georgia, serif' }}>TITULARES (OPCIONAL)</span>
            <span style={{ fontSize: 18 }}>{showLineupPanel ? '▲' : '▼'}</span>
          </button>

          {showLineupPanel && (
            <div style={{ background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(8px)', borderRadius: '0 0 12px 12px', border: `1px solid ${gold}33`, borderTop: 'none', padding: 16 }}>
              <p style={{ color: '#a8d5b5', fontSize: 11, textAlign: 'center' as const, marginBottom: 12 }}>
                Marcá quiénes arrancan de titulares en cada equipo. Si no marcás a nadie, todo el plantel queda disponible para cambios.
              </p>
              <div style={{ display: 'flex', gap: 8 }}>
                {[
                  { team: match.team_home, teamId: match.team_home_id },
                  { team: match.team_away, teamId: match.team_away_id },
                ].map(({ team, teamId }) => (
                  <div key={teamId} style={{ flex: 1 }}>
                    <p style={{ color: gold, fontWeight: 700, fontSize: 12, marginBottom: 8, textAlign: 'center' as const, fontFamily: 'Georgia, serif', letterSpacing: 1 }}>{team?.name}</p>
                    {players.filter(p => p.team_id === teamId).map(player => (
                      <button key={player.id} disabled={saving}
                        onClick={() => toggleStarter(player.id)}
                        style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', marginBottom: 6, background: starterIds.has(player.id) ? gold : 'rgba(0,0,0,0.4)', border: `1px solid ${gold}44`, borderRadius: 10, padding: '8px 10px', cursor: 'pointer', color: starterIds.has(player.id) ? '#0D4F28' : '#fff', fontSize: 12, textAlign: 'left' as const }}>
                        <Avatar url={player.photo_url} name={player.name} size={26} />
                        <span style={{ fontFamily: 'Georgia, serif', flex: 1 }}>{player.name}</span>
                        {starterIds.has(player.id) && <span>✓</span>}
                      </button>
                    ))}
                  </div>
                ))}
              </div>
              <button onClick={saveLineups} disabled={saving}
                style={{ marginTop: 12, width: '100%', background: 'linear-gradient(135deg, #0d3320, #166534)', border: '1px solid #4ade8066', borderRadius: 10, padding: '10px', cursor: 'pointer', color: '#4ade80', fontWeight: 700, fontSize: 12, fontFamily: 'Georgia, serif', letterSpacing: 1 }}>
                Guardar titulares
              </button>
            </div>
          )}
        </div>
      )}

      {/* Panel asignación */}
      {isAdmin && match.status !== 'finished' && !shootoutActive && (
        <div style={{ margin: '16px', background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(8px)', borderRadius: 16, border: `1px solid ${gold}33`, padding: 16 }}>
          <p style={{ color: goldLight, fontSize: 12, fontWeight: 700, letterSpacing: 2, marginBottom: 4, textAlign: 'center' as const, fontFamily: 'Georgia, serif' }}>ASIGNAR GOL</p>
          <p style={{ color: '#a8d5b5', fontSize: 11, textAlign: 'center' as const, marginBottom: 12 }}>Tocá el marcador para sumar un gol · Tocá un jugador para asignarlo</p>

          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16, justifyContent: 'center' }}>
            <span style={{ color: gold, fontSize: 14, fontFamily: 'Georgia, serif' }}>Tiempo:</span>
            <input style={{ background: 'rgba(0,0,0,0.5)', border: `1px solid ${gold}`, borderRadius: 8, padding: '8px 12px', color: gold, fontSize: 15, width: 60, textAlign: 'center' as const, fontFamily: 'Georgia, serif', fontWeight: 700 }}
              type="number" min={1} max={effectiveTotalPeriods} value={period} onChange={e => setPeriod(Number(e.target.value))} />
          </div>

          <div style={{ display: 'flex', gap: 8 }}>
            <div style={{ flex: 1 }}>
              <p style={{ color: homePending > 0 ? '#fb923c' : gold, fontWeight: 700, fontSize: 13, marginBottom: 8, textAlign: 'center' as const, fontFamily: 'Georgia, serif', letterSpacing: 1 }}>
                {match.team_home?.name}{homePending > 0 ? ` (${homePending} ⚡)` : ''}
              </p>
              {players.filter(p => p.team_id === match.team_home_id && onFieldIds(match.team_home_id).has(p.id) && !isPlayerExpelled(p.id)).map(player => {
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
              {players.filter(p => p.team_id === match.team_away_id && onFieldIds(match.team_away_id).has(p.id) && !isPlayerExpelled(p.id)).map(player => {
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
            {!regulationJustEndedTied && (
              <button onClick={finishMatch}
                style={{ flex: 1, background: 'rgba(22,101,52,0.6)', border: `1px solid #4ade8066`, borderRadius: 10, padding: '14px', cursor: 'pointer', color: '#4ade80', fontWeight: 700, fontSize: 14, fontFamily: 'Georgia, serif', letterSpacing: 1 }}>
                Finalizar partido
              </button>
            )}
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
                  {players.filter(p => p.team_id === teamId && onFieldIds(teamId).has(p.id)).map(player => {
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

      {/* Panel cambios */}
      {isAdmin && match.status !== 'finished' && (
        <div style={{ margin: '0 16px 16px' }}>
          <button
            onClick={() => setShowSubPanel(!showSubPanel)}
            style={{ width: '100%', background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(8px)', borderRadius: 12, border: `1px solid ${gold}33`, padding: '12px 16px', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ color: goldLight, fontSize: 12, fontWeight: 700, letterSpacing: 2, fontFamily: 'Georgia, serif' }}>CAMBIOS</span>
            <span style={{ fontSize: 18 }}>{showSubPanel ? '▲' : '▼'}</span>
          </button>

          {showSubPanel && (
            <div style={{ background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(8px)', borderRadius: '0 0 12px 12px', border: `1px solid ${gold}33`, borderTop: 'none', padding: 16 }}>
              <div style={{ display: 'flex', gap: 8, marginBottom: subTeamId ? 16 : 0 }}>
                {[
                  { team: match.team_home, teamId: match.team_home_id },
                  { team: match.team_away, teamId: match.team_away_id },
                ].map(({ team, teamId }) => (
                  <button key={teamId}
                    onClick={() => { setSubTeamId(subTeamId === teamId ? null : teamId); setSubOutId(null) }}
                    style={{ flex: 1, background: subTeamId === teamId ? gold : 'rgba(0,0,0,0.4)', border: `1px solid ${gold}66`, borderRadius: 10, padding: '10px 14px', cursor: 'pointer', color: subTeamId === teamId ? '#0D4F28' : gold, fontWeight: 700, fontSize: 13, fontFamily: 'Georgia, serif' }}>
                    🔄 Cambio {team?.name}
                  </button>
                ))}
              </div>

              {subTeamId && (
                <div>
                  <p style={{ color: '#a8d5b5', fontSize: 11, textAlign: 'center' as const, marginBottom: 12 }}>
                    {subOutId ? 'Tocá el jugador que entra' : 'Tocá el jugador que sale'}
                  </p>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <div style={{ flex: 1 }}>
                      <p style={{ color: gold, fontWeight: 700, fontSize: 12, marginBottom: 8, textAlign: 'center' as const, fontFamily: 'Georgia, serif', letterSpacing: 1 }}>EN CANCHA</p>
                      {players.filter(p => p.team_id === subTeamId && onFieldIds(subTeamId).has(p.id)).map(player => (
                        <button key={player.id} disabled={saving}
                          onClick={() => setSubOutId(player.id)}
                          style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', marginBottom: 6, background: subOutId === player.id ? gold : 'rgba(0,0,0,0.4)', border: `1px solid ${gold}44`, borderRadius: 10, padding: '10px 12px', cursor: 'pointer', color: subOutId === player.id ? '#0D4F28' : '#fff', fontSize: 13, textAlign: 'left' as const }}>
                          <Avatar url={player.photo_url} name={player.name} size={32} />
                          <span style={{ fontFamily: 'Georgia, serif', flex: 1 }}>{player.name}</span>
                        </button>
                      ))}
                    </div>
                    <div style={{ width: 1, background: `linear-gradient(180deg, transparent, ${gold}44, transparent)` }} />
                    <div style={{ flex: 1 }}>
                      <p style={{ color: subOutId ? gold : '#666', fontWeight: 700, fontSize: 12, marginBottom: 8, textAlign: 'center' as const, fontFamily: 'Georgia, serif', letterSpacing: 1 }}>BANCO</p>
                      {players.filter(p => p.team_id === subTeamId && !onFieldIds(subTeamId).has(p.id)).map(player => (
                        <button key={player.id} disabled={!subOutId || saving}
                          onClick={() => addSubstitution(subTeamId, subOutId as string, player.id)}
                          style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', marginBottom: 6, background: 'rgba(0,0,0,0.4)', border: `1px solid ${gold}44`, borderRadius: 10, padding: '10px 12px', cursor: subOutId ? 'pointer' : 'default', color: '#fff', fontSize: 13, textAlign: 'left' as const, opacity: subOutId ? 1 : 0.4 }}>
                          <Avatar url={player.photo_url} name={player.name} size={32} />
                          <span style={{ fontFamily: 'Georgia, serif', flex: 1 }}>{player.name}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                  <button onClick={() => { setSubTeamId(null); setSubOutId(null) }}
                    style={{ marginTop: 12, width: '100%', background: 'transparent', border: `1px solid ${gold}33`, borderRadius: 10, padding: '10px', cursor: 'pointer', color: `${gold}99`, fontWeight: 700, fontSize: 12, fontFamily: 'Georgia, serif' }}>
                    Cancelar
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Cronología del partido — goles, tarjetas y cambios ordenados por created_at */}
      {timelineEvents.length > 0 && (
        <div style={{ margin: '0 16px 16px' }}>
          <p style={{ color: goldLight, fontSize: 12, fontWeight: 700, letterSpacing: 2, marginBottom: 12, textAlign: 'center' as const, fontFamily: 'Georgia, serif' }}>CRONOLOGÍA</p>
          <div style={{ background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(8px)', borderRadius: 12, overflow: 'hidden', border: `1px solid ${gold}44` }}>
            {timelineEvents.map(ev => {
              if (ev.kind === 'goal') {
                const g = ev.item
                return (
                  <div key={`goal-${g.id}`}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', borderBottom: `1px solid ${gold}22` }}>
                      <span style={{ color: gold, fontSize: 12, fontFamily: 'Georgia, serif', minWidth: 60 }}>⚽ T.{g.chukker}{g.minute != null ? ` · ${g.minute}'` : ''}</span>
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
                          {players.filter(p => p.team_id === g.team_id && onFieldIds(g.team_id).has(p.id) && !isPlayerExpelled(p.id)).map(player => (
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
                )
              }
              if (ev.kind === 'card') {
                const c = ev.item
                return (
                  <div key={`card-${c.id}`} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', borderBottom: `1px solid ${gold}22` }}>
                    <span style={{ color: gold, fontSize: 12, fontFamily: 'Georgia, serif', minWidth: 60 }}>{c.type === 'red' ? '🟥' : '🟨'} T.{c.period}{c.minute != null ? ` · ${c.minute}'` : ''}</span>
                    <span style={{ fontWeight: 600, fontFamily: 'Georgia, serif', flex: 1, textAlign: 'center' as const, color: c.type === 'red' ? '#ef4444' : '#facc15' }}>
                      {c.player?.name ?? '?'}
                    </span>
                    <span style={{ color: '#a8d5b5', fontSize: 11, minWidth: 80, textAlign: 'right' as const }}>
                      {c.team_id === match.team_home_id ? match.team_home?.name : match.team_away?.name}
                    </span>
                  </div>
                )
              }
              const s = ev.item
              return (
                <div key={`sub-${s.id}`} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', borderBottom: `1px solid ${gold}22`, gap: 8 }}>
                  <span style={{ fontWeight: 600, fontFamily: 'Georgia, serif', color: '#93c5fd' }}>
                    🔄 Sale {s.player_out?.name ?? '?'} - Entra {s.player_in?.name ?? '?'} (Tiempo {s.period})
                  </span>
                  <span style={{ color: '#a8d5b5', fontSize: 11, minWidth: 80, textAlign: 'right' as const }}>
                    {s.team_id === match.team_home_id ? match.team_home?.name : match.team_away?.name}
                  </span>
                </div>
              )
            })}
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
              players={players.filter(p => onFieldIds(p.team_id).has(p.id))}
              onVote={votePlayer}
              onChangeVote={async (_oldId, newId) => {
                await supabase.from('mvp_votes').delete().eq('match_id', match.id).eq('device_id', deviceId)
                await supabase.from('mvp_votes').insert({ match_id: match.id, player_id: newId, device_id: deviceId, app: 'futbol' })
                localStorage.setItem(`voted_match_${match.id}`, 'true')
                await loadData()
              }}
              voteCount={getMvpVoteCount}
              votedPlayerId={mvpVotes.find(v => v.device_id === deviceId)?.player_id ?? null}
            />
            {isAdmin && (
              <>
                <p style={{ color: goldLight, fontSize: 12, fontWeight: 700, letterSpacing: 2, marginTop: 20, marginBottom: 12, textAlign: 'center' as const, fontFamily: 'Georgia, serif' }}>CONFIRMAR DESTACADO OFICIAL</p>
                {(() => {
                  const votedPlayers = players.filter(p => onFieldIds(p.team_id).has(p.id) && getMvpVoteCount(p.id) > 0)
                  if (votedPlayers.length === 0) {
                    return <p style={{ color: '#a8d5b5', fontSize: 12, textAlign: 'center' as const, fontFamily: 'Georgia, serif' }}>Todavía no hay votos</p>
                  }
                  return votedPlayers.map(player => (
                    <button key={player.id}
                      onClick={() => setOfficialMvp(player.id)}
                      style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', marginBottom: 6, background: 'rgba(0,0,0,0.5)', border: `1px solid ${gold}88`, borderRadius: 10, padding: '10px 14px', cursor: 'pointer', color: '#fff', fontSize: 13, textAlign: 'left' as const }}>
                      <Avatar url={player.photo_url} name={player.name} size={32} />
                      <span style={{ fontFamily: 'Georgia, serif', flex: 1 }}>{player.name}</span>
                      <span style={{ color: gold, fontSize: 12 }}>{getMvpVoteCount(player.id)} votos</span>
                    </button>
                  ))
                })()}
              </>
            )}
          </>
        )}
      </div>
    </div>
  )
}
