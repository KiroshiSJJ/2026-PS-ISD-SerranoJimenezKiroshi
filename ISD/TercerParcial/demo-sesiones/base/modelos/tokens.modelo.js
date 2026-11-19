// Tabla tokens_revocados = la "lista negra" de JWT.
// Un JWT no se puede borrar del servidor (el servidor nunca lo guardó), así que al cerrar sesión
// anotamos su jti aquí y el middleware lo rechaza aunque todavía no venza.

function crearModeloTokens(pool) {
  // Anota el token. exp viene en segundos desde 1970 → FROM_UNIXTIME lo convierte a fecha.
  // INSERT IGNORE: si le pican dos veces a logout no truena por la llave repetida.
  async function revocar(jti, usuario, exp) {
    await pool.query(
      'INSERT IGNORE INTO tokens_revocados (jti, usuario, expira) VALUES (?, ?, FROM_UNIXTIME(?))',
      [jti, usuario, exp]
    );
  }

  // ¿Ya está en la lista negra?
  async function estaRevocado(jti) {
    const [filas] = await pool.query(
      'SELECT 1 FROM tokens_revocados WHERE jti = ? LIMIT 1',
      [String(jti || '')]
    );
    return filas.length === 1;
  }

  // Toda la lista, lo último revocado primero (solo para mostrarla en la página).
  async function listar() {
    const [filas] = await pool.query(
      'SELECT jti, usuario, expira, revocado_en FROM tokens_revocados ORDER BY revocado_en DESC, jti'
    );
    return filas;
  }

  return { revocar, estaRevocado, listar };
}

module.exports = { crearModeloTokens };
