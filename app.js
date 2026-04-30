let peer, conn;
let isHost = false;

// Variables de estado del juego
let soyMano = false;
let misCartas = [];
let baraja = [];
let descartes = []; 
let puntosMios = 0;
let puntosRival = 0;
let faseJuego = 'espera'; 
let cartasSeleccionadas = [];
let descartesListos = 0; 

// Variables del motor de apuestas
const fasesApuesta = ['Grande', 'Chica', 'Pares', 'Juego'];
let indiceFaseActual = 0;
let botes = { 'Grande': 0, 'Chica': 0, 'Pares': 0, 'Juego': 0 };
let apuestaEnAire = 0; 
let apuestaDeje = 1;
let miTurnoHablar = false;
let pasesConsecutivos = 0;

let miEstadoPares = false, miEstadoJuego = false;
let rivalEstadoPares = null, rivalEstadoJuego = null;

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
            // El Host decide el 50/50 y se lo comunica al Guest
            soyMano = Math.random() > 0.5;
            gameLog.innerText = "🎲 Realizando sorteo inicial de Mano/Postre...";
            conn.send({ type: 'init-game', hostEsMano: soyMano });
            setTimeout(iniciarRonda, 2000);
        }
    });

    conn.on('data', (data) => {
        switch(data.type) {
            case 'init-game':
                soyMano = !data.hostEsMano;
                gameLog.innerText = "🎲 Realizando sorteo inicial de Mano/Postre...";
                setTimeout(iniciarRonda, 2000);
                break;
            case 'request-deal':
                realizarRepartoLocal(); 
                break;
            case 'deal':
                misCartas = data.cards;
                evaluarInicioMano();
                break;
            case 'request-discard': 
                data.descartadas.forEach(c => descartes.push(c));
                const nuevas = robarCartas(data.count);
                conn.send({ type: 'give-discard-cards', cards: nuevas });
                descartesListos++;
                comprobarFinDescartes();
                break;
            case 'give-discard-cards': 
                data.cards.forEach(c => misCartas.push(c));
                gameLog.innerText = "Esperando a que el Host termine de descartar...";
                break;
            case 'mus-ronda-lista': 
                evaluarInicioMano();
                break;
            case 'request-pedrete':
                data.descartadas.forEach(c => descartes.push(c));
                conn.send({ type: 'give-pedrete', cards: robarCartas(4) });
                break;
            case 'give-pedrete':
                misCartas = data.cards;
                evaluarInicioMano();
                break;
            case 'pedrete-claim':
                sumarPuntos('rival', 1);
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
                iniciarFaseApuestas();
                break;
            case 'info-fases': 
                rivalEstadoPares = data.pares;
                rivalEstadoJuego = data.juego;
                if (faseJuego === 'apuestas') intentarPrepararRonda();
                break;
            case 'apuesta-accion':
                procesarAccionRival(data.accion, data.cantidad);
                break;
        }
    });
}

// --- LÓGICA DE CARTAS Y BARAJA ---
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

function robarCartas(cantidad) {
    let robadas = [];
    for(let i=0; i<cantidad; i++) {
        if(baraja.length === 0) {
            baraja = barajar(descartes);
            descartes = [];
            gameLog.innerText += " (¡Se ha barajado el descarte!)";
        }
        robadas.push(baraja.shift());
    }
    return robadas;
}

function tienePares(cartas) {
    const counts = {};
    for (let c of cartas) {
        // Los 3 son Reyes (12) y los 2 son Ases (1)
        let valorReal = c.valor === 3 ? 12 : (c.valor === 2 ? 1 : c.valor);
        counts[valorReal] = (counts[valorReal] || 0) + 1;
    }
    return Object.values(counts).some(v => v >= 2);
}

function tieneJuego(cartas) {
    let suma = cartas.reduce((acc, c) => {
        // Figuras y el 3 (que es un Rey) valen 10
        if (c.valor === 3 || c.valor >= 10) return acc + 10;
        // Los Pitos (As y 2) valen 1
        if (c.valor === 2 || c.valor === 1) return acc + 1;
        // El resto (4, 5, 6, 7) valen su valor
        return acc + c.valor;
    }, 0);
    return suma >= 31;
}

// --- FASES DEL JUEGO ---
function iniciarRonda() {
    document.getElementById('mi-rol').innerText = soyMano ? "(Eres Mano)" : "(Eres Postre)";
    gameLog.innerText = soyMano ? "Eres mano. Espera a que el postre reparta." : "Eres postre. ¡Te toca repartir!";
    if (!soyMano) mostrarBotones(['btn-deal']);
    else mostrarBotones([]);
}

document.getElementById('btn-deal').addEventListener('click', () => {
    mostrarBotones([]);
    if (isHost) realizarRepartoLocal();
    else conn.send({ type: 'request-deal' });
});

