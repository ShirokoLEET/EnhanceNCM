// Adapted from AMLL Player's original playlist card. Only the source data and
// click callback are supplied by the EnhanceNCM SDK adapter.
import { Card, Flex, Text } from '@radix-ui/themes';
import { PlaylistCover } from '../PlaylistCover';

export function PlaylistCard({ playlist, onOpen, showMeta = true }: any) {
  const songAmount = playlist.trackCount ?? playlist.trackIds?.length ?? playlist.songCount ?? 0;
  const createdAt = playlist.createTime || playlist.updateTime;
  const createTime = createdAt ? new Date(createdAt).toLocaleDateString() : '网易云音乐歌单';
  return <Card asChild size="2" className="amll-playlist-card">
    <button type="button" onClick={() => onOpen(playlist)} aria-label={`打开歌单：${playlist.name}`}>
      <Flex align="center" gap="4" minWidth="0">
        <PlaylistCover coverUrl={playlist.coverUrl} />
        <Flex direction="column" gap="1" flexGrow="1" minWidth="0">
          <Text truncate>{playlist.name}</Text>
          {showMeta && <Text color="gray" size="2">
            <Flex gap="2">
              {songAmount} 首歌曲
              <div>-</div>
              创建于 {createTime}
            </Flex>
          </Text>}
        </Flex>
      </Flex>
    </button>
  </Card>;
}
