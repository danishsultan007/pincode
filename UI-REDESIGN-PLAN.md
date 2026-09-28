# Redesign spec: Home toolbar, header wordmark, web action menu

All paths are under `C:\Users\Danish Sultan\Documents\Mohalla\mobile\src\`.

Facts from the code that shape this spec:
- **Web column:** `Screen` centres content in a 720px column on web, so "desktop" means a header about 688px wide, not the whole window.
- **Separate Search tab:** a real global Search tab already exists (`(tabs)/search.tsx`). The Home search box is `useSearchFeed` (posts within the current radius). Keep that behaviour and move it higher.
- **Web-only provider:** `ActionSheetProvider` only registers on web. iOS (ActionSheetIOS) and Android (Alert.alert) never reach it.
- **Call sites give no anchor:** `actionSheet(title, options, cancelLabel)` is called from 8 places (PostActions, chat, community, members, post comments, thread comments). None of them passes a trigger element. Anchoring therefore has to be inferred inside the provider, with no signature changes.
- **Styling support:** RN 0.86 / react-native-web supports the `boxShadow` style and `hovered` in the Pressable style callback. `FeedList` already accepts `ListHeaderComponent`.

---

## Pass 1: draft

**A. Shared lockup.** Add a new component, `components/ui/Wordmark.tsx`, laid out horizontally:
- Left: `[Logo]`.
- Right of it, a column: "pincode" on top, "your neighborhood" below.
- Two sizes:
  - `sm` (for headers): Logo 24, "pincode" at 17/20, tagline at 11/14.
  - `lg` (for the welcome hero): Logo 44, "pincode" at 32/36, tagline 13/18.

**B. Header.** Height goes back to 52 everywhere (remove `rowTall`). When `wordmark` is set, the row is:
- `[left][title, left-aligned][flex spacer][right actions][Wordmark sm]`.
- The lockup is always the right-most item.
- Without `wordmark`, the layout is unchanged: left / centred title / right.

**C. Web action menu.** `ActionSheetProvider` records the element the user last pressed, using capture-phase `pointerdown` and `keydown` listeners on `document`.
- When `actionSheet()` fires within 1.5s of that press, the menu renders as a small dropdown: 240px wide, anchored under or over the trigger and clamped to the viewport.
- With no usable anchor, it renders as a centred small menu.
- `confirmAsync()` becomes a centred dialog instead of a bottom sheet.
- Call sites stay unchanged.

**D. Home, top to bottom:**
1. Header row: search input on the left (flex) · location pill · lockup at the right edge.
2. One toolbar row: filter chips (scrolling), then "Newest ▾" sort, then a List/Map icon toggle.
3. The feed, whose scrolling list header holds the banners and the alerts strip.
4. FAB "New post" at the bottom right.

What gets removed:
- The header "+".
- The "Ask your neighborhood anything…" box.
- The standalone location row.
- The "N nearby" line.
- The separate controls row.

The FAB is the only way to create a post.

**E. Auth screens.**
- sign-up, sign-in and forgot-password: add `wordmark` to their existing `Header`, which already has a back button on the left and a title.
- welcome: replace the plain text hero with a centred `Wordmark size="lg"`.

**F. Responsive.** One breakpoint at 640px window width.
- 640px or wider: the search box sits inside the header row.
- Below 640px: the header holds only the location pill and the lockup (right-aligned), and the search box becomes the first row under the header.

---

## Pass 2: self-review and revisions

1. **Are all 3 complaints fixed literally?**
   - (1) The ⋯ menu now opens next to its trigger on web. ✔
   - (2) The logo sits horizontally next to "pincode", the lockup is right-most, and the header is back to 52px. ✔
   - (3) Location is in the top row on the right, next to the lockup.
     - The lockup must stay right-most, so the location pill goes immediately to its left. Both cannot be the very last item; the user asked for both, and this is the only literal reading.
     - Search is in the top row on desktop, and the very first row under the header on phones.
     - Redundant create buttons are removed. ✔
   - **Change:** state the pill-then-lockup order explicitly so the implementer does not swap them.

2. **Is creating a post still discoverable with FAB only?**
   - The old FAB said "+ Ask", which is misleading since the composer also makes Alerts and Events.
   - **Change:** relabel it to "New post" with a `plus` icon. It is an extended (labelled) FAB, the same pattern Gmail's "Compose" uses on desktop web.
   - I considered a header "New post" button on wide screens. Rejected: it would squeeze the search box to about 200px, and it would bring back two create affordances depending on width.
   - The FAB is absolute inside the 720px column, so on desktop it sits at the column's bottom-right, next to the feed rather than at the far window edge. Good.
   - **Change:** the FAB used to cover the last card. `FeedList` now gets a `contentBottomInset` prop, and Home passes 88.
   - **Map mode:** as today, map mode has no FAB; its own "+ Here" pin button is the create path there. This is intentional and context-specific.
   - **Empty state:** it keeps its "Ask" CTA. An empty-state primary action is standard, it is not chrome clutter, and it is only visible when there is no feed. Documented so it isn't mistaken for a leftover.

3. **Crowding at 375px.** Content width is 343px.
   - Lockup is about 135px, with `flexShrink: 0`.
   - The pill has a 12px gap, `maxWidth: 150`, and `flexShrink: 1`.
   - **Change:** on narrow screens the pill shows a compact label, `"{pincode} · {radius} km"` (or `"{area} · {radius} km"` if there is no pincode). The full `"{area} · {pincode} · {radius} km"` only shows at 640px or wider (`maxWidth: 240`).
   - Total at 375px is about 297px, so it fits. At 320px the pill truncates with an ellipsis instead of wrapping.
   - **Toolbar at 375px:** sort is about 76px and the icon toggle about 72px, leaving about 180px of horizontally scrolling chips (roughly 2.5 visible). That is acceptable because chips already scroll.
   - **Change:** Newest/Nearest was a 150px segmented control. It becomes a compact "Newest ▾" text button that opens `actionSheet('Sort', …)`. That reuses the new dropdown on web and native sheets on phones.
   - **Change:** List/Map becomes an icon-only toggle.

4. **Dropdown near viewport edges.** Placement rules:
   - **Horizontal:** if the trigger's centre is in the right half of the viewport, right-align the menu to the trigger's right edge; otherwise left-align it. Clamp to an 8px margin.
   - **Vertical:** measure the menu height in `onLayout`. The first frame renders at `opacity: 0`.
     - Place it below if it fits.
     - Else above if it fits.
     - Else pin it to top 8px with `maxHeight = vh - 16` and `overflow: 'auto'`.
   - In the last case, also set `maxHeight: vh - 2*EDGE`.
   - **Trigger off-screen:** if the trigger rect is entirely outside the viewport, fall back to centred.
   - **Stale anchor:** scrolling any scroll container (not inside the menu) or resizing the window dismisses the menu, so it never floats detached. **Change:** added.
   - **Escape:** Escape dismisses it. **Change:** added.
   - **Mobile web:** the dropdown also works at 375px (240 < 359). I chose one web behaviour at all widths instead of a width-dependent sheet/dropdown switch, to keep it simple and predictable.
   - **Change:** confirm dialogs (for example Delete after choosing Delete in the menu) are centred. Otherwise the "weird bottom" complaint would come straight back one click later.

5. **Header vs auth consistency.**
   - The rule is: any `Header` with `wordmark` puts the lockup at the right edge. `title` is rendered left-aligned after `left`.
   - Auth screens simply add `wordmark`, so sign-up looks like `[‹][Create account ……][logo pincode/your neighborhood]`. At 375px: 32 + 8 + about 115px of title + 135 fits.
   - **Welcome is deliberately different:** it has no toolbar, so there is nothing to be "right" in. It uses the same component at `lg`, centred as a splash hero.
     - Adding a top-right mini lockup as well would show the brand twice, so I rejected it.
     - The flagged risk: if the user wants welcome top-right too, the change is one line (`<Header wordmark />` plus a smaller hero).
   - **Change:** added sign-in and forgot-password as well, so every pre-auth screen matches. Onboarding and reset-password are left alone (post-link flows); optional.
   - **Communities:** it now gets `title="Communities"`, the "+" becomes an `IconButton` in `right`, and the lockup sits at the edge. This fixes the "+ next to the logo with an empty left side" look.

6. **Too much or not enough?**
   - **Not enough in Pass 1:** banners and the alerts strip still stood above the scroll area. **Change:** they move into the feed's `ListHeaderComponent` so they scroll away.
   - **Change:** the location-off banner becomes dismissible. On desktop, location is often denied, so it would otherwise always cost about 44px.
   - **Change:** while searching, the chips are replaced in the same row by the "N results for 'q'" summary, so it doesn't add a row.
   - **Avoided extra scope:** no new sticky or collapsing header, and no change to native action sheets.
   - **Height budget, from the top of the screen to the first card:**
     - Desktop: 52 + 8 + 32 + 8 ≈ **100px**.
     - Phone: 52 + 8 + 44 + 8 + 32 + 8 ≈ **152px**.
     - Today: about 340px or more.

---

## Final spec (implement exactly)

### 1. `theme/tokens.ts`
Add the following:
```ts
export const breakpoints = { wide: 640 } as const;
export const shadow = { popover: '0 8px 24px rgba(28,25,23,0.14)' } as const; // web boxShadow only
```
Leave `text.wordmark` as is.

### 2. NEW `components/ui/Wordmark.tsx`
```tsx
export type WordmarkProps = { size?: 'sm' | 'lg' };
// Row: <Logo size={sm?24:44}/> + gap (sm: 6, lg: space.s3) + <View>{name}{tagline}</View>
// name: <Text variant="wordmark" style={sm ? {fontSize:17, lineHeight:20} : {fontSize:32, lineHeight:36}}>{copy.wordmark}</Text>
// tagline: sm -> <Text variant="meta" style={{fontSize:11, lineHeight:14}}>{copy.tagline}</Text>
//          lg -> <Text variant="secondary">{copy.tagline}</Text>
// Root: flexDirection 'row', alignItems 'center', flexShrink 0.
// Wrap the root in a View with accessibilityRole="header" and accessibilityLabel={`${copy.wordmark}, ${copy.tagline}`}.
```
`Logo.tsx` is unchanged, apart from an optional comment update.

### 3. `components/ui/Header.tsx` (rewrite)
Props are unchanged: `{ title?, left?, right?, wordmark? }`. Remove `rowTall`, `wordmarkSide`, `wordmarkStack` and `wordmarkText`. The row is always `height: 52`.

**When `wordmark` is set:**
```tsx
<View style={styles.row}>
  <View style={styles.leadWrap}>            // flex:1, minWidth:0, flexDirection:'row', alignItems:'center', gap: space.s2
    {left}
    {title ? <Text variant="cardTitle" numberOfLines={1} style={{flexShrink:1}}>{title}</Text> : null}
  </View>
  {right ? <View style={styles.actions}>{right}</View> : null}   // flexDirection:'row', alignItems:'center', gap: space.s2, marginLeft: space.s3, flexShrink:1, minWidth:0
  <View style={styles.markWrap}><Wordmark size="sm" /></View>   // marginLeft: space.s3, flexShrink:0
