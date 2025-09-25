import pytesseract
import cv2
import sys # Importa sys para leer argumentos de la línea de comandos
import os

def extraer_texto(ruta_imagen):
    # Ya no necesitas una ruta relativa, ya que el API te dará la ruta completa.
    try:
        img = cv2.imread(ruta_imagen)
        img_rgb = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)
        
        texto = pytesseract.image_to_string(img_rgb, lang='spa')
        
        return texto
    except Exception as e:
        # Devuelve el error para que la API lo capture
        return f"Error: {e}"

if __name__ == '__main__':
    # La ruta de la imagen se pasa como el primer argumento
    if len(sys.argv) > 1:
        ruta_del_documento = sys.argv[1]
        texto_reconocido = extraer_texto(ruta_del_documento)
        print(texto_reconocido)
    else:
        print("Error: No se proporcionó una ruta de imagen.")