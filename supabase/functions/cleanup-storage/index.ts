import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Solo aplica a torneos finalizados a partir de este momento (el deploy de
// esta limpieza automática) — un torneo finalizado antes de esto nunca es
// candidato, sin importar cuánto tiempo pase.
const CUTOFF_ISO = '2026-07-20T15:58:06.000Z'
const VIDEO_RETENTION_DAYS = 14
const GALLERY_RETENTION_DAYS = 30

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    status,
  })
}

// Deriva el path dentro del bucket a partir de la URL pública guardada en la
// columna — mismo criterio que ya usa deleteGalleryPhoto en AwardsView.tsx.
function storagePathFromPublicUrl(url: string | null): string | null {
  if (!url) return null
  const marker = '/avatars/'
  const idx = url.indexOf(marker)
  if (idx === -1) return null
  return url.slice(idx + marker.length)
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    const now = Date.now()
    const videoThreshold = new Date(now - VIDEO_RETENTION_DAYS * 24 * 60 * 60 * 1000).toISOString()
    const galleryThreshold = new Date(now - GALLERY_RETENTION_DAYS * 24 * 60 * 60 * 1000).toISOString()

    // ── Videos de MVP: torneos finalizados hace más de 14 días ──
    let videosDeleted = 0
    const { data: videoTournaments } = await supabaseAdmin
      .from('tournaments')
      .select('id')
      .eq('app', 'futbol')
      .not('finished_at', 'is', null)
      .gt('finished_at', CUTOFF_ISO)
      .lte('finished_at', videoThreshold)

    const videoTournamentIds = (videoTournaments ?? []).map((t: any) => t.id)
    if (videoTournamentIds.length > 0) {
      const { data: teams } = await supabaseAdmin
        .from('teams')
        .select('id')
        .in('tournament_id', videoTournamentIds)
      const teamIds = (teams ?? []).map((t: any) => t.id)

      if (teamIds.length > 0) {
        const { data: players } = await supabaseAdmin
          .from('players')
          .select('id, intro_video_url')
          .in('team_id', teamIds)
          .not('intro_video_url', 'is', null)

        for (const player of players ?? []) {
          const path = storagePathFromPublicUrl(player.intro_video_url)
          if (path) {
            const { error: removeError } = await supabaseAdmin.storage.from('avatars').remove([path])
            // Si falla el borrado del archivo, no tocamos la fila — se reintenta solo
            // en la próxima corrida (el torneo sigue siendo elegible al día siguiente).
            if (removeError) continue
          }
          await supabaseAdmin.from('players').update({ intro_video_url: null }).eq('id', player.id)
          videosDeleted++
        }
      }
    }

    // ── Fotos de galería: torneos finalizados hace más de 30 días ──
    let photosDeleted = 0
    const { data: galleryTournaments } = await supabaseAdmin
      .from('tournaments')
      .select('id')
      .eq('app', 'futbol')
      .not('finished_at', 'is', null)
      .gt('finished_at', CUTOFF_ISO)
      .lte('finished_at', galleryThreshold)

    const galleryTournamentIds = (galleryTournaments ?? []).map((t: any) => t.id)
    if (galleryTournamentIds.length > 0) {
      const { data: photos } = await supabaseAdmin
        .from('gallery_photos')
        .select('id, photo_url')
        .in('tournament_id', galleryTournamentIds)

      for (const photo of photos ?? []) {
        const path = storagePathFromPublicUrl(photo.photo_url)
        if (path) {
          const { error: removeError } = await supabaseAdmin.storage.from('avatars').remove([path])
          if (removeError) continue
        }
        await supabaseAdmin.from('gallery_photos').delete().eq('id', photo.id)
        photosDeleted++
      }
    }

    return jsonResponse({ videosDeleted, photosDeleted })
  } catch (e) {
    return jsonResponse({ error: 'Error interno' }, 500)
  }
})
