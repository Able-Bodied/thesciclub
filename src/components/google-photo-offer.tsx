import type { GooglePhoto } from '@/lib/google-photo';
import { cn } from '@/lib/utils';

/**
 * "Use my Google photo", with a preview. Never chosen for the member: only
 * this tap copies it into the club.
 */
export function GooglePhotoOffer({
  photo,
  onUse,
  disabled,
  className,
}: {
  photo: GooglePhoto;
  onUse: () => void;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <div className={cn('flex items-center gap-3', className)}>
      <img
        src={photo.previewUrl}
        // The button beside it says what it is.
        alt=""
        className="h-14 w-14 flex-none rounded-[18px] object-cover"
      />
      <button
        type="button"
        onClick={onUse}
        disabled={disabled}
        className="min-h-[44px] rounded-full bg-tint px-4 py-2 text-left font-semibold text-[0.875rem] text-emphasis transition-colors hover:bg-line disabled:opacity-60"
      >
        Use my Google photo
      </button>
    </div>
  );
}
