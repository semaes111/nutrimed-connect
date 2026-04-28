# 📱 NutriMed Connect — Release Android

Documentación del flujo de release de la APK Android para NutriMed Connect.

## Arquitectura

NutriMed Connect Android es un **Capacitor wrapper** sobre la app React/Vite existente:

```
┌────────────────────────────────────────────────┐
│  APK instalada (com.nexthorizont.nutrimed)     │
│                                                │
│  ┌──────────────────────────────────────────┐  │
│  │  Bundled: dist/ (HTML+JS+CSS) en assets  │  │  ← arranque inmediato
│  └────────────────────┬─────────────────────┘  │
│                       │                        │
│                       ▼ (en background)        │
│  ┌──────────────────────────────────────────┐  │
│  │  @capgo/capacitor-updater                │  │  ← OTA updates
│  │  Comprueba CDN al arrancar               │  │
│  │  Descarga + reemplaza bundle si hay v++  │  │
│  └──────────────────────────────────────────┘  │
└────────────────────────────────────────────────┘
```

**Modo híbrido**: la APK arranca con un bundle estático (rápido + offline) y comprueba un CDN para OTA updates. Solo cambios en plugins nativos / `package.json` requieren un release nuevo en Play Store.

## Plugins nativos integrados

| Plugin | Versión | Uso |
|---|---|---|
| `@capacitor/core` | 7.6.2 | Runtime Capacitor |
| `@capacitor/android` | 7.6.2 | Plataforma Android |
| `@capacitor/camera` | 7.0.5 | Escaneo etiquetas (`LabelScanner.jsx`) |
| `@capacitor/local-notifications` | 7.0.6 | Recordatorios meds, citas |
| `@capgo/capacitor-updater` | 7.43.3 | OTA updates self-hosted |

## Permissions requeridas (AndroidManifest.xml)

| Permission | Por qué |
|---|---|
| `INTERNET`, `ACCESS_NETWORK_STATE` | Llamadas a Supabase + n8n |
| `CAMERA` | Captura de etiquetas nutricionales |
| `READ_MEDIA_IMAGES` | Selección de fotos en galería (Android 13+) |
| `READ_EXTERNAL_STORAGE` | Galería en Android ≤12 (`maxSdkVersion="32"`) |
| `POST_NOTIFICATIONS` | Recordatorios (Android 13+ requiere runtime grant) |
| `SCHEDULE_EXACT_ALARM`, `USE_EXACT_ALARM` | Recordatorios programados con precisión |
| `RECEIVE_BOOT_COMPLETED` | Reprogramar recordatorios tras reinicio |
| `VIBRATE` | Feedback haptic en notificaciones |

## Build local (requiere Android SDK + JDK 21)

```bash
# 1. Build assets web
npm run build

# 2. Sincronizar dist/ a android/app/src/main/assets/public
npx cap sync android

# 3. Compilar APK debug
cd android
./gradlew assembleDebug
# Resultado: android/app/build/outputs/apk/debug/app-debug.apk
```

## Build via GitHub Actions (recomendado, NO requiere SDK local)

### Build manual debug

1. Ir a **Actions → Build Android APK** en GitHub
2. Click **Run workflow** → seleccionar `debug`
3. Esperar ~8 min
4. Descargar `nutrimed-debug-<sha>.zip` desde Artifacts
5. El APK está dentro: instalable directamente en cualquier Android

### Build release (versión publicable)

1. Tag de versión:
   ```bash
   git tag v1.0.0
   git push origin v1.0.0
   ```
2. El workflow se dispara automáticamente
3. Genera `app-release-unsigned.apk` + `app-release.aab`
4. Crea un GitHub Release en draft con ambos archivos

## Firma de APK release (obligatorio para Play Store)

### Generar keystore (UNA SOLA VEZ)

⚠️ **Conserva el .jks en lugar seguro. Si lo pierdes NUNCA podrás publicar updates a la app**:

```bash
keytool -genkey -v \
  -keystore nutrimed-release.jks \
  -keyalg RSA \
  -keysize 2048 \
  -validity 25000 \
  -alias nutrimed
```

Te pedirá:
- Contraseña del keystore (apunta y guarda)
- Datos: nombre, organización (NextHorizont AI), país (ES), etc.
- Contraseña del alias (puede ser la misma)

### Configurar GitHub Secrets

En GitHub → Settings → Secrets and variables → Actions → New repository secret:

