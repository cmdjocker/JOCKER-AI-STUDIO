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
  Lock
} from 'lucide-react';
import JSZip from 'jszip';
import saveAs from 'file-saver';
import { generateBookPlan, generateColoringPage, generateCoverImage, getClosestAspectRatio } from './services/gemini';
import { generatePDF } from './services/pdfGenerator';
import { BookPlan, GenerationState, PageDefinition } from './types';

const INITIAL_STATE: GenerationState = {
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

  // Queue processing logic
  const isGeneratingImagesRef = useRef(false);

  // Toggle Dark Mode Class on HTML element
  useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [darkMode]);

  // Scroll to top on step change
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [state.step]);

  // Handle Plan Generation
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
      setError(err instanceof Error ? err.message : 'Failed to generate ebook plan. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // Start Generating Images
  const startImageGeneration = async () => {
    setState(prev => ({ ...prev, step: 'generating' }));
    isGeneratingImagesRef.current = true;
    processQueue();
  };

  // Process the image queue in batches to avoid rate limits
  const processQueue = async () => {
    // REDUCED batch size to 1 (serial) and INCREASED delay to be extremely safe
    const BATCH_SIZE = 1; 
    const DELAY_MS = 20000; // 20 seconds delay between single images
    const aspectRatio = getClosestAspectRatio(state.dimensions.width, state.dimensions.height);

    // 1. Start Cover Generation (Wait for it before starting interior to stay within limits)
    if (!state.coverImage) {
        try {
            const cover = await generateCoverImage(state.topic, state.metadata?.title || "Coloring Ebook", aspectRatio);
            setState(prev => ({ ...prev, coverImage: cover }));
            // Extra safety delay after cover
            await new Promise(resolve => setTimeout(resolve, 5000));
        } catch (e) {
            console.error("Cover failed", e);
        }
    }

    // Get pages that need generation
    const pagesToProcess = state.pages.filter(p => p.status === 'pending');

    // Loop through in batches
    for (let i = 0; i < pagesToProcess.length; i += BATCH_SIZE) {
        if (!isGeneratingImagesRef.current) break;

        const batch = pagesToProcess.slice(i, i + BATCH_SIZE);

        // Mark current batch as generating
        setState(prev => ({
            ...prev,
            pages: prev.pages.map(p => batch.find(b => b.id === p.id) ? { ...p, status: 'generating' } : p)
        }));

        // Execute batch concurrently (even if size is 1)
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

        // Update progress
        setState(prev => {
            const completed = prev.pages.filter(p => p.status === 'completed' || p.status === 'failed').length;
            setProgress(Math.round((completed / prev.pages.length) * 100));
            return prev;
        });

        // Add delay if there are more pages to come
        if (i + BATCH_SIZE < pagesToProcess.length && isGeneratingImagesRef.current) {
            await new Promise(resolve => setTimeout(resolve, DELAY_MS));
        }
    }
    
    // Finalize
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

      // Set back to generating
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
          setState(prev => ({
              ...prev,
              pages: prev.pages.map(p => p.id === pageId ? { ...p, status: 'failed' } : p)
          }));
      }
  };

  const handleDownloadPDF = () => {
      if (state.metadata) {
          generatePDF(state.metadata, state.pages, state.dimensions, state.coverImage);
      }
  };

  const handleDownloadSinglePNG = (dataUri: string, filename: string) => {
    saveAs(dataUri, filename);
  };

  const handleDownloadZip = async () => {
    const zip = new JSZip();
    const folder = zip.folder("coloring_pages");
    
    if (!folder) return;

    // Add Cover
    if (state.coverImage) {
      const coverData = state.coverImage.split(',')[1];
      folder.file("00_Cover.png", coverData, { base64: true });
    }

    // Add Pages
    state.pages.forEach((page, index) => {
      if (page.status === 'completed' && page.imageUrl) {
        const imgData = page.imageUrl.split(',')[1];
        const fileName = `${(index + 1).toString().padStart(2, '0')}_${page.title.slice(0, 30).replace(/[^a-z0-9]/gi, '_')}.png`;
        folder.file(fileName, imgData, { base64: true });
      }
    });

    const content = await zip.generateAsync({ type: "blob" });
    saveAs(content, `${state.metadata?.title.replace(/[^a-z0-9]/gi, '_') || 'coloring_book'}_images.zip`);
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-zinc-950 transition-colors duration-300 flex flex-col font-sans">
      
      {/* Social Media Sidebar */}
      <div className="fixed right-0 top-1/2 -translate-y-1/2 z-40 flex flex-col bg-white dark:bg-zinc-900 shadow-xl rounded-l-lg overflow-hidden border border-r-0 border-zinc-200 dark:border-zinc-700">
          <a href="#" className="p-3 hover:bg-blue-600 hover:text-white text-blue-600 transition-colors" title="Facebook"><Facebook className="h-5 w-5" /></a>
          <a href="#" className="p-3 hover:bg-pink-600 hover:text-white text-pink-600 transition-colors" title="Instagram"><Instagram className="h-5 w-5" /></a>
          <a href="#" className="p-3 hover:bg-sky-500 hover:text-white text-sky-500 transition-colors" title="Twitter/X"><Twitter className="h-5 w-5" /></a>
          <a href="#" className="p-3 hover:bg-black dark:hover:bg-zinc-700 hover:text-white text-zinc-900 dark:text-zinc-100 transition-colors" title="TikTok"><span className="font-bold text-xs">TT</span></a>
      </div>

      {/* Support Chat Bubble */}
      <div className="fixed bottom-6 right-6 z-50">
          <button className="bg-jocker-600 hover:bg-jocker-800 text-white p-4 rounded-full shadow-lg flex items-center justify-center transition-transform hover:scale-110">
              <MessageCircle className="h-6 w-6" />
          </button>
      </div>

      {/* Header */}
      <header className="bg-jocker-900 text-white shadow-lg sticky top-0 z-50 border-b border-jocker-800">
        <div className="max-w-[1440px] mx-auto px-4 h-20 flex items-center justify-between">
          
          {/* LOGO AREA */}
          <div className="flex items-center gap-3">
            <div className="bg-white text-jocker-900 p-2 rounded-lg shadow-inner">
               <Ghost className="h-8 w-8" />
            </div>
            <div>
                <span className="font-black text-2xl tracking-tighter block leading-none font-serif">AI KDP STUDIO</span>
                <span className="text-[10px] font-bold tracking-widest text-jocker-500 block mt-0.5 uppercase">AI Book Cover & Interior Generator</span>
            </div>
          </div>

          <div className="flex items-center gap-4">
             {/* VIP Access */}
             <button className="hidden md:flex items-center gap-1.5 bg-gradient-to-r from-amber-300 to-yellow-500 text-zinc-900 px-4 py-2 rounded-full text-xs font-black shadow-lg hover:shadow-amber-400/50 transition-all uppercase tracking-wide">
                <Crown className="h-3.5 w-3.5" /> VIP ACCESS
             </button>

             {/* Canva Link */}
             <button className="hidden sm:flex items-center gap-1.5 hover:bg-white/10 text-zinc-300 hover:text-white px-3 py-2 rounded-lg text-xs font-bold transition-colors border border-transparent hover:border-white/10">
                <Palette className="h-3.5 w-3.5" /> Link Canva
             </button>

             <div className="h-8 w-px bg-white/10"></div>

             {/* Theme Toggle */}
             <button 
              onClick={() => setDarkMode(!darkMode)}
              className="p-2.5 rounded-full bg-white/5 hover:bg-white/10 transition-colors text-white border border-white/5 group"
              title="Toggle Black & White Theme"
             >
               {darkMode ? (
                  <Sun className="h-5 w-5 group-hover:text-amber-300 transition-colors" />
               ) : (
                  <Moon className="h-5 w-5 group-hover:text-blue-300 transition-colors" />
               )}
             </button>

             {/* Auth */}
             <div className="flex items-center gap-3 pl-2">
                 <button className="text-xs font-bold text-zinc-300 hover:text-white transition-colors flex items-center gap-1.5 uppercase tracking-wide">
                     <LogIn className="h-3.5 w-3.5" /> Login
                 </button>
                 <button className="bg-white text-jocker-900 hover:bg-zinc-100 px-4 py-2 rounded-lg text-xs font-black transition-colors flex items-center gap-1.5 uppercase tracking-wide shadow-lg">
                     <UserPlus className="h-3.5 w-3.5" /> Register
                 </button>
             </div>
          </div>
        </div>
      </header>

      {/* Main Layout with Ad Sidebars */}
      <div className="flex-grow flex justify-center w-full max-w-[1600px] mx-auto">
        
        {/* Left Ad Sidebar */}
        <aside className="hidden xl:flex flex-col w-[200px] shrink-0 p-4 gap-4 border-r border-zinc-200 dark:border-zinc-800 bg-white/50 dark:bg-zinc-900/50">
            <div className="w-full h-[600px] ad-pattern rounded-lg border border-dashed border-zinc-300 dark:border-zinc-700 flex items-center justify-center text-zinc-400 text-xs font-mono uppercase tracking-widest text-center p-4">
                Vertical Ad Space 160x600
            </div>
            <div className="w-full h-[250px] ad-pattern rounded-lg border border-dashed border-zinc-300 dark:border-zinc-700 flex items-center justify-center text-zinc-400 text-xs font-mono uppercase tracking-widest text-center p-4">
                Square Ad Space 250x250
            </div>
        </aside>

        {/* Center Content */}
        <main className="flex-1 max-w-5xl px-4 sm:px-6 lg:px-8 py-8 w-full min-w-0">
          
          {/* Error Display */}
          {error && (
            <div className="mb-8 bg-red-50 dark:bg-red-950/40 border-l-4 border-red-600 p-4 rounded-r-lg shadow-sm flex items-start gap-3 animate-in slide-in-from-top-2">
              <AlertCircle className="h-5 w-5 text-red-600 mt-0.5" />
              <div>
                <p className="font-bold text-red-900 dark:text-red-200">System Error</p>
                <p className="text-sm text-red-700 dark:text-red-400">{error}</p>
              </div>
            </div>
          )}

          {/* Step 1: Input */}
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
              
              <div className="bg-white dark:bg-zinc-900 p-10 rounded-3xl shadow-2xl shadow-indigo-500/10 border border-zinc-100 dark:border-zinc-800 text-left relative overflow-hidden group hover:border-jocker-500/30 transition-all duration-300">
                <div className="absolute top-0 right-0 p-4 opacity-5 dark:opacity-10 pointer-events-none group-hover:scale-110 transition-transform duration-500">
                    <Gem className="h-40 w-40 text-jocker-900 dark:text-white" />
                </div>

                <div className="mb-8 relative z-10">
                  <label htmlFor="topic" className="block text-sm font-black text-zinc-700 dark:text-zinc-300 mb-2 uppercase tracking-wide">
                      What is your Ebook about?
                  </label>
                  <div className="relative">
                      <input
                      type="text"
                      id="topic"
                      className="w-full px-6 py-5 text-xl font-medium border-2 border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-white rounded-2xl focus:border-jocker-500 focus:ring-4 focus:ring-jocker-500/10 transition-all outline-none placeholder:text-zinc-400"
                      placeholder="e.g., Cute Baby Dragons, Space Exploration..."
                      value={state.topic}
                      onChange={(e) => setState({ ...state, topic: e.target.value })}
                      onKeyDown={(e) => e.key === 'Enter' && handleGeneratePlan()}
                      />
                      <div className="absolute right-4 top-4">
                          <Wand2 className="text-jocker-500 h-8 w-8 opacity-50" />
                      </div>
                  </div>
                </div>

                {/* Dimensions Section */}
                <div className="bg-zinc-50 dark:bg-zinc-800/50 p-6 rounded-2xl border border-zinc-200 dark:border-zinc-700 mb-8 relative z-10">
                  <div className="flex items-center gap-2 mb-4 text-zinc-900 dark:text-white font-bold text-lg">
                      <Settings className="h-5 w-5 text-jocker-500" />
                      Configuration
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div>
                          <label className="block text-[10px] font-black text-zinc-400 dark:text-zinc-500 mb-1.5 uppercase tracking-wider">Width</label>
                          <input 
                              type="number" 
                              step="0.1"
                              value={state.dimensions.width}
                              onChange={(e) => setState({ ...state, dimensions: { ...state.dimensions, width: parseFloat(e.target.value) } })}
                              className="w-full px-4 py-3 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-600 text-zinc-900 dark:text-white font-bold rounded-xl focus:ring-2 focus:ring-jocker-500 focus:border-jocker-500 outline-none"
                          />
                      </div>
                      <div>
                          <label className="block text-[10px] font-black text-zinc-400 dark:text-zinc-500 mb-1.5 uppercase tracking-wider">Height</label>
                          <input 
                              type="number" 
                              step="0.1"
                              value={state.dimensions.height}
                              onChange={(e) => setState({ ...state, dimensions: { ...state.dimensions, height: parseFloat(e.target.value) } })}
                              className="w-full px-4 py-3 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-600 text-zinc-900 dark:text-white font-bold rounded-xl focus:ring-2 focus:ring-jocker-500 focus:border-jocker-500 outline-none"
                          />
                      </div>
                      <div>
                          <label className="block text-[10px] font-black text-zinc-400 dark:text-zinc-500 mb-1.5 uppercase tracking-wider">Unit</label>
                          <div className="relative">
                              <select 
                                  value={state.dimensions.unit}
                                  onChange={(e) => setState({ ...state, dimensions: { ...state.dimensions, unit: e.target.value as 'in' | 'px' } })}
                                  className="w-full px-4 py-3 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-600 text-zinc-900 dark:text-white font-bold rounded-xl focus:ring-2 focus:ring-jocker-500 focus:border-jocker-500 outline-none appearance-none"
                              >
                                  <option value="in">Inches (in)</option>
                                  <option value="px">Pixels (px)</option>
                              </select>
                              <Ruler className="absolute right-4 top-3.5 h-4 w-4 text-zinc-400 pointer-events-none" />
                          </div>
                      </div>
                  </div>
                </div>

                <button
                  onClick={handleGeneratePlan}
                  disabled={loading || !state.topic.trim()}
                  className="relative z-10 w-full bg-jocker-900 hover:bg-jocker-800 disabled:bg-zinc-300 disabled:dark:bg-zinc-800 text-white font-black py-5 rounded-2xl transition-all flex items-center justify-center gap-3 text-xl shadow-xl hover:shadow-2xl hover:-translate-y-1"
                >
                  {loading ? (
                    <>
                      <Loader2 className="animate-spin h-6 w-6" />
                      Analyzing...
                    </>
                  ) : (
                    <>
                      INITIALIZE GENERATOR
                    </>
                  )}
                </button>
              </div>
            </div>
          )}

          {/* Step 2: Plan Review */}
          {state.step === 'planning' && state.metadata && (
            <div className="max-w-4xl mx-auto animate-fade-in">
               <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-8">
                   <h2 className="text-3xl font-black text-zinc-900 dark:text-white tracking-tight">Review Ebook Plan</h2>
                   <button 
                     onClick={startImageGeneration}
                     className="bg-green-600 hover:bg-green-700 text-white px-8 py-3 rounded-xl font-bold flex items-center gap-2 shadow-lg hover:shadow-green-500/30 transition-all hover:-translate-y-1"
                   >
                      <Wand2 className="h-5 w-5" />
                      APPROVE & GENERATE
                   </button>
               </div>

               <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                  {/* Metadata Card */}
                  <div className="bg-white dark:bg-zinc-900 p-8 rounded-2xl shadow-sm border border-zinc-200 dark:border-zinc-800">
                      <h3 className="text-lg font-bold text-zinc-900 dark:text-white mb-6 flex items-center gap-2 border-b border-zinc-100 dark:border-zinc-800 pb-4">
                          <BookOpen className="h-5 w-5 text-jocker-500" />
                          KDP Metadata
                      </h3>
                      
                      <div className="space-y-6">
                          <div>
                              <label className="block text-[10px] font-black text-zinc-400 dark:text-zinc-500 uppercase tracking-widest mb-1">Title</label>
                              <div className="text-zinc-900 dark:text-white font-bold text-xl leading-tight">{state.metadata.title}</div>
                          </div>
                          <div>
                              <label className="block text-[10px] font-black text-zinc-400 dark:text-zinc-500 uppercase tracking-widest mb-1">Subtitle</label>
                              <div className="text-zinc-600 dark:text-zinc-300 font-medium leading-normal">{state.metadata.subtitle}</div>
                          </div>
                          <div>
                              <label className="block text-[10px] font-black text-zinc-400 dark:text-zinc-500 uppercase tracking-widest mb-1">Description</label>
                              <p className="text-zinc-500 dark:text-zinc-400 text-sm leading-relaxed line-clamp-4">{state.metadata.description}</p>
                          </div>
                          
                          <div>
                              <label className="block text-[10px] font-black text-zinc-400 dark:text-zinc-500 uppercase tracking-widest mb-2">High Reach Keywords</label>
                              <div className="flex flex-wrap gap-2">
                                  {state.metadata.keywords.map((kw, i) => (
                                      <span key={i} className="bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 px-3 py-1.5 rounded-lg text-xs font-bold border border-zinc-200 dark:border-zinc-700">
                                          {kw}
                                      </span>
                                  ))}
                              </div>
                          </div>
                      </div>
                  </div>

                  {/* Pages List */}
                  <div className="bg-white dark:bg-zinc-900 p-6 rounded-2xl shadow-sm border border-zinc-200 dark:border-zinc-800 h-[500px] overflow-y-auto flex flex-col">
                      <h3 className="text-lg font-bold text-zinc-900 dark:text-white mb-4 flex items-center gap-2 sticky top-0 bg-white dark:bg-zinc-900 pb-4 border-b border-zinc-100 dark:border-zinc-800 z-10">
                          <ImageIcon className="h-5 w-5 text-jocker-500" />
                          Planned Pages ({state.pages.length})
                      </h3>
                      <ul className="space-y-4 pr-2">
                          {state.pages.map((page, idx) => (
                              <li key={page.id} className="group p-3 rounded-xl hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors flex gap-4 items-start border border-transparent hover:border-zinc-100 dark:hover:border-zinc-800">
                                  <span className="bg-jocker-100 dark:bg-jocker-900/40 text-jocker-700 dark:text-jocker-300 font-mono text-xs h-6 w-8 flex items-center justify-center rounded-md font-bold mt-0.5 shrink-0">
                                      #{idx + 1}
                                  </span>
                                  <div className="flex-1">
                                      <span className="block font-bold text-zinc-800 dark:text-zinc-200 text-sm mb-1">{page.title}</span>
                                      <span className="text-zinc-500 dark:text-zinc-400 text-xs leading-relaxed block">{page.prompt}</span>
                                  </div>
                              </li>
                          ))}
                      </ul>
                  </div>
               </div>
            </div>
          )}

          {/* Step 3: Generating */}
          {state.step === 'generating' && (
               <div className="max-w-4xl mx-auto text-center mt-20">
                   <div className="relative inline-block">
                        <Loader2 className="h-20 w-20 text-jocker-600 animate-spin mb-6" />
                        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-[80%]">
                             <Ghost className="h-8 w-8 text-jocker-600 animate-pulse" />
                        </div>
                   </div>
                   
                   <h2 className="text-3xl font-black text-zinc-900 dark:text-white mb-3">Generating Masterpiece...</h2>
                   <p className="text-zinc-500 dark:text-zinc-400 mb-10 text-lg">AI KDP Studio is crafting high-resolution vectors for you. We're using a stable, serial generation pace to bypass server overloads.</p>
                   
                   <div className="w-full bg-zinc-200 dark:bg-zinc-800 rounded-full h-6 mb-4 overflow-hidden shadow-inner">
                       <div 
                          className="bg-gradient-to-r from-jocker-600 to-indigo-500 h-6 rounded-full transition-all duration-500 relative" 
                          style={{ width: `${progress}%` }} 
                       >
                            <div className="absolute inset-0 bg-white/20 animate-[shimmer_2s_infinite]"></div>
                       </div>
                   </div>
                   <div className="flex justify-between text-xs font-bold uppercase tracking-widest text-zinc-400">
                        <span>Initiated</span>
                        <span>{progress}% Complete</span>
                   </div>

                   {/* Live Preview Grid */}
                   <div className="mt-16 grid grid-cols-2 sm:grid-cols-4 md:grid-cols-5 gap-4">
                       {state.pages.map((page, i) => {
                           const isLocked = i >= 4;
                           
                           return (
                             <div key={page.id} className="aspect-[1/1.3] bg-white dark:bg-zinc-900 rounded-xl shadow-sm border border-zinc-200 dark:border-zinc-800 flex items-center justify-center overflow-hidden relative">
                                 {!isLocked ? (
                                     <>
                                        {page.status === 'completed' && page.imageUrl ? (
                                            <img src={page.imageUrl} alt="Generated" className="w-full h-full object-contain p-2" />
                                        ) : page.status === 'generating' ? (
                                            <Loader2 className="animate-spin text-jocker-400 h-8 w-8" />
                                        ) : page.status === 'failed' ? (
                                            <div className="flex flex-col items-center gap-1">
                                                <AlertCircle className="text-red-400 h-5 w-5" />
                                                <span className="text-red-400 text-[10px] font-bold uppercase">Waiting Retry</span>
                                            </div>
                                        ) : (
                                            <span className="text-zinc-300 dark:text-zinc-700 text-xs font-bold uppercase">Waiting</span>
                                        )}
                                        <div className="absolute bottom-2 right-2 bg-black/70 backdrop-blur-sm text-white text-[10px] font-bold px-2 py-0.5 rounded-full">
                                            #{i+1}
                                        </div>
                                     </>
                                 ) : (
                                     <div className="w-full h-full bg-zinc-100 dark:bg-zinc-800 flex flex-col items-center justify-center text-zinc-400 p-2 text-center">
                                         <Lock className="h-6 w-6 mb-2 text-amber-500" />
                                         <span className="text-[10px] font-black uppercase tracking-wider text-amber-500">VIP Generating</span>
                                     </div>
                                 )}
                             </div>
                           );
                       })}
                   </div>
               </div>
          )}

          {/* Step 4: Final Review & Download */}
          {state.step === 'review' && (
              <div className="max-w-6xl mx-auto">
                  <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 mb-10 bg-jocker-900 text-white p-8 rounded-3xl shadow-2xl relative overflow-hidden">
                      <div className="absolute top-0 right-0 p-8 opacity-10">
                           <Gem className="h-64 w-64" />
                      </div>
                      <div className="relative z-10">
                          <h2 className="text-4xl font-black mb-2">Your Ebook is Ready!</h2>
                          <p className="text-indigo-200 font-medium text-lg">Review your pages and download the asset files.</p>
                          <div className="inline-flex items-center gap-2 mt-4 bg-black/20 px-3 py-1 rounded-full text-xs font-bold">
                              <Ruler className="h-3 w-3" />
                              {state.dimensions.width} x {state.dimensions.height} {state.dimensions.unit}
                          </div>
                      </div>
                      <div className="flex gap-4 relative z-10">
                        <button 
                            onClick={handleDownloadZip}
                            className="bg-white hover:bg-zinc-100 text-jocker-900 px-8 py-4 rounded-xl font-black text-lg shadow-lg transition-all flex items-center gap-3 transform hover:scale-105"
                        >
                            <FileArchive className="h-6 w-6" />
                            ZIP ARCHIVE
                        </button>
                        <button 
                            onClick={handleDownloadPDF}
                            className="bg-jocker-600 hover:bg-jocker-500 text-white px-8 py-4 rounded-xl font-black text-lg shadow-lg transition-all flex items-center gap-3 transform hover:scale-105 border border-white/20"
                        >
                            <Download className="h-6 w-6" />
                            PDF DOCUMENT
                        </button>
                      </div>
                  </div>

                  {/* Cover Preview & Persistent Metadata */}
                  <div className="mb-12 bg-white dark:bg-zinc-900 p-8 rounded-3xl shadow-sm border border-zinc-200 dark:border-zinc-800 relative group">
                      <div className="flex flex-col lg:flex-row gap-10 items-start">
                          <div className="flex flex-col gap-4 mx-auto lg:mx-0">
                            <h3 className="text-xl font-black text-zinc-900 dark:text-white border-b-2 border-zinc-100 dark:border-zinc-800 pb-4 w-full text-center lg:text-left">Cover Concept</h3>
                            <div className="w-72 shrink-0 shadow-2xl rotate-1 group-hover:rotate-0 transition-all duration-500 relative rounded-lg overflow-hidden border-4 border-white dark:border-zinc-800">
                                {state.coverImage && <img src={state.coverImage} className="w-full" alt="Cover" />}
                                 {state.coverImage && (
                                    <button 
                                        onClick={() => handleDownloadSinglePNG(state.coverImage!, `Cover_${state.metadata?.title}.png`)}
                                        className="absolute top-4 right-4 bg-white/90 hover:bg-white text-zinc-900 p-2.5 rounded-lg shadow-lg flex items-center gap-2 text-xs font-bold backdrop-blur-md opacity-0 group-hover:opacity-100 transition-opacity"
                                        title="Download PNG"
                                    >
                                        <Download className="h-4 w-4" /> Save
                                    </button>
                                 )}
                            </div>
                          </div>

                          <div className="flex-1 w-full">
                              <h3 className="text-xl font-black text-zinc-900 dark:text-white border-b-2 border-zinc-100 dark:border-zinc-800 pb-4 mb-6">Metadata Details</h3>
                              <div className="space-y-8">
                                  <div>
                                      <label className="text-[10px] font-black text-jocker-600 dark:text-jocker-400 uppercase tracking-widest mb-1 block">Title</label>
                                      <h4 className="font-bold text-2xl text-zinc-900 dark:text-white">{state.metadata?.title}</h4>
                                  </div>
                                  <div>
                                      <label className="text-[10px] font-black text-jocker-600 dark:text-jocker-400 uppercase tracking-widest mb-1 block">Subtitle</label>
                                      <p className="text-zinc-600 dark:text-zinc-300 font-medium text-lg">{state.metadata?.subtitle}</p>
                                  </div>
                                  <div>
                                      <label className="text-[10px] font-black text-jocker-600 dark:text-jocker-400 uppercase tracking-widest mb-1 block">Description</label>
                                      <p className="text-sm text-zinc-600 dark:text-zinc-400 bg-zinc-50 dark:bg-zinc-800/50 p-6 rounded-2xl leading-relaxed">{state.metadata?.description}</p>
                                  </div>
                                  <div>
                                      <label className="text-[10px] font-black text-jocker-600 dark:text-jocker-400 uppercase tracking-widest mb-2 block">Keywords</label>
                                      <div className="flex flex-wrap gap-2">
                                          {state.metadata?.keywords.map((kw, i) => (
                                              <span key={i} className="bg-white dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 px-4 py-2 rounded-lg text-xs font-bold border border-zinc-200 dark:border-zinc-700 shadow-sm">
                                                  {kw}
                                              </span>
                                          ))}
                                      </div>
                                  </div>
                              </div>
                          </div>
                      </div>
                  </div>

                  {/* Interior Pages Grid */}
                  <div className="bg-white dark:bg-zinc-900 p-8 rounded-3xl shadow-sm border border-zinc-200 dark:border-zinc-800">
                       <div className="flex justify-between items-center mb-8 border-b-2 border-zinc-100 dark:border-zinc-800 pb-6">
                          <div>
                            <h3 className="text-2xl font-black text-zinc-900 dark:text-white">Interior Pages</h3>
                            <span className="text-xs font-bold text-zinc-400 uppercase tracking-wider">{state.pages.length} GENERATED ASSETS</span>
                          </div>
                       </div>
                       <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-8">
                          {state.pages.map((page, idx) => {
                              const isLocked = idx >= 4;
                              
                              return (
                              <div key={page.id} className="group relative flex flex-col">
                                  <div className={`aspect-[1/1.3] bg-zinc-100 dark:bg-zinc-800 rounded-xl overflow-hidden border-2 border-transparent ${isLocked ? 'border-amber-400/30' : 'group-hover:border-jocker-500'} transition-all shadow-sm relative mb-3`}>
                                      {page.status === 'completed' && page.imageUrl ? (
                                          <>
                                              <img 
                                                src={page.imageUrl} 
                                                alt={`Page ${idx + 1}`} 
                                                className={`w-full h-full object-contain p-4 bg-white ${isLocked ? 'blur-md opacity-50 scale-105' : ''} transition-all`} 
                                              />
                                              
                                              {isLocked && (
                                                  <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-black/10 backdrop-blur-[2px]">
                                                      <div className="bg-black/80 text-amber-400 p-3 rounded-full shadow-2xl mb-2">
                                                          <Lock className="h-6 w-6" />
                                                      </div>
                                                      <span className="text-[10px] font-black uppercase tracking-widest text-zinc-900 bg-amber-400 px-3 py-1 rounded-full shadow-lg">
                                                          VIP Access
                                                      </span>
                                                  </div>
                                              )}

                                              {!isLocked && (
                                                <button 
                                                    onClick={() => handleDownloadSinglePNG(page.imageUrl!, `Page_${idx+1}.png`)}
                                                    className="absolute top-2 right-2 bg-black/80 hover:bg-black text-white p-2 rounded-lg opacity-0 group-hover:opacity-100 transition-all transform group-hover:scale-110"
                                                    title="Download High-Res PNG"
                                                >
                                                    <Download className="h-4 w-4" />
                                                </button>
                                              )}
                                          </>
                                      ) : (
                                          <div className="w-full h-full flex flex-col items-center justify-center text-zinc-400">
                                              <AlertCircle className="h-8 w-8 mb-2" />
                                              <span className="text-xs font-bold">Error</span>
                                          </div>
                                      )}
                                  </div>
                                  <div className="flex flex-col px-1">
                                      <span className="text-xs font-bold text-zinc-800 dark:text-zinc-200 truncate mb-1">{page.title}</span>
                                      <div className="flex justify-between items-center">
                                          <span className="text-[10px] font-bold text-zinc-400 dark:text-zinc-500 uppercase tracking-wider">Page {idx + 1}</span>
                                          {page.status === 'failed' && (
                                              <button 
                                                  onClick={() => handleRetryPage(page.id, page.prompt)}
                                                  className="text-[10px] bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 hover:bg-zinc-50 text-jocker-600 px-2 py-1 rounded shadow-sm flex items-center gap-1 font-bold"
                                              >
                                                  <RefreshCw className="h-3 w-3" /> Retry
                                              </button>
                                          )}
                                      </div>
                                  </div>
                              </div>
                            );
                          })}
                       </div>
                  </div>
              </div>
          )}
        </main>

        {/* Right Ad Sidebar */}
        <aside className="hidden xl:flex flex-col w-[200px] shrink-0 p-4 gap-4 border-l border-zinc-200 dark:border-zinc-800 bg-white/50 dark:bg-zinc-900/50">
             <div className="w-full h-[600px] ad-pattern rounded-lg border border-dashed border-zinc-300 dark:border-zinc-700 flex items-center justify-center text-zinc-400 text-xs font-mono uppercase tracking-widest text-center p-4">
                Vertical Ad Space 160x600
            </div>
             <div className="w-full h-[250px] ad-pattern rounded-lg border border-dashed border-zinc-300 dark:border-zinc-700 flex items-center justify-center text-zinc-400 text-xs font-mono uppercase tracking-widest text-center p-4">
                Square Ad Space 250x250
            </div>
        </aside>

      </div>
      
      <footer className="mt-auto bg-white dark:bg-zinc-950 border-t border-zinc-200 dark:border-zinc-800 py-10">
          <div className="max-w-7xl mx-auto px-6 flex flex-col md:flex-row justify-between items-center gap-6">
              <div className="flex items-center gap-2 opacity-50 grayscale hover:grayscale-0 transition-all">
                   <Ghost className="h-5 w-5" />
                   <p className="text-zinc-500 text-sm font-bold">© 2025 AI KDP Studio. Powered by JOCKER</p>
              </div>
              
              <div className="flex items-center gap-6 text-zinc-400">
                  <span className="text-[10px] uppercase font-black tracking-widest text-zinc-300">Secure Payment</span>
                  <div className="flex gap-4">
                      <div title="Visa/Mastercard" className="hover:text-jocker-600 transition-colors"><CreditCard className="h-6 w-6" /></div>
                      <div title="Crypto" className="hover:text-orange-500 transition-colors"><Bitcoin className="h-6 w-6" /></div>
                      <span className="font-black text-lg italic text-blue-700/80 hover:text-blue-700 transition-colors cursor-pointer">PayPal</span>
                  </div>
              </div>
          </div>
      </footer>
    </div>
  );
}
