import { useState, useEffect } from 'react'
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

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/admin" element={<AdminPanel />} />
        <Route path="/superadmin" element={<SuperAdmin />} />
        <Route path="/tournament/:id/bracket" element={<TournamentBracket />} />
        <Route path="/:slug" element={<PublicView />} />
      </Routes>
    </BrowserRouter>
  )
}