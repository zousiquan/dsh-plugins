# dsh-plugins

A monorepo of [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)
plugins by [@zousiquan](https://github.com/zousiquan). Each plugin lives in
`packages/<name>` and is an installable DSH bundle (`dsh.bundle`).

## Plugins

| Package | Description |
|---|---|
| [`dsh-ocr-translate`](packages/dsh-ocr-translate) | Left-sidebar panel: extract text from images with Tesseract OCR and translate it via the built-in translator. |

## Installing

Each plugin's README lists its prerequisites and config. Install via the DSH
**Plugins → Discover** tab by adding the plugin index published from this repo,
or **Plugins → Add plugin** pointing at a local `packages/<name>` directory.

## Publishing

Versions are tagged per package as `<name>@X.Y.Z` (for example
`dsh-ocr-translate@1.0.0`). The plugin index (`index.json`) is generated from
these packages and hosted on GitHub Pages.

## License

Each package declares its own license (see the package directory).