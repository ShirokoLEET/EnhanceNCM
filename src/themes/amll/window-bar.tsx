import { useEffect, useRef, useState } from 'react';

type WindowControls = {
  getState?: () => Promise<{ maximized?: boolean }>;
  subscribe?: (listener: (value: { maximized?: boolean }) => void) => () => void;
  minimize?: () => Promise<unknown>;
  toggleMaximize?: () => Promise<unknown>;
  drag?: () => Promise<unknown>;
  close?: () => Promise<unknown>;
};

type WindowBarProps = {
  windowControls: WindowControls;
  lyricsOpen?: boolean;
  onSettings?: () => Promise<unknown> | unknown;
  onClose?: () => Promise<unknown> | unknown;
  onError?: (error: unknown) => void;
};

function isInteractive(target: EventTarget | null) {
  return target instanceof Element && !!target.closest('button, input, a, label, [contenteditable], [data-no-drag]');
}

function MinimizeIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round">
    <path d="M6 12h12" />
  </svg>;
}

function MaximizeIcon({ maximized }: { maximized: boolean }) {
  return maximized
    ? <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 6V4h11v11h-2" />
      <rect x="4" y="9" width="11" height="11" />
    </svg>
    : <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <rect x="6" y="6" width="12" height="12" />
    </svg>;
}

function CloseIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round">
    <path d="m6 6 12 12M18 6 6 18" />
  </svg>;
}

function SettingsIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 3.5 13.7 5a7.6 7.6 0 0 1 1.9.8l2.2-.6 1.5 1.5-.6 2.2c.3.6.6 1.2.8 1.9l1.5 1.7v2.1l-1.5 1.7a7.6 7.6 0 0 1-.8 1.9l.6 2.2-1.5 1.5-2.2-.6a7.6 7.6 0 0 1-1.9.8L12 21l-1.7-1.7a7.6 7.6 0 0 1-1.9-.8l-2.2.6-1.5-1.5.6-2.2a7.6 7.6 0 0 1-.8-1.9L3 12l1.5-1.7a7.6 7.6 0 0 1 .8-1.9l-.6-2.2 1.5-1.5 2.2.6a7.6 7.6 0 0 1 1.9-.8L12 3.5Z" />
    <circle cx="12" cy="12" r="3" />
  </svg>;
}

export function WindowBar({ windowControls, lyricsOpen = false, onSettings, onClose, onError }: WindowBarProps) {
  const barRef = useRef<HTMLElement>(null);
  const dragOrigin = useRef<{ x: number; y: number } | null>(null);
  const [maximized, setMaximized] = useState(false);
  const [closing, setClosing] = useState(false);

  useEffect(() => {
    let active = true;
    let release: (() => void) | undefined;
    const update = (value: { maximized?: boolean } | null | undefined) => {
      if (active && value) setMaximized(!!value.maximized);
    };

    try {
      if (typeof windowControls.subscribe === 'function') release = windowControls.subscribe(update);
    } catch (_) {
      // The preview SDK may not expose native event subscriptions.
    }
    if (typeof windowControls.getState === 'function') {
      windowControls.getState().then(update).catch(() => {
        // Native window setup can still be in progress when the theme mounts.
      });
    }
    return () => {
      active = false;
      release?.();
    };
  }, [windowControls]);

  useEffect(() => {
    const bar = barRef.current;
    if (!bar) return;
    const onMouseDown = (event: MouseEvent) => {
      dragOrigin.current = event.button === 0 && !isInteractive(event.target) && event.detail < 2
        ? { x: event.clientX, y: event.clientY }
        : null;
    };
    const onMouseMove = (event: MouseEvent) => {
      const origin = dragOrigin.current;
      if (!origin || !(event.buttons & 1)) return;
      if (Math.abs(event.clientX - origin.x) > 5 || Math.abs(event.clientY - origin.y) > 5) {
        dragOrigin.current = null;
        if (typeof windowControls.drag === 'function') {
          Promise.resolve().then(() => windowControls.drag?.()).catch((error) => onError?.(error));
        }
      }
    };
    const endDrag = () => { dragOrigin.current = null; };
    const onDoubleClick = (event: MouseEvent) => {
      if (isInteractive(event.target) || typeof windowControls.toggleMaximize !== 'function') return;
      Promise.resolve().then(() => windowControls.toggleMaximize?.()).catch((error) => onError?.(error));
    };
    bar.addEventListener('mousedown', onMouseDown);
    bar.addEventListener('mousemove', onMouseMove);
    bar.addEventListener('dblclick', onDoubleClick);
    window.addEventListener('mouseup', endDrag);
    window.addEventListener('blur', endDrag);
    return () => {
      bar.removeEventListener('mousedown', onMouseDown);
      bar.removeEventListener('mousemove', onMouseMove);
      bar.removeEventListener('dblclick', onDoubleClick);
      window.removeEventListener('mouseup', endDrag);
      window.removeEventListener('blur', endDrag);
    };
  }, [onError, windowControls]);

  const updateState = (value: { maximized?: boolean } | null | undefined) => {
    if (value) setMaximized(!!value.maximized);
  };
  const run = (action?: () => Promise<unknown> | unknown) => {
    if (typeof action !== 'function') return;
    Promise.resolve().then(action).catch((error) => onError?.(error));
  };
  const openSettings = () => {
    if (typeof onSettings === 'function') run(onSettings);
  };
  const toggleMaximize = () => {
    if (typeof windowControls.toggleMaximize !== 'function') return;
    run(async () => {
      await windowControls.toggleMaximize?.();
      if (typeof windowControls.getState === 'function') updateState(await windowControls.getState());
    });
  };
  const close = () => {
    if (closing) return;
    const action = onClose || windowControls.close;
    if (typeof action !== 'function') return;
    setClosing(true);
    Promise.resolve().then(() => action()).catch((error) => {
      setClosing(false);
      onError?.(error);
    });
  };
  const maximizeLabel = maximized ? '还原窗口' : '最大化';

  return <header ref={barRef} className={`amll-window-bar${lyricsOpen ? ' amll-window-bar-lyrics' : ''}`} data-window-drag aria-label="AMLL 窗口栏">
    <div className="amll-window-drag-area" />
    <div className="amll-window-controls" data-no-drag>
      <button className="amll-window-control" type="button" aria-label="EnhanceNCM 设置" title="EnhanceNCM 设置" disabled={closing}
        onClick={openSettings}><SettingsIcon /></button>
      <button className="amll-window-control" type="button" aria-label="最小化" title="最小化" disabled={closing}
        onClick={() => run(windowControls.minimize)}><MinimizeIcon /></button>
      <button className="amll-window-control" type="button" aria-label={maximizeLabel} title={maximizeLabel} disabled={closing}
        onClick={toggleMaximize}><MaximizeIcon maximized={maximized} /></button>
      <button className="amll-window-control amll-window-close" type="button" aria-label="关闭网易云音乐" title="退出网易云音乐" disabled={closing}
        onClick={close}><CloseIcon /></button>
    </div>
  </header>;
}

WindowBar.displayName = 'WindowBar';
