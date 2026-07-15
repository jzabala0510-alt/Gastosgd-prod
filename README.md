# GastosGD

Sistema de registro, validación y aprobación de gastos por tienda (Ardene Venezuela).
Flujo de 3 etapas: **Analista → Tesorería → Auditor**.

Ver [PLAN.md](PLAN.md) para el plan completo.

## Stack

- **server/** — Node.js + Express + `mssql` (API REST)
- **client/** — Vue 3 + Vite + Pinia + Vue Router

Las tablas nuevas viven dentro de la BD `Ardene` (ERP ICG) con prefijo `GD_`.
La jerarquía País → Marca → Zona → Tienda se lee en vivo de `MARCA` / `ALMACEN`.

## Puesta en marcha (desarrollo)

```bash
# 1. Instalar dependencias (raíz + server + client)
npm run install:all

# 2. Configurar conexión: copiar server/.env.example a server/.env y ajustar

# 3. Levantar API + frontend juntos
npm run dev
```

- API: http://localhost:3101
- Frontend: http://localhost:5273 (proxy de `/api` → 3101)

## Verificación rápida

- `GET /api/health` → estado de la API + conexión a la BD
- `GET /api/catalogos/tiendas` → tiendas leídas de `ALMACEN`
