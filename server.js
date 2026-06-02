const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const path = require('path');
const { getDB, initDatabase, query, queryOne, execute } = require('./database');
const PDFDocument = require('pdfkit');
const os = require('os');

const app = express();
const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || '0.0.0.0';
const crypto = require('crypto');

const sessions = new Map();

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

function authMiddleware(req, res, next) {
  if (req.path === '/login' || req.path === '/register-public' || req.path.startsWith('/facturacion/pdf/') || req.path.startsWith('/reportes/')) return next();
  const token = req.headers['x-auth-token'];
  if (!token || !sessions.has(token)) return res.status(401).json({ error: 'No autorizado' });
  req.user = sessions.get(token);
  next();
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'No autorizado' });
    if (!roles.includes(req.user.rol)) return res.status(403).json({ error: 'Acceso denegado para tu rol' });
    next();
  };
}

app.use('/api', authMiddleware);

let dbReady = false;

app.use(async (req, res, next) => {
  if (!dbReady && req.path.startsWith('/api/')) {
    try {
      await initDatabase();
      dbReady = true;
    } catch (e) {
      return res.status(500).json({ error: 'Error inicializando DB: ' + e.message });
    }
  }
  next();
});

initDatabase().then(() => { dbReady = true; });

// ==================== AUTH ====================
app.post('/api/login', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'Usuario y contraseña requeridos' });

  try {
    const user = await queryOne('SELECT * FROM usuarios WHERE username = ? AND activo = 1', [username]);
    if (!user) return res.status(401).json({ error: 'Usuario o contraseña incorrectos' });

    const valid = bcrypt.compareSync(password, user.password);
    if (!valid) return res.status(401).json({ error: 'Usuario o contraseña incorrectos' });

    await execute('UPDATE usuarios SET ultimo_acceso = datetime("now","localtime") WHERE id = ?', [user.id]);
    const token = crypto.randomBytes(32).toString('hex');
    sessions.set(token, { id: user.id, nombre: user.nombre, username: user.username, rol: user.rol, permisos: JSON.parse(user.permisos || '{}') });

    res.json({
      token, id: user.id, nombre: user.nombre, username: user.username,
      rol: user.rol, permisos: JSON.parse(user.permisos || '{}')
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/registrar', requireRole('Administrador'), async (req, res) => {
  const { nombre, username, password, rol } = req.body;
  if (!nombre || !username || !password) return res.status(400).json({ error: 'Todos los campos requeridos' });

  const errors = validarPassword(password);
  if (errors.length > 0) return res.status(400).json({ error: errors.join('. ') });

  try {
    const exists = await queryOne('SELECT id FROM usuarios WHERE username = ?', [username]);
    if (exists) return res.status(400).json({ error: 'El usuario ya existe' });

    const hash = bcrypt.hashSync(password, 10);
    await execute('INSERT INTO usuarios (nombre, username, password, rol) VALUES (?,?,?,?)', [nombre, username, hash, rol || 'Vendedor']);
    res.json({ success: true, message: 'Usuario registrado' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Registro público desde login
app.post('/api/register-public', async (req, res) => {
  const { nombre, username, password, rol } = req.body;
  if (!nombre || !username || !password) return res.status(400).json({ error: 'Todos los campos requeridos' });

  const errors = validarPassword(password);
  if (errors.length > 0) return res.status(400).json({ error: errors.join('. ') });

  try {
    const exists = await queryOne('SELECT id FROM usuarios WHERE username = ?', [username]);
    if (exists) return res.status(400).json({ error: 'El usuario ya existe' });

    const hash = bcrypt.hashSync(password, 10);
    const finalRol = (rol === 'Administrador') ? 'Administrador' : 'Vendedor';
    await execute('INSERT INTO usuarios (nombre, username, password, rol) VALUES (?,?,?,?)', [nombre, username, hash, finalRol]);
    res.json({ success: true, message: 'Cuenta creada exitosamente' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/cambiar-password', requireRole('Administrador', 'Vendedor'), async (req, res) => {
  const { username, password_actual, password_nueva } = req.body;
  if (!username || !password_actual || !password_nueva) return res.status(400).json({ error: 'Campos requeridos' });

  const errors = validarPassword(password_nueva);
  if (errors.length > 0) return res.status(400).json({ error: errors.join('. ') });

  try {
    const user = await queryOne('SELECT * FROM usuarios WHERE username = ?', [username]);
    if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });

    const valid = bcrypt.compareSync(password_actual, user.password);
    if (!valid) return res.status(401).json({ error: 'Contraseña actual incorrecta' });

    const hash = bcrypt.hashSync(password_nueva, 10);
    await execute('UPDATE usuarios SET password = ? WHERE id = ?', [hash, user.id]);
    res.json({ success: true, message: 'Contraseña actualizada' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

function validarPassword(password) {
  const errors = [];
  if (password.length < 8) errors.push('Mínimo 8 caracteres');
  if (!/[A-Z]/.test(password)) errors.push('Debe contener mayúscula');
  if (!/[a-z]/.test(password)) errors.push('Debe contener minúscula');
  if (!/[0-9]/.test(password)) errors.push('Debe contener número');
  if (!/[!@#$%^&*(),.?":{}|<>_]/.test(password)) errors.push('Debe contener carácter especial');
  return errors;
}

// ==================== DASHBOARD ====================
app.get('/api/dashboard', async (req, res) => {
  try {
    const plantasStock = await queryOne("SELECT COALESCE(SUM(stock),0) as total FROM plantas WHERE activo = 1");
    const ventasMes = await queryOne("SELECT COALESCE(SUM(total),0) as total FROM ventas WHERE strftime('%Y-%m', created_at) = strftime('%Y-%m', 'now')");
    const ventasMesAnt = await queryOne("SELECT COALESCE(SUM(total),0) as total FROM ventas WHERE strftime('%Y-%m', created_at) = strftime('%Y-%m', 'now', '-1 month')");
    const ventasCount = await queryOne("SELECT COUNT(*) as c FROM ventas WHERE strftime('%Y-%m', created_at) = strftime('%Y-%m', 'now')");
    const ticketProm = ventasCount.c > 0 ? (ventasMes.total / ventasCount.c) : 0;

    const alertas = await queryOne("SELECT COUNT(*) as c FROM plantas WHERE stock <= stock_minimo AND activo = 1");
    const alertasCriticas = await queryOne("SELECT COUNT(*) as c FROM plantas WHERE stock = 0 AND activo = 1");
    const clientesActivos = await queryOne("SELECT COUNT(*) as c FROM clientes WHERE activo = 1");
    const clientesNuevosMes = await queryOne("SELECT COUNT(*) as c FROM clientes WHERE strftime('%Y-%m', created_at) = strftime('%Y-%m', 'now')");
    const personalActivo = await queryOne("SELECT COUNT(*) as c FROM personal WHERE estado = 'Activo'");
    const personalCampo = await queryOne("SELECT COUNT(*) as c FROM personal WHERE area = 'Campo' AND estado = 'Activo'");

    const ventasHoy = await queryOne("SELECT COALESCE(SUM(total),0) as total FROM ventas WHERE date(created_at) = date('now')");
    const ventasTotal = ventasMes.total || 0;
    const gastosOperativos = Math.round(ventasTotal * 0.38);

    const ventasCat = await query(`
      SELECT p.categoria, COALESCE(SUM(vd.subtotal),0) as total
      FROM ventas_detalle vd JOIN plantas p ON vd.producto_id = p.id AND vd.producto_tipo = 'planta'
      JOIN ventas v ON vd.venta_id = v.id
      WHERE strftime('%Y-%m', v.created_at) = strftime('%Y-%m', 'now')
      GROUP BY p.categoria
    `);

    const ventasSemana = await query(`
      SELECT CAST(strftime('%W', created_at) AS INTEGER) - CAST(strftime('%W', date('now','start of month')) AS INTEGER) + 1 as semana,
             COALESCE(SUM(total),0) as total
      FROM ventas WHERE strftime('%Y-%m', created_at) = strftime('%Y-%m', 'now')
      GROUP BY semana ORDER BY semana
    `);

    const topProductos = await query(`
      SELECT vd.producto_nombre as nombre, SUM(vd.cantidad) as total
      FROM ventas_detalle vd
      WHERE strftime('%Y-%m', vd.created_at) = strftime('%Y-%m', 'now')
      GROUP BY vd.producto_nombre ORDER BY total DESC LIMIT 5
    `);

    res.json({
      plantasStock: plantasStock.total || 0,
      ventasMes: ventasMes.total,
      ventasMesAnt: ventasMesAnt.total,
      ventasCount: ventasCount.c,
      ticketPromedio: Math.round(ticketProm * 100) / 100,
      alertas: alertas.c,
      alertasCriticas: alertasCriticas.c,
      clientesActivos: clientesActivos.c,
      clientesNuevosMes: clientesNuevosMes.c,
      personalActivo: personalActivo.c,
      personalCampo: personalCampo.c,
      ventasHoy: ventasHoy.total,
      gastosOperativos,
      ventasCategoria: ventasCat,
      ventasSemana,
      topProductos
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/dashboard/alertas', async (req, res) => {
  try { res.json(await query("SELECT nombre, stock, stock_minimo FROM plantas WHERE stock <= stock_minimo AND activo = 1 ORDER BY stock ASC")); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/dashboard/admin', async (req, res) => {
  try {
    const today = new Date(); today.setHours(0,0,0,0);
    const todayStr = today.toISOString();
    const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
    const monthStartStr = monthStart.toISOString();
    const thirtyDaysAgo = new Date(today.getTime() - 30 * 86400000);
    const thirtyDaysAgoStr = thirtyDaysAgo.toISOString();

    // Utilidad del día: suma de (subtotal - cantidad * costo) para ventas de hoy
    const utilDia = await queryOne(`
      SELECT COALESCE(SUM(vd.subtotal - (vd.cantidad * COALESCE(p.costo, vd.precio_unitario * 0.6))), 0) as total
      FROM ventas_detalle vd
      JOIN ventas v ON vd.venta_id = v.id
      LEFT JOIN plantas p ON vd.producto_tipo='planta' AND vd.producto_id = p.id
      WHERE v.created_at >= ? AND v.created_at < ?
    `, [todayStr, new Date(today.getTime() + 86400000).toISOString()]);

    // Utilidad del mes
    const nextMonth = new Date(today.getFullYear(), today.getMonth() + 1, 1);
    const utilMes = await queryOne(`
      SELECT COALESCE(SUM(vd.subtotal - (vd.cantidad * COALESCE(p.costo, vd.precio_unitario * 0.6))), 0) as total
      FROM ventas_detalle vd
      JOIN ventas v ON vd.venta_id = v.id
      LEFT JOIN plantas p ON vd.producto_tipo='planta' AND vd.producto_id = p.id
      WHERE v.created_at >= ? AND v.created_at < ?
    `, [monthStartStr, nextMonth.toISOString()]);

    // Ventas de los últimos 30 días agrupadas por día
    const ventas30 = await query(`
      SELECT date(created_at) as fecha, COALESCE(SUM(total),0) as total
      FROM ventas WHERE created_at >= ?
      GROUP BY date(created_at) ORDER BY fecha
    `, [thirtyDaysAgoStr]);

    res.json({ utilidad_dia: utilDia.total, utilidad_mes: utilMes.total, ventas_30_dias: ventas30 });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/ventas/por-vendedor', async (req, res) => {
  try {
    const today = new Date();
    const monthStart = new Date(today.getFullYear(), today.getMonth(), 1).toISOString();
    const nextMonth = new Date(today.getFullYear(), today.getMonth() + 1, 1).toISOString();
    const stats = await query(`
      SELECT u.id, u.nombre,
        COALESCE(SUM(v.total),0) as total_ventas,
        COUNT(v.id) as cantidad_ventas
      FROM usuarios u
      LEFT JOIN ventas v ON v.usuario_id = u.id
        AND v.created_at >= ? AND v.created_at < ?
        AND v.estado != 'Cancelado'
      WHERE u.rol = 'Vendedor'
      GROUP BY u.id ORDER BY total_ventas DESC
    `, [monthStart, nextMonth]);
    res.json(stats);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/ventas/:id/ticket', async (req, res) => {
  try {
    const venta = await queryOne('SELECT v.*, u.nombre as vendedor_nombre FROM ventas v LEFT JOIN usuarios u ON v.usuario_id = u.id WHERE v.id = ?', [req.params.id]);
    if (!venta) return res.status(404).json({ error: 'Venta no encontrada' });
    const productos = await query('SELECT * FROM ventas_detalle WHERE venta_id = ?', [req.params.id]);
    res.json({ venta, productos });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ==================== USUARIOS ====================
app.get('/api/usuarios', async (req, res) => {
  try { res.json(await query('SELECT id, nombre, username, rol, activo, ultimo_acceso, created_at FROM usuarios')); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/usuarios', requireRole('Administrador'), async (req, res) => {
  const { nombre, username, password, rol } = req.body;
  if (!nombre || !username || !password) return res.status(400).json({ error: 'Campos requeridos' });
  const errors = validarPassword(password);
  if (errors.length > 0) return res.status(400).json({ error: errors.join('. ') });
  try {
    const hash = bcrypt.hashSync(password, 10);
    await execute('INSERT INTO usuarios (nombre, username, password, rol) VALUES (?,?,?,?)', [nombre, username, hash, rol || 'Vendedor']);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/usuarios/:id', requireRole('Administrador'), async (req, res) => {
  try {
    const { nombre, username, rol, activo, password } = req.body;
    if (password) {
      const errors = validarPassword(password);
      if (errors.length > 0) return res.status(400).json({ error: errors.join('. ') });
      const hash = bcrypt.hashSync(password, 10);
      await execute('UPDATE usuarios SET nombre=?, username=?, rol=?, activo=?, password=? WHERE id=?', [nombre, username, rol, activo ?? 1, hash, req.params.id]);
    } else {
      await execute('UPDATE usuarios SET nombre=?, username=?, rol=?, activo=? WHERE id=?', [nombre, username, rol, activo ?? 1, req.params.id]);
    }
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/usuarios/:id', requireRole('Administrador'), async (req, res) => {
  try {
    const id = req.params.id;
    await execute('UPDATE usuarios SET activo=0 WHERE id=?', [id]);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/usuarios/:id/restore', requireRole('Administrador'), async (req, res) => {
  try { await execute('UPDATE usuarios SET activo=1 WHERE id=?', [req.params.id]); res.json({ success: true }); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

// ==================== PLANTAS ====================
app.get('/api/plantas', async (req, res) => {
  try { res.json(await query('SELECT * FROM plantas WHERE activo = 1')); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/plantas', requireRole('Administrador'), async (req, res) => {
  try {
    const p = req.body;
    const r = await execute('INSERT INTO plantas (nombre, nombre_cientifico, categoria, precio, costo, stock, stock_minimo, descripcion) VALUES (?,?,?,?,?,?,?,?)',
      [p.nombre, p.nombre_cientifico || null, p.categoria, p.precio, p.costo || 0, p.stock || 0, p.stock_minimo || 10, p.descripcion || null]);
    const id = r.lastId;
    await execute('INSERT INTO inventario (producto_tipo, producto_id, stock_actual, stock_minimo) VALUES (?,?,?,?)', ['planta', id, p.stock || 0, p.stock_minimo || 10]);
    res.json({ success: true, id });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/plantas/:id', requireRole('Administrador'), async (req, res) => {
  try {
    const p = req.body;
    await execute('UPDATE plantas SET nombre=?, nombre_cientifico=?, categoria=?, precio=?, costo=?, stock=?, stock_minimo=?, descripcion=? WHERE id=?',
      [p.nombre, p.nombre_cientifico, p.categoria, p.precio, p.costo || 0, p.stock, p.stock_minimo, p.descripcion, req.params.id]);
    await execute('UPDATE inventario SET stock_actual=?, stock_minimo=? WHERE producto_tipo="planta" AND producto_id=?', [p.stock, p.stock_minimo, req.params.id]);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/plantas/:id', requireRole('Administrador'), async (req, res) => {
  try { await execute('UPDATE plantas SET activo = 0 WHERE id = ?', [req.params.id]); res.json({ success: true }); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

// ==================== CLIENTES ====================
app.get('/api/clientes', async (req, res) => {
  try { res.json(await query('SELECT * FROM clientes WHERE activo = 1')); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/clientes', requireRole('Administrador'), async (req, res) => {
  try {
    const c = req.body;
    await execute('INSERT INTO clientes (nombre, tipo, telefono, email, rfc, limite_credito, direccion) VALUES (?,?,?,?,?,?,?)',
      [c.nombre, c.tipo || 'Particular', c.telefono || null, c.email || null, c.rfc || null, c.limite_credito || 0, c.direccion || null]);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/clientes/:id', requireRole('Administrador'), async (req, res) => {
  try {
    const c = req.body;
    await execute('UPDATE clientes SET nombre=?, tipo=?, telefono=?, email=?, rfc=?, limite_credito=?, direccion=? WHERE id=?',
      [c.nombre, c.tipo, c.telefono, c.email, c.rfc, c.limite_credito, c.direccion, req.params.id]);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/clientes/:id', requireRole('Administrador'), async (req, res) => {
  try { await execute('UPDATE clientes SET activo = 0 WHERE id = ?', [req.params.id]); res.json({ success: true }); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

// ==================== HERRAMIENTAS ====================
app.get('/api/herramientas', async (req, res) => {
  try { res.json(await query('SELECT * FROM herramientas WHERE activo = 1')); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/herramientas', requireRole('Administrador'), async (req, res) => {
  try {
    const h = req.body;
    await execute('INSERT INTO herramientas (nombre, categoria, estado, responsable) VALUES (?,?,?,?)', [h.nombre, h.categoria, h.estado || 'Disponible', h.responsable || null]);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/herramientas/:id', requireRole('Administrador'), async (req, res) => {
  try {
    const h = req.body;
    await execute('UPDATE herramientas SET nombre=?, categoria=?, estado=?, responsable=? WHERE id=?', [h.nombre, h.categoria, h.estado, h.responsable, req.params.id]);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/herramientas/:id', requireRole('Administrador'), async (req, res) => {
  try { await execute('UPDATE herramientas SET activo = 0 WHERE id = ?', [req.params.id]); res.json({ success: true }); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

// ==================== BIOFABRICA ====================
app.get('/api/biofabrica', async (req, res) => {
  try { res.json(await query('SELECT * FROM biofabrica_lotes')); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/biofabrica', requireRole('Administrador'), async (req, res) => {
  try {
    const l = req.body;
    await execute('INSERT INTO biofabrica_lotes (lote_id, producto, fecha_inicio, fecha_vencimiento, estado) VALUES (?,?,?,?,?)',
      [l.lote_id, l.producto, l.fecha_inicio, l.fecha_vencimiento, l.estado || 'En proceso']);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ==================== PERSONAL ====================
app.get('/api/personal', async (req, res) => {
  try {
    res.json(await query(`
      SELECT p.*, u.username, u.rol as usuario_rol
      FROM personal p LEFT JOIN usuarios u ON p.usuario_id = u.id
      WHERE p.activo = 1
    `));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/personal', requireRole('Administrador'), async (req, res) => {
  try {
    const e = req.body;
    let usuarioId = null;
    if (e.username && e.password) {
      const h = bcrypt.hashSync(e.password, 10);
      const r = await execute('INSERT INTO usuarios (nombre, username, password, rol) VALUES (?,?,?,?)', [e.nombre, e.username, h, e.rol || 'Vendedor']);
      usuarioId = r.lastId;
    }
    await execute('INSERT INTO personal (nombre, puesto, area, turno, estado, usuario_id) VALUES (?,?,?,?,?,?)', [e.nombre, e.puesto, e.area, e.turno || 'Matutino', e.estado || 'Activo', usuarioId]);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/personal/:id', requireRole('Administrador'), async (req, res) => {
  try {
    const e = req.body;
    await execute('UPDATE personal SET nombre=?, puesto=?, area=?, turno=?, estado=? WHERE id=?', [e.nombre, e.puesto, e.area, e.turno, e.estado, req.params.id]);
    if (e.usuario_id) {
      if (e.password) {
        const h = bcrypt.hashSync(e.password, 10);
        await execute('UPDATE usuarios SET nombre=?, password=?, rol=? WHERE id=?', [e.nombre, h, e.rol || 'Vendedor', e.usuario_id]);
      } else {
        await execute('UPDATE usuarios SET nombre=?, rol=? WHERE id=?', [e.nombre, e.rol || 'Vendedor', e.usuario_id]);
      }
    }
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/personal/:id', requireRole('Administrador'), async (req, res) => {
  try {
    const emp = await queryOne('SELECT usuario_id FROM personal WHERE id=?', [req.params.id]);
    await execute('UPDATE personal SET activo=0, usuario_id=NULL WHERE id=?', [req.params.id]);
    if (emp && emp.usuario_id) {
      await execute('UPDATE usuarios SET activo=0 WHERE id=?', [emp.usuario_id]);
    }
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/limpiar-ventas', requireRole('Administrador'), async (req, res) => {
  try {
    await execute('DELETE FROM facturacion');
    await execute('DELETE FROM ventas_detalle');
    await execute('DELETE FROM ventas');
    await execute("UPDATE clientes SET compras_totales=0, saldo_actual=0");
    res.json({ success: true, message: 'Ventas, detalle, facturas y contadores de clientes limpiados' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ==================== VENTAS ====================
app.get('/api/ventas', async (req, res) => {
  try {
    const ventas = await query(`
      SELECT v.*, c.nombre as cliente_nombre, u.nombre as usuario_nombre
      FROM ventas v LEFT JOIN clientes c ON v.cliente_id = c.id
      LEFT JOIN usuarios u ON v.usuario_id = u.id
      ORDER BY v.created_at DESC
    `);
    res.json(ventas);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ESPECÍFICO antes de parámetro
app.get('/api/ventas/pendientes-factura', async (req, res) => {
  try {
    const pendientes = await query(`
      SELECT v.id, v.folio, v.total, v.created_at,
             c.nombre AS cliente_nombre, c.rfc,
             COALESCE(f.cfdi_estado, 'Pendiente') AS cfdi_estado
      FROM ventas v
      LEFT JOIN clientes c ON v.cliente_id = c.id
      LEFT JOIN facturacion f ON v.id = f.venta_id
      WHERE f.id IS NULL OR f.cfdi_estado = 'Pendiente'
      ORDER BY v.created_at DESC
    `);
    // Filtrar Cancelado en memoria (por si hay registro con Cancelado y venta re-facturable)
    const filtrar = pendientes.filter(p => p.cfdi_estado !== 'Cancelado' && p.cfdi_estado !== 'Emitido');
    res.json(filtrar);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/ventas/:id', async (req, res) => {
  try {
    const venta = await queryOne(`
      SELECT v.*, c.nombre as cliente_nombre, u.nombre as usuario_nombre
      FROM ventas v LEFT JOIN clientes c ON v.cliente_id = c.id
      LEFT JOIN usuarios u ON v.usuario_id = u.id
      WHERE v.id = ?
    `, [req.params.id]);
    if (!venta) return res.status(404).json({ error: 'Venta no encontrada' });
    venta.productos = await query('SELECT * FROM ventas_detalle WHERE venta_id = ?', [req.params.id]);
    res.json(venta);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/ventas', requireRole('Administrador', 'Vendedor'), async (req, res) => {
  try {
    const { cliente_id, metodo_pago, productos, usuario_id, tipo_venta, anticipo, fecha_programada } = req.body;

    let total = 0;
    for (const p of productos) total += p.cantidad * p.precio_unitario;

    const tv = tipo_venta || 'Normal';
    const ant = parseFloat(anticipo) || 0;
    const saldo = tv === 'Normal' ? 0 : total - ant;
    const estado = tv === 'Normal' ? 'Pagado' : 'Pendiente';

    const folio = 'F-' + String(Date.now()).slice(-6);
    const r = await execute('INSERT INTO ventas (folio, cliente_id, total, metodo_pago, usuario_id, estado, tipo_venta, anticipo, saldo_pendiente, fecha_programada) VALUES (?,?,?,?,?,?,?,?,?,?)',
      [folio, cliente_id || null, total, metodo_pago || 'Efectivo', usuario_id || null, estado, tv, ant, saldo, fecha_programada || null]);
    const ventaId = r.lastId;
    const ticketNumber = 'TKT-' + String(ventaId).padStart(6, '0');
    await execute('UPDATE ventas SET ticket_number=? WHERE id=?', [ticketNumber, ventaId]);

    for (const p of productos) {
      if (p.producto_tipo === 'planta') {
        const planta = await queryOne('SELECT stock FROM plantas WHERE id = ? AND activo = 1', [p.producto_id]);
        if (!planta) return res.status(400).json({ error: 'Producto no encontrado: ' + p.producto_nombre });
        if (planta.stock < p.cantidad) {
          return res.status(400).json({ error: 'Stock insuficiente para ' + p.producto_nombre + ': disponible ' + planta.stock + ', solicitado ' + p.cantidad });
        }
      }
    }

    for (const p of productos) {
      await execute('INSERT INTO ventas_detalle (venta_id, producto_tipo, producto_id, producto_nombre, cantidad, precio_unitario, subtotal) VALUES (?,?,?,?,?,?,?)',
        [ventaId, p.producto_tipo, p.producto_id, p.producto_nombre, p.cantidad, p.precio_unitario, p.cantidad * p.precio_unitario]);

      if (p.producto_tipo === 'planta') {
        await execute('UPDATE plantas SET stock = stock - ? WHERE id = ?', [p.cantidad, p.producto_id]);
        await execute('UPDATE inventario SET stock_actual = stock_actual - ? WHERE producto_tipo="planta" AND producto_id=?', [p.cantidad, p.producto_id]);
      }
    }

    if (cliente_id) {
      const ventasCliente = await queryOne('SELECT COUNT(*) as c FROM ventas WHERE cliente_id = ?', [cliente_id]);
      await execute('UPDATE clientes SET compras_totales = ? WHERE id = ?', [ventasCliente.c, cliente_id]);
    }

    res.json({ success: true, folio, id: ventaId, total, saldo_pendiente: saldo, ticket_number: ticketNumber });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/ventas/:id/abono', requireRole('Administrador', 'Vendedor'), async (req, res) => {
  try {
    const { monto } = req.body;
    const venta = await queryOne('SELECT * FROM ventas WHERE id = ?', [req.params.id]);
    if (!venta) return res.status(404).json({ error: 'Venta no encontrada' });
    const nuevoSaldo = Math.max(0, venta.saldo_pendiente - parseFloat(monto || 0));
    const nuevoEstado = nuevoSaldo <= 0 ? 'Pagado' : venta.estado;
    await execute('UPDATE ventas SET saldo_pendiente=?, estado=?, anticipo=anticipo+? WHERE id=?', [nuevoSaldo, nuevoEstado, parseFloat(monto || 0), req.params.id]);
    res.json({ success: true, saldo_pendiente: nuevoSaldo, estado: nuevoEstado });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ==================== INVENTARIO ====================
app.get('/api/inventario', async (req, res) => {
  try {
    const inventario = await query(`
      SELECT i.*, p.nombre as producto_nombre, p.categoria
      FROM inventario i JOIN plantas p ON i.producto_id = p.id AND i.producto_tipo = 'planta'
      WHERE p.activo = 1 ORDER BY i.stock_actual ASC
    `);
    res.json(inventario);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/inventario/movimiento', requireRole('Administrador'), async (req, res) => {
  try {
    const { producto_id, tipo, cantidad, motivo, usuario_id } = req.body;
    const inv = await queryOne('SELECT * FROM inventario WHERE producto_tipo="planta" AND producto_id=?', [producto_id]);
    if (!inv) return res.status(404).json({ error: 'Producto no encontrado en inventario' });

    const ajuste = tipo === 'Entrada' ? cantidad : -cantidad;
    await execute('UPDATE inventario SET stock_actual = stock_actual + ?, ultima_actualizacion = datetime("now","localtime") WHERE id = ?', [ajuste, inv.id]);
    await execute('UPDATE plantas SET stock = stock + ? WHERE id = ?', [ajuste, producto_id]);
    await execute('INSERT INTO inventario_movimientos (inventario_id, producto_tipo, producto_id, tipo, cantidad, motivo, usuario_id) VALUES (?,?,?,?,?,?,?)',
      [inv.id, 'planta', producto_id, tipo, cantidad, motivo, usuario_id || null]);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ==================== PROVEEDORES ====================
app.get('/api/proveedores', async (req, res) => {
  try { res.json(await query('SELECT * FROM proveedores WHERE activo = 1')); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/proveedores', requireRole('Administrador'), async (req, res) => {
  try {
    const p = req.body;
    await execute('INSERT INTO proveedores (nombre, contacto, telefono, email, producto_principal) VALUES (?,?,?,?,?)',
      [p.nombre, p.contacto || null, p.telefono || null, p.email || null, p.producto_principal || null]);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/proveedores/:id', requireRole('Administrador'), async (req, res) => {
  try {
    const p = req.body;
    await execute('UPDATE proveedores SET nombre=?, contacto=?, telefono=?, email=?, producto_principal=? WHERE id=?',
      [p.nombre, p.contacto, p.telefono, p.email, p.producto_principal, req.params.id]);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/proveedores/:id', requireRole('Administrador'), async (req, res) => {
  try { await execute('UPDATE proveedores SET activo = 0 WHERE id = ?', [req.params.id]); res.json({ success: true }); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

// ==================== ADQUISICION DE PLANTAS ====================
app.get('/api/adquisiciones', async (req, res) => {
  try {
    const items = await query(`
      SELECT a.*, u.nombre as usuario_nombre
      FROM adquisicion_plantas a LEFT JOIN usuarios u ON a.usuario_id = u.id
      ORDER BY a.created_at DESC
    `);
    res.json(items);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/adquisiciones/:id', async (req, res) => {
  try {
    const item = await queryOne('SELECT * FROM adquisicion_plantas WHERE id = ?', [req.params.id]);
    if (!item) return res.status(404).json({ error: 'Adquisición no encontrada' });
    item.productos = await query(`
      SELECT ad.*, p.nombre as planta_nombre, p.categoria
      FROM adquisicion_detalle ad LEFT JOIN plantas p ON ad.planta_id = p.id
      WHERE ad.adquisicion_id = ?
    `, [req.params.id]);
    res.json(item);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/adquisiciones', requireRole('Administrador'), async (req, res) => {
  try {
    const { proveedor, fecha_adquisicion, productos, observaciones, usuario_id } = req.body;
    let total = 0;
    for (const p of (productos || [])) total += (p.cantidad || 0) * (p.precio_unitario || 0);
    const folio = 'ADQ-' + String(Date.now()).slice(-6);
    const result = await execute('INSERT INTO adquisicion_plantas (folio, proveedor, fecha_adquisicion, total, observaciones, usuario_id) VALUES (?,?,?,?,?,?)',
      [folio, proveedor, fecha_adquisicion || new Date().toISOString().split('T')[0], total, observaciones || null, usuario_id || null]);
    const adqId = result.lastId;
    for (const p of (productos || [])) {
      await execute('INSERT INTO adquisicion_detalle (adquisicion_id, planta_id, variedad, cantidad, precio_unitario, subtotal) VALUES (?,?,?,?,?,?)',
        [adqId, p.planta_id, p.variedad || null, p.cantidad || 1, p.precio_unitario || 0, (p.cantidad || 1) * (p.precio_unitario || 0)]);
      await execute('UPDATE plantas SET stock = stock + ? WHERE id = ?', [p.cantidad || 0, p.planta_id]);
      await execute('UPDATE inventario SET stock_actual = stock_actual + ? WHERE producto_tipo="planta" AND producto_id=?', [p.cantidad || 0, p.planta_id]);
    }
    res.json({ success: true, folio, id: adqId });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ==================== CALIDAD ====================
app.get('/api/calidad', async (req, res) => {
  try { res.json(await query('SELECT * FROM calidad_inspecciones ORDER BY created_at DESC')); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/calidad', requireRole('Administrador'), async (req, res) => {
  try {
    const c = req.body;
    await execute('INSERT INTO calidad_inspecciones (lote_producto, inspector, fecha, estado_fitosanitario, calificacion, observaciones) VALUES (?,?,?,?,?,?)',
      [c.lote_producto, c.inspector, c.fecha, c.estado_fitosanitario, c.calificacion || 5, c.observaciones || null]);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ==================== AGENDA ====================
// ==================== FACTURACION ====================
app.get('/api/facturacion', async (req, res) => {
  try {
    const facturas = await query(`
      SELECT f.*, v.folio, v.total, v.metodo_pago, c.nombre as cliente_nombre
      FROM facturacion f JOIN ventas v ON f.venta_id = v.id
      LEFT JOIN clientes c ON v.cliente_id = c.id
      ORDER BY f.created_at DESC
    `);
    res.json(facturas);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/facturacion/:id', requireRole('Administrador'), async (req, res) => {
  try {
    await execute('DELETE FROM facturacion WHERE id = ?', [req.params.id]);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/facturacion/cancelar-pendiente', requireRole('Administrador', 'Vendedor'), async (req, res) => {
  try {
    const { venta_id } = req.body;
    await execute('DELETE FROM facturacion WHERE venta_id = ? AND cfdi_estado = \'Pendiente\'', [venta_id]);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ==================== FACTURACION (timbrar) ====================
app.post('/api/facturacion/timbrar', requireRole('Administrador', 'Vendedor'), async (req, res) => {
  try {
    const { venta_id, rfc, razon_social, uso_cfdi, regimen_fiscal_receptor, codigo_postal } = req.body;
    if (!venta_id || !rfc) return res.status(400).json({ error: 'venta_id y RFC requeridos' });

    const venta = await queryOne('SELECT * FROM ventas WHERE id = ?', [venta_id]);
    if (!venta) return res.status(404).json({ error: 'Venta no encontrada' });

    const existente = await queryOne('SELECT * FROM facturacion WHERE venta_id = ? AND cfdi_estado = ?', [venta_id, 'Timbrato']);
    if (existente) return res.status(400).json({ error: 'Esta venta ya tiene un CFDI timbrado' });

    const uuid = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => { const r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16); });
    const folioFiscal = 'CFDI-' + String(venta_id).padStart(6, '0');
    const fechaTimbrado = new Date().toISOString();

    // Eliminar registros previos (Pendiente/Cancelado) para esta venta
    await execute('DELETE FROM facturacion WHERE venta_id = ? AND cfdi_estado != ?', [venta_id, 'Timbrato']);

    await execute(
      `INSERT INTO facturacion (venta_id, folio_fiscal, rfc, razon_social, uso_cfdi, regimen_fiscal_receptor, codigo_postal, uuid, fecha_timbrado, cfdi_estado)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'Timbrato')`,
      [venta_id, folioFiscal, rfc, razon_social || null, uso_cfdi || null, regimen_fiscal_receptor || null, codigo_postal || null, uuid, fechaTimbrado]
    );

    res.json({ success: true, folio_fiscal: folioFiscal, uuid, fecha_timbrado: fechaTimbrado });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/facturacion/:id/cancelar', requireRole('Administrador'), async (req, res) => {
  try {
    const fact = await queryOne('SELECT * FROM facturacion WHERE id = ?', [req.params.id]);
    if (!fact) return res.status(404).json({ error: 'Factura no encontrada' });
    if (fact.cfdi_estado !== 'Timbrato') return res.status(400).json({ error: 'Solo se pueden cancelar CFDI en estado Timbrato' });
    await execute('UPDATE facturacion SET cfdi_estado=\'Cancelado\', uuid=NULL, fecha_timbrado=NULL WHERE id=?', [req.params.id]);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Generar PDF de factura
app.get('/api/facturacion/pdf/:ventaId', async (req, res) => {
  try {
    const venta = await queryOne(`
      SELECT v.*, c.nombre as cliente_nombre, c.rfc as cliente_rfc
      FROM ventas v LEFT JOIN clientes c ON v.cliente_id = c.id
      WHERE v.id = ?
    `, [req.params.ventaId]);
    if (!venta) return res.status(404).json({ error: 'Venta no encontrada' });

    const productos = await query('SELECT * FROM ventas_detalle WHERE venta_id = ?', [req.params.ventaId]);
    const factura = await queryOne('SELECT * FROM facturacion WHERE venta_id = ?', [req.params.ventaId]);
    if (!factura) return res.status(404).json({ error: 'Factura no encontrada' });

    const doc = new PDFDocument({ margin: 40, size: 'A4' });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename=factura_' + venta.folio + '.pdf');
    doc.pipe(res);

    // Encabezado emisor
    doc.fontSize(18).font('Helvetica-Bold').fillColor('#1b4332').text('VIVERO "EL VERDE"', { align: 'center' });
    doc.fontSize(9).font('Helvetica').fillColor('#333');
    doc.text('Sistema de Gestión — Comprobante Fiscal Digital por Internet (CFDI)', { align: 'center' });
    doc.moveDown(0.3);
    doc.text('RFC: VVE-880101-ABC | Régimen: Persona Moral con Fines No Lucrativos', { align: 'center' });
    doc.text('Domicilio: Carretera Federal México-Xalapa S/N, Sierra de Agua, Perote, Veracruz, C.P. 91280', { align: 'center' });
    doc.moveDown(0.5);

    // Línea
    doc.moveTo(40, doc.y).lineTo(550, doc.y).strokeColor('#2d6a4f').stroke().lineWidth(1);
    doc.moveDown(0.5);

    // Datos del receptor
    doc.font('Helvetica-Bold').fillColor('#1b4332').fontSize(11).text('RECEPTOR');
    doc.font('Helvetica').fillColor('#333').fontSize(9);
    doc.text('RFC: ' + (factura.rfc || '—'));
    doc.text('Razón social: ' + (factura.razon_social || venta.cliente_nombre || 'Público general'));
    if (factura.uso_cfdi) doc.text('Uso CFDI: ' + factura.uso_cfdi);
    if (factura.regimen_fiscal_receptor) doc.text('Régimen fiscal del receptor: ' + factura.regimen_fiscal_receptor);
    if (factura.codigo_postal) doc.text('Código postal: ' + factura.codigo_postal);
    doc.moveDown(0.5);

    // Datos del comprobante
    doc.font('Helvetica-Bold').fontSize(11).text('DATOS DEL COMPROBANTE');
    doc.font('Helvetica').fontSize(9);
    doc.text('Folio venta: ' + venta.folio);
    doc.text('Folio fiscal: ' + (factura.folio_fiscal || '—'));
    doc.text('UUID: ' + (factura.uuid || '—'));
    doc.text('Fecha de timbrado: ' + (factura.fecha_timbrado ? new Date(factura.fecha_timbrado).toLocaleString('es-MX') : '—'));
    doc.text('Método de pago: ' + venta.metodo_pago);
    doc.moveDown(0.5);

    // Tabla de conceptos
    doc.font('Helvetica-Bold').fontSize(11).text('CONCEPTOS');
    doc.moveDown(0.2);

    const tableTop = doc.y;
    const colW = [180, 50, 80, 80, 80];
    const headers = ['Producto', 'Cant', 'Precio', 'Importe'];

    doc.font('Helvetica-Bold').fontSize(8).fillColor('#fff');
    // Fondo de encabezado
    doc.rect(40, tableTop, 460, 16).fill('#2d6a4f');
    doc.fillColor('#fff');
    let xPos = 45;
    headers.forEach((h, i) => { doc.text(h, xPos, tableTop + 4, { width: colW[i], align: i === 0 ? 'left' : 'right' }); xPos += colW[i]; });
    doc.moveDown(2);

    doc.font('Helvetica').fontSize(8).fillColor('#333');
    let yPos = doc.y;
    let subtotal = 0;
    productos.forEach((p, i) => {
      xPos = 45;
      const row = [p.producto_nombre, String(p.cantidad), '$' + p.precio_unitario.toFixed(2), '$' + p.subtotal.toFixed(2)];
      // Fondo alternado
      if (i % 2 === 0) { doc.rect(40, yPos - 2, 460, 14).fillColor('#f5f0e8').fill(); }
      doc.fillColor('#333');
      row.forEach((val, ci) => { doc.text(val, xPos, yPos, { width: colW[ci], align: ci === 0 ? 'left' : 'right' }); xPos += colW[ci]; });
      subtotal += p.subtotal;
      yPos += 14;
      doc.y = yPos;
    });

    // Totales
    const iva = subtotal * 0.16;
    const total = subtotal + iva;
    doc.moveDown(0.5);
    doc.moveTo(350, doc.y).lineTo(550, doc.y).strokeColor('#ccc').stroke();
    doc.moveDown(0.5);

    let ty = doc.y;
    doc.font('Helvetica').fontSize(9).fillColor('#333');
    doc.text('Subtotal:', 350, ty, { width: 150, align: 'right' });
    doc.text('$' + subtotal.toFixed(2), 500, ty, { width: 90, align: 'right' });
    ty += 14;
    doc.text('IVA 16%:', 350, ty, { width: 150, align: 'right' });
    doc.text('$' + iva.toFixed(2), 500, ty, { width: 90, align: 'right' });
    ty += 18;
    doc.moveTo(350, ty).lineTo(550, ty).strokeColor('#1b4332').stroke();
    ty += 8;
    doc.font('Helvetica-Bold').fontSize(11).fillColor('#1b4332');
    doc.text('Total:', 350, ty, { width: 150, align: 'right' });
    doc.text('$' + total.toFixed(2), 500, ty, { width: 90, align: 'right' });
    doc.y = ty + 14;

    // QR simulado
    doc.moveDown(2);
    doc.font('Helvetica').fontSize(8).fillColor('#666');
    doc.text('[ CÓDIGO QR SIMULADO ]', 40, doc.y, { align: 'left' });
    doc.text('UUID: ' + (factura.uuid || '—'), 40, doc.y, { align: 'left' });

    // Leyenda fiscal
    doc.moveDown(2);
    doc.font('Helvetica-Bold').fontSize(7).fillColor('#c0392b');
    const leyendaY = doc.y;
    doc.rect(40, leyendaY, 520, 25).fillColor('#fde8e8').fill();
    doc.fillColor('#c0392b').text('Este CFDI es una emulación educativa, no tiene validez fiscal', 45, leyendaY + 5, { align: 'center', width: 510 });
    doc.text('Generado el ' + new Date().toLocaleString('es-MX'), 45, leyendaY + 15, { align: 'center', width: 510, fontSize: 6 });

    doc.end();
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ==================== REPORTES PDF ====================
app.get('/api/reportes/pdf', async (req, res) => {
  try {
    const doc = new PDFDocument({ margin: 40, size: 'A4' });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename=reporte_vivero.pdf');
    doc.pipe(res);

    const mes = new Date().toLocaleString('es-MX', { month: 'long', year: 'numeric' });

    doc.fontSize(22).font('Helvetica-Bold').text('Vivero — Sistema de Gestión', { align: 'center' });
    doc.fontSize(12).font('Helvetica').text('Reporte del ' + mes, { align: 'center' });
    doc.moveDown(0.3);
    doc.fontSize(9).fillColor('#666').text('Generado: ' + new Date().toLocaleString('es-MX'), { align: 'center' });
    doc.moveDown(1);

    const ventasMes = await queryOne("SELECT COALESCE(SUM(total),0) as t FROM ventas WHERE strftime('%Y-%m', created_at) = strftime('%Y-%m', 'now')");
    const unidadesVendidas = await queryOne("SELECT COALESCE(SUM(vd.cantidad),0) as t FROM ventas_detalle vd JOIN ventas v ON vd.venta_id = v.id WHERE strftime('%Y-%m', v.created_at) = strftime('%Y-%m', 'now')");
    const clientesNuevos = await queryOne("SELECT COUNT(*) as c FROM clientes WHERE strftime('%Y-%m', created_at) = strftime('%Y-%m', 'now')");
    const totalVentas = await queryOne("SELECT COALESCE(SUM(total),0) as t FROM ventas WHERE strftime('%Y-%m', created_at) = strftime('%Y-%m', 'now')");
    const gastosOp = (totalVentas?.t || 0) * 0.38;

    doc.fillColor('#2d6a4f').fontSize(14).font('Helvetica-Bold').text('Resumen Ejecutivo', { underline: true });
    doc.fillColor('#000').moveDown(0.3);

    const summaryData = [
      ['Ventas del mes', '$' + Number(ventasMes?.t || 0).toLocaleString()],
      ['Unidades vendidas', String(unidadesVendidas?.t || 0)],
      ['Clientes nuevos', String(clientesNuevos?.c || 0)],
      ['Gastos operativos', '$' + Math.round(gastosOp).toLocaleString()],
      ['Margen operativo', Math.round((1 - gastosOp / ((totalVentas?.t || 1))) * 100) + '%']
    ];

    doc.fontSize(10);
    summaryData.forEach((row, i) => {
      const y = doc.y;
      doc.fillColor(i % 2 === 0 ? '#f0f0f0' : '#ffffff').rect(40, y, 250, 18).fill();
      doc.fillColor('#333').font('Helvetica').text(row[0], 45, y + 3, { width: 150 });
      doc.font('Helvetica-Bold').text(row[1], 200, y + 3, { width: 100, align: 'right' });
      doc.y = y + 20;
    });

    doc.moveDown(1);

    const topProductos = await query(`
      SELECT vd.producto_nombre, SUM(vd.cantidad) as total FROM ventas_detalle vd
      JOIN ventas v ON vd.venta_id = v.id
      WHERE strftime('%Y-%m', v.created_at) = strftime('%Y-%m', 'now')
      GROUP BY vd.producto_nombre ORDER BY total DESC LIMIT 5
    `);

    if (topProductos.length > 0) {
      doc.fillColor('#2d6a4f').fontSize(14).font('Helvetica-Bold').text('Top Productos Vendidos', { underline: true });
      doc.fillColor('#000').moveDown(0.3);
      doc.fontSize(10);
      topProductos.forEach((p, i) => {
        const y = doc.y;
        doc.fillColor('#333').font('Helvetica').text((i + 1) + '. ' + p.producto_nombre, 45, y, { width: 300 });
        doc.font('Helvetica-Bold').text(p.total + ' uds.', 310, y, { width: 80, align: 'right' });
        doc.y = y + 18;
      });
    }

    doc.moveDown(1);

    const alertas = await query("SELECT nombre, stock, stock_minimo FROM plantas WHERE stock <= stock_minimo AND activo = 1 ORDER BY stock ASC");
    if (alertas.length > 0) {
      doc.fillColor('#c0392b').fontSize(14).font('Helvetica-Bold').text('Alertas de Inventario', { underline: true });
      doc.fillColor('#000').moveDown(0.3);
      doc.fontSize(10);
      alertas.forEach(a => {
        doc.fillColor('#333').font('Helvetica').text('• ' + a.nombre + ' — Stock: ' + a.stock + ' / Mínimo: ' + a.stock_minimo, 45, doc.y);
        doc.y += 16;
      });
    }

    doc.moveDown(1);

    const ventasPorSemana = await query(`
      SELECT CAST(strftime('%W', created_at) AS INTEGER) - CAST(strftime('%W', date('now','start of month')) AS INTEGER) + 1 as semana,
             SUM(total) as total
      FROM ventas WHERE strftime('%Y-%m', created_at) = strftime('%Y-%m', 'now')
      GROUP BY semana ORDER BY semana
    `);

    if (ventasPorSemana.length > 0) {
      doc.fillColor('#2d6a4f').fontSize(14).font('Helvetica-Bold').text('Ventas por Semana', { underline: true });
      doc.fillColor('#000').moveDown(0.3);
      ventasPorSemana.forEach(s => {
        doc.fillColor('#333').font('Helvetica').text('Semana ' + s.semana + ': $' + Number(s.total).toLocaleString(), 45, doc.y);
        doc.y += 16;
      });
    }

    doc.moveDown(2);
    doc.fontSize(9).fillColor('#999').text('— Fin del reporte —', { align: 'center' });
    doc.end();
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ==================== LOGOUT ====================
app.post('/api/logout', (req, res) => {
  const token = req.headers['x-auth-token'];
  if (token) sessions.delete(token);
  res.json({ success: true });
});

// ==================== START ====================
app.listen(PORT, HOST, () => {
  const nets = os.networkInterfaces();
  let ip = 'localhost';
  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      if (net.family === 'IPv4' && !net.internal) { ip = net.address; break; }
    }
  }
  console.log('\x1b[32m%s\x1b[0m', ' Vivero API running on http://localhost:' + PORT);
  console.log(' Other devices on your network: http://' + ip + ':' + PORT);
  console.log(' Default users: admin (Admin), vendedor (Vendedor)');
  console.log(' Passwords: <username> + "123!" (e.g., admin + Admin123!)');
});
