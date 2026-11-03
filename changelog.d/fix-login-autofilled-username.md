### Fixed
- **Signing in with a username your browser filled in works again.** On some
  phones — reported on an iPhone with Brave — the browser put a saved
  username in the field without telling the page, so ciphra sent an empty one
  and answered "wrong username or password" for credentials that were right.
  ciphra now reads what the field actually shows, also for the password and
  on the recovery form, and ignores invisible characters a keyboard or
  password manager can carry along.
- **When the field holds something that cannot be a username, ciphra says
  so.** Some password managers saved a recovery code, or nothing, as the
  username of a ciphra login, and fill it in every time. Instead of trying to
  sign in with it, ciphra now tells you the value was probably filled in from a
  saved login and how to correct that entry. Changing your password in
  Settings also tells the password manager which login it belongs to, so it no
  longer saves the new password under the wrong name.
