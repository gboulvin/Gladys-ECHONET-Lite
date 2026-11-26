# ECHONET Lite

Controle sus dispositivos **ECHONET Lite** desde Gladys: aires
acondicionados, calentadores EcoCute y otros, iluminación, persianas,
cerraduras eléctricas, contadores eléctricos inteligentes, inversores
solares, baterías de almacenamiento y sensores.

ECHONET Lite es el estándar de red doméstica del mercado japonés, integrado
en los adaptadores Wi-Fi de las grandes marcas (Mitsubishi Electric, Daikin,
Panasonic, Sharp, Fujitsu General, Toshiba…) y en las pasarelas HEMS. Todo
ocurre **en su red local**: sin cuenta ni nube.

## Antes de empezar

- La función ECHONET Lite de cada dispositivo debe estar activada (a menudo
  una opción de la aplicación del fabricante o del adaptador Wi-Fi, a veces
  llamada «HEMS» o «ECHONET Lite»).
- Gladys y los dispositivos deben estar en la **misma red local**.
- Asigne a cada dispositivo una **dirección IP fija** en su router (reserva
  DHCP): Gladys la guarda para comunicarse con el dispositivo.

## Configuración

1. Abra la pestaña **Configuración** de la integración.
2. Deje activado el **Descubrimiento automático**: Gladys difunde una
   petición de búsqueda ECHONET Lite en la red.
3. Si un dispositivo no aparece, escriba su dirección en **Direcciones IP de
   los dispositivos** (varias direcciones separadas por comas). El botón
   **Probar una dirección IP** indica al momento si una dirección responde y
   qué contiene.
4. ¿Sigue sin aparecer? Rellene **Subred a explorar** (p. ej.
   `192.168.1.0/24`): se consulta cada dirección de la subred.
5. Pulse **Buscar dispositivos**, abra la pestaña **Descubrimiento** y añada
   los dispositivos que desee.

El **Intervalo de actualización** fija la frecuencia de lectura de los
dispositivos (un minuto como mínimo). Los sensores de presencia se leen cada
10 segundos. Aumente el **Tiempo de espera** si sus adaptadores Wi-Fi tardan
en responder.

## Dispositivos compatibles

| Dispositivo (clase)                                | En Gladys                                                                                          |
| -------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| Aire acondicionado (0x0130)                        | encendido/apagado, modo, consigna, ventilador, temperatura interior y exterior, humedad            |
| Calentador de agua eléctrico (0x026B)              | encendido/apagado, modo de calentamiento, temperatura del agua, calentando, agua caliente restante |
| Calentador instantáneo (0x0272)                    | encendido/apagado, temperatura del agua, calentando                                                |
| Iluminación (0x0290, 0x0291)                       | encendido/apagado, brillo                                                                          |
| Persianas (0x0260, 0x0263)                         | abrir / cerrar / parar, posición                                                                   |
| Cerradura eléctrica (0x026F)                       | bloquear / desbloquear                                                                             |
| Suelo radiante (0x027B)                            | encendido/apagado, consigna                                                                        |
| Contador inteligente (0x0288)                      | potencia de red, energía importada y exportada                                                     |
| Medidor del cuadro eléctrico (0x0287)              | potencia, índice de energía                                                                        |
| Generación solar (0x0279)                          | potencia producida, índice de producción                                                           |
| Batería de almacenamiento (0x027D)                 | nivel, potencia de carga y descarga                                                                |
| Sensores de temperatura, humedad y presencia       | valor medido, presencia                                                                            |
| Interruptores, ventiladores, purificadores y otros | encendido/apagado                                                                                  |

Solo se crean las funciones que el dispositivo ofrece realmente: la
integración lee sus tablas de propiedades. Un ajuste que el dispositivo no
acepta desde la red aparece en solo lectura.

## Escenas

La integración añade sus propias tarjetas al editor de escenas, en la
categoría **Integraciones**.

Disparadores:

- **Presencia ECHONET detectada** — un sensor de presencia detectó a alguien.
- **Avería de un equipo ECHONET** — un dispositivo informa de una avería.
- **Equipo ECHONET sin conexión** — un dispositivo que respondía dejó de
  responder; `{{triggerEvent.data.ip_address}}` da su dirección.

Acciones:

- **Ajustar un aire acondicionado ECHONET** — encendido, modo, temperatura y
  ventilador en un paso; los campos vacíos no cambian. Indica si la orden se
  aplicó.
- **Actualizar un equipo ECHONET** — lee el dispositivo al momento.
- **Leer / Escribir una propiedad ECHONET** (avanzado) — cualquier código de
  propiedad (EPC) en hexadecimal, p. ej. escribir `80` = `30` para encender un
  dispositivo, `31` para apagarlo.

## Panel

- **Equipos ECHONET Lite** — indica si cada dispositivo responde (verde), no
  responde (rojo) o informa de una avería (naranja), con un botón **Buscar**.
- **Aire acondicionado ECHONET** — elija un aire acondicionado: temperatura
  ambiente y de consigna, humedad, botones Encender / Apagar y botones para
  ajustar la temperatura y el modo.
- **Energía ECHONET** — potencia de red, producción solar y batería en
  directo.

## Solución de problemas

- **No se encuentra ningún dispositivo**: el descubrimiento automático
  requiere un Gladys reciente y algunos adaptadores no responden a una
  difusión. Indique las direcciones IP, o la subred, en la configuración.
- **Un dispositivo pasa a «inaccesible»**: compruebe que su dirección IP no
  ha cambiado y que sigue respondiendo con **Probar una dirección IP**.
- **Una orden falla** con «El dispositivo rechazó la orden»: el dispositivo
  no acepta ese ajuste desde la red, o no en su estado actual (p. ej. una
  temperatura en modo ventilación).
- La integración registra todo lo que hace: consulte sus registros desde la
  interfaz de Gladys.
