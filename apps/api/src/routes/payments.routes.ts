import { Router } from 'express';
import crypto from 'node:crypto';
import { z } from 'zod';
import { PAYMENT_METHODS, PAYMENT_METHOD_LABELS, isManualSettlementMethod, type PaymentMethod } from '@gawjaay/shared';
import { asyncHandler } from '../lib/asyncHandler.js';
import { AppError } from '../lib/errors.js';
import { env } from '../config/env.js';
import { authenticate } from '../middleware/auth.js';
import { prisma } from '../lib/prisma.js';
import { transitionOrder } from '../services/orders.service.js';

const router = Router();
const stripeReady = () => env.PAYMENTS_MODE === 'stripe' && Boolean(env.STRIPE_SECRET_KEY && env.STRIPE_WEBHOOK_SECRET);

async function stripeRequest<T>(path: string, params?: URLSearchParams, method: 'GET' | 'POST' = 'POST'): Promise<T> {
  if (!env.STRIPE_SECRET_KEY) throw AppError.unavailable('Stripe n’est pas configuré sur GawJaay.');
  const response = await fetch(`https://api.stripe.com/v1/${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${env.STRIPE_SECRET_KEY}`,
      ...(method === 'POST' ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}),
    },
    body: method === 'POST' ? params : undefined,
  });
  const data = await response.json() as T & { error?: { message?: string } };
  if (!response.ok) throw AppError.unavailable(data?.error?.message ?? 'Stripe a refusé la requête.');
  return data;
}

router.get('/capabilities', asyncHandler(async (_req, res) => {
  const online = stripeReady();
  const methods = PAYMENT_METHODS.map((method: PaymentMethod) => ({
    method,
    label: PAYMENT_METHOD_LABELS[method],
    available: isManualSettlementMethod(method) || (method === 'CARD' && online),
    mode: method === 'CARD' && online ? ('online' as const) : isManualSettlementMethod(method) ? ('manual' as const) : ('online' as const),
    provider: method === 'CARD' && online ? 'stripe' : null,
  }));
  res.json({
    onlinePaymentEnabled: online,
    mode: online ? 'stripe' : 'disabled',
    notice: online
      ? 'Carte bancaire en ligne disponible via Stripe. La commande reste pilotée par GawJaay et le stock est confirmé après paiement validé par Stripe.'
      : 'Les règlements espèces, Wave, Orange Money, Free Money, Wizall et crédit restent disponibles. Le paiement carte sera activé dès que Stripe est configuré.',
    methods,
  });
}));

router.post('/stripe/checkout', authenticate, asyncHandler(async (req, res) => {
  if (!stripeReady()) throw AppError.unavailable('Le paiement par carte n’est pas encore activé.');
  if (!req.user) throw AppError.unauthorized();
  const { orderId } = z.object({ orderId: z.string().min(1) }).parse(req.body);

  const order = await prisma.order.findFirst({
    where: { id: orderId, customerUserId: req.user.id },
    include: { items: true, store: true },
  });
  if (!order) throw AppError.notFound('Commande introuvable');
  if (order.status !== 'PENDING') throw AppError.conflict('Cette commande n’attend plus un paiement.');
  if (order.total <= 0) throw AppError.badRequest('Une commande gratuite ne nécessite pas de paiement.');

  const existing = await prisma.orderPayment.findFirst({
    where: { orderId: order.id, method: 'CARD', status: 'PENDING', reference: { not: null } },
    orderBy: { createdAt: 'desc' },
  });
  if (existing?.reference?.startsWith('cs_')) {
    const session = await stripeRequest<{ id: string; url?: string | null }>(`checkout/sessions/${existing.reference}`, undefined, 'GET');
    if (session.url) {
      res.json({ checkoutUrl: session.url, sessionId: session.id, reused: true });
      return;
    }
  }

  const baseUrl = (env.APP_PUBLIC_URL ?? env.FRONTEND_URL.split(',')[0]).replace(/\/$/, '');
  const params = new URLSearchParams();
  params.set('mode', 'payment');
  params.set('success_url', `${baseUrl}/orders/${order.id}?payment=success`);
  params.set('cancel_url', `${baseUrl}/checkout?payment=cancelled`);
  params.set('customer_email', req.user.email);
  params.set('metadata[orderId]', order.id);
  params.set('metadata[organizationId]', order.organizationId);
  params.set('payment_method_types[0]', 'card');
  order.items.forEach((item, index) => {
    params.set(`line_items[${index}][price_data][currency]`, 'xof');
    params.set(`line_items[${index}][price_data][unit_amount]`, String(item.unitPrice));
    params.set(`line_items[${index}][price_data][product_data][name]`, item.name);
    params.set(`line_items[${index}][quantity]`, String(item.quantity));
  });
  if (order.deliveryFee > 0) {
    const i = order.items.length;
    params.set(`line_items[${i}][price_data][currency]`, 'xof');
    params.set(`line_items[${i}][price_data][unit_amount]`, String(order.deliveryFee));
    params.set(`line_items[${i}][price_data][product_data][name]`, 'Livraison');
    params.set(`line_items[${i}][quantity]`, '1');
  }

  const session = await stripeRequest<{ id: string; url?: string | null }>('checkout/sessions', params);
  if (!session.url) throw AppError.unavailable('Stripe n’a pas fourni de page de paiement.');

  await prisma.orderPayment.create({
    data: { orderId: order.id, amount: order.total, method: 'CARD', status: 'PENDING', reference: session.id },
  });
  res.status(201).json({ checkoutUrl: session.url, sessionId: session.id });
}));

