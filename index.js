"use strict";

const { app, action, constants, core, imaging } = require("photoshop");
const { entrypoints, storage } = require("uxp");

const {
  formatBatchFileName,
  sanitizeBaseName,
  sanitizeFileStem
} = require("./batch-filename-utils");
const { createModelRuntime } = require("./ai_runtime");
const { createPipelineOrchestrator } = require("./pipeline/orchestrator");
const { createRawIntakeEngine } = require("./pipeline/raw_intake");
const { createHdrMergeEngine } = require("./pipeline/hdr_merge");
const { createSceneExposureEngine } = require("./pipeline/scene_exposure_engine");
const { createTargetLightEngine } = require("./pipeline/target_light");
const { createHighlightShadowEngine } = require("./pipeline/highlight_shadow");
const { createColorMatchEngine } = require("./pipeline/color_match");
const { createWindowDetectEngine } = require("./pipeline/window_detector");
const { createToneMappingEngine } = require("./pipeline/tone_mapping");
const { createPhotoshopRefineEngine } = require("./pipeline/photoshop_refine");
const { sampleMaskNearest } = require("./mask-utils");
const modelRuntime = createModelRuntime();

const PRESETS = {
  luxury: {
    label: "Noi that cao cap",
    exposure: 0.06,
    contrast: 0.14,
    saturation: 0.08,
    vibrance: 0.12,
    temperature: 0.015,
    tint: 0.0,
    shadowLift: 0.12,
    highlightRecovery: 0.18,
    windowThreshold: 0.78,
    blackPoint: 0.012,
    shadowGamma: 0.92,
    midtoneBoost: 0.08,
    microContrast: 0.08,
    highlightSoftClip: 0.16,
    neutralBalance: 0.12
  },
  warm: {
    label: "Am ap tu nhien",
    exposure: 0.04,
    contrast: 0.08,
    saturation: 0.12,
    vibrance: 0.08,
    temperature: 0.035,
    tint: 0.01,
    shadowLift: 0.08,
    highlightRecovery: 0.12,
    windowThreshold: 0.82,
    blackPoint: 0.01,
    shadowGamma: 0.94,
    midtoneBoost: 0.06,
    microContrast: 0.05,
    highlightSoftClip: 0.12,
    neutralBalance: 0.08
  },
  airbnb: {
    label: "Sang dep Airbnb",
    exposure: 0.09,
    contrast: 0.1,
    saturation: 0.05,
    vibrance: 0.1,
    temperature: 0.01,
    tint: -0.005,
    shadowLift: 0.15,
    highlightRecovery: 0.2,
    windowThreshold: 0.8,
    blackPoint: 0.008,
    shadowGamma: 0.9,
    midtoneBoost: 0.1,
    microContrast: 0.06,
    highlightSoftClip: 0.18,
    neutralBalance: 0.1
  }
};

const pipelineOrchestrator = createPipelineOrchestrator({
  rawIntakeEngine: createRawIntakeEngine({
    readDimension,
    getPerformancePlan,
    getCompositePixels,
    getPerformanceMode: () => ($("#performanceMode") ? $("#performanceMode").value : "auto")
  }),
  hdrMergeEngine: createHdrMergeEngine({
    analyzePixels
  }),
  sceneExposureEngine: createSceneExposureEngine({
    modelRuntime
  }),
  targetLightEngine: createTargetLightEngine(),
  highlightShadowEngine: createHighlightShadowEngine({
    presets: PRESETS,
    getRecommendedPresetKey,
    applyScenePipeline,
    createAdaptivePreset
  }),
  colorMatchEngine: createColorMatchEngine({
    applyModelTuningToPreset
  }),
  windowDetectEngine: createWindowDetectEngine({
    modelRuntime
  }),
  toneMappingEngine: createToneMappingEngine(),
  photoshopRefineEngine: createPhotoshopRefineEngine({
    processPixels,
    applyProcessedLayer
  })
});

const PANEL_TEMPLATE = `
  <div id="panel" class="panel">
    <div class="hero">
      <div class="hero-pill">
        <div class="eyebrow">Bang dieu khien Photoshop UXP</div>
        <h1>AI Bat Dong San PRO MAX</h1>
      </div>
    </div>

    <section class="section">
      <div class="section-heading">Xu ly hang loat</div>
      <div class="section-body">
        <div class="card">
          <div class="form-section">
            <button class="form-toggle" type="button" data-form-toggle="folders" aria-expanded="true">
              <span class="form-title">Thu muc</span>
              <span class="form-toggle-icon">-</span>
            </button>
            <div class="form-stack" data-form-body="folders">
              <div class="batch-paths">
                <div class="path-group">
                  <button id="pickInputFolderBtn" type="button">Chon thu muc</button>
                  <div id="inputFolderLabel" class="path-label">Chua chon thu muc</div>
                </div>
              </div>
            </div>
          </div>

          <div class="batch-run-card">
            <button id="runBatchBtn" class="primary batch-run-btn" type="button">Click</button>
            <div id="batchHint" class="batch-hint">Hay chon thu muc de bat dau. Tep dau ra se luu ngay trong thu muc nay.</div>
          </div>

          <div class="form-section">
            <button class="form-toggle" type="button" data-form-toggle="batch-options" aria-expanded="false">
              <span class="form-title">Tuy chon hang loat</span>
              <span class="form-toggle-icon">+</span>
            </button>
            <div class="form-stack" data-form-body="batch-options" hidden>
              <div class="form-group">
                <label class="label" for="batchHdrMode">Che do HDR hang loat</label>
                <select id="batchHdrMode">
                  <option value="single" selected>Tung anh rieng</option>
                  <option value="auto">Tu dong gom bracket HDR</option>
                </select>
              </div>

              <div class="form-group">
                <label class="label" for="batchFileNameTemplate">Mau ten tep batch</label>
                <input id="batchFileNameTemplate" type="text" value="{name}.{format}" />
                <div class="export-note">Ho tro {name}, {scene}, {preset}, {exposure}, {format}</div>
              </div>

              <label class="toggle">
                <input id="autoPresetMode" type="checkbox" checked />
                <span>Tu chon preset tot nhat cho tung anh</span>
              </label>

              <label class="toggle">
                <input id="skipExistingBatch" type="checkbox" checked />
                <span>Bo qua tep da ton tai trong chinh thu muc dau vao</span>
              </label>
            </div>
          </div>
        </div>
      </div>
    </section>

    <section class="section">
      <div class="section-heading">Xuat tep</div>
      <div class="section-body">
        <div class="card">
          <div class="form-section">
            <button class="form-toggle" type="button" data-form-toggle="export" aria-expanded="true">
              <span class="form-title">Xuat tep hien tai</span>
              <span class="form-toggle-icon">-</span>
            </button>
            <div class="form-stack" data-form-body="export">
              <div class="form-group">
                <label class="label" for="singleExportFormat">Dinh dang xuat</label>
                <select id="singleExportFormat">
                  <option value="jpg" selected>JPG</option>
                  <option value="tif">TIFF</option>
                </select>
              </div>

              <div id="jpgExportOptions" class="export-option-group">
                <div class="form-group">
                  <label class="label" for="jpgQuality">Chat luong JPG</label>
                  <input id="jpgQuality" type="number" min="1" max="12" value="10" />
                </div>
              </div>

              <div id="tiffExportOptions" class="export-option-group" hidden>
                <div class="form-group">
                  <label class="label" for="tiffCompression">Nen TIFF</label>
                  <select id="tiffCompression">
                    <option value="NONE">Khong nen</option>
                    <option value="LZW" selected>LZW</option>
                    <option value="ZIP">ZIP</option>
                  </select>
                </div>
              </div>

              <div id="tiffStrategyNote" class="export-note" hidden>TIFF tu dong se bi gioi han neu phien ban Photoshop hien tai khong ho tro silent export.</div>

              <div class="export-actions">
                <button id="exportCurrentBtn" type="button">Xuat tep</button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>

    <section class="section">
      <div class="section-heading">Tang cuong anh</div>
      <div class="section-body">
        <div class="card">
          <div class="form-section">
            <button class="form-toggle" type="button" data-form-toggle="core" aria-expanded="true">
              <span class="form-title">Thiet lap chinh</span>
              <span class="form-toggle-icon">-</span>
            </button>
            <div class="form-stack" data-form-body="core">
              <div class="form-grid two-up">
                <div class="form-group">
                  <label class="label" for="preset">Bo mau xu ly</label>
                  <select id="preset">
                    <option value="luxury">Noi that cao cap</option>
                    <option value="warm">Am ap tu nhien</option>
                    <option value="airbnb">Sang dep Airbnb</option>
                  </select>
                </div>

                <div class="form-group">
                  <label class="label" for="performanceMode">Che do hieu nang</label>
                  <select id="performanceMode">
                    <option value="auto" selected>Tu dong</option>
                    <option value="full">Chat luong cao</option>
                    <option value="balanced">Can bang</option>
                    <option value="fast">Nhanh</option>
                  </select>
                </div>
              </div>

              <div class="form-group">
                <label class="label" for="layerName">Ten lop ket qua</label>
                <input id="layerName" type="text" value="AI Bat Dong San Tang Cuong" />
              </div>
            </div>
          </div>

          <div class="form-section">
            <button class="form-toggle" type="button" data-form-toggle="tone" aria-expanded="false">
              <span class="form-title">Dieu chinh tong mau</span>
              <span class="form-toggle-icon">+</span>
            </button>
            <div class="form-stack" data-form-body="tone" hidden>
              <div class="form-group">
                <label class="label" for="hdrStrength">Cuong do HDR</label>
                <select id="hdrStrength">
                  <option value="0.55">Nhe</option>
                  <option value="0.72" selected>Can bang</option>
                  <option value="0.9">Manh</option>
                  <option value="1.05">Rat manh</option>
                </select>
              </div>

              <label class="toggle">
                <input id="windowBalance" type="checkbox" checked />
                <span>Can bang vung cua so sang</span>
              </label>

              <label class="toggle">
                <input id="shadowLift" type="checkbox" checked />
                <span>Nang chi tiet vung toi</span>
              </label>

              <label class="toggle">
                <input id="autoExposureMode" type="checkbox" checked />
                <span>Tu dong nhan biet anh sang, toi, trung binh</span>
              </label>
            </div>
          </div>

          <div class="form-section">
            <button class="form-toggle" type="button" data-form-toggle="scene" aria-expanded="false">
              <span class="form-title">Nhan dien canh va bao ve mau</span>
              <span class="form-toggle-icon">+</span>
            </button>
            <div class="form-stack" data-form-body="scene" hidden>
              <label class="toggle">
                <input id="sceneAwareMode" type="checkbox" checked />
                <span>Tu dong nhan biet interior, exterior, bathroom/kitchen</span>
              </label>

              <label class="toggle">
                <input id="protectWallColorMode" type="checkbox" checked />
                <span>Giu mau tuong</span>
              </label>

              <label class="toggle">
                <input id="protectMaterialToneMode" type="checkbox" checked />
                <span>Giu chat lieu va tong mau</span>
              </label>

              <label class="toggle">
                <input id="whiteCabinetProtectionMode" type="checkbox" checked />
                <span>Giu tu bep trang</span>
              </label>

              <div class="form-group">
                <label class="label" for="wallColorSensitivity">Do nhay giu mau tuong</label>
                <select id="wallColorSensitivity">
                  <option value="low">Thap</option>
                  <option value="medium" selected>Trung binh</option>
                  <option value="high">Cao</option>
                </select>
              </div>
            </div>
          </div>
        </div>

        <div class="actions">
          <button id="analyzeBtn" data-action-key="analyze" type="button">Phan tich anh dang mo</button>
          <button id="applyBtn" data-action-key="apply" class="primary" type="button">Ap dung bo xu ly</button>
        </div>

        <div class="actions single-action">
          <button id="autoEnhanceBtn" data-action-key="auto-enhance" class="primary" type="button">Tu dong tang cuong</button>
        </div>

        <div class="actions single-action">
          <button id="wallCompareBtn" data-action-key="wall-compare" type="button">So sanh mau tuong</button>
        </div>
      </div>
    </section>

    <section class="section">
      <div class="section-heading">Thong so</div>
      <div class="section-body">
        <div class="card metrics">
          <div class="form-section">
            <button class="form-toggle" type="button" data-form-toggle="metrics" aria-expanded="false">
              <span class="form-title">Phan tich</span>
              <span class="form-toggle-icon">+</span>
            </button>
            <div class="form-stack" data-form-body="metrics" hidden>
              <div class="metric-row">
                <span class="metric-label">Do sang trung binh</span>
                <span id="avgLight" class="metric-value">-</span>
              </div>
              <div class="metric-row">
                <span class="metric-label">Ty le vung sang</span>
                <span id="highlightRatio" class="metric-value">-</span>
              </div>
              <div class="metric-row">
                <span class="metric-label">Ty le vung toi</span>
                <span id="shadowRatio" class="metric-value">-</span>
              </div>
              <div class="metric-row">
                <span class="metric-label">De xuat</span>
                <span id="recommendedPreset" class="metric-value">-</span>
              </div>
              <div class="metric-row">
                <span class="metric-label">Muc sang</span>
                <span id="exposureClass" class="metric-value">-</span>
              </div>
              <div class="metric-row">
                <span class="metric-label">Loai canh</span>
                <span id="sceneClass" class="metric-value">-</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>

    <section class="section">
      <div class="section-heading">Trang thai AI</div>
      <div class="section-body">
        <div class="card ai-status-card">
          <div class="ai-status-top">
            <span id="aiStatusBadge" class="ai-status-badge">Dang khoi dong</span>
            <span id="aiProviderLabel" class="ai-provider-label">-</span>
          </div>
          <div id="aiStatusText" class="ai-status-text">Dang kiem tra model runtime...</div>
        </div>
      </div>
    </section>

    <div id="status" class="status">San sang. Mo mot tai lieu RGB trong Photoshop de bat dau.</div>
    <div class="progress-card">
      <div class="progress-meta">
        <span class="metric-label">Tien do hang loat</span>
        <span id="progressText" class="metric-value">0%</span>
      </div>
      <div class="progress-track">
        <div id="progressFill" class="progress-fill"></div>
      </div>
    </div>
  </div>
`;

