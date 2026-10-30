# Règles R8 de la version release (Flutter ajoute ce fichier tout seul s'il existe).
#
# Sans ces règles, une version publiée sur Play peut planter au lancement, avant le premier écran :
#   Unable to get provider androidx.startup.InitializationProvider
#   Failed to create an instance of androidx.work.impl.WorkDatabase
# WorkManager crée sa base Room par réflexion
# (nom de classe + « _Impl ») ; R8 retirait le constructeur de la classe générée.
# Les versions debug ne sont pas optimisées, d'où un plantage visible seulement en release.

-keep class * extends androidx.room.RoomDatabase { <init>(); }
-keep class androidx.work.impl.WorkDatabase_Impl { *; }
-keep class androidx.work.** { *; }
-dontwarn androidx.work.**
