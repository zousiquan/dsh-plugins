/**
 * Host half of the OCR & Translate bundle.
 *
 * Owns three owner-only routes on the Connection `/api` bridge:
 *   POST /api/ocr-translate/ocr        binary image -> Tesseract -> { ok, text }
 *   POST /api/ocr-translate/translate  { text, targetLanguage } -> translator -> { ok, text }
 *   GET  /api/ocr-translate/info       capabilities the panel reads on mount
 *
 * OCR shells out to a local Tesseract binary (no network). Translation reuses the
 * mounted experimental `translator` service through its anonymous Bing/Google
 * endpoint, so it needs no API key and stays stateless (no Session records).
 */
import { spawn, spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdtemp, writeFile, rm } from 'node:fs/promises'
import { tmpdir, homedir } from 'node:os'
import { join } from 'node:path'

export const inject = ['connection', 'translator']

const OCR_PATH = '/api/ocr-translate/ocr'
const TRANSLATE_PATH = '/api/ocr-translate/translate'
const INFO_PATH = '/api/ocr-translate/info'

const JSON_HEADERS = {
  'content-type': 'application/json; charset=utf-8',
  'cache-control': 'no-store',
  'x-content-type-options': 'nosniff',
}

/** Common absolute Tesseract locations, tried before probing the process PATH. */
const TESSERACT_CANDIDATES = [
  join(homedir(), '.homebrew/bin/tesseract'),
  '/opt/homebrew/bin/tesseract',
  '/usr/local/bin/tesseract',
  '/usr/bin/tesseract',
]

/** Whether a bare `tesseract` on the process PATH actually runs. */
function pathHasTesseract() {
  try {
    const result = spawnSync('tesseract', ['--version'], { timeout: 5000, encoding: 'utf8' })
    return result.status === 0
  } catch (_error) {
    return false
  }
}

function resolveTesseract(config) {
  const configured = typeof config.tesseractPath === 'string' && config.tesseractPath.trim() !== ''
    ? config.tesseractPath.trim()
    : undefined
  if (configured !== undefined) {
    return { path: configured, available: existsSync(configured) || !configured.startsWith('/') }
  }
  for (const candidate of TESSERACT_CANDIDATES) {
    if (existsSync(candidate)) return { path: candidate, available: true }
  }
  if (pathHasTesseract()) return { path: 'tesseract', available: true }
  return { path: 'tesseract', available: false }
}

function json(value, status = 200) {
  return new Response(JSON.stringify(value), { status, headers: JSON_HEADERS })
}

/** Read the whole request body into one buffer, refusing anything over `limit`. */
async function readBounded(request, limit) {
  const declared = Number(request.headers.get('content-length') ?? Number.NaN)
  if (Number.isFinite(declared) && declared > limit) {
    await request.body?.cancel()
    return undefined
  }
  const chunks = []
  let total = 0
  if (request.body !== null) {
    const reader = request.body.getReader()
    try {
      for (let chunk = await reader.read(); !chunk.done; chunk = await reader.read()) {
        total += chunk.value.byteLength
        if (total > limit) {
          await reader.cancel()
          return undefined
        }
        chunks.push(chunk.value)
      }
    } finally {
      reader.releaseLock()
    }
  }
  const buffer = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    buffer.set(chunk, offset)
    offset += chunk.byteLength
  }
  return buffer
}

/** Map an image media type to a file extension Leptonica recognises. */
function extensionFor(mediaType) {
  const type = (mediaType ?? '').split(';', 1)[0].trim().toLowerCase()
  if (type === 'image/jpeg' || type === 'image/jpg') return '.jpg'
  if (type === 'image/webp') return '.webp'
  if (type === 'image/bmp') return '.bmp'
  if (type === 'image/tiff') return '.tif'
  if (type === 'image/gif') return '.gif'
  return '.png'
}

/** Tesseract inserts spaces between CJK ideographs; join them back together. */
function cleanOcrText(text) {
  const cjk = '\\u3400-\\u4dbf\\u4e00-\\u9fff\\uf900-\\ufaff'
  const between = new RegExp(`([${cjk}])[ \\t]+(?=[${cjk}])`, 'g')
  return text.replace(between, '$1')
}

/** Run Tesseract on one image file and resolve its recognised text. */
function runTesseract(binary, imagePath, config, signal) {
  const args = [imagePath, 'stdout', '-l', config.languages, '--psm', '3']
  if (typeof config.tessdataDir === 'string' && config.tessdataDir.trim() !== '') {
    args.push('--tessdata-dir', config.tessdataDir.trim())
  }
  return new Promise((resolve, reject) => {
    signal.throwIfAborted()
    const child = spawn(binary, args, { timeout: config.timeoutMs })
    let stdout = ''
    let stderr = ''
    let settled = false
    const finish = (fn, value) => { if (!settled) { settled = true; fn(value) } }
    const onAbort = () => { child.kill('SIGKILL') }
    signal.addEventListener('abort', onAbort, { once: true })
    child.stdout.setEncoding('utf8')
    child.stderr.setEncoding('utf8')
    child.stdout.on('data', (data) => { stdout += data })
    child.stderr.on('data', (data) => { stderr += data })
    child.on('error', (error) => {
      signal.removeEventListener('abort', onAbort)
      finish(reject, error)
    })
    child.on('close', (code) => {
      signal.removeEventListener('abort', onAbort)
      if (signal.aborted) { finish(reject, new Error('OCR cancelled')); return }
      if (code === 0) finish(resolve, stdout.replace(/\n+$/, ''))
      else finish(reject, new Error(`tesseract exited with code ${code}: ${stderr.trim().slice(0, 400)}`))
    })
  })
}

