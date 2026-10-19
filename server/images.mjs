// Realistic pictures for the "3 ideas for your site" build designs: POST /api/ai/render (logged-in users only).
// Claude cannot draw pictures, so a separate image model does this. It needs the owner's OWN key:
//   GEMINI_API_KEY  (Google AI Studio)   or   OPENAI_API_KEY  (OpenAI)
// Both are optional. IMAGE_PROVIDER=gemini|openai picks one when both are set. Model names can be overridden
// because providers rename models often: GEMINI_IMAGE_MODEL, OPENAI_IMAGE_MODEL. Each picture costs money on the owner's account.

import { ALLOWED_MEDIA } from './ai.mjs';
import { MAX_PROMPT } from './shared.mjs';

const str = (v, max) => (typeof v === 'string' ? v.slice(0, max) : '');

/** Which picture service is used ('gemini' | 'openai'), or undefined when none has a key. `images` is config.images. */
export function imageProvider(images) {
  if (images.provider === 'gemini' && images.geminiKey) return 'gemini';
  if (images.provider === 'openai' && images.openaiKey) return 'openai';
  return images.geminiKey ? 'gemini' : images.openaiKey ? 'openai' : undefined;
}

/** Finds the first base64 image anywhere in a provider response (shapes differ between API versions). */
function findImage(node, depth = 0) {
  if (!node || typeof node !== 'object' || depth > 8) return undefined;
  const data = node.b64_json || node.inlineData?.data || node.inline_data?.data || (node.type === 'image' ? node.data : undefined);
  if (typeof data === 'string' && data.length > 100) {
    const sniffed = data.startsWith('/9j/') ? 'image/jpeg' : data.startsWith('iVBOR') ? 'image/png' : data.startsWith('UklGR') ? 'image/webp' : undefined; // trust the bytes over the label
    const mime = sniffed || node.inlineData?.mimeType || node.inline_data?.mime_type || node.mime_type || node.mimeType || 'image/png';
    return { mediaType: ALLOWED_MEDIA.has(mime) ? mime : 'image/png', data };
  }
  for (const v of Array.isArray(node) ? node : Object.values(node)) {
    const f = findImage(v, depth + 1);
    if (f) return f;
  }
  return undefined;
}

/** The /api/ai/render route. `images` is config.images; `gate` is from allowance() in server/ai.mjs. */
export function imageRoutes({ images, kit: { json, readJson, limited }, gate, log = console }) {
  async function providerCall(url, init, what) {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), images.timeoutMs);
    try {
      const r = await fetch(url, { ...init, signal: ctl.signal });
      const text = await r.text();
      if (!r.ok) {
        // The provider's own words go to the server log only (like Claude's errors): they can name the account or the request.
        log.error(`${what} error ${r.status} ${text.slice(0, 400)}`);
        const hint = r.status === 401 || r.status === 403 ? ' The server owner should check the key in the .env file.'
          : r.status === 404 ? ' The server owner may need to set GEMINI_IMAGE_MODEL or OPENAI_IMAGE_MODEL (see the server log).'
            : r.status === 429 ? ' The picture account may be out of credit or busy. Please try again later.' : ' Please try again.';
        throw Object.assign(new Error(`${what} could not make the picture (error ${r.status}).${hint}`), { status: 502, notCharged: true });
      }
      try { return JSON.parse(text); } catch { throw Object.assign(new Error(`${what} sent an unreadable answer.`), { status: 502 }); }
    } catch (e) {
      if (e.name === 'AbortError') throw Object.assign(new Error(`${what} took too long. Please try again.`), { status: 504 });
      if (e.status) throw e;
      log.error(`${what} not reachable: ${e.message}`);
      throw Object.assign(new Error(`The May-Ani server cannot reach ${what} right now. Please try again later.`), { status: 502, notCharged: true });
    } finally { clearTimeout(t); }
  }

  async function renderGemini(prompt, im) {
    const j = await providerCall(`${images.geminiBase}/v1beta/interactions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-goog-api-key': images.geminiKey },
      body: JSON.stringify({ model: images.geminiModel, input: [{ type: 'text', text: prompt }, { type: 'image', mime_type: im.mediaType, data: im.data }] }),
    }, 'Gemini');
    return findImage(j);
  }

  async function renderOpenAI(prompt, im) {
    const form = new FormData();
    form.set('model', images.openaiModel);
    form.set('prompt', prompt);
    form.set('size', 'auto');
    form.append('image[]', new Blob([Buffer.from(im.data, 'base64')], { type: im.mediaType }), im.mediaType === 'image/png' ? 'site.png' : im.mediaType === 'image/webp' ? 'site.webp' : 'site.jpg');
    const j = await providerCall(`${images.openaiBase}/v1/images/edits`, { method: 'POST', headers: { authorization: `Bearer ${images.openaiKey}` }, body: form }, 'OpenAI');
    return findImage(j);
  }

  async function render(req, res) {
    const provider = imageProvider(images);
    if (!provider) return json(res, 501, { error: 'Picture making is not set up. Add GEMINI_API_KEY or OPENAI_API_KEY to the .env file.' });
    if (limited(req, 'render', 6)) return json(res, 429, { error: 'Too many pictures in a minute. Please wait a little.' });
    const b = await readJson(req);
    const prompt = str(b.prompt, MAX_PROMPT).trim();
    const im = b.image;
    if (prompt.length < 40) return json(res, 400, { error: 'The picture request was empty.' });
    if (!im || !ALLOWED_MEDIA.has(im.mediaType) || typeof im.data !== 'string' || im.data.length < 100 || im.data.length > 4_500_000) return json(res, 400, { error: 'Add a photo of the area first.' });
    const ticket = await gate.take(req, res, 'pictures');
    if (!ticket) return;
    const out = await gate.paid(ticket, () => (provider === 'gemini' ? renderGemini(prompt, im) : renderOpenAI(prompt, im)));
    if (!out) throw Object.assign(new Error('The image service did not return a picture (it may have refused the photo). Try another photo or try again.'), { status: 502 });
    json(res, 200, { image: out, provider });
  }

  return { 'POST /api/ai/render': render };
}
