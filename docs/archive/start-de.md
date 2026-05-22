# ciphra

**Verschlüsselt by Design.**

`ciphra.ch` · `ciphra.app`

---

## Was ciphra ist

Ein Privacy-First-Gesundheitsbegleiter mit Ende-zu-Ende-Verschlüsselung. Der Server kann die Nutzerdaten mathematisch nicht entschlüsseln. Ursprünglich entstanden aus [epilepc](https://epilepc.ch), einem 7 Jahre alten Symfony-Epilepsie-Tracker (Diplomarbeit), öffnet ciphra das Konzept für jede Gesundheitssituation — Epilepsie, Migräne, Diabetes, chronische Schmerzen oder alles, was ein Patient oder eine betreuende Person täglich dokumentieren muss.

### Kernversprechen

- **3 Minuten pro Abend** um den Tag zu dokumentieren (Symptome, Anfälle, Medikamente, Auslöser, Notizen)
- **Deine Daten, dein Schlüssel** — E2E-verschlüsselt, Zero-Knowledge-Server
- **Zeig deinem Arzt ein Raster** — Monatsbericht, den er in Sekunden erfassen kann
- **Funktioniert offline** — PWA, verschlüsselter lokaler Cache, synchronisiert bei Verbindung
- **Keine Wellness-App** — ein ernsthaftes, funktionales Werkzeug für Menschen, die reale Erkrankungen managen

---

## Ursprung: Was wir von epilepc gelernt haben

### Die App (Symfony 5.4, PHP)
- 6 Entitäten: User, Seizure, Medication, Diaryentry, Event, Seizuretype
- Serverseitige Verschlüsselung (Defuse via DoctrineEncryptBundle — Server hält den Schlüssel)
- Bootstrap 4 / SB Admin 2 / jQuery / DataTables / Chart.js
- Mehrsprachig: DE, EN, IT, FR
- 11 Controller, 4 Security Voters, Doctrine ORM + MariaDB

### Warum es für echte Nutzer gescheitert ist

**Alexandras Feedback** (Betreuerin einer Person mit therapieresistenter Epilepsie + Migräne):

> *"Für meine Bedürfnisse hat es sich als nur bedingt brauchbar und umständlich herausgestellt und ich habe mir ein einfaches Excel Sheet gebastelt."*

Sie hat epilepc zugunsten eines Excel-Sheets aufgegeben:

| Was sie braucht | Was epilepc bietet | Die Lücke |
|---|---|---|
| 20 Symptom-Checkboxen pro Tag anklicken | Einzelne "Tagebucheinträge" mit Titel + Beschreibung erstellen | Viel zu langsam |
| Anfälle zählen (nur eine Zahl) | Navigieren → "Neuer Anfall" → Formular ausfüllen → Speichern | Umständlich für den täglichen Gebrauch |
| Abhaken, welche Medikamente heute gegeben wurden | Separate Medikamenten-CRUD-Seiten | Falsches Denkmodell |
| Auslöser erfassen (Wetter, Stress, Menstruation) | Existiert nicht | Fehlende Funktion |
| Vitalwerte erfassen (BD, O2, Puls, Gewicht) | Existiert nicht | Fehlende Funktion |
| Monatsraster mit Summen + Prozenten für den Arzt | Nur Diagramme, keine Rasteransicht | Arzt kann es nicht nutzen |
| Individuelle Symptom-Spalten pro Patient | Fest kodiertes Entity-Schema | Unflexibel |
| 3 Minuten pro Abend | 15+ Minuten Formulare navigieren | Ausschlusskriterium |

**Ihr Excel**: Zeilen = Tage, Spalten = ~40 Symptom-/Medikamenten-/Auslöser-Checkboxen. Sie kreuzt sie jeden Abend an und zeigt das Monatsraster den Ärzten. Referenz: `/home/danileau/Downloads/Beispiel Dokumentation Anfälle.pdf`

### Architektonische Sackgassen in epilepc

- Serverseitige Verschlüsselung: Server hält den Defuse-Schlüssel → nicht Zero-Knowledge
- Starre Doctrine-Entitäten: keine individuellen Spalten pro Patient ohne Schema-Änderungen
- PHP/Twig Server-Rendering: kein Offline-Support, kein Mobile, keine clientseitige Kryptografie
- SB Admin 2 Template: generisches Admin-UI, keine gesundheitsspezifische UX
- Keine API: Mobile Clients können nicht verbinden

---

## Der E2E-Verschlüsselungs-PoC (epi-2)

Ein funktionierender Proof-of-Concept unter `/home/danileau/work/epi-2/` demonstriert die Zero-Knowledge-Architektur.

### Tech-Stack
- Python 3.11 / Flask 3.0 / PostgreSQL 15
- Docker + Nginx
- AES-256-GCM + Argon2id Key Derivation

### Schlüsselhierarchie

```
Benutzer-Passwort ──┬── Argon2id(+":AUTH")  → auth_hash (Server speichert für Login-Verifizierung)
                    └── Argon2id(+":VAULT") → vault_key (verschlüsselt Master Key)

Master Key (zufällig 256-Bit, einmalig bei Registrierung erzeugt, verlässt NIE den Client)
  └── AES-256-GCM → verschlüsselt ALLE Gesundheitsdaten

Recovery Code (12-Wort-BIP39-Mnemonik)
  └── Argon2id(+":RECOVERY") → recovery_key (Backup-Verschlüsselung des Master Keys)
```

### Sicherheitseigenschaften
- Master Key erreicht niemals den Server
- Server speichert nur: auth_hash, encrypted_master, verschlüsselte Datensätze
- Argon2id: 64MB Speicher, 3 Iterationen, GPU-resistent
- AES-256-GCM: authentifizierte Verschlüsselung (erkennt Manipulation)
- Kontosperrung nach 5 Fehlversuchen (15 Min.)
- Wiederherstellung ohne Kompromittierung: 12-Wort-Code stellt Master Key wieder her, verschlüsselt mit neuem Passwort neu
- Audit-Logging aller Aktionen

### Was fehlt (vom PoC → Produktion)
- Frontend-Verschlüsselung ist Platzhalter (base64, nicht WebCrypto)
- `record_type`-Feld ist Klartext in der DB → Metadaten-Leak
- Kein 2FA
- Keine HTTPS-Erzwingung
- Kein Offline-/PWA-Support
- Kein echtes Frontend (nur eine Demo-HTML-Seite)

---

## Metadaten-Sensitivität: Das tiefere Problem

Selbst bei E2E-verschlüsselten Werten verrät die **Form der Daten** Informationen:

| Sichtbare Metadaten | Was sie verraten |
|---|---|
| Konto existiert auf ciphra | Person hat eine Gesundheitskondition |
| 47 Datensätze vom Typ "seizure" | Hat Epilepsie, Schweregrad |
| Datensätze häufen sich im März | Schlechter Monat |
| 3 Datensätze am 7. März | Schwieriger Tag |
| `record_type = "seizure"` | Art der Erkrankung |

### Lösung: Opaker Dokumentenspeicher

Eine generische Tabelle, alles innerhalb des verschlüsselten Blobs:

```sql
CREATE TABLE encrypted_documents (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id),
    encrypted_data TEXT NOT NULL,     -- E2E-verschlüsselt: Typ, Datum, ALLES darin
    created_at TIMESTAMP             -- nur Upload-Zeitstempel, nicht Ereignis-Zeit
);
```

Der Server sieht: "Benutzer 42 hat N Blobs hochgeladen." Keine Typen, keine Ereignisdaten, keine Muster.

Tradeoff: Jegliches Filtern, Aggregieren und Suchen geschieht clientseitig nach der Entschlüsselung. Akzeptabel für persönliche Gesundheitsdaten (Hunderte Datensätze, nicht Millionen).

---

## UI-Konzepte (Entworfen & Prototypisiert)

Statische Testseiten unter `/home/danileau/work/epilepc/ui-test/` demonstrieren jedes Konzept.

### Design-System
- **Schrift**: Inter (Google Fonts)
- **CSS**: Tailwind CSS
- **Icons**: Lucide (SVG, keine Emoji)
- **Farbpalette**: Warme Stone-Neutraltöne + Indigo als Primärfarbe
- **Datentyp-Farben**: Anfall=#DC2626, Ereignis=#0D9488, Tagebuch=#6366F1, Medikation=#D97706
- **Dark Mode**: Vollständiger Support, localStorage-Toggle, Systemeinstellung-Erkennung
- **Epilepsie-sicher**: KEIN Blinken/Blitzen. `prefers-reduced-motion` wird respektiert. Chart.js-Animationen deaktiviert.
- **Barrierefreiheit**: WCAG AAA Kontrast, 44px+ Touch-Targets, semantisches HTML, ARIA, Skip-Links, Fokus-Traps

### Vier Ansichts-Konzepte

Jedes bedient einen anderen Moment im Tag des Nutzers:

#### A: Companion ("Heute") — Morgen-Check-in
`concept-companion.html`
- Begrüssung + Datum
- Anfallsfreier Streak-Zähler (Tage seit letztem, persönlicher Rekord)
- Medikamenten-Checkliste (interaktiv, abhaken beim Einnehmen)
- Schnellaktions-Karten (Anfall erfassen, Tagebuch schreiben, Ereignis erfassen, Bericht erstellen)
- Heutige Einträge
- Muster-Erkenntnisse ("Anfälle häufiger am Montag und Freitag")
- Wochen-Minivisualisierung (7-Tage farbige Blockansicht)
- Kommende Termine

#### B: Tagesprotokoll ("Protokoll") — Abendlicher 3-Min-Log
`concept-tagesprotokoll.html`
- Toggle-Chips für Symptome gruppiert nach Kategorie (Verhalten, Körperlich, Schlaf)
- Anfallszähler mit +/- Steppern und Zeit-Chips
- Auslöser-Toggles (Wetter, Sonstige)
- Medikamenten-Checkliste (tägliche Standard- + Bedarfsmedikation)
- Vitalzeichen-Bereich (BD, Puls, O2, Gewicht, Temperatur, Neurofeedback)
- Notizen-Textfeld
- **Monatsraster-Ansicht**: HTML-Tabelle nach Alexandras Excel-Vorbild — Zeilen=Tage, Spalten=Symptome/Medikamente/Auslöser, Summen + Prozente am Ende
- PDF-Export-Button

#### C: Kalender ("Kalender") — Mustererkennung
`concept-calendar.html`
- Monatsraster mit farbcodierten Punkten pro Tag
- Medikamenten-Bänder als Gantt-Balken unter dem Kalender
- Tagesdetail-Panel (Tag klicken → Einträge sehen)
- Wochenansicht-Toggle
- Monatliche Zusammenfassungsstatistiken
- Zwei-Panel-Layout (Kalender links, Detail rechts) auf Desktop
- Bottom Sheet auf Mobile

#### D: Stream ("Stream") — Verlauf durchblättern
`concept-stream.html`
- Einheitlicher chronologischer Feed aller Eintragstypen
- Filter-Tabs (Alle / Anfälle / Medikation / Tagebuch / Ereignisse)
- Datumsnavigations-Leiste (letzte 14 Tage)
- Floating Action Button (FAB) zum Schnell-Hinzufügen
- Inline-Schnellerfassungs-Karte
- Statistik-Vorschau-Overlay
- Suche mit Live-Filterung

### Klassische Admin-Ansicht (als Fallback beibehalten)
Vollständiger Reskin des bestehenden epilepc-Layouts: Dashboard mit KPI-Karten + Chart.js, tabellenbasierte Listenansichten, formularbasiertes CRUD, Admin-Panel. Für Nutzer, die den traditionellen Ansatz bevorzugen.

### Vorgeschlagene Navigation

```
Bottom Nav:

  Heute          Protokoll        Kalender        Stream          Mehr
(Companion)   (Tagesprotokoll)   (Kalender)      (Stream)    (Klassisch, Konto,
                                                              Berichte, Einstellungen)
```

Nutzer wählen ihre Standard-Ansicht in den Einstellungen. Alle Ansichten jederzeit wechselbar.

---

## Architektur

```
┌─────────────────────────────────────────────────────────┐
│  FRONTEND (PWA — installierbar, funktioniert offline)   │
│  SvelteKit + TypeScript + Tailwind CSS                  │
│                                                          │
│  ┌──────────┐  ┌──────────┐  ┌───────────────────────┐ │
│  │ WebCrypto│  │IndexedDB │  │ Ansichten             │ │
│  │ Argon2   │→ │(verschl. │→ │ Companion (Home)      │ │
│  │ AES-GCM  │  │ lokaler  │  │ Tagesprotokoll (Log)  │ │
│  │          │  │ Cache)   │  │ Kalender (Muster)     │ │
│  └──────────┘  └──────────┘  │ Stream (Verlauf)      │ │
│                               │ Klassisch (Fallback)  │ │
│                               └───────────────────────┘ │
│                                                          │
│  Charts: Chart.js (clientseitig, keine Animation)       │
│  PDF: Browserseitige Generierung                         │
│  Landing Page: Statisch/SSG (öffentlich, SEO)            │
└──────────────────┬──────────────────────────────────────┘
                   │ nur verschlüsselte Blobs
                   ↓
┌──────────────────────────────────────────────────────────┐
│  API (dünner verschlüsselter Blob-Speicher)              │
│  ~5 Endpoints: register, login, store, fetch, delete     │
│  Auth: Argon2id + JWT (24h)                              │
│  Datenbank: PostgreSQL                                   │
│  Audit-Logging                                           │
│  Rate Limiting + Kontosperrung                           │
└──────────────────────────────────────────────────────────┘
```

### Warum SvelteKit
- Leichter als Next.js, ideal für PWAs
- Dateibasiertes Routing, SSG für Landing Page, SPA für die App
- Erstklassiger TypeScript-Support
- Eingebauter Service-Worker-Support (Offline)
- Die ui-test HTML-Konzepte lassen sich nahezu 1:1 in Svelte-Komponenten übersetzen

### Datenmodell

**Der Server sieht nur verschlüsselte Blobs:**

```
encrypted_documents:
  id            SERIAL PRIMARY KEY
  user_id       FK → users
  encrypted_data TEXT (E2E-verschlüsselt)    ← alles darin:
  created_at    TIMESTAMP                      {
                                                 "type": "daily_log",
                                                 "date": "2026-04-03",
                                                 "symptoms": {"müde": true, ...},
                                                 "seizures": {"focal": 0, "gm": 1, ...},
                                                 "triggers": {"weather": ["Sonne"], ...},
                                                 "medications": {"standard": {...}, "asNeeded": {...}},
                                                 "vitals": {"bp": "120/80", ...},
                                                 "notes": "..."
                                               }
```

**Benutzereinstellungen (ebenfalls verschlüsselt):**

```json
{
  "defaultView": "companion",
  "symptomColumns": ["müde", "aggressiv", "unruhig", "übelkeit", ...],
  "triggerOptions": ["Wind", "Sonne", "Regen", "Schlafmangel", ...],
  "standardMedications": [{"name": "Levetiracetam", "dose": "750mg", "times": ["morgens", "abends"]}],
  "asNeededMedications": ["Midazolam nasal 5mg", "Temesta 1mg"],
  "locale": "de"
}
```

Individuelle Symptome pro Patient = unterschiedliche JSON-Schlüssel. Keine Schema-Änderungen. Keine Migrationen.

### Clientseitige Verarbeitung

Alle Berechnungen geschehen im Browser nach der Entschlüsselung:
- Monatsraster: 31 Blobs laden → entschlüsseln → in JS aggregieren
- Charts: aus entschlüsselten Daten berechnet → Chart.js
- PDF-Export: im Browser generiert (bereits in epilepc gelöst)
- Suche: alle entschlüsseln → im Speicher filtern
- Streak-Zähler: entschlüsselte Datensätze durchlaufen → letztes Anfallsdatum finden

Performance: 365 Datensätze/Jahr × Mikrosekunden pro AES-256-GCM-Entschlüsselung = vernachlässigbar.

### Offline-Support

IndexedDB speichert verschlüsselte Blobs lokal. Die App funktioniert ohne Internet:
1. Nutzer erfasst Daten → verschlüsselt im Browser → in IndexedDB gespeichert
2. Bei Verbindung → verschlüsselte Blobs mit Server synchronisieren
3. Konfliktlösung: Last-Write-Wins pro Dokument (Tagesprotokolle sind eins pro Tag)

---

## Migrationspfad von epilepc

Bestehende epilepc-Nutzer migrieren mit einem einmaligen Import:

1. Nutzer meldet sich im ALTEN epilepc an (Symfony)
2. Server entschlüsselt die Daten (Defuse-Schlüssel, serverseitig)
3. Export als JSON: seizures[], medications[], diaryentries[], events[]
4. Nutzer meldet sich bei ciphra an (neue App)
5. Client verschlüsselt jeden Datensatz mit dem NEUEN E2E-Master-Key
6. Upload der verschlüsselten Blobs zum ciphra-Backend
7. Fertig — alte Daten nun E2E-verschlüsselt im neuen System

epilepc läuft weiter für Nutzer, die nicht migrieren. Kein erzwungener Umstieg.

---

## Implementierungsphasen

### Phase 1 — Kern-App
- SvelteKit-Projekt aufsetzen + Tailwind + TypeScript
- WebCrypto E2E-Verschlüsselung (epi-2-Krypto nach JS portieren)
- Auth-Flow: Registrierung (mit Recovery Code), Login, Passwort-Wiederherstellung
- API: 5 Endpoints (Python/Flask von epi-2, oder neu geschrieben)
- Companion-Ansicht (tägliche Startseite)
- Tagesprotokoll-Ansicht (Abend-Log + Monatsraster)
- Verschlüsselter IndexedDB-lokaler Cache

### Phase 2 — Vollständige Ansichten
- Kalender-Ansicht
- Stream-Ansicht
- Klassische/Admin-Ansicht (Fallback)
- PDF-Export (browserseitig)
- Monatsraster-Bericht (Alexandras Anwendungsfall)

### Phase 3 — Plattform
- PWA-Installation (Startbildschirm, Offline-Sync)
- Migrationstool (Import von epilepc v1)
- Betreuungs-Konten (eine Person dokumentiert für eine andere)
- Mehrsprachigkeit (DE/EN/IT/FR — bestehende Übersetzungen portieren)
- 2FA

### Phase 4 — Offene Gesundheitsplattform
- Konfigurierbare Zustandsvorlagen (Epilepsie, Migräne, Diabetes...)
- Teilbare verschlüsselte Nur-Lese-Berichte (zeitbegrenzter Link für Ärzte)
- Native Mobile Wrapper (Capacitor) falls PWA nicht reicht

---

## Referenzdateien

| Was | Wo |
|---|---|
| epilepc-Quellcode (aktuelle App) | `/home/danileau/work/epilepc/` |
| UI-Testseiten (alle Konzepte) | `/home/danileau/work/epilepc/ui-test/` |
| Konzept: Companion | `ui-test/concept-companion.html` |
| Konzept: Tagesprotokoll | `ui-test/concept-tagesprotokoll.html` |
| Konzept: Kalender | `ui-test/concept-calendar.html` |
| Konzept: Stream | `ui-test/concept-stream.html` |
| Klassischer Reskin (14 Seiten) | `ui-test/dashboard.html`, `seizures.html`, etc. |
| Logo-Konzepte | `ui-test/logos/` |
| E2E-Verschlüsselungs-PoC | `/home/danileau/work/epi-2/` |
| Alexandras Excel (PDF) | `/home/danileau/Downloads/Beispiel Dokumentation Anfälle.pdf` |
| ciphra-Projektverzeichnis | `/home/danileau/work/ciphra/` |

---

## Domains

| Domain | Status |
|---|---|
| **ciphra.ch** | Verfügbar (RDAP-geprüft, wahrscheinlich — kein DNS, erfundenes Wort) |
| **ciphra.app** | Verfügbar (WHOIS-geprüft) |

---

*ciphra — verschlüsselt by design.*
