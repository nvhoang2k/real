"use strict";

const { clamp } = require("./inference-utils");

const DEFAULT_CACHE_LIMIT = 8;

const DEFAULT_MODEL_MANIFEST = {
  version: 1,
  runtime: {
    strategy: "provider-adapter",
    preferredProvider: "external",
    fallbackProvider: "noop"
  },
  tasks: {
    sceneClassifier: {
      task: "scene-classification",
      recommendedModel: "MobileNetV3-Small",
      inputSize: 224,
      outputs: ["sceneClass", "sceneConfidence"]
    },
    exposureClassifier: {
      task: "exposure-classification",
      recommendedModel: "MobileNetV3-Small",
      inputSize: 160,
      outputs: ["exposureClass", "exposureConfidence"]
    },
    colorMatchPolicy: {
      task: "color-match-policy",
      recommendedModel: "MobileNetV3-Small",
      inputSize: 224,
      optional: true,
      outputs: ["colorMatchProfile", "colorMatchStrength"]
    },
    regionSegmenter: {
      task: "region-segmentation",
      recommendedModel: "Fast-SCNN",
      inputSize: 512,
      outputs: ["windowMask", "wallMask", "materialMask", "cabinetMask"]
    },
    qualitySegmenter: {
      task: "quality-upgrade-segmentation",
      recommendedModel: "SegFormer-B0",
      inputSize: 512,
      optional: true,
      outputs: ["refinedRegionMasks"]
    }
  }
};

function isFiniteNumber(value) {
  return typeof value === "number" && Number.isFinite(value);
}

function normalizeStrength(value) {
  return isFiniteNumber(value) ? clamp(value, 0, 1) : null;
}

function normalizeSignals(rawSignals = {}, fallbackMeta = {}) {
  return {
    sceneOverride:
      typeof rawSignals.sceneOverride === "string" ? rawSignals.sceneOverride : null,
    exposureOverride:
      typeof rawSignals.exposureOverride === "string"
        ? rawSignals.exposureOverride
        : null,
    presetOverride:
      typeof rawSignals.presetOverride === "string" ? rawSignals.presetOverride : null,
    colorMatchProfile:
      typeof rawSignals.colorMatchProfile === "string" ? rawSignals.colorMatchProfile : null,
    colorMatchStrength: normalizeStrength(rawSignals.colorMatchStrength),
    wallMaskStrength: normalizeStrength(rawSignals.wallMaskStrength),
    materialProtectionStrength: normalizeStrength(
      rawSignals.materialProtectionStrength
    ),
    whiteCabinetStrength: normalizeStrength(rawSignals.whiteCabinetStrength),
    confidence: normalizeStrength(rawSignals.confidence),
    metadata: {
      ...fallbackMeta,
      ...(rawSignals.metadata || {})
    }
  };
}

function normalizeRegionSignals(rawSignals = {}, fallbackMeta = {}) {
  return {
    windowMask: rawSignals.windowMask || null,
    skyMask: rawSignals.skyMask || null,
    windowExteriorMask: rawSignals.windowExteriorMask || null,
    curtainMask: rawSignals.curtainMask || null,
    lightMask: rawSignals.lightMask || null,
    wallMask: rawSignals.wallMask || null,
    materialMask: rawSignals.materialMask || null,
    cabinetMask: rawSignals.cabinetMask || null,
    metadata: {
      ...fallbackMeta,
      ...(rawSignals.metadata || {})
    }
  };
}

function createNoopProvider(config) {
  return {
    name: "noop-provider",

    async init() {
      return {
        ready: true,
        provider: "noop-provider",
        manifest: config.manifest
      };
    },

    async analyzeDocument() {
      return normalizeSignals(
        {
          metadata: {
            source: "heuristic-only",
            note: "No external AI model is attached."
          }
        },
        {
          provider: "noop-provider"
        }
      );
    },

    async buildRegionSignals() {
      return normalizeRegionSignals(
        {},
        {
          provider: "noop-provider",
          source: "heuristic-only"
        }
      );
    }
  };
}

function tryLoadBundledProvider() {
  try {
    require("./models/bootstrap_onnx_provider");
    const scope =
      typeof globalThis !== "undefined"
        ? globalThis
        : typeof window !== "undefined"
          ? window
          : {};
    return scope.__AI_REAL_ESTATE_MODEL_PROVIDER__ || null;
  } catch (error) {
    return {
      name: "bootstrap-error-provider",
      async init() {
        return {
          ready: false,
          provider: "bootstrap-error-provider",
          error: String(error && (error.message || error)),
          bootstrapError: true
        };
      }
    };
  }
}

