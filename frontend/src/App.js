import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Link, useLocation } from 'react-router-dom';
import './App.css'; 
import Profile from './Profile'; 

// --------------------------------------------------------------------------------------------------
// !! IMPORTANTE !! CAMBIA ESTA URL SIEMPRE QUE REINICIES NGROK (debe ser la que apunta a :5000)
// --------------------------------------------------------------------------------------------------
const NGROK_FLASK_URL = 'https://4b4ec1ec85c8.ngrok-free.app'; 
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


// Nuevo Componente para SOLO mostrar el texto OCR completo
const OCRTextModal = ({ ocrText, onClose }) => {
    // Estado para controlar la lectura de voz del texto OCR
    const [loadingTTS, setLoadingTTS] = useState(false);

    useEffect(() => {
        return () => {
            stopSpeaking();
        };
    }, []);

    const speakText = async () => {
        if (loadingTTS) {
            stopSpeaking(); 
            setLoadingTTS(false);
            return;
        }
        setLoadingTTS(true);
        await speakTextFromBackend(ocrText, setLoadingTTS);
    };

    return (
        <div className="modal-overlay">
            <div className="modal-content text-view-modal"> 
                <button className="modal-close-button" onClick={onClose}>&times;</button>
                <div className="section-container">
                    <h2>Texto Completo Extraído (OCR)</h2>
                    <div className="output-box-ocr-full">
                        <pre>{ocrText}</pre>
                    </div>
                    <button 
                        onClick={speakText} 
                        className={`tts-button ${loadingTTS ? 'tts-speaking' : ''}`}
                    >
                        {loadingTTS ? '🛑 Detener Lectura' : '🔊 Escuchar Texto Completo'}
                    </button>
                </div>
            </div>
        </div>
    );
};


// Componente de la página de OCR (Refactorizado para ser el "Chat")
const OCRPage = () => {
  const [file, setFile] = useState(null);
  // Combinamos ocrText, pregunta y respuesta en un historial de "chat"
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loadingOcrTTS, setLoadingOcrTTS] = useState(false); 
  // const [showModal, setShowModal] = useState(false); // Eliminado, ya no es necesario
  const [showFullOcrModal, setShowFullOcrModal] = useState(false); // NUEVO ESTADO
  const [ocrText, setOcrText] = useState('');
  const [preguntaChat, setPreguntaChat] = useState('');
  
  // Efecto para limpiar la voz al salir
  useEffect(() => {
    return () => {
      stopSpeaking();
    };
  }, []);

  const speakText = async (text) => {
    if (loadingOcrTTS) {
        stopSpeaking(); 
        setLoadingOcrTTS(false);
        return;
    }
    setLoadingOcrTTS(true);
    await speakTextFromBackend(text, setLoadingOcrTTS);
  };

  const handleFileChange = (e) => {
    setFile(e.target.files[0]);
    // Limpiamos el historial al subir nuevo archivo
    setHistory([]); 
    setOcrText(''); 
  };

  const uploadAndProcess = async () => {
    stopSpeaking(); 
    setLoadingOcrTTS(false); 
    
    if (!file) {
      alert("Por favor, selecciona un archivo.");
      return;
    }
    setLoading(true);
    setHistory([{ sender: 'system', text: `Subiendo y procesando ${file.name}...` }]);
    setOcrText('');

    const formData = new FormData();
    formData.append('file', file);

    try {
      const response = await fetch(`${NGROK_FLASK_URL}/ocr`, {
        method: 'POST',
        body: formData,
      });

      if (response.status === 404) {
        setHistory(prev => [...prev, { sender: 'error', text: `Error 404: No se encontró el endpoint /ocr. Por favor, verifica la URL de NGROK.` }]);
        return;
      }

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const result = await response.json();
      if (result.success) {
        setOcrText(result.text); // Guardamos el texto completo para el contexto de la IA
        setHistory([{ 
            sender: 'ai', 
            text: `Documento "${file.name}" procesado. El texto extraído está listo. Ahora puedes hacer preguntas sobre él en el cuadro de abajo.`,
            fullText: result.text // Opcional: para que se muestre el botón de "Ver Texto Completo"
        }]);
      } else {
        setHistory(prev => [...prev, { sender: 'error', text: `Error: ${result.error}` }]);
      }
    } catch (error) {
      setHistory(prev => [...prev, { sender: 'error', text: `Error de conexión: ${error.message}. Asegúrate de que el servidor de Flask esté corriendo.` }]);
    } finally {
      setLoading(false);
    }
  };

  const askAIChat = async (e) => {
    e.preventDefault();
    stopSpeaking(); 
    setLoadingOcrTTS(false); 

    const currentQuestion = preguntaChat.trim();
    if (!currentQuestion) return;

    if (!ocrText) {
      setHistory(prev => [...prev, { sender: 'error', text: "Por favor, extrae el texto de un documento primero." }]);
      setPreguntaChat('');
      return;
    }

    // 1. Añadir la pregunta del usuario
    setHistory(prev => [...prev, { sender: 'user', text: currentQuestion }]);
    setPreguntaChat(''); // Limpiar input
    setLoading(true);

    // 2. Mostrar mensaje de "pensando"
    const thinkingMessage = { sender: 'ai', text: 'La IA está pensando, por favor espera...', isThinking: true };
    setHistory(prev => [...prev, thinkingMessage]);

    const data = {
      pregunta: currentQuestion,
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

      let responseText = `Error al conectar con el backend. Revisa logs.`;
      if (response.ok) {
        const result = await response.json();
        responseText = result.success ? result.respuesta : `Error de IA: ${result.error}`;
      } else if (response.status === 404) {
        responseText = `Error 404: No se encontró el endpoint /ask. Verifica la URL de NGROK.`;
      } else {
        responseText = `Error HTTP (${response.status}): Fallo en la llamada a la IA.`;
      }

      // 3. Reemplazar el mensaje de "pensando" con la respuesta real
      setHistory(prev => {
        const newHistory = prev.filter(msg => !msg.isThinking);
        newHistory.push({ sender: 'ai', text: responseText });
        return newHistory;
      });

    } catch (error) {
      setHistory(prev => {
        const newHistory = prev.filter(msg => !msg.isThinking);
        newHistory.push({ sender: 'error', text: `Error de conexión con la IA: ${error.message}.` });
        return newHistory;
      });
    } finally {
      setLoading(false);
    }
  };


  return (
    <div className="ocr-chat-container">
      <div className="chat-header">
        <h2>{file ? file.name : "Extraer Texto"}</h2>
        <div className="file-upload-group">
            <label htmlFor="file-input" className="custom-file-upload">
                {file ? "Cambiar Archivo" : "Subir Archivo"}
            </label>
            <input id="file-input" type="file" onChange={handleFileChange} accept="image/*, .pdf" style={{display: 'none'}} />
            <button onClick={uploadAndProcess} disabled={loading || !file} className="process-button">
              {loading ? '...' : 'Extraer'}
            </button>
        </div>
      </div>
      
      <div className="chat-history-box">
        {history.length === 0 ? (
            <div className="chat-placeholder">
                <p>Comienza subiendo un documento (PDF o imagen) para extraer su texto.</p>
                <p>Una vez extraído, podrás preguntarle a la IA sobre su contenido.</p>
            </div>
        ) : (
            history.map((msg, index) => (
                <div key={index} className={`chat-message ${msg.sender}`}>
                    <div className="message-icon">
                        {msg.sender === 'user' ? '👤' : (msg.sender === 'ai' ? '✨' : '⚠️')}
                    </div>
                    <div className="message-content">
                        <pre>{msg.text}</pre>
                        {/* Botón para leer la respuesta de la IA */}
                        {msg.sender === 'ai' && !msg.isThinking && (
                            <button 
                                onClick={() => speakText(msg.text)} 
                                className={`chat-tts-button ${loadingOcrTTS ? 'tts-speaking' : ''}`}
                            >
                                {loadingOcrTTS ? '🛑' : '🔊'}
                            </button>
                        )}
                        {/* Botón para ver el texto completo de OCR */}
                        {msg.fullText && (
                            <button 
                                onClick={() => setShowFullOcrModal(true)} 
                                className="chat-view-ocr-button"
                            >
                                Ver Texto Completo (OCR)
                            </button>
                        )}
                    </div>
                </div>
            ))
        )}
        
      </div>
      
      <form className="chat-input-area" onSubmit={askAIChat}>
        <textarea
          rows="1"
          value={preguntaChat}
          onChange={(e) => setPreguntaChat(e.target.value)}
          placeholder={ocrText ? "Haz una pregunta sobre el texto extraído..." : "Extrae un texto para empezar a preguntar..."}
          disabled={!ocrText || loading}
        />
        <button type="submit" disabled={!preguntaChat.trim() || !ocrText || loading}>
          {loading ? '...' : 'Enviar'}
        </button>
      </form>

      {/* RENDERIZADO DEL NUEVO MODAL DE TEXTO COMPLETO */}
      {showFullOcrModal && <OCRTextModal ocrText={ocrText} onClose={() => setShowFullOcrModal(false)} />}
      
      {/* El antiguo modal de IA se puede renderizar aquí si decides no usar la interfaz de chat, o si quieres una función extra: */}
      {/* {showModal && <AIModal ocrText={ocrText} onClose={() => setShowModal(false)} />} */}
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
  
  // Limpiamos la voz si estamos en esta página
  useEffect(() => {
    stopSpeaking();
  }, []);


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
    <div className="container main-content converter-page">
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
  <div className="container features-page">
    <section className="section-container">
      <h2>Próximos Agregados</h2>
      <div className="collapsible-content">
        <ul>
          <li>Convertidor de archivos (Slideshow de Fotos a Video) - **¡Agregado y en funcionamiento!**</li>
          <li>Soporte para más idiomas (francés, alemán, etc.)</li>
        </ul>
      </div>
    </section>
  </div>
);


// Nuevo Componente Sidebar
const Sidebar = ({ isOpen, onClose }) => {
    const location = useLocation();

    const menuItems = [
        { path: "/", label: "✨ Extractor de Texto (Chat)" },
        { path: "/convertir-archivos", label: "📁 Convertir Archivos" },
        { path: "/proximos-agregados", label: "💡 Próximos agregados" },
        { path: "/conoceme", label: "👤 Conóceme" },
    ];
    
    return (
        <>
            <div className={`sidebar-overlay ${isOpen ? 'open' : ''}`} onClick={onClose}></div>
            <div className={`sidebar ${isOpen ? 'open' : ''}`}>
                <div className="sidebar-header">
                    <span className="sidebar-brand">AI Toolkit</span>
                    <button className="sidebar-close" onClick={onClose}>&times;</button>
                </div>
                <nav className="sidebar-nav">
                    {menuItems.map(item => (
                        <Link 
                            key={item.path} 
                            to={item.path} 
                            onClick={onClose}
                            className={location.pathname === item.path ? 'active' : ''}
                        >
                            {item.label}
                        </Link>
                    ))}
                </nav>
                <div className="sidebar-footer">
                    <p>Creado con React, Flask y /gTTS</p>
                </div>
            </div>
        </>
    );
};


function App() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const location = useLocation();
  
  // Limpiamos la voz y cerramos el menú si la ruta cambia
  useEffect(() => {
    stopSpeaking();
    setSidebarOpen(false);
  }, [location.pathname]);

  return (
    <div className="App">
        <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
        
        <div className={`content-wrapper ${sidebarOpen ? 'sidebar-open' : ''}`}>
            <header className="main-header">
                <button className="menu-toggle-btn" onClick={() => setSidebarOpen(!sidebarOpen)}>
                    ☰
                </button>
                <div className="header-title">
                    {location.pathname === '/' ? 'OCR - Extractor de Texto' : 
                      location.pathname === '/convertir-archivos' ? 'Convertidor de Archivos' :
                      location.pathname === '/proximos-agregados' ? 'Próximas Funcionalidades' :
                      'Conóceme'}
                </div>
                <div className="header-user-icon">👤</div> 
            </header>
          <Routes>
            <Route path="/" element={<OCRPage />} />
            <Route path="/convertir-archivos" element={<FileConverterPage />} />
            <Route path="/proximos-agregados" element={<FeaturesPage />} />
            <Route path="/conoceme" element={<AboutPage />} />
          </Routes>
        </div>
      </div>
  );
}

// Envuelve App con Router
const Root = () => (
  <Router>
    <App />
  </Router>
);

export default Root;