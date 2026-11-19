const $ = (id) => document.getElementById(id);

// Etapa 1 — Llamar a la API

// JWT: el 4° parámetro es el token. Si viene, va en Authorization (la cookie se manda sola, el token no).
async function llamar(metodo, url, cuerpo, token) {
  const opciones = { method: metodo, headers: {} };
  if (token) opciones.headers.Authorization = `Bearer ${token}`;
  if (cuerpo !== undefined) {
    opciones.headers['Content-Type'] = 'application/json';
    opciones.body = JSON.stringify(cuerpo);
  }
  const respuesta = await fetch(url, opciones);
  let datos = null;
  try {
    datos = await respuesta.json();
  } catch {
    // Si la respuesta no es JSON (un error raro, una página HTML), no tronamos: datos queda en null.
    datos = null;
  }
  return { status: respuesta.status, datos };
}

// Etapa 2 — La bitácora

// Traduce el código HTTP a la clase de color que ya existe en estilos.css
function claseDelCodigo(status) {
  if (status >= 200 && status < 300) return 'codigo ok';
  if (status === 401) return 'codigo e401';
  if (status === 403) return 'codigo e403';
  return 'codigo error';
}

// Deja registro de cada respuesta para poder comparar antes y después (por ejemplo, 403 → 401 → 200).
// Se usa prepend para que lo más nuevo quede arriba y no haya que bajar.
// Todo se mete con textContent y nunca con innerHTML: el JSON puede traer texto escrito por alguien
// Con innerHTML ese texto se interpretaría como HTML y podría correr un script (XSS)
// lista: id de la bitácora donde se escribe (la de la tarjeta 3 por defecto, o la de JWT).
function anotar(metodo, url, status, datos, lista = 'bitacora') {
  const li = document.createElement('li');

  const codigo = document.createElement('span');
  codigo.className = claseDelCodigo(status);
  codigo.textContent = status;

  const ruta = document.createElement('strong');
  ruta.textContent = ` ${metodo} ${url}`;

  const json = document.createElement('pre');
  json.textContent = JSON.stringify(datos, null, 2);

  li.append(codigo, ruta, json);
  $(lista).prepend(li);
}

// Llama y anota en un solo paso: es lo que hacen el formulario y los botones.
async function llamarYAnotar(metodo, url, cuerpo) {
  const r = await llamar(metodo, url, cuerpo);
  anotar(metodo, url, r.status, r.datos);
  return r;
}

// Etapa 3 — El estado

// Le preguntamos al servidor quiénes somos porque solo él lo sabe: la página no puede leer la cookie
async function refrescarEstado() {
  const { status, datos } = await llamar('GET', '/api/sesion');
  const estado = $('estado');
  if (status === 200) {
    const u = datos.usuario;
    estado.textContent = `Con sesión: ${u.nombre} (${u.rol}) · sesión ${datos.sesion} · vence en ${datos.expiraEnSegundos} s`;
    estado.className = 'estado con-sesion';
  } else {
    estado.textContent = `Sin sesión (el servidor responde ${status})`;
    estado.className = 'estado sin-sesion';
  }
  // Con httpOnly: true esto sale vacío aunque haya sesión: el navegador esconde esa cookie a JavaScript.
  $('cookie-js').textContent = document.cookie || '(vacío)';
}

// Etapa 4 — La tabla del servidor

// Muestra lo que el servidor recuerda de cada sesión, para ver que los datos están allá y no en el
// navegador. El <tbody> se vacía con replaceChildren() antes de llenarlo; si no, cada clic
// agregaría las mismas filas otra vez.
async function refrescarTabla() {
  const { status, datos } = await llamar('GET', '/api/diagnostico/sesiones');
  const tbody = $('tabla-sesiones');
  tbody.replaceChildren();

  if (status !== 200 || !datos) {
    $('donde').textContent = `No se pudo leer el almacén (el servidor responde ${status})`;
    agregarFilaVacia(tbody, '(no se pudo leer)');
    return;
  }

  $('donde').textContent = datos.almacen === 'memoria'
    ? 'En la MEMORIA del servidor (se pierden al reiniciar)'
    : 'En MySQL, tabla sessions (sobreviven a un reinicio)';

  if (datos.sesiones.length === 0) {
    agregarFilaVacia(tbody, '(sin sesiones)');
    return;
  }

  for (const s of datos.sesiones) {
    const tr = document.createElement('tr');
    if (s.esLaTuya) tr.className = 'tuya';
    // expira viene como texto ISO (en UTC); new Date lo convierte y toLocaleTimeString lo muestra en
    // la hora de esta computadora.
    const vence = s.expira ? new Date(s.expira).toLocaleTimeString() : '—';
    const celdas = [s.esLaTuya ? `${s.sesion} (la tuya)` : s.sesion, s.usuario, s.visitas, vence];
    for (const texto of celdas) {
      const td = document.createElement('td');
      td.textContent = texto; // textContent: el usuario viene del servidor, no se interpreta como HTML
      tr.append(td);
    }
    tbody.append(tr);
  }
}

