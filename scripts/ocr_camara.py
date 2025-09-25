import pytesseract
import cv2
import numpy as np
import os

def procesar_foto_camara():
    """
    Inicia la cámara, toma una foto al presionar 'p', y procesa el texto.
    Guarda la imagen y el texto en la carpeta 'image_back'.
    """
    cap = cv2.VideoCapture(0)
    
    if not cap.isOpened():
        print("Error: No se pudo abrir la cámara.")
        return
        
    print("Presiona 'p' para tomar una foto. Presiona 'q' para salir.")
    
    while True:
        ret, frame = cap.read()
        if not ret:
            break
            
        cv2.imshow('Camara - Presiona p para foto', frame)
        
        key = cv2.waitKey(1) & 0xFF
        if key == ord('p'):
            print("Foto tomada. Procesando...")
            break
        if key == ord('q'):
            cap.release()
            cv2.destroyAllWindows()
            return

    # --- Procesamiento del fotograma capturado ---
    alto, ancho, _ = frame.shape
    roi_x1 = int(ancho * 0.25)
    roi_y1 = int(alto * 0.4)
    roi_x2 = int(ancho * 0.75)
    roi_y2 = int(alto * 0.6)
    
    roi_frame = frame[roi_y1:roi_y2, roi_x1:roi_x2]
    cv2.rectangle(frame, (roi_x1, roi_y1), (roi_x2, roi_y2), (255, 0, 0), 2)
    
    gray = cv2.cvtColor(roi_frame, cv2.COLOR_BGR2GRAY)
    _, binarized = cv2.threshold(gray, 150, 255, cv2.THRESH_BINARY_INV)
    
    resultados = pytesseract.image_to_data(binarized, lang='spa', output_type=pytesseract.Output.DICT)
    
    ruta_texto = os.path.join(os.path.dirname(__file__), "..", "image_back", "texto_capturado.txt")
    ruta_imagen_procesada = os.path.join(os.path.dirname(__file__), "..", "image_back", "foto_procesada.jpg")

    with open(ruta_texto, "w") as f:
        for i in range(len(resultados['text'])):
            confianza = int(resultados['conf'][i])
            texto_detectado = resultados['text'][i].strip()
            
            if confianza > 60 and texto_detectado:
                (x, y, w, h) = (resultados['left'][i], resultados['top'][i], resultados['width'][i], resultados['height'][i])
                cv2.rectangle(frame, (x + roi_x1, y + roi_y1), (x + w + roi_x1, y + h + roi_y1), (0, 255, 0), 2)
                cv2.putText(frame, texto_detectado, (x + roi_x1, y + roi_y1 - 10), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 0, 255), 2)
                f.write(texto_detectado + " ")

    cv2.imshow('Resultado OCR', frame)
    cv2.imwrite(ruta_imagen_procesada, frame)
    print(f"El resultado se guardó en: {ruta_texto} y {ruta_imagen_procesada}")
    
    cv2.waitKey(0)
    cap.release()
    cv2.destroyAllWindows()

if __name__ == '__main__':
    procesar_foto_camara()