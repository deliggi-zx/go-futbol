import { useState } from 'react'
import { supabase } from '../lib/supabase'

type Props = {
  tournament: any
  matches: any[]
  teams: any[]
  onClose: () => void
  onRefresh: () => void
}

export default function FixtureManager({ tournament, matches, teams, onClose, onRefresh }: Props) {
  const [editingMatch, setEditingMatch] = useState<any>(null)
  const [showAddForm, setShowAddForm] = useState(false)
  const [saving, setSaving] = useState(false)

  // Form state para nuevo partido o edicion
  const [formHomeId, setFormHomeId] = useState('')
  const [formAwayId, setFormAwayId] = useState('')
  const [formStage, setFormStage] = useState('group')
  const [formGroup, setFormGroup] = useState('A')
  const [formRound, setFormRound] = useState(1)

  const stages = [
    { value: 'group', label: 'Fase de grupos' },
    { value: 'round', label: 'Ronda libre' },
    { value: 'quarter', label: 'Cuartos de final' },
    { value: 'semi', label: 'Semifinal' },
    { value: 'third', label: '3er y 4to puesto' },
    { value: 'final', label: 'Final' },
  ]

  const groups = ['A', 'B', 'C', 'D']

  function openAdd() {
    setFormHomeId(teams[0]?.id ?? '')
    setFormAwayId(teams[1]?.id ?? '')
    setFormStage('group')
    setFormGroup('A')
    setFormRound(1)
    setEditingMatch(null)
    setShowAddForm(true)
  }

  function openEdit(match: any) {
    setFormHomeId(match.team_home_id)
    setFormAwayId(match.team_away_id)
    setFormStage(match.stage)
    setFormGroup(match.group_name ?? 'A')
    setFormRound(match.round ?? 1)
    setEditingMatch(match)
    setShowAddForm(true)
  }

  async function saveMatch() {
    if (!formHomeId || !formAwayId || formHomeId === formAwayId) {
      alert('Selecciona dos equipos distintos')
      return
    }
    setSaving(true)
    try {
      const data = {
        tournament_id: tournament.id,
        team_home_id: formHomeId,
        team_away_id: formAwayId,
        stage: formStage,
        group_name: formStage === 'group' ? formGroup : null,
        round: formRound,
        status: 'pending',
      }
      if (editingMatch) {
        await supabase.from('matches').update(data).eq('id', editingMatch.id)
      } else {
        await supabase.from('matches').insert(data)
      }
      setShowAddForm(false)
      setEditingMatch(null)
      onRefresh()
    } catch (e) {
      alert('Error al guardar')
    } finally {
      setSaving(false)
    }
  }

  async function deleteMatch(matchId: string) {
    if (!confirm('Eliminar este partido?')) return
    await supabase.from('matches').delete().eq('id', matchId)
    onRefresh()
  }

  async function markWalkover(match: any, winnerId: string) {
    if (!confirm('Marcar walkover? El equipo ganador avanza sin jugar.')) return
    await supabase.from('matches').update({ status: 'finished', played_at: new Date().toISOString() }).eq('id', match.id)
    // Insertar gol simbólico para el ganador (1-0)
    const loserId = winnerId === match.team_home_id ? match.team_away_id : match.team_home_id
    await supabase.from('goals').insert({ match_id: match.id, team_id: winnerId, player_id: null, chukker: 1 })
    onRefresh()
  }

  const pendingMatches = matches.filter(m => m.status === 'pending')
  const activeMatches = matches.filter(m => m.status !== 'pending')

  const styles = {
    container: { minHeight: '100vh', background: '#6B0F2B', color: '#fff' },
    header: { background: '#4A0B1E', padding: '16px', borderBottom: '1px solid #8B1A3A' },
    section: { padding: '16px' },
    card: { background: '#4A0B1E', borderRadius: 12, padding: 14, marginBottom: 8, border: '1px solid #8B1A3A' },
    input: { width: '100%', background: '#6B0F2B', border: '1px solid #8B1A3A', borderRadius: 8, padding: '8px 12px', color: '#fff', fontSize: 14, boxSizing: 'border-box' as const },
    select: { width: '100%', background: '#6B0F2B', border: '1px solid #8B1A3A', borderRadius: 8, padding: '8px 12px', color: '#fff', fontSize: 14, boxSizing: 'border-box' as const },
    btn: (color: string) => ({ background: color, color: color === '#C9A84C' ? '#4A0B1E' : '#fff', border: 'none', borderRadius: 8, padding: '8px 14px', cursor: 'pointer', fontWeight: 700, fontSize: 13 }),
    label: { color: '#d4a0b0', fontSize: 12, display: 'block', marginBottom: 4, marginTop: 10 },
    stageBadge: (stage: string) => ({
      display: 'inline-block', padding: '2px 8px', borderRadius: 20, fontSize: 11, fontWeight: 700,
      background: stage === 'group' ? '#1e40af' : stage === 'semi' ? '#7e22ce' : stage === 'final' ? '#b45309' : stage === 'third' ? '#166534' : '#334155',
      color: '#fff', marginBottom: 6
    }),
  }

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#d4a0b0', cursor: 'pointer', fontSize: 15, marginBottom: 8, padding: 0 }}>
          Volver
        </button>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 style={{ color: '#C9A84C', fontWeight: 800, fontSize: 18, margin: 0 }}>Gestionar fixture</h2>
          <button onClick={openAdd} style={styles.btn('#C9A84C')}>+ Agregar partido</button>
        </div>
      </div>

      {/* Formulario agregar/editar */}
      {showAddForm && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: 16 }}>
          <div style={{ background: '#4A0B1E', borderRadius: 16, padding: 24, width: '100%', maxWidth: 420, border: '1px solid #8B1A3A', maxHeight: '90vh', overflowY: 'auto' as const }}>
            <h3 style={{ color: '#C9A84C', fontWeight: 700, fontSize: 16, marginBottom: 16, marginTop: 0 }}>
              {editingMatch ? 'Editar partido' : 'Nuevo partido'}
            </h3>

            <label style={styles.label}>Equipo local</label>
            <select style={styles.select} value={formHomeId} onChange={e => setFormHomeId(e.target.value)}>
              {teams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>

            <label style={styles.label}>Equipo visitante</label>
            <select style={styles.select} value={formAwayId} onChange={e => setFormAwayId(e.target.value)}>
              {teams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>

            <label style={styles.label}>Etapa</label>
            <select style={styles.select} value={formStage} onChange={e => setFormStage(e.target.value)}>
              {stages.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>

            {formStage === 'group' && (
              <>
                <label style={styles.label}>Grupo</label>
                <select style={styles.select} value={formGroup} onChange={e => setFormGroup(e.target.value)}>
                  {groups.map(g => <option key={g} value={g}>Grupo {g}</option>)}
                </select>
              </>
            )}

            <label style={styles.label}>Ronda / Fecha</label>
            <input style={styles.input} type="number" min={1} max={20} value={formRound} onChange={e => setFormRound(Number(e.target.value))} />

            <div style={{ display: 'flex', gap: 8, marginTop: 20 }}>
              <button onClick={() => { setShowAddForm(false); setEditingMatch(null) }} style={styles.btn('#8B1A3A')}>Cancelar</button>
              <button onClick={saveMatch} disabled={saving} style={{ ...styles.btn('#C9A84C'), flex: 1 }}>
                {saving ? 'Guardando...' : editingMatch ? 'Guardar cambios' : 'Agregar partido'}
              </button>
            </div>
          </div>
        </div>
      )}

      <div style={styles.section}>
        {/* Partidos pendientes */}
        <p style={{ color: '#C9A84C', fontWeight: 700, fontSize: 12, letterSpacing: 1, marginBottom: 10 }}>
          PENDIENTES ({pendingMatches.length})
        </p>
        {pendingMatches.length === 0 && (
          <p style={{ color: '#d4a0b0', fontSize: 13, marginBottom: 16 }}>No hay partidos pendientes.</p>
        )}
        {pendingMatches.map(match => (
          <div key={match.id} style={styles.card}>
            <div style={styles.stageBadge(match.stage)}>
              {stages.find(s => s.value === match.stage)?.label ?? match.stage}
              {match.stage === 'group' && match.group_name && ` ${match.group_name}`}
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <span style={{ fontWeight: 700, fontSize: 14 }}>{match.team_home?.name ?? 'Por definir'}</span>
              <span style={{ color: '#d4a0b0', fontSize: 12 }}>vs</span>
              <span style={{ fontWeight: 700, fontSize: 14 }}>{match.team_away?.name ?? 'Por definir'}</span>
            </div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' as const }}>
              <button onClick={() => openEdit(match)} style={styles.btn('#334155')}>Editar</button>
              <button onClick={() => deleteMatch(match.id)} style={styles.btn('#8B1A3A')}>Eliminar</button>
              {match.team_home_id && match.team_away_id && (
                <>
                  <button onClick={() => markWalkover(match, match.team_home_id)} style={styles.btn('#166534')}>
                    W.O. {match.team_home?.name}
                  </button>
                  <button onClick={() => markWalkover(match, match.team_away_id)} style={styles.btn('#166534')}>
                    W.O. {match.team_away?.name}
                  </button>
                </>
              )}
            </div>
          </div>
        ))}

        {/* Partidos jugados */}
        {activeMatches.length > 0 && (
          <>
            <p style={{ color: '#C9A84C', fontWeight: 700, fontSize: 12, letterSpacing: 1, marginBottom: 10, marginTop: 20 }}>
              JUGADOS ({activeMatches.length})
            </p>
            {activeMatches.map(match => (
              <div key={match.id} style={{ ...styles.card, opacity: 0.7 }}>
                <div style={styles.stageBadge(match.stage)}>
                  {stages.find(s => s.value === match.stage)?.label ?? match.stage}
                  {match.stage === 'group' && match.group_name && ` ${match.group_name}`}
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontWeight: 700, fontSize: 14 }}>{match.team_home?.name}</span>
                  <span style={{ color: '#d4a0b0', fontSize: 12 }}>
                    {match.status === 'live' ? 'En vivo' : 'Finalizado'}
                  </span>
                  <span style={{ fontWeight: 700, fontSize: 14 }}>{match.team_away?.name}</span>
                </div>
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  )
}
