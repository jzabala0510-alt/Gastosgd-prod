-- ============================================================
-- GastosGD 09 - Ajuste manual de Tesorería sobre el disponible
-- Tesorería ve el total (suma de bancos cargados en Saldos) y puede
-- corregirlo si hace falta, sin tocar el desglose por banco del Analista.
-- La corrección se guarda como una diferencia (MontoAjuste) por
-- tienda/fecha; el disponible final = suma de bancos + ajuste.
-- Idempotente.
-- ============================================================

IF OBJECT_ID('dbo.GD_DispAjuste','U') IS NULL
CREATE TABLE dbo.GD_DispAjuste (
  IdAjuste      INT IDENTITY(1,1) PRIMARY KEY,
  CodTienda     INT NOT NULL,
  Fecha         DATE NOT NULL,
  MontoAjuste   DECIMAL(18,2) NOT NULL,
  IdUsuario     INT NOT NULL,
  FechaRegistro DATETIME NOT NULL CONSTRAINT DF_GD_DA_Fecha DEFAULT (GETDATE()),
  CONSTRAINT UQ_GD_DA UNIQUE (CodTienda, Fecha),
  CONSTRAINT FK_GD_DA_Usuario FOREIGN KEY (IdUsuario) REFERENCES dbo.GD_Usuario(IdUsuario)
);
GO
