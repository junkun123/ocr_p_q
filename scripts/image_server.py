# image_server.py
from flask import Flask, send_file
from flask_cors import CORS
import os
import mimetypes

app = Flask(__name__)
# Permitir CORS para peticiones externas
CORS(app) 

# Ruta a la carpeta de imágenes:
# __file__ -> /var/www/html/projetc/scripts/image_server.py
# '..'     -> /var/www/html/projetc/
# ... el resto lleva a la carpeta 'qr_images'
QR_IMAGE_FOLDER = os.path.join(
    os.path.dirname(__file__), 
    '..', 
    'web_integration', 
    'uploads', 
    'qr_images'
) 

# --------------------------------------------------------------------------------
# ENDPOINT PARA SERVIR LA IMAGEN (SOLO LECTURA)
# --------------------------------------------------------------------------------
@app.route('/qr-image/<filename>', methods=['GET'])
def serve_qr_image(filename):
    filepath = os.path.join(QR_IMAGE_FOLDER, filename)
    
    if not os.path.exists(filepath):
        print(f"ERROR 404: Archivo no encontrado: {filepath}")
        return "Imagen de Código QR no encontrada en el servidor.", 404
    
    mimetype, _ = mimetypes.guess_type(filepath)
    if not mimetype:
        mimetype = 'application/octet-stream' 
        
    return send_file(filepath, mimetype=mimetype)


if __name__ == '__main__':
    # El servidor de imágenes se ejecuta en el puerto 5001
    print("------------------------------------------")
    print(f"Carpeta de imágenes: {QR_IMAGE_FOLDER}")
    print("Iniciando Servidor de Imágenes QR en http://192.168.1.153:5001")
    print("------------------------------------------")
    app.run(host='0.0.0.0', debug=True, port=5001)