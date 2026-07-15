-- ============================================================
-- GastosGD - Esquema (tablas GD_*) dentro de la BD del ERP (Ardene)
-- Idempotente: se puede re-ejecutar sin error.
-- Nunca modifica tablas nativas del ERP (solo las lee via vistas).
-- ============================================================

-- ---------- GD_Usuario ----------
-- Usuario GastosGD: NO guarda contrasena. Se autentica contra GENERAL.USUARIOS (ICG)
-- y aqui solo se mapea el usuario ICG a su rol en la app.
IF OBJECT_ID('dbo.GD_Usuario','U') IS NULL
CREATE TABLE dbo.GD_Usuario (
  IdUsuario      INT IDENTITY(1,1) PRIMARY KEY,
  CodUsuarioIcg  INT           NULL,        -- GENERAL.USUARIOS.CODUSUARIO
  Usuario        NVARCHAR(50)  NULL,        -- login ICG (snapshot)
  Nombre         NVARCHAR(100) NULL,
  Rol            NVARCHAR(20)  NOT NULL,
  Activo         BIT           NOT NULL CONSTRAINT DF_GD_Usuario_Activo DEFAULT (1),
  FechaCreacion  DATETIME      NOT NULL CONSTRAINT DF_GD_Usuario_Fecha DEFAULT (GETDATE()),
  CONSTRAINT UQ_GD_Usuario_Icg UNIQUE (CodUsuarioIcg),
  CONSTRAINT CK_GD_Usuario_Rol CHECK (Rol IN ('ANALISTA','TESORERIA','AUDITOR','ADMIN'))
);
GO

-- ---------- GD_UsuarioAmbito (alcance: que tiendas/zonas ve cada usuario) ----------
IF OBJECT_ID('dbo.GD_UsuarioAmbito','U') IS NULL
CREATE TABLE dbo.GD_UsuarioAmbito (
  IdAmbito    INT IDENTITY(1,1) PRIMARY KEY,
  IdUsuario   INT NOT NULL,
  CodAlmacen  NVARCHAR(3)  NULL,   -- tienda especifica (NULL = no restringe por tienda)
  Zona        NVARCHAR(30) NULL,   -- provincia
  CodMarca    INT NULL,
  CONSTRAINT FK_GD_UsuarioAmbito_Usuario FOREIGN KEY (IdUsuario)
    REFERENCES dbo.GD_Usuario(IdUsuario) ON DELETE CASCADE
);
GO

-- ---------- GD_CategoriaGasto ----------
IF OBJECT_ID('dbo.GD_CategoriaGasto','U') IS NULL
CREATE TABLE dbo.GD_CategoriaGasto (
  IdCategoria INT IDENTITY(1,1) PRIMARY KEY,
  Nombre      NVARCHAR(60) NOT NULL,
  Activo      BIT NOT NULL CONSTRAINT DF_GD_Categoria_Activo DEFAULT (1),
  CONSTRAINT UQ_GD_Categoria_Nombre UNIQUE (Nombre)
);
GO

