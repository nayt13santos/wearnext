# Local clothing tagging model

Derived from [OpenAI CLIP](https://github.com/openai/CLIP), MIT licensed (see LICENSE).
Original ViT-B/32 checkpoint: https://openaipublic.azureedge.net/clip/models/40d365715913c9da98579312b702a82c18be219cc2a73407c4526f58eba950af/ViT-B-32.pt
Original SHA256: 40d365715913c9da98579312b702a82c18be219cc2a73407c4526f58eba950af

`clothing-v2.onnx` SHA256: eb9f9bf235730ea7ab77c92a6cba0daee9e850309d4feb6bb0dc60175a5588c7
Size: 96,269,999 bytes. Opset 17. Fixed input float32 NCHW 1×3×224×224.
Outputs: cosine similarities in labels.json order followed by attributes.json order, plus a normalized 512-dimensional image embedding. Similarities are not calibrated probabilities. Each attribute group is ranked separately, with a minimum score and margin. Material and weight are estimates; waterproofing is not modeled.

The original image encoder is retained. Text embeddings for the fixed vocabulary
are computed once and embedded as a classification head; no text encoder runs
on the device. MatMul/Gemm weights are dynamically quantized to int8. This is
zero-shot recognition, not a model trained or validated on the user's wardrobe.
Single garments on a plain background work best; ambiguous shirts/overshirts,
multiple garments, occlusion, and unusual clothing can need manual selection.

Reproduce using scripts/export-category-model.py with the checkpoint path and
this output folder. Export environment: openai-clip 1.0.1, setuptools 80.10.2, torch 2.15.0, torchvision 0.29.2,
onnx 1.23.2, onnxruntime 1.31.1. Weights are hosted with the app; no private
photos or wardrobe metadata are included in these assets.
