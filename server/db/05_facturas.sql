-- ============================================================
-- GastosGD v2 - Workflow sobre FACTURAS DE COMPRA
-- Los gastos son facturas de compra del ERP; aquí solo guardamos
-- el estado del flujo, los soportes y las aprobaciones por factura.
-- Idempotente.
-- ============================================================

-- Estado del flujo por factura (clave: tienda + NUMSERIE+NUMFACTURA+N)
IF OBJECT_ID('dbo.GD_FacturaFlujo','U') IS NULL
CREATE TABLE dbo.GD_FacturaFlujo (
  IdFlujo            INT IDENTITY(1,1) PRIMARY KEY,
  CodTienda          INT NOT NULL,            -- EMPRESASCONTABLES.CODIGO = FACTURASCOMPRA.ENLACE_EMPRESA
  Marca              NVARCHAR(60) NULL,
  NumSerie           NVARCHAR(10) NOT NULL,
  NumFactura         INT NOT NULL,
  N                  NCHAR(1) NOT NULL,
  Estado             NVARCHAR(20) NOT NULL CONSTRAINT DF_GD_FF_Estado DEFAULT ('PENDIENTE_TESORERIA'),
  FechaActualizacion DATETIME NULL,
  FechaCreacion      DATETIME NOT NULL CONSTRAINT DF_GD_FF_FCrea DEFAULT (GETDATE()),
  CONSTRAINT UQ_GD_FF UNIQUE (CodTienda, NumSerie, NumFactura, N),
  CONSTRAINT CK_GD_FF_Estado CHECK (Estado IN
    ('PENDIENTE_TESORERIA','PENDIENTE_AUDITORIA','APROBADO','RECHAZADO','DEVUELTO','PAGADO'))
);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name='IX_GD_FF_Estado')
  CREATE INDEX IX_GD_FF_Estado ON dbo.GD_FacturaFlujo(Estado);
GO

-- Soportes (fotos/documentos) por factura
IF OBJECT_ID('dbo.GD_FacturaAdjunto','U') IS NULL
CREATE TABLE dbo.GD_FacturaAdjunto (
  IdAdjunto      INT IDENTITY(1,1) PRIMARY KEY,
  IdFlujo        INT NOT NULL,
  Tipo           NVARCHAR(20)  NOT NULL CONSTRAINT DF_GD_FA_Tipo DEFAULT ('SOPORTE'),
  RutaArchivo    NVARCHAR(400) NOT NULL,
  NombreOriginal NVARCHAR(200) NULL,
  Mime           NVARCHAR(100) NULL,
  Tamano         INT NULL,
  FechaSubida    DATETIME NOT NULL CONSTRAINT DF_GD_FA_Fecha DEFAULT (GETDATE()),
  CONSTRAINT FK_GD_FA_Flujo FOREIGN KEY (IdFlujo) REFERENCES dbo.GD_FacturaFlujo(IdFlujo) ON DELETE CASCADE,
  CONSTRAINT CK_GD_FA_Tipo CHECK (Tipo IN ('FACTURA','SOPORTE','FOTO','OTRO'))
);
GO

-- Historial de aprobaciones por factura
IF OBJECT_ID('dbo.GD_FacturaAprobacion','U') IS NULL
CREATE TABLE dbo.GD_FacturaAprobacion (
  IdAprobacion INT IDENTITY(1,1) PRIMARY KEY,
  IdFlujo      INT NOT NULL,
  Etapa        NVARCHAR(20)  NOT NULL,
  IdUsuario    INT NOT NULL,
  Decision     NVARCHAR(20)  NOT NULL,
  Comentario   NVARCHAR(500) NULL,
  Fecha        DATETIME NOT NULL CONSTRAINT DF_GD_FAp_Fecha DEFAULT (GETDATE()),
  CONSTRAINT FK_GD_FAp_Flujo   FOREIGN KEY (IdFlujo)   REFERENCES dbo.GD_FacturaFlujo(IdFlujo) ON DELETE CASCADE,
  CONSTRAINT FK_GD_FAp_Usuario FOREIGN KEY (IdUsuario) REFERENCES dbo.GD_Usuario(IdUsuario),
  CONSTRAINT CK_GD_FAp_Etapa    CHECK (Etapa IN ('TESORERIA','AUDITORIA')),
  CONSTRAINT CK_GD_FAp_Decision CHECK (Decision IN ('APROBADO','RECHAZADO','DEVUELTO'))
);
GO

-- Disponibilidad de fondos por tienda (v2, por CodTienda)
IF OBJECT_ID('dbo.GD_DispTienda','U') IS NULL
CREATE TABLE dbo.GD_DispTienda (
  IdDisp          INT IDENTITY(1,1) PRIMARY KEY,
  CodTienda       INT NOT NULL,
  Fecha           DATE NOT NULL,
  CodMoneda       INT NOT NULL CONSTRAINT DF_GD_DT_Mon DEFAULT (2),
  MontoDisponible DECIMAL(18,2) NOT NULL,
  IdUsuario       INT NOT NULL,
  FechaRegistro   DATETIME NOT NULL CONSTRAINT DF_GD_DT_Fecha DEFAULT (GETDATE()),
  CONSTRAINT UQ_GD_DT UNIQUE (CodTienda, Fecha, CodMoneda),
  CONSTRAINT FK_GD_DT_Usuario FOREIGN KEY (IdUsuario) REFERENCES dbo.GD_Usuario(IdUsuario)
);
GO