// Una fila que ocupa las 4 columnas, para que la tabla nunca quede sin explicación.
function agregarFilaVacia(tbody, texto) {
  const tr = document.createElement('tr');
  const td = document.createElement('td');
  td.colSpan = 4;
  td.textContent = texto;
  tr.append(td);
  tbody.append(tr);
}

// Después de cualquier acción cambian las dos cosas (quién soy y qué guarda el servidor), así que
// conviene refrescarlas juntas desde un solo lugar.
async function refrescarTodo() {
  await refrescarEstado();
  await refrescarTabla();
}

// Etapa 5 — Los eventos

// Formulario de login. preventDefault evita que el navegador envíe el formulario de la forma
// tradicional y recargue la página: queremos hacerlo con fetch y quedarnos en la misma página.
$('form-login').addEventListener('submit', async (evento) => {
  evento.preventDefault();
  await llamarYAnotar('POST', '/api/login', {
    usuario: $('usuario').value,
    contrasena: $('contrasena').value,
  });
  await refrescarTodo();
});

// Al cambiar de usuario en el <select> (evento change) se pone su contraseña de ejemplo, para no escribirla a mano en cada prueba.
$('usuario').addEventListener('change', () => {
  $('contrasena').value = `${$('usuario').value}12345`;
});

// Todos los botones que traen data-url se programan con el mismo código: el método y la ruta los lee de sus atributos (dataset.metodo y dataset.url). Si mañana se agrega un botón en el HTML, funciona solo.
document.querySelectorAll('button[data-url]').forEach((boton) => {
  boton.addEventListener('click', async () => {
    await llamarYAnotar(boton.dataset.metodo, boton.dataset.url);
    await refrescarTodo();
  });
});

$('btn-refrescar').addEventListener('click', refrescarTodo);
$('btn-sesiones').addEventListener('click', refrescarTabla);

// Etapa 6 — JWT

// El token vive en sessionStorage: aguanta si recargas, se borra si cierras la pestaña.
// Ojo: a diferencia de la cookie httpOnly, este SÍ lo puede leer JavaScript.
const jwtGuardado = {
  leer: () => sessionStorage.getItem('jwt'),
  poner: (t) => (t ? sessionStorage.setItem('jwt', t) : sessionStorage.removeItem('jwt')),
};

// Explicación de cada campo del payload para la tabla de "elementos de la sesión".
const QUE_ES = {
  sub: 'id del usuario en la tabla usuarios',
  usuario: 'nombre de usuario',
  nombre: 'nombre completo',
  rol: 'alumno o admin (decide el 403)',
  iat: 'cuándo se emitió',
  exp: 'cuándo expira (iat + jwtExpiraSeg)',
  jti: 'id único del token (se usa en la lista negra)',
};

// Lee el payload: es la 2ª parte del token, en base64url. Leerlo no necesita el secreto.
function leerPayload(token) {
  try {
    const b64 = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    const texto = new TextDecoder().decode(Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)));
    return JSON.parse(texto);
  } catch {
    return null;
  }
}

// iat / exp vienen en segundos → los muestro como hora.
const comoHora = (seg) => new Date(seg * 1000).toLocaleTimeString();

// Llena la tabla de elementos con lo que trae el token.
function pintarElementos(token) {
  const tbody = $('jwt-elementos');
  tbody.replaceChildren();
  const payload = token ? leerPayload(token) : null;
  if (!payload) {
    const tr = document.createElement('tr');
    const td = document.createElement('td');
    td.colSpan = 3;
    td.textContent = '(sin token)';
    tr.append(td);
    tbody.append(tr);
    return;
  }
  for (const [campo, valor] of Object.entries(payload)) {
    const tr = document.createElement('tr');
    const mostrar = campo === 'iat' || campo === 'exp' ? `${valor} (${comoHora(valor)})` : valor;
    for (const texto of [campo, mostrar, QUE_ES[campo] || '']) {
      const td = document.createElement('td');
      td.textContent = texto;
      tr.append(td);
    }
    tbody.append(tr);
  }
}

