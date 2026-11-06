"""Export OpenAI CLIP ViT-B/32 with a fixed clothing vocabulary for local inference.

Requires torch, torchvision, openai/CLIP, onnx, onnxruntime. Pass the original
ViT-B-32.pt path and an output directory. Original weights: MIT license.
"""
import hashlib
import json
import pathlib
import sys

import clip
import torch
from onnxruntime.quantization import quantize_dynamic, QuantType

torch.set_num_threads(4)
source, output = map(pathlib.Path, sys.argv[1:3])
assert hashlib.sha256(source.read_bytes()).hexdigest() == '40d365715913c9da98579312b702a82c18be219cc2a73407c4526f58eba950af'
output.mkdir(parents=True, exist_ok=True)
model, _ = clip.load(str(source), device='cpu', jit=False)
model = model.float().eval()
groups = {
    'Top': ['a t-shirt', 'a polo shirt', 'a button-up shirt', 'a blouse', 'a tank top', 'a sweater', 'a sweatshirt', 'a sports jersey'],
    'Bottom': ['trousers', 'jeans', 'shorts', 'a skirt', 'leggings', 'jogger pants', 'chino pants'],
    'Shoes': ['sneakers', 'dress shoes', 'boots', 'sandals', 'slippers', 'loafers', 'high heels'],
    'One-piece': ['a dress', 'a jumpsuit', 'a romper', 'overalls'],
    'Layer': ['a jacket', 'a coat', 'a blazer', 'a cardigan', 'a zip-up hoodie', 'an overshirt'],
    'Accessory': ['a bag', 'a hat', 'a belt', 'a scarf', 'a wristwatch', 'jewelry', 'socks', 'sunglasses'],
    'Unknown': ['several different garments in a complete outfit', 'an empty background', 'furniture', 'food', 'a household object', 'an electronic device', 'a landscape'],
}
labels = [{'category': category, 'label': label} for category, labels in groups.items() for label in labels]
attributes = {
    'color': {name: f'{name.lower()} clothing' for name in ['White','Black','Grey','Navy','Blue','Green','Beige','Brown','Red','Pink','Purple','Yellow','Orange','Multicolor']},
    'pattern': {'Solid':'plain solid-colored clothing with no pattern', 'Striped':'clothing with stripes', 'Checked':'clothing with a checkered plaid pattern', 'Printed':'clothing with a graphic print or floral pattern'},
    'material': {'Cotton':'cotton fabric clothing', 'Linen':'linen fabric clothing', 'Denim':'denim clothing', 'Wool':'wool knit clothing', 'Synthetic':'synthetic polyester sports fabric clothing', 'Leather':'leather or faux leather clothing or shoes'},
    'style': {'Casual':'casual everyday clothing', 'Smart':'smart business casual clothing', 'Formal':'formal evening or business clothing', 'Sport':'athletic sportswear for exercising'},
    'warmth': {'1':'thin lightweight summer clothing', '2':'medium weight clothing', '3':'thick warm winter clothing'},
}
attribute_labels = [{'field': field, 'value': value, 'label': label} for field, values in attributes.items() for value, label in values.items()]
with torch.no_grad():
    embeddings = []
    for item in labels + attribute_labels:
        texts = [f'a photo of {item["label"]}.', f'a product photo of {item["label"]}.', f'{item["label"]} on a plain background.']
        v = model.encode_text(clip.tokenize(texts))
        v = v / v.norm(dim=-1, keepdim=True)
        v = v.mean(dim=0)
        embeddings.append(v / v.norm())
    texts = torch.stack(embeddings).T

class Classifier(torch.nn.Module):
    def __init__(self):
        super().__init__()
        self.visual = model.visual
        self.register_buffer('texts', texts)
    def forward(self, pixels):
        v = self.visual(pixels)
        v = v / v.norm(dim=-1, keepdim=True)
        return v @ self.texts, v

classifier = Classifier().eval()
raw = output / 'category-fp32.onnx'
torch.onnx.export(classifier, torch.zeros(1, 3, 224, 224), str(raw),
    input_names=['pixels'], output_names=['similarities','embedding'], opset_version=17,
    dynamo=False, external_data=False)
quantize_dynamic(str(raw), str(output / 'clothing-v2.onnx'), weight_type=QuantType.QInt8,
    op_types_to_quantize=['MatMul', 'Gemm'], per_channel=True)
(output / 'labels.json').write_text(json.dumps(labels, indent=2) + '\n')
(output / 'attributes.json').write_text(json.dumps(attribute_labels, indent=2) + '\n')
raw.unlink()
print('Exported', (output / 'clothing-v2.onnx').stat().st_size, 'bytes', flush=True)
