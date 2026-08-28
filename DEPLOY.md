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
- **NSSM** para dejar el backend como servicio de Windows (así lo corre producción
  hoy — el actualizador depende de que algo externo relance el proceso tras un
  `process.exit`, y en este servidor ese "algo" es NSSM, no PM2).

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

**Marca en un servidor SQL distinto (con su propia clave):** si alguna marca vive en
un servidor físicamente distinto al de arriba, y con un usuario/clave propios, crea
`server/servers-extra.json` (copia `servers-extra.example.json`) con ese host y sus
credenciales. `port`, `instance` y `databases` son opcionales (solo hacen falta si
ese servidor usa un puerto distinto de 1433, una instancia con nombre, o quieres
dejar anotado qué aloja):
```json
{
  "10.0.0.11": { "user": "sa_esa_marca", "password": "clave_esa_marca", "databases": "MARCA_2" },
  "172.30.1.5": { "user": "ICGAdmin", "password": "clave_esa_marca", "port": 62527, "databases": "LCWAIKIKIVE" }
}
```
> ⚠ **No pongas `instance` junto con `port`.** Si el servidor usa una instancia con
> nombre, la librería `mssql`/tedious IGNORA el `port` que le des y en su lugar
> resuelve el puerto vía "SQL Browser" (UDP 1434) — si ese servicio está bloqueado
> (lo más común), la conexión da timeout. Si ya tienes el puerto exacto (como en el
> ejemplo de arriba), no pongas `instance`: conecta directo, sin pasar por SQL Browser.

**El nombre de la base de datos para conectar NO se define aquí** — sigue viniendo
del `PATHBD` de esa marca en `GENERAL.EMPRESAS` (ej. `172.30.1.5:LCWAIKIKIVE`),
exactamente igual que para cualquier otra marca. `databases` en este archivo es
solo un recordatorio informativo (se imprime en consola al arrancar) para
verificar de un vistazo que cada servidor tiene lo que esperas — el código nunca
lo usa para decidir a qué host conectarse.

Este archivo NO se sube al repo (va en `.gitignore`, igual que `.env`) — se crea a
mano en cada servidor que lo necesite. Cualquier host que no aparezca ahí sigue
usando `DB_USER`/`DB_PASSWORD` de arriba, sin ningún cambio.

**Marca cuya GENERAL es una instalación ICG separada (no la GENERAL compartida de
arriba):** pasa esto además — algunos servidores nuevos no son solo "otra BD de
datos", son una instalación ICG completa e independiente, con su propia BD
`EMPRESAS`/`EMPRESASCONTABLES` (típicamente también llamada `GENERAL`, pero en ESE
servidor). Ahí `EMPRESASCONTABLES.CODIGO` (el `codTienda`) empieza de nuevo desde 1
y choca con el de la GENERAL principal. Para esos casos, agrega un bloque `general`
a la entrada de ese host:
```json
{
  "172.30.1.5": {
    "user": "ICGAdmin", "password": "clave_real", "port": 62527, "databases": "LCWAIKIKIVE",
    "general": { "database": "GENERAL", "marca": "LC WAIKIKI VEN", "offset": 20000 }
  }
}
```
- `database`: nombre de la BD tipo-GENERAL en ese servidor.
- `marca`: opcional — solo hace falta si esa GENERAL tiene MÁS de una empresa
  registrada (instalaciones de prueba, marcas ajenas, etc.) y hay que quedarse
  con una sola. Debe coincidir EXACTO (sin espacios de más) con el `TITULO` de
  esa empresa en la tabla `EMPRESAS` de esa misma GENERAL — así se filtran sus
  tiendas en `EMPRESASCONTABLES.DIRECCION`, igual que ya hace GastosGD para
  matchear marca en la GENERAL principal (`EMPRESASCONTABLES` no tiene columna
  `CODEMPRESA`, solo `EMPRESAS` la tiene). Si esa GENERAL solo tiene una
  empresa, se puede omitir.
- `offset`: un múltiplo de 10000, **distinto para cada servidor nuevo** (10000,
  20000, 30000...) — GastosGD lo suma al `CODIGO` nativo de esa GENERAL para que
  el `codTienda` resultante no choque con el 1-391 de la principal ni con el de
  otro servidor. No cambies el offset de un servidor una vez usado en producción
  (rompería todo lo que ya se guardó con ese codTienda).

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

Arranque como servicio de Windows con NSSM (recomendado en producción):
```
nssm install gastosgd "C:\Program Files\nodejs\node.exe" "src\index.js"
nssm set gastosgd AppDirectory "<ruta-completa-a-la-carpeta-server>"
nssm start gastosgd
```
> Ajusta `gastosgd` si el servicio ya está instalado con otro nombre en tu servidor
> — confírmalo con `nssm status <nombre>` o desde `services.msc` antes de reutilizar
> estos comandos.

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
- **Actualizar versión:** normalmente vía `/actualizador` (descarga el código de GitHub y
  reinicia el servicio solo). Si actualizas a mano: reemplaza el código, `npm install`
  si cambió algo, recompila el front (`npm run build`) y `nssm restart gastosgd`.
- **Solo entran usuarios con rol** asignado en el panel; el resto de GENERAL queda fuera.
- **Diagnóstico:** `GET http://<servidor>:3101/api/health` devuelve el estado de la API y la BD.
