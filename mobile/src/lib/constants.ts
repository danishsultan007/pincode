export const DEFAULT_LOC = {
  lat: 12.9915,
  lng: 77.6944,
  area: 'Mahadevapura',
  city: 'Bengaluru',
  pincode: '560048',
} as const;

// Public contact address: shown on the legal pages and the delete-account page,
// and sent to the geocoder as its contact. It is also the Gmail account that
// sends auth emails via Supabase SMTP, so replies land in the same inbox.
// Switch to a domain address when one is bought (also update the Play listing).
export const SUPPORT_EMAIL = 'pincode.app.team@gmail.com';

export const RINGS = [1, 3, 5, 10] as const;
export const MIN_FEED = 8;
export const RADII = [1, 3, 5, 10] as const;

export type PostTag =
  | 'cook'
  | 'maid'
  | 'repair'
  | 'electrician'
  | 'plumber'
  | 'pets'
  | 'doctor'
  | 'other';

export const TAGS: { code: PostTag; label: string }[] = [
  { code: 'cook', label: 'Cook' },
  { code: 'maid', label: 'Maid' },
  { code: 'repair', label: 'Repair' },
  { code: 'electrician', label: 'Electrician' },
  { code: 'plumber', label: 'Plumber' },
  { code: 'pets', label: 'Pets' },
  { code: 'doctor', label: 'Doctor' },
  { code: 'other', label: 'Other' },
];

export type ReactionCode = 'like' | 'love' | 'haha' | 'wow' | 'thanks' | 'celebrate';

export const REACTIONS: { code: ReactionCode; glyph: string }[] = [
  { code: 'like', glyph: '👍' },
  { code: 'love', glyph: '❤️' },
  { code: 'haha', glyph: '😂' },
  { code: 'wow', glyph: '😮' },
  { code: 'thanks', glyph: '🙏' },
  { code: 'celebrate', glyph: '🎉' },
];

export type ReportCategory = 'impersonation' | 'illegal' | 'scam' | 'harassment' | 'spam' | 'other';

export const REPORT_CATEGORIES: { code: ReportCategory; label: string; description: string }[] = [
  { code: 'impersonation', label: 'Impersonation or imposter', description: 'Pretending to be someone else, or a fake account.' },
  { code: 'illegal', label: 'Illegal content or activity', description: 'Something unlawful is being shown, sold or arranged.' },
  { code: 'scam', label: 'Scam or suspicious', description: 'Asking for money, OTPs, or a "registration fee".' },
  { code: 'harassment', label: 'Harassment or hate', description: 'Targets or demeans a person or group.' },
  { code: 'spam', label: 'Spam', description: 'Repeated, irrelevant or promotional content.' },
  { code: 'other', label: 'Something else', description: 'Doesn’t fit the categories above.' },
];

export type CommunityCategory =
  | 'area'
  | 'parents'
  | 'pets'
  | 'fitness'
  | 'running'
  | 'cycling'
  | 'sports'
  | 'food'
  | 'books'
  | 'gardening'
  | 'environment'
  | 'volunteering'
  | 'arts'
  | 'music'
  | 'tech'
  | 'seniors'
  | 'women'
  | 'students'
  | 'spiritual'
  | 'events'
  | 'civic'
  | 'other';

export const COMMUNITY_CATEGORIES: { code: CommunityCategory; label: string }[] = [
  { code: 'area', label: 'Area / neighborhood' },
  { code: 'parents', label: 'Parents' },
  { code: 'pets', label: 'Pets' },
  { code: 'fitness', label: 'Fitness' },
  { code: 'running', label: 'Running' },
  { code: 'cycling', label: 'Cycling' },
  { code: 'sports', label: 'Sports' },
  { code: 'food', label: 'Food' },
  { code: 'books', label: 'Books' },
  { code: 'gardening', label: 'Gardening' },
  { code: 'environment', label: 'Environment' },
  { code: 'volunteering', label: 'Volunteering' },
  { code: 'arts', label: 'Arts' },
  { code: 'music', label: 'Music' },
  { code: 'tech', label: 'Tech' },
  { code: 'seniors', label: 'Seniors' },
  { code: 'women', label: 'Women' },
  { code: 'students', label: 'Students' },
  { code: 'spiritual', label: 'Spiritual' },
  { code: 'events', label: 'Events' },
  { code: 'civic', label: 'Civic' },
  { code: 'other', label: 'Other' },
];

export const INTERESTS: string[] = [
  'cooking', 'pets', 'parenting', 'fitness', 'running', 'cycling', 'yoga', 'cricket', 'football',
  'badminton', 'books', 'gardening', 'music', 'movies', 'photography', 'tech', 'startups',
  'volunteering', 'environment', 'food', 'travel', 'art', 'gaming', 'spirituality', 'home repair',
  'languages', 'seniors', 'events',
];

export const REP = {
  communityMinRep: 100,
  communityMinAgeDays: 30,
} as const;
