import type { FiscalDocument, Client, Branch } from '../types';

export const GWORKSPACE_APP_PASSWORD_KEY = 'transcunha_gworkspace_app_password';
export const GWORKSPACE_SENDER_EMAIL_KEY = 'transcunha_gworkspace_sender_email';
export const DEFAULT_GWORKSPACE_SENDER = 'contato@transcunhaoficial.com.br';

export function getSavedAppPassword(): string {
  if (typeof window === 'undefined') return '';
  return localStorage.getItem(GWORKSPACE_APP_PASSWORD_KEY) || '';
}

export function saveAppPassword(password: string): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(GWORKSPACE_APP_PASSWORD_KEY, password.trim());
}

export function getSavedSenderEmail(): string {
  if (typeof window === 'undefined') return DEFAULT_GWORKSPACE_SENDER;
  return localStorage.getItem(GWORKSPACE_SENDER_EMAIL_KEY) || DEFAULT_GWORKSPACE_SENDER;
}

export function saveSenderEmail(email: string): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(GWORKSPACE_SENDER_EMAIL_KEY, email.trim());
}

/**
 * Converte uma URL pública ou do Supabase Storage em string Base64 no navegador.
 */
export async function fetchFileAsBase64(url: string): Promise<string> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Falha ao baixar anexo (${response.status} ${response.statusText}): ${url}`);
  }
  const blob = await response.blob();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = reader.result as string;
      // Remove prefixo data:*/*;base64,
      const base64Data = result.replace(/^data:[^;]+;base64,/, '');
      resolve(base64Data);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

/**
 * Gera um nome de arquivo limpo e amigável para o anexo de e-mail
 */
export function sanitizeFilename(title: string, index: number): string {
  const clean = title
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // remove acentos
    .replace(/[^a-zA-Z0-9_\-\.]/g, '_')
    .replace(/_{2,}/g, '_')
    .substring(0, 45);

  return `${String(index + 1).padStart(2, '0')}_${clean}.pdf`;
}

export interface SendDossierOptions {
  to: string;
  subject: string;
  recipientName?: string;
  selectedBranchId: string;
  branches: Branch[];
  chosenDocs: FiscalDocument[];
  customObservations?: string;
  appPassword: string;
  senderEmail?: string;
  senderName?: string;
  onProgress?: (message: string, current: number, total: number) => void;
}

export interface SendDossierResult {
  success: boolean;
  messageId?: string;
  totalAttachments: number;
  error?: string;
  userHelp?: string;
}

/**
 * Monta o template HTML executivo e profissional para o e-mail
 */
export function buildDossierHtmlEmail(params: {
  recipientName?: string;
  selectedBranchId: string;
  branches: Branch[];
  chosenDocs: FiscalDocument[];
  customObservations?: string;
  senderEmail: string;
}): string {
  const {
    recipientName = '',
    selectedBranchId,
    branches,
    chosenDocs,
    customObservations,
    senderEmail,
  } = params;

  const clientGreeting = recipientName.trim()
    ? `Prezados(as) da equipe <strong>${recipientName.trim()}</strong>,`
    : 'Prezados(as) Senhores(as),';

  const branchNameLabel = selectedBranchId === 'all'
    ? 'Geral / Todas as Unidades'
    : (branches.find(b => b.id === selectedBranchId || b.name === selectedBranchId)?.name || selectedBranchId);

  const docRows = chosenDocs.map((doc, idx) => {
    const isExpired = doc.expirationDate && new Date(doc.expirationDate + 'T23:59:59') < new Date();
    const valText = doc.expirationDate ? doc.expirationDate.split('-').reverse().join('/') : 'Indeterminada';
    const valColor = isExpired ? '#ef4444' : '#10b981';

    return `
      <tr style="border-bottom: 1px solid #e2e8f0;">
        <td style="padding: 10px 12px; font-weight: 600; color: #1e293b; font-size: 13px;">
          ${idx + 1}. ${doc.title}
        </td>
        <td style="padding: 10px 12px; color: #64748b; font-size: 12px;">
          ${doc.typeName || 'Geral'}
        </td>
        <td style="padding: 10px 12px; color: #475569; font-size: 12px;">
          ${doc.branchName || doc.branchId || 'Matriz'}
        </td>
        <td style="padding: 10px 12px; font-size: 12px; font-weight: 700; color: ${valColor}; font-family: monospace;">
          ${valText}
        </td>
        <td style="padding: 10px 12px; font-size: 11px; color: #2563eb; font-weight: 600;">
          📎 Anexado ao e-mail
        </td>
      </tr>
    `;
  }).join('');

  return `
