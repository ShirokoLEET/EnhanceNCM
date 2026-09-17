import { PrebuiltLyricPlayer } from '../../../third_party/amll/react-full/src/components/PrebuiltLyricPlayer';
import { isLyricPageOpenedAtom } from '../../../third_party/amll/react-full/src/states/configAtoms';
import { useAtomValue } from 'jotai';
import { forwardRef, useLayoutEffect, type HTMLAttributes } from 'react';

/**
 * The lyric surface is kept mounted just like AMLL Player. Keeping the
 * renderer alive lets its background and lyric transitions retain state while
 * the page slides in and out of view.
 */
type LyricWrapperProps = Omit<HTMLAttributes<HTMLDivElement>, 'children'> & {
  backgroundCover?: string;
};

export const LyricWrapper = forwardRef<HTMLDivElement, LyricWrapperProps>(
  ({ backgroundCover, className, ...props }, ref) => {
    const opened = useAtomValue(isLyricPageOpenedAtom);

    useLayoutEffect(() => {
      if (opened) document.body.dataset.amllLyricsOpen = '';
      else delete document.body.dataset.amllLyricsOpen;
      return () => { delete document.body.dataset.amllLyricsOpen; };
    }, [opened]);

    return <div
      {...props}
      ref={ref}
      className={[`amll-lyric-page${opened ? ' amll-lyric-page-opened' : ''}`, className]
        .filter(Boolean)
        .join(' ')}
      id="amll-lyric-player-wrapper"
      aria-label="歌词"
      aria-hidden={!opened}
    >
      <PrebuiltLyricPlayer id="amll-lyric-player" backgroundCover={backgroundCover} style={{ width: '100%', height: '100%' }} />
    </div>;
  },
);

LyricWrapper.displayName = 'LyricWrapper';
