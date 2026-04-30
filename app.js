let peer, conn;
let isHost = false;

// Variables de estado del juego
let soyMano = false;
let misCartas = [];
let baraja = [];
let puntosMios = 0;
let puntosRival = 0;
let faseJuego = 'espera'; // espera, mus, descarte, juego
let cartasSeleccionadas = [];
// Variables del motor de apuestas
const fasesApuesta = ['Grande', 'Chica', 'Pares', 'Juego'];
let indiceFaseActual = 0;
let botes = { 'Grande': 0, 'Chica': 0, 'Pares': 0, 'Juego': 0 };
let apuestaEnAire = 0; 
let miTurnoHablar = false;
let pasesConsecutivos = 0;

const setupScreen = document.getElementById('setup-screen');
const gameScreen = document.getElementById('game-screen');
const statusMsg = document.getElementById('status-msg');
const gameLog = document.getElementById('game-log');

// --- SETUP DE CONEXIÓN PEERJS ---
document.getElementById('btn-create').addEventListener('click', () => {
    isHost = true;
    const randomId = 'MUS-' + Math.floor(Math.random() * 10000);
    peer = new Peer(randomId);
    peer.on('open', (id) => {
        document.getElementById('my-id').innerText = id;
        statusMsg.innerText = "Esperando a que se conecte tu amigo...";
    });
    peer.on('connection', (connection) => { conn = connection; setupConnection(); });
});

document.getElementById('btn-join').addEventListener('click', () => {
    isHost = false;
    const hostId = document.getElementById('join-id').value.trim().toUpperCase();
    if (!hostId) return;
    
    peer = new Peer();
    peer.on('error', (err) => { statusMsg.innerText = "❌ Error: " + err.type; });
    peer.on('open', () => {
        statusMsg.innerText = "Conectando...";
        conn = peer.connect(hostId);
        setupConnection();
    });
});

// --- COMUNICACIÓN POR RED ---
function setupConnection() {
    conn.on('open', () => {
        setupScreen.classList.add('hidden');
        gameScreen.classList.remove('hidden');
        
        if(isHost) {
            // El Host sortea la mano inicial
            soyMano = Math.random() > 0.5;
            conn.send({ type: 'init-game', hostEsMano: soyMano });
            iniciarRonda();
        }
    });

    conn.on('data', (data) => {
        switch(data.type) {
            case 'init-game':
                soyMano = !data.hostEsMano;
                iniciarRonda();
                break;
            case 'request-deal':
                realizarRepartoLocal(); // Solo lo hace el Host
                break;
            case 'deal':
                misCartas = data.cards;
                evaluarInicioMano();
                break;
            case 'pedrete-claim':
                puntosRival += 1;
                actualizarMarcadores();
                gameLog.innerText = "¡El rival tenía Pedrete y se lleva 1 punto!";
                break;
            case 'mus-call':
                faseJuego = 'mus';
                gameLog.innerText = "La mano pide Mus. ¿Qué haces?";
                mostrarBotones(['btn-mus', 'btn-nomus']);
                break;
            case 'mus-accept':
                iniciarDescarte();
                break;
            case 'no-mus':
                gameLog.innerText = "¡El rival ha cortado el mus!";
                iniciarFaseApuestas();
                break;
            case 'request-discard': // Guest pide cartas al Host
                const nuevas = baraja.splice(0, data.count);
                conn.send({ type: 'give-discard-cards', cards: nuevas });
                break;
            case 'give-discard-cards': // Guest recibe sus cartas de descarte
                data.cards.forEach(c => misCartas.push(c));
                evaluarInicioMano(); // Se reevalúa el mus con las nuevas cartas
                break;
            case 'apuesta-accion':
                procesarAccionRival(data.accion, data.cantidad);
                break;
        }
    });
}

// --- LÓGICA DE CARTAS ---
function crearBaraja() {
    const palos = ['Oros', 'Copas', 'Espadas', 'Bastos'];
    const valores = [1, 2, 3, 4, 5, 6, 7, 10, 11, 12];
    const iconos = { 'Oros': '🪙', 'Copas': '🍷', 'Espadas': '🗡️', 'Bastos': '🪵' };
    let nueva = [];
    for (let palo of palos) {
        for (let valor of valores) {
            let nombre = valor;
            if (valor === 1) nombre = 'As';
            if (valor === 10) nombre = 'Sota';
            if (valor === 11) nombre = 'Caballo';
            if (valor === 12) nombre = 'Rey';
            nueva.push({ valor: valor, palo: palo, texto: `${nombre} de ${palo} ${iconos[palo]}` });
        }
    }
    return nueva;
}