function realizarRepartoLocal() {
    descartes = []; 
    baraja = barajar(crearBaraja());
    misCartas = robarCartas(4);
    conn.send({ type: 'deal', cards: robarCartas(4) });
    evaluarInicioMano();
}

function evaluarInicioMano() {
    mostrarMisCartas();
    cartasSeleccionadas = [];
    rivalEstadoPares = null;
    rivalEstadoJuego = null;
    
    const valoresStr = misCartas.map(c => c.valor).sort((a,b)=>a-b).join(',');
    if (valoresStr === '4,5,6,7') {
        mostrarBotones(['btn-pedrete']);
        gameLog.innerText = "¡Tienes Pedrete! Cóbralo antes de continuar.";
        return; 
    }
    
    faseJuego = 'mus';
    if (soyMano) {
        gameLog.innerText = "Eres mano. ¿Quieres Mus?";
        mostrarBotones(['btn-mus', 'btn-nomus']);
    } else {
        gameLog.innerText = "Esperando a que la mano hable...";
        mostrarBotones([]);
    }
}

// --- BOTONES DE MUS Y DESCARTE ---
document.getElementById('btn-pedrete').addEventListener('click', () => {
    mostrarBotones([]);
    sumarPuntos('yo', 1);
    conn.send({ type: 'pedrete-claim' });
    gameLog.innerText = "¡Has cantado Pedrete! Cambiando cartas...";
    
    let cartasTiradasObj = [...misCartas];
    misCartas = [];
    if (isHost) {
        cartasTiradasObj.forEach(c => descartes.push(c));
        misCartas = robarCartas(4);
        evaluarInicioMano();
    } else {
        conn.send({ type: 'request-pedrete', descartadas: cartasTiradasObj });
    }
});

document.getElementById('btn-mus').addEventListener('click', () => {
    mostrarBotones([]);
    if (soyMano) {
        conn.send({ type: 'mus-call' });
        gameLog.innerText = "Has pedido Mus. Esperando al postre...";
    } else {
        conn.send({ type: 'mus-accept' });
        iniciarDescarte(); 
    }
});

document.getElementById('btn-nomus').addEventListener('click', () => {
    mostrarBotones([]);
    conn.send({ type: 'no-mus' }); 
    iniciarFaseApuestas();
});

function iniciarDescarte() {
    faseJuego = 'descarte';
    if(isHost) descartesListos = 0;
    gameLog.innerText = "¡Hay Mus! Selecciona las cartas que quieres tirar.";
    mostrarBotones(['btn-descartar']);
    document.getElementById('btn-descartar').disabled = true;
}

document.getElementById('btn-descartar').addEventListener('click', () => {
    const cant = cartasSeleccionadas.length;
    let cartasTiradasObj = cartasSeleccionadas.map(i => misCartas[i]);
    cartasSeleccionadas.sort((a,b)=>b-a).forEach(i => misCartas.splice(i, 1));
    
    mostrarBotones([]);
    
    if (isHost) {
        cartasTiradasObj.forEach(c => descartes.push(c));
        const nuevas = robarCartas(cant);
        nuevas.forEach(c => misCartas.push(c));
        gameLog.innerText = "Esperando a que el Invitado se descarte...";
        descartesListos++;
        comprobarFinDescartes();
    } else {
        conn.send({ type: 'request-discard', count: cant, descartadas: cartasTiradasObj });
        gameLog.innerText = "Esperando a que el Host se descarte...";
    }
});

function comprobarFinDescartes() {
    if (descartesListos === 2) {
        evaluarInicioMano();
        conn.send({ type: 'mus-ronda-lista' });
    }
}

// --- MOTOR DE APUESTAS ---

function iniciarFaseApuestas() {
    mostrarBotones([]); 
    faseJuego = 'apuestas';
    indiceFaseActual = 0;
    botes = { 'Grande': 0, 'Chica': 0, 'Pares': 0, 'Juego': 0 };
    apuestaEnAire = 0;
    
    const logDiv = document.getElementById('betting-log');
    logDiv.innerHTML = `
        <p id="log-Grande">Grande: 0</p>
        <p id="log-Chica">Chica: 0</p>
        <p id="log-Pares">Pares: 0</p>
        <p id="log-Juego">Juego: 0</p>
        <div id="caja-en-aire" class="hidden" style="margin-top: 10px; padding-top: 10px; border-top: 1px dashed #88c0d0;">
            <p class="highlight" style="font-size: 1.2em;">En el aire: <span id="log-en-aire">0</span></p>
        </div>
    `;
    logDiv.classList.remove('hidden');

    miEstadoPares = tienePares(misCartas);
    miEstadoJuego = tieneJuego(misCartas);

    conn.send({ type: 'info-fases', pares: miEstadoPares, juego: miEstadoJuego });
    intentarPrepararRonda();
}

