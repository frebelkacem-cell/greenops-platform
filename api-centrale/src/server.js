require('dotenv').config();

const express    = require('express');
const { initDatabase } = require('./db');
const { initRedis }    = require('./redis');
const { register }     = require('./prometheus');
const authRouter    = require('./routes.auth');
const metricsRouter = require('./routes.metrics');
const devicesRouter = require('./routes.devices');

const PORT = 3000;
const app  = express();

app.use(express.json());

app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  next();
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'api-centrale', timestamp: new Date().toISOString() });
});

app.get('/metrics', async (req, res) => {
  res.setHeader('Content-Type', register.contentType);
  res.end(await register.metrics());
});

app.use('/api/auth',    authRouter);
app.use('/api/metrics', metricsRouter);
app.use('/api/devices', devicesRouter);

app.use((req, res) => {
  res.status(404).json({ error: `Route ${req.method} ${req.path} introuvable.` });
});

app.use((err, req, res, next) => {
  console.error('[Server] Erreur non gérée:', err.message);
  res.status(500).json({ error: 'Erreur serveur.' });
});

async function bootstrap() {
  try {
    console.log('[Boot] Initialisation PostgreSQL...');
    await initDatabase();
    console.log('[Boot] Initialisation Redis...');
    await initRedis();
    app.listen(PORT, '0.0.0.0', () => {
      console.log(`[Boot] api-centrale démarré sur le port ${PORT}`);
    });
  } catch (err) {
    console.error('[Boot] Erreur fatale:', err.message);
    process.exit(1);
  }
}

bootstrap();
