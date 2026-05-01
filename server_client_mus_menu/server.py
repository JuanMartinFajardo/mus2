from flask import Flask, render_template, request
from flask_socketio import SocketIO, emit, join_room, leave_room
import random
import string
from mus_mecanicas import PartidaMus

app = Flask(__name__, static_folder='static', template_folder='.')
app.config['SECRET_KEY'] = 'clave_secreta_mus'
socketio = SocketIO(app, cors_allowed_origins="*")

# --- NUEVA ARQUITECTURA MULTIJUGADOR ---
# jugadores = { 'sid': {'nombre': 'Juan', 'sala': 'A1B2'} }
jugadores = {}  
# salas = { 'A1B2': {'estado': 'esperando', 'sids': [sid1, sid2], 'motor': PartidaMus} }
salas = {}      

show_global_log = True 

def generar_codigo():
    letras = string.ascii_uppercase + string.digits
    return ''.join(random.choice(letras) for _ in range(4))

@app.route('/')
def index():
    return render_template('index.html')

# --- 1. GESTIÓN DE SALAS ---

@socketio.on('crear_sala')
def handle_crear_sala(datos):
    sid = request.sid
    nombre = datos.get('nombre', 'Jugador 1')
    
    codigo = generar_codigo()
    while codigo in salas:
        codigo = generar_codigo()
        
    jugadores[sid] = {'nombre': nombre, 'sala': codigo}
    join_room(codigo) # Función nativa de SocketIO para aislar la comunicación
    
    salas[codigo] = {'estado': 'esperando', 'sids': [sid]}
    
    print(f"👉 {nombre} ha creado la sala {codigo}")
    emit('sala_creada', {'codigo': codigo}, room=sid)

@socketio.on('unirse_sala')
def handle_unirse_sala(datos):
    sid = request.sid
    nombre = datos.get('nombre', 'Jugador 2')
    codigo = datos.get('codigo', '').upper()
    
    if codigo in salas and salas[codigo]['estado'] == 'esperando':
        salas[codigo]['sids'].append(sid)
        salas[codigo]['estado'] = 'jugando'
        
        jugadores[sid] = {'nombre': nombre, 'sala': codigo}
        join_room(codigo)
        
        print(f"👉 {nombre} se ha unido a la sala {codigo}. ¡Arrancamos!")
        
        # Instanciamos el motor de Mus para esta sala
        j1_sid = salas[codigo]['sids'][0]
        j2_sid = sid
        partida = PartidaMus(j1_sid, j2_sid)
        partida.iniciar_ronda()
        salas[codigo]['motor'] = partida
        
        # Avisamos a los que están en la sala para que cambien de pantalla
        emit('iniciar_partida', {'mensaje': '¡La partida comienza!'}, room=codigo)
        enviar_estado_a_jugadores(codigo)
    else:
        emit('error_sala', {'mensaje': 'El código no existe o la sala está llena.'}, room=sid)

# --- 2. ACCIONES DE JUEGO AISLADAS ---

@socketio.on('accion_juego')
def handle_accion_juego(datos):
    sid_jugador = request.sid
    if sid_jugador not in jugadores: return
    
    codigo = jugadores[sid_jugador]['sala']
    if codigo not in salas or salas[codigo]['estado'] != 'jugando': return
    
    # Extraemos el motor específico de la sala donde está este jugador
    partida_actual = salas[codigo]['motor']
    accion = datos.get('accion')
    
    if sid_jugador == partida_actual.turno_de:
        if accion == 'repartir':
            partida_actual.repartir_inicial()
            enviar_estado_a_jugadores(codigo)
        elif accion == 'mus':
            partida_actual.cantar_mus(sid_jugador, True)
            enviar_estado_a_jugadores(codigo)
        elif accion == 'no_mus':
            partida_actual.cantar_mus(sid_jugador, False)
            enviar_estado_a_jugadores(codigo)
        elif accion in ['pasar', 'envidar', 'subir', 'ver', 'ordago', 'nover']:
            cantidad = datos.get('cantidad', 0)
            partida_actual.accion_apuesta(sid_jugador, accion, cantidad)
            enviar_estado_a_jugadores(codigo)

    if accion == 'descartar' and partida_actual.fase == 'descarte':
        if not partida_actual.estado[sid_jugador]['descartes_listos']:
            indices_a_tirar = datos.get('indices', [])
            partida_actual.procesar_descarte(sid_jugador, indices_a_tirar)
            enviar_estado_a_jugadores(codigo)

    if accion == 'continuar_transicion':
        partida_actual.mensaje_transicion = None
        partida_actual.preparar_subfase() 
        enviar_estado_a_jugadores(codigo)
        
    elif accion == 'listo_siguiente_ronda':
        if getattr(partida_actual, 'match_finalizado', False):
            return 
            
        if sid_jugador not in partida_actual.jugadores_listos:
            partida_actual.jugadores_listos.append(sid_jugador)
            
        if len(partida_actual.jugadores_listos) == 2:
            if partida_actual.estado[partida_actual.j1]['puntos'] >= 40 or partida_actual.estado[partida_actual.j2]['puntos'] >= 40:
                partida_actual.reiniciar_partida() 
            else:
                partida_actual.cambiar_roles() 
                partida_actual.iniciar_ronda() 
                partida_actual.fase = 'espera_reparto'
                partida_actual.turno_de = partida_actual.id_postre
            
            partida_actual.jugadores_listos = []
            partida_actual.recuento_calculado = False
            enviar_estado_a_jugadores(codigo)

