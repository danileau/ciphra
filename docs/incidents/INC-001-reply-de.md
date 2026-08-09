# INC-001 — Antwortvorlage (DE)

Template for replying to a migrant stranded by INC-001. Placeholders in
`{{ }}`. Deliberately contains no personal data — fill it in when sending, do
not commit a filled-in copy.

Generate `{{RECOVERY_LINK}}` with:

```bash
scripts/unblock-migrant.sh <token> www.epilepc.ch
```

Voice: `du`, Swiss German (`ss`, never `ß`), no blame-shifting and no
over-apologising. State what broke, what it means for their data, what to do
next.

---

**Betreff:** Re: Migration von epilepc zu ciphra — behoben, dein Link funktioniert wieder

Guten Tag

danke für die Meldung, und entschuldige den Ärger.

Der Fehler lag bei uns. Dein Migrationslink zeigte auf `epilepc.ch`, und dieser
Host leitet nur auf `www.epilepc.ch` weiter. Bei einer Datenübertragung zwischen
zwei Websites bricht der Browser eine solche Weiterleitung aus
Sicherheitsgründen ab. Darum die Fehlermeldung — und darum ist bei epilepc gar
keine Anfrage angekommen.

Zwei gute Nachrichten:

1. **Es sind keine Daten verloren.** Alles liegt unverändert auf epilepc.
2. **Dein Migrationslink wurde nie eingelöst** und ist weiterhin gültig.

Hier ist der korrigierte Link:

{{RECOVERY_LINK}}

So gehst du vor:

1. Melde dich bei ciphra mit deinem bestehenden Konto an ({{CIPHRA_USERNAME}}).
2. **Starte nicht den Einrichtungs-Assistenten**, auch wenn ciphra ihn dir
   anbietet. Öffne direkt den Link oben.
3. Der Import läuft dann durch, und du siehst vorher eine Übersicht, was
   übertragen wird.

Der Link ist bis {{EXPIRES_AT}} gültig. Falls etwas nicht klappt, melde dich
einfach nochmals — mit Screenshot der Fehlermeldung, falls möglich.

Zur Einordnung: du bist auf einen echten Fehler von uns gestossen, nicht auf
einen Bedienfehler. Die Ursache ist gefunden und behoben, und wir haben einen
automatischen Test ergänzt, der genau diesen Fall künftig abfängt. Danke, dass
du dir die Zeit für die Meldung genommen hast.

Freundliche Grüsse
{{SIGNATURE}}

---

## Falls sie sich auf epilepc nicht einloggen können

Separate Ursache (Session-Speicher, siehe INC-001 §Ops). Ergänze dann:

> Falls du dich auf epilepc momentan nicht einloggen kannst: das ist ein
> separates Problem auf unserer Seite, an dem wir arbeiten. Für die Migration
> brauchst du kein epilepc-Login — der Link oben genügt.
