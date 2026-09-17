// Adapted from amll-page/packages/player: SDK artwork replaces Dexie/blob lookup.
import classNames from 'classnames';
import type { HTMLAttributes } from 'react';
import styles from './index.module.css';

export function PlaylistCover({ coverUrl, className, ...props }: HTMLAttributes<HTMLDivElement> & { coverUrl?: string }) {
  return <div className={classNames(styles.playlistCover, coverUrl && styles.single, 'img-border', className)} {...props}>
    {coverUrl && <div style={{ backgroundImage: `url(${JSON.stringify(coverUrl)})` }} />}
  </div>;
}
