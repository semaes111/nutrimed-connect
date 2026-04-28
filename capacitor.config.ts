import type { CapacitorConfig } from '@capacitor/cli';

/**
 * Capacitor configuration for NutriMed Connect Android APK.
 *
 * Architecture: HYBRID
 *   - Bundled web assets (dist/ folder embedded in APK) for instant boot + offline support
 *   - Live Updates via @capgo/capacitor-updater for OTA bug fixes / UX changes
 *     without requiring a Google Play release
 *
 * Plugins enabled:
 *   - @capacitor/camera          → label scanner native UX
 *   - @capacitor/local-notifications → medication reminders, appointment alerts
 *   - @capgo/capacitor-updater   → OTA updates from a self-hosted CDN
 *
 * Brand colors: NutriMed teal #0D9488 (matches index.html theme-color)
 */
const config: CapacitorConfig = {
  appId: 'com.nexthorizont.nutrimed',
  appName: 'NutriMed Connect',
  webDir: 'dist',

  // Network: allow http schemes for development tunnels (NEVER for production)
  // and explicit allow-list for Supabase REST + Functions endpoints.
  server: {
    androidScheme: 'https',
    // No `url` property: we ship bundled. Live updates replace files in the
    // bundle directory at runtime (managed by @capgo/capacitor-updater).
    cleartext: false,
    // Allowlist HTTPS domains the WebView is allowed to navigate to.
    // Fonts, Supabase, n8n. Anything else gets blocked from the page.
    allowNavigation: [
      'bpazmmbjjducdmxgfoum.supabase.co',
      '*.supabase.co',
      'n8n.nexthorizont.ai',
      'fonts.googleapis.com',
      'fonts.gstatic.com',
    ],
  },

  // Splash screen configuration: teal background matching brand,
  // 2 seconds maximum, fades into the React app.
  plugins: {
    SplashScreen: {
      launchShowDuration: 2000,
      launchAutoHide: true,
      launchFadeOutDuration: 300,
      backgroundColor: '#0D9488', // NutriMed teal (matches index.html theme-color)
      androidSplashResourceName: 'splash',
      androidScaleType: 'CENTER_CROP',
      showSpinner: false,
    },

    // Camera plugin: requested permissions and quality defaults.
    // The actual capture is triggered from src/pages/patient/LabelScanner.jsx
    // via Camera.getPhoto() — see refactor in this commit.
    Camera: {
      // Camera permission rationale shown when user is asked the first time.
      permissions: {
        camera: 'NutriMed necesita acceso a la cámara para escanear etiquetas nutricionales',
        photos: 'NutriMed necesita acceso a la galería para seleccionar fotos de etiquetas',
      },
    },

    // Local notifications: medication reminders, appointment alerts.
    // Channels are configured in MainActivity.java for Android 8+ (O+).
    LocalNotifications: {
      smallIcon: 'ic_stat_notification',
      iconColor: '#0D9488',
      sound: 'default',
    },

    // OTA updater (Capgo) — points at our own CDN to avoid vendor lock-in.
    // The CDN URL will be updated when we deploy the first version. For now,
    // 'autoUpdate=false' means: the APK ships the bundle and updates must
    // be triggered explicitly by the app code. We can flip to true after
    // setting up the update endpoint in Hostinger / Cloudflare R2.
    CapacitorUpdater: {
      autoUpdate: false,
      autoDeleteFailed: true,
      autoDeletePrevious: true,
      // Statistics endpoint is optional — opt out unless we want telemetry.
      statsUrl: '',
      updateUrl: '', // To be filled when we host the manifest.json
      channelUrl: '',
    },
  },

  android: {
    // Allow mixed content only inside the app shell (we control source domains).
    allowMixedContent: false,
    // WebView background while the React app is loading.
    backgroundColor: '#0D9488',
    // Capture system back button to React Router instead of closing the app.
    // The actual handler lives in src/main.jsx (subscribes to App.addListener).
    captureInput: true,
  },
};

export default config;