function barajar(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
}

// --- FASES DEL JUEGO ---
function iniciarRonda() {
    document.getElementById('mi-rol').innerText = soyMano ? "(Eres Mano)" : "(Eres Postre)";
    gameLog.innerText = soyMano ? "Eres mano. Espera a que el postre reparta." : "Eres postre. ¡Te toca repartir!";
    
    // El Postre siempre es el que pulsa "Repartir"
    if (!soyMano) mostrarBotones(['btn-deal']);
    else ocultarBotonesAccion();
}

document.getElementById('btn-deal').addEventListener('click', () => {
    ocultarBotonesAccion();
    if (isHost) realizarRepartoLocal();
    else conn.send({ type: 'request-deal' });
});

function realizarRepartoLocal() { // Esto solo lo ejecuta el HOST físicamente
    baraja = barajar(crearBaraja());
    const cartasHost = baraja.splice(0, 4);
    const cartasGuest = baraja.splice(0, 4);
    
    misCartas = isHost ? cartasHost : cartasGuest;
    conn.send({ type: 'deal', cards: isHost ? cartasGuest : cartasHost });
    evaluarInicioMano();
}

function evaluarInicioMano() {
    mostrarMisCartas();
    cartasSeleccionadas = [];
    
    // Comprobar Pedrete (4, 5, 6, 7 ordenados)
    const valoresStr = misCartas.map(c => c.valor).sort((a,b)=>a-b).join(',');
    if (valoresStr === '4,5,6,7') {
        mostrarBotones(['btn-pedrete']);
        gameLog.innerText = "¡Tienes Pedrete! Cóbralo antes de continuar.";
        return; // Detenemos la fase hasta que pulse el botón
    }
    
    faseJuego = 'mus';
    if (soyMano) {
        gameLog.innerText = "Eres mano. ¿Quieres Mus?";
        mostrarBotones(['btn-mus', 'btn-nomus']);
    } else {
        gameLog.innerText = "Esperando a que la mano hable...";
        ocultarBotonesAccion();
    }
}

// --- BOTONES DE ACCIÓN ---
document.getElementById('btn-pedrete').addEventListener('click', () => {
    ocultarBotonesAccion();
    puntosMios += 1;
    actualizarMarcadores();
    conn.send({ type: 'pedrete-claim' });
    gameLog.innerText = "¡Has cantado Pedrete! Descartando y robando...";
    
    misCartas = []; // Tiramos las 4
    if (isHost) {
        misCartas = baraja.splice(0, 4);
        evaluarInicioMano();
    } else {
        conn.send({ type: 'request-discard', count: 4 });
    }
});

document.getElementById('btn-mus').addEventListener('click', () => {
    ocultarBotonesAccion();
    if (soyMano) {
        conn.send({ type: 'mus-call' });
        gameLog.innerText = "Has pedido Mus. Esperando al postre...";
    } else {
        conn.send({ type: 'mus-accept' });
        iniciarDescarte(); // Como postre, aceptamos y ambos vamos a descartar
    }
});

document.getElementById('btn-nomus').addEventListener('click', () => {
    ocultarBotonesAccion();
    conn.send({ type: 'no-mus' });
    gameLog.innerText = "Has cortado el Mus.";
    iniciarFaseApuestas();
});

function iniciarDescarte() {
    faseJuego = 'descarte';
    gameLog.innerText = "¡Hay Mus! Haz clic en las cartas que quieres tirar (mínimo 1).";
    mostrarBotones(['btn-descartar']);
    document.getElementById('btn-descartar').disabled = true;
}

document.getElementById('btn-descartar').addEventListener('click', () => {
    ocultarBotonesAccion();
    // Ordenamos de mayor a menor para borrar sin alterar el índice de las demás
    cartasSeleccionadas.sort((a,b)=>b-a).forEach(i => misCartas.splice(i, 1));
    
    const cant = cartasSeleccionadas.length;
    if (isHost) {
        const nuevas = baraja.splice(0, cant);
        nuevas.forEach(c => misCartas.push(c));
        evaluarInicioMano(); // Volver a empezar ronda de mus
    } else {
        conn.send({ type: 'request-discard', count: cant });
    }
});

