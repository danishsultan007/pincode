// Retention clean-up for chat photos: removes files older than 90 days and uploads
// that were never attached to a message (older than 24 h). Messages keep their text;
// the app shows "Photo expired" where the file is gone.
//
// Called once a day by .github/workflows/cleanup-attachments.yml with the shared
// secret in the `x-cleanup-secret` header (set CLEANUP_SECRET with
// `supabase secrets set`). verify_jwt is off for this function; the secret is the gate.

import { createClient } from 'npm:@supabase/supabase-js@2';
import { json } from '../_shared/cors.ts';

const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
  auth: { persistSession: false },
});

const RETENTION_DAYS = 90;
const ORPHAN_HOURS = 24;
const CHUNK = 1000;
const MAX_PER_RUN = 20000;

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  const secret = Deno.env.get('CLEANUP_SECRET') ?? '';
  const given = req.headers.get('x-cleanup-secret') ?? '';
  if (!secret || !safeEqual(given, secret)) return json({ error: 'forbidden' }, 403);

  try {
    // The API returns at most ~1000 rows per call: list, remove, repeat until
    // nothing is left (removed files drop out of the next listing).
    let removed = 0;
    while (removed < MAX_PER_RUN) {
      const { data, error } = await admin.rpc('_expired_chat_attachments', {
        p_days: RETENTION_DAYS,
        p_orphan_hours: ORPHAN_HOURS,
      });
      if (error) throw error;
      const paths = (data ?? []) as string[];
      if (paths.length === 0) break;
      for (let i = 0; i < paths.length; i += CHUNK) {
        const chunk = paths.slice(i, i + CHUNK);
        const { error: rmErr } = await admin.storage.from('chat-attachments').remove(chunk);
        if (rmErr) throw rmErr;
        removed += chunk.length;
      }
    }
    return json({ ok: true, removed });
  } catch (e) {
    console.error('cleanup-chat-attachments failed', e);
    return json({ error: 'server_error' }, 500);
  }
});
