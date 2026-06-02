const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');

const DATABASE_URL = process.env.DATABASE_URL;

// ==================== SQLite (local) ====================
if (!DATABASE_URL) {
  const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'vivero.db');
  let db = null;
  let SQL = null;

  async function getDB() {
    if (db) return db;
    const initSqlJs = require('sql.js');
    SQL = await initSqlJs();
    if (fs.existsSync(DB_PATH)) {
      db = new SQL.Database(fs.readFileSync(DB_PATH));
    } else {
      db = new SQL.Database();
    }
    db.run('PRAGMA foreign_keys = ON');
    return db;
  }

  function saveDB() {
    if (db) {
      const data = db.export();
      const dir = path.dirname(DB_PATH);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(DB_PATH, Buffer.from(data));
    }
  }

  const query = (sql, params = []) => Promise.resolve().then(() => {
    const stmt = db.prepare(sql);
    if (params.length > 0) stmt.bind(params);
    const rows = [];
    while (stmt.step()) rows.push(stmt.getAsObject());
    stmt.free();
    return rows;
  });

  const queryOne = (sql, params = []) => query(sql, params).then(rows => rows.length > 0 ? rows[0] : null);

  const execute = (sql, params = []) => Promise.resolve().then(() => {
    let sqlToRun = sql;
    if (params.length > 0) {
      const esc = v => { if (v === null || v === undefined) return 'NULL'; if (typeof v === 'number') return v; return "'" + String(v).replace(/'/g,"''") + "'"; };
      let idx = 0;
      sqlToRun = sql.replace(/\?/g, () => esc(params[idx++]));
    }
    const wasInsert = /^\s*INSERT\s/i.test(sqlToRun);
    db.exec(sqlToRun);
    const lastId = wasInsert ? (db.exec('SELECT last_insert_rowid() as id')?.[0]?.values?.[0]?.[0] ?? null) : null;
    const modified = db.getRowsModified();
    saveDB();
    return { changes: modified, lastId };
  });

  const lastInsertId = () => {
    const r = db.exec('SELECT last_insert_rowid() as id');
    return (r && r.length > 0 && r[0].values.length > 0) ? r[0].values[0][0] || null : null;
  };

  const SCHEMA_SQL = `
    CREATE TABLE IF NOT EXISTS usuarios (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nombre TEXT NOT NULL,
      username TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      rol TEXT NOT NULL DEFAULT 'Vendedor',
      activo INTEGER NOT NULL DEFAULT 1,
      permisos TEXT DEFAULT '{}',
      ultimo_acceso TEXT,
      created_at TEXT DEFAULT (datetime('now','localtime'))
    );
    CREATE TABLE IF NOT EXISTS clientes (
      id INTEGER PRIMARY KEY AUTOINCREMENT, nombre TEXT NOT NULL, tipo TEXT NOT NULL DEFAULT 'Particular',
      telefono TEXT, email TEXT, rfc TEXT, limite_credito REAL DEFAULT 0,
      direccion TEXT, saldo_actual REAL DEFAULT 0, compras_totales INTEGER DEFAULT 0,
      activo INTEGER NOT NULL DEFAULT 1, created_at TEXT DEFAULT (datetime('now','localtime'))
    );
    CREATE TABLE IF NOT EXISTS plantas (
      id INTEGER PRIMARY KEY AUTOINCREMENT, nombre TEXT NOT NULL, nombre_cientifico TEXT,
      categoria TEXT NOT NULL, precio REAL NOT NULL DEFAULT 0, stock INTEGER NOT NULL DEFAULT 0,
      stock_minimo INTEGER NOT NULL DEFAULT 10, descripcion TEXT,
      activo INTEGER NOT NULL DEFAULT 1, created_at TEXT DEFAULT (datetime('now','localtime'))
    );
    CREATE TABLE IF NOT EXISTS herramientas (
      id INTEGER PRIMARY KEY AUTOINCREMENT, nombre TEXT NOT NULL, categoria TEXT NOT NULL,
      estado TEXT NOT NULL DEFAULT 'Disponible', responsable TEXT,
      activo INTEGER NOT NULL DEFAULT 1, created_at TEXT DEFAULT (datetime('now','localtime'))
    );
    CREATE TABLE IF NOT EXISTS biofabrica_lotes (
      id INTEGER PRIMARY KEY AUTOINCREMENT, lote_id TEXT UNIQUE NOT NULL,
      producto TEXT NOT NULL, fecha_inicio TEXT NOT NULL, fecha_vencimiento TEXT NOT NULL,
      estado TEXT NOT NULL DEFAULT 'En proceso', created_at TEXT DEFAULT (datetime('now','localtime'))
    );
    CREATE TABLE IF NOT EXISTS personal (
      id INTEGER PRIMARY KEY AUTOINCREMENT, nombre TEXT NOT NULL, puesto TEXT NOT NULL,
      area TEXT NOT NULL, turno TEXT NOT NULL DEFAULT 'Matutino',
      estado TEXT NOT NULL DEFAULT 'Activo', activo INTEGER NOT NULL DEFAULT 1,
      usuario_id INTEGER,
      created_at TEXT DEFAULT (datetime('now','localtime')),
      FOREIGN KEY (usuario_id) REFERENCES usuarios(id)
    );
    CREATE TABLE IF NOT EXISTS ventas (
      id INTEGER PRIMARY KEY AUTOINCREMENT, folio TEXT UNIQUE NOT NULL,
      cliente_id INTEGER, total REAL NOT NULL DEFAULT 0, metodo_pago TEXT NOT NULL DEFAULT 'Efectivo',
      usuario_id INTEGER, estado TEXT NOT NULL DEFAULT 'Pagado',
      tipo_venta TEXT NOT NULL DEFAULT 'Normal', anticipo REAL NOT NULL DEFAULT 0,
      saldo_pendiente REAL NOT NULL DEFAULT 0, fecha_programada TEXT,
      created_at TEXT DEFAULT (datetime('now','localtime')),
      FOREIGN KEY (cliente_id) REFERENCES clientes(id), FOREIGN KEY (usuario_id) REFERENCES usuarios(id)
    );
    CREATE TABLE IF NOT EXISTS ventas_detalle (
      id INTEGER PRIMARY KEY AUTOINCREMENT, venta_id INTEGER NOT NULL,
      producto_tipo TEXT NOT NULL, producto_id INTEGER NOT NULL, producto_nombre TEXT NOT NULL,
      cantidad INTEGER NOT NULL DEFAULT 1, precio_unitario REAL NOT NULL, subtotal REAL NOT NULL,
      created_at TEXT DEFAULT (datetime('now','localtime')),
      FOREIGN KEY (venta_id) REFERENCES ventas(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS inventario (
      id INTEGER PRIMARY KEY AUTOINCREMENT, producto_tipo TEXT NOT NULL,
      producto_id INTEGER NOT NULL, stock_actual INTEGER NOT NULL DEFAULT 0,
      stock_minimo INTEGER NOT NULL DEFAULT 10, ultima_actualizacion TEXT DEFAULT (datetime('now','localtime')),
      UNIQUE(producto_tipo, producto_id)
    );
    CREATE TABLE IF NOT EXISTS inventario_movimientos (
      id INTEGER PRIMARY KEY AUTOINCREMENT, inventario_id INTEGER,
      producto_tipo TEXT NOT NULL, producto_id INTEGER NOT NULL, tipo TEXT NOT NULL,
      cantidad INTEGER NOT NULL, motivo TEXT, usuario_id INTEGER,
      created_at TEXT DEFAULT (datetime('now','localtime')),
      FOREIGN KEY (usuario_id) REFERENCES usuarios(id)
    );
    CREATE TABLE IF NOT EXISTS proveedores (
      id INTEGER PRIMARY KEY AUTOINCREMENT, nombre TEXT NOT NULL, contacto TEXT,
      telefono TEXT, email TEXT, producto_principal TEXT,
      activo INTEGER NOT NULL DEFAULT 1, created_at TEXT DEFAULT (datetime('now','localtime'))
    );
    CREATE TABLE IF NOT EXISTS calidad_inspecciones (
      id INTEGER PRIMARY KEY AUTOINCREMENT, lote_producto TEXT NOT NULL,
      inspector TEXT NOT NULL, fecha TEXT NOT NULL, estado_fitosanitario TEXT NOT NULL,
      calificacion INTEGER NOT NULL DEFAULT 5, observaciones TEXT,
      created_at TEXT DEFAULT (datetime('now','localtime'))
    );
    CREATE TABLE IF NOT EXISTS adquisicion_plantas (
      id INTEGER PRIMARY KEY AUTOINCREMENT, folio TEXT UNIQUE NOT NULL,
      proveedor TEXT NOT NULL, fecha_adquisicion TEXT NOT NULL, total REAL NOT NULL DEFAULT 0,
      estado TEXT NOT NULL DEFAULT 'Recibido', observaciones TEXT, usuario_id INTEGER,
      created_at TEXT DEFAULT (datetime('now','localtime')),
      FOREIGN KEY (usuario_id) REFERENCES usuarios(id)
    );
    CREATE TABLE IF NOT EXISTS adquisicion_detalle (
      id INTEGER PRIMARY KEY AUTOINCREMENT, adquisicion_id INTEGER NOT NULL,
      planta_id INTEGER NOT NULL, variedad TEXT, cantidad INTEGER NOT NULL DEFAULT 1,
      precio_unitario REAL NOT NULL DEFAULT 0, subtotal REAL NOT NULL DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now','localtime')),
      FOREIGN KEY (adquisicion_id) REFERENCES adquisicion_plantas(id) ON DELETE CASCADE,
      FOREIGN KEY (planta_id) REFERENCES plantas(id)
    );
    CREATE TABLE IF NOT EXISTS facturacion (
      id INTEGER PRIMARY KEY AUTOINCREMENT, venta_id INTEGER NOT NULL,
      folio_fiscal TEXT, rfc TEXT, razon_social TEXT, uso_cfdi TEXT,
      regimen_fiscal_receptor TEXT, codigo_postal TEXT, uuid TEXT, fecha_timbrado TEXT,
      cfdi_estado TEXT NOT NULL DEFAULT 'Pendiente', datos_fiscales TEXT,
      created_at TEXT DEFAULT (datetime('now','localtime')),
      FOREIGN KEY (venta_id) REFERENCES ventas(id)
    );
  `;

  async function initDatabase() {
    const d = await getDB();
    db.exec(SCHEMA_SQL);
    const migrations = [
      'ALTER TABLE ventas ADD COLUMN tipo_venta TEXT NOT NULL DEFAULT \'Normal\'',
      'ALTER TABLE ventas ADD COLUMN anticipo REAL NOT NULL DEFAULT 0',
      'ALTER TABLE ventas ADD COLUMN saldo_pendiente REAL NOT NULL DEFAULT 0',
      'ALTER TABLE ventas ADD COLUMN fecha_programada TEXT',
      'ALTER TABLE ventas ADD COLUMN ticket_number TEXT',
      'ALTER TABLE plantas ADD COLUMN costo REAL DEFAULT 0',
      'ALTER TABLE facturacion ADD COLUMN datos_fiscales TEXT',
      'ALTER TABLE facturacion ADD COLUMN uuid TEXT',
      'ALTER TABLE facturacion ADD COLUMN fecha_timbrado TEXT',
      'ALTER TABLE facturacion ADD COLUMN uso_cfdi TEXT',
      'ALTER TABLE facturacion ADD COLUMN regimen_fiscal_receptor TEXT',
      'ALTER TABLE facturacion ADD COLUMN codigo_postal TEXT',
      'ALTER TABLE facturacion ADD COLUMN razon_social TEXT',
      'ALTER TABLE personal ADD COLUMN usuario_id INTEGER',
    ];
    migrations.forEach(m => { try { db.exec(m); } catch (e) { /* ya existe */ } });
    await seedData();
    await seedLaura();
    saveDB();
    return d;
  }

  async function seedData() {
    const count = await queryOne('SELECT COUNT(*) as c FROM usuarios');
    if (count && count.c > 0) return;
    const h1 = bcrypt.hashSync('Admin123!', 10);
    await execute('INSERT INTO usuarios (nombre, username, password, rol) VALUES (?,?,?,?)', ['Administrador', 'admin', h1, 'Administrador']);
    const h2 = bcrypt.hashSync('Vendedor123!', 10);
    await execute('INSERT INTO usuarios (nombre, username, password, rol) VALUES (?,?,?,?)', ['Carlos Ruiz', 'vendedor', h2, 'Vendedor']);
    await execute("INSERT INTO clientes (nombre,tipo,telefono,email,rfc,limite_credito,compras_totales) VALUES (?,?,?,?,?,?,?)", ['María Sánchez','Particular','228-111-2233','maria@email.com','SAMA890101',5000,8]);
    await execute("INSERT INTO clientes (nombre,tipo,telefono,email,rfc,limite_credito,compras_totales) VALUES (?,?,?,?,?,?,?)", ['Pedro López','Particular','228-444-5566','pedro@mail.com','LOPP750203',3000,3]);
    await execute("INSERT INTO clientes (nombre,tipo,telefono,email,rfc,limite_credito,compras_totales) VALUES (?,?,?,?,?,?,?)", ['Jardines SA de CV','Empresa','228-999-0011','jardines@empresa.mx','JSA880505',50000,22]);
    await execute("INSERT INTO plantas (nombre,nombre_cientifico,categoria,precio,costo,stock,stock_minimo,descripcion) VALUES (?,?,?,?,?,?,?,?)", ['Rosa Roja','Rosa rubiginosa','Flor',85,45,3,20,'Rosa roja clásica']);
    await execute("INSERT INTO plantas (nombre,nombre_cientifico,categoria,precio,costo,stock,stock_minimo,descripcion) VALUES (?,?,?,?,?,?,?,?)", ['Ficus Benjamina','Ficus benjamina','Árbol',320,190,45,10,'Árbol ornamental']);
    await execute("INSERT INTO plantas (nombre,nombre_cientifico,categoria,precio,costo,stock,stock_minimo,descripcion) VALUES (?,?,?,?,?,?,?,?)", ['Agave Azul','Agave tequilana','Suculenta',150,80,28,5,'Agave para mezcal']);
    await execute("INSERT INTO plantas (nombre,nombre_cientifico,categoria,precio,costo,stock,stock_minimo,descripcion) VALUES (?,?,?,?,?,?,?,?)", ['Buganvilia Morada','Bougainvillea glabra','Arbusto',120,70,0,15,'Arbusto trepador']);
    await execute("INSERT INTO herramientas (nombre,categoria,estado,responsable) VALUES (?,?,?,?)", ['Podadora Stihl','Corte','En mantenimiento','Ana Gómez']);
    await execute("INSERT INTO herramientas (nombre,categoria,estado,responsable) VALUES (?,?,?,?)", ['Regadera 10L','Riego','Disponible',null]);
    await execute("INSERT INTO herramientas (nombre,categoria,estado,responsable) VALUES (?,?,?,?)", ['Motocultor Honda','Labranza','En uso','Carlos Ruiz']);
    await execute("INSERT INTO biofabrica_lotes (lote_id,producto,fecha_inicio,fecha_vencimiento,estado) VALUES (?,?,?,?,?)", ['L-2024-001','Trichoderma','2024-01-10','2024-07-10','Listo']);
    await execute("INSERT INTO biofabrica_lotes (lote_id,producto,fecha_inicio,fecha_vencimiento,estado) VALUES (?,?,?,?,?)", ['L-2024-002','Bacillus subtilis','2024-02-01','2024-08-01','En proceso']);
    await execute("INSERT INTO biofabrica_lotes (lote_id,producto,fecha_inicio,fecha_vencimiento,estado) VALUES (?,?,?,?,?)", ['L-2024-003','Micorriza','2024-03-15','2024-06-15','Por vencer']);
    await execute("INSERT INTO personal (nombre,puesto,area,turno,estado) VALUES (?,?,?,?,?)", ['Roberto Hernández','Jardinero','Campo','Matutino','Activo']);
    await execute("INSERT INTO personal (nombre,puesto,area,turno,estado) VALUES (?,?,?,?,?)", ['Sofía Martínez','Vendedora','Tienda','Vespertino','Activo']);
    await execute("INSERT INTO personal (nombre,puesto,area,turno,estado) VALUES (?,?,?,?,?)", ['Luis Torres','Técnico','Biofábrica','Matutino','Vacaciones']);
    await execute("INSERT INTO ventas (folio,cliente_id,total,metodo_pago,usuario_id,estado) VALUES (?,?,?,?,?,?)", ['F-0048',1,425,'Efectivo',1,'Pagado']);
    await execute("INSERT INTO ventas (folio,cliente_id,total,metodo_pago,usuario_id,estado) VALUES (?,?,?,?,?,?)", ['F-0047',2,780,'Tarjeta',2,'Pagado']);
    await execute("INSERT INTO ventas (folio,cliente_id,total,metodo_pago,usuario_id,estado) VALUES (?,?,?,?,?,?)", ['F-0046',3,3000,'Transferencia',1,'Crédito']);
    await execute("INSERT INTO ventas_detalle (venta_id,producto_tipo,producto_id,producto_nombre,cantidad,precio_unitario,subtotal) VALUES (?,?,?,?,?,?,?)", [1,'planta',1,'Rosa Roja',5,85,425]);
    await execute("INSERT INTO ventas_detalle (venta_id,producto_tipo,producto_id,producto_nombre,cantidad,precio_unitario,subtotal) VALUES (?,?,?,?,?,?,?)", [2,'planta',2,'Ficus Benjamina',2,320,640]);
    await execute("INSERT INTO ventas_detalle (venta_id,producto_tipo,producto_id,producto_nombre,cantidad,precio_unitario,subtotal) VALUES (?,?,?,?,?,?,?)", [2,'planta',4,'Buganvilia Morada',1,120,120]);
    await execute("INSERT INTO ventas_detalle (venta_id,producto_tipo,producto_id,producto_nombre,cantidad,precio_unitario,subtotal) VALUES (?,?,?,?,?,?,?)", [3,'planta',3,'Agave Azul',20,150,3000]);
    await execute("INSERT INTO proveedores (nombre,contacto,telefono,email,producto_principal) VALUES (?,?,?,?,?)", ['Plantas del Golfo SA','Carlos Mendoza','222-333-4444','ventas@plantasgolfo.mx','Flores tropicales']);
    await execute("INSERT INTO proveedores (nombre,contacto,telefono,email,producto_principal) VALUES (?,?,?,?,?)", ['Insumos Agrícolas MX','Laura Rivas','333-444-5555','pedidos@insumosagri.mx','Sustratos y fertilizantes']);
    await execute("INSERT INTO proveedores (nombre,contacto,telefono,email,producto_principal) VALUES (?,?,?,?,?)", ['Herramientas Pro','Pedro Sánchez','444-555-6666','ventas@herramientaspro.mx','Herramientas de jardinería']);
    await execute("INSERT INTO calidad_inspecciones (lote_producto,inspector,fecha,estado_fitosanitario,calificacion,observaciones) VALUES (?,?,?,?,?,?)", ['Rosa Roja — Lote A','Ana Gómez','2024-05-15','Sano',5,'Excelente estado']);
    await execute("INSERT INTO calidad_inspecciones (lote_producto,inspector,fecha,estado_fitosanitario,calificacion,observaciones) VALUES (?,?,?,?,?,?)", ['Ficus — Lote B','Ana Gómez','2024-05-12','Plaga leve',3,'Requiere tratamiento']);
    await execute("INSERT INTO calidad_inspecciones (lote_producto,inspector,fecha,estado_fitosanitario,calificacion,observaciones) VALUES (?,?,?,?,?,?)", ['Agave — Lote C','Luis Torres','2024-05-10','Sano',4,'Buen desarrollo']);
    await execute("INSERT INTO facturacion (venta_id,folio_fiscal,rfc,cfdi_estado) VALUES (?,?,?,?)", [1,'CFDI-0048','SAMA890101','Emitido']);
    await execute("INSERT INTO facturacion (venta_id,folio_fiscal,rfc,cfdi_estado) VALUES (?,?,?,?)", [2,null,null,'Pendiente']);
    await execute("INSERT INTO facturacion (venta_id,folio_fiscal,rfc,cfdi_estado) VALUES (?,?,?,?)", [3,'CFDI-0046','JSA880505','Emitido']);
    await execute("INSERT INTO inventario (producto_tipo,producto_id,stock_actual,stock_minimo) VALUES (?,?,?,?)", ['planta',1,3,20]);
    await execute("INSERT INTO inventario (producto_tipo,producto_id,stock_actual,stock_minimo) VALUES (?,?,?,?)", ['planta',2,45,10]);
    await execute("INSERT INTO inventario (producto_tipo,producto_id,stock_actual,stock_minimo) VALUES (?,?,?,?)", ['planta',3,28,5]);
    await execute("INSERT INTO inventario (producto_tipo,producto_id,stock_actual,stock_minimo) VALUES (?,?,?,?)", ['planta',4,0,15]);
  }

  async function seedLaura() {
    const laura = await queryOne('SELECT id FROM usuarios WHERE username=?', ['laura']);
    if (!laura) {
      const h = bcrypt.hashSync('Vendedor123!', 10);
      await execute('INSERT INTO usuarios (nombre, username, password, rol) VALUES (?,?,?,?)', ['Laura Méndez', 'laura', h, 'Vendedor']);
    }
  }

  module.exports = { getDB, initDatabase, query, queryOne, execute, lastInsertId };
  return;
}

// ==================== PostgreSQL (Railway) ====================
const { Pool } = require('pg');
const pool = new Pool({ connectionString: DATABASE_URL, max: 10, idleTimeoutMillis: 30000 });

// Convertir ? a $1, $2, etc.
function convertParams(sql, params) {
  let idx = 0;
  return { text: sql.replace(/\?/g, () => `$${++idx}`), values: params };
}

const query = (sql, params = []) => pool.query(convertParams(sql, params)).then(r => r.rows);
const queryOne = async (sql, params = []) => { const rows = await query(sql, params); return rows.length > 0 ? rows[0] : null; };
const execute = async (sql, params = []) => {
  const isInsert = /^\s*INSERT\s/i.test(sql);
  if (isInsert) {
    const result = await pool.query(convertParams(sql + ' RETURNING id', params));
    return { changes: result.rowCount, lastId: result.rows[0]?.id ?? null };
  }
  const result = await pool.query(convertParams(sql, params));
  return { changes: result.rowCount, lastId: null };
};
const lastInsertId = () => { throw new Error('use execute().lastId en PostgreSQL'); };

const SCHEMA_SQL = `
  CREATE TABLE IF NOT EXISTS usuarios (
    id SERIAL PRIMARY KEY, nombre TEXT NOT NULL, username TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL, rol TEXT NOT NULL DEFAULT 'Vendedor',
    activo INTEGER NOT NULL DEFAULT 1, permisos TEXT DEFAULT '{}',
    ultimo_acceso TEXT, created_at TIMESTAMP DEFAULT NOW()
  );
  CREATE TABLE IF NOT EXISTS clientes (
    id SERIAL PRIMARY KEY, nombre TEXT NOT NULL, tipo TEXT NOT NULL DEFAULT 'Particular',
    telefono TEXT, email TEXT, rfc TEXT, limite_credito REAL DEFAULT 0,
    direccion TEXT, saldo_actual REAL DEFAULT 0, compras_totales INTEGER DEFAULT 0,
    activo INTEGER NOT NULL DEFAULT 1, created_at TIMESTAMP DEFAULT NOW()
  );
  CREATE TABLE IF NOT EXISTS plantas (
    id SERIAL PRIMARY KEY, nombre TEXT NOT NULL, nombre_cientifico TEXT,
    categoria TEXT NOT NULL, precio REAL NOT NULL DEFAULT 0, stock INTEGER NOT NULL DEFAULT 0,
    stock_minimo INTEGER NOT NULL DEFAULT 10, descripcion TEXT,
    activo INTEGER NOT NULL DEFAULT 1, created_at TIMESTAMP DEFAULT NOW()
  );
  CREATE TABLE IF NOT EXISTS herramientas (
    id SERIAL PRIMARY KEY, nombre TEXT NOT NULL, categoria TEXT NOT NULL,
    estado TEXT NOT NULL DEFAULT 'Disponible', responsable TEXT,
    activo INTEGER NOT NULL DEFAULT 1, created_at TIMESTAMP DEFAULT NOW()
  );
  CREATE TABLE IF NOT EXISTS biofabrica_lotes (
    id SERIAL PRIMARY KEY, lote_id TEXT UNIQUE NOT NULL,
    producto TEXT NOT NULL, fecha_inicio TEXT NOT NULL, fecha_vencimiento TEXT NOT NULL,
    estado TEXT NOT NULL DEFAULT 'En proceso', created_at TIMESTAMP DEFAULT NOW()
  );
  CREATE TABLE IF NOT EXISTS personal (
    id SERIAL PRIMARY KEY, nombre TEXT NOT NULL, puesto TEXT NOT NULL,
    area TEXT NOT NULL, turno TEXT NOT NULL DEFAULT 'Matutino',
    estado TEXT NOT NULL DEFAULT 'Activo', activo INTEGER NOT NULL DEFAULT 1,
    usuario_id INTEGER REFERENCES usuarios(id),
    created_at TIMESTAMP DEFAULT NOW()
  );
  CREATE TABLE IF NOT EXISTS ventas (
    id SERIAL PRIMARY KEY, folio TEXT UNIQUE NOT NULL,
    cliente_id INTEGER REFERENCES clientes(id), total REAL NOT NULL DEFAULT 0,
    metodo_pago TEXT NOT NULL DEFAULT 'Efectivo',
    usuario_id INTEGER REFERENCES usuarios(id), estado TEXT NOT NULL DEFAULT 'Pagado',
    tipo_venta TEXT NOT NULL DEFAULT 'Normal', anticipo REAL NOT NULL DEFAULT 0,
    saldo_pendiente REAL NOT NULL DEFAULT 0, fecha_programada TEXT,
    created_at TIMESTAMP DEFAULT NOW()
  );
  CREATE TABLE IF NOT EXISTS ventas_detalle (
    id SERIAL PRIMARY KEY, venta_id INTEGER NOT NULL REFERENCES ventas(id) ON DELETE CASCADE,
    producto_tipo TEXT NOT NULL, producto_id INTEGER NOT NULL, producto_nombre TEXT NOT NULL,
    cantidad INTEGER NOT NULL DEFAULT 1, precio_unitario REAL NOT NULL, subtotal REAL NOT NULL,
    created_at TIMESTAMP DEFAULT NOW()
  );
  CREATE TABLE IF NOT EXISTS inventario (
    id SERIAL PRIMARY KEY, producto_tipo TEXT NOT NULL,
    producto_id INTEGER NOT NULL, stock_actual INTEGER NOT NULL DEFAULT 0,
    stock_minimo INTEGER NOT NULL DEFAULT 10, ultima_actualizacion TIMESTAMP DEFAULT NOW(),
    UNIQUE(producto_tipo, producto_id)
  );
  CREATE TABLE IF NOT EXISTS inventario_movimientos (
    id SERIAL PRIMARY KEY, inventario_id INTEGER,
    producto_tipo TEXT NOT NULL, producto_id INTEGER NOT NULL, tipo TEXT NOT NULL,
    cantidad INTEGER NOT NULL, motivo TEXT, usuario_id INTEGER REFERENCES usuarios(id),
    created_at TIMESTAMP DEFAULT NOW()
  );
  CREATE TABLE IF NOT EXISTS proveedores (
    id SERIAL PRIMARY KEY, nombre TEXT NOT NULL, contacto TEXT,
    telefono TEXT, email TEXT, producto_principal TEXT,
    activo INTEGER NOT NULL DEFAULT 1, created_at TIMESTAMP DEFAULT NOW()
  );
  CREATE TABLE IF NOT EXISTS calidad_inspecciones (
    id SERIAL PRIMARY KEY, lote_producto TEXT NOT NULL,
    inspector TEXT NOT NULL, fecha TEXT NOT NULL, estado_fitosanitario TEXT NOT NULL,
    calificacion INTEGER NOT NULL DEFAULT 5, observaciones TEXT,
    created_at TIMESTAMP DEFAULT NOW()
  );
  CREATE TABLE IF NOT EXISTS adquisicion_plantas (
    id SERIAL PRIMARY KEY, folio TEXT UNIQUE NOT NULL,
    proveedor TEXT NOT NULL, fecha_adquisicion TEXT NOT NULL, total REAL NOT NULL DEFAULT 0,
    estado TEXT NOT NULL DEFAULT 'Recibido', observaciones TEXT, usuario_id INTEGER REFERENCES usuarios(id),
    created_at TIMESTAMP DEFAULT NOW()
  );
  CREATE TABLE IF NOT EXISTS adquisicion_detalle (
    id SERIAL PRIMARY KEY, adquisicion_id INTEGER NOT NULL REFERENCES adquisicion_plantas(id) ON DELETE CASCADE,
    planta_id INTEGER NOT NULL REFERENCES plantas(id), variedad TEXT,
    cantidad INTEGER NOT NULL DEFAULT 1, precio_unitario REAL NOT NULL DEFAULT 0,
    subtotal REAL NOT NULL DEFAULT 0, created_at TIMESTAMP DEFAULT NOW()
  );
  CREATE TABLE IF NOT EXISTS facturacion (
    id SERIAL PRIMARY KEY, venta_id INTEGER NOT NULL REFERENCES ventas(id),
    folio_fiscal TEXT, rfc TEXT, razon_social TEXT, uso_cfdi TEXT,
    regimen_fiscal_receptor TEXT, codigo_postal TEXT, uuid TEXT, fecha_timbrado TEXT,
    cfdi_estado TEXT NOT NULL DEFAULT 'Pendiente', datos_fiscales TEXT,
    created_at TIMESTAMP DEFAULT NOW()
  );
`;

async function pgMigrate() {
  const migrations = [
    'ALTER TABLE ventas ADD COLUMN IF NOT EXISTS tipo_venta TEXT NOT NULL DEFAULT \'Normal\'',
    'ALTER TABLE ventas ADD COLUMN IF NOT EXISTS anticipo REAL NOT NULL DEFAULT 0',
    'ALTER TABLE ventas ADD COLUMN IF NOT EXISTS saldo_pendiente REAL NOT NULL DEFAULT 0',
    'ALTER TABLE ventas ADD COLUMN IF NOT EXISTS fecha_programada TEXT',
    'ALTER TABLE ventas ADD COLUMN IF NOT EXISTS ticket_number TEXT',
    'ALTER TABLE plantas ADD COLUMN IF NOT EXISTS costo REAL DEFAULT 0',
    'ALTER TABLE facturacion ADD COLUMN IF NOT EXISTS datos_fiscales TEXT',
    'ALTER TABLE facturacion ADD COLUMN IF NOT EXISTS uuid TEXT',
    'ALTER TABLE facturacion ADD COLUMN IF NOT EXISTS fecha_timbrado TEXT',
    'ALTER TABLE facturacion ADD COLUMN IF NOT EXISTS uso_cfdi TEXT',
    'ALTER TABLE facturacion ADD COLUMN IF NOT EXISTS regimen_fiscal_receptor TEXT',
    'ALTER TABLE facturacion ADD COLUMN IF NOT EXISTS codigo_postal TEXT',
    'ALTER TABLE facturacion ADD COLUMN IF NOT EXISTS razon_social TEXT',
    'ALTER TABLE personal ADD COLUMN IF NOT EXISTS usuario_id INTEGER',
  ];
  for (const m of migrations) {
    try { await pool.query(m); } catch (e) { /* ignorar */ }
  }
}

async function pgSeed() {
  const count = await queryOne('SELECT COUNT(*) as c FROM usuarios');
  if (count && count.c > 0) return;
  const h1 = bcrypt.hashSync('Admin123!', 10);
  await execute('INSERT INTO usuarios (nombre, username, password, rol) VALUES (?,?,?,?)', ['Administrador', 'admin', h1, 'Administrador']);
  const h2 = bcrypt.hashSync('Vendedor123!', 10);
  await execute('INSERT INTO usuarios (nombre, username, password, rol) VALUES (?,?,?,?)', ['Carlos Ruiz', 'vendedor', h2, 'Vendedor']);
  await execute("INSERT INTO clientes (nombre,tipo,telefono,email,rfc,limite_credito,compras_totales) VALUES (?,?,?,?,?,?,?)", ['María Sánchez','Particular','228-111-2233','maria@email.com','SAMA890101',5000,8]);
  await execute("INSERT INTO clientes (nombre,tipo,telefono,email,rfc,limite_credito,compras_totales) VALUES (?,?,?,?,?,?,?)", ['Pedro López','Particular','228-444-5566','pedro@mail.com','LOPP750203',3000,3]);
  await execute("INSERT INTO clientes (nombre,tipo,telefono,email,rfc,limite_credito,compras_totales) VALUES (?,?,?,?,?,?,?)", ['Jardines SA de CV','Empresa','228-999-0011','jardines@empresa.mx','JSA880505',50000,22]);
  await execute("INSERT INTO plantas (nombre,nombre_cientifico,categoria,precio,costo,stock,stock_minimo,descripcion) VALUES (?,?,?,?,?,?,?,?)", ['Rosa Roja','Rosa rubiginosa','Flor',85,45,3,20,'Rosa roja clásica']);
  await execute("INSERT INTO plantas (nombre,nombre_cientifico,categoria,precio,costo,stock,stock_minimo,descripcion) VALUES (?,?,?,?,?,?,?,?)", ['Ficus Benjamina','Ficus benjamina','Árbol',320,190,45,10,'Árbol ornamental']);
  await execute("INSERT INTO plantas (nombre,nombre_cientifico,categoria,precio,costo,stock,stock_minimo,descripcion) VALUES (?,?,?,?,?,?,?,?)", ['Agave Azul','Agave tequilana','Suculenta',150,80,28,5,'Agave para mezcal']);
  await execute("INSERT INTO plantas (nombre,nombre_cientifico,categoria,precio,costo,stock,stock_minimo,descripcion) VALUES (?,?,?,?,?,?,?,?)", ['Buganvilia Morada','Bougainvillea glabra','Arbusto',120,70,0,15,'Arbusto trepador']);
  await execute("INSERT INTO herramientas (nombre,categoria,estado,responsable) VALUES (?,?,?,?)", ['Podadora Stihl','Corte','En mantenimiento','Ana Gómez']);
  await execute("INSERT INTO herramientas (nombre,categoria,estado,responsable) VALUES (?,?,?,?)", ['Regadera 10L','Riego','Disponible',null]);
  await execute("INSERT INTO herramientas (nombre,categoria,estado,responsable) VALUES (?,?,?,?)", ['Motocultor Honda','Labranza','En uso','Carlos Ruiz']);
  await execute("INSERT INTO biofabrica_lotes (lote_id,producto,fecha_inicio,fecha_vencimiento,estado) VALUES (?,?,?,?,?)", ['L-2024-001','Trichoderma','2024-01-10','2024-07-10','Listo']);
  await execute("INSERT INTO biofabrica_lotes (lote_id,producto,fecha_inicio,fecha_vencimiento,estado) VALUES (?,?,?,?,?)", ['L-2024-002','Bacillus subtilis','2024-02-01','2024-08-01','En proceso']);
  await execute("INSERT INTO biofabrica_lotes (lote_id,producto,fecha_inicio,fecha_vencimiento,estado) VALUES (?,?,?,?,?)", ['L-2024-003','Micorriza','2024-03-15','2024-06-15','Por vencer']);
  await execute("INSERT INTO personal (nombre,puesto,area,turno,estado) VALUES (?,?,?,?,?)", ['Roberto Hernández','Jardinero','Campo','Matutino','Activo']);
  await execute("INSERT INTO personal (nombre,puesto,area,turno,estado) VALUES (?,?,?,?,?)", ['Sofía Martínez','Vendedora','Tienda','Vespertino','Activo']);
  await execute("INSERT INTO personal (nombre,puesto,area,turno,estado) VALUES (?,?,?,?,?)", ['Luis Torres','Técnico','Biofábrica','Matutino','Vacaciones']);
  await execute("INSERT INTO ventas (folio,cliente_id,total,metodo_pago,usuario_id,estado) VALUES (?,?,?,?,?,?)", ['F-0048',1,425,'Efectivo',1,'Pagado']);
  await execute("INSERT INTO ventas (folio,cliente_id,total,metodo_pago,usuario_id,estado) VALUES (?,?,?,?,?,?)", ['F-0047',2,780,'Tarjeta',2,'Pagado']);
  await execute("INSERT INTO ventas (folio,cliente_id,total,metodo_pago,usuario_id,estado) VALUES (?,?,?,?,?,?)", ['F-0046',3,3000,'Transferencia',1,'Crédito']);
  await execute("INSERT INTO ventas_detalle (venta_id,producto_tipo,producto_id,producto_nombre,cantidad,precio_unitario,subtotal) VALUES (?,?,?,?,?,?,?)", [1,'planta',1,'Rosa Roja',5,85,425]);
  await execute("INSERT INTO ventas_detalle (venta_id,producto_tipo,producto_id,producto_nombre,cantidad,precio_unitario,subtotal) VALUES (?,?,?,?,?,?,?)", [2,'planta',2,'Ficus Benjamina',2,320,640]);
  await execute("INSERT INTO ventas_detalle (venta_id,producto_tipo,producto_id,producto_nombre,cantidad,precio_unitario,subtotal) VALUES (?,?,?,?,?,?,?)", [2,'planta',4,'Buganvilia Morada',1,120,120]);
  await execute("INSERT INTO ventas_detalle (venta_id,producto_tipo,producto_id,producto_nombre,cantidad,precio_unitario,subtotal) VALUES (?,?,?,?,?,?,?)", [3,'planta',3,'Agave Azul',20,150,3000]);
  await execute("INSERT INTO proveedores (nombre,contacto,telefono,email,producto_principal) VALUES (?,?,?,?,?)", ['Plantas del Golfo SA','Carlos Mendoza','222-333-4444','ventas@plantasgolfo.mx','Flores tropicales']);
  await execute("INSERT INTO proveedores (nombre,contacto,telefono,email,producto_principal) VALUES (?,?,?,?,?)", ['Insumos Agrícolas MX','Laura Rivas','333-444-5555','pedidos@insumosagri.mx','Sustratos y fertilizantes']);
  await execute("INSERT INTO proveedores (nombre,contacto,telefono,email,producto_principal) VALUES (?,?,?,?,?)", ['Herramientas Pro','Pedro Sánchez','444-555-6666','ventas@herramientaspro.mx','Herramientas de jardinería']);
  await execute("INSERT INTO calidad_inspecciones (lote_producto,inspector,fecha,estado_fitosanitario,calificacion,observaciones) VALUES (?,?,?,?,?,?)", ['Rosa Roja — Lote A','Ana Gómez','2024-05-15','Sano',5,'Excelente estado']);
  await execute("INSERT INTO calidad_inspecciones (lote_producto,inspector,fecha,estado_fitosanitario,calificacion,observaciones) VALUES (?,?,?,?,?,?)", ['Ficus — Lote B','Ana Gómez','2024-05-12','Plaga leve',3,'Requiere tratamiento']);
  await execute("INSERT INTO calidad_inspecciones (lote_producto,inspector,fecha,estado_fitosanitario,calificacion,observaciones) VALUES (?,?,?,?,?,?)", ['Agave — Lote C','Luis Torres','2024-05-10','Sano',4,'Buen desarrollo']);
  await execute("INSERT INTO facturacion (venta_id,folio_fiscal,rfc,cfdi_estado) VALUES (?,?,?,?)", [1,'CFDI-0048','SAMA890101','Emitido']);
  await execute("INSERT INTO facturacion (venta_id,folio_fiscal,rfc,cfdi_estado) VALUES (?,?,?,?)", [2,null,null,'Pendiente']);
  await execute("INSERT INTO facturacion (venta_id,folio_fiscal,rfc,cfdi_estado) VALUES (?,?,?,?)", [3,'CFDI-0046','JSA880505','Emitido']);
  await execute("INSERT INTO inventario (producto_tipo,producto_id,stock_actual,stock_minimo) VALUES (?,?,?,?)", ['planta',1,3,20]);
  await execute("INSERT INTO inventario (producto_tipo,producto_id,stock_actual,stock_minimo) VALUES (?,?,?,?)", ['planta',2,45,10]);
  await execute("INSERT INTO inventario (producto_tipo,producto_id,stock_actual,stock_minimo) VALUES (?,?,?,?)", ['planta',3,28,5]);
  await execute("INSERT INTO inventario (producto_tipo,producto_id,stock_actual,stock_minimo) VALUES (?,?,?,?)", ['planta',4,0,15]);
}

async function pgSeedLaura() {
  const laura = await queryOne('SELECT id FROM usuarios WHERE username=?', ['laura']);
  if (!laura) {
    const h = bcrypt.hashSync('Vendedor123!', 10);
    await execute('INSERT INTO usuarios (nombre, username, password, rol) VALUES (?,?,?,?)', ['Laura Méndez', 'laura', h, 'Vendedor']);
  }
}

async function initDatabase() {
  // Crear tablas
  await pool.query(SCHEMA_SQL);
  // Migraciones
  await pgMigrate();
  // Seed data
  await pgSeed();
  await pgSeedLaura();
  return pool;
}

module.exports = { getDB: () => pool, initDatabase, query, queryOne, execute, lastInsertId };
