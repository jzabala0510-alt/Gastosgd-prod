# GastosGD — Plan de trabajo

Sistema interno de **validación y aprobación de gastos por tienda** para el grupo (Venezuela).

> **⚠️ Cambio de enfoque (v2):** los gastos **no se registran a mano** → son **facturas de compra** (`FACTURASCOMPRA`) leídas del ERP, **multi-marca por zona**, que entran **automáticamente** al flujo. La jerarquía **Zona→Tienda** sale de `GENERAL.EMPRESASCONTABLES`. La capa de lectura ya está construida (`/api/jerarquia/*`, `/api/facturas`). El overlay de workflow (estado/adjuntos/aprobaciones/cobertura) se reusa de la v1 pero se re-asocia a la factura. Localmente solo la marca **ARDENE** tiene facturas; el resto están en el server remoto.
>
> **Estado v2 (✅ MVP navegable):** backend (jerarquía + facturas + overlay de flujo `GD_FacturaFlujo`/`GD_FacturaAdjunto`/`GD_FacturaAprobacion`/`GD_DispTienda` + cobertura) y frontend (Zona→Tienda→facturas, detalle de factura, bandejas Tesorería/Auditoría) **completos y verificados end-to-end**. Pendiente: scope por analista, paginación de facturas, conexión al server remoto `172.16.20.30` para multi-marca real, y limpieza de las piezas v1.

## 1. Objetivo

Permitir que cada tienda registre sus gastos (con soportes: facturas, fotos, documentos) y que pasen por un **flujo de aprobación de 3 etapas** — Analista → Tesorería → Auditor — manteniendo todo el control dentro de la base de datos del ERP de la empresa.

## 2. Roles y flujo

| Rol | Función |
|---|---|
| **Analista** (por tienda) | Carga el gasto + datos + adjuntos (fotos/facturas/documentos). Envía a revisión. Solo ve **sus** tiendas. |
| **Tesorería** | Revisa los fondos disponibles **de esa tienda** (monto que captura a mano ese día) y ve qué gastos cubre ese monto. Aprueba (→ Auditoría) o devuelve. |
| **Auditor** | Revisa todo (datos del analista + adjuntos + validación de Tesorería) y **aprueba** el gasto en definitiva, o lo devuelve/rechaza. |
| **Admin** | Gestiona usuarios, ámbitos y catálogos. |

**Máquina de estados del gasto:**

```
BORRADOR → ENVIADO → EN_TESORERIA ─┬─→ VALIDADO → EN_AUDITORIA ─┬─→ APROBADO → (PAGADO)
                                   └─→ DEVUELTO / RECHAZADO       └─→ DEVUELTO / RECHAZADO
```

## 3. Stack

- **Backend:** Node.js + Express + driver `mssql`.
- **Frontend:** Vue 3 + Vite + Pinia + Vue Router + Axios.
- **Base de datos:** SQL Server (la BD `Ardene` del ERP — ICG).
- **Auth:** contra los usuarios ICG de la BD `GENERAL` (cifrado ICG sobre `USUARIOS.NEWPASS`) + JWT. El rol GastosGD se guarda mapeado al usuario ICG.
- Ejecución conjunta con `concurrently`.

## 4. Decisiones clave

- **Una sola base de datos.** No se crea una BD aparte. Las tablas nuevas viven **dentro de `Ardene`** con prefijo **`GD_`** y nunca se modifican las tablas nativas del ERP (solo lectura sobre ellas).
- **Jerarquía leída en vivo** del ERP (sin sincronización):
  - **País** = `ALMACEN.CODPAIS` / `PAISES` (Venezuela = `VE`)
  - **Marca** = `MARCA` (única: ARDENE)
  - **Zona** = `ALMACEN.PROVINCIA`
  - **Tienda** = `ALMACEN` (ej. "Ardene Sambil")
  - **Empresa contable** = `ALMACEN.CODEMPRESACONTABLE`
- **Fondos de Tesorería sin API de banco:** Tesorería captura el **monto disponible** de la tienda (por día) y el sistema calcula **qué gastos cubre** ese monto.
- **Multimoneda:** gastos en Bs y USD. Tasa del día para comparar cobertura.
- **Adjuntos:** se guardan en **disco del servidor** (carpeta configurable); en la BD solo la ruta/metadata. (Ubicación final por confirmar.)
- **Login contra ICG/GENERAL:** los empleados entran con su usuario del ERP, validado en `GENERAL.USUARIOS` con el cifrado ICG (no se guardan contraseñas). `GENERAL.EMPRESAS` tiene las **33 marcas** del grupo; **ARDENE = CODEMPRESA 25**. El rol (Analista/Tesorería/Auditor) se asigna en `GD_Usuario`. Modelo de referencia: `C:\Proyectos\Costo_Venezuela`.

