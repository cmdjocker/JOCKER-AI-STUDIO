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
  Zap
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
  const [error, setError] = useState<string | null>(null);
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

  // Navigation Handler
  const navigate = (view: ViewType) => {
    setState(prev => ({ ...prev, view }));
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

      setState(prev => ({
        ...prev,
        step: 'planning',
        metadata: plan.metadata,
        pages: initialPages
      }));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate ebook plan.');
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
    const DELAY_MS = 20000; 
    const aspectRatio = getClosestAspectRatio(state.dimensions.width, state.dimensions.height);

    if (!state.coverImage) {
        try {
            const cover = await generateCoverImage(state.topic, state.metadata?.title || "Coloring Ebook", aspectRatio);
            setState(prev => ({ ...prev, coverImage: cover }));
            await new Promise(resolve => setTimeout(resolve, 5000));
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
      try {
          const base64Image = await generateColoringPage(prompt, aspectRatio);
          setState(prev => ({
              ...prev,
              pages: prev.pages.map(p => p.id === pageId ? { ...p, status: 'completed', imageUrl: base64Image } : p)
          }));
      } catch (err) {
          setState(prev => ({ ...prev, pages: prev.pages.map(p => p.id === pageId ? { ...p, status: 'failed' } : p) }));
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

  // --- SUB-VIEWS ---

  const LoginView = () => (
    <div className="max-w-md mx-auto mt-12 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="bg-white dark:bg-zinc-900 rounded-3xl p-8 shadow-2xl border border-zinc-100 dark:border-zinc-800">
        <div className="text-center mb-8">
            <div className="bg-jocker-100 dark:bg-jocker-900/50 w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4">
                <LogIn className="h-8 w-8 text-jocker-600" />
            </div>
            <h2 className="text-3xl font-black text-zinc-900 dark:text-white">Welcome Back</h2>
            <p className="text-zinc-500 text-sm font-medium">Log in to manage your KDP projects</p>
        </div>
        <div className="space-y-4">
            <div>
                <label className="block text-[10px] font-black text-zinc-400 uppercase tracking-widest mb-1">Email Address</label>
                <div className="relative">
                    <Mail className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-zinc-400" />
                    <input type="email" placeholder="name@company.com" className="w-full pl-12 pr-4 py-4 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl focus:ring-2 focus:ring-jocker-500 outline-none transition-all text-zinc-900 dark:text-white" />
                </div>
            </div>
            <div>
                <label className="block text-[10px] font-black text-zinc-400 uppercase tracking-widest mb-1">Password</label>
                <div className="relative">
                    <Lock className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-zinc-400" />
                    <input type="password" placeholder="••••••••" className="w-full pl-12 pr-4 py-4 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl focus:ring-2 focus:ring-jocker-500 outline-none transition-all text-zinc-900 dark:text-white" />
                </div>
            </div>
            <div className="flex items-center justify-between text-xs">
                <label className="flex items-center gap-2 text-zinc-500 cursor-pointer">
                    <input type="checkbox" className="accent-jocker-500" /> Remember Me
                </label>
                <a href="#" className="text-jocker-600 font-bold hover:underline">Forgot password?</a>
            </div>
            <button className="w-full bg-jocker-900 hover:bg-jocker-800 text-white font-black py-4 rounded-xl shadow-lg transition-all active:scale-[0.98]">
                SIGN IN
            </button>
        </div>
        <div className="mt-8 pt-8 border-t border-zinc-100 dark:border-zinc-800 text-center">
            <p className="text-zinc-500 text-sm">Don't have an account? <button onClick={() => navigate('register')} className="text-jocker-600 font-bold hover:underline">Register now</button></p>
        </div>
      </div>
    </div>
  );

  const RegisterView = () => (
    <div className="max-w-md mx-auto mt-12 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="bg-white dark:bg-zinc-900 rounded-3xl p-8 shadow-2xl border border-zinc-100 dark:border-zinc-800">
        <div className="text-center mb-8">
            <div className="bg-jocker-100 dark:bg-jocker-900/50 w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4">
                <UserPlus className="h-8 w-8 text-jocker-600" />
            </div>
            <h2 className="text-3xl font-black text-zinc-900 dark:text-white">Create Account</h2>
            <p className="text-zinc-500 text-sm font-medium">Join 50k+ publishers using AI KDP Studio</p>
        </div>
        <div className="space-y-4">
            <div>
                <label className="block text-[10px] font-black text-zinc-400 uppercase tracking-widest mb-1">Full Name</label>
                <input type="text" placeholder="John Doe" className="w-full px-4 py-4 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl focus:ring-2 focus:ring-jocker-500 outline-none transition-all text-zinc-900 dark:text-white" />
            </div>
            <div>
                <label className="block text-[10px] font-black text-zinc-400 uppercase tracking-widest mb-1">Email Address</label>
                <input type="email" placeholder="name@company.com" className="w-full px-4 py-4 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl focus:ring-2 focus:ring-jocker-500 outline-none transition-all text-zinc-900 dark:text-white" />
            </div>
            <div>
                <label className="block text-[10px] font-black text-zinc-400 uppercase tracking-widest mb-1">Phone Number (For Verification)</label>
                <div className="relative">
                    <Smartphone className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-zinc-400" />
                    <input type="tel" placeholder="+1 (555) 000-0000" className="w-full pl-12 pr-4 py-4 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl focus:ring-2 focus:ring-jocker-500 outline-none transition-all text-zinc-900 dark:text-white" />
                </div>
            </div>
            <p className="text-[10px] text-zinc-500 italic">By registering, you agree to receive a one-time verification SMS. Message and data rates may apply.</p>
            <button className="w-full bg-jocker-600 hover:bg-jocker-700 text-white font-black py-4 rounded-xl shadow-lg transition-all flex items-center justify-center gap-2">
                VERIFY & REGISTER <ChevronRight className="h-4 w-4" />
            </button>
        </div>
        <div className="mt-8 pt-8 border-t border-zinc-100 dark:border-zinc-800 text-center">
            <p className="text-zinc-500 text-sm">Already have an account? <button onClick={() => navigate('login')} className="text-jocker-600 font-bold hover:underline">Login here</button></p>
        </div>
      </div>
    </div>
  );

  const VIPView = () => (
    <div className="max-w-5xl mx-auto mt-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
      <div className="text-center mb-12">
          <div className="inline-flex items-center gap-2 bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 px-4 py-2 rounded-full text-xs font-black uppercase tracking-widest mb-4">
             <Crown className="h-4 w-4" /> Member Center
          </div>
          <h2 className="text-5xl font-black text-zinc-900 dark:text-white mb-4">Unlock Unlimited Creativity</h2>
          <p className="text-zinc-500 dark:text-zinc-400 max-w-2xl mx-auto text-lg">Remove generation limits, access 4K resolution, and get priority server access.</p>
          
          <div className="mt-10 flex items-center justify-center gap-4">
              <span className={`text-sm font-bold ${billingCycle === 'monthly' ? 'text-zinc-900 dark:text-white' : 'text-zinc-400'}`}>Monthly</span>
              <button 
                onClick={() => setBillingCycle(prev => prev === 'monthly' ? 'yearly' : 'monthly')}
                className="w-14 h-8 bg-jocker-600 rounded-full relative p-1 transition-colors"
              >
                  <div className={`w-6 h-6 bg-white rounded-full shadow-md transition-all ${billingCycle === 'yearly' ? 'translate-x-6' : 'translate-x-0'}`}></div>
              </button>
              <span className={`text-sm font-bold ${billingCycle === 'yearly' ? 'text-zinc-900 dark:text-white' : 'text-zinc-400'}`}>Yearly <span className="text-green-500 ml-1">(-25%)</span></span>
          </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-12">
          {/* Tier 1 */}
          <div className="bg-white dark:bg-zinc-900 p-8 rounded-3xl border border-zinc-100 dark:border-zinc-800 shadow-xl flex flex-col">
              <h3 className="text-xl font-black text-zinc-900 dark:text-white mb-2">Basic</h3>
              <p className="text-zinc-500 text-sm mb-6">For casual hobbyists</p>
              <div className="text-4xl font-black text-zinc-900 dark:text-white mb-8">Free</div>
              <ul className="space-y-4 mb-8 flex-grow">
                  <li className="flex items-center gap-2 text-sm text-zinc-600 dark:text-zinc-400"><CheckCircle2 className="h-4 w-4 text-green-500" /> 5 Generations / month</li>
                  <li className="flex items-center gap-2 text-sm text-zinc-600 dark:text-zinc-400"><CheckCircle2 className="h-4 w-4 text-green-500" /> Standard 1K resolution</li>
                  <li className="flex items-center gap-2 text-sm text-zinc-400 opacity-50"><Lock className="h-4 w-4" /> No Commercial Rights</li>
              </ul>
              <button onClick={() => navigate('home')} className="w-full py-4 rounded-xl border-2 border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-400 font-bold hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-all">Current Plan</button>
          </div>

          {/* Tier 2 - PRO */}
          <div className="bg-jocker-900 p-8 rounded-3xl border-4 border-jocker-500 shadow-2xl shadow-jocker-500/20 flex flex-col relative overflow-hidden transform scale-105 z-10">
              <div className="absolute top-4 right-4 bg-jocker-500 text-white text-[10px] font-black px-3 py-1 rounded-full uppercase">Most Popular</div>
              <h3 className="text-xl font-black text-white mb-2">Pro Publisher</h3>
              <p className="text-jocker-300 text-sm mb-6">For serious KDP creators</p>
              <div className="text-4xl font-black text-white mb-8">
                  ${billingCycle === 'monthly' ? '29' : '22'}<span className="text-lg text-jocker-400">/mo</span>
              </div>
              <ul className="space-y-4 mb-8 flex-grow">
                  <li className="flex items-center gap-2 text-sm text-white"><CheckCircle2 className="h-4 w-4 text-jocker-400" /> Unlimited Book Plans</li>
                  <li className="flex items-center gap-2 text-sm text-white"><CheckCircle2 className="h-4 w-4 text-jocker-400" /> 200 Images / month</li>
                  <li className="flex items-center gap-2 text-sm text-white"><CheckCircle2 className="h-4 w-4 text-jocker-400" /> Commercial Use License</li>
                  <li className="flex items-center gap-2 text-sm text-white"><CheckCircle2 className="h-4 w-4 text-jocker-400" /> Priority Server Access</li>
              </ul>
              <button className="w-full py-4 rounded-xl bg-jocker-500 hover:bg-jocker-400 text-white font-black shadow-lg transition-all shadow-jocker-500/40">Upgrade Now</button>
          </div>

          {/* Tier 3 */}
          <div className="bg-white dark:bg-zinc-900 p-8 rounded-3xl border border-zinc-100 dark:border-zinc-800 shadow-xl flex flex-col">
              <h3 className="text-xl font-black text-zinc-900 dark:text-white mb-2">Studio Elite</h3>
              <p className="text-zinc-500 text-sm mb-6">For teams and agencies</p>
              <div className="text-4xl font-black text-zinc-900 dark:text-white mb-8">
                  ${billingCycle === 'monthly' ? '99' : '75'}<span className="text-lg text-zinc-400">/mo</span>
              </div>
              <ul className="space-y-4 mb-8 flex-grow">
                  <li className="flex items-center gap-2 text-sm text-zinc-600 dark:text-zinc-400"><CheckCircle2 className="h-4 w-4 text-green-500" /> 1000+ Images / month</li>
                  <li className="flex items-center gap-2 text-sm text-zinc-600 dark:text-zinc-400"><CheckCircle2 className="h-4 w-4 text-green-500" /> 4K Resolution Upscaling</li>
                  <li className="flex items-center gap-2 text-sm text-zinc-600 dark:text-zinc-400"><CheckCircle2 className="h-4 w-4 text-green-500" /> Bulk Export to Canva/Drive</li>
              </ul>
              <button className="w-full py-4 rounded-xl bg-zinc-900 dark:bg-zinc-800 hover:bg-black text-white font-black shadow-lg transition-all">Go Elite</button>
          </div>
      </div>
    </div>
  );

  const CanvaView = () => (
    <div className="max-w-3xl mx-auto mt-12 animate-in zoom-in-95 duration-500">
      <div className="bg-white dark:bg-zinc-900 rounded-[2.5rem] p-12 shadow-2xl border border-zinc-100 dark:border-zinc-800 text-center">
          <div className="flex items-center justify-center gap-6 mb-10">
              <div className="bg-jocker-100 dark:bg-jocker-900/50 p-6 rounded-3xl">
                  <Ghost className="h-12 w-12 text-jocker-900 dark:text-white" />
              </div>
              <div className="w-12 h-px bg-zinc-200 dark:border-zinc-800"></div>
              <div className="bg-blue-50 dark:bg-blue-900/30 p-6 rounded-3xl">
                  <Palette className="h-12 w-12 text-blue-600" />
              </div>
          </div>
          
          <h2 className="text-4xl font-black text-zinc-900 dark:text-white mb-4">Connect Canva Account</h2>
          <p className="text-zinc-500 dark:text-zinc-400 text-lg mb-10 max-w-lg mx-auto leading-relaxed">
            Directly export your generated interiors and covers into your Canva workspace for final polish and formatting.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 text-left mb-10">
              <div className="p-6 bg-zinc-50 dark:bg-zinc-950 rounded-2xl border border-zinc-100 dark:border-zinc-800">
                  <Zap className="h-6 w-6 text-amber-500 mb-3" />
                  <h4 className="font-bold text-zinc-900 dark:text-white mb-1">One-Click Transfer</h4>
                  <p className="text-xs text-zinc-500">Sync all 20 pages directly to a new Canva design folder.</p>
              </div>
              <div className="p-6 bg-zinc-50 dark:bg-zinc-950 rounded-2xl border border-zinc-100 dark:border-zinc-800">
                  <ShieldCheck className="h-6 w-6 text-green-500 mb-3" />
                  <h4 className="font-bold text-zinc-900 dark:text-white mb-1">Secure Authorization</h4>
                  <p className="text-xs text-zinc-500">We only request permission to "Write" to your designs folder.</p>
              </div>
          </div>

          <button className="w-full bg-[#00c4cc] hover:bg-[#00b0b8] text-white font-black py-5 rounded-2xl shadow-xl transition-all flex items-center justify-center gap-3 text-xl">
              AUTHORIZE CANVA ACCESS
          </button>
          
          <button onClick={() => navigate('home')} className="mt-6 text-zinc-400 hover:text-zinc-600 font-bold text-sm flex items-center justify-center gap-2 mx-auto">
              <ArrowLeft className="h-4 w-4" /> Go back to dashboard
          </button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-zinc-950 transition-colors duration-300 flex flex-col font-sans">
      
      {/* Social Sidebar */}
      <div className="fixed right-0 top-1/2 -translate-y-1/2 z-40 flex flex-col bg-white dark:bg-zinc-900 shadow-xl rounded-l-lg overflow-hidden border border-r-0 border-zinc-200 dark:border-zinc-700">
          <a href="#" className="p-3 hover:bg-blue-600 hover:text-white text-blue-600 transition-colors"><Facebook className="h-5 w-5" /></a>
          <a href="#" className="p-3 hover:bg-pink-600 hover:text-white text-pink-600 transition-colors"><Instagram className="h-5 w-5" /></a>
          <a href="#" className="p-3 hover:bg-sky-500 hover:text-white text-sky-500 transition-colors"><Twitter className="h-5 w-5" /></a>
          <div className="p-3 bg-zinc-100 dark:bg-zinc-800 text-[10px] font-black vertical-text flex items-center justify-center py-4">FOLLOW</div>
      </div>

      {/* Support Chat */}
      <div className="fixed bottom-6 right-6 z-50">
          <button className="bg-jocker-600 hover:bg-jocker-800 text-white p-4 rounded-full shadow-lg flex items-center justify-center transition-transform hover:scale-110">
              <MessageCircle className="h-6 w-6" />
          </button>
      </div>

      {/* Header */}
      <header className="bg-jocker-900 text-white shadow-lg sticky top-0 z-50 border-b border-jocker-800">
        <div className="max-w-[1440px] mx-auto px-4 h-20 flex items-center justify-between">
          <button onClick={() => navigate('home')} className="flex items-center gap-3 hover:opacity-80 transition-opacity">
            <div className="bg-white text-jocker-900 p-2 rounded-lg shadow-inner">
               <Ghost className="h-8 w-8" />
            </div>
            <div className="text-left">
                <span className="font-black text-2xl tracking-tighter block leading-none font-serif">AI KDP STUDIO</span>
                <span className="text-[10px] font-bold tracking-widest text-jocker-500 block mt-0.5 uppercase">Book Cover & Interior Generator</span>
            </div>
          </button>

          <div className="flex items-center gap-4">
             <button onClick={() => navigate('vip')} className={`hidden md:flex items-center gap-1.5 px-4 py-2 rounded-full text-xs font-black shadow-lg transition-all uppercase tracking-wide ${state.view === 'vip' ? 'bg-amber-400 text-black' : 'bg-gradient-to-r from-amber-300 to-yellow-500 text-zinc-900 hover:shadow-amber-400/50'}`}>
                <Crown className="h-3.5 w-3.5" /> VIP ACCESS
             </button>

             <button onClick={() => navigate('canva')} className={`hidden sm:flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold transition-colors border border-transparent ${state.view === 'canva' ? 'bg-[#00c4cc] text-white' : 'hover:bg-white/10 text-zinc-300 hover:text-white hover:border-white/10'}`}>
                <Palette className="h-3.5 w-3.5" /> Link Canva
             </button>

             <div className="h-8 w-px bg-white/10"></div>

             <button onClick={() => setDarkMode(!darkMode)} className="p-2.5 rounded-full bg-white/5 hover:bg-white/10 transition-colors text-white border border-white/5 group">
               {darkMode ? <Sun className="h-5 w-5 group-hover:text-amber-300" /> : <Moon className="h-5 w-5 group-hover:text-blue-300" />}
             </button>

             <div className="flex items-center gap-3 pl-2">
                 <button onClick={() => navigate('login')} className="text-xs font-bold text-zinc-300 hover:text-white transition-colors flex items-center gap-1.5 uppercase tracking-wide">
                     <LogIn className="h-3.5 w-3.5" /> Login
                 </button>
                 <button onClick={() => navigate('register')} className="bg-white text-jocker-900 hover:bg-zinc-100 px-4 py-2 rounded-lg text-xs font-black transition-colors flex items-center gap-1.5 uppercase tracking-wide shadow-lg">
                     <UserPlus className="h-3.5 w-3.5" /> Register
                 </button>
             </div>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <div className="flex-grow flex justify-center w-full max-w-[1600px] mx-auto">
        <aside className="hidden xl:flex flex-col w-[200px] shrink-0 p-4 gap-4 border-r border-zinc-200 dark:border-zinc-800 bg-white/50 dark:bg-zinc-900/50">
            <div className="w-full h-[600px] ad-pattern rounded-lg border border-dashed border-zinc-300 dark:border-zinc-700 flex items-center justify-center text-zinc-400 text-xs font-mono uppercase tracking-widest text-center p-4">160x600 AD</div>
        </aside>

        <main className="flex-1 max-w-5xl px-4 py-8 w-full min-w-0">
          {error && (
            <div className="mb-8 bg-red-50 dark:bg-red-950/40 border-l-4 border-red-600 p-4 rounded-r-lg shadow-sm flex items-start gap-3">
              <AlertCircle className="h-5 w-5 text-red-600 mt-0.5" />
              <div>
                <p className="font-bold text-red-900 dark:text-red-200">System Error</p>
                <p className="text-sm text-red-700 dark:text-red-400">{error}</p>
              </div>
            </div>
          )}

          {/* VIEW SWITCHER */}
          {state.view === 'login' && <LoginView />}
          {state.view === 'register' && <RegisterView />}
          {state.view === 'vip' && <VIPView />}
          {state.view === 'canva' && <CanvaView />}

          {/* MAIN APP VIEW (HOME) */}
          {state.view === 'home' && (
            <>
              {state.step === 'input' && (
                <div className="max-w-3xl mx-auto mt-12 text-center">
                  <h1 className="text-5xl md:text-6xl font-black text-zinc-900 dark:text-white mb-6 tracking-tight">
                    Create Best-Selling <br/>
                    <span className="text-transparent bg-clip-text bg-gradient-to-r from-jocker-600 to-indigo-600 dark:from-jocker-500 dark:to-indigo-400">
                      Coloring Ebooks
                    </span>
                  </h1>
                  <p className="text-xl font-medium text-zinc-600 dark:text-zinc-400 mb-10 max-w-2xl mx-auto leading-relaxed">
                    Enter a topic, set your dimensions, and <span className="font-bold text-jocker-600 dark:text-jocker-400">AI KDP Studio</span> will generate high-reach keywords, titles, and 20+ unique pages automatically.
                  </p>
                  
                  <div className="bg-white dark:bg-zinc-900 p-10 rounded-3xl shadow-2xl border border-zinc-100 dark:border-zinc-800 text-left relative overflow-hidden group">
                    <div className="absolute top-0 right-0 p-4 opacity-5 dark:opacity-10 pointer-events-none">
                        <Gem className="h-40 w-40" />
                    </div>
                    <div className="mb-8 relative z-10">
                      <label htmlFor="topic" className="block text-sm font-black text-zinc-700 dark:text-zinc-300 mb-2 uppercase tracking-wide">What is your Ebook about?</label>
                      <div className="relative">
                          <input type="text" id="topic" className="w-full px-6 py-5 text-xl font-medium border-2 border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-white rounded-2xl focus:border-jocker-500 focus:ring-4 focus:ring-jocker-500/10 outline-none placeholder:text-zinc-400" placeholder="e.g., Cute Baby Dragons, Space Exploration..." value={state.topic} onChange={(e) => setState({ ...state, topic: e.target.value })} onKeyDown={(e) => e.key === 'Enter' && handleGeneratePlan()} />
                          <Wand2 className="absolute right-4 top-4 text-jocker-500 h-8 w-8 opacity-50" />
                      </div>
                    </div>
                    <div className="bg-zinc-50 dark:bg-zinc-800/50 p-6 rounded-2xl border border-zinc-200 dark:border-zinc-700 mb-8 relative z-10">
                      <div className="flex items-center gap-2 mb-4 text-zinc-900 dark:text-white font-bold text-lg"><Settings className="h-5 w-5 text-jocker-500" /> Configuration</div>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                          <div><label className="block text-[10px] font-black text-zinc-400 mb-1.5 uppercase">Width</label><input type="number" step="0.1" value={state.dimensions.width} onChange={(e) => setState({ ...state, dimensions: { ...state.dimensions, width: parseFloat(e.target.value) } })} className="w-full px-4 py-3 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-600 rounded-xl outline-none" /></div>
                          <div><label className="block text-[10px] font-black text-zinc-400 mb-1.5 uppercase">Height</label><input type="number" step="0.1" value={state.dimensions.height} onChange={(e) => setState({ ...state, dimensions: { ...state.dimensions, height: parseFloat(e.target.value) } })} className="w-full px-4 py-3 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-600 rounded-xl outline-none" /></div>
                          <div><label className="block text-[10px] font-black text-zinc-400 mb-1.5 uppercase">Unit</label><select value={state.dimensions.unit} onChange={(e) => setState({ ...state, dimensions: { ...state.dimensions, unit: e.target.value as 'in' | 'px' } })} className="w-full px-4 py-3 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-600 rounded-xl outline-none appearance-none"><option value="in">Inches (in)</option><option value="px">Pixels (px)</option></select></div>
                      </div>
                    </div>
                    <button onClick={handleGeneratePlan} disabled={loading || !state.topic.trim()} className="w-full bg-jocker-900 hover:bg-jocker-800 disabled:bg-zinc-300 text-white font-black py-5 rounded-2xl shadow-xl hover:-translate-y-1 transition-all flex items-center justify-center gap-3 text-xl uppercase tracking-widest">
                      {loading ? <><Loader2 className="animate-spin h-6 w-6" /> Analyzing...</> : "INITIALIZE GENERATOR"}
                    </button>
                  </div>
                </div>
              )}

              {state.step === 'planning' && state.metadata && (
                <div className="max-w-4xl mx-auto animate-fade-in">
                   <div className="flex justify-between items-center mb-8">
                       <h2 className="text-3xl font-black text-zinc-900 dark:text-white">Review Ebook Plan</h2>
                       <button onClick={startImageGeneration} className="bg-green-600 hover:bg-green-700 text-white px-8 py-3 rounded-xl font-bold shadow-lg hover:-translate-y-1 transition-all">APPROVE & GENERATE</button>
                   </div>
                   <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                      <div className="bg-white dark:bg-zinc-900 p-8 rounded-2xl border dark:border-zinc-800">
                          <h3 className="text-lg font-bold mb-6 border-b pb-4 flex items-center gap-2"><BookOpen className="h-5 w-5 text-jocker-500" /> Metadata</h3>
                          <div className="space-y-4">
                              <div><label className="text-[10px] font-black text-zinc-400 uppercase">Title</label><div className="font-bold text-xl">{state.metadata.title}</div></div>
                              <div><label className="text-[10px] font-black text-zinc-400 uppercase">Subtitle</label><div className="text-sm text-zinc-600 dark:text-zinc-400">{state.metadata.subtitle}</div></div>
                              <div><label className="text-[10px] font-black text-zinc-400 uppercase">Keywords</label><div className="flex flex-wrap gap-2 mt-2">{state.metadata.keywords.map((kw, i) => <span key={i} className="bg-zinc-100 dark:bg-zinc-800 px-3 py-1 rounded text-[10px] font-bold">{kw}</span>)}</div></div>
                          </div>
                      </div>
                      <div className="bg-white dark:bg-zinc-900 p-6 rounded-2xl border dark:border-zinc-800 h-[500px] overflow-y-auto">
                          <h3 className="text-lg font-bold mb-4 sticky top-0 bg-white dark:bg-zinc-900 z-10 pb-4 border-b">Pages ({state.pages.length})</h3>
                          <ul className="space-y-4">
                              {state.pages.map((p, i) => <li key={p.id} className="text-sm flex gap-3"><span className="font-bold opacity-50">#{i+1}</span> <div><span className="font-bold block">{p.title}</span><span className="text-xs text-zinc-500">{p.prompt}</span></div></li>)}
                          </ul>
                      </div>
                   </div>
                </div>
              )}

              {state.step === 'generating' && (
                   <div className="max-w-4xl mx-auto text-center mt-20">
                       <Loader2 className="h-20 w-20 text-jocker-600 animate-spin mx-auto mb-6" />
                       <h2 className="text-3xl font-black mb-10">Crafting Masterpiece...</h2>
                       <div className="w-full bg-zinc-200 dark:bg-zinc-800 rounded-full h-6 mb-4 overflow-hidden"><div className="bg-jocker-600 h-6 transition-all duration-500" style={{ width: `${progress}%` }}></div></div>
                       <div className="flex justify-between text-xs font-bold uppercase tracking-widest text-zinc-400"><span>Initiated</span><span>{progress}% Complete</span></div>
                       <div className="mt-16 grid grid-cols-2 sm:grid-cols-5 gap-4">
                           {state.pages.map((p, i) => <div key={p.id} className="aspect-[1/1.3] bg-white dark:bg-zinc-900 rounded-xl border flex items-center justify-center relative overflow-hidden">{p.status === 'completed' ? <img src={p.imageUrl} className="w-full h-full object-contain p-2" /> : <div className="text-[10px] font-bold text-zinc-300">#{i+1}</div>}</div>)}
                       </div>
                   </div>
              )}

              {state.step === 'review' && (
                  <div className="max-w-6xl mx-auto">
                      <div className="bg-jocker-900 text-white p-10 rounded-[3rem] shadow-2xl flex flex-col md:flex-row justify-between items-center gap-8 mb-12">
                          <div><h2 className="text-4xl font-black mb-2">Ebook Ready!</h2><p className="opacity-70">Generated at {state.dimensions.width}x{state.dimensions.height} {state.dimensions.unit}</p></div>
                          <div className="flex gap-4"><button onClick={handleDownloadZip} className="bg-white text-jocker-900 px-8 py-4 rounded-2xl font-black shadow-lg hover:scale-105 transition-all flex items-center gap-2"><FileArchive /> ZIP</button><button onClick={handleDownloadPDF} className="bg-jocker-600 text-white px-8 py-4 rounded-2xl font-black shadow-lg hover:scale-105 transition-all flex items-center gap-2 border border-white/20"><Download /> PDF</button></div>
                      </div>
                      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-6">
                          {state.pages.map((p, idx) => (
                              <div key={p.id} className="group relative">
                                  <div className="aspect-[1/1.3] bg-white dark:bg-zinc-900 rounded-2xl border p-4 group-hover:border-jocker-500 transition-all cursor-pointer">
                                      {p.imageUrl && <img src={p.imageUrl} className="w-full h-full object-contain" />}
                                      <button onClick={() => handleDownloadSinglePNG(p.imageUrl!, `Page_${idx+1}.png`)} className="absolute top-2 right-2 bg-black/80 text-white p-2 rounded-lg opacity-0 group-hover:opacity-100 transition-all"><Download className="h-4 w-4" /></button>
                                  </div>
                                  <div className="mt-2 px-1 text-[10px] font-black uppercase text-zinc-500 flex justify-between"><span>Page {idx+1}</span> {p.status === 'failed' && <button onClick={() => handleRetryPage(p.id, p.prompt)} className="text-red-500">RETRY</button>}</div>
                              </div>
                          ))}
                      </div>
                  </div>
              )}
            </>
          )}
        </main>

        <aside className="hidden xl:flex flex-col w-[200px] shrink-0 p-4 gap-4 border-l border-zinc-200 dark:border-zinc-800 bg-white/50 dark:bg-zinc-900/50">
             <div className="w-full h-[600px] ad-pattern rounded-lg border border-dashed border-zinc-300 dark:border-zinc-700 flex items-center justify-center text-zinc-400 text-xs font-mono uppercase text-center p-4">160x600 AD</div>
        </aside>
      </div>
      
      <footer className="mt-auto bg-white dark:bg-zinc-950 border-t border-zinc-200 dark:border-zinc-800 py-10">
          <div className="max-w-7xl mx-auto px-6 flex flex-col md:flex-row justify-between items-center gap-8">
              <div className="flex items-center gap-2 opacity-50"><Ghost className="h-5 w-5" /><p className="text-zinc-500 text-sm font-bold">© 2025 AI KDP Studio. Powered by JOCKER</p></div>
              <div className="flex gap-8 text-xs font-bold text-zinc-400">
                  <button onClick={() => navigate('vip')} className="hover:text-jocker-600 uppercase tracking-widest">Pricing</button>
                  <button onClick={() => navigate('canva')} className="hover:text-jocker-600 uppercase tracking-widest">Canva API</button>
                  <button onClick={() => navigate('home')} className="hover:text-jocker-600 uppercase tracking-widest">Generator</button>
              </div>
              <div className="flex gap-4 opacity-50 grayscale hover:grayscale-0 transition-all"><CreditCard /><Bitcoin /><span className="font-black italic">PayPal</span></div>
          </div>
      </footer>
    </div>
  );
}