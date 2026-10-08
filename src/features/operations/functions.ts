import { createServerFn } from '@tanstack/react-start';
import { getRequest } from '@tanstack/react-start/server';
import { env } from '@/platform/env';
import { services } from '@/platform/services';
import { currentMember } from '@/platform/signin';
import { checkOperator } from './domain';

/** Who opens the operator space: signed out, refused (and why), or a Kete operator. */
export const fetchOperator = createServerFn({ method: 'GET' }).handler(async () => {
  const signedIn = await currentMember(getRequest());
  if (!signedIn) return { status: 'signed_out' as const };
  const check = checkOperator(signedIn, env.operatorsOrganizationId);
  if (check.status === 'refused') return check;
  return { status: 'operator' as const, name: signedIn.name };
});

/** Incidents and the journal — for an operator only, checked again on the server. */
export const fetchOperations = createServerFn({ method: 'GET' }).handler(async () => {
  const signedIn = await currentMember(getRequest());
  if (!signedIn || checkOperator(signedIn, env.operatorsOrganizationId).status !== 'operator') {
    throw new Error('not_an_operator');
  }
  const { operations } = services();
  const [incidents, journal, feedback] = await Promise.all([
    operations.incidents(),
    operations.journal(),
    operations.feedback(),
  ]);
  return { incidents, journal, feedback };
});
