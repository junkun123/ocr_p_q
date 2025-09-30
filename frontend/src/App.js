import React, { useState } from 'react';
import { BrowserRouter as Router, Routes, Route, Link } from 'react-router-dom';
import './App.css'; 
import Profile from './Profile'; 

// Componente para la ventana modal de la IA
const AIModal = ({ ocrText, onClose }) => {
  const [pregunta, setPregunta] = useState('');
  const [respuestaAI, setRespuestaAI] = useState('La respuesta de la IA aparecerá aquí...');
  const [loadingAI, setLoadingAI] = useState(false);

  const askQuestion = async () => {
    if (!pregunta || !ocrText || ocrText === 'El texto extraído aparecerá aquí...' || ocrText === 'Procesando, por favor espera...') {
      setRespuestaAI("Por favor, extrae el texto de un documento primero.");
      return;
    }

    setLoadingAI(true);
    setRespuestaAI("La IA está pensando, por favor espera...");

    const data = {
      pregunta: pregunta,
      texto_extraido: ocrText
    };

    try {
      // **URL de ngrok para el servidor de Flask - ACTUALIZADA**
      const response = await fetch('https://ccade8a74c90.ngrok-free.app/ask', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(data),
      });

      if (response.status === 500) {
        setRespuestaAI("Error 500: El servidor ha encontrado un error interno. Por favor, revisa los logs de tu servidor de Flask para obtener más detalles.");
        return;
      }
      if (!response.ok) {
        throw new Error(`Error HTTP! status: ${response.status}`);
      }

      const result = await response.json();
      if (result.success) {
        setRespuestaAI(result.respuesta);
      } else {
        setRespuestaAI(`Error: ${result.error}`);
      }
    } catch (error) {
      setRespuestaAI(`Error de conexión con la IA: ${error}.`);
    } finally {
      setLoadingAI(false);
    }
  };

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
  const [showModal, setShowModal] = useState(false); // Nuevo estado para el modal

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
      // **URL de ngrok para el servidor de Flask - ACTUALIZADA**
      const response = await fetch('https://ccade8a74c90.ngrok-free.app/ocr', {
        method: 'POST',
        body: formData,
      });

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
  
  const displayedText = isExpanded ? ocrText : `${ocrText.substring(0, 500)}...`;
  const showButton = ocrText.length > 500;

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
        <button onClick={() => setShowModal(true)} disabled={ocrText === 'El texto extraído aparecerá aquí...' || loading}>
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
      // **URL de ngrok para el servidor de Flask - ACTUALIZADA**
      const response = await fetch('https://ccade8a74c90.ngrok-free.app/convert', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        throw new Error(`Error HTTP! status: ${response.status}`);
      }
      
      const blob = await response.blob();
      
      // Determina la extensión y el mimetype para la descarga
      let ext = '';
      let mime = '';
      
      switch(conversionType) {
        case 'jpg-to-png':
        case 'png-to-jpg':
          ext = conversionType.includes('png') ? '.png' : '.jpg';
          mime = conversionType.includes('png') ? 'image/png' : 'image/jpeg';
          break;
        case 'pdf-to-word':
          ext = '.docx';
          mime = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
          break;
        case 'word-to-pdf':
          ext = '.pdf';
          mime = 'application/pdf';
          break;
        default:
          ext = '.bin';
          mime = 'application/octet-stream';
      }

      // Crea un objeto File para la descarga
      const filename = file.name.split('.').slice(0, -1).join('.') + ext;
      
      // Crea un enlace de descarga
      const url = URL.createObjectURL(blob);
      setConvertedFileUrl(url);
      setStatus("¡Conversión exitosa! Haz clic en el enlace para descargar.");

      // Opcional: Si quieres forzar la descarga, podrías hacerlo aquí, pero la propiedad 'download' en <a> es más limpia.
      
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
