/// Connexion à Home Assistant par le compte de l'utilisateur, sans jeton à recopier.
///
/// HA suit IndieAuth : le client se présente par une URL (`client_id`) et HA renvoie le code de
/// connexion à `redirect_uri`, qui doit être sur le même hôte que le `client_id` (sinon HA va lire
/// la page du `client_id` pour y chercher une balise `<link rel="redirect_uri">`). On prend donc les
/// deux sur l'hôte de HA lui-même : `<ha>/rature/` et `<ha>/rature/auth-callback`. Aucune de ces
/// adresses n'est jamais chargée : l'écran de connexion intercepte la redirection avant.
///
/// La page de connexion de HA s'ouvre dans une WebView native dédiée (comme dans l'app officielle),
/// pas dans celle de l'interface. Le code reçu est échangé ici contre les jetons, par Dart : la page
/// de l'interface (origine https://rature.local/) ne le pourrait pas, HA refuse ces requêtes CORS.
/// Le jeton de rafraîchissement reste dans le stockage sécurisé (Keystore, Keychain) ; la page ne
/// reçoit que le jeton d'accès, valable 30 minutes, et le redemande quand il expire.
library;

import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'dart:math';

import 'package:flutter/material.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:webview_flutter/webview_flutter.dart';

const _cle = 'ha';
const _stockage = FlutterSecureStorage();

/// Erreur lisible, renvoyée telle quelle à la page.
class ErreurHA implements Exception {
  ErreurHA(this.code, this.message);
  final String code;
  final String message;
}

class ConnexionHA {
  Map<String, dynamic>? _jetons;

  /// Adresse saisie (« ha.maison.example », « 192.168.1.10:8123 ») vers l'adresse de HA qui répond.
  /// Sans schéma, on essaie https, puis http sur une adresse locale seulement : sur une adresse
  /// publique, un échec de https ne doit pas envoyer le mot de passe en clair.
  static Future<String> trouver(String saisie) async {
    var s = saisie.trim().replaceAll(RegExp(r'/+$'), '');
    if (s.isEmpty) throw ErreurHA('adresse', 'Indiquez l’adresse de Home Assistant.');
    final essais = s.contains('://') ? [s] : ['https://$s', if (_adresseLocale(s)) 'http://$s'];
    for (final url in essais) {
      try {
        final r = await _requete('GET', Uri.parse('$url/auth/providers'));
        if (r.statusCode == 200 && r.corps.contains('"providers"')) return url;
      } catch (_) {
        // essai suivant
      }
    }
    throw ErreurHA('injoignable', 'Aucun Home Assistant ne répond à cette adresse.');
  }

  /// IP privée, `localhost`, nom en `.local` ou sans point (`homeassistant:8123`).
  static bool _adresseLocale(String s) {
    final hote = s.split('/').first.split(':').first.toLowerCase();
    return !hote.contains('.') ||
        hote.endsWith('.local') ||
        RegExp(r'^(127\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.)').hasMatch(hote);
  }

  /// Ouvre la page de connexion de HA, puis garde les jetons. Rend l'adresse de HA.
  /// `titre` : celui de l'écran de connexion, dans la langue de la page.
  Future<String> connecter(BuildContext context, String saisie, {String titre = ''}) async {
    final url = await trouver(saisie);
    final clientId = '$url/rature/';
    final retour = '$url/rature/auth-callback';
    final etat = List.generate(16, (_) => Random.secure().nextInt(16).toRadixString(16)).join();
    final page = Uri.parse('$url/auth/authorize').replace(queryParameters: {
      'response_type': 'code',
      'client_id': clientId,
      'redirect_uri': retour,
      'state': etat,
    });
    if (!context.mounted) throw ErreurHA('annule', 'Connexion annulée.');
    final code = await Navigator.of(context).push<String>(MaterialPageRoute(
      builder: (_) => EcranConnexion(page: page, retour: retour, etat: etat, titre: titre),
    ));
    if (code == null) throw ErreurHA('annule', 'Connexion annulée.');
    final t = await _jeton(url, {
      'grant_type': 'authorization_code',
      'code': code,
      'client_id': clientId,
    });
    _jetons = {...t, 'url': url, 'client_id': clientId};
    await _stockage.write(key: _cle, value: jsonEncode(_jetons));
    return url;
  }

  /// Jeton d'accès valable (rafraîchi s'il expire dans moins d'une minute).
  Future<Map<String, dynamic>> acces() async {
    _jetons ??= await _lire();
    final j = _jetons;
    if (j == null) throw ErreurHA('deconnecte', 'Pas de connexion à Home Assistant.');
    if (DateTime.now().millisecondsSinceEpoch > (j['expires'] as int) - 60000) {
      final t = await _jeton(j['url'] as String, {
        'grant_type': 'refresh_token',
        'refresh_token': j['refresh_token'] as String,
        'client_id': j['client_id'] as String,
      });
      _jetons = {...j, ...t};
      await _stockage.write(key: _cle, value: jsonEncode(_jetons));
    }
    return {'url': _jetons!['url'], 'access_token': _jetons!['access_token'], 'expires': _jetons!['expires']};
  }

