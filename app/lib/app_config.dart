/// Paramètres de l'application emballée par cette coquille.
library;

import 'package:flutter/painting.dart';

/// Identifiant Android et iOS (le même qu'`applicationId` dans android/app/build.gradle.kts).
/// Définitif dès la création de l'app dans la Play Console : ne jamais le changer.
const appPaquet = 'com.danonekid.rature';

/// Nom affiché (titre de tâche Android).
const appNom = 'Rature';

/// L'interface web : le fichier HTML unique produit par `npm run app` à la racine du dépôt.
const appFichier = 'assets/app.html';

/// Origine fictive donnée à la page : localStorage est rattaché à cette origine. Ne jamais la
/// changer après publication (le stockage est aussi copié dans les préférences natives).
const appOrigine = 'https://rature.local/';

/// Objet global que la page expose pour la pause, la reprise et le retour
/// (`window.ratureApp.pause()`, `.resume()`, `.back()`), voir web/src/core/coquille.js.
const appObjet = 'ratureApp';

/// Couleur de fond (avant le premier dessin, et derrière la WebView) : le papier du Carnet.
const appFond = Color(0xFFF7F1E3);
