import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Link } from 'react-router-dom';
import './App.css'; 
import Profile from './Profile'; 

// --------------------------------------------------------------------------------------------------
// !! IMPORTANTE !! CAMBIA ESTA URL SIEMPRE QUE REINICIES NGROK (debe ser la que apunta a :5000)
// --------------------------------------------------------------------------------------------------
const NGROK_FLASK_URL = 'https://f9fa763b4ef3.ngrok-free.app'; 
// --------------------------------------------------------------------------------------------------

// Referencia global para el objeto de audio que se está reproduciendo
let currentAudio = null;

// Función global para detener la reproducción de voz
const stopSpeaking = () => {
  if (window.speechSynthesis) {
    window.speechSynthesis.cancel();
  }
  if (currentAudio) {
    currentAudio.pause();
    currentAudio = null;
  }
};

// Función para llamar al backend de TTS y reproducir el audio Base64
const speakTextFromBackend = async (textToSpeak, setLoadingState) => {
    if (!textToSpeak) {
        alert("No hay texto para leer.");
        setLoadingState(false);
        return;
    }

    try {
        const data = { text: textToSpeak };
        
        // 1. Llamar al endpoint de Flask /tts
        const response = await fetch(`${NGROK_FLASK_URL}/tts`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(data),
        });

        if (!response.ok) {
            throw new Error(`Error HTTP en la llamada a TTS! status: ${response.status}`);
        }

        const result = await response.json();
        
        if (!result.success || !result.audioData || !result.mimeType) {
            throw new Error(`La respuesta de TTS fue incompleta: ${result.error || 'datos faltantes'}`);
        }

        // 2. Crear el objeto de audio a partir del Base64
        const audioSrc = `data:${result.mimeType};base64,${result.audioData}`;
        
        const audio = new Audio(audioSrc);
        currentAudio = audio; 
        
        audio.onended = () => {
            setLoadingState(false);
            currentAudio = null; 
        };
        
        audio.onerror = (e) => {
            console.error('Error al reproducir el audio:', e);
            alert("Ocurrió un error al reproducir el audio decodificado.");
            setLoadingState(false);
            currentAudio = null;
        };

        // 3. Reproducir el audio
        await audio.play().catch(error => {
            if (error.name !== "AbortError") {
                console.error("Error al iniciar la reproducción:", error);
                alert(`Error al iniciar la reproducción: ${error.message}`);
            }
            setLoadingState(false);
            currentAudio = null;
        });

    } catch (error) {
        console.error('Error crítico en la función de voz (Flask/gTTS):', error);
        alert(`Error: ${error.message}. Asegúrate de que Flask esté ejecutándose y el endpoint /tts funcione correctamente.`);
        setLoadingState(false);
        currentAudio = null;
    }
};


