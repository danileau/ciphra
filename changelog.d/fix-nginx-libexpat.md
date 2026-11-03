### Security
- Updated a library inside the web server that sits in front of ciphra,
  closing two flaws in how it reads XML. ciphra's web server never reads XML,
  so they were not exploitable here — patched regardless.
