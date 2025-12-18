// @ts-nocheck
import { useState, useEffect, useRef } from 'react';
import { 
  Download, 
  Loader2, 
  AlertCircle, 
  Image as ImageIcon,
  Settings,
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
  Sparkles,
  Info
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
      message = "Quota Restriction: The Gemini Free Tier has hit its limit. Please wait 10-15 seconds and try generating the page again.";
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
    <aside className={`hidden xl:flex flex-col w-[280px] shrink-0 p-8 gap-8 border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xl z-10 ${side === 'left' ? 'border-r' : 'border-l'}`}>
        <div className="w-full h-[600px] ad-pattern rounded-[2.5rem] border border-dashed border-slate-300 dark:border-slate-700 flex flex-col items-center justify-center text-slate-400 p-8 text-center relative group">
            <div className="absolute top-6 left-1/2 -translate-x-1/2 bg-brand-950 text-white dark:bg-white dark:text-brand-950 text-[10px] font-black uppercase tracking-[0.2em] px-4 py-1.5 rounded-full shadow-lg">ADS SPACE</div>
            <ImageIcon className="h-14 w-14 mb-6 opacity-10 group-hover:scale-110 transition-transform text-brand-600" />
            <p className="text-[10px] font-black uppercase tracking-widest opacity-40 leading-relaxed">Boost your KDP sales here.<br/>Premium Placement Available.</p>
        </div>
        
        {side === 'right' && (
            <div className="w-full bg-brand-950 rounded-[2.5rem] p-8 text-white relative overflow-hidden group hover:scale-[1.02] transition-transform">
                 <div className="relative z-10">
                     <Crown className="h-10 w-10 text-amber-500 mb-4" />
                     <h4 className="font-black text-xl leading-tight mb-4 tracking-tighter">VIP<br/>PUBLISHER</h4>
                     <p className="text-[10px] text-brand-400 font-bold uppercase tracking-widest mb-6">Unlimited AI Power</p>
                     <button onClick={() => navigate('vip')} className="w-full bg-white text-brand-950 py-4 rounded-2xl text-[10px] font-black uppercase tracking-widest shadow-2xl transition-all active:scale-95">Upgrade</button>
                 </div>
                 <div className="absolute -bottom-10 -right-10 w-32 h-32 bg-brand-600 rounded-full blur-3xl opacity-30"></div>
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
                    {mode === 'register' ? <User className="h-8 w-8" /> : <Lock className="h-8 w-8" />}
                </div>
                <h2 className="text-3xl font-black dark:text-white tracking-tighter mb-2">{mode === 'register' ? 'Join Studio' : 'Publisher Login'}</h2>
                <p className="text-slate-500 font-medium text-sm">Access your saved KDP blueprints.</p>
            </div>
            <div className="space-y-6">
                <input type="email" className="w-full px-6 py-4 bg-slate-50 dark:bg-slate-950 border border-slate-100 dark:border-slate-800 rounded-2xl outline-none focus:border-brand-500 font-bold dark:text-white" placeholder="Email" />
                <input type="password" className="w-full px-6 py-4 bg-slate-50 dark:bg-slate-950 border border-slate-100 dark:border-slate-800 rounded-2xl outline-none focus:border-brand-500 font-bold dark:text-white" placeholder="Password" />
                <button onClick={() => navigate('home')} className="w-full bg-brand-600 hover:bg-brand-700 text-white font-black py-5 rounded-2xl shadow-xl transition-all uppercase tracking-widest text-xs">
                    {mode === 'register' ? 'Create Account' : 'Sign In'}
                </button>
            </div>
        </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 transition-colors duration-300 flex flex-col font-sans">
      <header className="bg-brand-950 text-white shadow-2xl sticky top-0 z-50 border-b border-brand-900 h-24 backdrop-blur-md bg-opacity-95">
        <div className="max-w-[1700px] mx-auto px-8 h-full flex items-center justify-between">
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
             <nav className="hidden lg:flex items-center gap-10 mr-8">
                <button onClick={() => navigate('home')} className={`text-[10px] font-black uppercase tracking-widest transition-colors ${state.view === 'home' ? 'text-brand-400 underline underline-offset-8 decoration-2' : 'text-slate-400 hover:text-white'}`}>Home</button>
                <button onClick={() => navigate('vip')} className={`text-[10px] font-black uppercase tracking-widest transition-colors ${state.view === 'vip' ? 'text-amber-400 underline underline-offset-8 decoration-2' : 'text-slate-400 hover:text-white'}`}>VIP Pricing</button>
                <button onClick={() => navigate('canva')} className={`text-[10px] font-black uppercase tracking-widest transition-colors ${state.view === 'canva' ? 'text-indigo-400 underline underline-offset-8 decoration-2' : 'text-slate-400 hover:text-white'}`}>Canva Sync</button>
                <button onClick={() => navigate('login')} className="text-[10px] font-black uppercase tracking-widest text-slate-400 hover:text-white">Login</button>
             </nav>
             <button onClick={() => setDarkMode(!darkMode)} className="p-3 rounded-2xl bg-white/5 hover:bg-white/10 transition-all mr-2">
               {darkMode ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
             </button>
             <button onClick={() => navigate('register')} className="bg-brand-600 hover:bg-brand-700 text-white px-8 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest shadow-xl transition-all active:scale-95">Join Now</button>
          </div>
        </div>
      </header>

      <div className="flex-grow flex justify-center w-full max-w-[1920px] mx-auto">
        <AdSidebar side="left" />

        <main className="flex-1 max-w-6xl px-8 py-12 w-full min-w-0">
          {error && (
            <div className={`mb-10 p-8 rounded-3xl shadow-2xl flex items-start gap-6 animate-in slide-in-from-top-4 border-l-8 ${error.isQuota ? 'bg-amber-50 dark:bg-amber-950/30 border-amber-500' : 'bg-red-50 dark:bg-red-950/30 border-red-600'}`}>
              <AlertCircle className={`h-10 w-10 mt-1 ${error.isQuota ? 'text-amber-600' : 'text-red-600'}`} />
              <div className="flex-grow">
                <p className="font-black uppercase text-xs tracking-widest mb-1">{error.isQuota ? 'Speed Restricted' : 'API Alert'}</p>
                <p className="text-sm font-bold text-slate-700 dark:text-slate-300 leading-relaxed">{error.message}</p>
              </div>
              <button onClick={() => setError(null)} className="text-slate-400 hover:text-slate-600 p-2">✕</button>
            </div>
          )}

          {state.view === 'home' && (
            <>
              {state.step === 'input' && (
                <div className="max-w-4xl mx-auto mt-16 text-center animate-in fade-in duration-1000">
                  <h1 className="text-7xl md:text-9xl font-black text-slate-900 dark:text-white mb-10 tracking-tighter leading-[0.85]">
                    KDP <br/>
                    <span className="text-transparent bg-clip-text bg-gradient-to-r from-brand-600 to-cyan-500">PRO STUDIO</span>
                  </h1>
                  <p className="text-xl text-slate-500 dark:text-slate-400 mb-14 font-medium max-w-2xl mx-auto leading-relaxed">The ultimate manual command center for Amazon KDP publishers. Draft, design, and export interiors with precision.</p>
                  
                  <div className="bg-white dark:bg-slate-900 p-14 rounded-[4rem] shadow-3xl border border-slate-100 dark:border-slate-800 text-left relative overflow-hidden">
                    <div className="mb-12">
                        <label className="block text-[11px] font-black text-slate-400 mb-5 uppercase tracking-[0.4em]">Target Book Topic (High SEO)</label>
                        <input 
                            type="text" 
                            className="w-full px-10 py-8 text-3xl font-black border-2 border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-white rounded-[2.5rem] outline-none focus:border-brand-500 transition-all shadow-inner" 
                            placeholder="e.g., Space Astronauts, Cute Kittens..." 
                            value={state.topic} 
                            onChange={(e) => setState({ ...state, topic: e.target.value })} 
                        />
                    </div>
                    <button onClick={handleGeneratePlan} disabled={loading || !state.topic.trim()} className="w-full bg-brand-950 dark:bg-brand-600 hover:bg-brand-900 text-white font-black py-8 rounded-[2.5rem] shadow-2xl flex items-center justify-center gap-5 text-2xl uppercase tracking-widest disabled:opacity-50 transition-all active:scale-[0.98]">
                      {loading ? <Loader2 className="animate-spin h-10 w-10" /> : "Draft Interior Blueprint"}
                    </button>
                  </div>
                </div>
              )}

              {(state.step === 'planning' || state.step === 'generating' || state.step === 'review') && state.metadata && (
                <div className="animate-in fade-in slide-in-from-bottom-10 duration-700">
                   <div className="flex flex-col lg:flex-row justify-between items-end gap-8 mb-14 bg-white dark:bg-slate-900 p-12 rounded-[3.5rem] border border-slate-100 dark:border-slate-800 shadow-2xl">
                       <div className="text-left">
                           <h2 className="text-5xl font-black dark:text-white tracking-tighter mb-4 leading-none">{state.metadata.title}</h2>
                           <div className="flex items-center gap-4">
                               <span className="bg-brand-50 dark:bg-brand-900/30 text-brand-600 dark:text-brand-400 px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest border border-brand-100 dark:border-brand-800">
                                   {completedCount}/20 Pages Completed
                               </span>
                               <span className="text-slate-400 font-bold uppercase tracking-widest text-[10px]">Manual Production Engine active</span>
                           </div>
                       </div>
                       <div className="flex gap-4">
                           <button onClick={() => navigate('home')} className="px-8 py-5 rounded-3xl border-2 border-slate-200 dark:border-slate-700 text-slate-500 font-black text-[10px] uppercase tracking-widest hover:bg-slate-100 dark:hover:bg-slate-800 transition-all">Reset All</button>
                           {completedCount > 0 && (
                               <button onClick={() => generatePDF(state.metadata!, state.pages, state.dimensions, state.coverImage)} className="px-10 py-5 rounded-3xl bg-brand-600 text-white font-black text-[10px] uppercase tracking-widest flex items-center gap-3 shadow-2xl hover:bg-brand-700 transition-all hover:-translate-y-1"><Download className="h-5 w-5" /> Export PDF</button>
                           )}
                       </div>
                   </div>

                   <div className="grid grid-cols-1 lg:grid-cols-4 gap-10">
                      <div className="lg:col-span-1 space-y-8">
                          <div className="bg-white dark:bg-slate-900 p-10 rounded-[3rem] border border-slate-100 dark:border-slate-800 shadow-xl">
                              <h3 className="text-[11px] font-black mb-8 text-brand-600 uppercase tracking-widest flex items-center gap-3"><Sparkles className="h-5 w-5" /> SEO Strategy</h3>
                              <div className="space-y-4">
                                  <p className="text-[10px] font-bold text-slate-500 leading-relaxed uppercase tracking-widest mb-4">{state.metadata.subtitle}</p>
                                  <div className="flex flex-wrap gap-2.5">
                                      {state.metadata.keywords.map(kw => (
                                          <span key={kw} className="bg-slate-50 dark:bg-slate-800 text-[9px] font-black uppercase px-3 py-1.5 rounded-xl border border-slate-100 dark:border-slate-700 dark:text-slate-400">{kw}</span>
                                      ))}
                                  </div>
                              </div>
                          </div>
                          
                          <div className="bg-white dark:bg-slate-900 p-10 rounded-[3rem] border border-slate-100 dark:border-slate-800 shadow-xl relative overflow-hidden">
                              <h3 className="text-[11px] font-black mb-8 text-brand-600 uppercase tracking-widest">Master Cover</h3>
                              {state.coverImage ? (
                                  <div className="group relative rounded-3xl overflow-hidden shadow-2xl">
                                      <img src={state.coverImage} className="w-full aspect-[3/4] object-cover transition-transform duration-700 group-hover:scale-110" />
                                      <div className="absolute inset-0 bg-brand-950/80 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center p-8 text-center">
                                          <button onClick={generateCover} className="bg-white text-brand-950 p-5 rounded-3xl shadow-2xl hover:scale-110 transition-transform"><RotateCcw className="h-6 w-6" /></button>
                                      </div>
                                  </div>
                              ) : (
                                  <button onClick={generateCover} disabled={loading} className="w-full aspect-[3/4] border-2 border-dashed border-slate-200 dark:border-slate-700 rounded-3xl flex flex-col items-center justify-center gap-6 text-slate-300 hover:border-brand-400 hover:text-brand-400 transition-all group">
                                      {loading ? <Loader2 className="animate-spin h-14 w-14" /> : <ImageIcon className="h-14 w-14 group-hover:scale-110 transition-transform" />}
                                      <span className="text-[11px] font-black uppercase tracking-widest">Render Cover</span>
                                  </button>
                              )}
                          </div>
                      </div>

                      <div className="lg:col-span-3">
                          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-10">
                              {state.pages.map((p, i) => (
                                  <div key={p.id} className={`bg-white dark:bg-slate-900 rounded-[3.5rem] border-2 shadow-2xl overflow-hidden transition-all flex flex-col group ${p.status === 'failed' ? 'border-red-500' : 'border-slate-100 dark:border-slate-800 hover:border-brand-500'}`}>
                                      <div className="p-7 border-b border-slate-50 dark:border-slate-800 flex justify-between items-center bg-slate-50/50 dark:bg-slate-800/30">
                                          <div className="flex flex-col gap-1">
                                              <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Interior Slot {i + 1}</span>
                                              <span className="font-black text-[12px] tracking-tight dark:text-white truncate max-w-[140px]">{p.title}</span>
                                          </div>
                                          <div className={`w-3 h-3 rounded-full ${p.status === 'completed' ? 'bg-emerald-500 shadow-[0_0_15px_rgba(16,185,129,0.6)]' : (p.status === 'generating' ? 'bg-brand-500 animate-pulse' : 'bg-slate-200 dark:bg-slate-700')}`}></div>
                                      </div>
                                      
                                      <div className="flex-1 aspect-[1/1.3] relative flex items-center justify-center bg-white dark:bg-slate-950">
                                          {p.status === 'completed' && p.imageUrl ? (
                                              <div className="relative w-full h-full">
                                                  <img src={p.imageUrl} className="w-full h-full object-contain p-6 animate-in zoom-in-95 duration-1000" alt="Interior" />
                                                  <div className="absolute inset-0 bg-brand-950/85 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center gap-6 p-8 text-center">
                                                      <span className="text-white text-[11px] font-black uppercase tracking-widest leading-relaxed">Page Ready for Amazon KDP</span>
                                                      <div className="flex gap-4">
                                                          <button onClick={() => saveAs(p.imageUrl!, `Page_${i+1}.png`)} className="bg-white text-brand-950 p-5 rounded-3xl shadow-2xl hover:scale-110 transition-transform"><Download className="h-6 w-6" /></button>
                                                          <button onClick={() => clearPage(p.id)} className="bg-red-500 text-white p-5 rounded-3xl shadow-2xl hover:scale-110 transition-transform"><Trash2 className="h-6 w-6" /></button>
                                                      </div>
                                                  </div>
                                              </div>
                                          ) : p.status === 'generating' ? (
                                              <div className="flex flex-col items-center gap-6 p-10 text-center">
                                                  <div className="relative">
                                                      <Loader2 className="h-16 w-16 text-brand-600 animate-spin" />
                                                      <div className="absolute inset-0 bg-brand-500/20 blur-2xl rounded-full"></div>
                                                  </div>
                                                  <span className="text-[11px] font-black text-slate-400 uppercase tracking-[0.3em] animate-pulse">Rendering Design...</span>
                                              </div>
                                          ) : p.status === 'failed' ? (
                                              <div className="flex flex-col items-center gap-6 text-center p-10">
                                                  <AlertCircle className="h-14 w-14 text-red-500" />
                                                  <p className="text-[10px] font-bold text-red-500 uppercase tracking-widest">Limit Reached</p>
                                                  <button onClick={() => generateSinglePage(p.id)} className="bg-red-500 hover:bg-red-600 text-white px-8 py-4 rounded-2xl font-black text-[10px] uppercase tracking-widest shadow-2xl flex items-center gap-3 transition-transform hover:scale-105"><RotateCcw className="h-4 w-4" /> Retry Manual</button>
                                              </div>
                                          ) : (
                                              <div className="flex flex-col items-center gap-8 p-10 text-center">
                                                  <div className="p-10 bg-slate-50 dark:bg-slate-800 rounded-full text-slate-200 dark:text-slate-800 shadow-inner">
                                                      <Wand2 className="h-14 w-14" />
                                                  </div>
                                                  <button onClick={() => generateSinglePage(p.id)} className="bg-brand-950 dark:bg-brand-600 hover:bg-brand-900 text-white px-10 py-5 rounded-[2rem] font-black text-[11px] uppercase tracking-[0.3em] shadow-[0_20px_40px_rgba(0,0,0,0.1)] transition-all active:scale-95 flex items-center gap-4">
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
              <div className="max-w-4xl mx-auto py-24 text-center animate-in fade-in slide-in-from-bottom-10">
                  <Crown className="h-24 w-24 text-amber-500 mx-auto mb-12 shadow-[0_0_50px_rgba(245,158,11,0.3)]" />
                  <h2 className="text-7xl font-black dark:text-white tracking-tighter mb-8 leading-none">VIP STUDIO ACCESS</h2>
                  <p className="text-xl text-slate-500 dark:text-slate-400 mb-20 max-w-2xl mx-auto font-medium leading-relaxed">Level up your KDP business with unlimited batch rendering, high-res 4K graphics, and instant niche deep-dives.</p>
                  <div className="bg-white dark:bg-slate-900 p-20 rounded-[5rem] border border-slate-100 dark:border-slate-800 shadow-[0_50px_100px_rgba(0,0,0,0.15)] text-left relative overflow-hidden">
                      <div className="flex justify-between items-center mb-14 border-b dark:border-slate-800 pb-14">
                          <div>
                              <h3 className="text-4xl font-black dark:text-white mb-3">Pro Publisher</h3>
                              <p className="text-slate-500 font-bold uppercase tracking-widest text-[10px]">Annual Billing • Commercial License</p>
                          </div>
                          <div className="text-6xl font-black dark:text-white tracking-tighter">$29<span className="text-xl text-slate-400 font-bold tracking-normal ml-2">/mo</span></div>
                      </div>
                      <ul className="space-y-8 mb-16">
                          {['Batch Upload Automation (100+ pages)', '4K Hyper-Detailed Art Engine', 'Priority Access to New KDP Niches', 'One-Click Canva & VEO Sync', 'Dedicated KDP Strategist Support'].map(item => (
                              <li key={item} className="flex items-center gap-6 font-bold text-slate-700 dark:text-slate-300 text-lg">
                                  <CheckCircle2 className="h-8 w-8 text-emerald-500 shrink-0" /> {item}
                              </li>
                          ))}
                      </ul>
                      <button className="w-full bg-brand-950 dark:bg-brand-600 hover:bg-brand-900 text-white font-black py-8 rounded-[2.5rem] shadow-3xl uppercase tracking-widest text-xl transition-all hover:-translate-y-2">Start Unlimited Access</button>
                      <div className="absolute -bottom-20 -right-20 w-80 h-80 bg-brand-600 rounded-full blur-[150px] opacity-20"></div>
                  </div>
              </div>
          )}

          {state.view === 'canva' && (
             <div className="max-w-5xl mx-auto py-28 text-center animate-in fade-in">
                <div className="bg-indigo-50 dark:bg-indigo-950/20 p-20 rounded-[5rem] border border-indigo-100 dark:border-indigo-900 shadow-3xl">
                    <Layout className="h-28 w-28 text-indigo-600 mx-auto mb-12" />
                    <h2 className="text-6xl font-black mb-8 dark:text-white tracking-tighter">CANVA SYNC</h2>
                    <p className="text-slate-500 dark:text-slate-400 text-2xl mb-14 max-w-2xl mx-auto font-medium leading-relaxed">Directly stream your high-reach interiors to your Canva library. Perfect for creating custom covers and premium brand packs.</p>
                    <div className="flex flex-col sm:flex-row justify-center gap-8">
                        <button className="bg-indigo-600 text-white px-14 py-7 rounded-[2.5rem] font-black text-xs uppercase tracking-widest shadow-2xl hover:bg-indigo-700 transition-all hover:-translate-y-2">Connect Canva Account</button>
                        <button onClick={() => navigate('home')} className="px-14 py-7 rounded-[2.5rem] border-2 border-indigo-200 dark:border-indigo-800 text-indigo-600 dark:text-indigo-400 font-black text-xs uppercase tracking-widest hover:bg-indigo-50 dark:hover:bg-indigo-950/50">Return to Studio</button>
                    </div>
                </div>
             </div>
          )}

          {(state.view === 'register' || state.view === 'login') && <AuthView mode={state.view} />}
        </main>

        <AdSidebar side="right" />
      </div>

      <footer className="mt-auto bg-white dark:bg-slate-950 border-t border-slate-200 dark:border-slate-800 py-24 text-center">
          <div className="max-w-[1440px] mx-auto px-12">
              <div className="flex flex-col md:flex-row justify-between items-center gap-12 mb-16">
                  <div className="flex items-center gap-4">
                       <Ghost className="h-10 w-10 text-brand-600" />
                       <span className="font-black text-3xl tracking-tighter dark:text-white">AI KDP STUDIO</span>
                  </div>
                  <nav className="flex flex-wrap justify-center gap-10 text-[11px] font-black uppercase tracking-[0.3em] text-slate-400">
                      <button onClick={() => navigate('home')} className="hover:text-brand-600 transition-colors">Generator</button>
                      <button onClick={() => navigate('vip')} className="hover:text-brand-600 transition-colors">Pro Pricing</button>
                      <button onClick={() => navigate('canva')} className="hover:text-brand-600 transition-colors">Integrations</button>
                      <button className="hover:text-brand-600 transition-colors">Privacy Policy</button>
                  </nav>
              </div>
              <div className="h-px bg-slate-100 dark:bg-slate-800 w-full mb-12"></div>
              <p className="text-slate-400 text-[11px] font-black uppercase tracking-[0.5em] mb-12">© 2025 AI KDP Studio. Professional Engine for Amazon Publishers.</p>
              <div className="flex flex-wrap justify-center gap-14 opacity-20 h-8 items-center">
                  <span className="font-black text-[10px] uppercase tracking-widest">GEMINI 3 PRO READY</span>
                  <span className="font-black text-[10px] uppercase tracking-widest">KDP INTERIOR SPEC 8.5x11</span>
                  <span className="font-black text-[10px] uppercase tracking-widest">SINGLE-SIDED PRINT FORMAT</span>
                  <span className="font-black text-[10px] uppercase tracking-widest">MANUAL RENDER ENGINE V2</span>
              </div>
          </div>
      </footer>
    </div>
  );
}
