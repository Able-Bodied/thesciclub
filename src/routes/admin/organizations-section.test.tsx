import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { OrganizationsSection } from '@/routes/admin/organizations-section';
import type { Organization } from '@/types/domain';

const db = vi.hoisted(() => ({
  organizations: [] as Organization[],
  rpc: vi.fn(),
  reload: vi.fn(),
  failure: null as string | null,
  logoFailure: null as string | null,
  uploads: [] as string[],
  removed: [] as string[],
}));
vi.mock('@/lib/organizations', () => ({
  useOrganizations: () => ({
    organizations: db.organizations,
    loading: false,
    error: null,
    reload: db.reload,
  }),
}));
vi.mock('@/lib/supabase', () => ({
  getSupabase: () => ({
    rpc: (name: string, args: Record<string, unknown>) => {
      db.rpc(name, args);
      if (db.failure) return Promise.resolve({ data: null, error: { message: db.failure } });
      if (name === 'admin_remove_organization')
        db.organizations = db.organizations.filter(
          (organization) => organization.id !== args.organization,
        );
      if (name === 'save_organization')
        return Promise.resolve({ data: args.organization ?? 'created', error: null });
      if (name === 'set_organization_logo') {
        if (db.logoFailure)
          return Promise.resolve({ data: null, error: { message: db.logoFailure } });
        const found = db.organizations.find((o) => o.id === args.organization);
        return Promise.resolve({ data: found?.logoPath ?? null, error: null });
      }
      return Promise.resolve({ data: null, error: null });
    },
    storage: {
      from: (bucket: string) => ({
        upload: (path: string) => {
          db.uploads.push(`${bucket}:${path}`);
          return Promise.resolve({ error: null });
        },
        remove: (paths: string[]) => {
          db.removed.push(...paths);
          return Promise.resolve({ error: null });
        },
      }),
    },
  }),
}));
// Signing a URL is the network; the picture's path stands in for it.
vi.mock('@/lib/photos', () => ({
  PHOTOS_BUCKET: 'photos',
  usePhotoUrl: (path: string | null | undefined) => (path ? `signed:${path}` : null),
}));
// Resizing needs a canvas jsdom does not have.
vi.mock('@/lib/image', () => ({
  preparePhoto: (file: File) => Promise.resolve({ blob: file, ext: 'png' }),
}));
const organization = (id = 'org'): Organization => ({
  id,
  name: `Organization ${id}`,
  shortCode: 'ORG',
  city: 'Test city',
  description: 'About the organization',
  tags: ['Support'],
  canInvite: true,
  logoPath: null,
});
const scrolled = vi.fn();
beforeEach(() => {
  db.organizations = [organization(), organization('other')];
  db.rpc.mockClear();
  db.reload.mockClear();
  db.failure = null;
  db.logoFailure = null;
  db.uploads = [];
  db.removed = [];
  URL.createObjectURL = vi.fn(() => 'blob:chosen');
  URL.revokeObjectURL = vi.fn();
  Element.prototype.scrollIntoView = scrolled;
  scrolled.mockClear();
});

