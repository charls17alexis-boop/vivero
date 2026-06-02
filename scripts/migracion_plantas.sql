-- ============================================================
-- Migración: Agregar columnas de ficha técnica a tabla plantas
-- ============================================================
-- Ejecutar en Railway → Postgres → pestaña Query
-- Y también en PostgreSQL local (si usas uno)

ALTER TABLE plantas ADD COLUMN IF NOT EXISTS riego TEXT;
ALTER TABLE plantas ADD COLUMN IF NOT EXISTS luz TEXT;
ALTER TABLE plantas ADD COLUMN IF NOT EXISTS abono TEXT;
ALTER TABLE plantas ADD COLUMN IF NOT EXISTS sustrato TEXT;
ALTER TABLE plantas ADD COLUMN IF NOT EXISTS temperatura TEXT;
ALTER TABLE plantas ADD COLUMN IF NOT EXISTS plagas TEXT;
ALTER TABLE plantas ADD COLUMN IF NOT EXISTS tiempo_crecimiento TEXT;
ALTER TABLE plantas ADD COLUMN IF NOT EXISTS dificultad TEXT DEFAULT 'Fácil';

-- ============================================================
-- Insertar 15 nuevas plantas con ficha técnica completa
-- ============================================================
-- NOTA: Ajustar producto_id según los IDs reales en inventario
-- después de insertar las plantas.

-- ========== INTERIOR (4) ==========
INSERT INTO plantas (nombre, nombre_cientifico, categoria, precio, costo, stock, stock_minimo, descripcion, riego, luz, abono, sustrato, temperatura, plagas, tiempo_crecimiento, dificultad)
VALUES ('Pothos', 'Epipremnum aureum', 'Interior', 85, 35, 30, 10, 'Planta de interior fácil de cuidar, ideal para principiantes', '2 veces por semana', 'Luz indirecta media', 'Fertilizante líquido balanceado cada 15 días', 'Sustrato universal con perlita', '15°C a 30°C', 'Ácaros — limpiar hojas con agua jabonosa; Cochinilla — alcohol al 70%', 'Rápido: alcanza 1m en 3 meses', 'Fácil');

INSERT INTO plantas (nombre, nombre_cientifico, categoria, precio, costo, stock, stock_minimo, descripcion, riego, luz, abono, sustrato, temperatura, plagas, tiempo_crecimiento, dificultad)
VALUES ('Sansevieria', 'Sansevieria trifasciata', 'Interior', 120, 50, 25, 8, 'Lengua de suegra, purifica el aire', 'Cada 15-20 días', 'Luz indirecta o sombra', 'Abono para cactus cada 2 meses', 'Sustrato arenoso con buen drenaje', '10°C a 35°C', 'Pudrición de raíz — evitar exceso de riego', 'Lento: 30cm por año', 'Fácil');

INSERT INTO plantas (nombre, nombre_cientifico, categoria, precio, costo, stock, stock_minimo, descripcion, riego, luz, abono, sustrato, temperatura, plagas, tiempo_crecimiento, dificultad)
VALUES ('Peperomia', 'Peperomia obtusifolia', 'Interior', 75, 30, 3, 10, 'Planta compacta de hojas carnosas', '1 vez por semana', 'Luz indirecta brillante', 'Fertilizante NPK 10-10-10 cada mes', 'Sustrato ligero con turba', '18°C a 26°C', 'Cochinilla algodonosa — jabón potásico; Hongos — evitar encharcamiento', 'Moderado: 20cm en 6 meses', 'Intermedio');

INSERT INTO plantas (nombre, nombre_cientifico, categoria, precio, costo, stock, stock_minimo, descripcion, riego, luz, abono, sustrato, temperatura, plagas, tiempo_crecimiento, dificultad)
VALUES ('Ficus Lyrata', 'Ficus lyrata', 'Interior', 350, 180, 10, 5, 'Higuera hoja de violín, planta decorativa de gran tamaño', '2 veces por semana', 'Luz indirecta brillante', 'Fertilizante 20-20-20 cada 15 días', 'Sustrato universal con fibra de coco', '18°C a 28°C', 'Ácaros — aumentar humedad; Cochinilla — aceite de neem', 'Moderado: alcanza 2m en 2 años', 'Intermedio');

