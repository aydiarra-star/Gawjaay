import { z } from 'zod';

/**
 * Schémas de validation serveur (Zod). V3 : appliqués sur TOUTES les écritures via
 * `lib/validate.ts#parseOrThrow`. Les champs inconnus sont retirés (strip) — un client ne peut
 * jamais injecter un champ interne (merchantId, status, costPrice public, etc.).
 */

export const phoneSchema = z.string().min(8).max(20).regex(/^\+?[0-9\s-]+$/);
export const passwordSchema = z.string().min(8).max(100);
const idSchema = z.string().min(1).max(64);
const money = z.number().finite().min(0).max(1e12);
const qty = z.number().finite().positive().max(1e9);
const shortText = z.string().max(200);
const longText = z.string().max(2000);
const isoDate = z.string().refine((s) => !Number.isNaN(Date.parse(s)), { message: 'Date invalide' });

export const registerSchema = z.object({
  phone: phoneSchema,
  password: passwordSchema,
  email: z.string().email().optional(),
  role: z.enum(['CLIENT','MERCHANT']).optional(),
  name: z.string().min(1).max(100).optional(),
});

export const loginSchema = z.object({
  phone: phoneSchema,
  password: z.string().min(1),
});

export const changePasswordSchema = z.object({
  oldPassword: z.string().min(1).max(100),
  newPassword: passwordSchema,
});

// ---------- Boutiques ----------
const openingHoursSchema = z.union([z.string().max(2000), z.record(z.any())]);

export const storeCreateSchema = z.object({
  name: z.string().min(2).max(100),
  description: longText.optional(),
  category: shortText.optional(),
  phone: phoneSchema.optional(),
  whatsapp: phoneSchema.optional(),
  email: z.string().email().optional(),
  addressText: shortText.optional(),
  regionId: idSchema.optional(),
  departmentId: idSchema.optional(),
  communeId: idSchema.optional(),
  quartier: shortText.optional(),
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
  deliveryFees: money.optional(),
  deliveryDelayMinutes: z.number().int().min(0).max(10080).optional(),
  deliveryZones: z.union([z.string().max(2000), z.array(z.string().max(100)).max(50)]).optional(),
  allowPickup: z.boolean().optional(),
  allowDelivery: z.boolean().optional(),
  openingHours: openingHoursSchema.optional(),
  logoUrl: z.string().max(500).optional(),
});

export const storeUpdateSchema = storeCreateSchema.partial().extend({
  physicalStatus: z.enum(['OPEN','CLOSED']).optional(),
  digitalStatus: z.enum(['OPEN','CLOSED']).optional(),
  paymentMethods: z.array(z.enum(['CASH','WAVE','ORANGE_MONEY','CARD','CREDIT'])).max(5).optional(),
  // null explicite autorisé pour effacer un champ optionnel
  regionId: idSchema.nullable().optional(),
  departmentId: idSchema.nullable().optional(),
  communeId: idSchema.nullable().optional(),
  latitude: z.number().min(-90).max(90).nullable().optional(),
  longitude: z.number().min(-180).max(180).nullable().optional(),
  logoUrl: z.string().max(500).nullable().optional(),
  email: z.string().email().nullable().optional(),
});

// ---------- Produits ----------
export const productCreateSchema = z.object({
  name: z.string().min(1).max(200),
  description: longText.optional(),
  price: z.number().finite().positive().max(1e12),
  costPrice: money.optional(),
  categoryId: idSchema.nullable().optional(),
  sku: z.string().max(64).optional(),
  barcode: z.string().max(64).optional(),
  unit: z.string().max(20).optional(),
  lowStockThreshold: z.number().int().min(0).max(1e9).optional(),
  stockMax: z.number().int().min(0).max(1e9).optional(),
  isOnline: z.boolean().optional(),
  initialStock: z.number().finite().min(0).max(1e9).optional(),
  images: z.array(z.string().max(500)).max(10).optional(),
  variants: z.any().optional(),
});

export const productUpdateSchema = productCreateSchema.omit({ initialStock: true }).partial().extend({
  isActive: z.boolean().optional(),
  sku: z.string().max(64).nullable().optional(),
  barcode: z.string().max(64).nullable().optional(),
});

// ---------- Stock ----------
/** Types de mouvements (PROJECT_RULES §3). SALE / ONLINE_ORDER sont émis par le serveur uniquement. */
export const STOCK_MOVEMENT_TYPES = ['SALE','ONLINE_ORDER','PURCHASE_RECEIPT','ADJUSTMENT','RETURN','INITIAL'] as const;
export const MANUAL_STOCK_MOVEMENT_TYPES = ['ADJUSTMENT','PURCHASE_RECEIPT','RETURN','INITIAL'] as const;
/** Alias tolérés en entrée (anciens clients / libellés courants) → type canonique. */
const STOCK_TYPE_ALIASES: Record<string, (typeof MANUAL_STOCK_MOVEMENT_TYPES)[number]> = {
  IN: 'ADJUSTMENT', OUT: 'ADJUSTMENT', ENTREE: 'ADJUSTMENT', SORTIE: 'ADJUSTMENT', AJUSTEMENT: 'ADJUSTMENT',
  RECEPTION: 'PURCHASE_RECEIPT', PURCHASE: 'PURCHASE_RECEIPT', RETOUR: 'RETURN', LOSS: 'ADJUSTMENT', PERTE: 'ADJUSTMENT',
};
export const stockMovementTypeSchema = z.preprocess(
  (v) => (typeof v === 'string' ? (STOCK_TYPE_ALIASES[v.trim().toUpperCase()] ?? v.trim().toUpperCase()) : v),
  z.enum(MANUAL_STOCK_MOVEMENT_TYPES),
);
export const stockAdjustSchema = z.object({
  productId: idSchema,
  quantity: z.number().finite().refine((n) => n !== 0, { message: 'Quantité nulle' }).refine((n) => Math.abs(n) <= 1e9, { message: 'Quantité hors limites' }),
  type: stockMovementTypeSchema.optional(),
  reason: z.string().max(500).optional(),
});

