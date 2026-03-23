"use strict";

const assert = require("assert");

const { formatBatchFileName } = require("./batch-filename-utils");
const { createModelRuntime } = require("./ai_runtime");
const {
  argmax,
  softmax,
  toNchwTensorData
} = require("./inference-utils");
const {
  decodeSegmentationTensor,
  sampleMaskNearest
} = require("./mask-utils");

function createPixelData() {
  return {
    width: 2,
    height: 2,
    components: 4,
    data: new Uint8Array([
      255, 0, 0, 255,
      0, 255, 0, 255,
      0, 0, 255, 255,
      255, 255, 255, 255
    ])
  };
}

async function testRuntimeCache() {
  let initCalls = 0;
  let analyzeCalls = 0;
  let regionCalls = 0;

  const runtime = createModelRuntime({
    provider: {
      name: "mock-provider",
      async init() {
        initCalls += 1;
        await Promise.resolve();
        return {
          ready: true,
          provider: "mock-provider"
        };
      },
      async analyzeDocument() {
        analyzeCalls += 1;
        await Promise.resolve();
        return {
          sceneOverride: "Living Room",
          exposureOverride: "Bright",
          presetOverride: "luxury",
          metadata: {
            source: "mock-analyze"
          }
        };
      },
      async buildRegionSignals() {
        regionCalls += 1;
        await Promise.resolve();
        return {
          windowMask: {
            width: 1,
            height: 1,
            data: new Float32Array([1])
          },
          metadata: {
            source: "mock-region"
          }
        };
      }
    }
  });

  const pixelData = createPixelData();
  const context = {
    doc: {
      id: 42
    },
    pixelData,
    metrics: {
      sceneClass: "Living Room",
      exposureClass: "Bright",
      recommendedPreset: "luxury",
      averageLight: 0.72
    }
  };

  const [firstAnalyze, secondAnalyze] = await Promise.all([
    runtime.analyzeDocument(context),
    runtime.analyzeDocument({
      doc: {
        id: 42
      },
      pixelData,
      metrics: {
        sceneClass: "Living Room",
        exposureClass: "Bright",
        recommendedPreset: "luxury",
        averageLight: 0.72
      }
    })
  ]);
  const [firstRegion, secondRegion] = await Promise.all([
    runtime.buildRegionSignals(context),
    runtime.buildRegionSignals(context)
  ]);

  assert.strictEqual(initCalls, 1, "runtime init should dedupe concurrent warmup");
  assert.strictEqual(analyzeCalls, 1, "analyzeDocument should use cached/in-flight result");
  assert.strictEqual(regionCalls, 1, "buildRegionSignals should use cached/in-flight result");
  assert.strictEqual(firstAnalyze.sceneOverride, "Living Room");
  assert.strictEqual(secondAnalyze.metadata.source, "mock-analyze");
  assert.strictEqual(firstRegion.windowMask.width, 1);
  assert.strictEqual(secondRegion.metadata.source, "mock-region");
}

async function main() {
  const distribution = softmax([0, 1, 2]);
  assert.strictEqual(distribution.length, 3);
  assert(distribution[2] > distribution[1] && distribution[1] > distribution[0]);
  assert.deepStrictEqual(argmax(distribution), {
    index: 2,
    score: distribution[2]
  });

  const tensor = toNchwTensorData(
    {
      width: 1,
      height: 1,
      components: 4,
      data: new Uint8Array([255, 128, 0, 255])
    },
    1,
    1,
    {
      mean: [0, 0, 0],
      std: [1, 1, 1]
    }
  );
  assert.strictEqual(tensor.length, 3);
  assert(Math.abs(tensor[0] - 1) < 1e-6);
  assert(Math.abs(tensor[1] - (128 / 255)) < 1e-6);
  assert(Math.abs(tensor[2]) < 1e-6);

  const multiclassMask = decodeSegmentationTensor(
    {
      dims: [1, 5, 1, 1],
      data: new Float32Array([0, 10, -5, -5, -5])
    },
    {
      decodeMode: "multiclass-softmax"
    }
  );
  assert(multiclassMask.windowMask.data[0] > 0.99);

  const labelMask = decodeSegmentationTensor(
    {
      dims: [2, 2],
      data: new Uint8Array([1, 2, 3, 4])
    },
    {
      decodeMode: "label-map"
    }
  );
  assert.strictEqual(labelMask.windowMask.data[0], 1);
  assert.strictEqual(labelMask.wallMask.data[1], 1);

  const binaryMask = decodeSegmentationTensor(
    {
      dims: [1, 5, 1, 1],
      data: new Float32Array([0, 8, -8, -8, -8])
    },
    {
      decodeMode: "binary-channels"
    }
  );
  assert(binaryMask.windowMask.data[0] > 0.99);

  const sampledValue = sampleMaskNearest(
    {
      width: 2,
      height: 2,
      data: new Float32Array([0, 0.5, 0.75, 1])
    },
    1,
    1,
    2,
    2
  );
  assert.strictEqual(sampledValue, 1);

  const batchName = formatBatchFileName(
    "{name}_{scene}_{preset}_{exposure}.{format}",
    {
      finalPresetKey: "luxury",
      metrics: {
        sceneClass: "Living Room",
        exposureClass: "Bright"
      }
    },
    "jpg",
    "Villa View.TIF"
  );
  assert.strictEqual(batchName, "Villa-View_living-room_luxury_bright.jpg");

  await testRuntimeCache();

  console.log("runtime_smoke_test.js OK");
}

main().catch((error) => {
  console.error(error && error.stack ? error.stack : error);
  process.exitCode = 1;
});
