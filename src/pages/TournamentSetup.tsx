import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { Avatar } from '../components/Avatar'
import { slugify } from '../lib/slug'
import { downloadTeamsTemplate, parseTeamsExcel } from '../lib/teamsExcel'

type Props = { onCreated: (t: any) => void; orgId?: string }

const MAX_INTRO_VIDEO_BYTES = 3 * 1024 * 1024

const emptyTeam = (group: string | null = 'A') => ({
  name: '', group, logo: null as File | null,
  players: [{ name: '', photo: null as File | null, video: null as File | null, numero: 0, goles: 0, titular: 'S', bio: '' }]
})

const DEFAULT_AWARDS = ['Campeón', 'Mejor Jugador', 'Revelación', 'Goleador', 'Mejor Arquero']

const FORMATS = [
  { value: 'groups_knockout', label: 'Grupos + Eliminacion directa', desc: 'Fase de grupos seguida de semifinales y final' },
  { value: 'round_robin', label: 'Todos contra todos', desc: 'Cada equipo juega contra todos. Los 2 primeros van a la final' },
  { value: 'knockout', label: 'Eliminacion directa', desc: 'Cruces directos desde el inicio, sin fase de grupos' },
]

const TEAM_COUNTS = [4, 6, 8, 10, 12, 16, 24, 32, 48]

