import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const DAILY_API_BASE = 'https://api.daily.co/v1'

// Tope de salas NUEVAS creadas en la ventana de tiempo (no cuenta los
// get-or-create que sirven la sala ya cacheada — solo el POST real a
// Daily.co, que es lo que factura). Uso muy generoso para uso legítimo,
// bajo para un intento de abuso con matches fabricados.
const RATE_LIMIT_WINDOW_MINUTES = 10
const RATE_LIMIT_MAX_CREATIONS = 15

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
      .select('id, daily_room_url, tournament_id')
      .eq('id', match_id)
      .single()

    if (matchError || !match) return jsonResponse({ error: 'Partido no encontrado' }, 404)

    const roomName = roomNameFor(match_id)

    if (action === 'close') {
      // Solo el dueño de la organización del torneo puede cerrar la sala —
      // sin esto, cualquiera con la anon key podía cortarle el relato en
      // vivo a un partido ajeno pasándole su match_id.
      const authHeader = req.headers.get('Authorization')
      const token = authHeader?.replace('Bearer ', '') ?? ''
      const { data: { user } } = await supabaseAdmin.auth.getUser(token)

      let isOwner = false
      if (user && match.tournament_id) {
        const { data: tournament } = await supabaseAdmin
          .from('tournaments')
          .select('org_id, organizations(owner_id)')
          .eq('id', match.tournament_id)
          .single()
        isOwner = (tournament?.organizations as any)?.owner_id === user.id
      }
      if (!isOwner) return jsonResponse({ error: 'No autorizado' }, 401)

      if (match.daily_room_url) {
        await fetch(`${DAILY_API_BASE}/rooms/${roomName}`, { method: 'DELETE', headers: dailyHeaders })
        await supabaseAdmin.from('matches').update({ daily_room_url: null }).eq('id', match_id)
      }
      return jsonResponse({ success: true })
    }

    // action: 'get-or-create'
    // No confío ciegamente en la URL cacheada: la sala vence a las 6hs
    // (eject_at_room_exp) pero Daily la sigue devolviendo por GET aunque ya
    // esté vencida, así que hay que chequear el exp antes de reusarla.
    if (match.daily_room_url) {
      const checkRes = await fetch(`${DAILY_API_BASE}/rooms/${roomName}`, { headers: dailyHeaders })
      if (checkRes.ok) {
        const roomInfo = await checkRes.json()
        const exp = roomInfo?.config?.exp
        const stillAlive = typeof exp !== 'number' || exp > Math.floor(Date.now() / 1000)
        if (stillAlive) return jsonResponse({ url: match.daily_room_url })
      }
      // Vencida o ya no existe en Daily: no confío en la URL cacheada. Borro
      // lo que quede antes de crear una sala nueva con el mismo nombre
      // determinístico.
      await fetch(`${DAILY_API_BASE}/rooms/${roomName}`, { method: 'DELETE', headers: dailyHeaders }).catch(() => {})
      await supabaseAdmin.from('matches').update({ daily_room_url: null }).eq('id', match_id)
    }

    // Rate limit: recién acá, porque el cache-hit de arriba no crea nada en
    // Daily y no debe consumir cupo.
    const windowStart = new Date(Date.now() - RATE_LIMIT_WINDOW_MINUTES * 60 * 1000).toISOString()
    const { count: recentCreations } = await supabaseAdmin
      .from('daily_room_creations')
      .select('id', { count: 'exact', head: true })
      .gte('created_at', windowStart)

    if ((recentCreations ?? 0) >= RATE_LIMIT_MAX_CREATIONS) {
      return jsonResponse({ error: 'Se crearon demasiadas salas en poco tiempo. Probá de nuevo en unos minutos.' }, 429)
    }

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
    await supabaseAdmin.from('daily_room_creations').insert({ match_id })

    return jsonResponse({ url: roomData.url })
  } catch {
    return jsonResponse({ error: 'Error interno' }, 500)
  }
})
