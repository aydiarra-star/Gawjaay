import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import { AppLayout } from './components/AppLayout';
import { LandingPage } from './pages/LandingPage';
import { LoginPage } from './pages/LoginPage';
import { RegisterPage } from './pages/RegisterPage';
import { MarketplacePage } from './pages/MarketplacePage';
import { ShopPage } from './pages/ShopPage';
import { NotFoundPage } from './pages/NotFoundPage';
import { DashboardPage } from './pages/DashboardPage';
import { PosPage } from './pages/PosPage';
import { ProductsPage } from './pages/ProductsPage';
import { StockPage } from './pages/StockPage';
import { OrdersPage } from './pages/OrdersPage';
import { CustomersPage } from './pages/CustomersPage';
import { SuppliersPage } from './pages/SuppliersPage';
import { PurchasesPage } from './pages/PurchasesPage';
import { DeliveriesPage } from './pages/DeliveriesPage';
import { ReportsPage } from './pages/ReportsPage';
import { SettingsPage } from './pages/SettingsPage';

function RequireAuth({ children }: { children: JSX.Element }) {
  const { user, loading } = useAuth();
  if (loading) {
    return (
      <div className="center-page">
        <span className="spinner" />
      </div>
    );
  }
  if (!user) return <Navigate to="/login" replace />;
  return children;
}

export function App() {
  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />
      <Route path="/marketplace" element={<MarketplacePage />} />
      <Route path="/shop/:slug" element={<ShopPage />} />

      <Route
        path="/app"
        element={
          <RequireAuth>
            <AppLayout>
              <DashboardPage />
            </AppLayout>
          </RequireAuth>
        }
      />
      <Route
        path="/app/pos"
        element={
          <RequireAuth>
            <AppLayout>
              <PosPage />
            </AppLayout>
          </RequireAuth>
        }
      />
      <Route
        path="/app/products"
        element={
          <RequireAuth>
            <AppLayout>
              <ProductsPage />
            </AppLayout>
          </RequireAuth>
        }
      />
      <Route
        path="/app/stock"
        element={
          <RequireAuth>
            <AppLayout>
              <StockPage />
            </AppLayout>
          </RequireAuth>
        }
      />
      <Route
        path="/app/orders"
        element={
          <RequireAuth>
            <AppLayout>
              <OrdersPage />
            </AppLayout>
          </RequireAuth>
        }
      />
      <Route
        path="/app/customers"
        element={
          <RequireAuth>
            <AppLayout>
              <CustomersPage />
            </AppLayout>
          </RequireAuth>
        }
      />
      <Route
        path="/app/suppliers"
        element={
          <RequireAuth>
            <AppLayout>
              <SuppliersPage />
            </AppLayout>
          </RequireAuth>
        }
      />
      <Route
        path="/app/purchases"
        element={
          <RequireAuth>
            <AppLayout>
              <PurchasesPage />
            </AppLayout>
          </RequireAuth>
        }
      />
      <Route
        path="/app/deliveries"
        element={
          <RequireAuth>
            <AppLayout>
              <DeliveriesPage />
            </AppLayout>
          </RequireAuth>
        }
      />
      <Route
        path="/app/reports"
        element={
          <RequireAuth>
            <AppLayout>
              <ReportsPage />
            </AppLayout>
          </RequireAuth>
        }
      />
      <Route
        path="/app/settings"
        element={
          <RequireAuth>
            <AppLayout>
              <SettingsPage />
            </AppLayout>
          </RequireAuth>
        }
      />

      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}
