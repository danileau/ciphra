# Backlog

The open work that isn't in flight. Small, well-understood items get fixed as
they come up; this file holds the **larger items that each deserve their own
session**, plus the operator-only actions and the decisions already made (so
nothing gets re-proposed).

Last reviewed: 2026-08-30. Day-to-day state lives in git + the operator's
memory; this is the forward-looking list.

---

## Larger items — each is its own project

Every prompt below is self-contained: paste it to start a fresh session. All
four respect the repo's hard rules (branch off fresh `origin/main`,
`/green-gate` before push, never merge/deploy — the operator does that, CHANGELOG
+ `version-guard` for user-facing changes).

### 1 — Reproducible builds (JS-swap mitigation) · security · HIGH residual

The one structural HIGH residual risk in [`THREAT_MODEL.md`](THREAT_MODEL.md)
(§2.H / §5 / §7 P3). Highest-value security investment left.

```
Ziel: Den Frontend-Build von ciphra byte-reproduzierbar machen und einen
verifizierbaren Bundle-Digest veröffentlichen, damit das ausgelieferte JS gegen
den öffentlichen Quellcode geprüft werden kann.

Kontext: ciphra ist ein browser-ausgeliefertes Zero-Knowledge-PWA (SvelteKit +
adapter-node, Node 24, Vite 8). THREAT_MODEL.md §2.H/§5 nennt den JS-Swap-Angriff
als EINZIGE strukturelle Restlücke mit Residualrisiko HIGH: ein server-seitiger
Angreifer, der das JS-Bundle tauscht, kann beim nächsten Login Keys exfiltrieren.
Mitigation = reproduzierbare Builds + veröffentlichte, signierte Hashes, sodass
Dritte/Watchdogs einen Swap erkennen können. cosign (keyless) ist bereits für die
Images im Einsatz; CSP läuft in mode:'hash'.

Umfang (design-first — erst kurzes Konzept, dann bauen):
- Nichtdeterminismus im Vite/SvelteKit-Output eliminieren (Timestamps, Build-IDs,
  Chunk-Reihenfolge). Nachweis: zwei saubere Builds desselben Commits sind
  byte-identisch (oder dokumentierter Rest-Nichtdeterminismus).
- Signiertes Manifest der Bundle-Hashes pro Release (cosign attest), plus eine
  Verify-Anleitung (aus dem getaggten Commit nachbauen + vergleichen).
- SRI auf alle JS-Chunks verdrahten, wo machbar (THREAT_MODEL notiert "not yet
  wired"). CSP darf sich dabei nicht lockern.
- Ehrlich abgrenzen: echte Per-User-Durchsetzung braucht den Nutzer; realistisch
  ist "source-available + reproducible + published hashes" = Swap wird erkennbar.

Regeln: Branch off frischem origin/main; /green-gate vor Push; NICHT mergen/
deployen (Operator); CHANGELOG-Eintrag für nutzer-sichtbare Teile; version-guard
+ Changelog-Guardrail beachten. THREAT_MODEL.md §7 P3 "Reproducible-build
pipeline" nach Abschluss aktualisieren.
Akzeptanz: reproduzierbarer Build nachgewiesen, Verify-Prozedur dokumentiert,
SRI verdrahtet soweit machbar.
```

### 2 — Per-invite sharing scope · security/product · user-driven

Today a family grant is all-or-nothing: it re-wraps the master key, so the
linked account can decrypt everything the patient has. PR #171 stopped the app
from *showing* a caregiver the diary and the locked entries, but that is a
client-side filter — the ciphertext still arrives and the key still opens it.
This item moves the decision to the invitation and makes the server enforce it.

Driven by a real user (2026-08-30) who asked whether the doctor she had sent an
invite link to could read her diary. Both answers must be first-class: she wants
to share everything, the next person will want the diary held back.

**Operator decision 2026-08-30 — the one-bit disclosure is accepted.** The
server may learn a per-document class saying whether the user considers a
document shareable. It stays at two classes until a user asks for finer
granularity; a full per-type label would tell the server the type of every
document, which is a bigger step and is not approved. `SECURITY_MODEL.md`
§What the server can see must name the new field in the same change.

