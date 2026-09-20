/**
 * Seed de démonstration (identique au seedWorld des tests).
 * Usage : npx tsx scripts/seed-demo.ts
 * Ne JAMAIS exécuter sur une base de production — réservé dev/demo/CI.
 */
import db, { bootstrap } from '../src/lib/bootstrap';
import { seedWorld } from '../src/tests/helpers';

bootstrap();
seedWorld(db)
  .then(() => {
    console.log('SEED DEMO OK');
    process.exit(0);
  })
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
