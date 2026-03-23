"use strict";

const { clamp, softmax } = require("./inference-utils");

/**
 * Mask utilities shared by the ONNX provider and pipeline/UI sampling paths.
 * Keeping these helpers here avoids duplicating mask construction and lookup
 * logic across the runtime, the panel, and the image-processing pipeline.
 */
function createEmptyMask(width, height) {
  return {
    width,
    height,
    data: new Float32Array(width * height)
  };
}

function createMaskSet(width, height) {
  return {
    windowMask: createEmptyMask(width, height),
    wallMask: createEmptyMask(width, height),
    materialMask: createEmptyMask(width, height),
    cabinetMask: createEmptyMask(width, height)
  };
}

function assignMaskValue(maskSet, labelName, index, value) {
  if (labelName === "window") {
    maskSet.windowMask.data[index] = value;
  } else if (labelName === "wall") {
    maskSet.wallMask.data[index] = value;
  } else if (labelName === "material") {
    maskSet.materialMask.data[index] = value;
  } else if (labelName === "cabinet") {
    maskSet.cabinetMask.data[index] = value;
  }
}

/**
 * Sample a mask with nearest-neighbor coordinates mapped from a target surface.
 */
function sampleMaskNearest(mask, x, y, targetWidth, targetHeight) {
  if (
    !mask ||
    !mask.data ||
    !mask.width ||
    !mask.height ||
    !targetWidth ||
    !targetHeight
  ) {
    return 0;
  }

  const sampleX = Math.max(
    0,
    Math.min(mask.width - 1, Math.floor((x / targetWidth) * mask.width))
  );
  const sampleY = Math.max(
    0,
    Math.min(mask.height - 1, Math.floor((y / targetHeight) * mask.height))
  );
  const sampleIndex = sampleY * mask.width + sampleX;
  return clamp(mask.data[sampleIndex] || 0, 0, 1);
}

function sampleRegionMask(mask, x, y, targetWidth, targetHeight) {
  return sampleMaskNearest(mask, x, y, targetWidth, targetHeight);
}

function sigmoid(value) {
  if (value >= 0) {
    const z = Math.exp(-value);
    return 1 / (1 + z);
  }

  const z = Math.exp(value);
  return z / (1 + z);
}

function decodeChannelFirstSegmentation(outputTensor, classMap) {
  const dims = outputTensor.dims || [];
  const values = outputTensor.data || [];

  if (dims.length < 4) {
    throw new Error(
      `Unsupported channel-first segmentation tensor dims: ${dims.join("x")}`
    );
  }

  const channels = dims[dims.length - 3];
  const height = dims[dims.length - 2];
  const width = dims[dims.length - 1];
  const pixelCount = width * height;
  const maskSet = createMaskSet(width, height);

  if (channels <= 1) {
    throw new Error("Segmentation tensor does not contain enough class channels.");
  }

  for (let pixelIndex = 0; pixelIndex < pixelCount; pixelIndex += 1) {
    const channelScores = new Array(channels);
    for (let channelIndex = 0; channelIndex < channels; channelIndex += 1) {
      channelScores[channelIndex] = values[channelIndex * pixelCount + pixelIndex];
    }

    const probabilities = softmax(channelScores);
    Object.keys(classMap).forEach((labelName) => {
      const classIndex = classMap[labelName];
      if (classIndex >= 0 && classIndex < probabilities.length) {
        assignMaskValue(maskSet, labelName, pixelIndex, probabilities[classIndex]);
      }
    });
  }

  return maskSet;
}

function decodeLabelMapSegmentation(outputTensor, classMap) {
  const dims = outputTensor.dims || [];
  const values = outputTensor.data || [];
  let width = 0;
  let height = 0;

  if (dims.length === 3) {
    height = dims[1];
    width = dims[2];
  } else if (dims.length === 2) {
    height = dims[0];
    width = dims[1];
  } else {
    throw new Error(`Unsupported label-map tensor dims: ${dims.join("x")}`);
  }

  const pixelCount = width * height;
  const maskSet = createMaskSet(width, height);

  for (let pixelIndex = 0; pixelIndex < pixelCount; pixelIndex += 1) {
    const classIndex = values[pixelIndex];
    Object.keys(classMap).forEach((labelName) => {
      assignMaskValue(
        maskSet,
        labelName,
        pixelIndex,
        classIndex === classMap[labelName] ? 1 : 0
      );
    });
  }

  return maskSet;
}

function decodeBinaryChannelMasks(outputTensor, classMap) {
  const dims = outputTensor.dims || [];
  const values = outputTensor.data || [];

  if (dims.length < 4) {
    throw new Error(`Unsupported binary-channel tensor dims: ${dims.join("x")}`);
  }

  const channels = dims[dims.length - 3];
  const height = dims[dims.length - 2];
  const width = dims[dims.length - 1];
  const pixelCount = width * height;
  const maskSet = createMaskSet(width, height);

  Object.keys(classMap).forEach((labelName) => {
    const classIndex = classMap[labelName];
    if (classIndex < 0 || classIndex >= channels) {
      return;
    }

    for (let pixelIndex = 0; pixelIndex < pixelCount; pixelIndex += 1) {
      const rawValue = values[classIndex * pixelCount + pixelIndex];
      assignMaskValue(maskSet, labelName, pixelIndex, clamp(sigmoid(rawValue), 0, 1));
    }
  });

  return maskSet;
}

/**
 * Decode the segmenter output into the runtime mask shape used by the pipeline.
 */
function decodeSegmentationTensor(outputTensor, segmenterConfig = {}) {
  const mode = segmenterConfig.decodeMode || "multiclass-softmax";
  const classMap = segmenterConfig.classMap || {
    window: 1,
    wall: 2,
    material: 3,
    cabinet: 4
  };

  if (mode === "label-map") {
    return decodeLabelMapSegmentation(outputTensor, classMap);
  }

  if (mode === "binary-channels") {
    return decodeBinaryChannelMasks(outputTensor, classMap);
  }

  return decodeChannelFirstSegmentation(outputTensor, classMap);
}

module.exports = {
  assignMaskValue,
  createEmptyMask,
  createMaskSet,
  decodeSegmentationTensor,
  sampleRegionMask,
  sampleMaskNearest
};
