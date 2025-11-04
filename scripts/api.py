import flask
from flask import Flask, request, jsonify, send_file
from flask_cors import CORS
import subprocess
import os
import fitz # PyMuPDF
import google.generativeai as genai
from PIL import Image # Pillow
import io
import mimetypes
from pdf2docx import Converter as PDFtoDOCXConverter
# La línea 'from docx2pdf import convert as DOCXtoPDFConverter' fue ELIMINADA.
import tempfile
import pandas as pd 
import json
import base64
from gtts import gTTS 
from moviepy.editor import ImageClip, AudioFileClip, VideoFileClip, ImageSequenceClip
import glob 
import qrcode 
import shutil # Necesario para eliminar directorios en la limpieza

app = Flask(__name__)
CORS(app)

# --------------------------------------------------------------------------------
# ⚠️ CONFIGURACIÓN DE URLS Y RUTAS - DEBES EDITAR ESTA SECCIÓN
# --------------------------------------------------------------------------------

# 1. URL DE LA API: Usada por el frontend (React). Debe ser la URL de Ngrok.
# Asegúrate de que esta URL coincida con el túnel de Ngrok para el puerto 5000 (backend)
API_SERVER_URL = "https://df06bcdaa444.ngrok-free.app"  
# 2. URL DEL SERVICIO QR: Codificada en el QR. Debe ser la URL de Ngrok para el puerto 5001 (qr_images)
# Asegúrate de que esta URL coincida con el túnel de Ngrok para el puerto 5001 (qr_images)
QR_SERVICE_URL = "https://fff38f39f5af.ngrok-free.app" 

# Define la carpeta base para uploads, relativa a la ubicación de api.py (que está en 'scripts')
UPLOAD_FOLDER = os.path.join(os.path.dirname(__file__), '..', 'web_integration', 'uploads')
QR_IMAGE_FOLDER = os.path.join(UPLOAD_FOLDER, 'qr_images') 

if not os.path.exists(UPLOAD_FOLDER):
    os.makedirs(UPLOAD_FOLDER)
if not os.path.exists(QR_IMAGE_FOLDER):
    os.makedirs(QR_IMAGE_FOLDER)
#AIzaSyCHcyGOPNveHlKHezKZsSXwIXQSeSgmQWY
# Configura tu clave API de Gemini 
genai.configure(api_key="IzaSyCHcyGOPNveHlKHezKZsSXwIXQSeSgmQWY")

# --------------------------------------------------------------------------------
# FUNCIÓN DE LIMPIEZA
# --------------------------------------------------------------------------------
def cleanup_moviepy_temps(temp_dir):
    """Limpia archivos temporales creados por MoviePy y otros libs."""
    patterns = ['_tmp*', 'audiotmp*']
    for pattern in patterns:
        for f in glob.glob(os.path.join(temp_dir, pattern)):
            try:
                os.remove(f)
            except Exception as e:
                print(f"Error al limpiar archivo temporal {f}: {e}")

