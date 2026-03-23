"use strict";

const {
  argmax,
  clamp,
  softmax,
  toNchwTensorData
} = require("./inference-utils");
const { decodeSegmentationTensor } = require("./mask-utils");

function createEmptyRegionSignals(metadata = {}) {
  return {
    windowMask: null,
    skyMask: null,
    windowExteriorMask: null,
    curtainMask: null,
    lightMask: null,
    wallMask: null,
    materialMask: null,
    cabinetMask: null,
    metadata
  };
}

function buildInputTensor(TensorCtor, modelConfig, pixelData, normalization) {
  const tensorData = toNchwTensorData(
    pixelData,
    modelConfig.width,
    modelConfig.height,
    normalization
  );

  return new TensorCtor("float32", tensorData, [
    1,
    3,
    modelConfig.height,
    modelConfig.width
  ]);
}

function getOutputTensor(outputMap, preferredName) {
  const outputName = preferredName || Object.keys(outputMap)[0];
  return outputMap[outputName];
}

function createOnnxRuntimeProvider(options = {}) {
  const config = {
    sceneLabels: options.sceneLabels || [
      "Living Room",
      "Bedroom",
      "Kitchen",
      "Bathroom",
      "Facade",
      "Exterior Wide"
    ],
    exposureLabels: options.exposureLabels || ["Dark", "Balanced", "Bright"],
    presetLabels: options.presetLabels || ["luxury", "warm", "airbnb"],
    colorMatchLabels: options.colorMatchLabels || [
      "neutral-clean",
      "warm-luxury",
      "airy-bright",
      "editorial-cool"
    ],
    models: {
      sceneClassifier: {
        path: options.sceneModelPath || "./models/mobilenetv3_scene.onnx",
        inputName: "input",
        outputName: "logits",
        width: 224,
        height: 224
      },
      exposureClassifier: {
        path: options.exposureModelPath || "./models/mobilenetv3_exposure.onnx",
        inputName: "input",
        outputName: "logits",
        width: 160,
        height: 160
      },
      colorMatchPolicy: {
        path: options.colorMatchModelPath || null,
        inputName: "input",
        outputName: "profile_logits",
        strengthOutputName: "strength",
        width: 224,
        height: 224,
        optional: true
      },
      regionSegmenter: {
        path: options.segmenterModelPath || "./models/fastscnn_regions.onnx",
        inputName: "input",
        outputName: "masks",
        width: 512,
        height: 512,
        decodeMode: options.segmenterDecodeMode || "multiclass-softmax",
        classMap: options.segmenterClassMap || {
          window: 1,
          wall: 2,
          material: 3,
          cabinet: 4
        }
      }
    },
    normalization: options.normalization || {
      mean: [0.485, 0.456, 0.406],
      std: [0.229, 0.224, 0.225]
    },
    executionProviders: options.executionProviders || ["wasm"]
  };

  let ort = null;
  let TensorCtor = null;
  let status = {
    ready: false,
    provider: "onnx-runtime-provider",
    backend: null,
    error: null,
    optionalColorMatchError: null,
    colorMatchReady: false
  };
  const sessions = {
    sceneClassifier: null,
    exposureClassifier: null,
    colorMatchPolicy: null,
    regionSegmenter: null
  };

  async function loadOrtModule() {
    if (ort && TensorCtor) {
      return;
    }

    try {
      ort = require("onnxruntime-web");
      TensorCtor = ort.Tensor;
      status.backend = "onnxruntime-web";
      return;
    } catch (webError) {
      try {
        ort = require("onnxruntime-node");
        TensorCtor = ort.Tensor;
        status.backend = "onnxruntime-node";
      } catch (nodeError) {
        throw new Error(
          `Unable to load ONNX Runtime package. Tried onnxruntime-web and onnxruntime-node. ${String(
            (nodeError && nodeError.message) || webError.message || webError
          )}`
        );
      }
    }
  }

  async function createSession(modelConfig) {
    return ort.InferenceSession.create(modelConfig.path, {
      executionProviders: config.executionProviders
    });
  }

  async function init(runtimeConfig) {
    try {
      await loadOrtModule();

      sessions.sceneClassifier = await createSession(config.models.sceneClassifier);
      sessions.exposureClassifier = await createSession(config.models.exposureClassifier);
      sessions.regionSegmenter = await createSession(config.models.regionSegmenter);
      sessions.colorMatchPolicy = null;
      status.optionalColorMatchError = null;
      status.colorMatchReady = false;

      if (config.models.colorMatchPolicy.path) {
        try {
          sessions.colorMatchPolicy = await createSession(config.models.colorMatchPolicy);
          status.colorMatchReady = true;
        } catch (optionalModelError) {
          status.optionalColorMatchError = String(
            optionalModelError.message || optionalModelError
          );
        }
      }

      status = {
        ...status,
        ready: true,
        error: null,
        manifest: runtimeConfig.manifest
      };
    } catch (error) {
      status = {
        ...status,
        ready: false,
        error: String(error.message || error)
      };
    }

    return {
      ready: status.ready,
      provider: "onnx-runtime-provider",
      backend: status.backend,
      error: status.error,
      optionalColorMatchError: status.optionalColorMatchError,
      colorMatchReady: status.colorMatchReady,
      manifest: runtimeConfig.manifest
    };
  }

  async function runClassifier(session, modelConfig, pixelData, labels) {
    if (!session || !TensorCtor) {
      return {
        label: null,
        confidence: null
      };
    }

    const inputTensor = buildInputTensor(
      TensorCtor,
      modelConfig,
      pixelData,
      config.normalization
    );
    const outputMap = await session.run({
      [modelConfig.inputName]: inputTensor
    });
    const outputTensor = getOutputTensor(outputMap, modelConfig.outputName);
    const logits = Array.from((outputTensor && outputTensor.data) || []);
    const probabilities = softmax(logits);
    const best = argmax(probabilities);

    return {
      label: labels[best.index] || null,
      confidence: best.score || null
    };
  }

  async function runColorMatchPolicy(pixelData) {
    if (!sessions.colorMatchPolicy || !TensorCtor) {
      return {
        label: null,
        confidence: null,
        strength: null
      };
    }

    const modelConfig = config.models.colorMatchPolicy;
    const inputTensor = buildInputTensor(
      TensorCtor,
      modelConfig,
      pixelData,
      config.normalization
    );
    const outputMap = await sessions.colorMatchPolicy.run({
      [modelConfig.inputName]: inputTensor
    });
    const profileTensor = getOutputTensor(outputMap, modelConfig.outputName);
    const strengthTensor = modelConfig.strengthOutputName
      ? getOutputTensor(outputMap, modelConfig.strengthOutputName)
      : null;
    const logits = Array.from((profileTensor && profileTensor.data) || []);
    const probabilities = softmax(logits);
    const best = argmax(probabilities);
    let strength = null;

    if (strengthTensor && strengthTensor.data && strengthTensor.data.length) {
      strength = clamp(Number(strengthTensor.data[0]), 0, 1);
    }

    return {
      label: config.colorMatchLabels[best.index] || null,
      confidence: best.score || null,
      strength
    };
  }

  function buildPresetLogits(sceneResult, exposureResult) {
    const scores = {
      luxury: 0,
      warm: 0,
      airbnb: 0
    };

    if (sceneResult.label === "Bathroom" || sceneResult.label === "Kitchen") {
      scores.luxury += 0.55;
      scores.warm += 0.2;
    } else if (
      sceneResult.label === "Exterior Wide" ||
      sceneResult.label === "Facade"
    ) {
      scores.airbnb += 0.65;
      scores.luxury += 0.12;
    } else if (sceneResult.label === "Bedroom") {
      scores.warm += 0.6;
      scores.luxury += 0.15;
    } else {
      scores.luxury += 0.5;
      scores.airbnb += 0.15;
    }

    if (exposureResult.label === "Dark") {
      scores.warm += 0.35;
      scores.airbnb += 0.2;
    } else if (exposureResult.label === "Bright") {
      scores.luxury += 0.25;
      scores.airbnb += 0.1;
    } else {
      scores.luxury += 0.18;
      scores.warm += 0.08;
    }

    let bestPreset = null;
    let bestScore = -Infinity;
    Object.keys(scores).forEach((key) => {
      if (scores[key] > bestScore) {
        bestPreset = key;
        bestScore = scores[key];
      }
    });

    return {
      preset: bestPreset,
      scores
    };
  }

  function buildPresetOverride(sceneLabel, exposureLabel) {
    if (sceneLabel === "Bathroom" || sceneLabel === "Kitchen") {
      return "luxury";
    }

    if (sceneLabel === "Exterior Wide" || sceneLabel === "Facade") {
      return "airbnb";
    }

    if (exposureLabel === "Dark") {
      return "warm";
    }

    return null;
  }

  function buildColorMatchProfile(sceneLabel, exposureLabel, modelResult) {
    if (modelResult && modelResult.label) {
      return modelResult.label;
    }

    if (sceneLabel === "Kitchen" || sceneLabel === "Bathroom") {
      return "neutral-clean";
    }
    if (sceneLabel === "Bedroom") {
      return "warm-luxury";
    }
    if (sceneLabel === "Exterior Wide" || sceneLabel === "Facade") {
      return "airy-bright";
    }
    if (exposureLabel === "Bright") {
      return "editorial-cool";
    }
    return "warm-luxury";
  }

  async function analyzeDocument(context) {
    const sceneResult = await runClassifier(
      sessions.sceneClassifier,
      config.models.sceneClassifier,
      context.pixelData,
      config.sceneLabels
    );
    const exposureResult = await runClassifier(
      sessions.exposureClassifier,
      config.models.exposureClassifier,
      context.pixelData,
      config.exposureLabels
    );
    const confidence = Math.max(
      sceneResult.confidence || 0,
      exposureResult.confidence || 0
    );
    const colorResult = sessions.colorMatchPolicy
      ? await runColorMatchPolicy(context.pixelData)
      : { label: null, confidence: null, strength: null };
    const presetDecision = buildPresetLogits(sceneResult, exposureResult);
    const colorMatchProfile = buildColorMatchProfile(
      sceneResult.label,
      exposureResult.label,
      colorResult
    );

    return {
      sceneOverride: sceneResult.label,
      exposureOverride: exposureResult.label,
      presetOverride:
        buildPresetOverride(sceneResult.label, exposureResult.label) ||
        presetDecision.preset,
      colorMatchProfile,
      colorMatchStrength:
        colorResult.strength !== null
          ? colorResult.strength
          : clamp(
            0.55 + Math.max(colorResult.confidence || 0, confidence) * 0.35,
            0,
            1
          ),
      wallMaskStrength:
        sceneResult.label === "Living Room" || sceneResult.label === "Bedroom"
          ? clamp(0.75 + confidence * 0.2, 0, 1)
          : null,
      materialProtectionStrength:
        sceneResult.label === "Kitchen" || sceneResult.label === "Bathroom"
          ? clamp(0.7 + confidence * 0.2, 0, 1)
          : null,
      whiteCabinetStrength:
        sceneResult.label === "Kitchen" || sceneResult.label === "Bathroom"
          ? clamp(0.78 + confidence * 0.15, 0, 1)
          : null,
      confidence,
      metadata: {
        source: "onnx-runtime",
        backend: status.backend,
        sceneConfidence: sceneResult.confidence,
        exposureConfidence: exposureResult.confidence,
        colorMatchConfidence: colorResult.confidence,
        colorMatchProfile,
        presetScores: presetDecision.scores
      }
    };
  }

  async function buildRegionSignals(context) {
    if (!sessions.regionSegmenter || !TensorCtor) {
      return createEmptyRegionSignals({
        source: "onnx-runtime",
        note: "Region segmenter session is not ready."
      });
    }

    const modelConfig = config.models.regionSegmenter;
    const inputTensor = buildInputTensor(
      TensorCtor,
      modelConfig,
      context.pixelData,
      config.normalization
    );

    try {
      const outputMap = await sessions.regionSegmenter.run({
        [modelConfig.inputName]: inputTensor
      });
      const outputTensor = getOutputTensor(outputMap, modelConfig.outputName);
      const maskSet = decodeSegmentationTensor(outputTensor, modelConfig);

      return {
        windowMask: maskSet.windowMask,
        skyMask: null,
        windowExteriorMask: null,
        curtainMask: null,
        lightMask: null,
        wallMask: maskSet.wallMask,
        materialMask: maskSet.materialMask,
        cabinetMask: maskSet.cabinetMask,
        metadata: {
          source: "onnx-runtime",
          backend: status.backend,
          outputShape: outputTensor.dims || null,
          decodeMode: modelConfig.decodeMode || "multiclass-softmax",
          classMap: modelConfig.classMap || null
        }
      };
    } catch (error) {
      return createEmptyRegionSignals({
        source: "onnx-runtime",
        backend: status.backend,
        runtimeError: String(error.message || error)
      });
    }
  }

  return {
    name: "onnx-runtime-provider",
    init,
    analyzeDocument,
    buildRegionSignals
  };
}

module.exports = {
  createOnnxRuntimeProvider
};
