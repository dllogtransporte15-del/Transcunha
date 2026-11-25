import nodemailer from 'nodemailer';

interface AttachmentPayload {
  filename: string;
  base64?: string;
  content?: string;
  contentType?: string;
  url?: string;
}

interface SendEmailRequestBody {
  to: string | string[];
  cc?: string | string[];
  subject: string;
  html?: string;
  text?: string;
  senderEmail?: string;
  authUser?: string;
  senderName?: string;
  replyTo?: string;
  appPassword?: string;
  attachments?: AttachmentPayload[];
}

export default async function handler(req: any, res: any) {
  // Configuração de CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed. Use POST.' });
  }

  let senderEmail = 'contato@transcunhaoficial.com.br';

  try {
    const body: SendEmailRequestBody = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;

    const {
      to,
      cc,
      subject,
      html,
      text,
      senderEmail: customSender,
      authUser: customAuthUser,
      senderName = 'Transcunha Transportes e Logística',
      replyTo,
      appPassword: customPassword,
      attachments = [],
    } = body || {};

    if (!to || (Array.isArray(to) && to.length === 0)) {
      return res.status(400).json({ error: 'Destinatário (to) é obrigatório.' });
    }

    if (!subject) {
      return res.status(400).json({ error: 'Assunto (subject) é obrigatório.' });
    }

    // Credenciais e Contas do Google Workspace
    senderEmail = (customSender || process.env.GWORKSPACE_USER || 'contato@transcunhaoficial.com.br').trim();
    const effectiveAuthUser = (customAuthUser || process.env.GWORKSPACE_USER || senderEmail || 'contato@transcunhaoficial.com.br').trim();
    const rawPassword = (customPassword || process.env.GWORKSPACE_APP_PASSWORD || '').trim();

    // Remove espaços que o Google às vezes insere na senha de app (ex: "abcd efgh ijkl mnop" -> "abcdefghijklmnop")
    const appPassword = rawPassword.replace(/\s+/g, '');

    if (!appPassword) {
      return res.status(400).json({
        error: 'Senha de App do Google Workspace não configurada. Por favor, forneça a Senha de App de 16 caracteres gerada na sua Conta Google Workspace.',
        code: 'MISSING_APP_PASSWORD',
      });
    }

    // Processamento de anexos recebidos em Base64 ou URL (em paralelo para evitar timeout)
    const attachmentResults = await Promise.all(
      attachments.map(async (att) => {
        if (att.base64 || att.content) {
          const rawContent = (att.base64 || att.content || '').replace(/^data:[^;]+;base64,/, '');
          return {
            filename: att.filename || 'anexo.pdf',
            content: Buffer.from(rawContent, 'base64'),
            contentType: att.contentType || 'application/pdf',
          };
        }
        if (att.url) {
          try {
            const fetchRes = await fetch(att.url);
            if (fetchRes.ok) {
              const arrayBuffer = await fetchRes.arrayBuffer();
              return {
                filename: att.filename || 'documento.pdf',
                content: Buffer.from(arrayBuffer),
                contentType: att.contentType || 'application/pdf',
              };
            }
          } catch (downloadErr) {
            console.warn(`[send-email] Falha ao baixar anexo remoto da URL: ${att.url}`, downloadErr);
          }
        }
        return null;
      })
    );
    const processedAttachments = attachmentResults.filter((a): a is NonNullable<typeof a> => a !== null);

    const rawTo = Array.isArray(to) ? to.join(',') : to;
    const toAddresses = rawTo
      .split(/[;,]/)
      .map((addr) => addr.trim())
      .filter(Boolean)
      .join(', ');

    if (!toAddresses) {
      return res.status(400).json({ error: 'Nenhum endereço de destinatário válido informado.' });
    }

    const rawCc = Array.isArray(cc) ? cc.join(',') : (cc || '');
    const ccAddresses = rawCc
      .split(/[;,]/)
      .map((addr) => addr.trim())
      .filter(Boolean)
      .join(', ');

    // Construtor de transporte SMTP Google Workspace com fallback de portas (465 SSL -> 587 STARTTLS)
    const createTransporter = (port: number, secure: boolean) => {
      return nodemailer.createTransport({
        host: 'smtp.gmail.com',
        port,
        secure,
        auth: {
          user: effectiveAuthUser,
          pass: appPassword,
        },
        tls: {
          rejectUnauthorized: false,
        },
        connectionTimeout: 18000,
        greetingTimeout: 18000,
        socketTimeout: 35000,
      });
    };

    let info: any;
    try {
      // 1ª Tentativa: porta 465 (SSL direto)
      const transporter465 = createTransporter(465, true);
      info = await transporter465.sendMail({
        from: `"${senderName}" <${senderEmail}>`,
        to: toAddresses,
        cc: ccAddresses || undefined,
        replyTo: replyTo || senderEmail,
        subject: subject,
        text: text || undefined,
        html: html || undefined,
        attachments: processedAttachments,
      });
    } catch (primaryErr: any) {
      const msg = primaryErr?.message || '';
      // Fallback para porta 587 (STARTTLS) caso haja bloqueio ou timeout no socket 465
      if (
        msg.includes('ETIMEDOUT') ||
        msg.includes('ECONNREFUSED') ||
        msg.includes('ESOCKET') ||
        msg.includes('greeting') ||
        primaryErr?.code === 'ECONNECTION'
      ) {
        console.warn('[send-email] Porta 465 falhou, executando fallback para porta 587 (TLS)...', primaryErr);
        const transporter587 = createTransporter(587, false);
        info = await transporter587.sendMail({
          from: `"${senderName}" <${senderEmail}>`,
          to: toAddresses,
          cc: ccAddresses || undefined,
          replyTo: replyTo || senderEmail,
          subject: subject,
          text: text || undefined,
          html: html || undefined,
          attachments: processedAttachments,
        });
      } else {
        throw primaryErr;
      }
    }

    if (!info.accepted || info.accepted.length === 0) {
      return res.status(502).json({
        error: 'O servidor SMTP não aceitou nenhum endereço de destinatário.',
        rejected: info.rejected,
      });
    }

    return res.status(200).json({
      success: true,
      messageId: info.messageId,
      accepted: info.accepted,
      rejected: info.rejected,
      totalAttachments: processedAttachments.length,
      sender: senderEmail,
    });
  } catch (error: any) {
    console.error('[send-email] Erro ao enviar e-mail via Google Workspace:', error);

    const errorMessage = error?.message || 'Erro desconhecido ao enviar e-mail';
    const responseCode = error?.responseCode || error?.code;

    // Dicas amigáveis para falhas comuns de autenticação no Google Workspace
    let userHelp = '';
    if (errorMessage.includes('Invalid login') || errorMessage.includes('535') || responseCode === 535) {
      userHelp = `Falha de autenticação no Google Workspace (BadCredentials). Verifique: 1) A Senha de App de 16 letras deve ser gerada na mesma conta do remetente (${senderEmail}). Se você gerou no seu Gmail pessoal, troque o remetente para o seu Gmail pessoal ou faça login no Google como ${senderEmail} para gerar a senha; 2) A Verificação em 2 etapas deve estar ATIVA na conta; 3) No painel de administração do Workspace, o uso de Senhas de App deve estar permitido.`;
    } else if (errorMessage.includes('ETIMEDOUT') || errorMessage.includes('ECONNREFUSED')) {
      userHelp = 'Falha de conexão com os servidores SMTP do Google (smtp.gmail.com:465). Tente novamente em instantes.';
    }

    return res.status(500).json({
      error: errorMessage,
      code: responseCode,
      userHelp: userHelp || undefined,
    });
  }
}
