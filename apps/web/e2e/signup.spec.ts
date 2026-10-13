import { expect, test } from '@playwright/test';

/**
 * Parcours d'inscription complet, exercé via l'interface réelle contre l'API
 * réelle (desktop ET mobile).
 *
 * Ces tests couvrent la régression bloquante : le formulaire « Particulier »
 * n'affiche ni entreprise ni boutique, mais envoyait ces deux champs en chaînes
 * vides ; la validation serveur (`min(2)`) refusait alors la requête en 400 et
 * le compte n'était jamais créé — sans message exploitable pour l'utilisateur.
 */

const API = 'http://localhost:4000/api/v1';

function unique(prefix: string): string {
  return `${prefix}.${Date.now()}.${Math.floor(Math.random() * 10_000)}@gawjaay.test`;
}

test.describe('inscription — parcours complet', () => {
  test('compte particulier : le compte est réellement créé et l’espace vendeur s’ouvre', async ({ page }) => {
    const email = unique('particulier');

    await page.goto('/register');

    // Profil « particulier » : ni entreprise ni boutique ne sont demandées.
    await page.getByRole('button', { name: 'Particulier' }).click();
    await expect(page.getByLabel("Nom de l'entreprise")).toBeHidden();

    await page.getByLabel('Nom complet').fill('Awa Ndiaye');
    await page.getByLabel('Téléphone (optionnel)').fill('77 123 45 67');
    await page.getByLabel('Email').fill(email);
    await page.getByLabel('Mot de passe (8 caractères minimum)').fill('Password123!');
    await page.getByLabel('Ville (optionnel)').fill('Dakar');
    await page.getByRole('button', { name: 'Créer mon compte' }).click();

    // Redirection vers l'espace vendeur + confirmation de création de compte.
    await expect(page).toHaveURL(/\/seller$/);
    await expect(page.getByText('Votre compte particulier est créé.')).toBeVisible();
    await expect(page.getByText('Mon espace vendeur')).toBeVisible();
    // Aucun message d'échec, aucune donnée fictive : le compte neuf n'a aucune annonce.
    await expect(page.getByText('Aucune annonce pour le moment.')).toBeVisible();

    // Le compte existe bien côté serveur : après rechargement, la session et le
    // profil vendeur créés à l'inscription sont toujours là.
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Mon espace vendeur' })).toBeVisible();
    await expect(page.getByText('Profil vendeur manquant')).toBeHidden();
    await expect(page.getByText('Aucune annonce pour le moment.')).toBeVisible();
  });

  test('compte boutique : inscription, tableau de bord et message de confirmation', async ({ page }) => {
    const uniqueId = Date.now();

    await page.goto('/register');
    await page.getByLabel('Nom complet').fill('Moussa Diop');
    await page.getByLabel('Email').fill(unique('boutique'));
    await page.getByLabel('Mot de passe (8 caractères minimum)').fill('Password123!');
    await page.getByLabel("Nom de l'entreprise").fill(`Entreprise ${uniqueId}`);
    await page.getByLabel('Nom de la boutique').fill('Boutique Plateau');
    await page.getByRole('button', { name: 'Créer mon compte' }).click();

    await expect(page).toHaveURL(/\/app$/);
    await expect(page.getByText('Votre compte est créé : votre boutique est prête.')).toBeVisible();
    await expect(page.getByText("Chiffre d'affaires").first()).toBeVisible();
  });

  test('mot de passe trop court : message explicite et aucun compte créé', async ({ page }) => {
    const email = unique('court');

    await page.goto('/register');
    await page.getByLabel('Nom complet').fill('Test Court');
    await page.getByLabel('Email').fill(email);
    await page.getByLabel('Mot de passe (8 caractères minimum)').fill('court');
    await page.getByRole('button', { name: 'Créer mon compte' }).click();

    await expect(page.getByText('Le mot de passe doit contenir au moins 8 caractères.')).toBeVisible();
    await expect(page).toHaveURL(/\/register$/);

    // Aucun compte n'a été créé : les identifiants sont refusés.
    const response = await page.request.post(`${API}/auth/login`, { data: { email, password: 'court' } });
    expect(response.status()).toBe(401);
  });

  test('email déjà utilisé : message explicite rattaché au champ email', async ({ page }) => {
    const email = unique('doublon');

    // Premier compte créé directement via l'API.
    const created = await page.request.post(`${API}/auth/register`, {
      data: {
        accountType: 'INDIVIDUAL',
        email,
        password: 'Password123!',
        fullName: 'Premier Compte',
        organizationName: '',
        storeName: '',
        region: 'Dakar',
      },
    });
    expect(created.status()).toBe(201);

    // Seconde tentative depuis le formulaire, avec le même email.
    await page.goto('/register');
    await page.getByRole('button', { name: 'Particulier' }).click();
    await page.getByLabel('Nom complet').fill('Second Compte');
    await page.getByLabel('Email').fill(email);
    await page.getByLabel('Mot de passe (8 caractères minimum)').fill('Password123!');
    await page.getByRole('button', { name: 'Créer mon compte' }).click();

    await expect(page.getByText('Un compte existe déjà avec cet email').first()).toBeVisible();
    await expect(page).toHaveURL(/\/register$/);
  });

  test('champ obligatoire manquant (compte boutique) : message explicite', async ({ page }) => {
    await page.goto('/register');
    await page.getByLabel('Nom complet').fill('Sans Entreprise');
    await page.getByLabel('Email').fill(unique('sans.entreprise'));
    await page.getByLabel('Mot de passe (8 caractères minimum)').fill('Password123!');
    await page.getByRole('button', { name: 'Créer mon compte' }).click();

    await expect(page.getByText("Le nom de l'entreprise doit contenir au moins 2 caractères.")).toBeVisible();
    await expect(page).toHaveURL(/\/register$/);
  });
});
