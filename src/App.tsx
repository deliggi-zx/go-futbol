import { useState, useEffect } from 'react'
import { supabase } from './lib/supabase'
import TournamentSetup from './pages/TournamentSetup'
import TournamentView from './pages/TournamentView'
import './App.css'

export default function App() {
  const [tournament, setTournament] = useState<any>(null)
  const [history, setHistory] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [initialMatchId, setInitialMatchId] = useState<string | null>(null)
  const [screen, setScreen] = useState<'main' | 'setup' | 'history'>('main')
  const isAdmin = localStorage.getItem('tribu_admin') === 'true'

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const matchId = params.get('match')
    if (matchId) setInitialMatchId(matchId)
    loadData()
  }, [])

  async function loadData() {
    const [active, finished] = await Promise.all([
      supabase.from('tournaments').select('*').neq('status', 'finished').order('created_at', { ascending: false }).limit(1).single(),
      supabase.from('tournaments').select('*').eq('status', 'finished').order('finished_at', { ascending: false }),
    ])
    setTournament(active.data)
    setHistory(finished.data ?? [])
    setLoading(false)
  }

  const styles = {
    container: { minHeight: '100vh', background: '#6B0F2B', color: '#fff' },
    header: { background: '#4A0B1E', padding: '20px 16px', borderBottom: '1px solid #8B1A3A', display: 'flex', alignItems: 'center', justifyContent: 'space-between' },
    btn: (color: string) => ({ background: color, color: color === '#C9A84C' ? '#4A0B1E' : '#fff', border: 'none', borderRadius: 10, padding: '12px 20px', cursor: 'pointer', fontWeight: 700, fontSize: 14 }),
    card: { background: '#4A0B1E', borderRadius: 12, padding: 16, marginBottom: 10, border: '1px solid #8B1A3A' },
  }

  if (loading) return (
    <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', height: '100vh', background: '#6B0F2B', gap: 20 }}>
      <img src="/logo.jpg" alt="Go Polo" style={{ width: 120, height: 120, borderRadius: 16, objectFit: 'cover' }} />
      <p style={{ color: '#C9A84C', fontSize: 18, fontWeight: 700 }}>Cargando...</p>
    </div>
  )

  if (screen === 'setup') {
    return <TournamentSetup onCreated={(t) => { setTournament(t); setScreen('main') }} />
  }

  if (tournament && screen === 'main') {
    return <TournamentView tournament={tournament} onReset={() => { setTournament(null); loadData() }} initialMatchId={initialMatchId} />
  }

  if (screen === 'history') {
    return (
      <div style={styles.container}>
        <div style={styles.header}>
          <button onClick={() => setScreen('main')} style={{ background: 'none', border: 'none', color: '#d4a0b0', cursor: 'pointer', fontSize: 15, padding: 0 }}>← Volver</button>
          <h2 style={{ color: '#C9A84C', fontWeight: 800, fontSize: 18, margin: 0 }}>Historial</h2>
          <div style={{ width: 60 }} />
        </div>
        <div style={{ padding: 16, maxWidth: 600, margin: '0 auto' }}>
          {history.length === 0 ? (
            <p style={{ color: '#d4a0b0', textAlign: 'center', marginTop: 40 }}>No hay torneos finalizados.</p>
          ) : history.map(t => (
            <div key={t.id} style={{ ...styles.card, cursor: 'pointer' }} onClick={() => { setTournament(t); setScreen('main') }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <p style={{ fontWeight: 700, fontSize: 16, margin: '0 0 4px', color: '#fff' }}>{t.name}</p>
                  <p style={{ color: '#d4a0b0', fontSize: 13, margin: '0 0 4px' }}>{new Date(t.date).toLocaleDateString('es-AR')}</p>
                  {t.winner_team_name && (
                    <p style={{ color: '#C9A84C', fontSize: 13, fontWeight: 700, margin: 0 }}>Campeon: {t.winner_team_name}</p>
                  )}
                </div>
                <span style={{ background: '#166534', color: '#fff', borderRadius: 20, padding: '2px 10px', fontSize: 11, fontWeight: 700 }}>Ver →</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    )
  }

  // Sin torneo activo
  return (
    <div style={styles.container}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', gap: 24, padding: 24 }}>
        <img src="/logo.jpg" alt="Tribu de Polo" style={{ width: 120, height: 120, borderRadius: 16, objectFit: 'cover' }} />
        <h1 style={{ color: '#C9A84C', fontWeight: 900, fontSize: 28, margin: 0, textAlign: 'center' }}>TRIBU DE POLO</h1>
        <p style={{ color: '#d4a0b0', fontSize: 15, margin: 0, textAlign: 'center' }}>No hay torneo activo</p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, width: '100%', maxWidth: 300 }}>
          {isAdmin && (
            <button style={styles.btn('#C9A84C')} onClick={() => setScreen('setup')}>
              + Crear nuevo torneo
            </button>
          )}
          {!isAdmin && (
            <button style={styles.btn('#8B1A3A')} onClick={() => {
              const pwd = prompt('Contrasena admin:')
              if (pwd === 'tribu2026') { localStorage.setItem('tribu_admin', 'true'); window.location.reload() }
              else if (pwd !== null) alert('Incorrecta')
            }}>
              Admin
            </button>
          )}
          {history.length > 0 && (
            <button style={styles.btn('#8B1A3A')} onClick={() => setScreen('history')}>
              Ver historial ({history.length})
            </button>
          )}
        </div>
      </div>
    </div>
  )
}