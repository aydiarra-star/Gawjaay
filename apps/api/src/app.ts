import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';
import { MAX_JSON_BODY } from '@gawjaay/shared';
import { env, isTest } from './config/env.js';
import { dbConnected, dbPrepStatus, dbSchemaState } from './lib/db-status.js';
import { errorHandler, notFoundHandler } from './middleware/error.js';
import { requestLogger } from './middleware/logging.js';

import authRoutes from './routes/auth.routes.js';
import organizationRoutes from './routes/organizations.routes.js';
import storeRoutes from './routes/stores.routes.js';
import productRoutes from './routes/products.routes.js';
import categoryRoutes from './routes/categories.routes.js';
import inventoryRoutes from './routes/inventory.routes.js';
import customerRoutes from './routes/customers.routes.js';
import supplierRoutes from './routes/suppliers.routes.js';
import purchaseRoutes from './routes/purchases.routes.js';
import salesRoutes from './routes/sales.routes.js';
import orderRoutes from './routes/orders.routes.js';
import deliveryRoutes from './routes/deliveries.routes.js';
import reportRoutes from './routes/reports.routes.js';
import userRoutes from './routes/users.routes.js';
import subscriptionRoutes from './routes/subscriptions.routes.js';
import auditRoutes from './routes/audit.routes.js';
import paymentRoutes from './routes/payments.routes.js';
import publicRoutes from './routes/public.routes.js';
import clientRoutes from './routes/client.routes.js';
import exportsRoutes from './routes/exports.routes.js';
import phoneRoutes from './routes/phone.routes.js';
import sellerRoutes from './routes/sellers.routes.js';
import listingRoutes from './routes/listings.routes.js';
import flashOfferRoutes from './routes/flash-offers.routes.js';
import { stripeWebhookHandler } from './routes/payments.routes.js';

/** Corps de la sonde de disponibilité : statut du service + état de la base. */
async function healthPayload() {
  const prep = dbPrepStatus();
  return {
    status: 'ok',
    time: new Date().toISOString(),
    database: {
      connected: await dbConnected(),
      schema: dbSchemaState(),
      mode: prep.mode ?? 'unknown',
      ...(prep.detail ? { detail: prep.detail } : {}),
    },
  };
}

export function createApp() {
  const app = express();

  app.set('trust proxy', 1);
  app.use(helmet());
  if (!isTest) app.use(requestLogger);

  // CORS : liste d'origines autorisées (frontend). Cookies acceptés.
  // Une origine inconnue n'obtient simplement pas l'en-tête CORS (pas de 500).
  const allowedOrigins = env.FRONTEND_URL.split(',').map((s) => s.trim()).filter(Boolean);
  app.use(
    cors({
      origin(origin, callback) {
        if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
        return callback(null, false);
      },
      credentials: true,
    }),
  );

  // Stripe exige le corps brut pour vérifier la signature du webhook.
  app.post('/api/v1/payments/stripe/webhook', express.raw({ type: 'application/json' }), (req, res) => void stripeWebhookHandler(req, res));

  // Les photos produit sont transportées en data-URI base64 (bornées à ~700 Ko
  // côté validation) : la limite de corps doit les accueillir sans excès.
  app.use(express.json({ limit: MAX_JSON_BODY }));
  app.use(cookieParser());

  // Limitation globale (cahier §33). Désactivée en test.
  app.use(
    rateLimit({
      windowMs: 60 * 1000,
      limit: 300,
      standardHeaders: true,
      legacyHeaders: false,
      skip: () => isTest,
    }),
  );

  // Sonde de disponibilité (hébergeur). Elle répond TOUJOURS 200 — un conteneur
  // qui démarre en mode dégradé ne doit pas être tué ni faire échouer le
  // déploiement (incident Render du 2026-10-06) — mais elle expose l'état réel
  // de la base pour que ce mode dégradé soit visible et alertable :
  //   database.schema = 'ok' | 'degraded' (migration refusée) | 'unknown'
  app.get('/api/v1/health', (_req, res) => {
    void healthPayload().then((payload) => res.json(payload));
  });

  app.use('/api/v1/auth', authRoutes);
  app.use('/api/v1/organizations', organizationRoutes);
  app.use('/api/v1/stores', storeRoutes);
  app.use('/api/v1/products', productRoutes);
  app.use('/api/v1/categories', categoryRoutes);
  app.use('/api/v1/inventory', inventoryRoutes);
  app.use('/api/v1/customers', customerRoutes);
  app.use('/api/v1/suppliers', supplierRoutes);
  app.use('/api/v1/purchases', purchaseRoutes);
  app.use('/api/v1/sales', salesRoutes);
  app.use('/api/v1/orders', orderRoutes);
  app.use('/api/v1/deliveries', deliveryRoutes);
  app.use('/api/v1/reports', reportRoutes);
  app.use('/api/v1/users', userRoutes);
  app.use('/api/v1/subscriptions', subscriptionRoutes);
  app.use('/api/v1/audit', auditRoutes);
  app.use('/api/v1/payments', paymentRoutes);
  app.use('/api/v1/public', publicRoutes);
  app.use('/api/v1/me', clientRoutes);
  app.use('/api/v1/exports', exportsRoutes);
  app.use('/api/v1/me', phoneRoutes);
  app.use('/api/v1/sellers', sellerRoutes);
  app.use('/api/v1/listings', listingRoutes);
  app.use('/api/v1/flash-offers', flashOfferRoutes);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
