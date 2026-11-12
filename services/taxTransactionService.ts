import { supabase } from '../supabase';
import type { FinancialTransaction, TaxType, User } from '../types';
import { FinancialTransactionStatus, FinancialCategoryType } from '../types';

export const SUPABASE_TAXES_RECORD_ID = 890;
export const TAXES_STORAGE_KEY = 'transcunha_financial_transactions';
export const TAXES_REALTIME_CHANNEL = 'transcunha_taxes_realtime_channel';

// Helper de logs defensivos
const logTaxes = (...args: any[]) => {
  console.log('[TaxTransactionService]', ...args);
};

export interface RemoteTaxesResponse {
  transactions: FinancialTransaction[];
  success: boolean;
  updatedAt?: string;
  error?: any;
}

/**
 * Lê transações armazenadas no localStorage de forma segura
 */
export function getLocalTransactions(): FinancialTransaction[] {
  try {
    const raw = localStorage.getItem(TAXES_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch (err) {
    console.warn('[TaxTransactionService] Erro ao ler transactions do localStorage:', err);
  }
  return [];
}

/**
 * Salva transações no localStorage
 */
export function setLocalTransactions(list: FinancialTransaction[]): void {
  try {
    localStorage.setItem(TAXES_STORAGE_KEY, JSON.stringify(list));
  } catch (err) {
    console.warn('[TaxTransactionService] Erro ao gravar transactions no localStorage:', err);
  }
}

/**
 * Dispara evento broadcast WebSocket via Supabase para todos os outros navegadores
 */
export async function broadcastTaxesChange(action: 'create' | 'update' | 'delete' | 'batch_create', itemIds?: string[]) {
  try {
    const channel = supabase.channel(TAXES_REALTIME_CHANNEL);
    await channel.send({
      type: 'broadcast',
      event: 'taxes_changed',
      payload: {
        action,
        itemIds: itemIds || [],
        timestamp: new Date().toISOString()
      }
    });
    // Remove canal efêmero após disparo
    setTimeout(() => {
      try { supabase.removeChannel(channel); } catch {}
    }, 1500);
  } catch (err) {
    console.warn('[TaxTransactionService] Erro ao disparar broadcast de tributos:', err);
  }
}

/**
 * Busca a lista remota compartilhada de transações no Supabase (row 890 de profile_permissions)
 */
export async function fetchRemoteTaxTransactions(): Promise<RemoteTaxesResponse> {
  try {
    const { data, error } = await supabase
      .from('profile_permissions')
      .select('permissions')
      .eq('id', SUPABASE_TAXES_RECORD_ID)
      .maybeSingle();

    if (!error && data?.permissions) {
      const p = data.permissions;
      const list = Array.isArray(p.transactions) ? p.transactions : [];
      return {
        transactions: list,
        updatedAt: p.updatedAt,
        success: true
      };
    }

    if (!error && !data) {
      // Row 890 ainda não existe, cria vazia
      await supabase.from('profile_permissions').upsert({
        id: SUPABASE_TAXES_RECORD_ID,
        permissions: {
          transactions: [],
          updatedAt: new Date().toISOString()
        }
      });
      return { transactions: [], success: true };
    }

    console.warn('[TaxTransactionService] Erro ao carregar row 890 no Supabase:', error);
    return { transactions: getLocalTransactions(), success: false, error };
  } catch (err) {
    console.warn('[TaxTransactionService] Exceção ao consultar row 890:', err);
    return { transactions: getLocalTransactions(), success: false, error: err };
  }
}

/**
 * Salva a lista consolidada de transações no Supabase (row 890) e no localStorage
 */
export async function persistTransactionsToCloud(
  transactions: FinancialTransaction[],
  action: 'create' | 'update' | 'delete' | 'batch_create' = 'update',
  affectedIds?: string[]
): Promise<boolean> {
  const nowIso = new Date().toISOString();
  
  // 1. Atualiza cache local
  setLocalTransactions(transactions);

  // 2. Dispara CustomEvent local imediato (mesma aba/janela)
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('taxes_transactions_updated', {
      detail: { action, affectedIds, timestamp: nowIso }
    }));
  }

  // 3. Salva na nuvem compartilhada Supabase (row 890)
  let cloudSuccess = false;
  try {
    const { error } = await supabase.from('profile_permissions').upsert({
      id: SUPABASE_TAXES_RECORD_ID,
      permissions: {
        transactions,
        updatedAt: nowIso
      }
    });

    if (!error) {
      cloudSuccess = true;
    } else {
      console.warn('[TaxTransactionService] Erro ao salvar row 890 no Supabase:', error);
    }
  } catch (err) {
    console.warn('[TaxTransactionService] Exceção ao persistir row 890 no Supabase:', err);
  }

  // 4. Dispara broadcast para todos os outros usuários conectados
  broadcastTaxesChange(action, affectedIds);

  return cloudSuccess;
}

