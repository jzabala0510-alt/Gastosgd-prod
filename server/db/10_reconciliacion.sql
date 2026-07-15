-- ============================================================
-- GastosGD 10 - Alias de tienda para reconciliación de saldos
-- Tabla de equivalencias NombreExcel -> CodTienda, confirmada una
-- sola vez por un admin (fuzzy matching sugiere, humano confirma).
-- + Mapeo fijo de columnas de banco del Excel (ya resuelto, sin
-- pantalla de revisión) y BANCO PROVINCIAL en el catálogo.
-- Idempotente.
-- ============================================================

-- ---------- GD_TiendaAlias ----------
IF OBJECT_ID('dbo.GD_TiendaAlias','U') IS NULL
CREATE TABLE dbo.GD_TiendaAlias (
  IdAlias        INT IDENTITY(1,1) PRIMARY KEY,
  FilaExcel      INT NULL,                  -- fila del Excel al momento de confirmar (trazabilidad)
  NombreRS1      NVARCHAR(200) NULL,        -- razón social 1 tal como vino en el Excel
  NombreRS2      NVARCHAR(200) NULL,        -- razón social 2 tal como vino en el Excel
  NormRS1        NVARCHAR(200) NULL,        -- normalizado (tokens núcleo) de NombreRS1 -> clave de re-búsqueda
  NormRS2        NVARCHAR(200) NULL,        -- normalizado (tokens núcleo) de NombreRS2 -> clave de re-búsqueda
  ZonaExcel      NVARCHAR(60)  NULL,        -- trazabilidad; no se usa una vez confirmado
  GrupoExcel     NVARCHAR(120) NULL,        -- "Grupo Económico" del Excel (~POBLACION); señal de matching, no solo trazabilidad
  MarcaExcel     NVARCHAR(60)  NULL,        -- trazabilidad; no se usa una vez confirmado
  Estado         NVARCHAR(20)  NOT NULL CONSTRAINT DF_GD_TA_Estado DEFAULT ('CONFIRMADO'),
  CodTienda      INT NULL,                  -- EMPRESASCONTABLES.CODIGO (BD GENERAL); sin FK real (cross-DB)
  ScoreOriginal  INT NULL,                  -- score 0-100 de la sugerencia al confirmar (auditoría)
  ClasifOriginal NVARCHAR(20) NULL,         -- EXACTA/FUERTE/DUDOSA/SIN_MATCH al confirmar
  IdUsuario      INT NOT NULL,
  FechaRegistro  DATETIME NOT NULL CONSTRAINT DF_GD_TA_Fecha DEFAULT (GETDATE()),
  FechaEdicion   DATETIME NULL,
  CONSTRAINT CK_GD_TA_Estado CHECK (Estado IN ('CONFIRMADO','IGNORADO')),
  CONSTRAINT CK_GD_TA_CodTienda CHECK (
    (Estado = 'IGNORADO' AND CodTienda IS NULL) OR (Estado = 'CONFIRMADO' AND CodTienda IS NOT NULL)),
  CONSTRAINT FK_GD_TA_Usuario FOREIGN KEY (IdUsuario) REFERENCES dbo.GD_Usuario(IdUsuario)
);
GO
-- Por si la tabla ya existía de una corrida anterior sin esta columna.
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.GD_TiendaAlias') AND name = 'GrupoExcel')
  ALTER TABLE dbo.GD_TiendaAlias ADD GrupoExcel NVARCHAR(120) NULL;
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'UQ_GD_TA_NormRS1')
  CREATE UNIQUE INDEX UQ_GD_TA_NormRS1 ON dbo.GD_TiendaAlias(NormRS1) WHERE NormRS1 IS NOT NULL;
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'UQ_GD_TA_NormRS2')
  CREATE UNIQUE INDEX UQ_GD_TA_NormRS2 ON dbo.GD_TiendaAlias(NormRS2) WHERE NormRS2 IS NOT NULL;
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_GD_TA_CodTienda')
  CREATE INDEX IX_GD_TA_CodTienda ON dbo.GD_TiendaAlias(CodTienda);
