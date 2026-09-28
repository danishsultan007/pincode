// Date/time/distance formatting. Ported from app.js, using
// Intl.DateTimeFormat('en-IN', …) instead of the browser default locale.

const MIN = 60 * 1000;
const H = 60 * MIN;
const D = 24 * H;

// Accepts a Date, ISO string or epoch ms.
function toMs(ts: Date | string | number): number {
  if (ts instanceof Date) return ts.getTime();
  if (typeof ts === 'string') return new Date(ts).getTime();
  return ts;
}

// "just now" / "5m" / "3h" / "2d" / a localized date once past 30 days.
export function timeAgo(ts: Date | string | number): string {
  const ms = toMs(ts);
  const s = Math.floor((Date.now() - ms) / 1000);
  if (s < 60) return 'just now';
  const m = Math.floor(s / 60);
  if (m < 60) return m + 'm';
  const h = Math.floor(m / 60);
  if (h < 24) return h + 'h';
  const d = Math.floor(h / 24);
  if (d < 30) return d + 'd';
  return new Intl.DateTimeFormat('en-IN').format(ms);
}

// "3 hours" / "2 days" / "1 week" / "2 months", used for "confirmed 3 hours ago" copy.
export function relAge(ts: Date | string | number): string {
  const ms = toMs(ts);
  const d = Math.floor((Date.now() - ms) / D);
  if (d < 1) return Math.max(1, Math.floor((Date.now() - ms) / H)) + ' hours';
  if (d < 7) return d + (d === 1 ? ' day' : ' days');
  if (d < 30) {
    const w = Math.floor(d / 7);
    return w + (w === 1 ? ' week' : ' weeks');
  }
  const mo = Math.floor(d / 30);
  return mo + (mo === 1 ? ' month' : ' months');
}

// "N min" under 60 min, "N h" under 48 h, else "N d".
export function fmtDuration(ms: number): string {
  if (ms < 60 * MIN) return Math.max(0, Math.round(ms / MIN)) + ' min';
  if (ms < 48 * H) return Math.round(ms / H) + ' h';
  return Math.round(ms / D) + ' d';
}

export function fmtTime(ts: Date | string | number): string {
  return new Intl.DateTimeFormat('en-IN', { hour: 'numeric', minute: '2-digit' }).format(toMs(ts));
}

export function fmtWhen(ts: Date | string | number): string {
  const ms = toMs(ts);
  const day = new Intl.DateTimeFormat('en-IN', { weekday: 'short', day: 'numeric', month: 'short' }).format(ms);
  return `${day}, ${fmtTime(ms)}`;
}

export function fmtKm(km: number): string {
  return km.toFixed(1) + ' km';
}

// "Joined Sep 2026"
export function joinedLabel(ts: Date | string | number): string {
  const month = new Intl.DateTimeFormat('en-IN', { month: 'short', year: 'numeric' }).format(toMs(ts));
  return `Joined ${month}`;
}
