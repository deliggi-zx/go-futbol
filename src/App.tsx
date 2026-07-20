import { useState, useEffect, useRef } from 'react'
import { BrowserRouter, Routes, Route, useParams, useNavigate } from 'react-router-dom'
import { supabase } from './lib/supabase'
import TournamentSetup from './pages/TournamentSetup'
import TournamentView from './pages/TournamentView'
import AuthScreen from './pages/AuthScreen'
import AdminDashboard from './pages/AdminDashboard'
import SuperAdmin from './pages/SuperAdmin'
import TournamentBracket from './pages/TournamentBracket'
import './App.css'

// Vista pública por slug
function PublicView() {
  const { slug } = useParams()
  const [tournament, setTournament] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [initialMatchId, setInitialMatchId] = useState<string | null>(null)

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const matchId = params.get('match')
    if (matchId) setInitialMatchId(matchId)
    loadTournament()
  }, [slug])

  async function loadTournament() {
    // Buscar org por slug
    const { data: org } = await supabase
      .from('organizations')
      .select('id')
      .eq('slug', slug)
      .eq('app', 'futbol')
      .single()

    if (!org) { setLoading(false); return }

    // Buscar torneo activo de esa org — scorer_password excluido intencionalmente
    const { data } = await supabase
      .from('tournaments')
      .select('id, name, date, periods_per_match, status, format, org_id, has_third_place, created_at, finished_at, winner_team_name')
      .eq('org_id', org.id)
      .eq('app', 'futbol')
      .neq('status', 'finished')
      .order('created_at', { ascending: false })
      .limit(1)
      .single()

    setTournament(data)
    setLoading(false)
  }

  if (loading) return (
    <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', height: '100vh', background: '#0A3D1F', gap: 20 }}>
      <img src="/logo.png" alt="Go Fútbol" style={{ width: 160, borderRadius: 16, objectFit: 'contain' }} />
      <p style={{ color: '#C9A84C', fontSize: 18, fontWeight: 700 }}>Cargando...</p>
    </div>
  )

  if (!tournament) return (
    <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', height: '100vh', background: '#0A3D1F', gap: 16 }}>
      <img src="/logo.png" alt="Go Fútbol" style={{ width: 160, borderRadius: 16, objectFit: 'contain' }} />
      <p style={{ color: '#C9A84C', fontSize: 20, fontWeight: 800 }}>GO FÚTBOL</p>
      <p style={{ color: '#a8d5b5', fontSize: 15 }}>No hay torneo activo</p>
    </div>
  )

  return (
    <TournamentView
      tournament={tournament}
      onReset={loadTournament}
      initialMatchId={initialMatchId}
    />
  )
}

// Vista pública de un torneo puntual por su slug propio (a diferencia de
// PublicView, que resuelve por slug de organización y solo muestra el
// torneo activo — este permite compartir cualquier torneo, finalizado o no).
function PublicTournamentView() {
  const { slug } = useParams()
  const [tournament, setTournament] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [initialMatchId, setInitialMatchId] = useState<string | null>(null)

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const matchId = params.get('match')
    if (matchId) setInitialMatchId(matchId)
    loadTournament()
  }, [slug])

  async function loadTournament() {
    const { data } = await supabase
      .from('tournaments')
      .select('id, name, date, periods_per_match, status, format, org_id, has_third_place, created_at, finished_at, winner_team_name')
      .eq('slug', slug)
      .eq('app', 'futbol')
      .maybeSingle()

    setTournament(data)
    setLoading(false)
  }

  if (loading) return (
    <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', height: '100vh', background: '#0A3D1F', gap: 20 }}>
      <img src="/logo.png" alt="Go Fútbol" style={{ width: 160, borderRadius: 16, objectFit: 'contain' }} />
      <p style={{ color: '#C9A84C', fontSize: 18, fontWeight: 700 }}>Cargando...</p>
    </div>
  )

  if (!tournament) return (
    <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', height: '100vh', background: '#0A3D1F', gap: 16 }}>
      <img src="/logo.png" alt="Go Fútbol" style={{ width: 160, borderRadius: 16, objectFit: 'contain' }} />
      <p style={{ color: '#C9A84C', fontSize: 20, fontWeight: 800 }}>GO FÚTBOL</p>
      <p style={{ color: '#a8d5b5', fontSize: 15 }}>No encontramos ese torneo</p>
    </div>
  )

  return (
    <TournamentView
      tournament={tournament}
      onReset={loadTournament}
      initialMatchId={initialMatchId}
    />
  )
}

