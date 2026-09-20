import { ZodSchema, ZodError } from 'zod';

/**
 * Validation serveur (V3 — cahier §4 « validation serveur », §27 « validation des entrées »).
 *
 * `parseOrThrow(schema, data)` renvoie les données typées ou lève une erreur **400** au format
 * attendu par `errorHandler` (`{ error: 'Validation échouée', details: [...] }`).
 * Les schémas Zod retirent les champs inconnus (comportement `strip` par défaut) : un client ne
 * peut donc jamais glisser un champ interne (ex. `costPrice` sur une route publique, `merchantId`,
 * `status`) dans un corps de requête.
 */
export function parseOrThrow<T>(schema: ZodSchema<T>, data: unknown): T {
  const result = schema.safeParse(data);
  if (result.success) return result.data;
  throw validationError(result.error);
}

export function validationError(err: ZodError) {
  const details = err.errors.map((e) => ({ path: e.path.join('.'), message: e.message, code: e.code }));
  return Object.assign(new Error('Validation échouée'), { status: 400, details, name: 'ValidationError' });
}

/** Coercition sûre d'un paramètre de pagination (`take`/`skip`) : entier borné, jamais NaN. */
export function intParam(value: unknown, fallback: number, opts: { min?: number; max?: number } = {}): number {
  const n = typeof value === 'string' ? parseInt(value, 10) : typeof value === 'number' ? value : NaN;
  if (!Number.isFinite(n)) return fallback;
  const min = opts.min ?? 0;
  const max = opts.max ?? 100;
  return Math.min(Math.max(Math.trunc(n), min), max);
}
