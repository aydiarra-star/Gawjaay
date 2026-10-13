import { useLocation } from 'react-router-dom';
import { Alert } from './ui';

interface SignupState {
  accountCreated?: boolean;
  accountType?: 'BUSINESS' | 'INDIVIDUAL';
}

/**
 * Confirmation affichée juste après une inscription réussie.
 *
 * L'état vient de la navigation déclenchée par `RegisterPage` : il n'est affiché
 * que si le serveur a réellement créé le compte (aucun message de réussite
 * inventé). Les deux parcours d'inscription sont couverts : espace de gestion
 * (boutique) et espace vendeur (particulier).
 */
export function SignupSuccess() {
  const location = useLocation();
  const state = (location.state ?? null) as SignupState | null;
  if (!state?.accountCreated) return null;

  return (
    <Alert kind="success">
      {state.accountType === 'INDIVIDUAL'
        ? 'Votre compte particulier est créé. Publiez votre première annonce depuis votre espace vendeur.'
        : 'Votre compte est créé : votre boutique est prête. Ajoutez vos produits pour commencer à vendre.'}
    </Alert>
  );
}
