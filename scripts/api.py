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

app = Flask(__name__)
CORS(app)

# Crea una carpeta temporal para los archivos
UPLOAD_FOLDER = os.path.join(os.path.dirname(__file__), '..', 'web_integration', 'uploads')
if not os.path.exists(UPLOAD_FOLDER):
    os.makedirs(UPLOAD_FOLDER)

# Configura tu clave API de Gemini
genai.configure(api_key="AIzaSyC7Z_F1Kp4CpTby2mmjjighY6mxGIAiot8")

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
        model = genai.GenerativeModel('gemini-1.5-pro')
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

# --- NUEVO ENDPOINT PARA CONVERSIÓN DE ARCHIVOS ---
@app.route('/convert', methods=['POST'])
def convert_file():
    if 'file' not in request.files or 'type' not in request.form:
        return jsonify({"error": "Faltan datos (archivo o tipo de conversión)."}), 400

    file = request.files['file']
    conversion_type = request.form['type']
    
    # Crea un archivo temporal para guardar el archivo recibido
    temp_input_fd, temp_input_path = tempfile.mkstemp(suffix=os.path.splitext(file.filename)[1])
    file.save(temp_input_path)
    os.close(temp_input_fd)
    
    try:
        if conversion_type == 'jpg-to-png':
            img = Image.open(temp_input_path)
            output_buffer = io.BytesIO()
            img.save(output_buffer, format="PNG")
            output_buffer.seek(0)
            return send_file(output_buffer, mimetype='image/png', as_attachment=True, download_name=os.path.splitext(file.filename)[0] + '.png')
        
        elif conversion_type == 'png-to-jpg':
            img = Image.open(temp_input_path)
            rgb_img = img.convert('RGB')
            output_buffer = io.BytesIO()
            rgb_img.save(output_buffer, format="JPEG")
            output_buffer.seek(0)
            return send_file(output_buffer, mimetype='image/jpeg', as_attachment=True, download_name=os.path.splitext(file.filename)[0] + '.jpg')

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
        if 'temp_output_path' in locals() and os.path.exists(temp_output_path):
            os.remove(temp_output_path)
    

if __name__ == '__main__':
    app.run(host='0.0.0.0', debug=True, port=5000)