let root;
let busy = false;
const localFileSystem = storage.localFileSystem;
let batchInputFolder = null;
let batchOutputFolder = null;
const DEFAULT_BATCH_FILE_TEMPLATE = "{name}.{format}";
const SETTINGS_DEBOUNCE_MS = 150;
const SETTINGS_KEYS = {
  exportFormat: "ai_realestate.export_format",
  preset: "ai_realestate.preset",
  performanceMode: "ai_realestate.performance_mode",
  windowBalance: "ai_realestate.window_balance",
  shadowLift: "ai_realestate.shadow_lift",
  autoExposureMode: "ai_realestate.auto_exposure_mode",
  sceneAwareMode: "ai_realestate.scene_aware_mode",
  protectWallColorMode: "ai_realestate.protect_wall_color_mode",
  protectMaterialToneMode: "ai_realestate.protect_material_tone_mode",
  whiteCabinetProtectionMode: "ai_realestate.white_cabinet_protection_mode",
  wallColorSensitivity: "ai_realestate.wall_color_sensitivity",
  hdrStrength: "ai_realestate.hdr_strength",
  jpgQuality: "ai_realestate.jpg_quality",
  tiffCompression: "ai_realestate.tiff_compression",
  batchHdrMode: "ai_realestate.batch_hdr_mode",
  batchFileNameTemplate: "ai_realestate.batch_file_name_template",
  autoPresetMode: "ai_realestate.auto_preset_mode",
  skipExistingBatch: "ai_realestate.skip_existing_batch",
  formOpenCore: "ai_realestate.form_open_core",
  formOpenTone: "ai_realestate.form_open_tone",
  formOpenScene: "ai_realestate.form_open_scene",
  formOpenExport: "ai_realestate.form_open_export",
  formOpenFolders: "ai_realestate.form_open_folders",
  formOpenBatchOptions: "ai_realestate.form_open_batch_options",
  formOpenMetrics: "ai_realestate.form_open_metrics"
};
const FORM_TOGGLE_SETTING_KEYS = {
  core: SETTINGS_KEYS.formOpenCore,
  tone: SETTINGS_KEYS.formOpenTone,
  scene: SETTINGS_KEYS.formOpenScene,
  export: SETTINGS_KEYS.formOpenExport,
  folders: SETTINGS_KEYS.formOpenFolders,
  "batch-options": SETTINGS_KEYS.formOpenBatchOptions,
  metrics: SETTINGS_KEYS.formOpenMetrics
};
let settingsWriteTimer = null;
const pendingSettings = new Map();

function $(selector) {
  return root.querySelector(selector);
}

function translateExposureClass(value) {
  if (value === "Bright") {
    return "Sang";
  }
  if (value === "Dark") {
    return "Toi";
  }
  if (value === "Balanced") {
    return "Can bang";
  }
  return value || "-";
}

function translateSceneClass(value) {
  const map = {
    "Living Room": "Phong khach",
    Bedroom: "Phong ngu",
    Kitchen: "Nha bep",
    Bathroom: "Phong tam",
    Facade: "Mat tien",
    "Exterior Wide": "Ngoai canh rong"
  };
  return map[value] || value || "-";
}

function translateAdaptiveLabel(value) {
  const map = {
    Manual: "Thu cong",
    "Auto Bright": "Tu dong cho anh sang",
    "Auto Dark": "Tu dong cho anh toi",
    "Auto Balanced": "Tu dong can bang"
  };
  return map[value] || value || "-";
}

function translatePerformanceLabel(value) {
  const map = {
    "Full Quality": "Chat luong cao",
    Fast: "Nhanh",
    Balanced: "Can bang",
    "Auto -> Fast": "Tu dong -> Nhanh",
    "Auto -> Balanced": "Tu dong -> Can bang"
  };
  return map[value] || value || "-";
}

function translateHdrModeLabel(value) {
  return value === "auto" ? "Bracket HDR tu dong" : "Tung anh rieng";
}

function setStatus(message, isError = false) {
  const node = $("#status");
  if (!node) {
    return;
  }
  node.textContent = message;
  node.style.color = isError ? "#fecaca" : "#c6d0df";
  node.style.borderColor = isError ? "#7f1d1d" : "#283448";
}

function setBusyState(nextBusy) {
  busy = nextBusy;
  const buttons = root.querySelectorAll("button");
  buttons.forEach((button) => {
    button.disabled = nextBusy;
  });
}

function setSelectedAction(actionKey) {
  const actionButtons = root.querySelectorAll("[data-action-key]");
  actionButtons.forEach((button) => {
    button.classList.toggle(
      "is-selected",
      Boolean(actionKey) && button.getAttribute("data-action-key") === actionKey
    );
  });
}

function setFolderLabel(selector, folder) {
  const node = $(selector);
  if (!node) {
    return;
  }
  node.textContent = folder ? folder.nativePath || folder.name : "Chua chon";
}

function updateBatchHint() {
  const hint = $("#batchHint");
  const runButton = $("#runBatchBtn");
  if (!hint || !runButton) {
    return;
  }

  const hdrMode = getBatchHdrMode();

  if (!batchInputFolder) {
    batchOutputFolder = null;
    hint.textContent = "Con thieu thu muc dau vao.";
  } else {
    batchOutputFolder = batchInputFolder;
    setFolderLabel("#outputFolderLabel", batchOutputFolder);
    hint.textContent = hdrMode === "auto"
      ? "Da san sang chay hang loat. Plugin se tu dong gom bracket HDR khi tim thay nhieu frame cung canh."
      : "Da san sang chay hang loat. Tep dau ra se duoc luu cung thu muc dau vao.";
  }

  runButton.disabled = busy;
}

function setProgress(current, total, note = "") {
  const percent = total > 0 ? Math.max(0, Math.min(100, Math.round((current / total) * 100))) : 0;
  $("#progressFill").style.width = `${percent}%`;
  $("#progressText").textContent = note ? `${percent}% ${note}` : `${percent}%`;
}

function getHdrStrengthValue() {
  const rawValue = $("#hdrStrength") ? Number($("#hdrStrength").value) : 0.72;
  if (Number.isFinite(rawValue)) {
    return Math.max(0.25, Math.min(1.2, rawValue));
  }
  return 0.72;
}

function getBatchHdrMode() {
  const node = $("#batchHdrMode");
  return node ? node.value || "single" : "single";
}

async function refreshAiStatus() {
  const badge = $("#aiStatusBadge");
  const providerLabel = $("#aiProviderLabel");
  const textNode = $("#aiStatusText");
  if (!badge || !providerLabel || !textNode) {
    return;
  }

  badge.textContent = "Dang tai";
  badge.style.background = "#243754";
  badge.style.color = "#d9e7ff";
  providerLabel.textContent = "Khoi dong runtime";
  textNode.textContent = "Dang nap model va kiem tra provider...";

  try {
    await modelRuntime.warmup();
  } catch {}

  const runtimeStatus = modelRuntime.getStatus();
  const providerName = runtimeStatus.provider || "unknown-provider";
  providerLabel.textContent = providerName;

  if (runtimeStatus.ready && runtimeStatus.enabled) {
    badge.textContent = "AI dang hoat dong";
    badge.style.background = "#163726";
    badge.style.color = "#b7f7cf";
    textNode.textContent = runtimeStatus.colorMatchReady
      ? `Da nap model voi ${runtimeStatus.backend || "backend khong ro"}. Scene/exposure, region masks va color policy dang duoc AI ho tro.`
      : runtimeStatus.optionalColorMatchError
        ? `Da nap model voi ${runtimeStatus.backend || "backend khong ro"}. Scene/exposure va region masks dang duoc AI ho tro. Color match model rieng chua nap duoc nen plugin dang fallback sang color profile heuristic.`
        : `Da nap model voi ${runtimeStatus.backend || "backend khong ro"}. Scene/exposure va region masks dang duoc AI ho tro. Color match policy hien dang fallback heuristic.`;
    return;
  }

  if (runtimeStatus.error) {
    badge.textContent = "Fallback";
    badge.style.background = "#4a1f1f";
    badge.style.color = "#ffd3d3";
    textNode.textContent = `Khong nap duoc model runtime. Plugin dang dung heuristic fallback. Loi: ${runtimeStatus.error}`;
    return;
  }

  badge.textContent = "Heuristic";
  badge.style.background = "#4b3a16";
  badge.style.color = "#ffe6a3";
  textNode.textContent = "Plugin dang chay theo heuristic/fallback. Kiem tra ONNX runtime neu ban muon AI that.";
}

function saveSetting(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch {}
}

function flushPendingSettings() {
  if (settingsWriteTimer) {
    clearTimeout(settingsWriteTimer);
    settingsWriteTimer = null;
  }

  if (!pendingSettings.size) {
    return;
  }

  pendingSettings.forEach((value, key) => {
    saveSetting(key, value);
  });
  pendingSettings.clear();
}

/**
 * Coalesce rapid UI changes into one localStorage write burst.
 */
function queueSettingSave(key, value) {
  pendingSettings.set(key, value);

  if (settingsWriteTimer) {
    clearTimeout(settingsWriteTimer);
  }

  settingsWriteTimer = setTimeout(() => {
    flushPendingSettings();
  }, SETTINGS_DEBOUNCE_MS);
}

