import { ImapFlow } from 'imapflow';
import { simpleParser } from 'mailparser';

interface FetchEmailsBody {
  action?: 'list' | 'download_attachment';
  email?: string;
  appPassword?: string;
  folder?: 'inbox' | 'sent' | 'starred' | 'drafts' | 'trash';
  limit?: number;
  uid?: number;
  attachmentIndex?: number;
  filename?: string;
}

const FOLDER_CANDIDATES: Record<string, string[]> = {
  inbox: ['INBOX'],
  sent: ['[Gmail]/Sent Mail', '[Gmail]/E-mails enviados', 'Sent', 'INBOX.Sent'],
  starred: ['[Gmail]/Starred', '[Gmail]/Com estrela', 'INBOX'],
  drafts: ['[Gmail]/Drafts', '[Gmail]/Rascunhos', 'Drafts'],
  trash: ['[Gmail]/Trash', '[Gmail]/Lixeira', 'Trash'],
};

async function openTargetMailbox(client: ImapFlow, folder: string): Promise<string> {
  const candidates = FOLDER_CANDIDATES[folder] || ['INBOX'];
  for (const box of candidates) {
    try {
      await client.mailboxOpen(box, { readOnly: true });
      return box;
    } catch {
      // Tenta próximo candidato de pasta
    }
  }
  await client.mailboxOpen('INBOX', { readOnly: true });
  return 'INBOX';
}

