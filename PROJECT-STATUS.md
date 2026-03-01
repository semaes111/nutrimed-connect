# NutriMed Connect — Project Status & Deployment Guide

## Build Status: ✅ COMPLETE — Production Ready

**Repo:** https://github.com/semaes111/nutrimed-connect (private)
**Branch:** `main`
**Build:** Vite 7.3.1 · 2,425 modules · 237KB gzipped total · 25s build

---

## Architecture

```
React 18 + Vite 7 + Tailwind v4
         │
         ▼
┌─────────────────────────────────────┐
│  Supabase (bpazmmbjjducdmxgfoum)   │
│  ├─ 9 nm_* tables                  │
│  ├─ RLS enabled all tables         │
│  ├─ Edge Functions (nm-chat)       │
│  └─ Auth (email + anonymous)       │
└─────────────────────────────────────┘
         │
         ▼
  Docker (nginx:alpine ~30MB)
         │
         ▼
  Dokploy → Traefik → nutrimedia.es
  VPS 31.97.69.100 (Hostinger)
```

## 17 Source Files (2,571 total lines)

```
src/
├── App.jsx                              (70 lines)  Router + auth guards
├── main.jsx                             (16 lines)  Entry point
├── index.css                            (75 lines)  Design system + components
├── lib/
│   ├── supabase.js                      (57 lines)  Client + service factory
│   ├── AuthContext.jsx                  (130 lines)  Dual auth (pro + patient)
│   └── dietConfig.js                    (46 lines)  9 diets visual config
├── components/layout/
│   ├── PatientLayout.jsx                (54 lines)  Mobile bottom nav
│   └── ProLayout.jsx                    (66 lines)  Desktop sidebar
├── pages/auth/
│   ├── PatientLogin.jsx                 (83 lines)  Access code entry
│   └── ProLogin.jsx                     (63 lines)  Email/password
├── pages/patient/
│   ├── PatientDashboard.jsx            (159 lines)  Diet card + stats + meds
│   ├── WeightTracker.jsx               (152 lines)  Weight entry + Recharts graph
│   ├── MedsView.jsx                    (130 lines)  Medication list + details
│   └── PatientChat.jsx                 (187 lines)  AI chat interface
└── pages/pro/
    ├── ProDashboard.jsx                (182 lines)  Patient list + search/filter
    ├── ProPatientDetail.jsx            (656 lines)  5-tab CRUD (general/diet/weight/meds/access)
    └── ProPatientForm.jsx              (445 lines)  Create/edit patient form
```

## Production Bundle (code-split)

| Chunk      | Raw     | Gzipped  | Contents               |
|------------|---------|----------|------------------------|
| index.js   | 86 KB   | 22 KB    | App code (all pages)   |
| vendor.js  | 178 KB  | 59 KB    | React + Router         |
| charts.js  | 346 KB  | 103 KB   | Recharts               |
| supabase.js| 172 KB  | 46 KB    | Supabase client        |
| index.css  | 32 KB   | 7 KB     | Tailwind + design      |
| **Total**  | **815 KB** | **237 KB** |                    |

## Deployment to Dokploy (nutrimedia.es)

### Step 1: DNS (at registrar)
```
A    @      → 31.97.69.100
CNAME www   → nutrimedia.es
```

### Step 2: Dokploy Setup
1. Access http://31.97.69.100:3000 (Dokploy panel)
2. Create Project → "NutriMed Connect"
3. Create Application → Source: GitHub → semaes111/nutrimed-connect → branch: main
4. Build Type: **Dockerfile** (path: `./Dockerfile`)
5. Environment Variables tab → Add:
   ```
   VITE_SUPABASE_URL=https://bpazmmbjjducdmxgfoum.supabase.co
   VITE_SUPABASE_ANON_KEY=eyJhbGci...h07Kw
   ```
6. Domains tab → Create:
   - Host: `nutrimedia.es`
   - Container Port: `80`
   - HTTPS: On
   - Certificate: Let's Encrypt
7. Click **Deploy** → monitor build logs

### Step 3: Verify
- https://nutrimedia.es → should load patient login
- https://nutrimedia.es/pro/login → professional login
- https://nutrimedia.es/health → "OK"

## Supabase Tables (9 nm_* tables)

| Table              | Purpose                        |
|--------------------|--------------------------------|
| nm_patients        | Patient records (28 fields)    |
| nm_dietas_validas  | Diet catalog (9 active diets)  |
| nm_patient_diets   | Diet plan per day of week      |
| nm_weights         | Daily weight records           |
| nm_medications     | Active medications             |
| nm_access_codes    | Patient login codes (28-day)   |
| nm_conversations   | Chat sessions                  |
| nm_messages        | Chat messages                  |
| nm_api_usage       | AI usage tracking              |

## What's Next (Pending)

1. **Supabase Edge Function `nm-chat`** — AI chat backend (Claude/Gemini)
2. **PWA setup** — vite-plugin-pwa for installable mobile experience
3. **Push notifications** — medication reminders
4. **Professional auth** — create first pro user in Supabase Auth dashboard
5. **Test data** — seed patients, diets, weights for demo