function loadSetting(key) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function loadBooleanSetting(key, fallback) {
  const saved = loadSetting(key);
  if (saved === "true") {
    return true;
  }
  if (saved === "false") {
    return false;
  }
  return fallback;
}

function applyStoredFormState(key, openByDefault) {
  const body = root.querySelector(`[data-form-body="${key}"]`);
  const toggle = root.querySelector(`[data-form-toggle="${key}"]`);
  if (!body || !toggle) {
    return;
  }

  const settingKey = FORM_TOGGLE_SETTING_KEYS[key];
  const shouldOpen = settingKey ? loadBooleanSetting(settingKey, openByDefault) : openByDefault;
  const icon = toggle.querySelector(".form-toggle-icon");

  body.hidden = !shouldOpen;
  toggle.setAttribute("aria-expanded", shouldOpen ? "true" : "false");
  if (icon) {
    icon.textContent = shouldOpen ? "-" : "+";
  }
}

async function restoreBatchSettings() {
  batchInputFolder = null;
  batchOutputFolder = null;
  setFolderLabel("#inputFolderLabel", null);
  const outputNode = $("#outputFolderLabel");
  if (outputNode) {
    outputNode.textContent = "Tu dong dung chung thu muc dau vao";
  }

  const savedFormat = loadSetting(SETTINGS_KEYS.exportFormat);
  if (savedFormat && (savedFormat === "jpg" || savedFormat === "tif")) {
    $("#singleExportFormat").value = savedFormat;
  }

  const savedPreset = loadSetting(SETTINGS_KEYS.preset);
  if (savedPreset && PRESETS[savedPreset]) {
    $("#preset").value = savedPreset;
  }

  const savedPerformanceMode = loadSetting(SETTINGS_KEYS.performanceMode);
  if (savedPerformanceMode && ["auto", "full", "balanced", "fast"].includes(savedPerformanceMode)) {
    $("#performanceMode").value = savedPerformanceMode;
  }

  $("#windowBalance").checked = loadBooleanSetting(SETTINGS_KEYS.windowBalance, true);
  $("#shadowLift").checked = loadBooleanSetting(SETTINGS_KEYS.shadowLift, true);
  $("#autoExposureMode").checked = loadBooleanSetting(SETTINGS_KEYS.autoExposureMode, true);
  $("#sceneAwareMode").checked = loadBooleanSetting(SETTINGS_KEYS.sceneAwareMode, true);
  $("#protectWallColorMode").checked = loadBooleanSetting(SETTINGS_KEYS.protectWallColorMode, true);
  $("#protectMaterialToneMode").checked = loadBooleanSetting(SETTINGS_KEYS.protectMaterialToneMode, true);
  $("#whiteCabinetProtectionMode").checked = loadBooleanSetting(SETTINGS_KEYS.whiteCabinetProtectionMode, true);
  $("#autoPresetMode").checked = loadBooleanSetting(SETTINGS_KEYS.autoPresetMode, true);
  $("#skipExistingBatch").checked = loadBooleanSetting(SETTINGS_KEYS.skipExistingBatch, true);

  const savedWallSensitivity = loadSetting(SETTINGS_KEYS.wallColorSensitivity);
  if (savedWallSensitivity && ["low", "medium", "high"].includes(savedWallSensitivity)) {
    $("#wallColorSensitivity").value = savedWallSensitivity;
  }

  const savedHdrStrength = loadSetting(SETTINGS_KEYS.hdrStrength);
  if (savedHdrStrength && ["0.55", "0.72", "0.9", "1.05"].includes(savedHdrStrength)) {
    $("#hdrStrength").value = savedHdrStrength;
  }

  const savedJpgQuality = loadSetting(SETTINGS_KEYS.jpgQuality);
  if (savedJpgQuality) {
    $("#jpgQuality").value = savedJpgQuality;
  }

  const savedTiffCompression = loadSetting(SETTINGS_KEYS.tiffCompression);
  if (savedTiffCompression && ["NONE", "LZW", "ZIP"].includes(savedTiffCompression)) {
    $("#tiffCompression").value = savedTiffCompression;
  }

  const savedBatchHdrMode = loadSetting(SETTINGS_KEYS.batchHdrMode);
  if (savedBatchHdrMode && ["single", "auto"].includes(savedBatchHdrMode)) {
    $("#batchHdrMode").value = savedBatchHdrMode;
  }

  const savedBatchFileNameTemplate = loadSetting(SETTINGS_KEYS.batchFileNameTemplate);
  $("#batchFileNameTemplate").value =
    savedBatchFileNameTemplate || DEFAULT_BATCH_FILE_TEMPLATE;

  updateBatchHint();
  updateSingleExportOptions();
  applyStoredFormState("core", true);
  applyStoredFormState("tone", false);
  applyStoredFormState("scene", false);
  applyStoredFormState("export", true);
  applyStoredFormState("folders", true);
  applyStoredFormState("batch-options", false);
  applyStoredFormState("metrics", false);
}

function clamp01(value) {
  if (value < 0) {
    return 0;
  }
  if (value > 1) {
    return 1;
  }
  return value;
}

function readDimension(value) {
  if (typeof value === "number") {
    return value;
  }
  if (value && typeof value.value === "number") {
    return value.value;
  }
  if (value && typeof value._value === "number") {
    return value._value;
  }
  const numeric = Number(value);
  if (!Number.isNaN(numeric)) {
    return numeric;
  }
  throw new Error("Khong doc duoc kich thuoc document tu Photoshop.");
}

function smoothstep(edge0, edge1, x) {
  const t = clamp01((x - edge0) / Math.max(edge1 - edge0, 0.00001));
  return t * t * (3 - 2 * t);
}

function applyContrast(channel, amount) {
  return clamp01((channel - 0.5) * (1 + amount) + 0.5);
}

function remapBlackPoint(channel, blackPoint) {
  if (blackPoint <= 0) {
    return clamp01(channel);
  }
  return clamp01((channel - blackPoint) / Math.max(1 - blackPoint, 0.00001));
}

function sampleRegionMask(mask, x, y, targetWidth, targetHeight) {
  return sampleMaskNearest(mask, x, y, targetWidth, targetHeight);
}

function applyModelTuningToPreset(basePreset, modelSignals) {
  const tunedPreset = { ...basePreset };
  const wallStrength = clamp01(modelSignals.wallMaskStrength || 0);
  const materialStrength = clamp01(modelSignals.materialProtectionStrength || 0);
  const cabinetStrength = clamp01(modelSignals.whiteCabinetStrength || 0);

  tunedPreset.highlightRecovery = Math.min(
    0.38,
    tunedPreset.highlightRecovery + cabinetStrength * 0.03
  );
  tunedPreset.neutralBalance = Math.max(
    0,
    tunedPreset.neutralBalance - wallStrength * 0.035 - materialStrength * 0.02
  );
  tunedPreset.saturation = Math.min(
    0.26,
    tunedPreset.saturation + wallStrength * 0.01
  );
  tunedPreset.microContrast = Math.min(
    0.18,
    tunedPreset.microContrast + materialStrength * 0.03
  );

  if (wallStrength > 0 || materialStrength > 0 || cabinetStrength > 0) {
    tunedPreset.modelLabel = "Duoc ho tro boi mo hinh";
  }

  return tunedPreset;
}

function softClipHighlights(channel, amount) {
  if (amount <= 0 || channel <= 0.75) {
    return clamp01(channel);
  }
  const normalized = (channel - 0.75) / 0.25;
  const compressed = normalized / (1 + amount * normalized * 1.8);
  return clamp01(0.75 + compressed * 0.25);
}

function applyShadowGamma(channel, gamma) {
  if (!gamma || Math.abs(gamma - 1) < 0.001) {
    return clamp01(channel);
  }
  return clamp01(Math.pow(channel, gamma));
}

function applyMidtoneBoost(channel, amount) {
  if (!amount) {
    return clamp01(channel);
  }
  const midpointWeight = 1 - Math.min(1, Math.abs(channel - 0.5) / 0.5);
  return clamp01(channel + midpointWeight * amount * 0.08);
}

function balanceNeutrals(r, g, b, amount) {
  if (!amount) {
    return [r, g, b];
  }
  const maxChannel = Math.max(r, g, b);
  const minChannel = Math.min(r, g, b);
  const chroma = maxChannel - minChannel;
  const neutralWeight = clamp01(1 - chroma * 5);
  const average = (r + g + b) / 3;

  return [
    clamp01(r * (1 - neutralWeight * amount) + average * neutralWeight * amount),
    clamp01(g * (1 - neutralWeight * amount) + average * neutralWeight * amount),
    clamp01(b * (1 - neutralWeight * amount) + average * neutralWeight * amount)
  ];
}

function getWallProtectionMask(r, g, b, luma) {
  const maxChannel = Math.max(r, g, b);
  const minChannel = Math.min(r, g, b);
  const chroma = maxChannel - minChannel;
  const midtoneWeight = 1 - Math.min(1, Math.abs(luma - 0.58) / 0.32);
  const lowChromaWeight = clamp01(1 - chroma * 6);
  const surfaceWeight = clamp01(midtoneWeight * 0.65 + lowChromaWeight * 0.35);
  return surfaceWeight;
}

function getWallSensitivityConfig(level) {
  if (level === "high") {
    return {
      neutralReduction: 0.9,
      saturationBoost: 0.018,
      restoreAmount: 0.3
    };
  }

  if (level === "low") {
    return {
      neutralReduction: 0.5,
      saturationBoost: 0.006,
      restoreAmount: 0.14
    };
  }

  return {
    neutralReduction: 0.75,
    saturationBoost: 0.01,
    restoreAmount: 0.22
  };
}

function getMaterialProtectionMask(r, g, b, luma) {
  const maxChannel = Math.max(r, g, b);
  const minChannel = Math.min(r, g, b);
  const chroma = maxChannel - minChannel;
  const materialBand = 1 - Math.min(1, Math.abs(luma - 0.5) / 0.38);
  const chromaBand = clamp01(1 - Math.abs(chroma - 0.16) / 0.16);
  return clamp01(materialBand * 0.55 + chromaBand * 0.45);
}

function getWhiteCabinetMask(r, g, b, luma) {
  const maxChannel = Math.max(r, g, b);
  const minChannel = Math.min(r, g, b);
  const chroma = maxChannel - minChannel;
  const brightWeight = clamp01((luma - 0.62) / 0.25);
  const lowChromaWeight = clamp01(1 - chroma * 8);
  return clamp01(brightWeight * lowChromaWeight);
}

function applySaturation(r, g, b, amount, vibrance) {
  const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  const maxChannel = Math.max(r, g, b);
  const minChannel = Math.min(r, g, b);
  const chroma = maxChannel - minChannel;
  const vibranceBoost = 1 + vibrance * (1 - chroma);
  const satBoost = 1 + amount;

  return [
    clamp01(luma + (r - luma) * satBoost * vibranceBoost),
    clamp01(luma + (g - luma) * satBoost * vibranceBoost),
    clamp01(luma + (b - luma) * satBoost * vibranceBoost)
  ];
}

