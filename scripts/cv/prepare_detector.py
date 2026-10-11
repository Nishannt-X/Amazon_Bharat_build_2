"""Explicit one-time preparation; uploads never download model weights."""
from torchvision.models.detection import (
    fasterrcnn_mobilenet_v3_large_320_fpn,
    FasterRCNN_MobileNet_V3_Large_320_FPN_Weights,
)
weights = FasterRCNN_MobileNet_V3_Large_320_FPN_Weights.DEFAULT
fasterrcnn_mobilenet_v3_large_320_fpn(weights=weights).eval()
print('Cached COCO traffic detector ready. This model does not segment water or predict metric depth.')
