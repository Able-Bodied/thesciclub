import type { OrganizationPlaceDraft } from '@/lib/organization-management';
import type { Organization } from '@/types/domain';

/**
 * An organization's confirmed places, main first. Never its free-text city:
 * that one was not confirmed on its own site, so it is no place to offer.
 */
export function placesOf(organization: Organization): OrganizationPlaceDraft[] {
  return organization.places ?? [];
}

/**
 * Where an organization is, as a line: its main place's city and state,
 * else its own city with the state its site gives (the owner, 2026-10-27).
 */
export function organizationTown(organization: Organization): string {
  const main = placesOf(organization)[0];
  if (main?.city.trim()) {
    return main.state.trim() ? `${main.city.trim()}, ${main.state.trim()}` : main.city.trim();
  }
  const city = organization.city.trim();
  const state = organization.state?.trim() ?? '';
  if (!city || !state || new RegExp(`\\b${state}\\b`).test(city)) return city;
  return `${city}, ${state}`;
}
