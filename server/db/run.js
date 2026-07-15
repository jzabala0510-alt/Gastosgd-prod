// Runner de migraciones: ejecuta archivos .sql separando por lotes 'GO'.
// Uso:  node db/run.js              (ejecuta 01_schema.sql y 02_seed.sql)
//       node db/run.js 01_schema.sql
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { getPool } = require('../src/config/db');

const args = process.argv.slice(2);
const toRun = args.length ? args : ['01_schema.sql', '02_seed.sql', '03_auth.sql', '05_facturas.sql', '06_analista.sql'];

function splitBatches(text) {
  // separa por lineas que contienen solo 'GO' (separador de lotes de SQL Server)
  return text.split(/^\s*GO\s*$/gim).map((b) => b.trim()).filter(Boolean);
}

(async () => {
  try {
    const pool = await getPool();

    for (const file of toRun) {
      const full = path.join(__dirname, file);
      const text = fs.readFileSync(full, 'utf8');
      const batches = splitBatches(text);
      console.log(`\n>> ${file} (${batches.length} lotes)`);
      for (let i = 0; i < batches.length; i++) {
        await pool.request().batch(batches[i]);
        process.stdout.write(`   lote ${i + 1}/${batches.length} OK\n`);
      }
    }

    // Resumen de verificacion
    const tabs = await pool.request().query(
      "SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES " +
      "WHERE TABLE_TYPE='BASE TABLE' AND TABLE_NAME LIKE 'GD\\_%' ESCAPE '\\' ORDER BY TABLE_NAME"
    );
    const vws = await pool.request().query(
      "SELECT TABLE_NAME FROM INFORMATION_SCHEMA.VIEWS WHERE TABLE_NAME LIKE 'GD\\_%' ESCAPE '\\' ORDER BY TABLE_NAME"
    );
    const cats = await pool.request().query('SELECT COUNT(*) AS n FROM dbo.GD_CategoriaGasto');
    const tiendas = await pool.request().query('SELECT COUNT(*) AS n FROM dbo.GD_vw_Tienda');

    console.log('\n=== Verificacion ===');
    console.log('Tablas GD_*:', tabs.recordset.map((r) => r.TABLE_NAME).join(', '));
    console.log('Vistas GD_*:', vws.recordset.map((r) => r.TABLE_NAME).join(', '));
    console.log('Categorias de gasto:', cats.recordset[0].n);
    console.log('Tiendas en GD_vw_Tienda:', tiendas.recordset[0].n);
    console.log('\nMigracion completada.');
    process.exit(0);
  } catch (e) {
    console.error('\nFallo la migracion:', e.message);
    process.exit(1);
  }
})();
