/**
 * GawJaay — Schéma de base PostgreSQL (000_base)
 * Portage fidèle de base V1 pour l'initialisation PostgreSQL (initDb)
 */
export const POSTGRES_BASE_SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  phone TEXT UNIQUE NOT NULL,
  email TEXT UNIQUE,
  passwordHash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'CLIENT',
  isPhoneVerified INTEGER DEFAULT 0,
  isActive INTEGER DEFAULT 1,
  lastLoginAt TEXT,
  createdAt TEXT DEFAULT (now()::text),
  updatedAt TEXT DEFAULT (now()::text)
);
CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  userId TEXT NOT NULL,
  refreshToken TEXT UNIQUE NOT NULL,
  userAgent TEXT,
  ip TEXT,
  expiresAt TEXT NOT NULL,
  createdAt TEXT DEFAULT (now()::text),
  revoked INTEGER DEFAULT 0,
  FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS merchants (
  id TEXT PRIMARY KEY,
  userId TEXT UNIQUE NOT NULL,
  businessName TEXT,
  ninea TEXT,
  createdAt TEXT DEFAULT (now()::text),
  updatedAt TEXT DEFAULT (now()::text),
  FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS regions (
  id TEXT PRIMARY KEY,
  name TEXT UNIQUE NOT NULL,
  code TEXT UNIQUE NOT NULL,
  createdAt TEXT DEFAULT (now()::text)
);
CREATE TABLE IF NOT EXISTS departments (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  regionId TEXT NOT NULL,
  FOREIGN KEY (regionId) REFERENCES regions(id),
  UNIQUE(name, regionId)
);
CREATE TABLE IF NOT EXISTS communes (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  departmentId TEXT NOT NULL,
  FOREIGN KEY (departmentId) REFERENCES departments(id),
  UNIQUE(name, departmentId)
);
CREATE TABLE IF NOT EXISTS stores (
  id TEXT PRIMARY KEY,
  merchantId TEXT NOT NULL,
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  description TEXT,
  logoUrl TEXT,
  category TEXT,
  phone TEXT,
  whatsapp TEXT,
  email TEXT,
  addressText TEXT,
  regionId TEXT,
  departmentId TEXT,
  communeId TEXT,
  quartier TEXT,
  latitude REAL,
  longitude REAL,
  physicalStatus TEXT DEFAULT 'OPEN',
  digitalStatus TEXT DEFAULT 'OPEN',
  deliveryZones TEXT,
  deliveryFees REAL DEFAULT 0,
  deliveryDelayMinutes INTEGER DEFAULT 60,
  allowPickup INTEGER DEFAULT 1,
  allowDelivery INTEGER DEFAULT 1,
  paymentMethods TEXT,
  openingHours TEXT,
  isVerified INTEGER DEFAULT 0,
  isActive INTEGER DEFAULT 1,
  createdAt TEXT DEFAULT (now()::text),
  updatedAt TEXT DEFAULT (now()::text),
  FOREIGN KEY (merchantId) REFERENCES merchants(id) ON DELETE CASCADE,
  FOREIGN KEY (communeId) REFERENCES communes(id)
);
CREATE TABLE IF NOT EXISTS categories (
  id TEXT PRIMARY KEY,
  name TEXT UNIQUE NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  parentId TEXT,
  createdAt TEXT DEFAULT (now()::text),
  FOREIGN KEY (parentId) REFERENCES categories(id)
);
CREATE TABLE IF NOT EXISTS products (
  id TEXT PRIMARY KEY,
  storeId TEXT NOT NULL,
  categoryId TEXT,
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  description TEXT,
  sku TEXT,
  barcode TEXT,
  price REAL NOT NULL,
  costPrice REAL,
  unit TEXT DEFAULT 'piece',
  isActive INTEGER DEFAULT 1,
  isOnline INTEGER DEFAULT 1,
  lowStockThreshold INTEGER DEFAULT 5,
  images TEXT,
  variants TEXT,
  createdAt TEXT DEFAULT (now()::text),
  updatedAt TEXT DEFAULT (now()::text),
  FOREIGN KEY (storeId) REFERENCES stores(id) ON DELETE CASCADE,
  FOREIGN KEY (categoryId) REFERENCES categories(id),
  UNIQUE(storeId, slug)
);
CREATE TABLE IF NOT EXISTS inventories (
  id TEXT PRIMARY KEY,
  storeId TEXT NOT NULL,
  productId TEXT NOT NULL,
  quantity REAL DEFAULT 0,
  updatedAt TEXT DEFAULT (now()::text),
  createdAt TEXT DEFAULT (now()::text),
  FOREIGN KEY (storeId) REFERENCES stores(id) ON DELETE CASCADE,
  FOREIGN KEY (productId) REFERENCES products(id) ON DELETE CASCADE,
  UNIQUE(storeId, productId)
);
CREATE TABLE IF NOT EXISTS inventory_movements (
  id TEXT PRIMARY KEY,
  storeId TEXT NOT NULL,
  productId TEXT NOT NULL,
  quantity REAL NOT NULL,
  type TEXT NOT NULL,
  reason TEXT,
  referenceId TEXT,
  userId TEXT,
  createdAt TEXT DEFAULT (now()::text),
  FOREIGN KEY (productId) REFERENCES products(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS customers (
  id TEXT PRIMARY KEY,
  storeId TEXT NOT NULL,
  name TEXT NOT NULL,
  phone TEXT NOT NULL,
  email TEXT,
  address TEXT,
  notes TEXT,
  isActive INTEGER DEFAULT 1,
  createdAt TEXT DEFAULT (now()::text),
  updatedAt TEXT DEFAULT (now()::text),
  FOREIGN KEY (storeId) REFERENCES stores(id) ON DELETE CASCADE,
  UNIQUE(storeId, phone)
);
CREATE TABLE IF NOT EXISTS suppliers (
  id TEXT PRIMARY KEY,
  merchantId TEXT NOT NULL,
  name TEXT NOT NULL,
  phone TEXT,
  email TEXT,
  address TEXT,
  notes TEXT,
  createdAt TEXT DEFAULT (now()::text),
  updatedAt TEXT DEFAULT (now()::text),
  FOREIGN KEY (merchantId) REFERENCES merchants(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS purchases (
  id TEXT PRIMARY KEY,
  supplierId TEXT NOT NULL,
  storeId TEXT NOT NULL,
  totalAmount REAL NOT NULL,
  notes TEXT,
  createdAt TEXT DEFAULT (now()::text),
  FOREIGN KEY (supplierId) REFERENCES suppliers(id)
);
CREATE TABLE IF NOT EXISTS purchase_items (
  id TEXT PRIMARY KEY,
  purchaseId TEXT NOT NULL,
  productId TEXT NOT NULL,
  quantity REAL NOT NULL,
  unitPrice REAL NOT NULL,
  FOREIGN KEY (purchaseId) REFERENCES purchases(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS sales (
  id TEXT PRIMARY KEY,
  storeId TEXT NOT NULL,
  customerId TEXT,
  totalAmount REAL NOT NULL,
  discount REAL DEFAULT 0,
  paymentMethod TEXT DEFAULT 'CASH',
  amountPaid REAL NOT NULL,
  change REAL DEFAULT 0,
  notes TEXT,
  createdById TEXT NOT NULL,
  createdAt TEXT DEFAULT (now()::text),
  FOREIGN KEY (storeId) REFERENCES stores(id),
  FOREIGN KEY (customerId) REFERENCES customers(id)
);
CREATE TABLE IF NOT EXISTS sale_items (
  id TEXT PRIMARY KEY,
  saleId TEXT NOT NULL,
  productId TEXT NOT NULL,
  quantity REAL NOT NULL,
  unitPrice REAL NOT NULL,
  total REAL NOT NULL,
  FOREIGN KEY (saleId) REFERENCES sales(id) ON DELETE CASCADE,
  FOREIGN KEY (productId) REFERENCES products(id)
);
CREATE TABLE IF NOT EXISTS debts (
  id TEXT PRIMARY KEY,
  customerId TEXT NOT NULL,
  clientUserId TEXT,
  totalAmount REAL NOT NULL,
  paidAmount REAL DEFAULT 0,
  balance REAL NOT NULL,
  dueDate TEXT,
  notes TEXT,
  isSettled INTEGER DEFAULT 0,
  createdAt TEXT DEFAULT (now()::text),
  updatedAt TEXT DEFAULT (now()::text),
  FOREIGN KEY (customerId) REFERENCES customers(id)
);
CREATE TABLE IF NOT EXISTS debt_payments (
  id TEXT PRIMARY KEY,
  debtId TEXT NOT NULL,
  amount REAL NOT NULL,
  method TEXT DEFAULT 'CASH',
  notes TEXT,
  createdAt TEXT DEFAULT (now()::text),
  FOREIGN KEY (debtId) REFERENCES debts(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS expenses (
  id TEXT PRIMARY KEY,
  storeId TEXT NOT NULL,
  category TEXT NOT NULL,
  amount REAL NOT NULL,
  description TEXT,
  date TEXT DEFAULT (now()::text),
  createdAt TEXT DEFAULT (now()::text),
  FOREIGN KEY (storeId) REFERENCES stores(id)
);
CREATE TABLE IF NOT EXISTS addresses (
  id TEXT PRIMARY KEY,
  userId TEXT NOT NULL,
  label TEXT,
  region TEXT,
  city TEXT,
  quartier TEXT,
  street TEXT,
  latitude REAL,
  longitude REAL,
  phone TEXT,
  isDefault INTEGER DEFAULT 0,
  createdAt TEXT DEFAULT (now()::text),
  FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS orders (
  id TEXT PRIMARY KEY,
  orderNumber TEXT UNIQUE NOT NULL,
  storeId TEXT NOT NULL,
  clientId TEXT NOT NULL,
  customerId TEXT,
  addressId TEXT,
  status TEXT DEFAULT 'EN_ATTENTE',
  totalAmount REAL NOT NULL,
  deliveryFees REAL DEFAULT 0,
  discount REAL DEFAULT 0,
  deliveryType TEXT DEFAULT 'LIVRAISON',
  notes TEXT,
  cancellationReason TEXT,
  createdAt TEXT DEFAULT (now()::text),
  updatedAt TEXT DEFAULT (now()::text),
  FOREIGN KEY (storeId) REFERENCES stores(id),
  FOREIGN KEY (clientId) REFERENCES users(id),
  FOREIGN KEY (customerId) REFERENCES customers(id),
  FOREIGN KEY (addressId) REFERENCES addresses(id)
);
CREATE TABLE IF NOT EXISTS order_items (
  id TEXT PRIMARY KEY,
  orderId TEXT NOT NULL,
  productId TEXT NOT NULL,
  quantity REAL NOT NULL,
  unitPrice REAL NOT NULL,
  total REAL NOT NULL,
  FOREIGN KEY (orderId) REFERENCES orders(id) ON DELETE CASCADE,
  FOREIGN KEY (productId) REFERENCES products(id)
);
CREATE TABLE IF NOT EXISTS payments (
  id TEXT PRIMARY KEY,
  orderId TEXT UNIQUE NOT NULL,
  provider TEXT NOT NULL,
  status TEXT DEFAULT 'PENDING',
  amount REAL NOT NULL,
  transactionId TEXT UNIQUE,
  providerRef TEXT,
  idempotencyKey TEXT UNIQUE NOT NULL,
  rawResponse TEXT,
  verifiedAt TEXT,
  createdAt TEXT DEFAULT (now()::text),
  updatedAt TEXT DEFAULT (now()::text),
  FOREIGN KEY (orderId) REFERENCES orders(id)
);
CREATE TABLE IF NOT EXISTS deliveries (
  id TEXT PRIMARY KEY,
  orderId TEXT UNIQUE NOT NULL,
  storeId TEXT NOT NULL,
  type TEXT NOT NULL,
  status TEXT DEFAULT 'A_PREPARER',
  assignedToId TEXT,
  addressText TEXT,
  latitude REAL,
  longitude REAL,
  proofUrl TEXT,
  notes TEXT,
  deliveredAt TEXT,
  createdAt TEXT DEFAULT (now()::text),
  updatedAt TEXT DEFAULT (now()::text),
  FOREIGN KEY (orderId) REFERENCES orders(id),
  FOREIGN KEY (storeId) REFERENCES stores(id)
);
CREATE TABLE IF NOT EXISTS employees (
  id TEXT PRIMARY KEY,
  storeId TEXT NOT NULL,
  userId TEXT UNIQUE NOT NULL,
  roleLabel TEXT NOT NULL,
  permissions TEXT NOT NULL,
  isActive INTEGER DEFAULT 1,
  createdAt TEXT DEFAULT (now()::text),
  updatedAt TEXT DEFAULT (now()::text),
  FOREIGN KEY (storeId) REFERENCES stores(id) ON DELETE CASCADE,
  FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS notifications (
  id TEXT PRIMARY KEY,
  userId TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  type TEXT NOT NULL,
  data TEXT,
  isRead INTEGER DEFAULT 0,
  createdAt TEXT DEFAULT (now()::text),
  FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS reviews (
  id TEXT PRIMARY KEY,
  orderId TEXT NOT NULL,
  storeId TEXT NOT NULL,
  clientId TEXT NOT NULL,
  rating INTEGER NOT NULL,
  comment TEXT,
  isVerified INTEGER DEFAULT 0,
  createdAt TEXT DEFAULT (now()::text),
  FOREIGN KEY (clientId) REFERENCES users(id)
);
CREATE TABLE IF NOT EXISTS disputes (
  id TEXT PRIMARY KEY,
  orderId TEXT NOT NULL,
  clientId TEXT NOT NULL,
  storeId TEXT NOT NULL,
  reason TEXT NOT NULL,
  description TEXT,
  status TEXT DEFAULT 'OPEN',
  createdAt TEXT DEFAULT (now()::text),
  updatedAt TEXT DEFAULT (now()::text),
  FOREIGN KEY (clientId) REFERENCES users(id)
);
CREATE TABLE IF NOT EXISTS audit_logs (
  id TEXT PRIMARY KEY,
  userId TEXT,
  action TEXT NOT NULL,
  resource TEXT,
  resourceId TEXT,
  details TEXT,
  ip TEXT,
  createdAt TEXT DEFAULT (now()::text),
  FOREIGN KEY (userId) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_users_phone ON users(phone);
CREATE INDEX IF NOT EXISTS idx_stores_merchant ON stores(merchantId);
CREATE INDEX IF NOT EXISTS idx_stores_slug ON stores(slug);
CREATE INDEX IF NOT EXISTS idx_products_store ON products(storeId);
CREATE INDEX IF NOT EXISTS idx_inventory_store ON inventories(storeId);
CREATE INDEX IF NOT EXISTS idx_orders_store ON orders(storeId);
CREATE INDEX IF NOT EXISTS idx_orders_client ON orders(clientId);
`;
