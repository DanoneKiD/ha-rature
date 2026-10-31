/// WebSocket non chiffré, ouvert par Dart pour le compte de la page.
///
/// La page vient de https://rature.local/ : ni la WebView d'Android ni WKWebView ne la laissent
/// ouvrir un `ws://` (contenu mixte), or une instance HA sur le réseau local répond souvent en
/// http://ip:8123. `wss://` reste ouvert par la page elle-même (coquille.js, `installerPontSocket`).
library;

import 'dart:io';

class PontSocket {
  PontSocket(this._vers);

  /// Remet à la page un événement : `open`, `message` (avec le texte) ou `close`.
  final void Function(int n, String type, [String? texte]) _vers;
  final _sockets = <int, WebSocket>{};

  Future<void> ouvrir(int n, String url) async {
    try {
      // Seule la page, embarquée, appelle ici ; on n'ouvre rien d'autre qu'un ws://.
      if (!url.startsWith('ws://')) throw ArgumentError(url);
      final client = HttpClient()..connectionTimeout = const Duration(seconds: 8);
      final s = await WebSocket.connect(url, customClient: client).timeout(const Duration(seconds: 10));
      _sockets[n] = s;
      _vers(n, 'open');
      s.listen(
        (texte) => _vers(n, 'message', texte as String),
        onDone: () {
          _sockets.remove(n);
          _vers(n, 'close');
        },
        onError: (_) {},
      );
    } catch (_) {
      _vers(n, 'close');
    }
  }

  void envoyer(int n, String texte) => _sockets[n]?.add(texte);

  Future<void> fermer(int n) async => _sockets[n]?.close();
}
