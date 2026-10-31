import 'dart:async';
import 'dart:convert';

import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_native_splash/flutter_native_splash.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:url_launcher/url_launcher.dart';
import 'package:webview_flutter/webview_flutter.dart';
import 'package:webview_flutter_android/webview_flutter_android.dart';

import 'app_config.dart';
import 'connexion_ha.dart';
import 'pont_socket.dart';
import 'pourboires.dart';

/// Coquille mobile : une WebView plein écran qui affiche l'interface web, fichier HTML unique embarqué.
///
///   - le stockage vit dans localStorage, que le système peut vider : chaque écriture est
///     recopiée dans les préférences natives, puis réinjectée au démarrage ;
///   - pause et reprise passent par `window.<appObjet>.pause()` et `.resume()` (la page coupe et
///     rouvre sa connexion WebSocket à Home Assistant) ;
///   - bord à bord : la WebView couvre tout l'écran, et les marges du système (encoche, barre de
///     gestes) sont données à la page par ses variables CSS --safe-top, --safe-bottom, etc. ;
///   - bouton retour d'Android : ferme d'abord un volet ouvert de la page, sinon range l'app ;
///   - connexion à Home Assistant par le compte de l'utilisateur (connexion_ha.dart) : la page
///     demande par le canal `RatureNatif` (`connecter`, `acces`, `deconnecter`), la réponse revient
///     par `window.__natif.repondre(id, erreur, valeur)` ;
///   - par le même canal : `ouvrir` (un lien, dans le navigateur du téléphone), `pourboires` et
///     `offrir` (achats intégrés, pourboires.dart).
const _prefixe = 'ls:';

void main() async {
  // L'écran de démarrage reste affiché jusqu'au chargement de la page.
  FlutterNativeSplash.preserve(widgetsBinding: WidgetsFlutterBinding.ensureInitialized());
  await SystemChrome.setPreferredOrientations([DeviceOrientation.portraitUp]);
  await SystemChrome.setEnabledSystemUIMode(SystemUiMode.edgeToEdge);
  runApp(const MaterialApp(
    title: appNom,
    debugShowCheckedModeBanner: false,
    home: EcranApp(),
  ));
}

class EcranApp extends StatefulWidget {
  const EcranApp({super.key});

  @override
  State<EcranApp> createState() => _EcranAppState();
}

