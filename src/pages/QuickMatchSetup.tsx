import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { Avatar } from '../components/Avatar'
import { slugify } from '../lib/slug'
import { downloadTeamsTemplate, parseTeamsExcel } from '../lib/teamsExcel'

type Props = { onCreated: (tournament: any, matchId: string) => void; orgId?: string }

const emptyTeam = () => ({
  name: '', logo: null as File | null,
  players: [] as { name: string; photo: File | null; numero: number; bio: string }[],
})

export default function QuickMatchSetup({ onCreated, orgId }: Props) {
  const [name, setName] = useState('')
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [chukkers, setChukkers] = useState(2)
  const [chukkerDuration, setChukkerDuration] = useState(45)
  const [scorerPassword, setScorerPassword] = useState('')
  const [teams, setTeams] = useState([emptyTeam(), emptyTeam()])
  const [saving, setSaving] = useState(false)

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
      ? { ...t, players: [...t.players, { name: '', photo: null, numero: 0, bio: '' }] }
      : t
    ))
  }

  function removePlayer(teamIdx: number, playerIdx: number) {
    setTeams(prev => prev.map((t, i) => i === teamIdx
      ? { ...t, players: t.players.filter((_, j) => j !== playerIdx) }
      : t
    ))
  }

  async function handleExcelUpload(file: File) {
    const parsed = await parseTeamsExcel(file)
    if (parsed.length === 0) { alert('No se encontraron equipos en el archivo'); return }
    if (parsed.length < 2) { alert('El archivo debe tener al menos 2 equipos (local y visitante)'); return }

    // Partido individual: siempre son 2 equipos (local/visitante) — si el
    // Excel trae más, se usan los dos primeros y se avisa.
    const [home, away] = parsed
    setTeams([
      { name: home.name, logo: home.logo, players: home.players.map(p => ({ name: p.name, photo: p.photo, numero: p.numero, bio: p.bio })) },
      { name: away.name, logo: away.logo, players: away.players.map(p => ({ name: p.name, photo: p.photo, numero: p.numero, bio: p.bio })) },
    ])
    alert(parsed.length > 2
      ? `✓ Se cargaron los primeros 2 equipos (${home.name} vs ${away.name}). Se ignoraron ${parsed.length - 2} equipo(s) adicional(es) del archivo.`
      : `✓ Equipos importados: ${home.name} vs ${away.name}`)
  }

  async function uploadImage(file: File, path: string): Promise<string | null> {
    const { error } = await supabase.storage.from('avatars').upload(path, file, { upsert: true })
    if (error) return null
    const { data } = supabase.storage.from('avatars').getPublicUrl(path)
    return data.publicUrl
  }

  async function handleCreate() {
    if (!name || !date) return alert('Completá nombre y fecha')
    if (!teams[0].name.trim() || !teams[1].name.trim()) return alert('Completá el nombre de los dos equipos')
    setSaving(true)
    try {
      const tournamentId = crypto.randomUUID()
      const baseSlug = slugify(name) || 'partido'
      const { data: slugCollision } = await supabase
        .from('tournaments')
        .select('id')
        .eq('slug', baseSlug)
        .eq('app', 'futbol')
        .maybeSingle()
      const slug = slugCollision ? `${baseSlug}-${tournamentId.slice(0, 4)}` : baseSlug

      const { data: tournament, error: tournamentError } = await supabase
        .from('tournaments')
        .insert({
          id: tournamentId, name, date, periods_per_match: chukkers, status: 'setup',
          format: 'partido_unico', team_count: 2, num_groups: 1, has_third_place: false,
          org_id: orgId ?? null, scorer_password: scorerPassword || null,
          chukker_duration_minutes: chukkerDuration, slug, app: 'futbol',
        })
        .select('id, name, date, format, status, team_count, num_groups, has_third_place, org_id, slug').single()
      if (tournamentError) throw new Error('INSERT torneo: ' + tournamentError.message)
      if (!tournament) throw new Error('INSERT torneo devolvió null')

      const savedTeamIds: string[] = []
      for (const team of teams) {
        let logoUrl = null
        if (team.logo) logoUrl = await uploadImage(team.logo, `logos/${tournament.id}_${team.name}.jpg`)

        const { data: savedTeam, error: teamError } = await supabase
          .from('teams')
          .insert({ tournament_id: tournament.id, name: team.name, logo_url: logoUrl, app: 'futbol' })
          .select().single()
        if (teamError || !savedTeam) throw new Error('INSERT equipo: ' + (teamError?.message ?? ''))
        savedTeamIds.push(savedTeam.id)

        const validPlayers = team.players.filter(p => p.name.trim())
        for (const player of validPlayers) {
          let photoUrl = null
          if (player.photo) photoUrl = await uploadImage(player.photo, `players/${savedTeam.id}_${player.name}.jpg`)
          const { error: playerError } = await supabase.from('players').insert({
            team_id: savedTeam.id, name: player.name, photo_url: photoUrl,
            position: player.numero, bio: player.bio, app: 'futbol',
          })
          if (playerError) throw new Error(`INSERT jugador ${player.name}: ${playerError.message}`)
        }
      }

      const { data: match, error: matchError } = await supabase
        .from('matches')
        .insert({
          tournament_id: tournament.id,
          team_home_id: savedTeamIds[0],
          team_away_id: savedTeamIds[1],
          stage: 'final', status: 'pending', app: 'futbol',
        })
        .select().single()
      if (matchError || !match) throw new Error('INSERT partido: ' + (matchError?.message ?? ''))

      onCreated(tournament, match.id)
    } catch (e: any) {
      console.error('ERROR DETALLADO:', e)
      alert('Error al crear el partido: ' + (e?.message ?? JSON.stringify(e)))
    } finally {
      setSaving(false)
    }
  }

  const styles = {
    container: { minHeight: '100vh', background: '#0A3D1F', color: '#fff', padding: '24px 16px' },
    title: { fontSize: 28, fontWeight: 800, color: '#C9A84C', textAlign: 'center' as const, marginBottom: 8 },
    sub: { textAlign: 'center' as const, color: '#a8d5b5', marginBottom: 32 },
    card: { background: '#0D4F28', borderRadius: 16, padding: 24, marginBottom: 16, maxWidth: 600, margin: '0 auto 16px' },
    label: { fontSize: 13, color: '#a8d5b5', marginBottom: 6, display: 'block' },
    input: { width: '100%', background: '#0A3D1F', border: '1px solid #1A6B35', borderRadius: 8, padding: '10px 12px', color: '#fff', fontSize: 15, boxSizing: 'border-box' as const },
    btn: { background: '#C9A84C', color: '#0D4F28', fontWeight: 700, fontSize: 16, border: 'none', borderRadius: 10, padding: '14px 24px', cursor: 'pointer', width: '100%', marginTop: 16 },
    btnSm: { background: '#1A6B35', color: '#fff', border: 'none', borderRadius: 8, padding: '6px 12px', cursor: 'pointer', fontSize: 13, marginTop: 8 },
    teamCard: { background: '#0D4F28', borderRadius: 12, padding: 16, marginBottom: 12, border: '1px solid #1A6B35' },
    row: { display: 'flex', gap: 12, alignItems: 'center' },
  }

  return (
    <div style={styles.container}>
      <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 16 }}>
        <img src="/logo.png" alt="Go Fútbol" style={{ width: 80, height: 80, borderRadius: 12, objectFit: 'contain' }} />
      </div>
      <h1 style={styles.title}>GO FÚTBOL</h1>
      <p style={styles.sub}>Partido suelto</p>

      <div style={styles.card}>
        <label style={styles.label}>Nombre del partido</label>
        <input style={styles.input} value={name} onChange={e => setName(e.target.value)} placeholder="Ej: Amistoso sábado" />

        <label style={{ ...styles.label, marginTop: 16 }}>Fecha</label>
        <input style={styles.input} type="date" value={date} onChange={e => setDate(e.target.value)} />

        <label style={{ ...styles.label, marginTop: 16 }}>Tiempos por partido</label>
        <input style={styles.input} type="number" min={1} max={8} value={chukkers} onChange={e => setChukkers(Number(e.target.value))} />

        <label style={{ ...styles.label, marginTop: 16 }}>Duración del tiempo (minutos)</label>
        <input style={styles.input} type="number" min={1} max={45} value={chukkerDuration} onChange={e => setChukkerDuration(Number(e.target.value))} />

        <label style={{ ...styles.label, marginTop: 16 }}>Contraseña para cargadores de goles (opcional)</label>
        <input style={styles.input} value={scorerPassword} onChange={e => setScorerPassword(e.target.value)} placeholder="Ej: futbol2026" />
      </div>

      <div style={{ maxWidth: 600, margin: '0 auto' }}>
        {/* Importar desde Excel */}
        <div style={{ background: '#0D4F28', borderRadius: 12, padding: 16, marginBottom: 16, border: '1px solid #1A6B35' }}>
          <p style={{ color: '#C9A84C', fontWeight: 700, fontSize: 14, margin: '0 0 8px' }}>Importar desde Excel</p>
          <p style={{ color: '#a8d5b5', fontSize: 12, margin: '0 0 12px' }}>Descargá la plantilla, completala con los dos equipos (local y visitante) y subila para cargar el plantel automáticamente.</p>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' as const }}>
            <button onClick={downloadTeamsTemplate} style={{ ...styles.btnSm, background: '#1e40af', marginTop: 0 }}>
              ↓ Descargar plantilla
            </button>
            <label style={{ ...styles.btnSm, marginTop: 0, cursor: 'pointer', display: 'inline-block' }}>
              ↑ Subir Excel
              <input type="file" accept=".xlsx,.xls" style={{ display: 'none' }} onChange={e => {
                const file = e.target.files?.[0]
                if (file) handleExcelUpload(file)
              }} />
            </label>
          </div>
        </div>
        {teams.map((team, i) => (
          <div key={i} style={styles.teamCard}>
            <p style={{ color: '#a8d5b5', fontSize: 13, marginBottom: 12 }}>{i === 0 ? 'Equipo local' : 'Equipo visitante'}</p>
            <div style={{ ...styles.row, marginBottom: 8 }}>
              <Avatar url={team.logo ? URL.createObjectURL(team.logo) : null} name={team.name || '?'} size={48} bordered={false} />
              <div style={{ flex: 1 }}>
                <input style={{ ...styles.input, marginBottom: 8 }} placeholder="Nombre del equipo" value={team.name} onChange={e => updateTeam(i, 'name', e.target.value)} />
              </div>
            </div>
            <label style={{ ...styles.label, fontSize: 11 }}>Logo del equipo (opcional)</label>
            <input type="file" accept="image/*" style={{ color: '#a8d5b5', fontSize: 12, marginBottom: 8 }} onChange={e => updateTeam(i, 'logo', e.target.files?.[0] ?? null)} />

            <p style={{ color: '#a8d5b5', fontSize: 12, marginTop: 12, marginBottom: 8 }}>Plantel (opcional):</p>
            {team.players.map((player, j) => (
              <div key={j} style={{ ...styles.row, marginBottom: 8, alignItems: 'flex-start' }}>
                <Avatar url={player.photo ? URL.createObjectURL(player.photo) : null} name={player.name || '?'} size={36} bordered={false} />
                <div style={{ flex: 1 }}>
                  <input style={{ ...styles.input, marginBottom: 4 }} placeholder={`Jugador ${j + 1}`} value={player.name} onChange={e => updatePlayer(i, j, 'name', e.target.value)} />
                  <input style={{ ...styles.input, width: 80, marginBottom: 4 }} type="number" placeholder="Nro" min={0} max={99} value={player.numero} onChange={e => updatePlayer(i, j, 'numero', Number(e.target.value))} />
                  <input style={{ ...styles.input, marginBottom: 4 }} placeholder="Reseña breve (opcional)" value={player.bio} onChange={e => updatePlayer(i, j, 'bio', e.target.value)} />
                  <input type="file" accept="image/*" style={{ color: '#a8d5b5', fontSize: 11 }} onChange={e => updatePlayer(i, j, 'photo', e.target.files?.[0] ?? null)} />
                </div>
                <button onClick={() => removePlayer(i, j)} style={{ background: 'none', border: 'none', color: '#a8d5b5', cursor: 'pointer', fontSize: 18, padding: '4px 8px' }}>×</button>
              </div>
            ))}
            <button style={styles.btnSm} onClick={() => addPlayer(i)}>+ Agregar jugador</button>
          </div>
        ))}

        <button style={styles.btn} disabled={saving} onClick={handleCreate}>
          {saving ? 'Creando...' : '⚽ Crear e ir al partido'}
        </button>
      </div>
    </div>
  )
}
