from flask import Flask, render_template, request
from flask_socketio import SocketIO, emit
# Importamos la clase que has guardado en mus_mecanicas.py
from mus_mecanicas import PartidaMus

app = Flask(__name__, static_folder='static', template_folder='.')
app.config['SECRET_KEY'] = 'clave_secreta_mus'
socketio = SocketIO(app, cors_allowed_origins="*")

# Variables globales para la sala de juego
jugadores = {}  # Diccionario para guardar { 'id_secreto_sid': 'Nombre del Jugador' }
partida_actual = None

show_global_log = True #we print a global log in the terminal for debugging purposes, but you can set it to False if you want a cleaner console

# --- RUTAS WEB ---
@app.route('/')
def index():
    return render_template('index.html')

# --- FUNCIONES DE COMUNICACIÓN (WEBSOCKETS) ---

@socketio.on('unirse_partida')
def handle_unirse(datos):
    global partida_actual
    
    sid_jugador = request.sid # ID secreto y único de la pestaña del navegador
    nombre = datos.get('nombre', 'Desconocido')
    
    if len(jugadores) < 2 and sid_jugador not in jugadores:
        jugadores[sid_jugador] = nombre
        print(f"👉 {nombre} se ha unido (ID: {sid_jugador})")
        
        # Avisamos a todos de que alguien ha entrado
        emit('actualizar_estado', {'mensaje': f'{nombre} se ha sentado en la mesa.'}, broadcast=True)
        
        # Si ya hay dos jugadores, ¡ARRANCAMOS!
        if len(jugadores) == 2:
            sids = list(jugadores.keys())
            # Inicializamos la mecánica pasándole los dos IDs secretos
            partida_actual = PartidaMus(sids[0], sids[1])
            partida_actual.iniciar_ronda()
            partida_actual.fase = 'espera_reparto'
            partida_actual.turno_de = partida_actual.id_postre
            # Avisamos del arranque
            emit('iniciar_partida', {'mensaje': '¡La partida comienza!'}, broadcast=True)
            # Repartimos la información
            enviar_estado_a_jugadores()
    else:
        emit('actualizar_estado', {'mensaje': 'La sala está llena o ya estás dentro.'}, room=sid_jugador)

@socketio.on('accion_juego')
def handle_accion_juego(datos):
    global partida_actual
    if not partida_actual: return
    
    sid_jugador = request.sid
    accion = datos.get('accion')
    
    # 1. Acciones por turnos (Repartir, Mus, Apuestas)
    if sid_jugador == partida_actual.turno_de:
        if accion == 'repartir':
            partida_actual.repartir_inicial()
            enviar_estado_a_jugadores()
            
        elif accion == 'mus':
            partida_actual.cantar_mus(sid_jugador, True)
            enviar_estado_a_jugadores()
            
        elif accion == 'no_mus':
            partida_actual.cantar_mus(sid_jugador, False)
            enviar_estado_a_jugadores()

        elif accion in ['pasar', 'envidar', 'subir', 'ver', 'ordago', 'nover']:
            cantidad = datos.get('cantidad', 0)
            partida_actual.accion_apuesta(sid_jugador, accion, cantidad)
            enviar_estado_a_jugadores()

    # 2. Acciones simultáneas (Descartes)
    if accion == 'descartar' and partida_actual.fase == 'descarte':
        if not partida_actual.estado[sid_jugador]['descartes_listos']:
            indices_a_tirar = datos.get('indices', [])
            partida_actual.procesar_descarte(sid_jugador, indices_a_tirar)
            enviar_estado_a_jugadores()

    # 3. Acciones de sistema (Transiciones y nueva ronda)
    if accion == 'continuar_transicion':
        partida_actual.mensaje_transicion = None
        # CORRECCIÓN: Llamamos a preparar_subfase para evaluar la siguiente fase limpiamente
        partida_actual.preparar_subfase() 
        enviar_estado_a_jugadores()
        
    elif accion == 'listo_siguiente_ronda':
        if partida_actual.estado[partida_actual.j1]['puntos'] >= 40 or partida_actual.estado[partida_actual.j2]['puntos'] >= 40:
            return 
            
        if sid_jugador not in partida_actual.jugadores_listos:
            partida_actual.jugadores_listos.append(sid_jugador)
            
        if len(partida_actual.jugadores_listos) == 2:
            partida_actual.cambiar_roles() 
            partida_actual.iniciar_ronda() 
            partida_actual.fase = 'espera_reparto'
            partida_actual.turno_de = partida_actual.id_postre
            partida_actual.jugadores_listos = []
            partida_actual.recuento_calculado = False
        enviar_estado_a_jugadores()



