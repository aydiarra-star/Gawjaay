import type { Role } from '@gawjaay/shared';

declare global {
  namespace Express {
    interface Request {
      /** Utilisateur authentifié (posé par le middleware `authenticate`). */
      user?: {
        id: string;
        email: string;
        platformAdmin: boolean;
      };
      /** Contexte d'organisation (posé par `requireOrganization`). */
      auth?: {
        userId: string;
        organizationId: string;
        role: Role;
        permissions: string[];
        storeIds: string[];
      };
    }
  }
}

export {};