-- ========== EXTERIOR (4) ==========
INSERT INTO plantas (nombre, nombre_cientifico, categoria, precio, costo, stock, stock_minimo, descripcion, riego, luz, abono, sustrato, temperatura, plagas, tiempo_crecimiento, dificultad)
VALUES ('Bugambilia', 'Bougainvillea spectabilis', 'Exterior', 180, 90, 0, 10, 'Planta trepadora de vistosas brácteas coloridas', '1 vez por semana', 'Luz solar directa', 'Fertilizante alto en fósforo cada mes', 'Sustrato calcáreo con buen drenaje', '15°C a 35°C', 'Pulgón — jabón potásico; Araña roja — aumentar riego', 'Rápido: alcanza 3m en 1 año', 'Fácil');

INSERT INTO plantas (nombre, nombre_cientifico, categoria, precio, costo, stock, stock_minimo, descripcion, riego, luz, abono, sustrato, temperatura, plagas, tiempo_crecimiento, dificultad)
VALUES ('Jacaranda', 'Jacaranda mimosifolia', 'Exterior', 450, 250, 8, 5, 'Árbol ornamental de flores moradas, ideal para jardines amplios', '2 veces por semana', 'Luz solar directa', 'Abono orgánico compostado cada 3 meses', 'Sustrato profundo rico en materia orgánica', '15°C a 30°C', 'Minador de hojas — podar hojas afectadas; Hormigas — control biológico', 'Lento: alcanza 5m en 5 años', 'Intermedio');

INSERT INTO plantas (nombre, nombre_cientifico, categoria, precio, costo, stock, stock_minimo, descripcion, riego, luz, abono, sustrato, temperatura, plagas, tiempo_crecimiento, dificultad)
VALUES ('Laurel', 'Laurus nobilis', 'Exterior', 220, 120, 12, 8, 'Árbol aromático usado en cocina, hojas para condimento', '2 veces por semana', 'Luz solar directa o semisombra', 'Abono orgánico de lombriz cada 2 meses', 'Sustrato calcáreo o neutro', '10°C a 30°C', 'Cochinilla — aceite de neem; Hongo mildiu — ventilación y caldo bordelés', 'Moderado: alcanza 2m en 3 años', 'Fácil');

INSERT INTO plantas (nombre, nombre_cientifico, categoria, precio, costo, stock, stock_minimo, descripcion, riego, luz, abono, sustrato, temperatura, plagas, tiempo_crecimiento, dificultad)
VALUES ('Helecho de Jardín', 'Nephrolepis exaltata', 'Exterior', 65, 25, 2, 10, 'Helecho frondoso ideal para zonas sombreadas del jardín', '3-4 veces por semana', 'Sombra o semisombra', 'Fertilizante líquido equilibrado cada 15 días', 'Sustrato con turba y perlita, alta humedad', '15°C a 28°C', 'Araña roja — rociar agua frecuentemente; Cochinilla — jabón potásico', 'Rápido: alcanza 60cm en 4 meses', 'Fácil');

-- ========== SUCULENTAS Y CACTUS (4) ==========
INSERT INTO plantas (nombre, nombre_cientifico, categoria, precio, costo, stock, stock_minimo, descripcion, riego, luz, abono, sustrato, temperatura, plagas, tiempo_crecimiento, dificultad)
VALUES ('Echeveria', 'Echeveria elegans', 'Suculenta', 55, 20, 35, 15, 'Suculenta en forma de roseta, muy decorativa', 'Cada 10-14 días', 'Luz indirecta brillante', 'Fertilizante para cactus cada 2 meses', 'Sustrato para suculentas con arena', '10°C a 30°C', 'Pudrición — evitar exceso de riego; Cochinilla — alcohol al 70%', 'Lento: 10cm en 1 año', 'Fácil');

INSERT INTO plantas (nombre, nombre_cientifico, categoria, precio, costo, stock, stock_minimo, descripcion, riego, luz, abono, sustrato, temperatura, plagas, tiempo_crecimiento, dificultad)
VALUES ('Aloe Vera', 'Aloe barbadensis', 'Suculenta', 90, 40, 28, 10, 'Sábila, planta medicinal de usos múltiples', 'Cada 15 días', 'Luz solar directa o brillante', 'Abono orgánico líquido cada mes', 'Sustrato arenoso con buen drenaje', '15°C a 35°C', 'Cochinilla — alcohol; Hongos — evitar exceso de humedad', 'Moderado: 30cm en 1 año', 'Fácil');

