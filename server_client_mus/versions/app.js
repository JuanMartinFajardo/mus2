// Nos conectamos al servidor central de Python
const socket = io();

// --- VARIABLES VISUALES LOCALES ---
// Ya no guardamos la lógica profunda aquí, solo lo necesario para dibujar
let miNombre = "";
let misCartas = [];
let faseJuego = 'espera';

// Referencias al DOM
const setupScreen = document.getElementById('setup-screen');
const gameScreen = document.getElementById('game-screen');
const statusMsg = document.getElementById('status-msg');
const gameLog = document.getElementById('game-log');
const btnUnirse = document.getElementById('btn-unirse');

// ==========================================
// 1. ENVIAR ACCIONES AL SERVIDOR (De Cliente a Python)
// ==========================================

btnUnirse.addEventListener('click', () => {
    miNombre = document.getElementById('nombre-jugador').value.trim() || "Jugador_" + Math.floor(Math.random() * 1000);
    socket.emit('unirse_partida', { nombre: miNombre });
    statusMsg.innerText = "Conectando con el servidor...";
    btnUnirse.disabled = true;
});

// Ejemplo: El botón de repartir ahora solo le avisa a Python
document.getElementById('btn-deal').addEventListener('click', () => {
    mostrarBotones([]); // Ocultamos para no pulsar dos veces
    socket.emit('accion_juego', { jugador: miNombre, accion: 'repartir' });
});

// Ejemplo: Envidar
document.getElementById('btn-envidar').addEventListener('click', () => {
    let cant = parseInt(document.getElementById('in-envidar').value) || 2;
    socket.emit('accion_apuesta', { jugador: miNombre, accion: 'envidar', cantidad: cant });
});


// ==========================================
// 2. RECIBIR ÓRDENES DEL SERVIDOR (De Python a Cliente)
// ==========================================

// Cuando entra alguien a la sala
socket.on('actualizar_estado', (datos) => {
    statusMsg.innerText = datos.mensaje;
});

// Cuando ya hay 2 jugadores y Python dice que arranquemos
socket.on('iniciar_partida', (datos) => {
    setupScreen.classList.add('hidden');
    gameScreen.classList.remove('hidden');
    gameLog.innerText = datos.mensaje;
    
    // De momento, mostramos el botón de repartir a lo bruto para probar
    mostrarBotones(['btn-deal']);
});

// Cuando Python actualiza la mesa (alguien apuesta, se reparten cartas, etc.)

// Cuando Python actualiza la mesa (alguien apuesta, se reparten cartas, etc.)
socket.on('actualizar_mesa', (datos) => {
    faseJuego = datos.fase;
    gameLog.innerText = datos.mensaje;
    
    // 1. DIBUJAR CARTAS
    const contenedorCartas = document.getElementById('my-cards');
    contenedorCartas.innerHTML = ''; 
    
    if (datos.mis_cartas && datos.mis_cartas.length > 0) {
        datos.mis_cartas.forEach((carta) => {
            const div = document.createElement('div');
            div.className = 'carta';
            div.innerText = carta.texto;
            contenedorCartas.appendChild(div);
        });
    } else {
        contenedorCartas.innerHTML = 'Tus cartas aparecerán aquí';
    }

    // 2. ACTUALIZAR INTERFAZ Y TURNOS
    document.getElementById('mi-rol').innerText = datos.soy_mano ? "(Eres Mano)" : "(Eres Postre)";
    document.getElementById('mi-turno').classList.toggle('hidden', !datos.es_mi_turno);
    document.getElementById('turno-rival').classList.toggle('hidden', datos.es_mi_turno);

    // 3. MOSTRAR BOTONES SEGÚN LA FASE Y EL TURNO
    if (datos.es_mi_turno) {
        if (datos.fase === 'espera_reparto') {
            mostrarBotones(['btn-deal']); // Solo el Postre verá el botón de repartir
        } 
        else if (datos.fase === 'mus') {
            mostrarBotones(['btn-mus', 'btn-nomus']); // Mostramos Mus / No Mus
        }
        // Aquí añadiremos la fase de apuestas y descarte más adelante
    } else {
        mostrarBotones([]); // Si no es tu turno, botones ocultos
    }
});

// Asegúrate también de que tu socket.on('iniciar_partida') quede así de limpio, 
// ya que 'actualizar_mesa' ahora hace todo el trabajo:
socket.on('iniciar_partida', (datos) => {
    setupScreen.classList.add('hidden');
    gameScreen.classList.remove('hidden');
});


// ==========================================
// 3. UTILIDADES VISUALES (Solo para dibujar en pantalla)
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