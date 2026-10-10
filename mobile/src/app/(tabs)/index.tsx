import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Screen } from '@/components/ui/Screen';
import { Header } from '@/components/ui/Header';
import { Text } from '@/components/ui/Text';
import { Icon } from '@/components/ui/Icon';
import { SearchInput } from '@/components/ui/SearchInput';
import { ChipRow } from '@/components/ui/ChipRow';
import { Chip } from '@/components/ui/Chip';
import { Banner } from '@/components/ui/Banner';
import { EmptyState } from '@/components/ui/EmptyState';
import { Button } from '@/components/ui/Button';
import { Skeleton } from '@/components/ui/Skeleton';
import { AlertsStrip } from '@/components/post/AlertsStrip';
import { FeedList } from '@/components/post/FeedList';
import PostsMap from '@/components/map/PostsMap';
import { useAuth } from '@/providers/AuthProvider';
import { useLocation } from '@/providers/LocationProvider';
import { useFeed, useAlerts, useSearchFeed, FeedFilter } from '@/hooks/useFeed';
import { DEFAULT_LOC } from '@/lib/constants';
import { actionSheet } from '@/lib/confirm';
import { copy } from '@/lib/copy';
import { breakpoints, colors, radius, shadow, space } from '@/theme/tokens';
import type { PostsMapPoint } from '@/components/map/PostsMap.types';

type ViewMode = 'list' | 'map';
type SortMode = 'newest' | 'nearest';

const FILTER_OPTIONS: { value: FeedFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'unanswered', label: 'Unanswered' },
  { value: 'alerts', label: 'Alerts' },
  { value: 'events', label: 'Events' },
];

