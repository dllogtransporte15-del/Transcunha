import type { VercelRequest, VercelResponse } from '@vercel/node';
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
  subject: string;
  html?: string;
  text?: string;
  senderEmail?: string;
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

  try {
    const body: SendEmailRequestBody = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;

    const {
      to,
      subject,
      html,
      text,
      senderEmail: customSender,
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

    // Credenciais do Google Workspace
    const senderEmail = (customSender || process.env.GWORKSPACE_USER || 'contato@transcunhaoficial.com.br').trim();
    const rawPassword = (customPassword || process.env.GWORKSPACE_APP_PASSWORD || '').trim();

    // Remove espaços que o Google às vezes insere na senha de app (ex: "abcd efgh ijkl mnop" -> "abcdefghijklmnop")
    const appPassword = rawPassword.replace(/\s+/g, '');

    if (!appPassword) {
      return res.status(400).json({
        error: 'Senha de App do Google Workspace não configurada. Por favor, forneça a Senha de App de 16 caracteres gerada na sua Conta Google Workspace.',
        code: 'MISSING_APP_PASSWORD',
      });
    }

    // Processamento de anexos recebidos em Base64 ou URL
    const processedAttachments = [];
    for (const att of attachments) {
      if (att.base64 || att.content) {
        const rawContent = (att.base64 || att.content || '').replace(/^data:[^;]+;base64,/, '');
        processedAttachments.push({
          filename: att.filename || 'anexo.pdf',
          content: Buffer.from(rawContent, 'base64'),
          contentType: att.contentType || 'application/pdf',
        });
      } else if (att.url) {
        try {
          const fetchRes = await fetch(att.url);
          if (fetchRes.ok) {
            const arrayBuffer = await fetchRes.arrayBuffer();
            processedAttachments.push({
              filename: att.filename || 'documento.pdf',
              content: Buffer.from(arrayBuffer),
              contentType: att.contentType || 'application/pdf',
            });
          }
        } catch (downloadErr) {
          console.warn(`[send-email] Falha ao baixar anexo remoto da URL: ${att.url}`, downloadErr);
        }
      }
    }

    // Configuração do transporter SMTP Google Workspace
    const transporter = nodemailer.createTransport({
      host: 'smtp.gmail.com',
      port: 465,
      secure: true, // SSL na porta 465
      auth: {
        user: senderEmail,
        pass: appPassword,
      },
      connectionTimeout: 20000,
      greetingTimeout: 20000,
      socketTimeout: 35000,
    });

    const toAddresses = Array.isArray(to) ? to.join(', ') : to;

    // Disparo do e-mail
    const info = await transporter.sendMail({
      from: `"${senderName}" <${senderEmail}>`,
      to: toAddresses,
      replyTo: replyTo || senderEmail,
      subject: subject,
      text: text || undefined,
      html: html || undefined,
      attachments: processedAttachments,
    });

    return res.status(200).json({
      success: true,
      messageId: info.messageId,
      accepted: info.accepted,
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
      userHelp = 'Falha de autenticação no Google Workspace. Verifique se o e-mail está correto e utilize uma "Senha de App" de 16 dígitos gerada em Conta Google -> Segurança -> Verificação em duas etapas -> Senhas de App (não use a sua senha pessoal do login normal).';
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