function analyzePixels(pixelData) {
  const components = pixelData.components;
  let totalLuma = 0;
  let visiblePixels = 0;
  let highlights = 0;
  let shadows = 0;
  let totalWarmBias = 0;
  let totalBlueBias = 0;
  let totalNeutralBias = 0;
  let totalSaturation = 0;
  let brightNeutralPixels = 0;
  let warmPixels = 0;
  let coolPixels = 0;

  for (let index = 0; index < pixelData.data.length; index += components) {
    const alpha = components === 4 ? pixelData.data[index + 3] / 255 : 1;
    if (alpha === 0) {
      continue;
    }

    const r = pixelData.data[index] / 255;
    const g = pixelData.data[index + 1] / 255;
    const b = pixelData.data[index + 2] / 255;
    const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    const maxChannel = Math.max(r, g, b);
    const minChannel = Math.min(r, g, b);
    const chroma = maxChannel - minChannel;

    totalLuma += luma;
    visiblePixels += 1;
    totalWarmBias += r - b;
    totalBlueBias += b - r;
    totalNeutralBias += 1 - Math.min(1, chroma * 5);
    totalSaturation += chroma;
    if (luma > 0.62 && chroma < 0.08) {
      brightNeutralPixels += 1;
    }
    if (r - b > 0.06) {
      warmPixels += 1;
    } else if (b - r > 0.06) {
      coolPixels += 1;
    }

    if (luma >= 0.82) {
      highlights += 1;
    } else if (luma <= 0.2) {
      shadows += 1;
    }
  }

  if (!visiblePixels) {
    return {
      averageLuma: 0,
      highlightRatio: 0,
      shadowRatio: 0,
      recommendedPreset: PRESETS.luxury.label
    };
  }

  const averageLuma = totalLuma / visiblePixels;
  const highlightRatio = highlights / visiblePixels;
  const shadowRatio = shadows / visiblePixels;
  const averageWarmBias = totalWarmBias / visiblePixels;
  const averageBlueBias = totalBlueBias / visiblePixels;
  const averageNeutralBias = totalNeutralBias / visiblePixels;
  const averageSaturation = totalSaturation / visiblePixels;
  const brightNeutralRatio = brightNeutralPixels / visiblePixels;
  const warmRatio = warmPixels / visiblePixels;
  const coolRatio = coolPixels / visiblePixels;

  let recommendedPreset = PRESETS.luxury.label;
  if (averageLuma < 0.4 || shadowRatio > 0.25) {
    recommendedPreset = PRESETS.airbnb.label;
  } else if (highlightRatio < 0.08 && averageLuma < 0.52) {
    recommendedPreset = PRESETS.warm.label;
  }

  let exposureClass = "Balanced";
  if (averageLuma >= 0.68 || highlightRatio >= 0.22) {
    exposureClass = "Bright";
  } else if (averageLuma <= 0.42 || shadowRatio >= 0.2) {
    exposureClass = "Dark";
  }

  let sceneClass = "Living Room";
  if (highlightRatio >= 0.24 && averageBlueBias >= 0.02 && averageLuma >= 0.58) {
    sceneClass = "Exterior Wide";
  } else if (highlightRatio >= 0.14 && averageBlueBias >= 0.006 && averageLuma >= 0.5) {
    sceneClass = "Facade";
  } else if (brightNeutralRatio >= 0.22 && averageNeutralBias >= 0.45 && averageSaturation <= 0.12) {
    sceneClass = "Bathroom";
  } else if (brightNeutralRatio >= 0.16 && averageNeutralBias >= 0.35 && warmRatio >= 0.12) {
    sceneClass = "Kitchen";
  } else if (averageLuma <= 0.5 && warmRatio >= 0.16 && highlightRatio <= 0.14) {
    sceneClass = "Bedroom";
  }

  return {
    averageLuma,
    highlightRatio,
    shadowRatio,
    averageWarmBias,
    averageBlueBias,
    averageNeutralBias,
    averageSaturation,
    brightNeutralRatio,
    warmRatio,
    coolRatio,
    recommendedPreset,
    exposureClass,
    sceneClass
  };
}

function formatPercent(value) {
  return `${(value * 100).toFixed(1)}%`;
}

function formatSummaryLabel(context) {
  return `${context.basePreset.label} | ${translateSceneClass(context.metrics.sceneClass)} | ${translateExposureClass(context.metrics.exposureClass)}`;
}

function getPerformancePlan(docWidth, docHeight, mode) {
  const maxDimension = Math.max(docWidth, docHeight);
  let processingMaxDimension = maxDimension;
  let label = "Full Quality";

  if (mode === "fast") {
    processingMaxDimension = 2048;
    label = "Fast";
  } else if (mode === "balanced") {
    processingMaxDimension = 3072;
    label = "Balanced";
  } else if (mode === "auto") {
    if (maxDimension >= 7000) {
      processingMaxDimension = 2600;
      label = "Auto -> Fast";
    } else if (maxDimension >= 4500) {
      processingMaxDimension = 3400;
      label = "Auto -> Balanced";
    }
  }

  if (processingMaxDimension >= maxDimension) {
    return {
      label,
      useProxy: false,
      scaleFactor: 1,
      targetSize: undefined,
      scalePercent: 100
    };
  }

  const scaleFactor = processingMaxDimension / maxDimension;
  return {
    label,
    useProxy: true,
    scaleFactor,
    targetSize: {
      width: Math.max(1, Math.round(docWidth * scaleFactor)),
      height: Math.max(1, Math.round(docHeight * scaleFactor))
    },
    scalePercent: 100 / scaleFactor
  };
}

function getRecommendedPresetKey(metrics) {
  if (metrics.sceneClass === "Bedroom") {
    return "warm";
  }
  if (metrics.sceneClass === "Kitchen" || metrics.sceneClass === "Bathroom") {
    return "luxury";
  }
  if (metrics.sceneClass === "Facade" || metrics.sceneClass === "Exterior Wide") {
    return "airbnb";
  }
  return (
    Object.keys(PRESETS).find((key) => PRESETS[key].label === metrics.recommendedPreset) ||
    "luxury"
  );
}

function getSelectedPresetKey() {
  return $("#preset").value || "luxury";
}

function getDefaultExportBaseName(doc = app.activeDocument) {
  if (!doc || !doc.title) {
    return "real-estate-enhanced";
  }
  return sanitizeFileStem(doc.title);
}

function getPhotoshopVersion() {
  return app && typeof app.version === "string" ? app.version : "";
}

function supportsSilentTiffExport() {
  const version = getPhotoshopVersion();
  return !/^25\.1(\.|$)/.test(version);
}

async function flattenDocumentInScope(doc) {
  if (doc && typeof doc.flatten === "function") {
    await doc.flatten();
    return;
  }

  await action.batchPlay(
    [
      {
        _obj: "flattenImage",
        _target: [
          {
            _ref: "document",
            _id: doc.id
          }
        ]
      }
    ],
    {
      synchronousExecution: true,
      modalBehavior: "execute"
    }
  );
}

async function closeDocumentWithoutSavingInScope(doc) {
  if (doc && typeof doc.closeWithoutSaving === "function") {
    await doc.closeWithoutSaving();
    return;
  }

  await action.batchPlay(
    [
      {
        _obj: "close",
        saving: {
          _enum: "yesNo",
          _value: "no"
        },
        _target: [
          {
            _ref: "document",
            _id: doc.id
          }
        ]
      }
    ],
    {
      synchronousExecution: true,
      modalBehavior: "execute"
    }
  );
}

async function requestSaveFile(extension) {
  const baseName = sanitizeBaseName(getDefaultExportBaseName(app.activeDocument), getDefaultExportBaseName(app.activeDocument));
  return localFileSystem.getFileForSaving(`${baseName}.${extension}`, {
    types: [extension]
  });
}

async function createOutputFile(folder, fileName) {
  return folder.createFile(fileName, { overwrite: true });
}

async function outputFileExists(folder, fileName) {
  const entries = await folder.getEntries();
  return entries.some((entry) => !entry.isFolder && entry.name.toLowerCase() === fileName.toLowerCase());
}

async function exportDocumentToEntry(doc, format, options) {
  if (format === "jpg") {
    await doc.saveAs.jpg(
      options.file,
      {
        quality: options.quality,
        embedColorProfile: true
      },
      true
    );
    return;
  }

  const fileHandlingPreferences = app && app.preferences ? app.preferences.fileHandling : null;
  const canToggleLayeredTiffPrompt = fileHandlingPreferences
    && Object.prototype.hasOwnProperty.call(fileHandlingPreferences, "askBeforeSavingLayeredTIFF");
  const previousLayeredTiffPrompt = canToggleLayeredTiffPrompt
    ? fileHandlingPreferences.askBeforeSavingLayeredTIFF
    : null;
  const exportDoc = doc;

  try {
    if (canToggleLayeredTiffPrompt) {
      fileHandlingPreferences.askBeforeSavingLayeredTIFF = false;
    }

    await flattenDocumentInScope(exportDoc);

    const token = localFileSystem.createSessionToken(options.file);
    await action.batchPlay(
      [
        {
          _obj: "save",
          as: {
            _obj: "TIFF",
            byteOrder: {
              _enum: "platform",
              _value: "IBMPC"
            },
            imageCompression: {
              _enum: "encoding",
              _value: options.compression
            },
            layerCompression: {
              _enum: "encoding",
              _value: options.compression === "NONE" ? "RLE" : options.compression
            },
            saveImagePyramid: false,
            embedColorProfile: true
          },
          in: {
            _path: token,
            _kind: "local"
          },
          copy: true,
          lowerCase: true,
          _target: [
            {
              _ref: "document",
              _id: exportDoc.id
            }
          ],
          _options: {
            dialogOptions: "dontDisplay"
          }
        }
      ],
      {
        synchronousExecution: true,
        modalBehavior: "execute"
      }
    );
  } finally {
    if (canToggleLayeredTiffPrompt) {
      fileHandlingPreferences.askBeforeSavingLayeredTIFF = previousLayeredTiffPrompt;
    }
  }
}

async function exportCurrentDocumentAsJpg() {
  const doc = await ensureRgbDocument();
  const file = await requestSaveFile("jpg");

  if (!file) {
    throw new Error("Da huy chon vi tri luu JPG.");
  }

  const requestedQuality = Number($("#jpgQuality").value);
  const quality = Number.isFinite(requestedQuality)
    ? Math.max(1, Math.min(12, Math.round(requestedQuality)))
    : 10;

  await core.executeAsModal(async () => {
    await exportDocumentToEntry(doc, "jpg", { file, quality });
  }, { commandName: "Export JPG" });

  return file;
}

async function exportCurrentDocumentAsTiff() {
  const doc = await ensureRgbDocument();
  const file = await requestSaveFile("tif");

  if (!file) {
    throw new Error("Da huy chon vi tri luu TIFF.");
  }

  const compression = $("#tiffCompression").value || "LZW";

  await core.executeAsModal(async () => {
    await exportDocumentToEntry(doc, "tif", { file, compression });
  }, { commandName: "Export TIFF" });

  return file;
}

function updateSingleExportOptions() {
  const formatSelect = $("#singleExportFormat");
  const jpgOptions = $("#jpgExportOptions");
  const tiffOptions = $("#tiffExportOptions");
  const tiffStrategyNote = $("#tiffStrategyNote");
  const exportButton = $("#exportCurrentBtn");
  if (!formatSelect || !jpgOptions || !tiffOptions || !exportButton) {
    return;
  }

  const format = formatSelect.value || "jpg";
  saveSetting(SETTINGS_KEYS.exportFormat, format);
  const isJpg = format === "jpg";
  const tiffAllowed = isJpg || supportsSilentTiffExport();
  jpgOptions.hidden = !isJpg;
  tiffOptions.hidden = isJpg;
  if (tiffStrategyNote) {
    tiffStrategyNote.hidden = isJpg;
    tiffStrategyNote.textContent = tiffAllowed
      ? "TIFF se duoc xuat tu dong neu host Photoshop cho phep."
      : `TIFF tu dong chua on dinh tren Photoshop ${getPhotoshopVersion() || "hien tai"}. Nen dung JPG hoac Save As thu cong.`;
  }
  exportButton.disabled = !tiffAllowed;
  exportButton.textContent = isJpg ? "Xuat JPG" : (tiffAllowed ? "Xuat TIFF" : "TIFF chua ho tro");
  exportButton.title = tiffAllowed
    ? ""
    : `Photoshop ${getPhotoshopVersion() || "hien tai"} hien chua xuat TIFF tu dong on dinh.`;
}

