import { HeartFilledIcon, HeartIcon, ListBulletIcon, PauseIcon, PlayIcon, TrackNextIcon, TrackPreviousIcon } from '@radix-ui/react-icons';
import { Flex, IconButton } from '@radix-ui/themes';
import { useAtomValue } from 'jotai';
import { type FC, useLayoutEffect, useRef } from 'react';
import { MediaButton } from '../../../react-full/src/components/MediaButton';
import { TextMarquee } from '../../../react-full/src/components/TextMarquee';
import { musicArtistsAtom, musicCoverAtom, musicNameAtom, musicPlayingAtom } from '../../../react-full/src/states/dataAtoms';
import IconForward from '../../../react-full/src/components/PrebuiltLyricPlayer/icon_forward.svg?react';
import IconPause from '../../../react-full/src/components/PrebuiltLyricPlayer/icon_pause.svg?react';
import IconPlay from '../../../react-full/src/components/PrebuiltLyricPlayer/icon_play.svg?react';
import IconRewind from '../../../react-full/src/components/PrebuiltLyricPlayer/icon_rewind.svg?react';
import { NowPlaylistCard } from '../NowPlaylistCard';
import styles from './index.module.css';

function LyricsIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
    <path d="M5 5h14M5 9h14M5 13h9M5 17h7" />
  </svg>;
}

export const NowPlayingBar: FC<{
  onPrevious?: () => void;
  onToggle?: () => void;
  onNext?: () => void;
  onLyrics?: () => void;
  onFavorite?: () => void;
  onQueue?: () => void;
  queueOpen?: boolean;
  queue?: any[];
  currentId?: string | number | null;
  onQueuePlay?: (index: number) => void;
  hasSong?: boolean;
  favorite?: boolean;
  favoriteDisabled?: boolean;
}> = ({ onPrevious = () => {}, onToggle = () => {}, onNext = () => {}, onLyrics = () => {}, onFavorite = () => {}, onQueue = () => {}, queueOpen = false, queue = [], currentId, onQueuePlay = () => {}, hasSong = false, favorite = false, favoriteDisabled = false }) => {
  const musicName = useAtomValue(musicNameAtom);
  const musicArtists = useAtomValue(musicArtistsAtom);
  const musicPlaying = useAtomValue(musicPlayingAtom);
  const musicCover = useAtomValue(musicCoverAtom);
  const playbarRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const playbarEl = playbarRef.current;
    if (!playbarEl) return;
    const updateSafeBound = () => {
      const { top } = playbarEl.getBoundingClientRect();
      document.documentElement.style.setProperty('--amll-player-playbar-bottom', `${window.innerHeight - top}px`);
    };
    const observer = new ResizeObserver(updateSafeBound);
    window.addEventListener('resize', updateSafeBound);
    observer.observe(playbarEl);
    updateSafeBound();
    return () => {
      window.removeEventListener('resize', updateSafeBound);
      observer.disconnect();
    };
  }, []);

  return <>
    {queueOpen && <Flex direction="row-reverse" mx="3" position="absolute" right="0" bottom="calc(var(--amll-player-playbar-bottom) + var(--space-3))">
      <div className={`${styles.playlistCard} amll-queue-card`} role="dialog" aria-label="当前播放列表">
        <NowPlaylistCard songs={queue} currentId={currentId} onPlay={onQueuePlay} />
      </div>
    </Flex>}
    <Flex className={styles.playBar} overflow="hidden" ref={playbarRef}>
      <Flex direction="row" justify="center" align="center" flexGrow="1" flexBasis="33.3%" minWidth="0">
        <button className={styles.coverButton} type="button" data-open-lyrics aria-label="打开歌词" title="打开歌词"
          style={{ backgroundImage: musicCover ? `url(${JSON.stringify(musicCover)})` : undefined }} onClick={onLyrics} disabled={!hasSong}>
          <div className={styles.lyricIconButton}><LyricsIcon /></div>
        </button>
        <Flex direction="column" justify="center" ml="4" flexGrow="1" minWidth="0" overflow="hidden" style={{ textWrap: 'nowrap' }}>
          <TextMarquee>{musicName}</TextMarquee>
          <TextMarquee>{musicArtists.map((artist) => artist.name).join(', ')}</TextMarquee>
        </Flex>
        <IconButton className={styles.favoriteButton} variant="ghost" onClick={onFavorite}
          disabled={!hasSong || favoriteDisabled} aria-pressed={favorite} data-liked={favorite ? 'true' : undefined}
          aria-label={favorite ? '取消喜欢当前歌曲' : '喜欢当前歌曲'} title={favorite ? '取消喜欢当前歌曲' : '喜欢当前歌曲'}>
          {favorite ? <HeartFilledIcon /> : <HeartIcon />}
        </IconButton>
      </Flex>
      <Flex direction="row" justify="center" align="center" flexGrow="1" flexBasis="33.3%" gap="5" display={{ initial: 'none', sm: 'flex' }}>
        <MediaButton style={{ scale: '1.5' }} aria-label="上一首" onClick={onPrevious} disabled={!hasSong}>
          <IconRewind style={{ scale: '1.25' }} />
        </MediaButton>
        <MediaButton style={{ scale: '1.5' }} aria-label={musicPlaying ? '暂停' : '播放'} onClick={onToggle} disabled={!hasSong}>
          {musicPlaying ? <IconPause style={{ scale: '0.75' }} /> : <IconPlay style={{ scale: '0.75' }} />}
        </MediaButton>
        <MediaButton style={{ scale: '1.5' }} aria-label="下一首" onClick={onNext} disabled={!hasSong}>
          <IconForward style={{ scale: '1.25' }} />
        </MediaButton>
      </Flex>
      <Flex direction="row" justify="end" align="center" flexGrow={{ initial: '0', sm: '1' }} flexBasis={{ initial: '', sm: '33.3%' }} gap="1">
        <Flex direction="row" justify="end" align="center" gap="1" display={{ initial: 'flex', sm: 'none' }}>
          <IconButton onClick={onPrevious} variant="soft" disabled={!hasSong} aria-label="上一首"><TrackPreviousIcon /></IconButton>
          <IconButton onClick={onToggle} variant="soft" disabled={!hasSong} aria-label={musicPlaying ? '暂停' : '播放'}>{musicPlaying ? <PauseIcon /> : <PlayIcon />}</IconButton>
          <IconButton onClick={onNext} variant="soft" disabled={!hasSong} aria-label="下一首"><TrackNextIcon /></IconButton>
        </Flex>
        <IconButton variant="soft" onClick={onQueue} aria-label="队列"><ListBulletIcon /></IconButton>
      </Flex>
    </Flex>
  </>;
};

