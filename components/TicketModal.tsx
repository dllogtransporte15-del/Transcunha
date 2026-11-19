import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { 
  Trash2, Package, Truck, ExternalLink, Paperclip, Eye, Download, Upload, X, 
  FileText, Loader2, Mic, Square, Play, Pause, Grid, List, Search, Filter, 
  Clock, CheckCircle2, AlertCircle, Headphones, Volume2, RotateCcw, User as UserIcon, 
  Calendar, MessageSquare, ChevronDown, ChevronUp, Sparkles, AlertTriangle, Image as ImageIcon,
  MessageCircle
} from 'lucide-react';
import type { Ticket, User, TicketHistory, Cargo, Shipment, TicketAttachment } from '../types';
import { TicketStatus, TicketPriority, UserProfile } from '../types';
import { isDemoUser, isDeveloperUser, filterVisibleUsers } from '../auth';
import { useToast } from '../hooks/useToast';
import SearchableSelect, { SearchableOption } from './SearchableSelect';
import { autoFormatInput } from '../utils/formatters';
import { supabase } from '../supabase';
import { DocumentPreviewModal } from './DocumentPreviewModal';

const readFileAsDataUrl = (fileOrBlob: File | Blob): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = (err) => reject(err);
    reader.readAsDataURL(fileOrBlob);
  });
};

const formatSeconds = (sec: number): string => {
  if (!sec || isNaN(sec) || !isFinite(sec) || sec < 0) return '00:00';
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
};

const extractWhatsAppPhone = (text: string): { phoneUrl: string; formatted: string } | null => {
  if (!text) return null;
  const match = text.match(/(?:\+?55\s*)?(?:\(?([1-9]{2})\)?\s*)(?:9\s*)?(\d{4})[-\s]?(\d{4})/);
  if (!match) return null;
  const clean = match[0].replace(/\D/g, '');
  if (clean.length < 10) return null;
  const phoneUrl = clean.startsWith('55') ? clean : `55${clean}`;
  return {
    phoneUrl,
    formatted: match[0].trim()
  };
};

const formatTimeAgo = (dateStr: string): string => {
  try {
    const diffMs = Date.now() - new Date(dateStr).getTime();
    const diffMin = Math.floor(diffMs / (1000 * 60));
    if (diffMin < 1) return 'agora';
    if (diffMin < 60) return `há ${diffMin}m`;
    const diffHours = Math.floor(diffMin / 60);
    if (diffHours < 24) return `há ${diffHours}h`;
    const diffDays = Math.floor(diffHours / 24);
    if (diffDays < 7) return `há ${diffDays}d`;
    return new Date(dateStr).toLocaleDateString('pt-BR');
  } catch {
    return dateStr;
  }
};

const getTicketAttachments = (ticket: Ticket): TicketAttachment[] => {
  if (ticket.attachments && ticket.attachments.length > 0) {
    return ticket.attachments;
  }
  if (ticket.attachmentUrl) {
    return [{ url: ticket.attachmentUrl, name: ticket.attachmentName || 'Anexo' }];
  }
  return [];
};

/**
 * Player de Áudio Elegante para reprodução de mensagens de voz nos chamados
 */
const TicketAudioPlayer: React.FC<{ url: string; durationSeconds?: number; title?: string }> = ({ url, durationSeconds, title }) => {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState<number>(() => {
    return (durationSeconds && Number.isFinite(durationSeconds) && durationSeconds > 0) ? durationSeconds : 0;
  });
  const [playbackRate, setPlaybackRate] = useState(1);

  const togglePlay = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!audioRef.current) return;
    if (isPlaying) {
      audioRef.current.pause();
    } else {
      audioRef.current.play().catch(err => console.warn('Audio play error:', err));
    }
  };

  const cyclePlaybackRate = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!audioRef.current) return;
    const nextRate = playbackRate === 1 ? 1.5 : (playbackRate === 1.5 ? 2 : 1);
    setPlaybackRate(nextRate);
    audioRef.current.playbackRate = nextRate;
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    e.stopPropagation();
    const newTime = Number(e.target.value);
    setCurrentTime(newTime);
    if (audioRef.current) {
      audioRef.current.currentTime = newTime;
    }
  };

  const handleLoadedMetadata = () => {
    if (!audioRef.current) return;
    const d = audioRef.current.duration;
    if (Number.isFinite(d) && d > 0) {
      setDuration(d);
    } else if (durationSeconds && Number.isFinite(durationSeconds) && durationSeconds > 0) {
      setDuration(durationSeconds);
    } else if (d === Infinity) {
      // Seek temporário para o final forçar o browser a calcular a duração real de WebM
      audioRef.current.currentTime = 1e101;
      audioRef.current.ontimeupdate = () => {
        if (audioRef.current) {
          audioRef.current.ontimeupdate = () => {
            if (audioRef.current) setCurrentTime(audioRef.current.currentTime);
          };
          const realD = audioRef.current.duration;
          if (Number.isFinite(realD) && realD > 0) {
            setDuration(realD);
          }
          audioRef.current.currentTime = 0;
        }
      };
    }
  };

  const displayDuration = Number.isFinite(duration) && duration > 0 
    ? duration 
    : (durationSeconds && Number.isFinite(durationSeconds) && durationSeconds > 0 ? durationSeconds : 0);

  const sliderMax = displayDuration > 0 ? displayDuration : (currentTime > 0 ? currentTime + 1 : 100);

  return (
    <div 
      className="flex items-center gap-3 px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200/80 dark:border-slate-800 shadow-2xs transition-all" 
      onClick={e => e.stopPropagation()}
    >
      <audio
        ref={audioRef}
        src={url}
        preload="metadata"
        onTimeUpdate={() => {
          if (audioRef.current) {
            const cur = audioRef.current.currentTime;
            setCurrentTime(cur);
            if (!Number.isFinite(duration) || duration <= 0) {
              const d = audioRef.current.duration;
              if (Number.isFinite(d) && d > 0) setDuration(d);
              else if (cur > 0) setDuration(Math.max(duration || 0, cur));
            }
          }
        }}
        onLoadedMetadata={handleLoadedMetadata}
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
        onEnded={() => {
          setIsPlaying(false);
          setCurrentTime(0);
        }}
      />
      <button
        type="button"
        onClick={togglePlay}
        className="w-8 h-8 rounded-full bg-indigo-600 hover:bg-indigo-700 text-white flex items-center justify-center shrink-0 shadow-sm transition-transform active:scale-95 cursor-pointer"
        title={isPlaying ? "Pausar áudio" : "Ouvir áudio explicativo"}
      >
        {isPlaying ? <Pause className="w-4 h-4 fill-current" /> : <Play className="w-4 h-4 ml-0.5 fill-current" />}
      </button>

      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between text-[11px] mb-1">
          <span className="flex items-center gap-1.5 font-bold text-slate-800 dark:text-slate-200 truncate">
            <Mic className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
            <span className="truncate">{title || 'Áudio Explicativo'}</span>
          </span>
          <span className="font-mono text-[10px] font-semibold text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded shrink-0 ml-2">
            {formatSeconds(currentTime)} / {displayDuration > 0 ? formatSeconds(displayDuration) : '--:--'}
          </span>
        </div>
        <input
          type="range"
          min={0}
          max={sliderMax}
          step={0.1}
          value={currentTime}
          onChange={handleSeek}
          className="w-full h-1.5 bg-slate-200 dark:bg-slate-700 rounded-lg appearance-none cursor-pointer accent-indigo-600"
        />
      </div>

      <button
        type="button"
        onClick={cyclePlaybackRate}
        className="px-2 py-1 text-[10px] font-bold rounded-lg bg-white dark:bg-slate-800 text-indigo-600 dark:text-indigo-400 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700/60 shrink-0 transition-colors shadow-2xs cursor-pointer"
        title="Alterar velocidade de reprodução"
      >
        {playbackRate}x
      </button>
    </div>
  );
};

interface TicketModalProps {
  isOpen: boolean;
  onClose: () => void;
  tickets: Ticket[];
  users: User[];
  currentUser: User;
  onSave: (ticket: Omit<Ticket, 'id' | 'history' | 'createdAt' | 'createdById'>) => void;
  onUpdate: (ticketId: string, newStatus: TicketStatus, comment: string) => void;
  onDelete: (ticketId: string) => void;
  cargos?: Cargo[];
  shipments?: Shipment[];
  onNavigateTo?: (type: 'cargo' | 'shipment', id?: string) => void;
  initialCreate?: boolean;
}

type MainFilterType = 'meus' | 'abertos' | 'resolvidos' | 'fechados' | 'todos';
type SubFilterType = 'todos' | 'a_atender' | 'em_atendimento';
type ViewMode = 'list' | 'grid';

