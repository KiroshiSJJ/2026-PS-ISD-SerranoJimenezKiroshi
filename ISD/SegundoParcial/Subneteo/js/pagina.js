/*
 * pagina.js
 * Conecta los formularios con la clase IPv4 y muestra los resultados.
 */

const porId = (id) => document.getElementById(id);
const formato = (n) => n.toLocaleString('es-MX');

// Convierte texto del usuario en texto seguro para meterlo al HTML
const limpiar = (texto) => String(texto)
  .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;').replaceAll("'", '&#39;');

// Ejecuta un cálculo y, si falla, muestra el mensaje de error en el contenedor
function intentar(contenedor, calculo) {
  try {
    contenedor.innerHTML = calculo();
  } catch (e) {
    contenedor.innerHTML = `<div class="error">⚠ ${limpiar(e.message)}</div>`;
  }
}

/* ---------- Piezas de HTML reutilizables ---------- */

function listaDatos(pares) {
  return `<dl class="datos">${pares.map(([nombre, valor]) =>
    `<div><dt>${nombre}</dt><dd>${valor}</dd></div>`).join('')}</dl>`;
}

// Bits de red en azul y bits de host en naranja
function binarioPintado(ip, prefijo) {
  return IPv4.ipABinario(ip).split('.').map((octeto, i) =>
    [...octeto].map((bit, j) => {
      const clase = i * 8 + j < prefijo ? 'bits-red' : 'bits-host';
      return `<span class="${clase}">${bit}</span>`;
    }).join('')).join('.');
}

function tarjetaRed(ip, prefijo) {
  const { letra, prefijo: porDefecto } = IPv4.clase(ip);
  const mascara = IPv4.mascara(prefijo);
  return `
    <div class="tarjeta">
      <h3>Red base: ${limpiar(ip)}/${prefijo}</h3>
      ${listaDatos([
        ['Clase', porDefecto ? `${letra} (/${porDefecto} por defecto)` : letra],
        ['Tipo', IPv4.esPrivada(ip) ? 'Privada' : 'Pública'],
        ['Máscara', mascara],
        ['Direcciones totales', formato(IPv4.tamanoBloque(prefijo))],
      ])}
      <p class="binario">IP&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; ${binarioPintado(ip, prefijo)}</p>
      <p class="binario">Máscara ${binarioPintado(mascara, prefijo)}</p>
      <p class="leyenda"><span class="bits-red">Azul</span>: bits de red · <span class="bits-host">Naranja</span>: bits de host</p>
    </div>`;
}

function tablaSubredes(subredes, mostrarPedidos) {
  const encabezados = ['#', 'Nombre', ...(mostrarPedidos ? ['Hosts pedidos'] : []),
    'Red', 'Máscara', 'Primer host', 'Último host', 'Broadcast', 'Hosts útiles'];
  const filas = subredes.map((s, i) => `
    <tr>
      <td>${i + 1}</td>
      <td>${limpiar(s.nombre)}</td>
      ${mostrarPedidos ? `<td>${formato(s.hostsPedidos)}</td>` : ''}
      <td class="ip">${s.red}/${s.prefijo}</td>
      <td class="ip">${s.mascara}</td>
      <td class="ip">${s.primerHost}</td>
      <td class="ip">${s.ultimoHost}</td>
      <td class="ip">${s.broadcast}</td>
      <td>${formato(s.hosts)}</td>
    </tr>`).join('');
  return `
    <div class="tarjeta">
      <div class="tabla-envoltura">
        <table class="resultado">
          <thead><tr>${encabezados.map((h) => `<th>${h}</th>`).join('')}</tr></thead>
          <tbody>${filas}</tbody>
        </table>
      </div>
    </div>`;
}

/* ---------- Pestañas ---------- */

function abrirPanel(id) {
  document.querySelectorAll('.pestana').forEach((p) => p.classList.toggle('activa', p.dataset.panel === id));
  document.querySelectorAll('.panel').forEach((p) => p.classList.toggle('activo', p.id === id));
}

