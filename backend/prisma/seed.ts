import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { seedRegions } from '../src/modules/regions/service';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding GawJaay...');

  await seedRegions();
  console.log('Regions seeded');

  const hash = await bcrypt.hash('Password123!', 12);

  // Admin
  const admin = await prisma.user.upsert({
    where: { phone: '+221700000001' },
    update: {},
    create: { phone: '+221700000001', passwordHash: hash, role: 'ADMIN', isPhoneVerified: true, email: 'admin@gawjaay.sn' }
  });

  // Merchant demo
  const merchantUser = await prisma.user.upsert({
    where: { phone: '+221770000001' },
    update: {},
    create: { phone: '+221770000001', passwordHash: hash, role: 'MERCHANT', isPhoneVerified: true, email: 'merchant@demo.sn' }
  });

  let merchant = await prisma.merchant.findUnique({ where: { userId: merchantUser.id } });
  if (!merchant) merchant = await prisma.merchant.create({ data: { userId: merchantUser.id, businessName: 'DEMO Boutique Dakar' } });

  // Client demo
  const clientUser = await prisma.user.upsert({
    where: { phone: '+221760000001' },
    update: {},
    create: { phone: '+221760000001', passwordHash: hash, role: 'CLIENT', isPhoneVerified: true, email: 'client@demo.sn' }
  });

  // Store demo
  let store = await prisma.store.findFirst({ where: { merchantId: merchant.id } });
  if (!store) {
    const dakarRegion = await prisma.region.findFirst({ where: { code: 'DK' } });
    store = await prisma.store.create({
      data: {
        merchantId: merchant.id,
        name: 'DEMO Épicerie Keur Massar',
        slug: 'demo-epicerie-keur-massar',
        description: 'Boutique de démonstration - Dakar',
        category: 'Alimentaire',
        phone: '+221770000001',
        whatsapp: '+221770000001',
        addressText: 'Keur Massar, Dakar',
        quartier: 'Keur Massar',
        latitude: 14.7833,
        longitude: -17.3833,
        deliveryFees: 1000,
        allowPickup: true,
        allowDelivery: true,
        isVerified: true,
      }
    });
  }

  // Categories
  const catAlim = await prisma.category.upsert({ where: { slug: 'alimentaire' }, update: {}, create: { name: 'Alimentaire', slug: 'alimentaire' } });
  const catBoisson = await prisma.category.upsert({ where: { slug: 'boissons' }, update: {}, create: { name: 'Boissons', slug: 'boissons' } });

  // Products demo
  const productsData = [
    { name: 'Riz 25kg', price: 15000, costPrice: 13000, cat: catAlim.id, stock: 20 },
    { name: 'Huile 1L', price: 1200, costPrice: 1000, cat: catAlim.id, stock: 50 },
    { name: 'Sucre 1kg', price: 800, costPrice: 650, cat: catAlim.id, stock: 3 },
    { name: 'Lait en poudre 500g', price: 2500, costPrice: 2000, cat: catAlim.id, stock: 15 },
  ];

  for (const pd of productsData) {
    let prod = await prisma.product.findFirst({ where: { storeId: store.id, name: pd.name } });
    if (!prod) {
      prod = await prisma.product.create({
        data: {
          storeId: store.id,
          name: pd.name,
          slug: pd.name.toLowerCase().replace(/\s+/g,'-')+'-demo',
          price: pd.price,
          costPrice: pd.costPrice,
          categoryId: pd.cat,
          isActive: true,
          isOnline: true,
        }
      });
      await prisma.inventory.create({ data: { storeId: store.id, productId: prod.id, quantity: pd.stock } });
      await prisma.inventoryMovement.create({ data: { storeId: store.id, productId: prod.id, quantity: pd.stock, type: 'INITIAL', reason: 'Seed demo' } });
    }
  }

  // Customer demo
  let customer = await prisma.customer.findFirst({ where: { storeId: store.id, phone: '+221760000001' } });
  if (!customer) {
    customer = await prisma.customer.create({ data: { storeId: store.id, name: 'Client Démo', phone: '+221760000001', address: 'Dakar' } });
  }

  console.log('Seed completed');
  console.log({ admin: admin.phone, merchant: merchantUser.phone, client: clientUser.phone, store: store.slug });
}

main().catch(e=>{ console.error(e); process.exit(1); }).finally(()=>prisma.$disconnect());
