# ECHONET Lite

Pilotez vos appareils **ECHONET Lite** depuis Gladys : climatiseurs,
chauffe-eau EcoCute et autres, éclairages, stores et volets, serrures
électriques, compteurs électriques communicants, onduleurs solaires,
batteries de stockage et capteurs.

ECHONET Lite est le standard de réseau domestique du marché japonais,
intégré aux adaptateurs Wi-Fi des grandes marques (Mitsubishi Electric,
Daikin, Panasonic, Sharp, Fujitsu General, Toshiba…) et aux passerelles HEMS.
Tout se passe **sur votre réseau local** : pas de compte, pas de cloud.

## Avant de commencer

- La fonction ECHONET Lite de chaque appareil doit être activée (souvent une
  option de l'application du fabricant ou de l'adaptateur Wi-Fi, parfois
  appelée « HEMS » ou « ECHONET Lite »).
- Gladys et les appareils doivent être sur le **même réseau local**.
- Donnez à chaque appareil une **adresse IP fixe** dans votre box (bail DHCP
  réservé) : Gladys la mémorise pour joindre l'appareil.

## Configuration

1. Ouvrez l'onglet **Configuration** de l'intégration.
2. Laissez la **Découverte automatique** activée : Gladys diffuse une
   requête de recherche ECHONET Lite sur le réseau.
3. Si un appareil n'apparaît pas, saisissez son adresse dans **Adresses IP
   des appareils** (plusieurs adresses séparées par des virgules). Le bouton
   **Tester une adresse IP** indique tout de suite si une adresse répond, et
   ce qu'elle héberge.
4. Toujours rien ? Renseignez le **Sous-réseau à analyser** (ex.
   `192.168.1.0/24`) : chaque adresse du sous-réseau est interrogée.
5. Cliquez sur **Rechercher les appareils**, puis ouvrez l'onglet
   **Découverte** et ajoutez les appareils souhaités.

L'**Intervalle de rafraîchissement** fixe la fréquence de lecture des
appareils (une minute minimum). Les détecteurs de présence sont lus toutes
les 10 secondes. Augmentez le **Délai de réponse** si vos adaptateurs Wi-Fi
sont lents à répondre.

## Appareils pris en charge

| Appareil (classe)                                    | Dans Gladys                                                                                |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| Climatiseur (0x0130)                                 | marche/arrêt, mode, consigne, ventilation, températures intérieure et extérieure, humidité |
| Chauffe-eau électrique (0x026B)                      | marche/arrêt, mode de chauffe, température de l'eau, chauffe en cours, eau chaude restante |
| Chauffe-eau instantané (0x0272)                      | marche/arrêt, température de l'eau, chauffe en cours                                       |
| Éclairages (0x0290, 0x0291)                          | marche/arrêt, luminosité                                                                   |
| Stores et volets (0x0260, 0x0263)                    | ouvrir / fermer / stop, position                                                           |
| Serrure électrique (0x026F)                          | verrouiller / déverrouiller                                                                |
| Plancher chauffant (0x027B)                          | marche/arrêt, consigne                                                                     |
| Compteur communicant (0x0288)                        | puissance réseau, énergie importée et exportée                                             |
| Compteur du tableau (0x0287)                         | puissance, index d'énergie                                                                 |
| Production solaire (0x0279)                          | puissance produite, index de production                                                    |
| Batterie de stockage (0x027D)                        | niveau, puissance de charge et de décharge                                                 |
| Capteurs de température, d'humidité, de présence     | valeur mesurée, présence                                                                   |
| Interrupteurs, ventilateurs, purificateurs et autres | marche/arrêt                                                                               |

Seules les fonctions réellement offertes par l'appareil sont créées :
l'intégration lit ses tables de propriétés. Un réglage que l'appareil
n'accepte pas depuis le réseau apparaît en lecture seule.

## Scènes

L'intégration ajoute ses propres cartes à l'éditeur de scènes, dans la
catégorie **Intégrations**.

Déclencheurs :

- **Présence ECHONET détectée** — un détecteur de présence a vu quelqu'un.
- **Panne d'un appareil ECHONET** — un appareil signale une panne.
- **Appareil ECHONET injoignable** — un appareil qui répondait ne répond
  plus ; `{{triggerEvent.data.ip_address}}` donne son adresse.

Actions :

- **Régler un climatiseur ECHONET** — marche, mode, température et
  ventilation en une étape ; les champs vides ne changent pas. Indique si la
  commande a été appliquée.
- **Rafraîchir un appareil ECHONET** — lit l'appareil immédiatement.
- **Lire / Écrire une propriété ECHONET** (avancé) — n'importe quel code de
  propriété (EPC) en hexadécimal, ex. écrire `80` = `30` pour allumer un
  appareil, `31` pour l'éteindre.

## Tableau de bord

- **Appareils ECHONET Lite** — indique si chaque appareil répond (vert), ne
  répond pas (rouge) ou signale une panne (orange), avec un bouton
  **Rechercher**.
- **Climatiseur ECHONET** — choisissez un climatiseur : température de la
  pièce et consigne, humidité, boutons Allumer / Éteindre, et boutons pour
  régler la température et le mode.
- **Énergie ECHONET** — puissance réseau, production solaire et batterie en
  direct.

## Dépannage

- **Aucun appareil trouvé** : la découverte automatique nécessite un Gladys
  récent, et certains adaptateurs ne répondent pas à une diffusion. Indiquez
  les adresses IP, ou le sous-réseau, dans la configuration.
- **Un appareil devient « injoignable »** : vérifiez que son adresse IP n'a
  pas changé, et qu'il répond toujours avec le bouton **Tester une adresse
  IP**.
- **Une commande échoue** avec « L'appareil a refusé la commande » :
  l'appareil n'accepte pas ce réglage depuis le réseau, ou pas dans son état
  actuel (ex. une température en mode ventilation).
- L'intégration journalise tout ce qu'elle fait : consultez ses logs depuis
  l'interface de Gladys.
