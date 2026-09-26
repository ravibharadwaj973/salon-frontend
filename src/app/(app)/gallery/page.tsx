import type { Metadata } from 'next';
import { apiFetchAllowed, apiFetchSafe } from '@/lib/api';
import { PageHeader } from '@/components/ui/display';
import { PermissionGate } from '@/components/permission-gate';
import { PhotoManager, type GalleryData } from './photo-manager';
import type { SessionUser } from '@/lib/types';

export const metadata: Metadata = { title: 'Gallery' };
export const dynamic = 'force-dynamic';

/**
 * THE PHOTOGRAPHS ON THE SALON'S OWN WEBSITE.
 *
 * Its own screen rather than a card buried in Settings, because this is a page
 * somebody comes back to weekly with a handful of pictures from the week — and
 * a thing you do weekly does not belong four tabs into a settings screen.
 *
 * TENANT_MANAGE, not a gallery permission of its own. Publishing photographs
 * under the salon's name is the same kind of decision as what the website says
 * and what the logo is; a separate permission would be one more row in the
 * roles table that every salon sets the same way.
 */
export default async function GalleryPage() {
  const [data, user] = await Promise.all([
    apiFetchAllowed<GalleryData>('/gallery', { query: { includeHidden: 'true' } }),
    apiFetchSafe<SessionUser>('/auth/me', { noBranch: true }),
  ]);

  if (!data) {
    return (
      <PermissionGate
        permission="tenant.manage"
        what="Your website's photographs are restricted."
        backHref="/settings"
        backLabel="Settings"
      />
    );
  }

  const total = data.photos.length;
  const hidden = data.photos.filter((photo) => !photo.isVisible).length;

  return (
    <>
      <PageHeader
        title="Gallery"
        description={
          total === 0
            ? 'Photographs of your work, grouped by service, shown on your own website.'
            : `${total} photograph${total === 1 ? '' : 's'}${hidden > 0 ? `, ${hidden} hidden` : ''} — grouped by service on your website.`
        }
      />
      <PhotoManager data={data} />
      {/* The name is checked, not assumed. A site pointed at one Cloudinary
          account while the app uploads to another renders every picture as a
          404, and neither side can see why. */}
      {user && data.cloudName ? (
        <p className="mt-5 text-2xs text-ink-subtle">
          Uploading to Cloudinary account <span className="font-mono text-ink-muted">{data.cloudName}</span>. Your
          website must be configured with the same one.
        </p>
      ) : null}
    </>
  );
}
