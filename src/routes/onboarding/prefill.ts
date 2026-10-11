/**
 * The name Google or Apple gave, to start the name step with.
 *
 * Google sends `full_name` and `name`; Apple sends neither unless it was
 * given on the very first authorization, so the step may simply start empty.
 */
export function nameFromMetadata(metadata: Record<string, unknown> | null | undefined): string {
  for (const key of ['full_name', 'name']) {
    const value = metadata?.[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return '';
}
