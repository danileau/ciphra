### Fixed
- **Signing in with the right password could fail on a phone.** When you
  tapped the eye icon to check your password, the keyboard could quietly
  capitalize its first letter, autocorrect it or swap in curly quotes — so the
  password ciphra received was no longer the one you typed. Password fields now
  keep exactly what you type, and the login form tells your password manager
  which saved login to fill.
- A recovery or family code typed with a capital letter or a double space was
  accepted but then rejected as wrong. Codes now work however they are
  capitalized or spaced.
