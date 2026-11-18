// Consultas a la tabla usuarios. Siempre con ? (consulta parametrizada), nunca pegando texto en el SQL.
const bcrypt = require('bcryptjs');

function crearModeloUsuarios(pool) {
  // Regresa el usuario (sin el hash) si la contraseña es correcta, o null si no.
  async function verificar(usuario, contrasena) {
    if (typeof usuario !== 'string' || typeof contrasena !== 'string') return null;
    const [filas] = await pool.query(
      'SELECT id, usuario, nombre, rol, contrasena_hash FROM usuarios WHERE usuario = ?',
      [usuario]
    );
    if (filas.length === 0) return null;
    const { contrasena_hash: hash, ...datos } = filas[0];
    const correcta = await bcrypt.compare(contrasena, hash);
    return correcta ? datos : null;
  }

  return { verificar };
}

module.exports = { crearModeloUsuarios };