# --------------------------------------------------------------------------------
# 1. ENDPOINT DE OCR
# --------------------------------------------------------------------------------
@app.route('/ocr', methods=['POST'])
def ocr_endpoint():
    if 'file' not in request.files:
        return jsonify({"error": "No se recibió ningún archivo."}), 400
    file = request.files['file']
    if file.filename == '':
        return jsonify({"error": "No se seleccionó ningún archivo."}), 400

    if file: 
        file_ext = os.path.splitext(file.filename)[1].lower()
        filepath = os.path.join(UPLOAD_FOLDER, file.filename)
        file.save(filepath)

        texto_extraido = ""
        
        try:
            if file_ext == '.pdf':
                doc = fitz.open(filepath)
                # Lógica de OCR para PDF (página por página)
                for page in doc:
                    pix = page.get_pixmap(dpi=300)
                    temp_image_path = os.path.join(UPLOAD_FOLDER, f"temp_page_{page.number}.png")
                    pix.save(temp_image_path)
                    
                    # Asegúrate de que 'ocr_lector_documento.py' exista en la carpeta 'scripts'
                    comando = ["python", os.path.join(os.path.dirname(__file__), "ocr_lector_documento.py"), temp_image_path]
                    page_text = subprocess.check_output(comando, text=True, stderr=subprocess.STDOUT)
                    
                    texto_extraido += page_text + "\n\n"
                    
                    os.remove(temp_image_path)
                
                doc.close()
            
            else:
                # Lógica de OCR para imágenes
                comando = ["python", os.path.join(os.path.dirname(__file__), "ocr_lector_documento.py"), filepath]
                texto_extraido = subprocess.check_output(comando, text=True, stderr=subprocess.STDOUT)
            
            return jsonify({"success": True, "text": texto_extraido})
            
        except subprocess.CalledProcessError as e:
            print(f"Error en subprocess: {e.output}")
            return jsonify({"success": False, "error": f"Error en el script de OCR. Asegúrate de que 'ocr_lector_documento.py' y Tesseract estén funcionando: {e.output}"}), 500
        except Exception as e:
            print(f"Error general en OCR: {str(e)}")
            return jsonify({"success": False, "error": f"Error al procesar el archivo: {str(e)}"}), 500
        finally:
            if os.path.exists(filepath):
                os.remove(filepath)


# --------------------------------------------------------------------------------
# 2. ENDPOINT PARA PREGUNTAR A LA IA
# --------------------------------------------------------------------------------
@app.route('/ask', methods=['POST'])
def ask_question():
    data = request.json
    pregunta = data.get('pregunta', '')
    texto_contexto = data.get('texto_extraido', '')

    if not pregunta or not texto_contexto:
        return jsonify({"success": False, "error": "Faltan datos (pregunta o texto_extraido)."}), 400

    try:
        model = genai.GenerativeModel('gemini-2.5-flash-preview-05-20')
        
        prompt = f"""
        Dado el siguiente texto extraído de un documento, responde a la pregunta que se te hará. 
        Si la respuesta no se encuentra en el texto, di que no puedes responder basándote solo en la información proporcionada.

        Texto del documento:
        {texto_contexto}

        ---

        Pregunta del usuario:
        {pregunta}
        """
        response = model.generate_content(prompt)
        
        if not response.parts:
            feedback = response.prompt_feedback
            error_msg = "Respuesta vacía de la IA."
            if feedback and feedback.block_reason:
                error_msg = f"Contenido bloqueado: {feedback.block_reason}"
            
            return jsonify({
                "success": False,
                "error": error_msg
            }), 500
        
        return jsonify({"success": True, "respuesta": response.text})

    except Exception as e:
        print(f"Error al interactuar con la IA: {e}")
        return jsonify({"success": False, "error": f"Error al interactuar con la IA. Detalles: {str(e)}"}), 500

# --------------------------------------------------------------------------------
# 3. ENDPOINT PARA SÍNTESIS DE VOZ
# --------------------------------------------------------------------------------
@app.route('/tts', methods=['POST'])
def synthesize_speech():
    data = request.json
    text_to_speak = data.get('text', '')

    if not text_to_speak:
        return jsonify({"error": "No se proporcionó texto para la síntesis de voz."}), 400

    try:
        tts = gTTS(text_to_speak, lang='es')
        
        audio_buffer = io.BytesIO()
        tts.write_to_fp(audio_buffer)
        audio_buffer.seek(0)
        
        audio_data_base64 = base64.b64encode(audio_buffer.read()).decode('utf-8')
        
        return jsonify({
            "success": True, 
            "audioData": audio_data_base64,
            "mimeType": "audio/mp3"
        })

    except Exception as e:
        print(f"Error en la síntesis de voz con gTTS: {e}")
        return jsonify({"success": False, "error": f"Error en la API de TTS (gTTS): {str(e)}"}), 500

