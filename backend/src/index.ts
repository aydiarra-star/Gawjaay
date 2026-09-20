import { env } from './config/env';
import { buildApp } from './app';

const app = buildApp();

const PORT = env.PORT;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 GawJaay API running on http://0.0.0.0:${PORT}`);
  console.log(`Frontend allowed: ${env.FRONTEND_URL}`);
});
