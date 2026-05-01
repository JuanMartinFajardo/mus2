import random
from collections import Counter

# ==========================================
# 1. BARAJA Y CARTAS
# ==========================================




def crear_baraja():
    palos = ['Oros', 'Copas', 'Espadas', 'Bastos']
    valores = [1, 2, 3, 4, 5, 6, 7, 10, 11, 12]
    baraja = []
    
    for palo in palos:
        for valor in valores:
            nombre = str(valor)
            if valor == 1: nombre = 'As'
            elif valor == 10: nombre = 'Sota'
            elif valor == 11: nombre = 'Caballo'
            elif valor == 12: nombre = 'Rey'
            
            baraja.append({
                'valor': valor, 
                'palo': palo,
                # Generamos la ruta exacta: ej. /static/img/oros_3.png
                'img': f"/static/img/{valor}_{palo.lower()}.jpg", 
                'texto': f"{nombre} de {palo}"
            })
            print(baraja)
    return baraja

def get_valores_mus(cartas):
    # Los 3 son Reyes (12) y los 2 son Ases (1)
    return [12 if c['valor'] == 3 else (1 if c['valor'] == 2 else c['valor']) for c in cartas]

# ==========================================
# 2. EVALUACIÓN DE JUGADAS (Pares y Juego)
# ==========================================

def tiene_pares(cartas):
    valores = get_valores_mus(cartas)
    counts = Counter(valores)
    return any(count >= 2 for count in counts.values())

def get_pares_info(cartas):
    valores = get_valores_mus(cartas)
    counts = Counter(valores)
    
    # Filtramos solo los que tienen pareja o más
    pares = [[val, count] for val, count in counts.items() if count >= 2]
    
    if not pares:
        return {'tipo': 0, 'premio': 0}
        
    if len(pares) == 1:
        val, count = pares[0]
        if count == 2: return {'tipo': 1, 'v1': val, 'premio': 1} # Par
        if count == 3: return {'tipo': 2, 'v1': val, 'premio': 2} # Trío
        if count == 4: return {'tipo': 3, 'v1': val, 'v2': val, 'premio': 3} # Dúplex (4 iguales)
        
    if len(pares) == 2:
        mayor = max(pares[0][0], pares[1][0])
        menor = min(pares[0][0], pares[1][0])
        return {'tipo': 3, 'v1': mayor, 'v2': menor, 'premio': 3} # Dúplex (2 parejas)

def get_suma_juego(cartas):
    suma = 0
    for c in cartas:
        v = c['valor']
        if v == 3 or v >= 10: suma += 10
        elif v == 2 or v == 1: suma += 1
        else: suma += v
    return suma

def tiene_juego(cartas):
    return get_suma_juego(cartas) >= 31

def es_la_real(cartas):
    num_sietes = sum(1 for c in cartas if c['valor'] == 7)
    num_sotas = sum(1 for c in cartas if c['valor'] == 10)
    return num_sietes == 3 and num_sotas == 1

# ==========================================
# 3. COMPARADORES (Devuelven 'mano' o 'postre')
# ==========================================

def comparar_cartas(cartas_mano, cartas_postre, is_grande):
    v_mano = sorted(get_valores_mus(cartas_mano), reverse=is_grande)
    v_postre = sorted(get_valores_mus(cartas_postre), reverse=is_grande)
    
    for i in range(4):
        if v_mano[i] > v_postre[i]: return 'mano' if is_grande else 'postre'
        if v_mano[i] < v_postre[i]: return 'postre' if is_grande else 'mano'
        
    return 'mano' # En empate absoluto, gana la mano

def comp_pares_info(info_mano, info_postre):
    if info_mano['tipo'] != info_postre['tipo']:
        return 'mano' if info_mano['tipo'] > info_postre['tipo'] else 'postre'
    
    if info_mano['v1'] != info_postre['v1']:
        return 'mano' if info_mano['v1'] > info_postre['v1'] else 'postre'
        
    if 'v2' in info_mano and 'v2' in info_postre and info_mano['v2'] != info_postre['v2']:
        return 'mano' if info_mano['v2'] > info_postre['v2'] else 'postre'
        
    return 'mano' # Empate

