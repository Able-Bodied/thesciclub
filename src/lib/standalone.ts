/** Safari's Home Screen flag predates the display-mode media query. */
export function isStandalone(): boolean {
  const safari = (navigator as Navigator & { standalone?: boolean }).standalone;
  return (
    safari === true ||
    (typeof window.matchMedia === 'function' &&
      window.matchMedia('(display-mode: standalone)').matches)
  );
}
