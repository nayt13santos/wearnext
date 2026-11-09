# Background removal

U²-Net small (`u2netp`), developed by Xuebin Qin and collaborators for salient object detection. Runs locally through ONNX Runtime Web, with a 320×320 input and ImageNet normalization. Only public model weights are cached.

- Original project and Apache 2.0 license: https://github.com/xuebinqin/U-2-Net
- ONNX release maintained by rembg: https://github.com/danielgatis/rembg/releases/download/v0.0.0/u2netp.onnx
- Upstream download/checksum and preprocessing reference: https://github.com/danielgatis/rembg/blob/main/rembg/sessions/u2netp.py
- Verified upstream MD5: `8e83ca70e441ab06c318d82300c84806`

The detector finds a prominent object, not a garment-specific physical boundary guarantee. WearNext rejects empty masks, asks for review when the result is uncertain, keeps original photos, and allows restoration. Subject bounds determine an uncropped 900×900 white display frame with a consistent margin. The model is not used to generate new garment details.
