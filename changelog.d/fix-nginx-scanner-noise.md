### Security
- Rebuilt ciphra's server on current, patched system packages, picking up a
  fixed Kerberos library. ciphra never runs the Kerberos services those flaws
  are in, so they were not exploitable here - patched regardless.
- The web server now turns away automated probes for configuration and
  secret files that ciphra does not have, before they reach the app.
