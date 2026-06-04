import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import TournamentSetup from './TournamentSetup'

type Props = { org: any; onLogout: () => void }

export default function AdminDashboard({ org, onLogout }: Props) {
  const [tournaments, setTournaments] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [screen, setScreen] = useState<'dashboard' | 'setup'>('dashboard')

  useEffect(() => {
    loadTournaments()
  }, [])

  async function loadTournaments() {
    const { data } = await supabase
      .from('tournaments')
      .select('*')
      .eq('org_id', org.id)
      .order('created_at', { ascending: false })
    setTournaments(data ?? [])
    setLoading(false)
  }

  async function handleLogout() {
    await supabase.auth.signOut()
    onLogout()
  }

  const styles = {
    container: { minHeight: '100vh', background: '#6B0F2B', color: '#fff' },
    header: { background: '#4A0B1E', padding: '16px', borderBottom: '1px solid #8B1A3A', display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
    card: { background: '#4A0B1E', borderRadius: 12, padding: 16, marginBottom: 10, border: '1px solid #8B1A3A' },
    btn: (color: string) => ({ background: color, color: color === '#C9A84C' ? '#4A0B1E' : '#fff', border: 'none', borderRadius: 10, padding: '12px 20px', cursor: 'pointer', fontWeight: 700, fontSize: 14 }),
    badge: (s: string) => ({ display: 'inline-block', padding: '2px 10px', borderRadius: 20, fontSize: 11, fontWeight: 700, background: s === 'finished' ? '#166534' : '#1e40af', color: '#fff' }),
  }

  if (screen === 'setup') {
    return <TournamentSetup
      onCreated={(t) => {
        loadTournaments()
        setScreen('dashboard')
      }}
      orgId={org.id}
    />
  }

  const canCreate = org.status === 'active' && (org.plan === 'subscription' || org.tournaments_remaining > 0)

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <img src="/logo.jpg" alt="Go Polo" style={{ width: 40, height: 40, borderRadius: 8, objectFit: 'contain' }} />
          <div>
            <p style={{ margin: 0, fontWeight: 700, color: '#C9A84C', fontSize: 15 }}>{org.name}</p>
            <p style={{ margin: 0, color: '#d4a0b0', fontSize: 11 }}>gopolo.app/{org.slug}</p>
          </div>
        </div>
        <button onClick={handleLogout} style={{ background: 'none', border: '1px solid #8B1A3A', borderRadius: 8, color: '#d4a0b0', padding: '6px 12px', cursor: 'pointer', fontSize: 12 }}>
          Salir
        </button>
      </div>

      <div style={{ padding: 16, maxWidth: 600, margin: '0 auto' }}>

        {/* Estado de cuenta */}
        <div style={{ ...styles.card, marginBottom: 20 }}>
          <p style={{ color: '#d4a0b0', fontSize: 12, fontWeight: 700, letterSpacing: 1, margin: '0 0 8px' }}>ESTADO DE CUENTA</p>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <p style={{ margin: '0 0 4px', fontSize: 14, color: '#fff' }}>
                Plan: <span style={{ color: '#C9A84C', fontWeight: 700 }}>{org.plan === 'trial' ? 'Trial' : org.plan === 'per_tournament' ? 'Por torneo' : 'Suscripción'}</span>
              </p>
              {org.plan !== 'subscription' && (
                <p style={{ margin: 0, fontSize: 13, color: '#d4a0b0' }}>
                  Torneos disponibles: <span style={{ color: org.tournaments_remaining > 0 ? '#C9A84C' : '#f87171', fontWeight: 700 }}>{org.tournaments_remaining}</span>
                </p>
              )}
              {org.plan === 'subscription' && org.subscription_expires_at && (
                <p style={{ margin: 0, fontSize: 13, color: '#d4a0b0' }}>
                  Vence: <span style={{ color: '#C9A84C', fontWeight: 700 }}>{new Date(org.subscription_expires_at).toLocaleDateString('es-AR')}</span>
                </p>
              )}
            </div>
            <span style={{ ...styles.badge(org.status), fontSize: 12, padding: '4px 12px' }}>
              {org.status === 'active' ? '✓ Activo' : '✗ Suspendido'}
            </span>
          </div>
          {!canCreate && (
            <p style={{ color: '#f87171', fontSize: 13, marginTop: 10, marginBottom: 0 }}>
              No tenés torneos disponibles. Contactá a Go Polo para recargar tu cuenta.
            </p>
          )}
        </div>

        {/* Botón crear torneo */}
        {canCreate && (
          <button style={{ ...styles.btn('#C9A84C'), width: '100%', marginBottom: 20 }} onClick={() => setScreen('setup')}>
            + Crear nuevo torneo
          </button>
        )}

        {/* Lista de torneos */}
        <p style={{ color: '#d4a0b0', fontSize: 12, fontWeight: 700, letterSpacing: 1, marginBottom: 8 }}>MIS TORNEOS</p>
        {loading ? (
          <p style={{ color: '#d4a0b0', textAlign: 'center', marginTop: 20 }}>Cargando...</p>
        ) : tournaments.length === 0 ? (
          <p style={{ color: '#d4a0b0', textAlign: 'center', marginTop: 20 }}>No hay torneos aún.</p>
        ) : tournaments.map((tournament) => (
          <div key={tournament.id} style={styles.card}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <p style={{ fontWeight: 700, fontSize: 15, margin: '0 0 4px', color: '#fff' }}>{tournament.name}</p>
                <p style={{ color: '#d4a0b0', fontSize: 12, margin: '0 0 6px' }}>{new Date(tournament.date).toLocaleDateString('es-AR')}</p>
                {tournament.winner_team_name && (
                  <p style={{ color: '#C9A84C', fontSize: 12, fontWeight: 700, margin: 0 }}>🏆 {t.winner_team_name}</p>
                )}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'flex-end' }}>
                <span style={styles.badge(tournament.status)}>{tournament.status === 'finished' ? 'Finalizado' : 'Activo'}</span>
                <a href={`/${org.slug}`} target="_blank" style={{ color: '#C9A84C', fontSize: 11, textDecoration: 'none' }}>
                  Ver público →
                </a>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}