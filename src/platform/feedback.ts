import { createFeedbackHandler } from '@kete/feedback';
import { executorOf } from './events';
import { currentMember } from './signin';
import { inOrganization } from './tenancy';

/**
 * The feedback button of every Kete app (spec 012): what goes wrong, an idea or what works, said
 * by the signed-in person and kept in her organization. Nobody speaks for her: the caller is her
 * session, never the request's body.
 */
export function createFirmoFeedbackHandler(
  memberOf: (request: Request) => Promise<{ organizationId: string; userId: string } | null>,
) {
  return createFeedbackHandler({
    async caller(request) {
      const member = await memberOf(request);
      if (!member) return null;
      return {
        organizationId: member.organizationId,
        actor: { kind: 'person', id: member.userId, channel: 'web' },
      };
    },
    transaction: (organizationId, work) =>
      inOrganization(organizationId, (tx) => work(executorOf(tx))),
  });
}

export const feedbackHandler = createFirmoFeedbackHandler((request) => currentMember(request));
