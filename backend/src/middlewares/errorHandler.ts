import { Request, Response, NextFunction } from 'express';

export function errorHandler(err: any, req: Request, res: Response, next: NextFunction) {
  console.error(err);
  if (err.name === 'ZodError') {
    return res.status(400).json({ error: 'Validation échouée', details: err.errors });
  }
  const status = err.status || 500;
  res.status(status).json({ error: err.message || 'Erreur interne serveur' });
}
