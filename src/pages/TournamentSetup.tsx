import { useState } from 'react'
import { supabase } from '../lib/supabase'

type Props = { onCreated: (t: any) => void }

const emptyTeam = () => ({
  name: '', handicap: 0, group: 'A', logo: null as File | null,
  players: [{ name: '', photo: null as File | null, handicap: 0, position: 0, bio: '', mares: '' }]
})

const DEFAULT_AWARDS = ['Campeon', 'MBP (Mejor Jugador)', 'Goleador', 'Manta Mejor Yegua', 'Revelacion']

export default function TournamentSetup({ onCreated }: Props) {
  const [name, setName] = useState('Tribu Polo 2026')
  const [date, setDate] = useState('')
  const [chukkers, setChukkers] = useState(4)
  const [teamCount, setTeamCount] = useState(8)
  const [teams, setTeams] = useState(() => Array.from({ length: 8 }, (_, i) => ({ ...emptyTeam(), group: i < 4 ? 'A' : 'B' })))
  const [awards, setAwards] = useState<string[]>(DEFAULT_AWARDS)
  const [newAward, setNewAward] = useState('')
  const [saving, setSaving] = useState(false)
  const [step, setStep] = useState<'config' | 'teams' | 'awards'>('config')

  function updateTeam(i: number, field: string, value: any) {
    setTeams(prev => prev.map((t, idx) => idx === i ? { ...t, [field]: value } : t))
  }

  function updatePlayer(teamIdx: number, playerIdx: number, field: string, value: any) {
    setTeams(prev => prev.map((t, i) => i === teamIdx
      ? { ...t, players: t.players.map((p, j) => j === playerIdx ? { ...p, [field]: value } : p) }
      : t
    ))
  }

  function addPlayer(teamIdx: number) {
    setTeams(prev => prev.map((t, i) => i === teamIdx
      ? { ...t, players: [...t.players, { name: '', photo: null, handicap: 0, position: 0, bio: '', mares: '' }] }
      : t
    ))
  }

  function addAward() {
    if (!newAward.trim()) return
    setAwards(prev => [...prev, newAward.trim()])
    setNewAward('')
  }

  function removeAward(i: number) {
    setAwards(prev => prev.filter((_, idx) => idx !== i))
  }

  async function uploadImage(file: File, path: string): Promise<string | null> {
    const { error } = await supabase.storage.from('avatars').upload(path, file, { upsert: true })
    if (error) return null
    const { data } = supabase.storage.from('avatars').getPublicUrl(path)
    return data.publicUrl
  }

  async function handleCreate() {
    if (!name || !date) return alert('Completa nombre y fecha')
    setSaving(true)
    try {
      const { data: tournament } = await supabase
        .from('tournaments')
        .insert({ name, date, chukkers_per_match: chukkers, status: 'setup' })
        .select().single()

      if (awards.length > 0) {
        await supabase.from('award_types').insert(
          awards.map((a, i) => ({ tournament_id: tournament.id, name: a, order_index: i }))
        )
      }

      const activeTeams = teams.slice(0, teamCount)
      for (const team of activeTeams) {
        let logoUrl = null
        if (team.logo) {
          logoUrl = await uploadImage(team.logo, `logos/${tournament.id}_${team.name}.jpg`)
        }

        const { data: savedTeam } = await supabase
          .from('teams')
          .insert({ tournament_id: tournament.id, name: team.name, handicap: team.handicap, group_name: team.group, logo_url: logoUrl })
          .select().single()

        const validPlayers = team.players.filter(p => p.name.trim())
        for (const player of validPlayers) {
          let photoUrl = null
          if (player.photo) {
            photoUrl = await uploadImage(player.photo, `players/${savedTeam.id}_${player.name}.jpg`)
          }
          await supabase.from('players').insert({
            team_id: savedTeam.id,
            name: player.name,
            photo_url: photoUrl,
            handicap: player.handicap,
            position: player.position,
            bio: player.bio,
            mares: player.mares,
          })
        }
      }

      await generateGroupFixture(tournament.id, activeTeams)
      onCreated(tournament)
    } catch (e) {
      alert('Error al crear el torneo')
      console.error(e)
    } finally {
      setSaving(false)
    }
  }

  async function generateGroupFixture(tournamentId: string, _activeTeams: any[]) {
    const groups = ['A', 'B']
    for (const group of groups) {
      const { data: savedTeams } = await supabase
        .from('teams').select('id, name, group_name')
        .eq('tournament_id', tournamentId).eq('group_name', group)
      if (!savedTeams) continue
      for (let i = 0; i < savedTeams.length; i++) {
        for (let j = i + 1; j < savedTeams.length; j++) {
          await supabase.from('matches').insert({
            tournament_id: tournamentId,
            team_home_id: savedTeams[i].id,
            team_away_id: savedTeams[j].id,
            stage: 'group', group_name: group, status: 'pending'
          })
        }
      }
    }
  }

  const styles = {
    container: { minHeight: '100vh', background: '#6B0F2B', color: '#fff', padding: '24px 16px' },
    title: { fontSize: 28, fontWeight: 800, color: '#C9A84C', textAlign: 'center' as const, marginBottom: 8 },
    sub: { textAlign: 'center' as const, color: '#d4a0b0', marginBottom: 32 },
    card: { background: '#4A0B1E', borderRadius: 16, padding: 24, marginBottom: 16, maxWidth: 600, margin: '0 auto 16px' },
    label: { fontSize: 13, color: '#d4a0b0', marginBottom: 6, display: 'block' },
    input: { width: '100%', background: '#6B0F2B', border: '1px solid #8B1A3A', borderRadius: 8, padding: '10px 12px', color: '#fff', fontSize: 15, boxSizing: 'border-box' as const },
    btn: { background: '#C9A84C', color: '#4A0B1E', fontWeight: 700, fontSize: 16, border: 'none', borderRadius: 10, padding: '14px 24px', cursor: 'pointer', width: '100%', marginTop: 16 },
    btnSm: { background: '#8B1A3A', color: '#fff', border: 'none', borderRadius: 8, padding: '6px 12px', cursor: 'pointer', fontSize: 13, marginTop: 8 },
    teamCard: { background: '#4A0B1E', borderRadius: 12, padding: 16, marginBottom: 12, border: '1px solid #8B1A3A' },
    row: { display: 'flex', gap: 12, alignItems: 'center' },
  }

  function Avatar({ url, name, size = 32 }: { url?: string | null; name: string; size?: number }) {
    if (url) return <img src={url} alt={name} style={{ width: size, height: size, borderRadius: '50%', objectFit: 'cover' }} />
    return (
      <div style={{ width: size, height: size, borderRadius: '50%', background: '#8B1A3A', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: size * 0.4, fontWeight: 700, color: '#C9A84C', flexShrink: 0 }}>
        {name.charAt(0).toUpperCase()}
      </div>
    )
  }

  return (
    <div style={styles.container}>
      <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 16 }}>
        <img src="/logo.jpg" alt="Tribu de Polo" style={{ width: 80, height: 80, borderRadius: 12, objectFit: 'cover' }} />
      </div>
      <h1 style={styles.title}>TRIBU POLO</h1>
      <p style={styles.sub}>Configuracion del torneo</p>

      {/* Stepper */}
      <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginBottom: 24 }}>
        {(['config', 'teams', 'awards'] as const).map((s, i) => (
          <div key={s} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ width: 28, height: 28, borderRadius: '50%', background: step === s ? '#C9A84C' : '#8B1A3A', color: step === s ? '#4A0B1E' : '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 13 }}>{i + 1}</div>
            <span style={{ fontSize: 12, color: step === s ? '#C9A84C' : '#d4a0b0' }}>{s === 'config' ? 'Config' : s === 'teams' ? 'Equipos' : 'Premios'}</span>
            {i < 2 && <span style={{ color: '#8B1A3A' }}>-</span>}
          </div>
        ))}
      </div>

      {step === 'config' && (
        <div style={styles.card}>
          <label style={styles.label}>Nombre del torneo</label>
          <input style={styles.input} value={name} onChange={e => setName(e.target.value)} />

          <label style={{ ...styles.label, marginTop: 16 }}>Fecha</label>
          <input style={styles.input} type="date" value={date} onChange={e => setDate(e.target.value)} />

          <label style={{ ...styles.label, marginTop: 16 }}>Chukkers por partido</label>
          <input style={styles.input} type="number" min={1} max={8} value={chukkers} onChange={e => setChukkers(Number(e.target.value))} />

          <label style={{ ...styles.label, marginTop: 16 }}>Cantidad de equipos</label>
          <div style={styles.row}>
            {[4, 8].map(n => (
              <button key={n} onClick={() => { setTeamCount(n); setTeams(Array.from({ length: n }, (_, i) => ({ ...emptyTeam(), group: i < n / 2 ? 'A' : 'B' }))) }}
                style={{ ...styles.btnSm, background: teamCount === n ? '#C9A84C' : '#8B1A3A', color: teamCount === n ? '#4A0B1E' : '#fff', flex: 1 }}>
                {n} equipos
              </button>
            ))}
          </div>

          <button style={styles.btn} onClick={() => setStep('teams')}>Siguiente - Cargar equipos</button>
        </div>
      )}

      {step === 'teams' && (
        <div style={{ maxWidth: 600, margin: '0 auto' }}>
          {teams.slice(0, teamCount).map((team, i) => (
            <div key={i} style={styles.teamCard}>
              <div style={{ ...styles.row, marginBottom: 12 }}>
                <span style={{ color: '#C9A84C', fontWeight: 700, fontSize: 13 }}>GRUPO {team.group}</span>
                <span style={{ color: '#d4a0b0', fontSize: 13 }}>Equipo {i + 1}</span>
              </div>

              <div style={{ ...styles.row, marginBottom: 8 }}>
                <Avatar url={team.logo ? URL.createObjectURL(team.logo) : null} name={team.name || '?'} size={48} />
                <div style={{ flex: 1 }}>
                  <input style={{ ...styles.input, marginBottom: 8 }} placeholder="Nombre del equipo" value={team.name} onChange={e => updateTeam(i, 'name', e.target.value)} />
                </div>
              </div>
              <label style={{ ...styles.label, fontSize: 11 }}>Logo del equipo (opcional)</label>
              <input type="file" accept="image/*" style={{ color: '#d4a0b0', fontSize: 12, marginBottom: 8 }} onChange={e => updateTeam(i, 'logo', e.target.files?.[0] ?? null)} />

              <input style={styles.input} type="number" placeholder="Handicap del equipo" value={team.handicap} onChange={e => updateTeam(i, 'handicap', Number(e.target.value))} />

              <p style={{ color: '#d4a0b0', fontSize: 12, marginTop: 12, marginBottom: 8 }}>Jugadores:</p>
              {team.players.map((player, j) => (
                <div key={j} style={{ ...styles.row, marginBottom: 8, alignItems: 'flex-start' }}>
                  <Avatar url={player.photo ? URL.createObjectURL(player.photo) : null} name={player.name || '?'} size={36} />
                  <div style={{ flex: 1 }}>
                    <input style={{ ...styles.input, marginBottom: 4 }} placeholder={`Jugador ${j + 1}`} value={player.name} onChange={e => updatePlayer(i, j, 'name', e.target.value)} />
                    <div style={{ display: 'flex', gap: 4, marginBottom: 4 }}>
                      <input style={{ ...styles.input, width: 80 }} type="number" placeholder="Hcp" min={0} max={10} value={player.handicap} onChange={e => updatePlayer(i, j, 'handicap', Number(e.target.value))} />
                      <input style={{ ...styles.input, width: 80 }} type="number" placeholder="Pos (1-4)" min={1} max={4} value={player.position} onChange={e => updatePlayer(i, j, 'position', Number(e.target.value))} />
                    </div>
                    <input style={{ ...styles.input, marginBottom: 4 }} placeholder="Resena breve (opcional)" value={player.bio} onChange={e => updatePlayer(i, j, 'bio', e.target.value)} />
                    <input style={{ ...styles.input, marginBottom: 4 }} placeholder="Yeguas (opcional)" value={player.mares} onChange={e => updatePlayer(i, j, 'mares', e.target.value)} />
                    <input type="file" accept="image/*" style={{ color: '#d4a0b0', fontSize: 11 }} onChange={e => updatePlayer(i, j, 'photo', e.target.files?.[0] ?? null)} />
                  </div>
                </div>
              ))}
              <button style={styles.btnSm} onClick={() => addPlayer(i)}>+ Agregar jugador</button>
            </div>
          ))}
          <div style={{ display: 'flex', gap: 12 }}>
            <button style={{ ...styles.btn, background: '#8B1A3A', color: '#fff' }} onClick={() => setStep('config')}>Volver</button>
            <button style={styles.btn} onClick={() => setStep('awards')}>Siguiente - Premios</button>
          </div>
        </div>
      )}

      {step === 'awards' && (
        <div style={{ maxWidth: 600, margin: '0 auto' }}>
          <div style={styles.teamCard}>
            <p style={{ color: '#C9A84C', fontWeight: 700, fontSize: 14, marginBottom: 4 }}>Premios del torneo</p>
            <p style={{ color: '#d4a0b0', fontSize: 12, marginBottom: 16 }}>Define que premios se van a entregar. Al finalizar el torneo podras cargar foto y ganador de cada uno.</p>

            {awards.map((award, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <div style={{ flex: 1, background: '#6B0F2B', border: '1px solid #8B1A3A', borderRadius: 8, padding: '10px 12px', color: '#fff', fontSize: 14 }}>
                  {award}
                </div>
                <button onClick={() => removeAward(i)} style={{ background: 'none', border: 'none', color: '#d4a0b0', cursor: 'pointer', fontSize: 18, padding: '4px 8px' }}>x</button>
              </div>
            ))}

            <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
              <input style={{ ...styles.input, flex: 1 }} placeholder="Nuevo premio..." value={newAward} onChange={e => setNewAward(e.target.value)} onKeyDown={e => e.key === 'Enter' && addAward()} />
              <button onClick={addAward} style={{ background: '#8B1A3A', color: '#fff', border: 'none', borderRadius: 8, padding: '10px 16px', cursor: 'pointer', fontWeight: 700 }}>+</button>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 12 }}>
            <button style={{ ...styles.btn, background: '#8B1A3A', color: '#fff' }} onClick={() => setStep('teams')}>Volver</button>
            <button style={styles.btn} onClick={handleCreate} disabled={saving}>
              {saving ? 'Creando...' : 'Crear torneo'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
