/**
 * The quote the landing page shows: a demonstration document — a fictitious workshop, client and
 * amounts — rendered by Firmo's own renderer, never drawn. Writes its PDF and the image of its
 * first page to `public/landing/`. Run it again when the template changes:
 *
 *   pnpm landing:sample
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath, URL } from 'node:url';
import { Dec, draftSnapshot, renderInput, type DocumentFacts } from '@/features/documents';
import { typstRenderer } from '@/platform/typst';

const dec = (value: string) => new Dec(value);
const line = (
  label: string,
  unit: string,
  quantity: string,
  unitPrice: string,
  position: number,
) => ({
  label,
  unit,
  quantity: dec(quantity),
  unitPrice: dec(unitPrice),
  flatAmount: null,
  position,
});

const facts: DocumentFacts = {
  type: 'quote',
  date: '2026-10-08',
  subject: 'Installation complète d’un système de sécurité',
  client: { name: 'M. Rick', address: 'Agoè, Lomé' },
  validityDays: 30,
  site: 'Tokoin, Lomé',
  delivery: 'Sous 15 jours',
  revision: 1,
  draft: {
    sections: [
      {
        sectionId: 's0',
        title: 'Vidéosurveillance',
        showSubtotal: true,
        position: 0,
        lines: [
          line('Caméra de sécurité', 'unité', '4', '85000', 0),
          line('Enregistreur vidéo', 'unité', '1', '250000', 1),
        ],
      },
      {
        sectionId: 's1',
        title: 'Installation',
        showSubtotal: true,
        position: 1,
        lines: [
          {
            label: 'Pose et configuration',
            unit: null,
            quantity: null,
            unitPrice: null,
            flatAmount: dec('180000'),
            position: 0,
          },
        ],
      },
    ],
    adjustments: [],
    taxRate: dec('18'),
    depositPercent: dec('30'),
    payments: [],
  },
  clauses: [{ title: 'Garantie', body: 'Matériel garanti 12 mois, pose comprise.' }],
  payments: [],
};

const snapshot = draftSnapshot(facts, {
  name: 'ATELIER KODJO',
  trade: 'Chaudronnerie - Soudure',
  phone: '+228 90 00 00 00',
  currency: 'XOF',
  brandColor: '#A8391F',
});
const document = (JSON.parse(snapshot.canonicalJson) as { document: Record<string, unknown> })
  .document;
const input = renderInput(document, { number: 'DEV-2026-041' });
const renderer = typstRenderer();
const createdAt = new Date('2026-10-08T10:00:00Z');
const { pdf } = await renderer.render(input, { createdAt });
const png = await renderer.renderFirstPagePng?.(input, { createdAt, logo: null });
if (!png) throw new Error('This renderer has no first-page image.');

const out = fileURLToPath(new URL('../public/landing/', import.meta.url));
await mkdir(out, { recursive: true });
await writeFile(`${out}devis-exemple.pdf`, pdf);
await writeFile(`${out}devis-exemple.png`, png);
console.log(
  `Total: ${String(document.grand_total)} — ${pdf.length} bytes of PDF written to public/landing/.`,
);