function intentarPrepararRonda() {
    if (rivalEstadoPares !== null) prepararRondaApuesta();
}

function actualizarCajaAire() {
    const caja = document.getElementById('caja-en-aire');
    if (apuestaEnAire > 0 || apuestaEnAire === 'ÓRDAGO') {
        caja.classList.remove('hidden');
        document.getElementById('log-en-aire').innerText = apuestaEnAire;
    } else {
        caja.classList.add('hidden');
    }
}

function prepararRondaApuesta() {
    if (indiceFaseActual >= fasesApuesta.length) {
        finDeRondas();
        return;
    }

    const nombreFase = fasesApuesta[indiceFaseActual];
    apuestaEnAire = 0;
    pasesConsecutivos = 0;
    apuestaDeje = 1;
    miTurnoHablar = soyMano;
    actualizarCajaAire(); // Reseteamos la caja de aire visualmente

    if (nombreFase === 'Pares') {
        if (!miEstadoPares && !rivalEstadoPares) {
            gameLog.innerText = "Nadie tiene Pares.";
            setTimeout(() => avanzarSiguienteFase(0), 1500);
            return;
        } else if (!miEstadoPares || !rivalEstadoPares) {
            gameLog.innerText = miEstadoPares ? "Solo tú tienes Pares." : "Solo el rival tiene Pares.";
            setTimeout(() => avanzarSiguienteFase(0), 1500);
            return;
        }
    }
    
    if (nombreFase === 'Juego') {
        if (!miEstadoJuego && !rivalEstadoJuego) {
            document.getElementById(`log-${nombreFase}`).innerText = "Punto: 0";
        } else if (!miEstadoJuego || !rivalEstadoJuego) {
            gameLog.innerText = miEstadoJuego ? "Solo tú tienes Juego." : "Solo el rival tiene Juego.";
            setTimeout(() => avanzarSiguienteFase(0), 1500);
            return;
        }
    }

    actualizarInterfazApuestas();
}

function actualizarInterfazApuestas() {
    const nombreFase = fasesApuesta[indiceFaseActual];
    
    document.getElementById('mi-turno').classList.toggle('hidden', !miTurnoHablar);
    document.getElementById('turno-rival').classList.toggle('hidden', miTurnoHablar);
    
    mostrarBotones([]); 
    document.getElementById('action-buttons').classList.remove('hidden');
    document.getElementById('apuesta-iniciar').classList.add('hidden');
    document.getElementById('apuesta-responder').classList.add('hidden');

    if (miTurnoHablar) {
        gameLog.innerText = `[Fase de ${nombreFase === 'Juego' && !miEstadoJuego && !rivalEstadoJuego ? 'Punto' : nombreFase}] - Te toca decidir.`;
        if (apuestaEnAire === 0) {
            document.getElementById('apuesta-iniciar').classList.remove('hidden');
            document.getElementById('in-envidar').value = 2;
        } else {
            document.getElementById('apuesta-responder').classList.remove('hidden');
            document.getElementById('in-subir').value = 2;
        }
    } else {
        gameLog.innerText = `[Fase de ${nombreFase === 'Juego' && !miEstadoJuego && !rivalEstadoJuego ? 'Punto' : nombreFase}] - El rival está pensando...`;
    }
}

function avanzarSiguienteFase(botaAñadir = 0) {
    const nombreFase = fasesApuesta[indiceFaseActual];
    botes[nombreFase] += botaAñadir;
    
    const displayNombre = (nombreFase === 'Juego' && !miEstadoJuego && !rivalEstadoJuego) ? 'Punto' : nombreFase;
    document.getElementById(`log-${nombreFase}`).innerText = `${displayNombre}: ${botes[nombreFase]}`;
    
    indiceFaseActual++;
    prepararRondaApuesta();
}

function finDeRondas() {
    document.getElementById('mi-turno').classList.add('hidden');
    document.getElementById('turno-rival').classList.add('hidden');
    mostrarBotones([]);
    
    gameLog.innerText = "¡Fase de apuestas terminada! (Próximamente: recuento de puntos). Rotando roles...";
    
    // Rotamos los roles para poder seguir jugando
    setTimeout(() => {
        soyMano = !soyMano;
        iniciarRonda();
    }, 4000);
}

// --- ACCIONES DE APUESTA ---

// --- ACCIONES DE APUESTA ---

