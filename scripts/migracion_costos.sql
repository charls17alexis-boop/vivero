-- =============================================================
-- MIGRACIÓN: costo_adquisicion en plantas + tabla costos_operacion
-- Ejecutar UNA SOLA VEZ en Railway → Postgres → pestaña Query
-- =============================================================

-- 1. Agregar columna costo_adquisicion a plantas
ALTER TABLE plantas ADD COLUMN IF NOT EXISTS costo_adquisicion REAL DEFAULT 0;

-- 2. Crear tabla costos_operacion
CREATE TABLE IF NOT EXISTS costos_operacion (
  id SERIAL PRIMARY KEY,
  tipo TEXT NOT NULL CHECK (tipo IN ('directo','indirecto')),
  concepto TEXT NOT NULL,
  monto REAL NOT NULL DEFAULT 0,
  fecha TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

-- 3. Insertar costos de operación ficticios para junio 2026
INSERT INTO costos_operacion (tipo, concepto, monto, fecha) VALUES
('directo', 'Gasolina traslados', 850.00, '2026-06-01'),
('directo', 'Electricidad invernadero', 1200.00, '2026-06-01'),
('directo', 'Agua riego', 450.00, '2026-06-01'),
('indirecto', 'Renta del local', 3500.00, '2026-06-01'),
('indirecto', 'Mantenimiento equipo', 600.00, '2026-06-05'),
('indirecto', 'Flete proveedores', 780.00, '2026-06-08'),
('directo', 'Gasolina traslados', 850.00, '2026-06-10'),
('indirecto', 'Publicidad y promoción', 400.00, '2026-06-12'),
('directo', 'Sueldos temporada', 2500.00, '2026-06-15'),
('indirecto', 'Seguro del vivero', 320.00, '2026-06-18');

-- 4. Insertar adquisiciones ficticias (5 órdenes de compra)
-- NOTA: Ajustar proveedor_id según los IDs reales en tu tabla proveedores
-- Primero obtener los IDs de proveedores existentes
-- SELECT id, nombre FROM proveedores;

-- Orden 1: Vivero San Marcos — Plantas de interior
INSERT INTO adquisicion_plantas (folio, proveedor, fecha_adquisicion, total, estado, observaciones, usuario_id)
VALUES ('ADQ-2026-001', 'Vivero San Marcos', '2026-06-01', 7110, 'Recibido', 'Lote de plantas de interior para reabastecer tienda', 1);

INSERT INTO adquisicion_detalle (adquisicion_id, planta_id, cantidad, precio_unitario, subtotal) VALUES
(1, 5, 40, 38.00, 1520.00),   -- Pothos ($85 → 45% = $38)
(1, 6, 30, 55.00, 1650.00),   -- Sansevieria ($120 → 46% = $55)
(1, 7, 25, 34.00, 850.00),    -- Peperomia ($75 → 45% = $34)
(1, 1, 20, 42.00, 840.00),    -- Rosa Roja ($85 → 49% = $42)
(1, 2, 15, 150.00, 2250.00);  -- Ficus Benjamina ($320 → 47% = $150)

-- Orden 2: Plantas del Bajío — Exterior y árboles
INSERT INTO adquisicion_plantas (folio, proveedor, fecha_adquisicion, total, estado, observaciones, usuario_id)
VALUES ('ADQ-2026-002', 'Plantas del Bajío', '2026-06-03', 10975, 'Recibido', 'Surtido de árboles y plantas de exterior para temporada', 1);

INSERT INTO adquisicion_detalle (adquisicion_id, planta_id, cantidad, precio_unitario, subtotal) VALUES
(2, 8, 10, 175.00, 1750.00),  -- Ficus Lyrata ($350 → 50% = $175)
(2, 9, 20, 85.00, 1700.00),   -- Bugambilia ($180 → 47% = $85)
(2, 10, 8, 220.00, 1760.00),  -- Jacaranda ($450 → 49% = $220)
(2, 11, 15, 105.00, 1575.00), -- Laurel ($220 → 48% = $105)
(2, 17, 10, 185.00, 1850.00), -- Limonero ($380 → 49% = $185)
(2, 18, 6, 200.00, 1200.00),  -- Naranjo Enano ($420 → 48% = $200)
(2, 19, 8, 140.00, 1120.00);  -- Guayabo ($290 → 48% = $140)

-- Orden 3: Invernaderos Xalapa — Suculentas
INSERT INTO adquisicion_plantas (folio, proveedor, fecha_adquisicion, total, estado, observaciones, usuario_id)
VALUES ('ADQ-2026-003', 'Invernaderos Xalapa', '2026-06-06', 6420, 'Recibido', 'Especialidad en suculentas y cactus de alta calidad', 1);

INSERT INTO adquisicion_detalle (adquisicion_id, planta_id, cantidad, precio_unitario, subtotal) VALUES
(3, 3, 30, 72.00, 2160.00),   -- Agave Azul ($150 → 48% = $72)
(3, 13, 50, 26.00, 1300.00),  -- Echeveria ($55 → 47% = $26)
(3, 14, 25, 42.00, 1050.00),  -- Aloe Vera ($90 → 47% = $42)
(3, 15, 15, 78.00, 1170.00),  -- Cactus Barril ($160 → 49% = $78)
(3, 16, 10, 95.00, 950.00);   -- Agave Americano ($200 → 47% = $95)

-- Orden 4: Semilleros Veracruz — Flor y ornamentales
INSERT INTO adquisicion_plantas (folio, proveedor, fecha_adquisicion, total, estado, observaciones, usuario_id)
VALUES ('ADQ-2026-004', 'Semilleros Veracruz', '2026-06-10', 2990, 'Recibido', 'Plantas ornamentales para jardinería residencial', 1);

INSERT INTO adquisicion_detalle (adquisicion_id, planta_id, cantidad, precio_unitario, subtotal) VALUES
(4, 4, 20, 55.00, 1100.00),   -- Buganvilia Morada ($120 → 46% = $55)
(4, 12, 30, 30.00, 900.00),   -- Helecho de Jardín ($65 → 46% = $30)
(4, 7, 15, 34.00, 510.00),    -- Peperomia ($75 → 45% = $34)
(4, 1, 12, 40.00, 480.00);    -- Rosa Roja ($85 → 47% = $40)

-- Orden 5: Vivero Los Altos — Reposición general
INSERT INTO adquisicion_plantas (folio, proveedor, fecha_adquisicion, total, estado, observaciones, usuario_id)
VALUES ('ADQ-2026-005', 'Vivero Los Altos', '2026-06-14', 8070, 'Recibido', 'Mercancía diversa para completar inventario', 1);

INSERT INTO adquisicion_detalle (adquisicion_id, planta_id, cantidad, precio_unitario, subtotal) VALUES
(5, 6, 20, 55.00, 1100.00),   -- Sansevieria ($120 → 46% = $55)
(5, 8, 8, 175.00, 1400.00),   -- Ficus Lyrata ($350 → 50% = $175)
(5, 5, 35, 38.00, 1330.00),   -- Pothos ($85 → 45% = $38)
(5, 14, 30, 42.00, 1260.00),  -- Aloe Vera ($90 → 47% = $42)
(5, 3, 20, 72.00, 1440.00),   -- Agave Azul ($150 → 48% = $72)
(5, 13, 40, 26.00, 1040.00);  -- Echeveria ($55 → 47% = $26)

-- 5. Actualizar costo_adquisicion en plantas (usar el último costo de cada planta)
UPDATE plantas p SET costo_adquisicion = (
  SELECT ad.precio_unitario FROM adquisicion_detalle ad
  JOIN adquisicion_plantas ap ON ad.adquisicion_id = ap.id
  WHERE ad.planta_id = p.id
  ORDER BY ap.fecha_adquisicion DESC
  LIMIT 1
) WHERE EXISTS (
  SELECT 1 FROM adquisicion_detalle ad
  JOIN adquisicion_plantas ap ON ad.adquisicion_id = ap.id
  WHERE ad.planta_id = p.id
);
