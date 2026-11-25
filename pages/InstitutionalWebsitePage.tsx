import React, { useEffect, useRef, useState } from 'react';
import {
  Truck, ShieldCheck, Cpu, Globe, MapPin, Phone, Mail, ArrowRight, Menu, X,
  CheckCircle2, Clock, FileSpreadsheet, Monitor, Award, Users, Wheat, Factory,
  Route, Sparkles, Send, MessageCircle, LogIn, Package, Headphones, Zap, ArrowUpRight
} from 'lucide-react';
import InstitutionalCoverageMap from '../components/InstitutionalCoverageMap';
import { STRATEGIC_CLIENTS } from '../utils/clientLogosData';

interface InstitutionalWebsitePageProps {
  companyLogo?: string | null;
  isLoggedIn?: boolean;
  onGoToSystem?: () => void;
  onOpenPresentation?: () => void;
}

const WHATSAPP_COMERCIAL = '5535991030469';
const WHATSAPP_OPERACOES = '5535998721970';
const EMAIL_COMERCIAL = 'contato@transcunhaoficial.com.br';
const CLIENT_PORTAL_URL = 'https://transcunha.digital';

const NAV_LINKS = [
  { id: 'inicio', label: 'Início' },
  { id: 'sobre', label: 'Sobre' },
  { id: 'servicos', label: 'Serviços' },
  { id: 'tecnologia', label: 'Tecnologia' },
  { id: 'clientes', label: 'Clientes' },
  { id: 'contato', label: 'Contato' }
];

const CLIENTS = STRATEGIC_CLIENTS;

const SERVICES = [
  {
    icon: Wheat,
    title: 'Grãos & Granéis Agrícolas',
    text: 'Escoamento de soja, milho, farelos e fertilizantes com agilidade nos picos de safra e frota dimensionada para alto volume.',
    accent: 'from-amber-400/20 to-amber-600/5 text-amber-300 border-amber-400/30'
  },
  {
    icon: Factory,
    title: 'Cargas Industriais',
    text: 'Transporte de insumos e produtos acabados para a indústria, com controle de janelas de coleta e entrega.',
    accent: 'from-sky-400/20 to-sky-600/5 text-sky-300 border-sky-400/30'
  },
  {
    icon: Route,
    title: 'Rotas Dedicadas',
    text: 'Operações sob medida, com planejamento de rotas interestaduais e atendimento contínuo para contratos recorrentes.',
    accent: 'from-indigo-400/20 to-indigo-600/5 text-indigo-300 border-indigo-400/30'
  },
  {
    icon: ShieldCheck,
    title: 'Gestão de Risco',
    text: 'Validação de motoristas a cada embarque, homologação nas principais gerenciadoras e 100% das cargas asseguradas.',
    accent: 'from-emerald-400/20 to-emerald-600/5 text-emerald-300 border-emerald-400/30'
  }
];

const STATES = [
  { uf: 'MG', name: 'Minas Gerais', tag: 'Matriz' },
  { uf: 'SP', name: 'São Paulo' },
  { uf: 'MS', name: 'Mato Grosso do Sul' },
  { uf: 'PR', name: 'Paraná' },
  { uf: 'GO', name: 'Goiás' },
  { uf: 'ES', name: 'Espírito Santo' }
];

// Reveal-on-scroll hook
const useReveal = () => {
  useEffect(() => {
    const els = Array.from(document.querySelectorAll<HTMLElement>('[data-reveal]'));
    if (!('IntersectionObserver' in window)) {
      els.forEach(el => el.classList.add('tc-visible'));
      return;
    }
    const io = new IntersectionObserver(
      entries => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            entry.target.classList.add('tc-visible');
            io.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.15, rootMargin: '0px 0px -40px 0px' }
    );
    els.forEach(el => io.observe(el));
    return () => io.disconnect();
  }, []);
};

// Animated counter that starts when visible
const Counter: React.FC<{ to: number; prefix?: string; suffix?: string; duration?: number; format?: boolean }> = ({
  to, prefix = '', suffix = '', duration = 1800, format = true
}) => {
  const ref = useRef<HTMLSpanElement>(null);
  const [value, setValue] = useState(0);
  const started = useRef(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const run = () => {
      if (started.current) return;
      started.current = true;
      const start = performance.now();
      const tick = (now: number) => {
        const p = Math.min(1, (now - start) / duration);
        const eased = 1 - Math.pow(1 - p, 3);
        setValue(Math.round(to * eased));
        if (p < 1) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    };
    if (!('IntersectionObserver' in window)) { run(); return; }
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) { run(); io.disconnect(); } }, { threshold: 0.4 });
    io.observe(el);
    return () => io.disconnect();
  }, [to, duration]);

  return (
    <span ref={ref}>
      {prefix}{format ? value.toLocaleString('pt-BR') : value}{suffix}
    </span>
  );
};

