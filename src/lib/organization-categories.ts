/**
 * What kind of organization each is (20261101030000): a pin's colour and icon
 * on the map, and a row under Types in Layers. Colour and icon together, so
 * telling them apart never rests on colour alone. Not navy or gold, which are
 * events' and members'.
 *
 * `icon` is an outline on a 24 by 24 grid, drawn in white on the map and in the
 * key alike.
 */
export const ORGANIZATION_CATEGORIES = [
  {
    id: 'outdoor',
    label: 'Outdoor adventure',
    color: '#2e7d32',
    icon: 'M3 20 10 7l4 6 2-3 5 10Z',
  },
  {
    id: 'team',
    label: 'Team sports & leagues',
    color: '#795548',
    icon: 'M7 4h10v5a5 5 0 0 1-10 0Z M12 14v4 M8 20h8',
  },
  {
    id: 'multi_sport',
    label: 'Multi-sport programs',
    color: '#e8590c',
    icon: 'M3 12h4l3-8 4 16 3-8h4',
  },
  {
    id: 'hospital',
    label: 'Hospitals & rehab',
    color: '#c62828',
    icon: 'M12 5v14 M5 12h14',
  },
  {
    id: 'gym',
    label: 'Recovery gyms',
    color: '#6a1b9a',
    icon: 'M6.5 6.500v11 M17.500 6.500v11 M3 9v6 M21 9v6 M6.500 12h11',
  },
  {
    id: 'peer',
    label: 'Peer support & community',
    color: '#d81b60',
    icon: 'M12 20s-7-4.500-9-9a4.800 4.800 0 0 1 9-3 4.800 4.800 0 0 1 9 3c-2 4.500-9 9-9 9Z',
  },
  {
    id: 'funding',
    label: 'Funding & research',
    color: '#00838f',
    icon: 'M12 3v18 M17 7c-1-2-9-3-9 1.500S17 12 17 16.500 9 21 8 17',
  },
  {
    id: 'veterans',
    label: 'Veterans',
    color: '#5f6b2e',
    icon: 'M12 3l2.700 5.600 6.100.9-4.400 4.300 1 6.100L12 17l-5.500 2.900 1-6.100L3.200 9.500l6.100-.9Z',
  },
] as const;

export type OrganizationCategory = (typeof ORGANIZATION_CATEGORIES)[number]['id'];

/** The plain pin, of an organization with no type yet. */
export const NO_CATEGORY = 'none';
export const NO_CATEGORY_COLOR = '#3b4252';
