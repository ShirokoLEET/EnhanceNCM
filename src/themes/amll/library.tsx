import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Button, Dialog, Flex, Spinner, Text } from '@radix-ui/themes';
import { MainPage } from '../../../third_party/amll/player/pages/main';
import { PlaylistPage } from '../../../third_party/amll/player/pages/playlist';

const message = (error: any) => error?.code === 'LOGIN_REQUIRED' ? '请先返回网易云登录，再刷新歌单。' : error?.message || String(error);
const unique = (items: any[]) => [...new Map(items.map(item => [String(item.id), item])).values()];
const emptyHome = (category = 'recommended') => ({ category, items: [], loading: true, error: '', offset: 0, more: false });
// Keep the page cache shared with the Spotify theme. It is account-scoped by
// the SDK, and the payloads intentionally use the same small page shape.
const homeSnapshotKey = (category: string) => category === 'recommended' ? 'recommended' : category;
const legacyHomeSnapshotKey = (category: string) => `amll:home:${category}`;
const playlistSnapshotKey = (id: any) => `playlist:${String(id)}`;
const legacyPlaylistSnapshotKey = (id: any) => `amll:playlist:${String(id)}`;
const recommendationModes = {
  daily: { title: '每日推荐', source: 'amll-daily' },
  radar: { title: '私人雷达', source: 'amll-radar' },
  roaming: { title: '私人漫游', source: 'roaming' },
  heartmode: { title: '心动模式', source: 'heartmode' },
} as const;
type RecommendationMode = keyof typeof recommendationModes;

function normalizeHomeSnapshot(value: any) {
  if (!value || !Array.isArray(value.items)) return null;
  return { items: value.items, offset: Number(value.offset) || value.items.length, more: !!value.more };
}

function restorePlaylistSnapshot(route: any, value: any) {
  const savedRoute = value?.route;
  const metadata = value?.metadata || value?.meta;
  const savedId = value?.id ?? savedRoute?.id ?? metadata?.id;
  if (!value || !Array.isArray(value.songs) || String(savedId) !== String(route.id)) return null;
  const total = value.total ?? metadata?.trackIds?.length ?? metadata?.trackCount;
  const offset = Number(value.offset) || value.songs.length;
  return {
    ...route,
    ...(savedRoute && typeof savedRoute === 'object' ? savedRoute : {}),
    kind: route.kind,
    id: route.id,
    source: route.source,
    metadata: metadata || null,
    title: value.title || savedRoute?.title || metadata?.name || route.title,
    cover: value.cover || savedRoute?.cover || metadata?.coverImgUrl || metadata?.picUrl || route.cover,
    songs: value.songs,
    total,
    more: value.more == null ? total != null && offset < total : !!value.more,
    offset,
  };
}