export const InstitutionalWebsitePage: React.FC<InstitutionalWebsitePageProps> = ({
  companyLogo,
  isLoggedIn,
  onGoToSystem,
  onOpenPresentation
}) => {
  const logoSrc = companyLogo || '/logo.png';
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [activeSection, setActiveSection] = useState('inicio');
  const [form, setForm] = useState({ nome: '', empresa: '', origem: '', destino: '', carga: '' });

  useReveal();

  // SEO
  useEffect(() => {
    const prevTitle = document.title;
    document.title = 'Transcunha Transportes e Logística | Soluções que movem o futuro';
    let meta = document.querySelector('meta[name="description"]') as HTMLMetaElement | null;
    const created = !meta;
    const prevContent = meta?.content;
    if (!meta) {
      meta = document.createElement('meta');
      meta.name = 'description';
      document.head.appendChild(meta);
    }
    meta.content = 'Transcunha Transportes e Logística: transporte rodoviário de grãos e cargas industriais com +15 anos de experiência, +5.000 motoristas parceiros, cargas 100% asseguradas e Portal do Cliente em tempo real.';
    return () => {
      document.title = prevTitle;
      if (created) meta?.remove();
      else if (meta && prevContent !== undefined) meta.content = prevContent;
    };
  }, []);

  // Scroll state + active section
  useEffect(() => {
    const onScroll = () => {
      setScrolled(window.scrollY > 24);
      let current = 'inicio';
      for (const link of NAV_LINKS) {
        const el = document.getElementById(link.id);
        if (el && el.getBoundingClientRect().top <= 140) current = link.id;
      }
      setActiveSection(current);
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const scrollTo = (id: string) => {
    setMobileOpen(false);
    const el = document.getElementById(id);
    if (el) window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - 72, behavior: 'smooth' });
  };

  const whatsappLink = (phone: string, text: string) =>
    `https://wa.me/${phone}?text=${encodeURIComponent(text)}`;

  const handleQuoteSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const msg =
      `Olá, Transcunha! Gostaria de solicitar uma cotação de frete.\n\n` +
      `*Nome:* ${form.nome}\n` +
      (form.empresa ? `*Empresa:* ${form.empresa}\n` : '') +
      `*Origem:* ${form.origem}\n` +
      `*Destino:* ${form.destino}\n` +
      (form.carga ? `*Carga / Volume:* ${form.carga}\n` : '') +
      `\nEnviado pelo site transcunhaoficial.com.br`;
    window.open(whatsappLink(WHATSAPP_COMERCIAL, msg), '_blank', 'noopener');
  };

  return (
    <div className="tc-site min-h-screen bg-[#050a16] text-slate-100 overflow-x-hidden selection:bg-blue-600 selection:text-white">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600;700;800;900&display=swap');
        .tc-site { font-family: 'Outfit', ui-sans-serif, system-ui, sans-serif; }
        html { scroll-behavior: smooth; }

        [data-reveal] { opacity: 0; transform: translateY(28px); transition: opacity .8s cubic-bezier(.2,.7,.2,1), transform .8s cubic-bezier(.2,.7,.2,1); }
        [data-reveal="left"] { transform: translateX(-36px); }
        [data-reveal="right"] { transform: translateX(36px); }
        [data-reveal="zoom"] { transform: scale(.94); }
        [data-reveal].tc-visible { opacity: 1; transform: none; }

        @keyframes tc-float { 0%,100% { transform: translateY(0) } 50% { transform: translateY(-14px) } }
        @keyframes tc-blob { 0%,100% { transform: translate(0,0) scale(1) } 33% { transform: translate(40px,-30px) scale(1.08) } 66% { transform: translate(-30px,20px) scale(.95) } }
        @keyframes tc-marquee { from { transform: translateX(0) } to { transform: translateX(-50%) } }
        @keyframes tc-road { from { background-position: 0 0 } to { background-position: -160px 0 } }
        @keyframes tc-truck { 0% { transform: translateX(-10%) } 100% { transform: translateX(110%) } }
        @keyframes tc-pulse-ring { 0% { transform: scale(.8); opacity: .8 } 100% { transform: scale(2.4); opacity: 0 } }
        @keyframes tc-shine { from { background-position: 200% center } to { background-position: -200% center } }
        @keyframes tc-grid { from { background-position: 0 0 } to { background-position: 48px 48px } }

        .tc-float { animation: tc-float 6s ease-in-out infinite; }
        .tc-blob { animation: tc-blob 18s ease-in-out infinite; }
        .tc-marquee { animation: tc-marquee 38s linear infinite; }
        .tc-marquee:hover { animation-play-state: paused; }
        .tc-road { background-image: repeating-linear-gradient(90deg, rgba(148,163,184,.55) 0 60px, transparent 60px 160px); animation: tc-road 1.2s linear infinite; }
        .tc-truck { animation: tc-truck 9s linear infinite; }
        .tc-pulse-ring::before { content: ''; position: absolute; inset: 0; border-radius: 9999px; background: currentColor; animation: tc-pulse-ring 2s ease-out infinite; }
        .tc-shine-text { background: linear-gradient(90deg, #38bdf8, #ffffff, #60a5fa, #38bdf8); background-size: 200% auto; -webkit-background-clip: text; background-clip: text; color: transparent; animation: tc-shine 6s linear infinite; }
        .tc-grid-bg { background-image: linear-gradient(rgba(56,189,248,.07) 1px, transparent 1px), linear-gradient(90deg, rgba(56,189,248,.07) 1px, transparent 1px); background-size: 48px 48px; animation: tc-grid 8s linear infinite; }
        .tc-card { transition: transform .4s cubic-bezier(.2,.7,.2,1), border-color .4s, box-shadow .4s; }
        .tc-card:hover { transform: translateY(-6px); border-color: rgba(56,189,248,.45); box-shadow: 0 24px 60px -20px rgba(0,82,204,.55); }
        .tc-input { width: 100%; background: rgba(15,23,42,.8); border: 1px solid rgba(71,85,105,.7); border-radius: .85rem; padding: .8rem 1rem; color: #f1f5f9; font-size: .9rem; outline: none; transition: border-color .25s, box-shadow .25s; }
        .tc-input::placeholder { color: #64748b; }
        .tc-input:focus { border-color: #38bdf8; box-shadow: 0 0 0 3px rgba(56,189,248,.18); }
        @media (prefers-reduced-motion: reduce) {
          .tc-float, .tc-blob, .tc-marquee, .tc-road, .tc-truck, .tc-shine-text, .tc-grid-bg { animation: none !important; }
          [data-reveal] { opacity: 1; transform: none; }
        }
      `}</style>

      {/* ================= NAVBAR ================= */}
      <header
        className={`fixed top-0 inset-x-0 z-50 transition-all duration-500 ${
          scrolled ? 'bg-[#050a16]/85 backdrop-blur-xl border-b border-slate-800/80 shadow-2xl shadow-black/40' : 'bg-transparent'
        }`}
      >
        <nav className="max-w-7xl mx-auto px-4 sm:px-6 h-[72px] flex items-center justify-between gap-4">
          <button id="site-logo" onClick={() => scrollTo('inicio')} className="flex items-center gap-3 cursor-pointer shrink-0">
            <img src={logoSrc} alt="Transcunha Transportes e Logística" className="h-10 w-auto object-contain drop-shadow-[0_4px_14px_rgba(0,82,204,.55)]" />
            <div className="hidden sm:block text-left leading-tight">
              <div className="text-sm font-extrabold tracking-wide">TRANS<span className="text-sky-400">CUNHA</span></div>
              <div className="text-[10px] text-slate-400 tracking-[0.2em] uppercase">Transportes & Logística</div>
            </div>
          </button>

          <div className="hidden lg:flex items-center gap-1 bg-slate-900/60 border border-slate-800 rounded-full p-1 backdrop-blur">
            {NAV_LINKS.map(link => (
              <button
                key={link.id}
                id={`nav-${link.id}`}
                onClick={() => scrollTo(link.id)}
                className={`px-4 py-1.5 rounded-full text-sm font-medium transition-all cursor-pointer ${
                  activeSection === link.id ? 'bg-blue-600 text-white shadow-lg shadow-blue-900/50' : 'text-slate-300 hover:text-white'
                }`}
              >
                {link.label}
              </button>
            ))}
          </div>

          <div className="hidden lg:flex items-center gap-2">
            {isLoggedIn && onGoToSystem && (
              <button
                id="nav-back-system"
                onClick={onGoToSystem}
                className="flex items-center gap-2 px-4 py-2 rounded-full text-sm font-semibold text-sky-300 border border-sky-500/40 hover:bg-sky-500/10 transition-all cursor-pointer"
              >
                Voltar ao Sistema
              </button>
            )}
            <a
              id="nav-client-area"
              href={CLIENT_PORTAL_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 px-4 py-2 rounded-full text-sm font-semibold text-slate-200 border border-slate-700 hover:border-sky-400/60 hover:text-white transition-all cursor-pointer"
            >
              <LogIn className="w-4 h-4" />
              Área do Cliente
            </a>
            <a
              id="nav-quote"
              href="#contato"
              onClick={e => { e.preventDefault(); scrollTo('contato'); }}
              className="flex items-center gap-2 px-5 py-2 rounded-full text-sm font-bold bg-gradient-to-r from-blue-600 to-sky-500 hover:from-blue-500 hover:to-sky-400 shadow-lg shadow-blue-900/50 transition-all hover:scale-[1.03]"
            >
              Solicitar Cotação <ArrowRight className="w-4 h-4" />
            </a>
          </div>

          <button
            id="nav-mobile-toggle"
            onClick={() => setMobileOpen(o => !o)}
            className="lg:hidden p-2 rounded-xl border border-slate-700 text-slate-200 cursor-pointer"
            aria-label="Abrir menu"
          >
            {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </nav>

        {mobileOpen && (
          <div className="lg:hidden bg-[#070d1d]/97 backdrop-blur-xl border-t border-slate-800 px-4 py-4 space-y-1">
            {NAV_LINKS.map(link => (
              <button
                key={link.id}
                onClick={() => scrollTo(link.id)}
                className={`w-full text-left px-4 py-3 rounded-xl text-sm font-medium cursor-pointer ${
                  activeSection === link.id ? 'bg-blue-600/20 text-sky-300' : 'text-slate-300'
                }`}
              >
                {link.label}
              </button>
            ))}
            <div className="grid grid-cols-2 gap-2 pt-2">
              <a
                href={CLIENT_PORTAL_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="px-4 py-3 rounded-xl text-sm font-semibold border border-slate-700 cursor-pointer flex items-center justify-center gap-2 text-slate-200"
              >
                <LogIn className="w-4 h-4" />
                Área do Cliente
              </a>
              <button onClick={() => scrollTo('contato')} className="px-4 py-3 rounded-xl text-sm font-bold bg-blue-600 cursor-pointer">
                Cotação
              </button>
            </div>
          </div>
        )}
      </header>

      <main>
        {/* ================= HERO ================= */}
        <section id="inicio" className="relative min-h-screen flex items-center pt-[72px] overflow-hidden">
          <div className="absolute inset-0 tc-grid-bg opacity-60 pointer-events-none" />
          <div className="absolute -top-40 -left-40 w-[560px] h-[560px] bg-blue-600/25 rounded-full blur-[140px] tc-blob pointer-events-none" />
          <div className="absolute top-1/3 -right-40 w-[520px] h-[520px] bg-sky-500/20 rounded-full blur-[140px] tc-blob pointer-events-none" style={{ animationDelay: '-6s' }} />
          <div className="absolute bottom-0 left-1/3 w-[420px] h-[420px] bg-indigo-600/20 rounded-full blur-[140px] tc-blob pointer-events-none" style={{ animationDelay: '-12s' }} />

          <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 w-full grid lg:grid-cols-12 gap-12 items-center py-16">
            <div className="lg:col-span-7">
              <div data-reveal className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-blue-950/70 border border-blue-500/40 text-sky-300 text-xs font-bold uppercase tracking-[0.18em] mb-6">
                <span className="relative w-2 h-2 rounded-full bg-emerald-400 text-emerald-400 tc-pulse-ring" />
                Transporte Rodoviário de Cargas
              </div>

              <h1 data-reveal className="text-5xl sm:text-6xl xl:text-7xl font-black tracking-tight leading-[1.02] mb-6" style={{ transitionDelay: '.1s' }}>
                Soluções que <br />
                <span className="tc-shine-text">movem o futuro</span>
              </h1>

              <p data-reveal className="text-lg text-slate-300 max-w-xl leading-relaxed mb-9" style={{ transitionDelay: '.2s' }}>
                Conectamos o agronegócio e a indústria brasileira aos principais polos produtores, centros industriais e portos — com segurança, pontualidade e tecnologia própria.
              </p>

              <div data-reveal className="flex flex-wrap gap-3 mb-12" style={{ transitionDelay: '.3s' }}>
                <button
                  id="hero-quote"
                  onClick={() => scrollTo('contato')}
                  className="group flex items-center gap-2 px-7 py-3.5 rounded-full font-bold bg-gradient-to-r from-blue-600 to-sky-500 shadow-xl shadow-blue-900/60 hover:scale-[1.03] transition-all cursor-pointer"
                >
                  Solicitar Cotação
                  <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                </button>
                <a
                  id="hero-whatsapp"
                  href={whatsappLink(WHATSAPP_COMERCIAL, 'Olá, Transcunha! Vim pelo site e gostaria de falar com o comercial.')}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 px-7 py-3.5 rounded-full font-semibold border border-slate-600 hover:border-emerald-400/70 hover:bg-emerald-500/10 transition-all"
                >
                  <MessageCircle className="w-5 h-5 text-emerald-400" />
                  Falar no WhatsApp
                </a>
              </div>

              <div data-reveal className="grid grid-cols-3 gap-4 max-w-lg" style={{ transitionDelay: '.4s' }}>
                {[
                  { node: <Counter to={15} prefix="+" />, label: 'Anos de experiência' },
                  { node: <Counter to={5000} prefix="+" />, label: 'Motoristas parceiros' },
                  { node: <Counter to={100} suffix="%" />, label: 'Cargas asseguradas' }
                ].map((s, i) => (
                  <div key={i} className="border-l-2 border-sky-500/60 pl-4">
                    <div className="text-3xl font-black text-white">{s.node}</div>
                    <div className="text-xs text-slate-400 mt-1">{s.label}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Hero visual */}
            <div data-reveal="zoom" className="lg:col-span-5 relative" style={{ transitionDelay: '.2s' }}>
              <div className="tc-float relative rounded-[2rem] bg-gradient-to-b from-slate-900/90 to-[#0a1430]/95 border border-blue-500/30 p-6 shadow-2xl shadow-blue-950/80 backdrop-blur">
                <div className="flex items-center justify-between mb-5">
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-400" />
                    <span className="text-sm font-bold">Portal do Cliente</span>
                  </div>
                  <span className="text-[11px] font-mono font-bold text-sky-300 bg-blue-950 border border-blue-500/30 rounded-md px-2 py-1">AO VIVO</span>
                </div>

                <div className="space-y-3">
                  <div className="p-4 rounded-2xl bg-slate-950/70 border border-slate-800">
                    <div className="flex items-center justify-between mb-3">
                      <div>
                        <div className="text-[11px] text-slate-400">Carga em trânsito</div>
                        <div className="text-sm font-bold">Soja a Granel • 48,5 t</div>
                      </div>
                      <span className="text-[11px] font-bold text-sky-300 bg-blue-600/25 border border-blue-500/40 rounded-lg px-2.5 py-1">Em viagem</span>
                    </div>
                    {/* Animated road */}
                    <div className="relative h-10 rounded-xl bg-slate-900 overflow-hidden border border-slate-800">
                      <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-[3px] tc-road" />
                      <div className="absolute top-1/2 -translate-y-1/2 left-0 w-full tc-truck">
                        <div className="w-9 h-7 rounded-md bg-gradient-to-r from-blue-600 to-sky-400 flex items-center justify-center shadow-lg shadow-sky-500/40">
                          <Truck className="w-4 h-4 text-white" />
                        </div>
                      </div>
                    </div>
                    <div className="flex justify-between text-[11px] text-slate-400 mt-2">
                      <span className="flex items-center gap-1"><MapPin className="w-3 h-3 text-sky-400" />Uberaba - MG</span>
                      <span className="flex items-center gap-1"><MapPin className="w-3 h-3 text-emerald-400" />Santos - SP</span>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="p-4 rounded-2xl bg-slate-950/70 border border-slate-800">
                      <FileSpreadsheet className="w-5 h-5 text-indigo-300 mb-2" />
                      <div className="text-xs text-slate-400">Documentos</div>
                      <div className="text-sm font-bold">CT-e & Canhotos</div>
                    </div>
                    <div className="p-4 rounded-2xl bg-slate-950/70 border border-slate-800">
                      <Clock className="w-5 h-5 text-sky-300 mb-2" />
                      <div className="text-xs text-slate-400">Cotações</div>
                      <div className="text-sm font-bold">Tempo real</div>
                    </div>
                  </div>

                  <div className="p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 flex items-center gap-3">
                    <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
                    <div className="text-xs text-emerald-100">Descarga confirmada • Canhoto disponível para download</div>
                  </div>
                </div>
              </div>

              <div className="absolute -bottom-6 -left-6 hidden sm:flex items-center gap-3 px-4 py-3 rounded-2xl bg-slate-900/95 border border-slate-700 shadow-xl tc-float" style={{ animationDelay: '-3s' }}>
                <div className="w-10 h-10 rounded-xl bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center">
                  <ShieldCheck className="w-5 h-5 text-emerald-400" />
                </div>
                <div>
                  <div className="text-xs text-slate-400">Índice de segurança</div>
                  <div className="text-sm font-black text-emerald-400">99,99%</div>
                </div>
              </div>
            </div>
          </div>

          <button
            onClick={() => scrollTo('sobre')}
            className="absolute bottom-6 left-1/2 -translate-x-1/2 hidden md:flex flex-col items-center gap-2 text-slate-500 hover:text-sky-300 transition-colors cursor-pointer"
            aria-label="Rolar para baixo"
          >
            <span className="text-[10px] uppercase tracking-[0.3em]">Role</span>
            <span className="w-5 h-8 rounded-full border-2 border-current flex justify-center pt-1.5">
              <span className="w-1 h-1.5 rounded-full bg-current tc-float" style={{ animationDuration: '1.6s' }} />
            </span>
          </button>
        </section>

        {/* ================= SOBRE ================= */}
        <section id="sobre" className="relative py-24 sm:py-32">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 grid lg:grid-cols-2 gap-16 items-center">
            <div data-reveal="left">
              <span className="text-xs font-bold uppercase tracking-[0.25em] text-sky-400">Quem somos</span>
              <h2 className="text-4xl sm:text-5xl font-black tracking-tight mt-3 mb-6 leading-tight">
                Especialistas no modal <span className="text-sky-400">rodoviário</span>
              </h2>
              <p className="text-slate-300 leading-relaxed mb-5">
                A Transcunha Transportes e Logística está estrategicamente posicionada em <strong className="text-white">Pratápolis - MG</strong>, próxima aos maiores polos de produção e processamento do agronegócio e da indústria brasileira.
              </p>
              <p className="text-slate-300 leading-relaxed mb-8">
                Com mais de 15 anos de expertise de seus fundadores, conectamos produtores, indústrias e portos com eficiência, transparência fiscal e garantia de pontualidade.
              </p>
              <div className="grid sm:grid-cols-3 gap-3">
                {[
                  { icon: Zap, title: 'Agilidade', text: 'Coleta e entrega pontual' },
                  { icon: ShieldCheck, title: 'Segurança', text: 'Risco gerenciado' },
                  { icon: Cpu, title: 'Tecnologia', text: 'Portal em tempo real' }
                ].map(p => (
                  <div key={p.title} className="tc-card p-4 rounded-2xl bg-slate-900/70 border border-slate-800">
                    <p.icon className="w-6 h-6 text-sky-400 mb-3" />
                    <div className="font-bold text-sm">{p.title}</div>
                    <div className="text-xs text-slate-400 mt-1">{p.text}</div>
                  </div>
                ))}
              </div>
            </div>

            <div data-reveal="right" className="grid grid-cols-2 gap-4">
              {[
                { icon: Award, value: <Counter to={15} prefix="+" />, unit: 'anos', label: 'Experiência consolidada dos fundadores', color: 'text-sky-400', border: 'border-blue-500/30' },
                { icon: Users, value: <Counter to={5000} prefix="+" />, unit: '', label: 'Motoristas parceiros e agregados', color: 'text-sky-300', border: 'border-sky-500/30' },
                { icon: ShieldCheck, value: <>Apenas 1</>, unit: '', label: 'Sinistro registrado de 2022 a 2026', color: 'text-emerald-400', border: 'border-emerald-500/30' },
                { icon: CheckCircle2, value: <Counter to={100} suffix="%" />, unit: '', label: 'Cargas asseguradas (RCTR-C e RCF-DC)', color: 'text-indigo-300', border: 'border-indigo-500/30' }
              ].map((s, i) => (
                <div key={i} className={`tc-card p-6 rounded-3xl bg-gradient-to-b from-slate-900/90 to-[#0b1530]/90 border ${s.border} ${i % 2 === 1 ? 'translate-y-8' : ''}`}>
                  <s.icon className={`w-7 h-7 ${s.color} mb-5`} />
                  <div className="text-4xl font-black whitespace-nowrap leading-none">
                    {s.value}{s.unit && <span className={`text-lg ml-1 ${s.color}`}>{s.unit}</span>}
                  </div>
                  <div className="text-sm text-slate-400 mt-3 leading-snug">{s.label}</div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ================= SERVIÇOS ================= */}
        <section id="servicos" className="relative py-24 sm:py-32 bg-gradient-to-b from-[#050a16] via-[#081128] to-[#050a16]">
          <div className="max-w-7xl mx-auto px-4 sm:px-6">
            <div data-reveal className="text-center max-w-2xl mx-auto mb-16">
              <span className="text-xs font-bold uppercase tracking-[0.25em] text-sky-400">Nossos serviços</span>
              <h2 className="text-4xl sm:text-5xl font-black tracking-tight mt-3 mb-4">Logística completa para o seu negócio</h2>
              <p className="text-slate-400">Soluções rodoviárias sob medida para o agronegócio e a indústria, do planejamento à confirmação de descarga.</p>
            </div>

            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5">
              {SERVICES.map((s, i) => (
                <div
                  key={s.title}
                  data-reveal
                  style={{ transitionDelay: `${i * 0.1}s` }}
                  className="tc-card group relative p-7 rounded-3xl bg-slate-900/70 border border-slate-800 overflow-hidden"
                >
                  <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-sky-400/50 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                  <div className={`w-14 h-14 rounded-2xl bg-gradient-to-br ${s.accent} border flex items-center justify-center mb-6 group-hover:scale-110 transition-transform`}>
                    <s.icon className="w-7 h-7" />
                  </div>
                  <h3 className="text-lg font-bold mb-3">{s.title}</h3>
                  <p className="text-sm text-slate-400 leading-relaxed">{s.text}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ================= TECNOLOGIA ================= */}
        <section id="tecnologia" className="relative py-24 sm:py-32 overflow-hidden">
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-blue-700/10 rounded-full blur-[160px] pointer-events-none" />
          <div className="relative max-w-7xl mx-auto px-4 sm:px-6 grid lg:grid-cols-2 gap-16 items-center">
            <div data-reveal="left" className="order-2 lg:order-1 grid grid-cols-2 gap-4">
              {[
                { icon: Clock, title: 'Cotações em tempo real', text: 'Solicite e acompanhe cotações com retorno ágil.' },
                { icon: Truck, title: 'Status de fretes', text: 'Do agendamento à confirmação de descarga.' },
                { icon: FileSpreadsheet, title: 'Documentos digitais', text: 'CT-e, MDF-e e canhotos para download.' },
                { icon: Monitor, title: 'Saldos & contratos', text: 'Tonelagens faturadas e histórico completo.' }
              ].map((f, i) => (
                <div key={f.title} className="tc-card p-6 rounded-3xl bg-slate-900/80 border border-slate-800" style={{ transitionDelay: `${i * 0.08}s` }}>
                  <div className="w-11 h-11 rounded-xl bg-blue-600/20 border border-blue-500/30 flex items-center justify-center mb-4">
                    <f.icon className="w-5 h-5 text-sky-300" />
                  </div>
                  <div className="font-bold text-sm mb-1.5">{f.title}</div>
                  <div className="text-xs text-slate-400 leading-relaxed">{f.text}</div>
                </div>
              ))}
            </div>

            <div data-reveal="right" className="order-1 lg:order-2">
              <span className="text-xs font-bold uppercase tracking-[0.25em] text-sky-400">Tecnologia própria</span>
              <h2 className="text-4xl sm:text-5xl font-black tracking-tight mt-3 mb-6 leading-tight">
                Portal do Cliente: <span className="text-sky-400">controle total</span> na ponta dos dedos
              </h2>
              <p className="text-slate-300 leading-relaxed mb-8">
                Elimine planilhas manuais e ligações de acompanhamento. Nossa plataforma exclusiva centraliza cotações, status das viagens, documentos fiscais e saldos de contrato em um único lugar, disponível 24 horas.
              </p>
              <ul className="space-y-3 mb-9">
                {['Acompanhamento de cada viagem em tempo real', 'Download imediato de CT-e, MDF-e e canhotos', 'Histórico completo de pedidos e tonelagens'].map(item => (
                  <li key={item} className="flex items-center gap-3 text-slate-200">
                    <span className="w-6 h-6 rounded-full bg-emerald-500/15 border border-emerald-500/40 flex items-center justify-center shrink-0">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                    </span>
                    {item}
                  </li>
                ))}
              </ul>
              <a
                id="tech-access-portal"
                href={CLIENT_PORTAL_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="group inline-flex items-center gap-2 px-6 py-3 rounded-full font-bold bg-white text-slate-900 hover:bg-sky-100 transition-all cursor-pointer"
              >
                Acessar o Portal
                <ArrowUpRight className="w-5 h-5 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
              </a>
            </div>
          </div>
        </section>

        {/* ================= COBERTURA + SEGURANÇA ================= */}
        <section className="relative py-24 sm:py-28 bg-[#060c1b] border-y border-slate-800/80">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 grid lg:grid-cols-2 gap-8 items-stretch">
            <div data-reveal="left" className="p-6 sm:p-8 rounded-[2rem] bg-gradient-to-br from-blue-950/60 to-slate-900/80 border border-blue-500/25 flex flex-col justify-between">
              <div>
                <div className="flex items-center gap-3 mb-2">
                  <div className="w-10 h-10 rounded-2xl bg-sky-500/20 border border-sky-400/30 flex items-center justify-center text-sky-400 shadow-[0_0_15px_rgba(56,189,248,0.25)] shrink-0">
                    <Globe className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-2xl font-black text-white tracking-tight">Forte atuação interestadual</h3>
                    <p className="text-slate-400 text-xs sm:text-sm mt-0.5">Rotas estratégicas conectando áreas produtoras aos principais centros industriais e portos de exportação.</p>
                  </div>
                </div>

                {/* Mapa Interativo de Cobertura e Entregas por Região */}
                <div className="mt-4">
                  <InstitutionalCoverageMap />
                </div>
              </div>
            </div>

            <div data-reveal="right" className="p-8 sm:p-10 rounded-[2rem] bg-gradient-to-br from-emerald-950/40 to-slate-900/80 border border-emerald-500/25 flex flex-col justify-between">
              <div>
                <div className="flex items-center gap-3 mb-6">
                  <div className="w-10 h-10 rounded-2xl bg-emerald-500/20 border border-emerald-400/30 flex items-center justify-center text-emerald-400 shadow-[0_0_15px_rgba(16,185,129,0.25)] shrink-0">
                    <ShieldCheck className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-2xl font-black text-white tracking-tight">Segurança 360°</h3>
                    <p className="text-slate-400 text-xs sm:text-sm mt-0.5">Padrão máximo de conformidade em cada quilômetro rodado.</p>
                  </div>
                </div>
                <div className="space-y-4">
                  {[
                    { title: 'Gerenciamento rígido de risco', text: 'Consulta de antecedentes, CNH e homologação nas maiores gerenciadoras de risco a cada embarque.' },
                    { title: '100% das cargas asseguradas', text: 'Apólices RCTR-C e RCF-DC cobrindo qualquer trajeto, sem franquia repassada ao cliente.' },
                    { title: 'Suporte operacional 24h', text: 'Plantão dedicado e relacionamento próximo com motoristas parceiros em todas as viagens.' }
                  ].map(item => (
                    <div key={item.title} className="flex gap-4 p-4 rounded-2xl bg-slate-900/70 border border-slate-800">
                      <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
                      <div>
                        <div className="font-bold text-sm text-white">{item.title}</div>
                        <div className="text-xs text-slate-400 mt-1 leading-relaxed">{item.text}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Destaque de Garantia & Confiabilidade */}
              <div className="mt-6 pt-5 border-t border-slate-800/80 flex items-center justify-between gap-3 text-xs flex-wrap">
                <div className="flex items-center gap-2 text-emerald-400 font-semibold">
                  <Award className="w-4 h-4" />
                  <span>Apólices Ativas & Rastreamento Integral</span>
                </div>
                <span className="text-[11px] text-slate-400 bg-emerald-500/10 px-2.5 py-1 rounded-full border border-emerald-500/30">
                  Sinistralidade Controlada
                </span>
              </div>
            </div>
          </div>
        </section>

        {/* ================= CLIENTES ================= */}
        <section id="clientes" className="relative py-24 sm:py-32">
          <div className="max-w-7xl mx-auto px-4 sm:px-6">
            <div data-reveal className="text-center max-w-2xl mx-auto mb-14">
              <span className="text-xs font-bold uppercase tracking-[0.25em] text-sky-400">Parcerias estratégicas</span>
              <h2 className="text-4xl sm:text-5xl font-black tracking-tight mt-3 mb-4">Grandes marcas que confiam na Transcunha</h2>
              <p className="text-slate-400">Relações de longo prazo, safra após safra, com os maiores grupos do agronegócio e da indústria nacional.</p>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-3 gap-5 max-w-5xl mx-auto">
              {CLIENTS.map((c, i) => (
                <div
                  key={c.name}
                  data-reveal="zoom"
                  style={{ transitionDelay: `${(i % 3) * 0.08}s` }}
                  className="tc-card group h-36 rounded-3xl bg-gradient-to-b from-slate-900/80 to-[#0b1530]/80 border border-slate-800 flex flex-col items-center justify-center gap-3 p-5 shadow-lg hover:border-sky-500/40 transition-all"
                >
                  <img src={c.logo} alt={c.name} className="max-h-14 max-w-[85%] object-contain opacity-85 group-hover:opacity-100 group-hover:scale-105 transition-all filter drop-shadow-md" loading="lazy" />
                  <span className="text-xs font-medium text-slate-400 group-hover:text-sky-300 transition-colors">{c.name}</span>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ================= CTA BANNER ================= */}
        <section className="px-4 sm:px-6 pb-8">
          <div data-reveal="zoom" className="relative max-w-7xl mx-auto overflow-hidden rounded-[2.5rem] bg-gradient-to-r from-blue-700 via-blue-600 to-sky-500 p-10 sm:p-14">
            <div className="absolute inset-0 tc-grid-bg opacity-30" />
            <div className="absolute -right-16 -top-16 w-72 h-72 bg-white/15 rounded-full blur-3xl" />
            <div className="relative flex flex-col lg:flex-row items-start lg:items-center justify-between gap-8">
              <div>
                <h2 className="text-3xl sm:text-4xl font-black tracking-tight mb-3">Pronto para mover sua carga?</h2>
                <p className="text-blue-50/90 max-w-xl">Fale com nosso time comercial e receba uma cotação personalizada para a sua operação.</p>
              </div>
              <div className="flex flex-wrap gap-3">
                <button onClick={() => scrollTo('contato')} className="px-7 py-3.5 rounded-full font-bold bg-white text-blue-700 hover:bg-blue-50 transition-all cursor-pointer">
                  Solicitar Cotação
                </button>
                {onOpenPresentation && (
                  <button onClick={onOpenPresentation} className="px-7 py-3.5 rounded-full font-semibold border border-white/60 hover:bg-white/10 transition-all cursor-pointer">
                    Ver Apresentação
                  </button>
                )}
              </div>
            </div>
          </div>
        </section>

        {/* ================= CONTATO ================= */}
        <section id="contato" className="relative py-24 sm:py-32">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 grid lg:grid-cols-12 gap-10">
            <div data-reveal="left" className="lg:col-span-5">
              <span className="text-xs font-bold uppercase tracking-[0.25em] text-sky-400">Contato comercial</span>
              <h2 className="text-4xl sm:text-5xl font-black tracking-tight mt-3 mb-6 leading-tight">Vamos mover o seu negócio</h2>
              <p className="text-slate-400 mb-8">Atendimento dedicado para cotações, estudos de rotas e demonstração do Portal do Cliente.</p>

              <div className="space-y-3">
                {[
                  { icon: Mail, label: 'E-mail comercial', value: EMAIL_COMERCIAL, href: `mailto:${EMAIL_COMERCIAL}`, color: 'text-sky-300 bg-blue-600/20 border-blue-500/30' },
                  { icon: Phone, label: 'WhatsApp comercial', value: '(35) 99103-0469', href: whatsappLink(WHATSAPP_COMERCIAL, 'Olá, Transcunha! Vim pelo site.'), color: 'text-emerald-300 bg-emerald-500/15 border-emerald-500/30' },
                  { icon: Headphones, label: 'WhatsApp operações', value: '(35) 99872-1970', href: whatsappLink(WHATSAPP_OPERACOES, 'Olá, equipe de operações Transcunha!'), color: 'text-emerald-300 bg-emerald-500/15 border-emerald-500/30' },
                  { icon: MapPin, label: 'Matriz operacional', value: 'Pratápolis - MG • CEP 37970-000', href: 'https://www.google.com/maps/search/?api=1&query=Prat%C3%A1polis+MG', color: 'text-teal-300 bg-teal-500/15 border-teal-500/30' }
                ].map(c => (
                  <a
                    key={c.label}
                    href={c.href}
                    target={c.href.startsWith('mailto') ? undefined : '_blank'}
                    rel="noopener noreferrer"
                    className="tc-card group flex items-center gap-4 p-4 rounded-2xl bg-slate-900/70 border border-slate-800"
                  >
                    <span className={`w-12 h-12 rounded-xl border flex items-center justify-center shrink-0 ${c.color}`}>
                      <c.icon className="w-5 h-5" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="text-[11px] uppercase tracking-wider text-slate-500 font-bold">{c.label}</div>
                      <div className="text-sm font-bold truncate">{c.value}</div>
                    </div>
                    <ArrowUpRight className="w-4 h-4 text-slate-600 group-hover:text-sky-300 transition-colors" />
                  </a>
                ))}
              </div>
            </div>

            <div data-reveal="right" className="lg:col-span-7">
              <form
                id="quote-form"
                onSubmit={handleQuoteSubmit}
                className="relative p-8 sm:p-10 rounded-[2rem] bg-gradient-to-b from-slate-900/90 to-[#0a1430]/90 border border-blue-500/25 shadow-2xl shadow-blue-950/60"
              >
                <div className="flex items-center gap-3 mb-2">
                  <Package className="w-6 h-6 text-sky-400" />
                  <h3 className="text-2xl font-black">Solicite sua cotação</h3>
                </div>
                <p className="text-sm text-slate-400 mb-7">Preencha os dados e envie direto para o nosso WhatsApp comercial.</p>

                <div className="grid sm:grid-cols-2 gap-4">
                  <div>
                    <label htmlFor="q-nome" className="block text-xs font-bold text-slate-400 mb-1.5">Nome *</label>
                    <input id="q-nome" required className="tc-input" placeholder="Seu nome" value={form.nome} onChange={e => setForm({ ...form, nome: e.target.value })} />
                  </div>
                  <div>
                    <label htmlFor="q-empresa" className="block text-xs font-bold text-slate-400 mb-1.5">Empresa</label>
                    <input id="q-empresa" className="tc-input" placeholder="Nome da empresa" value={form.empresa} onChange={e => setForm({ ...form, empresa: e.target.value })} />
                  </div>
                  <div>
                    <label htmlFor="q-origem" className="block text-xs font-bold text-slate-400 mb-1.5">Origem *</label>
                    <input id="q-origem" required className="tc-input" placeholder="Cidade - UF" value={form.origem} onChange={e => setForm({ ...form, origem: e.target.value })} />
                  </div>
                  <div>
                    <label htmlFor="q-destino" className="block text-xs font-bold text-slate-400 mb-1.5">Destino *</label>
                    <input id="q-destino" required className="tc-input" placeholder="Cidade - UF" value={form.destino} onChange={e => setForm({ ...form, destino: e.target.value })} />
                  </div>
                  <div className="sm:col-span-2">
                    <label htmlFor="q-carga" className="block text-xs font-bold text-slate-400 mb-1.5">Tipo de carga e volume</label>
                    <textarea id="q-carga" rows={3} className="tc-input resize-none" placeholder="Ex.: Soja a granel, 300 toneladas por semana" value={form.carga} onChange={e => setForm({ ...form, carga: e.target.value })} />
                  </div>
                </div>

                <button
                  id="quote-submit"
                  type="submit"
                  className="group mt-6 w-full flex items-center justify-center gap-2 px-6 py-4 rounded-2xl font-bold bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 shadow-lg shadow-emerald-900/40 transition-all cursor-pointer"
                >
                  <Send className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                  Enviar cotação pelo WhatsApp
                </button>
              </form>
            </div>
          </div>
        </section>
      </main>

      {/* ================= FOOTER ================= */}
      <footer className="border-t border-slate-800/80 bg-[#040811]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-14 grid sm:grid-cols-2 lg:grid-cols-4 gap-10">
          <div className="lg:col-span-2">
            <div className="flex items-center gap-3 mb-4">
              <img src={logoSrc} alt="Transcunha" className="h-11 w-auto object-contain" />
              <div>
                <div className="font-extrabold tracking-wide">TRANS<span className="text-sky-400">CUNHA</span></div>
                <div className="text-[10px] text-slate-500 tracking-[0.2em] uppercase">Transportes & Logística</div>
              </div>
            </div>
            <p className="text-sm text-slate-400 max-w-sm mb-4">Soluções que movem o futuro. Transporte rodoviário de cargas com segurança, pontualidade e tecnologia própria.</p>
            <div className="inline-flex items-center gap-2 text-xs text-slate-500">
              <Globe className="w-3.5 h-3.5" /> transcunhaoficial.com.br
            </div>
          </div>
          <div>
            <div className="text-xs font-bold uppercase tracking-[0.2em] text-slate-500 mb-4">Navegação</div>
            <ul className="space-y-2.5">
              {NAV_LINKS.map(l => (
                <li key={l.id}>
                  <button onClick={() => scrollTo(l.id)} className="text-sm text-slate-300 hover:text-sky-300 transition-colors cursor-pointer">{l.label}</button>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <div className="text-xs font-bold uppercase tracking-[0.2em] text-slate-500 mb-4">Acesso rápido</div>
            <ul className="space-y-2.5 text-sm">
              <li>
                <a
                  href={CLIENT_PORTAL_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-slate-300 hover:text-sky-300 transition-colors cursor-pointer"
                >
                  Área do Cliente
                </a>
              </li>
              {onOpenPresentation && <li><button onClick={onOpenPresentation} className="text-slate-300 hover:text-sky-300 transition-colors cursor-pointer">Apresentação Comercial</button></li>}
              <li><a href={`mailto:${EMAIL_COMERCIAL}`} className="text-slate-300 hover:text-sky-300 transition-colors">{EMAIL_COMERCIAL}</a></li>
              <li className="text-slate-400">Pratápolis - MG</li>
            </ul>
          </div>
        </div>
        <div className="border-t border-slate-800/80">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 py-5 flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-slate-500">
            <span>© {new Date().getFullYear()} Transcunha Transportes e Logística. Todos os direitos reservados.</span>
            <span className="flex items-center gap-1.5"><Sparkles className="w-3.5 h-3.5 text-sky-500" /> Soluções que movem o futuro</span>
          </div>
        </div>
      </footer>

      {/* Floating WhatsApp */}
      <a
        id="floating-whatsapp"
        href={whatsappLink(WHATSAPP_COMERCIAL, 'Olá, Transcunha! Vim pelo site e gostaria de uma cotação.')}
        target="_blank"
        rel="noopener noreferrer"
        aria-label="Falar no WhatsApp"
        className="fixed bottom-6 right-6 z-50 w-14 h-14 rounded-full bg-emerald-500 hover:bg-emerald-400 shadow-2xl shadow-emerald-900/60 flex items-center justify-center transition-all hover:scale-110"
      >
        <span className="absolute inset-0 rounded-full bg-emerald-500 animate-ping opacity-30" />
        <MessageCircle className="relative w-7 h-7 text-white" />
      </a>
    </div>
  );
};

export default InstitutionalWebsitePage;