async function handleExportCurrent() {
  const format = ($("#singleExportFormat").value || "jpg").toLowerCase();
  if (format === "tif") {
    await handleExportTiff();
    return;
  }
  await handleExportJpg();
}

function updateMetrics(metrics) {
  $("#avgLight").textContent = formatPercent(metrics.averageLuma);
  $("#highlightRatio").textContent = formatPercent(metrics.highlightRatio);
  $("#shadowRatio").textContent = formatPercent(metrics.shadowRatio);
  $("#recommendedPreset").textContent = metrics.recommendedPreset;
  $("#exposureClass").textContent = translateExposureClass(metrics.exposureClass);
  $("#sceneClass").textContent = translateSceneClass(metrics.sceneClass);
}

function createAdaptivePreset(basePreset, metrics, enabled) {
  if (!enabled) {
    return {
      ...basePreset,
      adaptiveLabel: "Manual"
    };
  }

  const adaptivePreset = { ...basePreset };

  if (metrics.exposureClass === "Bright") {
    adaptivePreset.exposure -= 0.04;
    adaptivePreset.highlightRecovery += 0.14;
    adaptivePreset.shadowLift = Math.max(0.04, adaptivePreset.shadowLift - 0.03);
    adaptivePreset.contrast = Math.max(0.04, adaptivePreset.contrast - 0.02);
    adaptivePreset.windowThreshold = Math.max(0.7, adaptivePreset.windowThreshold - 0.06);
    adaptivePreset.highlightSoftClip += 0.06;
    adaptivePreset.neutralBalance += 0.03;
    adaptivePreset.adaptiveLabel = "Auto Bright";
  } else if (metrics.exposureClass === "Dark") {
    adaptivePreset.exposure += 0.05;
    adaptivePreset.shadowLift += 0.09;
    adaptivePreset.contrast = Math.max(0.03, adaptivePreset.contrast - 0.01);
    adaptivePreset.saturation += 0.02;
    adaptivePreset.shadowGamma = Math.max(0.84, adaptivePreset.shadowGamma - 0.03);
    adaptivePreset.midtoneBoost += 0.04;
    adaptivePreset.adaptiveLabel = "Auto Dark";
  } else {
    adaptivePreset.exposure += 0.01;
    adaptivePreset.contrast += 0.02;
    adaptivePreset.vibrance += 0.02;
    adaptivePreset.microContrast += 0.02;
    adaptivePreset.adaptiveLabel = "Auto Balanced";
  }

  adaptivePreset.exposure = Math.max(-0.1, Math.min(0.18, adaptivePreset.exposure));
  adaptivePreset.contrast = Math.max(0, Math.min(0.3, adaptivePreset.contrast));
  adaptivePreset.saturation = Math.max(0, Math.min(0.25, adaptivePreset.saturation));
  adaptivePreset.vibrance = Math.max(0, Math.min(0.25, adaptivePreset.vibrance));
  adaptivePreset.shadowLift = Math.max(0, Math.min(0.3, adaptivePreset.shadowLift));
  adaptivePreset.highlightRecovery = Math.max(0.04, Math.min(0.35, adaptivePreset.highlightRecovery));
  adaptivePreset.windowThreshold = Math.max(0.65, Math.min(0.9, adaptivePreset.windowThreshold));
  adaptivePreset.blackPoint = Math.max(0, Math.min(0.03, adaptivePreset.blackPoint));
  adaptivePreset.shadowGamma = Math.max(0.82, Math.min(1, adaptivePreset.shadowGamma));
  adaptivePreset.midtoneBoost = Math.max(0, Math.min(0.18, adaptivePreset.midtoneBoost));
  adaptivePreset.microContrast = Math.max(0, Math.min(0.16, adaptivePreset.microContrast));
  adaptivePreset.highlightSoftClip = Math.max(0, Math.min(0.28, adaptivePreset.highlightSoftClip));
  adaptivePreset.neutralBalance = Math.max(0, Math.min(0.22, adaptivePreset.neutralBalance));

  return adaptivePreset;
}

function applyScenePipeline(basePreset, metrics, enabled) {
  const scenePreset = { ...basePreset };

  if (!enabled) {
    scenePreset.sceneLabel = "Scene Manual";
    return scenePreset;
  }

  if (metrics.sceneClass === "Exterior Wide") {
    scenePreset.temperature = Math.max(-0.012, scenePreset.temperature - 0.014);
    scenePreset.highlightRecovery += 0.08;
    scenePreset.shadowLift = Math.max(0.02, scenePreset.shadowLift - 0.03);
    scenePreset.microContrast += 0.045;
    scenePreset.neutralBalance = Math.max(0.03, scenePreset.neutralBalance - 0.04);
    scenePreset.saturation = Math.max(0.02, scenePreset.saturation - 0.015);
    scenePreset.sceneLabel = "Canh ngoai rong";
  } else if (metrics.sceneClass === "Facade") {
    scenePreset.temperature = Math.max(-0.005, scenePreset.temperature - 0.01);
    scenePreset.highlightRecovery += 0.06;
    scenePreset.shadowLift = Math.max(0.02, scenePreset.shadowLift - 0.02);
    scenePreset.microContrast += 0.03;
    scenePreset.neutralBalance = Math.max(0.04, scenePreset.neutralBalance - 0.03);
    scenePreset.saturation = Math.max(0.02, scenePreset.saturation - 0.01);
    scenePreset.sceneLabel = "Canh mat tien";
  } else if (metrics.sceneClass === "Bathroom") {
    scenePreset.temperature = Math.max(-0.004, scenePreset.temperature - 0.008);
    scenePreset.tint = Math.max(-0.014, scenePreset.tint - 0.005);
    scenePreset.neutralBalance += 0.08;
    scenePreset.highlightSoftClip += 0.04;
    scenePreset.microContrast += 0.02;
    scenePreset.shadowGamma = Math.min(0.97, scenePreset.shadowGamma + 0.015);
    scenePreset.sceneLabel = "Canh phong tam";
  } else if (metrics.sceneClass === "Kitchen") {
    scenePreset.temperature = Math.max(0.002, scenePreset.temperature - 0.002);
    scenePreset.neutralBalance += 0.05;
    scenePreset.highlightSoftClip += 0.025;
    scenePreset.microContrast += 0.02;
    scenePreset.midtoneBoost += 0.02;
    scenePreset.sceneLabel = "Canh nha bep";
  } else if (metrics.sceneClass === "Bedroom") {
    scenePreset.temperature += 0.014;
    scenePreset.shadowLift += 0.03;
    scenePreset.midtoneBoost += 0.03;
    scenePreset.neutralBalance = Math.max(0.04, scenePreset.neutralBalance - 0.01);
    scenePreset.sceneLabel = "Canh phong ngu";
  } else {
    scenePreset.temperature += 0.008;
    scenePreset.shadowLift += 0.02;
    scenePreset.midtoneBoost += 0.02;
    scenePreset.neutralBalance += 0.02;
    scenePreset.sceneLabel = "Canh phong khach";
  }

  scenePreset.temperature = Math.max(-0.03, Math.min(0.06, scenePreset.temperature));
  scenePreset.tint = Math.max(-0.03, Math.min(0.03, scenePreset.tint));
  scenePreset.shadowLift = Math.max(0, Math.min(0.32, scenePreset.shadowLift));
  scenePreset.microContrast = Math.max(0, Math.min(0.18, scenePreset.microContrast));
  scenePreset.neutralBalance = Math.max(0, Math.min(0.24, scenePreset.neutralBalance));
  scenePreset.highlightSoftClip = Math.max(0, Math.min(0.3, scenePreset.highlightSoftClip));
  scenePreset.shadowGamma = Math.max(0.82, Math.min(1, scenePreset.shadowGamma));
  scenePreset.midtoneBoost = Math.max(0, Math.min(0.2, scenePreset.midtoneBoost));

  return scenePreset;
}

function buildLayerName(preset, adaptivePreset, metrics, isBatch = false) {
  const parts = [preset.label];
  if (metrics.sceneClass) {
    parts.push(translateSceneClass(metrics.sceneClass));
  }
  if (adaptivePreset && adaptivePreset.adaptiveLabel && adaptivePreset.adaptiveLabel !== "Manual") {
    parts.push(translateAdaptiveLabel(adaptivePreset.adaptiveLabel));
  }
  if (isBatch) {
    parts.push(translateExposureClass(metrics.exposureClass));
  }
  return `AI ${parts.join(" | ")}`;
}

async function buildProcessingContext(doc, options = {}) {
  return pipelineOrchestrator.buildContext(doc, options);
}

async function applyProcessedLayer(context, processed, options = {}) {
  await core.executeAsModal(async () => {
    const newLayer = await context.doc.createLayer({
      name: options.layerName || buildLayerName(context.basePreset, context.adaptivePreset, context.metrics, options.isBatch)
    });
    if (typeof options.opacity === "number" && Number.isFinite(options.opacity)) {
      try {
        newLayer.opacity = Math.max(1, Math.min(100, options.opacity));
      } catch {}
    }

    const outputImage = await imaging.createImageDataFromBuffer(processed, {
      width: context.pixelData.width,
      height: context.pixelData.height,
      components: context.pixelData.components,
      chunky: true,
      colorSpace: "RGB",
      colorProfile: context.pixelData.colorProfile || ""
    });

    try {
      await imaging.putPixels({
        documentID: context.doc.id,
        layerID: newLayer.id,
        imageData: outputImage,
        replace: true,
        targetBounds: {
          left: context.pixelData.sourceBounds.left,
          top: context.pixelData.sourceBounds.top
        },
        commandName: `Apply ${context.basePreset.label}`
      });

      if (context.performancePlan.useProxy) {
        await newLayer.scale(
          context.performancePlan.scalePercent,
          context.performancePlan.scalePercent,
          constants.AnchorPosition.TOPLEFT,
          { interpolation: constants.InterpolationMethod.BICUBICSMOOTHER }
        );
      }
    } finally {
      outputImage.dispose();
    }
  }, { commandName: `AI RealEstate ${context.basePreset.label}` });
}

async function renderEnhancedLayer(context, options = {}) {
  return pipelineOrchestrator.render(context, options);
}

async function renderWallCompare(context) {
  await renderEnhancedLayer(context, {
    windowBalance: $("#windowBalance").checked,
    shadowLift: $("#shadowLift").checked,
    protectWallColor: true,
    wallColorSensitivity: "medium",
    protectMaterialTone: $("#protectMaterialToneMode").checked,
    whiteCabinetProtection: $("#whiteCabinetProtectionMode").checked,
    layerName: `AI Wall Compare | Medium | ${context.metrics.sceneClass}`,
    isBatch: false
  });

  await renderEnhancedLayer(context, {
    windowBalance: $("#windowBalance").checked,
    shadowLift: $("#shadowLift").checked,
    protectWallColor: true,
    wallColorSensitivity: "high",
    protectMaterialTone: $("#protectMaterialToneMode").checked,
    whiteCabinetProtection: $("#whiteCabinetProtectionMode").checked,
    layerName: `AI Wall Compare | High | ${context.metrics.sceneClass}`,
    isBatch: false
  });
}

async function closeDocumentWithoutSaving(doc) {
  await core.executeAsModal(async () => {
    if (doc && typeof doc.closeWithoutSaving === "function") {
      await doc.closeWithoutSaving();
      return;
    }

    await action.batchPlay(
      [
        {
          _obj: "close",
          saving: {
            _enum: "yesNo",
            _value: "no"
          },
          _target: [
            {
              _ref: "document",
              _id: doc.id
            }
          ]
        }
      ],
      {
        synchronousExecution: false,
        modalBehavior: "execute"
      }
    );
  }, { commandName: "Close Batch Document" });
}

