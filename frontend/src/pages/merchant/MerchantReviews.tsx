import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import api from '../../lib/api';

/** LOT A — Avis clients de la boutique (lecture marchand). */
export default function MerchantReviews() {
  const { storeId } = useParams();
  const [data, setData] = useState<any>({ reviews: [], stats: { count: 0, average: null } });

  useEffect(() => {
    api.get(`/reviews/store/${storeId}`).then((r) => setData(r.data));
  }, [storeId]);

  return (
    <div>
      <h1 className="text-2xl font-bold mb-4">Avis clients</h1>
      <div className="bg-white p-4 rounded shadow mb-6 flex items-center gap-4">
        <p className="text-4xl font-bold">{data.stats.average ?? '—'}</p>
        <div>
          <p className="text-yellow-500 text-xl">{'★'.repeat(Math.round(data.stats.average || 0))}{'☆'.repeat(5 - Math.round(data.stats.average || 0))}</p>
          <p className="text-sm text-gray-500">{data.stats.count} avis vérifiés (commandes livrées uniquement)</p>
        </div>
      </div>
      <div className="space-y-3">
        {data.reviews.map((r: any) => (
          <div key={r.id} className="bg-white p-4 rounded shadow">
            <p className="text-yellow-500">{'★'.repeat(r.rating)}{'☆'.repeat(5 - r.rating)} <span className="text-xs text-gray-400 ml-2">{new Date(r.createdAt).toLocaleDateString('fr-FR')}</span></p>
            {r.comment && <p className="text-sm mt-1">{r.comment}</p>}
          </div>
        ))}
        {!data.reviews.length && <p className="text-gray-500 text-sm">Aucun avis pour le moment.</p>}
      </div>
    </div>
  );
}