</View>
```
- `left` may be a flexible element. Home passes a search box wrapped in `{flex:1}`.

**When `wordmark` is not set:** keep the current left / centred-title / right structure unchanged.

Update the header comment: "wordmark = lockup pinned right-most; `right` renders immediately to its left."

### 4. `components/ui/SearchInput.tsx`
Add a `compact?: boolean` prop. When `true`, set `height: 36` instead of 44. Nothing else changes.

### 5. `components/post/FeedList.tsx`
Add a `contentBottomInset?: number` prop. Apply it as `contentContainerStyle={[styles.content, contentBottomInset != null && { paddingBottom: contentBottomInset }]}`.

### 6. `app/(tabs)/index.tsx` (Home)

**State and imports:**
- Add `const { width } = useWindowDimensions(); const wide = width >= breakpoints.wide;`.
- Add `const [locBannerDismissed, setLocBannerDismissed] = useState(false);`.
- Remove: the header "+" `IconButton`, the `askPrompt` Pressable and its style, the `summaryRow`, `controlsRow` and `body` styles, and both `Segmented` usages.
- Remove any imports that become unused (`Segmented`, likely `IconButton` unless used by ViewToggle).
- Import `actionSheet` from `@/lib/confirm`.

**Derived values:**
```ts
const fullLoc = [location.area, location.pincode, `${location.radius} km`].filter(Boolean).join(' · ');
const shortLoc = `${location.pincode || location.area} · ${location.radius} km`;
const openSort = () => actionSheet(copy.feed.sortTitle, [
  { label: copy.feed.sortNewest, onPress: () => setSortMode('newest') },
  { label: copy.feed.sortNearest, onPress: () => setSortMode('nearest') },
]);
```

**Inline elements:**
- **`locationPill`:** a `Pressable` with:
  - `onPress={() => router.push('/location')}`, `accessibilityRole="button"`, `accessibilityLabel={copy.feed.changeLocation(fullLoc)}`, `hitSlop={6}`.
  - Style: `{flexDirection:'row', alignItems:'center', gap:4, height:32, paddingHorizontal: space.s3, borderRadius: radius.pill, borderWidth:1, borderColor: colors.line, backgroundColor: colors.surface, flexShrink:1, minWidth:0, maxWidth: wide ? 240 : 150}`.
  - Children: `<Icon name="pin" size={14}/>`, then `<Text variant="secondary" numberOfLines={1} style={{flexShrink:1}}>{wide ? fullLoc : shortLoc}</Text>`, then `<Icon name="chevron-down" size={14}/>`.
- **`search`:** `<SearchInput value={searchInput} onChangeText={setSearchInput} placeholder={copy.feed.searchPlaceholder} onClear={() => setSearchInput('')} compact={wide} />`.
- **`banners`:** the existing ban/suspended `Banner`s, plus the location-off banner. The location-off banner now renders only when `!locBannerDismissed` and gets `onDismiss={() => setLocBannerDismissed(true)}`. Wrap them in `<View style={{gap: space.s2}}>` and render `null` if there are none.
- **`ViewToggle`** (local component in the same file): a track `{flexDirection:'row', backgroundColor: colors.surface2, borderRadius: radius.md, padding:2, gap:2}` with two Pressables, each 32×28, radius `sm`, centred.
  - Icons: `list` and `map`, size 16.
  - Active one: `backgroundColor: colors.surface` with icon `colors.ink`; inactive icon is `colors.ink3`.
  - Each has `accessibilityRole="button"`, `accessibilityState={{selected}}`, and labels `copy.feed.viewList` / `copy.feed.viewMap`.
- **`SortButton`:** a `Pressable`:
  - Style: `{flexDirection:'row', alignItems:'center', gap:2, height:32, paddingHorizontal: space.s2}`, `hitSlop={6}`.
  - Content: `Text variant="secondary"` showing the current sort label, then `Icon chevron-down size 14`.
  - `accessibilityLabel={copy.feed.sortTitle}`.

**JSX, top to bottom (exact):**
```tsx
<Screen edges={['top']}>
  <Header
    wordmark
    left={wide ? <View style={{ flex: 1 }}>{search}</View> : undefined}
    right={locationPill}
  />
  {!wide ? <View style={styles.searchRow}>{search}</View> : null}   // paddingHorizontal s4, paddingTop s2
  <View style={styles.toolbar}>                                      // flexDirection row, alignItems center, height 32, marginVertical s2, paddingRight s4, gap s2
    <View style={{ flex: 1, minWidth: 0 }}>
      {isSearching ? (
        <Text variant="meta" numberOfLines={1} style={{ paddingLeft: space.s4 }}>{copy.feed.resultsFor(activeItems.length, search)}</Text>
      ) : (
        <ChipRow>{FILTER_OPTIONS.map(... Chip ...)}</ChipRow>
      )}
    </View>
    {!isSearching && viewMode === 'list' ? <SortButton /> : null}
    <ViewToggle />
  </View>

  {viewMode === 'map' ? (
    <>
      {banners ? <View style={styles.mapBanners}>{banners}</View> : null}  // paddingHorizontal s4, paddingBottom s2
      <View style={styles.mapWrap}> ...PostsMap + "+ Here" unchanged... </View>
    </>
  ) : isLoading ? (
    <View style={styles.skeletons}>{banners}<Skeleton/>×3</View>
  ) : (
    <FeedList
      groups={...unchanged}
      refreshing/onRefresh unchanged
      contentBottomInset={88}
      ListHeaderComponent={
        <View style={{ gap: space.s3 }}>
          {banners}
          {!isSearching && filter === 'all' ? (
            <View style={{ marginHorizontal: -space.s4 }}><AlertsStrip alerts={alerts.items} /></View>
          ) : null}
        </View>
      }
      ListEmptyComponent={...unchanged (keeps Widen radius / Ask / Jump buttons)}
    />
  )}

  {viewMode === 'list' ? (
    <View style={styles.fabWrap}>                                     // position absolute, right s4, bottom s4
      <Button label={copy.feed.fab} icon="plus" onPress={() => router.push('/compose')} />
    </View>
  ) : null}
