import flask
from flask import Flask, request, jsonify, send_file
from flask_cors import CORS
import subprocess
import os
import fitz
import google.generativeai as genai
from PIL import Image
import io
import mimetypes
from pdf2docx import Converter as PDFtoDOCXConverter
from docx2pdf import convert as DOCXtoPDFConverter
import tempfile
from reportlab.pdfgen import canvas
from reportlab.lib.pagesizes import letter
import pandas as pd
import json
import base64 # Importación reincorporada para manejar el audio TTS

app = Flask(__name__)
CORS(app)

# Crea una carpeta temporal para los archivos
UPLOAD_FOLDER = os.path.join(os.path.dirname(__file__), '..', 'web_integration', 'uploads')
if not os.path.exists(UPLOAD_FOLDER):
    os.makedirs(UPLOAD_FOLDER)

# Configura tu clave API de Gemini
# Utiliza una clave de API segura
genai.configure(api_key="AIzaSyA9q3-vZMMyyOspekQ5weWoaLXJj7OtG64")

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
                    
                    # Asumiendo que 'ocr_lector_documento.py' es un script que usa Tesseract o similar
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
            return jsonify({"success": False, "error": f"Error en el script de OCR: {e.output}"}), 500
        except Exception as e:
            return jsonify({"success": False, "error": f"Error al procesar el archivo: {str(e)}"}), 500
        finally:
            if os.path.exists(filepath):
                os.remove(filepath)

# --- Endpoint para preguntar a la IA ---
@app.route('/ask', methods=['POST'])
def ask_question():
    data = request.json
    pregunta = data.get('pregunta', '')
    texto_contexto = data.get('texto_extraido', '')

    if not pregunta or not texto_contexto:
        return jsonify({"success": False, "error": "Faltan datos (pregunta o texto_extraido)."}), 400

    try:
        # Modelo actualizado para asegurar compatibilidad
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
            if feedback and feedback.block_reason:
                return jsonify({
                    "success": False,
                    "error": f"El contenido de la pregunta o el texto fue bloqueado por la IA. Razón: {feedback.block_reason}"
                }), 500
            else:
                return jsonify({
                    "success": False,
                    "error": "Respuesta vacía de la IA. Posiblemente debido a contenido no válido o error interno."
                }), 500
        
        return jsonify({"success": True, "respuesta": response.text})

    except Exception as e:
        print(f"Error al interactuar con la IA: {e}")
        return jsonify({"success": False, "error": f"Error al interactuar con la IA. Revisa la terminal del servidor para más detalles."}), 500

# --- NUEVO ENDPOINT PARA SÍNTESIS DE VOZ (TTS) ---
@app.route('/tts', methods=['POST'])
def synthesize_speech():
    data = request.json
    text_to_speak = data.get('text', '')

    if not text_to_speak:
        return jsonify({"error": "No se proporcionó texto para la síntesis de voz."}), 400

    try:
        # Llama al modelo TTS de Gemini
        tts_model = genai.GenerativeModel('gemini-2.5-flash-preview-tts')
        
        # Configuración para voz y audio PCM
        generation_config = {
            "responseModalities": ["AUDIO"],
            "speechConfig": {
                "voiceConfig": {
                    "prebuiltVoiceConfig": {"voiceName": "Kore"} # Voz firme y clara
                }
            }
        }
        
        response = tts_model.generate_content(text_to_speak, generation_config=generation_config)

        audio_part = response.candidates[0].content.parts[0]
        
        if 'inlineData' in audio_part:
            # El audio PCM está codificado en base64
            audio_data_base64 = audio_part['inlineData']['data']
            mime_type = audio_part['inlineData']['mimeType']
            
            return jsonify({
                "success": True, 
                "audioData": audio_data_base64,
                "mimeType": mime_type # Contiene información como sampleRate=16000
            })
        
        return jsonify({"success": False, "error": "No se generaron datos de audio."}), 500

    except Exception as e:
        print(f"Error en la síntesis de voz con Gemini: {e}")
        return jsonify({"success": False, "error": f"Error en la API de TTS: {str(e)}"}), 500


