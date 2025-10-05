import React, { useState } from 'react';
import { BrowserRouter as Router, Routes, Route, Link } from 'react-router-dom';
import './App.css'; // Importa el archivo CSS separado
import Profile from './Profile'; 

// --------------------------------------------------------------------------------------------------
// !! IMPORTANTE !! CAMBIA ESTA URL SIEMPRE QUE REINICIES NGROK (debe ser la que apunta a :5000)
// --------------------------------------------------------------------------------------------------
const NGROK_FLASK_URL = 'https://e3a29c624b60.ngrok-free.app'; 
// --------------------------------------------------------------------------------------------------

/**
 * Función de utilidad que espera a que las voces del SpeechSynthesis estén cargadas.
 * Esto soluciona el error 'synthesis-failed' que ocurre cuando se intenta usar getVoices()
 * antes de que el navegador esté listo.
 */
const loadVoices = () => {
  return new Promise(resolve => {
    // Si las voces ya están cargadas, resuelve inmediatamente
    let voices = window.speechSynthesis.getVoices();
    if (voices.length) {
      resolve(voices);
      return;
    }
    
    // Si no están cargadas, espera el evento 'voiceschanged'
    window.speechSynthesis.onvoiceschanged = () => {
      resolve(window.speechSynthesis.getVoices());
    };
    
    // Fallback: Si el evento no se dispara inmediatamente, espera 1 segundo
    setTimeout(() => {
        voices = window.speechSynthesis.getVoices();
        if (voices.length) {
            resolve(voices);
        } else {
            console.warn("Las voces de Speech Synthesis no se pudieron cargar rápidamente. Retornando vacío.");
            resolve([]);
        }
    }, 1000); 
  });
};


// Componente para la ventana modal de la IA
const AIModal = ({ ocrText, onClose }) => {
  const [pregunta, setPregunta] = useState('');
  const [respuestaAI, setRespuestaAI] = useState('La respuesta de la IA aparecerá aquí...');
  const [loadingAI, setLoadingAI] = useState(false);
  const [loadingTTS, setLoadingTTS] = useState(false);
  const [lastAIResponseText, setLastAIResponseText] = useState('');
  
  // Detiene la síntesis de voz si se está reproduciendo
  const stopSpeaking = () => {
    if (window.speechSynthesis) {
      window.speechSynthesis.cancel();
      setLoadingTTS(false);
    }
  };

  const askQuestion = async () => {
    // Primero, detén cualquier reproducción de voz anterior
    stopSpeaking(); 
    
    if (!pregunta || !ocrText || ocrText === 'El texto extraído aparecerá aquí...' || ocrText === 'Procesando, por favor espera...') {
      setRespuestaAI("Por favor, extrae el texto de un documento primero.");
      return;
    }

    setLoadingAI(true);
    setRespuestaAI("La IA está pensando, por favor espera...");
    setLastAIResponseText(''); // Resetea el texto anterior

    const data = {
      pregunta: pregunta,
      texto_extraido: ocrText
    };

    try {
      const response = await fetch(`${NGROK_FLASK_URL}/ask`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(data),
      });

      if (response.status === 500) {
        setRespuestaAI("Error 500: El servidor ha encontrado un error interno. Revisa los logs de tu servidor de Flask.");
        return;
      }
      if (response.status === 404) {
         setRespuestaAI(`Error 404: No se encontró el endpoint /ask. Verifica la URL de NGROK (${NGROK_FLASK_URL}).`);
         return;
      }
      if (!response.ok) {
        throw new Error(`Error HTTP! status: ${response.status}`);
      }

      const result = await response.json();
      if (result.success) {
        setRespuestaAI(result.respuesta);
        setLastAIResponseText(result.respuesta); // Guarda el texto para TTS
      } else {
        setRespuestaAI(`Error: ${result.error}`);
      }
    } catch (error) {
      setRespuestaAI(`Error de conexión con la IA: ${error}.`);
    } finally {
      setLoadingAI(false);
    }
  };
  
  // Función para usar la API nativa del navegador (SpeechSynthesisUtterance)
  const speakResponse = async () => {
    if (!window.speechSynthesis || !lastAIResponseText) {
      // Usar un modal en lugar de alert() sería mejor en un entorno real
      alert("Tu navegador no soporta la síntesis de voz, o no hay texto para leer.");
      return;
    }

    if (loadingTTS) {
        // Si ya está leyendo, lo cancelamos y reseteamos
        stopSpeaking();
        return;
    }

    setLoadingTTS(true); // Indica que la síntesis está comenzando

    try {
        // 1. Carga las voces esperando la respuesta asíncrona
        const voices = await loadVoices();
        
        if (voices.length === 0) {
          throw new Error("No hay voces de TTS disponibles en tu sistema operativo.");
        }
        
        const utterance = new SpeechSynthesisUtterance(lastAIResponseText);
        
        // 2. Selecciona la mejor voz (español o la primera disponible)
        const spanishVoice = voices.find(voice => voice.lang.startsWith('es'));
        
        if (spanishVoice) {
          utterance.voice = spanishVoice;
          utterance.lang = spanishVoice.lang; 
        } else {
          // Fallback a la primera voz y un hint de idioma español
          utterance.voice = voices[0];
          utterance.lang = 'es-ES'; 
          console.warn("No se encontró una voz en español. Usando la voz por defecto.");
        }

        utterance.onstart = () => setLoadingTTS(true);
        utterance.onend = () => setLoadingTTS(false);
        utterance.onerror = (event) => {
            console.error('SpeechSynthesis Utterance Error:', event);
            // Usar un modal en lugar de alert() sería mejor en un entorno real
            alert(`Ocurrió un error en la síntesis de voz: ${event.error}. Esto puede deberse a la falta de voces en español. Intenta recargar la página o verificar la configuración de voces de tu sistema operativo.`);
            setLoadingTTS(false);
        };

        window.speechSynthesis.speak(utterance);

    } catch (error) {
        console.error('Error al intentar hablar:', error);
        // Usar un modal en lugar de alert() sería mejor en un entorno real
        alert(`Error crítico en la función de voz: ${error.message}`);
        setLoadingTTS(false);
    }
  };

  const isResponseReady = lastAIResponseText.length > 0;

  return (
    <div className="modal-overlay">
      <div className="modal-content">
        <button className="modal-close-button" onClick={onClose}>&times;</button>
        <div className="section-container">
          <h2>Pregúntale a la IA</h2>
          <p>Haz preguntas relacionadas con el texto extraído.</p>
          <div className="form-group-ai">
            <textarea
              className="ai-input"
              rows="3"
              value={pregunta}
              onChange={(e) => setPregunta(e.target.value)}
              placeholder="Escribe tu pregunta aquí..."
            />
            <button onClick={askQuestion} disabled={loadingAI}>
              {loadingAI ? 'Pensando...' : 'Preguntar'}
            </button>
          </div>
          <div className="output-box-ai">
            <pre>{respuestaAI}</pre>
          </div>
          <button 
            onClick={speakResponse} 
            disabled={!isResponseReady}
            className={`tts-button ${loadingTTS ? 'tts-speaking' : ''}`}
          >
            {loadingTTS ? '🛑 Detener Lectura' : '🔊 Escuchar Respuesta'}
          </button>
        </div>
      </div>
    </div>
  );
};

// Componente de la página de OCR
const OCRPage = () => {
  const [file, setFile] = useState(null);
  const [ocrText, setOcrText] = useState('El texto extraído aparecerá aquí...');
  const [loading, setLoading] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [showModal, setShowModal] = useState(false); 

  const handleFileChange = (e) => {
    setFile(e.target.files[0]);
  };

  const uploadAndProcess = async () => {
    if (!file) {
      setOcrText("Por favor, selecciona un archivo.");
      return;
    }
    setLoading(true);
    setOcrText("Procesando, por favor espera...");
    setIsExpanded(false);

    const formData = new FormData();
    formData.append('file', file);

    try {
      const response = await fetch(`${NGROK_FLASK_URL}/ocr`, {
        method: 'POST',
        body: formData,
      });

      if (response.status === 404) {
         setOcrText(`Error 404: No se encontró el endpoint /ocr. Por favor, verifica que la URL de NGROK (${NGROK_FLASK_URL}) sea correcta y que Flask esté ejecutándose.`);
         return;
      }

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const result = await response.json();
      if (result.success) {
        setOcrText(result.text);
      } else {
        setOcrText(`Error: ${result.error}`);
      }
    } catch (error) {
      setOcrText(`Error de conexión: ${error}. Asegúrate de que el servidor de Flask esté corriendo.`);
    } finally {
      setLoading(false);
    }
  };
  
  const displayedText = isExpanded ? ocrText : `${ocrText.substring(0, 500)}${ocrText.length > 500 ? '...' : ''}`;
  const showButton = ocrText.length > 500 && ocrText !== 'El texto extraído aparecerá aquí...' && !loading;

  return (
    <div className="container main-content">
      <header className="App-header">
        <h1>OCR - Lector de Documentos</h1>
        <p>Sube un documento para extraer el texto.</p>
        <div className="form-group">
          <input type="file" onChange={handleFileChange} accept="image/*, .pdf" />
        </div>
        <button onClick={uploadAndProcess} disabled={loading}>
          {loading ? 'Procesando...' : 'Procesar Documento'}
        </button>
        <div className="output-box">
          <pre>{displayedText}</pre>
          {showButton && (
            <button onClick={() => setIsExpanded(!isExpanded)} className="expand-button">
              {isExpanded ? 'Mostrar menos' : 'Mostrar más'}
            </button>
          )}
        </div>
        
        {/* Botón para abrir el modal */}
        <button onClick={() => setShowModal(true)} disabled={ocrText === 'El texto extraído aparecerá aquí...' || loading || ocrText.startsWith('Error')}>
          Preguntar a la IA
        </button>

      </header>
      {/* Muestra el modal si showModal es verdadero */}
      {showModal && <AIModal ocrText={ocrText} onClose={() => setShowModal(false)} />}
    </div>
  );
};