/**
 * Cria ou salva uma única transação tributária ou manual
 */
export async function saveTaxTransaction(
  item: Omit<FinancialTransaction, 'id' | 'createdAt'> | FinancialTransaction,
  currentUser?: User | null
): Promise<FinancialTransaction> {
  const nowIso = new Date().toISOString();
  const remoteRes = await fetchRemoteTaxTransactions();
  const baseList = remoteRes.success ? remoteRes.transactions : getLocalTransactions();

  let finalItem: FinancialTransaction;
  let isEdit = false;

  if ('id' in item && item.id) {
    isEdit = true;
    finalItem = {
      ...(item as FinancialTransaction),
      updatedAt: nowIso
    };
  } else {
    const prefix = (item as any).taxType ? 'tax' : 'tx';
    const newId = `${prefix}_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    finalItem = {
      ...item,
      id: newId,
      createdAt: nowIso,
      updatedAt: nowIso,
      createdById: currentUser?.id,
    } as FinancialTransaction;
  }

  let updatedList: FinancialTransaction[];
  if (isEdit) {
    updatedList = baseList.map(t => t.id === finalItem.id ? finalItem : t);
  } else {
    // Insere no topo
    updatedList = [finalItem, ...baseList.filter(t => t.id !== finalItem.id)];
  }

  await persistTransactionsToCloud(updatedList, isEdit ? 'update' : 'create', [finalItem.id]);
  return finalItem;
}

/**
 * Salva um lote de guias de impostos (ex: importação OCR de múltiplas guias)
 * Salva todas atomicamente na nuvem e no storage em um único upsert e broadcast!
 */
export async function saveTaxTransactionsBatch(
  newItems: Array<Omit<FinancialTransaction, 'id' | 'createdAt'> | FinancialTransaction>,
  currentUser?: User | null
): Promise<FinancialTransaction[]> {
  const nowIso = new Date().toISOString();
  const remoteRes = await fetchRemoteTaxTransactions();
  const baseList = remoteRes.success ? remoteRes.transactions : getLocalTransactions();

  const preparedItems: FinancialTransaction[] = newItems.map((item, idx) => {
    if ('id' in item && item.id) {
      return {
        ...(item as FinancialTransaction),
        updatedAt: nowIso
      };
    }
    const prefix = (item as any).taxType ? 'tax' : 'tx';
    return {
      ...item,
      id: `${prefix}_${Date.now()}_${idx}_${Math.random().toString(36).substring(2, 6)}`,
      createdAt: nowIso,
      updatedAt: nowIso,
      createdById: currentUser?.id,
    } as FinancialTransaction;
  });

  const newIds = new Set(preparedItems.map(p => p.id));
  const mergedList = [...preparedItems, ...baseList.filter(t => !newIds.has(t.id))];

  await persistTransactionsToCloud(mergedList, 'batch_create', Array.from(newIds));
  return preparedItems;
}

/**
 * Atualiza campos parciais de uma transação tributária existente
 */
export async function updateTaxTransaction(
  id: string,
  updates: Partial<FinancialTransaction>
): Promise<FinancialTransaction | null> {
  const nowIso = new Date().toISOString();
  const remoteRes = await fetchRemoteTaxTransactions();
  const baseList = remoteRes.success ? remoteRes.transactions : getLocalTransactions();

  let targetItem: FinancialTransaction | null = null;
  const updatedList = baseList.map(t => {
    if (t.id === id) {
      targetItem = {
        ...t,
        ...updates,
        updatedAt: nowIso
      };
      return targetItem;
    }
    return t;
  });

  if (!targetItem) {
    // Item pode estar apenas no localStorage
    const local = getLocalTransactions();
    const localUpdated = local.map(t => {
      if (t.id === id) {
        targetItem = { ...t, ...updates, updatedAt: nowIso };
        return targetItem;
      }
      return t;
    });
    if (targetItem) {
      await persistTransactionsToCloud(localUpdated, 'update', [id]);
      return targetItem;
    }
    return null;
  }

  await persistTransactionsToCloud(updatedList, 'update', [id]);
  return targetItem;
}

/**
 * Exclui permanentemente um lançamento de imposto ou transação manual
 */
export async function deleteTaxTransaction(id: string): Promise<boolean> {
  const remoteRes = await fetchRemoteTaxTransactions();
  const baseList = remoteRes.success ? remoteRes.transactions : getLocalTransactions();

  const filtered = baseList.filter(t => t.id !== id);
  await persistTransactionsToCloud(filtered, 'delete', [id]);
  return true;
}

/**
 * Assina atualizações em tempo real para sincronização instantânea entre todos os usuários conectados
 */
export function subscribeToTaxTransactions(onUpdate: (detail?: any) => void): () => void {
  let isMounted = true;
  const channelName = `taxes_rt_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const channel = supabase.channel(channelName);

  // 1. WebSocket Broadcast: disparado explicitamente após qualquer create/update/delete
  channel.on('broadcast', { event: 'taxes_changed' }, (payload: any) => {
    if (isMounted) {
      logTaxes('⚡ [Realtime Broadcast] Alteração de tributos recebida:', payload);
      onUpdate(payload);
    }
  });

  // 2. Postgres Changes: escuta alterações diretas na tabela profile_permissions (row 890)
  channel.on(
    'postgres_changes',
    { event: '*', schema: 'public', table: 'profile_permissions' },
    (payload: any) => {
      if (isMounted) {
        const rowId = payload?.new?.id ?? payload?.old?.id;
        if (rowId === SUPABASE_TAXES_RECORD_ID || rowId === 890 || !rowId) {
          logTaxes('⚡ [Postgres Changes] Row 890 modificada no Supabase');
          onUpdate(payload);
        }
      }
    }
  );

  channel.subscribe((status) => {
    if (status === 'SUBSCRIBED') {
      logTaxes('✅ Canal Realtime de Impostos e Tributos conectado com sucesso');
    }
  });

  // 3. Ouvinte de eventos no mesmo navegador (CustomEvent)
  const handleLocal = (e: Event) => {
    if (isMounted) {
      onUpdate((e as CustomEvent).detail);
    }
  };
  window.addEventListener('taxes_transactions_updated', handleLocal);

  // 4. Ouvinte de mudanças em outras abas do mesmo navegador (storage event)
  const handleStorage = (e: StorageEvent) => {
    if (e.key === TAXES_STORAGE_KEY && isMounted) {
      onUpdate({ action: 'storage_sync' });
    }
  };
  window.addEventListener('storage', handleStorage);

  return () => {
    isMounted = false;
    try { supabase.removeChannel(channel); } catch {}
    window.removeEventListener('taxes_transactions_updated', handleLocal);
    window.removeEventListener('storage', handleStorage);
  };
}

export const taxTransactionService = {
  fetchRemoteTaxTransactions,
  getLocalTransactions,
  setLocalTransactions,
  saveTaxTransaction,
  saveTaxTransactionsBatch,
  updateTaxTransaction,
  deleteTaxTransaction,
  subscribeToTaxTransactions,
  persistTransactionsToCloud
};
