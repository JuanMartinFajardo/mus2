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

let auto_replay_round = false; // Ponlo a true si quieres que salte sola


// Variables del motor de apuestas
const fasesApuesta = ['Grande', 'Chica', 'Pares', 'Juego'];
let indiceFaseActual = 0;
let botes = { 'Grande': 0, 'Chica': 0, 'Pares': 0, 'Juego': 0 };
let apuestaVista = 0;
let subidaPendiente = 0; 
let quienSube = null; // Puede ser 'yo' o 'rival'
let miTurnoHablar = false;
let pasesConsecutivos = 0;

let miEstadoPares = false, miEstadoJuego = false;
let rivalEstadoPares = null, rivalEstadoJuego = null;
let ganadoresFase = { 'Grande': null, 'Chica': null, 'Pares': null, 'Juego': null };
let cartasRivalTemp = null;
const delay = ms => new Promise(res => setTimeout(res, ms)); // Para hacer pausas dramáticas en el log
let faseOrdagoAceptado = null; 
let cartasDescartadasRival = 0;



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
                cartasDescartadasRival = data.count; // Registramos sus descartes
                data.descartadas.forEach(c => descartes.push(c));
                const nuevas = robarCartas(data.count);
                conn.send({ type: 'give-discard-cards', cards: nuevas });
                descartesListos++;
                comprobarFinDescartes();
                break;
            case 'info-descarte': // El Host avisa de cuántas tira
                cartasDescartadasRival = data.count;
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
            case 'showdown':
                cartasRivalTemp = data.cards;
                if (faseJuego === 'recuento') iniciarRecuento();
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
    // ¡NUEVO! Mostramos los descartes del rival visualmente
    let msgExtra = cartasDescartadasRival > 0 ? `<br><span style="color:#a3be8c; font-size:0.9em;">(El rival cambió ${cartasDescartadasRival} cartas)</span>` : '';
    
    if (soyMano) {
        gameLog.innerHTML = `Eres mano. ¿Quieres Mus?${msgExtra}`;
        mostrarBotones(['btn-mus', 'btn-nomus']);
    } else {
        gameLog.innerHTML = `Esperando a que la mano hable...${msgExtra}`;
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
    cartasDescartadasRival = 0;
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
        conn.send({ type: 'info-descarte', count: cant }); // El Host avisa al Guest de cuántas cartas tira
        gameLog.innerText = "Esperando a que el rival se descarte...";
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
    faseOrdagoAceptado = null;
    mostrarBotones([]); 
    faseJuego = 'apuestas';
    indiceFaseActual = 0;
    botes = { 'Grande': 0, 'Chica': 0, 'Pares': 0, 'Juego': 0 };
    apuestaEnAire = 0;
    ganadoresFase = { 'Grande': null, 'Chica': null, 'Pares': null, 'Juego': null };
    
    const logDiv = document.getElementById('betting-log');
    logDiv.innerHTML = `
        <p id="log-Grande">Grande: 0</p>
        <p id="log-Chica">Chica: 0</p>
        <p id="log-Pares">Pares: 0</p>
        <p id="log-Juego">Juego: 0</p>
        <div id="caja-en-aire" class="hidden" style="margin-top: 10px; padding-top: 10px; border-top: 1px dashed #88c0d0;">
            <p style="font-size: 1.1em; margin-bottom: 5px;">Apuesta vista: <span id="log-apuesta-vista" class="highlight">0</span></p>
            <p id="texto-subida" style="font-size: 1.2em; font-weight: bold; color: #ebcb8b; margin: 0;"></p>
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
    if (subidaPendiente > 0 || subidaPendiente === 'ÓRDAGO') {
        caja.classList.remove('hidden');
        document.getElementById('log-apuesta-vista').innerText = apuestaVista;
        
        const textoSubida = document.getElementById('texto-subida');
        const cantidadStr = subidaPendiente === 'ÓRDAGO' ? 'un ÓRDAGO' : subidaPendiente;
        
        if (quienSube === 'yo') {
            textoSubida.innerText = `Has subido: ${cantidadStr}`;
        } else {
            textoSubida.innerText = `Te suben: ${cantidadStr}`;
            textoSubida.style.color = "#bf616a"; // Rojo para alertar de que te han subido
        }
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
    apuestaVista = 0;
    subidaPendiente = 0;
    quienSube = null;
    pasesConsecutivos = 0;
    miTurnoHablar = soyMano;
    actualizarCajaAire();
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
        let n = (nombreFase === 'Juego' && !miEstadoJuego && !rivalEstadoJuego) ? 'Punto' : nombreFase;
        gameLog.innerText = `[Fase de ${n}] - Te toca decidir.`;
        
        if (subidaPendiente === 0) {
            document.getElementById('apuesta-iniciar').classList.remove('hidden');
            document.getElementById('in-envidar').value = 2;
        } else {
            document.getElementById('apuesta-responder').classList.remove('hidden');
            
            // ¡NUEVO! Bloqueo de órdago
            if (subidaPendiente === 'ÓRDAGO') {
                document.getElementById('in-subir').classList.add('hidden');
                document.getElementById('btn-subir').classList.add('hidden');
                document.getElementById('btn-ordago-resp').classList.add('hidden');
            } else {
                document.getElementById('in-subir').classList.remove('hidden');
                document.getElementById('btn-subir').classList.remove('hidden');
                document.getElementById('btn-ordago-resp').classList.remove('hidden');
                document.getElementById('in-subir').value = 2;
            }
        }
    } else {
        let n = (nombreFase === 'Juego' && !miEstadoJuego && !rivalEstadoJuego) ? 'Punto' : nombreFase;
        gameLog.innerText = `[Fase de ${n}] - Esperando acción del rival...`;
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
    faseJuego = 'recuento';
    document.getElementById('mi-turno').classList.add('hidden');
    document.getElementById('turno-rival').classList.add('hidden');
    mostrarBotones([]);
    
    gameLog.innerText = "¡Fase de apuestas terminada! Mostrando cartas...";
    
    // Nos enviamos las cartas para comprobar quién gana
    conn.send({ type: 'showdown', cards: misCartas });
    
    // Si el rival fue más rápido y ya nos las mandó, iniciamos
    if (cartasRivalTemp) {
        iniciarRecuento();
    }
}

// --- ACCIONES DE APUESTA ---



function realizarAccion(accion, cantidad = 0) {
    miTurnoHablar = false;
    actualizarInterfazApuestas(); 
    conn.send({ type: 'apuesta-accion', accion, cantidad });
    
    const nombreFase = fasesApuesta[indiceFaseActual];

    if (accion === 'pasar') {
            pasesConsecutivos++;
            gameLog.innerText = `Has pasado.`;
            if (pasesConsecutivos === 2) {
                // Solo hay punto de pase corrido en Grande, Chica y Punto
                let puntoPase = (nombreFase === 'Grande' || nombreFase === 'Chica' || (nombreFase === 'Juego' && !miEstadoJuego && !rivalEstadoJuego)) ? 1 : 0;
                avanzarSiguienteFase(puntoPase); 
            }
        }
    else if (accion === 'nover') {
        let deje = apuestaVista > 0 ? apuestaVista : 1;
        sumarPuntos('rival', deje);
        ganadoresFase[nombreFase] = 'rival'; // ¡NUEVO! El rival ya ganó esta fase
        gameLog.innerText = `Te has achantado. El rival se lleva ${deje} punto(s) de deje.`;
        avanzarSiguienteFase(0); 
    }
    else if (accion === 'envidar') {
        pasesConsecutivos = 0;
        apuestaVista = 0;
        subidaPendiente = cantidad;
        quienSube = 'yo';
        actualizarCajaAire();
        gameLog.innerText = `Has envidado ${cantidad}.`;
    }
    else if (accion === 'subir') {
        pasesConsecutivos = 0;
        apuestaVista += subidaPendiente; 
        subidaPendiente = cantidad;
        quienSube = 'yo';
        actualizarCajaAire();
        gameLog.innerText = `Has subido ${cantidad}.`;
    }
    else if (accion === 'ver') {
            gameLog.innerText = `Has visto la apuesta.`;
            if (subidaPendiente === 'ÓRDAGO') {
                faseOrdagoAceptado = nombreFase;
                botes[nombreFase] = 40; // ¡NUEVO! Órdago aceptado
                finDeRondas();
                return;
            } else {
                botes[nombreFase] += (apuestaVista + subidaPendiente);
            }
            avanzarSiguienteFase(0);
        }
    else if (accion === 'ordago') {
        apuestaVista += (subidaPendiente > 0 ? subidaPendiente : 0);
        subidaPendiente = 'ÓRDAGO';
        quienSube = 'yo';
        actualizarCajaAire();
        gameLog.innerText = `¡HAS LANZADO UN ÓRDAGO!`;
    }
}

function procesarAccionRival(accion, cantidad) {
    const nombreFase = fasesApuesta[indiceFaseActual];

    if (accion === 'pasar') {
            pasesConsecutivos++;
            if (pasesConsecutivos === 2) {
                let puntoPase = (nombreFase === 'Grande' || nombreFase === 'Chica' || (nombreFase === 'Juego' && !miEstadoJuego && !rivalEstadoJuego)) ? 1 : 0;
                gameLog.innerText = `El rival ha pasado. (Pase corrido)`;
                avanzarSiguienteFase(puntoPase);
            } else {
                gameLog.innerText = `El rival ha pasado. ¡Te toca hablar!`;
                miTurnoHablar = true;
                actualizarInterfazApuestas();
            }
        }
    else if (accion === 'nover') {
        let deje = apuestaVista > 0 ? apuestaVista : 1;
        sumarPuntos('yo', deje);
        ganadoresFase[nombreFase] = 'yo'; // ¡NUEVO! Yo gano esta fase
        gameLog.innerText = `¡El rival no ha querido ver! Te llevas ${deje} punto(s) de deje.`;
        avanzarSiguienteFase(0);}

    else if (accion === 'envidar') {
        pasesConsecutivos = 0;
        apuestaVista = 0;
        subidaPendiente = cantidad;
        quienSube = 'rival';
        actualizarCajaAire();
        gameLog.innerText = `El rival ha envidado ${cantidad}. ¿Qué haces?`;
        miTurnoHablar = true;
        actualizarInterfazApuestas();
    }
    else if (accion === 'subir') {
        pasesConsecutivos = 0;
        apuestaVista += subidaPendiente;
        subidaPendiente = cantidad;
        quienSube = 'rival';
        actualizarCajaAire();
        gameLog.innerText = `El rival te sube ${cantidad}. ¿Qué haces?`;
        miTurnoHablar = true;
        actualizarInterfazApuestas();
    }
    else if (accion === 'ver') {
        gameLog.innerText = `El rival HA VISTO. Apuesta cerrada.`;
        if (subidaPendiente === 'ÓRDAGO') {
            botes[nombreFase] = 40; // ¡NUEVO! Órdago aceptado
            faseOrdagoAceptado = nombreFase;
            finDeRondas();
            return;
        } else {
            botes[nombreFase] += (apuestaVista + subidaPendiente);
        }
        avanzarSiguienteFase(0);
    }
    else if (accion === 'ordago') {
        apuestaVista += (subidaPendiente > 0 ? subidaPendiente : 0);
        subidaPendiente = 'ÓRDAGO';
        quienSube = 'rival';
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

function sumarPuntos(quien, cantidad) {
    if (quien === 'yo') puntosMios += cantidad;
    else puntosRival += cantidad;
    document.getElementById('puntos-mios').innerText = puntosMios;
    document.getElementById('puntos-rival').innerText = puntosRival;
}


// ==========================================
// --- LÓGICA DE COMPARACIÓN Y RECUENTO ---
// ==========================================

function getValoresMus(cartas) { 
    return cartas.map(c => c.valor === 3 ? 12 : (c.valor === 2 ? 1 : c.valor)); 
}

function compararCartas(mis, sus, isGrande) {
    let mV = getValoresMus(mis).sort((a,b) => isGrande ? b-a : a-b);
    let sV = getValoresMus(sus).sort((a,b) => isGrande ? b-a : a-b);
    for(let i=0; i<4; i++) { 
        if(mV[i] > sV[i]) return isGrande ? 'yo' : 'rival'; 
        if(mV[i] < sV[i]) return isGrande ? 'rival' : 'yo'; 
    }
    return soyMano ? 'yo' : 'rival'; // En empate, gana la mano
}

function getParesInfo(cartas) {
    let counts = {};
    getValoresMus(cartas).forEach(v => counts[v] = (counts[v] || 0) + 1);
    let pares = Object.entries(counts).filter(e => e[1] >= 2).sort((a,b) => b[0] - a[0]);
    
    if(pares.length === 0) return { tipo: 0, premio: 0 };
    if(pares.length === 1 && pares[0][1] === 2) return { tipo: 1, v1: parseInt(pares[0][0]), premio: 1 }; // Par
    if(pares.length === 1 && pares[0][1] === 3) return { tipo: 2, v1: parseInt(pares[0][0]), premio: 2 }; // Trío
    if(pares.length === 1 && pares[0][1] === 4) return { tipo: 3, v1: parseInt(pares[0][0]), v2: parseInt(pares[0][0]), premio: 3 }; // Duplex 4 iguales
    return { tipo: 3, v1: Math.max(pares[0][0], pares[1][0]), v2: Math.min(pares[0][0], pares[1][0]), premio: 3 }; // Duplex 2 pares
}

function compParesInfo(mi, su) {
    if(mi.tipo > su.tipo) return 'yo'; if(mi.tipo < su.tipo) return 'rival';
    if(mi.v1 > su.v1) return 'yo'; if(mi.v1 < su.v1) return 'rival';
    if(mi.v2 && su.v2) { if(mi.v2 > su.v2) return 'yo'; if(mi.v2 < su.v2) return 'rival'; }
    return soyMano ? 'yo' : 'rival';
}

function getSumaJuego(cartas) { 
    return cartas.reduce((acc, c) => acc + (c.valor === 3 ? 10 : (c.valor >= 10 ? 10 : (c.valor === 2 ? 1 : c.valor))), 0); 
}

const jRank = {31:8, 32:7, 40:6, 37:5, 36:4, 35:3, 34:2, 33:1};
function compJuego(miS, suS) { 
    if(jRank[miS] > jRank[suS]) return 'yo'; 
    if(jRank[miS] < jRank[suS]) return 'rival'; 
    return soyMano ? 'yo' : 'rival'; 
}

function compPunto(miS, suS) { 
    if(miS > suS) return 'yo'; 
    if(miS < suS) return 'rival'; 
    return soyMano ? 'yo' : 'rival'; 
}

// LA FUNCIÓN PRINCIPAL DE RECUENTO


async function iniciarRecuento() {
    const contenedorRival = document.querySelector('#opponent-area .cards-placeholder');
    contenedorRival.innerHTML = '';
    cartasRivalTemp.forEach(c => {
        const d = document.createElement('div'); 
        d.className = 'carta'; 
        d.style.backgroundColor = '#d8dee9'; 
        d.style.color = 'black';
        d.innerText = c.texto;
        contenedorRival.appendChild(d);
    });

    gameLog.innerHTML = "<strong>¡Cartas arriba! Iniciando recuento...</strong>"; 
    await delay(2000);

    let fasesAEvaluar = faseOrdagoAceptado ? [faseOrdagoAceptado] : fasesApuesta;

    for (let fase of fasesAEvaluar) { 
        if (puntosMios >= 40 || puntosRival >= 40) break; 
        
        let ganador = ganadoresFase[fase];
        let ptsBote = botes[fase]; 
        let ptsBonus = 0; 
        let nombreLog = fase;

        if (fase === 'Grande') { 
            if (!ganador) ganador = compararCartas(misCartas, cartasRivalTemp, true); 
        }
        else if (fase === 'Chica') { 
            if (!ganador) ganador = compararCartas(misCartas, cartasRivalTemp, false); 
        }
        else if (fase === 'Pares') {
            if (!miEstadoPares && !rivalEstadoPares) continue;
            if (!ganador) {
                if (miEstadoPares && !rivalEstadoPares) ganador = 'yo';
                else if (!miEstadoPares && rivalEstadoPares) ganador = 'rival';
                else ganador = compParesInfo(getParesInfo(misCartas), getParesInfo(cartasRivalTemp));
            }
            ptsBonus = ganador === 'yo' ? getParesInfo(misCartas).premio : getParesInfo(cartasRivalTemp).premio;
        }
        else if (fase === 'Juego') {
            if (!miEstadoJuego && !rivalEstadoJuego) {
                nombreLog = 'Punto'; 
                if (!ganador) ganador = compPunto(getSumaJuego(misCartas), getSumaJuego(cartasRivalTemp)); 
                ptsBonus = 1;
            } else {
                if (!ganador) {
                    if (miEstadoJuego && !rivalEstadoJuego) ganador = 'yo';
                    else if (!miEstadoJuego && rivalEstadoJuego) ganador = 'rival';
                    else ganador = compJuego(getSumaJuego(misCartas), getSumaJuego(cartasRivalTemp));
                }
                let sumaGanador = ganador === 'yo' ? getSumaJuego(misCartas) : getSumaJuego(cartasRivalTemp);
                ptsBonus = sumaGanador === 31 ? 3 : 2;
            }
        }

        // CORRECCIÓN 2: Dejamos un solo 'let totalPuntos'
        let totalPuntos = faseOrdagoAceptado ? 40 : (ptsBote + ptsBonus);

        if (totalPuntos > 0) {
            sumarPuntos(ganador, totalPuntos);
            gameLog.innerHTML += `<br>👉 ${ganador === 'yo' ? 'Ganas' : 'El rival gana'} ${totalPuntos} pts en ${nombreLog}.`; 
            await delay(2000); 
        }
    }

    if (puntosMios >= 40 || puntosRival >= 40) {
        gameLog.innerHTML += `<br><br><strong>${puntosMios >= 40 ? "🏆 ¡HAS GANADO LA PARTIDA! 🏆" : "💀 ¡EL RIVAL HA GANADO LA PARTIDA! 💀"}</strong>`;
        return; 
    }

    if (auto_replay_round) {
        gameLog.innerHTML += "<br><br><em>Preparando siguiente mano...</em>";
        await delay(3000);
        limpiarYAvanzarRonda();
    } else {
        gameLog.innerHTML += "<br><br><em>Ronda terminada. Comprueba los puntos.</em>";
        mostrarBotones(['btn-next-round']); 
    }
}


function limpiarYAvanzarRonda() {
    document.querySelector('#opponent-area .cards-placeholder').innerHTML = '[Cartas del rival ocultas]';
    soyMano = !soyMano; 
    cartasRivalTemp = null; 
    iniciarRonda();
}

document.getElementById('btn-next-round').addEventListener('click', () => {
    mostrarBotones([]); // Ocultamos el botón
    limpiarYAvanzarRonda();
});