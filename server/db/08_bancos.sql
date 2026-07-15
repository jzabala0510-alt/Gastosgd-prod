-- ============================================================
-- GastosGD 08 - Saldos por banco
-- Catálogo editable de bancos (GD_Banco) + desglose de GD_DispTienda
-- por banco (antes: un solo saldo total por tienda/fecha).
-- Idempotente.
-- ============================================================

-- Catálogo de bancos
IF OBJECT_ID('dbo.GD_Banco','U') IS NULL
CREATE TABLE dbo.GD_Banco (
  IdBanco       INT IDENTITY(1,1) PRIMARY KEY,
  Nombre        NVARCHAR(80) NOT NULL,
  Orden         INT NOT NULL CONSTRAINT DF_GD_Banco_Orden DEFAULT (0),
  Activo        BIT NOT NULL CONSTRAINT DF_GD_Banco_Activo DEFAULT (1),
  FechaCreacion DATETIME NOT NULL CONSTRAINT DF_GD_Banco_Fecha DEFAULT (GETDATE()),
  CONSTRAINT UQ_GD_Banco_Nombre UNIQUE (Nombre)
);
GO

-- Seed: bancos solicitados
INSERT INTO dbo.GD_Banco (Nombre, Orden)
SELECT v.Nombre, v.Orden
FROM (VALUES
  (N'BANCO MERCANTIL', 1),
  (N'BANESCO', 2),
  (N'BNC', 3),
  (N'BANCO DE VENEZUELA', 4),
  (N'BANCO FONDO COMUN', 5),
  (N'BANCO EXTERIOR', 6),
  (N'BANCO DEL SUR', 7),
  (N'BANCAMIGA', 8),
  (N'BANCO DEL TESORO', 9),
  (N'100% BANCO', 10)
) AS v(Nombre, Orden)
WHERE NOT EXISTS (SELECT 1 FROM dbo.GD_Banco b WHERE b.Nombre = v.Nombre);
GO

-- GD_DispTienda: agregar IdBanco (desglose del saldo por banco)
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.GD_DispTienda') AND name = 'IdBanco')
  ALTER TABLE dbo.GD_DispTienda ADD IdBanco INT NULL;
GO

-- Backfill de filas previas (saldo único sin banco) al primer banco del catálogo,
-- para no perder los datos ya cargados.
UPDATE dbo.GD_DispTienda
SET IdBanco = (SELECT TOP 1 IdBanco FROM dbo.GD_Banco ORDER BY Orden)
WHERE IdBanco IS NULL;
GO

IF EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.GD_DispTienda') AND name = 'IdBanco' AND is_nullable = 1)
  ALTER TABLE dbo.GD_DispTienda ALTER COLUMN IdBanco INT NOT NULL;
GO

-- La unicidad pasa a ser por tienda+fecha+moneda+banco (antes no incluía banco)
IF EXISTS (SELECT 1 FROM sys.key_constraints WHERE name = 'UQ_GD_DT')
  ALTER TABLE dbo.GD_DispTienda DROP CONSTRAINT UQ_GD_DT;
GO
IF NOT EXISTS (SELECT 1 FROM sys.key_constraints WHERE name = 'UQ_GD_DT_Banco')
  ALTER TABLE dbo.GD_DispTienda ADD CONSTRAINT UQ_GD_DT_Banco UNIQUE (CodTienda, Fecha, CodMoneda, IdBanco);
GO

IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_GD_DT_Banco')
  ALTER TABLE dbo.GD_DispTienda ADD CONSTRAINT FK_GD_DT_Banco FOREIGN KEY (IdBanco) REFERENCES dbo.GD_Banco(IdBanco);
GO
