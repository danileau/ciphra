### Fixed
- **The calendar spoke German to everyone after a reload.** Opening or
  refreshing the calendar in English, French or Italian left every day's
  screen-reader label in German — and reading "no entry" on days that had
  one. Both are right now, in every language.
- **A broken family-invite link explained itself in German.** The message on
  `/join` is now in the language of the person opening it, which for an
  invite link is always someone arriving cold.
- The date field's format hint read `TT.MM.JJJJ` in every language; it now
  says `DD.MM.YYYY`, `JJ.MM.AAAA` or `GG.MM.AAAA` as appropriate.
- The doctor PDF was saved as `…-bericht-….pdf` whatever your language, and
  its first CSV column was headed `date`. Both follow your language now.
- Screen readers announced "untitled page" after moving between pages: the
  day view, journal, calendar, reports, settings, setup, login and the invite
  page had no title. The main navigation, the dialog close button and the
  landing page's browser title were English-only.
