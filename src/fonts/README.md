# Bundled fonts

All files here are served from this origin at runtime — no font provider is contacted by the
browser. Each family is licensed under the SIL Open Font License 1.1
(https://openfontlicense.org), which permits self-hosting and redistribution in a product.

| File | Family | Source |
| --- | --- | --- |
| `dm-sans-*.woff2` | DM Sans | https://fonts.google.com/specimen/DM+Sans |
| `ibm-plex-sans-*.woff2` | IBM Plex Sans | https://fonts.google.com/specimen/IBM+Plex+Sans |
| `fraunces-*.woff2` | Fraunces | https://fonts.google.com/specimen/Fraunces |

The `fraunces-*` files are the variable font on `wght 100..900` and `opsz 9..144`, subset by
Google to `latin` and `latin-ext` in normal and italic.

## PDF static TTF fonts (`src/fonts/pdf/`)

Server-side PDF generation (`@react-pdf/renderer`) requires static `.ttf` files rather than `.woff2`.
`ibm-plex-sans-*.ttf` (weights 400, 600, 700) and `fraunces-700.ttf` are checked in from Google Fonts
under the same SIL Open Font License 1.1 so PDF generation remains network-independent and preserves
full Nigerian Latin-Extended diacritics (`Ọlámidé`) and currency glyphs (`₦`).