<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <title>Dossiê de Homologação Transcunha</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f1f5f9; margin: 0; padding: 24px; color: #334155;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width: 680px; margin: 0 auto; background: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);">
    
    <!-- CABEÇALHO -->
    <tr>
      <td style="background: linear-gradient(135deg, #0f172a 0%, #1e3a8a 100%); padding: 32px 28px; text-align: left; color: #ffffff;">
        <h1 style="margin: 0; font-size: 22px; font-weight: 800; letter-spacing: -0.5px;">
          TRANSCUNHA TRANSPORTES E LOGÍSTICA
        </h1>
        <p style="margin: 6px 0 0 0; font-size: 14px; color: #93c5fd; font-weight: 500;">
          Apresentação Comercial de Parceria & Dossiê Cadastral de Fornecedor
        </p>
      </td>
    </tr>

    <!-- CORPO -->
    <tr>
      <td style="padding: 28px;">
        <p style="font-size: 15px; line-height: 1.6; margin: 0 0 16px 0; color: #1e293b;">
          ${clientGreeting}
        </p>
        <p style="font-size: 14px; line-height: 1.6; margin: 0 0 16px 0;">
          É com grande satisfação que apresentamos a <strong>TRANSCUNHA TRANSPORTES E LOGÍSTICA LTDA.</strong> com o objetivo de estabelecer uma sólida e produtiva <strong>parceria comercial</strong> no fornecimento de soluções em transporte rodoviário de cargas para a sua empresa.
        </p>
        <p style="font-size: 14px; line-height: 1.6; margin: 0 0 20px 0;">
          Atuamos com frota qualificada, pontualidade, atendimento ágil e rigoroso padrão de segurança, contando com bases e unidades operacionais estrategicamente localizadas nos principais polos agroindustriais e rodoviários do país. Para viabilizar nosso cadastro e homologação como transportadora parceira, encaminhamos em anexo o nosso <strong>Dossiê Cadastral e Operacional Completo</strong>, contendo certidões de regularidade (CNDs), licenças e apólices vigentes.
        </p>

        <!-- AVISO DE ANEXOS FÍSICOS -->
        <div style="background-color: #eff6ff; border-left: 4px solid #3b82f6; padding: 14px 18px; border-radius: 6px; margin: 0 0 24px 0;">
          <p style="margin: 0; font-size: 13px; font-weight: 700; color: #1e40af;">
            📎 ${chosenDocs.length} Documento(s) PDF anexados diretamente a esta mensagem
          </p>
          <p style="margin: 4px 0 0 0; font-size: 12px; color: #3b82f6;">
            Todos os arquivos em formato PDF encontram-se como anexos físicos desta mensagem para armazenamento imediato em seu sistema ou ERP.
          </p>
        </div>

        <!-- DADOS CADASTRAIS -->
        <h2 style="font-size: 15px; font-weight: 700; color: #0f172a; margin: 0 0 10px 0; border-bottom: 2px solid #e2e8f0; padding-bottom: 6px;">
          Dados Cadastrais da Transportadora
        </h2>
        <table role="presentation" width="100%" style="font-size: 13px; line-height: 1.6; margin-bottom: 20px; color: #334155;">
          <tr>
            <td style="padding: 4px 0; width: 140px; font-weight: 600; color: #64748b;">Razão Social:</td>
            <td style="padding: 4px 0; font-weight: 700;">TRANSCUNHA TRANSPORTES E LOGISTICA LTDA</td>
          </tr>
          <tr>
            <td style="padding: 4px 0; font-weight: 600; color: #64748b;">CNPJ Matriz:</td>
            <td style="padding: 4px 0; font-family: monospace;">36.203.306/0001-92 (Pratápolis - MG)</td>
          </tr>
          <tr>
            <td style="padding: 4px 0; font-weight: 600; color: #64748b;">CNPJ Filial PR:</td>
            <td style="padding: 4px 0; font-family: monospace;">36.203.306/0003-54 (Cambará - PR)</td>
          </tr>
          <tr>
            <td style="padding: 4px 0; font-weight: 600; color: #64748b;">CNPJ Filial SP:</td>
            <td style="padding: 4px 0; font-family: monospace;">36.203.306/0002-73 (Ipaussu - SP)</td>
          </tr>
          <tr>
            <td style="padding: 4px 0; font-weight: 600; color: #64748b;">CNPJ Filial GO:</td>
            <td style="padding: 4px 0; font-family: monospace;">36.203.306/0004-35 (Catalão - GO)</td>
          </tr>
          <tr>
            <td style="padding: 4px 0; font-weight: 600; color: #64748b;">E-mail Oficial:</td>
            <td style="padding: 4px 0;"><a href="mailto:${senderEmail}" style="color: #2563eb; text-decoration: none;">${senderEmail}</a></td>
          </tr>
          <tr>
            <td style="padding: 4px 0; font-weight: 600; color: #64748b;">Unidade de Referência:</td>
            <td style="padding: 4px 0; font-weight: 600; color: #1e3a8a;">${branchNameLabel}</td>
          </tr>
        </table>

        <!-- SEGUROS DE CARGA -->
        <h2 style="font-size: 15px; font-weight: 700; color: #0f172a; margin: 0 0 10px 0; border-bottom: 2px solid #e2e8f0; padding-bottom: 6px;">
          Coberturas de Seguro de Carga
        </h2>
        <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 12px 16px; margin-bottom: 20px; font-size: 13px; line-height: 1.6;">
          <p style="margin: 0 0 6px 0;">🛡️ <strong>RCTR-C (Acidentes):</strong> Cobertura para danos materiais à carga decorrentes de colisão, capotagem, tombamento ou incêndio durante o transporte.</p>
          <p style="margin: 0;">🔒 <strong>RC-DC (Roubo e Desaparecimento):</strong> Cobertura securitária contra roubo de carga e apropriação indébita com monitoramento e gerenciamento de risco ativo.</p>
        </div>

        ${customObservations ? `
        <!-- OBSERVAÇÕES ESPECÍFICAS -->
        <div style="background-color: #fefce8; border: 1px solid #fef08a; border-radius: 8px; padding: 12px 16px; margin-bottom: 20px; font-size: 13px; color: #854d0e;">
          <strong>Observações Adicionais:</strong><br />
          ${customObservations}
        </div>
        ` : ''}

        <!-- TABELA DE DOCUMENTOS ANEXADOS -->
        <h2 style="font-size: 15px; font-weight: 700; color: #0f172a; margin: 0 0 10px 0; border-bottom: 2px solid #e2e8f0; padding-bottom: 6px;">
          Relação de Documentos & Certidões Anexadas
        </h2>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse: collapse; margin-bottom: 24px; border: 1px solid #cbd5e1; border-radius: 8px; overflow: hidden;">
          <thead>
            <tr style="background-color: #f1f5f9; text-align: left; font-size: 12px; color: #475569; text-transform: uppercase;">
              <th style="padding: 10px 12px;">Documento</th>
              <th style="padding: 10px 12px;">Tipo</th>
              <th style="padding: 10px 12px;">Filial</th>
              <th style="padding: 10px 12px;">Validade</th>
              <th style="padding: 10px 12px;">Status</th>
            </tr>
          </thead>
          <tbody>
            ${docRows}
          </tbody>
        </table>

        <p style="font-size: 13px; line-height: 1.6; margin: 0 0 16px 0; color: #475569;">
          Estamos à inteira disposição para agendarmos uma reunião de alinhamento, apresentar detalhadamente nossa estrutura operacional e realizar cotações de fretes para as rotas e demandas logísticas de sua empresa.
        </p>

        <p style="font-size: 13px; line-height: 1.6; margin: 0; color: #1e293b;">
          Aguardamos seu retorno para iniciarmos esta promissora parceria!<br /><br />
          Atenciosamente,<br />
          <strong>Equipe Comercial & Controladoria Regulatória</strong><br />
          TRANSCUNHA TRANSPORTES E LOGÍSTICA LTDA.<br />
          <span style="color: #64748b; font-size: 12px;">E-mail: ${senderEmail} | Website: <a href="https://transcunhaoficial.com.br" style="color: #2563eb; text-decoration: none;">transcunhaoficial.com.br</a></span>
        </p>

      </td>
    </tr>

    <!-- RODAPÉ -->
    <tr>
      <td style="background-color: #f8fafc; border-top: 1px solid #e2e8f0; padding: 18px 28px; text-align: center; font-size: 11px; color: #94a3b8;">
        Este e-mail contém documentação confidencial emitida para uso exclusivo do destinatário indicado para fins cadastrais e de homologação.
      </td>
    </tr>

  </table>
