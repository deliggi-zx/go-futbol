import { useState } from 'react'
import { supabase } from '../lib/supabase'

type Props = { onLogin: (user: any, org: any) => void }

export default function AuthScreen({ onLogin }: Props) {
  const [tab] = useState<'login'>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')

  const styles = {
    container: { minHeight: '100vh', background: '#0A3D1F', display: 'flex', flexDirection: 'column' as const, alignItems: 'center', justifyContent: 'center', padding: 24 },
    card: { background: '#0D4F28', borderRadius: 16, padding: 28, width: '100%', maxWidth: 400, border: '1px solid #1A6B35' },
    input: { width: '100%', background: '#0A3D1F', border: '1px solid #1A6B35', borderRadius: 8, padding: '10px 12px', color: '#fff', fontSize: 14, boxSizing: 'border-box' as const, marginBottom: 12 },
    btn: { width: '100%', background: '#C9A84C', color: '#0D4F28', border: 'none', borderRadius: 10, padding: '12px 20px', cursor: 'pointer', fontWeight: 700, fontSize: 15 },
    tab: (active: boolean) => ({ flex: 1, padding: '10px', background: 'none', border: 'none', borderBottom: active ? '2px solid #C9A84C' : '2px solid transparent', color: active ? '#C9A84C' : '#a8d5b5', cursor: 'pointer', fontWeight: 600, fontSize: 14 }),
    label: { color: '#a8d5b5', fontSize: 12, marginBottom: 4, display: 'block' as const },
    error: { color: '#f87171', fontSize: 13, marginBottom: 12, textAlign: 'center' as const },
  }

  async function handleLogin() {
    setLoading(true)
    setError('')
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) { setError('Email o contraseña incorrectos'); setLoading(false); return }
    const { data: org } = await supabase.from('organizations').select('*').eq('owner_id', data.user.id).single()
    if (!org) { setError('No se encontró organización asociada'); setLoading(false); return }
    onLogin(data.user, org)
    setLoading(false)
  }

    return (
    <div style={styles.container}>
      <img src="/logo.png" alt="Go Fútbol" style={{ width: 160, borderRadius: 14, objectFit: 'contain', marginBottom: 24 }} />
      <div style={styles.card}>
        <div style={{ marginBottom: 20 }}>
          <p style={{ color: '#C9A84C', fontWeight: 700, fontSize: 16, margin: 0, textAlign: 'center' }}>Acceso administrador</p>
        </div>

        {error && <p style={styles.error}>{error}</p>}

        <label style={styles.label}>Email</label>
        <input style={styles.input} type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="tu@email.com" />

        <label style={styles.label}>Contraseña</label>
        <div style={{ position: 'relative', marginBottom: 12 }}>
          <input style={{ ...styles.input, marginBottom: 0, paddingRight: 40 }} type={showPassword ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••••" />
          <button onClick={() => setShowPassword(!showPassword)} style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: '#a8d5b5', fontSize: 16, padding: 0 }}>
            {showPassword ? '🙈' : '👁️'}
          </button>
        </div>

        
        <button style={styles.btn} disabled={loading} onClick={tab === 'login' ? handleLogin : handleRegister}>
          {loading ? 'Cargando...' : tab === 'login' ? 'Entrar' : 'Crear cuenta'}
        </button>
      </div>
    </div>
  )
}