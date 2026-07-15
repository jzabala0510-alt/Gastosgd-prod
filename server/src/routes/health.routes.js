const { Router } = require('express');
const { getPool } = require('../config/db');

const router = Router();

// GET /api/health - estado de la API + conexion a la BD
router.get('/', async (req, res) => {
  try {
    const pool = await getPool();
    const r = await pool.request().query('SELECT DB_NAME() AS db, GETDATE() AS now');
    res.json({ status: 'ok', db: r.recordset[0].db, serverTime: r.recordset[0].now });
  } catch (err) {
    res.status(500).json({ status: 'db_error', error: err.message });
  }
});

module.exports = router;
