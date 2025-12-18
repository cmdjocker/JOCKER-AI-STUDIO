// @ts-nocheck
import { useState, useEffect, useRef } from 'react';
import { 
  BookOpen, 
  Download, 
  Loader2, 
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
  Mail,
  User,
  ArrowLeft,
  Zap,
  RotateCcw,
  ExternalLink,
  ChevronRight,
  Wand2,
  Trash2,
  Layout,
  Layers,
  Sparkles
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
  const [darkMode, setDarkMode] = useState(false);

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
      message = "Quota Limit. Please wait a few seconds before your next manual generation.";
      isQuota = true;
    } else {
      message = errStr;
    }
    setError({ message, isQuota });
    setLoading(false);
  };

  const navigate = (view: ViewType) => {
    setError(null);
    setState(prev => {
      if (view === 'home') return { ...INITIAL_STATE, view: 'home', dimensions: prev.dimensions };
      return { ...prev, view };
    });
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

  const generateSinglePage = async (pageId: string) => {
    setError(null);
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

  const generateCover = async () => {
    if (!state.metadata) return;
    setLoading(true);
    try {
      const aspectRatio = getClosestAspectRatio(state.dimensions.width, state.dimensions.height);
      const cover = await generateCoverImage(state.topic, state.metadata.title, aspectRatio);
      setState(prev => ({ ...prev, coverImage: cover }));
    } catch (err) {
      handleError(err);
    } finally {
      setLoading(false);
    }
  };

  const clearPage = (pageId: string) => {
    setState(prev => ({
      ...prev,
      pages: prev.pages.map(p => p.id === pageId ? { ...p, status: 'pending', imageUrl: undefined } : p)
    }));
  };

  const completedCount = state.pages.filter(p => p.status === 'completed').length;

  const AdSidebar = ({ side }: { side: 'left' | 'right' }) => (
    <aside className={`hidden xl:flex flex-col w-[260px] shrink-0 p-6 gap-6 border-slate-200 dark:border-slate-800 bg-white/40 dark:bg-slate-900/40 ${side === 'left' ? 'border-r' : 'border-l'}`}>
        <div className="w-full h-[600px] ad-pattern rounded-3xl border border-dashed border-slate-300 dark:border-slate-700 flex flex-col items-center justify-center text-slate-400 p-8 text-center relative overflow-hidden group">
            <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-brand-950 dark:bg-slate-100 text-white dark:text-brand-950 text-[10px] font-black uppercase tracking-widest px-3 py-1 rounded shadow-lg">SPONSORED</div>
            <ImageIcon className="h-12 w-12 mb-4 opacity-20 group-hover:scale-110 transition-transform text-brand-600" />
            <span className="text-[10px] font-black uppercase tracking-widest opacity-60 leading-tight">Premium KDP Asset Space<br/>Available Now</span>
        </div>
        {side === 'right' && (
            <div className="w-full h-[280px] bg-gradient-to-br from-brand-600 to-indigo-600 rounded-3xl p-8 text-white flex flex-col justify-end gap-3 shadow-2xl hover:-translate-y-1 transition-all">
                 <div className="bg-white/20 p-2 rounded-lg w-fit"><Crown className="h-5 w-5" /></div>
                 <h4 className="font-black text-sm leading-tight uppercase tracking-tighter">UNLIMITED<br/>STUDIO ASSETS</h4>
                 <button onClick={() => navigate('vip')} className="bg-white text-brand-950 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-slate-100 transition-colors shadow-lg">Upgrade Now</button>
            </div>
        )}
    </aside>
  );

  const AuthView = ({ mode }: { mode: 'login' | 'register' }) => (
    <div className="max-w-md mx-auto py-20 animate-in fade-in slide-in-from-bottom-8">
        <div className="bg-white dark:bg-slate-900 p-12 rounded-[3.5rem] shadow-2xl border border-slate-100 dark:border-slate-800 relative">
            <button onClick={() => navigate('home')} className="absolute top-8 left-8 p-3 rounded-full bg-slate-50 dark:bg-slate-800 text-slate-400 hover:text-brand-600 transition-colors">
                <ArrowLeft className="h-5 w-5" />
            </button>
            <div className="text-center mb-10">
                <div className="bg-brand-50 dark:bg-brand-900/30 text-brand-600 p-5 rounded-3xl w-fit mx-auto mb-6">
                    {mode === 'register' ? <UserPlus className="h-8 w-8" /> : <Lock className="h-8 w-8" />}
                </div>
                <h2 className="text-3xl font-black dark:text-white tracking-tighter mb-2">{mode === 'register' ? 'Join the Studio' : 'Welcome Back'}</h2>
                <p className="text-slate-500 font-medium">Power up your publishing career.</p>
            </div>
            <div className="space-y-6">
                <div>
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 block">Email Address</label>
                    <input type="email" className="w-full px-6 py-4 bg-slate-50 dark:bg-slate-950 border border-slate-100 dark:border-slate-800 rounded-2xl outline-none focus:border-brand-500 font-bold dark:text-white" placeholder="user@example.com" />
                </div>
                <div>
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 block">Password</label>
                    <input type="password" className="w-full px-6 py-4 bg-slate-50 dark:bg-slate-950 border border-slate-100 dark:border-slate-800 rounded-2xl outline-none focus:border-brand-500 font-bold dark:text-white" placeholder="••••••••" />
                </div>
                <button onClick={() => navigate('home')} className="w-full bg-brand-600 hover:bg-brand-700 text-white font-black py-5 rounded-2xl shadow-xl transition-all uppercase tracking-widest text-xs">
                    {mode === 'register' ? 'Create Account' : 'Sign In'}
                </button>
                <div className="text-center">
                    <button onClick={() => navigate(mode === 'register' ? 'login' : 'register')} className="text-xs font-bold text-slate-400 hover:text-brand-600">
                        {mode === 'register' ? 'Already have an account? Login' : "Don't have an account? Register"}
                    </button>
                </div>
            </div>
        </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 transition-colors duration-300 flex flex-col font-sans">
      <header className="bg-brand-950 text-white shadow-2xl sticky top-0 z-50 border-b border-brand-900 h-24 backdrop-blur-md bg-opacity-95">
        <div className="max-w-[1440px] mx-auto px-6 h-full flex items-center justify-between">
          <button onClick={() => navigate('home')} className="flex items-center gap-4 group">
            <div className="bg-white text-brand-950 p-2.5 rounded-xl shadow-xl transition-transform group-hover:scale-105">
               <Ghost className="h-8 w-8" />
            </div>
            <div className="text-left">
                <span className="font-black text-xl md:text-2xl tracking-tighter block leading-none">AI KDP STUDIO</span>
                <span className="text-[10px] font-bold tracking-[0.3em] text-brand-400 block mt-1 uppercase">PRO PUBLISHING</span>
            </div>
          </button>
          
          <div className="flex items-center gap-4">
             <nav className="hidden md:flex gap-8 mr-6">
                <button onClick={() => navigate('home')} className={`text-[10px] font-black uppercase tracking-widest ${state.view === 'home' ? 'text-brand-400' : 'text-slate-400 hover:text-white'}`}>Studio</button>
                <button onClick={() => navigate('vip')} className={`text-[10px] font-black uppercase tracking-widest ${state.view === 'vip' ? 'text-amber-400' : 'text-slate-400 hover:text-white'}`}>VIP Pricing</button>
                <button onClick={() => navigate('canva')} className={`text-[10px] font-black uppercase tracking-widest ${state.view === 'canva' ? 'text-indigo-400' : 'text-slate-400 hover:text-white'}`}>Canva Sync</button>
             </nav>
             <button onClick={() => setDarkMode(!darkMode)} className="p-3 rounded-2xl bg-white/5 hover:bg-white/10 transition-all">
               {darkMode ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
             </button>
             <button onClick={() => navigate('register')} className="bg-brand-600 hover:bg-brand-700 text-white px-8 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest shadow-xl transition-all active:scale-95">Join Now</button>
          </div>
        </div>
      </header>

      <div className="flex-grow flex justify-center w-full max-w-[1700px] mx-auto relative">
        <AdSidebar side="left" />

        <main className="flex-1 max-w-6xl px-8 py-12 w-full min-w-0">
          {error && (
            <div className={`mb-10 p-8 rounded-3xl shadow-2xl flex items-start gap-6 animate-in slide-in-from-top-4 border-l-8 ${error.isQuota ? 'bg-amber-50 dark:bg-amber-950/30 border-amber-500' : 'bg-red-50 dark:bg-red-950/30 border-red-600'}`}>
              <AlertCircle className={`h-10 w-10 mt-1 ${error.isQuota ? 'text-amber-600' : 'text-red-600'}`} />
              <div className="flex-grow">
                <p className="font-black uppercase text-xs tracking-widest mb-1">{error.isQuota ? 'Speed Restriction' : 'Error Alert'}</p>
                <p className="text-sm font-bold text-slate-700 dark:text-slate-300">{error.message}</p>
              </div>
              <button onClick={() => setError(null)} className="text-slate-400 hover:text-slate-600 p-2">✕</button>
            </div>
          )}

          {state.view === 'home' && (
            <>
              {state.step === 'input' && (
                <div className="max-w-4xl mx-auto mt-12 text-center animate-in fade-in duration-700">
                  <h1 className="text-6xl md:text-8xl font-black text-slate-900 dark:text-white mb-8 tracking-tighter leading-[0.9]">
                    Publish <br/>
                    <span className="text-transparent bg-clip-text bg-gradient-to-r from-brand-600 to-cyan-500">Fast & Precise</span>
                  </h1>
                  <p className="text-xl text-slate-500 dark:text-slate-400 mb-12 font-medium">Draft complete interiors and SEO metadata. Generate each page manually to maintain full quality control.</p>
                  
                  <div className="bg-white dark:bg-slate-900 p-12 rounded-[3.5rem] shadow-2xl border border-slate-100 dark:border-slate-800 text-left relative overflow-hidden">
                    <div className="mb-10">
                        <label className="block text-[10px] font-black text-slate-400 mb-4 uppercase tracking-[0.3em]">Target Niche / Topic</label>
                        <input 
                            type="text" 
                            className="w-full px-8 py-6 text-2xl font-black border-2 border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-white rounded-3xl outline-none focus:border-brand-500 transition-all shadow-inner" 
                            placeholder="e.g., Robot Dinosaurs, Underwater Tea Party..." 
                            value={state.topic} 
                            onChange={(e) => setState({ ...state, topic: e.target.value })} 
                        />
                    </div>
                    <button onClick={handleGeneratePlan} disabled={loading || !state.topic.trim()} className="w-full bg-brand-950 dark:bg-brand-600 hover:bg-brand-900 text-white font-black py-7 rounded-3xl shadow-2xl flex items-center justify-center gap-4 text-2xl uppercase tracking-widest disabled:opacity-50 transition-all active:scale-[0.98]">
                      {loading ? <Loader2 className="animate-spin h-8 w-8" /> : "Start Production"}
                    </button>
                  </div>
                </div>
              )}

              {(state.step === 'planning' || state.step === 'generating' || state.step === 'review') && state.metadata && (
                <div className="animate-in fade-in slide-in-from-bottom-8">
                   <div className="flex flex-col lg:flex-row justify-between items-end gap-6 mb-12 bg-white dark:bg-slate-900 p-10 rounded-[3rem] border border-slate-100 dark:border-slate-800 shadow-xl">
                       <div className="text-left">
                           <h2 className="text-4xl font-black dark:text-white tracking-tighter mb-2 leading-none">{state.metadata.title}</h2>
                           <p className="text-slate-500 font-bold uppercase tracking-widest text-[10px]">{completedCount}/20 Pages Rendered • SEO Blueprint Ready</p>
                       </div>
                       <div className="flex gap-4">
                           <button onClick={() => navigate('home')} className="px-6 py-4 rounded-2xl border-2 border-slate-200 dark:border-slate-700 text-slate-500 font-black text-[10px] uppercase tracking-widest hover:bg-slate-100 dark:hover:bg-slate-800 transition-all">New Niche</button>
                           {completedCount > 0 && (
                               <button onClick={() => generatePDF(state.metadata!, state.pages, state.dimensions, state.coverImage)} className="px-8 py-4 rounded-2xl bg-brand-600 text-white font-black text-[10px] uppercase tracking-widest flex items-center gap-2 shadow-2xl hover:bg-brand-700 transition-all hover:-translate-y-1"><Download className="h-4 w-4" /> Export KDP Bundle</button>
                           )}
                       </div>
                   </div>

                   <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
                      <div className="lg:col-span-1 space-y-6">
                          <div className="bg-white dark:bg-slate-900 p-8 rounded-[2.5rem] border border-slate-100 dark:border-slate-800 shadow-xl">
                              <h3 className="text-[10px] font-black mb-6 text-brand-600 uppercase tracking-widest flex items-center gap-2"><Sparkles className="h-4 w-4" /> Reach Keywords</h3>
                              <div className="flex flex-wrap gap-2">
                                  {state.metadata.keywords.map(kw => (
                                      <span key={kw} className="bg-slate-50 dark:bg-slate-800 text-[8px] font-black uppercase px-2 py-1 rounded border border-slate-100 dark:border-slate-700 dark:text-slate-400">{kw}</span>
                                  ))}
                              </div>
                          </div>
                          
                          <div className="bg-white dark:bg-slate-900 p-8 rounded-[2.5rem] border border-slate-100 dark:border-slate-800 shadow-xl relative">
                              <h3 className="text-[10px] font-black mb-6 text-brand-600 uppercase tracking-widest">Book Cover</h3>
                              {state.coverImage ? (
                                  <div className="group relative">
                                      <img src={state.coverImage} className="w-full aspect-[3/4] object-cover rounded-2xl shadow-lg transition-transform group-hover:scale-[1.02]" />
                                      <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center rounded-2xl">
                                          <button onClick={generateCover} className="bg-white text-brand-950 p-4 rounded-2xl shadow-2xl hover:scale-110 transition-transform"><RefreshCw className="h-5 w-5" /></button>
                                      </div>
                                  </div>
                              ) : (
                                  <button onClick={generateCover} disabled={loading} className="w-full aspect-[3/4] border-2 border-dashed border-slate-200 dark:border-slate-700 rounded-2xl flex flex-col items-center justify-center gap-4 text-slate-400 hover:border-brand-400 hover:text-brand-400 transition-all">
                                      {loading ? <Loader2 className="animate-spin h-10 w-10" /> : <ImageIcon className="h-10 w-10" />}
                                      <span className="text-[10px] font-black uppercase tracking-widest">Generate Cover</span>
                                  </button>
                              )}
                          </div>
                      </div>

                      <div className="lg:col-span-3">
                          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-8">
                              {state.pages.map((p, i) => (
                                  <div key={p.id} className={`bg-white dark:bg-slate-900 rounded-[2.5rem] border-2 shadow-2xl overflow-hidden transition-all flex flex-col group ${p.status === 'failed' ? 'border-red-500 shadow-red-500/10' : 'border-slate-100 dark:border-slate-800'}`}>
                                      <div className="p-5 border-b border-slate-50 dark:border-slate-800 flex justify-between items-center bg-slate-50/50 dark:bg-slate-800/30">
                                          <div className="flex flex-col">
                                              <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Page {i + 1}</span>
                                              <span className="font-black text-[10px] tracking-tight dark:text-white truncate max-w-[150px]">{p.title}</span>
                                          </div>
                                          <div className={`w-2.5 h-2.5 rounded-full ${p.status === 'completed' ? 'bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.5)]' : (p.status === 'generating' ? 'bg-brand-500 animate-pulse' : 'bg-slate-200 dark:bg-slate-700')}`}></div>
                                      </div>
                                      
                                      <div className="flex-1 aspect-[1/1.3] relative flex items-center justify-center bg-white dark:bg-slate-950">
                                          {p.status === 'completed' && p.imageUrl ? (
                                              <div className="relative w-full h-full">
                                                  <img src={p.imageUrl} className="w-full h-full object-contain p-4 animate-in zoom-in-95 duration-700" alt="Interior" />
                                                  <div className="absolute inset-0 bg-brand-950/80 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center gap-4">
                                                      <span className="text-white text-[10px] font-black uppercase tracking-widest">Design Complete</span>
                                                      <div className="flex gap-3">
                                                          <button onClick={() => saveAs(p.imageUrl!, `Page_${i+1}.png`)} className="bg-white text-brand-950 p-4 rounded-2xl shadow-2xl hover:scale-110 transition-transform"><Download className="h-5 w-5" /></button>
                                                          <button onClick={() => clearPage(p.id)} className="bg-red-500 text-white p-4 rounded-2xl shadow-2xl hover:scale-110 transition-transform"><Trash2 className="h-5 w-5" /></button>
                                                      </div>
                                                  </div>
                                              </div>
                                          ) : p.status === 'generating' ? (
                                              <div className="flex flex-col items-center gap-4">
                                                  <div className="relative">
                                                      <Loader2 className="h-12 w-12 text-brand-600 animate-spin" />
                                                      <div className="absolute inset-0 bg-brand-500/10 blur-xl rounded-full"></div>
                                                  </div>
                                                  <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest animate-pulse">Rendering...</span>
                                              </div>
                                          ) : p.status === 'failed' ? (
                                              <div className="flex flex-col items-center gap-4 text-center p-6">
                                                  <AlertCircle className="h-12 w-12 text-red-500" />
                                                  <button onClick={() => generateSinglePage(p.id)} className="bg-red-500 hover:bg-red-600 text-white px-6 py-3 rounded-xl font-black text-[10px] uppercase tracking-widest shadow-xl flex items-center gap-2"><RotateCcw className="h-4 w-4" /> Retry</button>
                                              </div>
                                          ) : (
                                              <div className="flex flex-col items-center gap-6 p-8 text-center">
                                                  <div className="p-8 bg-slate-50 dark:bg-slate-800 rounded-full text-slate-200 dark:text-slate-800">
                                                      <Wand2 className="h-12 w-12" />
                                                  </div>
                                                  <button onClick={() => generateSinglePage(p.id)} className="bg-brand-950 dark:bg-brand-600 hover:bg-brand-900 text-white px-8 py-4 rounded-2xl font-black text-[10px] uppercase tracking-[0.2em] shadow-2xl transition-all active:scale-95 flex items-center gap-3">
                                                      Generate <Zap className="h-4 w-4 text-brand-300" />
                                                  </button>
                                              </div>
                                          )}
                                      </div>
                                  </div>
                              ))}
                          </div>
                      </div>
                   </div>
                </div>
              )}
            </>
          )}

          {state.view === 'vip' && (
              <div className="max-w-4xl mx-auto py-20 text-center animate-in fade-in slide-in-from-bottom-6">
                  <Crown className="h-20 w-20 text-amber-500 mx-auto mb-10" />
                  <h2 className="text-6xl font-black dark:text-white tracking-tighter mb-6">VIP Studio Access</h2>
                  <p className="text-xl text-slate-500 dark:text-slate-400 mb-16 max-w-2xl mx-auto font-medium leading-relaxed">Unlock 4K rendering, unlimited daily pages, and instant SEO niche deep-dives with our Professional plan.</p>
                  <div className="bg-white dark:bg-slate-900 p-16 rounded-[4rem] border border-slate-100 dark:border-slate-800 shadow-[0_50px_100px_rgba(0,0,0,0.1)] text-left">
                      <div className="flex justify-between items-center mb-10 border-b dark:border-slate-800 pb-10">
                          <div>
                              <h3 className="text-3xl font-black dark:text-white">Pro Publisher</h3>
                              <p className="text-slate-500 font-bold uppercase tracking-widest text-xs mt-2">Unlimited Batch Generation</p>
                          </div>
                          <div className="text-5xl font-black dark:text-white tracking-tighter">$29<span className="text-lg text-slate-400 font-bold tracking-normal">/mo</span></div>
                      </div>
                      <ul className="space-y-6 mb-12">
                          {['Batch Upload Automation', '4K High-Res Graphics', 'Full Commercial Rights', 'Priority Generation Server', 'Canva Direct Export'].map(item => (
                              <li key={item} className="flex items-center gap-4 font-bold text-slate-700 dark:text-slate-300">
                                  <CheckCircle2 className="h-6 w-6 text-emerald-500" /> {item}
                              </li>
                          ))}
                      </ul>
                      <button className="w-full bg-brand-950 dark:bg-brand-600 hover:bg-brand-900 text-white font-black py-7 rounded-3xl shadow-3xl uppercase tracking-widest text-lg transition-all hover:-translate-y-1">Subscribe Instantly</button>
                  </div>
              </div>
          )}

          {state.view === 'canva' && (
             <div className="max-w-4xl mx-auto py-24 text-center animate-in fade-in">
                <div className="bg-indigo-50 dark:bg-indigo-950/30 p-16 rounded-[4rem] border border-indigo-100 dark:border-indigo-900 shadow-3xl">
                    <Layout className="h-24 w-24 text-brand-600 mx-auto mb-10" />
                    <h2 className="text-5xl font-black mb-8 dark:text-white tracking-tighter">Canva Sync integration</h2>
                    <p className="text-slate-500 dark:text-slate-400 text-xl mb-12 max-w-xl mx-auto font-medium leading-relaxed">Directly sync your AI-generated coloring pages to your Canva designs. Create professional covers and multi-page interiors with one click.</p>
                    <div className="flex justify-center gap-6">
                        <button className="bg-indigo-600 text-white px-12 py-6 rounded-3xl font-black text-xs uppercase tracking-widest shadow-2xl hover:bg-indigo-700 transition-all hover:-translate-y-1">Connect Your Account</button>
                        <button onClick={() => navigate('home')} className="px-12 py-6 rounded-3xl border-2 border-indigo-200 dark:border-indigo-800 text-indigo-600 dark:text-indigo-400 font-black text-xs uppercase tracking-widest hover:bg-indigo-50 dark:hover:bg-indigo-900/50">Back to Studio</button>
                    </div>
                </div>
             </div>
          )}

          {(state.view === 'register' || state.view === 'login') && <AuthView mode={state.view} />}
        </main>

        <AdSidebar side="right" />
      </div>

      <footer className="mt-auto bg-white dark:bg-slate-950 border-t border-slate-200 dark:border-slate-800 py-20 text-center">
          <div className="max-w-6xl mx-auto px-10">
              <div className="flex flex-col md:flex-row justify-between items-center gap-8 mb-12">
                  <div className="flex items-center gap-3">
                       <Ghost className="h-8 w-8 text-brand-600" />
                       <span className="font-black text-2xl tracking-tighter dark:text-white">AI KDP STUDIO</span>
                  </div>
                  <nav className="flex gap-8 text-[10px] font-black uppercase tracking-widest text-slate-400">
                      <button onClick={() => navigate('home')} className="hover:text-brand-600">Home</button>
                      <button onClick={() => navigate('vip')} className="hover:text-brand-600">Pricing</button>
                      <button onClick={() => navigate('canva')} className="hover:text-brand-600">Integrations</button>
                      <button className="hover:text-brand-600">Privacy</button>
                  </nav>
              </div>
              <p className="text-slate-400 text-[10px] font-black uppercase tracking-[0.3em] mb-10">© 2025 AI KDP Studio. Optimized for Amazon Kindle Direct Publishing.</p>
              <div className="flex justify-center gap-10 opacity-30 h-8 items-center">
                  <span className="font-black text-[9px] uppercase tracking-widest">Veo 3.1 Ready</span>
                  <span className="font-black text-[9px] uppercase tracking-widest">Gemini 2.5 Flash</span>
                  <span className="font-black text-[9px] uppercase tracking-widest">KDP Interior Standard</span>
                  <span className="font-black text-[9px] uppercase tracking-widest">Batch Render Engine</span>
              </div>
          </div>
      </footer>
    </div>
  );
}
