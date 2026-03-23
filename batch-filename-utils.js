"use strict";

function sanitizeBaseName(value, fallback = "real-estate-enhanced") {
  const sanitized = String(value || "")
    .trim()
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, "-")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^\.+|\.+$/g, "");

  return sanitized || fallback;
}

function sanitizeFileStem(name) {
  const withoutExtension = String(name || "").replace(/\.[^.]+$/, "");
  return sanitizeBaseName(withoutExtension, "image");
}

function normalizeTemplateToken(value, fallback) {
  return sanitizeBaseName(String(value || "").toLowerCase(), fallback);
}

/**
 * Expand batch filename placeholders and guarantee a single normalized extension.
 */
function formatBatchFileName(template, context = {}, format, sourceName) {
  const metrics = context.metrics || {};
  const values = {
    name: sanitizeFileStem(sourceName),
    scene: normalizeTemplateToken(metrics.sceneClass, "scene"),
    preset: normalizeTemplateToken(context.finalPresetKey, "preset"),
    exposure: normalizeTemplateToken(metrics.exposureClass, "exposure"),
    format: normalizeTemplateToken(format, "jpg")
  };

  const formatted = String(template || "{name}.{format}")
    .replace(/\{name\}/gi, values.name)
    .replace(/\{scene\}/gi, values.scene)
    .replace(/\{preset\}/gi, values.preset)
    .replace(/\{exposure\}/gi, values.exposure)
    .replace(/\{format\}/gi, values.format);
  const fileStem = sanitizeBaseName(formatted.replace(/\.[^.]+$/, ""), values.name);

  return `${fileStem}.${values.format}`;
}

module.exports = {
  formatBatchFileName,
  sanitizeBaseName,
  sanitizeFileStem
};
