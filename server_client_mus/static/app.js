const socket = io();

let miNombre = "";
let faseJuego = 'espera';
let cartasSeleccionadas = []; 

const setupScreen = document.getElementById('setup-screen');
const gameScreen = document.getElementById('game-screen');
const statusMsg = document.getElementById('status-msg');
const gameLog = document.getElementById('game-log');
const btnUnirse = document.getElementById('btn-unirse');

// ==========================================
// 1. ENVIAR ACCIONES AL SERVIDOR
// ==========================================

btnUnirse.addEventListener('click', () => {
    miNombre = document.getElementById('nombre-jugador').value.trim() || "Jugador_" + Math.floor(Math.random() * 1000);
    socket.emit('unirse_partida', { nombre: miNombre });
    statusMsg.innerText = "Conectando con el servidor...";
    btnUnirse.disabled = true;
});

// Botones de Reparto y Mus
document.getElementById('btn-deal').addEventListener('click', () => {
    mostrarBotones([]); 
    socket.emit('accion_juego', { accion: 'repartir' });
});

document.getElementById('btn-mus').addEventListener('click', () => {
    mostrarBotones([]);
    socket.emit('accion_juego', { accion: 'mus' });
});

document.getElementById('btn-nomus').addEventListener('click', () => {
    mostrarBotones([]);
    socket.emit('accion_juego', { accion: 'no_mus' });
});

document.getElementById('btn-descartar').addEventListener('click', () => {
    mostrarBotones([]);
    socket.emit('accion_juego', { accion: 'descartar', indices: cartasSeleccionadas });
});

// Botones de Apuestas
['pasar', 'ver', 'nover', 'ordago', 'ordago-resp'].forEach(id => {
    let el = document.getElementById('btn-' + id);
    if(el) el.addEventListener('click', () => {
        mostrarBotones([]);
        let accion = id === 'ordago-resp' ? 'ordago' : id;
        socket.emit('accion_juego', { accion: accion });
    });
});

document.getElementById('btn-envidar').addEventListener('click', () => {
    mostrarBotones([]);
    let cant = parseInt(document.getElementById('in-envidar').value) || 2;
    socket.emit('accion_juego', { accion: 'envidar', cantidad: cant });
});

document.getElementById('btn-subir').addEventListener('click', () => {
    mostrarBotones([]);
    let cant = parseInt(document.getElementById('in-subir').value) || 2;
    socket.emit('accion_juego', { accion: 'subir', cantidad: cant });
});

document.getElementById('btn-next-round').addEventListener('click', () => {
    mostrarBotones([]);
    gameLog.innerText = "Esperando al rival...";
    socket.emit('accion_juego', { accion: 'listo_siguiente_ronda' });
});

// ==========================================
// 2. RECIBIR ÓRDENES DEL SERVIDOR
// ==========================================

socket.on('actualizar_estado', (datos) => {
    statusMsg.innerText = datos.mensaje;
});

socket.on('iniciar_partida', (datos) => {
    setupScreen.classList.add('hidden');
    gameScreen.classList.remove('hidden');
});

