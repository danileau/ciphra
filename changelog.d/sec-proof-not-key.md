### Security
- **Recovering an account and accepting a family invitation no longer send
  your unlocking key to the server.** Both steps used to send the key that
  unlocks your data's master key, and the server keeps an encrypted copy of
  that master key. Anyone able to read that one request on the server side
  could have unlocked the account. Your browser now sends only a one-way proof
  derived from the key, and the server stores only a hash of that proof.
  Existing accounts and invitations are converted automatically; you do not
  need to do anything.