// El estado lo decide el SERVIDOR (igual que con la cookie): le pregunto a /api/jwt/sesion.
async function refrescarJWT() {
  const token = jwtGuardado.leer();
  $('jwt-crudo').textContent = token || '(sin token)';
  pintarElementos(token);

  const estado = $('jwt-estado');
  if (!token) {
    estado.textContent = 'Sin token';
    estado.className = 'estado sin-sesion';
  } else {
    const { status, datos } = await llamar('GET', '/api/jwt/sesion', undefined, token);
    if (status === 200) {
      estado.textContent = `Token válido: ${datos.nombre} (${datos.rol}) · expira en ${datos.quedanSegundos} s`;
      estado.className = 'estado con-sesion';
    } else {
      // El navegador todavía tiene el token, pero el servidor ya no lo acepta.
      estado.textContent = `El servidor rechaza el token → ${datos ? datos.error : status}`;
      estado.className = 'estado sin-sesion';
    }
  }
  await refrescarNegra();
}

// Lista negra: misma idea que refrescarTabla(), vaciar y volver a llenar.
async function refrescarNegra() {
  const { status, datos } = await llamar('GET', '/api/diagnostico/tokens');
  const tbody = $('jwt-negra');
  tbody.replaceChildren();
  if (status !== 200 || !datos) {
    $('jwt-modo').textContent = `No se pudo leer la lista negra (el servidor responde ${status})`;
    return;
  }
  $('jwt-modo').textContent = datos.jwtRevocar
    ? 'jwtRevocar: true → el logout manda el token aquí y deja de servir'
    : 'jwtRevocar: false → el logout no guarda nada; el token sirve hasta que expire';

  if (datos.revocados.length === 0) {
    agregarFilaVacia(tbody, '(vacía)');
    return;
  }
  const actual = leerPayload(jwtGuardado.leer() || '') || {};
  for (const t of datos.revocados) {
    const tr = document.createElement('tr');
    if (t.jti === actual.jti) tr.className = 'tuya';
    const celdas = [
      `${t.jti.slice(0, 8)}…${t.jti === actual.jti ? ' (el tuyo)' : ''}`,
      t.usuario,
      new Date(t.expira).toLocaleTimeString(),
      new Date(t.revocado_en).toLocaleTimeString(),
    ];
    for (const texto of celdas) {
      const td = document.createElement('td');
      td.textContent = texto;
      tr.append(td);
    }
    tbody.append(tr);
  }
}

// Botones de JWT: data-jwt trae "MÉTODO /ruta".
document.querySelectorAll('button[data-jwt]').forEach((boton) => {
  boton.addEventListener('click', async () => {
    const [metodo, url] = boton.dataset.jwt.split(' ');
    // El login manda usuario y contraseña de la tarjeta 2; los demás mandan el token guardado.
    const cuerpo = url === '/api/jwt/login'
      ? { usuario: $('usuario').value, contrasena: $('contrasena').value }
      : undefined;
    const { status, datos } = await llamar(metodo, url, cuerpo, jwtGuardado.leer());
    anotar(metodo, url, status, datos, 'jwt-bitacora');
    // login y refresh regresan un token nuevo: lo guardo (en refresh reemplaza al anterior).
    if (status === 200 && datos && datos.token) jwtGuardado.poner(datos.token);
    await refrescarJWT();
  });
});

// Tirar el token solo lo borra del navegador. El servidor no se entera: por eso existe el logout.
$('jwt-tirar').addEventListener('click', async () => {
  jwtGuardado.poner(null);
  anotar('—', '(navegador)', '—', { mensaje: 'Token borrado de sessionStorage; el servidor no se enteró' }, 'jwt-bitacora');
  await refrescarJWT();
});

$('jwt-ver-negra').addEventListener('click', refrescarNegra);

// Etapa 7 — Al cargar la página

// Mostramos la configuración para saber con qué opciones está corriendo el servidor en cada prueba
async function iniciar() {
  const { datos } = await llamar('GET', '/api/config');
  $('config').textContent = JSON.stringify(datos, null, 2);
  await refrescarTodo();
  await refrescarJWT(); // JWT: también la tarjeta 6
}

iniciar();
