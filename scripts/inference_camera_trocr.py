# scripts/inference_camera_trocr_filtered.py
import cv2
from PIL import Image
import torch
from transformers import TrOCRProcessor, VisionEncoderDecoderModel

# Configuración
device = "cuda" if torch.cuda.is_available() else "cpu"
model_path = "./trocr_bookscan_model_final"  # ruta a tu modelo entrenado
frame_skip = 5        # procesar 1 de cada 5 frames
resize_width = 384    # ancho para reducción de resolución
resize_height = 384   # alto para reducción de resolución

# Cargar modelo y procesador
processor = TrOCRProcessor.from_pretrained(model_path)
model = VisionEncoderDecoderModel.from_pretrained(model_path)
model.to(device)

# Abrir cámara
cap_index = 0
cap = cv2.VideoCapture(cap_index)
if not cap.isOpened():
    print(f"No se pudo abrir /dev/video{cap_index}, prueba otro índice.")
    exit()

print("📸 Capturando desde la cámara. Presiona Ctrl+C para salir.")
frame_count = 0

def filter_repetitions(text):
    """
    Elimina palabras consecutivas repetidas
    """
    words = text.split()
    filtered = []
    for w in words:
        if not filtered or w != filtered[-1]:
            filtered.append(w)
    return " ".join(filtered)

try:
    while True:
        ret, frame = cap.read()
        if not ret:
            print("No se pudo capturar la cámara")
            break

        frame_count += 1
        if frame_count % frame_skip != 0:
            continue  # saltar frames para reducir lag

        # Reducir resolución
        frame_small = cv2.resize(frame, (resize_width, resize_height))
        image = cv2.cvtColor(frame_small, cv2.COLOR_BGR2RGB)
        pil_image = Image.fromarray(image)

        # Predecir texto
        pixel_values = processor(images=pil_image, return_tensors="pt").pixel_values.to(device)
        generated_ids = model.generate(pixel_values)
        predicted_text = processor.batch_decode(generated_ids, skip_special_tokens=True)[0]

        # Filtrar repeticiones
        filtered_text = filter_repetitions(predicted_text)

        # Mostrar en terminal
        print(f">>> {filtered_text}")

except KeyboardInterrupt:
    print("\n📌 Captura detenida por usuario.")

finally:
    cap.release()
