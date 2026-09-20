/**
 * GAWJAAY — SMOKE TEST HTTP (rejouable contre n'importe quel environnement déployé).
 *
 * Usage :
 *   SMOKE_BASE_URL=https://api.exemple.sn npx tsx scripts/smoke.ts
 *   SMOKE_BASE_URL=http://127.0.0.1:4000   npx tsx scripts/smoke.ts   (défaut)
 *
 * Couvre : auth, marchand, boutique, produit, stock, vente CASH, statistiques, catalogue public,
 * absence de costPrice exposé, client, commande, prix serveur, confirmation, isolation multi-tenant,
 * idempotence, assistant IA, action IA PENDING → confirmation → EXECUTED → audit, et les deux
 * scénarios critiques (storeIds dynamiques, tentative d'accès cross-tenant par storeId).
 *
 * Sortie : une ligne PASS/FAIL par vérification + résumé. Code de sortie 1 si un échec.
 */
const BASE = (process.env.SMOKE_BASE_URL || 'http://127.0.0.1:4000').replace(/\/$/, '');
const RUN = String(Date.now() % 1000000).padStart(6, '0'); // suffixe NUMÉRIQUE (les téléphones n'acceptent pas de lettres)

let passed = 0;
let failed = 0;
const failures: string[] = [];

function check(ok: boolean, label: string, detail?: any) {
  if (ok) {
    passed++;
    console.log(`  PASS  ${label}`);
  } else {
    failed++;
    failures.push(label);
    console.log(`  FAIL  ${label}${detail !== undefined ? ` → ${JSON.stringify(detail)}` : ''}`);
  }
}

async function api(method: string, path: string, opts: { token?: string; body?: any; key?: string } = {}) {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (opts.token) headers.Authorization = `Bearer ${opts.token}`;
  if (opts.key) headers['Idempotency-Key'] = opts.key;
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });
  let data: any = null;
  try {
    data = await res.json();
  } catch {
    /* réponse sans corps JSON */
  }
  return { status: res.status, data };
}

/**
 * Connexion avec respect du rate-limit d'authentification (5/min en production).
 * Le smoke reste rejouable sans faux négatifs quand on l'enchaîne plusieurs fois.
 */
async function loginWithRetry(p: string, password: string, attempts = 5) {
  let r = await api('POST', '/api/v1/auth/login', { body: { phone: p, password } });
  for (let i = 0; i < attempts && r.status === 429; i++) {
    console.log('      (rate-limit 429 sur /auth/login — attente 20 s puis nouvelle tentative)');
    await new Promise((res) => setTimeout(res, 20000));
    r = await api('POST', '/api/v1/auth/login', { body: { phone: p, password } });
  }
  return r;
}

function phone(n: number) {
  return `+2217${RUN}${String(n).padStart(2, '0')}`.slice(0, 15);
}

