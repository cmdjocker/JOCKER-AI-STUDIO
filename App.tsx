// @ts-nocheck
import { useState, useEffect, useRef } from 'react';
import { 
  BookOpen, 
  Wand2, 
  Download, 
  Loader2, 
  RefreshCw, 
  AlertCircle, 
  Image as ImageIcon,
  Settings,
  FileArchive,
  Moon,
  Sun,
  UserPlus,
  LogIn,
  Crown,
  Facebook,
  Instagram,
  Twitter,
  Bitcoin,
  CreditCard,
  Gem,
  Ghost,
  Lock,
  Info,
  ChevronRight,
  CheckCircle2,
  Layout,
  Layers
} from 'lucide-react';
import JSZip from 'jszip';
import saveAs from 'file-saver';
import { generateBookPlan, generateColoringPage, generateCoverImage, getClosestAspectRatio } from './services/gemini';
import { generatePDF } from './services/pdfGenerator';
import { BookPlan, GenerationState, PageDefinition, ViewType } from './types';

const INITIAL_STATE: GenerationState = {
  view: 'home',
  step: 'input',
  topic: '',
  dimensions: { width: 8.5, height: 11, unit: 'in' },
  metadata: null,
  pages: [],
  coverImage: undefined
};

export default function App() {
  const [state, setState] = useState<GenerationState>(INITIAL_STATE);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<{message: string, isQuota?: boolean} | null>(null);
  const [progress, setProgress] = useState(0);
  const [darkMode, setDarkMode] = useState(false);

  const isGeneratingImagesRef = useRef(false);

  useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [darkMode]);

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [state.step, state.view]);

  const handleError = (err: any) => {
    console.error("API Error:", err);
    let message = "An unexpected error occurred.";
    let isQuota = false;

    try {
      const errStr = typeof err === 'string' ? err : JSON.stringify(err);
      if (errStr.includes("RESOURCE_EXHAUSTED") || errStr.includes("429") || errStr.includes("quota")) {
        message = "Daily Generation Limit Reached. Please wait a moment or upgrade to VIP.";
        isQuota = true;
      } else if (err.message) {
        message = err.message;
      }
    } catch (e) {
      message = err?.message || "Connection lost. Please check your internet.";
    }

    setError({ message, isQuota });
    setLoading(false);
  };

  const navigate = (view: ViewType) => {
    setState(prev => {
      if (view === 'home') {
        return { ...INITIAL_STATE, view: 'home', dimensions: prev.dimensions };
      }
      return { ...prev, view };
    });
    setError(null);
    if (view !== 'home') isGeneratingImagesRef.current = false;
  };

  const handleGeneratePlan = async () => {
    if (!state.topic.trim()) return;
    setLoading(true);
    setError(null);

    try {
      const plan: BookPlan = await generateBookPlan(state.topic);
      if (!plan.pages || plan.pages.length === 0) {
        throw new Error("Failed to generate a book plan. Please try a different topic.");
      }
      
      const initialPages: PageDefinition[] = plan.pages.map((page, index) => ({
        id: `page-${index}-${Date.now()}`,
        title: page.title,
        prompt: page.prompt,
        status: 'pending'
      }));

      setState(prev => ({
        ...prev,
        step: 'planning',
        metadata: plan.metadata,
        pages: initialPages
      }));
    } catch (err) {
      handleError(err);
    } finally {
      setLoading(false);
    }
  };

  const startImageGeneration = async () => {
    setState(prev => {
      const updatedState = { ...prev, step: 'generating' };
      isGeneratingImagesRef.current = true;
      setProgress(0);
      processQueue(updatedState);
      return updatedState;
    });
  };

  const processQueue = async (initialState: GenerationState) => {
    const BATCH_SIZE = 4;
    const aspectRatio = getClosestAspectRatio(initialState.dimensions.width, initialState.dimensions.height);

    // Cover starts immediately in background
    const coverPromise = generateCoverImage(initialState.topic, initialState.metadata?.title || "Coloring Ebook", aspectRatio)
        .then(cover => {
            setState(prev => ({ ...prev, coverImage: cover }));
        })
        .catch(e => console.error("Cover failed", e));

    let pagesToProcess = [...initialState.pages];

    while (pagesToProcess.some(p => p.status === 'pending') && isGeneratingImagesRef.current) {
        const batch = pagesToProcess.filter(p => p.status === 'pending').slice(0, BATCH_SIZE);
        
        // Mark current batch as generating
        setState(prev => ({
            ...prev,
            pages: prev.pages.map(p => batch.find(b => b.id === p.id) ? { ...p, status: 'generating' } : p)
        }));
        
        // Update local tracker
        batch.forEach(b => {
            const idx = pagesToProcess.findIndex(p => p.id === b.id);
            if (idx !== -1) pagesToProcess[idx].status = 'generating';
        });

        await Promise.all(batch.map(async (page) => {
            try {
                const base64Image = await generateColoringPage(page.prompt, aspectRatio);
                setState(prev => ({
                    ...prev,
                    pages: prev.pages.map(p => p.id === page.id ? { ...p, status: 'completed', imageUrl: base64Image } : p)
                }));
                const idx = pagesToProcess.findIndex(p => p.id === page.id);
                if (idx !== -1) pagesToProcess[idx].status = 'completed';
            } catch (err) {
                console.error("Page failed", err);
                setState(prev => ({ ...prev, pages: prev.pages.map(p => p.id === page.id ? { ...p, status: 'failed' } : p) }));
                const idx = pagesToProcess.findIndex(p => p.id === page.id);
                if (idx !== -1) pagesToProcess[idx].status = 'failed';

                if (JSON.stringify(err).includes("429") || JSON.stringify(err).includes("RESOURCE_EXHAUSTED")) {
                    isGeneratingImagesRef.current = false;
                    handleError(err);
                }
            }
        }));

        setState(prev => {
            const total = prev.pages.length;
            const done = prev.pages.filter(p => p.status === 'completed' || p.status === 'failed').length;
            setProgress(Math.round((done / total) * 100));
            return prev;
        });
    }
    
    await coverPromise;

    isGeneratingImagesRef.current = false;
    setState(prev => {
        const allDone = prev.pages.every(p => p.status === 'completed' || p.status === 'failed');
        if (allDone && prev.step === 'generating') return { ...prev, step: 'review' };
        return prev;
    });
  };

  const handleDownloadPDF = () => state.metadata && generatePDF(state.metadata, state.pages, state.dimensions, state.coverImage);
  const handleDownloadSinglePNG = (uri: string, fn: string) => saveAs(uri, fn);

  const handleDownloadZip = async () => {
    const zip = new JSZip();
    const folder = zip.folder("coloring_pages");
    if (!folder) return;
    if (state.coverImage) folder.file("00_Cover.png", state.coverImage.split(',')[1], { base64: true });
    state.pages.forEach((page, index) => {
      if (page.status === 'completed' && page.imageUrl) {
        folder.file(`${(index + 1).toString().padStart(2, '0')}_${page.title.replace(/[^a-z0-9]/gi, '_')}.png`, page.imageUrl.split(',')[1], { base64: true });
      }
    });
    const content = await zip.generateAsync({ type: "blob" });
    saveAs(content, `${state.metadata?.title.replace(/[^a-z0-9]/gi, '_') || 'coloring_book'}_images.zip`);
  };

  const AdSidebar = ({ side }: { side: 'left' | 'right' }) => (
    <aside className={`hidden md:flex flex-col w-[180px] xl:w-[240px] shrink-0 p-6 gap-6 border-zinc-200 dark:border-zinc-800 bg-white/40 dark:bg-zinc-900/40 ${side === 'left' ? 'border-r' : 'border-l'}`}>
        <div className="w-full h-[600px] ad-pattern rounded-3xl border border-dashed border-zinc-300 dark:border-zinc-700 flex flex-col items-center justify-center text-zinc-400 p-8 text-center relative overflow-hidden group">
            <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 text-[10px] font-black uppercase tracking-widest px-3 py-1 rounded shadow-lg">SPONSORED</div>
            <ImageIcon className="h-12 w-12 mb-4 opacity-20 group-hover:scale-110 transition-transform text-jocker-600" />
            <span className="text-[10px] font-black uppercase tracking-widest opacity-60 leading-tight text-zinc-500 dark:text-zinc-400">Premium Ad Slot<br/>Available Now</span>
        </div>
        {side === 'right' && (
            <div className="w-full h-[280px] bg-gradient-to-br from-jocker-600 to-indigo-600 rounded-3xl p-6 text-white flex flex-col justify-end gap-3 shadow-2xl hover:-translate-y-1 transition-all">
                 <div className="bg-white/20 p-2 rounded-lg w-fit"><Crown className="h-5 w-5" /></div>
                 <h4 className="font-black text-sm leading-tight">UNLIMITED<br/>KDP ASSETS</h4>
                 <button onClick={() => navigate('vip')} className="bg-white text-jocker-900 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-zinc-100 transition-colors shadow-lg">Go VIP</button>
            </div>
        )}
    </aside>
  );

  const MobileAd = () => (
    <div className="md:hidden w-full px-4 py-8">
        <div className="w-full h-32 ad-pattern rounded-2xl border border-dashed border-zinc-300 dark:border-zinc-700 flex items-center justify-center gap-6 text-zinc-400 relative overflow-hidden">
            <div className="bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 text-[8px] font-black uppercase tracking-widest px-3 py-1 rounded shadow-md absolute top-2 right-2">Ad</div>
            <ImageIcon className="h-8 w-8 opacity-20" />
            <span className="text-[10px] font-black uppercase tracking-widest opacity-60">Sponsored Asset Placeholder</span>
        </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-zinc-950 transition-colors duration-300 flex flex-col font-sans">
      <header className="bg-jocker-900 text-white shadow-2xl sticky top-0 z-50 border-b border-jocker-800 h-24 backdrop-blur-md bg-opacity-95">
        <div className="max-w-[1440px] mx-auto px-6 h-full flex items-center justify-between">
          <button onClick={() => navigate('home')} className="flex items-center gap-4 hover:opacity-80 transition-all active:scale-95 text-left group">
            <div className="bg-white text-jocker-900 p-2.5 rounded-xl shadow-xl group-hover:shadow-white/20 transition-all">
               <Ghost className="h-8 w-8" />
            </div>
            <div>
                <span className="font-black text-xl md:text-2xl tracking-tighter block leading-none">AI KDP STUDIO</span>
                <span className="text-[10px] font-bold tracking-[0.3em] text-jocker-400 block mt-1 uppercase opacity-80">PRO PUBLISHING</span>
            </div>
          </button>

          <div className="flex items-center gap-4 md:gap-6">
             <nav className="hidden lg:flex items-center gap-8 mr-6">
                 <button onClick={() => navigate('home')} className={`text-xs font-black uppercase tracking-widest ${state.view === 'home' ? 'text-jocker-400' : 'text-zinc-400 hover:text-white'}`}>Studio</button>
                 <button onClick={() => navigate('vip')} className={`text-xs font-black uppercase tracking-widest ${state.view === 'vip' ? 'text-amber-400' : 'text-zinc-400 hover:text-white'}`}>VIP</button>
                 <button onClick={() => navigate('canva')} className={`text-xs font-black uppercase tracking-widest ${state.view === 'canva' ? 'text-indigo-400' : 'text-zinc-400 hover:text-white'}`}>Integrations</button>
             </nav>
             <button onClick={() => setDarkMode(!darkMode)} className="p-3 rounded-2xl bg-white/5 hover:bg-white/10 transition-all border border-white/5 active:scale-90 group">
               {darkMode ? <Sun className="h-5 w-5 group-hover:text-amber-300" /> : <Moon className="h-5 w-5 group-hover:text-blue-300" />}
             </button>
             <button onClick={() => navigate('register')} className="bg-white text-jocker-900 hover:bg-zinc-100 px-6 py-3 rounded-xl text-xs font-black transition-all flex items-center gap-2 uppercase tracking-widest shadow-xl active:scale-95">
                 Join
             </button>
          </div>
        </div>
      </header>

      <div className="flex-grow flex justify-center w-full max-w-[1600px] mx-auto relative">
        <AdSidebar side="left" />

        <main className="flex-1 max-w-5xl px-6 py-12 w-full min-w-0">
          {error && (
            <div className={`mb-10 p-6 rounded-2xl shadow-xl flex items-start gap-4 animate-in slide-in-from-top-4 border-l-8 ${error.isQuota ? 'bg-amber-50 dark:bg-amber-950/30 border-amber-500' : 'bg-red-50 dark:bg-red-950/30 border-red-600'}`}>
              <AlertCircle className="h-6 w-6 text-red-600 mt-1" />
              <div className="flex-grow">
                <p className="font-black uppercase text-xs tracking-widest mb-1">{error.isQuota ? 'Quota Limit' : 'System Alert'}</p>
                <p className="text-sm font-medium">{error.message}</p>
              </div>
              <button onClick={() => setError(null)} className="text-zinc-400 hover:text-zinc-600">✕</button>
            </div>
          )}

          {state.view === 'home' && (
            <div className="animate-in fade-in duration-700">
              {state.step === 'input' && (
                <div className="max-w-3xl mx-auto mt-12 text-center">
                  <h1 className="text-5xl md:text-7xl font-black text-zinc-900 dark:text-white mb-8 tracking-tighter leading-none">
                    Mass-Produce <br/>
                    <span className="text-transparent bg-clip-text bg-gradient-to-r from-jocker-600 to-indigo-600 dark:from-jocker-400 dark:to-indigo-400">
                      KDP Bestsellers
                    </span>
                  </h1>
                  <p className="text-xl font-medium text-zinc-500 dark:text-zinc-400 mb-12 max-w-2xl mx-auto leading-relaxed">
                    Instantly generate "Ready-to-Upload" interiors and high-reach metadata for Amazon Kindle KDP.
                  </p>
                  
                  <div className="bg-white dark:bg-zinc-900 p-8 md:p-12 rounded-[3rem] shadow-2xl border border-zinc-100 dark:border-zinc-800 text-left relative overflow-hidden">
                    <div className="mb-10">
                      <label htmlFor="topic" className="block text-xs font-black text-zinc-700 dark:text-zinc-400 mb-3 uppercase tracking-[0.2em]">Book Topic or Niche</label>
                      <input 
                        type="text" 
                        id="topic" 
                        className="w-full px-8 py-6 text-2xl font-black border-2 border-zinc-100 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-white rounded-3xl focus:border-jocker-500 outline-none transition-all shadow-inner" 
                        placeholder="e.g., Space Cats, Dinosaur Princesses..." 
                        value={state.topic} 
                        onChange={(e) => setState({ ...state, topic: e.target.value })} 
                        onKeyDown={(e) => e.key === 'Enter' && handleGeneratePlan()} 
                      />
                    </div>

                    <div className="bg-zinc-50 dark:bg-zinc-800/40 p-8 rounded-[2rem] border border-zinc-100 dark:border-zinc-800 mb-10">
                      <div className="flex items-center gap-3 mb-6 font-black text-lg uppercase tracking-widest dark:text-white"><Settings className="h-6 w-6 text-jocker-500" /> Interior Format</div>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                          <div><label className="text-[10px] font-black text-zinc-400 uppercase tracking-widest mb-2 block">Width</label><input type="number" step="0.1" value={state.dimensions.width} onChange={(e) => setState({ ...state, dimensions: { ...state.dimensions, width: parseFloat(e.target.value) } })} className="w-full px-5 py-4 bg-white dark:bg-zinc-900 border border-zinc-100 dark:border-zinc-700 rounded-2xl outline-none font-black dark:text-white" /></div>
                          <div><label className="text-[10px] font-black text-zinc-400 uppercase tracking-widest mb-2 block">Height</label><input type="number" step="0.1" value={state.dimensions.height} onChange={(e) => setState({ ...state, dimensions: { ...state.dimensions, height: parseFloat(e.target.value) } })} className="w-full px-5 py-4 bg-white dark:bg-zinc-900 border border-zinc-100 dark:border-zinc-700 rounded-2xl outline-none font-black dark:text-white" /></div>
                          <div><label className="text-[10px] font-black text-zinc-400 uppercase tracking-widest mb-2 block">Unit</label><select value={state.dimensions.unit} onChange={(e) => setState({ ...state, dimensions: { ...state.dimensions, unit: e.target.value as 'in' | 'px' } })} className="w-full px-5 py-4 bg-white dark:bg-zinc-900 border border-zinc-100 dark:border-zinc-700 rounded-2xl outline-none font-black dark:text-white appearance-none cursor-pointer"><option value="in">Inches (KDP Standard)</option><option value="px">Pixels</option></select></div>
                      </div>
                    </div>

                    <button onClick={handleGeneratePlan} disabled={loading || !state.topic.trim()} className="w-full bg-jocker-900 dark:bg-jocker-600 hover:bg-jocker-800 text-white font-black py-7 rounded-[2rem] shadow-2xl transition-all flex items-center justify-center gap-4 text-2xl uppercase tracking-widest disabled:opacity-50">
                      {loading ? <Loader2 className="animate-spin h-8 w-8" /> : "Start Production"}
                    </button>
                  </div>
                </div>
              )}

              {state.step === 'planning' && state.metadata && (
                <div className="max-w-4xl mx-auto animate-in fade-in slide-in-from-bottom-6 duration-500">
                   <div className="flex flex-col sm:flex-row justify-between items-center gap-6 mb-12">
                       <h2 className="text-4xl font-black dark:text-white tracking-tighter">Production Blueprint</h2>
                       <button onClick={startImageGeneration} className="bg-green-600 hover:bg-green-700 text-white px-10 py-4 rounded-2xl font-black shadow-xl transition-all uppercase tracking-widest text-sm">Approve All Pages</button>
                   </div>
                   <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
                      <div className="bg-white dark:bg-zinc-900 p-10 rounded-[2.5rem] border border-zinc-100 dark:border-zinc-800 shadow-xl">
                          <h3 className="text-xl font-black mb-8 border-b dark:border-zinc-800 pb-6 flex items-center gap-3 text-jocker-600"><BookOpen className="h-6 w-6" /> KDP Metadata</h3>
                          <div className="space-y-8">
                              <div><label className="text-[10px] font-black text-zinc-300 dark:text-zinc-600 uppercase tracking-[0.3em] mb-2 block">Main Title</label><div className="font-black text-2xl text-zinc-900 dark:text-white leading-tight">{state.metadata.title}</div></div>
                              <div><label className="text-[10px] font-black text-zinc-300 dark:text-zinc-600 uppercase tracking-[0.3em] mb-2 block">SEO Subtitle</label><div className="text-md text-zinc-600 dark:text-zinc-400 font-medium">{state.metadata.subtitle}</div></div>
                              <div><label className="text-[10px] font-black text-zinc-300 dark:text-zinc-600 uppercase tracking-[0.3em] mb-3 block">Reach Keywords</label><div className="flex flex-wrap gap-2">{state.metadata.keywords.map((kw, i) => <span key={i} className="bg-jocker-50 dark:bg-jocker-900/30 text-jocker-700 dark:text-jocker-400 px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wider border border-jocker-100 dark:border-jocker-800">{kw}</span>)}</div></div>
                          </div>
                      </div>
                      <div className="bg-white dark:bg-zinc-900 p-8 rounded-[2.5rem] border border-zinc-100 dark:border-zinc-800 shadow-xl h-[600px] overflow-y-auto">
                          <h3 className="text-xl font-black mb-6 sticky top-0 bg-white dark:bg-zinc-900 z-10 pb-6 border-b dark:border-zinc-800 dark:text-white">Page Queue ({state.pages.length})</h3>
                          <ul className="space-y-6">
                              {state.pages.map((p, i) => <li key={p.id} className="text-sm flex gap-4 p-4 rounded-2xl hover:bg-zinc-50 dark:hover:bg-zinc-800/50"><span className="font-black text-jocker-400 mt-1">{(i+1).toString().padStart(2, '0')}</span> <div><span className="font-black block text-zinc-800 dark:text-zinc-200 text-lg leading-tight mb-1">{p.title}</span><span className="text-xs text-zinc-500 leading-relaxed block">{p.prompt}</span></div></li>)}
                          </ul>
                      </div>
                   </div>
                </div>
              )}

              {state.step === 'generating' && (
                   <div className="max-w-4xl mx-auto text-center mt-20 animate-in fade-in duration-500">
                       <Loader2 className="h-24 w-24 text-jocker-600 animate-spin mx-auto mb-10" />
                       <h2 className="text-4xl font-black mb-4 tracking-tighter dark:text-white">Rendering High-Reach Assets...</h2>
                       <p className="text-zinc-500 mb-2 text-lg font-medium">Bulk mode active: Processing pages concurrently for maximum speed.</p>
                       <p className="text-xs text-jocker-400 font-bold uppercase tracking-widest mb-10">Current Progress: {progress}% Complete</p>
                       <div className="w-full bg-zinc-200 dark:bg-zinc-800 rounded-full h-8 mb-4 overflow-hidden shadow-inner p-1">
                            <div className="bg-gradient-to-r from-jocker-600 to-indigo-500 h-6 rounded-full transition-all duration-700" style={{ width: `${progress}%` }}></div>
                       </div>
                       <div className="mt-20 grid grid-cols-2 sm:grid-cols-4 md:grid-cols-5 gap-6">
                           {state.pages.map((p, i) => (
                             <div key={p.id} className="aspect-[1/1.41] bg-white dark:bg-zinc-900 rounded-2xl border-2 border-zinc-100 dark:border-zinc-800 flex flex-col items-center justify-center relative overflow-hidden shadow-md">
                                {p.status === 'completed' && p.imageUrl ? (
                                    <img src={p.imageUrl} className="w-full h-full object-contain p-3 animate-in zoom-in-95 duration-500" alt="Interior" />
                                ) : (
                                    <div className="flex flex-col items-center gap-3">
                                        <Loader2 className={`h-8 w-8 text-jocker-200 ${p.status === 'generating' ? 'animate-spin' : ''}`} />
                                        <span className="text-[8px] font-black text-zinc-400 uppercase tracking-widest">{p.status === 'generating' ? 'Rendering' : (p.status === 'failed' ? 'Failed' : 'Queued')}</span>
                                    </div>
                                )}
                                <div className="absolute bottom-2 right-2 bg-black/60 text-white text-[8px] font-black px-2 py-0.5 rounded-full">P{i+1}</div>
                             </div>
                           ))}
                       </div>
                   </div>
              )}

              {state.step === 'review' && (
                  <div className="max-w-6xl mx-auto animate-in fade-in slide-in-from-bottom-8 duration-700">
                      <div className="bg-jocker-900 text-white p-8 md:p-16 rounded-[4rem] shadow-3xl flex flex-col md:flex-row justify-between items-center gap-10 mb-16 relative overflow-hidden">
                          <div className="relative z-10 text-center md:text-left">
                              <h2 className="text-5xl font-black mb-3 tracking-tighter">Ready for KDP!</h2>
                              <p className="text-jocker-300 font-bold text-lg">Your {state.dimensions.width}x{state.dimensions.height} Interior Bundle is generated.</p>
                          </div>
                          <div className="flex flex-col sm:flex-row gap-6 relative z-10 w-full md:w-auto">
                            <button onClick={handleDownloadZip} className="bg-white text-jocker-900 px-10 py-5 rounded-[2rem] font-black shadow-2xl transition-all flex items-center justify-center gap-3 text-lg uppercase tracking-widest"><FileArchive className="h-6 w-6" /> ZIP BUNDLE</button>
                            <button onClick={handleDownloadPDF} className="bg-jocker-600 text-white px-10 py-5 rounded-[2rem] font-black shadow-2xl transition-all flex items-center justify-center gap-3 text-lg uppercase tracking-widest"><Download className="h-6 w-6" /> PDF INTERIOR</button>
                          </div>
                      </div>

                      <div className="flex items-center gap-4 mb-8">
                         <h3 className="text-2xl font-black dark:text-white uppercase tracking-widest">Asset Review</h3>
                         <div className="h-px flex-grow bg-zinc-200 dark:bg-zinc-800"></div>
                      </div>

                      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-8">
                          {state.pages.map((p, idx) => (
                              <div key={p.id} className="group relative">
                                  <div className="aspect-[1/1.41] bg-white dark:bg-zinc-900 rounded-3xl border-2 border-zinc-100 dark:border-zinc-800 p-4 group-hover:border-jocker-500 group-hover:shadow-2xl transition-all cursor-pointer relative shadow-lg overflow-hidden">
                                      {p.imageUrl && <img src={p.imageUrl} className="w-full h-full object-contain group-hover:scale-105 transition-transform" alt="Page" />}
                                      <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                            <button onClick={() => handleDownloadSinglePNG(p.imageUrl!, `Interior_${idx+1}.png`)} className="bg-white text-jocker-900 p-4 rounded-2xl shadow-xl"><Download className="h-6 w-6" /></button>
                                      </div>
                                  </div>
                              </div>
                          ))}
                      </div>
                  </div>
              )}
            </div>
          )}

          {state.view === 'vip' && (
             <div className="max-w-5xl mx-auto py-12 animate-in fade-in slide-in-from-bottom-6">
                <div className="text-center mb-16">
                    <Crown className="h-16 w-16 text-amber-500 mx-auto mb-6" />
                    <h2 className="text-5xl font-black dark:text-white tracking-tighter mb-4">Upgrade to VIP Studio</h2>
                    <p className="text-zinc-500 text-lg">Remove limits and unlock 100+ page generation in one click.</p>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                   <div className="bg-white dark:bg-zinc-900 p-10 rounded-[2.5rem] border border-zinc-100 dark:border-zinc-800 flex flex-col">
                      <span className="text-xs font-black text-zinc-400 uppercase tracking-widest mb-4">Starter</span>
                      <div className="text-4xl font-black mb-8 dark:text-white">$0 <span className="text-sm font-medium text-zinc-500">/mo</span></div>
                      <ul className="space-y-4 mb-10 flex-grow">
                         <li className="flex items-center gap-2 text-sm text-zinc-600 dark:text-zinc-400"><CheckCircle2 className="h-4 w-4 text-green-500" /> 20 Pages Per Ebook</li>
                         <li className="flex items-center gap-2 text-sm text-zinc-600 dark:text-zinc-400"><CheckCircle2 className="h-4 w-4 text-green-500" /> Standard Metadata</li>
                         <li className="flex items-center gap-2 text-sm text-zinc-400 opacity-50"><Lock className="h-4 w-4" /> Batch Upload</li>
                      </ul>
                      <button onClick={() => navigate('home')} className="w-full py-4 border-2 border-zinc-100 dark:border-zinc-800 rounded-2xl font-black text-xs uppercase tracking-widest dark:text-white">Current Plan</button>
                   </div>
                   <div className="bg-jocker-900 p-10 rounded-[2.5rem] shadow-3xl flex flex-col scale-105 relative overflow-hidden">
                      <div className="absolute top-4 right-4 bg-amber-500 text-white text-[8px] font-black px-3 py-1 rounded-full uppercase">Most Popular</div>
                      <span className="text-xs font-black text-jocker-300 uppercase tracking-widest mb-4">Professional</span>
                      <div className="text-4xl font-black mb-8 text-white">$29 <span className="text-sm font-medium text-jocker-400">/mo</span></div>
                      <ul className="space-y-4 mb-10 flex-grow text-white">
                         <li className="flex items-center gap-2 text-sm"><CheckCircle2 className="h-4 w-4 text-amber-400" /> Unlimited Pages</li>
                         <li className="flex items-center gap-2 text-sm"><CheckCircle2 className="h-4 w-4 text-amber-400" /> SEO Deep Analysis</li>
                         <li className="flex items-center gap-2 text-sm"><CheckCircle2 className="h-4 w-4 text-amber-400" /> 4K Resolution Images</li>
                         <li className="flex items-center gap-2 text-sm"><CheckCircle2 className="h-4 w-4 text-amber-400" /> Priority Server</li>
                      </ul>
                      <button className="w-full py-5 bg-white text-jocker-900 rounded-2xl font-black text-xs uppercase tracking-widest shadow-xl">Upgrade Now</button>
                   </div>
                   <div className="bg-white dark:bg-zinc-900 p-10 rounded-[2.5rem] border border-zinc-100 dark:border-zinc-800 flex flex-col">
                      <span className="text-xs font-black text-zinc-400 uppercase tracking-widest mb-4">Agency</span>
                      <div className="text-4xl font-black mb-8 dark:text-white">$99 <span className="text-sm font-medium text-zinc-500">/mo</span></div>
                      <ul className="space-y-4 mb-10 flex-grow">
                         <li className="flex items-center gap-2 text-sm text-zinc-600 dark:text-zinc-400"><CheckCircle2 className="h-4 w-4 text-green-500" /> Multi-User Access</li>
                         <li className="flex items-center gap-2 text-sm text-zinc-600 dark:text-zinc-400"><CheckCircle2 className="h-4 w-4 text-green-500" /> Custom Niche Training</li>
                         <li className="flex items-center gap-2 text-sm text-zinc-600 dark:text-zinc-400"><CheckCircle2 className="h-4 w-4 text-green-500" /> Direct Canva Sync</li>
                      </ul>
                      <button className="w-full py-4 bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 rounded-2xl font-black text-xs uppercase tracking-widest">Select Plan</button>
                   </div>
                </div>
             </div>
          )}

          {state.view === 'canva' && (
             <div className="max-w-4xl mx-auto py-24 text-center animate-in fade-in">
                <div className="bg-indigo-50 dark:bg-indigo-950/30 p-12 rounded-[4rem] border border-indigo-100 dark:border-indigo-900">
                    <Layout className="h-20 w-20 text-indigo-600 mx-auto mb-8" />
                    <h2 className="text-4xl font-black mb-6 dark:text-white">Canva Sync integration</h2>
                    <p className="text-zinc-500 text-lg mb-10 max-w-xl mx-auto">Publish your AI-generated coloring pages directly to Canva designs to create professional covers and branded interiors.</p>
                    <div className="flex justify-center gap-4">
                        <button className="bg-indigo-600 text-white px-10 py-5 rounded-3xl font-black text-xs uppercase tracking-widest shadow-xl hover:bg-indigo-700 transition-all">Connect Canva Account</button>
                    </div>
                </div>
             </div>
          )}
          
          <MobileAd />
        </main>

        <AdSidebar side="right" />
      </div>
      
      <footer className="mt-auto bg-white dark:bg-zinc-950 border-t border-zinc-200 dark:border-zinc-800 py-16">
          <div className="max-w-7xl mx-auto px-10">
              <div className="grid grid-cols-1 md:grid-cols-4 gap-12 mb-16">
                  <div className="col-span-1 md:col-span-2">
                      <div className="flex items-center gap-3 mb-6">
                           <Ghost className="h-8 w-8 text-jocker-600" />
                           <span className="font-black text-2xl tracking-tighter dark:text-white">AI KDP STUDIO</span>
                      </div>
                      <p className="text-zinc-500 dark:text-zinc-400 max-w-sm text-sm font-medium leading-relaxed">
                          The world's first comprehensive AI-driven publishing suite for Amazon KDP creators. Interior design, metadata research, and automation in one dashboard.
                      </p>
                  </div>
                  <div>
                      <h4 className="text-[10px] font-black uppercase tracking-[0.3em] text-zinc-400 mb-6">Tools</h4>
                      <ul className="space-y-4 text-sm font-bold text-zinc-600 dark:text-zinc-300">
                          <li><button onClick={() => navigate('home')} className="hover:text-jocker-600">Generator</button></li>
                          <li><button onClick={() => navigate('canva')} className="hover:text-jocker-600">Canva Integrator</button></li>
                          <li><button className="hover:text-jocker-600">Keyword Researcher</button></li>
                      </ul>
                  </div>
                  <div>
                      <h4 className="text-[10px] font-black uppercase tracking-[0.3em] text-zinc-400 mb-6">Studio</h4>
                      <ul className="space-y-4 text-sm font-bold text-zinc-600 dark:text-zinc-300">
                          <li><button onClick={() => navigate('vip')} className="hover:text-jocker-600">Pricing</button></li>
                          <li><button onClick={() => navigate('register')} className="hover:text-jocker-600">Sign Up</button></li>
                          <li><button className="hover:text-jocker-600">Help Center</button></li>
                      </ul>
                  </div>
              </div>
              <div className="flex flex-col md:flex-row justify-between items-center gap-8 pt-10 border-t border-zinc-100 dark:border-zinc-900">
                  <p className="text-zinc-400 text-[10px] font-black uppercase tracking-widest">© 2025 AI KDP Studio. KDP Interior Ready.</p>
                  <div className="flex gap-8 items-center opacity-40 grayscale">
                      <CreditCard className="h-8 w-8" />
                      <Bitcoin className="h-8 w-8" />
                  </div>
              </div>
          </div>
      </footer>
    </div>
  );
}