export default async function handler(req: any, res: any) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed. Use POST.' });
  }

  let client: ImapFlow | null = null;
  try {
    const body: FetchEmailsBody = typeof req.body === 'string' ? JSON.parse(req.body) : req.body || {};
    const email = (body.email || process.env.GWORKSPACE_USER || 'contato@transcunhaoficial.com.br').trim();
    const cleanPass = (body.appPassword || process.env.GWORKSPACE_APP_PASSWORD || '').replace(/\s+/g, '').trim();
    const folder = body.folder || 'inbox';
    const limit = Math.min(Math.max(Number(body.limit) || 20, 1), 40);

    if (!cleanPass) {
      return res.status(400).json({
        error: 'Senha de App do Google Workspace não configurada.',
        code: 'MISSING_APP_PASSWORD',
      });
    }

    client = new ImapFlow({
      host: 'imap.gmail.com',
      port: 993,
      secure: true,
      auth: {
        user: email,
        pass: cleanPass,
      },
      logger: false,
      connectionTimeout: 15000,
      greetingTimeout: 15000,
      socketTimeout: 25000,
    });

    await client.connect();
    const openedBox = await openTargetMailbox(client, folder);

    if (body.action === 'download_attachment') {
      const uid = Number(body.uid);
      const attachmentIndex = Math.max(0, Number(body.attachmentIndex) || 0);
      if (!uid || isNaN(uid)) {
        await client.logout().catch(() => {});
        return res.status(400).json({ error: 'UID da mensagem inválido para download do anexo.' });
      }

      const msg = await client.fetchOne(String(uid), { source: true }, { uid: true });
      if (!msg || !msg.source) {
        await client.logout().catch(() => {});
        return res.status(404).json({ error: 'Mensagem não encontrada no servidor IMAP.' });
      }

      const parsed = await simpleParser(msg.source as Buffer);
      const attachmentsList = parsed.attachments || [];
      const targetAtt =
        attachmentsList[attachmentIndex] ||
        (body.filename ? attachmentsList.find((a: any) => a.filename === body.filename) : undefined);

      await client.logout().catch(() => {});

      if (!targetAtt || !targetAtt.content) {
        return res.status(404).json({ error: 'Anexo não encontrado nesta mensagem.' });
      }

      return res.status(200).json({
        success: true,
        filename: targetAtt.filename || body.filename || `anexo_${attachmentIndex + 1}`,
        contentType: targetAtt.contentType || 'application/octet-stream',
        sizeBytes: targetAtt.size || targetAtt.content.length,
        base64: targetAtt.content.toString('base64'),
      });
    }

    const totalMessages = client.mailbox ? (client.mailbox as any).exists || 0 : 0;

    if (totalMessages === 0) {
      await client.logout().catch(() => {});
      return res.status(200).json({
        success: true,
        email,
        folder,
        mailbox: openedBox,
        messages: [],
      });
    }

    const startSeq = Math.max(1, totalMessages - limit + 1);
    const range = `${startSeq}:${totalMessages}`;
    const fetched: any[] = [];

    for await (const msg of client.fetch(range, {
      uid: true,
      flags: true,
      envelope: true,
      source: true,
      internalDate: true,
    })) {
      try {
        const parsed = await simpleParser(msg.source as Buffer);
        const fromObj = parsed.from?.value?.[0];
        const fromAddress = fromObj?.address || msg.envelope?.from?.[0]?.address || email;
        const fromName = fromObj?.name || msg.envelope?.from?.[0]?.name || fromAddress;

        const toList = (parsed.to
          ? Array.isArray(parsed.to)
            ? parsed.to.flatMap((t: any) => t.value || [])
            : parsed.to.value || []
          : []
        )
          .map((v: any) => v.address)
          .filter(Boolean);

        const ccList = (parsed.cc
          ? Array.isArray(parsed.cc)
            ? parsed.cc.flatMap((t: any) => t.value || [])
            : parsed.cc.value || []
          : []
        )
          .map((v: any) => v.address)
          .filter(Boolean);

        const bodyText = (parsed.text || '').trim();
        const bodyHtml =
          typeof parsed.html === 'string' && parsed.html.trim()
            ? parsed.html
            : `<p>${bodyText.replace(/\n/g, '<br/>')}</p>`;

        const attachments = (parsed.attachments || []).map((att: any, idx: number) => ({
          id: `imap_att_${msg.uid}_${idx}`,
          filename: att.filename || `anexo_${idx + 1}`,
          sizeBytes: att.size || (att.content ? att.content.length : 0),
          contentType: att.contentType || 'application/octet-stream',
        }));

        const flagsSet: Set<string> = msg.flags || new Set();
        const isRead = flagsSet.has('\\Seen');
        const isStarred = flagsSet.has('\\Flagged');

        const dateIso =
          (parsed.date instanceof Date && !isNaN(parsed.date.getTime())
            ? parsed.date.toISOString()
            : msg.internalDate instanceof Date
            ? msg.internalDate.toISOString()
            : new Date().toISOString());

        fetched.push({
          id: `imap_${email}_${folder}_${msg.uid}`,
          accountId: email,
          accountEmail: email,
          folder,
          from: fromAddress,
          fromName,
          to: toList.length > 0 ? toList : [email],
          cc: ccList.length > 0 ? ccList : undefined,
          subject: parsed.subject || '(Sem assunto)',
          preview: (bodyText || '(Mensagem HTML)').replace(/\s+/g, ' ').slice(0, 140),
          bodyHtml,
          bodyText: bodyText || '(Visualize em HTML)',
          date: dateIso,
          isRead,
          isStarred,
          hasAttachments: attachments.length > 0,
          attachments: attachments.length > 0 ? attachments : undefined,
          priority: 'normal',
        });
      } catch (parseErr) {
        console.warn('[fetch-emails] Erro ao processar mensagem UID:', msg.uid, parseErr);
      }
    }

    await client.logout().catch(() => {});

    fetched.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    return res.status(200).json({
      success: true,
      email,
      folder,
      mailbox: openedBox,
      totalInMailbox: totalMessages,
      messages: fetched,
    });
  } catch (err: any) {
    if (client) {
      await client.logout().catch(() => {});
    }
    const errorMessage = err?.message || 'Erro ao sincronizar IMAP com o Gmail / Google Workspace';
    let userHelp = '';
    if (
      errorMessage.includes('AUTHENTICATIONFAILED') ||
      errorMessage.includes('Invalid credentials') ||
      errorMessage.includes('Command failed')
    ) {
      userHelp =
        'Falha de autenticação IMAP no Gmail. Verifique se a Senha de App de 16 caracteres pertence à mesma conta e se o acesso IMAP está ativado no Gmail.';
    }
    return res.status(500).json({
      error: errorMessage,
      userHelp: userHelp || undefined,
    });
  }
}
