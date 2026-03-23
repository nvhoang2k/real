import torch
import torch.nn as nn

class SimpleSeg(nn.Module):
    def __init__(self):
        super().__init__()
        self.conv = nn.Sequential(
            nn.Conv2d(3, 8, 3, padding=1),
            nn.ReLU(),
            nn.Conv2d(8, 1, 1),
            nn.Sigmoid()
        )

    def forward(self, x):
        return self.conv(x)

model = SimpleSeg()

dummy = torch.randn(1,3,512,512)

torch.onnx.export(
    model,
    dummy,
    "segmentation.onnx",
    input_names=["input"],
    output_names=["output"],
    opset_version=11
)

print("DONE: segmentation.onnx")