import { RINGS, MIN_FEED } from './constants';

export type FeedItem = { distKm: number; [key: string]: unknown };

export type FeedGroup<T extends FeedItem> = {
  divider: string | null;
  items: T[];
};

// Ports the prototype's ring-grouping algorithm (§7.4): everything within the
// current radius first, then widening rings until MIN_FEED items are shown.
export function buildFeedGroups<T extends FeedItem>(items: T[], radiusKm: number): FeedGroup<T>[] {
  const within = items.filter((x) => x.distKm <= radiusKm);
  const groups: FeedGroup<T>[] = [{ divider: null, items: within }];
  let total = within.length;
  let from = radiusKm;
  for (const to of RINGS) {
    if (total >= MIN_FEED) break;
    if (to <= from) continue;
    const band = items.filter((x) => x.distKm > from && x.distKm <= to);
    if (band.length) {
      groups.push({ divider: `A bit further away (${from}–${to} km)`, items: band });
      total += band.length;
    }
    from = to;
  }
  return groups;
}
