// @ts-nocheck
import { useState, useEffect, useRef } from 'react';
import { 
  BookOpen, 
  Download, 
  Loader2, 
  RefreshCw, 
  AlertCircle, 
  Image as ImageIcon,
  Settings,
  FileArchive,
  Moon,
  Sun,
  Crown,
  Ghost,
  Lock,
  CheckCircle2,
  Layout,
  Layers,
  Mail,
  User,
  ArrowLeft,
  Gauge,
  Zap,
  ShieldCheck,
  RotateCcw
} from 'lucide-react';
import JSZip from 'jszip';
import * as FileSaver from 'file-saver';
import { generateBookPlan, generateColoringPage, generateCoverImage, getClosestAspectRatio } from './services/gemini';
import { generatePDF } from './services/pdfGenerator';
import { BookPlan, GenerationState, PageDefinition, ViewType } from './types';

const saveAs = FileSaver.saveAs || (FileSaver.default ? (FileSaver.default.saveAs || FileSaver.default) : FileSaver);

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
  const [concurrency, setConcurrency] = useState<'safe' | 'turbo'>('safe');

  const isGeneratingImagesRef = useRef(false);

  useEffect(() => {
    if (darkMode) document.documentElement.classList.add('dark');
    else document.documentElement.classList.remove('dark');
  }, [darkMode]);

  const handleError = (err: any) => {
    console.error("Studio Logic Error:", err);
    let message = "An unexpected error occurred.";
    let isQuota = false;

    const errStr = typeof err === 'string' ? err : (err.message || JSON.stringify(err));
    if (errStr.includes("RESOURCE_EXHAUSTED") || errStr.includes("429") || errStr.includes("quota")) {
      message = "Quota Limit Reached. Use 'Safe Mode' or enable billing in Google AI Studio for higher speeds.";
      isQuota = true;
    } else {
      message = errStr;
    }

    setError({ message, isQuota });
    setLoading(false);
  };

  const navigate = (view: ViewType) => {
    setState(prev => view === 'home' ? { ...INITIAL_STATE, view: 'home', dimensions: prev.dimensions } : { ...prev, view });
    setError(null);
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
      setState(prev => ({ ...prev, step: 'planning', metadata: plan.metadata, pages: initialPages }));
    } catch (err) {
      handleError(err);
    } finally {
      setLoading(false);
    }
  };

  const retryPage = async (pageId: string) => {
    const page = state.pages.find(p => p.id === pageId);
    if (!page) return;

    setState(prev => ({
      ...prev,
      pages: prev.pages.map(p => p.id === pageId ? { ...p, status: 'generating' } : p)
    }));

    try {
      const aspectRatio = getClosestAspectRatio(state.dimensions.width, state.dimensions.height);
      const base64Image = await generateColoringPage(page.prompt, aspectRatio);
      setState(prev => ({
        ...prev,
        pages: prev.pages.map(p => p.id === pageId ? { ...p, status: 'completed', imageUrl: base64Image } : p)
      }));
    } catch (err) {
      setState(prev => ({
        ...prev,
        pages: prev.pages.map(p => p.id === pageId ? { ...p, status: 'failed' } : p)
      }));
      handleError(err);
    }
  };

  const startImageGeneration = async () => {
    isGeneratingImagesRef.current = true;
    setProgress(0);
    const targetState = { ...state, step: 'generating' as const };
    setState(targetState);
    processQueue(targetState);
  };

  const processQueue = async (initialState: GenerationState) => {
    const BATCH_SIZE = concurrency === 'turbo' ? 3 : 1;
    const DELAY = concurrency === 'turbo' ? 2000 : 4000;
    const aspectRatio = getClosestAspectRatio(initialState.dimensions.width, initialState.dimensions.height);

    generateCoverImage(initialState.topic, initialState.metadata?.title || "Coloring Ebook", aspectRatio)
        .then(cover => setState(prev => ({ ...prev, coverImage: cover })))
        .catch(() => console.warn("Cover image failed, but continuing..."));

    let pagesToProcess = [...initialState.pages];

    while (pagesToProcess.some(p => p.status === 'pending') && isGeneratingImagesRef.current) {
        const batch = pagesToProcess.filter(p => p.status === 'pending').slice(0, BATCH_SIZE);
        
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
                setState(prev => ({ ...prev, pages: prev.pages.map(p => p.id === page.id ? { ...p, status: 'failed' } : p) }));
                if (JSON.stringify(err).includes("429") || JSON.stringify(err).includes("RESOURCE_EXHAUSTED")) {
                    isGeneratingImagesRef.current = false;
                    handleError(err);
                }
            }
        }));

        setState(prev => {
            const done = prev.pages.filter(p => p.status === 'completed' || p.status === 'failed').length;
            setProgress(Math.round((done / prev.pages.length) * 100));
            return prev;
        });

        await new Promise(r => setTimeout(r, DELAY));
    }

    isGeneratingImagesRef.current = false;
    setState(prev => {
        const allDone = prev.pages.every(p => p.status === 'completed' || p.status === 'failed');
        if (allDone && prev.step === 'generating') return { ...prev, step: 'review' };
        return prev;
    });
  };

  const AuthView = ({ mode }: { mode: 'login' | 'register' }) => (
    <div className="max-w-md mx-auto animate-in fade-in slide-in-from-bottom-8 duration-500 py-12">
        <div className="bg-white dark:bg-slate-900 p-10 md:p-12 rounded-[3rem] shadow-2xl border border-slate-100 dark:border-slate-800 relative overflow-hidden">
            <button onClick={() => navigate('home')} className="absolute top-8 left-8 p-2 rounded-full bg-slate-50 dark:bg-slate-800 text-slate-400 hover:text-brand-600 transition-colors">
                <ArrowLeft className="h-5 w-5" />
            </button>
            <div className="text-center mb-10 mt-6">
                <div className="bg-brand-50 dark:bg-brand-900/30 text-brand-600 p-4 rounded-2xl w-fit mx-auto mb-6">
                    {mode === 'register' ? <UserPlus className="h-8 w-8" /> : <LogIn className="h-8 w-8" />}
                </div>
                <h2 className="text-3xl font-black dark:text-white tracking-tighter mb-2">
                    {mode === 'register' ? 'Create Account' : 'Welcome Back'}
                </h2>
                <p className="text-slate-500 text-sm font-medium">Join 50k+ publishers today.</p>
            </div>
            <form className="space-y-6" onSubmit={(e) => { e.preventDefault(); navigate('home'); }}>
                <div className="relative">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 block">Email Address</label>
                    <Mail className="absolute left-5 bottom-4 h-5 w-5 text-slate-400" />
                    <input type="email" className="w-full pl-14 pr-6 py-4 bg-slate-50 dark:bg-slate-950 border border-slate-100 dark:border-slate-800 rounded-2xl outline-none focus:border-brand-500 transition-all font-bold dark:text-white" placeholder="you@company.com" />
                </div>
                <button type="submit" className="w-full bg-brand-950 dark:bg-brand-600 hover:bg-brand-900 text-white font-black py-5 rounded-2xl shadow-xl transition-all uppercase tracking-widest text-xs">
                    {mode === 'register' ? 'Join Studio' : 'Sign In'}
                </button>
            </form>
        </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 transition-colors duration-300 flex flex-col font-sans">
      <header className="bg-brand-950 text-white shadow-2xl sticky top-0 z-50 border-b border-brand-900 h-24 backdrop-blur-md bg-opacity-95">
        <div className="max-w-[1440px] mx-auto px-6 h-full flex items-center justify-between">
          <button onClick={() => navigate('home')} className="flex items-center gap-4 hover:opacity-80 transition-all active:scale-95 text-left group">
            <div className="bg-white text-brand-950 p-2.5 rounded-xl shadow-xl">
               <Ghost className="h-8 w-8" />
            </div>
            <div>
                <span className="font-black text-xl md:text-2xl tracking-tighter block leading-none">AI KDP STUDIO</span>
                <span className="text-[10px] font-bold tracking-[0.3em] text-brand-400 block mt-1 uppercase">PRO PUBLISHING</span>
            </div>
          </button>
          <div className="flex items-center gap-4">
             <button onClick={() => setDarkMode(!darkMode)} className="p-3 rounded-2xl bg-white/5 hover:bg-white/10 transition-all">
               {darkMode ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
             </button>
             <button onClick={() => navigate('register')} className="bg-white text-brand-950 px-6 py-3 rounded-xl text-xs font-black uppercase tracking-widest shadow-xl">Join</button>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-6xl mx-auto px-6 py-12 w-full">
          {error && (
            <div className={`mb-10 p-6 rounded-3xl shadow-xl flex items-start gap-5 animate-in slide-in-from-top-4 border-l-8 ${error.isQuota ? 'bg-amber-50 dark:bg-amber-950/30 border-amber-500' : 'bg-red-50 dark:bg-red-950/30 border-red-600'}`}>
              <AlertCircle className={`h-8 w-8 mt-1 ${error.isQuota ? 'text-amber-600' : 'text-red-600'}`} />
              <div className="flex-grow">
                <p className="font-black uppercase text-xs tracking-widest mb-1">{error.isQuota ? 'API Speed Restricted' : 'System Alert'}</p>
                <p className="text-sm font-bold text-slate-700 dark:text-slate-300 mb-2">{error.message}</p>
                {error.isQuota && (
                  <a href="https://aistudio.google.com/app/billing" target="_blank" className="text-[10px] font-black uppercase tracking-widest bg-brand-600 text-white px-3 py-1 rounded-md inline-block hover:bg-brand-700">Upgrade For High Speed</a>
                )}
              </div>
              <button onClick={() => setError(null)} className="text-slate-400 hover:text-slate-600">✕</button>
            </div>
          )}

          {state.view === 'home' && (
            <>
              {state.step === 'input' && (
                <div className="max-w-3xl mx-auto mt-12 text-center">
                  <h1 className="text-6xl md:text-8xl font-black text-slate-900 dark:text-white mb-8 tracking-tighter leading-none">
                    Mass-Produce <br/>
                    <span className="text-transparent bg-clip-text bg-gradient-to-r from-brand-600 to-cyan-500">KDP Bestsellers</span>
                  </h1>
                  <div className="bg-white dark:bg-slate-900 p-10 rounded-[3rem] shadow-2xl border border-slate-100 dark:border-slate-800 text-left">
                    <label className="block text-xs font-black text-slate-400 mb-4 uppercase tracking-[0.2em]">Niche Topic</label>
                    <input type="text" className="w-full px-8 py-6 text-2xl font-black border-2 border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-white rounded-3xl mb-8 outline-none focus:border-brand-500" placeholder="e.g., Robot Ninjas, Kawaii Food..." value={state.topic} onChange={(e) => setState({ ...state, topic: e.target.value })} />
                    <button onClick={handleGeneratePlan} disabled={loading || !state.topic.trim()} className="w-full bg-brand-950 dark:bg-brand-600 text-white font-black py-7 rounded-[2rem] shadow-2xl flex items-center justify-center gap-4 text-2xl uppercase tracking-widest">
                      {loading ? <Loader2 className="animate-spin h-8 w-8" /> : "Start Production"}
                    </button>
                  </div>
                </div>
              )}

              {state.step === 'planning' && state.metadata && (
                <div className="animate-in fade-in slide-in-from-bottom-6">
                   <div className="flex justify-between items-center mb-10">
                       <h2 className="text-4xl font-black dark:text-white tracking-tighter">Blueprint Approved</h2>
                       <div className="flex items-center gap-4 bg-slate-100 dark:bg-slate-800 p-2 rounded-2xl border border-slate-200 dark:border-slate-700">
                          <button onClick={() => setConcurrency('safe')} className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest flex items-center gap-2 transition-all ${concurrency === 'safe' ? 'bg-white dark:bg-slate-700 shadow-md text-brand-600' : 'text-slate-400'}`}><ShieldCheck className="h-4 w-4" /> Safe Mode</button>
                          <button onClick={() => setConcurrency('turbo')} className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest flex items-center gap-2 transition-all ${concurrency === 'turbo' ? 'bg-white dark:bg-slate-700 shadow-md text-brand-600' : 'text-slate-400'}`}><Zap className="h-4 w-4" /> Turbo (Paid Keys)</button>
                       </div>
                   </div>
                   <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                      <div className="lg:col-span-1 bg-white dark:bg-slate-900 p-8 rounded-[2.5rem] border border-slate-100 dark:border-slate-800 shadow-xl">
                          <h3 className="text-xl font-black mb-6 text-brand-600 flex items-center gap-2"><Settings className="h-5 w-5" /> Config</h3>
                          <div className="space-y-4 mb-8">
                              <p className="text-xs font-bold text-slate-500 uppercase">Book Title</p>
                              <p className="font-black text-lg dark:text-white leading-tight">{state.metadata.title}</p>
                          </div>
                          <button onClick={startImageGeneration} className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-black py-5 rounded-2xl shadow-xl uppercase tracking-widest text-xs">Generate 20 Images</button>
                      </div>
                      <div className="lg:col-span-2 bg-white dark:bg-slate-900 p-8 rounded-[2.5rem] border border-slate-100 dark:border-slate-800 h-[500px] overflow-y-auto">
                          <ul className="space-y-4">
                              {state.pages.map((p, i) => <li key={p.id} className="flex gap-4 p-4 rounded-2xl hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors border border-transparent hover:border-slate-100 dark:hover:border-slate-700"><span className="font-black text-brand-400">{(i+1).toString().padStart(2, '0')}</span> <div><span className="font-black block text-slate-800 dark:text-slate-200">{p.title}</span><span className="text-xs text-slate-500">{p.prompt}</span></div></li>)}
                          </ul>
                      </div>
                   </div>
                </div>
              )}

              {state.step === 'generating' && (
                   <div className="text-center mt-12">
                       <div className="flex items-center justify-center gap-4 mb-8">
                           <Gauge className="h-10 w-10 text-brand-600 animate-pulse" />
                           <h2 className="text-4xl font-black dark:text-white tracking-tighter">AI Production Line Running</h2>
                       </div>
                       <div className="max-w-xl mx-auto mb-16">
                           <div className="flex justify-between text-[10px] font-black uppercase tracking-[0.2em] mb-3 text-slate-400">
                               <span>{progress}% Optimized</span>
                               <span className="text-brand-600">{concurrency === 'safe' ? 'Free Tier Protection Active' : 'Turbo Mode Active'}</span>
                           </div>
                           <div className="w-full bg-slate-200 dark:bg-slate-800 rounded-full h-4 overflow-hidden shadow-inner">
                                <div className="bg-gradient-to-r from-brand-600 to-cyan-400 h-full transition-all duration-700" style={{ width: `${progress}%` }}></div>
                           </div>
                       </div>
                       <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-5 gap-6">
                           {state.pages.map((p, i) => (
                             <div key={p.id} className={`aspect-[1/1.41] bg-white dark:bg-slate-900 rounded-2xl border-2 flex flex-col items-center justify-center relative overflow-hidden shadow-md transition-all ${p.status === 'failed' ? 'border-red-500 bg-red-50/50' : 'border-slate-100 dark:border-slate-800'}`}>
                                {p.status === 'completed' && p.imageUrl ? (
                                    <img src={p.imageUrl} className="w-full h-full object-contain p-3 animate-in zoom-in-95" alt="Page" />
                                ) : p.status === 'failed' ? (
                                    <div className="flex flex-col items-center gap-3 p-4 text-center">
                                        <AlertCircle className="h-8 w-8 text-red-500" />
                                        <button onClick={() => retryPage(p.id)} className="bg-red-500 text-white p-2 rounded-full shadow-lg hover:scale-110 transition-transform"><RotateCcw className="h-4 w-4" /></button>
                                        <span className="text-[8px] font-black text-red-500 uppercase tracking-widest">Limit Hit</span>
                                    </div>
                                ) : (
                                    <div className="flex flex-col items-center gap-3">
                                        <Loader2 className={`h-8 w-8 text-brand-200 ${p.status === 'generating' ? 'animate-spin' : ''}`} />
                                        <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest">{p.status === 'generating' ? 'Rendering' : 'Queued'}</span>
                                    </div>
                                )}
                                <div className={`absolute bottom-2 right-2 text-white text-[8px] font-black px-2 py-0.5 rounded-full ${p.status === 'completed' ? 'bg-emerald-600' : 'bg-black/40'}`}>P{i+1}</div>
                             </div>
                           ))}
                       </div>
                   </div>
              )}

              {state.step === 'review' && (
                  <div className="animate-in fade-in duration-700">
                      <div className="bg-brand-950 text-white p-12 rounded-[4rem] shadow-3xl flex flex-col md:flex-row justify-between items-center gap-10 mb-16 relative overflow-hidden">
                          <div className="relative z-10">
                              <h2 className="text-5xl font-black mb-3 tracking-tighter">Ready for Amazon!</h2>
                              <p className="text-brand-300 font-bold text-lg">Download your KDP-compliant interior package below.</p>
                          </div>
                          <div className="flex gap-4 relative z-10">
                            <button onClick={() => navigate('home')} className="bg-white/10 text-white px-8 py-5 rounded-[2rem] font-black text-xs uppercase tracking-widest border border-white/10">Start New</button>
                            <button onClick={() => generatePDF(state.metadata!, state.pages, state.dimensions, state.coverImage)} className="bg-brand-600 text-white px-10 py-5 rounded-[2rem] font-black shadow-2xl flex items-center gap-3 text-lg uppercase tracking-widest"><Download className="h-6 w-6" /> PDF Interior</button>
                          </div>
                      </div>
                      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-8">
                          {state.pages.map((p, idx) => (
                              <div key={p.id} className="aspect-[1/1.41] bg-white dark:bg-slate-900 rounded-3xl border-2 border-slate-100 dark:border-slate-800 p-4 shadow-lg group relative overflow-hidden">
                                  {p.imageUrl && <img src={p.imageUrl} className="w-full h-full object-contain" alt="Page" />}
                                  <div className="absolute inset-0 bg-brand-950/80 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                      <button onClick={() => saveAs(p.imageUrl!, `Page_${idx+1}.png`)} className="bg-white text-brand-950 p-4 rounded-2xl shadow-xl"><Download className="h-6 w-6" /></button>
                                  </div>
                              </div>
                          ))}
                      </div>
                  </div>
              )}
            </>
          )}

          {(state.view === 'register' || state.view === 'login') && <AuthView mode={state.view} />}
      </main>

      <footer className="mt-auto bg-white dark:bg-slate-950 border-t border-slate-200 dark:border-slate-800 py-12 text-center">
          <p className="text-slate-400 text-[10px] font-black uppercase tracking-widest">© 2025 AI KDP Studio. Using Gemini 2.5 Flash Engine.</p>
      </footer>
    </div>
  );
}
