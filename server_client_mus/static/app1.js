const socket = io();

let miNombre = "";
let faseJuego = 'espera';
let cartasSeleccionadas = []; // Guardará las cartas que quieres tirar: [0, 2, 3]

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
    
    // Reseteamos las selecciones en cada turno
    cartasSeleccionadas = [];
    const btnDescartar = document.getElementById('btn-descartar');
    btnDescartar.innerText = 'Descartar (0)';
    
    // 1. DIBUJAR CARTAS CON LÓGICA DE CLIC
    const contenedorCartas = document.getElementById('my-cards');
    contenedorCartas.innerHTML = ''; 
    
    if (datos.mis_cartas && datos.mis_cartas.length > 0) {
        datos.mis_cartas.forEach((carta, index) => {
            const div = document.createElement('div');
            div.className = 'carta';
            div.innerText = carta.texto;
            
            // Lógica para seleccionar cartas SOLO durante la fase de descarte
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
                }
            };
            contenedorCartas.appendChild(div);
        });
    } else {
        contenedorCartas.innerHTML = 'Tus cartas aparecerán aquí';
    }

    // 2. ACTUALIZAR TEXTOS
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

    // 3. MOSTRAR BOTONES SEGÚN LA FASE
    if (datos.fase === 'descarte') {
        if (!datos.descartes_listos) {
            mostrarBotones(['btn-descartar']);
        } else {
            mostrarBotones([]);
        }
    } else if (datos.es_mi_turno) {
        if (datos.fase === 'espera_reparto') mostrarBotones(['btn-deal']);
        else if (datos.fase === 'mus') mostrarBotones(['btn-mus', 'btn-nomus']);
        else if (datos.fase === 'apuestas') {
            document.getElementById('action-buttons').classList.remove('hidden');
            if (datos.apuestas.subida === 0) {
                document.getElementById('apuesta-iniciar').classList.remove('hidden');
            } else {
                document.getElementById('apuesta-responder').classList.remove('hidden');
                // Bloquear botón de subir si hay órdago
                let ocultarSubir = datos.apuestas.subida === 'ÓRDAGO';
                document.getElementById('in-subir').classList.toggle('hidden', ocultarSubir);
                document.getElementById('btn-subir').classList.toggle('hidden', ocultarSubir);
                document.getElementById('btn-ordago-resp').classList.toggle('hidden', ocultarSubir);
            }
        }
    } else {
        mostrarBotones([]);
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