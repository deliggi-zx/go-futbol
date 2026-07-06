import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const DAILY_API_BASE = 'https://api.daily.co/v1'

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    status,
  })
}

// Nombre deterministico: dos llamadas casi simultaneas (admin + espectador
// entrando al mismo tiempo) apuntan siempre a la misma sala, sin carreras.
function roomNameFor(matchId: string): string {
  return `match${matchId.replace(/-/g, '')}`.slice(0, 40)
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
    const dailyApiKey = Deno.env.get('DAILY_API_KEY') ?? ''
    const dailyHeaders = { Authorization: `Bearer ${dailyApiKey}` }

    const { match_id, action } = await req.json()
    if (!match_id) return jsonResponse({ error: 'Falta match_id' }, 400)

    const { data: match, error: matchError } = await supabaseAdmin
      .from('matches')
      .select('id, daily_room_url')
      .eq('id', match_id)
      .single()

    if (matchError || !match) return jsonResponse({ error: 'Partido no encontrado' }, 404)

    const roomName = roomNameFor(match_id)

    if (action === 'close') {
      if (match.daily_room_url) {
        await fetch(`${DAILY_API_BASE}/rooms/${roomName}`, { method: 'DELETE', headers: dailyHeaders })
        await supabaseAdmin.from('matches').update({ daily_room_url: null }).eq('id', match_id)
      }
      return jsonResponse({ success: true })
    }

    // action: 'get-or-create'
    if (match.daily_room_url) return jsonResponse({ url: match.daily_room_url })

    const expSeconds = Math.floor(Date.now() / 1000) + 6 * 60 * 60 // 6 horas de margen

    const createRes = await fetch(`${DAILY_API_BASE}/rooms`, {
      method: 'POST',
      headers: { ...dailyHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: roomName,
        privacy: 'public',
        properties: { exp: expSeconds, eject_at_room_exp: true },
      }),
    })

    let roomData: any
    if (createRes.ok) {
      roomData = await createRes.json()
    } else {
      // Pudo fallar porque ya existe (carrera entre dos llamadas casi simultaneas)
      // u otro error real. Antes de fallar, intento recuperarla por nombre.
      const getRes = await fetch(`${DAILY_API_BASE}/rooms/${roomName}`, { headers: dailyHeaders })
      if (getRes.ok) {
        roomData = await getRes.json()
      } else {
        const errBody = await createRes.json().catch(() => ({}))
        return jsonResponse({ error: errBody?.info ?? 'Error creando la sala en Daily' }, 500)
      }
    }

    await supabaseAdmin.from('matches').update({ daily_room_url: roomData.url }).eq('id', match_id)

    return jsonResponse({ url: roomData.url })
  } catch {
    return jsonResponse({ error: 'Error interno' }, 500)
  }
})
