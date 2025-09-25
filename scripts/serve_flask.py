# serve_flask.py
import os
from flask import Flask, request, jsonify
from inference import MODEL_DIR
from transformers import TrOCRProcessor, VisionEncoderDecoderModel
from PIL import Image
import io

app = Flask(__name__)

processor = TrOCRProcessor.from_pretrained(MODEL_DIR)
model = VisionEncoderDecoderModel.from_pretrained(MODEL_DIR)

@app.route('/ocr', methods=['POST'])
def ocr_endpoint():
    if 'image' not in request.files:
        return jsonify({'error': 'no image'}), 400
    file = request.files['image']
    img = Image.open(file.stream).convert('RGB')
    inputs = processor(images=img, return_tensors='pt').pixel_values
    generated = model.generate(inputs)
    text = processor.batch_decode(generated, skip_special_tokens=True)[0]
    return jsonify({'text': text})

if __name__ == '__main__':
    app.run(host='127.0.0.1', port=5000)