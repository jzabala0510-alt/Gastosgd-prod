# Fase 0 — Reconciliación de saldos (solo lectura)

Mide qué tan bien mapean las **tiendas** del Excel de saldos contra
`GENERAL.EMPRESASCONTABLES`, y verifica que los **bancos** del Excel existan en
el catálogo `GD_Banco`. **No escribe nada en la base ni modifica la app.**

## Qué contiene

- `reconciliar_saldos.js` — script Node (usa `mssql`, ya instalado por la app).
- `saldos_input.json` — lista de tiendas + bancos extraída del Excel
  (`07.- SALDOS DISPONIBLES EN BANCO GD JULIO 2026.xlsx`, hoja BANCO TIENDAS).
- `reconciliacion_resultado.csv` — se genera al correr; es el reporte para revisar.

## Cómo correrlo en el servidor

1. Copia la carpeta `tools/` dentro de `server/` en el servidor (junto a `src/`).
2. Asegúrate de que `server/.env` apunte a la base real (la misma que usa la app).
3. Desde la carpeta `server/`:

   ```
   node tools/reconciliacion/reconciliar_saldos.js
   ```

4. Lee el resumen en consola y abre `reconciliacion_resultado.csv` (Excel) para
   revisar fila por fila. Está **ordenado de peor a mejor match**, así que arriba
   quedan los casos a decidir a mano.

## Cómo leer el resultado

- **EXACTA / FUERTE** → mapeo automático confiable.
- **DUDOSA** → hay candidata pero hay que confirmarla (mira `desc_erp`, `zona_erp`).
- **SIN_MATCH** → no se halló candidata. Ojo: muchos de estos son filas
  administrativas / holdings (ADM, CAFETÍN, "EMPRESAS", etc.) que **no son
  tiendas** y no deberían mapear.
- Columna `marca_ok = NO` → la marca del ERP no coincide con la del Excel; a
  veces es solo una etiqueta distinta (TCP vs THE CHILDREN'S PLACE), a veces es
  un match equivocado. Revísalo.

Este reporte es la base para la **Fase 1** (tabla de equivalencias confirmada).
El script no decide nada solo: solo mide y propone.