// Panel admin
function AdminPanel() {
  const [user, setUser] = useState<any>(null)
  const [org, setOrg] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [screen, setScreen] = useState<'dashboard' | 'setup'>('dashboard')

  useEffect(() => {
    checkSession()
  }, [])

  async function checkSession() {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) { setLoading(false); return }
    const { data: orgData } = await supabase
      .from('organizations')
      .select('*')
      .eq('owner_id', session.user.id)
      .eq('app', 'futbol')
      .single()
    setUser(session.user)
    setOrg(orgData)
    setLoading(false)
  }

  if (loading) return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', background: '#0A3D1F' }}>
      <p style={{ color: '#C9A84C', fontSize: 18, fontWeight: 700 }}>Cargando...</p>
    </div>
  )

  if (!user || !org) {
    return <AuthScreen onLogin={(u, o) => { setUser(u); setOrg(o) }} />
  }

  if (screen === 'setup') {
    return <TournamentSetup
      orgId={org.id}
      onCreated={() => setScreen('dashboard')}
    />
  }

  return (
    <AdminDashboard
      org={org}
      onLogout={() => { setUser(null); setOrg(null) }}
    />
  )
}

// Home — redirige a /admin
function Home() {
  const navigate = useNavigate()
  useEffect(() => { navigate('/admin') }, [])
  return null
}

// Red de seguridad para pestañas que quedaron abiertas desde antes de un
// deploy: el cache-control de index.html ya evita que una pestaña NUEVA
// cargue una versión vieja, pero no puede hacer nada por una pestaña que ya
// está corriendo y nunca vuelve a pedir el HTML. Esto chequea el HTML real
// del servidor (sin cache) cada tanto y al volver el foco, y avisa sin forzar
// el reload — el usuario puede estar en medio de cargar un gol.
function UpdateBanner() {
  const baselineHtmlRef = useRef<string | null>(null)
  const [updateAvailable, setUpdateAvailable] = useState(false)

  useEffect(() => {
    async function checkForUpdate() {
      try {
        const res = await fetch('/', { cache: 'no-store' })
        const html = await res.text()
        if (baselineHtmlRef.current === null) {
          baselineHtmlRef.current = html
        } else if (html !== baselineHtmlRef.current) {
          setUpdateAvailable(true)
        }
      } catch (e) {
        // sin conexión momentánea — no molestamos por esto
      }
    }
    checkForUpdate()
    const interval = setInterval(checkForUpdate, 5 * 60 * 1000)
    function onVisible() {
      if (document.visibilityState === 'visible') checkForUpdate()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      clearInterval(interval)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [])

  if (!updateAvailable) return null

  return (
    <div style={{
      position: 'fixed', bottom: 16, left: '50%', transform: 'translateX(-50%)', zIndex: 9999,
      background: '#0D4F28', border: '1px solid #C9A84C', borderRadius: 12, padding: '10px 12px 10px 16px',
      display: 'flex', alignItems: 'center', gap: 12, boxShadow: '0 4px 20px rgba(0,0,0,0.4)',
      fontFamily: 'Georgia, serif',
    }}>
      <span style={{ color: '#fff', fontSize: 13 }}>Hay una versión nueva disponible</span>
      <button onClick={() => window.location.reload()} style={{
        background: '#C9A84C', border: 'none', borderRadius: 8, padding: '6px 12px',
        color: '#0A3D1F', fontWeight: 700, fontSize: 12, cursor: 'pointer', fontFamily: 'Georgia, serif',
      }}>
        Actualizar
      </button>
    </div>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <UpdateBanner />
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/admin" element={<AdminPanel />} />
        <Route path="/superadmin" element={<SuperAdmin />} />
        <Route path="/tournament/:id/bracket" element={<TournamentBracket />} />
        <Route path="/t/:slug" element={<PublicTournamentView />} />
        <Route path="/:slug" element={<PublicView />} />
      </Routes>
    </BrowserRouter>
  )
}