function getBatchExtensionPriority(name) {
  const extensionMatch = /\.([^.]+)$/.exec(String(name || ""));
  const extension = extensionMatch ? extensionMatch[1].toLowerCase() : "";
  const priorityByExtension = {
    jpg: 1,
    jpeg: 1,
    png: 2,
    psd: 3,
    tif: 4,
    tiff: 4
  };
  return Object.prototype.hasOwnProperty.call(priorityByExtension, extension)
    ? priorityByExtension[extension]
    : 99;
}

function pickPreferredBatchEntry(entries) {
  return entries
    .slice()
    .sort((left, right) => getBatchExtensionPriority(left.name) - getBatchExtensionPriority(right.name))[0];
}

function parseBracketFrame(name) {
  const stem = sanitizeFileStem(name);
  const patterns = [
    /^(.*?)[_\-\s](?:ev|exp|exposure)([+\-]?\d+(?:\.\d+)?)$/i,
    /^(.*?)[_\-\s]([+\-]\d+(?:\.\d+)?)$/i,
    /^(.*?)[_\-\s]m(\d+(?:\.\d+)?)$/i,
    /^(.*?)[_\-\s]p(\d+(?:\.\d+)?)$/i
  ];

  for (const pattern of patterns) {
    const match = pattern.exec(stem);
    if (!match) {
      continue;
    }

    const baseStem = sanitizeBaseName(match[1], stem);
    if (!baseStem) {
      continue;
    }

    let exposure = Number(match[2]);
    if (!Number.isFinite(exposure)) {
      continue;
    }
    if (/[_\-\s]m/i.test(match[0]) && !/[-+]/.test(match[2])) {
      exposure *= -1;
    }
    if (/[_\-\s]p/i.test(match[0]) && !/[-+]/.test(match[2])) {
      exposure *= 1;
    }

    return {
      baseStem,
      exposure
    };
  }

  return {
    baseStem: stem,
    exposure: null
  };
}

function getBatchProcessingUnits(entries, hdrMode) {
  const eligibleEntries = entries.filter((entry) => {
    if (!entry || entry.isFolder) {
      return false;
    }
    return /\.(jpg|jpeg|png|tif|tiff|psd)$/i.test(entry.name);
  });

  if (hdrMode !== "auto") {
    const uniqueByStem = new Map();
    eligibleEntries.forEach((entry) => {
      const stem = sanitizeFileStem(entry.name).toLowerCase();
      const existing = uniqueByStem.get(stem);
      if (!existing) {
        uniqueByStem.set(stem, [entry]);
      } else {
        existing.push(entry);
      }
    });

    return Array.from(uniqueByStem.values())
      .map((groupEntries) => {
        const primaryEntry = pickPreferredBatchEntry(groupEntries);
        return {
          kind: "single",
          label: primaryEntry.name,
          primaryEntry,
          bracketEntries: [],
          sourceName: primaryEntry.name
        };
      })
      .sort((left, right) => left.sourceName.localeCompare(right.sourceName));
  }

  const grouped = new Map();
  eligibleEntries.forEach((entry) => {
    const bracketInfo = parseBracketFrame(entry.name);
    const groupKey = bracketInfo.baseStem.toLowerCase();
    if (!grouped.has(groupKey)) {
      grouped.set(groupKey, []);
    }
    grouped.get(groupKey).push({
      entry,
      bracketInfo
    });
  });

  const units = [];
  grouped.forEach((items, groupKey) => {
    const buckets = new Map();
    items.forEach((item) => {
      const exposureKey = item.bracketInfo.exposure === null
        ? "__single__"
        : String(item.bracketInfo.exposure);
      if (!buckets.has(exposureKey)) {
        buckets.set(exposureKey, []);
      }
      buckets.get(exposureKey).push(item.entry);
    });

    const normalized = Array.from(buckets.entries()).map(([exposureKey, bucketEntries]) => ({
      exposure: exposureKey === "__single__" ? null : Number(exposureKey),
      entry: pickPreferredBatchEntry(bucketEntries)
    }));

    const bracketCandidates = normalized.filter((item) => item.exposure !== null);
    if (bracketCandidates.length >= 2) {
      bracketCandidates.sort((left, right) => left.exposure - right.exposure);
      const primaryCandidate = bracketCandidates.reduce((best, current) => {
        if (!best) {
          return current;
        }
        return Math.abs(current.exposure) < Math.abs(best.exposure) ? current : best;
      }, null);
      const primaryEntry = primaryCandidate ? primaryCandidate.entry : bracketCandidates[0].entry;
      units.push({
        kind: "bracket",
        label: `${sanitizeBaseName(groupKey, groupKey)} (${bracketCandidates.length} frame HDR)`,
        primaryEntry,
        bracketEntries: bracketCandidates.map((item) => item.entry),
        sourceName: primaryEntry.name
      });
      return;
    }

    const primaryEntry = pickPreferredBatchEntry(normalized.map((item) => item.entry));
    units.push({
      kind: "single",
      label: primaryEntry.name,
      primaryEntry,
      bracketEntries: [],
      sourceName: primaryEntry.name
    });
  });

  return units.sort((left, right) => left.sourceName.localeCompare(right.sourceName));
}

async function getCompositePixels(doc = app.activeDocument, options = {}) {
  if (!doc) {
    throw new Error("Khong co document nao dang mo trong Photoshop.");
  }

  let imageObj;
  let data;
  await core.executeAsModal(async () => {
    imageObj = await imaging.getPixels({
      documentID: doc.id,
      sourceBounds: {
        left: 0,
        top: 0,
        right: readDimension(doc.width),
        bottom: readDimension(doc.height)
      },
      colorSpace: "RGB",
      componentSize: 8,
      ...options
    });

    const imageData = imageObj.imageData;
    data = await imageData.getData({ chunky: true });
  }, { commandName: `Doc pixel ${doc.title || doc.id}` });

  const imageData = imageObj.imageData;

  return {
    documentID: doc.id,
    width: imageData.width,
    height: imageData.height,
    components: imageData.components,
    colorProfile: imageData.colorProfile,
    data,
    sourceBounds: imageObj.sourceBounds
  };
}

function processPixels(pixelData, preset, options) {
  const out = new Uint8Array(pixelData.data.length);
  const components = pixelData.components;
  const enableWindowBalance = options.windowBalance;
  const enableShadowLift = options.shadowLift;
  const wallSensitivity = getWallSensitivityConfig(options.wallColorSensitivity);
  const protectMaterialTone = options.protectMaterialTone;
  const whiteCabinetProtection = options.whiteCabinetProtection;
  const regionSignals = options.regionSignals || {};
  const modelSignals = options.modelSignals || {};
  const wallModelStrength = clamp01(modelSignals.wallMaskStrength || 0.85);
  const materialModelStrength = clamp01(
    modelSignals.materialProtectionStrength || 0.85
  );
  const cabinetModelStrength = clamp01(modelSignals.whiteCabinetStrength || 0.85);

  for (let index = 0; index < pixelData.data.length; index += components) {
    const alpha = components === 4 ? pixelData.data[index + 3] : 255;
    const alphaRatio = alpha / 255;

    if (alphaRatio === 0) {
      out[index] = pixelData.data[index];
      out[index + 1] = pixelData.data[index + 1];
      out[index + 2] = pixelData.data[index + 2];
      if (components === 4) {
        out[index + 3] = alpha;
      }
      continue;
    }

    let r = pixelData.data[index] / 255;
    let g = pixelData.data[index + 1] / 255;
    let b = pixelData.data[index + 2] / 255;
    const originalR = r;
    const originalG = g;
    const originalB = b;
    const pixelIndex = index / components;
    const pixelX = pixelIndex % pixelData.width;
    const pixelY = Math.floor(pixelIndex / pixelData.width);

    const originalLuma = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    const heuristicWindowMask = enableWindowBalance
      ? smoothstep(preset.windowThreshold, 1, originalLuma)
      : 0;
    const aiWindowMask = sampleRegionMask(
      regionSignals.windowMask,
      pixelX,
      pixelY,
      pixelData.width,
      pixelData.height
    );
    const skyMask = sampleRegionMask(
      regionSignals.skyMask,
      pixelX,
      pixelY,
      pixelData.width,
      pixelData.height
    );
    const windowExteriorMask = sampleRegionMask(
      regionSignals.windowExteriorMask,
      pixelX,
      pixelY,
      pixelData.width,
      pixelData.height
    );
    const curtainMask = sampleRegionMask(
      regionSignals.curtainMask,
      pixelX,
      pixelY,
      pixelData.width,
      pixelData.height
    );
    const lightMask = sampleRegionMask(
      regionSignals.lightMask,
      pixelX,
      pixelY,
      pixelData.width,
      pixelData.height
    );
    const windowMask = Math.max(heuristicWindowMask, aiWindowMask, windowExteriorMask * 0.55);
    const shadowMask = enableShadowLift ? Math.pow(1 - originalLuma, 1.8) : 0;
    const midtoneMask = 1 - Math.min(1, Math.abs(originalLuma - 0.5) / 0.5);
    const heuristicWallProtectionMask = options.protectWallColor
      ? getWallProtectionMask(r, g, b, originalLuma)
      : 0;
    const aiWallProtectionMask =
      sampleRegionMask(
        regionSignals.wallMask,
        pixelX,
        pixelY,
        pixelData.width,
        pixelData.height
      ) * wallModelStrength;
    const wallProtectionMask = Math.max(
      heuristicWallProtectionMask,
      aiWallProtectionMask
    );
    const heuristicMaterialProtectionMask = protectMaterialTone
      ? getMaterialProtectionMask(r, g, b, originalLuma)
      : 0;
    const aiMaterialProtectionMask =
      sampleRegionMask(
        regionSignals.materialMask,
        pixelX,
        pixelY,
        pixelData.width,
        pixelData.height
      ) * materialModelStrength;
    const materialProtectionMask = Math.max(
      heuristicMaterialProtectionMask,
      aiMaterialProtectionMask
    );
    const heuristicCabinetProtectionMask = whiteCabinetProtection
      ? getWhiteCabinetMask(r, g, b, originalLuma)
      : 0;
    const aiCabinetProtectionMask =
      sampleRegionMask(
        regionSignals.cabinetMask,
        pixelX,
        pixelY,
        pixelData.width,
        pixelData.height
      ) * cabinetModelStrength;
    const cabinetProtectionMask = Math.max(
      heuristicCabinetProtectionMask,
      aiCabinetProtectionMask
    );

    r = clamp01(
      r +
        preset.exposure +
        shadowMask * preset.shadowLift -
        windowMask * preset.highlightRecovery * 0.22
    );
    g = clamp01(
      g +
        preset.exposure +
        shadowMask * preset.shadowLift -
        windowMask * preset.highlightRecovery * 0.16
    );
    b = clamp01(
      b +
        preset.exposure +
        shadowMask * preset.shadowLift -
        windowMask * preset.highlightRecovery * 0.1
    );

    r = clamp01(r + preset.temperature - preset.tint * 0.5);
    g = clamp01(g + preset.tint * 0.2);
    b = clamp01(b - preset.temperature + preset.tint * 0.5);

    if (skyMask > 0) {
      r = clamp01(r - skyMask * 0.01);
      g = clamp01(g + skyMask * 0.005);
      b = clamp01(b + skyMask * 0.018);
    }

    r = applyContrast(r, preset.contrast);
    g = applyContrast(g, preset.contrast);
    b = applyContrast(b, preset.contrast);

    r = applyMidtoneBoost(r, preset.midtoneBoost * midtoneMask);
    g = applyMidtoneBoost(g, preset.midtoneBoost * midtoneMask);
    b = applyMidtoneBoost(b, preset.midtoneBoost * midtoneMask);

    r = applyShadowGamma(r, preset.shadowGamma);
    g = applyShadowGamma(g, preset.shadowGamma);
    b = applyShadowGamma(b, preset.shadowGamma);

    r = remapBlackPoint(r, preset.blackPoint);
    g = remapBlackPoint(g, preset.blackPoint);
    b = remapBlackPoint(b, preset.blackPoint);

    [r, g, b] = applySaturation(
      r,
      g,
      b,
      preset.saturation +
        wallProtectionMask * wallSensitivity.saturationBoost +
        materialProtectionMask * 0.008,
      preset.vibrance
    );
    [r, g, b] = balanceNeutrals(
      r,
      g,
      b,
      preset.neutralBalance *
        (1 -
          wallProtectionMask * wallSensitivity.neutralReduction -
          materialProtectionMask * 0.22)
    );

    r = softClipHighlights(r, preset.highlightSoftClip + windowMask * 0.06 + cabinetProtectionMask * 0.03 + lightMask * 0.05);
    g = softClipHighlights(g, preset.highlightSoftClip + windowMask * 0.04 + cabinetProtectionMask * 0.025 + lightMask * 0.045);
    b = softClipHighlights(b, preset.highlightSoftClip + windowMask * 0.02 + cabinetProtectionMask * 0.02 + lightMask * 0.03);

    if (windowMask > 0) {
      const neutral = (r + g + b) / 3;
      r = clamp01(r * (1 - windowMask * 0.18) + neutral * windowMask * 0.18);
      g = clamp01(g * (1 - windowMask * 0.1) + neutral * windowMask * 0.1);
      b = clamp01(b * (1 - windowMask * 0.06) + neutral * windowMask * 0.06);
    }

    if (skyMask > 0) {
      const skyRestore = skyMask * 0.16;
      r = clamp01(r * (1 - skyRestore) + originalR * skyRestore);
      g = clamp01(g * (1 - skyRestore * 0.8) + originalG * skyRestore * 0.8);
      b = clamp01(b * (1 - skyRestore * 0.55) + originalB * skyRestore * 0.55);
    }

    if (curtainMask > 0) {
      const curtainRestore = curtainMask * 0.14;
      r = clamp01(r * (1 - curtainRestore) + originalR * curtainRestore);
      g = clamp01(g * (1 - curtainRestore) + originalG * curtainRestore);
      b = clamp01(b * (1 - curtainRestore) + originalB * curtainRestore);
    }

    if (wallProtectionMask > 0) {
      const restoreAmount = wallProtectionMask * wallSensitivity.restoreAmount;
      r = clamp01(r * (1 - restoreAmount) + originalR * restoreAmount);
      g = clamp01(g * (1 - restoreAmount) + originalG * restoreAmount);
      b = clamp01(b * (1 - restoreAmount) + originalB * restoreAmount);
    }

    if (materialProtectionMask > 0) {
      const restoreAmount = materialProtectionMask * 0.12;
      r = clamp01(r * (1 - restoreAmount) + originalR * restoreAmount);
      g = clamp01(g * (1 - restoreAmount) + originalG * restoreAmount);
      b = clamp01(b * (1 - restoreAmount) + originalB * restoreAmount);
    }

    if (cabinetProtectionMask > 0) {
      const cleanWhite = (originalR + originalG + originalB) / 3;
      r = clamp01(r * (1 - cabinetProtectionMask * 0.12) + cleanWhite * cabinetProtectionMask * 0.12);
      g = clamp01(g * (1 - cabinetProtectionMask * 0.08) + cleanWhite * cabinetProtectionMask * 0.08);
      b = clamp01(b * (1 - cabinetProtectionMask * 0.04) + cleanWhite * cabinetProtectionMask * 0.04);
    }

    if (preset.microContrast > 0) {
      const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      const detailBoost = (luma - 0.5) * preset.microContrast * 0.35;
      r = clamp01(r + (r - luma) * preset.microContrast + detailBoost);
      g = clamp01(g + (g - luma) * preset.microContrast + detailBoost);
      b = clamp01(b + (b - luma) * preset.microContrast + detailBoost);
    }

    out[index] = Math.round(r * 255);
    out[index + 1] = Math.round(g * 255);
    out[index + 2] = Math.round(b * 255);
    if (components === 4) {
      out[index + 3] = alpha;
    }
  }

  return out;
}

