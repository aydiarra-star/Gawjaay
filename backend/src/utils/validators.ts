import { z } from 'zod';

export const phoneSchema = z.string().min(8).max(20).regex(/^\+?[0-9\s-]+$/);
export const passwordSchema = z.string().min(8).max(100);

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

export const storeCreateSchema = z.object({
  name: z.string().min(2).max(100),
  description: z.string().optional(),
  category: z.string().optional(),
  phone: z.string().optional(),
  whatsapp: z.string().optional(),
  addressText: z.string().optional(),
  region: z.string().optional(),
  city: z.string().optional(),
  quartier: z.string().optional(),
  latitude: z.number().optional(),
  longitude: z.number().optional(),
  deliveryFees: z.number().optional(),
  allowPickup: z.boolean().optional(),
  allowDelivery: z.boolean().optional(),
});

export const productCreateSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().optional(),
  price: z.number().positive(),
  costPrice: z.number().optional(),
  categoryId: z.string().optional(),
  sku: z.string().optional(),
  barcode: z.string().optional(),
  unit: z.string().optional(),
  lowStockThreshold: z.number().int().optional(),
  isOnline: z.boolean().optional(),
  initialStock: z.number().optional(),
  images: z.array(z.string()).optional(),
  variants: z.any().optional(),
});

export const saleCreateSchema = z.object({
  storeId: z.string(),
  customerId: z.string().optional(),
  items: z.array(z.object({
    productId: z.string(),
    quantity: z.number().positive(),
    unitPrice: z.number().optional(),
  })).min(1),
  discount: z.number().min(0).optional(),
  paymentMethod: z.enum(['CASH','WAVE','ORANGE_MONEY','CARD','CREDIT']).optional(),
  amountPaid: z.number().optional(),
  notes: z.string().optional(),
});

export const orderCreateSchema = z.object({
  storeId: z.string(),
  items: z.array(z.object({
    productId: z.string(),
    quantity: z.number().positive(),
  })).min(1),
  addressId: z.string().optional(),
  deliveryType: z.enum(['LIVRAISON','RETRAIT']).optional(),
  notes: z.string().optional(),
});

export const customerCreateSchema = z.object({
  storeId: z.string(),
  name: z.string().min(1),
  phone: z.string().min(5),
  email: z.string().email().optional(),
  address: z.string().optional(),
});
