// La aplicación de la demo. server.js la arranca; las pruebas la arrancan con otras configuraciones.
// Lo que se programó en clase, corregido para que cumpla la tabla de la API de la guía
// (nombres de campos, códigos 401/403/404 y mensajes).
const path = require('path');
const express = require('express');
const session = require('express-session');
const MySQLStore = require('express-mysql-session')(session);
const { crearModeloUsuarios } = require('./modelos/usuarios.modelo');
const { registrarRutasJWT } = require('./rutas-jwt'); // JWT: las rutas están en su propio archivo

const NOMBRE_COOKIE = 'connect.sid';

// Lee todas las sesiones del almacén (MemoryStore usa callback; MySQLStore puede regresar una promesa).
function todasLasSesiones(almacen) {
  return new Promise((resolve, reject) => {
    const promesa = almacen.all((error, sesiones) => (error ? reject(error) : resolve(sesiones)));
    if (promesa && typeof promesa.then === 'function') promesa.then(resolve, reject);
  });
}

// Solo mostramos los primeros 8 caracteres del id: suficiente para compararlo en pantalla.
const idCorto = (id) => (id ? `${id.slice(0, 8)}…` : null);

function crearApp(config, pool) {
  const app = express();
  app.use(express.json());

  // Primero obtenemos el modelo de la BD.
  const usuarios = crearModeloUsuarios(pool);

  // Dónde se guardan las sesiones: en la memoria del proceso o en la tabla sessions de MySQL.
  // En los dos casos el navegador solo guarda la cookie con el id firmado.
  const almacen = config.almacen === 'memoria'
    ? new session.MemoryStore()
    : new MySQLStore({ createDatabaseTable: false, clearExpired: false }, pool);
  app.locals.almacen = almacen;

  app.use(
    session({
      name: NOMBRE_COOKIE,
      secret: process.env.SESSION_SECRET || 'secreto-solo-para-la-demo',
      store: almacen,
      resave: false,
      // No se crea la sesión (ni la cookie) hasta que haya algo que guardar.
      saveUninitialized: false,
      rolling: Boolean(config.rolling),
      cookie: {
        maxAge: config.maxAgeMs,
        // Con ?? (y no con ||) para que httpOnly: false sí se respete.
        httpOnly: config.httpOnly ?? true,
        sameSite: config.sameSite || 'lax',
        secure: config.secure || false,
      },
    })
  );

  // El servidor decide si la sesión venció; no basta con confiar en el Expires de la cookie.
  // rolling: true → cuenta desde el último uso; rolling: false → desde que se creó.
  function vencida(sesion) {
    const desde = config.rolling ? sesion.ultimoUso : sesion.creada;
    return Date.now() - desde > config.maxAgeMs;
  }

  // 401: "no sé quién eres".
  function requiereSesion(req, res, next) {
    if (req.session.usuario && vencida(req.session)) {
      return req.session.destroy(() => {
        res.clearCookie(NOMBRE_COOKIE);
        res.status(401).json({ error: '401 · Tu sesión venció: vuelve a iniciar sesión' });
      });
    }
    if (!req.session.usuario) {
      return res.status(401).json({ error: '401 · No has iniciado sesión (o tu sesión ya venció)' });
    }
    req.session.ultimoUso = Date.now();
    next();
  }

  // 403: "sé quién eres, pero no puedes". Siempre va DESPUÉS de requiereSesion.
  function requiereRol(rol) {
    return (req, res, next) => {
      if (req.session.usuario.rol !== rol) {
        return res.status(403).json({
          error: `403 · Eres ${req.session.usuario.usuario}, pero esta ruta es solo para ${rol}`,
        });
      }
      next();
    };
  }

  // ----- Rutas -----

  app.get('/api/config', (req, res) => res.json(config));

  // Crea una sesión sin usuario (sirve para ver la fijación de sesión).
  app.post('/api/visita', (req, res) => {
    req.session.visitas = (req.session.visitas || 0) + 1;
    res.json({ visitas: req.session.visitas, sesion: idCorto(req.sessionID) });
  });

  app.post('/api/login', async (req, res, next) => {
    try {
      const { usuario, contrasena } = req.body || {};
      const datos = await usuarios.verificar(usuario, contrasena);
      // El mismo mensaje si el usuario no existe o si la contraseña está mal.
      if (!datos) return res.status(401).json({ error: 'Usuario o contraseña incorrectos' });

      // Si ya había una sesión (por ejemplo, de /api/visita), anotamos su id para compararlo.
      const antes = req.session.visitas !== undefined ? idCorto(req.sessionID) : null;
      const visitas = req.session.visitas || 0;

      const guardar = () => {
        req.session.usuario = datos;
        req.session.visitas = visitas;
        req.session.creada = Date.now();
        req.session.ultimoUso = Date.now();
        req.session.save((error) => {
          if (error) return next(error);
          res.json({ usuario: datos, sesionAntes: antes, sesionDespues: idCorto(req.sessionID) });
        });
      };

      if (config.regenerarAlEntrar) {
        // Id nuevo al entrar: la cookie que alguien haya "plantado" deja de servir (fijación de sesión).
        req.session.regenerate((error) => (error ? next(error) : guardar()));
      } else {
        guardar();
      }
    } catch (error) {
      next(error);
    }
  });

  app.post('/api/logout', (req, res, next) => {
    // destroy borra la sesión en el servidor (la fila de MySQL): una cookie copiada ya no sirve.
    req.session.destroy((error) => {
      if (error) return next(error);
      res.clearCookie(NOMBRE_COOKIE);
      res.json({ mensaje: 'Sesión cerrada: el servidor la borró' });
    });
  });

  app.get('/api/sesion', requiereSesion, (req, res) => {
    const desde = config.rolling ? req.session.ultimoUso : req.session.creada;
    res.json({
      usuario: req.session.usuario,
      sesion: idCorto(req.sessionID),
      expiraEnSegundos: Math.max(0, Math.round((desde + config.maxAgeMs - Date.now()) / 1000)),
    });
  });

  app.get('/api/perfil', requiereSesion, (req, res) => {
    req.session.visitas = (req.session.visitas || 0) + 1;
    res.json({
      mensaje: `Hola, ${req.session.usuario.nombre}`,
      rol: req.session.usuario.rol,
      visitas: req.session.visitas,
    });
  });

  app.get('/api/admin/reporte', requiereSesion, requiereRol('admin'), (req, res) => {
    res.json({ reporte: 'Talleres: 3 · Inscritos: 57 · Cupo libre: 18' });
  });

  // Solo para la clase: un servidor real nunca muestra esto.
  app.get('/api/diagnostico/sesiones', async (req, res, next) => {
    try {
      const sesiones = await todasLasSesiones(almacen);
      const lista = Object.entries(sesiones || {}).map(([id, s]) => ({
        sesion: idCorto(id),
        esLaTuya: id === req.sessionID,
        usuario: s.usuario ? s.usuario.usuario : '(sin iniciar sesión)',
        visitas: s.visitas || 0,
        expira: s.cookie && s.cookie.expires,
      }));
      res.json({ almacen: config.almacen, sesiones: lista });
    } catch (error) {
      next(error);
    }
  });

  // JWT: se registran antes del 404 de /api para que sí las encuentre.
  registrarRutasJWT(app, config, pool, usuarios);

  app.use(express.static(path.join(__dirname, 'public')));

  app.use('/api', (req, res) => res.status(404).json({ error: 'Ruta no encontrada' }));

  app.use((error, req, res, next) => {
    console.error(error);
    res.status(500).json({ error: 'Error en el servidor' });
  });

  return app;
}

module.exports = { crearApp, NOMBRE_COOKIE };
