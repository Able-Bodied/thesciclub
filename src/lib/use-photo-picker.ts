import { Capacitor, registerPlugin } from '@capacitor/core';
import { type ChangeEvent, useLayoutEffect, useRef, useState } from 'react';
import { MAX_SOURCE_BYTES, photosFromLibrary } from '@/lib/chat/attachments';

interface NativePhotoPicker {
  pick(options: { limit: number; maxBytes: number }): Promise<{
    photos: { url: string; name: string; type: string }[];
    transfer?: string;
    overflow?: boolean;
  }>;
  release(options: { transfer: string }): Promise<void>;
}

const pluginName = 'PhotoSelection';
const nativePicker = registerPlugin<NativePhotoPicker>(pluginName);

export function usePhotoPicker({
  remaining,
  disabled = false,
  add,
  onError,
}: {
  remaining: number;
  disabled?: boolean;
  add: (photos: File[], overflow: string | null) => void;
  onError: (message: string) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const latest = useRef<{ remaining: number; add: typeof add; onError: typeof onError } | null>(
    null,
  );
  const [picking, setPicking] = useState(false);

  useLayoutEffect(() => {
    latest.current = disabled ? null : { remaining, add, onError };
    return () => {
      latest.current = null;
    };
  });

  function onChange(event: ChangeEvent<HTMLInputElement>) {
    const { photos, overflow } = photosFromLibrary(event.target.files, remaining);
    event.target.value = '';
    if (photos.length) add(photos, overflow);
  }

  async function pickOnIPhone() {
    setPicking(true);
    try {
      const result = await nativePicker.pick({ limit: remaining, maxBytes: MAX_SOURCE_BYTES });
      const files: File[] = [];
      try {
        for (const photo of result.photos) {
          const response = await fetch(Capacitor.convertFileSrc(photo.url));
          if (!response.ok) throw new Error('Unable to read the selected photo.');
          files.push(new File([await response.blob()], photo.name, { type: photo.type }));
        }
      } finally {
        if (result.transfer)
          await nativePicker.release({ transfer: result.transfer }).catch(() => undefined);
      }
      const current = latest.current;
      if (!current) return;
      const { photos, overflow } = photosFromLibrary(files, current.remaining);
      if (photos.length) {
        current.add(photos, result.overflow ? 'Only the photos that fit were added.' : overflow);
      }
    } catch (error) {
      latest.current?.onError(
        error instanceof Error ? error.message : 'Could not open the photos. Try again.',
      );
    } finally {
      setPicking(false);
    }
  }

  function open() {
    if (disabled || picking || remaining === 0) return;
    if (Capacitor.getPlatform() === 'ios' && Capacitor.isPluginAvailable(pluginName)) {
      void pickOnIPhone();
    } else {
      input.current?.click();
    }
  }

  return { input, onChange, open, picking };
}
