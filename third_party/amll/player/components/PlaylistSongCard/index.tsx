// Adapted from AMLL Player's original song card. Online metadata is passed in
// by the SDK adapter instead of being read from the local Dexie database.
import { HamburgerMenuIcon, PlayIcon } from '@radix-ui/react-icons';
import { Avatar, Box, Card, DropdownMenu, Flex, IconButton, Text } from '@radix-ui/themes';
import { useState } from 'react';

export function PlaylistSongCard({ song, onPlay, onNext, onAddToPlaylist, active, portalContainer }: any) {
  const name = song.name || '未知歌曲';
  const [menuOpen, setMenuOpen] = useState(false);
  return <Box py="1" className="amll-track-row" data-current={active || undefined} onDoubleClick={onPlay}>
    <Card>
      <Flex p="1" align="center" gap="4">
        <Avatar size="5" fallback={<div />} src={song.coverUrl || undefined} />
        <Flex direction="column" justify="center" flexGrow="1" minWidth="0">
          <Text wrap="nowrap" truncate>{name}</Text>
          <Text wrap="nowrap" truncate color="gray">{song.artistText}</Text>
        </Flex>
        <Text wrap="nowrap" color="gray" size="2">{song.durationText}</Text>
        <IconButton variant="ghost" aria-label={`播放 ${name}`} onClick={onPlay}><PlayIcon /></IconButton>
        <DropdownMenu.Root open={menuOpen} onOpenChange={setMenuOpen}>
          <DropdownMenu.Trigger asChild>
            <IconButton variant="ghost" aria-label={`歌曲操作 ${name}`}><HamburgerMenuIcon /></IconButton>
          </DropdownMenu.Trigger>
          <DropdownMenu.Content container={portalContainer}>
            <DropdownMenu.Item onSelect={() => { setMenuOpen(false); onPlay?.(); }}>播放音乐</DropdownMenu.Item>
            <DropdownMenu.Item onSelect={() => { setMenuOpen(false); onNext?.(song); }}>下一首播放</DropdownMenu.Item>
            {!song.localPath && <DropdownMenu.Item onSelect={() => { setMenuOpen(false); onAddToPlaylist?.(song); }}>添加到歌单</DropdownMenu.Item>}
          </DropdownMenu.Content>
        </DropdownMenu.Root>
      </Flex>
    </Card>
  </Box>;
}
