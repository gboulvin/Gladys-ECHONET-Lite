# ECHONET Lite

Steuern Sie Ihre **ECHONET-Lite**-Geräte mit Gladys: Klimaanlagen,
EcoCute- und andere Warmwasserbereiter, Beleuchtung, Jalousien und
Rollläden, elektrische Schlösser, intelligente Stromzähler,
Solarwechselrichter, Batteriespeicher und Sensoren.

ECHONET Lite ist der Heimnetzstandard des japanischen Marktes, eingebaut in
die WLAN-Adapter der großen Marken (Mitsubishi Electric, Daikin, Panasonic,
Sharp, Fujitsu General, Toshiba…) und in HEMS-Gateways. Alles läuft **in
Ihrem lokalen Netzwerk**: kein Konto, keine Cloud.

## Voraussetzungen

- Die ECHONET-Lite-Funktion jedes Geräts muss aktiviert sein (oft eine
  Option in der Hersteller-App oder im WLAN-Adapter, manchmal „HEMS" oder
  „ECHONET Lite" genannt).
- Gladys und die Geräte müssen sich im **selben lokalen Netzwerk** befinden.
- Vergeben Sie jedem Gerät im Router eine **feste IP-Adresse**
  (DHCP-Reservierung): Gladys speichert sie, um das Gerät zu erreichen.

## Konfiguration

1. Öffnen Sie den Reiter **Konfiguration** der Integration.
2. Lassen Sie die **Automatische Erkennung** aktiviert: Gladys sendet eine
   ECHONET-Lite-Suchanfrage ins Netzwerk.
3. Erscheint ein Gerät nicht, tragen Sie seine Adresse unter **IP-Adressen
   der Geräte** ein (mehrere Adressen durch Kommas getrennt). Die
   Schaltfläche **IP-Adresse testen** zeigt sofort, ob eine Adresse antwortet
   und was sie enthält.
4. Immer noch nichts? Füllen Sie **Zu durchsuchendes Subnetz** aus (z. B.
   `192.168.1.0/24`): Jede Adresse des Subnetzes wird einzeln abgefragt.
5. Klicken Sie auf **Nach Geräten suchen**, öffnen Sie dann den Reiter
   **Erkennung** und fügen Sie die gewünschten Geräte hinzu.

Das **Aktualisierungsintervall** legt fest, wie oft die Geräte gelesen
werden (mindestens eine Minute). Anwesenheitssensoren werden alle 10
Sekunden gelesen. Erhöhen Sie das **Antwortzeitlimit**, wenn Ihre
WLAN-Adapter langsam antworten.

## Unterstützte Geräte

| Gerät (Klasse)                                   | In Gladys                                                                       |
| ------------------------------------------------ | ------------------------------------------------------------------------------- |
| Klimaanlage (0x0130)                             | Ein/Aus, Modus, Solltemperatur, Lüfterstufe, Raum- und Außentemperatur, Feuchte |
| Elektrischer Warmwasserbereiter (0x026B)         | Ein/Aus, Heizmodus, Warmwassertemperatur, Heizen, verbleibendes Warmwasser      |
| Durchlauferhitzer (0x0272)                       | Ein/Aus, Warmwassertemperatur, Heizen                                           |
| Beleuchtung (0x0290, 0x0291)                     | Ein/Aus, Helligkeit                                                             |
| Jalousien und Rollläden (0x0260, 0x0263)         | Öffnen / Schließen / Stopp, Position                                            |
| Elektrisches Schloss (0x026F)                    | Verriegeln / Entriegeln                                                         |
| Fußbodenheizung (0x027B)                         | Ein/Aus, Solltemperatur                                                         |
| Intelligenter Stromzähler (0x0288)               | Netzleistung, bezogene und eingespeiste Energie                                 |
| Verteilerzähler (0x0287)                         | Leistung, Energiezählerstand                                                    |
| Solarstromerzeugung (0x0279)                     | Erzeugungsleistung, Erzeugungszählerstand                                       |
| Batteriespeicher (0x027D)                        | Ladezustand, Lade- und Entladeleistung                                          |
| Temperatur-, Feuchte-, Anwesenheitssensoren      | Messwert, Bewegung                                                              |
| Schalter, Lüfter, Luftreiniger und andere Geräte | Ein/Aus                                                                         |

Es werden nur die Funktionen angelegt, die ein Gerät tatsächlich bietet: Die
Integration liest seine Eigenschaftstabellen. Eine Einstellung, die das Gerät
nicht über das Netzwerk annimmt, wird schreibgeschützt angezeigt.

## Szenen

Die Integration ergänzt den Szenen-Editor um eigene Karten in der Kategorie
**Integrationen**.

Auslöser:

- **ECHONET-Bewegung erkannt** — ein Anwesenheitssensor hat jemanden erkannt.
- **Störung eines ECHONET-Geräts** — ein Gerät meldet eine Störung.
- **ECHONET-Gerät offline** — ein Gerät, das geantwortet hat, antwortet
  nicht mehr; `{{triggerEvent.data.ip_address}}` liefert seine Adresse.

Aktionen:

- **ECHONET-Klimaanlage einstellen** — Betrieb, Modus, Temperatur und
  Lüfterstufe in einem Schritt; leere Felder bleiben unverändert. Gibt an, ob
  der Befehl ausgeführt wurde.
- **ECHONET-Gerät aktualisieren** — liest das Gerät sofort.
- **ECHONET-Eigenschaft lesen / schreiben** (erweitert) — beliebiger
  Eigenschaftscode (EPC) in Hexadezimal, z. B. `80` = `30` schreiben, um ein
  Gerät einzuschalten, `31` zum Ausschalten.

## Dashboard

- **ECHONET-Lite-Geräte** — zeigt, ob jedes Gerät antwortet (grün), nicht
  antwortet (rot) oder eine Störung meldet (orange), mit einer Schaltfläche
  **Geräte suchen**.
- **ECHONET-Klimaanlage** — wählen Sie eine Klimaanlage: Raum- und
  Solltemperatur, Feuchte, Ein-/Aus-Schaltflächen sowie Schaltflächen für
  Temperatur und Modus.
- **ECHONET-Energie** — Netzleistung, Solarproduktion und Batteriespeicher
  live.

## Fehlerbehebung

- **Kein Gerät gefunden**: Die automatische Erkennung erfordert ein aktuelles
  Gladys, und manche Adapter antworten nicht auf einen Broadcast. Tragen Sie
  die IP-Adressen oder das Subnetz in der Konfiguration ein.
- **Ein Gerät wird „nicht erreichbar"**: Prüfen Sie, ob sich seine
  IP-Adresse geändert hat und ob es mit **IP-Adresse testen** noch antwortet.
- **Ein Befehl schlägt fehl** mit „Das Gerät hat den Befehl abgelehnt": Das
  Gerät nimmt diese Einstellung nicht über das Netzwerk an, oder nicht in
  seinem aktuellen Zustand (z. B. eine Temperatur im Lüftermodus).
- Die Integration protokolliert alles, was sie tut: Prüfen Sie ihre
  Protokolle in der Gladys-Oberfläche.
