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
  Ruler,
  FileArchive,
  Moon,
  Sun,
  UserPlus,
  LogIn,
  Crown,
  MessageCircle,
  Facebook,
  Instagram,
  Twitter,
  Bitcoin,
  CreditCard,
  Palette,
  Gem,
  Ghost,
  Lock,
  ArrowLeft,
  CheckCircle2,
  Mail,
  Smartphone,
  ShieldCheck,
  ChevronRight,
  Zap,
  User,
  Fingerprint,
  Info
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
  const [billingCycle, setBillingCycle] = useState<'monthly' | 'yearly'>('monthly');

  // Queue processing logic
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

  // Unified Error Parser
  const handleError = (err: any) => {
    console.error("API Error:", err);
    let message = "An unexpected error occurred.";
    let isQuota = false;

    try {
      const errStr = typeof err === 'string' ? err : JSON.stringify(err);
      if (errStr.includes("RESOURCE_EXHAUSTED") || errStr.includes("429") || errStr.includes("quota")) {
        message = "Daily Generation Limit Reached. The AI engine is currently resting. Please wait a moment or upgrade to VIP for unlimited access.";
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
        return {
          ...INITIAL_STATE,
          view: 'home',
          dimensions: prev.dimensions
        };
      }
      return { ...prev, view };
    });
    setError(null);
    if (view !== 'home') {
      isGeneratingImagesRef.current = false;
    }
  };

  const handleGeneratePlan = async () => {
    if (!state.topic.trim()) return;
    setLoading(true);
    setError(null);

    try {
      const plan: BookPlan = await generateBookPlan(state.topic);
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
    setState(prev => ({ ...prev, step: 'generating' }));
    isGeneratingImagesRef.current = true;
    processQueue();
  };

  const processQueue = async () => {
    const BATCH_SIZE = 1; 
    const DELAY_MS = 15000; 
    const aspectRatio = getClosestAspectRatio(state.dimensions.width, state.dimensions.height);

    if (!state.coverImage) {
        try {
            const cover = await generateCoverImage(state.topic, state.metadata?.title || "Coloring Ebook", aspectRatio);
            setState(prev => ({ ...prev, coverImage: cover }));
            await new Promise(resolve => setTimeout(resolve, 3000));
        } catch (e) {
            console.error("Cover failed", e);
        }
    }

    const pagesToProcess = state.pages.filter(p => p.status === 'pending');

    for (let i = 0; i < pagesToProcess.length; i += BATCH_SIZE) {
        if (!isGeneratingImagesRef.current) break;

        const batch = pagesToProcess.slice(i, i + BATCH_SIZE);

        setState(prev => ({
            ...prev,
            pages: prev.pages.map(p => batch.find(b => b.id === p.id) ? { ...p, status: 'generating' } : p)
        }));

        await Promise.all(batch.map(async (page) => {
            try {
                const base64Image = await generateColoringPage(page.prompt, aspectRatio);
                setState(prev => ({
                    ...prev,
                    pages: prev.pages.map(p => p.id === page.id ? { ...p, status: 'completed', imageUrl: base64Image } : p)
                }));
            } catch (err) {
                console.error(`Failed to generate page ${page.id}`, err);
                setState(prev => ({
                    ...prev,
                    pages: prev.pages.map(p => p.id === page.id ? { ...p, status: 'failed' } : p)
                }));
                if (JSON.stringify(err).includes("429") || JSON.stringify(err).includes("RESOURCE_EXHAUSTED")) {
                    isGeneratingImagesRef.current = false;
                    handleError(err);
                }
            }
        }));

        setState(prev => {
            const completed = prev.pages.filter(p => p.status === 'completed' || p.status === 'failed').length;
            setProgress(Math.round((completed / prev.pages.length) * 100));
            return prev;
        });

        if (i + BATCH_SIZE < pagesToProcess.length && isGeneratingImagesRef.current) {
            await new Promise(resolve => setTimeout(resolve, DELAY_MS));
        }
    }
    
    isGeneratingImagesRef.current = false;
    setState(prev => {
        const allDone = prev.pages.every(p => p.status === 'completed' || p.status === 'failed');
        if (allDone && prev.step === 'generating') {
            return { ...prev, step: 'review' };
        }
        return prev;
    });
  };

  const handleRetryPage = async (pageId: string, prompt: string) => {
      const aspectRatio = getClosestAspectRatio(state.dimensions.width, state.dimensions.height);
      setState(prev => ({
          ...prev,
          pages: prev.pages.map(p => p.id === pageId ? { ...p, status: 'generating' } : p)
      }));
      setError(null);
      try {
          const base64Image = await generateColoringPage(prompt, aspectRatio);
          setState(prev => ({
              ...prev,
              pages: prev.pages.map(p => p.id === pageId ? { ...p, status: 'completed', imageUrl: base64Image } : p)
          }));
      } catch (err) {
          setState(prev => ({ ...prev, pages: prev.pages.map(p => p.id === pageId ? { ...p, status: 'failed' } : p) }));
          handleError(err);
      }
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
    <aside className={`hidden lg:flex flex-col w-[200px] xl:w-[240px] shrink-0 p-6 gap-6 border-zinc-200 dark:border-zinc-800 bg-white/40 dark:bg-zinc-900/40 ${side === 'left' ? 'border-r' : 'border-l'}`}>
        <div className="w-full h-[600px] ad-pattern rounded-3xl border border-dashed border-zinc-300 dark:border-zinc-700 flex flex-col items-center justify-center text-zinc-400 p-8 text-center relative overflow-hidden group">
            <div className="absolute top-2 left-1/2 -translate-x-1/2 bg-zinc-200 dark:bg-zinc-800 text-[8px] font-black uppercase tracking-widest px-2 py-0.5 rounded">Sponsored</div>
            <ImageIcon className="h-10 w-10 mb-4 opacity-20 group-hover:scale-110 transition-transform" />
            <span className="text-[10px] font-black uppercase tracking-widest opacity-40 leading-tight">Premium Ad Slot<br/>Available</span>
        </div>
        {side === 'right' && (
            <div className="w-full h-[280px] bg-gradient-to-br from-jocker-600 to-indigo-600 rounded-3xl p-6 text-white flex flex-col justify-end gap-3 shadow-xl hover:-translate-y-1 transition-all">
                 <div className="bg-white/20 p-2 rounded-lg w-fit"><Crown className="h-5 w-5" /></div>
                 <h4 className="font-black text-sm leading-tight">UNLIMITED<br/>KDP ASSETS</h4>
                 <button onClick={() => navigate('vip')} className="bg-white text-jocker-900 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-zinc-100 transition-colors">Go VIP</button>
            </div>
        )}
    </aside>
  );

  const MobileAd = () => (
    <div className="lg:hidden w-full px-6 py-4">
        <div className="w-full h-24 ad-pattern rounded-2xl border border-dashed border-zinc-300 dark:border-zinc-700 flex items-center justify-center gap-4 text-zinc-400">
            <div className="bg-zinc-200 dark:bg-zinc-800 text-[8px] font-black uppercase tracking-widest px-2 py-1 rounded">Ad</div>
            <span className="text-[10px] font-black uppercase tracking-widest opacity-40">Mobile Banner Space</span>
        </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-zinc-950 transition-colors duration-300 flex flex-col font-sans">
      
      <div className="fixed right-0 top-1/2 -translate-y-1/2 z-40 flex flex-col bg-white dark:bg-zinc-900 shadow-2xl rounded-l-2xl overflow-hidden border border-r-0 border-zinc-200 dark:border-zinc-800">
          <a href="#" className="p-4 hover:bg-blue-600 hover:text-white text-blue-600 transition-all"><Facebook className="h-5 w-5" /></a>
          <a href="#" className="p-4 hover:bg-pink-600 hover:text-white text-pink-600 transition-all"><Instagram className="h-5 w-5" /></a>
          <a href="#" className="p-4 hover:bg-sky-500 hover:text-white text-sky-500 transition-all"><Twitter className="h-5 w-5" /></a>
          <div className="p-4 bg-zinc-50 dark:bg-zinc-800 text-[9px] font-black vertical-text flex items-center justify-center py-6 text-zinc-400 tracking-[0.2em] select-none">CONNECT</div>
      </div>

      <header className="bg-jocker-900 text-white shadow-2xl sticky top-0 z-50 border-b border-jocker-800 h-24 backdrop-blur-md bg-opacity-95">
        <div className="max-w-[1440px] mx-auto px-6 h-full flex items-center justify-between">
          <button onClick={() => navigate('home')} className="flex items-center gap-4 hover:opacity-80 transition-all active:scale-95 text-left group">
            <div className="bg-white text-jocker-900 p-2.5 rounded-xl shadow-[0_0_20px_rgba(255,255,255,0.2)] group-hover:shadow-[0_0_30px_rgba(255,255,255,0.4)] transition-all">
               <Ghost className="h-9 w-9" />
            </div>
            <div>
                <span className="font-black text-2xl md:text-3xl tracking-tighter block leading-none font-serif">AI KDP STUDIO</span>
                <span className="text-[10px] font-bold tracking-[0.3em] text-jocker-400 block mt-1 uppercase opacity-80">PRO PUBLISHING ENGINE</span>
            </div>
          </button>

          <div className="flex items-center gap-6">
             <nav className="hidden lg:flex items-center gap-8 mr-6">
                 <button onClick={() => navigate('home')} className={`text-xs font-black uppercase tracking-widest transition-colors ${state.view === 'home' ? 'text-jocker-400' : 'text-zinc-400 hover:text-white'}`}>Studio</button>
                 <button onClick={() => navigate('vip')} className={`text-xs font-black uppercase tracking-widest transition-colors ${state.view === 'vip' ? 'text-amber-400' : 'text-zinc-400 hover:text-white'}`}>VIP Plans</button>
                 <button onClick={() => navigate('canva')} className={`text-xs font-black uppercase tracking-widest transition-colors ${state.view === 'canva' ? 'text-[#00c4cc]' : 'text-zinc-400 hover:text-white'}`}>Integrations</button>
             </nav>

             <button onClick={() => navigate('vip')} className="hidden md:flex items-center gap-2 px-6 py-3 rounded-full bg-gradient-to-r from-amber-400 to-yellow-600 text-black text-xs font-black shadow-lg transition-all uppercase tracking-widest hover:scale-105">
                <Crown className="h-4 w-4" /> UNLOCK PRO
             </button>

             <div className="h-10 w-px bg-white/10 mx-2"></div>

             <button onClick={() => setDarkMode(!darkMode)} className="p-3 rounded-2xl bg-white/5 hover:bg-white/10 transition-all border border-white/5 active:scale-90 group">
               {darkMode ? <Sun className="h-5 w-5 group-hover:text-amber-300" /> : <Moon className="h-5 w-5 group-hover:text-blue-300" />}
             </button>

             <div className="flex items-center gap-4 pl-4">
                 <button onClick={() => navigate('login')} className="hidden sm:flex text-xs font-black text-zinc-300 hover:text-white transition-all uppercase tracking-widest items-center gap-2">
                     <LogIn className="h-4 w-4" /> Login
                 </button>
                 <button onClick={() => navigate('register')} className="bg-white text-jocker-900 hover:bg-zinc-100 px-6 py-3 rounded-xl text-xs font-black transition-all flex items-center gap-2 uppercase tracking-widest shadow-xl active:scale-95">
                     <UserPlus className="h-4 w-4" /> Join
                 </button>
             </div>
          </div>
        </div>
      </header>

      <div className="flex-grow flex justify-center w-full max-w-[1600px] mx-auto relative">
        <AdSidebar side="left" />

        <main className="flex-1 max-w-5xl px-6 py-12 w-full min-w-0">
          {error && (
            <div className={`mb-10 p-6 rounded-2xl shadow-xl flex items-start gap-4 animate-in slide-in-from-top-4 border-l-8 ${error.isQuota ? 'bg-amber-50 dark:bg-amber-950/30 border-amber-500' : 'bg-red-50 dark:bg-red-950/30 border-red-600'}`}>
              {error.isQuota ? <Info className="h-6 w-6 text-amber-600 mt-1" /> : <AlertCircle className="h-6 w-6 text-red-600 mt-1" />}
              <div className="flex-grow">
                <p className={`font-black uppercase text-xs tracking-widest mb-1 ${error.isQuota ? 'text-amber-900 dark:text-amber-200' : 'text-red-900 dark:text-red-200'}`}>
                    {error.isQuota ? 'Free Tier Limit Reached' : 'System Exception'}
                </p>
                <p className={`text-sm font-medium ${error.isQuota ? 'text-amber-700 dark:text-amber-400' : 'text-red-700 dark:text-red-400'}`}>{error.message}</p>
                {error.isQuota && (
                    <button onClick={() => navigate('vip')} className="mt-4 bg-amber-600 hover:bg-amber-700 text-white px-5 py-2 rounded-xl text-xs font-black uppercase tracking-widest transition-all shadow-lg flex items-center gap-2">
                        <Crown className="h-3.5 w-3.5" /> Unlock Unlimited Access
                    </button>
                )}
              </div>
              <button onClick={() => setError(null)} className="text-zinc-400 hover:text-zinc-600"><Lock className="h-4 w-4 rotate-45" /></button>
            </div>
          )}

          {state.view === 'home' && (
            <div className="animate-in fade-in duration-700">
              {state.step === 'input' && (
                <div className="max-w-3xl mx-auto mt-12 text-center">
                  <h1 className="text-5xl md:text-7xl font-black text-zinc-900 dark:text-white mb-8 tracking-tighter leading-none">
                    Mass-Produce <br/>
                    <span className="text-transparent bg-clip-text bg-gradient-to-r from-jocker-600 to-indigo-600 dark:from-jocker-400 dark:to-indigo-400">
                      Best-Selling Interiors
                    </span>
                  </h1>
                  <p className="text-xl font-medium text-zinc-500 dark:text-zinc-400 mb-12 max-w-2xl mx-auto leading-relaxed">
                    Instantly generate high-reach metadata and 20+ unique coloring pages. The ultimate companion for Amazon KDP publishers.
                  </p>
                  
                  <div className="bg-white dark:bg-zinc-900 p-8 md:p-12 rounded-[3rem] shadow-[0_40px_80px_-20px_rgba(0,0,0,0.1)] dark:shadow-[0_40px_80px_-20px_rgba(0,0,0,0.5)] border border-zinc-100 dark:border-zinc-800 text-left relative overflow-hidden group">
                    <div className="absolute top-0 right-0 p-8 opacity-5 dark:opacity-10 pointer-events-none group-hover:scale-110 transition-transform duration-1000">
                        <Gem className="h-48 w-48 text-jocker-900 dark:text-white" />
                    </div>
                    
                    <div className="mb-10 relative z-10">
                      <label htmlFor="topic" className="block text-xs font-black text-zinc-700 dark:text-zinc-400 mb-3 uppercase tracking-[0.2em] ml-2">Book Theme or Niche</label>
                      <div className="relative group/input">
                          <input 
                            type="text" 
                            id="topic" 
                            className="w-full px-8 py-6 text-2xl font-black border-2 border-zinc-100 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-white rounded-3xl focus:border-jocker-500 focus:ring-8 focus:ring-jocker-500/10 outline-none placeholder:text-zinc-300 dark:placeholder:text-zinc-800 transition-all shadow-inner" 
                            placeholder="e.g., Space Explorer Cats..." 
                            value={state.topic} 
                            onChange={(e) => setState({ ...state, topic: e.target.value })} 
                            onKeyDown={(e) => e.key === 'Enter' && handleGeneratePlan()} 
                          />
                          <Wand2 className="absolute right-6 top-6 text-jocker-500 h-10 w-10 opacity-30 group-hover/input:opacity-100 transition-opacity" />
                      </div>
                    </div>

                    <div className="bg-zinc-50 dark:bg-zinc-800/40 p-8 rounded-[2rem] border border-zinc-100 dark:border-zinc-800 mb-10 relative z-10">
                      <div className="flex items-center gap-3 mb-6 text-zinc-900 dark:text-white font-black text-lg uppercase tracking-widest"><Settings className="h-6 w-6 text-jocker-500" /> Page Specs</div>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                          <div><label className="block text-[10px] font-black text-zinc-400 uppercase tracking-widest mb-2 ml-1">Width</label><input type="number" step="0.1" value={state.dimensions.width} onChange={(e) => setState({ ...state, dimensions: { ...state.dimensions, width: parseFloat(e.target.value) } })} className="w-full px-5 py-4 bg-white dark:bg-zinc-900 border border-zinc-100 dark:border-zinc-700 rounded-2xl outline-none font-black text-zinc-900 dark:text-white" /></div>
                          <div><label className="block text-[10px] font-black text-zinc-400 uppercase tracking-widest mb-2 ml-1">Height</label><input type="number" step="0.1" value={state.dimensions.height} onChange={(e) => setState({ ...state, dimensions: { ...state.dimensions, height: parseFloat(e.target.value) } })} className="w-full px-5 py-4 bg-white dark:bg-zinc-900 border border-zinc-100 dark:border-zinc-700 rounded-2xl outline-none font-black text-zinc-900 dark:text-white" /></div>
                          <div><label className="block text-[10px] font-black text-zinc-400 uppercase tracking-widest mb-2 ml-1">Unit</label><select value={state.dimensions.unit} onChange={(e) => setState({ ...state, dimensions: { ...state.dimensions, unit: e.target.value as 'in' | 'px' } })} className="w-full px-5 py-4 bg-white dark:bg-zinc-900 border border-zinc-100 dark:border-zinc-700 rounded-2xl outline-none font-black text-zinc-900 dark:text-white appearance-none cursor-pointer"><option value="in">Inches (KDP)</option><option value="px">Pixels</option></select></div>
                      </div>
                    </div>

                    <button onClick={handleGeneratePlan} disabled={loading || !state.topic.trim()} className="w-full bg-jocker-900 dark:bg-jocker-600 hover:bg-jocker-800 dark:hover:bg-jocker-500 disabled:bg-zinc-200 text-white font-black py-7 rounded-[2rem] shadow-2xl transition-all flex items-center justify-center gap-4 text-2xl uppercase tracking-[0.2em]">
                      {loading ? <><Loader2 className="animate-spin h-8 w-8" /> Blueprinting...</> : "Start Generator"}
                    </button>
                  </div>
                </div>
              )}

              {state.step === 'planning' && state.metadata && (
                <div className="max-w-4xl mx-auto animate-in fade-in slide-in-from-bottom-6 duration-500">
                   <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-6 mb-12">
                       <h2 className="text-4xl font-black text-zinc-900 dark:text-white tracking-tighter">Blueprint Analysis</h2>
                       <button onClick={startImageGeneration} className="w-full sm:w-auto bg-green-600 hover:bg-green-700 text-white px-10 py-4 rounded-2xl font-black shadow-xl transition-all uppercase tracking-widest text-sm">Approve Interior Assets</button>
                   </div>
                   <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
                      <div className="bg-white dark:bg-zinc-900 p-10 rounded-[2.5rem] border border-zinc-100 dark:border-zinc-800 shadow-xl">
                          <h3 className="text-xl font-black mb-8 border-b dark:border-zinc-800 pb-6 flex items-center gap-3 text-jocker-600"><BookOpen className="h-6 w-6" /> Optimized Metadata</h3>
                          <div className="space-y-8">
                              <div><label className="text-[10px] font-black text-zinc-300 dark:text-zinc-600 uppercase tracking-[0.3em] mb-2 block">KDP Title</label><div className="font-black text-2xl text-zinc-900 dark:text-white leading-tight">{state.metadata.title}</div></div>
                              <div><label className="text-[10px] font-black text-zinc-300 dark:text-zinc-600 uppercase tracking-[0.3em] mb-2 block">Subtitle</label><div className="text-md text-zinc-600 dark:text-zinc-400 font-medium">{state.metadata.subtitle}</div></div>
                              <div><label className="text-[10px] font-black text-zinc-300 dark:text-zinc-600 uppercase tracking-[0.3em] mb-3 block">Backend Keywords</label><div className="flex flex-wrap gap-2">{state.metadata.keywords.map((kw, i) => <span key={i} className="bg-jocker-50 dark:bg-jocker-900/30 text-jocker-700 dark:text-jocker-400 px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wider border border-jocker-100 dark:border-jocker-800">{kw}</span>)}</div></div>
                          </div>
                      </div>
                      <div className="bg-white dark:bg-zinc-900 p-8 rounded-[2.5rem] border border-zinc-100 dark:border-zinc-800 shadow-xl h-[600px] overflow-y-auto custom-scrollbar">
                          <h3 className="text-xl font-black mb-6 sticky top-0 bg-white dark:bg-zinc-900 z-10 pb-6 border-b dark:border-zinc-800">Interior List ({state.pages.length})</h3>
                          <ul className="space-y-6">
                              {state.pages.map((p, i) => <li key={p.id} className="text-sm flex gap-4 p-4 rounded-2xl hover:bg-zinc-50 dark:hover:bg-zinc-800/50 border border-transparent hover:border-zinc-100 dark:hover:border-zinc-800"><span className="font-black text-jocker-400 mt-1">{(i+1).toString().padStart(2, '0')}</span> <div><span className="font-black block text-zinc-800 dark:text-zinc-200 text-lg leading-tight mb-1">{p.title}</span><span className="text-xs text-zinc-500 dark:text-zinc-500 leading-relaxed block">{p.prompt}</span></div></li>)}
                          </ul>
                      </div>
                   </div>
                </div>
              )}

              {state.step === 'generating' && (
                   <div className="max-w-4xl mx-auto text-center mt-20 animate-in fade-in duration-500">
                       <div className="relative inline-block mb-10">
                            <Loader2 className="h-24 w-24 text-jocker-600 animate-spin mx-auto" />
                            <Ghost className="h-10 w-10 text-jocker-400 absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 animate-pulse" />
                       </div>
                       <h2 className="text-4xl font-black mb-4 tracking-tighter">Manufacturing Assets...</h2>
                       <p className="text-zinc-500 dark:text-zinc-400 mb-12 text-lg font-medium">Please stay on this page. High-resolution vectorization is in progress.</p>
                       <div className="w-full bg-zinc-200 dark:bg-zinc-800 rounded-full h-8 mb-4 overflow-hidden shadow-inner p-1">
                            <div className="bg-gradient-to-r from-jocker-600 to-indigo-500 h-6 rounded-full transition-all duration-700 relative overflow-hidden" style={{ width: `${progress}%` }}>
                                <div className="absolute inset-0 bg-white/20 animate-[shimmer_2s_infinite]"></div>
                            </div>
                       </div>
                       <div className="flex justify-between text-[10px] font-black uppercase tracking-[0.3em] text-zinc-400 px-2"><span>Building Interior</span><span>{progress}% Optimized</span></div>
                       
                       <div className="mt-20 grid grid-cols-2 sm:grid-cols-4 md:grid-cols-5 gap-6">
                           {state.pages.map((p, i) => (
                             <div key={p.id} className="aspect-[1/1.41] bg-white dark:bg-zinc-900 rounded-2xl border-2 border-zinc-100 dark:border-zinc-800 flex flex-col items-center justify-center relative overflow-hidden shadow-md">
                                {p.status === 'completed' && p.imageUrl ? (
                                    <img src={p.imageUrl} className="w-full h-full object-contain p-3" alt="Interior" />
                                ) : p.status === 'generating' ? (
                                    <Loader2 className="h-8 w-8 text-jocker-200 animate-spin" />
                                ) : (
                                    <div className="text-[10px] font-black text-zinc-200 dark:text-zinc-800 tracking-widest">#{i+1} QUEUED</div>
                                )}
                                <div className="absolute bottom-2 right-2 bg-black/60 backdrop-blur-sm text-white text-[8px] font-black px-2 py-0.5 rounded-full uppercase">P{i+1}</div>
                             </div>
                           ))}
                       </div>
                   </div>
              )}

              {state.step === 'review' && (
                  <div className="max-w-6xl mx-auto animate-in fade-in slide-in-from-bottom-8 duration-700">
                      <div className="bg-jocker-900 text-white p-8 md:p-16 rounded-[4rem] shadow-3xl flex flex-col md:flex-row justify-between items-center gap-10 mb-16 relative overflow-hidden">
                          <div className="absolute top-0 right-0 p-12 opacity-5 pointer-events-none">
                               <Gem className="h-64 w-64" />
                          </div>
                          <div className="relative z-10 text-center md:text-left">
                              <h2 className="text-5xl font-black mb-3 tracking-tighter">Studio Complete!</h2>
                              <p className="text-jocker-300 font-bold text-lg">Optimized for {state.dimensions.width}x{state.dimensions.height} {state.dimensions.unit} KDP Upload</p>
                          </div>
                          <div className="flex flex-col sm:flex-row gap-6 relative z-10 w-full md:w-auto">
                            <button onClick={handleDownloadZip} className="flex-1 bg-white text-jocker-900 px-10 py-5 rounded-[2rem] font-black shadow-2xl transition-all flex items-center justify-center gap-3 text-lg uppercase tracking-widest"><FileArchive className="h-6 w-6" /> ZIP BUNDLE</button>
                            <button onClick={handleDownloadPDF} className="flex-1 bg-jocker-600 text-white px-10 py-5 rounded-[2rem] font-black shadow-2xl transition-all flex items-center justify-center gap-3 text-lg uppercase tracking-widest"><Download className="h-6 w-6" /> PDF INTERIOR</button>
                          </div>
                      </div>

                      <div className="flex flex-col gap-4 mb-10">
                          <h3 className="text-2xl font-black text-zinc-900 dark:text-white uppercase tracking-widest ml-4">Generated Interior Assets</h3>
                          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-8">
                              {state.pages.map((p, idx) => (
                                  <div key={p.id} className="group relative flex flex-col">
                                      <div className="aspect-[1/1.41] bg-white dark:bg-zinc-900 rounded-3xl border-2 border-zinc-100 dark:border-zinc-800 p-4 group-hover:border-jocker-500 group-hover:shadow-2xl transition-all cursor-pointer relative shadow-lg overflow-hidden">
                                          {p.imageUrl && <img src={p.imageUrl} className="w-full h-full object-contain group-hover:scale-105 transition-transform duration-500" alt="Page" />}
                                          <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center p-6 backdrop-blur-[2px]">
                                                <button onClick={() => handleDownloadSinglePNG(p.imageUrl!, `Interior_Page_${idx+1}.png`)} className="bg-white text-jocker-900 p-4 rounded-2xl shadow-xl transform scale-50 group-hover:scale-100 transition-all duration-300"><Download className="h-6 w-6" /></button>
                                          </div>
                                      </div>
                                      <div className="mt-4 px-3 flex justify-between items-center">
                                          <div>
                                              <span className="text-[9px] font-black text-zinc-400 uppercase tracking-widest block mb-1">Asset</span>
                                              <span className="text-xs font-black text-zinc-800 dark:text-white uppercase tracking-tight">#{idx+1} — {p.title.slice(0, 10)}...</span>
                                          </div>
                                          {p.status === 'failed' && <button onClick={() => handleRetryPage(p.id, p.prompt)} className="bg-red-50 dark:bg-red-950 p-2 rounded-lg text-red-600"><RefreshCw className="h-4 w-4" /></button>}
                                      </div>
                                  </div>
                              ))}
                          </div>
                      </div>
                  </div>
              )}
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
                           <span className="font-black text-2xl tracking-tighter text-zinc-900 dark:text-white">AI KDP STUDIO</span>
                      </div>
                      <p className="text-zinc-500 dark:text-zinc-400 max-w-sm text-sm font-medium leading-relaxed">
                          The most advanced AI-powered generation engine for Amazon KDP publishers. Create professional interiors and metadata in seconds.
                      </p>
                  </div>
                  <div>
                      <h4 className="text-[10px] font-black uppercase tracking-[0.3em] text-zinc-400 mb-6">Explore</h4>
                      <ul className="space-y-4 text-sm font-bold text-zinc-600 dark:text-zinc-300">
                          <li><button onClick={() => navigate('home')} className="hover:text-jocker-600 transition-colors">Generator</button></li>
                          <li><button onClick={() => navigate('vip')} className="hover:text-jocker-600 transition-colors">Pricing</button></li>
                          <li><button onClick={() => navigate('canva')} className="hover:text-jocker-600 transition-colors">Canva Sync</button></li>
                      </ul>
                  </div>
                  <div>
                      <h4 className="text-[10px] font-black uppercase tracking-[0.3em] text-zinc-400 mb-6">Account</h4>
                      <ul className="space-y-4 text-sm font-bold text-zinc-600 dark:text-zinc-300">
                          <li><button onClick={() => navigate('login')} className="hover:text-jocker-600 transition-colors">Login</button></li>
                          <li><button onClick={() => navigate('register')} className="hover:text-jocker-600 transition-colors">Sign Up</button></li>
                          <li><button className="hover:text-jocker-600 transition-colors">Help Center</button></li>
                      </ul>
                  </div>
              </div>
              <div className="flex flex-col md:flex-row justify-between items-center gap-8 pt-10 border-t border-zinc-100 dark:border-zinc-900">
                  <p className="text-zinc-400 text-[10px] font-black uppercase tracking-widest">© 2025 AI KDP Studio. All Rights Reserved.</p>
                  <div className="flex gap-8 items-center opacity-40 grayscale hover:grayscale-0 transition-all">
                      <CreditCard className="h-8 w-8 text-zinc-600 dark:text-zinc-400" />
                      <Bitcoin className="h-8 w-8 text-zinc-600 dark:text-zinc-400" />
                      <span className="font-black text-xl italic text-zinc-600 dark:text-zinc-400">SecurePay</span>
                  </div>
              </div>
          </div>
      </footer>
    </div>
  );
}