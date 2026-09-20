import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';
import { env } from './config/env';
import routes from './routes';
import { errorHandler } from './middlewares/errorHandler';

const app = express();

app.use(helmet());
app.use(cors({
  origin: [env.FRONTEND_URL, 'http://localhost:5173', 'https://*.e2b.app'],
  credentials: true,
}));
app.use(express.json({ limit: '1mb' }));
app.use(cookieParser());

const globalLimiter = rateLimit({ windowMs: 60*1000, max: 100, message: { error: 'Trop de requêtes' } });
app.use('/api/', globalLimiter);

app.use('/api/v1', routes);

app.get('/', (req, res) => {
  res.json({ message: 'GawJaay API - Vendre vite. Gérer mieux.', docs: '/api/v1/health' });
});

app.use(errorHandler);

const PORT = env.PORT;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 GawJaay API running on http://0.0.0.0:${PORT}`);
  console.log(`Frontend allowed: ${env.FRONTEND_URL}`);
});