document.querySelectorAll('.pestana').forEach((pestana) =>
  pestana.addEventListener('click', () => abrirPanel(pestana.dataset.panel)));

/* ---------- 1. Decimal a binario ---------- */

porId('frm-binario').addEventListener('submit', (evento) => {
  evento.preventDefault();
  intentar(porId('out-binario'), () => {
    const entrada = porId('txt-binario').value.trim();
    let numeros;
    if (entrada.includes('.')) {
      numeros = IPv4.aIp(IPv4.aEntero(entrada)).split('.').map(Number);
    } else {
      const n = Number(entrada);
      if (entrada === '' || !Number.isInteger(n) || n < 0 || n > 255) {
        throw new Error('Escribe un número entre 0 y 255 o una IP válida');
      }
      numeros = [n];
    }
    return numeros.map((n) => {
      const pasos = IPv4.restas(n);
      return `
        <div class="tarjeta">
          <h3>${n} = <span class="binario">${IPv4.octetoABinario(n)}</span></h3>
          <table class="pasos">
            <tr><th>Peso</th>${pasos.map((p) => `<th>${p.peso}</th>`).join('')}</tr>
            <tr><td>Bit</td>${pasos.map((p) => `<td>${p.bit}</td>`).join('')}</tr>
            <tr><td>Resto</td>${pasos.map((p) => `<td>${p.resto}</td>`).join('')}</tr>
          </table>
          <p class="leyenda">Si lo que queda alcanza para el peso se escribe 1 y se resta; si no, se escribe 0.</p>
        </div>`;
    }).join('');
  });
});

/* ---------- 2. FLSM ---------- */

porId('frm-flsm').addEventListener('submit', (evento) => {
  evento.preventDefault();
  intentar(porId('out-flsm'), () => {
    const red = porId('txt-flsm-red').value.trim();
    const prefijo = IPv4.leerPrefijo(porId('txt-flsm-prefijo').value);
    const r = IPv4.flsm(red, prefijo, porId('sel-flsm-modo').value, Number(porId('num-flsm-cantidad').value));
    return tarjetaRed(red, prefijo) + `
      <div class="tarjeta">
        <h3>Resultado FLSM</h3>
        ${listaDatos([
          ['Bits prestados', `${r.bitsPrestados} (2^${r.bitsPrestados} = ${formato(r.totalSubredes)} subredes)`],
          ['Nuevo prefijo', `/${r.nuevoPrefijo} · ${IPv4.mascara(r.nuevoPrefijo)}`],
          ['Hosts útiles por subred', `2^${32 - r.nuevoPrefijo} − 2 = ${formato(r.hostsPorSubred)}`],
          ['Salto entre subredes', `${formato(r.bloque)} direcciones`],
        ])}
      </div>` + tablaSubredes(r.subredes, false);
  });
});

/* ---------- 3. VLSM ---------- */

function agregarArea(nombre = '', hosts = '') {
  const fila = document.createElement('div');
  fila.className = 'req-fila';
  fila.innerHTML = `
    <input type="text" class="area-nombre" placeholder="Nombre del área" value="${limpiar(nombre)}">
    <input type="number" class="area-hosts" min="1" placeholder="Hosts" value="${limpiar(hosts)}">
    <button type="button" class="quitar" title="Quitar área">✕</button>`;
  fila.querySelector('.quitar').addEventListener('click', () => fila.remove());
  porId('lista-areas').appendChild(fila);
}

function ponerAreas(areas) {
  porId('lista-areas').innerHTML = '';
  areas.forEach(([nombre, hosts]) => agregarArea(nombre, hosts));
}

porId('btn-area').addEventListener('click', () => agregarArea());