J_RANK = {31: 8, 32: 7, 40: 6, 37: 5, 36: 4, 35: 3, 34: 2, 33: 1}

def comp_juego(cartas_mano, cartas_postre):
    mano_real = es_la_real(cartas_mano)
    postre_real = es_la_real(cartas_postre)
    
    if mano_real and not postre_real: return 'mano'
    if not mano_real and postre_real: return 'postre'

    s_mano = get_suma_juego(cartas_mano)
    s_postre = get_suma_juego(cartas_postre)
    
    r_mano = J_RANK.get(s_mano, 0)
    r_postre = J_RANK.get(s_postre, 0)
    
    if r_mano > r_postre: return 'mano'
    if r_mano < r_postre: return 'postre'
    return 'mano'

def comp_punto(cartas_mano, cartas_postre):
    s_mano = get_suma_juego(cartas_mano)
    s_postre = get_suma_juego(cartas_postre)
    
    if s_mano > s_postre: return 'mano'
    if s_mano < s_postre: return 'postre'
    return 'mano'


# ==========================================
# 4. EL MOTOR DE LA PARTIDA (Clase principal)
# ==========================================



# (Aquí arriba se mantienen las funciones puras que ya definimos: crear_baraja, comp_juego, etc.)

class PartidaMus:
    def __init__(self, id_jugador_1, id_jugador_2):
            self.j1 = id_jugador_1
            self.j2 = id_jugador_2
            
            sids = [self.j1, self.j2]
            import random
            random.shuffle(sids)
            self.id_mano = sids[0] 
            self.id_postre = sids[1]
            
            self.baraja = []
            self.descartes = []
            
            self.estado = {
                self.j1: {'cartas': [], 'puntos': 0, 'quiere_mus': None, 'descartes_listos': False, 'descartes_hechos': 0},
                self.j2: {'cartas': [], 'puntos': 0, 'quiere_mus': None, 'descartes_listos': False, 'descartes_hechos': 0}
            }
            
            self.fase = 'espera' 
            self.fases_apuesta = ['Grande', 'Chica', 'Pares', 'Juego']
            self.indice_fase = 0
            self.botes = {'Grande': 0, 'Chica': 0, 'Pares': 0, 'Juego': 0}
            self.ganadores_fase = {'Grande': None, 'Chica': None, 'Pares': None, 'Juego': None}
            
            self.apuesta_vista = 0
            self.subida_pendiente = 0
            self.quien_sube = None
            self.pases_consecutivos = 0
            self.turno_de = None
            self.ordago_aceptado_en = None        
            self.mensaje_transicion = None
            self.recuento_calculado = False
            self.pasos_recuento = []
            self.jugadores_listos = []

            # --- SISTEMA DE PARTIDAS ---
            self.partidas_ganadas = {self.j1: 0, self.j2: 0}
            self.al_mejor_de = 3 
            self.partida_sumada = False
            self.match_finalizado = False
        # --- 1. REPARTO Y GESTIÓN DE BARAJA ---

    def robar(self, cantidad):
        robadas = []
        for _ in range(cantidad):
            if not self.baraja:
                # Si nos quedamos sin cartas, barajamos los descartes
                self.baraja = self.descartes.copy()
                random.shuffle(self.baraja)
                self.descartes = []
            if self.baraja:
                robadas.append(self.baraja.pop(0))
        return robadas

    def iniciar_ronda(self):
        self.baraja = []#crear_baraja()
        #random.shuffle(self.baraja)
        self.descartes = []
        
        self.estado[self.j1]['cartas'] = []
        self.estado[self.j2]['cartas'] = []
      #  self.estado[self.j1]['cartas'] = self.robar(4)
       # self.estado[self.j2]['cartas'] = self.robar(4)
        
        self.fase = 'espera_reparto' #maybe comment
        self.estado[self.j1]['quiere_mus'] = None
        self.estado[self.j2]['quiere_mus'] = None
        self.turno_de = self.id_postre # o postre
        self.estado[self.j1]['descartes_hechos'] = 0
        self.estado[self.j2]['descartes_hechos'] = 0

    # --- 2. FASE DE MUS Y DESCARTES ---

    def cantar_mus(self, jugador, quiere_mus):
        """Devuelve True si ambos han hablado y hay que cambiar de fase"""
        self.estado[jugador]['quiere_mus'] = quiere_mus
        
        if not quiere_mus:
            # Si alguien corta el mus, pasamos directamente a apuestas
            self.iniciar_fase_apuestas()
            return 'apuestas'
            
        # Si la mano quiere mus, le toca hablar al postre
        if jugador == self.id_mano and quiere_mus:
            self.turno_de = self.id_postre
            return 'esperando_postre'
            
        # Si ambos quieren mus
        if self.estado[self.id_mano]['quiere_mus'] and self.estado[self.id_postre]['quiere_mus']:
            self.fase = 'descarte'
            self.estado[self.j1]['descartes_listos'] = False
            self.estado[self.j2]['descartes_listos'] = False
            return 'descarte'

    def procesar_descarte(self, jugador, indices_cartas_a_tirar):
        """Recibe una lista de índices (ej: [0, 2]) que el jugador quiere tirar"""
        cartas_jugador = self.estado[jugador]['cartas']
        
        # Extraer las cartas a tirar de mayor a menor índice para no alterar la lista al borrar
        cartas_tiradas = [cartas_jugador.pop(i) for i in sorted(indices_cartas_a_tirar, reverse=True)]
        self.descartes.extend(cartas_tiradas)
        self.estado[jugador]['descartes_hechos'] = len(indices_cartas_a_tirar)
        # Robar nuevas
        nuevas_cartas = self.robar(len(indices_cartas_a_tirar))
        self.estado[jugador]['cartas'].extend(nuevas_cartas)
        
        self.estado[jugador]['descartes_listos'] = True
        
        # Si ambos se han descartado, volvemos a preguntar si hay mus
        if self.estado[self.id_mano]['descartes_listos'] and self.estado[self.id_postre]['descartes_listos']:
            self.fase = 'mus'
            self.estado[self.j1]['quiere_mus'] = None
            self.estado[self.j2]['quiere_mus'] = None
            self.turno_de = self.id_mano
            return 'nuevo_mus'
            
        return 'esperando_rival'

    # --- 3. MOTOR DE APUESTAS ---

    def iniciar_fase_apuestas(self):
        self.fase = 'apuestas'
        self.indice_fase = 0
        self.botes = {'Grande': 0, 'Chica': 0, 'Pares': 0, 'Juego': 0}
        self.ganadores_fase = {'Grande': None, 'Chica': None, 'Pares': None, 'Juego': None}
        self.ordago_aceptado_en = None
        self.preparar_subfase()
        self.transicion_punto_mostrada = False
        self.transicion_punto_mostrada = False

    def preparar_subfase(self):
        self.mensaje_transicion = None
        if self.indice_fase >= len(self.fases_apuesta):
            self.fase = 'recuento'
            return

        nombre_fase = self.fases_apuesta[self.indice_fase]
        self.apuesta_vista = 0
        self.subida_pendiente = 0
        self.quien_sube = None
        self.pases_consecutivos = 0
        self.turno_de = self.id_mano

        if nombre_fase == 'Pares':
            m_tiene = tiene_pares(self.estado[self.id_mano]['cartas'])
            p_tiene = tiene_pares(self.estado[self.id_postre]['cartas'])
            if not m_tiene or not p_tiene:
                if not m_tiene and not p_tiene: self.mensaje_transicion = "Nadie tiene Pares."
                elif m_tiene: self.mensaje_transicion = "El Postre no tiene Pares."
                else: self.mensaje_transicion = "La Mano no tiene Pares."
                # ¡NUEVO! Avanzamos la máquina de estados internamente antes del return
                self.indice_fase += 1 
                return
                
        elif nombre_fase == 'Juego':
            m_tiene = tiene_juego(self.estado[self.id_mano]['cartas'])
            p_tiene = tiene_juego(self.estado[self.id_postre]['cartas'])
            
            # ¡NUEVO! Si nadie tiene, mostramos el aviso pero NO saltamos la fase
            if not m_tiene and not p_tiene:
                if not getattr(self, 'transicion_punto_mostrada', False):
                    self.mensaje_transicion = "Nadie tiene Juego. Se juega al Punto."
                    self.transicion_punto_mostrada = True
                    return # Hace la pausa de 3s, luego volverá a entrar aquí y pasará de largo
            
            # Si solo uno tiene, mostramos el aviso y SÍ saltamos la fase
            elif m_tiene != p_tiene:
                if m_tiene: self.mensaje_transicion = "El Postre no tiene Juego."
                else: self.mensaje_transicion = "La Mano no tiene Juego."
                self.indice_fase += 1
                return

    def avanzar_subfase(self, bote_extra):
        nombre_fase = self.fases_apuesta[self.indice_fase]
        self.botes[nombre_fase] += bote_extra
        self.indice_fase += 1
        self.preparar_subfase()

    def accion_apuesta(self, jugador, accion, cantidad=0):
        nombre_fase = self.fases_apuesta[self.indice_fase]
        rival = self.id_postre if jugador == self.id_mano else self.id_mano

        if accion == 'pasar':
            self.pases_consecutivos += 1
            if self.pases_consecutivos == 2:
                # Pase corrido. Punto de pase en Grande, Chica o Punto.
                es_punto = (nombre_fase == 'Juego' and not tiene_juego(self.estado[self.id_mano]['cartas']) and not tiene_juego(self.estado[self.id_postre]['cartas']))
                punto_pase = 1 if nombre_fase in ['Grande', 'Chica'] or es_punto else 0
                #punto_pase = 1 if nombre_fase in ['Grande', 'Chica'] else 0
                self.avanzar_subfase(punto_pase)
            else:
                self.turno_de = rival

        elif accion == 'nover':
            deje = self.apuesta_vista if self.apuesta_vista > 0 else 1
            self.estado[rival]['puntos'] += deje
            self.ganadores_fase[nombre_fase] = rival
            self.avanzar_subfase(0)

        elif accion == 'envidar' or accion == 'subir':
            self.pases_consecutivos = 0
            if accion == 'subir':
                self.apuesta_vista += self.subida_pendiente
            self.subida_pendiente = cantidad
            self.quien_sube = jugador
            self.turno_de = rival

        elif accion == 'ver':
            if self.subida_pendiente == 'ÓRDAGO':
                self.botes[nombre_fase] = 40
                self.ordago_aceptado_en = nombre_fase
                self.fase = 'recuento'
            else:
                self.botes[nombre_fase] += (self.apuesta_vista + self.subida_pendiente)
                self.avanzar_subfase(0)

        elif accion == 'ordago':
            self.pases_consecutivos = 0
            if self.subida_pendiente != 'ÓRDAGO':
                self.apuesta_vista += self.subida_pendiente
            self.subida_pendiente = 'ÓRDAGO'
            self.quien_sube = jugador
            self.turno_de = rival



    def repartir_inicial(self):
        self.baraja = crear_baraja()
        random.shuffle(self.baraja)
        self.descartes = []
        
        self.estado[self.id_mano]['cartas'] = self.robar(4)
        self.estado[self.id_postre]['cartas'] = self.robar(4)
        self.fase = 'mus'
        self.turno_de = self.id_mano #mano
        
        
    def cambiar_roles(self):
        # Intercambia quién es mano y postre
        self.id_mano, self.id_postre = self.id_postre, self.id_mano

    def reiniciar_partida(self):
        self.estado[self.j1]['puntos'] = 0
        self.estado[self.j2]['puntos'] = 0
        self.partida_sumada = False
        self.cambiar_roles()
        self.iniciar_ronda()


    def calcular_recuento(self):
        if self.recuento_calculado: return self.pasos_recuento
        
        self.recuento_calculado = True
        self.pasos_recuento = [] 
        cartas_m = self.estado[self.id_mano]['cartas']
        cartas_p = self.estado[self.id_postre]['cartas']
        fases_eval = [self.ordago_aceptado_en] if self.ordago_aceptado_en else self.fases_apuesta
        
        for fase in fases_eval:
            if self.estado[self.id_mano]['puntos'] >= 40 or self.estado[self.id_postre]['puntos'] >= 40: break
            
            ganador_sid = self.ganadores_fase.get(fase)
            bote = self.botes.get(fase, 0)
            pts_bonus = 0
            n_log = fase
            
            if self.ordago_aceptado_en:
                pts_total = 40
                if not ganador_sid:
                    ganador_rol = None
                    if fase == 'Grande': ganador_rol = comparar_cartas(cartas_m, cartas_p, True)
                    elif fase == 'Chica': ganador_rol = comparar_cartas(cartas_m, cartas_p, False)
                    elif fase == 'Pares': ganador_rol = comp_pares_info(get_pares_info(cartas_m), get_pares_info(cartas_p))
                    elif fase == 'Juego': ganador_rol = comp_juego(cartas_m, cartas_p)
                    ganador_sid = self.id_mano if ganador_rol == 'mano' else self.id_postre
            else:
                if fase == 'Grande' and not ganador_sid:
                    ganador_sid = self.id_mano if comparar_cartas(cartas_m, cartas_p, True) == 'mano' else self.id_postre
                elif fase == 'Chica' and not ganador_sid:
                    ganador_sid = self.id_mano if comparar_cartas(cartas_m, cartas_p, False) == 'mano' else self.id_postre
                elif fase == 'Pares':
                    if not tiene_pares(cartas_m) and not tiene_pares(cartas_p): continue
                    if not ganador_sid:
                        if tiene_pares(cartas_m) and not tiene_pares(cartas_p): ganador_sid = self.id_mano
                        elif not tiene_pares(cartas_m) and tiene_pares(cartas_p): ganador_sid = self.id_postre
                        else: ganador_sid = self.id_mano if comp_pares_info(get_pares_info(cartas_m), get_pares_info(cartas_p)) == 'mano' else self.id_postre
                    pts_bonus = get_pares_info(cartas_m)['premio'] if ganador_sid == self.id_mano else get_pares_info(cartas_p)['premio']
                elif fase == 'Juego':
                    if not tiene_juego(cartas_m) and not tiene_juego(cartas_p):
                        n_log = 'Punto'
                        if not ganador_sid: ganador_sid = self.id_mano if comp_punto(cartas_m, cartas_p) == 'mano' else self.id_postre
                        pts_bonus = 1
                    else:
                        if not ganador_sid:
                            if tiene_juego(cartas_m) and not tiene_juego(cartas_p): ganador_sid = self.id_mano
                            elif not tiene_juego(cartas_m) and tiene_juego(cartas_p): ganador_sid = self.id_postre
                            else: ganador_sid = self.id_mano if comp_juego(cartas_m, cartas_p) == 'mano' else self.id_postre
                        suma = get_suma_juego(cartas_m) if ganador_sid == self.id_mano else get_suma_juego(cartas_p)
                        pts_bonus = 3 if suma == 31 else 2
                
            pts_total = bote + pts_bonus
            
            if pts_total > 0:
                self.estado[ganador_sid]['puntos'] = min(40, self.estado[ganador_sid]['puntos'] + pts_total)
                
            # Construimos el texto exacto para enviarlo al navegador
            if self.ganadores_fase.get(fase) is not None and pts_total == 0:
                texto_final = f"(Alguien no quiso ver en {n_log})"
            else:
                prep = "a la" if n_log in ['Grande', 'Chica'] else "por" if n_log == 'Pares' else "por el"
                texto_final = f"ha ganado {pts_total} {prep} {n_log.lower()}"
                
            self.pasos_recuento.append({
                'ganador_sid': ganador_sid,
                'texto_fase': texto_final
            })
        
        if not getattr(self, 'partida_sumada', False):
            if self.estado[self.id_mano]['puntos'] >= 40:
                self.partidas_ganadas[self.id_mano] += 1
                self.partida_sumada = True
            elif self.estado[self.id_postre]['puntos'] >= 40:
                self.partidas_ganadas[self.id_postre] += 1
                self.partida_sumada = True
            
            # Si alguien ha ganado la partida, comprobamos si ha ganado el "Match"
            if self.partida_sumada:
                puntos_para_ganar = (self.al_mejor_de // 2) + 1
                if self.partidas_ganadas[self.id_mano] >= puntos_para_ganar or self.partidas_ganadas[self.id_postre] >= puntos_para_ganar:
                    self.match_finalizado = True

        return self.pasos_recuento
       