INSERT INTO plantas (nombre, nombre_cientifico, categoria, precio, costo, stock, stock_minimo, descripcion, riego, luz, abono, sustrato, temperatura, plagas, tiempo_crecimiento, dificultad)
VALUES ('Cactus Barril', 'Echinocactus grusonii', 'Suculenta', 160, 80, 2, 10, 'Cactus esférico dorado, lento crecimiento', 'Cada 20 días', 'Luz solar directa', 'Fertilizante para cactus cada 3 meses', 'Sustrato mineral con grava', '10°C a 40°C', 'Cochinilla algodonosa — cepillar con alcohol; Hongos — sustrato seco', 'Muy lento: 10cm en 3 años', 'Intermedio');

INSERT INTO plantas (nombre, nombre_cientifico, categoria, precio, costo, stock, stock_minimo, descripcion, riego, luz, abono, sustrato, temperatura, plagas, tiempo_crecimiento, dificultad)
VALUES ('Agave Americano', 'Agave americana', 'Suculenta', 200, 100, 20, 8, 'Agave ornamental de gran tamaño, resistente a sequía', 'Cada 20-30 días', 'Luz solar directa', 'Fertilizante bajo en nitrógeno cada 2 meses', 'Sustrato calcáreo o arenoso', '10°C a 38°C', 'Picudo del agave — retirar plantas infectadas; Hongos — evitar heridas', 'Moderado: alcanza 1.5m en 4 años', 'Fácil');

-- ========== FRUTALES (3) ==========
INSERT INTO plantas (nombre, nombre_cientifico, categoria, precio, costo, stock, stock_minimo, descripcion, riego, luz, abono, sustrato, temperatura, plagas, tiempo_crecimiento, dificultad)
VALUES ('Limonero', 'Citrus limon', 'Frutal', 380, 200, 7, 5, 'Árbol frutal de limón, produce frutos durante todo el año', '2-3 veces por semana', 'Luz solar directa', 'Abono cítrico NPK 12-12-12 cada mes', 'Sustrato ácido con buen drenaje', '15°C a 30°C', 'Minador de cítricos — aceite de neem; Ácaros — azufre; Hongos — caldo bordelés', 'Moderado: produce frutos en 2-3 años', 'Intermedio');

INSERT INTO plantas (nombre, nombre_cientifico, categoria, precio, costo, stock, stock_minimo, descripcion, riego, luz, abono, sustrato, temperatura, plagas, tiempo_crecimiento, dificultad)
VALUES ('Naranjo Enano', 'Citrus sinensis', 'Frutal', 420, 230, 5, 5, 'Naranjo enano ideal para macetas, frutos dulces', '2 veces por semana', 'Luz solar directa (mínimo 6h)', 'Abono cítrico NPK 10-10-10 cada 15 días', 'Sustrato ácido con compost', '15°C a 28°C', 'Pulgón — jabón potásico; Mosca blanca — trampas cromáticas; Hongos — fungicida cúprico', 'Moderado: produce frutos en 2-3 años', 'Intermedio');

INSERT INTO plantas (nombre, nombre_cientifico, categoria, precio, costo, stock, stock_minimo, descripcion, riego, luz, abono, sustrato, temperatura, plagas, tiempo_crecimiento, dificultad)
VALUES ('Guayabo', 'Psidium guajava', 'Frutal', 290, 150, 9, 8, 'Árbol frutal tropical de guayaba, resistente y productivo', '2-3 veces por semana', 'Luz solar directa', 'Abono orgánico rico en potasio cada mes', 'Sustrato franco-arenoso con materia orgánica', '18°C a 35°C', 'Mosca de la fruta — trampas y recolección; Ácaros — azufre; Antracnosis — caldo bordelés', 'Rápido: produce frutos en 1-2 años', 'Fácil');

-- ============================================================
-- Insertar registros en inventario para las nuevas plantas
-- NOTA: Primero verificar qué IDs obtuvieron las plantas nuevas
-- (consulta SELECT id, nombre FROM plantas ORDER BY id DESC LIMIT 15)
-- y ajustar los producto_id según corresponda.
-- ============================================================
-- Ejemplo (asumiendo ids 5-19):
-- INSERT INTO inventario (producto_tipo,producto_id,stock_actual,stock_minimo) VALUES ('planta',5,30,10);
-- INSERT INTO inventario (producto_tipo,producto_id,stock_actual,stock_minimo) VALUES ('planta',6,25,8);
-- ... etc