GO

-- ---------- BANCO PROVINCIAL en el catálogo ----------
INSERT INTO dbo.GD_Banco (Nombre, Orden)
SELECT N'BANCO PROVINCIAL', (SELECT ISNULL(MAX(Orden), 0) + 1 FROM dbo.GD_Banco)
WHERE NOT EXISTS (SELECT 1 FROM dbo.GD_Banco WHERE Nombre = N'BANCO PROVINCIAL');
GO

-- ---------- GD_BancoAlias ----------
-- Mapeo fijo columna-Excel -> banco. Ya resuelto (sub-cuentas se suman
-- al banco principal); no necesita pantalla de confirmación.
IF OBJECT_ID('dbo.GD_BancoAlias','U') IS NULL
CREATE TABLE dbo.GD_BancoAlias (
  IdAlias       INT IDENTITY(1,1) PRIMARY KEY,
  ColumnaExcel  NVARCHAR(80) NOT NULL,      -- encabezado tal cual aparece en el Excel
  ColumnaNorm   NVARCHAR(80) NOT NULL,      -- normalizado -> clave de re-búsqueda
  IdBanco       INT NOT NULL,
  FechaCreacion DATETIME NOT NULL CONSTRAINT DF_GD_BA_Fecha DEFAULT (GETDATE()),
  CONSTRAINT UQ_GD_BA_ColumnaNorm UNIQUE (ColumnaNorm),
  CONSTRAINT FK_GD_BA_Banco FOREIGN KEY (IdBanco) REFERENCES dbo.GD_Banco(IdBanco)
);
GO

-- Seed: 11 encabezados del Excel -> 9 bancos (sub-cuentas se SUMAN al principal).
-- ColumnaNorm calculado con la misma normalize() de tiendaMatcher.js (mayúsculas,
-- sin acentos, puntuación -> espacio único) para que el lookup coincida en runtime.
INSERT INTO dbo.GD_BancoAlias (ColumnaExcel, ColumnaNorm, IdBanco)
SELECT v.ColumnaExcel, v.ColumnaNorm, b.IdBanco
FROM (VALUES
  (N'BANESCO (cta Principal) NUEVA',       N'BANESCO CTA PRINCIPAL NUEVA',        N'BANESCO'),
  (N'BANCO BANESCO C/H',                   N'BANCO BANESCO C H',                  N'BANESCO'),
  (N'BANCAMIGA',                           N'BANCAMIGA',                         N'BANCAMIGA'),
  (N'BANCO PROVINCIAL',                    N'BANCO PROVINCIAL',                  N'BANCO PROVINCIAL'),
  (N'BANCO DE VENEZUELA',                  N'BANCO DE VENEZUELA',                N'BANCO DE VENEZUELA'),
  (N'100% BANCO',                          N'100 BANCO',                         N'100% BANCO'),
  (N'BANCO BNC',                           N'BANCO BNC',                         N'BNC'),
  (N'BANCO BNC  CAJA CHICA',               N'BANCO BNC CAJA CHICA',              N'BNC'),
  (N'BANCO DELSUR',                        N'BANCO DELSUR',                      N'BANCO DEL SUR'),
  (N'BANCO MERCANTIL',                     N'BANCO MERCANTIL',                   N'BANCO MERCANTIL'),
  (N'BANCO DEL Tesoro (cta gastos) NUEVA', N'BANCO DEL TESORO CTA GASTOS NUEVA', N'BANCO DEL TESORO')
) AS v(ColumnaExcel, ColumnaNorm, NombreBanco)
JOIN dbo.GD_Banco b ON b.Nombre = v.NombreBanco
WHERE NOT EXISTS (SELECT 1 FROM dbo.GD_BancoAlias a WHERE a.ColumnaNorm = v.ColumnaNorm);
GO
