import { PrismaClient } from '@prisma/client';
import { hashPassword } from '../src/lib/password.js';

/**
 * Jeu de DONNÉES DE DÉMONSTRATION.
 *
 * IMPORTANT : toutes les entités créées ici sont explicitement marquées « DEMO »
 * (noms, emails, description). Elles ne doivent JAMAIS être présentées comme des
 * données réelles dans l'interface. Le mot de passe est public et réservé à la démo.
 */
const prisma = new PrismaClient();

const DEMO_PASSWORD = 'Demo1234!';

async function main() {
  const passwordHash = await hashPassword(DEMO_PASSWORD);

  const owner = await prisma.user.upsert({
    where: { email: 'demo.owner@gawjaay.test' },
    update: {},
    create: {
      email: 'demo.owner@gawjaay.test',
      passwordHash,
      fullName: 'DEMO Propriétaire',
      phone: '+221700000001',
    },
  });

  const org = await prisma.organization.upsert({
    where: { slug: 'demo-boutique-gawjaay' },
    update: {},
    create: {
      name: 'DEMO Boutique GawJaay',
      slug: 'demo-boutique-gawjaay',
      description: 'Organisation de DÉMONSTRATION — données fictives à but de test.',
      city: 'Dakar',
      region: 'Dakar',
      activity: 'Commerce de détail (démo)',
    },
  });

  await prisma.membership.upsert({
    where: { organizationId_userId: { organizationId: org.id, userId: owner.id } },
    update: {},
    create: { organizationId: org.id, userId: owner.id, role: 'OWNER' },
  });

  await prisma.subscription.upsert({
    where: { organizationId: org.id },
    update: {},
    create: { organizationId: org.id, plan: 'FREE', status: 'ACTIVE' },
  });

  const store = await prisma.store.upsert({
    where: { slug: 'demo-boutique-dakar' },
    update: {},
    create: {
      organizationId: org.id,
      name: 'DEMO Boutique Dakar',
      slug: 'demo-boutique-dakar',
      description: 'Boutique de démonstration (données fictives).',
      city: 'Dakar',
      region: 'Dakar',
      latitude: 14.6928,
      longitude: -17.4467,
      isPublic: true,
    },
  });

  const category = await prisma.category.upsert({
    where: { organizationId_slug: { organizationId: org.id, slug: 'demo-alimentation' } },
    update: {},
    create: { organizationId: org.id, name: 'DEMO Alimentation', slug: 'demo-alimentation' },
  });

  const product = await prisma.product.upsert({
    where: { organizationId_sku: { organizationId: org.id, sku: 'DEMO-RIZ-001' } },
    update: {},
    create: {
      organizationId: org.id,
      categoryId: category.id,
      name: 'DEMO Riz parfumé 5kg',
      sku: 'DEMO-RIZ-001',
      description: 'Produit de DÉMONSTRATION — données fictives.',
      purchasePrice: 3000,
      price: 4000,
      alertThreshold: 5,
      marketplaceVisible: true,
      variants: {
        create: [{ name: 'DEMO Sac 5kg', sku: 'DEMO-RIZ-001-STD' }],
      },
    },
    include: { variants: true },
  });

  const variant = product.variants[0];
  if (variant) {
    await prisma.inventory.upsert({
      where: { storeId_variantId: { storeId: store.id, variantId: variant.id } },
      update: {},
      create: { storeId: store.id, variantId: variant.id, quantity: 20 },
    });
  }

  // eslint-disable-next-line no-console
  console.log('Seed DEMO terminé.');
  // eslint-disable-next-line no-console
  console.log(`  Compte : demo.owner@gawjaay.test / ${DEMO_PASSWORD}`);
  // eslint-disable-next-line no-console
  console.log('  ⚠️  Données de démonstration uniquement (fictives).');
}

main()
  .catch((err) => {
    // eslint-disable-next-line no-console
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
