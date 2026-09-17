import { ContextMenu } from '@radix-ui/themes';
import { useAtom, useAtomValue, useSetAtom } from 'jotai';
import { useEffect, useState } from 'react';
import {
  hideLyricViewAtom,
  isLyricPageOpenedAtom,
} from '../../../third_party/amll/react-full/src/states/configAtoms';
import {
  onPlayOrResumeAtom,
  onRequestNextSongAtom,
  onRequestPrevSongAtom,
} from '../../../third_party/amll/react-full/src/states/callbacks';

type LyricContextMenuProps = {
  container?: Element | DocumentFragment | null;
  onError?: (error: unknown) => void;
};

export function LyricContextMenu({ container, onError }: LyricContextMenuProps) {
  const [hideLyricView, setHideLyricView] = useAtom(hideLyricViewAtom);
  const setLyricPageOpened = useSetAtom(isLyricPageOpenedAtom);
  const onRequestPrevSong = useAtomValue(onRequestPrevSongAtom).onEmit;
  const onRequestNextSong = useAtomValue(onRequestNextSongAtom).onEmit;
  const onPlayOrResume = useAtomValue(onPlayOrResumeAtom).onEmit;
  const [isFullscreen, setIsFullscreen] = useState(
    typeof document !== 'undefined' && !!document.fullscreenElement,
  );

  useEffect(() => {
    const handleFullscreenChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  const toggleFullscreen = () => {
    const action = document.fullscreenElement
      ? document.exitFullscreen?.()
      : document.documentElement.requestFullscreen?.();
    if (action) Promise.resolve(action).catch((error) => onError?.(error));
  };

  return <ContextMenu.Content container={container} size="1">
    <ContextMenu.Item onSelect={onRequestPrevSong} shortcut="Ctrl Alt ←">上一首</ContextMenu.Item>
    <ContextMenu.Item onSelect={onPlayOrResume} shortcut="Ctrl Alt P">暂停 / 继续</ContextMenu.Item>
    <ContextMenu.Item onSelect={onRequestNextSong} shortcut="Ctrl Alt →">下一首</ContextMenu.Item>
    <ContextMenu.Separator />
    <ContextMenu.CheckboxItem checked={!hideLyricView} onCheckedChange={(checked) => setHideLyricView(!checked)}>
      显示歌词
    </ContextMenu.CheckboxItem>
    <ContextMenu.Item onSelect={toggleFullscreen} shortcut="F11">
      {isFullscreen ? '退出全屏' : '进入全屏'}
    </ContextMenu.Item>
    <ContextMenu.Separator />
    <ContextMenu.Item onSelect={() => setLyricPageOpened(false)}>退出歌词页面</ContextMenu.Item>
  </ContextMenu.Content>;
}

LyricContextMenu.displayName = 'LyricContextMenu';