@socketio.on('accion_apuesta')
def handle_apuesta(datos):
    global partida_actual
    if not partida_actual:
        return
        
    sid_jugador = request.sid
    accion = datos.get('accion')
    cantidad = datos.get('cantidad', 0)
    
    print(f"Recibida acción: {jugadores[sid_jugador]} hace {accion} {cantidad}")
    
    # Aquí en el futuro llamaremos a: partida_actual.accion_apuesta(sid_jugador, accion, cantidad)
    
    # Después de procesar la acción, volvemos a enviar la mesa actualizada a ambos
    enviar_estado_a_jugadores()



# --- FUNCIÓN CLAVE: EL REPARTO CIEGO ---
def enviar_estado_a_jugadores():
    global show_global_log
    global partida_actual
    if not partida_actual: return
        
    for sid in jugadores.keys():
        estado_del_jugador = partida_actual.estado[sid]
        es_mi_turno = (sid == partida_actual.turno_de)
        soy_mano = (sid == partida_actual.id_mano)
        
        # Identificamos quién es el rival para poder cotillear sus descartes
        rival_sid = partida_actual.id_postre if sid == partida_actual.id_mano else partida_actual.id_mano
        
        # Generamos el mensaje superior según la fase exacta en la que estemos
        if partida_actual.fase == 'descarte':
            mensaje = "Fase: DESCARTE. Selecciona qué cartas quieres tirar."
        elif partida_actual.fase == 'apuestas':
            if partida_actual.indice_fase < len(partida_actual.fases_apuesta):
                n_fase = partida_actual.fases_apuesta[partida_actual.indice_fase]
                mensaje = f"Fase de {n_fase.upper()}. Turno de: {jugadores[partida_actual.turno_de]}"
            else:
                mensaje = "Fase de RECUENTO..."
        else:
            mensaje = f"Fase: {partida_actual.fase.upper()}. Turno de: {jugadores[partida_actual.turno_de]}"
        
        # Construimos el diccionario seguro para la fase de apuestas
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
                
                # Si es un achante sin puntos en el recuento, va entre paréntesis
                if paso['texto_fase'].startswith('('):
                    datos_recuento.append(f"<i>{paso['texto_fase']}</i>")
                else:
                    datos_recuento.append(f"<b>{sujeto}</b> {paso['texto_fase']}")

        if show_global_log:
            print(f"📤 Enviando estado a {jugadores[sid]}: Fase {partida_actual.fase}, Turno de {jugadores[partida_actual.turno_de]}")
            print(f"   Puntos propios: {estado_del_jugador['puntos']}")
            print(f"   Puntos rival: {partida_actual.estado[rival_sid]['puntos']}")
            print(f"   Apuestas: {info_apuestas}")
            print(f"   Recuento: {datos_recuento}")

        # Enviamos un paquete de datos completo y blindado a esta pestaña concreta
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
            'rival_puntos_finales': partida_actual.estado[rival_sid]['puntos']
        }, room=sid)





if __name__ == '__main__':
    print("🚀 Servidor de Mus iniciado en http://localhost:5001")
    socketio.run(app, host='0.0.0.0', port=5001, debug=True)