# --- 3. REPARTO CIEGO POR SALA ---

def enviar_estado_a_jugadores(codigo_sala):
    global show_global_log
    sala = salas.get(codigo_sala)
    if not sala: return
    partida_actual = sala['motor']
        
    for sid in sala['sids']:
        estado_del_jugador = partida_actual.estado[sid]
        es_mi_turno = (sid == partida_actual.turno_de)
        soy_mano = (sid == partida_actual.id_mano)
        rival_sid = partida_actual.id_postre if sid == partida_actual.id_mano else partida_actual.id_mano
        
        if partida_actual.fase == 'descarte':
            mensaje = "Fase: DESCARTE. Selecciona qué cartas quieres tirar."
        elif partida_actual.fase == 'apuestas':
            if partida_actual.indice_fase < len(partida_actual.fases_apuesta):
                n_fase = partida_actual.fases_apuesta[partida_actual.indice_fase]
                nombre_turno = jugadores[partida_actual.turno_de]['nombre']
                mensaje = f"Fase de {n_fase.upper()}. Turno de: {nombre_turno}"
            else:
                mensaje = "Fase de RECUENTO..."
        else:
            nombre_turno = jugadores[partida_actual.turno_de]['nombre'] if partida_actual.turno_de else "..."
            mensaje = f"Fase: {partida_actual.fase.upper()}. Turno de: {nombre_turno}"
        
        info_apuestas = {
            'fase_actual': '',
            'subida': partida_actual.subida_pendiente,
            'botes': partida_actual.botes,
            'apuesta_vista': partida_actual.apuesta_vista,
            'soy_quien_sube': (partida_actual.quien_sube == sid)
        }
        if partida_actual.fase == 'apuestas' and partida_actual.indice_fase < len(partida_actual.fases_apuesta):
            info_apuestas['fase_actual'] = partida_actual.fases_apuesta[partida_actual.indice_fase]
        
        datos_recuento = None
        cartas_rival = partida_actual.estado[rival_sid]['cartas']

        if partida_actual.fase == 'recuento':
            pasos_crudos = partida_actual.calcular_recuento()
            datos_recuento = []
            for paso in pasos_crudos:
                gano_yo = (paso['ganador_sid'] == sid)
                sujeto = "Has" if gano_yo else "El rival ha"
                if paso['texto_fase'].startswith('('):
                    datos_recuento.append(f"<i>{paso['texto_fase']}</i>")
                else:
                    datos_recuento.append(f"<b>{sujeto}</b> {paso['texto_fase']}")

        if show_global_log:
            print(f"📤 [SALA {codigo_sala}] Estado a {jugadores[sid]['nombre']}: Fase {partida_actual.fase}")

        emit('actualizar_mesa', {
            'fase': partida_actual.fase,
            'es_mi_turno': es_mi_turno,
            'soy_mano': soy_mano,
            'descartes_listos': estado_del_jugador.get('descartes_listos', False),
            'descartes_rival': partida_actual.estado[rival_sid].get('descartes_hechos', 0),
            'apuestas': info_apuestas,
            'mensaje': mensaje,
            'mis_cartas': estado_del_jugador['cartas'],
            'mis_puntos': estado_del_jugador['puntos'],
            'puntos_rival': partida_actual.estado[rival_sid]['puntos'],
            'mensaje_transicion': partida_actual.mensaje_transicion,
            'recuento': datos_recuento,
            'cartas_rival': cartas_rival,
            'rival_puntos_finales': partida_actual.estado[rival_sid]['puntos'],
            'mis_partidas': partida_actual.partidas_ganadas[sid],
            'partidas_rival': partida_actual.partidas_ganadas[rival_sid],
            'al_mejor_de': partida_actual.al_mejor_de,
            'match_finalizado': partida_actual.match_finalizado
        }, room=sid)

if __name__ == '__main__':
    print("🚀 Servidor de Mus iniciado en http://localhost:5001")
    socketio.run(app, host='0.0.0.0', port=5001, debug=True)