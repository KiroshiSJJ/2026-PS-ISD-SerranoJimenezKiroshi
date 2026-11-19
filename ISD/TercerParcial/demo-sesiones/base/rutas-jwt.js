// Rutas de JWT. Las separé de app.js para que se vea clara la diferencia:
//   app.js       → sesión con cookie (el servidor guarda los datos en la tabla sessions)
//   rutas-jwt.js → JWT (el servidor NO guarda nada; los datos viajan dentro del token)
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const { crearModeloTokens } = require('./modelos/tokens.modelo');

// Recibe la app ya creada y le agrega las rutas /api/jwt/...
function registrarRutasJWT(app, config, pool, usuarios) {
  const tokens = crearModeloTokens(pool);

  // Llave con la que se firma. Si alguien la cambia, todos los tokens anteriores dejan de valer.
  const SECRETO_JWT = process.env.JWT_SECRET || 'secreto-jwt-solo-para-la-demo';

  // Fecha "exp" o "iat" del token (segundos) → segundos que faltan.
  const faltan = (exp) => Math.max(0, exp - Math.floor(Date.now() / 1000));

  // Arma y firma el token.
  //  payload: quién es (sub = id, usuario, nombre, rol). Nada secreto: cualquiera lo puede leer.
  //  expiresIn: el token trae su propia fecha de vencimiento (exp).
  //  jwtid: un id único (jti) para poder ponerlo en la lista negra.
  function firmarToken(usuario) {
    const payload = { sub: String(usuario.id), usuario: usuario.usuario, nombre: usuario.nombre, rol: usuario.rol };
    return jwt.sign(payload, SECRETO_JWT, {
      algorithm: 'HS256',
      expiresIn: config.jwtExpiraSeg,
      jwtid: crypto.randomUUID(),
    });
  }

  // Middleware 401: revisa el encabezado Authorization en este orden:
  //  1) ¿viene "Bearer <token>"?  2) ¿la firma es nuestra y no ha vencido?  3) ¿no está revocado?
  async function requiereJWT(req, res, next) {
    const [tipo, token] = (req.headers.authorization || '').split(' ');
    if (tipo !== 'Bearer' || !token) {
      return res.status(401).json({ error: '401 · No mandaste token (falta Authorization: Bearer ...)' });
    }

    try {
      // algorithms: ['HS256'] → no aceptamos tokens con otro algoritmo (ni "none", que no trae firma).
      req.jwt = jwt.verify(token, SECRETO_JWT, { algorithms: ['HS256'] });
    } catch (error) {
      const motivo = error.name === 'TokenExpiredError' ? 'el token ya expiró' : 'el token no es válido';
      return res.status(401).json({ error: `401 · ${motivo}` });
    }

    try {
      if (config.jwtRevocar && (await tokens.estaRevocado(req.jwt.jti))) {
        return res.status(401).json({ error: '401 · Este token ya se cerró (está en la lista negra)' });
      }
    } catch (error) {
      return next(error);
    }
    next();
  }

  // Middleware 403: el token es válido, pero el rol no tiene permiso. Siempre después de requiereJWT.
  function requiereRolJWT(rol) {
    return (req, res, next) => {
      if (req.jwt.rol === rol) return next();
      res.status(403).json({ error: `403 · ${req.jwt.usuario} es ${req.jwt.rol}; esta ruta es para ${rol}` });
    };
  }

  // POST /api/jwt/login → mismo verificar() del login con cookie, pero en vez de sesión regresa el token.
  app.post('/api/jwt/login', async (req, res, next) => {
    try {
      const { usuario, contrasena } = req.body || {};
      const datos = await usuarios.verificar(usuario, contrasena);
      if (!datos) return res.status(401).json({ error: 'Usuario o contraseña incorrectos' });
      res.json({ token: firmarToken(datos), duraSegundos: config.jwtExpiraSeg });
    } catch (error) {
      next(error);
    }
  });

  // GET /api/jwt/sesion → los elementos de la sesión, sacados del token ya verificado.
  app.get('/api/jwt/sesion', requiereJWT, (req, res) => {
    const { sub, usuario, nombre, rol, iat, exp, jti } = req.jwt;
    res.json({
      id: sub,
      usuario,
      nombre,
      rol,
      jti,
      emitido: new Date(iat * 1000).toISOString(),
      expira: new Date(exp * 1000).toISOString(),
      quedanSegundos: faltan(exp),
    });
  });

  app.get('/api/jwt/perfil', requiereJWT, (req, res) => {
    res.json({ mensaje: `Hola, ${req.jwt.nombre}`, rol: req.jwt.rol, quedanSegundos: faltan(req.jwt.exp) });
  });

  app.get('/api/jwt/reporte', requiereJWT, requiereRolJWT('admin'), (req, res) => {
    res.json({ reporte: 'Talleres: 3 · Inscritos: 57 · Cupo libre: 18' });
  });

  // POST /api/jwt/refresh → token nuevo (otro jti, tiempo completo) a partir de uno que todavía sirve.
  app.post('/api/jwt/refresh', requiereJWT, (req, res) => {
    const { sub, usuario, nombre, rol } = req.jwt;
    res.json({ token: firmarToken({ id: sub, usuario, nombre, rol }), duraSegundos: config.jwtExpiraSeg });
  });

  // POST /api/jwt/logout → con jwtRevocar el token va a la lista negra; sin él, solo lo borra el navegador.
  app.post('/api/jwt/logout', requiereJWT, async (req, res, next) => {
    try {
      if (config.jwtRevocar) {
        await tokens.revocar(req.jwt.jti, req.jwt.usuario, req.jwt.exp);
        return res.json({ revocado: true, mensaje: 'El servidor anotó el token en la lista negra' });
      }
      res.json({ revocado: false, mensaje: 'El servidor no guarda nada: el token vale hasta que expire' });
    } catch (error) {
      next(error);
    }
  });

  // GET /api/diagnostico/tokens → la lista negra. Solo para la clase, igual que /api/diagnostico/sesiones.
  app.get('/api/diagnostico/tokens', async (req, res, next) => {
    try {
      res.json({ jwtRevocar: config.jwtRevocar, revocados: await tokens.listar() });
    } catch (error) {
      next(error);
    }
  });
}

module.exports = { registrarRutasJWT };
