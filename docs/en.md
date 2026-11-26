# ECHONET Lite

Control your **ECHONET Lite** devices from Gladys: air conditioners, EcoCute
and other water heaters, lights, blinds and shutters, electric locks, smart
electricity meters, solar inverters, storage batteries and sensors.

ECHONET Lite is the home network standard of the Japanese market, built into
the Wi-Fi adapters of the major brands (Mitsubishi Electric, Daikin,
Panasonic, Sharp, Fujitsu General, Toshiba…) and into HEMS gateways.
Everything happens **on your local network**: no account, no cloud.

## Before you start

- The ECHONET Lite function of each device must be enabled (often an option
  of the manufacturer's app or of the Wi-Fi adapter, sometimes called
  "HEMS" or "ECHONET Lite").
- Gladys and the devices must be on the **same local network**.
- Give each device a **fixed IP address** in your router (DHCP reservation):
  Gladys stores it to reach the device.

## Configuration

1. Open the **Configuration** tab of the integration.
2. Leave **Automatic discovery** enabled: Gladys broadcasts an ECHONET Lite
   search request on the network.
3. If a device does not show up, type its address in **Device IP addresses**
   (several addresses separated by commas). The **Test an IP address**
   button tells you right away whether an address answers, and what it hosts.
4. Still nothing? Fill in **Subnet to scan** (e.g. `192.168.1.0/24`): every
   address of the subnet is queried one by one.
5. Click **Search for devices**, then open the **Discovery** tab and add the
   devices you want.

The **Refresh interval** sets how often the devices are read (one minute
minimum). Motion sensors are read every 10 seconds. Raise the **Answer
timeout** if your Wi-Fi adapters are slow to answer.

## Supported devices

| Device (class)                                 | In Gladys                                                                           |
| ---------------------------------------------- | ----------------------------------------------------------------------------------- |
| Air conditioner (0x0130)                       | on/off, mode, target temperature, fan speed, room and outdoor temperature, humidity |
| Electric water heater (0x026B)                 | on/off, heating mode, hot water temperature, heating, remaining hot water           |
| Instantaneous water heater (0x0272)            | on/off, hot water temperature, heating                                              |
| Lights (0x0290, 0x0291)                        | on/off, brightness                                                                  |
| Blinds and shutters (0x0260, 0x0263)           | open / close / stop, position                                                       |
| Electric lock (0x026F)                         | lock / unlock                                                                       |
| Floor heater (0x027B)                          | on/off, target temperature                                                          |
| Smart electricity meter (0x0288)               | grid power, imported and exported energy                                            |
| Distribution board meter (0x0287)              | power, energy index                                                                 |
| Solar power generation (0x0279)                | production power, production index                                                  |
| Storage battery (0x027D)                       | battery level, charge and discharge power                                           |
| Temperature, humidity, presence sensors        | measured value, motion                                                              |
| Switches, fans, air cleaners and other devices | on/off                                                                              |

Only the functions a device really offers are created: the integration
reads its property maps. A setting the device does not accept from the
network is shown read-only.

## Scenes

The integration adds its own cards to the scene editor, under the
**Integrations** category.

Triggers:

- **ECHONET motion detected** — a presence sensor detected someone.
- **ECHONET device fault** — a device reports a fault.
- **ECHONET device offline** — a device that answered stopped answering;
  `{{triggerEvent.data.ip_address}}` gives its address.

Actions:

- **Set an ECHONET air conditioner** — power, mode, temperature and fan speed
  in one step; the empty fields are left unchanged. Returns whether the
  command was applied.
- **Refresh an ECHONET device** — reads the device right away.
- **Read / Write an ECHONET property** (advanced) — any property code (EPC)
  in hexadecimal, e.g. write `80` = `30` to turn a device on, `31` to turn it
  off.

## Dashboard

- **ECHONET Lite devices** — whether each device answers (green), does not
  (red) or reports a fault (orange), with a **Search devices** button.
- **ECHONET air conditioner** — pick an air conditioner: room and target
  temperature, humidity, On / Off buttons, and buttons to set the
  temperature and the mode.
- **ECHONET energy** — live grid power, solar production and storage battery.

## Troubleshooting

- **No device found**: the automatic discovery needs a recent Gladys, and
  some adapters do not answer a broadcast. List the IP addresses, or the
  subnet, in the configuration.
- **A device turns "unreachable"**: check that its IP address did not change,
  and that it still answers with the **Test an IP address** button.
- **A command fails** with "The device refused the command": the device does
  not accept this setting from the network, or not in its current state
  (e.g. a temperature while it is in fan mode).
- The integration logs everything it does: check its logs from the Gladys UI.