async function ensureRgbDocument() {
  const doc = app.activeDocument;
  if (!doc) {
    throw new Error("Khong co document nao dang mo.");
  }

  if (!String(doc.mode).includes("RGB")) {
    throw new Error("Plugin nay hien chi ho tro document RGB.");
  }

  return doc;
}

async function analyzeActiveDocument() {
  if (busy) {
    return;
  }

  try {
    setBusyState(true);
    setStatus("Dang phan tich anh dang mo...");
    const doc = await ensureRgbDocument();
    const docWidth = readDimension(doc.width);
    const docHeight = readDimension(doc.height);
    const plan = getPerformancePlan(
      docWidth,
      docHeight,
      $("#performanceMode").value
    );

    const analysisWidth = Math.min(
      768,
      plan.targetSize ? plan.targetSize.width : docWidth
    );
    const analysisHeight = Math.max(
      1,
      Math.round((analysisWidth / docWidth) * docHeight)
    );

    const samplePixels = await getCompositePixels(doc, {
      targetSize: {
        width: analysisWidth,
        height: analysisHeight
      }
    });

    const metrics = analyzePixels(samplePixels);
    updateMetrics(metrics);
    const recommendedKey = Object.keys(PRESETS).find(
      (key) => PRESETS[key].label === metrics.recommendedPreset
    );
    if (recommendedKey) {
      $("#preset").value = recommendedKey;
    }
    setStatus(
      `Phan tich xong. Anh duoc nhan dien la ${translateExposureClass(metrics.exposureClass).toLowerCase()}. Loai canh: ${translateSceneClass(metrics.sceneClass)}. Goi y bo xu ly: ${metrics.recommendedPreset}. Hieu nang: ${translatePerformanceLabel(plan.label)}.`
    );
  } catch (error) {
    setStatus(error.message || String(error), true);
  } finally {
    setBusyState(false);
  }
}

async function applyPresetToDocument() {
  if (busy) {
    return;
  }

  try {
    setBusyState(true);
    setStatus("Dang doc pixel tu document...");

    const doc = await ensureRgbDocument();
    const context = await buildProcessingContext(doc, {
      presetKey: getSelectedPresetKey(),
      performanceMode: $("#performanceMode").value,
      autoExposureEnabled: $("#autoExposureMode").checked,
      sceneAwareEnabled: $("#sceneAwareMode").checked,
      autoPresetMode: false,
      hdrStrength: getHdrStrengthValue()
    });
    updateMetrics(context.metrics);

    setStatus(
      context.performancePlan.useProxy
        ? `Dang xu ly anh o che do ${context.performancePlan.label} (${context.pixelData.width}x${context.pixelData.height})...`
        : "Dang xu ly anh o do phan giai day du..."
    );

    setStatus("Dang tao layer ket qua...");
    await renderEnhancedLayer(context, {
      windowBalance: $("#windowBalance").checked,
      shadowLift: $("#shadowLift").checked,
      protectWallColor: $("#protectWallColorMode").checked,
      wallColorSensitivity: $("#wallColorSensitivity").value,
      protectMaterialTone: $("#protectMaterialToneMode").checked,
      whiteCabinetProtection: $("#whiteCabinetProtectionMode").checked,
      layerName: ($("#layerName").value || "AI Bat Dong San Tang Cuong").trim(),
      isBatch: false
    });

    setStatus(
      context.performancePlan.useProxy
        ? `Da tao lop moi: ${formatSummaryLabel(context)} bang che do ${translatePerformanceLabel(context.performancePlan.label)}.`
        : `Da tao lop moi: ${formatSummaryLabel(context)}. Lop goc van duoc giu nguyen.`
    );
  } catch (error) {
    setStatus(error.message || String(error), true);
  } finally {
    setBusyState(false);
  }
}

async function autoEnhanceDocument() {
  if (busy) {
    return;
  }

  try {
    setBusyState(true);
    setStatus("Dang tu dong phan tich va chon pipeline toi uu...");

    const doc = await ensureRgbDocument();
    const context = await buildProcessingContext(doc, {
      presetKey: "luxury",
      performanceMode: "auto",
      autoExposureEnabled: true,
      sceneAwareEnabled: true,
      autoPresetMode: true,
      hdrStrength: getHdrStrengthValue()
    });

    updateMetrics(context.metrics);

    setStatus(
      `Dang tu dong tang cuong voi ${formatSummaryLabel(context)}...`
    );

    await renderEnhancedLayer(context, {
      windowBalance: true,
      shadowLift: true,
      protectWallColor: true,
      wallColorSensitivity: "medium",
      protectMaterialTone: true,
      whiteCabinetProtection: true,
      layerName: `AI Tu Dong Tang Cuong | ${context.basePreset.label} | ${translateSceneClass(context.metrics.sceneClass)}`,
      isBatch: false
    });

    setStatus(
      `Tu dong tang cuong xong: ${formatSummaryLabel(context)} | ${translateAdaptiveLabel(context.adaptivePreset.adaptiveLabel)}.`
    );
  } catch (error) {
    setStatus(error.message || String(error), true);
  } finally {
    setBusyState(false);
  }
}

async function wallCompareDocument() {
  if (busy) {
    return;
  }

  try {
    setBusyState(true);
    setStatus("Dang tao cap lop so sanh mau tuong...");
    const doc = await ensureRgbDocument();
    const context = await buildProcessingContext(doc, {
      presetKey: getSelectedPresetKey(),
      performanceMode: $("#performanceMode").value,
      autoExposureEnabled: $("#autoExposureMode").checked,
      sceneAwareEnabled: $("#sceneAwareMode").checked,
      autoPresetMode: false,
      hdrStrength: getHdrStrengthValue()
    });
    updateMetrics(context.metrics);
    await renderWallCompare(context);
    setStatus(`Da tao 2 lop so sanh mau tuong cho ${translateSceneClass(context.metrics.sceneClass)}.`);
  } catch (error) {
    setStatus(error.message || String(error), true);
  } finally {
    setBusyState(false);
  }
}

async function handleExportJpg() {
  if (busy) {
    return;
  }

  try {
    setBusyState(true);
    setStatus("Dang mo hop thoai luu JPG...");
    const file = await exportCurrentDocumentAsJpg();
    setStatus(`Da export JPG: ${file.name}`);
  } catch (error) {
    setStatus(error.message || String(error), true);
  } finally {
    setBusyState(false);
  }
}

async function handleExportTiff() {
  if (busy) {
    return;
  }

  if (!supportsSilentTiffExport()) {
    setStatus(`Xuat TIFF tu dong chua on dinh tren Photoshop ${getPhotoshopVersion() || "hien tai"}. Hay dung JPG hoac Save As thu cong.`, true);
    return;
  }

  try {
    setBusyState(true);
    setStatus("Dang xuat TIFF...");
    const file = await exportCurrentDocumentAsTiff();
    setStatus(`Da export TIFF: ${file.name}`);
  } catch (error) {
    setStatus(error.message || String(error), true);
  } finally {
    setBusyState(false);
  }
}

async function pickInputFolder() {
  const folder = await localFileSystem.getFolder();
  if (folder) {
    batchInputFolder = folder;
    batchOutputFolder = folder;
    setFolderLabel("#inputFolderLabel", folder);
    setFolderLabel("#outputFolderLabel", folder);
    updateBatchHint();
    setStatus(`Da chon thu muc dau vao. Thu muc dau ra se dung chung: ${folder.nativePath || folder.name}`);
  }
}