socket.on('actualizar_mesa', (datos) => {
    faseJuego = datos.fase;
    
    if (datos.fase !== 'recuento') {
        const contenedorRival = document.querySelector('#opponent-area .cards-placeholder');
        if (contenedorRival) contenedorRival.innerHTML = '[Cartas del rival ocultas]';
    }

    if (datos.mensaje_transicion) {
        gameLog.innerHTML = `<strong style="color:#ebcb8b; font-size: 1.2em;">${datos.mensaje_transicion}</strong>`;
        mostrarBotones([]);
        if (datos.es_mi_turno) {
            setTimeout(() => socket.emit('accion_juego', { accion: 'continuar_transicion' }), 3000);
        }
        return; // Paramos de dibujar para que se quede congelado
    }

    // MAGIA 2: El Recuento Cinematográfico
    if (datos.fase === 'recuento') {
        // ¡NUEVO! Ocultamos los paneles de apuestas antes de frenar el código
        document.getElementById('apuesta-iniciar').classList.add('hidden');
        document.getElementById('apuesta-responder').classList.add('hidden');
        document.getElementById('caja-en-aire')?.classList.add('hidden');
        mostrarRecuentoEstatico(datos);
        //if (!window.animandoRecuento) animarRecuento(datos);
        return; 
    }
   // window.animandoRecuento = false;

    // Reseteamos las selecciones
    cartasSeleccionadas = [];
    const btnDescartar = document.getElementById('btn-descartar');
    if(btnDescartar) btnDescartar.innerText = 'Descartar (0)';
    
    // 1. DIBUJAR CARTAS
    const contenedorCartas = document.getElementById('my-cards');
    contenedorCartas.innerHTML = ''; 
    
    if (datos.mis_cartas && datos.mis_cartas.length > 0) {
        datos.mis_cartas.forEach((carta, index) => {
            const div = document.createElement('div');
            div.className = 'carta';
            div.innerText = carta.texto;
            
            div.onclick = () => {
                if (datos.fase === 'descarte' && !datos.descartes_listos) {
                    const pos = cartasSeleccionadas.indexOf(index);
                    if (pos === -1) {
                        cartasSeleccionadas.push(index);
                        div.classList.add('seleccionada');
                    } else {
                        cartasSeleccionadas.splice(pos, 1);
                        div.classList.remove('seleccionada');
                    }
                    btnDescartar.innerText = `Descartar (${cartasSeleccionadas.length})`;
                    btnDescartar.disabled = cartasSeleccionadas.length === 0;
                }
            };
            contenedorCartas.appendChild(div);
        });
    } else {
        contenedorCartas.innerHTML = 'Tus cartas aparecerán aquí';
    }

    // 2. ACTUALIZAR TEXTOS
    document.getElementById('puntos-mios').innerText = datos.mis_puntos;
    document.getElementById('puntos-rival').innerText = datos.puntos_rival;
    document.getElementById('mi-rol').innerText = datos.soy_mano ? "(Eres Mano)" : "(Eres Postre)";
    document.getElementById('mi-turno').classList.toggle('hidden', !datos.es_mi_turno);
    document.getElementById('turno-rival').classList.toggle('hidden', datos.es_mi_turno);
    
    if (datos.fase === 'descarte' && datos.descartes_listos) {
        gameLog.innerText = "Esperando a que el rival se descarte...";
    } else {
        gameLog.innerText = datos.mensaje;
        if (datos.descartes_rival > 0 && datos.fase === 'mus') {
            gameLog.innerHTML += `<br><span style="color:#a3be8c; font-size:0.9em;">(El rival cambió ${datos.descartes_rival} cartas)</span>`;
        }
    }

    // --- NUEVO: ACTUALIZAR PANEL DE APUESTAS ---
    const logDiv = document.getElementById('betting-log');
    if (datos.fase === 'apuestas' || datos.fase === 'recuento') {
        logDiv.classList.remove('hidden');
        
        let htmlBotes = `
            <p id="res-Grande">Grande: ${datos.apuestas.botes.Grande}</p>
            <p id="res-Chica">Chica: ${datos.apuestas.botes.Chica}</p>
            <p id="res-Pares">Pares: ${datos.apuestas.botes.Pares}</p>
            <p id="res-Juego">Juego: ${datos.apuestas.botes.Juego}</p>
            <p id="res-Punto" class="hidden">Punto: ${datos.apuestas.botes.Juego}</p>
        `;
        
        // Si hay una subida pendiente, pintamos la "Caja en el aire"
        if (datos.apuestas.subida > 0 || datos.apuestas.subida === 'ÓRDAGO') {
            const cantidadStr = datos.apuestas.subida === 'ÓRDAGO' ? 'un ÓRDAGO' : datos.apuestas.subida;
            const textoSube = datos.apuestas.soy_quien_sube ? `Has subido: ${cantidadStr}` : `Te suben: ${cantidadStr}`;
            const colorSube = datos.apuestas.soy_quien_sube ? `#ebcb8b` : `#bf616a`; // Amarillo si es tuyo, rojo si es del rival
            
            htmlBotes += `
            <div id="caja-en-aire" style="margin-top: 10px; padding-top: 10px; border-top: 1px dashed #88c0d0;">
                <p style="font-size: 1.1em; margin-bottom: 5px;">Apuesta vista: <span class="highlight">${datos.apuestas.apuesta_vista}</span></p>
                <p style="font-size: 1.2em; font-weight: bold; color: ${colorSube}; margin: 0;">${textoSube}</p>
            </div>`;
        }
        logDiv.innerHTML = htmlBotes;
    } else {
        logDiv.classList.add('hidden'); // Ocultar en la fase de mus o descarte
    }


// 3. MOSTRAR BOTONES SEGÚN LA FASE
    mostrarBotones([]); // Limpiamos todos los botones generales por defecto
    document.getElementById('apuesta-iniciar').classList.add('hidden');
    document.getElementById('apuesta-responder').classList.add('hidden');

    if (datos.fase === 'descarte') {
        if (!datos.descartes_listos) mostrarBotones(['btn-descartar']);
        document.getElementById('btn-descartar').disabled = true;
    } else if (datos.es_mi_turno) {
        
        if (datos.fase === 'espera_reparto') {
            mostrarBotones(['btn-deal']);
        } else if (datos.fase === 'mus') {
            mostrarBotones(['btn-mus', 'btn-nomus']);
        } else if (datos.fase === 'apuestas') {
            // Forzamos a que el contenedor principal sea visible
            document.getElementById('action-buttons').classList.remove('hidden');
            
            if (datos.apuestas && datos.apuestas.subida === 0) {
                document.getElementById('apuesta-iniciar').classList.remove('hidden');
            } else if (datos.apuestas) {
                document.getElementById('apuesta-responder').classList.remove('hidden');
                
                // Bloqueamos el input de subir si hay un órdago en la mesa
                let ocultarSubir = datos.apuestas.subida === 'ÓRDAGO';
                document.getElementById('in-subir').classList.toggle('hidden', ocultarSubir);
                document.getElementById('btn-subir').classList.toggle('hidden', ocultarSubir);
                document.getElementById('btn-ordago-resp').classList.toggle('hidden', ocultarSubir);
            }
        }
    }
});

