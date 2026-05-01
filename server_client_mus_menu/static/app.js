const socket = io();

let miNombre = "";
let faseJuego = 'espera';
let cartasSeleccionadas = []; 

// PANTALLAS CORRECTAS
const menuScreen = document.getElementById('menu-screen');
const gameScreen = document.getElementById('game-screen');
const gameLog = document.getElementById('game-log');

// ==========================================
// 1. LÓGICA DEL MENÚ Y SALAS
// ==========================================
const btnCrear = document.getElementById('btn-crear');
const btnUnirse = document.getElementById('btn-unirse');
const inCodigo = document.getElementById('in-codigo');
const menuMsg = document.getElementById('menu-msg');

btnCrear.addEventListener('click', () => {
    miNombre = document.getElementById('nombre-jugador').value.trim() || "Jugador 1";
    socket.emit('crear_sala', { nombre: miNombre });
    btnCrear.disabled = true;
    btnUnirse.disabled = true;
    menuMsg.innerText = "Creando sala...";
});

btnUnirse.addEventListener('click', () => {
    miNombre = document.getElementById('nombre-jugador').value.trim() || "Jugador 2";
    let cod = inCodigo.value.trim().toUpperCase();
    if (!cod) {
        menuMsg.innerText = "Escribe un código primero.";
        return;
    }
    socket.emit('unirse_sala', { nombre: miNombre, codigo: cod });
    menuMsg.innerText = "Conectando...";
});

socket.on('sala_creada', (datos) => {
    document.getElementById('codigo-creado').classList.remove('hidden');
    document.getElementById('txt-codigo').innerText = datos.codigo;
    menuMsg.innerText = "";
});

socket.on('error_sala', (datos) => {
    menuMsg.innerText = datos.mensaje;
    btnCrear.disabled = false;
    btnUnirse.disabled = false;
});

// AQUI ESTABA EL FALLO PRINCIPAL: Oculta el menuScreen
socket.on('iniciar_partida', (datos) => {
    menuScreen.classList.add('hidden');
    gameScreen.classList.remove('hidden');
});

// ==========================================
// 2. ACCIONES DE JUEGO AL SERVIDOR
// ==========================================

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

document.getElementById('btn-next-round').addEventListener('click', (e) => {
    mostrarBotones([]);
    document.getElementById('my-cards').innerHTML = '';
    const contenedorRival = document.querySelector('#opponent-area .cards-placeholder');
    if (contenedorRival) contenedorRival.innerHTML = '';
    
    let textoEspera = e.target.innerText === "Siguiente partida" 
        ? "Esperando al rival para la siguiente partida..." 
        : "Esperando a que el rival esté listo...";

    gameLog.innerHTML = `<strong style='font-size: 1.2em; color: #ebcb8b;'>${textoEspera}</strong>`;
    socket.emit('accion_juego', { accion: 'listo_siguiente_ronda' });
});

// ==========================================
// 3. RECIBIR ESTADO DEL JUEGO
// ==========================================