function realizarAccion(accion, cantidad = 0) {
    miTurnoHablar = false;
    actualizarInterfazApuestas(); 
    conn.send({ type: 'apuesta-accion', accion, cantidad });
    
    const nombreFase = fasesApuesta[indiceFaseActual];

    if (accion === 'pasar') {
        pasesConsecutivos++;
        gameLog.innerText = `Has pasado.`;
        if (pasesConsecutivos === 2) avanzarSiguienteFase(1); 
    } 
    else if (accion === 'nover') {
        // El rival cobra el deje exacto de la apuesta anterior
        sumarPuntos('rival', apuestaDeje);
        gameLog.innerText = `Te has achantado. El rival se lleva ${apuestaDeje} punto(s) de deje.`;
        avanzarSiguienteFase(0); 
    }
    else if (accion === 'envidar') {
        pasesConsecutivos = 0;
        apuestaDeje = 1;
        apuestaEnAire = cantidad;
        actualizarCajaAire();
        gameLog.innerText = `Has apostado ${cantidad}.`;
    }
    else if (accion === 'subir') {
        pasesConsecutivos = 0;
        apuestaDeje = apuestaEnAire; // El nuevo deje es lo que había en el aire antes de tu subida
        apuestaEnAire += cantidad;   // El aire total suma la nueva cantidad
        actualizarCajaAire();
        gameLog.innerText = `Has subido ${cantidad}.`;
    }
    else if (accion === 'ver') {
        gameLog.innerText = `Has visto la apuesta.`;
        botes[nombreFase] += apuestaEnAire;
        avanzarSiguienteFase(0);
    }
    else if (accion === 'ordago') {
        apuestaDeje = apuestaEnAire === 0 ? 1 : apuestaEnAire;
        apuestaEnAire = 'ÓRDAGO';
        actualizarCajaAire();
        gameLog.innerText = `¡HAS LANZADO UN ÓRDAGO!`;
    }
}

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
        // Tú cobras el deje
        sumarPuntos('yo', apuestaDeje);
        gameLog.innerText = `¡El rival no ha querido ver! Te llevas ${apuestaDeje} punto(s) de deje.`;
        avanzarSiguienteFase(0);
    }
    else if (accion === 'envidar') {
        pasesConsecutivos = 0;
        apuestaDeje = 1;
        apuestaEnAire = cantidad;
        actualizarCajaAire();
        gameLog.innerText = `El rival ha apostado ${cantidad}. ¿Qué haces?`;
        miTurnoHablar = true;
        actualizarInterfazApuestas();
    }
    else if (accion === 'subir') {
        pasesConsecutivos = 0;
        apuestaDeje = apuestaEnAire;
        apuestaEnAire += cantidad;
        actualizarCajaAire();
        gameLog.innerText = `El rival ha subido ${cantidad}. ¿Qué haces?`;
        miTurnoHablar = true;
        actualizarInterfazApuestas();
    }
    else if (accion === 'ver') {
        gameLog.innerText = `El rival HA VISTO. Apuesta cerrada.`;
        botes[nombreFase] += apuestaEnAire;
        avanzarSiguienteFase(0);
    }
    else if (accion === 'ordago') {
        apuestaDeje = apuestaEnAire === 0 ? 1 : apuestaEnAire;
        apuestaEnAire = 'ÓRDAGO';
        actualizarCajaAire();
        gameLog.innerText = `¡EL RIVAL HA LANZADO UN ÓRDAGO!`;
        miTurnoHablar = true;
        actualizarInterfazApuestas();
    }
}

// Botones de apuestas HTML
document.getElementById('btn-envidar').addEventListener('click', () => {
    realizarAccion('envidar', parseInt(document.getElementById('in-envidar').value) || 2);
});
document.getElementById('btn-pasar').addEventListener('click', () => realizarAccion('pasar'));
document.getElementById('btn-ordago').addEventListener('click', () => realizarAccion('ordago'));
document.getElementById('btn-ver').addEventListener('click', () => realizarAccion('ver'));
document.getElementById('btn-subir').addEventListener('click', () => {
    realizarAccion('subir', parseInt(document.getElementById('in-subir').value) || 2);
});
document.getElementById('btn-nover').addEventListener('click', () => realizarAccion('nover'));
document.getElementById('btn-ordago-resp').addEventListener('click', () => realizarAccion('ordago'));

// --- UTILIDADES ---
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
    const contenedor = document.getElementById('action-buttons');
    const allIds = ['btn-deal', 'btn-pedrete', 'btn-mus', 'btn-nomus', 'btn-descartar'];
    allIds.forEach(id => document.getElementById(id).classList.add('hidden'));
    
    if (ids.length > 0) {
        contenedor.classList.remove('hidden');
        ids.forEach(id => document.getElementById(id).classList.remove('hidden'));
    } else {
        contenedor.classList.add('hidden');
    }
}

function sumarPuntos(quien, cantidad) {
    if (quien === 'yo') puntosMios += cantidad;
    else puntosRival += cantidad;
    document.getElementById('puntos-mios').innerText = puntosMios;
    document.getElementById('puntos-rival').innerText = puntosRival;
}