</body>
</html>
  `.trim();
}

/**
 * Função principal para envio direto via Google Workspace com anexação automática de arquivos PDF
 */
export async function sendDossierEmailViaGoogleWorkspace(
  options: SendDossierOptions
): Promise<SendDossierResult> {
  const {
    to,
    subject,
    recipientName,
    selectedBranchId,
    branches,
    chosenDocs,
    customObservations,
    appPassword,
    senderEmail = DEFAULT_GWORKSPACE_SENDER,
    senderName = 'Transcunha Transportes e Logística',
    onProgress,
  } = options;

  if (!to || !to.trim()) {
    throw new Error('Informe o e-mail do destinatário.');
  }

  const cleanPass = appPassword.replace(/\s+/g, '');
  if (!cleanPass) {
    throw new Error('Informe a Senha de App de 16 caracteres do Google Workspace.');
  }

  if (chosenDocs.length === 0) {
    throw new Error('Selecione ao menos um documento para compor o dossiê.');
  }

  // 1. Processar e baixar os PDFs em Base64
  const attachments: Array<{ filename: string; base64: string; contentType: string }> = [];

  const docsWithAttachment = chosenDocs.filter(d => d.attachments && d.attachments.length > 0);
  const total = docsWithAttachment.length;

  for (let i = 0; i < total; i++) {
    const doc = docsWithAttachment[i];
    const firstAtt = doc.attachments![0];

    onProgress?.(`Preparando anexo (${i + 1}/${total}): ${doc.title}...`, i + 1, total);

    try {
      const base64Data = await fetchFileAsBase64(firstAtt.url);
      const filename = sanitizeFilename(doc.title || firstAtt.name || `documento_${i + 1}`, i);

      attachments.push({
        filename,
        base64: base64Data,
        contentType: 'application/pdf',
      });
    } catch (attErr) {
      console.warn(`[fiscalDossierEmailService] Falha ao converter anexo ${doc.title}:`, attErr);
    }
  }

  onProgress?.(`Conectando ao Google Workspace (${senderEmail})...`, total, total);

  // 2. Montar corpo HTML e Texto
  const htmlBody = buildDossierHtmlEmail({
    recipientName,
    selectedBranchId,
    branches,
    chosenDocs,
    customObservations,
    senderEmail,
  });

  const textBody = `