socket.on('actualizar_mesa', (datos) => {
    faseJuego = datos.fase;
    
    if (datos.fase !== 'recuento') {
        const contenedorRival = document.querySelector('#opponent-area .cards-placeholder');
        if (contenedorRival) contenedorRival.innerHTML = `
                <div class="carta"><img src="/static/img/dorso.jpg"></div>
                <div class="carta"><img src="/static/img/dorso.jpg"></div>
                <div class="carta"><img src="/static/img/dorso.jpg"></div>
                <div class="carta"><img src="/static/img/dorso.jpg"></div>
            `;
    }

    // PANEL DE APUESTAS
    const logDiv = document.getElementById('betting-log');
    if (datos.fase === 'apuestas' || datos.fase === 'recuento') {
        logDiv.classList.remove('hidden');
    
        let fAct = datos.apuestas ? datos.apuestas.fase_actual : '';
        
        let gStyle = fAct === 'Grande' ? 'color:#ebcb8b; font-weight:bold; font-size:1.1em;' : '';
        let cStyle = fAct === 'Chica' ? 'color:#ebcb8b; font-weight:bold; font-size:1.1em;' : '';
        let pStyle = fAct === 'Pares' ? 'color:#ebcb8b; font-weight:bold; font-size:1.1em;' : '';
        let jStyle = fAct === 'Juego' ? 'color:#ebcb8b; font-weight:bold; font-size:1.1em;' : '';
    
        let htmlBotes = `
            <div style="background: rgba(0,0,0,0.3); padding: 10px; border-radius: 8px;">
                <p style="${gStyle}">Grande: ${datos.apuestas.botes.Grande}</p>
                <p style="${cStyle}">Chica: ${datos.apuestas.botes.Chica}</p>
                <p style="${pStyle}">Pares: ${datos.apuestas.botes.Pares}</p>
                <p style="${jStyle}">Juego / Punto: ${datos.apuestas.botes.Juego}</p>
            </div>
        `;
        
        if (datos.apuestas && (datos.apuestas.subida > 0 || datos.apuestas.subida === 'ÓRDAGO')) {
            const cantidadStr = datos.apuestas.subida === 'ÓRDAGO' ? 'un ÓRDAGO' : datos.apuestas.subida;
            const textoSube = datos.apuestas.soy_quien_sube ? `Has subido: ${cantidadStr}` : `Te suben: ${cantidadStr}`;
            const colorSube = datos.apuestas.soy_quien_sube ? `#ebcb8b` : `#bf616a`; 
            
            htmlBotes += `
            <div id="caja-en-aire" style="margin-top: 10px; padding-top: 10px; border-top: 1px dashed #88c0d0;">
                <p style="font-size: 1.1em; margin-bottom: 5px;">Apuesta vista: <span class="highlight">${datos.apuestas.apuesta_vista}</span></p>
                <p style="font-size: 1.2em; font-weight: bold; color: ${colorSube}; margin: 0;">${textoSube}</p>
            </div>`;
        }
        logDiv.innerHTML = htmlBotes;
    } else {
        if (logDiv) logDiv.classList.add('hidden');
    }

    if (datos.mensaje_transicion) {
        gameLog.innerHTML = `<strong style="color:#ebcb8b; font-size: 1.2em;">${datos.mensaje_transicion}</strong>`;
        mostrarBotones([]);
        if (datos.es_mi_turno) {
            setTimeout(() => socket.emit('accion_juego', { accion: 'continuar_transicion' }), 3000);
        }
        return;
    }

    if (datos.fase === 'recuento') {
        document.getElementById('apuesta-iniciar').classList.add('hidden');
        document.getElementById('apuesta-responder').classList.add('hidden');
        const cajaEnAire = document.getElementById('caja-en-aire');
        if (cajaEnAire) cajaEnAire.classList.add('hidden');
        mostrarRecuentoEstatico(datos);
        return; 
    }

    cartasSeleccionadas = [];
    const btnDescartar = document.getElementById('btn-descartar');
    if(btnDescartar) btnDescartar.innerText = 'Descartar (0)';
    
    const contenedorCartas = document.getElementById('my-cards');
    contenedorCartas.innerHTML = ''; 
    
    if (datos.mis_cartas && datos.mis_cartas.length > 0) {
        datos.mis_cartas.forEach((carta, index) => {
            const div = document.createElement('div');
            div.className = 'carta';
            div.innerHTML = `<img src="${carta.img}" alt="${carta.texto}">`;
            
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

    document.getElementById('puntos-mios').innerText = datos.mis_puntos;
    document.getElementById('puntos-rival').innerText = datos.puntos_rival;
    document.getElementById('mi-rol').innerText = datos.soy_mano ? "(Eres Mano)" : "(Eres Postre)";
    document.getElementById('mi-turno').classList.toggle('hidden', !datos.es_mi_turno);
    document.getElementById('turno-rival').classList.toggle('hidden', datos.es_mi_turno);
    
    if(document.getElementById('partidas-mios')) {
        document.getElementById('partidas-mios').innerText = datos.mis_partidas;
        document.getElementById('partidas-rival').innerText = datos.partidas_rival;
        document.querySelectorAll('.mejor-de-texto').forEach(el => el.innerText = `(Al mejor de ${datos.al_mejor_de})`);
    }

    if (datos.fase === 'descarte' && datos.descartes_listos) {
        gameLog.innerText = "Esperando a que el rival se descarte...";
    } else {
        gameLog.innerText = datos.mensaje;
        if (datos.descartes_rival > 0 && datos.fase === 'mus') {
            gameLog.innerHTML += `<br><span style="color:#a3be8c; font-size:0.9em;">(El rival cambió ${datos.descartes_rival} cartas)</span>`;
        }
    }

    mostrarBotones([]); 
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
            document.getElementById('action-buttons').classList.remove('hidden');
            
            if (datos.apuestas && datos.apuestas.subida === 0) {
                document.getElementById('apuesta-iniciar').classList.remove('hidden');
            } else if (datos.apuestas) {
                document.getElementById('apuesta-responder').classList.remove('hidden');
                
                let ocultarSubir = datos.apuestas.subida === 'ÓRDAGO';
                document.getElementById('in-subir').classList.toggle('hidden', ocultarSubir);
                document.getElementById('btn-subir').classList.toggle('hidden', ocultarSubir);
                document.getElementById('btn-ordago-resp').classList.toggle('hidden', ocultarSubir);
            }
        }
    }
});

// ==========================================
// 4. UTILIDADES VISUALES
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

function mostrarRecuentoEstatico(datos) {
    mostrarBotones([]);
    
    const contenedorRival = document.querySelector('#opponent-area .cards-placeholder');
    if (contenedorRival) {
        contenedorRival.innerHTML = '';
        if (datos.cartas_rival) {
            datos.cartas_rival.forEach(c => {
                const d = document.createElement('div');
                d.className = 'carta'; 
                d.innerHTML = `<img src="${c.img}" alt="${c.texto}">`;
                contenedorRival.appendChild(d);
            });
        }
    }

    document.getElementById('puntos-mios').innerText = datos.mis_puntos;
    document.getElementById('puntos-rival').innerText = datos.puntos_rival;
    
    if(document.getElementById('partidas-mios')) {
        document.getElementById('partidas-mios').innerText = datos.mis_partidas;
        document.getElementById('partidas-rival').innerText = datos.partidas_rival;
    }

    const gameLog = document.getElementById('game-log');
    let htmlRecuento = "<strong style='font-size: 1.2em; color: #88c0d0;'>Resultados de la ronda:</strong><br><br>";

    if (datos.recuento && datos.recuento.length > 0) {
        for (let paso of datos.recuento) {
            htmlRecuento += `${paso}<br>`
        }
    } else {
        htmlRecuento += "<em>(Hubo un error o la ronda no tuvo apuestas válidas)</em><br>";
    }

    let btnNext = document.getElementById('btn-next-round');

    if (datos.mis_puntos >= 40 || datos.puntos_rival >= 40) {
        const txt = datos.mis_puntos >= 40 ? "🏆 ¡HAS GANADO ESTA PARTIDA!" : "💀 ¡EL RIVAL HA GANADO ESTA PARTIDA!";
        htmlRecuento += `<br><strong style="font-size: 1.5em; color: #a3be8c;">${txt}</strong>`;
        
        if (datos.match_finalizado) {
            const txtGlobal = datos.mis_puntos >= 40 ? "🏆 ¡HAS GANADO EL MATCH!" : "💀 ¡EL RIVAL HA GANADO EL MATCH!";
            htmlRecuento += `<br><strong style="font-size: 1.5em; color: #a3be8c;">${txtGlobal}</strong>`;
            gameLog.innerHTML = htmlRecuento;
        } else {
            gameLog.innerHTML = htmlRecuento;
            if (btnNext) btnNext.innerText = "Siguiente partida";
            mostrarBotones(['btn-next-round']);
        }
    } else {
        gameLog.innerHTML = htmlRecuento;
        if (btnNext) btnNext.innerText = "Siguiente ronda";
        mostrarBotones(['btn-next-round']);
    }
}