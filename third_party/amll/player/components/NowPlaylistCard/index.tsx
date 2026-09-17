import { PlayIcon } from '@radix-ui/react-icons';
import { Avatar, Box, Flex, Inset } from '@radix-ui/themes';
import { useVirtualizer } from '@tanstack/react-virtual';
import { type CSSProperties, type FC, useEffect, useRef } from 'react';
import styles from './index.module.css';

function PlaylistSongItem({ song, index, style, active, onPlay }: any) {
  const name = song?.name || '未知歌曲';
  const artists = song?.artistText || '';
  return <div style={style}>
    <button type="button" className={styles.playlistSongItem}
      onClick={() => onPlay(index)} onDoubleClick={() => onPlay(index)}
      aria-label={`播放 ${name} - ${artists}`} data-active={active ? 'true' : undefined}>
      <Avatar size="4" fallback={<div />} src={song?.coverUrl || undefined} />
      <div className={styles.musicInfo}>
        <div className={styles.name}>{name}</div>
        <div className={styles.artists}>{artists}</div>
      </div>
      {active && <PlayIcon />}
    </button>
  </div>;
}

export const NowPlaylistCard: FC<{
  songs?: any[];
  currentId?: string | number | null;
  onPlay?: (index: number) => void;
}> = ({ songs = [], currentId, onPlay = () => {} }) => {
  const playlistContainerRef = useRef<HTMLDivElement>(null);
  const rowVirtualizer = useVirtualizer({
    count: songs.length,
    getScrollElement: () => playlistContainerRef.current,
    estimateSize: () => 66,
    overscan: 5,
  });

  useEffect(() => {
    const index = songs.findIndex((song) => String(song?.id) === String(currentId));
    if (index >= 0) rowVirtualizer.scrollToIndex(index, { align: 'center' });
  }, [currentId, songs, rowVirtualizer]);

  return <Flex direction="column" maxWidth="400px" maxHeight="500px"
    style={{ height: '50vh', width: 'max(10vw, 50vh)', backdropFilter: 'blur(1em)', backgroundColor: 'var(--black-a8)' }}>
    <Box py="3" px="4">当前播放列表</Box>
    <Inset clip="padding-box" side="bottom" pb="current" style={{ overflowY: 'auto' }} ref={playlistContainerRef}>
      {songs.length ? <div style={{ height: `${rowVirtualizer.getTotalSize()}px`, width: '100%', position: 'relative' }}>
        {rowVirtualizer.getVirtualItems().map((virtualItem) => {
          const song = songs[virtualItem.index];
          return <PlaylistSongItem key={virtualItem.key}
            style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: `${virtualItem.size}px`, transform: `translateY(${virtualItem.start}px)` }}
            song={song} index={virtualItem.index}
            active={String(song?.id) === String(currentId)} onPlay={onPlay} />;
        })}
      </div> : <Box px="4" py="4"><span style={{ opacity: 0.55 }}>队列为空</span></Box>}
    </Inset>
  </Flex>;
};
