// Maps the plain-key exceptions raised by Postgres (MOBILE-PLAN.md §2.0) to
// user-facing copy, plus a few generic Postgres/network error codes.

export type ErrorKey =
  | 'not_authenticated'
  | 'not_allowed'
  | 'not_found'
  | 'username_invalid'
  | 'username_taken'
  | 'username_reserved'
  | 'username_change_too_soon'
  | 'display_name_invalid'
  | 'display_name_reserved'
  | 'phone_invalid'
  | 'phone_taken'
  | 'username_or_phone_taken'
  | 'rate_limited_posts'
  | 'rate_limited_comments'
  | 'rate_limited_messages'
  | 'rate_limited_requests'
  | 'rate_limited_reports'
  | 'rate_limited_feedback'
  | 'self_vote'
  | 'own_post'
  | 'not_an_alert'
  | 'not_an_answer'
  | 'post_not_found'
  | 'bad_parent'
  | 'parent_deleted'
  | 'thread_too_deep'
  | 'blocked'
  | 'request_pending'
  | 'request_pending_accept_first'
  | 'request_declined'
  | 'delete_window_passed'
  | 'under_review'
  | 'attachments_need_accept'
  | 'attachments_unavailable'
  | 'bad_attachment'
  | 'bad_reply'
  | 'attachment_too_large'
  | 'photo_too_large'
  | 'content_blocked'
  | 'not_a_member'
  | 'community_unavailable'
  | 'community_not_eligible'
  | 'slug_invalid'
  | 'slug_taken'
  | 'owner_cannot_leave'
  | 'already_reported'
  | 'cannot_report_self'
  | 'already_resolved'
  | 'bad_decision'
  | 'filter_pattern_invalid';

const MESSAGES: Record<ErrorKey, string> = {
  not_authenticated: 'Please sign in to do that.',
  not_allowed: "You can't do that.",
  not_found: "That couldn't be found.",
  username_invalid: 'Usernames are 3–20 letters, numbers or _, starting with a letter.',
  username_taken: 'That username is taken.',
  username_reserved: "That username isn't available.",
  username_change_too_soon: 'You can change your username again 30 days after the last change.',
  display_name_invalid: 'Please enter a display name.',
  display_name_reserved: "That display name isn't available.",
  phone_invalid: 'Enter a valid 10-digit Indian mobile number.',
  phone_taken: 'That phone number is already in use.',
  username_or_phone_taken: "That username or phone number is already taken.",
  rate_limited_posts: "You're posting too fast. Try again later.",
  rate_limited_comments: "You're commenting too fast. Try again later.",
  rate_limited_messages: "You're sending messages too fast. Try again later.",
  rate_limited_requests: "You're sending too many requests. Try again later.",
  rate_limited_reports: "You've sent a lot of reports. Try again later.",
  rate_limited_feedback: "You've sent a lot of feedback today. Thank you — try again tomorrow.",
  self_vote: "You can't vote on your own post.",
  own_post: "You can't do that on your own post.",
  not_an_alert: 'This only applies to alerts.',
  not_an_answer: 'This only applies to answers.',
  post_not_found: "That post couldn't be found.",
  bad_parent: "That comment couldn't be found.",
  parent_deleted: "You can't reply to a deleted comment.",
  thread_too_deep: 'This thread is too deep to reply to directly.',
  blocked: "You can't interact with this account.",
  request_pending: 'A message request is already pending.',
  request_pending_accept_first: 'They need to accept your request before you can send more messages.',
  request_declined: 'This message request was declined.',
  under_review: "This message can't be deleted for everyone while it is under review.",
  delete_window_passed: 'You can only delete a message for everyone within 24 hours of sending it.',
  attachments_need_accept: 'Photos can be sent once they accept your request.',
  attachments_unavailable: "Photos can't be sent in this chat right now. Try again later.",
  bad_attachment: "That photo couldn't be sent. Try another one.",
  bad_reply: "That message can't be replied to any more.",
  attachment_too_large: 'That photo is too large. Try a smaller one.',
  photo_too_large: 'That photo is too large (over 3 MB). Try a smaller one or crop it.',
  content_blocked: "This contains language that isn't allowed on pincode.",
  not_a_member: "You're not a member of this community.",
  community_unavailable: "This community isn't available.",
  community_not_eligible: "You don't meet the requirements to create a community yet.",
  slug_invalid: 'Use lowercase letters, numbers and hyphens.',
  slug_taken: 'That community URL is taken.',
  owner_cannot_leave: 'The owner cannot leave the community.',
  already_reported: 'You already reported this.',
  cannot_report_self: "You can't report yourself.",
  already_resolved: 'This has already been resolved.',
  bad_decision: "That decision isn't valid.",
  filter_pattern_invalid: "That pattern isn't a valid regular expression.",
};

function isErrorKey(key: string): key is ErrorKey {
  return Object.prototype.hasOwnProperty.call(MESSAGES, key);
}

type SupabaseLikeError = { message?: string; code?: string } | null | undefined;

// Maps a thrown/returned Supabase error (or any error-like value) to copy.
export function messageFor(error: unknown): string {
  if (!error) return 'Something went wrong.';

  const err = error as SupabaseLikeError & { name?: string };
  const raw = (err?.message ?? String(error)).trim();

  if (isErrorKey(raw)) return MESSAGES[raw];

  // Postgres/PostgREST error messages sometimes wrap the raised key, e.g.
  // `duplicate key value violates unique constraint …` or a RAISE EXCEPTION
  // message that PostgREST prefixes. Try to find one of our keys inside it.
  const found = (Object.keys(MESSAGES) as ErrorKey[]).find((key) => raw.includes(key));
  if (found) return MESSAGES[found];

  if (err?.code === '23505') return "That's already taken.";
  if (err?.code === '42501' || /row-level security/i.test(raw)) {
    return "You can't do that right now.";
  }
  if (/network request failed|fetch failed|failed to fetch/i.test(raw)) {
    return "Couldn't connect. Check your internet connection and try again.";
  }

  return raw || 'Something went wrong.';
}