TRANSCUNHA TRANSPORTES E LOGÍSTICA LTDA.
Apresentação Comercial de Parceria & Dossiê Cadastral

Prezados(as)${recipientName ? ` da equipe ${recipientName}` : ''},

É com grande satisfação que apresentamos a TRANSCUNHA TRANSPORTES E LOGÍSTICA LTDA. com o objetivo de estabelecer uma sólida e produtiva parceria comercial no fornecimento de soluções em transporte rodoviário de cargas para a sua empresa.

Atuamos com frota qualificada, rigoroso padrão de pontualidade e segurança, com unidades estrategicamente localizadas para atender as demandas logísticas de sua organização.

Para fins de cadastro e homologação como transportadora parceira, encaminhamos em anexo o nosso Dossiê Cadastral Completo, contendo ${attachments.length} arquivo(s) PDF anexados diretamente a esta mensagem.

DADOS DA TRANSPORTADORA:
• Razão Social: TRANSCUNHA TRANSPORTES E LOGISTICA LTDA
• CNPJ Matriz: 36.203.306/0001-92 (Pratápolis - MG)
• CNPJ Filial PR: 36.203.306/0003-54 (Cambará - PR)
• CNPJ Filial SP: 36.203.306/0002-73 (Ipaussu - SP)
• CNPJ Filial GO: 36.203.306/0004-35 (Catalão - GO)
• E-mail Oficial: ${senderEmail}
• Website: https://transcunhaoficial.com.br

Estamos à inteira disposição para cotações de fretes e início de nossa parceria!

Atenciosamente,
Equipe Comercial & Controladoria
TRANSCUNHA TRANSPORTES E LOGÍSTICA LTDA.
  `.trim();

  // 3. Chamar API Serverless /api/send-email
  onProgress?.(`Disparando mensagem com ${attachments.length} anexo(s) PDF para ${to}...`, total, total);

  const response = await fetch('/api/send-email', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      to: to.trim(),
      subject: subject.trim(),
      html: htmlBody,
      text: textBody,
      senderEmail: senderEmail.trim(),
      senderName,
      appPassword: cleanPass,
      attachments,
    }),
  });

  const responseData = await response.json();

  if (!response.ok) {
    const errorMsg = responseData?.error || 'Erro ao processar envio pelo Google Workspace';
    const userHelp = responseData?.userHelp || '';
    throw new Error(userHelp ? `${errorMsg}\n\n👉 Dica: ${userHelp}` : errorMsg);
  }

  return {
    success: true,
    messageId: responseData.messageId,
    totalAttachments: responseData.totalAttachments ?? attachments.length,
  };
}
