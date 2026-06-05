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
        <button onClick={() => setScreen('list')} style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', fontSize: 14 }}>← Volver</button>
        <p style={{ margin: 0, fontWeight: 700, color: '#C9A84C' }}>Nuevo cliente</p>
        <div style={{ width: 60 }} />
      </div>
      <div style={{ padding: 20, maxWidth: 500, margin: '0 auto' }}>
        {error && <p style={{ color: '#f87171', fontSize: 13, marginBottom: 12 }}>{error}</p>}
        <label style={styles.label}>Nombre del club</label>
        <input style={styles.input} value={newName} onChange={e => setNewName(e.target.value)} placeholder="Ej: La Dolfina" />
        <label style={styles.label}>Slug (URL)</label>
        <input style={styles.input} value={newSlug} onChange={e => setNewSlug(e.target.value.toLowerCase().replace(/\s/g, '-'))} placeholder="Ej: ladolfina" />
        <p style={{ color: '#64748b', fontSize: 11, marginTop: -8, marginBottom: 12 }}>URL pública: gopolo.app/{newSlug || 'slug'}</p>
        <label style={styles.label}>Email del admin</label>
        <input style={styles.input} type="email" value={newEmail} onChange={e => setNewEmail(e.target.value)} placeholder="admin@club.com" />
        <label style={styles.label}>Contraseña provisoria</label>
        <input style={styles.input} value={newPassword} onChange={e => setNewPassword(e.target.value)} placeholder="Ej: club2026" />
        <label style={styles.label}>Plan</label>
        <select style={{ ...styles.input, marginBottom: 20 }} value={newPlan} onChange={e => setNewPlan(e.target.value)}>
          <option value="trial">Trial (1 torneo gratis)</option>
          <option value="per_tournament">Por torneo</option>
          <option value="subscription">Suscripción</option>
        </select>
        <button style={{ ...styles.btn('#C9A84C'), width: '100%', color: '#0f172a', padding: '14px', fontSize: 15 }} onClick={createClient} disabled={saving}>
          {saving ? 'Creando...' : '✓ Crear cliente'}
        </button>
      </div>
    </div>
  )

  // Lista de clientes
  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <p style={{ margin: 0, fontWeight: 800, color: '#C9A84C', fontSize: 16 }}>⚙️ Go Polo — Superadmin</p>
        <button style={styles.btn('#1e40af')} onClick={() => setScreen('create')}>+ Nuevo cliente</button>
      </div>
      <div style={{ padding: 16, maxWidth: 700, margin: '0 auto' }}>
        <p style={{ color: '#64748b', fontSize: 12, marginBottom: 16 }}>{orgs.length} clientes registrados</p>
        {loading ? <p style={{ color: '#94a3b8', textAlign: 'center' }}>Cargando...</p> : orgs.map(org => (
          <div key={org.id} style={styles.card}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <p style={{ fontWeight: 700, fontSize: 15, margin: '0 0 4px', color: '#fff' }}>{org.name}</p>
                <p style={{ color: '#64748b', fontSize: 12, margin: '0 0 8px' }}>gopolo.app/{org.slug}</p>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' as const }}>
                  <span style={styles.badge(org.status)}>{org.status === 'active' ? '✓ Activo' : '✗ Suspendido'}</span>
                  {editingOrg?.id === org.id ? (
                    <select style={{ background: '#0f172a', border: '1px solid #334155', borderRadius: 6, color: '#fff', padding: '2px 8px', fontSize: 12 }}
                      value={editingOrg.plan} onChange={e => setEditingOrg({ ...editingOrg, plan: e.target.value })}>
                      <option value="trial">Trial</option>
                      <option value="per_tournament">Por torneo</option>
                      <option value="subscription">Suscripción</option>
                    </select>
                  ) : (
                    <span style={{ background: '#1e40af', color: '#fff', borderRadius: 20, padding: '2px 10px', fontSize: 11, fontWeight: 700 }}>
                      {org.plan === 'trial' ? 'Trial' : org.plan === 'per_tournament' ? 'Por torneo' : 'Suscripción'}
                    </span>
                  )}
                </div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 6, alignItems: 'flex-end' }}>
                <button style={styles.btn(org.status === 'active' ? '#7f1d1d' : '#166534')} onClick={() => toggleStatus(org)}>
                  {org.status === 'active' ? 'Suspender' : 'Activar'}
                </button>
                {editingOrg?.id === org.id ? (
                  <button style={styles.btn('#166534')} onClick={() => savePlan(org)}>Guardar</button>
                ) : (
                  <button style={styles.btn('#334155')} onClick={() => setEditingOrg(org)}>Editar plan</button>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}