// -----------------------------------------------------------------------------
// User-facing messages, in the four languages of the integration: English
// (mandatory fallback), French, German and Spanish. Gladys picks the user's
// language from these multi-language objects.
// -----------------------------------------------------------------------------

export const LANGUAGES = ['en', 'fr', 'de', 'es'];

const plural = (count, one, many) => (count === 1 ? one : many);

export const MESSAGES = {
  discoveryResult: (devices, nodes) => ({
    en: `${devices} ${plural(devices, 'device', 'devices')} found on ${nodes} ECHONET Lite ${plural(nodes, 'node', 'nodes')}. Open the Discovery tab to add them.`,
    fr: `${devices} ${plural(devices, 'appareil trouvé', 'appareils trouvés')} sur ${nodes} ${plural(nodes, 'nœud', 'nœuds')} ECHONET Lite. Ouvrez l'onglet Découverte pour les ajouter.`,
    de: `${devices} ${plural(devices, 'Gerät', 'Geräte')} auf ${nodes} ECHONET-Lite-${plural(nodes, 'Knoten', 'Knoten')} gefunden. Öffnen Sie den Reiter Erkennung, um sie hinzuzufügen.`,
    es: `${devices} ${plural(devices, 'dispositivo encontrado', 'dispositivos encontrados')} en ${nodes} ${plural(nodes, 'nodo', 'nodos')} ECHONET Lite. Abra la pestaña Descubrimiento para añadirlos.`,
  }),
  discoveryEmpty: {
    en: 'No ECHONET Lite device answered. Check that the devices are on the same network, or list their IP addresses in the configuration.',
    fr: "Aucun appareil ECHONET Lite n'a répondu. Vérifiez qu'ils sont sur le même réseau, ou indiquez leurs adresses IP dans la configuration.",
    de: 'Kein ECHONET-Lite-Gerät hat geantwortet. Prüfen Sie, ob die Geräte im selben Netzwerk sind, oder tragen Sie ihre IP-Adressen in der Konfiguration ein.',
    es: 'Ningún dispositivo ECHONET Lite respondió. Compruebe que están en la misma red o indique sus direcciones IP en la configuración.',
  },
  hostInvalid: {
    en: 'Enter a valid IPv4 address, e.g. 192.168.1.20.',
    fr: 'Saisissez une adresse IPv4 valide, ex. 192.168.1.20.',
    de: 'Geben Sie eine gültige IPv4-Adresse ein, z. B. 192.168.1.20.',
    es: 'Introduzca una dirección IPv4 válida, p. ej. 192.168.1.20.',
  },
  hostNoAnswer: (ip) => ({
    en: `No ECHONET Lite answer from ${ip}.`,
    fr: `Aucune réponse ECHONET Lite de ${ip}.`,
    de: `Keine ECHONET-Lite-Antwort von ${ip}.`,
    es: `Sin respuesta ECHONET Lite de ${ip}.`,
  }),
  hostAnswer: (ip, names) => ({
    en: `${ip} answered: ${names.map((n) => n.en).join(', ')}.`,
    fr: `${ip} a répondu : ${names.map((n) => n.fr).join(', ')}.`,
    de: `${ip} hat geantwortet: ${names.map((n) => n.de).join(', ')}.`,
    es: `${ip} respondió: ${names.map((n) => n.es).join(', ')}.`,
  }),
  initFailed: {
    en: 'Initialization failed, check the integration logs.',
    fr: "L'initialisation a échoué, consultez les logs de l'intégration.",
    de: 'Die Initialisierung ist fehlgeschlagen, prüfen Sie die Protokolle der Integration.',
    es: 'La inicialización falló, consulte los registros de la integración.',
  },
  commandSent: {
    en: 'Command sent.',
    fr: 'Commande envoyée.',
    de: 'Befehl gesendet.',
    es: 'Orden enviada.',
  },
  commandRejected: {
    en: 'The device refused the command.',
    fr: "L'appareil a refusé la commande.",
    de: 'Das Gerät hat den Befehl abgelehnt.',
    es: 'El dispositivo rechazó la orden.',
  },
  // Widget labels.
  online: { en: 'Online', fr: 'En ligne', de: 'Online', es: 'En línea' },
  unreachable: { en: 'Unreachable', fr: 'Injoignable', de: 'Nicht erreichbar', es: 'Inaccesible' },
  fault: { en: 'Fault', fr: 'En défaut', de: 'Störung', es: 'Avería' },
  waiting: { en: 'Waiting', fr: 'En attente', de: 'Wartend', es: 'En espera' },
  noDevice: {
    en: 'No ECHONET Lite device added yet: search for devices, then add them from the Discovery tab.',
    fr: "Aucun appareil ECHONET Lite ajouté : lancez une recherche, puis ajoutez-les depuis l'onglet Découverte.",
    de: 'Noch kein ECHONET-Lite-Gerät hinzugefügt: Starten Sie eine Suche und fügen Sie sie im Reiter Erkennung hinzu.',
    es: 'Aún no hay dispositivos ECHONET Lite: busque dispositivos y añádalos desde la pestaña Descubrimiento.',
  },
  noEnergyDevice: {
    en: 'No ECHONET Lite smart meter, solar inverter or storage battery added yet.',
    fr: 'Aucun compteur communicant, onduleur solaire ou batterie ECHONET Lite ajouté.',
    de: 'Noch kein ECHONET-Lite-Stromzähler, Solarwechselrichter oder Batteriespeicher hinzugefügt.',
    es: 'Aún no hay contador inteligente, inversor solar ni batería ECHONET Lite.',
  },
  notAirConditioner: {
    en: 'Pick an ECHONET Lite air conditioner in the widget settings.',
    fr: 'Choisissez un climatiseur ECHONET Lite dans les réglages du widget.',
    de: 'Wählen Sie in den Widget-Einstellungen eine ECHONET-Lite-Klimaanlage.',
    es: 'Elija un aire acondicionado ECHONET Lite en los ajustes del widget.',
  },
  searchDevices: {
    en: 'Search devices',
    fr: 'Rechercher',
    de: 'Geräte suchen',
    es: 'Buscar',
  },
  turnOn: { en: 'Turn on', fr: 'Allumer', de: 'Einschalten', es: 'Encender' },
  turnOff: { en: 'Turn off', fr: 'Éteindre', de: 'Ausschalten', es: 'Apagar' },
  setTemperature: {
    en: 'Temperature',
    fr: 'Température',
    de: 'Temperatur',
    es: 'Temperatura',
  },
  setMode: { en: 'Mode', fr: 'Mode', de: 'Modus', es: 'Modo' },
  roomTemperature: { en: 'Room', fr: 'Pièce', de: 'Raum', es: 'Estancia' },
  targetTemperature: { en: 'Target', fr: 'Consigne', de: 'Sollwert', es: 'Consigna' },
  humidity: { en: 'Humidity', fr: 'Humidité', de: 'Feuchte', es: 'Humedad' },
  gridPower: { en: 'Grid', fr: 'Réseau', de: 'Netz', es: 'Red' },
  solarPower: { en: 'Solar', fr: 'Solaire', de: 'Solar', es: 'Solar' },
  batteryLevel: { en: 'Battery', fr: 'Batterie', de: 'Batterie', es: 'Batería' },
  charge: { en: 'Charging', fr: 'Charge', de: 'Laden', es: 'Carga' },
  discharge: { en: 'Discharging', fr: 'Décharge', de: 'Entladen', es: 'Descarga' },
  homePower: { en: 'Home', fr: 'Maison', de: 'Haus', es: 'Casa' },
};

// Labels of the air conditioner modes and fan speeds (scene action and widget
// form options), keyed by their option value.
export const AC_MODE_LABELS = {
  auto: { en: 'Auto', fr: 'Auto', de: 'Automatik', es: 'Automático' },
  cool: { en: 'Cooling', fr: 'Froid', de: 'Kühlen', es: 'Frío' },
  heat: { en: 'Heating', fr: 'Chauffage', de: 'Heizen', es: 'Calor' },
  dry: { en: 'Dry', fr: 'Déshumidification', de: 'Entfeuchten', es: 'Deshumidificar' },
  fan: { en: 'Fan', fr: 'Ventilation', de: 'Lüften', es: 'Ventilación' },
};
