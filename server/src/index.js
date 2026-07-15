require('dotenv').config();
const path = require('path');
const fs = require('fs');
const express = require('express');
const cors = require('cors');
const morgan = require('morgan');

const healthRoutes = require('./routes/health.routes');
const catalogosRoutes = require('./routes/catalogos.routes');
const authRoutes = require('./routes/auth.routes');
const jerarquiaRoutes = require('./routes/jerarquia.routes');
const facturasRoutes = require('./routes/facturas.routes');
const adminRoutes = require('./routes/admin.routes');
const fondosRoutes = require('./routes/fondos.routes');
const reportesRoutes = require('./routes/reportes.routes');
const notificacionesRoutes = require('./routes/notificaciones.routes');
const tiendaAliasRoutes = require('./routes/tiendaAlias.routes');
const importarSaldosRoutes = require('./routes/importarSaldos.routes');
const updaterRoutes = require('./routes/updater.routes');

const app = express();

app.use(cors());
app.use(express.json());
app.use(morgan('dev'));

// Servido de adjuntos (a traves del proxy /api del frontend)
const UPLOAD_DIR = path.resolve(__dirname, '..', process.env.UPLOAD_DIR || 'uploads');
app.use('/api/uploads', express.static(UPLOAD_DIR));

app.use('/api/health', healthRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/catalogos', catalogosRoutes);
app.use('/api/jerarquia', jerarquiaRoutes);
app.use('/api/facturas', facturasRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/fondos', fondosRoutes);
app.use('/api/reportes', reportesRoutes);
app.use('/api/notificaciones', notificacionesRoutes);
app.use('/api/admin/alias-tiendas', tiendaAliasRoutes);
app.use('/api/fondos/importar-excel', importarSaldosRoutes);
app.use('/api/updater', updaterRoutes);

// ── Frontend compilado (producción): el backend sirve client/dist ──────
// En desarrollo no existe dist; ahí se usa el dev-server de Vite con su proxy /api.
const CLIENT_DIST = process.env.CLIENT_DIST || path.resolve(__dirname, '..', '..', 'client', 'dist');
if (fs.existsSync(CLIENT_DIST)) {
  app.use(express.static(CLIENT_DIST));
  // SPA fallback: rutas del cliente (no /api) devuelven index.html
  app.use((req, res, next) => {
    if (req.method === 'GET' && !req.path.startsWith('/api')) {
      return res.sendFile(path.join(CLIENT_DIST, 'index.html'));
    }
    next();
  });
  console.log('[server] Frontend servido desde', CLIENT_DIST);
}

// 404 (rutas /api sin coincidencia)
app.use((req, res) => res.status(404).json({ error: 'Recurso no encontrado' }));

// Manejador de errores
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error('[error]', err.message);
  res.status(err.status || 500).json({ error: err.message || 'Error interno del servidor' });
});

const PORT = Number(process.env.PORT || 3101);
app.listen(PORT, () => console.log(`[server] API escuchando en http://localhost:${PORT}`));
