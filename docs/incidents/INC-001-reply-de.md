# INC-001 — Antwortvorlage (DE)

Für den von INC-001 betroffenen Migranten. Platzhalter in `{{ }}`; keine
personenbezogenen Daten committen.

Link erzeugen mit:

```bash
scripts/unblock-migrant.sh <token> www.epilepc.ch
```

Ton: `du`, Schweizer Rechtschreibung (`ss`, nie `ß`). Sagen, was kaputt war,
was das für seine Daten heisst, was er jetzt tut. Keine Schuldverschiebung,
kein Übermass an Entschuldigung.

**Voraussetzung:** ciphra #125 (Login-Tab auf `/migrate`) muss deployt sein.
Vorher fehlt ihm die Anmelde-Option und der Text stimmt nicht.

---

**Betreff:** Re: Migration von epilepc zu ciphra — behoben

Guten Tag

danke für die Meldung, und entschuldige den Ärger.

Der Fehler lag bei uns. Dein Migrationslink zeigte auf einen Server, der die
Anfrage nur weitergeleitet statt beantwortet hat — der Browser bricht das aus
Sicherheitsgründen ab. Darum die Fehlermeldung, und darum ist bei epilepc gar
keine Anfrage angekommen.

Zwei gute Nachrichten:

1. **Es sind keine Daten verloren.** Alles liegt unverändert auf epilepc.
2. **Dein Migrationslink wurde nie eingelöst** und ist weiterhin gültig.

Hier ist der korrigierte Link:

{{RECOVERY_LINK}}

Du hast auf ciphra bereits ein Konto ({{CIPHRA_USERNAME}}). Wähle beim Öffnen
des Links den Reiter **Anmelden** statt Registrieren — danach läuft die
Übertragung durch.

Der Link ist bis {{EXPIRES_AT}} gültig. Falls etwas klemmt, melde dich
nochmals, am besten mit Screenshot.

Zur Einordnung: du bist auf einen echten Fehler von uns gestossen, nicht auf
einen Bedienfehler. Die Ursache ist behoben, und wir haben Tests ergänzt, die
genau diesen Fall künftig abfangen. Danke, dass du dir die Zeit genommen hast.

Freundliche Grüsse
{{SIGNATURE}}

---

## Was hier bewusst NICHT mehr steht

- **„Starte den Einrichtungs-Assistenten nicht zuerst."** War nötig, solange ein
  nicht-epilepsie-Blueprint dazu führte, dass importierte Anfälle unsichtbar
  blieben. `ensureEpisodeTypes` (#117, deployt) ergänzt die fehlenden
  Anfallstypen jetzt automatisch — die Warnung wäre nur noch Ballast.
- **Die Anleitung um die Schein-Registrierung herum.** Mit dem Login-Tab (#125)
  ist die Anmeldung sichtbar, statt sich hinter einem provozierten Fehler zu
  verstecken.
- **Technische Details zu CORS und Weiterleitungen.** Für ihn ohne Wert; die
  Rekonstruktion steht in `INC-001.md`.

## Falls er sich auf epilepc nicht einloggen kann

Sollte behoben sein (Session-Speicher, epilepc#70). Falls doch:

> Für die Migration brauchst du kein epilepc-Login — der Link oben genügt.
