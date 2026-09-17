# AMLL source attribution

UI source copied from `D:/Projects/ncm/amll-page`, commit
`5a93a2c040f055b040d554c312eba2588fab0be8`.

Upstream: https://github.com/Steve-xmh/applemusic-like-lyrics

Copyright belongs to the upstream authors. The `core`, `react`, `react-full`, and `player`
sources are distributed under GPL-3.0; see the accompanying LICENSE.
`upstream-package.json` preserves each package's original metadata.

EnhanceNCM reuses the PrebuiltLyricPlayer and its UI dependencies, plus the Player
home/playlist pages, PageContainer, AppContainer, PlaylistCard, PlaylistCover,
PlaylistSongCard, NowPlaylistCard and NowPlayingBar. The integration
is in `src/themes/amll`, built by `tools/build-amll.mjs`. The Tauri player,
WebSocket transport, audio engine, and upstream demo pages are not executed.
All music data and playback commands use the public EnhanceNCM SDK.

Local compatibility changes: accessible labels on media controls, sliders and
the lyric menu button, keyboard slider controls, a zero-duration guard for the
empty player, and a separate backgroundCover input so WebGL can use a CORS-capable cover URL while
the visible cover continues to use the SDK's native image cache.

Player page/component adaptations retain the original Radix layouts and CSS,
replacing Dexie/blob data, router navigation and local-file mutations with
SDK-supplied metadata and callbacks. The home page includes SDK recommendation,
created/subscribed playlist filters, search and daily recommendations. Track
lists remain virtualized and support SDK pagination. The playbar cover opens the
full player, matching AMLL Player's original interaction. Closing the lyrics view
restores the browsing page without replacing or stopping the SDK session.

To obtain the corresponding source for a distributed theme, distribute this
repository revision (including third_party/amll, src/themes/amll, tools,
package.json and package-lock.json) alongside the build. Run `npm ci` followed
by `npm run build` to reproduce the theme. Runtime libraries retain their license
notices in the generated bundle.
