const RTL_RE = /[\u0590-\u08FF\uFB1D-\uFDFD\uFE70-\uFEFC]/;
const PNG_DATA_URL_RE = /^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/;

export function directionFor(text) {
  return RTL_RE.test(text) ? 'rtl' : 'ltr';
}

export function sanitizeScreenshotPreview(value) {
  if (typeof value !== 'string' || !PNG_DATA_URL_RE.test(value)) {
    return null;
  }
  return value;
}
