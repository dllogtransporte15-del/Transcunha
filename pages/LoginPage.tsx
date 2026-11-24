import React, { useState } from 'react';
import { supabase } from '../supabase';
import { User, UserProfile, DriverClassification, VehicleSetType, VehicleBodyType } from '../types';
import type { ProfilePermissions } from '../types';
import { formatCPF, formatPhone } from '../utils/formatters';
import { 
  UserPlus, ArrowLeft, Eye, EyeOff, CheckCircle2, 
  ShieldCheck, Activity, Clock, Smartphone, Mail, Lock, 
  Check, Sparkles, Building2, Truck, HelpCircle, Download,
  X, Share2, Monitor, ArrowRight, ExternalLink
} from 'lucide-react';

interface LoginPageProps {
  onLogin: (user: User) => void;
  users: User[];
  companyLogo: string | null;
  profilePermissions?: ProfilePermissions;
}

const LoginPage: React.FC<LoginPageProps> = ({ onLogin, users, companyLogo, profilePermissions }) => {
  const [loginType, setLoginType] = useState<'interno' | 'motorista'>('interno');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [cpf, setCpf] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);

  // Estado para alternar entre login e cadastro de novo motorista
  const [isRegisteringDriver, setIsRegisteringDriver] = useState(false);

  // Campos do formulário de cadastro de motorista
  const [regCpf, setRegCpf] = useState('');
  const [regPhone, setRegPhone] = useState('');
  const [regName, setRegName] = useState('');
  const [regHorsePlate, setRegHorsePlate] = useState('');
  const [regVehicleSetType, setRegVehicleSetType] = useState<VehicleSetType | ''>('');
  const [regVehicleBodyType, setRegVehicleBodyType] = useState<VehicleBodyType | ''>('');
  const [regTrailer1Plate, setRegTrailer1Plate] = useState('');
  const [regTrailer2Plate, setRegTrailer2Plate] = useState('');
  const [regTrailer3Plate, setRegTrailer3Plate] = useState('');
  const [regPassword, setRegPassword] = useState('');
  const [regConfirmPassword, setRegConfirmPassword] = useState('');
  const [showRegPassword, setShowRegPassword] = useState(false);
  const [showRegConfirmPassword, setShowRegConfirmPassword] = useState(false);

  React.useEffect(() => {
    if (profilePermissions?.system_settings?.driver_portal_enabled === false) {
      setLoginType('interno');
      setIsRegisteringDriver(false);
    }
  }, [profilePermissions]);

  React.useEffect(() => {
    const isPwaEnabled = profilePermissions?.system_settings?.pwa_enabled !== false;
    if (!isPwaEnabled) return;
    
    const handler = (e: any) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };
    
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, [profilePermissions]);

  const handleCpfChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setCpf(formatCPF(e.target.value));
  };

  const handleRegCpfChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setRegCpf(formatCPF(e.target.value));
  };

  const handleRegPhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setRegPhone(formatPhone(e.target.value));
  };

  const formatPlate = (val: string) => {
    return val.toUpperCase().replace(/[^A-Z0-9-]/g, '').slice(0, 8);
  };

  const [showAppInstallModal, setShowAppInstallModal] = useState(false);

  const handlePwaInstall = (e?: React.MouseEvent) => {
    if (e) e.preventDefault();
    if (deferredPrompt) {
      deferredPrompt.prompt();
      deferredPrompt.userChoice.then((choiceResult: any) => {
        if (choiceResult.outcome === 'accepted') {
          setDeferredPrompt(null);
          setShowAppInstallModal(false);
        }
      });
    } else {
      setShowAppInstallModal(true);
    }
  };

  // Submit de Login (Interno ou Motorista Existente)
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isLoading) return;

    if (loginType === 'motorista') {
      if ('geolocation' in navigator) {
        navigator.geolocation.getCurrentPosition(() => {}, () => {});
      }
      
      if (deferredPrompt) {
        try {
          deferredPrompt.prompt();
          deferredPrompt.userChoice.then((choiceResult: any) => {
            if (choiceResult.outcome === 'accepted') {
              setDeferredPrompt(null);
            }
          });
        } catch(err) {
          console.error('Erro ao chamar o prompt de instalação:', err);
        }
      }
    }

    setError('');
    setSuccessMessage('');
    setIsLoading(true);

    try {
      await supabase.auth.signOut();

      if (loginType === 'motorista') {
        const cleanCpf = cpf.replace(/\D/g, '');
        if (cleanCpf.length !== 11) {
          setError('CPF inválido. Digite os 11 números.');
          setIsLoading(false);
          return;
        }

        console.log('[LoginPage] Iniciando login motorista para:', cleanCpf);
        const formattedCpf = formatCPF(cleanCpf);

        // Busca o motorista na tabela drivers (com ou sem formatação)
        let { data: driverData } = await supabase
          .from('drivers')
          .select('*')
          .eq('cpf', formattedCpf)
          .maybeSingle();

        if (!driverData) {
          const { data: dbDriverClean } = await supabase
            .from('drivers')
            .select('*')
            .eq('cpf', cleanCpf)
            .maybeSingle();
          driverData = dbDriverClean;
        }

        if (!driverData) {
          setError('Motorista não encontrado com este CPF. Se você é novo por aqui, clique em "Criar conta de motorista" abaixo.');
          setIsLoading(false);
          return;
        }

        if (!driverData.active) {
          setError('Este motorista está inativo no sistema.');
          setIsLoading(false);
          return;
        }
        
        // Verifica se o motorista já tem uma senha configurada em app_users
        const { data: appUser } = await supabase
          .from('app_users')
          .select('password, require_password_change')
          .eq('id', driverData.id)
          .maybeSingle();

        let isFirstSetup = false;
        let requirePasswordChange = false;

        if (appUser) {
           if (!password) {
             setError('Senha obrigatória para acessar.');
             setIsLoading(false);
             return;
           }
           if (appUser.password !== password) {
             setError('Senha incorreta.');
             setIsLoading(false);
             return;
           }
           requirePasswordChange = appUser.require_password_change;
        } else {
           isFirstSetup = true;
           requirePasswordChange = true;
        }

        const userProfile: User = {
          id: driverData.id,
          name: driverData.name,
          email: driverData.cpf,
          profile: UserProfile.Motorista,
          active: driverData.active,
          requirePasswordChange,
          isFirstSetup
        };

        console.log('[LoginPage] Login motorista bem-sucedido:', userProfile.name);
        sessionStorage.setItem('trancunha_user_email', userProfile.email);
        sessionStorage.setItem('trancunha_currentUser', JSON.stringify(userProfile));
        try {
          localStorage.removeItem('trancunha_user_email');
          localStorage.removeItem('trancunha_currentUser');
        } catch {}
        onLogin(userProfile);

      } else {
        const inputLogin = email.trim();
        const cleanEmail = inputLogin.toLowerCase();
        const cleanPassword = password.trim();
        const cleanDigits = inputLogin.replace(/\D/g, '');
        const formattedCpf = cleanDigits.length === 11 ? formatCPF(cleanDigits) : '';

        console.log('[LoginPage] Iniciando login para:', inputLogin);
        
        let query = supabase.from('app_users').select('*').eq('password', cleanPassword);
        if (formattedCpf) {
          query = query.or(`email.ilike.${cleanEmail},email.eq.${inputLogin},email.eq.${formattedCpf},email.eq.${cleanDigits}`);
        } else {
          query = query.or(`email.ilike.${cleanEmail},email.eq.${inputLogin}`);
        }

        const { data: dbUserList, error: dbError } = await query;
        const dbUser = dbUserList && dbUserList.length > 0 ? dbUserList[0] : null;

        if (dbError || !dbUser) {
          console.error('[LoginPage] Erro de login:', dbError);
          setError('Usuário, e-mail ou senha inválidos.');
          setIsLoading(false);
          return;
        }

        const userProfile: User = {
          id: dbUser.id,
          name: dbUser.name,
          email: dbUser.email,
          profile: dbUser.profile,
          active: dbUser.active,
          password: dbUser.password,
          clientId: dbUser.client_id || undefined,
          branchId: dbUser.branch_id || undefined,
          filialId: dbUser.branch_id || undefined,
          requirePasswordChange: dbUser.require_password_change,
          authId: dbUser.auth_id
        };

        if (!userProfile.active) {
          setError('Este usuário está inativo.');
          setIsLoading(false);
          return;
        }

        console.log('[LoginPage] Login bem-sucedido:', userProfile.name);
        sessionStorage.setItem('trancunha_user_email', userProfile.email);
        sessionStorage.setItem('trancunha_currentUser', JSON.stringify(userProfile));
        try {
          localStorage.removeItem('trancunha_user_email');
          localStorage.removeItem('trancunha_currentUser');
        } catch {}
        onLogin(userProfile);
      }
    } catch (err: any) {
      console.error('Login error:', err);
      setError('Ocorreu um erro interno ao tentar entrar.');
    } finally {
      setIsLoading(false);
    }
  };

  // Submit de Cadastro de Novo Motorista
  const handleDriverRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isLoading) return;

    setError('');
    setSuccessMessage('');

    const cleanCpf = regCpf.replace(/\D/g, '');
    if (cleanCpf.length !== 11) {
      setError('CPF do motorista inválido. Digite os 11 dígitos.');
      return;
    }

    const cleanPhone = regPhone.replace(/\D/g, '');
    if (cleanPhone.length < 10) {
      setError('Informe um telefone/WhatsApp de contato válido.');
      return;
    }

    if (!regName.trim()) {
      setError('Informe o nome completo do motorista.');
      return;
    }

    if (!regHorsePlate.trim()) {
      setError('Informe a Placa do Cavalo.');
      return;
    }

    if (!regVehicleSetType) {
      setError('Selecione o Tipo de Veículo.');
      return;
    }

    if (!regVehicleBodyType) {
      setError('Selecione o Tipo de Carroceria.');
      return;
    }

    if (!regTrailer1Plate.trim()) {
      setError('A Placa da Carreta 1 é obrigatória.');
      return;
    }

    if (!regPassword || regPassword.length < 4) {
      setError('A senha deve ter pelo menos 4 dígitos/caracteres.');
      return;
    }

    if (regPassword !== regConfirmPassword) {
      setError('A confirmação de senha não confere com a senha digitada.');
      return;
    }

    setIsLoading(true);

    try {
      const formattedCpf = formatCPF(cleanCpf);
      const upperName = regName.trim().toUpperCase();
      const cleanHorsePlate = regHorsePlate.trim().toUpperCase();

      // 1. Verifica se o motorista já existe no cadastro (pelo CPF)
      let { data: existingDriver } = await supabase
        .from('drivers')
        .select('*')
        .or(`cpf.eq.${formattedCpf},cpf.eq.${cleanCpf}`)
        .maybeSingle();

      let driverId = existingDriver?.id;

      if (existingDriver) {
        // Motorista já existia no banco: atualiza dados e ativa o app
        driverId = existingDriver.id;
        const { error: updateDriverErr } = await supabase
          .from('drivers')
          .update({
            name: upperName || existingDriver.name,
            phone: regPhone.trim() || existingDriver.phone,
            has_app: true,
            active: true,
          })
          .eq('id', driverId);

        if (updateDriverErr) {
          console.warn('[LoginPage] Aviso ao atualizar dados do motorista existente:', updateDriverErr);
        }
      } else {
        // Motorista novo: gera ID único seguro anti-colisão
        driverId = `DRV-${Date.now().toString().slice(-6)}${Math.floor(10 + Math.random() * 90)}`;

        const { error: driverErr } = await supabase
          .from('drivers')
          .insert({
            id: driverId,
            name: upperName,
            cpf: formattedCpf,
            cnh: '',
            phone: regPhone.trim(),
            classification: DriverClassification.Terceiro,
            active: true,
            has_app: true,
          });

        if (driverErr) {
          console.error('[LoginPage] Erro ao cadastrar motorista:', driverErr);
          setError('Erro ao salvar dados do motorista: ' + (driverErr.message || 'Erro no banco de dados'));
          setIsLoading(false);
          return;
        }
      }

      // 2. Registra ou atualiza o Cavalo Mecânico na tabela 'vehicles'
      if (cleanHorsePlate) {
        const { data: existingHorse } = await supabase
          .from('vehicles')
          .select('id')
          .eq('plate', cleanHorsePlate)
          .maybeSingle();

        if (existingHorse) {
          await supabase
            .from('vehicles')
            .update({
              driver_id: driverId,
              set_type: regVehicleSetType,
              body_type: regVehicleBodyType,
            })
            .eq('id', existingHorse.id);
        } else {
          const horseVehId = `VEH-${Date.now().toString().slice(-6)}${Math.floor(10 + Math.random() * 90)}`;
          const { error: horseErr } = await supabase
            .from('vehicles')
            .insert({
              id: horseVehId,
              plate: cleanHorsePlate,
              set_type: regVehicleSetType,
              body_type: regVehicleBodyType,
              classification: DriverClassification.Terceiro,
              driver_id: driverId,
              owner_id: null,
            });

          if (horseErr) {
            console.warn('[LoginPage] Aviso ao registrar cavalo:', horseErr);
          }
        }
      }

      // 3. Registra ou atualiza as Carretas na tabela 'vehicles'
      const trailers = [regTrailer1Plate, regTrailer2Plate, regTrailer3Plate].filter(p => p && p.trim().length > 0);
      for (const tPlate of trailers) {
        const cleanTPlate = tPlate.trim().toUpperCase();
        const { data: existingTrailer } = await supabase
          .from('vehicles')
          .select('id')
          .eq('plate', cleanTPlate)
          .maybeSingle();

        if (existingTrailer) {
          await supabase
            .from('vehicles')
            .update({
              driver_id: driverId,
              set_type: regVehicleSetType,
              body_type: regVehicleBodyType,
            })
            .eq('id', existingTrailer.id);
        } else {
          const trailerVehId = `VEH-${Date.now().toString().slice(-6)}${Math.floor(10 + Math.random() * 90)}`;
          await supabase.from('vehicles').insert({
            id: trailerVehId,
            plate: cleanTPlate,
            set_type: regVehicleSetType,
            body_type: regVehicleBodyType,
            classification: DriverClassification.Terceiro,
            driver_id: driverId,
            owner_id: null,
          });
        }
      }

      // 4. Cria ou atualiza usuário em 'app_users' para autenticação segura
      const { error: userErr } = await supabase
        .from('app_users')
        .upsert({
          id: driverId,
          name: upperName,
          email: cleanCpf,
          phone: regPhone.trim(),
          profile: UserProfile.Motorista,
          active: true,
          password: regPassword.trim(),
          require_password_change: false,
          password_updated_at: new Date().toISOString(),
        });

      if (userErr) {
        console.warn('[LoginPage] Aviso ao salvar usuário em app_users:', userErr);
      }

      // 5. Realiza o login direto no app
      const userProfile: User = {
        id: driverId,
        name: upperName,
        email: formattedCpf,
        profile: UserProfile.Motorista,
        active: true,
        requirePasswordChange: false,
        isFirstSetup: false,
      };

      setSuccessMessage('Cadastro realizado com sucesso! Entrando...');
      sessionStorage.setItem('trancunha_user_email', formattedCpf);
      sessionStorage.setItem('trancunha_currentUser', JSON.stringify(userProfile));
      try {
        localStorage.removeItem('trancunha_user_email');
        localStorage.removeItem('trancunha_currentUser');
      } catch {}
      
      setTimeout(() => {
        onLogin(userProfile);
      }, 600);

    } catch (err: any) {
      console.error('[LoginPage] Erro inesperado no cadastro:', err);
      setError('Ocorreu um erro ao processar o cadastro: ' + (err.message || 'Erro inesperado'));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div 
      className="relative min-h-screen w-full bg-[#070c18] text-slate-100 flex flex-col justify-between overflow-x-hidden font-sans"
      style={{ zoom: 0.81 }}
    >
      {/* Background Grid Pattern & Ambient Glows */}
      <div 
        className="absolute inset-0 pointer-events-none z-0"
        style={{
          backgroundImage: `
            linear-gradient(to right, rgba(59, 130, 246, 0.05) 1px, transparent 1px),
            linear-gradient(to bottom, rgba(59, 130, 246, 0.05) 1px, transparent 1px)
          `,
          backgroundSize: '48px 48px'
        }}
      />
      
      {/* Soft Radial Ambient Lighting */}
      <div className="absolute top-0 left-1/4 w-[600px] h-[500px] bg-blue-600/10 rounded-full blur-[140px] pointer-events-none z-0" />
      <div className="absolute bottom-0 right-1/4 w-[500px] h-[500px] bg-sky-500/10 rounded-full blur-[140px] pointer-events-none z-0" />
      <div className="absolute top-1/2 right-10 w-[350px] h-[350px] bg-indigo-500/10 rounded-full blur-[100px] pointer-events-none z-0" />

      {/* Main Container */}
      <div className="relative z-10 w-full max-w-7xl mx-auto px-5 sm:px-8 lg:px-12 py-8 lg:py-12 flex-1 flex flex-col justify-center">
        
        {/* Top Header Row (Logo + Status Badge) */}
        <div className="flex items-center justify-between pb-8 lg:pb-12">
          <div className="flex items-center gap-3">
            {companyLogo ? (
              <img 
                src={companyLogo} 
                alt="Logo TransCunha" 
                className="h-24 sm:h-28 lg:h-32 max-w-[320px] sm:max-w-[380px] object-contain filter drop-shadow-[0_4px_20px_rgba(11,102,228,0.45)] transition-all" 
              />
            ) : (
              <div className="flex items-center gap-3">
                <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl bg-gradient-to-tr from-blue-700 via-primary to-sky-400 p-0.5 shadow-xl shadow-blue-500/25 flex items-center justify-center">
                  <div className="w-full h-full bg-[#080e1e] rounded-[14px] flex items-center justify-center">
                    <Truck className="w-8 h-8 sm:w-10 sm:h-10 text-sky-400" />
                  </div>
                </div>
                <span className="text-4xl sm:text-5xl font-black tracking-tight text-white">
                  TRANS<span className="text-transparent bg-clip-text bg-gradient-to-r from-sky-400 to-blue-500">CUNHA</span>
                </span>
              </div>
            )}
          </div>

          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-slate-900/90 border border-slate-700/60 shadow-inner backdrop-blur-md">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
            </span>
            <span className="text-[11px] font-bold text-slate-300 tracking-wider uppercase">Sistema Online</span>
          </div>
        </div>

        {/* Content Layout Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-16 items-center">
          
          {/* ========================================================= */}
          {/* LEFT SECTION: Portal de Acesso (Auth Card)               */}
          {/* ========================================================= */}
          <div className="lg:col-span-5 flex justify-center w-full">
            <div className={`w-full ${isRegisteringDriver ? 'max-w-xl' : 'max-w-md'} p-6 sm:p-8 rounded-3xl bg-[#0b1328]/85 border border-slate-700/60 shadow-2xl shadow-blue-950/50 backdrop-blur-2xl transition-all duration-300 relative overflow-hidden`}>
              
              {/* Card Top Border Glow */}
              <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-sky-400 to-transparent opacity-80" />

              {/* Header Title */}
              <div className="text-center mb-6">
                <h2 className="text-2xl font-black text-white tracking-tight">
                  {isRegisteringDriver ? 'Cadastro de Motorista' : 'Portal de Acesso'}
                </h2>
                <p className="text-xs text-slate-400 mt-1">
                  {isRegisteringDriver 
                    ? 'Preencha seus dados para criar sua conta no aplicativo' 
                    : 'Entre com suas credenciais corporativas ou CPF'}
                </p>
              </div>

              {/* Tab Switcher (Acesso Interno / Sou Motorista) */}
              {!isRegisteringDriver && profilePermissions?.system_settings?.driver_portal_enabled !== false && (
                <div className="flex p-1 mb-6 rounded-xl bg-slate-950/70 border border-slate-800">
                  <button
                    type="button"
                    className={`flex-1 py-2.5 px-3 text-xs sm:text-sm font-bold rounded-lg transition-all flex items-center justify-center gap-2 ${
                      loginType === 'interno'
                        ? 'bg-gradient-to-r from-blue-600 to-blue-700 text-white shadow-md shadow-blue-900/40'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                    onClick={() => { setLoginType('interno'); setError(''); }}
                  >
                    <Building2 className="w-4 h-4" />
                    <span>Acesso Interno</span>
                  </button>
                  <button
                    type="button"
                    className={`flex-1 py-2.5 px-3 text-xs sm:text-sm font-bold rounded-lg transition-all flex items-center justify-center gap-2 ${
                      loginType === 'motorista'
                        ? 'bg-gradient-to-r from-sky-600 to-blue-600 text-white shadow-md shadow-blue-900/40'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                    onClick={() => { setLoginType('motorista'); setError(''); }}
                  >
                    <Truck className="w-4 h-4" />
                    <span>Sou Motorista</span>
                  </button>
                </div>
              )}

              {/* ========================================================= */}
              {/* FORMULÁRIO DE CADASTRO DE NOVO MOTORISTA                  */}
              {/* ========================================================= */}
              {isRegisteringDriver ? (
                <form className="space-y-4" onSubmit={handleDriverRegister}>
                  <div className="flex items-center justify-between pb-2 border-b border-slate-800">
                    <button
                      type="button"
                      onClick={() => { setIsRegisteringDriver(false); setError(''); }}
                      className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-400 hover:text-sky-400 transition-colors"
                    >
                      <ArrowLeft className="w-4 h-4" />
                      <span>Voltar ao login</span>
                    </button>
                    <span className="text-[10px] font-bold text-sky-400 uppercase tracking-wider bg-sky-950/60 px-2.5 py-1 rounded-md border border-sky-800/60">
                      Novo Motorista
                    </span>
                  </div>

                  {/* CPF e Contato */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1">
                        CPF do Motorista <span className="text-red-400">*</span>
                      </label>
                      <input
                        type="text"
                        required
                        disabled={isLoading}
                        value={regCpf}
                        onChange={handleRegCpfChange}
                        placeholder="000.000.000-00"
                        maxLength={14}
                        className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950/80 border border-slate-700/80 text-white text-xs font-mono placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-transparent transition-all"
                      />
                    </div>

                    <div>
                      <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1">
                        WhatsApp / Contato <span className="text-red-400">*</span>
                      </label>
                      <input
                        type="text"
                        required
                        disabled={isLoading}
                        value={regPhone}
                        onChange={handleRegPhoneChange}
                        placeholder="(00) 00000-0000"
                        maxLength={15}
                        className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950/80 border border-slate-700/80 text-white text-xs placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-transparent transition-all"
                      />
                    </div>
                  </div>

                  {/* Nome Completo */}
                  <div>
                    <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1">
                      Nome Completo <span className="text-red-400">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      disabled={isLoading}
                      value={regName}
                      onChange={e => setRegName(e.target.value)}
                      placeholder="Nome completo do motorista"
                      className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950/80 border border-slate-700/80 text-white text-xs uppercase placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-transparent transition-all"
                    />
                  </div>

                  {/* Placa Cavalo */}
                  <div>
                    <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1">
                      Placa do Cavalo <span className="text-red-400">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      disabled={isLoading}
                      value={regHorsePlate}
                      onChange={e => setRegHorsePlate(formatPlate(e.target.value))}
                      placeholder="ABC-1234 ou ABC1D23"
                      maxLength={8}
                      className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950/80 border border-slate-700/80 text-white text-xs font-mono uppercase placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-transparent transition-all"
                    />
                  </div>

                  {/* Tipo de Veículo e Carroceria */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1">
                        Tipo de Veículo <span className="text-red-400">*</span>
                      </label>
                      <select
                        required
                        disabled={isLoading}
                        value={regVehicleSetType}
                        onChange={e => setRegVehicleSetType(e.target.value as VehicleSetType)}
                        className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950/80 border border-slate-700/80 text-white text-xs focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-transparent transition-all"
                      >
                        <option value="" disabled className="bg-slate-900 text-slate-400">Selecione...</option>
                        {Object.values(VehicleSetType).map(t => (
                          <option key={t} value={t} className="bg-slate-900 text-white">{t}</option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1">
                        Carroceria <span className="text-red-400">*</span>
                      </label>
                      <select
                        required
                        disabled={isLoading}
                        value={regVehicleBodyType}
                        onChange={e => setRegVehicleBodyType(e.target.value as VehicleBodyType)}
                        className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950/80 border border-slate-700/80 text-white text-xs focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-transparent transition-all"
                      >
                        <option value="" disabled className="bg-slate-900 text-slate-400">Selecione...</option>
                        {Object.values(VehicleBodyType).map(b => (
                          <option key={b} value={b} className="bg-slate-900 text-white">{b}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {/* Carretas */}
                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">
                        Carreta 1 <span className="text-red-400">*</span>
                      </label>
                      <input
                        type="text"
                        required
                        disabled={isLoading}
                        value={regTrailer1Plate}
                        onChange={e => setRegTrailer1Plate(formatPlate(e.target.value))}
                        placeholder="Obrigatório"
                        maxLength={8}
                        className="w-full px-2.5 py-2 rounded-xl bg-slate-950/80 border border-slate-700/80 text-white text-xs font-mono uppercase placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-sky-500 transition-all"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">
                        Carreta 2
                      </label>
                      <input
                        type="text"
                        disabled={isLoading}
                        value={regTrailer2Plate}
                        onChange={e => setRegTrailer2Plate(formatPlate(e.target.value))}
                        placeholder="Opcional"
                        maxLength={8}
                        className="w-full px-2.5 py-2 rounded-xl bg-slate-950/80 border border-slate-700/80 text-white text-xs font-mono uppercase placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-sky-500 transition-all"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">
                        Carreta 3
                      </label>
                      <input
                        type="text"
                        disabled={isLoading}
                        value={regTrailer3Plate}
                        onChange={e => setRegTrailer3Plate(formatPlate(e.target.value))}
                        placeholder="Opcional"
                        maxLength={8}
                        className="w-full px-2.5 py-2 rounded-xl bg-slate-950/80 border border-slate-700/80 text-white text-xs font-mono uppercase placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-sky-500 transition-all"
                      />
                    </div>
                  </div>

                  {/* Senha e Confirmação */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-slate-800">
                    <div>
                      <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1">
                        Criar Senha <span className="text-red-400">*</span>
                      </label>
                      <div className="relative">
                        <input
                          type={showRegPassword ? 'text' : 'password'}
                          required
                          disabled={isLoading}
                          autoCapitalize="none"
                          autoCorrect="off"
                          spellCheck={false}
                          data-no-uppercase="true"
                          value={regPassword}
                          onChange={e => setRegPassword(e.target.value)}
                          placeholder="Mínimo 4 dígitos"
                          className="w-full px-3 py-2.5 pr-9 rounded-xl bg-slate-950/80 border border-slate-700/80 text-white text-xs placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-sky-500 transition-all normal-case"
                        />
                        <button
                          type="button"
                          onClick={() => setShowRegPassword(!showRegPassword)}
                          className="absolute right-2.5 top-3 text-slate-400 hover:text-slate-200"
                        >
                          {showRegPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                        </button>
                      </div>
                    </div>

                    <div>
                      <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1">
                        Confirmar Senha <span className="text-red-400">*</span>
                      </label>
                      <div className="relative">
                        <input
                          type={showRegConfirmPassword ? 'text' : 'password'}
                          required
                          disabled={isLoading}
                          autoCapitalize="none"
                          autoCorrect="off"
                          spellCheck={false}
                          data-no-uppercase="true"
                          value={regConfirmPassword}
                          onChange={e => setRegConfirmPassword(e.target.value)}
                          placeholder="Repita a senha"
                          className="w-full px-3 py-2.5 pr-9 rounded-xl bg-slate-950/80 border border-slate-700/80 text-white text-xs placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-sky-500 transition-all normal-case"
                        />
                        <button
                          type="button"
                          onClick={() => setShowRegConfirmPassword(!showRegConfirmPassword)}
                          className="absolute right-2.5 top-3 text-slate-400 hover:text-slate-200"
                        >
                          {showRegConfirmPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                        </button>
                      </div>
                    </div>
                  </div>

                  {error && (
                    <div className="p-3 rounded-xl bg-red-950/60 border border-red-800/80 text-center text-xs text-red-300 font-medium">
                      {error}
                    </div>
                  )}

                  {successMessage && (
                    <div className="p-3 rounded-xl bg-emerald-950/60 border border-emerald-800/80 flex items-center justify-center gap-2 text-xs text-emerald-300 font-semibold">
                      <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                      <span>{successMessage}</span>
                    </div>
                  )}

                  <div className="pt-2">
                    <button
                      type="submit"
                      disabled={isLoading}
                      className="w-full py-3.5 px-4 rounded-xl font-black text-sm text-white bg-gradient-to-r from-blue-600 via-primary to-sky-500 hover:from-blue-500 hover:to-sky-400 shadow-lg shadow-blue-900/40 hover:-translate-y-0.5 active:translate-y-0 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                    >
                      {isLoading ? (
                        <span>CADASTRANDO MOTORISTA...</span>
                      ) : (
                        <>
                          <UserPlus className="w-4 h-4" />
                          <span>CRIAR CONTA E ENTRAR</span>
                        </>
                      )}
                    </button>
                  </div>
                </form>
              ) : (
                /* ========================================================= */
                /* FORMULÁRIO PADRÃO DE LOGIN (INTERNO OU MOTORISTA)        */
                /* ========================================================= */
                <form className="space-y-4" onSubmit={handleSubmit}>
                  {loginType === 'interno' ? (
                    <>
                      {/* Campo E-mail / Usuário / CPF */}
                      <div>
                        <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">
                          Usuário, E-mail ou CPF
                        </label>
                        <div className="relative">
                          <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-500">
                            <Mail className="w-4 h-4" />
                          </div>
                          <input
                            id="email-address"
                            name="email"
                            type="text"
                            required
                            disabled={isLoading}
                            autoCapitalize="none"
                            autoCorrect="off"
                            spellCheck={false}
                            data-no-uppercase="true"
                            value={email}
                            onChange={e => setEmail(e.target.value)}
                            placeholder="seu.email@transcunhaoficial.com.br, usuário ou CPF"
                            className="w-full pl-10 pr-4 py-3 rounded-xl bg-slate-950/80 border border-slate-700/80 text-white text-sm placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all normal-case"
                          />
                        </div>
                      </div>

                      {/* Campo Senha */}
                      <div>
                        <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">
                          Senha
                        </label>
                        <div className="relative">
                          <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-500">
                            <Lock className="w-4 h-4" />
                          </div>
                          <input
                            id="password"
                            name="password"
                            type={showPassword ? 'text' : 'password'}
                            required
                            disabled={isLoading}
                            autoCapitalize="none"
                            autoCorrect="off"
                            spellCheck={false}
                            data-no-uppercase="true"
                            value={password}
                            onChange={e => setPassword(e.target.value)}
                            placeholder="Digite sua senha de acesso"
                            className="w-full pl-10 pr-10 py-3 rounded-xl bg-slate-950/80 border border-slate-700/80 text-white text-sm placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all normal-case"
                          />
                          <button
                            type="button"
                            onClick={() => setShowPassword(!showPassword)}
                            className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-slate-500 hover:text-slate-300"
                          >
                            {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                          </button>
                        </div>
                      </div>
                    </>
                  ) : (
                    <>
                      {/* Campo CPF Motorista */}
                      <div>
                        <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">
                          CPF do Motorista
                        </label>
                        <div className="relative">
                          <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-500">
                            <Truck className="w-4 h-4" />
                          </div>
                          <input
                            id="cpf-motorista"
                            name="cpf"
                            type="text"
                            required
                            disabled={isLoading}
                            value={cpf}
                            onChange={handleCpfChange}
                            maxLength={14}
                            placeholder="000.000.000-00"
                            className="w-full pl-10 pr-4 py-3 rounded-xl bg-slate-950/80 border border-slate-700/80 text-white text-sm font-mono placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-transparent transition-all"
                          />
                        </div>
                      </div>

                      {/* Campo Senha Motorista */}
                      <div>
                        <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">
                          Senha
                        </label>
                        <div className="relative">
                          <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-500">
                            <Lock className="w-4 h-4" />
                          </div>
                          <input
                            type={showPassword ? 'text' : 'password'}
                            name="driverPassword"
                            disabled={isLoading}
                            autoCapitalize="none"
                            autoCorrect="off"
                            spellCheck={false}
                            data-no-uppercase="true"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            placeholder="Senha (Opcional no 1º acesso)"
                            className="w-full pl-10 pr-10 py-3 rounded-xl bg-slate-950/80 border border-slate-700/80 text-white text-sm placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-transparent transition-all normal-case"
                          />
                          <button
                            type="button"
                            onClick={() => setShowPassword(!showPassword)}
                            className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-slate-500 hover:text-slate-300"
                          >
                            {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                          </button>
                        </div>
                      </div>

                      <p className="text-center text-xs text-slate-400">
                        Acesse o aplicativo utilizando seu CPF e Senha.
                      </p>

                      {/* Botão para criar conta de motorista */}
                      <button
                        type="button"
                        onClick={() => { setIsRegisteringDriver(true); setError(''); }}
                        className="w-full py-2.5 px-3 rounded-xl border border-dashed border-sky-500/50 bg-sky-500/5 hover:bg-sky-500/10 text-sky-400 font-bold text-xs flex items-center justify-center gap-1.5 transition-all"
                      >
                        <UserPlus className="w-4 h-4" />
                        <span>Não é cadastrado? Criar conta de motorista</span>
                      </button>
                    </>
                  )}

                  {error && (
                    <div className="p-3 rounded-xl bg-red-950/60 border border-red-800/80 text-center text-xs text-red-300 font-medium">
                      {error}
                    </div>
                  )}

                  {/* Botão de Login Principal */}
                  <div className="pt-2">
                    <button
                      type="submit"
                      disabled={isLoading}
                      className="w-full py-3.5 px-4 rounded-xl font-extrabold text-sm sm:text-base text-white bg-gradient-to-r from-blue-600 via-primary to-blue-700 hover:from-blue-500 hover:to-blue-600 shadow-lg shadow-blue-900/50 hover:-translate-y-0.5 active:translate-y-0 transition-all flex items-center justify-center gap-2 disabled:opacity-50 tracking-wide uppercase"
                    >
                      {isLoading ? (
                        <span>PROCESSANDO...</span>
                      ) : (
                        <>
                          <span>ENTRAR NO SISTEMA</span>
                          <span className="text-lg">→</span>
                        </>
                      )}
                    </button>
                  </div>
                </form>
              )}

              {/* Card Footer Links */}
              <div className="mt-6 pt-4 border-t border-slate-800/80 flex items-center justify-between gap-3 text-xs text-slate-400">
                <button
                  type="button"
                  onClick={() => alert("Para obter suporte ou recuperar credenciais corporativas, contate a administração pelo ramal interno ou envie um e-mail para suporte@transcunhaoficial.com.br.")}
                  className="hover:text-slate-200 transition-colors flex items-center gap-1.5"
                >
                  <HelpCircle className="w-3.5 h-3.5 text-slate-500" />
                  <span>Precisa de ajuda?</span>
                </button>

                <button
                  type="button"
                  onClick={handlePwaInstall}
                  className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-gradient-to-r from-sky-500/20 via-blue-600/20 to-indigo-600/25 hover:from-sky-500/30 hover:via-blue-600/30 hover:to-indigo-600/35 border border-sky-400/40 text-sky-300 hover:text-white font-bold text-xs transition-all shadow-md shadow-sky-950/60 group"
                  title="Baixar e instalar o aplicativo TransCunha"
                >
                  <Download className="w-3.5 h-3.5 text-sky-400 group-hover:translate-y-0.5 transition-transform" />
                  <span>Baixar App</span>
                  <span className="flex h-2 w-2 relative">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-sky-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-sky-400"></span>
                  </span>
                </button>
              </div>

            </div>
          </div>

          {/* ========================================================= */}
          {/* RIGHT HERO SECTION: TransCunha Presentation & Features    */}
          {/* ========================================================= */}
          <div className="lg:col-span-7 flex flex-col space-y-6 lg:space-y-8 text-left">
            
            {/* Tag Pill */}
            <div className="inline-flex items-center gap-2 self-start px-3 py-1.5 rounded-full bg-blue-950/60 border border-blue-500/30 text-sky-400 text-xs font-bold tracking-wide shadow-sm">
              <Sparkles className="w-3.5 h-3.5 text-sky-400" />
              <span>LOGÍSTICA INTELIGENTE & GESTÃO DE CARGAS</span>
            </div>

            {/* Main Headline */}
            <h1 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold text-white tracking-tight leading-[1.15]">
              Eficiência, controle e pontualidade{' '}
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-orange-400 via-sky-300 to-blue-400">
                na estrada.
              </span>
            </h1>

            {/* Description */}
            <p className="text-sm sm:text-base text-slate-400 leading-relaxed max-w-2xl">
              A plataforma definitiva para transportadores, embarcadores e motoristas. Acompanhe fretes, pedidos, emissões e rotas com transparência em tempo real.
            </p>

            {/* 2x2 Feature Cards Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 sm:gap-4 pt-2">
              
              {/* Card 1: Operações ao Vivo */}
              <div className="p-4 rounded-2xl bg-slate-900/60 border border-slate-800/80 hover:border-slate-700 transition-all flex items-start gap-3.5 backdrop-blur-md group hover:-translate-y-0.5 shadow-sm">
                <div className="w-10 h-10 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center shrink-0 group-hover:bg-blue-500/20 transition-colors">
                  <Activity className="w-5 h-5 text-sky-400" />
                </div>
                <div>
                  <h2 className="text-sm font-bold text-white mb-0.5">Operações ao Vivo</h2>
                  <p className="text-xs text-slate-400 leading-relaxed">Controle completo de status e carregamento em tempo real.</p>
                </div>
              </div>

              {/* Card 2: Segurança & ANTT */}
              <div className="p-4 rounded-2xl bg-slate-900/60 border border-slate-800/80 hover:border-slate-700 transition-all flex items-start gap-3.5 backdrop-blur-md group hover:-translate-y-0.5 shadow-sm">
                <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center shrink-0 group-hover:bg-amber-500/20 transition-colors">
                  <ShieldCheck className="w-5 h-5 text-amber-400" />
                </div>
                <div>
                  <h2 className="text-sm font-bold text-white mb-0.5">Segurança & ANTT</h2>
                  <p className="text-xs text-slate-400 leading-relaxed">Validação rigorosa de documentos e conformidade fiscal.</p>
                </div>
              </div>

              {/* Card 3: Cálculo de Estadias */}
              <div className="p-4 rounded-2xl bg-slate-900/60 border border-slate-800/80 hover:border-slate-700 transition-all flex items-start gap-3.5 backdrop-blur-md group hover:-translate-y-0.5 shadow-sm">
                <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center shrink-0 group-hover:bg-emerald-500/20 transition-colors">
                  <Clock className="w-5 h-5 text-emerald-400" />
                </div>
                <div>
                  <h2 className="text-sm font-bold text-white mb-0.5">Cálculo de Estadias</h2>
                  <p className="text-xs text-slate-400 leading-relaxed">Cálculos precisos da Lei 11.442 e relatórios transparentes.</p>
                </div>
              </div>

              {/* Card 4: App para Celular / Motoristas (Super Destacado) */}
              <div 
                onClick={handlePwaInstall}
                className="relative p-4 rounded-2xl bg-gradient-to-br from-indigo-950/80 via-slate-900/90 to-purple-950/60 border-2 border-indigo-500/50 hover:border-indigo-400 transition-all flex flex-col justify-between gap-3 backdrop-blur-md group hover:-translate-y-1 shadow-lg shadow-indigo-950/50 cursor-pointer overflow-hidden"
              >
                {/* Glow Effect */}
                <div className="absolute -top-10 -right-10 w-28 h-28 bg-indigo-500/20 rounded-full blur-2xl pointer-events-none group-hover:bg-indigo-500/30 transition-all"></div>

                <div className="flex items-start gap-3.5 relative z-10">
                  <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500/30 to-purple-500/30 border border-indigo-400/40 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform shadow-inner">
                    <Smartphone className="w-5 h-5 text-indigo-300" />
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center justify-between gap-2 mb-0.5">
                      <h2 className="text-sm font-extrabold text-white group-hover:text-indigo-200 transition-colors">App no Celular</h2>
                      <span className="px-2 py-0.5 rounded-full bg-gradient-to-r from-indigo-500/30 to-purple-500/30 border border-indigo-400/40 text-[10px] font-black tracking-wide text-indigo-200 uppercase">
                        Disponível
                      </span>
                    </div>
                    <p className="text-xs text-slate-300 leading-relaxed">
                      Instale o app oficial direto no seu celular para acompanhar fretes, status e canhotos.
                    </p>
                  </div>
                </div>

                {/* Direct Action Button Inside Card */}
                <div className="pt-1 flex items-center justify-between border-t border-indigo-500/20 text-xs relative z-10">
                  <span className="text-[11px] font-semibold text-indigo-300/80">Sem ocupar memória da loja</span>
                  <div className="inline-flex items-center gap-1.5 font-black text-xs text-indigo-300 group-hover:text-white group-hover:translate-x-0.5 transition-all">
                    <Download className="w-3.5 h-3.5 text-indigo-400" />
                    <span>Baixar App</span>
                    <ArrowRight className="w-3 h-3 text-indigo-400" />
                  </div>
                </div>
              </div>

            </div>

            {/* TransCunha Pillars / Lema */}
            <div className="pt-2 flex flex-wrap items-center gap-6 sm:gap-8 text-xs font-bold tracking-wider uppercase text-slate-400">
              <div className="flex items-center gap-2 text-slate-300">
                <div className="w-4 h-4 rounded-full bg-orange-500/20 border border-orange-500/40 flex items-center justify-center">
                  <Check className="w-2.5 h-2.5 text-orange-400" />
                </div>
                <span>Transparência</span>
              </div>
              <div className="flex items-center gap-2 text-slate-300">
                <div className="w-4 h-4 rounded-full bg-sky-500/20 border border-sky-500/40 flex items-center justify-center">
                  <Check className="w-2.5 h-2.5 text-sky-400" />
                </div>
                <span>Cuidado</span>
              </div>
              <div className="flex items-center gap-2 text-slate-300">
                <div className="w-4 h-4 rounded-full bg-blue-500/20 border border-blue-500/40 flex items-center justify-center">
                  <Check className="w-2.5 h-2.5 text-blue-400" />
                </div>
                <span>Prazo</span>
              </div>
            </div>

          </div>

        </div>

      </div>

      {/* ========================================================= */}
      {/* MODAL DE INSTRUÇÕES PARA BAIXAR O APP                    */}
      {/* ========================================================= */}
      {showAppInstallModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
          <div className="relative w-full max-w-lg bg-slate-900 border border-slate-700/80 rounded-3xl shadow-2xl overflow-hidden text-left text-white">
            
            {/* Modal Header */}
            <div className="p-5 sm:p-6 bg-gradient-to-r from-blue-900/60 via-indigo-900/40 to-slate-900 border-b border-slate-800 flex items-start justify-between gap-4">
              <div className="flex items-center gap-3.5">
                <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-sky-500 to-indigo-600 p-0.5 shadow-lg shadow-indigo-950/50 shrink-0 flex items-center justify-center">
                  <div className="w-full h-full bg-slate-950 rounded-[14px] flex items-center justify-center">
                    <Smartphone className="w-6 h-6 text-sky-400" />
                  </div>
                </div>
                <div>
                  <div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-indigo-500/20 text-indigo-300 text-[10px] font-black uppercase tracking-wider mb-1">
                    <Sparkles className="w-3 h-3 text-indigo-400" />
                    App Oficial
                  </div>
                  <h3 className="text-lg sm:text-xl font-black text-white leading-tight">
                    Baixar App TransCunha
                  </h3>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowAppInstallModal(false)}
                className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-5 sm:p-6 space-y-4 max-h-[70vh] overflow-y-auto">
              <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">
                Instale o aplicativo direto no seu celular ou computador para ter acesso instantâneo, com notificações e visual otimizado:
              </p>

              {/* Botão de instalação direta se disponível */}
              {deferredPrompt && (
                <button
                  type="button"
                  onClick={() => handlePwaInstall()}
                  className="w-full py-3 px-4 rounded-xl font-black text-sm text-white bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 shadow-lg shadow-emerald-950/50 flex items-center justify-center gap-2 transition-all active:scale-[0.99]"
                >
                  <Download className="w-4 h-4" />
                  <span>CLIQUE AQUI PARA INSTALAR AGORA</span>
                </button>
              )}

              {/* Guias por Plataforma */}
              <div className="space-y-3 pt-1">
                {/* Android */}
                <div className="p-3.5 rounded-2xl bg-slate-950/60 border border-slate-800 flex items-start gap-3">
                  <div className="w-8 h-8 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center shrink-0 mt-0.5">
                    <Smartphone className="w-4 h-4 text-emerald-400" />
                  </div>
                  <div className="flex-1 text-xs">
                    <div className="font-bold text-white text-sm mb-1 flex items-center gap-2">
                      <span>No Android (Chrome / Edge)</span>
                    </div>
                    <p className="text-slate-400 leading-relaxed">
                      Toque no menu <span className="font-bold text-slate-200">⋮ (3 pontinhos)</span> no topo do navegador e selecione <span className="text-emerald-300 font-bold">"Instalar aplicativo"</span> ou <span className="text-emerald-300 font-bold">"Adicionar à tela inicial"</span>.
                    </p>
                  </div>
                </div>

                {/* iPhone / iPad */}
                <div className="p-3.5 rounded-2xl bg-slate-950/60 border border-slate-800 flex items-start gap-3">
                  <div className="w-8 h-8 rounded-xl bg-sky-500/10 border border-sky-500/30 flex items-center justify-center shrink-0 mt-0.5">
                    <Share2 className="w-4 h-4 text-sky-400" />
                  </div>
                  <div className="flex-1 text-xs">
                    <div className="font-bold text-white text-sm mb-1 flex items-center gap-2">
                      <span>No iPhone / iPad (Safari)</span>
                    </div>
                    <p className="text-slate-400 leading-relaxed">
                      Toque no ícone de <span className="font-bold text-slate-200">Compartilhar</span> (quadrado com seta para cima) na barra inferior e escolha <span className="text-sky-300 font-bold">"Adicionar à Tela de Início"</span>.
                    </p>
                  </div>
                </div>

                {/* Computador */}
                <div className="p-3.5 rounded-2xl bg-slate-950/60 border border-slate-800 flex items-start gap-3">
                  <div className="w-8 h-8 rounded-xl bg-purple-500/10 border border-purple-500/30 flex items-center justify-center shrink-0 mt-0.5">
                    <Monitor className="w-4 h-4 text-purple-400" />
                  </div>
                  <div className="flex-1 text-xs">
                    <div className="font-bold text-white text-sm mb-1 flex items-center gap-2">
                      <span>No Computador (Chrome / Edge)</span>
                    </div>
                    <p className="text-slate-400 leading-relaxed">
                      Clique no ícone de <span className="text-purple-300 font-bold">instalar aplicativo ⊕</span> localizado no canto direito da barra de endereço do navegador.
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="p-4 bg-slate-950/80 border-t border-slate-800 flex items-center justify-end">
              <button
                type="button"
                onClick={() => setShowAppInstallModal(false)}
                className="px-5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs transition-colors"
              >
                Entendi
              </button>
            </div>

          </div>
        </div>
      )}

      {/* Footer Bottom Bar */}
      <div className="relative z-10 w-full border-t border-slate-800/80 bg-[#060a14]/90 py-4 px-6 text-[11px] text-slate-500 flex flex-col sm:flex-row items-center justify-between gap-2 max-w-7xl mx-auto">
        <div>
          © 2026 TRANSCUNHA Logística. Todos os direitos reservados.
        </div>
        <div className="font-mono text-slate-400">
          v2.5 • Alta Performance
        </div>
      </div>
    </div>
  );
};

export default LoginPage;