# --------------------------------------------------------------------------------
# 4. ENDPOINT PARA CONVERSIÓN DE ARCHIVOS
# --------------------------------------------------------------------------------
@app.route('/convert', methods=['POST'])
def convert_file():
    conversion_type = request.form.get('type')
    
    if not conversion_type:
        return jsonify({"error": "Tipo de conversión no especificado."}), 400

    temp_input_path = None
    temp_input_paths = []
    audio_file_path = None
    temp_output_path = None
    temp_output_dir = None # Declarar aquí para el bloque finally
    output_filename = "archivo_convertido"

    try:
        if conversion_type == 'img-to-video':
            # === Manejo de múltiples archivos para Imagen a Video ===
            files = request.files.getlist('files[]')
            if not files:
                return jsonify({"error": "Debes subir al menos una imagen."}), 400
            
            for f in files:
                file_ext = os.path.splitext(f.filename)[1]
                _, path = tempfile.mkstemp(suffix=file_ext)
                f.save(path)
                temp_input_paths.append(path)
                output_filename = os.path.splitext(f.filename)[0] + f"_x{len(files)}"
                
            # Manejo del audio cional
            if 'audio_file' in request.files:
                audio_file = request.files['audio_file']
                audio_ext = os.path.splitext(audio_file.filename)[1]
                _, audio_file_path = tempfile.mkstemp(suffix=audio_ext)
                audio_file.save(audio_file_path)

            # --- Lógica de Conversión Imagen a Video (SLIDESHOW) ---
            temp_output_fd, temp_output_path = tempfile.mkstemp(suffix=".mp4")
            os.close(temp_output_fd)
            
            clip = ImageSequenceClip(temp_input_paths, durations=[2.0] * len(temp_input_paths)) 
            
            if audio_file_path:
                audio_clip = AudioFileClip(audio_file_path)
                clip = clip.set_duration(audio_clip.duration).set_audio(audio_clip)
            
            clip.write_videofile(temp_output_path, codec='libx264', fps=24, logger=None)
            clip.close()

            return send_file(temp_output_path, mimetype='video/mp4', as_attachment=True, download_name=output_filename + '.mp4')
            
        else:
            # === Manejo de archivo único para otras conversiones ===
            if 'file' not in request.files:
                return jsonify({"error": "No se recibió un archivo para la conversión de tipo único."}), 400
                
            file = request.files['file']
            file_ext = os.path.splitext(file.filename)[1]
            temp_input_fd, temp_input_path = tempfile.mkstemp(suffix=file_ext)
            file.save(temp_input_path)
            os.close(temp_input_fd)
            output_filename = os.path.splitext(file.filename)[0]

            
            # --- Conversión de Video a Audio ---
            if conversion_type == 'video-to-audio':
                if file_ext.lower() not in ['.mp4', '.mov', '.avi', '.webm', '.mkv']:
                    raise ValueError("La entrada para Video a Audio debe ser un formato de video común.")
                    
                temp_output_fd, temp_output_path = tempfile.mkstemp(suffix=".mp3")
                os.close(temp_output_fd)
                
                video_clip = VideoFileClip(temp_input_path)
                
                if video_clip.audio:
                    video_clip.audio.write_audiofile(temp_output_path, logger=None)
                else:
                    raise ValueError("El archivo de video no contiene una pista de audio para extraer.")
                    
                video_clip.close() 

                return send_file(temp_output_path, mimetype='audio/mp3', as_attachment=True, download_name=output_filename + '.mp3')
            
            # --- Conversiones de Imagen ---
            elif conversion_type in ['jpg-to-png', 'png-to-jpg', 'png-to-webp', 'webp-to-png']:
                img = Image.open(temp_input_path)
                output_buffer = io.BytesIO()
                
                if conversion_type == 'jpg-to-png' or conversion_type == 'webp-to-png':
                    img.save(output_buffer, format="PNG")
                    mimetype = 'image/png'
                    extension = '.png'
                elif conversion_type == 'png-to-jpg':
                    img.convert('RGB').save(output_buffer, format="JPEG")
                    mimetype = 'image/jpeg'
                    extension = '.jpg'
                elif conversion_type == 'png-to-webp':
                    img.save(output_buffer, format="WEBP")
                    mimetype = 'image/webp'
                    extension = '.webp'
                
                output_buffer.seek(0)
                return send_file(output_buffer, mimetype=mimetype, as_attachment=True, download_name=output_filename + extension)
            
            # --- Otras Conversiones (Documentos y Datos) ---
            elif conversion_type == 'pdf-to-word':
                temp_output_fd, temp_output_path = tempfile.mkstemp(suffix=".docx")
                os.close(temp_output_fd)
                cv = PDFtoDOCXConverter(temp_input_path)
                cv.convert(temp_output_path, start=0, end=None)
                cv.close()
                return send_file(temp_output_path, mimetype='application/vnd.openxmlformats-officedocument.wordprocessingml.document', as_attachment=True, download_name=output_filename + '.docx')

            elif conversion_type == 'word-to-pdf':
                # Reemplazo de docx2pdf por LibreOffice para compatibilidad con Linux (Debian)
                temp_output_dir = tempfile.mkdtemp()
                output_filename_base = os.path.splitext(os.path.basename(temp_input_path))[0]
                
                # Comando para usar LibreOffice en modo headless para la conversión
                comando_libreoffice = [
                    "libreoffice", 
                    "--headless", 
                    "--convert-to", 
                    "pdf", 
                    temp_input_path, 
                    "--outdir", 
                    temp_output_dir
                ]
                
                # Ejecutar el comando. 'check=True' asegura que si falla, se lanza una excepción.
                subprocess.run(comando_libreoffice, check=True)
                
                # El archivo de salida de LibreOffice tendrá el mismo nombre base + .pdf
                temp_output_path = os.path.join(temp_output_dir, output_filename_base + '.pdf')
                
                if not os.path.exists(temp_output_path):
                    raise Exception("LibreOffice no pudo generar el archivo PDF de salida. Asegúrate de que LibreOffice esté instalado y accesible.")
                
                return send_file(temp_output_path, mimetype='application/pdf', as_attachment=True, download_name=output_filename + '.pdf')
            
            elif conversion_type == 'pdf-to-csv':
                doc = fitz.open(temp_input_path)
                all_text = ""
                for page in doc:
                    all_text += page.get_text() + "\n"
                doc.close()

                if not all_text.strip():
                    raise ValueError("El PDF no contiene texto para convertir a CSV.")

                from io import StringIO
                
                # Intenta parsear como tabla, si falla, usa el texto crudo
                try:
                    df = pd.read_csv(StringIO(all_text), sep='\s\s+', engine='python', on_bad_lines='skip')
                except Exception:
                    lines = [line.strip() for line in all_text.split('\n') if line.strip()]
                    df = pd.DataFrame(lines, columns=['Content'])

                if df.empty:
                    raise ValueError("El PDF no pudo ser parseado como datos estructurados.")
                
                output_buffer = io.BytesIO()
                df.to_csv(output_buffer, index=False, encoding='utf-8')
                output_buffer.seek(0)
                
                return send_file(output_buffer, mimetype='text/csv', as_attachment=True, download_name=output_filename + '.csv')
                
            else:
                return jsonify({"error": "Tipo de conversión no soportado."}), 400

    except Exception as e:
        print(f"Error CRÍTICO en la conversión: {e}")
        return jsonify({"error": f"Error al procesar la conversión: {str(e)}. (Verifica logs de Flask)"}), 500
    finally:
        # Limpia los archivos temporales
        if temp_input_path and os.path.exists(temp_input_path):
            os.remove(temp_input_path)
        for path in temp_input_paths:
            if os.path.exists(path):
                os.remove(path)
        if audio_file_path and os.path.exists(audio_file_path):
            os.remove(audio_file_path)
        if 'temp_output_path' in locals() and temp_output_path and os.path.exists(temp_output_path):
            # Este es el archivo PDF convertido, que debe ser eliminado después de enviarlo
            os.remove(temp_output_path)
        
        # ⚠️ LIMPIEZA CRÍTICA: Elimina el directorio temporal de LibreOffice si fue creado
        if temp_output_dir and os.path.exists(temp_output_dir):
            shutil.rmtree(temp_output_dir)
            
        cleanup_moviepy_temps(tempfile.gettempdir())
    
