import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { email, password, orgName, slug, plan } = await req.json()

    // Cliente con service role key — acceso total
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // Verificar slug único
    const { data: existing } = await supabaseAdmin
      .from('organizations')
      .select('id')
      .eq('slug', slug)
      .single()

    if (existing) {
      return new Response(JSON.stringify({ error: 'Ese slug ya está en uso' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400
      })
    }

    // Crear usuario confirmado
    const { data: userData, error: userError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true
    })

    if (userError) {
      return new Response(JSON.stringify({ error: userError.message }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400
      })
    }

    // Forzar contraseña y confirmación
    await supabaseAdmin.auth.admin.updateUserById(userData.user.id, {
      password,
      email_confirm: true
    })

    // Crear organización vinculada
    const { error: orgError } = await supabaseAdmin.from('organizations').insert({
      name: orgName,
      slug,
      owner_id: userData.user.id,
      plan,
      status: 'active',
      tournaments_remaining: plan === 'trial' ? 1 : plan === 'per_tournament' ? 1 : 0
    })

    if (orgError) {
      return new Response(JSON.stringify({ error: orgError.message }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400
      })
    }

    return new Response(JSON.stringify({ success: true, userId: userData.user.id }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200
    })

  } catch (e) {
    return new Response(JSON.stringify({ error: 'Error interno' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500
    })
  }
})