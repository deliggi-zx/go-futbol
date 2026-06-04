import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'

type Props = { tournament: any; isAdmin: boolean }

export default function AwardsView({ tournament, isAdmin }: Props) {
  const [awardTypes, setAwardTypes] = useState<any[]>([])
  const [awards, setAwards] = useState<any[]>([])
  const [gallery, setGallery] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [editingAward, setEditingAward] = useState<any>(null)
  const [winnerName, setWinnerName] = useState('')
  const [winnerPhoto, setWinnerPhoto] = useState<File | null>(null)
  const [saving, setSaving] = useState(false)
  const [uploadingGallery, setUploadingGallery] = useState(false)
  const [lightbox, setLightbox] = useState<string | null>(null)
  const [featuredAward, setFeaturedAward] = useState<any>(null)
  const [innerTab, setInnerTab] = useState<'awards' | 'gallery'>('awards')
  const confettiRef = useRef<HTMLCanvasElement>(null)
  const animFrameRef = useRef<number>(0)

  useEffect(() => {
    loadData()
  }, [tournament.id])

  useEffect(() => {
    if (featuredAward) {
      startConfetti()
    } else {
      stopConfetti()
    }
    return () => stopConfetti()
  }, [featuredAward])

  function startConfetti() {
    const canvas = confettiRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    canvas.width = window.innerWidth
    canvas.height = window.innerHeight

    const particles: any[] = []
    const colors = ['#75AADB', '#FFFFFF', '#C9A84C', '#75AADB', '#FFFFFF', '#75AADB']

    for (let i = 0; i < 120; i++) {
      particles.push({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height - canvas.height,
        w: Math.random() * 12 + 6,
        h: Math.random() * 6 + 4,
        color: colors[Math.floor(Math.random() * colors.length)],
        speed: Math.random() * 3 + 1.5,
        angle: Math.random() * Math.PI * 2,
        spin: (Math.random() - 0.5) * 0.15,
        wobble: Math.random() * 0.1,
        wobbleSpeed: Math.random() * 0.05,
        wobblePos: Math.random() * Math.PI * 2,
      })
    }

    function draw() {
      if (!ctx || !canvas) return
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      particles.forEach(p => {
        p.y += p.speed
        p.angle += p.spin
        p.wobblePos += p.wobbleSpeed
        p.x += Math.sin(p.wobblePos) * 1.5
        if (p.y > canvas.height) {
          p.y = -20
          p.x = Math.random() * canvas.width
        }
        ctx.save()
        ctx.translate(p.x, p.y)
        ctx.rotate(p.angle)
        ctx.fillStyle = p.color
        ctx.globalAlpha = 0.9
        ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h)
        ctx.restore()
      })
      animFrameRef.current = requestAnimationFrame(draw)
    }
    draw()
  }

  function stopConfetti() {
    if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current)
    const canvas = confettiRef.current
    if (canvas) {
      const ctx = canvas.getContext('2d')
      if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height)
    }
  }

  async function loadData() {
    setLoading(true)
    const [at, aw, g] = await Promise.all([
      supabase.from('award_types').select('*').eq('tournament_id', tournament.id).order('order_index'),
      supabase.from('awards').select('*').eq('tournament_id', tournament.id),
      supabase.from('gallery_photos').select('*').eq('tournament_id', tournament.id).order('created_at', { ascending: false }),
    ])
    setAwardTypes(at.data ?? [])
    setAwards(aw.data ?? [])
    setGallery(g.data ?? [])
    setLoading(false)
  }

  function getAward(awardTypeId: string) {
    return awards.find(a => a.award_type_id === awardTypeId)
  }

  async function uploadImage(file: File, path: string): Promise<string | null> {
    const { error } = await supabase.storage.from('avatars').upload(path, file, { upsert: true })
    if (error) return null
    const { data } = supabase.storage.from('avatars').getPublicUrl(path)
    return data.publicUrl
  }

  async function saveAward() {
    if (!editingAward || !winnerName.trim()) return alert('Ingresa el nombre del ganador')
    setSaving(true)
    try {
      let photoUrl = getAward(editingAward.id)?.photo_url ?? null
      if (winnerPhoto) {
        photoUrl = await uploadImage(winnerPhoto, `awards/${tournament.id}_${editingAward.id}.jpg`)
      }
      const existing = getAward(editingAward.id)
      if (existing) {
        await supabase.from('awards').update({ winner_name: winnerName, photo_url: photoUrl }).eq('id', existing.id)
      } else {
        await supabase.from('awards').insert({ award_type_id: editingAward.id, tournament_id: tournament.id, winner_name: winnerName, photo_url: photoUrl })
      }
      await loadData()
      setEditingAward(null)
      setWinnerName('')
      setWinnerPhoto(null)
    } catch (e) {
      alert('Error al guardar')
    } finally {
      setSaving(false)
    }
  }

  async function uploadGalleryPhoto(file: File) {
    setUploadingGallery(true)
    try {
      const path = `gallery/${tournament.id}_${Date.now()}.jpg`
      const url = await uploadImage(file, path)
      if (url) {
        await supabase.from('gallery_photos').insert({ tournament_id: tournament.id, photo_url: url })
        await loadData()
      }
    } finally {
      setUploadingGallery(false)
    }
  }

  async function deleteGalleryPhoto(id: string, photoUrl: string) {
    if (!confirm('Eliminar esta foto?')) return
    await supabase.from('gallery_photos').delete().eq('id', id)
    const path = photoUrl.split('/avatars/')[1]
    if (path) await supabase.storage.from('avatars').remove([path])
    await loadData()
  }

  const styles = {
    innerTab: (active: boolean) => ({
      flex: 1, padding: '10px 8px', textAlign: 'center' as const, cursor: 'pointer',
      fontWeight: 600, fontSize: 13, color: active ? '#C9A84C' : '#d4a0b0',
      background: active ? 'rgba(201,168,76,0.1)' : 'none',
      border: 'none', borderRadius: 8, margin: 2,
    }),
  }

  if (loading) return <p style={{ color: '#d4a0b0', textAlign: 'center', marginTop: 40 }}>Cargando...</p>

  return (
    <div>
      {/* Sub-tabs */}
      <div style={{ display: 'flex', background: '#4A0B1E', borderRadius: 10, margin: '0 0 16px', padding: 4 }}>
        <button style={styles.innerTab(innerTab === 'awards')} onClick={() => setInnerTab('awards')}>
          Premios {awards.length > 0 && `(${awards.length}/${awardTypes.length})`}
        </button>
        <button style={styles.innerTab(innerTab === 'gallery')} onClick={() => setInnerTab('gallery')}>
          Grandes momentos {gallery.length > 0 && `(${gallery.length})`}
        </button>
      </div>

      {innerTab === 'awards' && (
        <>
          {awardTypes.length === 0 ? (
            <div style={{ background: '#4A0B1E', borderRadius: 12, padding: 24, textAlign: 'center', border: '1px solid #8B1A3A' }}>
              <p style={{ color: '#d4a0b0', fontSize: 14 }}>No se definieron premios para este torneo.</p>
            </div>
          ) : (
            <>
              {/* Banner campeon */}
              {getAward(awardTypes[0]?.id)?.winner_name && (
                <div
                  onClick={() => setFeaturedAward({ type: awardTypes[0], award: getAward(awardTypes[0].id) })}
                  style={{ background: 'linear-gradient(135deg, #4A0B1E, #8B1A3A)', borderRadius: 16, padding: 24, marginBottom: 20, textAlign: 'center', border: '2px solid #C9A84C', cursor: 'pointer' }}>
                  <p style={{ color: '#C9A84C', fontSize: 12, fontWeight: 700, letterSpacing: 2, margin: '0 0 8px' }}>CAMPEON</p>
                  {getAward(awardTypes[0].id)?.photo_url && (
                    <img src={getAward(awardTypes[0].id).photo_url} alt="Campeon"
                      style={{ width: 120, height: 120, borderRadius: '50%', objectFit: 'cover', border: '3px solid #C9A84C', marginBottom: 12 }} />
                  )}
                  <p style={{ fontSize: 28, fontWeight: 900, color: '#fff', margin: 0 }}>
                    {getAward(awardTypes[0].id).winner_name}
                  </p>
                  <p style={{ color: '#C9A84C', fontSize: 12, margin: '8px 0 0', opacity: 0.7 }}>Toca para celebrar</p>
                </div>
              )}

              {awardTypes.map((awardType, i) => {
                const award = getAward(awardType.id)
                const isChampion = i === 0
                if (isChampion && award?.winner_name) return null

                return (
                  <div
                    key={awardType.id}
                    onClick={() => award?.winner_name && setFeaturedAward({ type: awardType, award })}
                    style={{ background: '#4A0B1E', borderRadius: 12, padding: 16, marginBottom: 10, border: '1px solid #8B1A3A', display: 'flex', alignItems: 'center', gap: 12, cursor: award?.winner_name ? 'pointer' : 'default' }}>
                    {award?.photo_url ? (
                      <img src={award.photo_url} alt={award.winner_name}
                        style={{ width: 56, height: 56, borderRadius: '50%', objectFit: 'cover', border: '2px solid #C9A84C', flexShrink: 0 }} />
                    ) : (
                      <div style={{ width: 56, height: 56, borderRadius: '50%', background: '#6B0F2B', border: '2px dashed #8B1A3A', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        <span style={{ fontSize: 24 }}>&#127942;</span>
                      </div>
                    )}
                    <div style={{ flex: 1 }}>
                      <p style={{ color: '#C9A84C', fontSize: 11, fontWeight: 700, letterSpacing: 1, margin: '0 0 2px' }}>{awardType.name.toUpperCase()}</p>
                      <p style={{ color: award?.winner_name ? '#fff' : '#d4a0b0', fontSize: 16, fontWeight: award?.winner_name ? 700 : 400, margin: 0 }}>
                        {award?.winner_name ?? 'Sin asignar'}
                      </p>
                      {award?.winner_name && <p style={{ color: '#C9A84C', fontSize: 11, margin: '2px 0 0', opacity: 0.6 }}>Toca para ver</p>}
                    </div>
                    {isAdmin && (
                      <button onClick={e => { e.stopPropagation(); setEditingAward(awardType); setWinnerName(award?.winner_name ?? ''); setWinnerPhoto(null) }}
                        style={{ background: '#8B1A3A', border: 'none', borderRadius: 8, padding: '6px 12px', color: '#fff', cursor: 'pointer', fontSize: 12, flexShrink: 0 }}>
                        {award?.winner_name ? 'Editar' : '+ Cargar'}
                      </button>
                    )}
                  </div>
                )
              })}
            </>
          )}

          {/* Modal edicion premio */}
          {editingAward && (
            <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: 16 }}>
              <div style={{ background: '#4A0B1E', borderRadius: 16, padding: 24, width: '100%', maxWidth: 400, border: '1px solid #8B1A3A' }}>
                <p style={{ color: '#C9A84C', fontWeight: 700, fontSize: 16, marginBottom: 16 }}>{editingAward.name}</p>
                {winnerPhoto ? (
                  <img src={URL.createObjectURL(winnerPhoto)} alt="preview" style={{ width: 80, height: 80, borderRadius: '50%', objectFit: 'cover', border: '2px solid #C9A84C', marginBottom: 12, display: 'block' }} />
                ) : getAward(editingAward.id)?.photo_url ? (
                  <img src={getAward(editingAward.id).photo_url} alt="actual" style={{ width: 80, height: 80, borderRadius: '50%', objectFit: 'cover', border: '2px solid #8B1A3A', marginBottom: 12, display: 'block' }} />
                ) : null}
                <label style={{ color: '#d4a0b0', fontSize: 12, display: 'block', marginBottom: 4 }}>Nombre del ganador</label>
                <input value={winnerName} onChange={e => setWinnerName(e.target.value)}
                  style={{ width: '100%', background: '#6B0F2B', border: '1px solid #8B1A3A', borderRadius: 8, padding: '10px 12px', color: '#fff', fontSize: 15, boxSizing: 'border-box' as const, marginBottom: 12 }}
                  placeholder="Nombre..." />
                <label style={{ color: '#d4a0b0', fontSize: 12, display: 'block', marginBottom: 8 }}>Foto (opcional)</label>
                <input type="file" accept="image/*" style={{ color: '#d4a0b0', fontSize: 12, marginBottom: 16 }}
                  onChange={e => setWinnerPhoto(e.target.files?.[0] ?? null)} />
                <div style={{ display: 'flex', gap: 8 }}>
                  <button onClick={() => { setEditingAward(null); setWinnerName(''); setWinnerPhoto(null) }}
                    style={{ flex: 1, background: '#8B1A3A', color: '#fff', border: 'none', borderRadius: 10, padding: '12px', cursor: 'pointer', fontWeight: 700 }}>
                    Cancelar
                  </button>
                  <button onClick={saveAward} disabled={saving}
                    style={{ flex: 1, background: '#C9A84C', color: '#4A0B1E', border: 'none', borderRadius: 10, padding: '12px', cursor: 'pointer', fontWeight: 700 }}>
                    {saving ? 'Guardando...' : 'Guardar'}
                  </button>
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {innerTab === 'gallery' && (
        <>
          {isAdmin && (
            <div style={{ background: '#4A0B1E', borderRadius: 12, padding: 16, marginBottom: 16, border: '1px solid #8B1A3A', textAlign: 'center' }}>
              <p style={{ color: '#d4a0b0', fontSize: 13, marginBottom: 8 }}>Subir fotos de la jornada</p>
              <input type="file" accept="image/*" multiple style={{ color: '#d4a0b0', fontSize: 12, marginBottom: 8 }}
                onChange={async e => {
                  const files = Array.from(e.target.files ?? [])
                  for (const file of files) await uploadGalleryPhoto(file)
                  e.target.value = ''
                }} />
              {uploadingGallery && <p style={{ color: '#C9A84C', fontSize: 12 }}>Subiendo...</p>}
            </div>
          )}
          {gallery.length === 0 ? (
            <div style={{ background: '#4A0B1E', borderRadius: 12, padding: 24, textAlign: 'center', border: '1px solid #8B1A3A' }}>
              <p style={{ color: '#d4a0b0', fontSize: 14 }}>No hay grandes momentos todavia.</p>
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 4 }}>
              {gallery.map(photo => (
                <div key={photo.id} style={{ position: 'relative', aspectRatio: '1', overflow: 'hidden', borderRadius: 8 }}>
                  <img src={photo.photo_url} alt="galeria"
                    style={{ width: '100%', height: '100%', objectFit: 'cover', cursor: 'pointer' }}
                    onClick={() => setLightbox(photo.photo_url)} />
                  {isAdmin && (
                    <button onClick={() => deleteGalleryPhoto(photo.id, photo.photo_url)}
                      style={{ position: 'absolute', top: 4, right: 4, background: 'rgba(0,0,0,0.6)', border: 'none', borderRadius: '50%', width: 24, height: 24, color: '#fff', cursor: 'pointer', fontSize: 12, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      x
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* Lightbox galeria */}
      {lightbox && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.95)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200, padding: 16 }}
          onClick={() => setLightbox(null)}>
          <img src={lightbox} alt="foto" style={{ maxWidth: '100%', maxHeight: '90vh', borderRadius: 12, objectFit: 'contain' }} />
        </div>
      )}

      {/* Pantalla festiva de premio */}
      {featuredAward && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.97)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 300, padding: 24 }}
          onClick={() => setFeaturedAward(null)}>
          {/* Canvas confeti */}
          <canvas ref={confettiRef} style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 301 }} />

          {/* Tarjeta del premio */}
          <div onClick={e => e.stopPropagation()} style={{
            position: 'relative', zIndex: 302,
            width: '100%', maxWidth: 340,
            borderRadius: 24,
            background: 'linear-gradient(160deg, #1a0a10 0%, #2a1020 100%)',
            border: '3px solid #C9A84C',
            boxShadow: '0 0 40px rgba(201,168,76,0.4), inset 0 0 40px rgba(201,168,76,0.05)',
            overflow: 'hidden',
            padding: '0 0 24px',
          }}>
            {/* Marco dorado superior */}
            <div style={{ background: 'linear-gradient(90deg, #C9A84C, #f0d070, #C9A84C)', padding: '8px 16px', textAlign: 'center' }}>
              <p style={{ color: '#4A0B1E', fontSize: 11, fontWeight: 900, letterSpacing: 3, margin: 0 }}>
                {featuredAward.type.name.toUpperCase()}
              </p>
            </div>

            {/* Foto */}
            <div style={{ position: 'relative', padding: '24px 24px 0' }}>
              {featuredAward.award?.photo_url ? (
                <div style={{ position: 'relative' }}>
                  <div style={{
                    position: 'absolute', inset: -4,
                    borderRadius: '50%',
                    background: 'linear-gradient(135deg, #C9A84C, #f0d070, #C9A84C)',
                    zIndex: 0,
                  }} />
                  <img src={featuredAward.award.photo_url} alt={featuredAward.award.winner_name}
                    style={{ width: '100%', aspectRatio: '1', objectFit: 'cover', borderRadius: 16, position: 'relative', zIndex: 1, border: '4px solid #C9A84C' }} />
                </div>
              ) : (
                <div style={{ width: '100%', aspectRatio: '1', background: 'linear-gradient(135deg, #4A0B1E, #8B1A3A)', borderRadius: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', border: '4px solid #C9A84C' }}>
                  <span style={{ fontSize: 80, fontWeight: 900, color: '#C9A84C', opacity: 0.5 }}>{featuredAward.award?.winner_name?.charAt(0) ?? '?'}</span>
                </div>
              )}
            </div>

            {/* Nombre ganador */}
            <div style={{ textAlign: 'center', padding: '20px 24px 0' }}>
              <p style={{ color: '#d4a0b0', fontSize: 12, margin: '0 0 8px', letterSpacing: 2 }}>GANADOR</p>
              <p style={{ fontSize: 28, fontWeight: 900, color: '#fff', margin: '0 0 4px', textShadow: '0 2px 12px rgba(201,168,76,0.5)' }}>
                {featuredAward.award?.winner_name}
              </p>
              <div style={{ display: 'flex', justifyContent: 'center', gap: 4, marginTop: 8 }}>
                {['&#9733;', '&#9733;', '&#9733;'].map((s, i) => (
                  <span key={i} style={{ color: '#C9A84C', fontSize: 18 }} dangerouslySetInnerHTML={{ __html: s }} />
                ))}
              </div>
            </div>

            {/* Marco dorado inferior */}
            <div style={{ background: 'linear-gradient(90deg, #C9A84C, #f0d070, #C9A84C)', height: 4, marginTop: 20 }} />

            <p style={{ color: '#555', fontSize: 11, textAlign: 'center', margin: '12px 0 0' }}>Toca fuera para cerrar</p>
          </div>
        </div>
      )}
    </div>
  )
}
