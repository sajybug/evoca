import test from 'node:test';
import assert from 'node:assert/strict';

import { directionFor, sanitizeScreenshotPreview } from './markdownUtils.js';

test('directionFor detects RTL text and keeps Latin text LTR', () => {
  assert.equal(directionFor('Hello world'), 'ltr');
  assert.equal(directionFor('سلام دنیا'), 'rtl');
});

test('sanitizeScreenshotPreview accepts only PNG data URLs', () => {
  const valid = 'data:image/png;base64,iVBORw0KGgo=';
  assert.equal(sanitizeScreenshotPreview(valid), valid);
  assert.equal(sanitizeScreenshotPreview('data:image/svg+xml;base64,PHN2Zy8+'), null);
  assert.equal(sanitizeScreenshotPreview('javascript:alert(1)'), null);
  assert.equal(sanitizeScreenshotPreview(''), null);
  assert.equal(sanitizeScreenshotPreview(null), null);
});