export function Library({ sdk, player, run, homeKey, currentId, onExit, portalContainer }: any) {
  const [category, setCategory] = useState('recommended');
  const [query, setQuery] = useState('');
  const [accountName, setAccountName] = useState('你的音乐资料库');
  const [home, setHome] = useState<any>(emptyHome());
  const [detail, setDetail] = useState<any>(null);
  const [addToPlaylistSong, setAddToPlaylistSong] = useState<any>(null);
  const [addToPlaylistItems, setAddToPlaylistItems] = useState<any[]>([]);
  const [addToPlaylistLoading, setAddToPlaylistLoading] = useState(false);
  const [addToPlaylistError, setAddToPlaylistError] = useState('');
  const [addToPlaylistStatus, setAddToPlaylistStatus] = useState('');
  const [addToPlaylistPending, setAddToPlaylistPending] = useState<string | null>(null);
  const homeRef = useRef(home), detailRef = useRef(detail);
  const alive = useRef(true), homeTicket = useRef(0), detailTicket = useRef(0);
  const addToPlaylistTicket = useRef(0);
  const categoryRef = useRef(category);
  const snapshot = sdk.librarySnapshots;
  const snapshotOwner = useRef<string | null>(null);
  const restoredOwner = useRef<string | null>(null);
  const homeSnapshots = useRef(new Map<string, any>());
  const detailSnapshots = useRef(new Map<string, any>());
  const restoreReady = useRef(false);
  const accountReady = useRef<Promise<any>>(Promise.resolve(null));
  function updateHome(value: any) { homeRef.current = value; setHome(value); }
  function updateDetail(value: any) { detailRef.current = value; setDetail(value); }
  const artwork = (url: string) => url ? sdk.artwork.getUrl(url, 320) : '';

  function saveSnapshot(key: string, value: any) {
    if (snapshot && snapshotOwner.current && typeof snapshot.save === 'function')
      Promise.resolve(snapshot.save(snapshotOwner.current, key, value)).catch(() => {});
  }

  function clearAccountSnapshots(categoryToShow = categoryRef.current) {
    snapshotOwner.current = null;
    restoredOwner.current = null;
    homeSnapshots.current.clear();
    detailSnapshots.current.clear();
    ++detailTicket.current;
    updateDetail(null);
    updateHome(emptyHome(categoryToShow));
  }

  async function restoreSession() {
    if (!snapshot || typeof snapshot.lastAccount !== 'function' || typeof snapshot.read !== 'function') return null;
    let account = null;
    try { account = await snapshot.lastAccount(); } catch (_) {}
    let original = null;
    if (!account && snapshot.original) {
      try { original = await snapshot.original(); } catch (_) {}
      if (original) account = original.account;
    }
    if (!account || !alive.current) return null;
    const owner = String(account.userId);
    const categories = ['recommended', 'created', 'subscribed'];
    const values = await Promise.all(categories.map(async name => {
      try {
        const current = await snapshot.read(owner, homeSnapshotKey(name));
        if (current) return current;
        const legacyKey = legacyHomeSnapshotKey(name);
        return legacyKey === homeSnapshotKey(name) ? null : await snapshot.read(owner, legacyKey);
      } catch (_) { return null; }
    }));
    if (!alive.current) return null;
    categories.forEach((name, index) => {
      const value = normalizeHomeSnapshot(values[index]);
      if (value) homeSnapshots.current.set(name, value);
    });
    if (!homeSnapshots.current.has('created') && original) {
      const value = normalizeHomeSnapshot(original.created);
      if (value) homeSnapshots.current.set('created', value);
    }
    restoredOwner.current = owner;
    const current = homeSnapshots.current.get(categoryRef.current);
    if (current) updateHome({ ...current, category: categoryRef.current, loading: true, error: '' });
    const nickname = account.profile?.nickname || account.profile?.nickName || account.nickname;
    setAccountName(nickname || '我的音乐资料库');
    return owner;
  }

  async function verifyAccount(account: any, restored: string | null = restoredOwner.current) {
    if (!account || !account.userId) throw Object.assign(new Error('未找到当前网易云账号'), { code: 'LOGIN_REQUIRED' });
    const owner = String(account.userId);
    if (restored && restored !== owner) clearAccountSnapshots();
    snapshotOwner.current = owner;
    restoredOwner.current = owner;
    const nickname = account.profile?.nickname || account.profile?.nickName || account.nickname;
    setAccountName(nickname || '我的音乐资料库');
    if (snapshot && typeof snapshot.rememberAccount === 'function') Promise.resolve(snapshot.rememberAccount(account)).catch(() => {});
    return account;
  }

  async function refreshCache() {
    if (sdk.cache?.refresh) await Promise.resolve(sdk.cache.refresh()).catch(() => {});
  }

  async function loadHome(append = false) {
    const ticket = ++homeTicket.current, selected = categoryRef.current;
    let previous = homeRef.current;
    try {
      // Account-owned lists revalidate identity before asking the SDK for data.
      // The current snapshot remains visible while this check and the request run.
      if (selected !== 'recommended') await verifyAccount(await sdk.account.getCurrent());
      if (!alive.current || ticket !== homeTicket.current) return;
      previous = homeRef.current;
      const sameCategory = previous.category === selected;
      const cached = !append && homeSnapshots.current.get(selected);
      const base = append ? previous : sameCategory ? previous : cached || emptyHome(selected);
      previous = base;
      const offset = append ? (Number(previous.offset) || 0) : 0;
      updateHome({ ...base, category: selected, loading: true, error: '' });
      const page = selected === 'recommended'
        ? { items: await sdk.recommendations.getRecommendedPlaylists(), more: false }
        : await sdk.playlists[selected === 'created' ? 'listCreated' : 'listSubscribed']({ limit: 30, offset });
      if (!alive.current || ticket !== homeTicket.current) return;
      const items = Array.isArray(page?.items) ? page.items : [];
      const next = { category: selected, items: unique([...(append ? previous.items : []), ...items]),
        offset: offset + items.length, more: !!page?.more, loading: false, error: '' };
      updateHome(next);
      homeSnapshots.current.set(selected, { items: next.items, offset: next.offset, more: next.more });
      saveSnapshot(homeSnapshotKey(selected), { items: next.items, offset: next.offset, more: next.more });
    } catch (error) {
      if (alive.current && ticket === homeTicket.current) {
        if (error?.code === 'LOGIN_REQUIRED') clearAccountSnapshots(selected);
        updateHome({ ...homeRef.current, loading: false, error: message(error) });
      }
    }
  }

  useEffect(() => {
    alive.current = true;
    restoreReady.current = false;
    accountReady.current = (async () => {
      const restored = await restoreSession().catch(() => null);
      if (!alive.current) return null;
      try {
        const account = await sdk.account.getCurrent();
        if (!alive.current) return null;
        await verifyAccount(account, restored);
        restoreReady.current = true;
        void loadHome();
        return account;
      } catch (error) {
        if (!alive.current) return null;
        if (restored) clearAccountSnapshots();
        snapshotOwner.current = null;
        setAccountName(error?.code === 'LOGIN_REQUIRED' ? '浏览推荐歌单，登录后查看我的歌单' : '我的音乐资料库');
        restoreReady.current = true;
        void loadHome();
        return null;
      }
    })();
    return () => { alive.current = false; ++homeTicket.current; ++detailTicket.current; };
  }, [sdk]);
  useEffect(() => { categoryRef.current = category; if (restoreReady.current) void loadHome(); }, [category]);
  useEffect(() => { ++detailTicket.current; updateDetail(null); }, [homeKey]);

  function goHome() { ++detailTicket.current; updateDetail(null); }
  function openRecommendation(mode: RecommendationMode) {
    const selected = recommendationModes[mode];
    void loadDetail({ kind: 'recommendation', recommendation: mode, title: selected.title, source: selected.source });
  }
  function recommendationLoader(source: string) {
    if (source !== 'roaming' && source !== 'heartmode') return undefined;
    if (typeof sdk.player?.recommendationLoader === 'function') return sdk.player.recommendationLoader(source);
    if (source === 'roaming') return () => sdk.recommendations.getPrivateRoaming();
    if (source === 'heartmode') return (state: any) => sdk.recommendations.getHeartMode(state?.song
      ? { songId: state.song.id, startMusicId: state.queue?.length ? state.queue[0].id : state.song.id }
      : {});
    return undefined;
  }
  function closeAddToPlaylist() {
    ++addToPlaylistTicket.current;
    setAddToPlaylistSong(null);
    setAddToPlaylistItems([]);
    setAddToPlaylistLoading(false);
    setAddToPlaylistError('');
    setAddToPlaylistStatus('');
    setAddToPlaylistPending(null);
  }
  async function openAddToPlaylist(song: any) {
    if (!song || song.localPath || sdk.localMusic?.isLocal?.(song)) return;
    const ticket = ++addToPlaylistTicket.current;
    setAddToPlaylistSong(song);
    setAddToPlaylistItems([]);
    setAddToPlaylistLoading(true);
    setAddToPlaylistError('');
    setAddToPlaylistStatus('');
    try {
      const items: any[] = [];
      let offset = 0;
      let page: any;
      do {
        page = await sdk.playlists.listCreated({ limit: 100, offset });
        if (!alive.current || ticket !== addToPlaylistTicket.current) return;
        const nextItems = Array.isArray(page?.items) ? page.items : [];
        items.push(...nextItems);
        offset += nextItems.length;
        if (!nextItems.length && page?.more) break;
      } while (page?.more);
      if (!alive.current || ticket !== addToPlaylistTicket.current) return;
      setAddToPlaylistItems(items);
    } catch (error) {
      if (alive.current && ticket === addToPlaylistTicket.current) setAddToPlaylistError(message(error));
    } finally {
      if (alive.current && ticket === addToPlaylistTicket.current) setAddToPlaylistLoading(false);
    }
  }
  async function addSongToPlaylist(playlist: any) {
    const song = addToPlaylistSong;
    const ticket = addToPlaylistTicket.current;
    if (!song || !playlist || addToPlaylistPending) return;
    setAddToPlaylistPending(String(playlist.id));
    setAddToPlaylistError('');
    setAddToPlaylistStatus('');
    try {
      await sdk.playlists.addTrack(playlist.id, song.id);
      if (!alive.current || ticket !== addToPlaylistTicket.current) return;
      setAddToPlaylistStatus(`已添加到「${playlist.name || '歌单'}」`);
    } catch (error) {
      if (alive.current && ticket === addToPlaylistTicket.current) setAddToPlaylistError(message(error));
    } finally {
      if (alive.current && ticket === addToPlaylistTicket.current) setAddToPlaylistPending(null);
    }
  }
  async function loadDetail(route: any, append = false) {
    const ticket = ++detailTicket.current;
    let previous = append ? detailRef.current : null;
    if (!append && route.kind === 'playlist' && snapshot && !snapshotOwner.current) {
      await accountReady.current.catch(() => null);
    }
    if (!append && route.kind === 'playlist' && snapshot && snapshotOwner.current) {
      const key = playlistSnapshotKey(route.id);
      let saved = detailSnapshots.current.get(key);
      if (!saved) {
        try {
          saved = await snapshot.read(snapshotOwner.current, key);
          if (!saved) saved = await snapshot.read(snapshotOwner.current, legacyPlaylistSnapshotKey(route.id));
        } catch (_) { saved = null; }
        if (saved) detailSnapshots.current.set(key, saved);
      }
      if (!alive.current || ticket !== detailTicket.current) return;
      previous = restorePlaylistSnapshot(route, saved);
    }
    if (!previous) previous = { ...route, songs: [], offset: 0, more: false };
    if (!alive.current || ticket !== detailTicket.current) return;
    const offset = append ? (Number(previous.offset) || 0) : 0;
    updateDetail({ ...previous, loading: true, error: '' });
    try {
      let songs, total = previous.total, more = false, metadata = previous.metadata, nextOffset = offset;
      if (route.kind === 'playlist') {
        // A restored detail is only the foreground snapshot. Always fetch the
        // playlist metadata again for a fresh open so its title/count can be
        // replaced together with the tracks when revalidation completes.
        if (!append || !metadata) metadata = await sdk.playlists.get(route.id);
        if (!alive.current || ticket !== detailTicket.current) return;
        songs = await sdk.playlists.getTracks(route.id, { limit: 500, offset });
        const metadataTotal = metadata?.trackIds?.length ?? metadata?.trackCount;
        if (metadataTotal != null) total = metadataTotal;
        nextOffset += 500; // The SDK may omit unavailable songs; offset counts track IDs.
        more = total == null ? songs.length === 500 : nextOffset < total;
      } else if (route.kind === 'search') {
        const page = await sdk.songs.search(route.query, { limit: 50, offset });
        songs = Array.isArray(page?.items) ? page.items : []; total = page.total; more = !!page.more; nextOffset += 50;
      } else if (route.kind === 'recommendation') {
        const mode = route.recommendation as RecommendationMode;
        if (mode === 'daily') {
          songs = await sdk.recommendations.getDailySongs();
          songs = Array.isArray(songs) ? songs : [];
          total = songs.length;
        } else if (mode === 'radar') {
          if (!append || !metadata) metadata = await sdk.recommendations.getPrivateRadar();
          songs = metadata ? await sdk.playlists.getTracks(metadata.id, { limit: 500, offset }) : [];
          songs = Array.isArray(songs) ? songs : [];
          const metadataTotal = metadata?.trackIds?.length ?? metadata?.trackCount;
          nextOffset = offset + 500;
          total = metadataTotal ?? offset + songs.length;
          more = metadataTotal != null ? nextOffset < metadataTotal : songs.length === 500;
        } else if (mode === 'roaming') {
          songs = await sdk.recommendations.getPrivateRoaming();
          songs = Array.isArray(songs) ? songs : [];
          total = offset + songs.length;
          nextOffset = total;
          more = songs.length > 0;
        } else if (mode === 'heartmode') {
          const seed = append && previous.songs.length ? previous.songs[previous.songs.length - 1]?.id : null;
          songs = await sdk.recommendations.getHeartMode(seed
            ? { songId: seed, startMusicId: previous.songs[0]?.id }
            : {});
          songs = Array.isArray(songs) ? songs : [];
          total = offset + songs.length;
          nextOffset = total;
          more = songs.length > 0;
        } else {
          songs = [];
          total = 0;
        }
      } else if (route.kind === 'daily') {
        songs = await sdk.recommendations.getDailySongs(); songs = Array.isArray(songs) ? songs : []; total = songs.length;
      } else {
        songs = [];
        total = 0;
      }
      if (!alive.current || ticket !== detailTicket.current) return;
      const next = { ...previous, metadata, title: route.kind === 'recommendation' ? route.title : metadata?.name || route.title,
        cover: metadata?.coverImgUrl || route.cover, songs: unique([...(append ? previous.songs : []), ...songs]),
        total, more, offset: nextOffset, loading: false, error: '' };
      updateDetail(next);
      if (route.kind === 'playlist') {
        const key = playlistSnapshotKey(route.id);
        const metadataValue = next.metadata || { id: route.id, name: next.title, coverImgUrl: next.cover, trackCount: next.total };
        const value = { id: route.id, route: { kind: route.kind, id: route.id, title: next.title, cover: next.cover, source: route.source },
          meta: metadataValue, metadata: metadataValue, title: next.title, cover: next.cover, songs: next.songs,
          total: next.total, more: next.more, offset: next.offset };
        detailSnapshots.current.set(key, value);
        saveSnapshot(key, value);
      }
      if (append && player.getState().source === route.source) player.append(songs, route.source);
    } catch (error) {
      if (alive.current && ticket === detailTicket.current) updateDetail({ ...detailRef.current, loading: false, error: message(error) });
    }
  }

  async function retryHome() { await refreshCache(); if (alive.current) void loadHome(); }
  async function retryDetail() {
    const current = detailRef.current;
    if (!current) return;
    await refreshCache();
    if (alive.current && detailRef.current === current) void loadDetail({ kind: current.kind, id: current.id, query: current.query,
      recommendation: current.recommendation, title: current.title, cover: current.cover, source: current.source }, false);
  }
  const playlists = useMemo(() => home.items.map((item: any) => ({ ...item, coverUrl: artwork(item.coverImgUrl || item.picUrl) })), [home.items, sdk]);
  const songs = useMemo(() => (detail?.songs || []).map((song: any) => ({ ...song,
    artistText: sdk.presentation.artists(song), durationText: sdk.presentation.time((song.dt || song.duration || 0) / 1000),
    coverUrl: sdk.localMusic?.isLocal(song) ? sdk.localMusic.getArtwork(song) : artwork(sdk.presentation.album(song)?.picUrl),
  })), [detail?.songs, sdk]);
  function play(index: number, shuffle?: boolean) {
    const current = detailRef.current;
    if (!current?.songs[index]) return;
    run(async () => {
      if (shuffle !== undefined) player.setShuffle(shuffle);
      const settings: any = {
        queue: current.songs,
        source: current.source,
      };
      if (current.kind === 'recommendation' && (current.recommendation === 'roaming' || current.recommendation === 'heartmode'))
        settings.loadMore = recommendationLoader(current.source);
      await player.play(current.songs[index], settings);
    });
  }
  return <>
    {detail ? <PlaylistPage title={detail.title} coverUrl={artwork(detail.cover)} total={detail.total} songs={songs}
      currentId={currentId} loading={detail.loading} error={detail.error} more={detail.more}
      onBack={goHome} onPlay={play} onNext={(song: any) => run(() => player.insertNext(song))}
      onAddToPlaylist={openAddToPlaylist} onRetry={retryDetail} onMore={() => loadDetail(detail, true)}
      portalContainer={portalContainer}
      moreLabel={detail.kind === 'recommendation' && ['roaming', 'heartmode'].includes(detail.recommendation) ? '下一批推荐' : undefined} />
      : <MainPage playlists={playlists} category={category} onCategory={setCategory} accountName={accountName} onExit={onExit}
        portalContainer={portalContainer}
        onOpen={(playlist: any) => loadDetail({ kind: 'playlist', id: playlist.id, title: playlist.name, cover: playlist.coverImgUrl || playlist.picUrl, source: `amll-playlist:${playlist.id}` })}
        onDaily={() => openRecommendation('daily')}
        onRadar={() => openRecommendation('radar')}
        onRoaming={() => openRecommendation('roaming')}
        onHeartMode={() => openRecommendation('heartmode')}
        query={query} onQuery={setQuery} onSearch={() => { if (query.trim()) loadDetail({ kind: 'search', query: query.trim(), title: `搜索：${query.trim()}`, source: `amll-search:${query.trim()}` }); }}
        loading={home.loading} error={home.error} more={home.more} onRetry={retryHome} onMore={() => loadHome(true)} />}
    <Dialog.Root open={!!addToPlaylistSong} onOpenChange={(open) => { if (!open) closeAddToPlaylist(); }}>
      <Dialog.Content container={portalContainer} maxWidth="420px">
        <Dialog.Title>添加到歌单</Dialog.Title>
        <Text color="gray" size="2">选择要收藏「{addToPlaylistSong?.name || '这首歌曲'}」的歌单。</Text>
        {addToPlaylistLoading && <Flex align="center" justify="center" gap="2" py="6"><Spinner /><Text>正在读取你创建的歌单…</Text></Flex>}
        {!addToPlaylistLoading && addToPlaylistError && <Text role="alert" color="red" as="p" mt="4">{addToPlaylistError}</Text>}
        {!addToPlaylistLoading && !addToPlaylistError && !addToPlaylistItems.length && <Text color="gray" as="p" mt="4">还没有可添加的歌单，请先创建歌单。</Text>}
        {!addToPlaylistLoading && !addToPlaylistError && !!addToPlaylistItems.length && <Flex direction="column" gap="2" mt="4">
          {addToPlaylistItems.map((playlist: any) => <Button key={playlist.id} variant="soft" style={{ justifyContent: 'flex-start' }}
            disabled={!!addToPlaylistPending} onClick={() => void addSongToPlaylist(playlist)}>
            {addToPlaylistPending === String(playlist.id) ? '正在添加…' : playlist.name || `歌单 ${playlist.id}`}
          </Button>)}
        </Flex>}
        {addToPlaylistStatus && <Text role="status" color="green" as="p" mt="4">{addToPlaylistStatus}</Text>}
        <Flex justify="end" mt="5"><Dialog.Close asChild><Button variant="soft" color="gray">关闭</Button></Dialog.Close></Flex>
      </Dialog.Content>
    </Dialog.Root>
  </>;
}
