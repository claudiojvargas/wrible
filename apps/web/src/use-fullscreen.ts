import { useEffect, useState, type RefObject } from 'react';

export function useFullscreen(element: RefObject<HTMLElement | null>) {
  const [mode, setMode] = useState<'native' | 'expanded' | null>(null);

  useEffect(() => {
    const sync = () => {
      const active = document.fullscreenElement === element.current;
      setMode(current => active ? 'native' : current === 'native' ? null : current);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || element.current?.querySelector('dialog[open]')) return;
      setMode(current => current === 'expanded' ? null : current);
    };
    document.addEventListener('fullscreenchange', sync);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('fullscreenchange', sync);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [element]);

  async function toggleFullscreen() {
    if (mode === 'expanded') {
      setMode(null);
      return;
    }
    if (document.fullscreenElement === element.current) {
      await document.exitFullscreen();
      return;
    }
    const target = element.current;
    if (!target) return;

    if (target.requestFullscreen && document.fullscreenEnabled) {
      try {
        await target.requestFullscreen();
        return;
      } catch {
        // The browser can reject native fullscreen even when the API is available.
      }
    }
    setMode('expanded');
  }

  return { fullscreen: mode !== null, toggleFullscreen };
}