## 5. Modelo de datos (tablas nuevas `GD_*`)

| Tabla | Contenido |
|---|---|
| `GD_Usuario` | id, **codUsuarioIcg** (→ `GENERAL.USUARIOS`), usuario, nombre, rol, activo (sin contraseña: auth contra ICG) |
| `GD_UsuarioAmbito` | usuarioId + marca/zona/tienda que puede ver (alcance del analista) |
| `GD_CategoriaGasto` | catálogo de conceptos de gasto |
| `GD_Gasto` | tienda (CODALMACEN), empresa, categoría, proveedor, fecha, descripción, montoBase, iva, total, **codMoneda**, tasa, **estado**, analistaId, fechas |
| `GD_GastoAdjunto` | gastoId, tipo (factura/soporte), rutaArchivo, nombreOriginal, mime, tamaño |
| `GD_GastoAprobacion` | gastoId, etapa (TESORERIA/AUDITORIA), usuarioId, decisión, comentario, fecha |
| `GD_DisponibilidadTienda` | codAlmacen, fecha, codMoneda, montoDisponible, usuarioId (lo captura Tesorería) |

Lectura sobre tablas del ERP (solo lectura): `MARCA`, `ALMACEN`, `PAISES`, `MONEDAS`.

## 6. Endpoints (boceto)

- **Auth:** `POST /api/auth/login`, `GET /api/auth/me`
- **Catálogos:** `GET /api/catalogos/{tiendas,marcas,zonas,empresas,categorias,monedas}`
- **Gastos:** `GET/POST /api/gastos`, `GET/PUT /api/gastos/:id`, `POST /api/gastos/:id/enviar`, `POST /api/gastos/:id/adjuntos`
- **Flujo:** `POST /api/gastos/:id/tesoreria`, `POST /api/gastos/:id/auditoria`
- **Fondos:** `POST /api/disponibilidad`, `GET /api/disponibilidad/cobertura?tienda=&fecha=`
- **Admin:** CRUD `/api/usuarios`

## 7. Pantallas

- Login
- Dashboard por rol (bandejas: *Mis gastos* / *Pendientes de Tesorería* / *Pendientes de Auditoría*)
- Formulario de gasto (selección dependiente País→Marca→Zona→Tienda + uploader de adjuntos)
- Detalle de gasto (timeline del flujo + visor de adjuntos)
- Validación de Tesorería (captura de monto disponible + tabla de cobertura)
- Auditoría (checklist de revisión)
- Admin (usuarios, catálogos)

## 8. Fases

- [x] **Fase 0 — Setup:** scaffold monorepo (server + client), conexión a `Ardene`, endpoint de salud + lectura de tiendas.
- [x] **Fase 1 — Datos:** scripts SQL de tablas `GD_*` (+ vistas de jerarquía `GD_vw_Tienda`/`GD_vw_Moneda`), catálogos por API. Migración aplicada (`npm --prefix server run db:migrate`).
- [x] **Fase 2 — Auth:** login contra `GENERAL.USUARIOS` (cifrado ICG) + JWT, rol en `GD_Usuario`, ámbito por tienda, middleware `authenticate`/`requireRol`, pantalla de Login + guard de rutas. Verificado end-to-end.
- [x] **Fase 3 — Gastos (Analista):** CRUD de gastos (`/api/gastos`) + uploader de adjuntos (multer, servidos en `/api/uploads`) + formulario con tienda/categoría/multimoneda/IVA + lista "Mis gastos" + detalle con timeline + enviar a Tesorería. Scope por tienda. Verificado end-to-end (API + navegador).
- [x] **Fase 4 — Flujo de aprobación:** bandejas de Tesorería (captura de monto disponible + cobertura de fondos) y Auditoría, acciones aprobar/devolver/rechazar (`/tesoreria`, `/auditoria`), disponibilidad/cobertura (`/api/disponibilidad`), estados + timeline + comentarios. Verificado end-to-end (API + navegador).
- [ ] **Fase 5 — Dashboards:** indicadores, filtros, exportación. ← *siguiente*
- [ ] **Fase 6 — Pulido + QA:** validaciones, estilo, prueba end-to-end.

**Estimado MVP:** ~2–3 semanas de trabajo efectivo.

## 9. Notas / riesgos

- La BD `Ardene` local es un **modelo de pruebas**, no producción.
- `FACTURASVENTA` son **facturas de venta**, NO la jerarquía de tiendas (la jerarquía sale de `MARCA`/`ALMACEN`).
- Al pasar a producción: revisar permisos del usuario SQL (idealmente uno dedicado con solo lo necesario, no `sa`), y reconfirmar dónde se guardan los adjuntos.
