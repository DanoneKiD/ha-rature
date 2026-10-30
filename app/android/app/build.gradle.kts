import java.io.FileInputStream
import java.util.Properties

plugins {
    id("com.android.application")
    // Le plugin Gradle de Flutter s'applique après ceux d'Android et de Kotlin.
    id("dev.flutter.flutter-gradle-plugin")
}

// Clé d'importation, lue dans le premier fichier trouvé (aucun n'est versionné) :
//   - android/key.properties, écrit par Codemagic à chaque build ;
//   - secret/key.properties à la racine du dépôt.
// Sans eux, la release signe avec la clé de debug et Play refuserait l'AAB.
val keystoreProperties = Properties().apply {
    val f = listOf(rootProject.file("key.properties"), rootProject.file("../../secret/key.properties"))
        .firstOrNull { it.exists() }
    if (f != null) load(FileInputStream(f))
}

android {
    // Espace de noms du code Kotlin (MainActivity) et identifiant publié : définitif dès la création
    // de l'app dans la Play Console.
    namespace = "com.danonekid.rature"
    compileSdk = flutter.compileSdkVersion
    ndkVersion = flutter.ndkVersion

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    defaultConfig {
        applicationId = "com.danonekid.rature"
        manifestPlaceholders["appNom"] = "Rature"
        minSdk = flutter.minSdkVersion
        targetSdk = flutter.targetSdkVersion
        // versionCode et versionName viennent de pubspec.yaml (version: x.y.z+n).
        versionCode = flutter.versionCode
        versionName = flutter.versionName
    }

    signingConfigs {
        create("release") {
            keyAlias = keystoreProperties["keyAlias"] as String?
            keyPassword = keystoreProperties["keyPassword"] as String?
            storeFile = (keystoreProperties["storeFile"] as String?)?.let { file(it) }
            storePassword = keystoreProperties["storePassword"] as String?
        }
    }

    buildTypes {
        release {
            signingConfig = if (keystoreProperties.isEmpty) signingConfigs.getByName("debug")
                            else signingConfigs.getByName("release")
        }
    }
}

kotlin {
    compilerOptions {
        jvmTarget = org.jetbrains.kotlin.gradle.dsl.JvmTarget.JVM_17
    }
}

flutter {
    source = "../.."
}