```bash
# Convertir .jks a base64
base64 -w 0 nutrimed-release.jks > keystore.b64

# Crear los 4 secrets:
# ANDROID_KEYSTORE_BASE64 = <contenido de keystore.b64>
# ANDROID_KEYSTORE_PASSWORD = <password keystore>
# ANDROID_KEY_ALIAS = nutrimed
# ANDROID_KEY_PASSWORD = <password alias>
```

### Configurar firma en Gradle

Editar `android/app/build.gradle` y añadir antes del bloque `buildTypes`:

```gradle
signingConfigs {
    release {
        if (System.getenv("ANDROID_KEYSTORE_BASE64")) {
            storeFile file("keystore.jks")
            storePassword System.getenv("ANDROID_KEYSTORE_PASSWORD")
            keyAlias System.getenv("ANDROID_KEY_ALIAS")
            keyPassword System.getenv("ANDROID_KEY_PASSWORD")
        }
    }
}

buildTypes {
    release {
        // ... existing config ...
        signingConfig signingConfigs.release
    }
}
```

Y añadir al workflow YAML un step antes del build release:

```yaml
- name: Decode keystore
  run: echo "${{ secrets.ANDROID_KEYSTORE_BASE64 }}" | base64 -d > android/app/keystore.jks
  env:
    ANDROID_KEYSTORE_BASE64: ${{ secrets.ANDROID_KEYSTORE_BASE64 }}
```

## Subir a Google Play Console

### Primer release (Internal Testing)

1. Crear app en https://play.google.com/console (~25 USD one-time fee)
2. Package name: `com.nexthorizont.nutrimed` ⚠️ NO cambiar después
3. Release Internal Testing → upload `app-release.aab`
4. Lista de testers: añadir emails de Sergio + colaboradores
5. Esperar aprobación (~24h primera vez, ~3h después)
6. Tester recibe email con link de instalación

### Producción

1. Promote desde Internal Testing → Closed Testing → Production
2. Cubrir requisitos:
   - Privacy Policy (URL pública)
   - Data Safety form (qué datos recopilas, dónde se almacenan)
   - Content Rating questionnaire (Health & Fitness)
   - Target audience (mayores de 13 años)
3. Review de Google: 3-7 días primera vez

## OTA updates (sin pasar por Play Store)

Para cambios que NO tocan plugins nativos / dependencies:

```bash
# 1. Hacer cambios en código React
# 2. Build estático
npm run build

# 3. Empaquetar bundle como zip
cd dist && zip -r ../nutrimed-v1.0.1.zip . && cd ..

# 4. Subir a CDN (Hostinger / Cloudflare R2)
scp nutrimed-v1.0.1.zip user@cdn.nexthorizont.com:/var/www/updates/

# 5. Actualizar manifest.json en CDN:
{
  "version": "1.0.1",
  "url": "https://cdn.nexthorizont.com/nutrimed-v1.0.1.zip",
  "checksum": "<sha256 del zip>"
}
```

⚠️ Antes hay que configurar `CapacitorUpdater.updateUrl` en `capacitor.config.ts` apuntando al manifest, y rebuildear/republicar la APK con esa URL.

## Bumping de version

Para cada nuevo release:

```bash
# Editar android/app/build.gradle:
versionCode 2     # Incrementar SIEMPRE (entero monotónico)
versionName "1.0.1"  # Semver visible al usuario

# Tag y push
git commit -am "release: v1.0.1"
git tag v1.0.1
git push && git push --tags
```

## Troubleshooting

| Síntoma | Causa | Solución |
|---|---|---|
| `Cannot resolve symbol Capacitor` | dist/ no sincronizado | `npx cap sync android` |
| `Permission denied: CAMERA` | Permission no granted en runtime | Llamar `Camera.requestPermissions()` antes de getPhoto |
| Notificaciones no aparecen Android 13+ | `POST_NOTIFICATIONS` denied | `LocalNotifications.requestPermissions()` al primer uso |
| APK firma falla en CI | Secret base64 con saltos de línea | Usar `base64 -w 0` (sin wrap) |
| OTA update no aplica | `notifyAppReady()` no llamado | Verificar `bootCapacitor()` en `main.jsx` |

## Referencias

- Capacitor docs: https://capacitorjs.com/docs/android
- Plugin Camera: https://capacitorjs.com/docs/apis/camera
- Plugin Local Notifications: https://capacitorjs.com/docs/apis/local-notifications
- @capgo/capacitor-updater: https://capgo.app/docs/plugin/
- Play Console: https://play.google.com/console/about/