-- ---------- GD_Gasto ----------
IF OBJECT_ID('dbo.GD_Gasto','U') IS NULL
CREATE TABLE dbo.GD_Gasto (
  IdGasto            INT IDENTITY(1,1) PRIMARY KEY,
  CodAlmacen         NVARCHAR(3)   NOT NULL,   -- tienda (ALMACEN.CODALMACEN)
  CodEmpresa         INT           NULL,       -- snapshot de CODEMPRESACONTABLE
  IdCategoria        INT           NULL,
  Proveedor          NVARCHAR(120) NULL,
  NumeroFactura      NVARCHAR(40)  NULL,       -- factura del proveedor
  FechaGasto         DATE          NOT NULL,
  Descripcion        NVARCHAR(400) NULL,
  MontoBase          DECIMAL(18,2) NOT NULL CONSTRAINT DF_GD_Gasto_Base  DEFAULT (0),
  MontoIva           DECIMAL(18,2) NOT NULL CONSTRAINT DF_GD_Gasto_Iva   DEFAULT (0),
  MontoTotal         DECIMAL(18,2) NOT NULL CONSTRAINT DF_GD_Gasto_Total DEFAULT (0),
  CodMoneda          INT           NOT NULL CONSTRAINT DF_GD_Gasto_Moneda DEFAULT (2), -- 2 = USD (principal)
  Tasa               DECIMAL(18,6) NOT NULL CONSTRAINT DF_GD_Gasto_Tasa   DEFAULT (1), -- tasa a moneda base
  Estado             NVARCHAR(20)  NOT NULL CONSTRAINT DF_GD_Gasto_Estado DEFAULT ('BORRADOR'),
  IdAnalista         INT           NOT NULL,
  FechaCreacion      DATETIME      NOT NULL CONSTRAINT DF_GD_Gasto_FCrea  DEFAULT (GETDATE()),
  FechaEnvio         DATETIME      NULL,
  FechaActualizacion DATETIME      NULL,
  CONSTRAINT FK_GD_Gasto_Categoria FOREIGN KEY (IdCategoria) REFERENCES dbo.GD_CategoriaGasto(IdCategoria),
  CONSTRAINT FK_GD_Gasto_Analista  FOREIGN KEY (IdAnalista)  REFERENCES dbo.GD_Usuario(IdUsuario),
  CONSTRAINT CK_GD_Gasto_Estado CHECK (Estado IN
    ('BORRADOR','PENDIENTE_TESORERIA','PENDIENTE_AUDITORIA','APROBADO','RECHAZADO','DEVUELTO','PAGADO'))
);
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_GD_Gasto_Estado')
  CREATE INDEX IX_GD_Gasto_Estado ON dbo.GD_Gasto(Estado);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_GD_Gasto_Almacen')
  CREATE INDEX IX_GD_Gasto_Almacen ON dbo.GD_Gasto(CodAlmacen);
GO

-- ---------- GD_GastoAdjunto (fotos, facturas, documentos) ----------
IF OBJECT_ID('dbo.GD_GastoAdjunto','U') IS NULL
CREATE TABLE dbo.GD_GastoAdjunto (
  IdAdjunto      INT IDENTITY(1,1) PRIMARY KEY,
  IdGasto        INT NOT NULL,
  Tipo           NVARCHAR(20)  NOT NULL CONSTRAINT DF_GD_Adj_Tipo DEFAULT ('SOPORTE'),
  RutaArchivo    NVARCHAR(400) NOT NULL,
  NombreOriginal NVARCHAR(200) NULL,
  Mime           NVARCHAR(100) NULL,
  Tamano         INT NULL,
  FechaSubida    DATETIME NOT NULL CONSTRAINT DF_GD_Adj_Fecha DEFAULT (GETDATE()),
  CONSTRAINT FK_GD_Adj_Gasto FOREIGN KEY (IdGasto) REFERENCES dbo.GD_Gasto(IdGasto) ON DELETE CASCADE,
  CONSTRAINT CK_GD_Adj_Tipo CHECK (Tipo IN ('FACTURA','SOPORTE','FOTO','OTRO'))
);
GO

-- ---------- GD_GastoAprobacion (historial del flujo) ----------
IF OBJECT_ID('dbo.GD_GastoAprobacion','U') IS NULL
CREATE TABLE dbo.GD_GastoAprobacion (
  IdAprobacion INT IDENTITY(1,1) PRIMARY KEY,
  IdGasto      INT NOT NULL,
  Etapa        NVARCHAR(20)  NOT NULL,   -- TESORERIA, AUDITORIA
  IdUsuario    INT NOT NULL,
  Decision     NVARCHAR(20)  NOT NULL,   -- APROBADO, RECHAZADO, DEVUELTO
  Comentario   NVARCHAR(500) NULL,
  Fecha        DATETIME NOT NULL CONSTRAINT DF_GD_Aprob_Fecha DEFAULT (GETDATE()),
  CONSTRAINT FK_GD_Aprob_Gasto   FOREIGN KEY (IdGasto)   REFERENCES dbo.GD_Gasto(IdGasto) ON DELETE CASCADE,
  CONSTRAINT FK_GD_Aprob_Usuario FOREIGN KEY (IdUsuario) REFERENCES dbo.GD_Usuario(IdUsuario),
  CONSTRAINT CK_GD_Aprob_Etapa    CHECK (Etapa IN ('TESORERIA','AUDITORIA')),
  CONSTRAINT CK_GD_Aprob_Decision CHECK (Decision IN ('APROBADO','RECHAZADO','DEVUELTO'))
);
GO

