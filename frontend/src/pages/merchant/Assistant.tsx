import { useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import api from '../../lib/api';

const CHIPS = ['Ventes du jour', 'Produits sous le seuil', 'Top produits', 'Clients actifs', 'Marge estimée', 'Mes livraisons'];

/**
 * LOT F — Assistant IA (strict no-invention) : réponses calculées depuis les données
 * réelles de la boutique. Les actions sensibles demandent une confirmation explicite.
 */
export default function Assistant() {
  const { storeId } = useParams();
  const [messages, setMessages] = useState<any[]>([]);
  const [input, setInput] = useState('');
  const [pending, setPending] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const bottom = useRef<HTMLDivElement>(null);

  useEffect(() => {
    api.get(`/assistant/history/${storeId}`).then((r) => setMessages(r.data)).catch(() => {});
    loadActions();
  }, [storeId]);
  useEffect(() => { bottom.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages, pending]);

  const loadActions = () => {
    api.get(`/assistant/actions/store/${storeId}`).then((r) => {
      const p = r.data.find((x: any) => x.status === 'PENDING');
      setPending(p || null);
    }).catch(() => {});
  };

  const ask = async (q: string) => {
    if (!q.trim() || busy) return;
    setBusy(true);
    setInput('');
    setMessages((m) => [...m, { role: 'USER', content: q, createdAt: new Date().toISOString() }]);
    try {
      const r = await api.post(`/assistant/ask/${storeId}`, { question: q });
      setMessages((m) => [...m, { role: 'ASSISTANT', content: r.data.content, intent: r.data.intent, createdAt: new Date().toISOString() }]);
    } catch (e: any) {
      setMessages((m) => [...m, { role: 'ASSISTANT', content: e.response?.data?.error || 'Erreur', createdAt: new Date().toISOString() }]);
    }
    setBusy(false);
  };

  const requestAction = async (actionType: string) => {
    try {
      await api.post('/assistant/actions', { storeId, actionType });
      setMsg('Action préparée — confirmez ci-dessous.');
      loadActions();
    } catch (e: any) { setMsg(e.response?.data?.error || 'Erreur'); }
  };
  const confirm = async (confirmed: boolean) => {
    if (!pending) return;
    try {
      const r = await api.post(`/assistant/actions/${pending.id}/confirm`, { confirmed });
      setMsg(confirmed ? `✅ Action exécutée : ${r.data.result?.suggestionsCreated ?? 0} suggestion(s) créée(s).` : 'Action rejetée.');
      setPending(null); loadActions();
    } catch (e: any) { setMsg(e.response?.data?.error || 'Erreur'); setPending(null); }
  };

  return (
    <div className="flex flex-col" style={{ minHeight: '70vh' }}>
      <h1 className="text-2xl font-bold mb-1">Assistant</h1>
      <p className="text-xs text-gray-500 mb-3">Réponses calculées uniquement à partir des données réelles de votre boutique — jamais de chiffre inventé.</p>
      {msg && <p className="bg-green-50 border border-green-200 text-green-800 p-2 rounded mb-3 text-sm">{msg}</p>}

      <div className="flex-1 space-y-3 mb-4">
        {messages.length === 0 && (
          <div className="bg-white p-4 rounded shadow text-sm text-gray-600">
            Bonjour 👋 Posez-moi vos questions (ventes, stock, clients, livraisons…) ou demandez :
            <button className="block mt-2 text-blue-600 underline" onClick={() => requestAction('GENERATE_REPLENISHMENT_PLAN')}>
              📦 Préparer un plan de réapprovisionnement
            </button>
            <button className="block mt-1 text-blue-600 underline" onClick={() => requestAction('SEND_LOW_STOCK_ALERT')}>
              🔔 M&apos;envoyer une alerte stock
            </button>
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} className={`flex ${m.role === 'USER' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[85%] p-3 rounded-2xl text-sm whitespace-pre-line ${m.role === 'USER' ? 'bg-blue-600 text-white rounded-br-sm' : 'bg-white shadow rounded-bl-sm'}`}>
              {m.content}
            </div>
          </div>
        ))}
        {busy && <div className="text-xs text-gray-400">L&apos;assistant calcule à partir de vos données…</div>}

        {pending && (
          <div className="bg-yellow-50 border border-yellow-300 p-4 rounded text-sm">
            <p className="font-bold">⚠️ Action à confirmer : {pending.actionType === 'GENERATE_REPLENISHMENT_PLAN' ? 'Plan de réapprovisionnement' : 'Alerte stock'}</p>
            <p className="text-xs text-gray-600 mt-1">Des suggestions seront enregistrées (quantités modifiables après). Expire : {new Date(pending.expiresAt).toLocaleTimeString('fr-FR')}.</p>
            <div className="flex gap-2 mt-3">
              <button className="bg-green-600 text-white px-4 py-2 rounded font-bold" onClick={() => confirm(true)}>Confirmer</button>
              <button className="bg-white border px-4 py-2 rounded" onClick={() => confirm(false)}>Rejeter</button>
            </div>
          </div>
        )}
        <div ref={bottom} />
      </div>

      <div className="flex gap-2 flex-wrap mb-2">
        {CHIPS.map((c) => (
          <button key={c} className="text-xs bg-white border rounded-full px-3 py-1 shadow-sm" onClick={() => ask(c)}>{c}</button>
        ))}
      </div>
      <div className="flex gap-2">
        <input className="border p-3 flex-1 rounded" placeholder="Posez votre question…" value={input}
          onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && ask(input)} />
        <button className="bg-blue-600 text-white px-5 rounded font-bold disabled:opacity-50" disabled={busy || !input.trim()} onClick={() => ask(input)}>Envoyer</button>
      </div>
    </div>
  );
}
