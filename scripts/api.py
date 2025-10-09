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
from docx2pdf import convert as DOCXtoPDFConverter
import tempfile
from reportlab.pdfgen import canvas
from reportlab.lib.pagesizes import letter
import pandas as pd 
import json
import base64
from gtts import gTTS 
# Importaciones para las conversiones de video
from moviepy.editor import ImageClip, AudioFileClip, VideoFileClip, ImageSequenceClip

app = Flask(__name__)
CORS(app)

# Crea una carpeta temporal para los archivos
UPLOAD_FOLDER = os.path.join(os.path.dirname(__file__), '..', 'web_integration', 'uploads')
if not os.path.exists(UPLOAD_FOLDER):
    os.makedirs(UPLOAD_FOLDER)

# Configura tu clave API de Gemini
genai.configure(api_key="AIzaSyCXvPEexvkElKELeaR5iRK3Uu1D_iZZvHs")

# --------------------------------------------------------------------------------
# 1. ENDPOINT DE OCR (Sin cambios)
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
                for page in doc:
                    pix = page.get_pixmap(dpi=300)
                    temp_image_path = os.path.join(UPLOAD_FOLDER, f"temp_page_{page.number}.png")
                    pix.save(temp_image_path)
                    
                    comando = ["python", os.path.join(os.path.dirname(__file__), "ocr_lector_documento.py"), temp_image_path]
                    page_text = subprocess.check_output(comando, text=True, stderr=subprocess.STDOUT)
                    
                    texto_extraido += page_text + "\n\n"
                    
                    os.remove(temp_image_path)
                
                doc.close()
            
            else:
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
# 2. ENDPOINT PARA PREGUNTAR A LA IA (Sin cambios)
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
# 3. ENDPOINT PARA SÍNTESIS DE VOZ (Sin cambios)
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
# 4. ENDPOINT PARA CONVERSIÓN DE ARCHIVOS (MODIFICADO)
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
                
            # Manejo del audio opcional
            if 'audio_file' in request.files:
                audio_file = request.files['audio_file']
                audio_ext = os.path.splitext(audio_file.filename)[1]
                _, audio_file_path = tempfile.mkstemp(suffix=audio_ext)
                audio_file.save(audio_file_path)

            # --- Lógica de Conversión Imagen a Video (SLIDESHOW) ---
            temp_output_fd, temp_output_path = tempfile.mkstemp(suffix=".mp4")
            os.close(temp_output_fd)
            
            # Crea un clip de secuencia de imágenes (cada imagen dura 2 segundos por defecto)
            # duration=2.0 significa que cada imagen se muestra durante 2.0 segundos
            clip = ImageSequenceClip(temp_input_paths, durations=[2.0] * len(temp_input_paths)) 
            
            # Si hay archivo de audio, usarlo para determinar la duración total
            if audio_file_path:
                audio_clip = AudioFileClip(audio_file_path)
                # Recorta el clip de la imagen para que coincida con la duración del audio
                clip = clip.set_duration(audio_clip.duration).set_audio(audio_clip)
            
            # Escribir el video
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
                if file_ext.lower() not in ['.mp4', '.mov', '.avi', '.webm']:
                    raise ValueError("La entrada para Video a Audio debe ser un formato de video común (MP4, MOV, etc.).")
                    
                temp_output_fd, temp_output_path = tempfile.mkstemp(suffix=".mp3")
                os.close(temp_output_fd)
                
                video_clip = VideoFileClip(temp_input_path)
                video_clip.audio.write_audiofile(temp_output_path)
                video_clip.close() 

                return send_file(temp_output_path, mimetype='audio/mp3', as_attachment=True, download_name=output_filename + '.mp3')
            
            # --- Conversiones de Imagen ---
            elif conversion_type == 'jpg-to-png':
                img = Image.open(temp_input_path)
                output_buffer = io.BytesIO()
                img.save(output_buffer, format="PNG")
                output_buffer.seek(0)
                return send_file(output_buffer, mimetype='image/png', as_attachment=True, download_name=output_filename + '.png')
            
            elif conversion_type == 'png-to-jpg':
                img = Image.open(temp_input_path).convert('RGB')
                output_buffer = io.BytesIO()
                img.save(output_buffer, format="JPEG")
                output_buffer.seek(0)
                return send_file(output_buffer, mimetype='image/jpeg', as_attachment=True, download_name=output_filename + '.jpg')
            
            # --- Otras Conversiones (Documentos y Datos) ---
            elif conversion_type == 'pdf-to-word':
                temp_output_fd, temp_output_path = tempfile.mkstemp(suffix=".docx")
                os.close(temp_output_fd)
                cv = PDFtoDOCXConverter(temp_input_path)
                cv.convert(temp_output_path, start=0, end=None)
                cv.close()
                return send_file(temp_output_path, mimetype='application/vnd.openxmlformats-officedocument.wordprocessingml.document', as_attachment=True, download_name=output_filename + '.docx')

            elif conversion_type == 'word-to-pdf':
                temp_output_fd, temp_output_path = tempfile.mkstemp(suffix=".pdf")
                os.close(temp_output_fd)
                DOCXtoPDFConverter(temp_input_path, temp_output_path)
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
                df = pd.read_csv(StringIO(all_text), sep='\s\s+', engine='python', on_bad_lines='skip')
                
                if df.empty:
                    lines = [line.strip() for line in all_text.split('\n') if line.strip()]
                    df = pd.DataFrame(lines, columns=['Content'])
                
                output_buffer = io.BytesIO()
                df.to_csv(output_buffer, index=False, encoding='utf-8')
                output_buffer.seek(0)
                
                return send_file(output_buffer, mimetype='text/csv', as_attachment=True, download_name=output_filename + '.csv')
                
            # ... (Aquí irían el resto de las conversiones de archivo único: png-to-webp, webp-to-png, text-to-pdf, etc.) ...
            
            else:
                 return jsonify({"error": "Tipo de conversión no soportado."}), 400

    except Exception as e:
        print(f"Error CRÍTICO en la conversión: {e}")
        return jsonify({"error": f"Error al procesar la conversión: {str(e)}. (Verifica logs de Flask)"}), 500
    finally:
        # Limpia los archivos temporales (archivos únicos o lista de archivos)
        if temp_input_path and os.path.exists(temp_input_path):
            os.remove(temp_input_path)
        for path in temp_input_paths:
            if os.path.exists(path):
                os.remove(path)
        if audio_file_path and os.path.exists(audio_file_path):
            os.remove(audio_file_path)
        if 'temp_output_path' in locals() and temp_output_path and os.path.exists(temp_output_path):
            os.remove(temp_output_path)
    

if __name__ == '__main__':
    app.run(host='0.0.0.0', debug=True, port=5000)