-- ============================================================
-- GastosGD 12 - Alcance por zona (ámbito de usuario)
-- El supervisor (ADMIN) puede limitar a un usuario a una o varias
-- zonas. Reusa GD_UsuarioAmbito.Zona (ya existía, sin uso). Sin
-- filas de zona = ve todas (comportamiento actual). Idempotente.
-- ============================================================

-- La tabla GD_UsuarioAmbito ya se crea en 01_schema/migracion_servidor.
-- Aquí solo aseguramos ancho suficiente en Zona e índice de búsqueda.
IF (SELECT max_length FROM sys.columns
    WHERE object_id = OBJECT_ID('dbo.GD_UsuarioAmbito') AND name = 'Zona') < 120  -- 60 NVARCHAR = 120 bytes
  ALTER TABLE dbo.GD_UsuarioAmbito ALTER COLUMN Zona NVARCHAR(60) NULL;
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_GD_UA_Usuario')
  CREATE INDEX IX_GD_UA_Usuario ON dbo.GD_UsuarioAmbito(IdUsuario);
GO