// ---------- Ventes ----------
export const saleCreateSchema = z.object({
  customerId: idSchema.optional(),
  clientUserId: idSchema.optional(),
  items: z.array(z.object({
    productId: idSchema,
    quantity: qty,
    unitPrice: money.optional(),
  })).min(1).max(200),
  discount: money.optional(),
  couponCode: z.string().max(64).optional(),
  paymentMethod: z.enum(['CASH','WAVE','ORANGE_MONEY','CARD','CREDIT']).optional(),
  amountPaid: money.optional(),
  notes: longText.optional(),
});

// ---------- Commandes ----------
export const orderCreateSchema = z.object({
  storeId: idSchema,
  items: z.array(z.object({
    productId: idSchema,
    quantity: qty,
  })).min(1).max(200),
  addressId: idSchema.optional(),
  addressText: shortText.optional(),
  deliveryType: z.enum(['LIVRAISON','RETRAIT']).optional(),
  couponCode: z.string().max(64).optional(),
  pointsToUse: z.number().int().min(0).max(1e9).optional(),
  notes: longText.optional(),
});

/** Statuts canoniques (stockés) + alias anglais du cahier des charges §18. */
export const ORDER_STATUS_ALIASES: Record<string, string> = {
  PENDING: 'EN_ATTENTE',
  CONFIRMED: 'CONFIRMEE',
  PREPARING: 'EN_PREPARATION',
  READY: 'PRETE',
  OUT_FOR_DELIVERY: 'EN_LIVRAISON',
  DELIVERED: 'LIVREE',
  CANCELLED: 'ANNULEE',
  REJECTED: 'REJETEE',
  RETURNED: 'RETOURNEE',
};
export const ORDER_STATUSES = ['EN_ATTENTE','CONFIRMEE','EN_PREPARATION','PRETE','EN_LIVRAISON','LIVREE','ANNULEE','REJETEE','RETOURNEE'] as const;

export const orderStatusSchema = z.object({
  status: z.string().min(1).max(30).transform((s) => s.toUpperCase().trim()).transform((s) => ORDER_STATUS_ALIASES[s] || s)
    .refine((s) => (ORDER_STATUSES as readonly string[]).includes(s), { message: 'Statut de commande inconnu' }),
  reason: z.string().max(500).optional(),
});

// ---------- Clients ----------
export const customerCreateSchema = z.object({
  storeId: idSchema,
  name: z.string().min(1).max(100),
  phone: phoneSchema,
  email: z.string().email().optional(),
  address: shortText.optional(),
  notes: longText.optional(),
});
export const customerUpdateSchema = customerCreateSchema.omit({ storeId: true }).partial();

// ---------- Dettes ----------
export const debtPaySchema = z.object({
  amount: z.number().finite().positive().max(1e12),
  method: z.enum(['CASH','WAVE','ORANGE_MONEY','CARD']).optional(),
  notes: longText.optional(),
});
export const debtCreateSchema = z.object({
  customerId: idSchema,
  totalAmount: z.number().finite().positive().max(1e12),
  paidAmount: money.optional(),
  dueDate: isoDate.optional(),
  notes: longText.optional(),
});

// ---------- Fournisseurs ----------
export const supplierCreateSchema = z.object({
  name: z.string().min(1).max(100),
  phone: phoneSchema.optional(),
  email: z.string().email().optional(),
  address: shortText.optional(),
  notes: longText.optional(),
});
export const supplierUpdateSchema = supplierCreateSchema.partial();
export const purchaseReceiveSchema = z.object({
  storeId: idSchema,
  notes: longText.optional(),
  items: z.array(z.object({
    productId: idSchema,
    quantity: qty,
    unitPrice: money,
  })).min(1).max(200),
});

// ---------- Dépenses ----------
export const expenseCreateSchema = z.object({
  category: z.string().min(1).max(60),
  amount: z.number().finite().positive().max(1e12),
  description: longText.optional(),
  date: isoDate.optional(),
});

// ---------- Employés ----------
/** Ressources/permissions configurables par le commerçant (cahier §5 EMPLOYEE). */
export const EMPLOYEE_RESOURCES = ['sales','stock','orders','customers','products','cash','promotions','coupons','deliveries','expenses','suppliers','reports'] as const;
export const permissionSchema = z.string().regex(/^(\*|[a-z]+):(\*|[a-z]+)$/, 'Permission au format resource:action');
export const employeeCreateSchema = z.object({
  phone: phoneSchema,
  password: passwordSchema,
  roleLabel: z.string().min(1).max(60),
  permissions: z.array(permissionSchema).max(60).default([]),
});
export const employeePermissionsSchema = z.object({
  permissions: z.array(permissionSchema).max(60),
});

// ---------- Catégories ----------
export const categorySchema = z.object({
  name: z.string().min(1).max(60),
  parentId: idSchema.nullable().optional(),
});

// ---------- Livraisons (legacy V1) ----------
export const DELIVERY_STATUSES = ['A_PREPARER','PRET','EN_LIVRAISON','LIVRE','ANNULE','ECHEC'] as const;
export const deliveryStatusSchema = z.object({
  status: z.enum(DELIVERY_STATUSES),
  proofUrl: z.string().max(500).optional(),
});
