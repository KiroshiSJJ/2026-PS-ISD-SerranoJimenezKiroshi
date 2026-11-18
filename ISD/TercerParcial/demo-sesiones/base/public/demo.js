const $ = (id) => document.getElementById(id);

// Etapa 1 — Llamar a la API

async function llamar(metodo, url, cuerpo) {
  const opciones = { method: metodo, headers: {} };
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
function anotar(metodo, url, status, datos) {
  const li = document.createElement('li');

  const codigo = document.createElement('span');
  codigo.className = claseDelCodigo(status);
  codigo.textContent = status;

  const ruta = document.createElement('strong');
  ruta.textContent = ` ${metodo} ${url}`;

  const json = document.createElement('pre');
  json.textContent = JSON.stringify(datos, null, 2);

  li.append(codigo, ruta, json);
  $('bitacora').prepend(li);
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

// Etapa 6 — Al cargar la página

// Mostramos la configuración para saber con qué opciones está corriendo el servidor en cada prueba
async function iniciar() {
  const { datos } = await llamar('GET', '/api/config');
  $('config').textContent = JSON.stringify(datos, null, 2);
  await refrescarTodo();
}

iniciar();
