-- ============================================================
-- GastosGD - Fase 2: Auth ligada a usuarios ICG (GENERAL.USUARIOS)
-- Migra GD_Usuario del esquema viejo (con password) al nuevo (ICG).
-- Idempotente.
-- ============================================================

-- Quitar restricciones/columnas del esquema viejo si existen
IF EXISTS (SELECT 1 FROM sys.objects WHERE name = 'UQ_GD_Usuario_Email' AND parent_object_id = OBJECT_ID('dbo.GD_Usuario'))
  ALTER TABLE dbo.GD_Usuario DROP CONSTRAINT UQ_GD_Usuario_Email;
GO
IF COL_LENGTH('dbo.GD_Usuario','Email') IS NOT NULL
  ALTER TABLE dbo.GD_Usuario DROP COLUMN Email;
GO
IF COL_LENGTH('dbo.GD_Usuario','PasswordHash') IS NOT NULL
  ALTER TABLE dbo.GD_Usuario DROP COLUMN PasswordHash;
GO

-- Agregar columnas del esquema nuevo si faltan
IF COL_LENGTH('dbo.GD_Usuario','CodUsuarioIcg') IS NULL
  ALTER TABLE dbo.GD_Usuario ADD CodUsuarioIcg INT NULL;
GO
IF COL_LENGTH('dbo.GD_Usuario','Usuario') IS NULL
  ALTER TABLE dbo.GD_Usuario ADD Usuario NVARCHAR(50) NULL;
GO
IF NOT EXISTS (SELECT 1 FROM sys.objects WHERE name = 'UQ_GD_Usuario_Icg' AND parent_object_id = OBJECT_ID('dbo.GD_Usuario'))
  ALTER TABLE dbo.GD_Usuario ADD CONSTRAINT UQ_GD_Usuario_Icg UNIQUE (CodUsuarioIcg);
GO

-- Seed de roles demo: usuarios ICG reales con acceso a ARDENE (CODEMPRESA 25)
MERGE dbo.GD_Usuario AS t
USING (VALUES
  (1,   N'Redesip',         N'ADMIN'),
  (227, N'ABRAHAM ROJAS',   N'ANALISTA'),
  (153, N'AILEXYS NAVARRO', N'TESORERIA'),
  (249, N'ALBERT MORALES',  N'AUDITOR')
) AS s(Cod, Usr, Rol)
ON t.CodUsuarioIcg = s.Cod
WHEN NOT MATCHED THEN
  INSERT (CodUsuarioIcg, Usuario, Nombre, Rol, Activo)
  VALUES (s.Cod, s.Usr, s.Usr, s.Rol, 1);
GO

-- Ambito demo: el analista (ABRAHAM ROJAS) ve la tienda TCV (Ardene Sambil Caracas)
IF NOT EXISTS (
  SELECT 1 FROM dbo.GD_UsuarioAmbito a
  INNER JOIN dbo.GD_Usuario u ON u.IdUsuario = a.IdUsuario
  WHERE u.CodUsuarioIcg = 227 AND a.CodAlmacen = 'TCV'
)
  INSERT INTO dbo.GD_UsuarioAmbito (IdUsuario, CodAlmacen)
  SELECT IdUsuario, 'TCV' FROM dbo.GD_Usuario WHERE CodUsuarioIcg = 227;
GO
