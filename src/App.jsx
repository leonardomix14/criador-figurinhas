import React, { useState, useRef, useEffect } from 'react';
import { 
  Upload, Wand2, Type, Crop, Undo, 
  ImagePlus, Download, Film, Trash2, Settings, AlertCircle 
} from 'lucide-react';

const App = () => {
  const canvasRef = useRef(null);
  const fileInputRef = useRef(null);
  
  // States
  const [imageLoaded, setImageLoaded] = useState(false);
  const [history, setHistory] = useState([]);
  const [frames, setFrames] = useState([]);
  const [currentTool, setCurrentTool] = useState('wand'); // 'wand', 'text'
  const [message, setMessage] = useState('');
  
  // Tool Settings
  const [tolerance, setTolerance] = useState(30);
  const [contiguous, setContiguous] = useState(false);
  const [textInput, setTextInput] = useState('Sua Frase');
  const [textColor, setTextColor] = useState('#ffffff');
  const [textSize, setTextSize] = useState(48);
  const [textOutline, setTextOutline] = useState(true);

  // Status
  const [isExporting, setIsExporting] = useState(false);

  useEffect(() => {
    // Clear message after 3 seconds
    if (message) {
      const t = setTimeout(() => setMessage(''), 3000);
      return () => clearTimeout(t);
    }
  }, [message]);

  const showMessage = (msg) => setMessage(msg);

  const saveHistory = () => {
    if (!canvasRef.current) return;
    const dataUrl = canvasRef.current.toDataURL();
    setHistory((prev) => {
      const newHist = [...prev, dataUrl];
      // Keep only last 10 states
      if (newHist.length > 10) newHist.shift();
      return newHist;
    });
  };

  const undo = () => {
    if (history.length <= 1) return;
    const prevHistory = [...history];
    prevHistory.pop(); // remove current state
    const previousState = prevHistory[prevHistory.length - 1];
    
    const img = new Image();
    img.onload = () => {
      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d');
      canvas.width = img.width;
      canvas.height = img.height;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0);
      setHistory(prevHistory);
    };
    img.src = previousState;
  };

  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d');
        
        // Resize if too large, max initial size 800
        let w = img.width;
        let h = img.height;
        if (w > 800 || h > 800) {
          const ratio = Math.min(800 / w, 800 / h);
          w *= ratio;
          h *= ratio;
        }
        
        canvas.width = w;
        canvas.height = h;
        ctx.clearRect(0, 0, w, h);
        ctx.drawImage(img, 0, 0, w, h);
        
        setImageLoaded(true);
        setHistory([canvas.toDataURL()]);
        showMessage('Imagem carregada com sucesso!');
      };
      img.src = event.target.result;
    };
    reader.readAsDataURL(file);
  };

  const processMagicWand = (startX, startY) => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    const w = canvas.width;
    const h = canvas.height;
    const imageData = ctx.getImageData(0, 0, w, h);
    const data = imageData.data;

    const targetPos = (startY * w + startX) * 4;
    const targetR = data[targetPos];
    const targetG = data[targetPos + 1];
    const targetB = data[targetPos + 2];
    const targetA = data[targetPos + 3];

    if (targetA === 0) return; // Já é transparente

    const threshold = (tolerance / 100) * 441.67; // Max rgb distance

    if (!contiguous) {
      // Global removal
      for (let i = 0; i < data.length; i += 4) {
        if (data[i + 3] === 0) continue;
        const distance = Math.sqrt(
          Math.pow(data[i] - targetR, 2) +
          Math.pow(data[i + 1] - targetG, 2) +
          Math.pow(data[i + 2] - targetB, 2)
        );
        if (distance <= threshold) {
          data[i + 3] = 0;
        }
      }
    } else {
      // Flood Fill (Contiguous)
      const visited = new Uint8Array(w * h);
      const stack = [[startX, startY]];
      
      while (stack.length > 0) {
        const [x, y] = stack.pop();
        const vIdx = y * w + x;
        
        if (x < 0 || y < 0 || x >= w || y >= h || visited[vIdx]) continue;
        visited[vIdx] = 1;

        const idx = vIdx * 4;
        if (data[idx + 3] === 0) continue;

        const distance = Math.sqrt(
          Math.pow(data[idx] - targetR, 2) +
          Math.pow(data[idx + 1] - targetG, 2) +
          Math.pow(data[idx + 2] - targetB, 2)
        );

        if (distance <= threshold) {
          data[idx + 3] = 0; // Transparente
          stack.push([x + 1, y]);
          stack.push([x - 1, y]);
          stack.push([x, y + 1]);
          stack.push([x, y - 1]);
        }
      }
    }

    ctx.putImageData(imageData, 0, 0);
    saveHistory();
  };

  const processAddText = (x, y) => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    
    ctx.font = `bold ${textSize}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    
    if (textOutline) {
      ctx.lineWidth = textSize * 0.15;
      ctx.strokeStyle = '#000000';
      ctx.strokeText(textInput, x, y);
    }
    
    ctx.fillStyle = textColor;
    ctx.fillText(textInput, x, y);
    
    saveHistory();
  };

  const handleCanvasClick = (e) => {
    if (!imageLoaded) return;
    
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    
    // Calcula a proporção caso o canvas esteja redimensionado no CSS
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    
    const x = Math.floor((e.clientX - rect.left) * scaleX);
    const y = Math.floor((e.clientY - rect.top) * scaleY);

    if (currentTool === 'wand') {
      processMagicWand(x, y);
    } else if (currentTool === 'text') {
      processAddText(x, y);
    }
  };

  const formatForWhatsApp = () => {
    if (!imageLoaded) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imageData.data;
    
    let minX = canvas.width, minY = canvas.height, maxX = 0, maxY = 0;
    let found = false;
    
    // Find bounds of non-transparent pixels
    for (let y = 0; y < canvas.height; y++) {
      for (let x = 0; x < canvas.width; x++) {
        if (data[(y * canvas.width + x) * 4 + 3] > 0) {
          if (x < minX) minX = x;
          if (y < minY) minY = y;
          if (x > maxX) maxX = x;
          if (y > maxY) maxY = y;
          found = true;
        }
      }
    }
    
    if (!found) {
      showMessage('A imagem está vazia ou totalmente transparente.');
      return; 
    }

    const contentW = maxX - minX + 1;
    const contentH = maxY - minY + 1;
    
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = contentW;
    tempCanvas.height = contentH;
    const tempCtx = tempCanvas.getContext('2d');
    tempCtx.putImageData(ctx.getImageData(minX, minY, contentW, contentH), 0, 0);

    // Formato exato do WhatsApp
    canvas.width = 512;
    canvas.height = 512;
    ctx.clearRect(0, 0, 512, 512);

    const pad = 24;
    const maxW = 512 - pad * 2;
    const maxH = 512 - pad * 2;
    const ratio = Math.min(maxW / contentW, maxH / contentH);
    const finalW = contentW * ratio;
    const finalH = contentH * ratio;

    const dx = (512 - finalW) / 2;
    const dy = (512 - finalH) / 2;

    ctx.drawImage(tempCanvas, 0, 0, contentW, contentH, dx, dy, finalW, finalH);
    saveHistory();
    showMessage('Formatado para WhatsApp (512x512)!');
  };

  const addFrame = () => {
    if (!imageLoaded) return;
    const dataUrl = canvasRef.current.toDataURL('image/png');
    setFrames([...frames, dataUrl]);
    showMessage('Quadro adicionado à animação!');
  };

  const removeFrame = (index) => {
    const newFrames = frames.filter((_, i) => i !== index);
    setFrames(newFrames);
  };

  const downloadPNG = () => {
    if (!imageLoaded) return;
    const link = document.createElement('a');
    link.download = 'sticker-whatsapp.png';
    link.href = canvasRef.current.toDataURL('image/png');
    link.click();
  };

  const downloadGIF = async () => {
    if (frames.length === 0) {
      showMessage('Adicione quadros para criar a animação.');
      return;
    }
    setIsExporting(true);
    
    try {
      // Dynamic load of gif.js
      if (!window.GIF) {
        await new Promise((resolve, reject) => {
          const script = document.createElement('script');
          script.src = 'https://cdn.jsdelivr.net/npm/gif.js@0.2.0/dist/gif.js';
          script.onload = resolve;
          script.onerror = reject;
          document.head.appendChild(script);
        });
      }

      const gif = new window.GIF({
        workers: 2,
        quality: 10,
        width: 512,
        height: 512,
        transparent: 'rgba(0,0,0,0)',
        workerScript: 'https://cdn.jsdelivr.net/npm/gif.js@0.2.0/dist/gif.worker.js'
      });

      for (const frameUrl of frames) {
        const img = new Image();
        img.src = frameUrl;
        await new Promise(r => img.onload = r);
        
        // Garantir que os frames pro gif estejam em 512x512
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = 512;
        tempCanvas.height = 512;
        const tCtx = tempCanvas.getContext('2d');
        tCtx.drawImage(img, 0, 0, 512, 512);
        
        gif.addFrame(tempCanvas, { delay: 150, copy: true });
      }

      gif.on('finished', function(blob) {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'sticker-animado.gif';
        a.click();
        setIsExporting(false);
        showMessage('GIF Exportado!');
      });

      gif.render();
    } catch (error) {
      console.error(error);
      setIsExporting(false);
      showMessage('Falha ao exportar GIF. Tentando formato nativo (WebM)...');
      exportWebM();
    }
  };

  const exportWebM = async () => {
    if (frames.length === 0) return;
    setIsExporting(true);
    
    try {
      const tempCanvas = document.createElement('canvas');
      tempCanvas.width = 512;
      tempCanvas.height = 512;
      const ctx = tempCanvas.getContext('2d');
      const stream = tempCanvas.captureStream(0);
      const recorder = new MediaRecorder(stream, { mimeType: 'video/webm; codecs=vp9' });
      const chunks = [];
      
      recorder.ondataavailable = e => chunks.push(e.data);
      recorder.onstop = () => {
        const blob = new Blob(chunks, { type: 'video/webm' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'sticker-animado.webm';
        a.click();
        setIsExporting(false);
      };

      recorder.start();

      for (const frameUrl of frames) {
        const img = new Image();
        img.src = frameUrl;
        await new Promise(r => img.onload = r);
        ctx.clearRect(0, 0, 512, 512);
        ctx.drawImage(img, 0, 0, 512, 512);
        stream.getVideoTracks()[0].requestFrame();
        await new Promise(r => setTimeout(r, 150));
      }
      recorder.stop();
    } catch (e) {
      console.error(e);
      showMessage('Erro ao exportar vídeo.');
      setIsExporting(false);
    }
  };

  const checkeredBg = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='20' height='20'%3E%3Crect width='10' height='10' fill='%23e5e7eb'/%3E%3Crect x='10' y='10' width='10' height='10' fill='%23e5e7eb'/%3E%3C/svg%3E")`;

  return (
    <div className="min-h-screen bg-neutral-900 text-neutral-100 font-sans selection:bg-indigo-500 selection:text-white pb-10">
      {/* Header */}
      <header className="bg-neutral-950 border-b border-neutral-800 p-4 shadow-sm sticky top-0 z-10">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-500 flex items-center justify-center shadow-lg">
              <Wand2 className="w-5 h-5 text-white" />
            </div>
            <h1 className="text-xl font-bold tracking-tight text-white">StickerCraft <span className="font-medium text-neutral-400">Pro</span></h1>
          </div>
          
          <div className="flex gap-2">
            <button 
              onClick={() => fileInputRef.current?.click()}
              className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded-md font-medium transition-colors text-sm"
            >
              <Upload className="w-4 h-4" />
              Carregar Imagem
            </button>
            <input 
              type="file" 
              ref={fileInputRef} 
              onChange={handleFileUpload} 
              accept="image/*" 
              className="hidden" 
            />
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-6xl mx-auto mt-6 grid grid-cols-1 lg:grid-cols-4 gap-6 px-4">
        
        {/* Sidebar Tools */}
        <aside className="lg:col-span-1 space-y-4">
          <div className="bg-neutral-800 rounded-xl p-4 border border-neutral-700 shadow-md">
            <h2 className="text-xs font-semibold text-neutral-400 uppercase tracking-wider mb-3">Ferramentas</h2>
            
            <div className="grid grid-cols-2 gap-2 mb-4">
              <button 
                onClick={() => setCurrentTool('wand')}
                className={`flex flex-col items-center gap-2 p-3 rounded-lg border transition-all ${currentTool === 'wand' ? 'bg-indigo-500/20 border-indigo-500 text-indigo-400' : 'bg-neutral-900 border-neutral-700 text-neutral-400 hover:bg-neutral-800 hover:text-white'}`}
              >
                <Wand2 className="w-5 h-5" />
                <span className="text-xs font-medium">Remover Fundo</span>
              </button>
              
              <button 
                onClick={() => setCurrentTool('text')}
                className={`flex flex-col items-center gap-2 p-3 rounded-lg border transition-all ${currentTool === 'text' ? 'bg-indigo-500/20 border-indigo-500 text-indigo-400' : 'bg-neutral-900 border-neutral-700 text-neutral-400 hover:bg-neutral-800 hover:text-white'}`}
              >
                <Type className="w-5 h-5" />
                <span className="text-xs font-medium">Adicionar Texto</span>
              </button>
            </div>

            {/* Tool Specific Settings */}
            <div className="bg-neutral-900/50 p-3 rounded-lg border border-neutral-800 mb-4 min-h-[160px]">
              {currentTool === 'wand' && (
                <div className="space-y-4 animate-in fade-in">
                  <div className="flex items-center gap-2 text-sm text-neutral-300 font-medium mb-2">
                    <Settings className="w-4 h-4 text-indigo-400" />
                    Ajustes da Varinha
                  </div>
                  <div>
                    <label className="text-xs text-neutral-400 flex justify-between mb-1">
                      Tolerância <span className="text-indigo-400 font-mono">{tolerance}%</span>
                    </label>
                    <input 
                      type="range" 
                      min="0" max="100" 
                      value={tolerance} 
                      onChange={(e) => setTolerance(e.target.value)}
                      className="w-full accent-indigo-500"
                    />
                  </div>
                  <label className="flex items-center gap-2 text-xs text-neutral-300 cursor-pointer group">
                    <input 
                      type="checkbox" 
                      checked={contiguous} 
                      onChange={(e) => setContiguous(e.target.checked)}
                      className="rounded border-neutral-600 text-indigo-500 focus:ring-indigo-500/30 bg-neutral-800"
                    />
                    <span className="group-hover:text-white transition-colors">Apenas áreas conectadas</span>
                  </label>
                  <p className="text-[10px] text-neutral-500 mt-2 italic leading-tight">
                    Dica: Clique na cor da imagem que deseja transformar em transparente.
                  </p>
                </div>
              )}

              {currentTool === 'text' && (
                <div className="space-y-3 animate-in fade-in">
                  <div className="flex items-center gap-2 text-sm text-neutral-300 font-medium mb-2">
                    <Type className="w-4 h-4 text-indigo-400" />
                    Opções de Texto
                  </div>
                  <input 
                    type="text" 
                    value={textInput} 
                    onChange={(e) => setTextInput(e.target.value)}
                    placeholder="Digite aqui..."
                    className="w-full bg-neutral-950 border border-neutral-700 rounded-md p-2 text-sm text-white focus:outline-none focus:border-indigo-500"
                  />
                  <div className="flex gap-2 items-center">
                    <input 
                      type="color" 
                      value={textColor} 
                      onChange={(e) => setTextColor(e.target.value)}
                      className="w-8 h-8 rounded cursor-pointer bg-transparent border-0 p-0"
                    />
                    <input 
                      type="number" 
                      value={textSize} 
                      onChange={(e) => setTextSize(e.target.value)}
                      className="w-16 bg-neutral-950 border border-neutral-700 rounded-md p-1 text-sm text-white focus:outline-none focus:border-indigo-500 text-center"
                    />
                    <span className="text-xs text-neutral-500">px</span>
                  </div>
                  <label className="flex items-center gap-2 text-xs text-neutral-300 cursor-pointer">
                    <input 
                      type="checkbox" 
                      checked={textOutline} 
                      onChange={(e) => setTextOutline(e.target.checked)}
                      className="rounded border-neutral-600 text-indigo-500 focus:ring-indigo-500/30 bg-neutral-800"
                    />
                    Borda preta no texto
                  </label>
                  <p className="text-[10px] text-neutral-500 mt-2 italic leading-tight">
                    Dica: Clique na imagem para posicionar o texto.
                  </p>
                </div>
              )}
            </div>

            {/* Actions */}
            <div className="space-y-2">
              <button 
                onClick={formatForWhatsApp}
                className="w-full flex justify-center items-center gap-2 bg-neutral-700 hover:bg-neutral-600 text-white px-3 py-2 rounded-md transition-colors text-sm font-medium"
              >
                <Crop className="w-4 h-4 text-emerald-400" />
                Ajustar para WhatsApp
              </button>
              <button 
                onClick={undo}
                disabled={history.length <= 1}
                className="w-full flex justify-center items-center gap-2 bg-neutral-900 border border-neutral-700 hover:bg-neutral-800 disabled:opacity-50 disabled:cursor-not-allowed text-neutral-300 px-3 py-2 rounded-md transition-colors text-sm font-medium"
              >
                <Undo className="w-4 h-4" />
                Desfazer Ação
              </button>
            </div>
          </div>
        </aside>

        {/* Canvas Area */}
        <section className="lg:col-span-3 flex flex-col items-center">
          
          {/* Messages Alert */}
          <div className="h-10 w-full flex justify-center items-center">
            {message && (
              <div className="bg-indigo-500/20 text-indigo-300 border border-indigo-500/50 px-4 py-1.5 rounded-full text-sm flex items-center gap-2 animate-in slide-in-from-top-2">
                <AlertCircle className="w-4 h-4" />
                {message}
              </div>
            )}
          </div>

          <div 
            className="w-full max-w-[512px] bg-white rounded-lg shadow-2xl overflow-hidden border border-neutral-700 relative flex items-center justify-center min-h-[300px]"
            style={{ backgroundImage: checkeredBg }}
          >
            {!imageLoaded && (
              <div className="absolute inset-0 flex flex-col items-center justify-center text-neutral-400 bg-neutral-900/80 backdrop-blur-sm">
                <ImagePlus className="w-12 h-12 mb-3 text-neutral-500" />
                <p>Carregue uma imagem para começar</p>
              </div>
            )}
            <canvas
              ref={canvasRef}
              onClick={handleCanvasClick}
              className={`max-w-full max-h-[70vh] cursor-crosshair ${!imageLoaded && 'hidden'}`}
              style={{ display: 'block' }} // Garante que não haja espaçamento indesejado
            />
          </div>

          {/* Export Actions for Single Image */}
          {imageLoaded && (
            <div className="mt-6 flex flex-wrap gap-3 justify-center">
              <button 
                onClick={addFrame}
                className="flex items-center gap-2 bg-emerald-600/20 border border-emerald-600 text-emerald-400 hover:bg-emerald-600 hover:text-white px-5 py-2.5 rounded-lg font-medium transition-all text-sm"
              >
                <Film className="w-4 h-4" />
                Salvar como Quadro
              </button>
              <button 
                onClick={downloadPNG}
                className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white px-5 py-2.5 rounded-lg font-medium transition-all text-sm"
              >
                <Download className="w-4 h-4" />
                Baixar Figurinha (PNG)
              </button>
            </div>
          )}
        </section>
      </main>

      {/* Frames Bottom Bar */}
      <section className="max-w-6xl mx-auto mt-12 px-4">
        <div className="bg-neutral-800 rounded-xl p-5 border border-neutral-700 shadow-md">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-white flex items-center gap-2">
              <Film className="w-4 h-4 text-indigo-400" />
              Gestor de Animação (Quadros)
              <span className="bg-neutral-900 text-neutral-400 px-2 py-0.5 rounded-full text-xs ml-2">
                {frames.length} {frames.length === 1 ? 'quadro' : 'quadros'}
              </span>
            </h2>
            
            <div className="flex gap-2">
              <button 
                onClick={downloadGIF}
                disabled={frames.length === 0 || isExporting}
                className="flex items-center gap-2 bg-purple-600 hover:bg-purple-500 disabled:opacity-50 disabled:cursor-not-allowed text-white px-4 py-2 rounded-md font-medium transition-colors text-sm"
              >
                {isExporting ? <span className="animate-pulse">Exportando...</span> : <><Download className="w-4 h-4" /> Exportar GIF</>}
              </button>
            </div>
          </div>

          {frames.length === 0 ? (
            <div className="h-32 border-2 border-dashed border-neutral-700 rounded-lg flex flex-col items-center justify-center text-neutral-500 bg-neutral-900/50">
              <ImagePlus className="w-8 h-8 mb-2 opacity-50" />
              <p className="text-sm">Nenhum quadro adicionado. Clique em "Salvar como Quadro" para montar uma animação.</p>
            </div>
          ) : (
            <div className="flex gap-4 overflow-x-auto pb-4 custom-scrollbar">
              {frames.map((frame, idx) => (
                <div key={idx} className="relative group shrink-0">
                  <div className="w-24 h-24 rounded-lg overflow-hidden border-2 border-neutral-600 bg-white" style={{ backgroundImage: checkeredBg }}>
                    <img src={frame} alt={`Frame ${idx}`} className="w-full h-full object-contain" />
                  </div>
                  <div className="absolute top-1 right-1 bg-black/60 text-white text-[10px] px-1.5 rounded-sm backdrop-blur-sm">
                    {idx + 1}
                  </div>
                  <button 
                    onClick={() => removeFrame(idx)}
                    className="absolute -top-2 -right-2 bg-red-500 hover:bg-red-600 text-white p-1 rounded-full shadow-lg opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* Global CSS for utilities */}
      <style>{`
        .custom-scrollbar::-webkit-scrollbar { height: 8px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: #262626; border-radius: 4px; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #525252; border-radius: 4px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: #737373; }
      `}</style>
    </div>
  );
};

export default App;