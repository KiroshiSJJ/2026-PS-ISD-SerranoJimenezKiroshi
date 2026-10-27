/*
 * ipv4.js
 * Clase con toda la lógica de subneteo IPv4 (no toca el HTML).
 *
 * Una IPv4 tiene 32 bits. Para hacer cuentas la convertimos a un número entero
 * (de 0 a 4,294,967,295) y trabajamos con potencias de 2:
 *   - tamaño de un bloque /p  = 2^(32 - p)
 *   - dirección de red        = IP redondeada hacia abajo al múltiplo del bloque
 *   - broadcast               = red + bloque - 1
 */

class IPv4 {
  static TOTAL_BITS = 32;

  /* ---------- Conversiones ---------- */

  // "10.1.2.3" -> número entero
  static aEntero(texto) {
    const partes = String(texto).trim().split('.');
    if (partes.length !== 4) {
      throw new Error(`"${texto}" no es una IP válida, deben ser 4 números separados por punto`);
    }
    let valor = 0;
    partes.forEach((parte) => {
      if (!/^\d+$/.test(parte) || Number(parte) > 255) {
        throw new Error(`"${parte}" no es un octeto válido (0 a 255)`);
      }
      valor = valor * 256 + Number(parte);
    });
    return valor;
  }

  // número entero -> "10.1.2.3"
  static aIp(valor) {
    const octetos = [];
    for (let i = 3; i >= 0; i--) {
      octetos.push(Math.floor(valor / 256 ** i) % 256);
    }
    return octetos.join('.');
  }

  // 200 -> "11001000"
  static octetoABinario(numero) {
    let binario = '';
    for (let peso = 128; peso >= 1; peso /= 2) {
      binario += numero >= peso && (numero % (peso * 2)) >= peso ? '1' : '0';
    }
    return binario;
  }

  // "192.168.0.1" -> "11000000.10101000.00000000.00000001"
  static ipABinario(ip) {
    return IPv4.aIp(IPv4.aEntero(ip)).split('.').map((o) => IPv4.octetoABinario(Number(o))).join('.');
  }

  // Método de restas con los pesos 128, 64, 32, 16, 8, 4, 2, 1
  static restas(numero) {
    const filas = [];
    let resto = numero;
    for (let peso = 128; peso >= 1; peso /= 2) {
      const bit = resto >= peso ? 1 : 0;
      resto -= bit * peso;
      filas.push({ peso, bit, resto });
    }
    return filas;
  }

  /* ---------- Máscaras y prefijos ---------- */

  static tamanoBloque(prefijo) {
    return 2 ** (IPv4.TOTAL_BITS - prefijo);
  }

  // /26 -> "255.255.255.192"
  static mascara(prefijo) {
    return IPv4.aIp(2 ** 32 - IPv4.tamanoBloque(prefijo));
  }

  // "255.255.255.192" -> 26
  static prefijoDeMascara(mascara) {
    const bits = IPv4.ipABinario(mascara).split('.').join('');
    const unos = bits.indexOf('0') === -1 ? 32 : bits.indexOf('0');
    if (bits.slice(unos).includes('1')) {
      throw new Error(`${mascara} no es una máscara válida (los 1 deben ir todos juntos a la izquierda)`);
    }
    return unos;
  }