</Screen>
```
- The FAB is the only post-creation entry point in list mode.
- The composer keeps its Ask/Alert/Event segmented control and defaults to Ask. No compose.tsx changes are needed.
- The old `summary` const is replaced by `copy.feed.resultsFor`. When not searching there is no count line.

### 7. `app/(tabs)/communities.tsx`
Replace the Header with:
```tsx
<Header wordmark title="Communities"
  right={<IconButton name="plus" label={copy.communities.startCommunity} onPress={handleStart} />} />
```
Remove the now-unused `Icon` and `Pressable` imports if nothing else uses them. `Pressable` is still used by `mineChip`, so keep it.

### 8. `providers/ActionSheetProvider.tsx` (web rendering only; native untouched)

**Anchor capture:**
- Add `const lastPress = useRef<{ rect: DOMRect; at: number } | null>(null)`.
- In the existing web-only `useEffect`, register capture-phase listeners:
  - `pointerdown`: `el = (e.target as Element).closest('[role="button"],button,a,[tabindex]') ?? e.target`, then store `{ rect: el.getBoundingClientRect(), at: Date.now() }`.
  - `keydown` for Enter or Space: the same, using `document.activeElement`.
  - Remove both listeners in the cleanup.

**State for actions:**
- Extend it to `{ kind:'actions', title, options, cancelLabel, anchor: DOMRect | null }`.
- In the registered host, set `anchor` as follows:
  1. If `lastPress.current` exists and `Date.now() - at < 1500`, use its rect.
  2. Set it to `null` if the rect lies entirely outside `[0, innerWidth] × [0, innerHeight]`.
  3. Otherwise it is `null`.

**While `state.kind === 'actions'`**, an effect adds:
- `keydown` Escape → `dismiss`.
- `resize` on window → `dismiss`.
- `scroll` on document with capture `true` → `dismiss`, unless `menuRef.current?.contains(e.target)`.

Remove them on cleanup. Escape also works for the confirm dialog.

**Actions render (popover):**
```tsx
<View style={StyleSheet.absoluteFill} pointerEvents="box-none">
  <Pressable style={StyleSheet.absoluteFill} onPress={dismiss} accessibilityLabel="Dismiss" />  // transparent, no dim
  <View ref={menuRef} onLayout={e => setMenuH(e.nativeEvent.layout.height)}
        style={[styles.menu, pos, { opacity: menuH == null ? 0 : 1 }]} accessibilityRole="menu">
    {title ? <Text variant="label" style={styles.menuTitle}>{title}</Text> : null}
    {options.map((o, i) => (
      <Pressable key={i} accessibilityRole="menuitem"
        style={({ pressed, hovered }: any) => [styles.menuRow, (pressed || hovered) && { backgroundColor: colors.surface2 }]}
        onPress={() => { setState(null); o.onPress(); }}>
        <Text variant="body" style={o.destructive ? styles.destructiveText : undefined}>{o.label}</Text>
      </Pressable>
    ))}
  </View>
