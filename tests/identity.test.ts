import { randomBytes } from 'node:crypto';
import { sql } from 'drizzle-orm';
import pg from 'pg';
import { afterAll, describe, expect, it } from 'vitest';
import { createIdentity, normalizePhone, type AccountDirectory } from '@/features/identity';
import { getPool } from '@/platform/db';
import { inOrganization } from '@/platform/tenancy';

// Phase 2: each person who writes is one Compte Kete person and one organization — created once,
// in silence — and never another's.

const run = randomBytes(3).toString('hex');
const digits = () => `2289${String(Math.floor(Math.random() * 1e7)).padStart(7, '0')}`;
const owner = new pg.Pool({ connectionString: process.env.FIRMO_TEST_OWNER_URL, max: 1 });

/** A Compte Kete that remembers numbers, as kete-core spec 013 does. */
let counter = 0;
function fakeDirectory() {
  const people = new Map<string, { personId: string; organizationId: string }>();
  const calls: string[] = [];
  const directory: AccountDirectory = {
    async provisionPerson({ phoneNumber }) {
      calls.push(phoneNumber);
      const known = people.get(phoneNumber);
      if (known) return { ...known, created: false };
      counter += 1;
      const person = {
        personId: `usr_${run}_${counter}`,
        organizationId: `org_id_${run}_${counter}`,
      };
      people.set(phoneNumber, person);
      return { ...person, created: true };
    },
    async signInLink({ personId, returnTo }) {
      return {
        url: `https://compte.test/link?for=${personId}&to=${encodeURIComponent(returnTo)}`,
        expiresAt: '',
      };
    },
  };
  return { directory, calls, people };
}

const created: string[] = [];
afterAll(async () => {
  await owner.query('delete from messaging_identities where organization_id = any($1)', [created]);
  await owner.end();
  await getPool().end();
});

describe('who writes to Firmo', () => {
  it('normalizes numbers as E.164', () => {
    expect(normalizePhone('22890 00 00 00')).toBe('+22890000000');
    expect(normalizePhone('+228 90-00-00-00')).toBe('+22890000000');
    expect(normalizePhone('0900')).toBeNull();
  });

  it('a WhatsApp sender becomes one person and one organization, once', async () => {
    const { directory, calls } = fakeDirectory();
    const identity = createIdentity({ directory, publicUrl: 'https://firmo.test' });
    const number = digits();
    const first = await identity.resolveSender({
      channel: 'whatsapp',
      subject: number,
      displayName: 'Kodjo',
    });
    expect(first).toMatchObject({ status: 'new' });
    if (first.status !== 'new') throw new Error('unexpected');
    created.push(first.organizationId);
    const again = await identity.resolveSender({ channel: 'whatsapp', subject: number });
    expect(again).toEqual({ ...first, status: 'known' });
    expect(calls).toEqual([`+${number}`]);
  });

  it('two numbers are two organizations that never see each other', async () => {
    const { directory } = fakeDirectory();
    const identity = createIdentity({ directory, publicUrl: 'https://firmo.test' });
    const a = await identity.resolveSender({ channel: 'whatsapp', subject: digits() });
    const b = await identity.resolveSender({ channel: 'whatsapp', subject: digits() });
    if (a.status !== 'new' || b.status !== 'new') throw new Error('unexpected');
    created.push(a.organizationId, b.organizationId);
    expect(a.organizationId).not.toBe(b.organizationId);
    const seenByA = await inOrganization(a.organizationId, (tx) =>
      tx.execute(sql`select organization_id from messaging_identities`),
    );
    expect(seenByA.rows).toEqual([{ organization_id: a.organizationId }]);
  });

  it('on Telegram: asks for the number once, and accepts only her own contact', async () => {
    const { directory, calls } = fakeDirectory();
    const identity = createIdentity({ directory, publicUrl: 'https://firmo.test' });
    const userId = `7${Date.now()}`.slice(0, 10);
    expect(await identity.resolveSender({ channel: 'telegram', subject: userId })).toEqual({
      status: 'needs_contact',
    });
    expect(
      await identity.resolveSender({
        channel: 'telegram',
        subject: userId,
        contact: { phoneNumber: digits(), userId: '12345' },
      }),
    ).toEqual({ status: 'refused' });
    const own = await identity.resolveSender({
      channel: 'telegram',
      subject: userId,
      contact: { phoneNumber: digits(), userId },
    });
    expect(own.status).toBe('new');
    if (own.status === 'new') created.push(own.organizationId);
    expect(calls).toHaveLength(1);
  });

  it('opens the web space through a one-time link that lands on Firmo, on a Firmo path only', async () => {
    const { directory } = fakeDirectory();
    const identity = createIdentity({ directory, publicUrl: 'https://firmo.test' });
    const link = await identity.spaceLink('usr_x', '//evil.test');
    const returnTo = new URL(new URL(link.url).searchParams.get('to') ?? '');
    expect(returnTo.origin).toBe('https://firmo.test');
    expect(returnTo.pathname).toBe('/auth/connexion');
    expect(returnTo.searchParams.get('returnTo')).toBe('/espace');
  });
});
