# AI Ready Architecture

## Purpose

The plugin keeps the current Photoshop workflow stable while leaving a clear seam for real AI models.

- The panel, batch flow, export flow, and render pipeline still work when no model runtime is available.
- Runtime/model concerns stay behind `ai_runtime.js` and provider adapters instead of leaking into the UI.
- Heuristic behavior remains the fallback path for every stage.

## Runtime Boundary

`ai_runtime.js` is the adapter layer between the plugin and any model provider.

- It resolves the active provider from an injected provider, a bundled bootstrap, or the noop fallback.
- It normalizes provider responses for `analyzeDocument()` and `buildRegionSignals()`.
- It keeps small internal caches for repeated runtime requests keyed by manifest version, document identity, pixel fingerprint, and scalar context.
- It exposes the stable public surface used elsewhere in the plugin: `warmup()`, `analyzeDocument()`, `buildRegionSignals()`, `getModelManifest()`, and `getStatus()`.

`ai_runtime_onnx_provider.js` is the sample concrete provider.

- It loads ONNX Runtime (`onnxruntime-web` first, then `onnxruntime-node`).
- It runs scene/exposure classifiers, optional color-match policy, and region segmentation.
- It converts model outputs into the normalized runtime contract.

`inference-utils.js` and `mask-utils.js` are shared helper modules.

- They keep tensor preprocessing, probability helpers, mask decoding, and nearest-mask sampling consistent across the runtime and pipeline.
- They are internal implementation details, so the public runtime contract stays unchanged even if the helper layout evolves.

## Orchestrator Stages

The main pipeline is coordinated by `pipeline/orchestrator.js`.

1. `raw_intake`
   Reads document pixels and source metadata and groups bracket candidates when present.
2. `hdr_merge`
   Produces a working image from a single image or multiple exposure frames.
3. `scene_exposure_engine`
   Combines heuristic metrics with model-driven scene/exposure overrides.
4. `target_light`
   Chooses brightness and compression targets for the current image.
5. `highlight_shadow`
   Applies adaptive exposure/highlight/shadow tuning before color matching.
6. `color_match`
   Applies learned or heuristic color-profile adjustments.
7. `window_detector`
   Builds region signals from AI masks plus heuristic extension masks.
8. `tone_mapping`
   Finalizes tone parameters for rendering.
9. `photoshop_refine`
   Writes the processed result back to Photoshop as a new output layer.

## Fallback Behavior

The plugin is designed to degrade safely.

- If no external provider is attached, the runtime uses the noop provider and keeps the heuristic-only workflow active.
- If runtime init fails, `getStatus()` exposes the error and the panel surfaces the fallback state.
- If a provider call fails, the runtime returns normalized fallback metadata instead of breaking the processing flow.
- If the optional color-match model fails to load, scene/exposure and segmentation can still run while color matching falls back to heuristics.

## Model Hooks

These are the only hooks the rest of the plugin depends on.

- `analyzeDocument(context)`
  May override scene, exposure, preset, and model-driven strengths.
- `buildRegionSignals(context)`
  May return masks for `window`, `wall`, `material`, and `cabinet`, plus optional metadata.
- `globalThis.__AI_REAL_ESTATE_MODEL_PROVIDER__`
  The registration point for a custom provider implementation.

As long as a provider returns the normalized runtime contract, the UI and pipeline do not need to know which backend generated the signals.
