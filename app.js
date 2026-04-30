let peer;
let conn;
let isHost = false;

const setupScreen = document.getElementById('setup-screen');
const gameScreen = document.getElementById('game-screen');
const statusMsg = document.getElementById('status-msg');
const myIdDisplay = document.getElementById('my-id');
const btnDeal = document.getElementById('btn-deal');
const gameLog = document.getElementById('game-log');

// Inicializar PeerJS al crear partida
document.getElementById('btn-create').addEventListener('click', () => {
    isHost = true;
    // Creamos un ID aleatorio fácil de leer
    const randomId = 'MUS-' + Math.floor(Math.random() * 10000);
    peer = new Peer(randomId);

// Escuchar errores generales de PeerJS
peer.on('error', (err) => {
    if (err.type === 'peer-unavailable') {
        statusMsg.innerText = "❌ Error: No se ha encontrado ninguna partida con ese código.";
    } else {
        statusMsg.innerText = "❌ Error de conexión: " + err.type;
    }
});

    peer.on('connection', (connection) => {
        conn = connection;
        setupConnection();
    });
});

// Inicializar PeerJS al unirse a partida
document.getElementById('btn-join').addEventListener('click', () => {
    isHost = false;
    const hostId = document.getElementById('join-id').value.trim().toUpperCase();
    if (!hostId) return alert("Introduce un código válido");
    
    peer = new Peer(); // El invitado no necesita ID específico
    peer.on('open', () => {
        statusMsg.innerText = "Conectando con " + hostId + "...";
        conn = peer.connect(hostId);
        setupConnection();
    });
});

// Configurar qué pasa cuando se envían mensajes
function setupConnection() {
    conn.on('open', () => {
        // Ocultar menú, mostrar mesa
        setupScreen.classList.add('hidden');
        gameScreen.classList.remove('hidden');
        
        if(isHost) {
            btnDeal.classList.remove('hidden');
            gameLog.innerText = "¡Conectado! Tú eres la mano, reparte cuando quieras.";
        } else {
            gameLog.innerText = "¡Conectado! Esperando a que el Host reparta...";
        }
    });

    conn.on('data', (data) => {
        // Aquí recibiremos las jugadas del rival
        if(data.type === 'chat') {
            gameLog.innerText = "Rival dice: " + data.message;
        }
        if(data.type === 'deal') {
            gameLog.innerText = "¡Se han repartido las cartas!";
            document.getElementById('my-cards').innerText = "Tus cartas: " + data.cards.join(", ");
        }
    });
}

// Botón de repartir (Solo para probar la conexión)
btnDeal.addEventListener('click', () => {
    // Esto es un ejemplo temporal. En el futuro crearemos la baraja real.
    const misCartas = ["Rey de Oros", "Caballo de Copas", "3 de Bastos", "As de Espadas"];
    const susCartas = ["Rey de Copas", "Sota de Oros", "4 de Bastos", "7 de Espadas"]; // Falso por ahora
    
    document.getElementById('my-cards').innerText = "Tus cartas: " + misCartas.join(", ");
    gameLog.innerText = "Has repartido las cartas.";
    
    conn.send({
        type: 'deal',
        cards: susCartas
    });
});