# --------------------------------------------------------------------------------
# 5. ENDPOINT PRINCIPAL: Generación de QR (URL o Imagen)
# --------------------------------------------------------------------------------
@app.route('/generate-qr', methods=['POST'])
def generate_qr():
    qr_data = request.form.get('url_data')
    qr_type = request.form.get('qr_type')
    
    final_data_to_encode = ""
    safe_filepath = None
    
    try:
        if qr_type == 'image':
            # --- Subida y almacenamiento de la imagen ---
            if 'image_file' not in request.files:
                return jsonify({"error": "No se recibió el archivo de imagen."}), 400
            
            file = request.files['image_file']
            original_filename = file.filename
            file_ext = os.path.splitext(original_filename)[1].lower()
            
            if file_ext not in ['.jpg', '.jpeg', '.png', '.webp']:
                return jsonify({"error": "Formato de imagen no soportado (solo JPG, PNG, WEBP)."}), 400

            unique_filename = f"{os.urandom(8).hex()}{file_ext}"
            safe_filepath = os.path.join(QR_IMAGE_FOLDER, unique_filename)
            file.save(safe_filepath)

            # CRUCIAL: Se usa la URL de Ngrok (QR_SERVICE_URL) con puerto 5001
            final_data_to_encode = f"{QR_SERVICE_URL}/qr-image/{unique_filename}"
            
        elif qr_type == 'url':
            # --- Lógica para URL simple o texto ---
            if not qr_data:
                return jsonify({"error": "No se proporcionó una URL o texto para convertir."}), 400
            final_data_to_encode = qr_data
            
        else:
            return jsonify({"error": "Tipo de QR no especificado (debe ser 'url' o 'image')."}), 400

        # --- Generación del Código QR ---
        qr = qrcode.QRCode(
            version=1,
            error_correction=qrcode.constants.ERROR_CORRECT_L,
            box_size=10,
            border=4,
        )
        qr.add_data(final_data_to_encode)
        qr.make(fit=True)

        img = qr.make_image(fill_color="#1a1a2e", back_color="#e0e0e0").convert('RGB')
        
        # Guardar la imagen QR en un buffer para enviarla como respuesta
        img_buffer = io.BytesIO()
        img.save(img_buffer, format='PNG')
        img_buffer.seek(0)

        # Usamos send_file para enviar la imagen PNG directamente
        return send_file(
            img_buffer, 
            mimetype='image/png', 
            as_attachment=True, 
            download_name='qr_code.png'
        )

    except Exception as e:
        print(f"Error al generar el código QR: {e}")
        if safe_filepath and os.path.exists(safe_filepath):
            os.remove(safe_filepath)
        return jsonify({"error": f"Error al generar el QR: {str(e)}"}), 500

# --------------------------------------------------------------------------------
# NOTA: EL ENDPOINT '/qr-image/<filename>' FUE ELIMINADO Y MOVIDO A 'image_server.py'
# --------------------------------------------------------------------------------

if __name__ == '__main__':
    # Este servidor corre en el puerto 5000 y será tunelizado por Ngrok
    app.run(host='0.0.0.0', debug=True, port=5000)