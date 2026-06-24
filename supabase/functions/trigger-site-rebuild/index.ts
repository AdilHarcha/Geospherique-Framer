// Supabase Edge Function — called by Database Webhooks when CMS tables change.
// Triggers a GitHub Actions workflow_dispatch on the geospherique-framer repo.
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

const GITHUB_TOKEN = Deno.env.get('GITHUB_TOKEN')!
const GITHUB_REPO = 'adilharcha/geospherique-framer'

serve(async (req: Request) => {
  if (req.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 })
  }

  const res = await fetch(
    `https://api.github.com/repos/${GITHUB_REPO}/dispatches`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${GITHUB_TOKEN}`,
        Accept: 'application/vnd.github.v3+json',
        'Content-Type': 'application/json',
        'User-Agent': 'Geospherique-CMS-Webhook',
      },
      body: JSON.stringify({ event_type: 'cms-update' }),
    }
  )

  if (!res.ok) {
    const err = await res.text()
    console.error('GitHub dispatch error:', err)
    return new Response('GitHub dispatch failed', { status: 502 })
  }

  return new Response(JSON.stringify({ triggered: true }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
})