const TicketModal: React.FC<TicketModalProps> = ({ 
  isOpen, 
  onClose, 
  tickets, 
  users: rawUsers, 
  currentUser, 
  onSave, 
  onUpdate, 
  onDelete, 
  cargos = [], 
  shipments = [], 
  onNavigateTo, 
  initialCreate = false 
}) => {
  const isDemo = isDemoUser(currentUser);
  const users = useMemo(() => filterVisibleUsers(rawUsers, currentUser), [rawUsers, currentUser]);
  const { showToast } = useToast();
  const [isCreating, setIsCreating] = useState(false);
  const [filter, setFilter] = useState<MainFilterType>('abertos');
  const [subFilter, setSubFilter] = useState<SubFilterType>('todos');
  
  // Visualização Grid vs Lista
  const [viewMode, setViewMode] = useState<ViewMode>(() => {
    return (localStorage.getItem('transcunha_ticket_view_mode') as ViewMode) || 'list';
  });

  const handleSetViewMode = (mode: ViewMode) => {
    setViewMode(mode);
    localStorage.setItem('transcunha_ticket_view_mode', mode);
  };

  // Filtros Avançados
  const [searchQuery, setSearchQuery] = useState('');
  const [priorityFilter, setPriorityFilter] = useState<string>('all');
  const [assignedFilter, setAssignedFilter] = useState<string>('all');
  const [onlyWithAttachment, setOnlyWithAttachment] = useState(false);
  const [onlyWithAudio, setOnlyWithAudio] = useState(false);

  // Formulário de Novo Chamado
  const [newTicket, setNewTicket] = useState({
    title: '',
    description: '',
    status: TicketStatus.Aberto,
    priority: TicketPriority.Media,
    assignedToId: currentUser.id,
    cargoId: '',
    shipmentId: '',
  });

  // Anexo de Múltiplos Arquivos e Fotos
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [previewFile, setPreviewFile] = useState<{ url: string; name: string } | null>(null);

  // Gravador de Áudio
  const [isRecording, setIsRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [recordedAudioBlob, setRecordedAudioBlob] = useState<Blob | null>(null);
  const [recordedAudioUrl, setRecordedAudioUrl] = useState<string | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recordingTimerRef = useRef<any>(null);

  // Atendimento e Expansão
  const [attendingTicketId, setAttendingTicketId] = useState<string | null>(null);
  const [expandedTicketId, setExpandedTicketId] = useState<string | null>(null);
  const [observation, setObservation] = useState('');

  // Sincronização e Realtime Hub Listener
  const [realtimePulse, setRealtimePulse] = useState(false);

  useEffect(() => {
    if (!isOpen) return;

    const handleTicketChanged = () => {
      setRealtimePulse(true);
      const timer = setTimeout(() => setRealtimePulse(false), 2000);
      return () => clearTimeout(timer);
    };

    window.addEventListener('transcunha:ticket_changed', handleTicketChanged);
    return () => {
      window.removeEventListener('transcunha:ticket_changed', handleTicketChanged);
    };
  }, [isOpen]);

  useEffect(() => {
    if (isOpen) {
      if (initialCreate) {
        setIsCreating(true);
        resetCreateForm();
      } else {
        setIsCreating(false);
      }
    }
  }, [isOpen, initialCreate]);

  // Limpeza de recursos de áudio ao fechar
  useEffect(() => {
    return () => {
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        mediaRecorderRef.current.stop();
      }
      if (recordingTimerRef.current) {
        clearInterval(recordingTimerRef.current);
      }
      if (recordedAudioUrl) {
        URL.revokeObjectURL(recordedAudioUrl);
      }
    };
  }, [recordedAudioUrl]);

  const resetCreateForm = () => {
    setNewTicket({
      title: '',
      description: '',
      status: TicketStatus.Aberto,
      priority: TicketPriority.Media,
      assignedToId: currentUser.id,
      cargoId: '',
      shipmentId: '',
    });
    setSelectedFiles([]);
    if (fileInputRef.current) fileInputRef.current.value = '';
    if (recordedAudioUrl) {
      URL.revokeObjectURL(recordedAudioUrl);
    }
    setRecordedAudioBlob(null);
    setRecordedAudioUrl(null);
    setIsRecording(false);
    setRecordingSeconds(0);
    if (recordingTimerRef.current) {
      clearInterval(recordingTimerRef.current);
    }
  };

  const startAudioRecording = async () => {
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        showToast('Seu navegador não suporta gravação de áudio.', 'warning');
        return;
      }

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioChunksRef.current = [];
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          audioChunksRef.current.push(e.data);
        }
      };

      mediaRecorder.onstop = () => {
        const mime = mediaRecorder.mimeType || 'audio/webm';
        const blob = new Blob(audioChunksRef.current, { type: mime });
        const url = URL.createObjectURL(blob);
        setRecordedAudioBlob(blob);
        setRecordedAudioUrl(url);
        stream.getTracks().forEach(track => track.stop());
      };

      mediaRecorder.start(200);
      setIsRecording(true);
      setRecordingSeconds(0);

      recordingTimerRef.current = setInterval(() => {
        setRecordingSeconds(prev => {
          if (prev >= 300) { // Limite máximo de 5 minutos
            stopAudioRecording();
            showToast('Limite máximo de 5 minutos de áudio atingido.', 'info');
            return prev;
          }
          return prev + 1;
        });
      }, 1000);
    } catch (err: any) {
      console.error('Erro ao acessar microfone:', err);
      showToast('Não foi possível acessar o microfone. Verifique as permissões de áudio do seu navegador.', 'warning');
    }
  };

  const stopAudioRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
    if (recordingTimerRef.current) {
      clearInterval(recordingTimerRef.current);
      recordingTimerRef.current = null;
    }
    setIsRecording(false);
  };

  const discardAudioRecording = () => {
    stopAudioRecording();
    if (recordedAudioUrl) {
      URL.revokeObjectURL(recordedAudioUrl);
    }
    setRecordedAudioBlob(null);
    setRecordedAudioUrl(null);
    setRecordingSeconds(0);
  };

  const toggleExpand = (ticketId: string) => {
    if (expandedTicketId === ticketId) {
      setExpandedTicketId(null);
      setAttendingTicketId(null);
    } else {
      setExpandedTicketId(ticketId);
    }
  };

  const priorityColors: Record<TicketPriority, string> = {
    [TicketPriority.Baixa]: 'bg-gray-400',
    [TicketPriority.Media]: 'bg-blue-400',
    [TicketPriority.Alta]: 'bg-amber-500',
    [TicketPriority.Urgente]: 'bg-rose-600',
  };

  const priorityPillClasses: Record<TicketPriority, string> = {
    [TicketPriority.Baixa]: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300 border-gray-300 dark:border-gray-700',
    [TicketPriority.Media]: 'bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300 border-blue-200 dark:border-blue-800/40',
    [TicketPriority.Alta]: 'bg-amber-50 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300 border-amber-200 dark:border-amber-800/40',
    [TicketPriority.Urgente]: 'bg-rose-50 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300 border-rose-200 dark:border-rose-800/40 font-bold',
  };

  const statusColors: Record<TicketStatus, string> = {
    [TicketStatus.Aberto]: 'text-amber-600 dark:text-amber-400',
    [TicketStatus.EmAndamento]: 'text-blue-600 dark:text-blue-400 font-bold',
    [TicketStatus.Resolvido]: 'text-emerald-600 dark:text-emerald-400',
    [TicketStatus.Fechado]: 'text-gray-500 dark:text-gray-400 line-through',
  };

  const statusBadgeClasses: Record<TicketStatus, string> = {
    [TicketStatus.Aberto]: 'bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300 border-amber-200 dark:border-amber-800/50',
    [TicketStatus.EmAndamento]: 'bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300 border-blue-200 dark:border-blue-800/50 font-bold',
    [TicketStatus.Resolvido]: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800/50',
    [TicketStatus.Fechado]: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400 border-gray-300 dark:border-gray-700',
  };

  const cargoOptions: SearchableOption[] = useMemo(() => {
    return cargos.filter(c => c.status !== 'Fechada').map(c => ({
      value: c.id,
      label: `Carga #${c.sequenceId} (${c.origin} - ${c.destination})`,
      filterText: `${c.id} ${c.sequenceId} ${c.origin} ${c.destination}`
    }));
  }, [cargos]);

  const shipmentOptions: SearchableOption[] = useMemo(() => {
    return shipments.filter(s => s.status !== 'Finalizado' && s.status !== 'Cancelado').map(s => ({
      value: s.id,
      label: `${s.id} (${s.horsePlate || 'Sem Placa'} - ${s.driverName || 'Sem Motorista'})`,
      filterText: `${s.id} ${s.horsePlate || ''} ${s.driverName || ''}`
    }));
  }, [shipments]);

  const getUserName = (userId: string) => users.find(u => u.id === userId)?.name || 'N/A';
  const formatDate = (dateString: string) => new Date(dateString).toLocaleDateString('pt-BR');

  // Contadores Globais
  const openTickets = useMemo(() => tickets.filter(t => t.status !== TicketStatus.Fechado && t.status !== TicketStatus.Resolvido), [tickets]);
  const aAtenderCount = useMemo(() => openTickets.filter(t => t.status === TicketStatus.Aberto).length, [openTickets]);
  const emAtendimentoCount = useMemo(() => openTickets.filter(t => t.status === TicketStatus.EmAndamento).length, [openTickets]);

  const myTicketsCount = useMemo(() => {
    return tickets.filter(t => (t.assignedToId === currentUser.id || t.createdById === currentUser.id) && t.status !== TicketStatus.Fechado && t.status !== TicketStatus.Resolvido).length;
  }, [tickets, currentUser.id]);

  const resolvedCount = useMemo(() => tickets.filter(t => t.status === TicketStatus.Resolvido).length, [tickets]);
  const closedCount = useMemo(() => tickets.filter(t => t.status === TicketStatus.Fechado).length, [tickets]);

  // Filtragem Principal e Subfiltros
  const filteredTickets = useMemo(() => {
    let list = [...tickets].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    // 1. Aba principal
    switch (filter) {
      case 'meus':
        list = list.filter(t => (t.assignedToId === currentUser.id || t.createdById === currentUser.id) && t.status !== TicketStatus.Fechado && t.status !== TicketStatus.Resolvido);
        break;
      case 'abertos':
        list = list.filter(t => t.status !== TicketStatus.Fechado && t.status !== TicketStatus.Resolvido);
        // Subfiltro dentro de Abertos: A Atender vs Em Atendimento
        if (subFilter === 'a_atender') {
          list = list.filter(t => t.status === TicketStatus.Aberto);
        } else if (subFilter === 'em_atendimento') {
          list = list.filter(t => t.status === TicketStatus.EmAndamento);
        }
        break;
      case 'resolvidos':
        list = list.filter(t => t.status === TicketStatus.Resolvido);
        break;
      case 'fechados':
        list = list.filter(t => t.status === TicketStatus.Fechado);
        break;
      case 'todos':
      default:
        break;
    }

    // 2. Filtro de Busca Textual
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter(t => {
        const titleMatch = t.title.toLowerCase().includes(q);
        const descMatch = t.description.toLowerCase().includes(q);
        const idMatch = t.id.toLowerCase().includes(q);
        const authorMatch = getUserName(t.createdById).toLowerCase().includes(q);
        const assignedMatch = getUserName(t.assignedToId).toLowerCase().includes(q);
        return titleMatch || descMatch || idMatch || authorMatch || assignedMatch;
      });
    }

    // 3. Filtro de Prioridade
    if (priorityFilter !== 'all') {
      list = list.filter(t => t.priority === priorityFilter);
    }

    // 4. Filtro de Responsável
    if (assignedFilter !== 'all') {
      list = list.filter(t => t.assignedToId === assignedFilter);
    }

    // 5. Filtros rápidos
    if (onlyWithAttachment) {
      list = list.filter(t => Boolean(t.attachmentUrl || (t.attachments && t.attachments.length > 0)));
    }

    if (onlyWithAudio) {
      list = list.filter(t => Boolean(t.audioUrl));
    }

    return list;
  }, [
    tickets, filter, subFilter, searchQuery, priorityFilter, assignedFilter, 
    onlyWithAttachment, onlyWithAudio, currentUser.id, users
  ]);

  const hasActiveFilters = searchQuery.trim() !== '' || priorityFilter !== 'all' || assignedFilter !== 'all' || onlyWithAttachment || onlyWithAudio;

  const clearFilters = () => {
    setSearchQuery('');
    setPriorityFilter('all');
    setAssignedFilter('all');
    setOnlyWithAttachment(false);
    setOnlyWithAudio(false);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    const formattedValue = autoFormatInput(name, value);
    setNewTicket(prev => ({ ...prev, [name]: formattedValue }));
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    const validFiles: File[] = [];
    let oversizedCount = 0;

    files.forEach(file => {
      if (file.size > 25 * 1024 * 1024) {
        oversizedCount++;
      } else {
        validFiles.push(file);
      }
    });

    if (oversizedCount > 0) {
      showToast(`${oversizedCount} arquivo(s) ultrapassam o limite de 25MB e foram desconsiderados.`, 'warning');
    }

    if (validFiles.length > 0) {
      setSelectedFiles(prev => {
        const existingKeys = new Set(prev.map(f => `${f.name}_${f.size}_${f.lastModified}`));
        const newUnique = validFiles.filter(f => !existingKeys.has(`${f.name}_${f.size}_${f.lastModified}`));
        if (newUnique.length < validFiles.length) {
          showToast('Arquivos já selecionados foram ignorados para evitar duplicidade.', 'info');
        }
        return [...prev, ...newUnique];
      });
    }

    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleRemoveFile = (index: number) => {
    setSelectedFiles(prev => prev.filter((_, idx) => idx !== index));
  };

  const handleClearAllFiles = () => {
    setSelectedFiles([]);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleDownloadAttachment = async (url: string, filename: string) => {
    try {
      showToast('Iniciando download do arquivo...', 'info');
      if (url.startsWith('data:') || url.startsWith('blob:')) {
        const a = document.createElement('a');
        a.href = url;
        a.download = filename || 'anexo_chamado';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        return;
      }

      const res = await fetch(url);
      if (!res.ok) throw new Error('Falha ao baixar arquivo');
      const blob = await res.blob();
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = filename || 'anexo_chamado';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
      showToast('Download concluído com sucesso!', 'success');
    } catch (err) {
      console.warn('Direct fetch download failed, fallback to window.open:', err);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename || 'anexo_chamado';
      a.target = '_blank';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isDemo) return;

    let attachmentUrl: string | undefined = undefined;
    let attachmentName: string | undefined = undefined;
    const uploadedAttachments: TicketAttachment[] = [];
    let audioUrl: string | undefined = undefined;
    let audioDurationSeconds: number | undefined = recordingSeconds > 0 ? recordingSeconds : undefined;

    setIsUploading(true);

    try {
      // 1. Upload dos Arquivos e Fotos Anexados (se houver)
      if (selectedFiles.length > 0) {
        for (let i = 0; i < selectedFiles.length; i++) {
          const file = selectedFiles[i];
          try {
            const fileExt = file.name.split('.').pop() || 'bin';
            const cleanBaseName = file.name
              .replace(/\.[^/.]+$/, '')
              .replace(/[^a-zA-Z0-9_-]/g, '_');
            const filePath = `tickets/tck_${Date.now()}_${i}_${cleanBaseName}.${fileExt}`;

            const { error: uploadError } = await supabase.storage
              .from('shipment_attachments')
              .upload(filePath, file, { upsert: true });

            let finalUrl: string;
            if (uploadError) {
              console.warn(`[TicketModal] Storage upload error on file ${file.name}, using base64 fallback:`, uploadError);
              finalUrl = await readFileAsDataUrl(file);
            } else {
              const { data } = supabase.storage
                .from('shipment_attachments')
                .getPublicUrl(filePath);
              finalUrl = data.publicUrl;
            }

            uploadedAttachments.push({
              url: finalUrl,
              name: file.name,
              size: file.size,
              type: file.type || undefined,
            });
          } catch (err) {
            console.warn(`[TicketModal] Error uploading file ${file.name}, using base64 fallback:`, err);
            const fallbackUrl = await readFileAsDataUrl(file);
            uploadedAttachments.push({
              url: fallbackUrl,
              name: file.name,
              size: file.size,
              type: file.type || undefined,
            });
          }
        }

        if (uploadedAttachments.length > 0) {
          attachmentUrl = uploadedAttachments[0].url;
          attachmentName = uploadedAttachments[0].name;
        }
      }

      // 2. Upload do Áudio Gravado (se houver)
      if (recordedAudioBlob) {
        try {
          const audioFileName = `aud_${Date.now()}_${currentUser.id.replace(/\W/g, '')}.webm`;
          const audioPath = `tickets/audio/${audioFileName}`;

          const { error: audioUploadError } = await supabase.storage
            .from('shipment_attachments')
            .upload(audioPath, recordedAudioBlob, { 
              contentType: recordedAudioBlob.type || 'audio/webm',
              upsert: true 
            });

          if (audioUploadError) {
            console.warn('[TicketModal] Audio upload storage error, using base64 fallback:', audioUploadError);
            audioUrl = await readFileAsDataUrl(recordedAudioBlob);
          } else {
            const { data } = supabase.storage
              .from('shipment_attachments')
              .getPublicUrl(audioPath);
            audioUrl = data.publicUrl;
          }
        } catch (err) {
          console.warn('[TicketModal] Error uploading audio, using base64 fallback:', err);
          audioUrl = await readFileAsDataUrl(recordedAudioBlob);
        }
      }

      onSave({
        ...newTicket,
        cargoId: newTicket.cargoId || undefined,
        shipmentId: newTicket.shipmentId || undefined,
        attachmentUrl,
        attachmentName,
        attachments: uploadedAttachments.length > 0 ? uploadedAttachments : undefined,
        audioUrl,
        audioDurationSeconds,
      });

      resetCreateForm();
      setIsCreating(false);
    } catch (err: any) {
      console.error('[TicketModal] Error saving ticket:', err);
      showToast('Erro ao salvar chamado. Tente novamente.', 'error');
    } finally {
      setIsUploading(false);
    }
  };

  const handleCancelCreate = () => {
    setIsCreating(false);
    resetCreateForm();
  };

  const handleAttend = (ticketId: string) => {
    if (isDemo) return;
    setAttendingTicketId(ticketId);
    setObservation('');
    
    // Auto-update para "Em Andamento" se estiver "Aberto"
    const ticket = tickets.find(t => t.id === ticketId);
    if (ticket && ticket.status === TicketStatus.Aberto) {
      onUpdate(ticketId, TicketStatus.EmAndamento, `Atendimento iniciado por ${currentUser.name}.`);
    }
  };

  const handleCancelAttend = () => {
    setAttendingTicketId(null);
    setObservation('');
  };

  const handleUpdateStatus = (status: TicketStatus) => {
    if (isDemo) return;
    if (attendingTicketId) {
      if ((status === TicketStatus.Fechado || status === TicketStatus.Resolvido) && !observation.trim()) {
        showToast(`Por favor, adicione uma observação para ${status === TicketStatus.Fechado ? 'fechar' : 'resolver'} o chamado.`, 'warning');
        return;
      }
      onUpdate(attendingTicketId, status, observation.trim() || `Status alterado para ${status}.`);
      handleCancelAttend();
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-md z-50 flex justify-center items-center p-3 sm:p-5 transition-all duration-300">
      {/* Modal aumentado em ~20% com proporção ampla max-w-6xl w-full */}
      <div className="glass-panel rounded-2xl p-5 sm:p-6 max-w-6xl w-full max-h-[92vh] flex flex-col overflow-hidden animate-fade-in relative shadow-2xl border border-white/20 dark:border-gray-700/60">
        
        {/* Cabeçalho do Painel */}
        <div className="flex flex-wrap justify-between items-center mb-4 pb-3 border-b border-gray-200/50 dark:border-gray-700/50 gap-3">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-gradient-to-br from-primary/20 to-blue-500/10 text-primary border border-primary/20 shadow-xs">
              <Headphones className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-xl sm:text-2xl font-black bg-clip-text text-transparent bg-gradient-to-r from-primary to-accent dark:from-blue-400 dark:to-cyan-400 flex items-center gap-2">
                {isCreating ? 'Abrir Novo Chamado' : 'Painel de Chamados'}
              </h2>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Central de suporte, solicitações operacionais e comunicação direta
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Indicador de Realtime Ativo */}
            <div 
              className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-semibold transition-all duration-300 ${
                realtimePulse 
                  ? 'bg-emerald-500 text-white scale-105 shadow-md shadow-emerald-500/30' 
                  : 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800/60'
              }`}
              title="Sincronização instantânea via Supabase WebSocket"
            >
              <span className={`w-2 h-2 rounded-full ${realtimePulse ? 'bg-white' : 'bg-emerald-500 animate-pulse'}`} />
              <span className="hidden sm:inline">Tempo Real Ativo</span>
            </div>

            {/* Alternador de Modo de Visualização (Grid vs Lista) */}
            {!isCreating && (
              <div className="flex items-center bg-gray-100 dark:bg-gray-800 p-0.5 rounded-xl border border-gray-200 dark:border-gray-700">
                <button
                  type="button"
                  onClick={() => handleSetViewMode('list')}
                  className={`p-1.5 rounded-lg text-xs font-semibold flex items-center gap-1 transition-all ${
                    viewMode === 'list'
                      ? 'bg-white dark:bg-gray-700 text-primary shadow-xs'
                      : 'text-gray-500 hover:text-gray-900 dark:hover:text-white'
                  }`}
                  title="Visualização em Lista"
                >
                  <List className="w-4 h-4" />
                  <span className="hidden md:inline">Lista</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleSetViewMode('grid')}
                  className={`p-1.5 rounded-lg text-xs font-semibold flex items-center gap-1 transition-all ${
                    viewMode === 'grid'
                      ? 'bg-white dark:bg-gray-700 text-primary shadow-xs'
                      : 'text-gray-500 hover:text-gray-900 dark:hover:text-white'
                  }`}
                  title="Visualização em Grade / Cards"
                >
                  <Grid className="w-4 h-4" />
                  <span className="hidden md:inline">Grid</span>
                </button>
              </div>
            )}

            <button 
              onClick={onClose} 
              className="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-white"
              title="Fechar painel"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* MODO FORMULÁRIO: ABRIR NOVO CHAMADO */}
        {isCreating ? (
          <form onSubmit={handleSave} className="space-y-4 flex-1 overflow-y-auto pr-1">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="md:col-span-2">
                <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1">
                  Título do Chamado <span className="text-red-500">*</span>
                </label>
                <input 
                  name="title" 
                  value={newTicket.title} 
                  onChange={handleInputChange} 
                  placeholder="Ex: Ajuste de saldo / Solicitação de cancelamento" 
                  className="p-2.5 w-full border rounded-xl dark:bg-gray-800 dark:border-gray-700 dark:text-white text-sm focus:ring-2 focus:ring-primary/20 outline-none" 
                  required 
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1">
                  Nível de Urgência <span className="text-red-500">*</span>
                </label>
                <select 
                  name="priority" 
                  value={newTicket.priority} 
                  onChange={handleInputChange} 
                  className="p-2.5 w-full border rounded-xl dark:bg-gray-800 dark:border-gray-700 dark:text-white text-sm font-semibold focus:ring-2 focus:ring-primary/20 outline-none"
                >
                  {Object.values(TicketPriority).map(p => (
                    <option key={p} value={p}>{p}</option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1">
                Descrição Detalhada <span className="text-red-500">*</span>
              </label>
              <textarea 
                name="description" 
                value={newTicket.description} 
                onChange={handleInputChange} 
                placeholder="Descreva detalhadamente a situação, motivo ou dados necessários..." 
                className="p-3 w-full border rounded-xl dark:bg-gray-800 dark:border-gray-700 dark:text-white text-sm focus:ring-2 focus:ring-primary/20 outline-none" 
                rows={4} 
                required 
              />
            </div>

            {/* SEÇÃO DE GRAVAÇÃO DE ÁUDIO EXPLICATIVO */}
            <div className="p-4 rounded-xl border-2 border-dashed border-blue-200 dark:border-blue-800/80 bg-gradient-to-br from-blue-50/50 to-indigo-50/30 dark:from-blue-950/20 dark:to-indigo-950/20 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="p-1.5 rounded-lg bg-blue-600 text-white shadow-xs">
                    <Mic className="w-4 h-4" />
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-gray-900 dark:text-white">
                      Gravar Mensagem de Áudio Explicativa (Opcional)
                    </h4>
                    <p className="text-[11px] text-gray-500 dark:text-gray-400">
                      Grave sua voz explicando o chamado para que o responsável possa ouvir diretamente
                    </p>
                  </div>
                </div>

                {isRecording && (
                  <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-red-100 text-red-700 dark:bg-red-950/60 dark:text-red-400 font-mono text-xs font-bold animate-pulse">
                    <span className="w-2.5 h-2.5 rounded-full bg-red-600" />
                    Gravando: {formatSeconds(recordingSeconds)}
                  </span>
                )}
              </div>

              {/* Controles de Gravação de Áudio */}
              {!isRecording && !recordedAudioUrl && (
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={startAudioRecording}
                    className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs shadow-sm transition-all hover:shadow-md cursor-pointer active:scale-95"
                  >
                    <Mic className="w-4 h-4" />
                    Iniciar Gravação de Áudio
                  </button>
                  <span className="text-xs text-gray-400 italic">
                    Clique para autorizar o microfone e gravar até 5 minutos
                  </span>
                </div>
              )}

              {isRecording && (
                <div className="flex items-center gap-3 p-3 bg-red-50 dark:bg-red-950/40 rounded-xl border border-red-200 dark:border-red-900/60">
                  <div className="flex-1 flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full bg-red-600 animate-ping" />
                    <span className="text-xs font-semibold text-red-900 dark:text-red-200">
                      Capturando voz pelo microfone... Fale claramente.
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={stopAudioRecording}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-red-600 hover:bg-red-700 text-white font-bold text-xs shadow-sm cursor-pointer transition-all"
                  >
                    <Square className="w-3.5 h-3.5 fill-current" />
                    Parar e Concluir
                  </button>
                  <button
                    type="button"
                    onClick={discardAudioRecording}
                    className="px-3 py-2 text-xs font-medium text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white"
                  >
                    Cancelar
                  </button>
                </div>
              )}

              {/* Áudio Gravado Pronto para Envio */}
              {recordedAudioUrl && !isRecording && (
                <div className="space-y-2">
                  <TicketAudioPlayer 
                    url={recordedAudioUrl} 
                    durationSeconds={recordingSeconds} 
                    title="Prévia do Áudio Gravado" 
                  />
                  <div className="flex items-center justify-between text-xs px-1">
                    <span className="text-emerald-600 dark:text-emerald-400 font-semibold flex items-center gap-1">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      Áudio gravado com sucesso ({formatSeconds(recordingSeconds)})
                    </span>
                    <button
                      type="button"
                      onClick={discardAudioRecording}
                      className="text-red-500 hover:text-red-700 text-xs font-medium flex items-center gap-1 cursor-pointer"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      Descartar / Gravar Novamente
                    </button>
                  </div>
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1">
                  Direcionado para <span className="text-red-500">*</span>
                </label>
                <select 
                  name="assignedToId" 
                  value={newTicket.assignedToId} 
                  onChange={handleInputChange} 
                  className="p-2.5 w-full border rounded-xl dark:bg-gray-800 dark:border-gray-700 dark:text-white text-sm focus:ring-2 focus:ring-primary/20 outline-none"
                >
                  {users.map(u => (
                    <option key={u.id} value={u.id}>{u.name} ({u.profile})</option>
                  ))}
                </select>
              </div>

              <div>
                <SearchableSelect
                  label="Vincular a Carga (Opcional)"
                  options={cargoOptions}
                  value={newTicket.cargoId}
                  onChange={(val) => setNewTicket(prev => ({ ...prev, cargoId: val }))}
                  placeholder="-- Nenhuma --"
                />
              </div>

              <div>
                <SearchableSelect
                  label="Vincular a Embarque (Opcional)"
                  options={shipmentOptions}
                  value={newTicket.shipmentId}
                  onChange={(val) => setNewTicket(prev => ({ ...prev, shipmentId: val }))}
                  placeholder="-- Nenhum --"
                />
              </div>
            </div>

            {/* Campo de Anexo de Múltiplos Arquivos ou Fotos */}
            <div className="flex flex-col gap-2.5 p-3.5 rounded-xl border border-dashed border-gray-300 dark:border-gray-600 bg-gray-50/60 dark:bg-gray-800/40">
              <div className="flex items-center justify-between flex-wrap gap-1">
                <label className="text-xs font-semibold text-gray-700 dark:text-gray-300 flex items-center gap-1.5">
                  <Paperclip className="w-4 h-4 text-primary" />
                  Anexar Arquivos ou Fotos (Opcional)
                  {selectedFiles.length > 0 && (
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-100 text-blue-700 dark:bg-blue-900/60 dark:text-blue-300 border border-blue-200 dark:border-blue-800">
                      {selectedFiles.length} selecionado{selectedFiles.length > 1 ? 's' : ''}
                    </span>
                  )}
                </label>
                <span className="text-[11px] text-gray-400 font-normal">PDF, Imagens (PNG, JPG, WEBP) ou Docs (máx. 25MB por arquivo)</span>
              </div>

              <input
                ref={fileInputRef}
                type="file"
                id="ticket-file-input"
                onChange={handleFileChange}
                className="hidden"
                multiple
                accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.xml,.txt,.csv"
              />

              {selectedFiles.length > 0 ? (
                <div className="space-y-2">
                  <div className="space-y-2 max-h-52 overflow-y-auto pr-1">
                    {selectedFiles.map((file, idx) => {
                      const isImg = file.type.startsWith('image/');
                      return (
                        <div 
                          key={`${file.name}-${file.size}-${idx}`} 
                          className="flex items-center justify-between p-2.5 bg-white dark:bg-gray-700/80 rounded-lg border border-gray-200 dark:border-gray-600 shadow-xs hover:border-blue-300 dark:hover:border-blue-700 transition-colors"
                        >
                          <div className="flex items-center gap-2.5 overflow-hidden min-w-0">
                            <div className={`w-8 h-8 rounded-lg ${isImg ? 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-600 dark:text-emerald-400' : 'bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400'} flex items-center justify-center shrink-0`}>
                              {isImg ? <ImageIcon className="w-4 h-4" /> : <FileText className="w-4 h-4" />}
                            </div>
                            <div className="truncate min-w-0">
                              <p className="text-xs font-semibold text-gray-800 dark:text-gray-100 truncate" title={file.name}>
                                {file.name}
                              </p>
                              <p className="text-[10px] text-gray-500 dark:text-gray-400">
                                {(file.size / 1024 < 1024) 
                                  ? `${(file.size / 1024).toFixed(1)} KB` 
                                  : `${(file.size / (1024 * 1024)).toFixed(2)} MB`}
                                {isImg && <span className="ml-1 text-emerald-600 dark:text-emerald-400 font-medium">• Foto/Imagem</span>}
                              </p>
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => handleRemoveFile(idx)}
                            className="text-gray-400 hover:text-red-500 p-1.5 rounded-md hover:bg-red-50 dark:hover:bg-red-900/30 transition-colors cursor-pointer shrink-0 ml-2"
                            title="Remover este arquivo"
                          >
                            <X size={16} />
                          </button>
                        </div>
                      );
                    })}
                  </div>

                  <div className="flex items-center justify-between pt-1">
                    <label
                      htmlFor="ticket-file-input"
                      className="cursor-pointer inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-white dark:bg-gray-700 text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-700 hover:bg-blue-50 dark:hover:bg-blue-900/30 transition-colors shadow-xs"
                    >
                      <Upload className="w-3.5 h-3.5" />
                      + Adicionar Mais Arquivos / Fotos
                    </label>
                    <button
                      type="button"
                      onClick={handleClearAllFiles}
                      className="text-[11px] text-red-500 hover:text-red-600 dark:text-red-400 font-semibold hover:underline cursor-pointer"
                    >
                      Remover todos ({selectedFiles.length})
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-3">
                  <label
                    htmlFor="ticket-file-input"
                    className="cursor-pointer inline-flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-semibold bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-200 border border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-600 transition-colors shadow-xs"
                  >
                    <Upload className="w-3.5 h-3.5 text-primary" />
                    Escolher Arquivos ou Fotos
                  </label>
                  <span className="text-xs text-gray-400 italic">Nenhum arquivo selecionado</span>
                </div>
              )}
            </div>

            {/* Rodapé de Ações de Criação */}
            <div className="flex justify-end space-x-3 pt-4 border-t border-gray-100 dark:border-gray-800">
              <button 
                type="button" 
                onClick={handleCancelCreate} 
                disabled={isUploading} 
                className="py-2.5 px-5 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-xl hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors font-medium text-xs sm:text-sm"
              >
                Cancelar
              </button>
              <button 
                type="submit" 
                disabled={isUploading || isRecording} 
                className="py-2.5 px-6 btn-premium rounded-xl font-bold shadow-lg flex items-center gap-2 text-xs sm:text-sm disabled:opacity-50"
              >
                {isUploading && <Loader2 className="w-4 h-4 animate-spin" />}
                {isUploading ? (selectedFiles.length > 1 ? `Enviando chamado e ${selectedFiles.length} arquivos...` : 'Gravando e Enviando...') : 'Salvar e Abrir Chamado'}
              </button>
            </div>
          </form>
        ) : (
          /* MODO LISTA / GRID DE CHAMADOS */
          <div className="flex-1 flex flex-col overflow-hidden space-y-3">
            
            {/* LINHA 1: ABAS PRINCIPAIS E BOTÃO NOVO CHAMADO */}
            <div className="flex flex-wrap justify-between items-center gap-3">
              <div className="flex items-center space-x-1 border border-gray-200/50 dark:border-gray-700/50 bg-gray-50/50 dark:bg-gray-900/40 rounded-xl p-1 shadow-inner overflow-x-auto">
                <button 
                  onClick={() => setFilter('meus')} 
                  className={`px-3 py-1.5 text-xs rounded-lg font-semibold transition-all flex items-center gap-1.5 ${
                    filter === 'meus' 
                      ? 'bg-white dark:bg-gray-800 text-primary shadow-xs' 
                      : 'text-gray-500 hover:text-gray-800 dark:text-gray-400'
                  }`}
                >
                  <span>Meus</span>
                  <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-blue-100 dark:bg-blue-900/60 text-blue-700 dark:text-blue-300 font-bold">
                    {myTicketsCount}
                  </span>
                </button>

                <button 
                  onClick={() => {
                    setFilter('abertos');
                    setSubFilter('todos');
                  }} 
                  className={`px-3 py-1.5 text-xs rounded-lg font-semibold transition-all flex items-center gap-1.5 ${
                    filter === 'abertos' 
                      ? 'bg-white dark:bg-gray-800 text-primary shadow-xs' 
                      : 'text-gray-500 hover:text-gray-800 dark:text-gray-400'
                  }`}
                >
                  <span>Abertos</span>
                  <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-amber-100 dark:bg-amber-900/60 text-amber-800 dark:text-amber-300 font-bold">
                    {openTickets.length}
                  </span>
                </button>

                <button 
                  onClick={() => setFilter('resolvidos')} 
                  className={`px-3 py-1.5 text-xs rounded-lg font-semibold transition-all flex items-center gap-1.5 ${
                    filter === 'resolvidos' 
                      ? 'bg-white dark:bg-gray-800 text-primary shadow-xs' 
                      : 'text-gray-500 hover:text-gray-800 dark:text-gray-400'
                  }`}
                >
                  <span>Resolvidos</span>
                  <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-emerald-100 dark:bg-emerald-900/60 text-emerald-800 dark:text-emerald-300 font-bold">
                    {resolvedCount}
                  </span>
                </button>

                <button 
                  onClick={() => setFilter('fechados')} 
                  className={`px-3 py-1.5 text-xs rounded-lg font-semibold transition-all flex items-center gap-1.5 ${
                    filter === 'fechados' 
                      ? 'bg-white dark:bg-gray-800 text-primary shadow-xs' 
                      : 'text-gray-500 hover:text-gray-800 dark:text-gray-400'
                  }`}
                >
                  <span>Fechados</span>
                  <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 font-bold">
                    {closedCount}
                  </span>
                </button>

                <button 
                  onClick={() => setFilter('todos')} 
                  className={`px-3 py-1.5 text-xs rounded-lg font-semibold transition-all flex items-center gap-1.5 ${
                    filter === 'todos' 
                      ? 'bg-white dark:bg-gray-800 text-primary shadow-xs' 
                      : 'text-gray-500 hover:text-gray-800 dark:text-gray-400'
                  }`}
                >
                  <span>Todos</span>
                  <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 font-bold">
                    {tickets.length}
                  </span>
                </button>
              </div>

              {!isDemo && (
                <button 
                  onClick={() => setIsCreating(true)} 
                  className="py-2 px-4 text-xs sm:text-sm btn-premium rounded-xl font-bold flex items-center gap-1.5 shadow-md active:scale-95 cursor-pointer"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 4v16m8-8H4" />
                  </svg>
                  Novo Chamado
                </button>
              )}
            </div>

            {/* LINHA 2: SUB-SELEÇÃO "A ATENDER" E "EM ATENDIMENTO" DEBAIXO DA LINHA DAS ABAS */}
            {filter === 'abertos' && (
              <div className="flex flex-wrap items-center gap-2 p-1.5 bg-gradient-to-r from-gray-100/80 via-blue-50/40 to-gray-100/80 dark:from-gray-900/60 dark:via-blue-950/20 dark:to-gray-900/60 rounded-xl border border-gray-200/80 dark:border-gray-800 animate-in fade-in">
                <span className="text-[11px] font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400 px-2 flex items-center gap-1">
                  <Filter className="w-3 h-3 text-primary" />
                  Fase do Atendimento:
                </span>

                <button
                  onClick={() => setSubFilter('todos')}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all flex items-center gap-1.5 ${
                    subFilter === 'todos'
                      ? 'bg-white dark:bg-gray-800 text-primary shadow-xs font-bold border border-primary/20'
                      : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
                  }`}
                >
                  <span>Todos os Abertos</span>
                  <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 font-bold">
                    {openTickets.length}
                  </span>
                </button>

                <button
                  onClick={() => setSubFilter('a_atender')}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all flex items-center gap-1.5 ${
                    subFilter === 'a_atender'
                      ? 'bg-amber-500 text-white shadow-xs font-bold'
                      : 'text-amber-700 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-950/30'
                  }`}
                >
                  <Clock className="w-3.5 h-3.5" />
                  <span>Chamados a Atender</span>
                  <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-bold ${
                    subFilter === 'a_atender' 
                      ? 'bg-amber-600 text-white' 
                      : 'bg-amber-100 dark:bg-amber-900/60 text-amber-800 dark:text-amber-300'
                  }`}>
                    {aAtenderCount}
                  </span>
                </button>

                <button
                  onClick={() => setSubFilter('em_atendimento')}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all flex items-center gap-1.5 ${
                    subFilter === 'em_atendimento'
                      ? 'bg-blue-600 text-white shadow-xs font-bold'
                      : 'text-blue-700 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/30'
                  }`}
                >
                  <Headphones className="w-3.5 h-3.5" />
                  <span>Chamados em Atendimento</span>
                  <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-bold ${
                    subFilter === 'em_atendimento' 
                      ? 'bg-blue-700 text-white' 
                      : 'bg-blue-100 dark:bg-blue-900/60 text-blue-800 dark:text-blue-300'
                  }`}>
                    {emAtendimentoCount}
                  </span>
                </button>
              </div>
            )}

            {/* LINHA 3: BARRA DE FILTROS E PESQUISA REFINADA */}
            <div className="flex flex-wrap items-center gap-2 p-2.5 bg-gray-50/70 dark:bg-gray-900/30 rounded-xl border border-gray-200/50 dark:border-gray-800/60">
              {/* Campo de Busca Textual */}
              <div className="relative flex-1 min-w-[200px]">
                <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Buscar por título, descrição, autor, responsável ou #ID..."
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  className="w-full pl-9 pr-8 py-1.5 text-xs bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-gray-900 dark:text-white placeholder-gray-400 focus:ring-2 focus:ring-primary/20 outline-none"
                />
                {searchQuery && (
                  <button 
                    onClick={() => setSearchQuery('')}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              {/* Filtro por Prioridade */}
              <select
                value={priorityFilter}
                onChange={e => setPriorityFilter(e.target.value)}
                className="py-1.5 px-2.5 text-xs bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-gray-700 dark:text-gray-300 font-medium focus:ring-2 focus:ring-primary/20 outline-none"
              >
                <option value="all">Todas Prioridades</option>
                {Object.values(TicketPriority).map(p => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </select>

              {/* Filtro por Direcionado */}
              <select
                value={assignedFilter}
                onChange={e => setAssignedFilter(e.target.value)}
                className="py-1.5 px-2.5 text-xs bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-gray-700 dark:text-gray-300 font-medium focus:ring-2 focus:ring-primary/20 outline-none max-w-[170px] truncate"
              >
                <option value="all">Todos Responsáveis</option>
                {users.map(u => (
                  <option key={u.id} value={u.id}>{u.name}</option>
                ))}
              </select>

              {/* Filtros de Anexo e Áudio */}
              <button
                type="button"
                onClick={() => setOnlyWithAttachment(prev => !prev)}
                className={`px-2.5 py-1.5 text-xs font-semibold rounded-lg border transition-all flex items-center gap-1 ${
                  onlyWithAttachment 
                    ? 'bg-blue-50 border-blue-300 text-blue-700 dark:bg-blue-950/50 dark:border-blue-700 dark:text-blue-300' 
                    : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-50'
                }`}
                title="Filtrar chamados que possuem anexo de arquivo"
              >
                <Paperclip className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Com Anexo</span>
              </button>

              <button
                type="button"
                onClick={() => setOnlyWithAudio(prev => !prev)}
                className={`px-2.5 py-1.5 text-xs font-semibold rounded-lg border transition-all flex items-center gap-1 ${
                  onlyWithAudio 
                    ? 'bg-indigo-50 border-indigo-300 text-indigo-700 dark:bg-indigo-950/50 dark:border-indigo-700 dark:text-indigo-300' 
                    : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-50'
                }`}
                title="Filtrar chamados com mensagem de áudio"
              >
                <Mic className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Com Áudio</span>
              </button>

              {hasActiveFilters && (
                <button
                  type="button"
                  onClick={clearFilters}
                  className="px-2.5 py-1.5 text-xs font-semibold text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/30 rounded-lg transition-colors flex items-center gap-1"
                >
                  <RotateCcw className="w-3 h-3" />
                  Limpar
                </button>
              )}

              <span className="text-[11px] text-gray-400 dark:text-gray-500 font-medium ml-auto hidden lg:inline">
                {filteredTickets.length} de {tickets.length} chamados
              </span>
            </div>

            {/* LISTAGEM DOS CHAMADOS (MODO LISTA OU MODO GRID) */}
            <div className="flex-1 overflow-y-auto pr-1">
              {filteredTickets.length > 0 ? (
                viewMode === 'grid' ? (
                  /* MODO GRID (CARDS RESPONSIVOS) */
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5 p-1">
                    {filteredTickets.map(ticket => {
                      const isExpanded = expandedTicketId === ticket.id;
                      const isAttending = attendingTicketId === ticket.id;
                      const isOpenOrAttending = ticket.status === TicketStatus.Aberto || ticket.status === TicketStatus.EmAndamento;

                      return (
                        <div 
                          key={ticket.id} 
                          className={`p-4 rounded-xl border bg-white/80 dark:bg-gray-800/80 backdrop-blur-md shadow-xs hover:shadow-md transition-all flex flex-col justify-between gap-3 ${
                            ticket.status === TicketStatus.EmAndamento 
                              ? 'border-blue-400/80 dark:border-blue-600 bg-blue-50/20 dark:bg-blue-950/10 ring-1 ring-blue-400/20' 
                              : ticket.status === TicketStatus.Aberto 
                                ? 'border-amber-300 dark:border-amber-700/60' 
                                : 'border-gray-200 dark:border-gray-700/80'
                          }`}
                        >
                          <div>
                            {/* Card Header: Prioridade + ID + Status */}
                            <div className="flex items-center justify-between gap-2 mb-2">
                              <div className="flex items-center gap-1.5">
                                <span className="font-mono text-xs font-bold text-gray-500 dark:text-gray-400">
                                  #{ticket.id}
                                </span>
                                <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border ${priorityPillClasses[ticket.priority]}`}>
                                  <span className={`w-1.5 h-1.5 rounded-full ${priorityColors[ticket.priority]}`} />
                                  {ticket.priority}
                                </span>
                              </div>

                              <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold border ${statusBadgeClasses[ticket.status]}`}>
                                {ticket.status}
                              </span>
                            </div>

                            {/* Card Title */}
                            <h3 className={`text-sm font-bold line-clamp-2 mb-1.5 ${statusColors[ticket.status]}`} title={ticket.title}>
                              {ticket.title}
                            </h3>

                            {/* Card Description Snippet */}
                            <p className="text-xs text-gray-600 dark:text-gray-300 line-clamp-2 mb-2 leading-relaxed">
                              {ticket.description}
                            </p>

                            {/* Áudio Inline Preview se houver */}
                            {ticket.audioUrl && (
                              <div className="mb-2">
                                <TicketAudioPlayer 
                                  url={ticket.audioUrl} 
                                  durationSeconds={ticket.audioDurationSeconds} 
                                  title="Áudio do Chamado"
                                />
                              </div>
                            )}

                            {/* Badges de Anexos / Vínculos */}
                            <div className="flex flex-wrap items-center gap-1.5 mb-2">
                              {(() => {
                                const atts = getTicketAttachments(ticket);
                                if (atts.length === 0) return null;
                                return (
                                  <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-900/40 px-2 py-0.5 rounded-md border border-blue-200 dark:border-blue-800">
                                    <Paperclip className="w-3 h-3" /> {atts.length > 1 ? `${atts.length} Anexos` : 'Anexo'}
                                  </span>
                                );
                              })()}
                              {ticket.cargoId && (
                                <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/40 px-2 py-0.5 rounded-md border border-emerald-200 dark:border-emerald-800">
                                  <Package className="w-3 h-3" /> Carga
                                </span>
                              )}
                              {ticket.shipmentId && (
                                <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-purple-700 dark:text-purple-300 bg-purple-50 dark:bg-purple-950/40 px-2 py-0.5 rounded-md border border-purple-200 dark:border-purple-800">
                                  <Truck className="w-3 h-3" /> Embarque
                                </span>
                              )}
                            </div>
                          </div>

                          {/* Card Footer: Solicitante + Responsável + Ações */}
                          <div className="pt-2 border-t border-gray-100 dark:border-gray-700/60 flex flex-col gap-2">
                            <div className="flex items-center justify-between text-[11px] text-gray-500 dark:text-gray-400">
                              <span className="truncate" title={`Criado por ${getUserName(ticket.createdById)}`}>
                                De: <strong className="text-gray-700 dark:text-gray-200 font-semibold">{getUserName(ticket.createdById)}</strong>
                              </span>
                              <span className="shrink-0 font-mono text-[10px]">
                                {formatTimeAgo(ticket.createdAt)}
                              </span>
                            </div>

                            <div className="text-[11px] text-gray-500 dark:text-gray-400 truncate" title={`Direcionado para ${getUserName(ticket.assignedToId)}`}>
                              Para: <strong className="text-gray-700 dark:text-gray-200 font-semibold">{getUserName(ticket.assignedToId)}</strong>
                            </div>

                            {/* Botões de Ação do Card */}
                            <div className="flex items-center justify-between gap-1.5 pt-1">
                              {!isDemo && (currentUser.profile === UserProfile.Admin || isDeveloperUser(currentUser)) && (
                                <button
                                  type="button"
                                  onClick={() => onDelete(ticket.id)}
                                  className="text-gray-400 hover:text-red-500 p-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                                  title="Excluir chamado concluído"
                                >
                                  <Trash2 size={15} />
                                </button>
                              )}

                              <div className="flex items-center gap-1.5 ml-auto">
                                {!isDemo && isOpenOrAttending && ticket.status === TicketStatus.Aberto && (
                                  <button
                                    type="button"
                                    onClick={() => handleAttend(ticket.id)}
                                    className="px-2.5 py-1 text-xs font-bold bg-amber-500 hover:bg-amber-600 text-white rounded-lg shadow-xs transition-colors flex items-center gap-1"
                                  >
                                    <Headphones className="w-3 h-3" />
                                    Atender
                                  </button>
                                )}

                                <button
                                  type="button"
                                  onClick={() => toggleExpand(ticket.id)}
                                  className="px-2.5 py-1 text-xs font-semibold bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-200 rounded-lg transition-colors flex items-center gap-1"
                                >
                                  {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                                  {isExpanded ? 'Ocultar' : 'Detalhes'}
                                </button>
                              </div>
                            </div>

                            {/* Bloco Expandido dentro do Grid Card */}
                            {isExpanded && (
                              <div className="mt-2 pt-2 border-t border-gray-100 dark:border-gray-700 text-xs space-y-2 animate-fade-in">
                                {(() => {
                                  const atts = getTicketAttachments(ticket);
                                  if (atts.length === 0) return null;
                                  return (
                                    <div className="space-y-1.5">
                                      <div className="text-[11px] font-bold text-blue-800 dark:text-blue-300 flex items-center gap-1">
                                        <Paperclip className="w-3 h-3" />
                                        {atts.length > 1 ? `Anexos / Fotos (${atts.length})` : 'Anexo / Foto'}
                                      </div>
                                      {atts.map((att, i) => (
                                        <div key={`${att.url}-${i}`} className="flex items-center justify-between p-2 rounded-lg bg-blue-50/60 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800">
                                          <span className="font-semibold text-blue-900 dark:text-blue-300 truncate max-w-[150px]" title={att.name}>
                                            {att.name || `Anexo ${i + 1}`}
                                          </span>
                                          <div className="flex items-center gap-1 shrink-0">
                                            <button
                                              type="button"
                                              onClick={() => setPreviewFile({ url: att.url, name: att.name || 'Anexo' })}
                                              className="p-1 text-blue-600 hover:bg-blue-100 dark:hover:bg-blue-900/50 rounded"
                                              title="Visualizar"
                                            >
                                              <Eye size={14} />
                                            </button>
                                            <button
                                              type="button"
                                              onClick={() => handleDownloadAttachment(att.url, att.name || 'anexo')}
                                              className="p-1 text-blue-600 hover:bg-blue-100 dark:hover:bg-blue-900/50 rounded"
                                              title="Baixar"
                                            >
                                              <Download size={14} />
                                            </button>
                                          </div>
                                        </div>
                                      ))}
                                    </div>
                                  );
                                })()}

                                {/* Ações de Atendimento no Card */}
                                {attendingTicketId === ticket.id && (
                                  <div className="p-2.5 rounded-lg bg-gray-50 dark:bg-gray-900/60 border border-gray-200 dark:border-gray-700 space-y-2">
                                    <textarea
                                      value={observation}
                                      onChange={(e) => setObservation(e.target.value)}
                                      placeholder="Observação da resolução..."
                                      className="w-full p-2 text-xs border rounded dark:bg-gray-800 dark:border-gray-600"
                                      rows={2}
                                    />
                                    <div className="flex justify-end gap-1.5">
                                      <button onClick={handleCancelAttend} className="px-2 py-1 text-xs text-gray-600 dark:text-gray-300">
                                        Cancelar
                                      </button>
                                      <button onClick={() => handleUpdateStatus(TicketStatus.Resolvido)} className="px-2 py-1 text-xs font-bold bg-green-600 text-white rounded">
                                        Resolver
                                      </button>
                                      <button onClick={() => handleUpdateStatus(TicketStatus.Fechado)} className="px-2 py-1 text-xs font-bold bg-gray-800 text-white rounded">
                                        Fechar
                                      </button>
                                    </div>
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  /* MODO LISTA REFINADO */
                  <div className="space-y-3 p-1">
                    {filteredTickets.map(ticket => {
                      const isExpanded = expandedTicketId === ticket.id;
                      const isAttending = attendingTicketId === ticket.id;

                      return (
                        <div 
                          key={ticket.id} 
                          className={`p-4 bg-white/70 dark:bg-gray-800/70 backdrop-blur-md rounded-xl border transition-all duration-300 ${
                            isExpanded 
                              ? 'border-primary dark:border-primary shadow-lg border-l-4 border-l-primary' 
                              : ticket.status === TicketStatus.EmAndamento
                                ? 'border-blue-400 dark:border-blue-600 border-l-4 border-l-blue-500 bg-blue-50/15 dark:bg-blue-950/10'
                                : ticket.status === TicketStatus.Aberto
                                  ? 'border-amber-300 dark:border-amber-700/60 border-l-4 border-l-amber-400'
                                  : 'border-gray-200/60 dark:border-gray-700/60 hover:border-gray-300 dark:hover:border-gray-600 shadow-xs'
                          }`}
                        >
                          <div className="flex items-center justify-between cursor-pointer" onClick={() => toggleExpand(ticket.id)}>
                            <div className="flex items-center gap-3 overflow-hidden flex-1 pr-4">
                              <div className={`w-2.5 h-2.5 rounded-full shrink-0 ${priorityColors[ticket.priority]}`} title={`Prioridade: ${ticket.priority}`} />
                              
                              <div className="flex items-center gap-2 truncate">
                                <span className="font-mono text-xs font-bold text-gray-400 shrink-0">
                                  #{ticket.id}
                                </span>

                                <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold border shrink-0 ${statusBadgeClasses[ticket.status]}`}>
                                  {ticket.status}
                                </span>

                                <p className={`font-semibold text-sm truncate ${statusColors[ticket.status]}`}>
                                  {ticket.title}
                                </p>

                                {ticket.audioUrl && (
                                  <span className="inline-flex items-center gap-1 text-[10px] font-bold text-indigo-700 dark:text-indigo-300 bg-indigo-50 dark:bg-indigo-900/40 px-2 py-0.5 rounded-full border border-indigo-200 dark:border-indigo-800 shrink-0">
                                    <Mic size={11} /> Áudio
                                  </span>
                                )}

                                {(() => {
                                  const atts = getTicketAttachments(ticket);
                                  if (atts.length === 0) return null;
                                  return (
                                    <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/40 px-2 py-0.5 rounded-full border border-blue-200 dark:border-blue-800/40 shrink-0">
                                      <Paperclip size={11} /> {atts.length > 1 ? `${atts.length} Anexos` : 'Anexo'}
                                    </span>
                                  );
                                })()}
                              </div>

                              <span className="text-xs text-gray-500 truncate hidden md:inline-block ml-auto">
                                Para: <strong className="text-gray-700 dark:text-gray-300 font-semibold">{getUserName(ticket.assignedToId)}</strong>
                                <span className="mx-1.5">•</span>
                                De: <strong className="text-gray-700 dark:text-gray-300 font-semibold">{getUserName(ticket.createdById)}</strong>
                                <span className="mx-1.5">•</span>
                                {formatTimeAgo(ticket.createdAt)}
                              </span>
                            </div>

                            <div className="flex items-center gap-2 shrink-0">
                              {!isDemo && (currentUser.profile === UserProfile.Admin || isDeveloperUser(currentUser)) && (
                                <button 
                                  onClick={(e) => { e.stopPropagation(); onDelete(ticket.id); }} 
                                  className="text-gray-400 hover:text-red-500 p-1.5 rounded-md hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors" 
                                  title="Excluir Chamado"
                                >
                                  <Trash2 size={16} />
                                </button>
                              )}

                              {!isDemo && ticket.status === TicketStatus.Aberto && (
                                <button
                                  onClick={(e) => { e.stopPropagation(); handleAttend(ticket.id); }}
                                  className="text-xs font-bold text-white bg-amber-500 hover:bg-amber-600 px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1 shadow-xs"
                                >
                                  <Headphones size={13} />
                                  Atender
                                </button>
                              )}

                              <button className="text-xs font-semibold text-gray-600 dark:text-gray-300 hover:text-primary dark:hover:text-primary whitespace-nowrap bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1">
                                {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                                {isExpanded ? 'Ocultar' : 'Exibir mais'}
                              </button>
                            </div>
                          </div>

                          {/* Detalhes Expandidos no Modo Lista */}
                          {isExpanded && (
                            <div className="mt-3 pt-3 border-t border-gray-100 dark:border-gray-700 flex flex-col gap-4 animate-fade-in">
                              <div className="flex items-center gap-4 text-xs text-gray-500 dark:text-gray-400 md:hidden">
                                <span>Para: <b>{getUserName(ticket.assignedToId)}</b></span>
                                <span>De: <b>{getUserName(ticket.createdById)}</b></span>
                                <span>{formatDate(ticket.createdAt)}</span>
                              </div>
                              
                              <div className="bg-slate-50 dark:bg-slate-900/60 p-3 rounded-xl border border-slate-200/80 dark:border-slate-800">
                                <div className="flex items-center justify-between gap-2 mb-2">
                                  <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                                    <FileText className="w-3.5 h-3.5 text-slate-400" />
                                    Descrição Inicial
                                  </p>
                                  {(() => {
                                    const wa = extractWhatsAppPhone(ticket.description);
                                    if (!wa) return null;
                                    return (
                                      <a
                                        href={`https://wa.me/${wa.phoneUrl}`}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        onClick={(e) => e.stopPropagation()}
                                        className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-bold text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-300 dark:border-emerald-800 rounded-lg hover:bg-emerald-100 dark:hover:bg-emerald-900/40 transition-colors shadow-2xs"
                                        title={`Chamar ${getUserName(ticket.createdById)} no WhatsApp`}
                                      >
                                        <MessageCircle className="w-3.5 h-3.5 text-emerald-600" />
                                        <span>Chamar no WhatsApp ({wa.formatted})</span>
                                      </a>
                                    );
                                  })()}
                                </div>
                                <p className="text-xs sm:text-sm text-slate-800 dark:text-slate-200 whitespace-pre-wrap leading-relaxed">
                                  {ticket.description}
                                </p>
                              </div>

                              {/* Áudio Explicativo Gravado */}
                              {ticket.audioUrl && (
                                <TicketAudioPlayer 
                                  url={ticket.audioUrl} 
                                  durationSeconds={ticket.audioDurationSeconds} 
                                  title={`Áudio explicativo enviado por ${getUserName(ticket.createdById)}`} 
                                />
                              )}

                              {/* Card dos Anexos do Chamado (Múltiplos ou Único) */}
                              {(() => {
                                const atts = getTicketAttachments(ticket);
                                if (atts.length === 0) return null;
                                return (
                                  <div className="space-y-2 animate-fade-in">
                                    <div className="flex items-center justify-between">
                                      <span className="text-[11px] font-bold text-blue-700 dark:text-blue-400 uppercase tracking-wider flex items-center gap-1">
                                        <Paperclip size={13} /> {atts.length > 1 ? `Arquivos e Fotos Anexados (${atts.length})` : 'Arquivo Anexado'}
                                      </span>
                                      <span className="text-[11px] text-gray-500 dark:text-gray-400">
                                        (enviado por {getUserName(ticket.createdById)})
                                      </span>
                                    </div>
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                                      {atts.map((att, idx) => {
                                        const isImg = att.type?.startsWith('image/') || /\.(jpg|jpeg|png|webp|gif|svg)$/i.test(att.name || '') || /\.(jpg|jpeg|png|webp|gif|svg)/i.test(att.url || '');
                                        return (
                                          <div
                                            key={`${att.url}-${idx}`}
                                            className="p-3 bg-gradient-to-r from-blue-50/90 via-sky-50/50 to-indigo-50/90 dark:from-blue-950/40 dark:via-gray-900/60 dark:to-indigo-950/40 rounded-xl border border-blue-200/90 dark:border-blue-800/60 shadow-xs flex items-center justify-between gap-3"
                                          >
                                            <div className="flex items-center gap-2.5 overflow-hidden min-w-0">
                                              <div className={`w-9 h-9 rounded-lg ${isImg ? 'bg-emerald-600 shadow-emerald-500/20' : 'bg-blue-600 shadow-blue-500/20'} text-white flex items-center justify-center shrink-0 shadow-sm`}>
                                                {isImg ? <ImageIcon className="w-4 h-4" /> : <Paperclip className="w-4 h-4" />}
                                              </div>
                                              <div className="min-w-0 truncate">
                                                <p className="text-xs font-bold text-slate-800 dark:text-slate-100 truncate" title={att.name}>
                                                  {att.name || `Anexo ${idx + 1}`}
                                                </p>
                                                {att.size && (
                                                  <p className="text-[10px] text-gray-500 dark:text-gray-400">
                                                    {(att.size / 1024 < 1024)
                                                      ? `${(att.size / 1024).toFixed(1)} KB`
                                                      : `${(att.size / (1024 * 1024)).toFixed(2)} MB`}
                                                  </p>
                                                )}
                                              </div>
                                            </div>

                                            <div className="flex items-center gap-1.5 shrink-0">
                                              <button
                                                type="button"
                                                onClick={(e) => {
                                                  e.stopPropagation();
                                                  setPreviewFile({
                                                    url: att.url,
                                                    name: att.name || 'Anexo_Chamado'
                                                  });
                                                }}
                                                className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-bold rounded-lg bg-blue-600 hover:bg-blue-700 text-white shadow-xs transition-all cursor-pointer"
                                                title="Visualizar documento ou foto"
                                              >
                                                <Eye className="w-3.5 h-3.5" />
                                                Visualizar
                                              </button>
                                              <button
                                                type="button"
                                                onClick={(e) => {
                                                  e.stopPropagation();
                                                  handleDownloadAttachment(att.url, att.name || 'anexo_chamado');
                                                }}
                                                className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-bold rounded-lg bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 text-slate-700 dark:text-slate-200 border border-slate-300 dark:border-slate-600 shadow-xs transition-all cursor-pointer"
                                                title="Baixar arquivo"
                                              >
                                                <Download className="w-3.5 h-3.5" />
                                                Baixar
                                              </button>
                                            </div>
                                          </div>
                                        );
                                      })}
                                    </div>
                                  </div>
                                );
                              })()}
                              
                              {/* Vínculos de Carga ou Embarque */}
                              {(ticket.cargoId || ticket.shipmentId) && (
                                <div className="flex gap-2 flex-wrap">
                                  {ticket.cargoId && (
                                    <button 
                                      onClick={(e) => { e.stopPropagation(); onClose(); onNavigateTo?.('cargo', ticket.cargoId); }} 
                                      className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300 rounded-lg text-xs font-semibold hover:bg-blue-100 dark:hover:bg-blue-900/50 transition-colors border border-blue-200 dark:border-blue-800/50"
                                    >
                                      <Package size={14} /> Acessar Carga Vinculada
                                      <ExternalLink size={14} className="ml-1 opacity-70" />
                                    </button>
                                  )}
                                  {ticket.shipmentId && (
                                    <button 
                                      onClick={(e) => { e.stopPropagation(); onClose(); onNavigateTo?.('shipment', ticket.shipmentId); }} 
                                      className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-50 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300 rounded-lg text-xs font-semibold hover:bg-indigo-100 dark:hover:bg-indigo-900/50 transition-colors border border-indigo-200 dark:border-indigo-800/50"
                                    >
                                      <Truck size={14} /> Acessar Embarque Vinculado
                                      <ExternalLink size={14} className="ml-1 opacity-70" />
                                    </button>
                                  )}
                                </div>
                              )}
                              
                              {/* Histórico da Conversa */}
                              {ticket.history && ticket.history.length > 0 && (
                                <div className="space-y-3 bg-gray-50/50 dark:bg-gray-900/20 p-4 rounded-xl border border-gray-100/50 dark:border-gray-800/50">
                                  <p className="text-[11px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                                    <MessageSquare size={13} /> Histórico e Auditoria da Conversa
                                  </p>
                                  {ticket.history.map((h, i) => {
                                    const isCurrentUser = h.userId === currentUser.id;
                                    return (
                                      <div key={i} className={`flex flex-col ${isCurrentUser ? 'items-end' : 'items-start'} mb-3`}>
                                        <div className="text-xs text-gray-500 mb-1 px-1">
                                          <span className="font-semibold text-gray-700 dark:text-gray-300 mr-2">{getUserName(h.userId)}</span>
                                          {new Date(h.timestamp).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}
                                        </div>
                                        <div className={`chat-bubble text-sm shadow-sm max-w-[90%] md:max-w-[80%] ${isCurrentUser ? 'bg-primary text-white rounded-tr-none' : 'chat-bubble-left text-gray-800 dark:text-gray-200'}`}>
                                          <p className="whitespace-pre-wrap">{h.comment}</p>
                                        </div>
                                        {h.newStatus && (
                                          <div className="mt-2 text-center w-full">
                                            <span className="inline-block text-[10px] font-bold px-3 py-1 bg-white dark:bg-gray-800 rounded-full text-gray-500 dark:text-gray-400 uppercase tracking-wide shadow-xs border border-gray-200/50 dark:border-gray-700/50">
                                              Status alterado para: {h.newStatus}
                                            </span>
                                          </div>
                                        )}
                                      </div>
                                    );
                                  })}
                                </div>
                              )}

                              {/* Ações de Atendimento na Lista */}
                              <div className="flex justify-end gap-2 pt-2 border-t border-gray-100 dark:border-gray-800">
                                {!isDemo && attendingTicketId !== ticket.id && ticket.status !== TicketStatus.Fechado && ticket.status !== TicketStatus.Resolvido && (
                                  <button 
                                    onClick={(e) => { e.stopPropagation(); handleAttend(ticket.id); }} 
                                    className="py-2 px-5 text-xs sm:text-sm font-bold bg-amber-500 hover:bg-amber-600 text-white rounded-xl whitespace-nowrap shadow-md flex items-center gap-1.5 cursor-pointer"
                                  >
                                    <Headphones size={15} />
                                    {ticket.status === TicketStatus.Aberto ? 'Atender Chamado' : 'Continuar Atendimento'}
                                  </button>
                                )}
                              </div>

                              {attendingTicketId === ticket.id && (
                                <div className="border-t dark:border-gray-700 pt-4 space-y-3 animate-fade-in">
                                  <h4 className="text-xs font-bold text-gray-800 dark:text-gray-200 flex items-center gap-1.5">
                                    <MessageSquare size={14} className="text-primary" />
                                    Adicionar Observação de Resolução ou Fechamento
                                  </h4>
                                  <textarea
                                    value={observation}
                                    onChange={(e) => setObservation(e.target.value)}
                                    placeholder="Detalhes da solução prestada ou motivo do fechamento (obrigatório para Concluir)..."
                                    className="p-3 w-full text-sm border rounded-xl dark:bg-gray-900 dark:border-gray-700 dark:text-white focus:ring-2 focus:ring-primary focus:border-transparent outline-none transition-all"
                                    rows={3}
                                  />
                                  <div className="flex flex-wrap justify-end gap-2">
                                    <button 
                                      onClick={handleCancelAttend} 
                                      className="py-2 px-4 text-xs font-semibold bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600 transition-colors"
                                    >
                                      Cancelar
                                    </button>
                                    <button 
                                      onClick={() => handleUpdateStatus(TicketStatus.Resolvido)} 
                                      className="py-2 px-4 text-xs font-bold bg-green-600 hover:bg-green-700 text-white rounded-lg transition-colors shadow-sm flex items-center gap-1.5"
                                    >
                                      <CheckCircle2 size={14} />
                                      Marcar como Resolvido
                                    </button>
                                    <button 
                                      onClick={() => handleUpdateStatus(TicketStatus.Fechado)} 
                                      className="py-2 px-4 text-xs font-bold bg-gray-800 hover:bg-gray-900 dark:bg-black text-white rounded-lg transition-colors shadow-sm"
                                    >
                                      Fechar Definitivo
                                    </button>
                                  </div>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )
              ) : (
                <div className="text-center py-12 px-4 border border-dashed border-gray-200 dark:border-gray-800 rounded-2xl bg-gray-50/50 dark:bg-gray-900/20">
                  <Headphones className="w-10 h-10 text-gray-400 mx-auto mb-2 opacity-50" />
                  <p className="text-sm font-semibold text-gray-700 dark:text-gray-300">
                    Nenhum chamado encontrado
                  </p>
                  <p className="text-xs text-gray-400 mt-1">
                    {hasActiveFilters 
                      ? 'Tente ajustar ou limpar os filtros aplicados acima.' 
                      : 'Não há registros nesta categoria no momento.'}
                  </p>
                  {hasActiveFilters && (
                    <button
                      onClick={clearFilters}
                      className="mt-3 px-3 py-1.5 text-xs font-bold text-primary hover:underline inline-flex items-center gap-1"
                    >
                      <RotateCcw size={12} /> Limpar todos os filtros
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {previewFile && (
        <DocumentPreviewModal
          isOpen={!!previewFile}
          onClose={() => setPreviewFile(null)}
          fileUrl={previewFile.url}
          fileName={previewFile.name}
          category="Anexo do Chamado"
        />
      )}
    </div>
  );
};

export default TicketModal;
