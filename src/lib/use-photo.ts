import { useCallback, useState } from 'react';
import { forgetSignedUrls, isMemberPhoto, thumbPath } from '@/lib/chat/attachments';
import { PHOTOS_BUCKET, type PhotoSize, usePhotoUrl } from '@/lib/photos';
import { photoBroke } from '@/lib/shared-reads';

/**
 * A face to draw, and what its <img> calls when it will not load: the old
 * file of a photo changed elsewhere. That face falls back to its initials,
 * its URLs are signed again next time, and kept reads are re-read (throttled).
 */
export function usePhoto(
  path: string | null | undefined,
  size: PhotoSize = 'full',
): { url: string | null; onError: () => void } {
  const url = usePhotoUrl(path, size);
  const [broken, setBroken] = useState<string | null>(null);
  const onError = useCallback(() => {
    if (!url || !path) return;
    setBroken(url);
    forgetSignedUrls(PHOTOS_BUCKET, [path, thumbPath(path)]);
    if (isMemberPhoto(path)) photoBroke();
  }, [url, path]);
  return { url: url === broken ? null : url, onError };
}
