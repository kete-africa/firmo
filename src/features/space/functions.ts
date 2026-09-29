import { createServerFn } from '@tanstack/react-start';
import { getRequest } from '@tanstack/react-start/server';
import { currentMember } from '@/platform/signin';
import { services } from '@/platform/services';

/** Who is in Firmo's web space: signed out, or a member of her organization. */
export const fetchMember = createServerFn({ method: 'GET' }).handler(async () => {
  const member = await currentMember(getRequest());
  if (!member) return { status: 'signed_out' as const };
  const profile = await services().documents.profile({ organizationId: member.organizationId });
  return {
    status: 'member' as const,
    name: member.name,
    organizationName: profile?.name ?? null,
  };
});
