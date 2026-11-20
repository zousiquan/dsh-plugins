/**
 * Browser half of the OCR & Translate bundle.
 *
 * Registers a left-sidebar panel entry (`sidebar.panellist`) and the matching
 * central page (`main`, keyed by the same id). The page uploads/pastes an image,
 * extracts text through the Host Tesseract route, and translates the result
 * through the Host translator route. All network goes through the Host half via
 * the Connection `/api` bridge (owner-only), using the page transport carrier
 * when the Host runs in another execution context.
 */
window.__ModuleLoader__.load({
  id: 'dsh-ocr-translate',
  factory(require) {
    const React = require('react');
    const h = React.createElement;
    const { useState, useEffect, useRef, useCallback } = React;

    const NS = 'ocrTranslate';
    const PANEL_ID = 'ocr-translate';

    const zh = {
      panel: 'OCR 翻译',
      title: 'OCR 文字提取与翻译',
      subtitle: '上传图片或粘贴截图，提取文字后一键翻译。',
      dropHint: '点击选择、拖拽或粘贴图片到此处',
      dropActive: '松开以载入图片',
      choose: '选择图片',
      replace: '更换图片',
      clear: '清除',
      extract: '提取文字',
      extracting: '正在提取…',
      cancel: '取消',
      ocrResult: '提取结果',
      ocrPlaceholder: '提取的文字会显示在这里，可直接编辑。',
      ocrEmpty: '未识别到文字。',
      ocrFailed: '提取失败',
      ocrUnavailable: '未找到 Tesseract，请先安装或在插件配置中设置 tesseractPath。',
      translate: '翻译',
      translating: '正在翻译…',
      targetLang: '目标语言',
      transResult: '译文',
      transPlaceholder: '译文会显示在这里。',
      transFailed: '翻译失败',
      copy: '复制',
      copied: '已复制',
      copyFailed: '复制失败',
      needImage: '请先载入图片。',
      needText: '请先提取或输入文字。',
      nonImage: '请载入图片文件。',
      chars: '{count} 字符',
      loading: '正在加载…',
      connectFailed: '无法连接 Host 插件，请确认插件已启用。',
      retry: '重试',
    };
    const en = {
      panel: 'OCR translate',
      title: 'OCR text extraction & translation',
      subtitle: 'Upload or paste an image, extract its text, then translate it.',
      dropHint: 'Click, drag, or paste an image here',
      dropActive: 'Drop to load the image',
      choose: 'Choose image',
      replace: 'Replace image',
      clear: 'Clear',
      extract: 'Extract text',
      extracting: 'Extracting…',
      cancel: 'Cancel',
      ocrResult: 'Extracted text',
      ocrPlaceholder: 'Extracted text appears here and can be edited.',
      ocrEmpty: 'No text was recognised.',
      ocrFailed: 'Extraction failed',
      ocrUnavailable: 'Tesseract was not found. Install it or set tesseractPath in the plugin config.',
      translate: 'Translate',
      translating: 'Translating…',
      targetLang: 'Target language',
      transResult: 'Translation',
      transPlaceholder: 'The translation appears here.',
      transFailed: 'Translation failed',
      copy: 'Copy',
      copied: 'Copied',
      copyFailed: 'Copy failed',
      needImage: 'Load an image first.',
      needText: 'Extract or enter text first.',
      nonImage: 'Load an image file.',
      chars: '{count} characters',
      loading: 'Loading…',
      connectFailed: 'Cannot reach the Host plugin. Make sure it is enabled.',
      retry: 'Retry',
    };

    const LANGS = [
      ['zh-Hans', '简体中文'], ['zh-Hant', '繁體中文'], ['en', 'English'],
      ['ja', '日本語'], ['ko', '한국어'], ['fr', 'Français'], ['de', 'Deutsch'],
      ['es', 'Español'], ['ru', 'Русский'], ['pt', 'Português'], ['it', 'Italiano'],
      ['ar', 'العربية'], ['th', 'ไทย'], ['vi', 'Tiếng Việt'], ['hi', 'हिन्दी'],
    ];

    /** Fetch a Host route through the page carrier when present, else browser fetch. */
    function apiFetch(route, init) {
      const url = new URL(`api/ocr-translate/${route}`, document.baseURI);
      const carrier = globalThis.__DSH_TRANSPORT__ && globalThis.__DSH_TRANSPORT__.fetch;
      const doFetch = carrier || globalThis.fetch.bind(globalThis);
      return doFetch(url.href, init);
    }

    /** Decorative sidebar glyph; the sidebar owns the row label. */
    function PanelIcon({ size }) {
      return h('svg', {
        width: size, height: size, viewBox: '0 0 24 24', fill: 'none',
        'aria-hidden': true, style: { display: 'block' },
      },
        h('rect', { x: 3, y: 3, width: 13, height: 13, rx: 2, stroke: 'currentColor', strokeWidth: 1.6 }),
        h('path', { d: 'M6 7.5h7M6 10.5h7M6 13.5h4', stroke: 'currentColor', strokeWidth: 1.4, strokeLinecap: 'round' }),
        h('path', { d: 'M14.5 14.5l6 6M20.5 14.5l-6 6', stroke: 'currentColor', strokeWidth: 1.6, strokeLinecap: 'round' }),
      );
    }

    const CSS = `
.ocrt-root{height:100%;overflow:auto;padding:24px;box-sizing:border-box;color:var(--dsw-alias-label-primary);font-size:14px;line-height:1.5;}
.ocrt-wrap{max-width:920px;margin:0 auto;display:flex;flex-direction:column;gap:16px;}
.ocrt-title{font-size:20px;font-weight:600;margin:0;}
.ocrt-sub{margin:4px 0 0;color:var(--dsw-alias-label-secondary);font-size:13px;}
.ocrt-card{background:var(--dsw-alias-bg-layer-1);border:1px solid var(--dsw-alias-border-l1);border-radius:12px;padding:16px;display:flex;flex-direction:column;gap:12px;}
.ocrt-drop{border:1.5px dashed var(--dsw-alias-border-l2);border-radius:10px;padding:20px;display:flex;flex-direction:column;align-items:center;gap:10px;cursor:pointer;text-align:center;color:var(--dsw-alias-label-secondary);transition:border-color .15s,background .15s;}
.ocrt-drop:hover{border-color:var(--dsw-alias-brand-primary);}
.ocrt-drop.ocrt-active{border-color:var(--dsw-alias-brand-primary);background:var(--dsw-alias-bg-layer-2);}
.ocrt-preview{max-width:100%;max-height:280px;border-radius:8px;border:1px solid var(--dsw-alias-border-l1);object-fit:contain;}
.ocrt-row{display:flex;flex-wrap:wrap;gap:8px;align-items:center;}
.ocrt-btn{appearance:none;border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary);border-radius:8px;padding:7px 14px;font-size:13px;cursor:pointer;transition:background .15s,opacity .15s;}
.ocrt-btn:hover{background:var(--dsw-alias-bg-overlay);}
.ocrt-btn:disabled{opacity:.5;cursor:not-allowed;}
.ocrt-btn.ocrt-primary{background:var(--dsw-alias-brand-primary);border-color:var(--dsw-alias-brand-primary);color:var(--dsw-alias-label-primary-inverted);}
.ocrt-btn.ocrt-primary:hover{background:var(--dsw-alias-button-primary-hover);border-color:var(--dsw-alias-button-primary-hover);}
.ocrt-label{font-size:13px;font-weight:600;color:var(--dsw-alias-label-secondary);}
.ocrt-select{appearance:none;background:var(--dsw-alias-bg-base);border:1px solid var(--dsw-alias-border-l2);color:var(--dsw-alias-label-primary);border-radius:8px;padding:7px 10px;font-size:13px;cursor:pointer;}
.ocrt-area{width:100%;box-sizing:border-box;min-height:140px;resize:vertical;background:var(--dsw-alias-bg-base);border:1px solid var(--dsw-alias-border-l1);border-radius:8px;padding:10px;color:var(--dsw-alias-label-primary);font-size:13px;line-height:1.6;font-family:inherit;}
.ocrt-area:focus{outline:none;border-color:var(--dsw-alias-brand-primary);}
.ocrt-meta{font-size:12px;color:var(--dsw-alias-label-secondary);}
.ocrt-error{font-size:13px;color:var(--dsw-alias-state-error-primary);white-space:pre-wrap;}
.ocrt-warn{font-size:13px;color:var(--dsw-alias-state-warn-primary);background:var(--dsw-alias-bg-layer-2);border:1px solid var(--dsw-alias-border-l1);border-radius:8px;padding:10px;}
.ocrt-spacer{flex:1;}
`;

    function createPage(t) {
      return function OcrPage() {
        const [infoStatus, setInfoStatus] = useState('loading');
        const [info, setInfo] = useState(null);
        const [imageFile, setImageFile] = useState(null);
        const [imageUrl, setImageUrl] = useState('');
        const [dragActive, setDragActive] = useState(false);
        const [ocrText, setOcrText] = useState('');
        const [ocrStatus, setOcrStatus] = useState('idle');
        const [ocrError, setOcrError] = useState('');
        const [ocrEmpty, setOcrEmpty] = useState(false);
        const [targetLang, setTargetLang] = useState('zh-Hans');
        const [transText, setTransText] = useState('');
        const [transStatus, setTransStatus] = useState('idle');
        const [transError, setTransError] = useState('');
        const [copied, setCopied] = useState('');
        const [notice, setNotice] = useState('');
        const rootRef = useRef(null);
        const fileInput = useRef(null);
        const copyTimer = useRef(null);
        const noticeTimer = useRef(null);
        const dragDepth = useRef(0);
        const ocrAbort = useRef(null);
        const transAbort = useRef(null);

        const loadInfo = useCallback(() => {
          setInfoStatus('loading');
          apiFetch('info', { method: 'GET' })
            .then(async (res) => {
              const type = res.headers.get('content-type') || '';
              if (!res.ok || !type.includes('application/json')) throw new Error(`HTTP ${res.status}`);
              return res.json();
            })
            .then((data) => {
              if (data && data.ok) {
                setInfo(data.value);
                if (data.value.defaultTargetLanguage) setTargetLang(data.value.defaultTargetLanguage);
                setInfoStatus('ready');
              } else {
                setInfoStatus('error');
              }
            })
            .catch(() => setInfoStatus('error'));
        }, []);

        useEffect(() => { loadInfo(); }, [loadInfo]);

        // Manage the preview object URL.
        useEffect(() => {
          if (!imageFile) { setImageUrl(''); return undefined; }
          const url = URL.createObjectURL(imageFile);
          setImageUrl(url);
          return () => URL.revokeObjectURL(url);
        }, [imageFile]);

        // Abort in-flight work and clear timers on unmount.
        useEffect(() => () => {
          if (ocrAbort.current) ocrAbort.current.abort();
          if (transAbort.current) transAbort.current.abort();
          if (copyTimer.current) clearTimeout(copyTimer.current);
          if (noticeTimer.current) clearTimeout(noticeTimer.current);
        }, []);

        const flash = (setter, timer, value) => {
          setter(value);
          if (timer.current) clearTimeout(timer.current);
          timer.current = setTimeout(() => setter(''), 1600);
        };

        const loadFile = useCallback((file) => {
          if (!file || !file.type.startsWith('image/')) {
            flash(setNotice, noticeTimer, t('nonImage'));
            return;
          }
          if (ocrAbort.current) ocrAbort.current.abort();
          if (transAbort.current) transAbort.current.abort();
          setImageFile(file);
          setOcrText(''); setOcrStatus('idle'); setOcrError(''); setOcrEmpty(false);
          setTransText(''); setTransStatus('idle'); setTransError('');
        }, [t]);

        // Capture an image pasted while focus is inside this panel (not other columns).
        useEffect(() => {
          const onPaste = (event) => {
            const root = rootRef.current;
            if (!root || !event.target || !root.contains(event.target)) return;
            const items = event.clipboardData && event.clipboardData.items;
            if (!items) return;
            for (let i = 0; i < items.length; i++) {
              const item = items[i];
              if (item.kind === 'file' && item.type.startsWith('image/')) {
                const file = item.getAsFile();
                if (file) { loadFile(file); event.preventDefault(); break; }
              }
            }
          };
          document.addEventListener('paste', onPaste);
          return () => document.removeEventListener('paste', onPaste);
        }, [loadFile]);

        const copyText = async (text, which) => {
          try {
            await navigator.clipboard.writeText(text);
            flash(setCopied, copyTimer, which);
          } catch (_error) {
            flash(setCopied, copyTimer, `${which}-fail`);
          }
        };

        const extract = async () => {
          if (!imageFile) { setOcrError(t('needImage')); return; }
          if (ocrAbort.current) ocrAbort.current.abort();
          const controller = new AbortController();
          ocrAbort.current = controller;
          setOcrStatus('running'); setOcrError(''); setOcrEmpty(false);
          try {
            const res = await apiFetch('ocr', {
              method: 'POST', body: imageFile, signal: controller.signal,
              headers: { 'content-type': imageFile.type || 'image/png' },
            });
            const data = await res.json();
            if (controller.signal.aborted) return;
            if (data && data.ok) {
              setOcrText(data.text || '');
              setOcrStatus('done');
              setOcrEmpty(!data.text);
            } else {
              setOcrStatus('error');
              setOcrError((data && data.error) || t('ocrFailed'));
            }
          } catch (error) {
            if (controller.signal.aborted) { setOcrStatus('idle'); return; }
            setOcrStatus('error');
            setOcrError(error instanceof Error ? error.message : String(error));
          }
        };

        const translate = async () => {
          if (ocrText.trim() === '') { setTransError(t('needText')); return; }
          if (transAbort.current) transAbort.current.abort();
          const controller = new AbortController();
          transAbort.current = controller;
          setTransStatus('running'); setTransError('');
          try {
            const res = await apiFetch('translate', {
              method: 'POST', signal: controller.signal,
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify({ text: ocrText, targetLanguage: targetLang }),
            });
            const data = await res.json();
            if (controller.signal.aborted) return;
            if (data && data.ok) {
              setTransText(data.text || '');
              setTransStatus('done');
            } else {
              setTransStatus('error');
              setTransError((data && data.error) || t('transFailed'));
            }
          } catch (error) {
            if (controller.signal.aborted) { setTransStatus('idle'); return; }
            setTransStatus('error');
            setTransError(error instanceof Error ? error.message : String(error));
          }
        };

        const cancelOcr = () => { if (ocrAbort.current) ocrAbort.current.abort(); setOcrStatus('idle'); };
        const cancelTrans = () => { if (transAbort.current) transAbort.current.abort(); setTransStatus('idle'); };
        const clearImage = () => {
          if (ocrAbort.current) ocrAbort.current.abort();
          if (transAbort.current) transAbort.current.abort();
          setImageFile(null);
          setOcrText(''); setOcrStatus('idle'); setOcrError(''); setOcrEmpty(false);
          setTransText(''); setTransStatus('idle'); setTransError('');
        };

        const onDragEnter = (event) => { event.preventDefault(); dragDepth.current += 1; setDragActive(true); };
        const onDragLeave = (event) => { event.preventDefault(); dragDepth.current = Math.max(0, dragDepth.current - 1); if (dragDepth.current === 0) setDragActive(false); };
        const onDrop = (event) => {
          event.preventDefault(); dragDepth.current = 0; setDragActive(false);
          const file = event.dataTransfer && event.dataTransfer.files && event.dataTransfer.files[0];
          if (file) loadFile(file);
        };

        const ocrAvailable = infoStatus === 'ready' && info && info.ocrAvailable !== false;
        const charCount = (text) => t('chars', { count: text.length });
        const copyLabel = (which) => copied === which ? t('copied') : copied === `${which}-fail` ? t('copyFailed') : t('copy');

        return h('div', { className: 'ocrt-root', ref: rootRef },
          h('style', null, CSS),
          h('div', { className: 'ocrt-wrap' },
            h('div', null,
              h('h1', { className: 'ocrt-title' }, t('title')),
              h('p', { className: 'ocrt-sub' }, t('subtitle')),
            ),
            infoStatus === 'loading' ? h('div', { className: 'ocrt-meta', 'aria-live': 'polite' }, t('loading')) : null,
            infoStatus === 'error'
              ? h('div', { className: 'ocrt-warn', role: 'alert' },
                  t('connectFailed'), ' ',
                  h('button', { className: 'ocrt-btn', type: 'button', onClick: loadInfo }, t('retry')))
              : null,
            infoStatus === 'ready' && info && info.ocrAvailable === false
              ? h('div', { className: 'ocrt-warn', role: 'alert' }, t('ocrUnavailable'))
              : null,
            notice ? h('div', { className: 'ocrt-meta', 'aria-live': 'polite' }, notice) : null,
            // Image input card.
            h('div', { className: 'ocrt-card', 'aria-busy': ocrStatus === 'running' },
              h('div', {
                className: 'ocrt-drop' + (dragActive ? ' ocrt-active' : ''),
                onClick: () => fileInput.current && fileInput.current.click(),
                onDragEnter, onDragOver: (event) => event.preventDefault(), onDragLeave, onDrop,
              },
                imageUrl
                  ? h('img', { className: 'ocrt-preview', src: imageUrl, alt: '' })
                  : h('div', null, dragActive ? t('dropActive') : t('dropHint')),
                h('div', { className: 'ocrt-row' },
                  h('button', {
                    className: 'ocrt-btn', type: 'button',
                    onClick: (event) => { event.stopPropagation(); fileInput.current && fileInput.current.click(); },
                  }, imageFile ? t('replace') : t('choose')),
                  imageFile
                    ? h('button', {
                        className: 'ocrt-btn', type: 'button',
                        onClick: (event) => { event.stopPropagation(); clearImage(); },
                      }, t('clear'))
                    : null,
                ),
              ),
              h('input', {
                ref: fileInput, type: 'file', accept: 'image/*', style: { display: 'none' },
                'aria-label': t('choose'),
                onChange: (event) => { const file = event.target.files && event.target.files[0]; if (file) loadFile(file); event.target.value = ''; },
              }),
              h('div', { className: 'ocrt-row' },
                h('button', {
                  className: 'ocrt-btn ocrt-primary', type: 'button',
                  disabled: !imageFile || ocrStatus === 'running' || !ocrAvailable,
                  onClick: extract,
                }, ocrStatus === 'running' ? t('extracting') : t('extract')),
                ocrStatus === 'running'
                  ? h('button', { className: 'ocrt-btn', type: 'button', onClick: cancelOcr }, t('cancel'))
                  : null,
              ),
              ocrError ? h('div', { className: 'ocrt-error', role: 'alert' }, ocrError) : null,
              ocrEmpty ? h('div', { className: 'ocrt-meta', 'aria-live': 'polite' }, t('ocrEmpty')) : null,
            ),
            // OCR result card.
            h('div', { className: 'ocrt-card' },
              h('div', { className: 'ocrt-row' },
                h('span', { className: 'ocrt-label', id: 'ocrt-ocr-label' }, t('ocrResult')),
                h('span', { className: 'ocrt-spacer' }),
                h('span', { className: 'ocrt-meta' }, charCount(ocrText)),
                h('button', {
                  className: 'ocrt-btn', type: 'button', disabled: ocrText === '',
                  onClick: () => copyText(ocrText, 'ocr'),
                }, copyLabel('ocr')),
              ),
              h('textarea', {
                className: 'ocrt-area', value: ocrText, placeholder: t('ocrPlaceholder'),
                'aria-labelledby': 'ocrt-ocr-label',
                onChange: (event) => setOcrText(event.target.value),
              }),
            ),
            // Translation card.
            h('div', { className: 'ocrt-card', 'aria-busy': transStatus === 'running' },
              h('div', { className: 'ocrt-row' },
                h('span', { className: 'ocrt-label', id: 'ocrt-lang-label' }, t('targetLang')),
                h('select', {
                  className: 'ocrt-select', value: targetLang, 'aria-labelledby': 'ocrt-lang-label',
                  onChange: (event) => setTargetLang(event.target.value),
                }, LANGS.map(([code, name]) => h('option', { key: code, value: code }, name))),
                h('button', {
                  className: 'ocrt-btn ocrt-primary', type: 'button',
                  disabled: ocrText.trim() === '' || transStatus === 'running',
                  onClick: translate,
                }, transStatus === 'running' ? t('translating') : t('translate')),
                transStatus === 'running'
                  ? h('button', { className: 'ocrt-btn', type: 'button', onClick: cancelTrans }, t('cancel'))
                  : null,
                h('span', { className: 'ocrt-spacer' }),
                h('button', {
                  className: 'ocrt-btn', type: 'button', disabled: transText === '',
                  onClick: () => copyText(transText, 'trans'),
                }, copyLabel('trans')),
              ),
              transError ? h('div', { className: 'ocrt-error', role: 'alert' }, transError) : null,
              h('textarea', {
                className: 'ocrt-area', value: transText, placeholder: t('transPlaceholder'), readOnly: true,
                'aria-label': t('transResult'),
              }),
            ),
          ),
        );
      };
    }

    return {
      inject: ['slots', 'locale'],
      apply(ctx) {
        ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'ocr-translate: dictionaries');
        const t = ctx.locale.bind(NS);
        ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({
          name: 'sidebar.panellist', id: PANEL_ID, order: 20, locale: NS, label: () => t('panel'),
        }, PanelIcon));
        ctx.slots.inject('main', () => ctx.slots.register({
          name: 'main', key: PANEL_ID, locale: NS,
        }, createPage(t)));
      },
    };
  },
});