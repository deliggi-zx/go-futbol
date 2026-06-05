import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

const SUPER_PASSWORD = 'Go$Multi$Deportes$!1!2!3#'

export default function SuperAdmin() {
  const [authed, setAuthed] = useState(false)
  const [pwd, setPwd] = useState('')
  const [orgs, setOrgs] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [screen, setScreen] = useState<'list' | 'create'>('list')
  const [editingOrg, setEditingOrg] = useState<any>(null)

  // Crear cliente
  const [newName, setNewName] = useState('')
  const [newSlug, setNewSlug] = useState('')
  const [newEmail, setNewEmail] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [newPlan, setNewPlan] = useState('per_tournament')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (authed) loadOrgs()
  }, [authed])

  async function loadOrgs() {
    setLoading(true)
    const { data } = await supabase
      .from('organizations')
      .select('*')
      .order('created_at', { ascending: false })
    setOrgs(data ?? [])
    setLoading(false)
  }

  async function createClient() {
    setSaving(true)
    setError('')
    try {
      if (!newName || !newSlug || !newEmail || !newPassword) {
        setError('Completá todos los campos')
        setSaving(false)
        return
      }

      // Crear usuario en Supabase Auth
      const { data: authData, error: authError } = await supabase.auth.admin.createUser({
        email: newEmail,
        password: newPassword,
        email_confirm: true
      })
      if (authError) { setError(authError.message); setSaving(false); return }

      // Crear organización
      const { error: orgError } = await supabase.from('organizations').insert({
        name: newName,
        slug: newSlug,
        owner_id: authData.user.id,
        plan: newPlan,
        status: 'active',
        tournaments_remaining: newPlan === 'trial' ? 1 : 0
      })
      if (orgError) { setError(orgError.message); setSaving(false); return }

      setNewName(''); setNewSlug(''); setNewEmail(''); setNewPassword(''); setNewPlan('per_tournament')
      setScreen('list')
      loadOrgs()
    } catch (e) {
      setError('Error al crear el cliente')
    } finally {
      setSaving(false)
    }
  }

  async function toggleStatus(org: any) {
    const newStatus = org.status === 'active' ? 'suspended' : 'active'
    await supabase.from('organizations').update({ status: newStatus }).eq('id', org.id)
    loadOrgs()
  }

  async function savePlan(org: any) {
    await supabase.from('organizations').update({ plan: editingOrg.plan }).eq('id', org.id)
    setEditingOrg(null)
    loadOrgs()
  }

  const styles = {
    container: { minHeight: '100vh', background: '#0f172a', color: '#fff', padding: 0 },
    header: { background: '#1e293b', padding: '16px 20px', borderBottom: '1px solid #334155', display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
    card: { background: '#1e293b', borderRadius: 12, padding: 16, marginBottom: 10, border: '1px solid #334155' },
    input: { width: '100%', background: '#0f172a', border: '1px solid #334155', borderRadius: 8, padding: '10px 12px', color: '#fff', fontSize: 14, boxSizing: 'border-box' as const, marginBottom: 12 },
    btn: (color: string) => ({ background: color, color: '#fff', border: 'none', borderRadius: 8, padding: '10px 16px', cursor: 'pointer', fontWeight: 700, fontSize: 13 }),
    label: { color: '#94a3b8', fontSize: 12, marginBottom: 4, display: 'block' as const },
    badge: (s: string) => ({ display: 'inline-block', padding: '2px 10px', borderRadius: 20, fontSize: 11, fontWeight: 700, background: s === 'active' ? '#166534' : '#7f1d1d', color: '#fff' }),
  }

  // Login
  if (!authed) return (
    <div style={{ ...styles.container, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ background: '#1e293b', borderRadius: 16, padding: 32, width: '100%', maxWidth: 360, border: '1px solid #334155' }}>
        <p style={{ color: '#C9A84C', fontWeight: 800, fontSize: 20, textAlign: 'center', marginBottom: 24 }}>⚙️ Superadmin</p>
        <input style={styles.input} type="password" placeholder="Contraseña maestra" value={pwd} onChange={e => setPwd(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && pwd === SUPER_PASSWORD && setAuthed(true)} />
        <button style={{ ...styles.btn('#C9A84C'), width: '100%', color: '#0f172a' }}
          onClick={() => pwd === SUPER_PASSWORD ? setAuthed(true) : alert('Incorrecta')}>
          Entrar
        </button>
      </div>
    </div>
  )

  // Crear cliente
  if (screen === 'create') return (
    <div style={styles.container}>
      <div style={styles.header}>
        <button onClick={() => setScreen('list')} style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: