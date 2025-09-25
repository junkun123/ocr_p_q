import flask
from flask import Flask, request, jsonify
from flask_cors import CORS
import subprocess
import os
import fitz
import google.generativeai as genai

app = Flask(__name__)
CORS(app)

UPLOAD_FOLDER = os.path.join(os.path.dirname(__file__), '..', 'web_integration', 'uploads')
if not os.path.exists(UPLOAD_FOLDER):
    os.makedirs(UPLOAD_FOLDER)

# Configura tu clave API de Gemini
# Es mejor usar una variable de entorno para mayor seguridad.
# Puedes configurarla en tu terminal: export GOOGLE_API_KEY='tu_clave'
# O pegarla directamente para propósitos de prueba.
genai.configure(api_key="AIzaSyD_nLuyOC6Vb3UjWpBFF19bnxvBjyGWMSc")

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

# --- Nuevo endpoint para preguntar a la IA ---
@app.route('/ask', methods=['POST'])
def ask_question():
    data = request.json
    pregunta = data.get('pregunta', '')
    texto_contexto = data.get('texto_extraido', '')

    if not pregunta or not texto_contexto:
        return jsonify({"success": False, "error": "Faltan datos (pregunta o texto_extraido)."}), 400

    try:
        model = genai.GenerativeModel('gemini-1.5-flash')
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
        
        # Verifica si el contenido fue bloqueado
        if not response.parts:
            # Si se bloquea, response.prompt_feedback tendrá información.
            # Aquí asumimos que el error es por contenido inseguro o no válido.
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
        # Esta línea imprimirá el error completo en tu terminal
        print(f"Error al interactuar con la IA: {e}")
        return jsonify({"success": False, "error": f"Error al interactuar con la IA. Revisa la terminal del servidor para más detalles."}), 500

if __name__ == '__main__':
    app.run(host='0.0.0.0', debug=True, port=5000)
