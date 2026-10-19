# Local clothing category model

Derived from [OpenAI CLIP](https://github.com/openai/CLIP), MIT licensed (see LICENSE).
Original ViT-B/32 checkpoint: https://openaipublic.azureedge.net/clip/models/40d365715913c9da98579312b702a82c18be219cc2a73407c4526f58eba950af/ViT-B-32.pt
Original SHA256: 40d365715913c9da98579312b702a82c18be219cc2a73407c4526f58eba950af

`category.onnx` SHA256: da066c8101f325d5c691680ef53321a3ee3c295bfbab2c6e469e2baffcd9db7c
Size: 96,254,013 bytes. Opset 17. Fixed input float32 NCHW 1×3×224×224.
Output: cosine similarities in labels.json order. They are not probabilities.

The original image encoder is retained. Text embeddings for the fixed vocabulary
are computed once and embedded as a classification head; no text encoder runs
on the device. MatMul/Gemm weights are dynamically quantized to int8. This is
zero-shot recognition, not a model trained or validated on the user's wardrobe.
Single garments on a plain background work best; ambiguous shirts/overshirts,
multiple garments, occlusion, and unusual clothing can need manual selection.

Reproduce using scripts/export-category-model.py with the checkpoint path and
this output folder. Export environment: OpenAI CLIP commit
 d05afc436d78f1c48dc0dbf8e5980a9d471f35f6, torch 2.14.1, torchvision 0.29.1,
onnx 1.23.2, onnxruntime 1.31.0. Weights are hosted with the app; no private
photos or wardrobe metadata are included in these assets.
