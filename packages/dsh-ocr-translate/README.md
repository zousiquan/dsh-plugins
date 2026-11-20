# dsh-ocr-translate

A [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) plugin that
adds an **OCR translate** entry to the left sidebar. The entry opens a central
panel for extracting text from images (OCR) and translating it.

- **OCR**: offline, through a local [Tesseract](https://github.com/tesseract-ocr/tesseract)
  binary (Chinese + English by default).
- **Translation**: through DSH's built-in experimental `translator` service
  (anonymous Bing endpoint, no API key).

## Prerequisites

OCR needs a Tesseract binary with the language data you want. The plugin does
**not** bundle Tesseract; install it yourself, then the panel detects it
automatically.

macOS (Homebrew):

```sh
brew install tesseract
# Chinese language data (the formula ships only eng + osd):
curl -fL -o "$(brew --prefix)/share/tessdata/chi_sim.traineddata" \
  https://github.com/tesseract-ocr/tessdata_best/raw/main/chi_sim.traineddata
```

Other platforms: install Tesseract via your package manager and add the
`chi_sim` (and any other) traineddata to its `tessdata` directory. If Tesseract
is not on a standard path, set `tesseractPath` (and optionally `tessdataDir`) in
the plugin config.

Translation needs network access to the anonymous Bing endpoint; no key required.

## Installation

**Via the plugin index (Discover):** enable the experimental *Custom plugin
index* bundle, open **Plugins → Discover → Add index source**, and add the index
URL published with this repository. Then install **dsh-ocr-translate** from its
card.

**From a local checkout:** **Plugins → Add plugin** and choose this directory.

Requires DSH `>=0.2.2-rc.5` (see `engines.dsh`).

## Usage

1. Click **OCR translate** in the left sidebar.
2. Load an image: click the drop area to choose a file, drag an image onto it, or
   paste a screenshot (⌘V) while the panel is open.
3. Click **Extract text**. The Host runs local Tesseract OCR and fills the editable
   text area (spaces between CJK characters are joined automatically).
4. Edit the extracted text if needed, pick a **Target language**, and click
   **Translate**.
5. Use **Copy** on either the extracted text or the translation.

## How it works

- The Host registers three owner-only routes on the Connection `/api` bridge:
  `ocr` (binary image → Tesseract subprocess → text), `translate`
  (`ctx.translator.resolve` + `translate`, long text split into fragments within
  `maxTextChars`), and `info` (capabilities). The image is written to a temporary
  file, recognised, and the file is removed.
- The browser half registers the `sidebar.panellist` entry and the matching
  `main` panel, styled with the host theme tokens.

## Configuration

The plugin row accepts these config fields (see `cordis.patch.yml`):

| Field | Default | Meaning |
|---|---|---|
| `languages` | `chi_sim+eng` | Tesseract language pack(s) used for OCR. |
| `tesseractPath` | auto-detected | Absolute path to the Tesseract binary. |
| `tessdataDir` | unset | Optional `--tessdata-dir` for language data. |
| `translationProvider` | `bing` | Anonymous translation endpoint (`bing` or `google`). |
| `defaultTargetLanguage` | `zh-Hans` | Initial target language in the panel. |
| `maxImageBytes` | `20971520` | Largest accepted image (20 MiB). |
| `timeoutMs` | `60000` | OCR subprocess deadline. |

## Limitations

- OCR requires a Tesseract binary with the relevant language data (for Chinese,
  `chi_sim.traineddata`). If it is not found, the panel shows a warning and OCR is
  disabled until you install Tesseract or set `tesseractPath`.
- Translation depends on an unofficial anonymous endpoint that may rate-limit or
  change; availability depends on your network.
- macOS system Vision OCR is not used: it lacks CJK language assets on some systems.
- The panel keeps its image and text only while it is the active central panel;
  navigating away and back resets it.
- The bundle mounts the experimental `translator` service (patch row id
  `translator`, provider `bing`) so translation works out of the box. If another
  bundle already inserts a row with that id, remove the duplicate from this patch.
- Tesseract is re-detected on each OCR/info request, so installing it after the
  plugin is enabled works without a reload.
- Turning the plugin off removes the sidebar entry and panel. No session data is stored.

## License

[MIT](LICENSE)