import type { OrganizationPlaceDraft } from '@/lib/organization-management';
import type { Organization } from '@/types/domain';

/**
 * An organization's confirmed places, main first. Never its free-text city:
 * that one was not confirmed on its own site, so it is no place to offer.
 */
export function placesOf(organization: Organization): OrganizationPlaceDraft[] {
  return organization.places ?? [];
}
