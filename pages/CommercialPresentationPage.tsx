import React, { useState, useEffect, useRef } from 'react';
import { 
  Download, Printer, Share2, Check, ChevronLeft, ChevronRight, 
  Maximize2, Minimize2, ArrowLeft, Phone, Mail, MapPin, ShieldCheck, CheckCircle2, 
  TrendingUp, Award, Truck, Users, Monitor, FileSpreadsheet, Clock,
  Sparkles, Building2, Globe, ShieldAlert, Cpu, AlertCircle, ArrowUpRight
} from 'lucide-react';
import { jsPDF } from 'jspdf';
import html2canvas from 'html2canvas';

interface CommercialPresentationPageProps {
  companyLogo?: string | null;
  currentUser?: any;
  onBackToApp?: () => void;
}

export const CommercialPresentationPage: React.FC<CommercialPresentationPageProps> = ({
  companyLogo,
  currentUser,
  onBackToApp
}) => {
  const [currentSlide, setCurrentSlide] = useState(0);
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
  const [pdfProgress, setPdfProgress] = useState<{ current: number; total: number } | null>(null);
  const [copiedLink, setCopiedLink] = useState(false);
  const [viewMode, setViewMode] = useState<'deck' | 'scroll'>('deck');
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [pdfError, setPdfError] = useState<string | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const pdfStagingRef = useRef<HTMLDivElement>(null);

  const totalSlides = 7;
  const logoSrc = companyLogo || '/logo.png';
  const clientsLogoSrc = '/logos_clientes.png';

  const clientBrands = [
    { name: 'Morroverde', segment: 'Agronegócio & Grãos', logo: '/clients/morroverde.png' },
    { name: 'Consube Agro', segment: 'Nutrição Animal & Grãos', logo: '/clients/consube.png' },
    { name: 'Agrobom', segment: 'Sementes & Insumos', logo: '/clients/agrobom.png' },
    { name: 'Grão de Ouro', segment: 'Armazenagem & Grãos', logo: '/clients/grao_de_ouro.png' },
    { name: 'Grupo Organics', segment: 'Biofertilizantes', logo: '/clients/organics.png' },
    { name: 'Mantiqueira', segment: 'Avicultura & Alimentos', logo: '/clients/mantiqueira.png' },
    { name: 'DF Grãos', segment: 'Trading & Exportação', logo: '/clients/df_graos.png' },
    { name: 'USJ S. João', segment: 'Açúcar, Etanol & Bioenergia', logo: '/clients/usj.png' },
    { name: 'Black Bio', segment: 'Biotecnologia Agrícola', logo: '/clients/black_bio.png' },
    { name: 'Adecoagro', segment: 'Produção Agroindustrial', logo: '/clients/adecoagro.png' }
  ];

  // Keyboard navigation for presentation deck
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (viewMode !== 'deck') return;
      if (e.key === 'ArrowRight' || e.key === 'PageDown' || e.key === ' ') {
        e.preventDefault();
        setCurrentSlide(prev => (prev < totalSlides - 1 ? prev + 1 : prev));
      } else if (e.key === 'ArrowLeft' || e.key === 'PageUp') {
        e.preventDefault();
        setCurrentSlide(prev => (prev > 0 ? prev - 1 : prev));
      } else if (e.key === 'Home') {
        e.preventDefault();
        setCurrentSlide(0);
      } else if (e.key === 'End') {
        e.preventDefault();
        setCurrentSlide(totalSlides - 1);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [viewMode, totalSlides]);

  const handleCopyLink = () => {
    const publicUrl = `${window.location.origin}/apresentacao`;
    navigator.clipboard.writeText(publicUrl).then(() => {
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 3000);
    });
  };

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      containerRef.current?.requestFullscreen().then(() => setIsFullscreen(true)).catch(() => {});
    } else {
      document.exitFullscreen().then(() => setIsFullscreen(false)).catch(() => {});
    }
  };

  // High-Definition, Pixel-Perfect PDF Generation (Lossless PNG, 2.5x Scale)
  const handleGeneratePdf = async () => {
    if (!pdfStagingRef.current) {
      alert("Aguarde a inicialização do módulo de PDF.");
      return;
    }

    setIsGeneratingPdf(true);
    setPdfError(null);
    setPdfProgress({ current: 0, total: totalSlides });

    try {
      const stageEl = pdfStagingRef.current;

      // Ensure all images in the staging container are preloaded
      const images = Array.from(stageEl.querySelectorAll('img'));
      await Promise.all(images.map(img => {
        if (img.complete && img.naturalHeight !== 0) return Promise.resolve();
        return new Promise(resolve => {
          img.onload = resolve;
          img.onerror = resolve;
        });
      }));

      // Small delay for DOM layout stability
      await new Promise(r => setTimeout(r, 250));

      // Standard A4 Landscape PDF (297mm x 210mm)
      const pdf = new jsPDF({
        orientation: 'landscape',
        unit: 'mm',
        format: 'a4',
        compress: true
      });

      const slideElements = Array.from(stageEl.querySelectorAll<HTMLElement>('.pdf-standard-slide'));
      const total = slideElements.length;

      for (let i = 0; i < total; i++) {
        setPdfProgress({ current: i + 1, total });
        const slideEl = slideElements[i];

        // Capture with scale: 2.5 for crisp 300 DPI text resolution without JPEG artifacts
        const canvas = await html2canvas(slideEl, {
          scale: 2.5,
          useCORS: true,
          allowTaint: true,
          logging: false,
          backgroundColor: '#070c18',
          width: 1122,
          height: 793,
          windowWidth: 1122,
          windowHeight: 793,
          scrollX: 0,
          scrollY: 0
        });

        if (canvas.width === 0 || canvas.height === 0) {
          throw new Error(`Falha ao renderizar slide ${i + 1}.`);
        }

        // Use lossless PNG to prevent dark-halo JPEG artifacts on text
        const imgData = canvas.toDataURL('image/png');
        if (!imgData || !imgData.startsWith('data:image/png;base64,')) {
          throw new Error(`Dados inválidos gerados no slide ${i + 1}.`);
        }

        if (i > 0) {
          pdf.addPage('a4', 'landscape');
        }

        pdf.addImage(imgData, 'PNG', 0, 0, 297, 210, undefined, 'FAST');
      }

      pdf.save('Apresentacao_Comercial_Transcunha_2026.pdf');
    } catch (error: any) {
      console.error('Erro na exportação do PDF:', error);
      setPdfError(error?.message || 'Falha ao compilar PDF.');
      alert('Houve uma falha ao gerar o arquivo PDF. Você também pode utilizar o botão "Imprimir / Salvar PDF" para gerar diretamente pelo navegador.');
    } finally {
      setIsGeneratingPdf(false);
      setPdfProgress(null);
    }
  };

  const handleNativePrint = () => {
    window.print();
  };

  // Standardized Slide Header (Used on slides 2 to 7)
  const renderHeader = (category: string, title: string) => (
    <div className="flex items-center justify-between border-b border-slate-700/80 pb-3 mb-4 shrink-0">
      <div className="flex items-center gap-4">
        <img src={logoSrc} alt="Transcunha" className="h-10 w-auto object-contain filter drop-shadow" />
        <div className="h-7 w-px bg-slate-700" />
        <div>
          <span className="text-xs font-bold uppercase tracking-widest text-sky-400 block leading-tight">
            {category}
          </span>
          <h2 className="text-2xl font-black text-white tracking-tight leading-tight">
            {title}
          </h2>
        </div>
      </div>
      <div className="flex items-center gap-3">
        <div 
          className="text-xs font-semibold text-slate-300 bg-slate-900/90 rounded-full border border-slate-700 shadow-sm shrink-0"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            height: '28px',
            padding: '0 14px',
            lineHeight: 1,
            boxSizing: 'border-box'
          }}
        >
          <span style={{ lineHeight: 1, display: 'inline-block' }}>transcunhaoficial.com.br</span>
        </div>
      </div>
    </div>
  );

  // Standardized Slide Footer (Used on all slides)
  const renderFooter = (pageNumber: number) => (
    <div className="flex items-center justify-between text-xs text-slate-400 border-t border-slate-700/80 pt-3 mt-4 shrink-0">
      <span className="font-semibold text-slate-300">
        TC TRANSCUNHA TRANSPORTES E LOGÍSTICA • Soluções que movem o futuro
      </span>
      <div 
        className="font-mono text-sky-400 font-bold bg-slate-900/90 rounded border border-slate-700 text-xs shadow-sm shrink-0"
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          height: '24px',
          padding: '0 10px',
          lineHeight: 1,
          boxSizing: 'border-box'
        }}
      >
        <span style={{ lineHeight: 1, display: 'inline-block' }}>
          Página {String(pageNumber).padStart(2, '0')} de 07
        </span>
      </div>
    </div>
  );

  // Pixel-Perfect Slide Contents Styled for 1122px x 793px Standard A4 Landscape
  const renderSlideContent = (index: number) => {
    switch (index) {
      case 0:
        // SLIDE 1: CAPA OFICIAL (Full Fill, No Clipping, Crisp Typography)
        return (
          <div className="w-full h-full flex flex-col justify-between p-10 relative overflow-hidden bg-gradient-to-br from-[#070c18] via-[#0b1328] to-[#0f1d3a] box-border">
            {/* Ambient Lighting & Grid */}
            <div 
              className="absolute inset-0 pointer-events-none opacity-20"
              style={{
                backgroundImage: `
                  linear-gradient(to right, rgba(56, 189, 248, 0.1) 1px, transparent 1px),
                  linear-gradient(to bottom, rgba(56, 189, 248, 0.1) 1px, transparent 1px)
                `,
                backgroundSize: '40px 40px'
              }}
            />
            <div className="absolute -top-24 -left-24 w-96 h-96 bg-blue-600/20 rounded-full blur-[120px] pointer-events-none" />
            <div className="absolute -bottom-24 -right-24 w-96 h-96 bg-sky-500/20 rounded-full blur-[120px] pointer-events-none" />

            {/* Top Bar */}
            <div className="relative z-10 flex items-center justify-between border-b border-slate-700/80 pb-4 shrink-0">
              <div 
                className="rounded-full bg-blue-950/90 border border-blue-500/40 text-sky-300 text-xs font-bold uppercase tracking-wider shadow-inner"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                  height: '32px',
                  padding: '0 16px',
                  lineHeight: 1,
                  boxSizing: 'border-box'
                }}
              >
                <Sparkles className="w-4 h-4 text-sky-400 shrink-0" />
                <span style={{ lineHeight: 1, display: 'inline-block' }}>Apresentação Institucional & Comercial</span>
              </div>
              <div 
                className="text-xs font-bold text-slate-300 tracking-widest uppercase bg-slate-900/90 rounded-full border border-slate-700 shadow-sm"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  height: '32px',
                  padding: '0 16px',
                  lineHeight: 1,
                  boxSizing: 'border-box'
                }}
              >
                <span style={{ lineHeight: 1, display: 'inline-block' }}>Edição Oficial 2026 • Modal Rodoviário</span>
              </div>
            </div>

            {/* Main Hero Body */}
            <div className="relative z-10 flex-1 flex items-center gap-10 my-4">
              <div className="p-6 rounded-3xl bg-slate-900/90 border border-blue-500/30 backdrop-blur-md shadow-2xl flex items-center justify-center shrink-0">
                <img 
                  src={logoSrc} 
                  alt="TC Transcunha Logo" 
                  className="h-36 w-auto object-contain filter drop-shadow-[0_8px_24px_rgba(0,82,204,0.6)]" 
                />
              </div>

              <div className="flex-1 flex flex-col justify-center">
                <div className="mb-3">
                  <div 
                    className="text-xs font-black tracking-widest text-sky-300 uppercase bg-blue-950/90 rounded-lg border border-blue-500/40 shadow-sm"
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      height: '30px',
                      padding: '0 14px',
                      lineHeight: 1,
                      boxSizing: 'border-box'
                    }}
                  >
                    <span style={{ lineHeight: 1, display: 'inline-block' }}>Transportes & Logística Pesada</span>
                  </div>
                </div>
                {/* FIXED: Solid text colors, no background-clip: text bug */}
                <h1 className="text-5xl font-black text-white tracking-tight leading-none mb-3">
                  TC TRANS<span className="text-sky-400">CUNHA</span>
                </h1>
                <p className="text-2xl font-black text-slate-100 tracking-wide mb-4">
                  "Soluções que movem o futuro"
                </p>
                <p className="text-base text-slate-200 max-w-2xl leading-relaxed">
                  Especializada no transporte rodoviário de cargas para os maiores polos do agronegócio e da indústria brasileira, unindo solidez operacional, tecnologia digital própria e o mais alto padrão de segurança do mercado nacional.
                </p>
              </div>
            </div>

            {/* Bottom 3 Feature Pills */}
            <div className="relative z-10 grid grid-cols-3 gap-5 pt-4 border-t border-slate-700/80 shrink-0">
              <div className="flex items-center gap-4 p-4 rounded-2xl bg-slate-900/90 border border-slate-700 shadow-lg">
                <div className="w-12 h-12 rounded-xl bg-blue-600/20 text-sky-400 flex items-center justify-center shrink-0 border border-blue-500/30">
                  <ShieldCheck className="w-6 h-6" />
                </div>
                <div>
                  <h4 className="text-sm font-bold text-white uppercase tracking-wider">100% Assegurado</h4>
                  <p className="text-xs text-slate-300 mt-0.5">Risco gerenciado e apólices integrais</p>
                </div>
              </div>

              <div className="flex items-center gap-4 p-4 rounded-2xl bg-slate-900/90 border border-slate-700 shadow-lg">
                <div className="w-12 h-12 rounded-xl bg-sky-500/20 text-sky-400 flex items-center justify-center shrink-0 border border-sky-500/30">
                  <Cpu className="w-6 h-6" />
                </div>
                <div>
                  <h4 className="text-sm font-bold text-white uppercase tracking-wider">Portal do Cliente</h4>
                  <p className="text-xs text-slate-300 mt-0.5">Cotações e rastreamento em tempo real</p>
                </div>
              </div>

              <div className="flex items-center gap-4 p-4 rounded-2xl bg-slate-900/90 border border-slate-700 shadow-lg">
                <div className="w-12 h-12 rounded-xl bg-indigo-500/20 text-indigo-400 flex items-center justify-center shrink-0 border border-indigo-500/30">
                  <Truck className="w-6 h-6" />
                </div>
                <div>
                  <h4 className="text-sm font-bold text-white uppercase tracking-wider">+5.000 Motoristas</h4>
                  <p className="text-xs text-slate-300 mt-0.5">Altíssima capacidade de escoamento</p>
                </div>
              </div>
            </div>
          </div>
        );

      case 1:
        // SLIDE 2: QUEM SOMOS E PRESENÇA GEOGRÁFICA
        return (
          <div className="w-full h-full flex flex-col justify-between p-10 bg-gradient-to-br from-[#0b1328] via-[#0e1933] to-[#0b1426] box-border">
            {renderHeader("Institucional & Atuação", "Quem Somos e Presença Geográfica")}

            <div className="flex-1 grid grid-cols-12 gap-6 items-stretch my-2">
              {/* Left Column */}
              <div className="col-span-7 flex flex-col justify-between bg-slate-900/90 p-6 rounded-2xl border border-slate-700 shadow-xl">
                <div>
                  <h3 className="text-lg font-bold text-white flex items-center gap-2.5 mb-3">
                    <Building2 className="w-5 h-5 text-blue-400" />
                    Especialistas em Transporte Rodoviário de Cargas
                  </h3>
                  <p className="text-sm text-slate-200 leading-relaxed mb-3">
                    A <strong className="text-white">Transcunha Transportes e Logística</strong> é uma empresa consolidada no modal rodoviário, estrategicamente posicionada próxima aos maiores polos de produção e processamento do agronegócio e da indústria brasileira.
                  </p>
                  <p className="text-sm text-slate-200 leading-relaxed">
                    Com mais de 15 anos de expertise fundadora, conectamos produtores, indústrias e portos com máxima eficiência, transparência fiscal e total garantia de pontualidade.
                  </p>
                </div>

                <div className="grid grid-cols-3 gap-3 mt-4 pt-4 border-t border-slate-800">
                  <div className="p-3 rounded-xl bg-slate-800/80 border border-slate-700 text-center">
                    <div 
                      className="rounded-xl bg-blue-600/30 text-sky-400 mx-auto mb-2 border border-blue-500/30 font-black text-sm select-none"
                      style={{
                        width: '36px',
                        height: '36px',
                        lineHeight: '34px',
                        textAlign: 'center',
                        boxSizing: 'border-box'
                      }}
                    >
                      01
                    </div>
                    <h5 className="text-sm font-bold text-white">Agilidade</h5>
                    <p className="text-xs text-slate-300 mt-1">Carregamento e entrega pontual</p>
                  </div>
                  <div className="p-3 rounded-xl bg-slate-800/80 border border-slate-700 text-center">
                    <div 
                      className="rounded-xl bg-sky-500/30 text-sky-400 mx-auto mb-2 border border-sky-500/30 font-black text-sm select-none"
                      style={{
                        width: '36px',
                        height: '36px',
                        lineHeight: '34px',
                        textAlign: 'center',
                        boxSizing: 'border-box'
                      }}
                    >
                      02
                    </div>
                    <h5 className="text-sm font-bold text-white">Segurança</h5>
                    <p className="text-xs text-slate-300 mt-1">Risco gerenciado e 100% segurado</p>
                  </div>
                  <div className="p-3 rounded-xl bg-slate-800/80 border border-slate-700 text-center">
                    <div 
                      className="rounded-xl bg-indigo-500/30 text-indigo-400 mx-auto mb-2 border border-indigo-500/30 font-black text-sm select-none"
                      style={{
                        width: '36px',
                        height: '36px',
                        lineHeight: '34px',
                        textAlign: 'center',
                        boxSizing: 'border-box'
                      }}
                    >
                      03
                    </div>
                    <h5 className="text-sm font-bold text-white">Tecnologia</h5>
                    <p className="text-xs text-slate-300 mt-1">Portal do cliente em tempo real</p>
                  </div>
                </div>
              </div>

              {/* Right Column */}
              <div className="col-span-5 flex flex-col justify-between bg-gradient-to-b from-blue-950/50 to-slate-900/90 p-6 rounded-2xl border border-blue-500/30 shadow-xl">
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <h4 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
                      <Globe className="w-5 h-5 text-sky-400" />
                      Forte Atuação Interestadual
                    </h4>
                    <div 
                      className="text-xs bg-blue-600/30 text-blue-300 rounded-full font-bold border border-blue-500/30 shadow-sm shrink-0"
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        height: '26px',
                        padding: '0 12px',
                        lineHeight: 1,
                        boxSizing: 'border-box'
                      }}
                    >
                      <span style={{ lineHeight: 1, display: 'inline-block' }}>Corredores do Agro</span>
                    </div>
                  </div>

                  <p className="text-xs text-slate-300 mb-4">
                    Rotas estratégicas conectando áreas produtoras aos principais centros industriais e portos de exportação:
                  </p>

                  <div className="grid grid-cols-2 gap-2.5">
                    <div className="flex items-center gap-2.5 p-2 rounded-xl bg-slate-800/90 border border-slate-700">
                      <div 
                        className="rounded-lg bg-blue-600 font-black text-white text-xs select-none shrink-0"
                        style={{
                          width: '32px',
                          height: '32px',
                          lineHeight: '32px',
                          textAlign: 'center',
                          boxSizing: 'border-box'
                        }}
                      >
                        MG
                      </div>
                      <span className="text-xs text-slate-100 font-bold">Minas Gerais (Matriz)</span>
                    </div>
                    <div className="flex items-center gap-2.5 p-2 rounded-xl bg-slate-800/90 border border-slate-700">
                      <div 
                        className="rounded-lg bg-sky-600 font-black text-white text-xs select-none shrink-0"
                        style={{
                          width: '32px',
                          height: '32px',
                          lineHeight: '32px',
                          textAlign: 'center',
                          boxSizing: 'border-box'
                        }}
                      >
                        SP
                      </div>
                      <span className="text-xs text-slate-100 font-bold">São Paulo</span>
                    </div>
                    <div className="flex items-center gap-2.5 p-2 rounded-xl bg-slate-800/90 border border-slate-700">
                      <div 
                        className="rounded-lg bg-indigo-600 font-black text-white text-xs select-none shrink-0"
                        style={{
                          width: '32px',
                          height: '32px',
                          lineHeight: '32px',
                          textAlign: 'center',
                          boxSizing: 'border-box'
                        }}
                      >
                        MS
                      </div>
                      <span className="text-xs text-slate-100 font-bold">Mato Grosso do Sul</span>
                    </div>
                    <div className="flex items-center gap-2.5 p-2 rounded-xl bg-slate-800/90 border border-slate-700">
                      <div 
                        className="rounded-lg bg-blue-700 font-black text-white text-xs select-none shrink-0"
                        style={{
                          width: '32px',
                          height: '32px',
                          lineHeight: '32px',
                          textAlign: 'center',
                          boxSizing: 'border-box'
                        }}
                      >
                        PR
                      </div>
                      <span className="text-xs text-slate-100 font-bold">Paraná</span>
                    </div>
                    <div className="flex items-center gap-2.5 p-2 rounded-xl bg-slate-800/90 border border-slate-700">
                      <div 
                        className="rounded-lg bg-sky-700 font-black text-white text-xs select-none shrink-0"
                        style={{
                          width: '32px',
                          height: '32px',
                          lineHeight: '32px',
                          textAlign: 'center',
                          boxSizing: 'border-box'
                        }}
                      >
                        GO
                      </div>
                      <span className="text-xs text-slate-100 font-bold">Goiás</span>
                    </div>
                    <div className="flex items-center gap-2.5 p-2 rounded-xl bg-slate-800/90 border border-slate-700">
                      <div 
                        className="rounded-lg bg-teal-600 font-black text-white text-xs select-none shrink-0"
                        style={{
                          width: '32px',
                          height: '32px',
                          lineHeight: '32px',
                          textAlign: 'center',
                          boxSizing: 'border-box'
                        }}
                      >
                        ES
                      </div>
                      <span className="text-xs text-slate-100 font-bold">Espírito Santo</span>
                    </div>
                  </div>
                </div>

                <div className="p-3.5 rounded-xl bg-blue-900/40 border border-blue-500/40 text-xs text-sky-200 flex items-center gap-3 mt-4">
                  <MapPin className="w-5 h-5 text-sky-400 shrink-0" />
                  <span>Sede Operacional em <strong>Pratápolis - MG (CEP 37970-000)</strong>, no centro logístico do agronegócio.</span>
                </div>
              </div>
            </div>

            {renderFooter(2)}
          </div>
        );

      case 2:
        // SLIDE 3: NOSSOS NÚMEROS DE IMPACTO
        return (
          <div className="w-full h-full flex flex-col justify-between p-10 bg-gradient-to-br from-[#070c18] via-[#0b1328] to-[#111e3b] box-border">
            {renderHeader("Solidez & Credibilidade", "Nossos Números de Impacto")}

            <div className="flex-1 grid grid-cols-4 gap-5 items-stretch my-2">
              <div className="p-6 rounded-2xl bg-slate-900/90 border border-blue-600/40 shadow-xl flex flex-col justify-start">
                <div className="flex items-center justify-between w-full min-h-[48px] mb-4">
                  <div className="w-12 h-12 rounded-xl bg-blue-600/20 text-sky-400 flex items-center justify-center border border-blue-500/30 shrink-0">
                    <Award className="w-6 h-6" />
                  </div>
                  <div 
                    className="text-xs font-bold text-sky-400 uppercase bg-sky-950/80 rounded border border-sky-800/40 shadow-sm shrink-0"
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      height: '26px',
                      padding: '0 10px',
                      lineHeight: 1,
                      boxSizing: 'border-box'
                    }}
                  >
                    <span style={{ lineHeight: 1, display: 'inline-block' }}>Fundadores</span>
                  </div>
                </div>
                <div>
                  <div className="text-4xl font-black text-white tracking-tight leading-none whitespace-nowrap mb-3">
                    +15 <span className="text-2xl text-blue-400">Anos</span>
                  </div>
                  <h4 className="text-base font-bold text-slate-100 mb-2">Experiência Consolidada</h4>
                  <p className="text-xs text-slate-300 leading-relaxed">
                    Vivência prática e sólida dos fundadores na gestão de transporte rodoviário pesado e agronegócio nacional.
                  </p>
                </div>
              </div>

              <div className="p-6 rounded-2xl bg-slate-900/90 border border-sky-500/40 shadow-xl flex flex-col justify-start">
                <div className="flex items-center justify-between w-full min-h-[48px] mb-4">
                  <div className="w-12 h-12 rounded-xl bg-sky-500/20 text-sky-400 flex items-center justify-center border border-sky-500/30 shrink-0">
                    <Users className="w-6 h-6" />
                  </div>
                  <div 
                    className="text-xs font-bold text-sky-400 uppercase bg-sky-950/80 rounded border border-sky-800/40 shadow-sm shrink-0"
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      height: '26px',
                      padding: '0 10px',
                      lineHeight: 1,
                      boxSizing: 'border-box'
                    }}
                  >
                    <span style={{ lineHeight: 1, display: 'inline-block' }}>Rede Ativa</span>
                  </div>
                </div>
                <div>
                  <div className="text-4xl font-black text-white tracking-tight leading-none whitespace-nowrap mb-3">
                    +5.000
                  </div>
                  <h4 className="text-base font-bold text-slate-100 mb-2">Motoristas Parceiros</h4>
                  <p className="text-xs text-slate-300 leading-relaxed">
                    Base ativa de parceiros e agregados, viabilizando altíssima capacidade e rapidez no escoamento de safras.
                  </p>
                </div>
              </div>

              <div className="p-6 rounded-2xl bg-slate-900/90 border border-emerald-500/50 shadow-xl flex flex-col justify-start">
                <div className="flex items-center justify-between w-full min-h-[48px] mb-4">
                  <div className="w-12 h-12 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center border border-emerald-500/30 shrink-0">
                    <ShieldCheck className="w-6 h-6" />
                  </div>
                  <div 
                    className="text-xs font-bold text-emerald-400 uppercase bg-emerald-950/80 rounded border border-emerald-800/40 shadow-sm shrink-0"
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      height: '26px',
                      padding: '0 10px',
                      lineHeight: 1,
                      boxSizing: 'border-box'
                    }}
                  >
                    <span style={{ lineHeight: 1, display: 'inline-block' }}>2022 - 2026</span>
                  </div>
                </div>
                <div>
                  <div className="text-4xl font-black text-emerald-400 tracking-tight leading-none whitespace-nowrap mb-3">
                    Apenas 1
                  </div>
                  <h4 className="text-base font-bold text-slate-100 mb-2">Sinistro Registrado</h4>
                  <p className="text-xs text-slate-300 leading-relaxed">
                    Mais de 4 anos operacionais com índice de segurança de 99,99%, auditado pelas maiores gerenciadoras de risco.
                  </p>
                </div>
              </div>

              <div className="p-6 rounded-2xl bg-slate-900/90 border border-indigo-500/40 shadow-xl flex flex-col justify-start">
                <div className="flex items-center justify-between w-full min-h-[48px] mb-4">
                  <div className="w-12 h-12 rounded-xl bg-indigo-500/20 text-indigo-400 flex items-center justify-center border border-indigo-500/30 shrink-0">
                    <CheckCircle2 className="w-6 h-6" />
                  </div>
                  <div 
                    className="text-xs font-bold text-indigo-400 uppercase bg-indigo-950/80 rounded border border-indigo-800/40 shadow-sm shrink-0"
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      height: '26px',
                      padding: '0 10px',
                      lineHeight: 1,
                      boxSizing: 'border-box'
                    }}
                  >
                    <span style={{ lineHeight: 1, display: 'inline-block' }}>Garantia</span>
                  </div>
                </div>
                <div>
                  <div className="text-4xl font-black text-white tracking-tight leading-none whitespace-nowrap mb-3">
                    100%
                  </div>
                  <h4 className="text-base font-bold text-slate-100 mb-2">Cargas Asseguradas</h4>
                  <p className="text-xs text-slate-300 leading-relaxed">
                    Cobertura securitária total (RCTR-C e RCF-DC) em todas as viagens e rotas, sem franquia repassada.
                  </p>
                </div>
              </div>
            </div>

            <div className="p-4 rounded-xl bg-blue-950/70 border border-blue-500/40 flex items-center justify-between text-xs text-slate-200">
              <div className="flex items-center gap-3">
                <TrendingUp className="w-5 h-5 text-sky-400 shrink-0" />
                <span className="text-sm">Garantia de conformidade fiscal e regulatória com a ANTT, regularidade absoluta e suporte 24h a cada viagem.</span>
              </div>
              <div 
                className="text-xs font-bold text-sky-400 uppercase bg-blue-900/60 rounded border border-blue-500/30 shadow-sm shrink-0"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  height: '26px',
                  padding: '0 10px',
                  lineHeight: 1,
                  boxSizing: 'border-box'
                }}
              >
                <span style={{ lineHeight: 1, display: 'inline-block' }}>Padrão de Excelência</span>
              </div>
            </div>

            {renderFooter(3)}
          </div>
        );

      case 3:
        // SLIDE 4: DIFERENCIAL TECNOLÓGICO - PORTAL DO CLIENTE
        return (
          <div className="w-full h-full flex flex-col justify-between p-10 bg-gradient-to-br from-[#081024] via-[#0c1630] to-[#0a1429] box-border">
            {renderHeader("Inovação Exclusiva", "Portal do Cliente: Tecnologia Própria")}

            <div className="flex-1 grid grid-cols-12 gap-6 items-stretch my-2">
              <div className="col-span-7 grid grid-cols-2 gap-4">
                <div className="p-4 rounded-xl bg-slate-900/90 border border-slate-700 shadow-md flex flex-col justify-between">
                  <div>
                    <div className="w-10 h-10 rounded-lg bg-blue-600/20 text-sky-400 flex items-center justify-center mb-2.5 border border-blue-500/30">
                      <Clock className="w-5 h-5" />
                    </div>
                    <h4 className="text-sm font-bold text-white uppercase mb-1.5">Cotações em Tempo Real</h4>
                    <p className="text-xs text-slate-300 leading-relaxed">
                      Solicite e acompanhe cotações de fretes em instantes com retorno ágil, dados detalhados e transparência.
                    </p>
                  </div>
                </div>

                <div className="p-4 rounded-xl bg-slate-900/90 border border-slate-700 shadow-md flex flex-col justify-between">
                  <div>
                    <div className="w-10 h-10 rounded-lg bg-sky-500/20 text-sky-400 flex items-center justify-center mb-2.5 border border-sky-500/30">
                      <Truck className="w-5 h-5" />
                    </div>
                    <h4 className="text-sm font-bold text-white uppercase mb-1.5">Status de Demandas & Fretes</h4>
                    <p className="text-xs text-slate-300 leading-relaxed">
                      Acompanhe em tempo real o status de cada viagem, do agendamento à confirmação de descarga no destino.
                    </p>
                  </div>
                </div>

                <div className="p-4 rounded-xl bg-slate-900/90 border border-slate-700 shadow-md flex flex-col justify-between">
                  <div>
                    <div className="w-10 h-10 rounded-lg bg-indigo-500/20 text-indigo-400 flex items-center justify-center mb-2.5 border border-indigo-500/30">
                      <FileSpreadsheet className="w-5 h-5" />
                    </div>
                    <h4 className="text-sm font-bold text-white uppercase mb-1.5">Gestão Completa de Documentos</h4>
                    <p className="text-xs text-slate-300 leading-relaxed">
                      Acesso imediato para download de CT-e, MDF-e, canhotos digitalizados e relatórios de viagem sem burocracia.
                    </p>
                  </div>
                </div>

                <div className="p-4 rounded-xl bg-slate-900/90 border border-slate-700 shadow-md flex flex-col justify-between">
                  <div>
                    <div className="w-10 h-10 rounded-lg bg-teal-500/20 text-teal-400 flex items-center justify-center mb-2.5 border border-teal-500/30">
                      <Monitor className="w-5 h-5" />
                    </div>
                    <h4 className="text-sm font-bold text-white uppercase mb-1.5">Saldos & Base de Contratos</h4>
                    <p className="text-xs text-slate-300 leading-relaxed">
                      Controle de saldo de cargas, tonelagens faturadas e histórico completo de todos os pedidos fechados.
                    </p>
                  </div>
                </div>
              </div>

              {/* Mockup Card */}
              <div className="col-span-5 flex flex-col justify-between bg-gradient-to-b from-[#0b1736] to-[#070e24] p-5 rounded-2xl border border-blue-500/40 shadow-2xl">
                <div>
                  <div className="flex items-center justify-between border-b border-slate-800 pb-3 mb-3">
                    <div className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 shrink-0" />
                      <span className="text-sm font-bold text-white">Portal do Embarcador</span>
                    </div>
                    <div 
                      className="text-xs text-sky-400 font-mono font-bold bg-blue-950 rounded border border-blue-500/30 shadow-sm shrink-0"
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        height: '24px',
                        padding: '0 10px',
                        lineHeight: 1,
                        boxSizing: 'border-box'
                      }}
                    >
                      <span style={{ lineHeight: 1, display: 'inline-block' }}>100% Online</span>
                    </div>
                  </div>

                  <div className="space-y-3">
                    <div className="p-3 rounded-xl bg-slate-900 border border-slate-800 flex items-center justify-between text-xs">
                      <div>
                        <span className="text-slate-400 text-xs">Carga em Trânsito</span>
                        <div className="font-bold text-white text-sm">Soja a Granel • 48.50 Ton</div>
                        <div className="text-slate-400 text-xs mt-0.5">Origem: Uberaba - MG → Destino: Santos - SP</div>
                      </div>
                      <div 
                        className="rounded-lg bg-blue-600/30 text-sky-300 text-xs font-bold border border-blue-500/40 shadow-sm shrink-0"
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          height: '28px',
                          padding: '0 12px',
                          lineHeight: 1,
                          boxSizing: 'border-box'
                        }}
                      >
                        <span style={{ lineHeight: 1, display: 'inline-block' }}>Em Viagem</span>
                      </div>
                    </div>

                    <div className="p-3 rounded-xl bg-slate-900 border border-slate-800 flex items-center justify-between text-xs">
                      <div>
                        <span className="text-slate-400 text-xs">Comprovante de Descarga</span>
                        <div className="font-bold text-white text-sm">Canhoto & CT-e Anexados</div>
                        <div className="text-slate-400 text-xs mt-0.5">Disponíveis para download imediato</div>
                      </div>
                      <div 
                        className="rounded-lg bg-emerald-600/30 text-emerald-300 text-xs font-bold border border-emerald-500/40 shadow-sm shrink-0"
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          height: '28px',
                          padding: '0 12px',
                          lineHeight: 1,
                          boxSizing: 'border-box'
                        }}
                      >
                        <span style={{ lineHeight: 1, display: 'inline-block' }}>Concluído</span>
                      </div>
                    </div>
                  </div>
                </div>

                <div 
                  className="rounded-xl bg-blue-950/60 border border-blue-500/30 flex items-center justify-center shadow-sm"
                  style={{
                    padding: '10px 16px',
                    minHeight: '44px',
                    boxSizing: 'border-box'
                  }}
                >
                  <p 
                    className="text-xs text-sky-200 font-medium m-0"
                    style={{ lineHeight: 1.4, textAlign: 'center' }}
                  >
                    Elimine planilhas manuais. Tenha controle logístico completo na ponta dos dedos.
                  </p>
                </div>
              </div>
            </div>

            {renderFooter(4)}
          </div>
        );

      case 4:
        // SLIDE 5: SEGURANÇA, PARCERIAS E OPERAÇÕES
        return (
          <div className="w-full h-full flex flex-col justify-between p-10 bg-gradient-to-br from-[#070c18] via-[#0b1328] to-[#141b2f] box-border">
            {renderHeader("Padrão de Segurança 360°", "Segurança, Parcerias e Operações")}

            <div className="flex-1 grid grid-cols-3 gap-5 items-stretch my-2">
              <div className="p-6 rounded-2xl bg-slate-900/90 border border-slate-700 shadow-xl flex flex-col justify-between">
                <div>
                  <div className="w-12 h-12 rounded-xl bg-blue-600/20 text-sky-400 flex items-center justify-center mb-4 border border-blue-500/30">
                    <ShieldAlert className="w-6 h-6" />
                  </div>
                  <h3 className="text-base font-bold text-white mb-2">Gerenciamento Rígido de Risco</h3>
                  <p className="text-xs text-slate-300 leading-relaxed mb-4">
                    Processo de verificação aprofundado a cada viagem. Cadastro rigorosamente validado e atualizado.
                  </p>
                  <ul className="space-y-2 text-xs text-slate-300">
                    <li className="flex items-center gap-2"><Check className="w-4 h-4 text-sky-400 shrink-0" /> Consulta de antecedentes e CNH</li>
                    <li className="flex items-center gap-2"><Check className="w-4 h-4 text-sky-400 shrink-0" /> Monitoramento contínuo de perfil</li>
                    <li className="flex items-center gap-2"><Check className="w-4 h-4 text-sky-400 shrink-0" /> Homologação nas maiores GRs</li>
                  </ul>
                </div>
                <div className="mt-4 pt-3 border-t border-slate-800 text-xs text-sky-400 font-bold uppercase tracking-wider">
                  Validação a Cada Embarque
                </div>
              </div>

              <div className="p-6 rounded-2xl bg-slate-900/90 border border-emerald-500/40 shadow-xl flex flex-col justify-between">
                <div>
                  <div className="w-12 h-12 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center mb-4 border border-emerald-500/30">
                    <ShieldCheck className="w-6 h-6" />
                  </div>
                  <h3 className="text-base font-bold text-white mb-2">100% das Cargas Asseguradas</h3>
                  <p className="text-xs text-slate-300 leading-relaxed mb-4">
                    Apólices securitárias integrais (RCTR-C e RCF-DC), cobrindo qualquer valor ou região do Brasil.
                  </p>
                  <ul className="space-y-2 text-xs text-slate-300">
                    <li className="flex items-center gap-2"><Check className="w-4 h-4 text-emerald-400 shrink-0" /> Cobertura total sem franquia</li>
                    <li className="flex items-center gap-2"><Check className="w-4 h-4 text-emerald-400 shrink-0" /> Proteção em qualquer trajeto</li>
                    <li className="flex items-center gap-2"><Check className="w-4 h-4 text-emerald-400 shrink-0" /> Apenas 1 sinistro recente em 4 anos</li>
                  </ul>
                </div>
                <div className="mt-4 pt-3 border-t border-slate-800 text-xs text-emerald-400 font-bold uppercase tracking-wider">
                  Proteção Patrimonial Total
                </div>
              </div>

              <div className="p-6 rounded-2xl bg-slate-900/90 border border-slate-700 shadow-xl flex flex-col justify-between">
                <div>
                  <div className="w-12 h-12 rounded-xl bg-indigo-500/20 text-indigo-400 flex items-center justify-center mb-4 border border-indigo-500/30">
                    <Truck className="w-6 h-6" />
                  </div>
                  <h3 className="text-base font-bold text-white mb-2">Rede Forte de Motoristas</h3>
                  <p className="text-xs text-slate-300 leading-relaxed mb-4">
                    Relacionamento próximo e humanizado com motoristas parceiros e transportadores autônomos.
                  </p>
                  <ul className="space-y-2 text-xs text-slate-300">
                    <li className="flex items-center gap-2"><Check className="w-4 h-4 text-indigo-400 shrink-0" /> Suporte operacional e plantão 24h</li>
                    <li className="flex items-center gap-2"><Check className="w-4 h-4 text-indigo-400 shrink-0" /> Alta capacidade em picos de safra</li>
                    <li className="flex items-center gap-2"><Check className="w-4 h-4 text-indigo-400 shrink-0" /> Pagamentos e adiantamentos pontuais</li>
                  </ul>
                </div>
                <div className="mt-4 pt-3 border-t border-slate-800 text-xs text-indigo-400 font-bold uppercase tracking-wider">
                  Agilidade no Escoamento
                </div>
              </div>
            </div>

            {renderFooter(5)}
          </div>
        );

      case 5:
        // SLIDE 6: CLIENTES E RELACIONAMENTO (Sophisticated Glassmorphic Transparent Showcase)
        return (
          <div className="w-full h-full flex flex-col justify-between p-10 bg-gradient-to-br from-[#081126] via-[#0d1836] to-[#091228] box-border">
            {renderHeader("Parcerias Estratégicas", "Grandes Marcas que Confiam na Transcunha")}

            <div className="flex-1 flex flex-col justify-between my-2">
              <p className="text-center text-sm text-slate-300 max-w-3xl mx-auto mb-3">
                Soluções rodoviárias consolidadas e atendimento de excelência aos maiores grupos do agronegócio e da indústria nacional:
              </p>

              {/* 10 Transparent Logo Cards in 5x2 High-End Grid */}
              <div className="grid grid-cols-5 gap-3 max-w-5xl w-full mx-auto flex-1 items-stretch">
                {clientBrands.map((client) => (
                  <div
                    key={client.name}
                    className="rounded-2xl bg-gradient-to-b from-slate-900/90 to-[#0c1630]/95 border border-slate-700/80 shadow-xl flex flex-col items-center justify-between p-3 transition-all relative overflow-hidden"
                  >
                    {/* Top ambient highlight line */}
                    <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-blue-500/40 to-transparent pointer-events-none" />

                    {/* Logo Image with Transparent Background */}
                    <div className="flex-1 w-full flex items-center justify-center py-1">
                      <img
                        src={client.logo}
                        alt={client.name}
                        className="max-h-12 max-w-[88%] w-auto object-contain filter drop-shadow-[0_4px_10px_rgba(0,0,0,0.5)]"
                      />
                    </div>

                    {/* Bottom Label Container */}
                    <div className="w-full pt-2 border-t border-slate-800/80 text-center shrink-0">
                      <div className="text-xs font-bold text-white tracking-tight truncate">
                        {client.name}
                      </div>
                      <div className="text-[10px] text-sky-400 font-medium tracking-wider uppercase mt-0.5 truncate">
                        {client.segment}
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Sophisticated Bottom Trust Banner */}
              <div className="mt-3 p-3 rounded-xl bg-blue-950/60 border border-blue-500/30 flex items-center justify-between text-xs text-slate-300 max-w-5xl w-full mx-auto shrink-0">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span><strong>+50 Grupos Atendidos:</strong> Logística dedicada e segura nos principais polos produtores</span>
                </div>
                <div className="h-4 w-px bg-slate-700 hidden md:block" />
                <div className="flex items-center gap-2">
                  <Award className="w-4 h-4 text-sky-400 shrink-0" />
                  <span><strong>Fidelidade Operacional:</strong> Relações de longo prazo safra após safra</span>
                </div>
                <div className="h-4 w-px bg-slate-700 hidden md:block" />
                <div 
                  className="rounded-lg bg-blue-900/60 border border-blue-500/40 text-xs font-bold text-sky-300 shrink-0"
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    height: '26px',
                    padding: '0 10px',
                    lineHeight: 1,
                    boxSizing: 'border-box'
                  }}
                >
                  <span style={{ lineHeight: 1, display: 'inline-block' }}>+ dezenas de outros parceiros</span>
                </div>
              </div>
            </div>

            {renderFooter(6)}
          </div>
        );

      case 6:
        // SLIDE 7: CONTATO COMERCIAL E CONCLUSÃO
        return (
          <div className="w-full h-full flex flex-col justify-between p-10 bg-gradient-to-br from-[#070c18] via-[#0a152e] to-[#0d1e44] box-border">
            {renderHeader("Atendimento Dedicado", "Contato Comercial")}

            <div className="flex-1 grid grid-cols-12 gap-8 items-center my-2">
              <div className="col-span-6 flex flex-col justify-center space-y-4">
                <div 
                  className="rounded-full text-xs font-black bg-blue-600/30 text-sky-300 border border-blue-500/40 uppercase tracking-wider shadow-sm shrink-0"
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    height: '30px',
                    padding: '0 14px',
                    lineHeight: 1,
                    boxSizing: 'border-box'
                  }}
                >
                  <span style={{ lineHeight: 1, display: 'inline-block' }}>Vamos Mover o Seu Negócio</span>
                </div>
                <h3 className="text-3xl font-black text-white tracking-tight leading-tight">
                  Prontos para ser o seu parceiro logístico de máxima confiança.
                </h3>
                <p className="text-sm text-slate-200 leading-relaxed">
                  Entre em contato com nossa equipe comercial para cotações personalizadas, estudos de rotas dedicadas e demonstração do nosso Portal do Cliente.
                </p>

                <div 
                  onClick={() => window.open('https://transcunhaoficial.com.br', '_blank')}
                  className="p-4 rounded-xl bg-slate-900/90 border border-slate-700 hover:border-sky-500/60 hover:bg-slate-800/90 transition-all cursor-pointer group flex items-center justify-between shadow-lg"
                  title="Clique para abrir o website oficial (transcunhaoficial.com.br)"
                >
                  <div className="flex items-center gap-3.5">
                    <div className="w-10 h-10 rounded-lg bg-blue-600/20 text-sky-400 flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform">
                      <Globe className="w-5 h-5" />
                    </div>
                    <div>
                      <span className="text-xs text-slate-400 uppercase font-bold tracking-wider">Portal Oficial</span>
                      <p className="text-base font-bold text-white group-hover:text-sky-300 transition-colors">www.transcunhaoficial.com.br</p>
                    </div>
                  </div>
                  <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-blue-600/20 text-sky-300 text-xs font-bold border border-blue-500/30 group-hover:bg-sky-500 group-hover:text-white transition-all">
                    Acessar <ArrowUpRight className="w-3.5 h-3.5" />
                  </span>
                </div>
              </div>

              {/* Contact Cards */}
              <div className="col-span-6 flex flex-col justify-center space-y-3">
                <div className="p-4 rounded-xl bg-slate-900/90 border border-slate-700 flex items-center justify-between shadow-lg">
                  <div className="flex items-center gap-4">
                    <div className="w-11 h-11 rounded-xl bg-blue-600/20 text-sky-400 flex items-center justify-center border border-blue-500/30">
                      <Mail className="w-5 h-5" />
                    </div>
                    <div>
                      <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">E-mail Comercial</span>
                      <p className="text-sm font-bold text-white">comercialtranscunha@gmail.com</p>
                    </div>
                  </div>
                </div>

                <div className="p-4 rounded-xl bg-slate-900/90 border border-slate-700 flex items-center justify-between shadow-lg">
                  <div className="flex items-center gap-4">
                    <div className="w-11 h-11 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center border border-emerald-500/30">
                      <Phone className="w-5 h-5" />
                    </div>
                    <div>
                      <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">WhatsApp & Telefone (Comercial)</span>
                      <p className="text-sm font-bold text-white">(35) 99103-0469</p>
                    </div>
                  </div>
                </div>

                <div className="p-4 rounded-xl bg-slate-900/90 border border-slate-700 flex items-center justify-between shadow-lg">
                  <div className="flex items-center gap-4">
                    <div className="w-11 h-11 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center border border-emerald-500/30">
                      <Phone className="w-5 h-5" />
                    </div>
                    <div>
                      <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">WhatsApp & Telefone (Operações)</span>
                      <p className="text-sm font-bold text-white">(35) 99872-1970</p>
                    </div>
                  </div>
                </div>

                <div className="p-4 rounded-xl bg-slate-900/90 border border-slate-700 flex items-center gap-4 shadow-lg">
                  <div className="w-11 h-11 rounded-xl bg-teal-500/20 text-teal-400 flex items-center justify-center border border-teal-500/30 shrink-0">
                    <MapPin className="w-5 h-5" />
                  </div>
                  <div>
                    <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Matriz Operacional</span>
                    <p className="text-sm font-bold text-white">Pratápolis - MG • CEP 37970-000</p>
                  </div>
                </div>
              </div>
            </div>

            {renderFooter(7)}
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div 
      ref={containerRef}
      className="min-h-screen bg-[#070c18] text-slate-100 flex flex-col font-sans selection:bg-blue-600 selection:text-white"
    >
      {/* Print Styles strictly configured for A4 Landscape */}
      <style>{`
        @media print {
          @page {
            size: landscape;
            margin: 0;
          }
          html, body {
            margin: 0 !important;
            padding: 0 !important;
            background-color: #070c18 !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          .no-print {
            display: none !important;
          }
          .pdf-print-root {
            display: block !important;
          }
          .pdf-print-slide {
            width: 297mm !important;
            height: 210mm !important;
            max-width: 297mm !important;
            max-height: 210mm !important;
            page-break-after: always !important;
            break-after: page !important;
            overflow: hidden !important;
            box-sizing: border-box !important;
            display: flex !important;
          }
        }
      `}</style>

      {/* Top Floating Control Bar (Hidden on print) */}
      <header className="no-print sticky top-0 z-50 bg-[#0b1328]/95 backdrop-blur-xl border-b border-slate-700/60 shadow-xl px-4 py-3">
        <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-3">
          
          {/* Logo & Brand Info */}
          <div className="flex items-center gap-3">
            {onBackToApp && (
              <button 
                onClick={onBackToApp}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white text-xs font-semibold transition-all border border-slate-700 cursor-pointer"
                title="Voltar ao Sistema Transcunha"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Voltar ao Sistema</span>
              </button>
            )}

            <div className="flex items-center gap-2.5">
              <img 
                src={logoSrc} 
                alt="Transcunha" 
                className="h-8 md:h-9 w-auto object-contain filter drop-shadow-[0_2px_8px_rgba(0,82,204,0.4)]"
                onError={(e) => {
                  (e.target as HTMLElement).style.display = 'none';
                }}
              />
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-xs md:text-sm font-bold tracking-tight text-white uppercase">
                    Apresentação Comercial
                  </span>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-blue-500/20 text-sky-400 border border-blue-500/30">
                    2026 • PDF
                  </span>
                </div>
                <p className="text-[10px] text-slate-400 hidden md:block">
                  Transcunha Transportes e Logística • Soluções que movem o futuro
                </p>
              </div>
            </div>
          </div>

          {/* Slide Deck Tabs (Desktop) */}
          <div className="hidden lg:flex items-center bg-slate-900/90 rounded-xl p-1 border border-slate-700/60 shadow-inner">
            {[
              { idx: 0, label: 'Capa' },
              { idx: 1, label: 'Quem Somos' },
              { idx: 2, label: 'Números' },
              { idx: 3, label: 'Portal Cliente' },
              { idx: 4, label: 'Segurança' },
              { idx: 5, label: 'Clientes' },
              { idx: 6, label: 'Contato' }
            ].map(tab => (
              <button
                key={tab.idx}
                onClick={() => {
                  setCurrentSlide(tab.idx);
                  if (viewMode === 'scroll') {
                    const el = document.getElementById(`onscreen-slide-${tab.idx}`);
                    el?.scrollIntoView({ behavior: 'smooth' });
                  }
                }}
                className={`px-2.5 py-1 text-xs font-medium rounded-lg transition-all cursor-pointer ${
                  currentSlide === tab.idx 
                    ? 'bg-blue-600 text-white shadow-md font-bold' 
                    : 'text-slate-400 hover:text-white hover:bg-slate-800'
                }`}
              >
                {tab.idx + 1}. {tab.label}
              </button>
            ))}
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-2">
            
            {/* View Mode Toggle */}
            <div className="flex items-center bg-slate-900 rounded-lg p-0.5 border border-slate-700">
              <button
                onClick={() => setViewMode('deck')}
                className={`px-2 py-1 text-xs font-semibold rounded-md transition-all cursor-pointer ${viewMode === 'deck' ? 'bg-blue-600 text-white shadow' : 'text-slate-400 hover:text-white'}`}
                title="Modo Apresentação (Slide a Slide)"
              >
                Slides
              </button>
              <button
                onClick={() => setViewMode('scroll')}
                className={`px-2 py-1 text-xs font-semibold rounded-md transition-all cursor-pointer ${viewMode === 'scroll' ? 'bg-blue-600 text-white shadow' : 'text-slate-400 hover:text-white'}`}
                title="Modo Contínuo (Todos os Slides)"
              >
                Todos
              </button>
            </div>

            {/* Open Institutional Website */}
            <a
              href="/site"
              target="_blank"
              rel="noopener noreferrer"
              className="hidden md:flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 border border-emerald-500/40 transition-all cursor-pointer"
              title="Abrir o Website Oficial (transcunhaoficial.com.br)"
            >
              <Globe className="w-3.5 h-3.5 text-emerald-400" />
              <span>Website Oficial</span>
              <ArrowUpRight className="w-3 h-3 text-emerald-400 opacity-75" />
            </a>

            {/* Share Public Link */}
            <button
              onClick={handleCopyLink}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all border cursor-pointer ${
                copiedLink 
                  ? 'bg-emerald-600/20 text-emerald-300 border-emerald-500/40' 
                  : 'bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border-slate-700'
              }`}
              title="Copiar Link de Acesso Público da Apresentação"
            >
              {copiedLink ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Share2 className="w-3.5 h-3.5 text-sky-400" />}
              <span className="hidden sm:inline">{copiedLink ? 'Link Copiado!' : 'Copiar Link'}</span>
            </button>

            {/* Download PDF Button */}
            <button
              onClick={handleGeneratePdf}
              disabled={isGeneratingPdf}
              className="flex items-center gap-2 px-3.5 py-1.5 rounded-lg bg-gradient-to-r from-blue-600 to-sky-500 hover:from-blue-500 hover:to-sky-400 text-white text-xs font-bold shadow-lg shadow-blue-900/40 hover:scale-[1.02] active:scale-[0.98] transition-all cursor-pointer disabled:opacity-50"
              title="Gerar e Baixar Documento PDF em formato Horizontal (A4)"
            >
              <Download className={`w-3.5 h-3.5 ${isGeneratingPdf ? 'animate-bounce' : ''}`} />
              <span>
                {isGeneratingPdf 
                  ? `Compilando PDF (${pdfProgress?.current || 0}/${pdfProgress?.total || totalSlides})...` 
                  : 'Baixar PDF'}
              </span>
            </button>

            {/* Native Browser Print / Save PDF */}
            <button
              onClick={handleNativePrint}
              className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 transition-all cursor-pointer"
              title="Imprimir ou Salvar via Navegador"
            >
              <Printer className="w-4 h-4" />
            </button>

            {/* Fullscreen Toggle */}
            <button
              onClick={toggleFullscreen}
              className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 transition-all hidden md:flex cursor-pointer"
              title="Alternar Tela Cheia"
            >
              {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
            </button>
          </div>

        </div>

        {pdfError && (
          <div className="max-w-7xl mx-auto mt-2 p-2 bg-red-950/80 border border-red-500/40 text-red-200 text-xs rounded-lg flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
            <span>{pdfError}</span>
          </div>
        )}
      </header>

      {/* Main Screen Content Area (Deck or Scroll) */}
      <main className="flex-1 flex flex-col items-center justify-center p-2 sm:p-4 md:p-6 overflow-y-auto">
        <div className="w-full max-w-[1140px] flex flex-col gap-8">
          {Array.from({ length: totalSlides }).map((_, idx) => (
            <div
              key={idx}
              id={`onscreen-slide-${idx}`}
              className={`w-full aspect-[1122/793] rounded-2xl md:rounded-3xl border border-blue-900/50 shadow-2xl overflow-hidden transition-all duration-300 ${
                viewMode === 'deck' && currentSlide !== idx ? 'hidden' : 'block'
              }`}
            >
              {renderSlideContent(idx)}
            </div>
          ))}
        </div>
      </main>

      {/* Deck Mode Controller Bar (Bottom) */}
      {viewMode === 'deck' && (
        <footer className="no-print sticky bottom-0 z-40 bg-[#0b1328]/95 backdrop-blur-xl border-t border-slate-800 shadow-2xl px-4 py-3">
          <div className="max-w-4xl mx-auto flex items-center justify-between gap-4">
            
            {/* Prev Button */}
            <button
              onClick={() => setCurrentSlide(prev => Math.max(0, prev - 1))}
              disabled={currentSlide === 0}
              className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white text-xs font-semibold disabled:opacity-40 transition-all border border-slate-700 cursor-pointer"
            >
              <ChevronLeft className="w-4 h-4" />
              <span>Anterior</span>
            </button>

            {/* Progress Dots */}
            <div className="flex items-center gap-2">
              {Array.from({ length: totalSlides }).map((_, idx) => (
                <button
                  key={idx}
                  onClick={() => setCurrentSlide(idx)}
                  className={`h-2.5 rounded-full transition-all cursor-pointer ${
                    currentSlide === idx 
                      ? 'w-8 bg-blue-500 shadow-md shadow-blue-500/50' 
                      : 'w-2.5 bg-slate-700 hover:bg-slate-500'
                  }`}
                  title={`Ir para slide ${idx + 1}`}
                />
              ))}
            </div>

            {/* Next Button */}
            <button
              onClick={() => setCurrentSlide(prev => Math.min(totalSlides - 1, prev + 1))}
              disabled={currentSlide === totalSlides - 1}
              className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold disabled:opacity-40 transition-all shadow-md shadow-blue-900/30 cursor-pointer"
            >
              <span>Próximo</span>
              <ChevronRight className="w-4 h-4" />
            </button>

          </div>
        </footer>
      )}

      {/* 
        OFF-SCREEN PDF STAGING SYSTEM
        Fixed 1122px x 793px (Exact A4 Landscape Dimensions).
        ALL 7 slides are fully mounted and visible here (never display: none).
        This guarantees that html2canvas captures valid, uncorrupted, standard PDF slides!
      */}
      <div 
        ref={pdfStagingRef}
        aria-hidden="true"
        style={{
          position: 'fixed',
          left: '-99999px',
          top: 0,
          width: '1122px',
          zIndex: -9999,
          pointerEvents: 'none'
        }}
      >
        {Array.from({ length: totalSlides }).map((_, idx) => (
          <div
            key={idx}
            className="pdf-standard-slide"
            style={{
              width: '1122px',
              height: '793px',
              minWidth: '1122px',
              minHeight: '793px',
              maxWidth: '1122px',
              maxHeight: '793px',
              boxSizing: 'border-box',
              display: 'flex',
              overflow: 'hidden',
              background: '#070c18'
            }}
          >
            {renderSlideContent(idx)}
          </div>
        ))}
      </div>

      {/* PRINT CONTAINER (Native Browser Print Engine) */}
      <div className="pdf-print-root hidden">
        {Array.from({ length: totalSlides }).map((_, idx) => (
          <div
            key={idx}
            className="pdf-print-slide"
            style={{
              width: '297mm',
              height: '210mm',
              pageBreakAfter: 'always',
              breakAfter: 'page',
              overflow: 'hidden',
              boxSizing: 'border-box',
              background: '#070c18'
            }}
          >
            {renderSlideContent(idx)}
          </div>
        ))}
      </div>

    </div>
  );
};

export default CommercialPresentationPage;
