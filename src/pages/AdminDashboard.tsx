import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import TournamentSetup from './TournamentSetup'
import QuickMatchSetup from './QuickMatchSetup'

type Props = { org: any; onLogout: () => void }

export default function AdminDashboard({ org, onLogout }: Props) {
  const navigate = useNavigate()
  const [tournaments, setTournaments] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [screen, setScreen] = useState<'dashboard' | 'setup' | 'quickmatch'>('dashboard')
  const [showChangePassword, setShowChangePassword] = useState(!org.password_changed)
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [pwdError, setPwdError] = useState('')
  const [pwdSuccess, setPwdSuccess] = useState('')
  const [mustChangePassword] = useState(!org.password_changed)

  useEffect(() => {
    loadTournaments()
  }, [])

  async function loadTournaments() {
    const { data } = await supabase
      .from('tournaments')
      .select('id, name, date, format, status, finished_at, winner_team_name, periods_per_match, slug')
      .eq('org_id', org.id)
      .eq('app', 'futbol')
      .order('created_at', { ascending: false })
    setTournaments(data ?? [])
    setLoading(false)
  }

  async function handleLogout() {
    await supabase.auth.signOut()
    onLogout()
  }

  async function handleChangePassword() {
    setPwdError('')
    setPwdSuccess('')
    if (!newPassword || !confirmPassword) { setPwdError('Completá ambos campos'); return }
    if (newPassword !== confirmPassword) { setPwdError('Las contraseñas no coinciden'); return }
    if (newPassword.length < 6) { setPwdError('Mínimo 6 caracteres'); return }
    const { error } = await supabase.auth.updateUser({ password: newPassword })
    if (error) { setPwdError('Error al cambiar la contraseña'); return }
    await supabase.from('organizations').update({ password_changed: true }).eq('id', org.id)
    setPwdSuccess('¡Contraseña actualizada!')
    setNewPassword('')
    setConfirmPassword('')
    setTimeout(() => { setShowChangePassword(false) }, 1500)
  }

  const styles = {
    container: { minHeight: '100vh', background: '#0A3D1F', color: '#fff' },
    header: { background: '#0D4F28', padding: '16px', borderBottom: '1px solid #0D4F28', display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
    card: { background: '#0D4F28', borderRadius: 12, padding: 16, marginBottom: 10, border: '1px solid #0D4F28' },
    btn: (color: string) => ({ background: color, color: color === '#C9A84C' ? '#0D4F28' : '#fff', border: 'none', borderRadius: 10, padding: '12px 20px', cursor: 'pointer', fontWeight: 700, fontSize: 14 }),
    badge: (s: string) => ({ display: 'inline-block', padding: '2px 10px', borderRadius: 20, fontSize: 11, fontWeight: 700, background: s === 'finished' ? '#166534' : '#1e40af', color: '#fff' }),
    input: { width: '100%', background: '#0A3D1F', border: '1px solid #0D4F28', borderRadius: 8, padding: '10px 12px', color: '#fff', fontSize: 14, boxSizing: 'border-box' as const, marginBottom: 12 },
    label: { color: '#a8d5b5', fontSize: 12, marginBottom: 4, display: 'block' as const },
  }

  if (screen === 'setup') {
    return <TournamentSetup
      onCreated={() => {
        loadTournaments()
        setScreen('dashboard')
      }}
      orgId={org.id}
    />
  }

  if (screen === 'quickmatch') {
    return <QuickMatchSetup
      onCreated={(tournament, matchId) => {
        navigate(`/t/${tournament.slug}?match=${matchId}`)
      }}
      orgId={org.id}
    />
  }

  const canCreate = org.status === 'active' && (org.plan === 'subscription' || org.tournaments_remaining > 0)

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <img src="/logo.png" alt="Go Fútbol" style={{ width: 40, height: 40, borderRadius: 8, objectFit: 'contain' }} />
          <div>
            <p style={{ margin: 0, fontWeight: 700, color: '#C9A84C', fontSize: 15 }}>{org.name}</p>
            <p style={{ margin: 0, color: '#a8d5b5', fontSize: 11 }}>gofutbol.app/{org.slug}</p>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={() => setShowChangePassword(!showChangePassword)} style={{ background: 'none', border: '1px solid #0D4F28', borderRadius: 8, color: '#a8d5b5', padding: '6px 12px', cursor: 'pointer', fontSize: 12 }}>
            🔑 Contraseña
          </button>
          <button onClick={handleLogout} style={{ background: 'none', border: '1px solid #0D4F28', borderRadius: 8, color: '#a8d5b5', padding: '6px 12px', cursor: 'pointer', fontSize: 12 }}>
            Salir
          </button>
        </div>
      </div>

      <div style={{ padding: 16, maxWidth: 600, margin: '0 auto' }}>

        {/* Cambio de contraseña obligatorio o voluntario */}
        {showChangePassword && (
          <div style={{ ...styles.card, marginBottom: 20, border: '1px solid #C9A84C' }}>
            <p style={{ color: '#C9A84C', fontWeight: 700, fontSize: 14, margin: '0 0 4px' }}>
              🔑 {mustChangePassword ? 'Cambiá tu contraseña provisoria' : 'Cambiar contraseña'}
            </p>
            {mustChangePassword && (
              <p style={{ color: '#a8d5b5', fontSize: 12, margin: '0 0 12px' }}>
                Por seguridad, debés establecer una contraseña personal antes de continuar.
              </p>
            )}
            {pwdError && <p style={{ color: '#f87171', fontSize: 13, marginBottom: 8 }}>{pwdError}</p>}
            {pwdSuccess && <p style={{ color: '#4ade80', fontSize: 13, marginBottom: 8 }}>{pwdSuccess}</p>}
            <label style={styles.label}>Nueva contraseña</label>
            <input type="password" style={styles.input} value={newPassword} onChange={e => setNewPassword(e.target.value)} placeholder="Mínimo 6 caracteres" />
            <label style={styles.label}>Confirmar contraseña</label>
            <input type="password" style={styles.input} value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} placeholder="Repetí la contraseña" />
            <button onClick={handleChangePassword} style={{ background: '#C9A84C', color: '#0D4F28', fontWeight: 700, border: 'none', borderRadius: 8, padding: '10px 16px', cursor: 'pointer', width: '100%' }}>
              Guardar nueva contraseña
            </button>
            {!mustChangePassword && (
              <button onClick={() => setShowChangePassword(false)} style={{ background: 'none', border: 'none', color: '#a8d5b5', cursor: 'pointer', fontSize: 13, marginTop: 8, width: '100%' }}>
                Cancelar
              </button>
            )}
          </div>
        )}

        {/* Contenido del dashboard — bloqueado si debe cambiar contraseña */}
        {!mustChangePassword || !showChangePassword ? (
          <>
            {/* Estado de cuenta */}
            <div style={{ ...styles.card, marginBottom: 20 }}>
              <p style={{ color: '#a8d5b5', fontSize: 12, fontWeight: 700, letterSpacing: 1, margin: '0 0 8px' }}>ESTADO DE CUENTA</p>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <p style={{ margin: '0 0 4px', fontSize: 14, color: '#fff' }}>
                    Plan: <span style={{ color: '#C9A84C', fontWeight: 700 }}>{org.plan === 'trial' ? 'Trial' : org.plan === 'per_tournament' ? 'Por torneo' : 'Suscripción'}</span>
                  </p>
                  {org.plan !== 'subscription' && (
                    <p style={{ margin: 0, fontSize: 13, color: '#a8d5b5' }}>
                      Torneos disponibles: <span style={{ color: org.tournaments_remaining > 0 ? '#C9A84C' : '#f87171', fontWeight: 700 }}>{org.tournaments_remaining}</span>
                    </p>
                  )}
                  {org.plan === 'subscription' && org.subscription_expires_at && (
                    <p style={{ margin: 0, fontSize: 13, color: '#a8d5b5' }}>
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
                  No tenés torneos disponibles. Contactá a Go Fútbol para recargar tu cuenta.
                </p>
              )}
            </div>

            {/* Botones crear torneo / partido suelto */}
            {canCreate && (
              <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
                <button style={{ ...styles.btn('#C9A84C'), flex: 1 }} onClick={() => setScreen('setup')}>
                  + Crear torneo
                </button>
                <button style={{ ...styles.btn('#1A6B35'), flex: 1 }} onClick={() => setScreen('quickmatch')}>
                  ⚽ Cargar partido suelto
                </button>
              </div>
            )}

            {/* Lista de torneos */}
            <p style={{ color: '#a8d5b5', fontSize: 12, fontWeight: 700, letterSpacing: 1, marginBottom: 8 }}>MIS TORNEOS</p>
            {loading ? (
              <p style={{ color: '#a8d5b5', textAlign: 'center', marginTop: 20 }}>Cargando...</p>
            ) : tournaments.length === 0 ? (
              <p style={{ color: '#a8d5b5', textAlign: 'center', marginTop: 20 }}>No hay torneos aún.</p>
            ) : tournaments.map((tournament) => (
              <div key={tournament.id} style={styles.card}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div>
                    <p style={{ fontWeight: 700, fontSize: 15, margin: '0 0 4px', color: '#fff' }}>{tournament.name}</p>
                    <p style={{ color: '#a8d5b5', fontSize: 12, margin: '0 0 6px' }}>{new Date(tournament.date).toLocaleDateString('es-AR')}</p>
                    {tournament.winner_team_name && (
                      <p style={{ color: '#C9A84C', fontSize: 12, fontWeight: 700, margin: 0 }}>🏆 {tournament.winner_team_name}</p>
                    )}
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'flex-end' }}>
                    <span style={styles.badge(tournament.status)}>{tournament.status === 'finished' ? 'Finalizado' : 'Activo'}</span>
                    <a href={tournament.slug ? `https://go-futbol.vercel.app/t/${tournament.slug}` : `https://go-futbol.vercel.app/${org.slug}`} target="_blank" style={{ color: '#C9A84C', fontSize: 11, textDecoration: 'none' }}>
                      Ver público →
                    </a>
                  </div>
                </div>
              </div>
            ))}
          </>
        ) : null}
      </div>
    </div>
  )
}