// --- INTERFAZ DINÁMICA ---
function mostrarMisCartas() {
    const contenedor = document.getElementById('my-cards');
    contenedor.innerHTML = '';
    misCartas.forEach((carta, index) => {
        const div = document.createElement('div');
        div.className = 'carta';
        div.innerText = carta.texto;
        div.onclick = () => alternarCarta(index, div);
        contenedor.appendChild(div);
    });
}

function alternarCarta(index, div) {
    if (faseJuego !== 'descarte') return;
    
    const pos = cartasSeleccionadas.indexOf(index);
    if (pos === -1) {
        cartasSeleccionadas.push(index);
        div.classList.add('seleccionada');
    } else {
        cartasSeleccionadas.splice(pos, 1);
        div.classList.remove('seleccionada');
    }
    
    const btn = document.getElementById('btn-descartar');
    btn.innerText = `Descartar (${cartasSeleccionadas.length})`;
    btn.disabled = cartasSeleccionadas.length === 0;
}

function mostrarBotones(ids) {
    document.getElementById('action-buttons').classList.remove('hidden');
    ['btn-deal', 'btn-pedrete', 'btn-mus', 'btn-nomus', 'btn-descartar'].forEach(id => {
        document.getElementById(id).classList.add('hidden');
    });
    ids.forEach(id => document.getElementById(id).classList.remove('hidden'));
}

function ocultarBotonesAccion() {
    document.getElementById('action-buttons').classList.add('hidden');
}

function actualizarMarcadores() {
    document.getElementById('puntos-mios').innerText = puntosMios;
    document.getElementById('puntos-rival').innerText = puntosRival;
}


// --- MOTOR DE APUESTAS ---

function iniciarFaseApuestas() {
    faseJuego = 'apuestas';
    indiceFaseActual = 0;
    botes = { 'Grande': 0, 'Chica': 0, 'Pares': 0, 'Juego': 0 };
    
    const logDiv = document.getElementById('betting-log');
    logDiv.innerHTML = '';
    logDiv.classList.remove('hidden');
    
    prepararRondaApuesta();
}

function prepararRondaApuesta() {
    if (indiceFaseActual >= fasesApuesta.length) {
        finDeRondas();
        return;
    }

    const nombreFase = fasesApuesta[indiceFaseActual];
    apuestaEnAire = 0;
    pasesConsecutivos = 0;
    miTurnoHablar = soyMano; // Siempre empieza la mano

    // Añadir línea al log central
    const logLine = document.createElement('p');
    logLine.id = `log-${nombreFase}`;
    logLine.innerText = `${nombreFase}: 0`;
    document.getElementById('betting-log').appendChild(logLine);

    actualizarInterfazApuestas();
}

function actualizarInterfazApuestas() {
    const nombreFase = fasesApuesta[indiceFaseActual];
    
    document.getElementById('mi-turno').classList.toggle('hidden', !miTurnoHablar);
    document.getElementById('turno-rival').classList.toggle('hidden', miTurnoHablar);
    document.getElementById('action-buttons').classList.remove('hidden');

    // Ocultar todas las botoneras por defecto
    document.getElementById('apuesta-iniciar').classList.add('hidden');
    document.getElementById('apuesta-responder').classList.add('hidden');

    if (miTurnoHablar) {
        gameLog.innerText = `[Fase de ${nombreFase}] - Te toca decidir.`;
        if (apuestaEnAire === 0) {
            document.getElementById('apuesta-iniciar').classList.remove('hidden');
            // Restaurar valores por defecto
            document.getElementById('in-envidar').value = 2;
        } else {
            document.getElementById('apuesta-responder').classList.remove('hidden');
            document.getElementById('in-subir').value = 2;
        }
    } else {
        gameLog.innerText = `[Fase de ${nombreFase}] - El rival está pensando...`;
    }
}

function avanzarSiguienteFase(botaAñadir = 0) {
    const nombreFase = fasesApuesta[indiceFaseActual];
    botes[nombreFase] += botaAñadir;
    document.getElementById(`log-${nombreFase}`).innerText = `${nombreFase}: ${botes[nombreFase]}`;
    
    indiceFaseActual++;
    prepararRondaApuesta();
}