function resolveExternalProvider(options = {}) {
  if (options.provider) {
    return options.provider;
  }

  const scope =
    typeof globalThis !== "undefined"
      ? globalThis
      : typeof window !== "undefined"
        ? window
        : {};

  if (scope.__AI_REAL_ESTATE_MODEL_PROVIDER__) {
    return scope.__AI_REAL_ESTATE_MODEL_PROVIDER__;
  }

  return tryLoadBundledProvider();
}

function ensureProviderShape(provider, config) {
  if (typeof provider === "function") {
    return provider(config);
  }

  if (provider && typeof provider === "object") {
    return provider;
  }

  return createNoopProvider(config);
}

function readDocumentId(doc) {
  if (doc && (typeof doc.id === "number" || typeof doc.id === "string")) {
    return doc.id;
  }
  return "no-doc";
}

function createPixelFingerprint(pixelData) {
  if (!pixelData || !pixelData.data || typeof pixelData.data.length !== "number") {
    return "no-pixels";
  }

  const data = pixelData.data;
  const sampleCount = Math.min(16, data.length);
  const step = Math.max(1, Math.floor(data.length / sampleCount));
  let hash = 2166136261;

  for (let index = 0; index < data.length; index += step) {
    hash ^= Number(data[index]) || 0;
    hash = Math.imul(hash, 16777619);
  }

  hash ^= data.length;
  hash = Math.imul(hash, 16777619);
  hash ^= pixelData.width || 0;
  hash = Math.imul(hash, 16777619);
  hash ^= pixelData.height || 0;
  hash = Math.imul(hash, 16777619);
  hash ^= pixelData.components || 0;
  hash = Math.imul(hash, 16777619);

  return `${pixelData.width || 0}x${pixelData.height || 0}x${pixelData.components || 0}:${(hash >>> 0).toString(16)}`;
}

function appendScalarEntries(entries, value, path) {
  if (value === null || value === undefined) {
    entries.push(`${path}:null`);
    return;
  }

  const valueType = typeof value;
  if (valueType === "string" || valueType === "number" || valueType === "boolean") {
    entries.push(`${path}:${String(value)}`);
    return;
  }

  if (Array.isArray(value)) {
    value.forEach((item, index) => {
      appendScalarEntries(entries, item, `${path}[${index}]`);
    });
    return;
  }

  if (
    ArrayBuffer.isView(value) ||
    value instanceof ArrayBuffer ||
    valueType === "function"
  ) {
    return;
  }

  if (valueType === "object") {
    Object.keys(value)
      .sort()
      .forEach((key) => {
        const nextPath = path ? `${path}.${key}` : key;
        appendScalarEntries(entries, value[key], nextPath);
      });
  }
}

function createScalarSummary(context = {}) {
  const scalarEntries = [];

  Object.keys(context)
    .sort()
    .forEach((key) => {
      if (key === "doc" || key === "pixelData") {
        return;
      }
      appendScalarEntries(scalarEntries, context[key], key);
    });

  return scalarEntries.join("|");
}

/**
 * Create a deterministic cache key based on the document, pixel payload, and
 * the scalar runtime context that can influence provider output.
 */
function createRuntimeCacheKey(scope, manifest, context) {
  return [
    scope,
    `manifest:${manifest && manifest.version ? manifest.version : "unknown"}`,
    `doc:${readDocumentId(context && context.doc)}`,
    `pixel:${createPixelFingerprint(context && context.pixelData)}`,
    `ctx:${createScalarSummary(context)}`
  ].join("|");
}

function touchCacheEntry(store, key, entry) {
  if (store.has(key)) {
    store.delete(key);
  }
  store.set(key, entry);
}

function trimCache(store, maxEntries) {
  while (store.size > maxEntries) {
    const oldestKey = store.keys().next().value;
    store.delete(oldestKey);
  }
}

/**
 * Small in-memory LRU cache that also dedupes concurrent requests. We key the
 * entries by document, pixel fingerprint, and scalar context so repeated UI
 * polling does not rerun inference while still avoiding stale cross-image hits.
 */
function createAsyncResultCache(maxEntries = DEFAULT_CACHE_LIMIT) {
  const store = new Map();

  return {
    async getOrCreate(key, producer) {
      if (store.has(key)) {
        const existingEntry = store.get(key);
        touchCacheEntry(store, key, existingEntry);
        return existingEntry.promise || existingEntry.value;
      }

      const entry = {
        promise: null,
        value: null
      };
      const pendingPromise = Promise.resolve()
        .then(producer)
        .then((value) => {
          entry.value = value;
          entry.promise = null;
          touchCacheEntry(store, key, entry);
          trimCache(store, maxEntries);
          return value;
        })
        .catch((error) => {
          store.delete(key);
          throw error;
        });

      entry.promise = pendingPromise;
      touchCacheEntry(store, key, entry);
      trimCache(store, maxEntries);
      return pendingPromise;
    }
  };
}