porId('frm-vlsm').addEventListener('submit', (evento) => {
  evento.preventDefault();
  intentar(porId('out-vlsm'), () => {
    const red = porId('txt-vlsm-red').value.trim();
    const prefijo = IPv4.leerPrefijo(porId('txt-vlsm-prefijo').value);
    const areas = Array.from(document.querySelectorAll('#lista-areas .req-fila'), (fila, i) => {
      const nombre = fila.querySelector('.area-nombre').value.trim() || `Área ${i + 1}`;
      const hosts = Number(fila.querySelector('.area-hosts').value);
      if (!Number.isInteger(hosts) || hosts < 1) throw new Error(`Escribe una cantidad de hosts válida para "${nombre}"`);
      return { nombre, hosts };
    });
    const r = IPv4.vlsm(red, prefijo, areas);
    const porcentaje = ((r.usadas / r.totales) * 100).toFixed(1);
    return tarjetaRed(red, prefijo) + `
      <div class="tarjeta">
        <h3>Resultado VLSM</h3>
        ${listaDatos([
          ['Áreas asignadas', `${r.subredes.length} (de mayor a menor)`],
          ['Direcciones usadas', `${formato(r.usadas)} de ${formato(r.totales)} (${porcentaje}%)`],
          ['Direcciones libres', formato(r.libres)],
          ['Primera dirección libre', r.primeraLibre ?? 'ninguna'],
        ])}
        <p class="leyenda">Para cada área se busca el menor n que cumple 2^n − 2 ≥ hosts pedidos; su prefijo es /(32 − n).</p>
      </div>` + tablaSubredes(r.subredes, true);
  });
});

/* ---------- 4. ¿A qué red pertenece? ---------- */

porId('frm-pertenece').addEventListener('submit', (evento) => {
  evento.preventDefault();
  intentar(porId('out-pertenece'), () => {
    const ip = porId('txt-ip').value.trim();
    const prefijo = IPv4.leerPrefijo(porId('txt-ip-prefijo').value);
    const s = IPv4.redDe(ip, prefijo);
    return `
      <div class="tarjeta">
        <h3>${limpiar(ip)}/${prefijo}</h3>
        <p class="binario">IP&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; ${binarioPintado(ip, prefijo)}</p>
        <p class="binario">Máscara ${binarioPintado(s.mascara, prefijo)}</p>
        <p class="binario">Red&nbsp;&nbsp;&nbsp;&nbsp; ${binarioPintado(s.red, prefijo)} (IP AND máscara)</p>
        ${listaDatos([
          ['Dirección de red', `${s.red}/${prefijo}`],
          ['Primer host', s.primerHost],
          ['Último host', s.ultimoHost],
          ['Broadcast', s.broadcast],
          ['Hosts útiles', formato(s.hosts)],
        ])}
      </div>`;
  });
});

/* ---------- Ejercicios ---------- */

const ejercicios = {
  1() {
    porId('txt-vlsm-red').value = '192.168.50.0';
    porId('txt-vlsm-prefijo').value = '/24';
    ponerAreas([['Laboratorio de Cómputo', 60], ['Sala de Maestros', 25], ['Control Escolar', 12],
      ['Biblioteca', 5], ['Enlace R1-R2', 2], ['Enlace R2-R3', 2]]);
    abrirPanel('sec-vlsm');
    porId('frm-vlsm').requestSubmit();
  },
  2() {
    porId('txt-vlsm-red').value = '172.20.0.0';
    porId('txt-vlsm-prefijo').value = '/16';
    ponerAreas([['Campus Norte', 2000], ['Campus Sur', 1000], ['Administración', 500],
      ['WiFi Visitantes', 200], ['Enlace Norte-Sur', 2]]);
    abrirPanel('sec-vlsm');
    porId('frm-vlsm').requestSubmit();
  },
  3() {
    porId('txt-flsm-red').value = '10.0.0.0';
    porId('txt-flsm-prefijo').value = '/8';
    porId('sel-flsm-modo').value = 'subredes';
    porId('num-flsm-cantidad').value = 16;
    abrirPanel('sec-flsm');
    porId('frm-flsm').requestSubmit();
  },
};

document.querySelectorAll('[data-ejercicio]').forEach((boton) =>
  boton.addEventListener('click', () => {
    ejercicios[boton.dataset.ejercicio]();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }));

/* ---------- Estado inicial ---------- */

ponerAreas([['Ventas', 40], ['Sistemas', 20], ['Gerencia', 6]]);
porId('frm-binario').requestSubmit();
