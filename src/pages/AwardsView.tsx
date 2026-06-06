import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'

type Props = { tournament: any; isAdmin: boolean }

const gold = '#C9A84C'
const goldLight = '#E8C96A'
const darkBg = '#2A0A12'
const cardBg = 'linear-gradient(160deg, #3d2810 0%, #2a1c0a 30%, #1e1408 60%, #2a1c0a 100%)'
const borderGold = `1px solid ${gold}55`

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
  const [sharing, setSharing] = useState(false)
  const confettiRef = useRef<HTMLCanvasElement>(null)
  const animFrameRef = useRef<number>(0)
  const shareCardRef = useRef<HTMLDivElement>(null)

  useEffect(() => { loadData() }, [tournament.id])

  useEffect(() => {
    if (featuredAward) startConfetti()
    else stopConfetti()
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
        if (p.y > canvas.height) { p.y = -20; p.x = Math.random() * canvas.width }
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

  async function shareAward() {
    if (!shareCardRef.current || !featuredAward) return
    setSharing(true)
    try {
      const html2canvas = (await import('html2canvas' as any)).default
      const canvas = await html2canvas(shareCardRef.current, {
        backgroundColor: '#1a0a10',
        scale: 2,
        useCORS: true,
        allowTaint: true,
      })
      const blob = await new Promise<Blob>((resolve) => canvas.toBlob((b: Blob) => resolve(b!), 'image/png'))
      const file = new File([blob], 'gopolo-ganador.png', { type: 'image/png' })
      const shareText = `🏆 ${tournament.name}\n${featuredAward.type.name}: ${featuredAward.award?.winner_name}\n\n${window.location.href}`

      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], text: shareText })
      } else if (navigator.share) {
        await navigator.share({ title: `Go Polo · ${tournament.name}`, text: shareText, url: window.location.href })
      } else {
        // Fallback: descargar imagen
        const a = document.createElement('a')
        a.href = canvas.toDataURL('image/png')
        a.download = 'gopolo-ganador.png'
        a.click()
      }
    } catch (e: any) {
      if (e?.name !== 'AbortError') alert('No se pudo compartir')
    } finally {
      setSharing(false)
    }
  }

  const goldBar = <div style={{ background: `linear-gradient(90deg, ${darkBg}, #8B6914, ${gold}, #8B6914, ${darkBg})`, height: 3 }} />

  if (loading) return <p style={{ color: gold, textAlign: 'center', marginTop: 40, fontFamily: 'Georgia, serif' }}>Cargando...</p>

  return (
    <div>
      {/* Sub-tabs */}
      <div style={{ display: 'flex', background: 'rgba(30,5,15,0.8)', borderRadius: 12, margin: '0 0 16px', padding: 4, border: borderGold }}>
        {(['awards', 'gallery'] as const).map(t => (
          <button key={t} onClick={() => setInnerTab(t)} style={{
            flex: 1, padding: '10px 8px', textAlign: 'center' as const, cursor: 'pointer',
            fontWeight: 700, fontSize: 12, fontFamily: 'Georgia, serif', letterSpacing: 1,
            color: innerTab === t ? gold : '#d4a0b0',
            background: innerTab === t ? `rgba(201,168,76,0.1)` : 'none',
            border: 'none', borderRadius: 8,
            transition: 'color 0.2s',
          }}>
            {t === 'awards'
              ? `Premios${awards.length > 0 ? ` (${awards.length}/${awardTypes.length})` : ''}`
              : `Grandes momentos${gallery.length > 0 ? ` (${gallery.length})` : ''}`}
          </button>
        ))}
      </div>

      {innerTab === 'awards' && (
        <>
          {awardTypes.length === 0 ? (
            <div style={{ borderRadius: 14, overflow: 'hidden', boxShadow: `0 0 0 1px ${gold}44` }}>
              {goldBar}
              <div style={{ background: cardBg, padding: 24, textAlign: 'center' }}>
                <p style={{ color: '#d4a0b0', fontSize: 14, fontFamily: 'Georgia, serif' }}>No se definieron premios para este torneo.</p>
              </div>
              {goldBar}
            </div>
          ) : (
            <>
              {/* Banner campeón */}
              {getAward(awardTypes[0]?.id)?.winner_name && (
                <div
                  onClick={() => setFeaturedAward({ type: awardTypes[0], award: getAward(awardTypes[0].id) })}
                  style={{
                    borderRadius: 16, marginBottom: 20, overflow: 'hidden', cursor: 'pointer',
                    boxShadow: `0 0 0 2px ${gold}, 0 0 30px rgba(201,168,76,0.3)`,
                    transition: 'transform 0.15s, box-shadow 0.15s',
                  }}
                  onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.transform = 'translateY(-2px)' }}
                  onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.transform = 'translateY(0)' }}
                >
                  {goldBar}
                  <div style={{ background: cardBg, padding: '20px 24px', textAlign: 'center' }}>
                    <p style={{ color: goldLight, fontSize: 11, fontWeight: 700, letterSpacing: 3, margin: '0 0 12px', fontFamily: 'Georgia, serif' }}>CAMPEÓN</p>
                    {getAward(awardTypes[0].id)?.photo_url && (
                      <img src={getAward(awardTypes[0].id).photo_url} alt="Campeon"
                        style={{ width: 110, height: 110, borderRadius: '50%', objectFit: 'cover', border: `3px solid ${gold}`, marginBottom: 14, boxShadow: `0 0 20px rgba(201,168,76,0.4)` }} />
                    )}
                    <p style={{ fontSize: 26, fontWeight: 900, color: '#fff', margin: '0 0 6px', fontFamily: 'Georgia, serif', textShadow: `0 0 20px rgba(201,168,76,0.4)` }}>
                      {getAward(awardTypes[0].id).winner_name}
                    </p>
                    <p style={{ color: `${gold}88`, fontSize: 11, margin: 0, fontFamily: 'Georgia, serif', letterSpacing: 1 }}>Toca para celebrar</p>
                  </div>
                  {goldBar}
                </div>
              )}

              {/* Resto de premios */}
              {awardTypes.map((awardType, i) => {
                const award = getAward(awardType.id)
                const isChampion = i === 0
                if (isChampion && award?.winner_name) return null
                return (
                  <div
                    key={awardType.id}
                    onClick={() => award?.winner_name && setFeaturedAward({ type: awardType, award })}
                    style={{
                      borderRadius: 12, marginBottom: 10, overflow: 'hidden',
                      boxShadow: `0 0 0 1px ${gold}44, 0 4px 12px rgba(0,0,0,0.4)`,
                      cursor: award?.winner_name ? 'pointer' : 'default',
                    }}
                  >
                    {goldBar}
                    <div style={{ background: cardBg, padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 14 }}>
                      {award?.photo_url ? (
                        <img src={award.photo_url} alt={award.winner_name}
                          style={{ width: 54, height: 54, borderRadius: '50%', objectFit: 'cover', border: `2px solid ${gold}`, flexShrink: 0, boxShadow: `0 0 10px rgba(201,168,76,0.3)` }} />
                      ) : (
                        <div style={{ width: 54, height: 54, borderRadius: '50%', background: darkBg, border: `2px dashed ${gold}44`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                          <span style={{ fontSize: 22 }}>🏆</span>
                        </div>
                      )}
                      <div style={{ flex: 1 }}>
                        <p style={{ color: goldLight, fontSize: 11, fontWeight: 700, letterSpacing: 1, margin: '0 0 3px', fontFamily: 'Georgia, serif' }}>{awardType.name.toUpperCase()}</p>
                        <p style={{ color: award?.winner_name ? '#fff' : '#d4a0b0', fontSize: 15, fontWeight: award?.winner_name ? 700 : 400, margin: 0, fontFamily: 'Georgia, serif' }}>
                          {award?.winner_name ?? 'Sin asignar'}
                        </p>
                        {award?.winner_name && <p style={{ color: `${gold}66`, fontSize: 11, margin: '2px 0 0', fontFamily: 'Georgia, serif' }}>Toca para ver</p>}
                      </div>
                      {isAdmin && (
                        <button
                          onClick={e => { e.stopPropagation(); setEditingAward(awardType); setWinnerName(award?.winner_name ?? ''); setWinnerPhoto(null) }}
                          style={{ background: 'linear-gradient(135deg, #5A1525, #3A0A15)', border: `1px solid ${gold}66`, borderRadius: 8, padding: '6px 12px', color: gold, cursor: 'pointer', fontSize: 12, flexShrink: 0, fontFamily: 'Georgia, serif' }}>
                          {award?.winner_name ? 'Editar' : '+ Cargar'}
                        </button>
                      )}
                    </div>
                    {goldBar}
                  </div>
                )
              })}
            </>
          )}

          {/* Modal edición premio */}
          {editingAward && (
            <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: 16 }}>
              <div style={{ borderRadius: 20, overflow: 'hidden', width: '100%', maxWidth: 400, boxShadow: `0 0 0 2px ${gold}, 0 0 40px rgba(201,168,76,0.2)` }}>
                {goldBar}
                <div style={{ background: cardBg, padding: 24 }}>
                  <p style={{ color: gold, fontWeight: 700, fontSize: 16, marginBottom: 16, fontFamily: 'Georgia, serif', letterSpacing: 1 }}>{editingAward.name}</p>
                  {(winnerPhoto || getAward(editingAward.id)?.photo_url) && (
                    <img
                      src={winnerPhoto ? URL.createObjectURL(winnerPhoto) : getAward(editingAward.id).photo_url}
                      alt="preview"
                      style={{ width: 80, height: 80, borderRadius: '50%', objectFit: 'cover', border: `2px solid ${gold}`, marginBottom: 14, display: 'block' }} />
                  )}
                  <label style={{ color: '#d4a0b0', fontSize: 12, display: 'block', marginBottom: 4, fontFamily: 'Georgia, serif' }}>Nombre del ganador</label>
                  <input value={winnerName} onChange={e => setWinnerName(e.target.value)}
                    style={{ width: '100%', background: darkBg, border: borderGold, borderRadius: 8, padding: '10px 12px', color: '#fff', fontSize: 15, boxSizing: 'border-box' as const, marginBottom: 12, fontFamily: 'Georgia, serif' }}
                    placeholder="Nombre..." />
                  <label style={{ color: '#d4a0b0', fontSize: 12, display: 'block', marginBottom: 8, fontFamily: 'Georgia, serif' }}>Foto (opcional)</label>
                  <input type="file" accept="image/*" style={{ color: '#d4a0b0', fontSize: 12, marginBottom: 16 }}
                    onChange={e => setWinnerPhoto(e.target.files?.[0] ?? null)} />
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button onClick={() => { setEditingAward(null); setWinnerName(''); setWinnerPhoto(null) }}
                      style={{ flex: 1, background: 'linear-gradient(135deg, #5A1525, #3A0A15)', color: gold, border: `1px solid ${gold}66`, borderRadius: 10, padding: '12px', cursor: 'pointer', fontWeight: 700, fontFamily: 'Georgia, serif' }}>
                      Cancelar
                    </button>
                    <button onClick={saveAward} disabled={saving}
                      style={{ flex: 1, background: `linear-gradient(135deg, ${gold}, #B8960C)`, color: darkBg, border: 'none', borderRadius: 10, padding: '12px', cursor: 'pointer', fontWeight: 700, fontFamily: 'Georgia, serif' }}>
                      {saving ? 'Guardando...' : 'Guardar'}
                    </button>
                  </div>
                </div>
                {goldBar}
              </div>
            </div>
          )}
        </>
      )}

      {innerTab === 'gallery' && (
        <>
          {isAdmin && (
            <div style={{ borderRadius: 12, marginBottom: 16, overflow: 'hidden', boxShadow: `0 0 0 1px ${gold}44` }}>
              {goldBar}
              <div style={{ background: cardBg, padding: 16, textAlign: 'center' }}>
                <p style={{ color: '#d4a0b0', fontSize: 13, marginBottom: 8, fontFamily: 'Georgia, serif' }}>Subir fotos de la jornada</p>
                <input type="file" accept="image/*" multiple style={{ color: '#d4a0b0', fontSize: 12, marginBottom: 8 }}
                  onChange={async e => {
                    const files = Array.from(e.target.files ?? [])
                    for (const file of files) await uploadGalleryPhoto(file)
                    e.target.value = ''
                  }} />
                {uploadingGallery && <p style={{ color: gold, fontSize: 12, fontFamily: 'Georgia, serif' }}>Subiendo...</p>}
              </div>
              {goldBar}
            </div>
          )}
          {gallery.length === 0 ? (
            <div style={{ borderRadius: 12, overflow: 'hidden', boxShadow: `0 0 0 1px ${gold}44` }}>
              {goldBar}
              <div style={{ background: cardBg, padding: 24, textAlign: 'center' }}>
                <p style={{ color: '#d4a0b0', fontSize: 14, fontFamily: 'Georgia, serif' }}>No hay grandes momentos todavía.</p>
              </div>
              {goldBar}
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 4 }}>
              {gallery.map(photo => (
                <div key={photo.id} style={{ position: 'relative', aspectRatio: '1', overflow: 'hidden', borderRadius: 8, boxShadow: `0 0 0 1px ${gold}33` }}>
                  <img src={photo.photo_url} alt="galeria"
                    style={{ width: '100%', height: '100%', objectFit: 'cover', cursor: 'pointer' }}
                    onClick={() => setLightbox(photo.photo_url)} />
                  {isAdmin && (
                    <button onClick={() => deleteGalleryPhoto(photo.id, photo.photo_url)}
                      style={{ position: 'absolute', top: 4, right: 4, background: 'rgba(0,0,0,0.7)', border: 'none', borderRadius: '50%', width: 24, height: 24, color: '#fff', cursor: 'pointer', fontSize: 12, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      ×
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* Lightbox galería */}
      {lightbox && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.97)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200, padding: 16 }}
          onClick={() => setLightbox(null)}>
          <img src={lightbox} alt="foto" style={{ maxWidth: '100%', maxHeight: '90vh', borderRadius: 12, objectFit: 'contain' }} />
        </div>
      )}

      {/* Pantalla festiva de premio */}
      {featuredAward && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.97)', display: 'flex', alignItems: 'center', justifyContent: 'flex-start', zIndex: 300, padding: '24px 24px 40px', flexDirection: 'column', gap: 16, overflowY: 'auto' }}
          onClick={() => setFeaturedAward(null)}
        >
          {/* Canvas confeti */}
          <canvas ref={confettiRef} style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 301 }} />

          {/* Tarjeta del premio — esta es la que se captura */}
          <div
            ref={shareCardRef}
            onClick={e => e.stopPropagation()}
            style={{
              position: 'relative', zIndex: 302,
              width: '100%', maxWidth: 340,
              borderRadius: 24,
              background: 'linear-gradient(160deg, #1a0a10 0%, #2a1020 100%)',
              border: `3px solid ${gold}`,
              boxShadow: `0 0 40px rgba(201,168,76,0.4), inset 0 0 40px rgba(201,168,76,0.05)`,
              overflow: 'hidden',
              padding: '0 0 20px',
            }}
          >
            {/* Marco dorado superior */}
            <div style={{ background: `linear-gradient(90deg, ${gold}, #f0d070, ${gold})`, padding: '8px 16px', textAlign: 'center' }}>
              <p style={{ color: darkBg, fontSize: 11, fontWeight: 900, letterSpacing: 3, margin: 0, fontFamily: 'Georgia, serif' }}>
                {featuredAward.type.name.toUpperCase()}
              </p>
            </div>

            {/* Foto */}
            <div style={{ padding: '20px 24px 0' }}>
              {featuredAward.award?.photo_url ? (
                <img src={featuredAward.award.photo_url} alt={featuredAward.award.winner_name}
                  style={{ width: '100%', aspectRatio: '1', objectFit: 'cover', borderRadius: 16, border: `4px solid ${gold}`, boxShadow: `0 0 20px rgba(201,168,76,0.3)` }} />
              ) : (
                <div style={{ width: '100%', aspectRatio: '1', background: `linear-gradient(135deg, #4A0B1E, #8B1A3A)`, borderRadius: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', border: `4px solid ${gold}` }}>
                  <span style={{ fontSize: 80, fontWeight: 900, color: gold, opacity: 0.5, fontFamily: 'Georgia, serif' }}>{featuredAward.award?.winner_name?.charAt(0) ?? '?'}</span>
                </div>
              )}
            </div>

            {/* Nombre ganador */}
            <div style={{ textAlign: 'center', padding: '18px 24px 0' }}>
              <p style={{ color: '#d4a0b0', fontSize: 11, margin: '0 0 6px', letterSpacing: 2, fontFamily: 'Georgia, serif' }}>GANADOR</p>
              <p style={{ fontSize: 26, fontWeight: 900, color: '#fff', margin: '0 0 8px', fontFamily: 'Georgia, serif', textShadow: `0 2px 12px rgba(201,168,76,0.5)` }}>
                {featuredAward.award?.winner_name}
              </p>
              <div style={{ display: 'flex', justifyContent: 'center', gap: 6 }}>
                {[0, 1, 2].map(i => <span key={i} style={{ color: gold, fontSize: 18 }}>★</span>)}
              </div>
            </div>

            {/* Logo torneo */}
            <p style={{ color: `${gold}66`, fontSize: 10, textAlign: 'center', margin: '14px 0 0', fontFamily: 'Georgia, serif', letterSpacing: 2 }}>
              GO POLO · {tournament.name.toUpperCase()}
            </p>

            {/* Marco dorado inferior */}
            <div style={{ background: `linear-gradient(90deg, ${gold}, #f0d070, ${gold})`, height: 4, marginTop: 16 }} />
          </div>

          {/* Botones debajo de la tarjeta */}
          <div onClick={e => e.stopPropagation()} style={{ position: 'relative', zIndex: 400, display: 'flex', gap: 10, width: '100%', maxWidth: 340 }}>
            <button
              onClick={shareAward}
              disabled={sharing}
              style={{
                flex: 1,
                background: sharing ? 'rgba(201,168,76,0.3)' : `linear-gradient(135deg, ${gold}, #B8960C)`,
                color: sharing ? gold : darkBg,
                border: 'none', borderRadius: 12, padding: '14px', cursor: sharing ? 'not-allowed' : 'pointer',
                fontWeight: 700, fontSize: 15, fontFamily: 'Georgia, serif', letterSpacing: 1,
                boxShadow: `0 4px 16px rgba(201,168,76,0.3)`,
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                backdropFilter: 'blur(4px)',
              }}
            >
              {sharing ? 'Preparando...' : '↑ Compartir'}
            </button>
            <button
              onClick={() => setFeaturedAward(null)}
              style={{
                background: 'rgba(30,5,15,0.8)', color: '#d4a0b0',
                border: `1px solid ${gold}44`, borderRadius: 12, padding: '14px 18px',
                cursor: 'pointer', fontSize: 14, fontFamily: 'Georgia, serif',
              }}
            >
              Cerrar
            </button>
          </div>

          <p onClick={e => e.stopPropagation()} style={{ position: 'relative', zIndex: 302, color: `${gold}44`, fontSize: 10, fontFamily: 'Georgia, serif', margin: 0 }}>
            Toca fuera para cerrar
          </p>
        </div>
      )}
    </div>
  )
}