```
Ziel: Beim Erstellen einer Familien-Einladung wählbar machen, was dieser Zugriff
sehen darf — und die Wahl SERVERSEITIG durchsetzen, nicht nur im Client anzeigen.

Kontext: Ein family_grant wrappt den master_key des Patienten neu, der verknüpfte
Account entschlüsselt also alles. PR #171 filtert Tagebuch + gesperrte Einträge
client-seitig aus der Caregiver-Ansicht (`isVisibleToCaregiver` in
lib/utils/exportable.ts) — ehrlich, aber keine echte Grenze. Der Server kann nicht
nach Typ filtern: der Typ liegt IM Ciphertext (docs/ARCHITECTURE.md §Data model).
Operator-Entscheid 2026-08-30: EIN Bit pro Dokument darf der Server sehen.

Umfang:
- `encrypted_documents.share_class SMALLINT NULL` — der Client stempelt es beim
  Schreiben aus dem Klartext-Typ (er kennt ihn ohnehin). SMALLINT statt Boolean,
  damit die Partition später ohne zweite Migration feiner werden kann.
- `family_grants.share_mask INT` — Bitmaske erlaubter Klassen. Heute: 1 =
  teilbar, 2 = Tagebuch/gesperrt; "alles teilen" = 3.
- `family_documents_list` filtert per Maske. Der Caregiver bekommt die Zeile gar
  nicht erst.
- FAIL CLOSED: NULL = nicht klassifiziert = nicht geteilt. Sonst fliessen am
  Deploy-Tag alle Alt-Tagebücher wieder. Der Client des PATIENTEN backfillt
  seinen Bestand nach dem nächsten erfolgreichen load() in EINEM Batch-Call
  (Vorbild: /api/documents/batch + nginx-Zone api_batch). Bis dahin sieht ein
  Caregiver WENIGER, nie mehr.
- Zwei Guards: (a) der Caregiver darf NICHT umklassifizieren — `share_class` auf
  dem family-POST/PUT-Pfad ignorieren, nur der Owner setzt sie; (b) das
  Verengen eines bestehenden Grants hat dieselbe Eigenschaft wie ein Widerruf —
  bereits Heruntergeladenes bleibt beim Empfänger (Satz aus
  `family.revoke_caveat` übernehmen).
- UI in FamilySharing.svelte: zwei Optionen beim Erstellen, Default ist die
  ENGERE ("Alles ausser Tagebuch und gesperrten Einträgen" / "Alles, auch das
  Tagebuch"). Gewählter Umfang nochmals im Reveal-Schritt vor dem Versenden,
  pro Grant in der Liste sichtbar, nachträglich änderbar.
- i18n 4 Locales, DE mit 'ss'. Brand-Voice: sagen, was der Zugriff zeigt, nicht
  was "wir nicht können".
- Docs: SECURITY_MODEL.md §What the server can see (das neue Feld benennen),
  ARCHITECTURE.md (beide Tabellen), FEATURES.md §Family sharing, CHANGELOG als
  MINOR (neue Fähigkeit, rückwärtskompatibel, nichts wird unlesbar).

Nicht in diesem Umfang: Klasse 2 unter einem eigenen Schlüssel verschlüsseln, den
kein Grant je erhält. Das wäre die einzige Variante, die auch gegen bereits
heruntergeladene Bytes schützt — aber Key-Hierarchie-Änderung = MAJOR plus
Re-Encryption-Migration (docs/VERSIONING.md). Als Endausbau notieren, nicht bauen.

Regeln: Branch off frischem origin/main; /green-gate vor Push; NICHT mergen/
deployen (Operator); CHANGELOG + version-guard. Client-Filter aus PR #171 bleibt
als Defense-in-Depth bestehen.
Akzeptanz: Umfang bei der Einladung wählbar und nachträglich änderbar; der
Server liefert einem Grant nur erlaubte Klassen (Test gegen die rohe API, nicht
nur gegen die UI); Backfill nachgewiesen; Fail-closed nachgewiesen; Docs
aktualisiert.
```

### 3 — Backup tamper-evidence (third hash store) · ops · P2

[`THREAT_MODEL.md`](THREAT_MODEL.md) §2.D / §7 P2. Medium size, code-side buildable.