export default function HomeTab() {
  const router = useRouter();
  const { me } = useAuth();
  const location = useLocation();
  const { width } = useWindowDimensions();
  const wide = width >= breakpoints.wide;

  const [filter, setFilter] = useState<FeedFilter>('all');
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [sortMode, setSortMode] = useState<SortMode>('newest');
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [pinMode, setPinMode] = useState(false);
  const [locBannerDismissed, setLocBannerDismissed] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput.trim()), 250);
    return () => clearTimeout(t);
  }, [searchInput]);

  const isSearching = search.length > 0;

  const feed = useFeed(filter, sortMode);
  const alerts = useAlerts(filter === 'all' && !isSearching);
  const searchResults = useSearchFeed(search, null);

  const mapItems: PostsMapPoint[] = useMemo(() => {
    const base = isSearching ? searchResults.items : feed.items;
    const merged = filter === 'alerts' || isSearching ? base : [...base, ...alerts.items];
    const byId = new Map<string, PostsMapPoint>();
    for (const p of merged) {
      byId.set(p.id, { id: p.id, lat: p.lat, lng: p.lng, type: p.type, title: p.title });
    }
    return Array.from(byId.values());
  }, [feed.items, alerts.items, searchResults.items, filter, isSearching]);

  const isBanned = !!me?.profile.banned_until && new Date(me.profile.banned_until) > new Date();
  const isPermaBanned = !!me?.profile.ban_permanent;

  const handleMarkerPress = (id: string) => router.push(`/post/${id}`);
  const handleLongPress = (c: { lat: number; lng: number }) =>
    router.push({ pathname: '/compose', params: { lat: String(c.lat), lng: String(c.lng) } });
  const handleConfirmPin = (c: { lat: number; lng: number }) => {
    setPinMode(false);
    router.push({ pathname: '/compose', params: { lat: String(c.lat), lng: String(c.lng) } });
  };

  const handleWidenRadius = () => {
    const idx = [1, 3, 5, 10].indexOf(location.radius);
    const next = [1, 3, 5, 10][Math.min(idx + 1, 3)] as 1 | 3 | 5 | 10;
    location.setRadius(next);
  };
  const handleJumpToDefault = () =>
    location.setLocation({
      lat: DEFAULT_LOC.lat,
      lng: DEFAULT_LOC.lng,
      area: DEFAULT_LOC.area,
      city: DEFAULT_LOC.city,
      pincode: DEFAULT_LOC.pincode,
    });

  const activeItems = isSearching ? searchResults.items : feed.items;
  const isLoading = isSearching ? searchResults.isLoading : feed.isLoading;

  const fullLoc = [location.area, location.pincode, `${location.radius} km`].filter(Boolean).join(' · ');
  const shortLoc = `${location.pincode || location.area} · ${location.radius} km`;

  const openSort = () =>
    actionSheet(copy.feed.sortTitle, [
      { label: copy.feed.sortNewest, onPress: () => setSortMode('newest') },
      { label: copy.feed.sortNearest, onPress: () => setSortMode('nearest') },
    ]);

  const search1 = (
    <SearchInput
      value={searchInput}
      onChangeText={setSearchInput}
      placeholder={copy.feed.searchPlaceholder}
      onClear={() => setSearchInput('')}
      compact={wide}
    />
  );

  const locationPill = (
    <Pressable
      onPress={() => router.push('/location')}
      accessibilityRole="button"
      accessibilityLabel={copy.feed.changeLocation(fullLoc)}
      hitSlop={{ top: 5, bottom: 5, left: 6, right: 6 }}
      style={[styles.locationPill, { maxWidth: wide ? 240 : 150 }]}
    >
      <Icon name="pin" size={14} color={colors.accent} />
      <Text variant="secondary" numberOfLines={1} style={{ flexShrink: 1, color: colors.ink, fontWeight: '600' }}>
        {wide ? fullLoc : shortLoc}
      </Text>
      <Icon name="chevron-down" size={12} color={colors.ink3} />
    </Pressable>
  );

  const bannerNodes: React.ReactNode[] = [];
  if (isPermaBanned) {
    bannerNodes.push(<Banner key="ban" tone="warn" text={copy.moderation.permanentlyBanned} />);
  } else if (isBanned && me?.profile.banned_until) {
    bannerNodes.push(
      <Banner
        key="suspend"
        tone="warn"
        text={copy.moderation.suspendedUntil(new Date(me.profile.banned_until).toLocaleDateString())}
      />
    );
  }
  if (!locBannerDismissed && (location.status === 'denied' || location.status === 'timeout')) {
    bannerNodes.push(
      <Banner key="loc" tone="neutral" text={copy.location.off} onDismiss={() => setLocBannerDismissed(true)} />
    );
  }
  const banners = bannerNodes.length > 0 ? <View style={{ gap: space.s2 }}>{bannerNodes}</View> : null;

  const currentSortLabel = sortMode === 'newest' ? copy.feed.sortNewest : copy.feed.sortNearest;

  const SortButton = () => (
    <Pressable style={styles.sortButton} hitSlop={{ top: 5, bottom: 5, left: 6, right: 6 }} onPress={openSort} accessibilityLabel={copy.feed.sortTitle}>
      <Text variant="secondary" style={{ fontWeight: '600' }}>
        {currentSortLabel}
      </Text>
      <Icon name="chevron-down" size={14} color={colors.ink3} />
    </Pressable>
  );

  const ViewToggle = () => (
    <View style={styles.viewToggle}>
      <Pressable
        hitSlop={{ top: 8, bottom: 8, left: 4, right: 0 }}
        style={[styles.viewToggleBtn, viewMode === 'list' && styles.viewToggleBtnActive]}
        accessibilityRole="button"
        accessibilityState={{ selected: viewMode === 'list' }}
        accessibilityLabel={copy.feed.viewList}
        onPress={() => setViewMode('list')}
      >
        <Icon name="list" size={16} color={viewMode === 'list' ? colors.ink : colors.ink3} />
      </Pressable>
      <Pressable
        hitSlop={{ top: 8, bottom: 8, left: 0, right: 4 }}
        style={[styles.viewToggleBtn, viewMode === 'map' && styles.viewToggleBtnActive]}
        accessibilityRole="button"
        accessibilityState={{ selected: viewMode === 'map' }}
        accessibilityLabel={copy.feed.viewMap}
        onPress={() => setViewMode('map')}
      >
        <Icon name="map" size={16} color={viewMode === 'map' ? colors.ink : colors.ink3} />
      </Pressable>
    </View>
  );

  return (
    <Screen edges={['top']}>
      <Header wordmark center={wide ? search1 : undefined} right={locationPill} />
      {!wide ? <View style={styles.searchRow}>{search1}</View> : null}
      <View style={styles.toolbar}>
        <View style={{ flex: 1, minWidth: 0 }}>
          {isSearching ? (
            <Text variant="meta" numberOfLines={1} style={{ paddingLeft: space.s4 }}>
              {copy.feed.resultsFor(activeItems.length, search)}
            </Text>
          ) : (
            <ChipRow>
              {FILTER_OPTIONS.map((opt) => (
                <Chip key={opt.value} label={opt.label} selected={filter === opt.value} onPress={() => setFilter(opt.value)} />
              ))}
            </ChipRow>
          )}
        </View>
        {!isSearching && viewMode === 'list' ? <SortButton /> : null}
        <ViewToggle />
      </View>

      {viewMode === 'map' ? (
        <>
          {banners ? <View style={styles.mapBanners}>{banners}</View> : null}
          <View style={styles.mapWrap}>
            <PostsMap
              center={{ lat: location.lat, lng: location.lng }}
              radiusKm={location.radius}
              items={mapItems}
              user={location.status === 'granted' ? { lat: location.lat, lng: location.lng } : null}
              onPressPost={handleMarkerPress}
              onLongPress={handleLongPress}
              pinMode={pinMode}
              onConfirmPin={handleConfirmPin}
            />
            <View style={styles.hereButtonWrap}>
              <Button
                label={pinMode ? copy.common.cancel : '+ Here'}
                variant="ghost"
                size="sm"
                onPress={() => setPinMode((v) => !v)}
              />
            </View>
          </View>
        </>
      ) : isLoading ? (
        <View style={styles.skeletons}>
          {banners}
          <Skeleton height={140} radius={radius.lg} />
          <Skeleton height={140} radius={radius.lg} />
          <Skeleton height={140} radius={radius.lg} />
        </View>
      ) : (
        <FeedList
          groups={isSearching ? [{ divider: null, items: activeItems }] : feed.groups}
          refreshing={feed.isRefetching}
          onRefresh={() => (isSearching ? searchResults.refetch() : feed.refetch())}
          contentBottomInset={104}
          ListHeaderComponent={
            <View style={{ gap: space.s3 }}>
              {banners}
              {!isSearching && filter === 'all' ? (
                <View style={{ marginHorizontal: -space.s4 }}>
                  <AlertsStrip alerts={alerts.items} />
                </View>
              ) : null}
            </View>
          }
          ListEmptyComponent={
            <EmptyState
              title={isSearching ? 'No results' : copy.feed.emptyTitle(location.radius)}
              text={isSearching ? undefined : copy.feed.emptyText}
              actions={
                !isSearching ? (
                  <>
                    <Button label={copy.feed.widenRadius} size="sm" variant="ghost" onPress={handleWidenRadius} />
                    <Button label={copy.feed.ask} size="sm" onPress={() => router.push('/compose')} />
                    <Button label={copy.feed.jumpToMahadevapura} size="sm" variant="text" onPress={handleJumpToDefault} />
                  </>
                ) : undefined
              }
            />
          }
        />
      )}

      {viewMode === 'list' ? (
        <View style={styles.fabWrap}>
          <Button label={copy.feed.fab} icon="plus" size="lg" onPress={() => router.push('/compose')} />
        </View>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  searchRow: { paddingHorizontal: space.s4, paddingTop: space.s1 },
  toolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 36,
    marginVertical: space.s3,
    paddingRight: space.s4,
    gap: space.s2,
  },
  locationPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    height: 34,
    paddingHorizontal: space.s3,
    borderRadius: radius.pill,
    borderWidth: 0,
    backgroundColor: colors.surface2,
    flexShrink: 1,
    minWidth: 0,
  },
  sortButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    height: 34,
    paddingHorizontal: space.s3,
    borderRadius: radius.pill,
  },
  viewToggle: {
    flexDirection: 'row',
    backgroundColor: colors.surface2,
    borderRadius: radius.pill,
    padding: 3,
    gap: 2,
  },
  viewToggleBtn: { width: 34, height: 28, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  viewToggleBtnActive: { backgroundColor: colors.raised, boxShadow: shadow.xs },
  mapBanners: { paddingHorizontal: space.s4, paddingBottom: space.s2 },
  mapWrap: { flex: 1, marginHorizontal: space.s4, marginBottom: space.s4, borderRadius: radius.lg, overflow: 'hidden' },
  hereButtonWrap: { position: 'absolute', top: space.s3, right: space.s3, borderRadius: radius.pill, boxShadow: shadow.popover },
  skeletons: { paddingHorizontal: space.s4, gap: space.s3 },
  fabWrap: { position: 'absolute', right: space.s4, bottom: space.s5, borderRadius: radius.pill, boxShadow: shadow.fab },
});