function finDeRondas() {
    document.getElementById('mi-turno').classList.add('hidden');
    document.getElementById('turno-rival').classList.add('hidden');
    ocultarBotonesAccion();
    gameLog.innerText = "Fase de apuestas terminada. (Pendiente: Lógica de mostrar cartas y sumar puntos)";
}

// --- ACCIONES DEL JUGADOR ---

function realizarAccion(accion, cantidad = 0) {
    miTurnoHablar = false;
    actualizarInterfazApuestas(); // Congelar mi pantalla
    conn.send({ type: 'apuesta-accion', accion, cantidad });
    
    const nombreFase = fasesApuesta[indiceFaseActual];

    if (accion === 'pasar') {
        pasesConsecutivos++;
        gameLog.innerText = `Has pasado.`;
        if (pasesConsecutivos === 2) avanzarSiguienteFase(1); // Pase corrido suma 1 al recuento final (representado en el bote por ahora)
    } 
    else if (accion === 'nover') {
        gameLog.innerText = `No has visto. El rival se lleva el bote anterior.`;
        // El rival se lleva el bote. Avanzamos fase.
        avanzarSiguienteFase(botes[nombreFase] === 0 ? 1 : botes[nombreFase]); 
    }
    else if (accion === 'envidar' || accion === 'subir') {
        pasesConsecutivos = 0;
        apuestaEnAire += cantidad;
        gameLog.innerText = `Has apostado ${cantidad}.`;
    }
    else if (accion === 'ver') {
        gameLog.innerText = `Has visto la apuesta.`;
        botes[nombreFase] += apuestaEnAire; // Consolidamos la apuesta en el bote final
        avanzarSiguienteFase(0);
    }
    else if (accion === 'ordago') {
        gameLog.innerText = `¡HAS LANZADO UN ÓRDAGO!`;
    }
}

// Escuchadores de la botonera de Iniciar
document.getElementById('btn-envidar').addEventListener('click', () => {
    const cant = parseInt(document.getElementById('in-envidar').value) || 2;
    realizarAccion('envidar', cant);
});
document.getElementById('btn-pasar').addEventListener('click', () => realizarAccion('pasar'));
document.getElementById('btn-ordago').addEventListener('click', () => realizarAccion('ordago'));

// Escuchadores de la botonera de Responder
document.getElementById('btn-ver').addEventListener('click', () => realizarAccion('ver'));
document.getElementById('btn-subir').addEventListener('click', () => {
    const cant = parseInt(document.getElementById('in-subir').value) || 2;
    realizarAccion('subir', cant);
});
document.getElementById('btn-nover').addEventListener('click', () => realizarAccion('nover'));
document.getElementById('btn-ordago-resp').addEventListener('click', () => realizarAccion('ordago'));

// --- PROCESAR RESPUESTA DEL RIVAL ---

function procesarAccionRival(accion, cantidad) {
    const nombreFase = fasesApuesta[indiceFaseActual];

    if (accion === 'pasar') {
        pasesConsecutivos++;
        if (pasesConsecutivos === 2) {
            gameLog.innerText = `El rival ha pasado. (Pase corrido)`;
            avanzarSiguienteFase(1);
        } else {
            gameLog.innerText = `El rival ha pasado. ¡Te toca hablar!`;
            miTurnoHablar = true;
            actualizarInterfazApuestas();
        }
    }
    else if (accion === 'nover') {
        gameLog.innerText = `El rival NO HA VISTO. Te llevas el bote anterior.`;
        avanzarSiguienteFase(botes[nombreFase] === 0 ? 1 : botes[nombreFase]);
    }
    else if (accion === 'envidar' || accion === 'subir') {
        pasesConsecutivos = 0;
        apuestaEnAire += cantidad;
        gameLog.innerText = `El rival ha apostado ${cantidad}. ¿Qué haces?`;
        miTurnoHablar = true;
        actualizarInterfazApuestas();
    }
    else if (accion === 'ver') {
        gameLog.innerText = `El rival HA VISTO. Apuesta cerrada.`;
        botes[nombreFase] += apuestaEnAire;
        avanzarSiguienteFase(0);
    }
    else if (accion === 'ordago') {
        apuestaEnAire = 'ÓRDAGO';
        gameLog.innerText = `¡EL RIVAL HA LANZADO UN ÓRDAGO!`;
        miTurnoHablar = true;
        actualizarInterfazApuestas();
    }
}