// Local visual preview: the production UI with fixture data, no desktop bridge.
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");

const project = path.join(__dirname, "..");
const colors = [["#193948", "#e0a376"], ["#bd634b", "#f0c987"], ["#c6c6ae", "#f5eedc"], ["#52647e", "#d8c4bf"], ["#617766", "#e0cd94"], ["#bc989c", "#f7e3d8"]];
function cover(index) {
  const [background, accent] = colors[index % colors.length];
  return `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="600" viewBox="0 0 600 600"><rect width="600" height="600" fill="${background}"/><circle cx="390" cy="230" r="175" fill="${accent}"/><path d="M-40 480Q180 80 330 430T680 410V650H-40Z" fill="${accent}" opacity=".65"/><path d="M-40 570Q140 270 390 550T680 480V650H-40Z" fill="${background}" opacity=".75"/><text x="40" y="75" fill="${accent}" font-family="Arial,sans-serif" font-weight="700" font-size="28" letter-spacing="5">SOUND STUDIES</text><text x="40" y="552" fill="${accent}" font-family="Arial,sans-serif" font-size="21" letter-spacing="4">VOL. 0${index + 1} / ENHANCE</text></svg>`;
}
const html = `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>EnhanceNCM · 音乐界面预览（演示数据）</title></head><body style="margin:0"><script>
const names = ["落日来信", "慢慢喜欢这个世界", "海岸线", "夜色温柔", "在路上", "片刻永恒", "风经过的地方", "日光之间"];
const performers = ["南方来客", "白日漫游", "岛屿来信", "午夜电台", "林间", "好天气乐队"];
const albums = ["Blue Hour", "橘色日落", "海的另一边", "After Hours", "山与远方", "Soft Focus"];
const tracks = names.map((name,i) => ({id:i+1,name,ar:[{name:performers[i%6]}],al:{name:albums[i%6],picUrl:location.origin+'/cover/'+i%6+'.svg'},dt:180000+i*11000}));
const params = new URLSearchParams(location.search);
window.EnhanceNCM = {
  app: { whenReady: () => params.has('offline') ? Promise.reject(new Error('Preview offline')) : Promise.resolve() },
  ui: { setMode: () => { document.title = '预览模式：客户端内可返回网易云原版'; } },
  sdk: {
    playlists: {
      get: async id => { if(id === '999') throw new Error('Preview error'); return {name:id === '3778678' ? '午后漫游 · 界面演示' : '我的歌单 · 界面演示',trackCount:tracks.length}; },
      getTracks: async () => params.has('empty') ? [] : tracks
    },
    songs: { getUrl: async id => params.has('unavailable') ? {url:null} : {url:'https://preview.invalid/audio/'+id, time:180000} }
  }
};
</script><script src="/preview-library.js"></script><script src="/preview-native.js"></script><script src="/native.js"></script><script src="/lyrics.js"></script><script src="/local-music.js"></script><script src="/audio-source.js"></script><script src="/playback.js"></script><script src="/shell.js"></script><script src="/player-session.js"></script><script src="/presentation.js"></script><script>
EnhanceNCM.app.isStandalone = () => !!(EnhanceNCM._entry && EnhanceNCM._entry.active) || location.href === 'about:blank#enhancencm';
Object.defineProperties(EnhanceNCM.sdk, {
  librarySnapshots: { get: () => EnhanceNCM._libraryCache && EnhanceNCM._libraryCache.snapshot },
  persistence: { get: () => EnhanceNCM._playerPersistence },
  settings: { get: () => EnhanceNCM._settings && { getPlayback: EnhanceNCM._settings.playback } },
  coverColors: { get: () => EnhanceNCM._coverColors }
});
EnhanceNCM.sdk.playback = EnhanceNCM._playback;
EnhanceNCM.sdk.localMusic = EnhanceNCM._localMusic;
EnhanceNCM.sdk.player = EnhanceNCM._player;
EnhanceNCM.sdk.presentation = EnhanceNCM._presentation;
EnhanceNCM.sdk.window = EnhanceNCM._shell.window;
EnhanceNCM.sdk.systemMedia = EnhanceNCM._shell.systemMedia;
previewNative.coverRequests = [];
EnhanceNCM.sdk.artwork = { getUrl: (url, size) => {
  const cached = EnhanceNCM._shell.artwork.getUrl(url, size);
  previewNative.coverRequests.push(cached);
  return cached.startsWith('orpheus://cache?') ? cached.slice('orpheus://cache?'.length) : cached;
} };
</script><script src="/cover-colors.js"></script><script src="/music-styles.js"></script><script src="/standalone.js"></script><script>
const host=document.createElement('div'); host.id='enhancencm-ui-root';document.body.appendChild(host);
window.disposeMusic=EnhanceNCM._renderMusic({root:host.attachShadow({mode:'open'}),sdk:EnhanceNCM.sdk});
</script></body></html>`;

function createServer() {
  return http.createServer((request, response) => {
    const url = new URL(request.url, "http://localhost");
    response.setHeader("Cache-Control", "no-store");
    if (url.pathname === "/") { response.setHeader("Content-Type", "text/html; charset=utf-8"); return response.end(html); }
    const fixtures = { "/preview-library.js": "tools/preview-library.js", "/preview-native.js": "tools/preview-native.js", "/lyrics.js": "src/sdk/domain/lyrics.js", "/local-files.js": "src/host/local-files.js", "/local-music.js": "src/sdk/domain/local-music.js", "/native.js": "src/sdk/transport/native.js", "/audio-source.js": "src/sdk/domain/audio-source.js", "/playback.js": "src/sdk/domain/playback.js", "/shell.js": "src/sdk/domain/shell.js", "/player-session.js": "src/sdk/domain/player-session.js", "/presentation.js": "src/sdk/domain/presentation.js", "/cover-colors.js": "src/sdk/domain/cover-colors.js" };
    if (fixtures[url.pathname]) {
      response.setHeader("Content-Type", "text/javascript; charset=utf-8");
      return response.end(fs.readFileSync(path.join(project, fixtures[url.pathname])));
    }
    if (["/music-styles.js", "/standalone.js"].includes(url.pathname)) {
      response.setHeader("Content-Type", "text/javascript; charset=utf-8");
      return response.end(fs.readFileSync(path.join(project, "src/themes/spotify", url.pathname.slice(1))));
    }
    const match = url.pathname.match(/^\/cover\/([0-5])\.svg$/);
    if (match) { response.setHeader("Content-Type", "image/svg+xml"); return response.end(cover(Number(match[1]))); }
    response.statusCode = 404; response.end("Not found");
  });
}
if (require.main === module) {
  const port = Number(process.env.PORT || 53871);
  createServer().listen(port, "127.0.0.1", () => console.log(`Music preview (mock Native events, no audio): http://127.0.0.1:${port}`));
}
module.exports = { createServer };
