import { manifestHandler } from '@kete/sdk';
import { createFileRoute } from '@tanstack/react-router';
import { manifest } from '@/platform/service';

export const Route = createFileRoute('/.well-known/kete')({
  server: { handlers: { GET: () => manifestHandler(manifest())() } },
});
