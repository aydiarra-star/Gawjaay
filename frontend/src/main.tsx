import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Layout from './components/Layout';
import Login from './pages/auth/Login';
import Register from './pages/auth/Register';
import MerchantDashboard from './pages/merchant/Dashboard';
import { SalesPage, OrdersPage as MerchantOrders, InventoryPage, CustomersPage } from './pages/merchant/StorePages';
import Promotions from './pages/merchant/Promotions';
import Coupons from './pages/merchant/Coupons';
import MerchantReviews from './pages/merchant/MerchantReviews';
import InventoryCount from './pages/merchant/InventoryCount';
import Analytics from './pages/merchant/Analytics';
import Loyalty from './pages/merchant/Loyalty';
import B2BWholesale from './pages/merchant/B2BWholesale';
import B2BOrders from './pages/merchant/B2BOrders';
import Replenishment from './pages/merchant/Replenishment';
import Marketplace from './pages/client/Marketplace';
import StorePublic from './pages/client/StorePublic';
import Orders from './pages/client/Orders';
import Admin from './pages/admin/Admin';

function Home() {
  return (
    <div className="text-center py-20">
      <h1 className="text-4xl font-bold text-green-700">GawJaay</h1>
      <p className="text-xl mt-2">Vendre vite. Gérer mieux.</p>
      <p className="mt-4 text-gray-600 max-w-2xl mx-auto">Plateforme sénégalaise tout-en-un : gestion boutique physique, boutique en ligne partageable WhatsApp, marketplace "Acheter près de moi" basée sur stock réel, commandes, paiements Wave & Orange Money sandbox, livraisons, dettes, fournisseurs, dépenses, tableau de bord.</p>
      <div className="mt-8 flex justify-center gap-4">
        <a href="/marketplace" className="bg-green-700 text-white px-6 py-3 rounded">Voir Marketplace</a>
        <a href="/login" className="border border-green-700 text-green-700 px-6 py-3 rounded">Connexion commerçant</a>
      </div>
      <div className="mt-12 grid grid-cols-1 md:grid-cols-3 gap-6 text-left max-w-5xl mx-auto">
        <div className="bg-white p-4 rounded shadow"><h3 className="font-bold">🛒 Stock Unique</h3><p className="text-sm">Une seule source de vérité serveur. Vente physique + commande en ligne = stock décrémenté transactionnellement.</p></div>
        <div className="bg-white p-4 rounded shadow"><h3 className="font-bold">🔒 Sécurité Multi-tenant</h3><p className="text-sm">Isolation stricte par commerçant, RBAC CLIENT/MERCHANT/EMPLOYEE/ADMIN, audit logs, paiements confirmés uniquement serveur.</p></div>
        <div className="bg-white p-4 rounded shadow"><h3 className="font-bold">📍 Sénégal</h3><p className="text-sm">14 régions, départements, communes, recherche proximité réelle, boutique partageable WhatsApp lien direct.</p></div>
      </div>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <Layout>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route path="/merchant" element={<MerchantDashboard />} />
          <Route path="/merchant/store/:storeId/sales" element={<SalesPage />} />
          <Route path="/merchant/store/:storeId/orders" element={<MerchantOrders />} />
          <Route path="/merchant/store/:storeId/inventory" element={<InventoryPage />} />
          <Route path="/merchant/store/:storeId/customers" element={<CustomersPage />} />
          <Route path="/merchant/store/:storeId/promotions" element={<Promotions />} />
          <Route path="/merchant/store/:storeId/coupons" element={<Coupons />} />
          <Route path="/merchant/store/:storeId/reviews" element={<MerchantReviews />} />
          <Route path="/merchant/store/:storeId/inventory-count" element={<InventoryCount />} />
          <Route path="/merchant/store/:storeId/analytics" element={<Analytics />} />
          <Route path="/merchant/store/:storeId/loyalty" element={<Loyalty />} />
          <Route path="/merchant/store/:storeId/replenishment" element={<Replenishment />} />
          <Route path="/merchant/b2b" element={<B2BWholesale />} />
          <Route path="/merchant/b2b/orders" element={<B2BOrders />} />
          <Route path="/marketplace" element={<Marketplace />} />
          <Route path="/store/:slug" element={<StorePublic />} />
          <Route path="/orders" element={<Orders />} />
          <Route path="/admin" element={<Admin />} />
          <Route path="*" element={<Navigate to="/" />} />
        </Routes>
      </Layout>
    </BrowserRouter>
  </React.StrictMode>
);