  /// Crée une liste locale (`local_todo`) par l'assistant de configuration de HA (API REST, que la
  /// page ne peut pas appeler elle-même : HA refuse les requêtes venant de son origine).
  /// Il faut un compte administrateur.
  Future<void> creerListe(String nom) async {
    final a = await acces();
    final base = '${a['url']}/api/config/config_entries';
    final entetes = {'Authorization': 'Bearer ${a['access_token']}'};
    Future<Map<String, dynamic>> appel(String chemin, Map<String, dynamic> corps) async {
      final r = await _requete('POST', Uri.parse('$base/$chemin'), json: corps, entetes: entetes);
      if (r.statusCode == 401 || r.statusCode == 403) {
        throw ErreurHA('admin', 'Seul un administrateur de Home Assistant peut créer une liste.');
      }
      if (r.statusCode != 200) throw ErreurHA('interne', 'Home Assistant répond ${r.statusCode}.');
      return jsonDecode(r.corps) as Map<String, dynamic>;
    }

    final f = await appel('flow', {'handler': 'local_todo', 'show_advanced_options': false});
    final fin = f['type'] == 'form' ? await appel('flow/${f['flow_id']}', {'todo_list_name': nom}) : f;
    if (fin['type'] == 'abort') {
      throw ErreurHA(fin['reason'] == 'already_configured' ? 'existe' : 'interne', '${fin['reason']}');
    }
    if (fin['type'] != 'create_entry') throw ErreurHA('interne', '${fin['type']}');
  }

  /// Révoque la connexion chez HA (au mieux) et l'oublie ici.
  Future<void> deconnecter() async {
    final j = _jetons ?? await _lire();
    _jetons = null;
    await _stockage.delete(key: _cle);
    if (j == null) return;
    try {
      await _requete('POST', Uri.parse('${j['url']}/auth/revoke'),
          formulaire: {'token': j['refresh_token'] as String});
    } catch (_) {
      // hors ligne : HA gardera un jeton inutilisé, que l'utilisateur peut supprimer dans son profil
    }
  }

  Future<Map<String, dynamic>?> _lire() async {
    try {
      final s = await _stockage.read(key: _cle);
      return s == null ? null : jsonDecode(s) as Map<String, dynamic>;
    } catch (_) {
      return null;
    }
  }

  /// `POST /auth/token`. Un refus (400) veut dire que la connexion a été révoquée côté HA.
  Future<Map<String, dynamic>> _jeton(String url, Map<String, String> formulaire) async {
    final r = await _requete('POST', Uri.parse('$url/auth/token'), formulaire: formulaire);
    if (r.statusCode == 400 || r.statusCode == 403) {
      if (formulaire['grant_type'] == 'refresh_token') {
        _jetons = null;
        await _stockage.delete(key: _cle);
      }
      throw ErreurHA('deconnecte', 'Home Assistant a refusé la connexion. Reconnectez-vous.');
    }
    if (r.statusCode != 200) throw ErreurHA('reseau', 'Home Assistant répond ${r.statusCode}.');
    final d = jsonDecode(r.corps) as Map<String, dynamic>;
    return {
      'access_token': d['access_token'],
      'expires': DateTime.now().millisecondsSinceEpoch + (d['expires_in'] as int) * 1000,
      if (d['refresh_token'] != null) 'refresh_token': d['refresh_token'],
    };
  }
}

class _Reponse {
  _Reponse(this.statusCode, this.corps);
  final int statusCode;
  final String corps;
}

Future<_Reponse> _requete(String methode, Uri uri,
    {Map<String, String>? formulaire, Map<String, dynamic>? json, Map<String, String>? entetes}) async {
  final client = HttpClient()..connectionTimeout = const Duration(seconds: 8);
  try {
    final req = await client.openUrl(methode, uri);
    entetes?.forEach(req.headers.set);
    if (json != null) {
      req.headers.contentType = ContentType.json;
      req.write(jsonEncode(json));
    } else if (formulaire != null) {
      req.headers.contentType = ContentType('application', 'x-www-form-urlencoded', charset: 'utf-8');
      req.write(Uri(queryParameters: formulaire).query);
    }
    final rep = await req.close().timeout(const Duration(seconds: 15));
    return _Reponse(rep.statusCode, await rep.transform(utf8.decoder).join());
  } on SocketException catch (e) {
    throw ErreurHA('reseau', 'Home Assistant injoignable (${e.message}).');
  } on TimeoutException {
    throw ErreurHA('reseau', 'Home Assistant ne répond pas.');
  } finally {
    client.close();
  }
}

/// La page de connexion de HA, plein écran. Rend le code reçu, ou null si l'utilisateur revient en
/// arrière.
class EcranConnexion extends StatefulWidget {
  const EcranConnexion({super.key, required this.page, required this.retour, required this.etat, this.titre = ''});

  final Uri page;
  final String retour;
  final String etat;
  final String titre;

  @override
  State<EcranConnexion> createState() => _EcranConnexionState();
}

class _EcranConnexionState extends State<EcranConnexion> {
  late final WebViewController _web;
  var _charge = false;

  @override
  void initState() {
    super.initState();
    _web = WebViewController()
      ..setJavaScriptMode(JavaScriptMode.unrestricted)
      ..setNavigationDelegate(NavigationDelegate(
        onPageFinished: (_) {
          if (mounted) setState(() => _charge = true);
        },
        onNavigationRequest: (r) {
          if (!r.url.startsWith(widget.retour)) return NavigationDecision.navigate;
          final q = Uri.parse(r.url).queryParameters;
          Navigator.of(context).pop(q['state'] == widget.etat ? q['code'] : null);
          return NavigationDecision.prevent;
        },
      ))
      ..loadRequest(widget.page);
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: Text(widget.titre.isEmpty ? 'Home Assistant' : widget.titre)),
      body: Stack(children: [
        WebViewWidget(controller: _web),
        if (!_charge) const Center(child: CircularProgressIndicator()),
      ]),
    );
  }
}