class _EcranAppState extends State<EcranApp> with WidgetsBindingObserver {
  late final WebViewController _web;
  late final SharedPreferences _prefs;
  final _ha = ConnexionHA();
  late final _sockets = PontSocket((n, type, [texte]) {
    _web.runJavaScript('window.__socket && __socket(${jsonEncode(n)}, ${jsonEncode(type)}, ${jsonEncode(texte)})');
  });
  bool _pret = false;
  bool _charge = false;
  String _marges = '';

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    // Écouteur d'achats posé dès le lancement (voir pourboires.dart).
    Pourboires.instance.demarrer();
    _demarrer();
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState etat) {
    if (!_pret) return;
    if (etat == AppLifecycleState.paused || etat == AppLifecycleState.inactive) {
      _web.runJavaScript('window.$appObjet && $appObjet.pause()');
    } else if (etat == AppLifecycleState.resumed) {
      _web.runJavaScript('window.$appObjet && $appObjet.resume()');
    }
  }

  Future<void> _demarrer() async {
    // Préférences et page se lisent pendant que la WebView se crée.
    final prefs = SharedPreferences.getInstance();
    final html = rootBundle.loadString(appFichier);
    final params = WebViewPlatform.instance is AndroidWebViewPlatform
        ? AndroidWebViewControllerCreationParams()
        : const PlatformWebViewControllerCreationParams();
    _web = WebViewController.fromPlatformCreationParams(params)
      ..setJavaScriptMode(JavaScriptMode.unrestricted)
      ..setBackgroundColor(appFond)
      ..enableZoom(false)
      ..addJavaScriptChannel('NativeStore', onMessageReceived: _memoriser)
      ..addJavaScriptChannel('RatureNatif', onMessageReceived: _natif)
      ..setNavigationDelegate(NavigationDelegate(
        onPageFinished: (_) {
          _charge = true;
          FlutterNativeSplash.remove();
          _envoyerMarges();
        },
        // Aucune navigation hors de la page (un lien égaré ne doit pas remplacer l'app dans la
        // WebView). La connexion WebSocket à Home Assistant n'est pas une navigation, et la page
        // de connexion de HA s'ouvre dans son propre écran (connexion_ha.dart).
        onNavigationRequest: (r) =>
            r.url.startsWith(appOrigine) || r.url.startsWith('about:') || r.url.startsWith('data:')
                ? NavigationDecision.navigate
                : NavigationDecision.prevent,
      ));
    final android = _web.platform;
    if (android is AndroidWebViewController) {
      // Débogage par chrome://inspect, seulement dans les versions debug.
      await AndroidWebViewController.enableDebugging(kDebugMode);
    }
    // Filet de sécurité : ne jamais rester bloqué sur l'écran de démarrage.
    Future.delayed(const Duration(seconds: 20), FlutterNativeSplash.remove);
    _prefs = await prefs;
    await _web.loadHtmlString(_injecter(await html), baseUrl: appOrigine);
    setState(() => _pret = true);
  }

  /// Bouton retour d'Android : la page ferme d'abord ce qui est ouvert (`window.<appObjet>.back()`
  /// répond vrai s'il a fermé quelque chose) ; s'il n'y a rien à fermer, l'application se range.
  Future<void> _retour() async {
    var ferme = false;
    if (_pret && _charge) {
      try {
        final r = await _web.runJavaScriptReturningResult('!!(window.$appObjet && $appObjet.back())');
        ferme = r == true || r.toString() == 'true' || r.toString() == '1';
      } catch (e) {
        debugPrint('Retour : $e');
      }
    }
    if (!ferme) {
      if (_pret) await _web.runJavaScript('window.$appObjet && $appObjet.pause()');
      await SystemNavigator.pop();
    }
  }

  /// Marges du système en pixels CSS (un pixel CSS de la WebView vaut un pixel logique Flutter).
  String _css(EdgeInsets p) =>
      'html:root{--safe-top:${p.top.toStringAsFixed(1)}px;--safe-bottom:${p.bottom.toStringAsFixed(1)}px;'
      '--safe-left:${p.left.toStringAsFixed(1)}px;--safe-right:${p.right.toStringAsFixed(1)}px}';

  /// Met à jour la feuille de style des marges quand elles changent (après le chargement).
  void _envoyerMarges() {
    if (!_pret || !_charge || _marges.isEmpty) return;
    _web.runJavaScript('(function(){var s=document.getElementById("coquille-marges");'
        'if(s)s.textContent=${jsonEncode(_marges)};})()');
  }

  /// Place avant la page un script qui restaure localStorage et signale chaque écriture, et une
  /// feuille de style des marges.
  String _injecter(String html) {
    final sauve = {
      for (final k in _prefs.getKeys().where((k) => k.startsWith(_prefixe)))
        k.substring(_prefixe.length): _prefs.getString(k),
    };
    final vue = WidgetsBinding.instance.platformDispatcher.views.first;
    final p = EdgeInsets.fromViewPadding(vue.viewPadding, vue.devicePixelRatio);
    _marges = _css(p);
    // Les variables --safe-* de la page valent env(safe-area-inset-*) ; html:root, plus spécifique que
    // le :root de la page, impose les marges que Flutter connaît, sans compter deux fois celles que la
    // WebView signale parfois elle-même.
    final script = '''<style id="coquille-marges">$_marges</style><script>(function(){
  var sauve = ${jsonEncode(sauve)};
  try { for (var k in sauve) localStorage.setItem(k, sauve[k]); } catch(e){}
  var P = Storage.prototype, set = P.setItem, rem = P.removeItem, clr = P.clear;
  function envoyer(m){ try { NativeStore.postMessage(JSON.stringify(m)); } catch(e){} }
  P.setItem = function(k, v){ set.call(this, k, v); if (this === localStorage) envoyer({k: k, v: String(v)}); };
  P.removeItem = function(k){ rem.call(this, k); if (this === localStorage) envoyer({k: k, v: null}); };
  P.clear = function(){ clr.call(this); if (this === localStorage) envoyer({vider: true}); };
  window.__coquille = { native: true };
})();</script>''';
    // Juste après <meta charset> (qui doit rester dans les premiers octets), sinon après <head>.
    final c = html.indexOf('charset');
    final i = html.indexOf('>', c >= 0 ? c : html.indexOf('<head')) + 1;
    return html.substring(0, i) + script + html.substring(i);
  }

  /// Demandes de la page : `{id, action, url?}`. Une erreur est rendue sous la forme `{code, message}`.
  Future<void> _natif(JavaScriptMessage m) async {
    final msg = jsonDecode(m.message) as Map<String, dynamic>;
    Object? valeur;
    Object? erreur;
    try {
      switch (msg['action']) {
        case 'connecter':
          valeur = {'url': await _ha.connecter(context, msg['url'] as String? ?? '', titre: msg['titre'] as String? ?? '')};
        case 'acces':
          valeur = await _ha.acces();
        case 'creerListe':
          await _ha.creerListe(msg['nom'] as String? ?? '');
        case 'deconnecter':
          await _ha.deconnecter();
        case 'socketOuvrir':
          unawaited(_sockets.ouvrir(msg['n'] as int, msg['url'] as String));
        case 'socketEnvoyer':
          _sockets.envoyer(msg['n'] as int, msg['texte'] as String);
        case 'socketFermer':
          await _sockets.fermer(msg['n'] as int);
        case 'ouvrir':
          final uri = Uri.parse(msg['url'] as String);
          if (!const {'https', 'http', 'mailto'}.contains(uri.scheme)) throw ErreurHA('interne', 'Lien refusé');
          await launchUrl(uri, mode: LaunchMode.externalApplication);
        case 'pourboires':
          valeur = await Pourboires.instance.lister();
        case 'offrir':
          valeur = await Pourboires.instance.offrir(msg['produit'] as String);
        default:
          throw ErreurHA('inconnu', 'Action inconnue : ${msg['action']}');
      }
    } on ErreurHA catch (e) {
      erreur = {'code': e.code, 'message': e.message};
    } catch (e) {
      erreur = {'code': 'interne', 'message': '$e'};
    }
    await _web.runJavaScript('window.__natif && __natif.repondre('
        '${jsonEncode(msg['id'])}, ${jsonEncode(erreur)}, ${jsonEncode(valeur)})');
  }

  void _memoriser(JavaScriptMessage m) {
    final msg = jsonDecode(m.message) as Map<String, dynamic>;
    if (msg['vider'] == true) {
      for (final k in _prefs.getKeys().where((k) => k.startsWith(_prefixe)).toList()) {
        _prefs.remove(k);
      }
    } else if (msg['v'] == null) {
      _prefs.remove('$_prefixe${msg['k']}');
    } else {
      _prefs.setString('$_prefixe${msg['k']}', msg['v'] as String);
    }
  }

  @override
  Widget build(BuildContext context) {
    final css = _css(MediaQuery.viewPaddingOf(context));
    if (css != _marges && _marges.isNotEmpty) {
      _marges = css;
      _envoyerMarges();
    }
    return PopScope(
      canPop: false,
      onPopInvokedWithResult: (aFerme, _) {
        if (!aFerme) _retour();
      },
      child: AnnotatedRegion<SystemUiOverlayStyle>(
        // Barres du système transparentes, icônes sombres sur le papier clair du Carnet.
        // À FAIRE : suivre le skin choisi (un skin sombre, comme Ardoise, veut des icônes claires).
        value: const SystemUiOverlayStyle(
          statusBarColor: Colors.transparent,
          statusBarIconBrightness: Brightness.dark,
          statusBarBrightness: Brightness.light,
          systemNavigationBarColor: Colors.transparent,
          systemNavigationBarIconBrightness: Brightness.dark,
          systemNavigationBarContrastEnforced: false,
        ),
        child: ColoredBox(
          color: appFond,
          child: _pret ? WebViewWidget(controller: _web) : const SizedBox.expand(),
        ),
      ),
    );
  }
}