function getGroupsConfig(teamCount: number, format: string): { numGroups: number; groupNames: string[] } {
  if (format === 'round_robin' || format === 'knockout') {
    return { numGroups: 1, groupNames: ['A'] }
  }
  if (teamCount <= 4) return { numGroups: 2, groupNames: ['A', 'B'] }
  if (teamCount <= 6) return { numGroups: 2, groupNames: ['A', 'B'] }
  if (teamCount <= 8) return { numGroups: 2, groupNames: ['A', 'B'] }
  if (teamCount <= 12) return { numGroups: 3, groupNames: ['A', 'B', 'C'] }
  if (teamCount <= 16) return { numGroups: 4, groupNames: ['A', 'B', 'C', 'D'] }
  if (teamCount <= 24) return { numGroups: 6, groupNames: ['A', 'B', 'C', 'D', 'E', 'F'] }
  return { numGroups: 8, groupNames: ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'] }
}

export default function TournamentSetup({ onCreated, orgId }: Props) {
  const [name, setName] = useState('')
  const [date, setDate] = useState('')
  const [chukkers, setChukkers] = useState(2)
  const [teamCount, setTeamCount] = useState(8)
  const [format, setFormat] = useState('groups_knockout')
  const [hasThirdPlace, setHasThirdPlace] = useState(false)
  const [teams, setTeams] = useState(() => Array.from({ length: 8 }, (_, i) => emptyTeam(i < 4 ? 'A' : 'B')))
  const [awards, setAwards] = useState<string[]>(DEFAULT_AWARDS)
  const [newAward, setNewAward] = useState('')
  const [saving, setSaving] = useState(false)
  const [scorerPassword, setScorerPassword] = useState('')
  const [chukkerDuration, setChukkerDuration] = useState(45)
  const [step, setStep] = useState<'config' | 'teams' | 'awards'>('config')

  const { groupNames } = getGroupsConfig(teamCount, format)

  function handleTeamCountChange(n: number) {
    setTeamCount(n)
    const { groupNames } = getGroupsConfig(n, format)
    const newTeams = Array.from({ length: n }, (_, i) => {
      const groupIndex = Math.floor(i / Math.ceil(n / groupNames.length))
      return emptyTeam(groupNames[Math.min(groupIndex, groupNames.length - 1)])
    })
    setTeams(newTeams)
  }

  function handleFormatChange(f: string) {
    setFormat(f)
    const { groupNames } = getGroupsConfig(teamCount, f)
    const newTeams = Array.from({ length: teamCount }, (_, i) => {
      const groupIndex = Math.floor(i / Math.ceil(teamCount / groupNames.length))
      return { ...teams[i] ?? emptyTeam(), group: groupNames[Math.min(groupIndex, groupNames.length - 1)] }
    })
    setTeams(newTeams)
  }

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
    ? { ...t, players: [...t.players, { name: '', photo: null, video: null, numero: 0, goles: 0, titular: 'S', bio: '' }] }
    : t
  ))
}

  function addAward() {
    if (!newAward.trim()) return
    setAwards(prev => [...prev, newAward.trim()])
    setNewAward('')
  }
  async function handleExcelUpload(file: File) {
    const parsed = await parseTeamsExcel(file)
    if (parsed.length === 0) { alert('No se encontraron equipos en el archivo'); return }

    const importedTeams = format === 'knockout' ? parsed.map(t => ({ ...t, group: null })) : parsed

    // Actualizar cantidad de equipos y teams
    setTeamCount(importedTeams.length)
    setTeams(importedTeams)
    alert(`✓ ${importedTeams.length} equipos importados correctamente`)
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
      const tournamentId = crypto.randomUUID()
      const baseSlug = slugify(name) || 'torneo'
      const { data: slugCollision } = await supabase
        .from('tournaments')
        .select('id')
        .eq('slug', baseSlug)
        .eq('app', 'futbol')
        .maybeSingle()
      const slug = slugCollision ? `${baseSlug}-${tournamentId.slice(0, 4)}` : baseSlug

      const { data: tournament, error: tournamentError } = await supabase
        .from('tournaments')
        .insert({ id: tournamentId, name, date, periods_per_match: chukkers, status: 'setup', format, team_count: teamCount, num_groups: getGroupsConfig(teamCount, format).numGroups, has_third_place: hasThirdPlace, org_id: orgId ?? null, scorer_password: scorerPassword || null, chukker_duration_minutes: chukkerDuration, slug, app: 'futbol' })
        .select('id, name, date, format, status, team_count, num_groups, has_third_place, org_id, slug').single()
      if (tournamentError) throw new Error('INSERT torneo: ' + tournamentError.message + ' code: ' + tournamentError.code)
      if (!tournament) throw new Error('INSERT torneo devolvió null')

      if (awards.length > 0) {
        const { error: awardsError } = await supabase.from('award_types').insert(
          awards.map((a, i) => ({ tournament_id: tournament.id, name: a, order_index: i, app: 'futbol' }))
        )
        if (awardsError) throw new Error('INSERT awards: ' + awardsError.message + ' code: ' + awardsError.code)
      }

      const activeTeams = teams.slice(0, teamCount)
      for (const team of activeTeams) {
        let logoUrl = null
        if (team.logo) logoUrl = await uploadImage(team.logo, `logos/${tournament.id}_${team.name}.jpg`)

        const { data: savedTeam } = await supabase
          .from('teams')
          .insert({ tournament_id: tournament.id, name: team.name, group_name: team.group, logo_url: logoUrl, app: 'futbol' })
          .select().single()

        const validPlayers = team.players.filter(p => p.name.trim())
        for (const player of validPlayers) {
          let photoUrl = null
          if (player.photo) photoUrl = await uploadImage(player.photo, `players/${savedTeam.id}_${player.name}.jpg`)
          let videoUrl = null
          if (player.video) videoUrl = await uploadImage(player.video, `player-videos/${savedTeam.id}_${player.name}.mp4`)
          const { error: playerError } = await supabase.from('players').insert({
            team_id: savedTeam.id, name: player.name, photo_url: photoUrl, intro_video_url: videoUrl,
            position: player.numero, bio: player.bio, app: 'futbol',
          })
          if (playerError) throw new Error(`INSERT jugador ${player.name}: ${playerError.message}`)
        }
      }

      await generateFixture(tournament.id, activeTeams, format)
      onCreated(tournament)
    } catch (e: any) {
      console.error('ERROR DETALLADO:', e)
      alert('Error al crear el torneo: ' + (e?.message ?? JSON.stringify(e)))
    } finally {
      setSaving(false)
    }
  }

  async function generateFixture(tournamentId: string, activeTeams: any[], fmt: string) {
    if (fmt === 'round_robin') {
      const { data: savedTeams } = await supabase.from('teams').select('id').eq('tournament_id', tournamentId).eq('app', 'futbol')
      if (!savedTeams) return
      for (let i = 0; i < savedTeams.length; i++) {
        for (let j = i + 1; j < savedTeams.length; j++) {
          await supabase.from('matches').insert({
            tournament_id: tournamentId,
            team_home_id: savedTeams[i].id,
            team_away_id: savedTeams[j].id,
            stage: 'group', group_name: 'A', status: 'pending', app: 'futbol',
          })
        }
      }
    } else if (fmt === 'knockout') {
      const { data: savedTeams } = await supabase.from('teams').select('id').eq('tournament_id', tournamentId).eq('app', 'futbol').order('created_at', { ascending: true })
      if (!savedTeams) return
      const pairCount = Math.floor(savedTeams.length / 2)
      const stage = savedTeams.length <= 2 ? 'final' : savedTeams.length <= 4 ? 'semi' : 'quarter'
      const inserts: any[] = []
      for (let i = 0; i < pairCount; i++) {
        inserts.push({
          tournament_id: tournamentId,
          team_home_id: savedTeams[i * 2].id,
          team_away_id: savedTeams[i * 2 + 1].id,
          stage, status: 'pending', round: 1, match_number: i + 1, app: 'futbol',
        })
      }
      // Cantidad impar: el equipo sobrante queda "esperando rival" — el admin
      // decide más tarde si le asigna un rival o le da pase libre.
      if (savedTeams.length % 2 === 1) {
        inserts.push({
          tournament_id: tournamentId,
          team_home_id: savedTeams[savedTeams.length - 1].id,
          team_away_id: null,
          stage, status: 'pending', round: 1, match_number: pairCount + 1, is_bye_slot: true, app: 'futbol',
        })
      }
      if (inserts.length > 0) await supabase.from('matches').insert(inserts)
    } else {
      // groups_knockout — formato actual
      const groups = [...new Set(activeTeams.map(t => t.group))]
      for (const group of groups) {
        const { data: savedTeams } = await supabase
          .from('teams').select('id').eq('tournament_id', tournamentId).eq('group_name', group).eq('app', 'futbol')
        if (!savedTeams) continue
        for (let i = 0; i < savedTeams.length; i++) {
          for (let j = i + 1; j < savedTeams.length; j++) {
            await supabase.from('matches').insert({
              tournament_id: tournamentId,
              team_home_id: savedTeams[i].id,
              team_away_id: savedTeams[j].id,
              stage: 'group', group_name: group, status: 'pending', app: 'futbol',
            })
          }
        }
      }
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
    formatCard: (active: boolean) => ({
      background: active ? 'rgba(201,168,76,0.15)' : '#0A3D1F',
      border: active ? '2px solid #C9A84C' : '1px solid #1A6B35',
      borderRadius: 10, padding: '12px 14px', cursor: 'pointer', marginBottom: 8,
    }),
  }

  return (
    <div style={styles.container}>
      <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 16 }}>
        <img src="/logo.png" alt="Go Fútbol" style={{ width: 80, height: 80, borderRadius: 12, objectFit: 'contain' }} />
      </div>
      <h1 style={styles.title}>GO FÚTBOL</h1>
      <p style={styles.sub}>Configuracion del torneo</p>

      {/* Stepper */}
      <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginBottom: 24 }}>
        {(['config', 'teams', 'awards'] as const).map((s, i) => (
          <div key={s} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ width: 28, height: 28, borderRadius: '50%', background: step === s ? '#C9A84C' : '#1A6B35', color: step === s ? '#0D4F28' : '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 13 }}>{i + 1}</div>
            <span style={{ fontSize: 12, color: step === s ? '#C9A84C' : '#a8d5b5' }}>{s === 'config' ? 'Config' : s === 'teams' ? 'Equipos' : 'Premios'}</span>
            {i < 2 && <span style={{ color: '#1A6B35' }}>-</span>}
          </div>
        ))}
      </div>

      {step === 'config' && (
        <div style={styles.card}>
          <label style={styles.label}>Nombre del torneo</label>
          <input style={styles.input} value={name} onChange={e => setName(e.target.value)} />

          <label style={{ ...styles.label, marginTop: 16 }}>Fecha</label>
          <input style={styles.input} type="date" value={date} onChange={e => setDate(e.target.value)} />

          <label style={{ ...styles.label, marginTop: 16 }}>Tiempos por partido</label>
          <input style={styles.input} type="number" min={1} max={8} value={chukkers} onChange={e => setChukkers(Number(e.target.value))} />

          <label style={{ ...styles.label, marginTop: 16 }}>Duración del tiempo (minutos)</label>
          <input style={styles.input} type="number" min={1} max={45} value={chukkerDuration} onChange={e => setChukkerDuration(Number(e.target.value))} />
          <p style={{ color: '#a8d5b5', fontSize: 11, marginTop: 4 }}>Estándar: 7.5 min. Para demos o categorías juveniles podés reducirlo.</p>

          <label style={{ ...styles.label, marginTop: 16 }}>Contraseña para cargadores de goles</label>
          <input style={styles.input} value={scorerPassword} onChange={e => setScorerPassword(e.target.value)} placeholder="Ej: futbol2026" />
          <p style={{ color: '#a8d5b5', fontSize: 11, marginTop: 4 }}>Compartila con quienes van a cargar goles el día del torneo</p>

          <label style={{ ...styles.label, marginTop: 16 }}>Cantidad de equipos</label>
          {format === 'knockout' ? (
            <>
              <input style={{ ...styles.input, maxWidth: 120 }} type="number" min={3} value={teamCount}
                onChange={e => handleTeamCountChange(Math.max(3, Number(e.target.value) || 3))} />
              <p style={{ color: '#a8d5b5', fontSize: 11, marginTop: 4, marginBottom: 8 }}>
                Mínimo 3 equipos. Con cantidad impar, un equipo por ronda queda "esperando rival" hasta que el admin le asigne uno o le dé pase libre.
              </p>
            </>
          ) : (
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' as const, marginBottom: 8 }}>
              {TEAM_COUNTS.map(n => (
                <button key={n} onClick={() => handleTeamCountChange(n)}
                  style={{ ...styles.btnSm, background: teamCount === n ? '#C9A84C' : '#1A6B35', color: teamCount === n ? '#0D4F28' : '#fff', marginTop: 0, padding: '8px 14px' }}>
                  {n}
                </button>
              ))}
            </div>
          )}

          <label style={{ ...styles.label, marginTop: 16 }}>Formato del torneo</label>
          {FORMATS.map(f => (
            <div key={f.value} style={styles.formatCard(format === f.value)} onClick={() => handleFormatChange(f.value)}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ width: 16, height: 16, borderRadius: '50%', border: `2px solid ${format === f.value ? '#C9A84C' : '#1A6B35'}`, background: format === f.value ? '#C9A84C' : 'transparent', flexShrink: 0 }} />
                <div>
                  <p style={{ color: format === f.value ? '#C9A84C' : '#fff', fontWeight: 700, fontSize: 14, margin: 0 }}>{f.label}</p>
                  <p style={{ color: '#a8d5b5', fontSize: 12, margin: '2px 0 0' }}>{f.desc}</p>
                </div>
              </div>
            </div>
          ))}

          {format !== 'round_robin' && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 12, padding: '10px 14px', background: '#0A3D1F', borderRadius: 8, border: '1px solid #1A6B35', cursor: 'pointer' }}
              onClick={() => setHasThirdPlace(!hasThirdPlace)}>
              <div style={{ width: 20, height: 20, borderRadius: 4, border: `2px solid ${hasThirdPlace ? '#C9A84C' : '#1A6B35'}`, background: hasThirdPlace ? '#C9A84C' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {hasThirdPlace && <span style={{ color: '#0D4F28', fontSize: 13, fontWeight: 900 }}>✓</span>}
              </div>
              <span style={{ color: '#fff', fontSize: 14 }}>Partido por 3er y 4to puesto</span>
            </div>
          )}

          {format === 'groups_knockout' && (
            <div style={{ marginTop: 12, padding: '10px 14px', background: '#0A3D1F', borderRadius: 8, border: '1px solid #1A6B35' }}>
              <p style={{ color: '#a8d5b5', fontSize: 12, margin: 0 }}>
                Con {teamCount} equipos se forman {getGroupsConfig(teamCount, format).numGroups} grupos: {getGroupsConfig(teamCount, format).groupNames.join(', ')}
              </p>
            </div>
          )}

          <button style={styles.btn} onClick={() => setStep('teams')}>Siguiente - Cargar equipos</button>
        </div>
      )}

      {step === 'teams' && (
        <div style={{ maxWidth: 600, margin: '0 auto' }}>
        {/* Importar desde Excel */}
          <div style={{ background: '#0D4F28', borderRadius: 12, padding: 16, marginBottom: 16, border: '1px solid #1A6B35' }}>
            <p style={{ color: '#C9A84C', fontWeight: 700, fontSize: 14, margin: '0 0 8px' }}>Importar desde Excel</p>
            <p style={{ color: '#a8d5b5', fontSize: 12, margin: '0 0 12px' }}>Descargá la plantilla, completala y subila para cargar todos los equipos automáticamente.</p>
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
          {teams.slice(0, teamCount).map((team, i) => (
            <div key={i} style={styles.teamCard}>
              <div style={{ ...styles.row, marginBottom: 12, justifyContent: 'space-between' }}>
                <span style={{ color: '#a8d5b5', fontSize: 13 }}>Equipo {i + 1}</span>
                {format !== 'knockout' && (
                  <div style={{ display: 'flex', gap: 6 }}>
                    {groupNames.map(g => (
                      <button key={g} onClick={() => updateTeam(i, 'group', g)}
                        style={{ ...styles.btnSm, marginTop: 0, background: team.group === g ? '#C9A84C' : '#1A6B35', color: team.group === g ? '#0D4F28' : '#fff', padding: '4px 10px' }}>
                        Grupo {g}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div style={{ ...styles.row, marginBottom: 8 }}>
                <Avatar url={team.logo ? URL.createObjectURL(team.logo) : null} name={team.name || "?"} size={48} bordered={false} />
                <div style={{ flex: 1 }}>
                  <input style={{ ...styles.input, marginBottom: 8 }} placeholder="Nombre del equipo" value={team.name} onChange={e => updateTeam(i, 'name', e.target.value)} />
                </div>
              </div>
              <label style={{ ...styles.label, fontSize: 11 }}>Logo del equipo (opcional)</label>
              <input type="file" accept="image/*" style={{ color: '#a8d5b5', fontSize: 12, marginBottom: 8 }} onChange={e => updateTeam(i, 'logo', e.target.files?.[0] ?? null)} />
              {/* handicap del equipo eliminado */}

              <p style={{ color: '#a8d5b5', fontSize: 12, marginTop: 12, marginBottom: 8 }}>Jugadores:</p>
              {team.players.map((player, j) => (
                <div key={j} style={{ ...styles.row, marginBottom: 8, alignItems: 'flex-start' }}>
                  <Avatar url={player.photo ? URL.createObjectURL(player.photo) : null} name={player.name || '?'} size={36} bordered={false} />
                  <div style={{ flex: 1 }}>
                    <input style={{ ...styles.input, marginBottom: 4 }} placeholder={`Jugador ${j + 1}`} value={player.name} onChange={e => updatePlayer(i, j, 'name', e.target.value)} />
                    <div style={{ display: 'flex', gap: 4, marginBottom: 4 }}>
                      <input style={{ ...styles.input, width: 80 }} type="number" placeholder="Nro" min={0} max={99} value={player.numero} onChange={e => updatePlayer(i, j, 'numero', Number(e.target.value))} />
                    </div>
                    <input style={{ ...styles.input, marginBottom: 4 }} placeholder="Reseña breve (opcional)" value={player.bio} onChange={e => updatePlayer(i, j, 'bio', e.target.value)} />
                    <input type="file" accept="image/*" style={{ color: '#a8d5b5', fontSize: 11 }} onChange={e => updatePlayer(i, j, 'photo', e.target.files?.[0] ?? null)} />
                    <label style={{ color: '#a8d5b5', fontSize: 11, display: 'block', margin: '6px 0 2px' }}>Video corto (opcional, máx. 3MB)</label>
                    <input type="file" accept="video/*" style={{ color: '#a8d5b5', fontSize: 11 }} onChange={e => {
                      const file = e.target.files?.[0] ?? null
                      if (file && file.size > MAX_INTRO_VIDEO_BYTES) {
                        alert('El video pesa mucho, subí uno más corto o de menor calidad (máximo 3MB).')
                        e.target.value = ''
                        return
                      }
                      updatePlayer(i, j, 'video', file)
                    }} />
                  </div>
                </div>
              ))}
              <button style={styles.btnSm} onClick={() => addPlayer(i)}>+ Agregar jugador</button>
            </div>
          ))}
          <div style={{ display: 'flex', gap: 12 }}>
            <button style={{ ...styles.btn, background: '#1A6B35', color: '#fff' }} onClick={() => setStep('config')}>Volver</button>
            <button style={styles.btn} onClick={() => setStep('awards')}>Siguiente - Premios</button>
          </div>
        </div>
      )}

      {step === 'awards' && (
        <div style={{ maxWidth: 600, margin: '0 auto' }}>
          <div style={styles.teamCard}>
            <p style={{ color: '#C9A84C', fontWeight: 700, fontSize: 14, marginBottom: 4 }}>Premios del torneo</p>
            <p style={{ color: '#a8d5b5', fontSize: 12, marginBottom: 16 }}>Define que premios se van a entregar.</p>
            {awards.map((award, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <div style={{ flex: 1, background: '#0A3D1F', border: '1px solid #1A6B35', borderRadius: 8, padding: '10px 12px', color: '#fff', fontSize: 14 }}>
                  {award}
                </div>
                <button onClick={() => removeAward(i)} style={{ background: 'none', border: 'none', color: '#a8d5b5', cursor: 'pointer', fontSize: 18, padding: '4px 8px' }}>x</button>
              </div>
            ))}
            <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
              <input style={{ ...styles.input, flex: 1 }} placeholder="Nuevo premio..." value={newAward} onChange={e => setNewAward(e.target.value)} onKeyDown={e => e.key === 'Enter' && addAward()} />
              <button onClick={addAward} style={{ background: '#1A6B35', color: '#fff', border: 'none', borderRadius: 8, padding: '10px 16px', cursor: 'pointer', fontWeight: 700 }}>+</button>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 12 }}>
            <button style={{ ...styles.btn, background: '#1A6B35', color: '#fff' }} onClick={() => setStep('teams')}>Volver</button>
            <button style={styles.btn} onClick={handleCreate} disabled={saving}>
              {saving ? 'Creando...' : 'Crear torneo'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