</View>
```
- There is no Cancel row; outside click and Escape dismiss instead. `cancelLabel` is ignored on web.
- Reset `menuH` to `null` whenever a new actions state opens.

**Styles:**
- `menu`: `{ position:'absolute', width: MENU_W (240), backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.line, paddingVertical: space.s1, boxShadow: shadow.popover, overflow: 'auto' }`
- `menuTitle`: `{ paddingHorizontal: space.s3, paddingTop: space.s2, paddingBottom: space.s1 }`
- `menuRow`: `{ minHeight: 40, justifyContent:'center', paddingHorizontal: space.s3 }`

**Positioning (`pos`):** with `EDGE=8`, `GAP=4`, `vw=innerWidth`, `vh=innerHeight`, `h = menuH ?? 0`:
- **No anchor:** `left = (vw - 240)/2`, `top = max(EDGE, (vh - h)/2)`.
- **Anchor, horizontal:**
  - `left = (anchor.left + anchor.width/2 > vw/2) ? anchor.right - 240 : anchor.left`
  - then clamp: `left = clamp(left, EDGE, vw - 240 - EDGE)`.
- **Anchor, vertical:**
  - `below = vh - anchor.bottom - GAP - EDGE`
  - `above = anchor.top - GAP - EDGE`
  - `top = h <= below ? anchor.bottom + GAP : h <= above ? anchor.top - GAP - h : EDGE`
- In the last case, also set `maxHeight: vh - 2*EDGE`.
- **Coordinates:** RN-web's root fills the viewport and the host is `absoluteFill` at root, so `getBoundingClientRect` coordinates map directly.

**Confirm render (centred dialog):**
- Host: `{...absoluteFill, justifyContent:'center', alignItems:'center', padding: space.s4}`.
- Backdrop: `colors.backdrop`, which dismisses on press.
- Card: `{ width:'100%', maxWidth: 400, backgroundColor: colors.surface, borderRadius: radius.lg, padding: space.s4, gap: space.s2, boxShadow: shadow.popover }`.
- Content is unchanged: title, message, and a right-aligned Cancel / Confirm row.
- Remove the `sheet` and `handle` styles.

Update the file's top comment to describe the anchored dropdown and the centred confirm.

### 9. `lib/confirm.ts`
No functional or signature changes. Update the comment "renders a real in-app sheet" to say "an anchored dropdown / centred dialog on web".

### 10. Auth screens
- **`app/sign-up.tsx`:** add `wordmark` to both `<Header …>` usages ("Create account" and "Check your inbox"). Title and left stay as they are.
- **`app/sign-in.tsx`:** add `wordmark` to its Header.
- **`app/forgot-password.tsx`:** add `wordmark` to its Header.
- **`app/welcome.tsx`:** replace the two hero `Text`s with `<Wordmark size="lg" />`, keeping the `hero` container centred. Delete the `wordmark` style, and remove `Text`/`copy.tagline` usage if unused (`copy` is still used for buttons).

### 11. `lib/copy.ts` (`feed` section)
- **Remove:** `askPrompt`. Its only use is Home.
- **Change:** `fab: '+ Ask'` becomes `fab: 'New post'` (the `+` is now the icon).
- **Add:**
```ts
sortTitle: 'Sort',
sortNewest: 'Newest',
sortNearest: 'Nearest',
viewList: 'List view',
viewMap: 'Map view',
changeLocation: (current: string) => `Change location, currently ${current}`,
resultsFor: (n: number, q: string) => `${n} result${n === 1 ? '' : 's'} for "${q}"`,
```
- **Keep:** `feed.ask` (the empty-state CTA) and `searchPlaceholder`.

### Out of scope (intentionally unchanged)
- Native action sheets and alerts.
- `compose.tsx`.
- The Search, Inbox and Profile tab headers (they don't show the lockup today).
- Onboarding and reset-password headers. Adding `wordmark` there is optional and a one-liner.

### Acceptance checks
**Desktop web (≥1024px window):**
- Home's first card starts about 100px below the top (plus the alerts strip if there are alerts).
- The header is `[search][📍 area · pincode · 5 km ▾][logo pincode/your neighborhood]`.
- The ⋯ on a post opens a 240px menu directly under it.
- The ⋯ on a card near the bottom opens upward.
- Delete → confirm appears centred.

**Web at 375px:**
- The header is `[          📍 560048 · 5 km ▾][logo lockup]`, then the search row, then one toolbar row, then the feed.

**iOS/Android:** menus are unchanged. Sort uses the native sheet or alert.

### Critical Files for Implementation
- C:\Users\Danish Sultan\Documents\Mohalla\mobile\src\app\(tabs)\index.tsx
- C:\Users\Danish Sultan\Documents\Mohalla\mobile\src\components\ui\Header.tsx
- C:\Users\Danish Sultan\Documents\Mohalla\mobile\src\providers\ActionSheetProvider.tsx
- C:\Users\Danish Sultan\Documents\Mohalla\mobile\src\components\ui\Wordmark.tsx (new)
- C:\Users\Danish Sultan\Documents\Mohalla\mobile\src\lib\copy.ts
- Also touched: `theme/tokens.ts`, `components/ui/SearchInput.tsx`, `components/post/FeedList.tsx`, `app/(tabs)/communities.tsx`, `app/welcome.tsx`, `app/sign-up.tsx`, `app/sign-in.tsx`, `app/forgot-password.tsx`, `lib/confirm.ts` (comment only).
