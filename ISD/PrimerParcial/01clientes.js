/*
Vamos a programar un cliente mediante el cual vamos a probar la arquitectura cliente-servidor por medio de una peticion mediante protocolo http
Utilizando metodo GET a la ruta /api/talleres

Que tenemos que conectar al servicio de la BD

El problema es como apuntar al Back
*/

const API_URL = "https://proyectobackcecyt9.onrender.com";

async function main() {
    
    console.log("Cliente Peticion Get -> a${API_URL}/api/talleres");
    
    const inicio = Date.now();
    const respuesta = await fetch(`${API_URL}/api/talleres`);

    //Nos da el tiempo de ida y vuelta por medio de la peticion mediante RTT
    const duracionMs = Date.now() - inicio;
    //Un status de error 500 seria una respuesta valida si el servidcio de la BD no esta disponible
    const cuerpo = await respuesta.json();
    console.log("Ciclo de peticion-respuesta");
    console.log("Protocolo HTTPS sobre TCP : ${respuesta.url}");
    console.log("Status de recibido: ${respuesta.statusText}");
    console.log("Tiempo de ida y vuelta (RTT): ${duracionMs} ms");
    console.log(JSON.stringify(cuerpo, null, 2));

}

main();