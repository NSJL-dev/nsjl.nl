# NSJL self-hosted fonts

The WOFF2 files in this directory were downloaded without modification from
Google Fonts' official font CDN on 2026-10-15. `manifest.json` records the exact
source URLs, sizes and SHA-256 digests. The original stylesheet request is also
recorded there for provenance; the application never requests it at runtime.

- **Nunito v32**, normal weights **400, 600, 700, 800, 900**: Latin,
  Latin Extended, Cyrillic, Cyrillic Extended and Vietnamese subsets.
- **Bebas Neue v16**, normal weight **400**: Latin and Latin Extended subsets.

`app/fonts.css` preserves the original Google Fonts declarations (family names,
weights, `font-display: swap` and Unicode ranges), changing only the URLs to
same-origin files. Nunito's variable binary is shared by its five separately
declared weights, matching the original stylesheet's weight selection.

Both families are distributed under the **SIL Open Font License 1.1**. The
unmodified license files are included alongside the font files:

- `OFL-nunito.txt`, from https://github.com/google/fonts/blob/main/ofl/nunito/OFL.txt
- `OFL-bebas-neue.txt`, from https://github.com/google/fonts/blob/main/ofl/bebasneue/OFL.txt

Do not replace these with Nunito Sans, another Bebas family, synthesized weights
or newly subsetted/re-encoded files without checking visual parity and licenses.
No external font request or font download is needed during build or page load.