// Componente de la nueva página del conversor de archivos
const FileConverterPage = () => {
  const [file, setFile] = useState(null);
  const [conversionType, setConversionType] = useState('jpg-to-png');
  const [status, setStatus] = useState('Selecciona un archivo y un tipo de conversión.');
  const [loading, setLoading] = useState(false);
  const [convertedFileUrl, setConvertedFileUrl] = useState(null);

  const handleFileChange = (e) => {
    setFile(e.target.files[0]);
    setConvertedFileUrl(null);
  };

  const handleConversion = async () => {
    if (!file) {
      setStatus("Por favor, selecciona un archivo.");
      return;
    }

    setLoading(true);
    setStatus("Convirtiendo archivo, por favor espera...");
    setConvertedFileUrl(null);

    const formData = new FormData();
    formData.append('file', file);
    formData.append('type', conversionType);

    try {
      const response = await fetch(`${NGROK_FLASK_URL}/convert`, {
        method: 'POST',
        body: formData,
      });

      if (response.status === 404) {
         setStatus(`Error 404: No se encontró el endpoint /convert. Por favor, verifica que la URL de NGROK (${NGROK_FLASK_URL}) sea correcta y que Flask esté ejecutándose.`);
         return;
      }

      if (!response.ok) {
        throw new Error(`Error HTTP! status: ${response.status}`);
      }
      
      const blob = await response.blob();
      
      // Determina la extensión para la descarga
      let ext = '';
      
      switch(conversionType) {
        case 'jpg-to-png':
        case 'png-to-jpg':
          ext = conversionType.includes('png') ? '.png' : '.jpg';
          break;
        case 'pdf-to-word':
          ext = '.docx';
          break;
        case 'word-to-pdf':
          ext = '.pdf';
          break;
        default:
          ext = '.bin';
      }

      // Crea un enlace de descarga
      const url = URL.createObjectURL(blob);
      setConvertedFileUrl(url);
      setStatus("¡Conversión exitosa! Haz clic en el enlace para descargar.");
      
    } catch (error) {
      setStatus(`Error en la conversión: ${error}. Asegúrate de que el servidor de Flask tenga un endpoint '/convert' y que las bibliotecas estén instaladas.`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="container main-content">
      <header className="App-header">
        <h1>Convertidor de Archivos</h1>
        <p>Convierte tus documentos e imágenes a diferentes formatos.</p>
        <div className="form-group">
          <input type="file" onChange={handleFileChange} />
        </div>
        <div className="form-group">
          <label>Convertir a:</label>
          <select onChange={(e) => setConversionType(e.target.value)} value={conversionType}>
            <option value="jpg-to-png">JPG a PNG</option>
            <option value="png-to-jpg">PNG a JPG</option>
            <option value="pdf-to-word">PDF a DOCX (Word)</option>
            <option value="word-to-pdf">DOCX (Word) a PDF</option>
          </select>
        </div>
        <button onClick={handleConversion} disabled={loading}>
          {loading ? 'Convirtiendo...' : 'Convertir'}
        </button>
        <div className="status-box">
          <p>{status}</p>
          {convertedFileUrl && (
            <a href={convertedFileUrl} download={`archivo_convertido${conversionType.includes('png') ? '.png' : conversionType.includes('jpg') ? '.jpg' : conversionType.includes('word') ? '.docx' : '.pdf'}`} className="download-link">
              Descargar archivo convertido
            </a>
          )}
        </div>
      </header>
    </div>
  );
};

// ... Resto de los componentes (AboutPage, FeaturesPage, App) ...

const AboutPage = () => (
  <div className="container about-me">
    <Profile />
  </div>
);

const FeaturesPage = () => (
  <section className="section-container">
    <h2>Próximos Agregados</h2>
    <div className="collapsible-content">
      <ul>
        <li>Convertidor de archivos (JPG, PNG, PDF, Word) - **¡Agregado y en funcionamiento!**</li>
        <li>Soporte para más idiomas (francés, alemán, etc.)</li>
      </ul>
    </div>
  </section>
);

function App() {
  const [navOpen, setNavOpen] = useState(false);

  return (
    <Router>
      <div className="App">
        <nav className="navbar">
          <div className="nav-brand">OCR App</div>
          <button className="menu-toggle" onClick={() => setNavOpen(!navOpen)}>
            {navOpen ? 'Cerrar' : 'Menú'}
          </button>
          <div className={`nav-links ${navOpen ? 'open' : ''}`}>
            <Link to="/">Extractor de Texto</Link>
            <Link to="/convertir-archivos">Convertir Archivos</Link>
            <Link to="/proximos-agregados">Próximos agregados</Link>
            <Link to="/conoceme">Conóceme</Link>
          </div>
        </nav>
        <div className="content-wrapper">
          <Routes>
            <Route path="/" element={<OCRPage />} />
            <Route path="/convertir-archivos" element={<FileConverterPage />} />
            <Route path="/proximos-agregados" element={<FeaturesPage />} />
            <Route path="/conoceme" element={<AboutPage />} />
          </Routes>
        </div>
      </div>
    </Router>
  );
}

export default App;