// ==========================================
// 3. UTILIDADES VISUALES
// ==========================================
function mostrarBotones(ids) {
    const contenedor = document.getElementById('action-buttons');
    const allIds = ['btn-deal', 'btn-pedrete', 'btn-mus', 'btn-nomus', 'btn-descartar', 'btn-next-round'];
    allIds.forEach(id => {
        let el = document.getElementById(id);
        if(el) el.classList.add('hidden');
    });    
    if (ids.length > 0) {
        contenedor.classList.remove('hidden');
        ids.forEach(id => {
            let el = document.getElementById(id);
            if(el) el.classList.remove('hidden');
        });
    } else {
        contenedor.classList.add('hidden');
    }
}


// Variable global para no repetir la animación
window.animandoRecuento = false;

async function animarRecuento(datos) {
    window.animandoRecuento = true;
    mostrarBotones([]);
    
    // 1. Enseñar las cartas del rival (la tabla de apuestas se queda intacta)
    const contenedorRival = document.querySelector('#opponent-area .cards-placeholder');
    contenedorRival.innerHTML = '';
    
    if (datos.cartas_rival) {
        datos.cartas_rival.forEach(c => {
            const d = document.createElement('div');
            d.className = 'carta'; 
            d.style.backgroundColor = '#d8dee9'; 
            d.style.color = 'black';
            d.innerText = c.texto;
            contenedorRival.appendChild(d);
        });
    }

    // 2. Preparar el contenedor del registro blindado
    const gameLog = document.getElementById('game-log');
    gameLog.innerHTML = "<strong style='font-size: 1.2em; color: #88c0d0;'>¡Cartas arriba! Iniciando recuento...</strong>";
    
    // Creamos una caja invisible donde irán cayendo los textos para que el navegador no los borre
    const cajaMensajes = document.createElement('div');
    cajaMensajes.style.marginTop = "15px";
    cajaMensajes.style.textAlign = "left";
    cajaMensajes.style.display = "inline-block";
    gameLog.appendChild(cajaMensajes);

    await new Promise(r => setTimeout(r, 2000));

    let puntosFinalesMios = datos.mis_puntos;
    let puntosFinalesRival = datos.puntos_rival;

    // 3. Imprimir el desglose paso a paso
    if (datos.recuento && datos.recuento.length > 0) {
        for (let paso of datos.recuento) {
            
            // Construimos el mensaje exacto
            let sujeto = paso.gano_yo ? "Te llevas" : "El rival se lleva";
            let nombreFase = paso.fase.toUpperCase();
            
            let textoFase = "";
            if (nombreFase.includes('ACHANTADO')) {
                let faseLimpia = nombreFase.replace(' (ACHANTADO)', '');
                textoFase = `<i>(Alguien no quiso ver en ${faseLimpia})</i>`;
            } else {
                textoFase = `<b>${sujeto} ${paso.puntos_ganados} puntos</b> en <b>${nombreFase}</b>.`;
            }

            // Creamos un nuevo párrafo independiente y lo añadimos a la pantalla
            let nuevoMensaje = document.createElement('p');
            nuevoMensaje.style.margin = "5px 0";
            nuevoMensaje.innerHTML = `👉 ${textoFase}`;
            cajaMensajes.appendChild(nuevoMensaje);
            
            // Actualizamos los marcadores en vivo
            puntosFinalesMios = paso.mis_puntos_finales;
            puntosFinalesRival = paso.rival_puntos_finales;
            document.getElementById('puntos-mios').innerText = puntosFinalesMios;
            document.getElementById('puntos-rival').innerText = puntosFinalesRival;
            
            // Pausa de 3 segundos
            await new Promise(r => setTimeout(r, 3000)); 
        }
    }

    // 4. Finalizar
    let mensajeFinal = document.createElement('div');
    mensajeFinal.style.marginTop = "20px";

    if (puntosFinalesMios >= 40 || puntosFinalesRival >= 40) {
        let ganador = puntosFinalesMios >= 40 ? "🏆 ¡HAS GANADO LA PARTIDA!" : "💀 ¡EL RIVAL HA GANADO LA PARTIDA!";
        mensajeFinal.innerHTML = `<strong style="font-size: 1.5em; color: #a3be8c;">${ganador}</strong>`;
        gameLog.appendChild(mensajeFinal);
    } else {
        mensajeFinal.innerHTML = "<em>Comprueba los puntos.</em>";
        gameLog.appendChild(mensajeFinal);
        mostrarBotones(['btn-next-round']);
    }
}

