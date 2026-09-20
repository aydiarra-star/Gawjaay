import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import api from '../../lib/api';

const CATEGORIES = ['Loyer', 'Électricité', 'Eau', 'Transport', 'Salaires', 'Achats', 'Téléphone/Internet', 'Emballages', 'Réparations', 'Autre'];

/** Dépenses de la boutique (cahier §11) : saisie, liste paginée, résumé jour/mois calculé par le serveur. */
export default function Expenses() {
  const { storeId } = useParams();
  const [items, setItems] = useState<any[]>([]);
  const [summary, setSummary] = useState<any>(null);
  const [form, setForm] = useState({ category: CATEGORIES[0], amount: '', description: '', date: new Date().toISOString().slice(0, 10) });
  const [msg, setMsg] = useState('');
  const [page, setPage] = useState(0);
  const TAKE = 50;

  const load = () => {
    api.get(`/expenses/store/${storeId}`, { params: { take: TAKE, skip: page * TAKE } }).then((r) => setItems(r.data)).catch(() => setItems([]));
    api.get(`/expenses/store/${storeId}/summary`).then((r) => setSummary(r.data)).catch(() => setSummary(null));
  };
  useEffect(() => { load(); }, [storeId, page]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const amount = Number(form.amount);
    if (!Number.isFinite(amount) || amount <= 0) { setMsg('Montant invalide.'); return; }
    setMsg('');
    try {
      await api.post(`/expenses/store/${storeId}`, {
        category: form.category,
        amount,
        description: form.description.trim() || undefined,
        date: form.date ? new Date(form.date).toISOString() : undefined,
      });
      setForm({ ...form, amount: '', description: '' });
      setMsg('Dépense enregistrée.');
      load();
    } catch (err: any) { setMsg(err.response?.data?.error || 'Enregistrement refusé'); }
  };

  const remove = async (id: string) => {
    if (!window.confirm('Supprimer cette dépense ?')) return;
    try { await api.delete(`/expenses/store/${storeId}/${id}`); load(); }
    catch (err: any) { setMsg(err.response?.data?.error || 'Suppression refusée'); }
  };

  const fmt = (n: any) => `${Number(n || 0).toLocaleString('fr-FR')} FCFA`;

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
        <h1 className="text-xl font-bold">Dépenses</h1>
        <Link to="/merchant" className="text-green-700 text-sm">← Mes boutiques</Link>
      </div>

      {summary && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4 text-sm">
          <div className="bg-white p-3 rounded shadow"><p className="text-gray-500">Dépenses aujourd'hui</p><p className="font-bold">{fmt(summary.expensesToday)}</p></div>
          <div className="bg-white p-3 rounded shadow"><p className="text-gray-500">Ventes aujourd'hui</p><p className="font-bold">{fmt(summary.salesToday)}</p></div>
          <div className="bg-white p-3 rounded shadow"><p className="text-gray-500">Dépenses du mois</p><p className="font-bold">{fmt(summary.expensesMonth)}</p></div>
          <div className="bg-white p-3 rounded shadow"><p className="text-gray-500">Ventes du mois</p><p className="font-bold">{fmt(summary.salesMonth)}</p><p className="text-xs text-gray-500">Marge brute ventes − dépenses : {fmt(Number(summary.salesMonth || 0) - Number(summary.expensesMonth || 0))}</p></div>
        </div>
      )}

      <form onSubmit={submit} className="bg-white p-4 rounded shadow mb-4 grid grid-cols-1 md:grid-cols-5 gap-2 text-sm">
        <select className="border p-2 rounded" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} aria-label="Catégorie">
          {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <input className="border p-2 rounded" type="number" min="1" step="any" placeholder="Montant (FCFA)" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} required />
        <input className="border p-2 rounded" type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} aria-label="Date" />
        <input className="border p-2 rounded" placeholder="Description (optionnel)" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
        <button className="bg-green-700 text-white px-3 py-2 rounded">Ajouter dépense</button>
        {msg && <p className="md:col-span-5 text-xs text-gray-700" role="status">{msg}</p>}
      </form>

      {!!summary?.byCategory?.length && (
        <div className="bg-white p-4 rounded shadow mb-4 text-sm">
          <h3 className="font-bold mb-2">Par catégorie (mois en cours)</h3>
          <div className="flex flex-wrap gap-2">
            {summary.byCategory.map((c: any) => <span key={c.category} className="bg-gray-100 px-2 py-1 rounded">{c.category} : {fmt(c.total)}</span>)}
          </div>
        </div>
      )}

      <div className="bg-white p-4 rounded shadow overflow-x-auto">
        <table className="w-full text-sm">
          <thead><tr><th className="text-left">Date</th><th className="text-left">Catégorie</th><th className="text-right">Montant</th><th className="text-left">Description</th><th></th></tr></thead>
          <tbody>
            {items.map((x: any) => (
              <tr key={x.id} className="border-t">
                <td>{new Date(x.date).toLocaleDateString('fr-FR')}</td>
                <td>{x.category}</td>
                <td className="text-right">{fmt(x.amount)}</td>
                <td className="text-gray-600">{x.description || ''}</td>
                <td className="text-right"><button onClick={() => remove(x.id)} className="text-red-600 text-xs">Supprimer</button></td>
              </tr>
            ))}
          </tbody>
        </table>
        {!items.length && <p className="text-gray-500 text-sm mt-2">Aucune dépense{page ? ' sur cette page' : ' enregistrée'}.</p>}
        <div className="flex justify-between mt-3 text-xs">
          <button disabled={page === 0} onClick={() => setPage(page - 1)} className="border px-2 py-1 rounded disabled:opacity-40">← Précédent</button>
          <span>Page {page + 1}</span>
          <button disabled={items.length < TAKE} onClick={() => setPage(page + 1)} className="border px-2 py-1 rounded disabled:opacity-40">Suivant →</button>
        </div>
      </div>
    </div>
  );
}
