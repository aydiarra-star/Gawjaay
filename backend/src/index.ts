import { env } from './config/env';
import { buildApp } from './app';
import { ensureReferenceData } from './lib/referenceData';

const app = buildApp();

const PORT = env.PORT;
// Référentiel géographique (régions/départements/communes) garanti présent avant d'accepter du trafic.
ensureReferenceData()
  .catch((err) => { console.error('[référentiel] échec du chargement des régions', err); })
  .finally(() => {
    app.listen(PORT, '0.0.0.0', () => {
      console.log(`🚀 GawJaay API running on http://0.0.0.0:${PORT}`);
      console.log(`Frontend allowed: ${env.FRONTEND_URL}`);
    });
  });
