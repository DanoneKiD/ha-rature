import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:in_app_purchase/in_app_purchase.dart';
import 'package:in_app_purchase_android/in_app_purchase_android.dart';

/// Pourboires de Rature : trois achats intégrés **consommables**, qui ne débloquent rien. C'est la
/// seule façon admise par Google Play (règles de paiement, section 4 : pas de lien vers un autre
/// moyen de paiement) et par l'App Store (3.1.1) de recevoir un don pour l'app elle-même.
///
/// Consommable, donc rien à restaurer pour l'utilisateur. L'écouteur d'achats est installé
/// une seule fois, au démarrage de l'app : un écouteur posé trop tard, ou deux fois, fait rembourser
/// les achats par Google. Un achat est consommé dès qu'il arrive ; un achat resté
/// en suspens d'une session précédente est relu quelques secondes après le lancement et consommé.
class Pourboires {
  Pourboires._();
  static final instance = Pourboires._();

  /// Identifiants des produits, les mêmes dans la Play Console et App Store Connect. Le suffixe est
  /// celui que la page connaît (apropos.js) : cafe, petitdej, resto.
  static const _prefixe = 'com.danonekid.rature.pourboire.';
  static const ids = ['cafe', 'petitdej', 'resto'];

  final _iap = InAppPurchase.instance;
  Future<void>? _demarrage;
  bool _ecoute = false;
  final _details = <String, ProductDetails>{};
  Completer<String>? _achat;

  static bool get _mobile =>
      !kIsWeb && (defaultTargetPlatform == TargetPlatform.android || defaultTargetPlatform == TargetPlatform.iOS);

  /// Au lancement : l'écouteur d'achats seulement. Les produits ne sont demandés au store qu'à
  /// l'ouverture des pourboires (`_produits`), pour ne rien ajouter au démarrage.
  void demarrer() {
    if (_ecoute || !_mobile) return;
    _ecoute = true;
    _iap.purchaseStream.listen(_traiter, onError: (Object e) => debugPrint('Pourboires : flux, $e'));
    // Un pourboire payé mais resté en suspens (app fermée pendant l'achat) : Android ne le renvoie
    // pas de lui-même. On le relit un peu après le lancement (rien de plus au démarrage), et
    // _traiter le consomme. iOS, lui, représente les transactions inachevées tout seul.
    if (defaultTargetPlatform == TargetPlatform.android) {
      Future.delayed(const Duration(seconds: 5), () async {
        try {
          await _iap.restorePurchases();
        } catch (e) {
          debugPrint('Pourboires : relecture, $e');
        }
      });
    }
  }

  /// Idempotent : ne lit les produits qu'une fois.
  Future<void> _produits() => _demarrage ??= _lireProduits();

  Future<void> _lireProduits() async {
    demarrer();
    if (!_mobile) return;
    try {
      if (!await _iap.isAvailable()) return;
      final r = await _iap.queryProductDetails({for (final id in ids) '$_prefixe$id'}).timeout(const Duration(seconds: 15));
      if (r.error != null) debugPrint('Pourboires : produits, ${r.error!.message}');
      for (final p in r.productDetails) {
        _details[p.id.substring(_prefixe.length)] = p;
      }
    } catch (e) {
      debugPrint('Pourboires : démarrage, $e');
    }
  }

  /// `pourboires` : les produits que le store connaît, avec leur prix localisé.
  Future<Map<String, Object?>> lister() async {
    await _produits();
    return {
      'produits': [
        for (final id in ids)
          if (_details[id] != null) {'id': id, 'prix': _details[id]!.price},
      ],
    };
  }

  /// `offrir` : rend `{resultat: 'offert' | 'attente' | 'annule' | 'erreur' | 'indispo'}`.
  Future<Map<String, Object?>> offrir(String id) async {
    await _produits();
    final d = _details[id];
    if (d == null) return {'resultat': 'indispo'};
    if (_achat != null) return {'resultat': await _achat!.future};
    final c = _achat = Completer<String>();
    try {
      final lance = await _iap.buyConsumable(purchaseParam: PurchaseParam(productDetails: d));
      if (!lance) _finir('erreur');
    } catch (e) {
      debugPrint('Pourboires : achat, $e');
      _finir('erreur');
    }
    return {'resultat': await c.future};
  }

  void _finir(String resultat) {
    final c = _achat;
    _achat = null;
    if (c != null && !c.isCompleted) c.complete(resultat);
  }

  Future<void> _traiter(List<PurchaseDetails> liste) async {
    for (final p in liste) {
      // Pourboire retrouvé à la relecture : on le consomme (ce qui l'acquitte aussi), sans rien
      // dire à la page, aucun achat n'est en cours.
      if (p.status == PurchaseStatus.restored && p.productID.startsWith(_prefixe) && defaultTargetPlatform == TargetPlatform.android) {
        try {
          await _iap.getPlatformAddition<InAppPurchaseAndroidPlatformAddition>().consumePurchase(p);
        } catch (e) {
          debugPrint('Pourboires : consommation, $e');
        }
        continue;
      }
      switch (p.status) {
        case PurchaseStatus.pending:
          _finir('attente');
        case PurchaseStatus.purchased:
        case PurchaseStatus.restored:
          _finir('offert');
        case PurchaseStatus.canceled:
          _finir('annule');
        case PurchaseStatus.error:
          debugPrint('Pourboires : erreur, ${p.error?.message}');
          _finir('erreur');
      }
      // Acquittement (et consommation, buyConsumable s'en charge sur Android) : sans lui, Google
      // rembourse au bout de trois jours.
      if (p.pendingCompletePurchase) {
        try {
          await _iap.completePurchase(p);
        } catch (e) {
          debugPrint('Pourboires : acquittement, $e');
        }
      }
    }
  }
}