```
Ziel: Manipulationsnachweis für die ciphra-Backups — ein unabhängiger,
append-only Hash-Log, mit dem sich jedes Backup als unverändert verifizieren lässt.

Kontext: THREAT_MODEL.md §2.D + §7 P2. Backups: pg_dump → gzip → age-encrypt →
rclone auf RCLONE_PRIMARY (Infomaniak Swiss Backup) + RCLONE_SECONDARY
(cross-vendor, aktiv seit 2026-08). Lücke: kein Tamper-Evidence — ein getauschtes/
gekürztes Backup fällt erst beim Restore auf. Skript: golive/backup/backup.sh
(gitignored, läuft auf dem VPS; Laptop ist kanonisch, rsync auf VPS).

Umfang:
- backup.sh erweitern: nach dem age-Dump dessen SHA-256 in einen append-only Log
  in einem DRITTEN, von beiden Backup-Stores UNABHÄNGIGEN Ort schreiben
  (z.B. eigener Provider / transparenz-artiger Append-Log / HC.io- oder
  ntfy-archiviert). Unabhängigkeit ist der Kern — nicht Infomaniak, nicht R2/B2.
- Verify-Schritt im Quarterly-Restore-Drill: Hash des restaurierten Dumps gegen
  den Log prüfen.
- Solo-Operator-tauglich halten; age PRIVATE key bleibt off-VPS.

Regeln: golive/ ist gitignored → Skript vorbereiten + übergeben, OPERATOR
installiert/rsynct (Assistant SSHt nie auf den VPS). OPERATIONS.md (Backup-Sektion)
+ THREAT_MODEL.md §7 P2 nach Abschluss aktualisieren (P2 → done).
Akzeptanz: backup.sh schreibt pro Lauf einen Hash in den unabhängigen Store;
Verify-Schritt vorhanden; Docs aktualisiert.
```

### 4 — SEO / SSR-landing architectural fix · product

The biggest product lever. A prior SSR landing was shipped then reverted because
it broke registration (operator memory `project_seo_state`).

```
Ziel: Die öffentliche Landing (und öffentliche Docs) server-seitig
rendern/prerendern für SEO, OHNE den client-seitigen Zero-Knowledge-Registrier-/
Auth-Flow zu brechen.

Kontext: Memory project_seo_state — eine SSR-Landing wurde schon einmal
ausgeliefert und dann ZURÜCKGEROLLT, weil sie die Registrierung brach. SEO-
Foundation ist geshippt (PR #40). Stack: SvelteKit + adapter-node; Krypto/
Registrierung laufen bewusst client-seitig (WebCrypto/Argon2-WASM).

Umfang (design-first — erst Ursache des alten Reverts aus der Git-History klären):
- Wahrscheinliche Revert-Ursache: SSR der Landing fasste Auth-Stores oder
  browser-only Krypto beim Render an / Hydration-Mismatch. Verifizieren.
- Ansatz: öffentliche Routen (Landing, /docs, /conditions, /privacy, /terms) →
  prerender/SSR; App-Routen (/setup, /login, /dashboard, …) → CSR
  (`export const ssr = false` pro Route). Landing ist weitgehend statisch →
  prerender ist am sichersten (kein Runtime-SSR, keine Auth-Interferenz).
- CSP darf sich nicht lockern; keine neuen Origins ohne connect-src-Eintrag.
Verifikation: Registrierung + Login nachweislich unversehrt (e2e); Landing-HTML
enthält indexierbaren Inhalt + Meta; Visual-Smoke (green ≠ shipped — echter
Browser-Eyeball, e2e/visual-smoke.spec.ts).

Regeln: Branch off frischem origin/main; /green-gate + Visual-Smoke vor Push;
NICHT mergen/deployen; i18n-Parität (4 Locales) + CHANGELOG für nutzer-sichtbare
Teile. Produktseitig, kein Security-Thema.
Akzeptanz: öffentliche Landing prerendered/SSR mit indexierbarem Inhalt;
Registrier-/Login-Flow per e2e intakt; CSP unverändert; dokumentiert.
```

---

## Operator-only actions (no code — the assistant can't do these)

- **Age-key rotation reminder** — currently manual; add a calendar entry or a
  cron→ntfy (Dec 15 / Jun 15). [`OPERATIONS.md`](OPERATIONS.md) Future work.
- **Hardware-key 2FA** for the Cloudflare + Infomaniak accounts
  ([`THREAT_MODEL.md`](THREAT_MODEL.md) §7 P3) — "when the YubiKey arrives".
- **Verify logrotate is installed** on the VPS (rotated `ciphra-*.log.1` files
  suggest it runs; confirm `/etc/logrotate.d/ciphra` exists).

## Decided — do NOT re-propose

- **SBOM generation in CI** — declined (Trivy already covers CVE detection; SBOM
  is provenance-only and not wanted). 2026-08-23.
- **HSTS preload list submission** — skipped; the `preload` header stays (protects
  returning visitors), no ~2-year list lock-in. 2026-08-23.
- **security-monitor edge-header leg** — accepted as inconclusive from CI
  (Free-plan Bot Fight can't be reliably skipped; the header config is CI-guarded
  and the CF-only TLS drift is covered). 2026-08-23.
