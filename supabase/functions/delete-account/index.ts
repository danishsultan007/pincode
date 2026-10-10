// Permanently deletes the calling user's account: their uploaded files in
// storage, their sent chat messages, then the auth user (which cascades to the
// profile and everything they posted). Storage goes first so a failure leaves
// a retryable account instead of orphaned public files.

import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders, json } from '../_shared/cors.ts';

const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
  auth: { persistSession: false },
});

const BUCKETS = ['avatars', 'post-images'];   // objects live at <bucket>/<uid>/<file>
const PAGE = 1000;

async function emptyUserFolder(bucket: string, uid: string) {
  // Always list from offset 0: each pass removes what it lists, so the next
  // listing starts at the remaining files.
  for (;;) {
    const { data, error } = await admin.storage.from(bucket).list(uid, { limit: PAGE, offset: 0 });
    if (error) throw error;
    if (!data || data.length === 0) return;
    const { error: rmErr } = await admin.storage.from(bucket).remove(data.map((o) => `${uid}/${o.name}`));
    if (rmErr) throw rmErr;
    if (data.length < PAGE) return;
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  const jwt = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  if (!jwt) return json({ error: 'not_authenticated' }, 401);

  const { data: userData, error: userErr } = await admin.auth.getUser(jwt);
  if (userErr || !userData.user) return json({ error: 'not_authenticated' }, 401);
  const uid = userData.user.id;

  try {
    for (const bucket of BUCKETS) await emptyUserFolder(bucket, uid);

    // Chat photos live at chat-attachments/<conversation>/<sender>/<file>, not under
    // the user's folder, and the user's direct conversations (with the other
    // person's photos in them) cascade away with the account. Remove every file the
    // user owns or that sits in one of their conversations.
    // The API returns at most ~1000 rows per call, so list, remove, and list again
    // until nothing is left (removed files drop out of the next listing).
    for (let round = 0; round < 100; round++) {
      const { data: chatPaths, error: pathsErr } = await admin.rpc('_chat_attachment_paths_for_user', { p_uid: uid });
      if (pathsErr) throw pathsErr;
      const paths = (chatPaths ?? []) as string[];
      if (paths.length === 0) break;
      const { error: rmErr } = await admin.storage.from('chat-attachments').remove(paths);
      if (rmErr) throw rmErr;
    }

    // messages.sender_id is ON DELETE SET NULL, which would leave the user's
    // message text readable by the other person. Remove their messages
    // (system messages already have a null sender, so they are untouched).
    const { error: msgErr } = await admin.from('messages').delete().eq('sender_id', uid);
    if (msgErr) throw msgErr;

    const { error: delErr } = await admin.auth.admin.deleteUser(uid);
    if (delErr) throw delErr;
    return json({ ok: true });
  } catch (e) {
    console.error('delete-account failed', uid, e);
    return json({ error: 'server_error', message: 'Could not delete your account. Please try again.' }, 500);
  }
});