-- ---------- GD_DisponibilidadTienda (fondos que captura Tesoreria) ----------
IF OBJECT_ID('dbo.GD_DisponibilidadTienda','U') IS NULL
CREATE TABLE dbo.GD_DisponibilidadTienda (
  IdDisponibilidad INT IDENTITY(1,1) PRIMARY KEY,
  CodAlmacen       NVARCHAR(3) NOT NULL,
  Fecha            DATE NOT NULL,
  CodMoneda        INT NOT NULL CONSTRAINT DF_GD_Disp_Moneda DEFAULT (2),
  MontoDisponible  DECIMAL(18,2) NOT NULL,
  IdUsuario        INT NOT NULL,
  FechaRegistro    DATETIME NOT NULL CONSTRAINT DF_GD_Disp_Fecha DEFAULT (GETDATE()),
  CONSTRAINT FK_GD_Disp_Usuario FOREIGN KEY (IdUsuario) REFERENCES dbo.GD_Usuario(IdUsuario),
  CONSTRAINT UQ_GD_Disp UNIQUE (CodAlmacen, Fecha, CodMoneda)
);
GO

-- ============================================================
-- Vistas de jerarquia (solo lectura sobre tablas del ERP)
-- ============================================================

IF OBJECT_ID('dbo.GD_vw_Tienda','V') IS NOT NULL DROP VIEW dbo.GD_vw_Tienda;
GO
CREATE VIEW dbo.GD_vw_Tienda AS
SELECT
  a.CODALMACEN                  AS CodAlmacen,
  LTRIM(RTRIM(a.NOMBREALMACEN)) AS Tienda,
  a.PROVINCIA                   AS Zona,
  a.CODPAIS                     AS CodPais,
  LTRIM(RTRIM(p.DESCRIPCION))   AS Pais,
  a.CODEMPRESACONTABLE          AS CodEmpresa,
  a.CENTROCOSTE                 AS CentroCoste,
  mk.CODMARCA                   AS CodMarca,
  LTRIM(RTRIM(mk.DESCRIPCION))  AS Marca,
  CASE WHEN a.CODALMACEN LIKE 'T_V' THEN 1 ELSE 0 END AS EsTiendaVenta
FROM dbo.ALMACEN a
LEFT JOIN dbo.PAISES p ON p.CODPAIS COLLATE DATABASE_DEFAULT = a.CODPAIS COLLATE DATABASE_DEFAULT
CROSS JOIN (SELECT TOP 1 CODMARCA, DESCRIPCION FROM dbo.MARCA ORDER BY CODMARCA) mk;
GO

IF OBJECT_ID('dbo.GD_vw_Moneda','V') IS NOT NULL DROP VIEW dbo.GD_vw_Moneda;
GO
CREATE VIEW dbo.GD_vw_Moneda AS
SELECT
  CODMONEDA                 AS CodMoneda,
  LTRIM(RTRIM(DESCRIPCION)) AS Descripcion,
  LTRIM(RTRIM(INICIALES))   AS Iniciales,
  CODIGOISO                 AS Iso,
  CASE WHEN PRINCIPAL = 'T' THEN 1 ELSE 0 END AS EsPrincipal,
  COTDEF                    AS Cotizacion
FROM dbo.MONEDAS;
GO
