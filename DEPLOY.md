# Despliegue a producción — GastosGD

Todo corre en **un solo proceso**: el backend (Node/Express, puerto **3101**) sirve la API
**y** el frontend ya compilado. No hace falta nginx/IIS ni un segundo servidor (opcional, ver final).

Modelo de datos (mismo servidor SQL):
- **GASTOSGD** → tablas propias de la app (este proyecto las crea).
- **GENERAL** → usuarios y empresas del ERP (solo lectura).
- **\<marcas\>** → facturas de compra de cada marca (solo lectura, vía PATHBD).

---

## Requisitos en el servidor
- **Node.js 18+** instalado.
- Acceso al **SQL Server** de producción (donde están GENERAL y las marcas).
- (Recomendado) **PM2** para dejar el backend como servicio: `npm i -g pm2`.

---

## 1. Base de datos
Conéctate al SQL Server de producción (SSMS) y ejecuta:

```
server/db/migracion_servidor.sql
```

Crea la BD **GASTOSGD** + las 10 tablas + el catálogo de bancos + el mapeo de alias de
saldos (idempotente, se puede re-correr). Al final verifica que aparezcan las 10 tablas
y los 11 bancos. Si el login admin no es `REDESIP`, ajusta el paso 7 del script.

---

## 2. Copiar el proyecto
Copia las carpetas **`server/`** y **`client/`** al servidor, manteniendo la estructura
(una al lado de la otra). **No copies** `node_modules` (se reinstala).

---

## 3. Configurar el backend
Edita **`server/.env`** con los datos de producción:

```
PORT=3101
DB_SERVER=172.16.20.30        # IP/host del SQL Server de producción
DB_PORT=1433
DB_USER=sa
DB_PASSWORD=********          # contraseña real
DB_NAME=GASTOSGD             # BD propia de la app
DB_GENERAL=GENERAL
DB_FORCE_HOST=172.16.20.30   # todas las marcas conectan a este server
DB_ENCRYPT=true              # ponlo en false si el server no exige cifrado
DB_TRUST_CERT=true
JWT_SECRET=<cadena-larga-aleatoria>   # ¡CÁMBIALA! es la firma de los tokens
JWT_EXPIRES=8h
UPLOAD_DIR=./uploads
```

---

## 4. Compilar el frontend
```
cd client
npm install
npm run build          # genera client/dist (estáticos)
```

> Si el frontend va a vivir en otra ruta, define `CLIENT_DIST` en el `.env` del backend
> apuntando a la carpeta `dist`.

---

## 5. Instalar y arrancar el backend
```
cd server
npm install
```

Arranque simple (para una primera prueba):
```
node src/index.js
```

Arranque como servicio (recomendado en producción):
```
pm2 start src/index.js --name gastosgd
pm2 save
pm2 startup            # para que reinicie al reiniciar el servidor
```

Al iniciar verás en consola:
- `✅ ... Conectado` (BD)
- `[server] Frontend servido desde ...\client\dist`
- `[server] API escuchando en http://localhost:3101`

---

## 6. Probar
1. Abre **http://\<IP-del-servidor\>:3101** desde un navegador en la red.
2. Inicia sesión con un usuario **ADMIN** (ej. REDESIP) usando su clave de ICG.
3. Entra a **Usuarios** → asigna roles a las personas reales (Analista, Tesorería, Auditor, Pagos).
4. Recorre el flujo con una factura: Analista → Tesorería → Auditoría → Pagos (sube comprobante) → Pagadas.

---

## Notas y mantenimiento
- **Puerto:** el backend escucha en `3101` y sirve toda la app. Si quieres acceder por
  el puerto 80 o un dominio, pon nginx/IIS como *reverse proxy* hacia `localhost:3101`.
- **Adjuntos/comprobantes:** se guardan en `server/uploads/`. Asegura permisos de escritura
  y respáldala (no se borra al actualizar el código).
- **Actualizar versión:** reemplaza el código, `npm install` si cambió algo, recompila el
  front (`npm run build`) y `pm2 restart gastosgd`.
- **Solo entran usuarios con rol** asignado en el panel; el resto de GENERAL queda fuera.
- **Diagnóstico:** `GET http://<servidor>:3101/api/health` devuelve el estado de la API y la BD.