const png = () => new File(['logo'], 'logo.png', { type: 'image/png' });
const uploaded = /^photos:organizations\/org\/[0-9a-f-]{36}\.png$/;
describe('organization management', () => {
  it('adds an organization through the protected RPC and refreshes the directory', async () => {
    render(<OrganizationsSection />);
    await userEvent.click(screen.getByRole('button', { name: 'Add organization' }));
    await userEvent.type(screen.getByLabelText('Organization name'), 'New organization');
    await userEvent.type(screen.getByLabelText(/Short code/), 'new');
    await userEvent.type(screen.getByLabelText('City or region'), 'Test region');
    await userEvent.type(screen.getByLabelText(/Tags/), 'Events, Support');
    await userEvent.click(screen.getByRole('button', { name: 'Save organization' }));
    await waitFor(() => {
      expect(db.rpc).toHaveBeenCalledWith(
        'save_organization',
        expect.objectContaining({
          organization: null,
          name: 'New organization',
          short_code: 'NEW',
          city: 'Test region',
          tags: ['Events', 'Support'],
          can_invite: true,
        }),
      );
    });
    expect(db.reload).toHaveBeenCalled();
  });
  it('edits the selected organization and preserves its identity', async () => {
    render(<OrganizationsSection />);
    await userEvent.click(screen.getByRole('button', { name: 'Edit Organization org' }));
    await userEvent.clear(screen.getByLabelText('Organization name'));
    await userEvent.type(screen.getByLabelText('Organization name'), 'Renamed organization');
    await userEvent.click(screen.getByRole('button', { name: 'Save organization' }));
    await waitFor(() => {
      expect(db.rpc).toHaveBeenCalledWith(
        'save_organization',
        expect.objectContaining({ organization: 'org', name: 'Renamed organization' }),
      );
    });
  });
  it('requires a concrete remove confirmation, then refreshes links and directory', async () => {
    const changed = vi.fn();
    render(<OrganizationsSection onChange={changed} />);
    await userEvent.click(screen.getByRole('button', { name: 'Remove Organization org' }));
    expect(db.rpc).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: 'Remove organization' }));
    await waitFor(() => {
      expect(db.rpc).toHaveBeenCalledWith('admin_remove_organization', { organization: 'org' });
    });
    expect(changed).toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: 'Edit Organization org' })).toBeNull();
  });
  it('offers an organization account only its linked entries, without add/remove or vouching controls', async () => {
    render(<OrganizationsSection administrator={false} ids={new Set(['org'])} />);
    expect(screen.queryByText('Organization other')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Add organization' })).toBeNull();
    expect(screen.queryByRole('button', { name: /^Remove / })).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Edit Organization org' }));
    expect(screen.queryByRole('checkbox')).toBeNull();
  });
  it('retains the draft when the database refuses a changed role', async () => {
    db.failure = 'You cannot change this organization.';
    render(<OrganizationsSection />);
    await userEvent.click(screen.getByRole('button', { name: 'Edit Organization org' }));
    await userEvent.type(screen.getByLabelText('Description'), ' Updated.');
    await userEvent.click(screen.getByRole('button', { name: 'Save organization' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(db.failure);
    expect(screen.getByLabelText('Description')).toHaveValue('About the organization Updated.');
    expect(db.reload).not.toHaveBeenCalled();
  });
});

describe('an organization’s logo', () => {
  it('brings the form into view when Edit is pressed far down the list', async () => {
    render(<OrganizationsSection />);
    await userEvent.click(screen.getByRole('button', { name: 'Edit Organization other' }));
    expect(scrolled).toHaveBeenCalledWith(expect.objectContaining({ block: 'start' }));
    expect(screen.getByRole('heading', { name: 'Edit Organization other' })).toHaveFocus();
  });

  it('uploads the chosen picture into the organization’s folder on Save, and not before', async () => {
    render(<OrganizationsSection />);
    await userEvent.click(screen.getByRole('button', { name: 'Edit Organization org' }));
    await userEvent.upload(screen.getByLabelText('Choose a logo'), png());
    expect(screen.getByRole('img', { name: 'The logo you chose' })).toHaveAttribute(
      'src',
      'blob:chosen',
    );
    expect(db.uploads).toEqual([]);
    await userEvent.click(screen.getByRole('button', { name: 'Save organization' }));
    await waitFor(() => {
      expect(db.uploads).toHaveLength(1);
    });
    expect(db.uploads[0]).toMatch(uploaded);
    expect(db.rpc).toHaveBeenCalledWith('set_organization_logo', {
      organization: 'org',
      logo_path: db.uploads[0]?.replace('photos:', ''),
    });
  });

  it('gives a new organization its logo once it has an id', async () => {
    render(<OrganizationsSection />);
    await userEvent.click(screen.getByRole('button', { name: 'Add organization' }));
    await userEvent.type(screen.getByLabelText('Organization name'), 'New organization');
    await userEvent.type(screen.getByLabelText(/Short code/), 'new');
    await userEvent.type(screen.getByLabelText('City or region'), 'Test region');
    await userEvent.upload(screen.getByLabelText('Choose a logo'), png());
    await userEvent.click(screen.getByRole('button', { name: 'Save organization' }));
    await waitFor(() => {
      expect(db.uploads[0]).toMatch(/^photos:organizations\/created\//);
    });
  });

  it('deletes the logo it replaced from the organization’s folder', async () => {
    db.organizations = [{ ...organization(), logoPath: 'organizations/org/old.webp' }];
    render(<OrganizationsSection />);
    await userEvent.click(screen.getByRole('button', { name: 'Edit Organization org' }));
    await userEvent.upload(screen.getByLabelText('Change logo'), png());
    await userEvent.click(screen.getByRole('button', { name: 'Save organization' }));
    await waitFor(() => {
      expect(db.removed).toEqual(['organizations/org/old.webp']);
    });
  });

  it('leaves a seeded logo outside the folder alone', async () => {
    db.organizations = [{ ...organization(), logoPath: 'organizations/ncs.webp' }];
    render(<OrganizationsSection />);
    await userEvent.click(screen.getByRole('button', { name: 'Edit Organization org' }));
    await userEvent.upload(screen.getByLabelText('Change logo'), png());
    await userEvent.click(screen.getByRole('button', { name: 'Save organization' }));
    await waitFor(() => {
      expect(db.uploads).toHaveLength(1);
    });
    expect(db.removed).toEqual([]);
  });

  it('takes a logo away on Save, and can be talked out of it first', async () => {
    db.organizations = [{ ...organization(), logoPath: 'organizations/org/old.webp' }];
    render(<OrganizationsSection />);
    await userEvent.click(screen.getByRole('button', { name: 'Edit Organization org' }));
    await userEvent.click(screen.getByRole('button', { name: 'Remove logo' }));
    await userEvent.click(screen.getByRole('button', { name: 'Keep the logo' }));
    expect(screen.getByRole('img', { name: 'Organization org logo' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Remove logo' }));
    await userEvent.click(screen.getByRole('button', { name: 'Save organization' }));
    await waitFor(() => {
      expect(db.rpc).toHaveBeenCalledWith('set_organization_logo', {
        organization: 'org',
        logo_path: null,
      });
    });
    expect(db.uploads).toEqual([]);
    await waitFor(() => {
      expect(db.removed).toEqual(['organizations/org/old.webp']);
    });
  });

  it('refuses a drawing, which can carry script', async () => {
    render(<OrganizationsSection />);
    await userEvent.click(screen.getByRole('button', { name: 'Edit Organization org' }));
    const svg = new File(['<svg/>'], 'logo.svg', { type: 'image/svg+xml' });
    await userEvent.upload(screen.getByLabelText('Choose a logo'), svg, { applyAccept: false });
    expect(screen.getByRole('alert')).toHaveTextContent('Choose a PNG, JPEG or WebP picture.');
    expect(screen.queryByRole('img', { name: 'The logo you chose' })).toBeNull();
  });

  it('says so when the words saved and the logo did not, and deletes the stray upload', async () => {
    db.logoFailure = 'That picture is not in this organization’s folder.';
    render(<OrganizationsSection />);
    await userEvent.click(screen.getByRole('button', { name: 'Edit Organization org' }));
    await userEvent.upload(screen.getByLabelText('Choose a logo'), png());
    await userEvent.click(screen.getByRole('button', { name: 'Save organization' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      /Organization org was saved, but its logo was not: That picture is not/,
    );
    expect(db.removed).toHaveLength(1);
    expect(db.reload).toHaveBeenCalled();
  });
});
