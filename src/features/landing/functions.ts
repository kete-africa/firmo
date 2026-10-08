import { createServerFn } from '@tanstack/react-start';
import { FREE_DOCUMENTS, PERIOD_DAYS, PERIOD_DOCUMENTS, PERIOD_PRICE_FCFA } from '@/features/plans';

/**
 * What the landing page needs from the server: where the conversation opens — from Firmo's
 * configuration, never written in the page — the offer's figures, and its own public address.
 */
export const fetchLanding = createServerFn({ method: 'GET' }).handler(() => {
  const whatsapp = process.env.FIRMO_WHATSAPP_NUMBER?.replace(/\D/g, '');
  const telegram = process.env.FIRMO_TELEGRAM_BOT?.replace(/^@/, '');
  return {
    whatsapp: whatsapp ? `https://wa.me/${whatsapp}` : null,
    telegram: telegram ? `https://t.me/${telegram}` : null,
    origin: process.env.FIRMO_URL?.replace(/\/$/, '') ?? null,
    offer: {
      free: FREE_DOCUMENTS,
      documents: PERIOD_DOCUMENTS,
      days: PERIOD_DAYS,
      price: PERIOD_PRICE_FCFA,
    },
  };
});

export type Landing = Awaited<ReturnType<typeof fetchLanding>>;
