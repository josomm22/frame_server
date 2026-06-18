# Credits & attribution

The image pipeline in `src/imaging/` is an in-house port of **epdoptimize** by
[paperlesspaper](https://paperlesspaper.de). The dithering, color-matching,
tone-mapping, dynamic-range-compression and two-palette (calibrated → device
color) algorithms, and the Spectra 6 palette data, are derived from that project.
We reshaped the I/O (raw `sharp` RGBA buffers instead of a canvas) but kept the
algorithms and palette values verbatim. See `ARCHITECTURE.md` for what was ported
vs. skipped.

- **epdoptimize** — https://github.com/paperlesspaper/epdoptimize
  Licensed under Apache License 2.0; a copy is included at
  [`LICENSES/epdoptimize-Apache-2.0.txt`](LICENSES/epdoptimize-Apache-2.0.txt).
  Last reconciled against upstream **1.3.0** (`vendor/epdoptimize` @ `cc15cc5`).

## Upstreams epdoptimize itself credits

epdoptimize builds on prior art, which we credit transitively:

- **epaper-image-convert** (aitjcize) — https://github.com/aitjcize/epaper-image-convert
  Origin of the `aitjcize-spectra6` calibrated palette and the inspiration for the
  exposure / saturation / contrast / S-curve tone controls.
- **opendithering** (GuySie) — https://github.com/GuySie/opendithering
- **dither-me-this** (DitheringIdiot) — https://github.com/DitheringIdiot/dither-me-this
- **Inkify** (cmdwtf) — https://github.com/cmdwtf/Inkify
- **eInk Dither Tester** (mattcarter11) — https://github.com/mattcarter11/eink-dithering-tester
- **DitherIt** — https://ditherit.com/

## Other dependencies

Runtime libraries are credited via their own licenses in `node_modules` /
`package.json` (notably `sharp` / libvips, `express`, and `googleapis`).