  // Acepta "/24", "24" o "255.255.255.0"
  static leerPrefijo(texto) {
    const valor = String(texto).trim().replace(/^\//, '');
    if (valor.includes('.')) return IPv4.prefijoDeMascara(valor);
    const prefijo = Number(valor);
    if (valor === '' || !Number.isInteger(prefijo) || prefijo < 0 || prefijo > 32) {
      throw new Error(`"/${valor}" no es un prefijo válido (0 a 32)`);
    }
    return prefijo;
  }

  /* ---------- Información de la red ---------- */

  static clase(ip) {
    const primerOcteto = Math.floor(IPv4.aEntero(ip) / 256 ** 3);
    const tabla = [
      [0, 0, 'Reservada', null],
      [1, 126, 'A', 8],
      [127, 127, 'Loopback', 8],
      [128, 191, 'B', 16],
      [192, 223, 'C', 24],
      [224, 239, 'D (multicast)', null],
      [240, 255, 'E (experimental)', null],
    ];
    const [, , letra, prefijo] = tabla.find(([min, max]) => primerOcteto >= min && primerOcteto <= max);
    return { letra, prefijo };
  }

  static esPrivada(ip) {
    const valor = IPv4.aEntero(ip);
    return [['10.0.0.0', 8], ['172.16.0.0', 12], ['192.168.0.0', 16]].some(([red, prefijo]) => {
      const inicio = IPv4.aEntero(red);
      return valor >= inicio && valor < inicio + IPv4.tamanoBloque(prefijo);
    });
  }

  static hostsUtiles(prefijo) {
    if (prefijo === 32) return 1;
    if (prefijo === 31) return 2;
    return IPv4.tamanoBloque(prefijo) - 2;
  }

  // Bits de host mínimos para que quepan "hosts" equipos: 2^n - 2 >= hosts
  static bitsDeHost(hosts) {
    if (!Number.isInteger(hosts) || hosts < 1) {
      throw new Error(`"${hosts}" no es una cantidad de hosts válida`);
    }
    return Math.max(2, Math.ceil(Math.log2(hosts + 2)));
  }

  // Arma el objeto con todos los datos de una subred
  static subred(inicio, prefijo, nombre = '') {
    const bloque = IPv4.tamanoBloque(prefijo);
    const fin = inicio + bloque - 1;
    const tieneHosts = prefijo <= 30;
    return {
      nombre,
      red: IPv4.aIp(inicio),
      prefijo,
      mascara: IPv4.mascara(prefijo),
      primerHost: IPv4.aIp(tieneHosts ? inicio + 1 : inicio),
      ultimoHost: IPv4.aIp(tieneHosts ? fin - 1 : fin),
      broadcast: IPv4.aIp(fin),
      hosts: IPv4.hostsUtiles(prefijo),
      bloque,
    };
  }

  // Red a la que pertenece una IP (equivale a hacer IP AND máscara)
  static redDe(ip, prefijo) {
    const bloque = IPv4.tamanoBloque(prefijo);
    const inicio = Math.floor(IPv4.aEntero(ip) / bloque) * bloque;
    return IPv4.subred(inicio, prefijo);
  }

  // La red base debe tener todos los bits de host en 0
  static validarRed(ip, prefijo) {
    const valor = IPv4.aEntero(ip);
    const bloque = IPv4.tamanoBloque(prefijo);
    if (valor % bloque !== 0) {
      const correcta = IPv4.aIp(Math.floor(valor / bloque) * bloque);
      throw new Error(`${ip}/${prefijo} no es una dirección de red. La correcta es ${correcta}/${prefijo}`);
    }
    return valor;
  }

  /* ---------- FLSM: subredes del mismo tamaño ---------- */

  // modo = "subredes" (cuántas subredes) o "hosts" (cuántos hosts por subred)
  static flsm(ip, prefijo, modo, cantidad) {
    const inicio = IPv4.validarRed(ip, prefijo);
    if (!Number.isInteger(cantidad) || cantidad < 1) {
      throw new Error('La cantidad debe ser un número entero mayor que 0');
    }

    const bitsPrestados = modo === 'hosts'
      ? IPv4.TOTAL_BITS - prefijo - IPv4.bitsDeHost(cantidad)
      : Math.ceil(Math.log2(cantidad));
    const nuevoPrefijo = prefijo + bitsPrestados;

    if (bitsPrestados < 0 || nuevoPrefijo > 30) {
      throw new Error(`No es posible: se necesitaría un /${nuevoPrefijo} y el rango permitido es /${prefijo} a /30`);
    }

    const totalSubredes = 2 ** bitsPrestados;
    const bloque = IPv4.tamanoBloque(nuevoPrefijo);
    const subredes = Array.from({ length: totalSubredes }, (_, i) =>
      IPv4.subred(inicio + i * bloque, nuevoPrefijo, `Subred ${i + 1}`));

    return { bitsPrestados, nuevoPrefijo, totalSubredes, bloque, hostsPorSubred: IPv4.hostsUtiles(nuevoPrefijo), subredes };
  }

  /* ---------- VLSM: cada área con el bloque justo ---------- */

  // areas = [{ nombre, hosts }]
  static vlsm(ip, prefijo, areas) {
    const inicio = IPv4.validarRed(ip, prefijo);
    const limite = inicio + IPv4.tamanoBloque(prefijo);
    if (areas.length === 0) throw new Error('Agrega al menos un área');

    // 1) De mayor a menor; si empatan, se respeta el orden en que se escribieron
    const ordenadas = areas
      .map((area, posicion) => ({ ...area, posicion }))
      .sort((a, b) => b.hosts - a.hosts || a.posicion - b.posicion);

    // 2) Se acomodan una detrás de otra
    let siguiente = inicio;
    const subredes = [];
    for (const area of ordenadas) {
      const bits = IPv4.bitsDeHost(area.hosts);
      const nuevoPrefijo = IPv4.TOTAL_BITS - bits;
      if (nuevoPrefijo < prefijo) {
        throw new Error(`"${area.nombre}" pide ${area.hosts} hosts y necesita un /${nuevoPrefijo}, más grande que toda la red /${prefijo}`);
      }
      const bloque = 2 ** bits;
      if (siguiente + bloque > limite) {
        throw new Error(`Ya no hay espacio para "${area.nombre}" (${area.hosts} hosts, /${nuevoPrefijo})`);
      }
      subredes.push({ ...IPv4.subred(siguiente, nuevoPrefijo, area.nombre), hostsPedidos: area.hosts });
      siguiente += bloque;
    }

    return {
      subredes,
      totales: limite - inicio,
      usadas: siguiente - inicio,
      libres: limite - siguiente,
      primeraLibre: siguiente < limite ? IPv4.aIp(siguiente) : null,
    };
  }
}
