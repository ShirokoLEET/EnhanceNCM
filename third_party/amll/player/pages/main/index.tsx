// Adapted from AMLL Player's original home page. The visual hierarchy and
// controls stay aligned with the upstream page; the callbacks are supplied by
// the EnhanceNCM library adapter.
import {
  DashboardIcon,
  ExitIcon,
  HamburgerMenuIcon,
  HeartIcon,
  MagnifyingGlassIcon,
  PlusIcon,
  ShuffleIcon,
} from '@radix-ui/react-icons';
import { Box, Button, Dialog, DropdownMenu, Flex, Heading, IconButton, Spinner, Text, TextField } from '@radix-ui/themes';
import { useVirtualizer } from '@tanstack/react-virtual';
import { type FC, type FormEvent, useRef, useState } from 'react';
import { PageContainer } from '../../components/PageContainer';
import { PlaylistCard } from '../../components/PlaylistCard';

export function MainPage({ playlists = [], category, onCategory, onOpen, onDaily, onSearch,
  onRadar, onRoaming, onHeartMode, query, onQuery, loading, error, onRetry, more, onMore, accountName, onExit, portalContainer }: any) {
  const parentRef = useRef<HTMLDivElement>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [playlistOpen, setPlaylistOpen] = useState(false);
  const [playlistId, setPlaylistId] = useState('');
  const rows = useVirtualizer({ count: playlists.length, getScrollElement: () => parentRef.current, estimateSize: () => 105, overscan: 5 });

  const submitSearch = (event: FormEvent) => {
    event.preventDefault();
    if (!query?.trim()) return;
    setSearchOpen(false);
    onSearch();
  };

  const openPlaylist = (event: FormEvent) => {
    event.preventDefault();
    const value = playlistId.trim();
    if (!/^[1-9]\d*$/.test(value)) return;
    setPlaylistOpen(false);
    setPlaylistId('');
    onOpen({ id: value, name: `歌单 ${value}`, coverImgUrl: '' });
  };

  return <PageContainer>
    <Flex direction="column" height="100%" className="amll-home-page">
      <Flex direction="row" align="center" wrap="wrap" mt="5">
        <Box asChild flexGrow="1">
          <Heading wrap="nowrap" my="4">AMLL Player</Heading>
        </Box>
        <Flex gap="1" wrap="wrap">
          <Dialog.Root open={searchOpen} onOpenChange={setSearchOpen}>
            <Dialog.Trigger asChild>
              <IconButton variant="soft" aria-label="搜索歌曲" title="搜索歌曲"><MagnifyingGlassIcon /></IconButton>
            </Dialog.Trigger>
            <Dialog.Content container={portalContainer} maxWidth="450px">
              <Dialog.Title>搜索歌曲</Dialog.Title>
              <form onSubmit={submitSearch}>
                <TextField.Root value={query || ''} autoFocus placeholder="搜索歌曲、歌手" aria-label="搜索歌曲"
                  onChange={(event) => onQuery(event.target.value)} />
                <Flex gap="3" mt="4" justify="end">
                  <Dialog.Close asChild><Button type="button" variant="soft" color="gray">取消</Button></Dialog.Close>
                  <Button type="submit" disabled={!query?.trim()}>搜索</Button>
                </Flex>
              </form>
            </Dialog.Content>
          </Dialog.Root>
          <Dialog.Root open={playlistOpen} onOpenChange={setPlaylistOpen}>
            <Dialog.Trigger asChild>
              <Button variant="soft"><PlusIcon />新建播放列表</Button>
            </Dialog.Trigger>
            <Dialog.Content container={portalContainer} maxWidth="450px">
              <Dialog.Title>打开网易云歌单</Dialog.Title>
              <form onSubmit={openPlaylist}>
                <Flex direction="column" gap="3">
                  <Text>输入网易云音乐歌单 ID，载入你想听的音乐。</Text>
                  <TextField.Root value={playlistId} autoFocus inputMode="numeric" placeholder="例如：3778678"
                    aria-label="歌单 ID" onChange={(event) => setPlaylistId(event.target.value)} />
                </Flex>
                <Flex gap="3" mt="4" justify="end">
                  <Dialog.Close asChild><Button type="button" variant="soft" color="gray">取消</Button></Dialog.Close>
                  <Button type="submit" disabled={!/^[1-9]\d*$/.test(playlistId.trim())}>打开歌单</Button>
                </Flex>
              </form>
            </Dialog.Content>
          </Dialog.Root>
          <DropdownMenu.Root key={category}>
            <DropdownMenu.Trigger asChild>
              <IconButton variant="soft" aria-label="更多选项" title="更多选项"><HamburgerMenuIcon /></IconButton>
            </DropdownMenu.Trigger>
            <DropdownMenu.Content container={portalContainer}>
              <DropdownMenu.Label>{accountName || '你的音乐资料库'}</DropdownMenu.Label>
              <DropdownMenu.Item onSelect={() => onCategory?.('recommended')}>推荐歌单</DropdownMenu.Item>
              <DropdownMenu.Item onSelect={() => onCategory?.('created')}>我的歌单</DropdownMenu.Item>
              <DropdownMenu.Item onSelect={() => onCategory?.('subscribed')}>收藏歌单</DropdownMenu.Item>
              <DropdownMenu.Separator />
              <DropdownMenu.Label>为你推荐</DropdownMenu.Label>
              <DropdownMenu.Item onSelect={onDaily}><DashboardIcon />每日推荐</DropdownMenu.Item>
              <DropdownMenu.Item onSelect={onRadar}><MagnifyingGlassIcon />私人雷达</DropdownMenu.Item>
              <DropdownMenu.Item onSelect={onRoaming}><ShuffleIcon />私人漫游</DropdownMenu.Item>
              <DropdownMenu.Item onSelect={onHeartMode}><HeartIcon />心动模式</DropdownMenu.Item>
              <DropdownMenu.Separator />
              <DropdownMenu.Item onSelect={onRetry} disabled={loading}>刷新歌单</DropdownMenu.Item>
              {onExit && <>
                <DropdownMenu.Separator />
                <DropdownMenu.Item onSelect={onExit}><ExitIcon />返回网易云原版</DropdownMenu.Item>
              </>}
            </DropdownMenu.Content>
          </DropdownMenu.Root>
        </Flex>
      </Flex>

      {error && <Flex gap="2" align="center" mb="3"><Text role="alert">{error}</Text><Button variant="soft" disabled={loading} onClick={onRetry}>重试</Button></Flex>}
      {loading && !playlists.length && <Flex direction="column" gap="2" justify="center" align="center" height="70vh"><Spinner size="3" /><Text>加载歌单中</Text></Flex>}
      {!loading && !error && !playlists.length && <Text mt="9" as="div" align="center">暂无歌单</Text>}
      <div className="amll-playlists-scroll" ref={parentRef}>
        <div style={{ height: rows.getTotalSize(), width: '100%', position: 'relative' }}>
          {rows.getVirtualItems().map((row) => <div key={playlists[row.index].id} style={{ position: 'absolute', top: 0, left: 0, width: '100%', padding: '4px 8px', height: row.size, transform: `translateY(${row.start}px)`, boxSizing: 'border-box' }}>
            <PlaylistCard playlist={playlists[row.index]} onOpen={onOpen} showMeta={category !== 'recommended'} />
          </div>)}
        </div>
        {more && <Flex justify="center" py="3"><Button variant="soft" disabled={loading} onClick={onMore}>加载更多歌单</Button></Flex>}
      </div>
    </Flex>
  </PageContainer>;
}

MainPage.displayName = 'MainPage';

export default MainPage;
