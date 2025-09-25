# scripts/inference_val_image.py
import torch
from PIL import Image
from transformers import TrOCRProcessor, VisionEncoderDecoderModel

# Configuración
device = "cuda" if torch.cuda.is_available() else "cpu"
model_path = "./trocr_model_2000_final"  # ruta a tu modelo entrenado
image_path = "dataset/val/aa.jpg"  # imagen de validación a probar

# Cargar modelo y procesador
processor = TrOCRProcessor.from_pretrained(model_path)
model = VisionEncoderDecoderModel.from_pretrained(model_path)
model.to(device)

# Cargar y preprocesar imagen
image = Image.open(image_path).convert("RGB")
pixel_values = processor(images=image, return_tensors="pt").pixel_values.to(device)

# Generar predicción
with torch.no_grad():
    generated_ids = model.generate(pixel_values, max_length=128)
    pred_text = processor.batch_decode(generated_ids, skip_special_tokens=True)[0]

print(f"Imagen: {image_path}")
print(f"Texto reconocido: {pred_text}")