/** Split text into fragments no longer than `limit`, preferring whitespace cuts. */
function fragments(text, limit) {
  const result = []
  let remaining = text
  while (remaining.length > limit) {
    let cut = limit
    // Avoid splitting a surrogate pair.
    if (/[\uD800-\uDBFF]/.test(remaining.charAt(cut - 1))) cut -= 1
    const whitespace = remaining.slice(0, cut).search(/\s+\S*$/)
    if (whitespace > 0) cut = whitespace
    result.push(remaining.slice(0, cut))
    remaining = remaining.slice(cut)
  }
  if (remaining.length > 0) result.push(remaining)
  return result
}

export function apply(ctx, config = {}) {
  const settings = {
    languages: typeof config.languages === 'string' && config.languages.trim() !== '' ? config.languages.trim() : 'chi_sim+eng',
    translationProvider: config.translationProvider === 'google' ? 'google' : 'bing',
    defaultTargetLanguage: typeof config.defaultTargetLanguage === 'string' ? config.defaultTargetLanguage : 'zh-Hans',
    maxImageBytes: Number.isFinite(config.maxImageBytes) && config.maxImageBytes > 0 ? config.maxImageBytes : 20 * 1024 * 1024,
    timeoutMs: Number.isFinite(config.timeoutMs) && config.timeoutMs > 0 ? config.timeoutMs : 60000,
    tessdataDir: config.tessdataDir,
    tesseractPath: config.tesseractPath,
  }
  let binary = resolveTesseract(settings)

  async function ocrRoute(request) {
    try {
      const mediaType = request.headers.get('content-type') ?? 'image/png'
      if (!mediaType.toLowerCase().startsWith('image/')) {
        return json({ ok: false, error: 'content type must be an image' }, 415)
      }
      // Re-probe so a Tesseract installed after activation is picked up without a reload.
      if (!binary.available) binary = resolveTesseract(settings)
      if (!binary.available) {
        await request.body?.cancel()
        return json({ ok: false, error: 'Tesseract binary not found. Install Tesseract or set tesseractPath in the plugin config.' }, 503)
      }
      const bytes = await readBounded(request, settings.maxImageBytes)
      if (bytes === undefined) {
        return json({ ok: false, error: `image exceeds ${settings.maxImageBytes} bytes` }, 413)
      }
      if (bytes.byteLength === 0) {
        return json({ ok: false, error: 'empty image' }, 400)
      }
      const dir = await mkdtemp(join(tmpdir(), 'dsh-ocr-'))
      const imagePath = join(dir, `image${extensionFor(mediaType)}`)
      try {
        await writeFile(imagePath, bytes)
        const text = cleanOcrText(await runTesseract(binary.path, imagePath, settings, request.signal))
        return json({ ok: true, text })
      } finally {
        await rm(dir, { recursive: true, force: true }).catch(() => undefined)
      }
    } catch (error) {
      if (request.signal.aborted) return json({ ok: false, error: 'OCR cancelled' }, 499)
      ctx.logger.warn('ocr-translate: OCR failed', error)
      return json({ ok: false, error: error instanceof Error ? error.message : String(error) }, 500)
    }
  }

  async function translateRoute(request) {
    let payload
    try {
      payload = await request.json()
    } catch (_error) {
      return json({ ok: false, error: 'request body must be JSON' }, 400)
    }
    const text = typeof payload?.text === 'string' ? payload.text : ''
    const targetLanguage = typeof payload?.targetLanguage === 'string' ? payload.targetLanguage : settings.defaultTargetLanguage
    const sourceLanguage = typeof payload?.sourceLanguage === 'string' && payload.sourceLanguage !== '' ? payload.sourceLanguage : undefined
    if (text.trim() === '') return json({ ok: false, error: 'text is empty' }, 400)
    const translator = ctx.translator
    const limit = translator.maxTextChars
    try {
      const parts = fragments(text, limit)
      const translated = []
      for (const part of parts) {
        request.signal.throwIfAborted()
        const spec = translator.resolve({ text: part, targetLanguage, sourceLanguage, provider: settings.translationProvider })
        translated.push(await translator.translate(spec, request.signal))
      }
      return json({ ok: true, text: translated.join('') })
    } catch (error) {
      if (request.signal.aborted) return json({ ok: false, error: 'translation cancelled' }, 499)
      ctx.logger.warn('ocr-translate: translation failed', error)
      const message = error instanceof Error ? error.message : String(error)
      return json({ ok: false, error: message }, 502)
    }
  }

  async function infoRoute() {
    if (!binary.available) binary = resolveTesseract(settings)
    return json({
      ok: true,
      value: {
        ocrAvailable: binary.available,
        tesseractPath: binary.path,
        languages: settings.languages,
        maxImageBytes: settings.maxImageBytes,
        maxTextChars: ctx.translator.maxTextChars,
        translationProvider: settings.translationProvider,
        defaultTargetLanguage: settings.defaultTargetLanguage,
      },
    })
  }

  ctx.effect(
    () => ctx.connection.fetch.register({ path: OCR_PATH, methods: ['POST'], requestBody: 'streaming', fetch: ocrRoute }),
    'ocr-translate: OCR route',
  )
  ctx.effect(
    () => ctx.connection.fetch.register({ path: TRANSLATE_PATH, methods: ['POST'], requestBody: 'buffered', fetch: translateRoute }),
    'ocr-translate: translate route',
  )
  ctx.effect(
    () => ctx.connection.fetch.register({ path: INFO_PATH, methods: ['GET'], requestBody: 'buffered', fetch: infoRoute }),
    'ocr-translate: info route',
  )
}