function verifyStripeSignature(rawBody: Buffer, signature: string): boolean {
  if (!env.STRIPE_WEBHOOK_SECRET) return false;
  const parts = Object.fromEntries(signature.split(',').map((part) => {
    const [key, value] = part.split('=');
    return [key, value];
  }));
  if (!parts.t || !parts.v1) return false;
  const timestamp = Number(parts.t);
  if (!Number.isFinite(timestamp) || Math.abs(Date.now() / 1000 - timestamp) > 300) return false;
  const expected = crypto.createHmac('sha256', env.STRIPE_WEBHOOK_SECRET).update(`${parts.t}.${rawBody.toString('utf8')}`).digest('hex');
  const a = Buffer.from(expected, 'utf8');
  const b = Buffer.from(parts.v1, 'utf8');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export async function stripeWebhookHandler(req: import('express').Request, res: import('express').Response) {
  const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.from('');
  const signature = req.header('stripe-signature');
  if (!signature || !verifyStripeSignature(rawBody, signature)) {
    res.status(400).json({ error: { code: 'INVALID_STRIPE_SIGNATURE', message: 'Signature Stripe invalide.' } });
    return;
  }

  let event: any;
  try {
    event = JSON.parse(rawBody.toString('utf8'));
  } catch {
    res.status(400).json({ error: { code: 'INVALID_STRIPE_EVENT', message: 'Événement Stripe invalide.' } });
    return;
  }

  if (event.type === 'checkout.session.completed' || event.type === 'checkout.session.async_payment_succeeded') {
    const session = event.data?.object;
    const orderId = session?.metadata?.orderId;
    if (orderId && session?.payment_status === 'paid') {
      await prisma.$transaction(async (tx) => {
        const order = await tx.order.findUnique({ where: { id: orderId }, include: { items: true } });
        if (!order) return;
        const payment = await tx.orderPayment.findFirst({ where: { orderId, reference: session.id } });
        if (payment) {
          await tx.orderPayment.update({ where: { id: payment.id }, data: { status: 'SUCCESSFUL', reference: session.id } });
        } else {
          await tx.orderPayment.create({ data: { orderId, amount: order.total, method: 'CARD', status: 'SUCCESSFUL', reference: session.id } });
        }
        if (order.status === 'PENDING') {
          await transitionOrder(tx, order.organizationId, order.id, 'CONFIRMED', null, 'Paiement Stripe confirmé');
        }
      });
    }
  }

  if (event.type === 'checkout.session.expired' || event.type === 'checkout.session.async_payment_failed') {
    const session = event.data?.object;
    if (session?.id) {
      await prisma.orderPayment.updateMany({ where: { reference: session.id, method: 'CARD', status: 'PENDING' }, data: { status: 'FAILED' } });
    }
  }

  res.json({ received: true });
}

router.post('/charge', asyncHandler(async () => {
  throw AppError.unavailable('Utilisez le parcours de paiement Stripe ou un règlement manuel (Wave / Orange Money / Free Money / Wizall / espèces).');
}));

export default router;
