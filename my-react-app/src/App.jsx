import React from "react";

const App = () => {
  return (
    <div className="min-h-screen bg-[#030712] font-sans selection:bg-cyan-500 selection:text-white overflow-hidden flex flex-col">
      
      {/* --- PREMIUM HERO SECTION --- */}
      <div className="relative w-full min-h-[95vh] flex flex-col pt-4 pb-20">
        
        {/* Animated Background Elements */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          {/* Subtle Truck Background Image */}
          <div 
            className="absolute inset-0 opacity-20 mix-blend-luminosity"
            style={{
              backgroundImage: `url('https://images.unsplash.com/photo-1601584115197-04ecc0da31d7?q=80&w=2070&auto=format&fit=crop')`,
              backgroundSize: 'cover',
              backgroundPosition: 'center'
            }}
          ></div>
          
          {/* Glowing Orbs */}
          <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-blue-600/30 rounded-full blur-[120px]"></div>
          <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-cyan-600/20 rounded-full blur-[120px]"></div>
          
          {/* Grid Pattern overlay */}
          <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.03)_1px,transparent_1px)] bg-[size:64px_64px] [mask-image:radial-gradient(ellipse_60%_60%_at_50%_50%,#000_70%,transparent_100%)]"></div>
        </div>

        <div className="relative z-10 max-w-7xl mx-auto px-6 md:px-12 w-full flex-1 flex flex-col">
          
          {/* 1. GLASSMORPHISM NAVBAR */}
          <nav className="flex items-center justify-between py-4 px-6 mt-4 bg-white/5 backdrop-blur-md border border-white/10 rounded-2xl shadow-2xl">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-cyan-400 rounded-xl flex items-center justify-center shadow-lg shadow-cyan-500/20">
                <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
              </div>
              <span className="text-2xl font-black text-white tracking-tight">
                Transit<span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-cyan-300">Ops</span>
              </span>
            </div>

            <div className="hidden md:flex items-center space-x-8 text-sm font-semibold">
              <a href="#" className="text-cyan-400">Platform</a>
              <a href="#" className="text-slate-400 hover:text-white transition-all">Solutions</a>
              <a href="#" className="text-slate-400 hover:text-white transition-all">Resources</a>
            </div>

            <div className="flex items-center space-x-4">
              <button className="hidden md:block text-slate-300 hover:text-white font-semibold text-sm transition-colors">
                Sign In
              </button>
              <button className="relative group overflow-hidden bg-white/10 hover:bg-white/20 border border-white/20 text-white font-semibold py-2 px-6 rounded-xl transition-all duration-300 backdrop-blur-sm">
                <span className="relative z-10">Get Started</span>
                <div className="absolute inset-0 h-full w-full bg-gradient-to-r from-blue-500 to-cyan-500 opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
              </button>
            </div>
          </nav>

          {/* 2. HERO CONTENT */}
          <div className="flex-1 flex flex-col items-center justify-center text-center mt-16 md:mt-24 max-w-4xl mx-auto">
            
            {/* New Badge */}
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/5 border border-white/10 backdrop-blur-md mb-8">
              <span className="flex h-2 w-2 relative">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-cyan-500"></span>
              </span>
              <span className="text-xs font-bold text-slate-300 uppercase tracking-widest">Odoo Hackathon 2026 Entry</span>
            </div>

            <h1 className="text-5xl md:text-7xl font-black text-white leading-[1.1] mb-6 tracking-tight">
              Next-Gen Logistics, <br />
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 via-cyan-300 to-teal-300 animate-gradient-x">
                Fully Automated.
              </span>
            </h1>
            
            <p className="text-slate-400 text-lg md:text-xl mb-10 max-w-2xl leading-relaxed font-medium">
              Ditch the spreadsheets. TransitOps is the intelligent nerve center for your fleet, bringing vehicles, drivers, and analytics into one unified, real-time dashboard.
            </p>
            
            <div className="flex flex-col sm:flex-row items-center gap-4">
              <button className="w-full sm:w-auto bg-gradient-to-r from-blue-600 to-cyan-500 hover:from-blue-500 hover:to-cyan-400 text-white font-bold py-4 px-8 rounded-xl transition-all shadow-[0_0_40px_-10px_rgba(6,182,212,0.5)] hover:shadow-[0_0_60px_-15px_rgba(6,182,212,0.7)] hover:-translate-y-1 flex items-center justify-center gap-2">
                Launch Dashboard
                <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M14 5l7 7m0 0l-7 7m7-7H3"/></svg>
              </button>
              <button className="w-full sm:w-auto bg-white/5 hover:bg-white/10 border border-white/10 text-white font-bold py-4 px-8 rounded-xl transition-all backdrop-blur-md hover:-translate-y-1 flex items-center justify-center gap-2">
                View Architecture
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* --- PREMIUM ROLE CARDS (OVERLAPPING SECTION) --- */}
      <div className="relative z-20 max-w-7xl mx-auto px-6 md:px-12 -mt-16 pb-20 w-full">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          
          {[
            { role: 'Fleet Manager', desc: 'Oversees fleet assets, maintenance, and operational efficiency.', icon: 'M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4', color: 'text-blue-400', bg: 'bg-blue-400/10', border: 'group-hover:border-blue-500/50' },
            { role: 'Driver', desc: 'Creates trips, assigns vehicles, and monitors active deliveries.', icon: 'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z', color: 'text-emerald-400', bg: 'bg-emerald-400/10', border: 'group-hover:border-emerald-500/50' },
            { role: 'Safety Officer', desc: 'Ensures compliance, tracks license validity, and safety scores.', icon: 'M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z', color: 'text-amber-400', bg: 'bg-amber-400/10', border: 'group-hover:border-amber-500/50' },
            { role: 'Financial Analyst', desc: 'Reviews expenses, fuel consumption, and profitability.', icon: 'M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z', color: 'text-purple-400', bg: 'bg-purple-400/10', border: 'group-hover:border-purple-500/50' }
          ].map((item, index) => (
            <div key={index} className={`group bg-[#0f172a]/80 backdrop-blur-xl border border-white/5 p-8 rounded-3xl transition-all duration-300 hover:-translate-y-2 hover:bg-[#1e293b]/90 hover:shadow-2xl ${item.border}`}>
              <div className={`w-14 h-14 rounded-2xl ${item.bg} flex items-center justify-center mb-6 transition-transform group-hover:scale-110 duration-300`}>
                <svg className={`w-7 h-7 ${item.color}`} fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d={item.icon} />
                </svg>
              </div>
              <h3 className="text-xl font-bold text-white mb-3 tracking-wide">{item.role}</h3>
              <p className="text-slate-400 text-sm leading-relaxed font-medium">{item.desc}</p>
            </div>
          ))}

        </div>
      </div>

    </div>
  );
};

export default App;