# --- ENDPOINT PARA CONVERSIÓN DE ARCHIVOS ---
@app.route('/convert', methods=['POST'])
def convert_file():
    if 'file' not in request.files or 'type' not in request.form:
        return jsonify({"error": "Faltan datos (archivo o tipo de conversión)."}), 400

    file = request.files['file']
    conversion_type = request.form['type']
    
    # Crea un archivo temporal para guardar el archivo recibido
    file_ext = os.path.splitext(file.filename)[1]
    temp_input_fd, temp_input_path = tempfile.mkstemp(suffix=file_ext)
    file.save(temp_input_path)
    os.close(temp_input_fd)
    
    temp_output_path = None # Inicializar para el bloque finally

    try:
        if conversion_type == 'jpg-to-png':
            img = Image.open(temp_input_path)
            output_buffer = io.BytesIO()
            img.save(output_buffer, format="PNG")
            output_buffer.seek(0)
            return send_file(output_buffer, mimetype='image/png', as_attachment=True, download_name=os.path.splitext(file.filename)[0] + '.png')
        
        elif conversion_type == 'png-to-jpg':
            img = Image.open(temp_input_path).convert('RGB')
            output_buffer = io.BytesIO()
            img.save(output_buffer, format="JPEG")
            output_buffer.seek(0)
            return send_file(output_buffer, mimetype='image/jpeg', as_attachment=True, download_name=os.path.splitext(file.filename)[0] + '.jpg')
        
        elif conversion_type == 'png-to-webp':
            img = Image.open(temp_input_path)
            output_buffer = io.BytesIO()
            img.save(output_buffer, format="WEBP")
            output_buffer.seek(0)
            return send_file(output_buffer, mimetype='image/webp', as_attachment=True, download_name=os.path.splitext(file.filename)[0] + '.webp')

        elif conversion_type == 'webp-to-png':
            img = Image.open(temp_input_path)
            output_buffer = io.BytesIO()
            img.save(output_buffer, format="PNG")
            output_buffer.seek(0)
            return send_file(output_buffer, mimetype='image/png', as_attachment=True, download_name=os.path.splitext(file.filename)[0] + '.png')
        
        elif conversion_type == 'png-to-gif':
            img = Image.open(temp_input_path)
            output_buffer = io.BytesIO()
            img.save(output_buffer, format="GIF")
            output_buffer.seek(0)
            return send_file(output_buffer, mimetype='image/gif', as_attachment=True, download_name=os.path.splitext(file.filename)[0] + '.gif')

        elif conversion_type == 'gif-to-png':
            img = Image.open(temp_input_path).convert('RGBA') # Convertir a RGBA para compatibilidad PNG
            output_buffer = io.BytesIO()
            img.save(output_buffer, format="PNG")
            output_buffer.seek(0)
            return send_file(output_buffer, mimetype='image/png', as_attachment=True, download_name=os.path.splitext(file.filename)[0] + '.png')

        elif conversion_type == 'pdf-to-word':
            temp_output_fd, temp_output_path = tempfile.mkstemp(suffix=".docx")
            os.close(temp_output_fd)
            cv = PDFtoDOCXConverter(temp_input_path)
            cv.convert(temp_output_path, start=0, end=None)
            cv.close()
            return send_file(temp_output_path, mimetype='application/vnd.openxmlformats-officedocument.wordprocessingml.document', as_attachment=True, download_name=os.path.splitext(file.filename)[0] + '.docx')

        elif conversion_type == 'word-to-pdf':
            temp_output_fd, temp_output_path = tempfile.mkstemp(suffix=".pdf")
            os.close(temp_output_fd)
            DOCXtoPDFConverter(temp_input_path, temp_output_path)
            return send_file(temp_output_path, mimetype='application/pdf', as_attachment=True, download_name=os.path.splitext(file.filename)[0] + '.pdf')
        
        elif conversion_type == 'text-to-pdf':
            # La entrada es un archivo .txt, lo convertimos a PDF
            temp_output_fd, temp_output_path = tempfile.mkstemp(suffix=".pdf")
            os.close(temp_output_fd)
            
            c = canvas.Canvas(temp_output_path, pagesize=letter)
            # Leer el contenido del archivo .txt
            with open(temp_input_path, 'r', encoding='utf-8') as f:
                text_content = f.read()

            textobject = c.beginText(50, 750)
            textobject.setFont("Helvetica", 10)
            
            # Dividir el texto por líneas y escribirlo
            for line in text_content.split('\n'):
                textobject.textLine(line)
            
            c.drawText(textobject)
            c.save()
            return send_file(temp_output_path, mimetype='application/pdf', as_attachment=True, download_name=os.path.splitext(file.filename)[0] + '.pdf')

        elif conversion_type == 'pdf-to-text':
            # Extrae el texto simple de un PDF
            doc = fitz.open(temp_input_path)
            text_content = ""
            for page in doc:
                text_content += page.get_text() + "\n\n"
            doc.close()

            output_buffer = io.BytesIO(text_content.encode('utf-8'))
            output_buffer.seek(0)
            
            return send_file(output_buffer, mimetype='text/plain', as_attachment=True, download_name=os.path.splitext(file.filename)[0] + '.txt')

        elif conversion_type == 'text-to-html':
            # Envuelve el texto en una estructura HTML básica
            with open(temp_input_path, 'r', encoding='utf-8') as f:
                content = f.read()
            html_content = f"""
<!DOCTYPE html>
<html>
<head>
    <title>{os.path.splitext(file.filename)[0]}</title>
    <meta charset="UTF-8">
</head>
<body>
    <pre>{content}</pre>
</body>
</html>
            """
            output_buffer = io.BytesIO(html_content.encode('utf-8'))
            output_buffer.seek(0)
            return send_file(output_buffer, mimetype='text/html', as_attachment=True, download_name=os.path.splitext(file.filename)[0] + '.html')

        elif conversion_type == 'text-to-json':
            # Intenta parsear el texto como una lista de líneas o un objeto simple
            with open(temp_input_path, 'r', encoding='utf-8') as f:
                content = f.read().strip()
            
            # Suponemos que cada línea es un ítem de una lista
            data = [line.strip() for line in content.split('\n') if line.strip()]
            
            json_content = json.dumps(data, indent=4, ensure_ascii=False)
            output_buffer = io.BytesIO(json_content.encode('utf-8'))
            output_buffer.seek(0)
            return send_file(output_buffer, mimetype='application/json', as_attachment=True, download_name=os.path.splitext(file.filename)[0] + '.json')

        elif conversion_type == 'pdf-to-csv':
            # Extrae el texto del PDF y lo convierte en un formato CSV básico (asumiendo que los datos están separados por espacios o tabulaciones)
            doc = fitz.open(temp_input_path)
            all_text = ""
            for page in doc:
                all_text += page.get_text() + "\n"
            doc.close()

            # Usar pandas para intentar leer los datos como una tabla
            from io import StringIO
            df = pd.read_csv(StringIO(all_text), sep='\s\s+', engine='python', skipinitialspace=True)
            
            output_buffer = io.BytesIO()
            df.to_csv(output_buffer, index=False, encoding='utf-8')
            output_buffer.seek(0)
            
            return send_file(output_buffer, mimetype='text/csv', as_attachment=True, download_name=os.path.splitext(file.filename)[0] + '.csv')


        else:
            return jsonify({"error": "Tipo de conversión no soportado."}), 400

    except Exception as e:
        print(f"Error en la conversión: {e}")
        return jsonify({"error": f"Error al procesar la conversión: {str(e)}"}), 500
    finally:
        # Limpia los archivos temporales
        if os.path.exists(temp_input_path):
            os.remove(temp_input_path)
        # Esto elimina el archivo de salida si fue creado
        if 'temp_output_path' in locals() and temp_output_path and os.path.exists(temp_output_path):
            os.remove(temp_output_path)
    

if __name__ == '__main__':
    app.run(host='0.0.0.0', debug=True, port=5000)