function mostrarRecuentoEstatico(datos) {
    mostrarBotones([]);
    
    const contenedorRival = document.querySelector('#opponent-area .cards-placeholder');
    if (contenedorRival) {
        contenedorRival.innerHTML = '';
        if (datos.cartas_rival) {
            datos.cartas_rival.forEach(c => {
                const d = document.createElement('div');
                d.className = 'carta'; 
                d.style.backgroundColor = '#d8dee9'; 
                d.style.color = 'black';
                d.innerText = c.texto;
                contenedorRival.appendChild(d);
            });
        }
    }

    document.getElementById('puntos-mios').innerText = datos.mis_puntos;
    document.getElementById('puntos-rival').innerText = datos.puntos_rival;

    const gameLog = document.getElementById('game-log');
    let htmlRecuento = "<strong style='font-size: 1.2em; color: #88c0d0;'>Resultados de la ronda:</strong><br><br>";

    if (datos.recuento && datos.recuento.length > 0) {
        for (let paso of datos.recuento) {
            let ganadorTxt = paso.gano_yo ? "Has ganado" : "El rival ha ganado";
            
            if (paso.fase.includes('Achantado')) {
                let faseLimpia = paso.fase.replace(' (Achantado)', '');
                htmlRecuento += `👉 <i>(Alguien no quiso ver en ${faseLimpia})</i><br>`;
            } else {
                let faseMin = paso.fase.toLowerCase();
                let prep = "en";
                if (faseMin === 'grande' || faseMin === 'chica') prep = "a la";
                if (faseMin === 'pares') prep = "por";
                if (faseMin === 'juego' || faseMin === 'punto') prep = "por el";

                htmlRecuento += `👉 <b>${ganadorTxt} ${paso.puntos_ganados}</b> ${prep} <b>${paso.fase}</b>.<br>`;
            }
        }
    } else {
        htmlRecuento += "<em>(Hubo un error o la ronda no tuvo apuestas válidas)</em><br>";
    }

    if (datos.mis_puntos >= 40 || datos.puntos_rival >= 40) {
        const txt = datos.mis_puntos >= 40 ? "🏆 ¡HAS GANADO LA PARTIDA!" : "💀 ¡EL RIVAL HA GANADO LA PARTIDA!";
        htmlRecuento += `<br><strong style="font-size: 1.5em; color: #a3be8c;">${txt}</strong>`;
        gameLog.innerHTML = htmlRecuento;
    } else {
        gameLog.innerHTML = htmlRecuento;
        mostrarBotones(['btn-next-round']);
    }
}