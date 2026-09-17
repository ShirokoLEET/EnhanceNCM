// Adapted from AMLL Player's original playlist page. The remote playlist
// metadata and actions are provided by the EnhanceNCM SDK adapter.
import { ArrowLeftIcon, PlayIcon } from '@radix-ui/react-icons';
import { Box, Button, Flex, Heading, Text } from '@radix-ui/themes';
import { useVirtualizer } from '@tanstack/react-virtual';
import { motion, useMotionTemplate, useScroll } from 'framer-motion';
import { useRef } from 'react';
import { PageContainer } from '../../components/PageContainer';
import { PlaylistCover } from '../../components/PlaylistCover';
import { PlaylistSongCard } from '../../components/PlaylistSongCard';

export function PlaylistPage({ title, coverUrl, total, songs = [], currentId, loading, error, more, onMore, onRetry, onBack, onPlay, onNext, onAddToPlaylist, portalContainer, moreLabel }: any) {
  const playlistViewRef = useRef<HTMLDivElement>(null);
  const playlistViewScroll = useScroll({ container: playlistViewRef });
  const playlistCoverSize = useMotionTemplate`clamp(6em, calc(12em - ${playlistViewScroll.scrollY}px), 12em)`;
  const playlistInfoGapSize = useMotionTemplate`clamp(var(--space-1), calc(var(--space-4) - ${playlistViewScroll.scrollY}px / 5), var(--space-4))`;
  const rows = useVirtualizer({ count: songs.length, getScrollElement: () => playlistViewRef.current, estimateSize: () => 94, overscan: 5 });

  return <PageContainer>
    <Flex direction="column" height="100%" className="amll-playlist-page">
      <Flex gap="4" direction="column" flexGrow="0" pb="4" mt="5">
        <Flex align="end" pt="4">
          <Button variant="soft" aria-label="返回首页" onClick={onBack}><ArrowLeftIcon /><span>返回</span></Button>
        </Flex>
        <Flex align="end" gap="3">
          <motion.div style={{ width: playlistCoverSize, flexShrink: 0 }}>
            <PlaylistCover coverUrl={coverUrl} style={{ width: '100%' }} />
          </motion.div>
          <motion.div className="amll-playlist-info" style={{ display: 'flex', flexDirection: 'column', minWidth: 0, gap: playlistInfoGapSize }}>
            <Heading className="amll-playlist-title">{title}</Heading>
            <Text>{total == null ? `${songs.length} 首歌曲` : `${total} 首歌曲`}</Text>
            <Flex gap="2" wrap="wrap">
              <Button disabled={!songs.length} onClick={() => onPlay(0, false)}><PlayIcon />播放全部</Button>
              <Button disabled={!songs.length} variant="soft" onClick={() => onPlay(Math.floor(Math.random() * songs.length), true)}>随机播放</Button>
            </Flex>
          </motion.div>
        </Flex>
      </Flex>
      {error && <Flex gap="2" align="center" mb="3"><Text role="alert">{error}</Text><Button variant="soft" disabled={loading} onClick={onRetry}>重试</Button></Flex>}
      {loading && !songs.length && <Text role="status" color="gray">正在加载歌曲…</Text>}
      {!loading && !error && !songs.length && <Text my="9" align="center">没有找到歌曲</Text>}
      <div className="amll-tracks-scroll" ref={playlistViewRef}>
        <div style={{ position: 'relative', height: rows.getTotalSize() }}>
          {rows.getVirtualItems().map((row) => <div key={`${songs[row.index].id}-${row.index}`} style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: row.size, transform: `translateY(${row.start}px)` }}>
            <PlaylistSongCard song={songs[row.index]} active={String(songs[row.index].id) === String(currentId)}
              onPlay={() => onPlay(row.index)} onNext={onNext} onAddToPlaylist={onAddToPlaylist} portalContainer={portalContainer} />
          </div>)}
        </div>
        {more && <Flex justify="center" py="3"><Button variant="soft" disabled={loading} onClick={onMore}>{moreLabel || '加载更多歌曲'}</Button></Flex>}
      </div>
    </Flex>
  </PageContainer>;
}

PlaylistPage.displayName = 'PlaylistPage';

export default PlaylistPage;
