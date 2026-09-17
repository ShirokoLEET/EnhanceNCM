import React, { useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { Provider, atom, createStore, useAtomValue } from 'jotai';
import { Box, ContextMenu, Theme } from '@radix-ui/themes';
import { toast, ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import '@radix-ui/themes/styles.css';
import { AppContainer } from '../../../third_party/amll/player/components/AppContainer';
import { NowPlayingBar } from '../../../third_party/amll/player/components/NowPlayingBar';
import { Library } from './library';
import { LyricWrapper } from './lyric-wrapper';
import { WindowBar } from './window-bar';
import { LyricContextMenu } from './context-menu';
import { connectPlayer } from './adapter.mjs';
import * as data from '../../../third_party/amll/react-full/src/states/dataAtoms';
import * as callbacks from '../../../third_party/amll/react-full/src/states/callbacks';
import * as controls from '../../../third_party/amll/react-full/src/states/controlsAtoms';
import * as config from '../../../third_party/amll/react-full/src/states/configAtoms';
import './style.css';

declare const EnhanceNCM: any;
declare const __AMLL_CSS__: string;

EnhanceNCM.themes.register({
  name: 'AMLL',
  mount({ root, sdk }: any) {
    const store = createStore();
    const stateAtom = atom<any>(null);
    const queueOpenAtom = atom(false);
    const likedIdsAtom = atom<Set<string>>(new Set());
    const likedIdsLoadedAtom = atom(false);
    const likedPendingAtom = atom<Set<string>>(new Set());
    let likedOwner: string | null = null;
    let disposed = false;
    let stopped = false;
    let cleanupJob: Promise<void> | null = null;

    const report = (error: any) => {
      if (!disposed) toast.error(error?.message || String(error));
    };
    const run = (fn: () => any) => Promise.resolve().then(() => {
      if (!disposed) return fn();
    }).catch(report);

    const isLocalSong = (song: any) => !!(song?.localPath || sdk.localMusic?.isLocal?.(song));
    const publishLikedIds = (ids: any) => {
      store.set(likedIdsAtom, new Set((Array.isArray(ids) ? ids : []).map((id: any) => String(id))));
      store.set(likedIdsLoadedAtom, true);
    };
    async function loadLikedIds() {
      if (typeof sdk.songs?.getLikedIds !== 'function') return;
      const snapshots = sdk.librarySnapshots;
      try {
        const account = await sdk.account.getCurrent();
        if (disposed) return;
        likedOwner = String(account.userId);
        if (snapshots && typeof snapshots.read === 'function') {
          const saved = await snapshots.read(likedOwner, 'liked-ids').catch(() => null);
          if (!disposed && Array.isArray(saved)) publishLikedIds(saved);
        }
        const ids = await sdk.songs.getLikedIds();
        if (disposed) return;
        publishLikedIds(ids);
        if (snapshots && typeof snapshots.save === 'function') Promise.resolve(snapshots.save(likedOwner, 'liked-ids', ids)).catch(() => {});
      } catch (error: any) {
        if (!disposed && error?.code !== 'LOGIN_REQUIRED' && !store.get(likedIdsLoadedAtom)) report(error);
      }
    }
    async function toggleLiked(song: any) {
      if (disposed || !song || isLocalSong(song) || !store.get(likedIdsLoadedAtom) || typeof sdk.songs?.setLiked !== 'function') return;
      const key = String(song.id);
      const pending = store.get(likedPendingAtom);
      if (pending.has(key)) return;
      const liked = !store.get(likedIdsAtom).has(key);
      store.set(likedPendingAtom, new Set([...pending, key]));
      try {
        await sdk.songs.setLiked(song.id, liked);
        if (disposed) return;
        const next = new Set(store.get(likedIdsAtom));
        if (liked) next.add(key); else next.delete(key);
        store.set(likedIdsAtom, next);
        const snapshots = sdk.librarySnapshots;
        if (likedOwner && snapshots && typeof snapshots.save === 'function')
          Promise.resolve(snapshots.save(likedOwner, 'liked-ids', Array.from(next))).catch(() => {});
      } catch (error: any) {
        if (!disposed) report(error?.code === 'LOGIN_REQUIRED' ? '请先返回网易云登录，再操作喜欢。' : error);
      } finally {
        const next = new Set(store.get(likedPendingAtom));
        next.delete(key);
        store.set(likedPendingAtom, next);
      }
    }

    const player = sdk.player.createSession({ onError: report, onMediaError: report });
    const persistence = sdk.persistence?.attach(player, { onError: report });
    const style = document.createElement('style');
    style.textContent = __AMLL_CSS__;
    const container = document.createElement('div');
    container.className = 'amll-theme';
    const portalContainer = document.createElement('div');
    portalContainer.className = 'amll-portal-container';
    root.append(style, container, portalContainer);
    const view = createRoot(container);

    const bind = (target: any, fn: (...args: any[]) => any) => store.set(target, {
      onEmit: (...args: any[]) => run(() => fn(...args)),
    });
    bind(callbacks.onPlayOrResumeAtom, () => player.toggle());
    bind(callbacks.onPauseAtom, () => player.pause());
    bind(callbacks.onRequestPrevSongAtom, () => player.previous());
    bind(callbacks.onRequestNextSongAtom, () => player.next());
    bind(callbacks.onSeekPositionAtom, (milliseconds) => player.seek(milliseconds / 1000));
    bind(callbacks.onLyricLineClickAtom, (event) => {
      const line = event?.line?.getLine?.();
      if (line) return player.seek(line.startTime / 1000);
    });
    bind(callbacks.onChangeVolumeAtom, (volume) => persistence ? persistence.setVolume(volume) : player.setVolume(volume));
    bind(callbacks.onToggleShuffleAtom, () => player.setShuffle(!player.getState().shuffle));
    bind(callbacks.onCycleRepeatModeAtom, () => player.setRepeatOne(!player.getState().repeatOne));
    bind(callbacks.onRequestOpenMenuAtom, () => {
      toast.info('请右键歌词页任意位置来打开菜单哦！');
    });
    bind(callbacks.onClickControlThumbAtom, () => store.set(config.isLyricPageOpenedAtom, false));

    store.set(config.isLyricPageOpenedAtom, false);
    store.set(config.playerControlsTypeAtom, config.PlayerControlsType.Controls);
    store.set(config.showBottomControlAtom, true);

    const disconnect = connectPlayer({
      sdk,
      player,
      onError: report,
      onLyrics(lines: any[]) {
        store.set(data.musicLyricLinesAtom, lines);
      },
      onState(state: any) {
        const previous = store.get(stateAtom);
        store.set(stateAtom, state);
        const song = state.song;
        const playback = state.playback || {};
        if (!previous || previous.song !== song) {
          const album = song ? sdk.presentation.album(song) : {};
          const artists = song ? (song.ar || song.artists || []).map((artist: any) => ({ id: String(artist.id), name: artist.name })) : [];
          store.set(data.musicIdAtom, song?.id == null ? null : String(song.id));
          store.set(data.musicNameAtom, song?.name || '未知歌曲');
          store.set(data.musicArtistsAtom, artists.length ? artists : [{ id: 'unknown', name: '未知创作者' }]);
          store.set(data.musicAlbumNameAtom, album?.name || '未知专辑');
          store.set(data.musicCoverIsVideoAtom, false);
          store.set(data.musicCoverAtom, sdk.localMusic?.isLocal(song)
            ? sdk.localMusic.getArtwork(song)
            : album?.picUrl ? sdk.artwork.getUrl(album.picUrl, 640) : '');
        }
        store.set(data.musicDurationAtom, (playback.duration || (song?.dt || song?.duration || 0) / 1000) * 1000);
        store.set(data.musicPlayingPositionAtom, Math.max(0, playback.current || 0) * 1000);
        store.set(data.musicPlayingAtom, state.loading || (playback.pendingStatus || playback.status) === 'playing');
        store.set(data.musicVolumeAtom, playback.volume ?? 0.5);
        store.set(controls.isShuffleActiveAtom, !!state.shuffle);
        store.set(controls.repeatModeAtom, state.repeatOne ? controls.RepeatMode.One : controls.RepeatMode.Off);
      },
    });
    player.connectSystemMedia();

    async function cleanup() {
      if (stopped) return;
      if (cleanupJob) return cleanupJob;
      cleanupJob = (async () => {
        await persistence?.prepareExit();
        await player.dispose();
        disposed = true;
        disconnect();
        persistence?.dispose();
        window.removeEventListener('pagehide', pagehide);
        view.unmount();
        container.remove();
        portalContainer.remove();
        style.remove();
        stopped = true;
      })().catch((error) => {
        persistence?.cancelExit();
        throw error;
      }).finally(() => { cleanupJob = null; });
      return cleanupJob;
    }

    function pagehide() { void cleanup().catch(report); }
    window.addEventListener('pagehide', pagehide);

    const exit = () => run(async () => {
      await cleanup();
      await EnhanceNCM.ui.setMode('original');
    });

    const openSettings = () => {
      if (typeof EnhanceNCM.ui?.openSettings === 'function') EnhanceNCM.ui.openSettings();
    };

    const closeWindow = async () => {
      if (disposed) return;
      try {
        await persistence?.prepareExit();
        await player.stop();
        await player.clearSystemMedia().catch(() => {});
        await sdk.window.close();
      } catch (error) {
        persistence?.cancelExit();
        throw error;
      }
    };

    function App() {
      const state = useAtomValue(stateAtom);
      const likedIds = useAtomValue(likedIdsAtom);
      const likedIdsLoaded = useAtomValue(likedIdsLoadedAtom);
      const likedPending = useAtomValue(likedPendingAtom);
      const queueOpen = useAtomValue(queueOpenAtom);
      const lyricsOpen = useAtomValue(config.isLyricPageOpenedAtom);
      const queue = state?.queue || [];
      const song = state?.song;
      const rawCover = song ? sdk.presentation.album(song)?.picUrl || '' : '';
      const backgroundCover = rawCover ? rawCover.replace(/^http:/i, 'https:') : undefined;

      useEffect(() => {
        const onKeyDown = (event: KeyboardEvent) => {
          if (event.key !== 'Escape') return;
          if (store.get(queueOpenAtom)) store.set(queueOpenAtom, false);
          else if (store.get(config.isLyricPageOpenedAtom)) store.set(config.isLyricPageOpenedAtom, false);
        };
        root.addEventListener('keydown', onKeyDown);
        return () => root.removeEventListener('keydown', onKeyDown);
      }, []);

      const openLyrics = () => {
        if (!player.getState().song) return;
        store.set(queueOpenAtom, false);
        store.set(config.hideLyricViewAtom, false);
        store.set(config.isLyricPageOpenedAtom, true);
      };
      const playQueueIndex = (index: number) => run(async () => {
        const selected = queue[index];
        if (!selected) return;
        const source = state?.source;
        const settings: any = { queue, source };
        if ((source === 'roaming' || source === 'heartmode') && typeof sdk.player?.recommendationLoader === 'function')
          settings.loadMore = sdk.player.recommendationLoader(source);
        await player.play(selected, settings);
        if (!disposed) store.set(queueOpenAtom, false);
      });

      return <>
        <Box className="amll-app-shell">
          <WindowBar windowControls={sdk.window} lyricsOpen={lyricsOpen} onSettings={openSettings} onClose={closeWindow} onError={report} />
          <Box className={`amll-app-body${lyricsOpen ? ' amll-lyrics-open' : ''}`}>
            <AppContainer playbar={<NowPlayingBar
              hasSong={!!song}
              favorite={!!song && likedIds.has(String(song.id))}
              favoriteDisabled={!likedIdsLoaded || !!song?.localPath || !!(song && likedPending.has(String(song.id)))}
              onFavorite={() => void toggleLiked(song)}
              onPrevious={() => run(() => player.previous())}
              onToggle={() => run(() => player.toggle())}
              onNext={() => run(() => player.next())}
              onLyrics={openLyrics}
              onQueue={() => store.set(queueOpenAtom, !queueOpen)}
              queueOpen={queueOpen}
              queue={queue}
              currentId={song?.id}
              onQueuePlay={playQueueIndex}
            />}>
              <Library sdk={sdk} player={player} run={run} homeKey={0} currentId={song?.id} onExit={exit}
                portalContainer={portalContainer} />
            </AppContainer>
          </Box>
        </Box>
        <ContextMenu.Root>
          <ContextMenu.Trigger asChild>
            <LyricWrapper backgroundCover={backgroundCover} />
          </ContextMenu.Trigger>
          <LyricContextMenu container={portalContainer} onError={report} />
        </ContextMenu.Root>
        {state?.loading && <div className="amll-loading" role="status">正在加载歌曲…</div>}
        <ToastContainer theme="dark" position="bottom-right" style={{ marginBottom: '150px' }} />
      </>;
    }

    view.render(<Provider store={store}><Theme appearance="dark" accentColor="iris" panelBackground="solid" className="amll-radix"><App /></Theme></Provider>);
    void loadLikedIds();
    run(async () => {
      if (!persistence) return;
      await persistence.restoreVolume();
      let owner;
      try { owner = String((await sdk.account.getCurrent()).userId); }
      catch (error: any) { if (error.code !== 'LOGIN_REQUIRED') throw error; owner = 'guest'; }
      if (!disposed) await persistence.restore(owner, true);
    });
    return cleanup;
  },
});