async function runBatchOneClick() {
  if (busy) {
    return;
  }

  setStatus("Dang kiem tra thiet lap chay hang loat...");
  updateBatchHint();

  if (!batchInputFolder) {
    setStatus("Can chon thu muc dau vao truoc khi chay hang loat.", true);
    return;
  }

  batchOutputFolder = batchInputFolder;

  const requestedQuality = Number($("#jpgQuality").value);
  const jpgQuality = Number.isFinite(requestedQuality)
    ? Math.max(1, Math.min(12, Math.round(requestedQuality)))
    : 10;
  const tiffCompression = $("#tiffCompression").value || "LZW";
  const exportFormat = $("#singleExportFormat").value || "jpg";
  saveSetting(SETTINGS_KEYS.exportFormat, exportFormat);
  if (exportFormat === "tif" && !supportsSilentTiffExport()) {
    setStatus(`Batch TIFF tu dong chua on dinh tren Photoshop ${getPhotoshopVersion() || "hien tai"}. Vui long chon JPG de tranh bi ket.`, true);
    return;
  }
  const hdrStrength = getHdrStrengthValue();
  const batchHdrMode = getBatchHdrMode();
  const skipExisting = $("#skipExistingBatch").checked;
  const fileNameTemplate =
    ($("#batchFileNameTemplate") && $("#batchFileNameTemplate").value) ||
    DEFAULT_BATCH_FILE_TEMPLATE;
  let totalFiles = 0;
  let successCount = 0;
  let failureCount = 0;
  let skippedCount = 0;
  const batchErrors = [];
  setProgress(0, 1);

  try {
    setBusyState(true);
    setStatus("Dang doc danh sach file trong thu muc...");

    const entries = await batchInputFolder.getEntries();
    const units = getBatchProcessingUnits(entries, batchHdrMode);
    totalFiles = units.length;

    if (!units.length) {
      throw new Error("Khong tim thay file anh hop le trong input folder.");
    }

    for (let index = 0; index < units.length; index += 1) {
      const unit = units[index];
      const entry = unit.primaryEntry;
      const startedAt = Date.now();
      let openedDoc = null;
      const openedDocs = [];

      try {
        setStatus(`Dang xu ly ${index + 1}/${units.length}: ${unit.label}`);
        setProgress(index, units.length, unit.label);
        await core.executeAsModal(async () => {
          openedDoc = await app.open(entry);
          openedDocs.push(openedDoc);
          if (unit.kind === "bracket") {
            for (const bracketEntry of unit.bracketEntries) {
              if (!bracketEntry || bracketEntry.name === entry.name) {
                continue;
              }
              const bracketDoc = await app.open(bracketEntry);
              openedDocs.push(bracketDoc);
            }
          }
        }, { commandName: `Mo file batch ${entry.name}` });

        const context = await buildProcessingContext(openedDoc, {
          presetKey: getSelectedPresetKey(),
          performanceMode: $("#performanceMode").value,
          autoExposureEnabled: $("#autoExposureMode").checked,
          sceneAwareEnabled: $("#sceneAwareMode").checked,
          autoPresetMode: $("#autoPresetMode").checked,
          hdrStrength,
          bracketDocs: openedDocs.filter((doc) => doc && doc.id !== openedDoc.id)
        });

        await renderEnhancedLayer(context, {
          windowBalance: $("#windowBalance").checked,
          shadowLift: $("#shadowLift").checked,
          protectWallColor: $("#protectWallColorMode").checked,
          wallColorSensitivity: $("#wallColorSensitivity").value,
          protectMaterialTone: $("#protectMaterialToneMode").checked,
          whiteCabinetProtection: $("#whiteCabinetProtectionMode").checked,
          layerName: buildLayerName(context.basePreset, context.adaptivePreset, context.metrics, true),
          isBatch: true
        });

        const outputExt = exportFormat === "tif" ? "tif" : "jpg";
        const exportName = formatBatchFileName(fileNameTemplate, context, outputExt, unit.sourceName);
        if (skipExisting && await outputFileExists(batchOutputFolder, exportName)) {
          skippedCount += 1;
          setStatus(`Bo qua file da ton tai (${index + 1}/${units.length}): ${exportName}`);
          setProgress(index + 1, units.length, "Bo qua");
          continue;
        }
        const outFile = await createOutputFile(batchOutputFolder, exportName);

        await core.executeAsModal(async () => {
          await exportDocumentToEntry(openedDoc, exportFormat, {
            file: outFile,
            quality: jpgQuality,
            compression: tiffCompression
          });
        }, { commandName: `Batch Export ${entry.name}` });

        successCount += 1;
        setProgress(index + 1, units.length, unit.kind === "bracket" ? "HDR xong" : "Xong");
      } catch (error) {
        failureCount += 1;
        const errorMessage = error && error.message ? error.message : String(error);
        batchErrors.push(`${entry.name}: ${errorMessage}`);
        setStatus(`Loi file ${entry.name}: ${errorMessage}`, true);
        setProgress(index + 1, units.length, "Loi");
      } finally {
        for (let closeIndex = openedDocs.length - 1; closeIndex >= 0; closeIndex -= 1) {
          const opened = openedDocs[closeIndex];
          if (!opened) {
            continue;
          }
          try {
            await closeDocumentWithoutSaving(opened);
          } catch {}
        }
      }
    }

    const summary = `Batch xong. Thanh cong ${successCount}/${totalFiles}, bo qua ${skippedCount}, that bai ${failureCount}.`;
    if (batchErrors.length) {
      const preview = batchErrors.slice(0, 3).join(" | ");
      setStatus(`${summary} Chi tiet loi: ${preview}`, true);
    } else {
      setStatus(summary);
    }
    setProgress(totalFiles, totalFiles, "Hoan tat");
  } catch (error) {
    setStatus(error.message || String(error), true);
  } finally {
    setBusyState(false);
    updateBatchHint();
  }
}

function readSettingControlValue(node, valueSource = "value") {
  if (valueSource === "checked") {
    return String(Boolean(node.checked));
  }
  return String(node.value);
}

function bindClickHandlers(bindings) {
  bindings.forEach(({ selector, actionKey, handler }) => {
    const node = $(selector);
    if (!node) {
      return;
    }

    node.addEventListener("click", () => {
      if (actionKey) {
        setSelectedAction(actionKey);
      }
      handler();
    });
  });
}

/**
 * Bind persisted controls from a single descriptor list so new settings only
 * need one definition for lookup, serialization, and side effects.
 */
function bindSettingControls(bindings) {
  bindings.forEach(({ selector, settingKey, valueSource, eventName, onChange }) => {
    const node = $(selector);
    if (!node) {
      return;
    }

    node.addEventListener(eventName || "change", () => {
      queueSettingSave(settingKey, readSettingControlValue(node, valueSource));
      if (typeof onChange === "function") {
        onChange(node);
      }
    });
  });
}

function bindEvents() {
  bindClickHandlers([
    {
      selector: "#analyzeBtn",
      actionKey: "analyze",
      handler: analyzeActiveDocument
    },
    {
      selector: "#applyBtn",
      actionKey: "apply",
      handler: applyPresetToDocument
    },
    {
      selector: "#autoEnhanceBtn",
      actionKey: "auto-enhance",
      handler: autoEnhanceDocument
    },
    {
      selector: "#wallCompareBtn",
      actionKey: "wall-compare",
      handler: wallCompareDocument
    },
    {
      selector: "#exportCurrentBtn",
      handler: handleExportCurrent
    },
    {
      selector: "#pickInputFolderBtn",
      handler: pickInputFolder
    },
    {
      selector: "#runBatchBtn",
      handler: runBatchOneClick
    }
  ]);

  bindSettingControls([
    {
      selector: "#singleExportFormat",
      settingKey: SETTINGS_KEYS.exportFormat,
      onChange: updateSingleExportOptions
    },
    {
      selector: "#preset",
      settingKey: SETTINGS_KEYS.preset
    },
    {
      selector: "#performanceMode",
      settingKey: SETTINGS_KEYS.performanceMode
    },
    {
      selector: "#hdrStrength",
      settingKey: SETTINGS_KEYS.hdrStrength
    },
    {
      selector: "#windowBalance",
      settingKey: SETTINGS_KEYS.windowBalance,
      valueSource: "checked"
    },
    {
      selector: "#shadowLift",
      settingKey: SETTINGS_KEYS.shadowLift,
      valueSource: "checked"
    },
    {
      selector: "#autoExposureMode",
      settingKey: SETTINGS_KEYS.autoExposureMode,
      valueSource: "checked"
    },
    {
      selector: "#sceneAwareMode",
      settingKey: SETTINGS_KEYS.sceneAwareMode,
      valueSource: "checked"
    },
    {
      selector: "#protectWallColorMode",
      settingKey: SETTINGS_KEYS.protectWallColorMode,
      valueSource: "checked"
    },
    {
      selector: "#protectMaterialToneMode",
      settingKey: SETTINGS_KEYS.protectMaterialToneMode,
      valueSource: "checked"
    },
    {
      selector: "#whiteCabinetProtectionMode",
      settingKey: SETTINGS_KEYS.whiteCabinetProtectionMode,
      valueSource: "checked"
    },
    {
      selector: "#wallColorSensitivity",
      settingKey: SETTINGS_KEYS.wallColorSensitivity
    },
    {
      selector: "#jpgQuality",
      settingKey: SETTINGS_KEYS.jpgQuality
    },
    {
      selector: "#tiffCompression",
      settingKey: SETTINGS_KEYS.tiffCompression
    },
    {
      selector: "#batchHdrMode",
      settingKey: SETTINGS_KEYS.batchHdrMode,
      onChange: updateBatchHint
    },
    {
      selector: "#batchFileNameTemplate",
      settingKey: SETTINGS_KEYS.batchFileNameTemplate,
      eventName: "input"
    },
    {
      selector: "#autoPresetMode",
      settingKey: SETTINGS_KEYS.autoPresetMode,
      valueSource: "checked"
    },
    {
      selector: "#skipExistingBatch",
      settingKey: SETTINGS_KEYS.skipExistingBatch,
      valueSource: "checked"
    }
  ]);
}

function bindFormToggles() {
  const toggles = root.querySelectorAll("[data-form-toggle]");
  toggles.forEach((toggle) => {
    toggle.addEventListener("click", () => {
      const key = toggle.getAttribute("data-form-toggle");
      const body = root.querySelector(`[data-form-body="${key}"]`);
      const icon = toggle.querySelector(".form-toggle-icon");
      if (!body || !icon) {
        return;
      }
      const willOpen = body.hidden;
      body.hidden = !willOpen;
      toggle.setAttribute("aria-expanded", willOpen ? "true" : "false");
      icon.textContent = willOpen ? "-" : "+";

      const settingKey = FORM_TOGGLE_SETTING_KEYS[key];
      if (settingKey) {
        queueSettingSave(settingKey, String(willOpen));
      }
    });
  });
}

function createPanel(node) {
  node.innerHTML = PANEL_TEMPLATE;
  root = node;
  bindEvents();
  bindFormToggles();
  updateSingleExportOptions();
  setProgress(0, 1);
  refreshAiStatus();
  restoreBatchSettings().finally(() => {
    setStatus("San sang. Hay phan tich hoac ap dung bo xu ly tren tai lieu dang mo.");
  });
}

entrypoints.setup({
  panels: {
    realEstatePanel: {
      create(rootNode) {
        createPanel(rootNode);
      },
      show(rootNode) {
        if (!root) {
          createPanel(rootNode);
        }
      }
    }
  }
});