async function main() {
  console.log(`\n=== GAWJAAY SMOKE — ${BASE} (run ${RUN}) ===\n`);

  // ——— 1. Santé ———
  const health = await api('GET', '/health');
  check(health.status === 200 && !!health.data?.service, 'health → 200 + service', health);

  // ——— 2. Auth marchand ———
  const mPhone = phone(1);
  const reg = await api('POST', '/api/v1/auth/register', {
    body: { phone: mPhone, password: 'Password123!', role: 'MERCHANT' },
  });
  check(reg.status === 201 && !!reg.data?.accessToken, 'auth register marchand → 201 + token', reg.status);
  const login = await loginWithRetry(mPhone, 'Password123!');
  check(login.status === 200 && !!login.data?.accessToken, 'auth login marchand → 200', login.status);
  const merchantToken = login.data?.accessToken as string;

  const me = await api('GET', '/api/v1/auth/me', { token: merchantToken });
  check(me.status === 200 && me.data?.role === 'MERCHANT', 'auth me → rôle MERCHANT', me.status);
  check(!/passwordHash/.test(JSON.stringify(me.data || {})), 'auth me → AUCUN passwordHash exposé');

  // ——— 3. Boutique + produit + stock ———
  const store = await api('POST', '/api/v1/stores', { token: merchantToken, body: { name: `Boutique Smoke ${RUN}` } });
  check(store.status === 201 && !!store.data?.id, 'création boutique → 201', store.status);
  const storeId = store.data?.id as string;
  const slug = store.data?.slug as string;

  const product = await api('POST', `/api/v1/products/store/${storeId}`, {
    token: merchantToken,
    body: { name: `Riz Smoke ${RUN}`, price: 15000, costPrice: 11000, initialStock: 20 },
  });
  check(product.status === 201 && !!product.data?.id, 'création produit (stock initial) → 201', product.status);
  const productId = product.data?.id as string;

  const adjust = await api('POST', `/api/v1/inventory/${storeId}/adjust`, {
    token: merchantToken,
    body: { productId, quantity: 5, type: 'ADJUSTMENT', reason: 'smoke' },
  });
  check(adjust.status === 200 || adjust.status === 201, 'ajustement de stock → 200/201', adjust.status);

  // ——— 4. SCÉNARIO CRITIQUE A : storeIds dynamiques (nouveau magasin SANS reconnexion) ———
  const store2 = await api('POST', '/api/v1/stores', { token: merchantToken, body: { name: `Boutique Smoke 2 ${RUN}` } });
  check(store2.status === 201 && !!store2.data?.id, 'A) 2e boutique créée avec le MÊME token', store2.status);
  const store2Id = store2.data?.id as string;
  const onNewStore = await api('POST', `/api/v1/products/store/${store2Id}`, {
    token: merchantToken,
    body: { name: `Produit Store2 ${RUN}`, price: 500, initialStock: 3 },
  });
  check(onNewStore.status === 201, 'A) opération sur le nouveau magasin sans reconnexion → 201 (pas 403)', onNewStore.status);

  // ——— 5. Vente CASH + stock + stats ———
  const sale = await api('POST', `/api/v1/sales/store/${storeId}`, {
    token: merchantToken,
    body: { items: [{ productId, quantity: 2 }], paymentMethod: 'CASH' },
  });
  check(sale.status === 201 && !!sale.data?.id, 'vente CASH → 201', sale.status);
  const totalAmount = sale.data?.totalAmount;

  const inv = await api('GET', `/api/v1/inventory/${storeId}`, { token: merchantToken });
  const invRow = Array.isArray(inv.data) ? inv.data.find((r: any) => r.productId === productId) : undefined;
  check(!!invRow && Number(invRow.quantity) === 23, 'stock décrémenté de 2 (25 → 23)', invRow?.quantity);

  const dash = await api('GET', `/api/v1/dashboard/store/${storeId}`, { token: merchantToken });
  check(dash.status === 200, 'statistiques marchand → 200', dash.status);
  check(dash.data?.today?.salesCount >= 1 && Number(dash.data?.today?.salesAmount) >= 15000, 'statistiques reflètent la vente réelle', dash.data?.today);

  // ——— 6. Catalogue public + absence de costPrice ———
  const pub = await api('GET', `/api/v1/stores/slug/${slug}`);
  check(pub.status === 200, 'boutique publique par slug → 200', pub.status);
  const pubBody = JSON.stringify(pub.data || {});
  check(!/costPrice/i.test(pubBody), 'catalogue public SANS costPrice', pubBody.slice(0, 120));

  const market = await api('GET', `/api/v1/marketplace/products?q=${encodeURIComponent('Riz Smoke')}`);
  check(market.status === 200, 'recherche publique → 200', market.status);
  check(!/costPrice/i.test(JSON.stringify(market.data || {})), 'recherche publique SANS costPrice');

  // ——— 7. Client : commande + prix serveur ———
  const cPhone = phone(2);
  const cReg = await api('POST', '/api/v1/auth/register', {
    body: { phone: cPhone, password: 'Password123!', role: 'CLIENT' },
  });
  check(cReg.status === 201 && !!cReg.data?.accessToken, 'auth register client → 201', cReg.status);
  const clientToken = cReg.data?.accessToken as string;

  const order = await api('POST', '/api/v1/orders', {
    token: clientToken,
    body: {
      storeId,
      items: [{ productId, quantity: 1, unitPrice: 1 }], // prix falsifié : le serveur doit l'ignorer
      deliveryType: 'RETRAIT',
    },
  });
  check(order.status === 201 && !!order.data?.id, 'commande client (RETRAIT) → 201', order.status);
  const orderId = order.data?.id as string;
  check(Number(order.data?.totalAmount) === 15000, 'prix SERVEUR appliqué (15000, pas 1)', order.data?.totalAmount);

  const confirm = await api('PATCH', `/api/v1/orders/${orderId}/status`, {
    token: merchantToken,
    body: { status: 'CONFIRMEE' },
  });
  check(confirm.status === 200, 'confirmation commande par le marchand → 200', confirm.status);

  // ——— 8. Multi-tenant ———
  const bPhone = phone(3);
  await api('POST', '/api/v1/auth/register', { body: { phone: bPhone, password: 'Password123!', role: 'MERCHANT' } });
  const bLogin = await loginWithRetry(bPhone, 'Password123!');
  const tenantB = bLogin.data?.accessToken as string;
  const storeB = await api('POST', '/api/v1/stores', { token: tenantB, body: { name: `Boutique B ${RUN}` } });
  const storeBId = storeB.data?.id as string;

  const crossRead = await api('GET', `/api/v1/inventory/${storeId}`, { token: tenantB });
  check(crossRead.status === 403, 'B) lecture stock du tenant A par B → 403', crossRead.status);
  const crossWrite = await api('POST', `/api/v1/products/store/${storeId}`, {
    token: tenantB,
    body: { name: 'Intrusion', price: 100 },
  });
  check(crossWrite.status === 403, 'B) écriture produit chez A par B → 403', crossWrite.status);
  const crossSale = await api('POST', `/api/v1/sales/store/${storeId}`, {
    token: tenantB,
    body: { items: [{ productId, quantity: 1 }], paymentMethod: 'CASH' },
  });
  check(crossSale.status === 403, 'B) vente chez A par B → 403', crossSale.status);
  // Le tenant B ne peut pas s'approprier le magasin A via storeId falsifié
  const crossStatus = await api('PATCH', `/api/v1/orders/${orderId}/status`, { token: tenantB, body: { status: 'ANNULEE' } });
  check(crossStatus.status === 403, 'B) action commande A par B → 403 (storeId falsifié inopérant)', crossStatus.status);
  const storeBProduct = await api('POST', `/api/v1/products/store/${storeBId}`, {
    token: tenantB,
    body: { name: 'Produit B', price: 1000, initialStock: 5 },
  });
  check(storeBProduct.status === 201, 'isolation OK : B opère bien sur SON magasin', storeBProduct.status);

  // ——— 9. Idempotence ———
  const key = `smoke-key-${RUN}`;
  const qtyOf = (rows: any) => Number((Array.isArray(rows) ? rows : []).find((r: any) => r.productId === productId)?.quantity);
  const before = await api('GET', `/api/v1/inventory/${storeId}`, { token: merchantToken });
  const qtyBefore = qtyOf(before.data);
  const s1 = await api('POST', `/api/v1/sales/store/${storeId}`, {
    token: merchantToken,
    key,
    body: { items: [{ productId, quantity: 1 }], paymentMethod: 'CASH' },
  });
  const s2 = await api('POST', `/api/v1/sales/store/${storeId}`, {
    token: merchantToken,
    key,
    body: { items: [{ productId, quantity: 1 }], paymentMethod: 'CASH' },
  });
  const after = await api('GET', `/api/v1/inventory/${storeId}`, { token: merchantToken });
  const qtyAfter = qtyOf(after.data);
  check(s1.status === 201 && s2.status === 201, 'idempotence : 2 requêtes même clé → 201', [s1.status, s2.status]);
  check(s1.data?.id === s2.data?.id, 'idempotence : MÊME vente renvoyée (pas de doublon)', [s1.data?.id, s2.data?.id]);
  check(qtyAfter === qtyBefore - 1, 'idempotence : stock décrémenté UNE seule fois', { qtyBefore, qtyAfter });

  // Indépendance par utilisateur : même clé, autre utilisateur → opération indépendante
  const bSale = await api('POST', `/api/v1/sales/store/${storeBId}`, {
    token: tenantB,
    key,
    body: { items: [{ productId: storeBProduct.data.id, quantity: 1 }], paymentMethod: 'CASH' },
  });
  check(bSale.status === 201 && bSale.data?.id !== s1.data?.id, 'idempotence : même clé pour un AUTRE utilisateur → opération indépendante', bSale.status);

  // ——— 10. Assistant IA ———
  const ask = await api('POST', `/api/v1/assistant/ask/${storeId}`, {
    token: merchantToken,
    body: { question: 'Quel est le numéro de téléphone du président du Sénégal ?' },
  });
  check(ask.status === 200, 'assistant : réponse 200', ask.status);
  check(
    ask.data?.intent === 'UNKNOWN' && typeof ask.data?.content === 'string' && /je ne dispose pas de cette information/i.test(ask.data.content),
    'assistant : aucune invention (donnée hors périmètre → « Je ne dispose pas de cette information »)',
    ask.data?.content?.slice(0, 120),
  );

  const askData = await api('POST', `/api/v1/assistant/ask/${storeId}`, {
    token: merchantToken,
    body: { question: "Quel est mon chiffre d'affaires aujourd'hui ?" },
  });
  // Le total doit correspondre aux ventes RÉELLES de la base (le smoke est rejouable :
  // on vérifie la cohérence avec l'API de statistiques, pas une valeur figée).
  const dash2 = await api('GET', `/api/v1/dashboard/store/${storeId}`, { token: merchantToken });
  const realToday = Number(dash2.data?.today?.salesAmount ?? -1);
  const content = String(askData.data?.content ?? '');
  // la réponse formate les montants (« 45 000 FCFA ») : on compare sans espaces (dont insécables)
  const flat = content.replace(/[\s\u202f\u00a0]/g, '');
  check(
    askData.status === 200 && /Aujourd'hui/.test(content) && realToday >= 15000 && flat.includes(String(realToday)),
    `assistant : CA annoncé = CA réel en base (${realToday} FCFA)`,
    content.slice(0, 120),
  );

  const aiAction = await api('POST', '/api/v1/assistant/actions', {
    token: merchantToken,
    body: { storeId, actionType: 'GENERATE_REPLENISHMENT_PLAN' },
  });
  check(aiAction.status === 201 && aiAction.data?.status === 'PENDING', 'action IA → PENDING', aiAction.data?.status);
  const aiId = aiAction.data?.id as string;

  const aiConfirm = await api('POST', `/api/v1/assistant/actions/${aiId}/confirm`, {
    token: merchantToken,
    body: { confirmed: true },
  });
  check(aiConfirm.status === 200 && aiConfirm.data?.status === 'EXECUTED', 'action IA confirmée → EXECUTED', aiConfirm.data?.status);

  const aiList = await api('GET', `/api/v1/assistant/actions/store/${storeId}`, { token: merchantToken });
  const listed = Array.isArray(aiList.data) ? aiList.data.find((a: any) => a.id === aiId) : undefined;
  check(!!listed && listed.status === 'EXECUTED', 'action IA visible avec statut EXECUTED', listed?.status);
  check(!!listed && !!listed.executedAt, 'action IA : horodatage d exécution (traçabilité)', listed?.executedAt);

  const auditDenied = await api('GET', '/api/v1/admin/audit?resource=ai_action', { token: merchantToken });
  check(auditDenied.status === 403, 'audit admin : accès refusé à un marchand (RBAC) → 403', auditDenied.status);

  // ——— Résumé ———
  console.log(`\n=== SMOKE ${passed}/${passed + failed} PASS — ${failed === 0 ? 'OK' : 'ÉCHECS: ' + failures.join(' | ')} ===\n`);
  if (failed > 0) process.exit(1);
}

main().catch((e) => {
  console.error('SMOKE ERREUR FATALE :', e?.message || e);
  process.exit(1);
});
