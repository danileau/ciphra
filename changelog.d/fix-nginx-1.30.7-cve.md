### Security
- Updated the web server that sits in front of ciphra to nginx 1.30.7,
  closing several serious flaws in how it handles encrypted (TLS) and HTTP/2
  connections that could crash it or worse. Rebuilding it also picked up a
  fixed XML library, which ciphra's web server never uses.