function createModelRuntime(options = {}) {
  const manifest = options.manifest || DEFAULT_MODEL_MANIFEST;
  const runtimeConfig = {
    manifest,
    modelBasePath: options.modelBasePath || "./models",
    lazyLoad: options.lazyLoad !== false
  };

  const externalProvider = resolveExternalProvider(options);
  const provider = ensureProviderShape(externalProvider, runtimeConfig);
  const analyzeCache = createAsyncResultCache();
  const regionSignalCache = createAsyncResultCache();

  let initState = {
    ready: false,
    initializing: false,
    attempted: false,
    provider: provider.name || "external-provider",
    error: null,
    manifest
  };
  let initPromise = null;

  async function ensureReady() {
    if (initState.ready) {
      return initState;
    }

    if (initState.initializing && initPromise) {
      await initPromise;
      return initState;
    }

    if (initState.attempted && !initState.initializing) {
      return initState;
    }

    initState = {
      ...initState,
      initializing: true,
      attempted: true,
      error: null
    };

    initPromise = (async () => {
      try {
        if (typeof provider.init === "function") {
          const result = await provider.init(runtimeConfig);
          initState = {
            ...initState,
            ...(result || {}),
            ready:
              result && typeof result.ready === "boolean" ? result.ready : true,
            initializing: false,
            provider: (result && result.provider) || provider.name || initState.provider,
            manifest
          };
        } else {
          initState = {
            ...initState,
            ready: true,
            initializing: false,
            manifest
          };
        }
      } catch (error) {
        initState = {
          ...initState,
          ready: false,
          initializing: false,
          error: error ? String(error.message || error) : "Unknown runtime init error",
          manifest
        };
      } finally {
        initPromise = null;
      }

      return initState;
    })();

    await initPromise;
    return initState;
  }

  function createFallbackMeta(state) {
    return {
      runtimeReady: state.ready,
      provider: state.provider,
      runtimeError: state.error,
      manifestVersion: manifest.version
    };
  }

  /**
   * Analyze scene/exposure signals through the provider and cache exact
   * repeated requests using the full runtime context.
   */
  async function analyzeDocument(context = {}) {
    const state = await ensureReady();
    const fallbackMeta = createFallbackMeta(state);

    if (!state.ready || typeof provider.analyzeDocument !== "function") {
      return normalizeSignals({}, fallbackMeta);
    }

    const cacheKey = createRuntimeCacheKey("analyze", manifest, context);
    return analyzeCache.getOrCreate(cacheKey, async () => {
      try {
        const rawSignals = await provider.analyzeDocument({
          ...context,
          manifest,
          runtimeState: state
        });
        return normalizeSignals(rawSignals, fallbackMeta);
      } catch (error) {
        return normalizeSignals(
          {
            metadata: {
              runtimeFallback: true,
              runtimeError: error ? String(error.message || error) : "Unknown analyze error"
            }
          },
          fallbackMeta
        );
      }
    });
  }

  /**
   * Build segmentation-style region signals with the same context-aware cache
   * strategy used by analyzeDocument().
   */
  async function buildRegionSignals(context = {}) {
    const state = await ensureReady();
    const fallbackMeta = createFallbackMeta(state);

    if (!state.ready || typeof provider.buildRegionSignals !== "function") {
      return normalizeRegionSignals({}, fallbackMeta);
    }

    const cacheKey = createRuntimeCacheKey("regions", manifest, context);
    return regionSignalCache.getOrCreate(cacheKey, async () => {
      try {
        const rawSignals = await provider.buildRegionSignals({
          ...context,
          manifest,
          runtimeState: state
        });
        return normalizeRegionSignals(rawSignals, fallbackMeta);
      } catch (error) {
        return normalizeRegionSignals(
          {
            metadata: {
              runtimeFallback: true,
              runtimeError: error
                ? String(error.message || error)
                : "Unknown region signal error"
            }
          },
          fallbackMeta
        );
      }
    });
  }

  return {
    name: provider.name || "scaffold-runtime",
    enabled: provider.name !== "noop-provider",

    async warmup() {
      return ensureReady();
    },

    async analyzeDocument(context) {
      return analyzeDocument(context);
    },

    async buildRegionSignals(context) {
      return buildRegionSignals(context);
    },

    getModelManifest() {
      return manifest;
    },

    getStatus() {
      return {
        ...initState,
        enabled: provider.name !== "noop-provider",
        provider: provider.name || initState.provider
      };
    }
  };
}

module.exports = {
  DEFAULT_MODEL_MANIFEST,
  createModelRuntime
};
