import { sql } from 'drizzle-orm';
import { db } from '@/platform/db';
import { inOrganization } from '@/platform/tenancy';
import type { AccountDirectory } from './ports';

/**
 * Who wrote to Firmo. The channel proves the sender; the organization always follows from that
 * proof — never from what a message says (constitution III).
 */
export type SenderProof =
  | { channel: 'whatsapp'; subject: string; displayName?: string | null }
  | {
      channel: 'telegram';
      subject: string;
      displayName?: string | null;
      /** A contact the person shared with Telegram's "share my number" button. */
      contact?: { phoneNumber: string; userId: string } | null;
    };

export type Sender =
  | { status: 'known' | 'new'; organizationId: string; personId: string }
  /** Telegram does not reveal a number: Firmo asks, once, to share it. */
  | { status: 'needs_contact' }
  /** A shared contact that is not the sender's own. */
  | { status: 'refused' };

const E164 = /^\+[1-9]\d{7,14}$/;

/** A number as E.164: "+22890000000". Channels give it with or without "+" and spaces. */
export function normalizePhone(raw: string): string | null {
  const digits = raw.replace(/[\s().-]/g, '');
  const withPlus = digits.startsWith('+') ? digits : `+${digits}`;
  return E164.test(withPlus) ? withPlus : null;
}

export function createIdentity(deps: { directory: AccountDirectory; publicUrl: string }) {
  async function find(channel: string, subject: string) {
    const result = await db.execute(
      sql`select organization_id, person_id from public.find_messaging_identity(${channel}, ${subject})`,
    );
    const row = result.rows[0] as { organization_id: string; person_id: string } | undefined;
    return row ? { organizationId: row.organization_id, personId: row.person_id } : null;
  }

  return {
    async resolveSender(proof: SenderProof): Promise<Sender> {
      const subject = proof.subject.trim();
      const known = await find(proof.channel, subject);
      if (known) {
        await inOrganization(known.organizationId, (tx) =>
          tx.execute(sql`update messaging_identities set last_seen_at = now()
                         where channel = ${proof.channel} and subject = ${subject}`),
        );
        return { status: 'known', ...known };
      }

      let phoneNumber: string | null;
      if (proof.channel === 'whatsapp') {
        // WhatsApp's sender id is the number itself, proven by Meta.
        phoneNumber = normalizePhone(subject);
        if (!phoneNumber) return { status: 'refused' };
      } else {
        if (!proof.contact) return { status: 'needs_contact' };
        // Only her own contact proves her number: Telegram marks it with her user id.
        if (proof.contact.userId !== subject) return { status: 'refused' };
        phoneNumber = normalizePhone(proof.contact.phoneNumber);
        if (!phoneNumber) return { status: 'refused' };
      }

      const name = proof.displayName?.trim() || null;
      const person = await deps.directory.provisionPerson({
        phoneNumber,
        name,
        organizationName: name,
      });
      await inOrganization(person.organizationId, (tx) =>
        tx.execute(sql`
          insert into messaging_identities
            (organization_id, person_id, channel, subject, phone_number, display_name)
          values (${person.organizationId}, ${person.personId}, ${proof.channel}, ${subject},
                  ${phoneNumber}, ${name})
          on conflict (channel, subject) do nothing`),
      );
      // Two first messages at once: whichever identity was stored first is the one.
      const stored = await find(proof.channel, subject);
      if (!stored) throw new Error('messaging identity could not be stored');
      return { status: 'new', ...stored };
    },

    /**
     * A one-time link to Firmo's web space for this person: through the Compte Kete, which signs
     * her in, then Firmo's own sign-in, which always replaces the browser's previous session.
     */
    async spaceLink(
      personId: string,
      path = '/espace',
    ): Promise<{ url: string; expiresAt: string }> {
      const safePath = /^\/(?![/\\])/.test(path) ? path : '/espace';
      const returnTo = `${deps.publicUrl}/auth/connexion?returnTo=${encodeURIComponent(safePath)}`;
      return deps.directory.signInLink({ personId, returnTo });
    },
  };
}

export type Identity = ReturnType<typeof createIdentity>;
