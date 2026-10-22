import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { isNative } from '@/lib/standalone';

/** The store app's native pieces (lib/native-shell.ts). Nothing on the website. */
export function NativeShell() {
  // Through a ref: `navigate` changes with every screen, the listeners do not.
  const go = useNavigate();
  const navigate = useRef(go);
  navigate.current = go;

  useEffect(() => {
    if (!isNative()) return;
    let live = true;
    let stop: (() => void) | null = null;
    void import('@/lib/native-shell').then(({ startNativeShell }) => {
      if (!live) return;
      stop = startNativeShell((to) => {
        void (typeof to === 'number' ? navigate.current(to) : navigate.current(to));
      });
    });
    return () => {
      live = false;
      stop?.();
    };
  }, []);

  return null;
}
