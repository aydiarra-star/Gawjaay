/**
 * Erreur applicative avec code HTTP et code métier.
 */
export class AppError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: unknown;

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.name = 'AppError';
    this.status = status;
    this.code = code;
    this.details = details;
  }

  static badRequest(message: string, details?: unknown): AppError {
    return new AppError(400, 'BAD_REQUEST', message, details);
  }
  static unauthorized(message = 'Authentification requise'): AppError {
    return new AppError(401, 'UNAUTHORIZED', message);
  }
  static forbidden(message = 'Accès refusé'): AppError {
    return new AppError(403, 'FORBIDDEN', message);
  }
  static notFound(message = 'Ressource introuvable'): AppError {
    return new AppError(404, 'NOT_FOUND', message);
  }
  static conflict(message: string, details?: unknown): AppError {
    return new AppError(409, 'CONFLICT', message, details);
  }
  static tooMany(message = 'Trop de requêtes'): AppError {
    return new AppError(429, 'RATE_LIMITED', message);
  }
  static unavailable(message = 'Service indisponible'): AppError {
    return new AppError(503, 'UNAVAILABLE', message);
  }
}