// Componente para la ventana modal de la IA (Sin cambios)
const AIModal = ({ ocrText, onClose }) => {
  const [pregunta, setPregunta] = useState('');
  const [respuestaAI, setRespuestaAI] = useState('La respuesta de la IA aparecerá aquí...');
  const [loadingAI, setLoadingAI] = useState(false);
  const [loadingTTS, setLoadingTTS] = useState(false);
  const [lastAIResponseText, setLastAIResponseText] = useState('');
  
  useEffect(() => {
    return () => {
      stopSpeaking();
    };
  }, []);

  const askQuestion = async () => {
    stopSpeaking(); 
    setLoadingTTS(false); 

    if (!pregunta || !ocrText || ocrText === 'El texto extraído aparecerá aquí...' || ocrText === 'Procesando, por favor espera...') {
      setRespuestaAI("Por favor, extrae el texto de un documento primero.");
      return;
    }

    setLoadingAI(true);
    setRespuestaAI("La IA está pensando, por favor espera...");
    setLastAIResponseText(''); 

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
        setLastAIResponseText(result.respuesta); 
      } else {
        setRespuestaAI(`Error: ${result.error}`);
      }
    } catch (error) {
      setRespuestaAI(`Error de conexión con la IA: ${error}.`);
    } finally {
      setLoadingAI(false);
    }
  };
  
  const speakResponse = async () => {
    if (loadingTTS) {
        stopSpeaking(); 
        setLoadingTTS(false);
        return;
    }
    setLoadingTTS(true);
    await speakTextFromBackend(lastAIResponseText, setLoadingTTS);
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

// Componente de la página de OCR (Sin cambios)
const OCRPage = () => {
  const [file, setFile] = useState(null);
  const [ocrText, setOcrText] = useState('El texto extraído aparecerá aquí...');
  const [loading, setLoading] = useState(false);
  const [loadingOcrTTS, setLoadingOcrTTS] = useState(false); 
  const [isExpanded, setIsExpanded] = useState(false);
  const [showModal, setShowModal] = useState(false); 
  
  const speakOcrText = async () => {
    if (loadingOcrTTS) {
        stopSpeaking(); 
        setLoadingOcrTTS(false);
        return;
    }
    setLoadingOcrTTS(true);
    await speakTextFromBackend(ocrText, setLoadingOcrTTS);
  };
  
  useEffect(() => {
    if (loading) {
      stopSpeaking();
      setLoadingOcrTTS(false);
    }
  }, [loading]);

  const handleFileChange = (e) => {
    setFile(e.target.files[0]);
  };

  const uploadAndProcess = async () => {
    stopSpeaking(); 
    setLoadingOcrTTS(false); 
    
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
  
  const isOcrTextReady = ocrText.length > 0 && ocrText !== 'El texto extraído aparecerá aquí...' && !ocrText.startsWith('Procesando') && !ocrText.startsWith('Error');

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
        
        {isOcrTextReady && (
          <button 
            onClick={speakOcrText} 
            disabled={loading || !isOcrTextReady}
            className={`tts-button ${loadingOcrTTS ? 'tts-speaking' : ''}`}
          >
            {loadingOcrTTS ? '🛑 Detener Lectura' : '🔊 Escuchar Texto Extraído'}
          </button>
        )}
        
        <button 
          onClick={() => setShowModal(true)} 
          disabled={!isOcrTextReady}
          className="ask-ai-button"
        >
          Preguntar a la IA
        </button>

      </header>
      {showModal && <AIModal ocrText={ocrText} onClose={() => setShowModal(false)} />}
    </div>
  );
};

// Componente de la nueva página del conversor de archivos (ACTUALIZADO PARA MÚLTIPLES ARCHIVOS)
const FileConverterPage = () => {
  const [files, setFiles] = useState([]); // Ahora es una lista de archivos
  const [audioFile, setAudioFile] = useState(null); 
  const [conversionType, setConversionType] = useState('jpg-to-png');
  const [status, setStatus] = useState('Selecciona un archivo y un tipo de conversión.');
  const [loading, setLoading] = useState(false);
  const [convertedFileUrl, setConvertedFileUrl] = useState(null);

  const handleFileChange = (e) => {
    // Si es img-to-video, tomamos múltiples archivos
    if (conversionType === 'img-to-video') {
        setFiles(Array.from(e.target.files));
    } else {
        // Para todas las demás, solo tomamos el primer archivo
        setFiles(e.target.files.length > 0 ? [e.target.files[0]] : []);
    }
    setConvertedFileUrl(null);
  };
  
  const handleAudioFileChange = (e) => {
    setAudioFile(e.target.files.length > 0 ? e.target.files[0] : null);
  };

  const getFileExtension = (conversionType) => {
    switch(conversionType) {
        case 'jpg-to-png':
        case 'webp-to-png':
          return '.png';
        case 'png-to-jpg':
          return '.jpg';
        case 'pdf-to-word':
          return '.docx';
        case 'word-to-pdf':
          return '.pdf';
        case 'png-to-webp':
          return '.webp';
        case 'pdf-to-csv':
          return '.csv';
        case 'img-to-video': 
          return '.mp4';
        case 'video-to-audio': 
          return '.mp3';
        default:
          return '.bin';
    }
  };

  const isImgToVideo = conversionType === 'img-to-video';

  const handleConversion = async () => {
    if (files.length === 0) {
      setStatus("Por favor, selecciona uno o más archivos.");
      return;
    }
    
    if (isImgToVideo && files.length === 0) {
        setStatus("Para 'Imagen a Video', debes seleccionar al menos una imagen.");
        return;
    }
    
    if (!isImgToVideo && files.length > 1) {
        // En conversiones de archivo único, solo usamos el primero y advertimos.
        setStatus("Advertencia: Solo se procesará el primer archivo seleccionado. Usa 'Imagen a Video' para múltiples entradas.");
    }

    setLoading(true);
    setStatus("Convirtiendo archivo, por favor espera...");
    setConvertedFileUrl(null);

    const formData = new FormData();
    formData.append('type', conversionType);
    
    // Adjuntar archivos: Clave diferente para archivo único vs. múltiples
    if (isImgToVideo) {
        files.forEach(file => {
             // Clave 'files[]' para subir múltiples archivos
            formData.append('files[]', file);
        });
        if (audioFile) {
            formData.append('audio_file', audioFile); 
        }
    } else {
        // Clave 'file' para todas las demás conversiones (archivo único)
        formData.append('file', files[0]); 
    }
    

    try {
      const response = await fetch(`${NGROK_FLASK_URL}/convert`, {
        method: 'POST',
        body: formData,
      });

      if (response.status === 404) {
         setStatus(`Error 404: No se encontró el endpoint /convert. Verifica la URL.`);
         return;
      }

      if (!response.ok) {
        let errorText = await response.text();
        try {
            const errorJson = JSON.parse(errorText);
            errorText = errorJson.error || `Error HTTP! status: ${response.status}`;
        } catch (e) {
            errorText = `Error HTTP! status: ${response.status}`;
        }
        throw new Error(errorText);
      }
      
      const blob = await response.blob();
      
      const url = URL.createObjectURL(blob);
      setConvertedFileUrl(url);
      setStatus("¡Conversión exitosa! Haz clic en el enlace para descargar.");
      
    } catch (error) {
      setStatus(`Error en la conversión: ${error.message}.`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="container main-content">
      <header className="App-header">
        <h1>Convertidor de Archivos</h1>
        <p>Convierte tus documentos, imágenes y videos.</p>
        
        {/* SELECTOR DE TIPO DE CONVERSIÓN */}
        <div className="form-group">
          <label>Convertir a:</label>
          <select onChange={(e) => { setConversionType(e.target.value); setAudioFile(null); setFiles([]); }} value={conversionType}>
            <option value="jpg-to-png">JPG a PNG</option>
            <option value="png-to-jpg">PNG a JPG</option>
            <option value="png-to-webp">PNG a WEBP</option>
            <option value="webp-to-png">WEBP a PNG</option>
            <option value="pdf-to-word">PDF a DOCX (Word)</option>
            <option value="word-to-pdf">DOCX (Word) a PDF</option>
            <option value="pdf-to-csv">PDF a CSV (Extracción de Tablas)</option>
            <option value="img-to-video">Imágenes (Slideshow) a Video (MP4)</option>
            <option value="video-to-audio">Video (MP4/MOV) a Audio (MP3)</option>
          </select>
        </div>
        
        {/* INPUT DE ARCHIVO(S) PRINCIPAL(ES) */}
        <div className="form-group">
          <label>Archivo(s) principal(es):</label>
          {/* El atributo MULTIPLE solo se agrega si es img-to-video */}
          <input 
            type="file" 
            onChange={handleFileChange} 
            multiple={isImgToVideo}
            accept={isImgToVideo ? 'image/*' : '*/*'}
          />
          {files.length > 0 && <p className="note">Archivos seleccionados: {files.length}</p>}
        </div>
        
        {/* INPUT DE AUDIO OPCIONAL (SOLO PARA IMG-TO-VIDEO) */}
        {isImgToVideo && (
            <div className="form-group optional-file">
                <label>Audio opcional (MP3, WAV):</label>
                <input type="file" onChange={handleAudioFileChange} accept="audio/*" />
                <p className="note">Cada imagen dura 2 segundos. Si subes audio, el video se ajusta a su duración.</p>
            </div>
        )}
        
        <button onClick={handleConversion} disabled={loading}>
          {loading ? 'Convirtiendo...' : 'Convertir'}
        </button>
        <div className="status-box">
          <p>{status}</p>
          {convertedFileUrl && (
            <a 
              href={convertedFileUrl} 
              download={`archivo_convertido${getFileExtension(conversionType)}`} 
              className="download-link"
            >
              Descargar archivo convertido
            </a>
          )}
        </div>
      </header>
    </div>
  );
};


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
        <li>Convertidor de archivos (Slideshow de Fotos a Video) - **¡Agregado y en funcionamiento!**</li>
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