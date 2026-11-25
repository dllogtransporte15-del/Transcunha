import path from 'path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  server: {
    port: 3000,
    host: '0.0.0.0',
    proxy: {
      '/api/evolution': {
        target: 'https://evolution-api-production-2e84c515.up.railway.app',
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/api\/evolution/, '')
      }
    }
  },
  plugins: [
    react(),
    {
      name: 'unshorten-url-endpoint',
      configureServer(server) {
        server.middlewares.use('/api/unshorten', async (req, res) => {
          const parsedUrl = new URL(req.url || '', 'http://localhost');
          const targetUrl = parsedUrl.searchParams.get('url');
          if (!targetUrl) {
            res.statusCode = 400;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ error: 'url parameter required' }));
            return;
          }
          try {
            const fetchRes = await fetch(targetUrl, { redirect: 'follow' });
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ originalUrl: targetUrl, resolvedUrl: fetchRes.url }));
          } catch (err: any) {
            res.statusCode = 500;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ error: err?.message || 'Failed to unshorten', originalUrl: targetUrl }));
          }
        });
      }
    },
    {
      name: 'rdo-nacional-proxy-endpoint',
      configureServer(server) {
        server.middlewares.use('/api/rdo-nacional/solicitacoes', async (req, res) => {
          if (req.method === 'OPTIONS') {
            res.setHeader('Access-Control-Allow-Origin', '*');
            res.setHeader('Access-Control-Allow-Headers', '*');
            res.statusCode = 200;
            res.end();
            return;
          }
          if (req.method !== 'POST') {
            res.statusCode = 405;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ error: 'Method not allowed' }));
            return;
          }

          let bodyStr = '';
          req.on('data', chunk => { bodyStr += chunk; });
          req.on('end', async () => {
            const token = req.headers['x-access-token'] || process.env.VITE_RDO_API_TOKEN || 'JsVKPmVPjYQgBpuOgC3EZTTYAEXYG7lXMHtTj83SSU0';
            try {
              const upstream = await fetch('https://painel.mrbsolucoes.com.br/api/integracao/solicitacoes', {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  'x-access-token': String(token || '').trim(),
                },
                body: bodyStr,
              });
              const data = await upstream.text();
              res.statusCode = upstream.status;
              res.setHeader('Content-Type', 'application/json');
              res.end(data);
            } catch (err: any) {
              res.statusCode = 502;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ error: err?.message || 'Upstream connection error' }));
            }
          });
        });

        // Webhook local receiver para teste do parecer do RDO Nacional
        server.middlewares.use('/api/rdo-nacional/parecer', async (req, res) => {
          if (req.method === 'OPTIONS') {
            res.setHeader('Access-Control-Allow-Origin', '*');
            res.setHeader('Access-Control-Allow-Headers', '*');
            res.statusCode = 200;
            res.end();
            return;
          }
          if (req.method !== 'POST') {
            res.statusCode = 405;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ error: 'Method not allowed' }));
            return;
          }

          let bodyStr = '';
          req.on('data', chunk => { bodyStr += chunk; });
          req.on('end', async () => {
            try {
              const body = JSON.parse(bodyStr || '{}');
              res.setHeader('Content-Type', 'application/json');
              res.statusCode = 200;
              res.end(JSON.stringify({
                success: true,
                message: 'Parecer recebido e simulado no ambiente local de desenvolvimento',
                data: body,
              }));
            } catch (err: any) {
              res.statusCode = 400;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ error: 'JSON inválido no corpo da requisição' }));
            }
          });
        });
      }
    },
    {
      name: 'siga-gr-proxy-endpoint',
      configureServer(server) {
        server.middlewares.use('/api/siga-gr/proxy', async (req, res) => {
          res.setHeader('Access-Control-Allow-Origin', '*');
          res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
          res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-siga-endpoint, x-siga-target, Accept');
          res.setHeader('Access-Control-Expose-Headers', 'Authorization');

          if (req.method === 'OPTIONS') {
            res.statusCode = 200;
            res.end();
            return;
          }

          const parsedUrl = new URL(req.url || '', 'http://localhost');
          const rawEndpoint = req.headers['x-siga-endpoint'] || parsedUrl.searchParams.get('endpoint') || '';
          const endpoint = String(rawEndpoint).startsWith('/') ? String(rawEndpoint) : `/${rawEndpoint}`;
          const targetHost = req.headers['x-siga-target'] || parsedUrl.searchParams.get('target') || 'https://api.sigagr.com.br';
          const targetUrl = `${String(targetHost).replace(/\/$/, '')}${endpoint}`;

          const chunks: any[] = [];
          req.on('data', chunk => { chunks.push(chunk); });
          req.on('end', async () => {
            const bodyBuffer = Buffer.concat(chunks);
            const headers: Record<string, string> = {
              Accept: 'application/json',
            };
            if (req.headers['authorization']) {
              headers['Authorization'] = String(req.headers['authorization']);
            }
            if (req.headers['content-type']) {
              headers['Content-Type'] = String(req.headers['content-type']);
            }

            try {
              const fetchOptions: any = {
                method: req.method,
                headers,
              };
              if (['POST', 'PUT', 'PATCH'].includes(req.method || '') && bodyBuffer.length > 0) {
                fetchOptions.body = bodyBuffer;
              }

              const upstream = await fetch(targetUrl, fetchOptions);
              const authHeader = upstream.headers.get('authorization');
              if (authHeader) {
                res.setHeader('Authorization', authHeader);
              }

              const resContentType = upstream.headers.get('content-type') || 'application/json';
              res.setHeader('Content-Type', resContentType);
              res.statusCode = upstream.status;

              const responseBuffer = await upstream.arrayBuffer();
              res.end(Buffer.from(responseBuffer));
            } catch (err: any) {
              res.statusCode = 502;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ error: err?.message || 'Upstream connection error to SIGA GR' }));
            }
          });
        });
      }
    },
    {
      name: 'send-email-endpoint',
      configureServer(server) {
        server.middlewares.use('/api/send-email', async (req, res) => {
          res.setHeader('Access-Control-Allow-Origin', '*');
          res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
          res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

          if (req.method === 'OPTIONS') {
            res.statusCode = 200;
            res.end();
            return;
          }

          if (req.method !== 'POST') {
            res.statusCode = 405;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ error: 'Method not allowed. Use POST.' }));
            return;
          }

          const chunks: any[] = [];
          req.on('data', chunk => { chunks.push(chunk); });
          req.on('end', async () => {
            try {
              const bodyStr = Buffer.concat(chunks).toString('utf-8');
              const body = JSON.parse(bodyStr || '{}');

              const {
                to,
                cc,
                subject,
                html,
                text,
                senderEmail: customSender,
                senderName = 'Transcunha Transportes e Logística',
                replyTo,
                appPassword: customPassword,
                attachments = [],
              } = body;

              if (!to) {
                res.statusCode = 400;
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({ error: 'Destinatário (to) é obrigatório.' }));
                return;
              }

              const senderEmail = (customSender || process.env.GWORKSPACE_USER || 'contato@transcunhaoficial.com.br').trim();
              const effectiveAuthUser = (body.authUser || process.env.GWORKSPACE_USER || senderEmail || 'contato@transcunhaoficial.com.br').trim();
              const rawPassword = (customPassword || process.env.GWORKSPACE_APP_PASSWORD || '').trim();
              const appPassword = rawPassword.replace(/\s+/g, '');

              if (!appPassword) {
                res.statusCode = 400;
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({
                  error: 'Senha de App do Google Workspace não configurada.',
                  code: 'MISSING_APP_PASSWORD'
                }));
                return;
              }

              const attachmentResults = await Promise.all(
                attachments.map(async (att: any) => {
                  if (att.base64 || att.content) {
                    const raw = (att.base64 || att.content || '').replace(/^data:[^;]+;base64,/, '');
                    return {
                      filename: att.filename || 'anexo.pdf',
                      content: Buffer.from(raw, 'base64'),
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
              const processedAttachments: any[] = attachmentResults.filter(Boolean);

              let finalHtml = html;
              if (typeof finalHtml === 'string' && finalHtml.includes('data:image/')) {
                let cidIdx = 0;
                finalHtml = finalHtml.replace(
                  /(src=["'])(data:image\/([a-zA-Z0-9+.-]+);base64,([^"']+))(["'])/g,
                  (_match: string, prefix: string, _dataUri: string, extRaw: string, b64Data: string, suffix: string) => {
                    const ext = extRaw.toLowerCase().replace('jpeg', 'jpg').replace(/[^a-z0-9]/g, '') || 'png';
                    const cid = `transcunha_inline_${cidIdx++}@transcunhaoficial.com.br`;
                    processedAttachments.push({
                      filename: `logo_transcunha_${cidIdx}.${ext}`,
                      content: Buffer.from(b64Data, 'base64'),
                      contentType: `image/${extRaw}`,
                      cid,
                      contentDisposition: 'inline',
                    });
                    return `${prefix}cid:${cid}${suffix}`;
                  }
                );
              }

              const nodemailerModule = await import('nodemailer');
              const nodemailer = nodemailerModule.default || nodemailerModule;

              const rawTo = Array.isArray(to) ? to.join(',') : String(to || '');
              const toAddresses = rawTo
                .split(/[;,]/)
                .map((addr) => addr.trim())
                .filter(Boolean)
                .join(', ');

              if (!toAddresses) {
                res.statusCode = 400;
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({ error: 'Nenhum endereço de destinatário válido informado.' }));
                return;
              }

              const rawCc = Array.isArray(cc) ? cc.join(',') : (cc || '');
              const ccAddresses = rawCc
                .split(/[;,]/)
                .map((addr: string) => addr.trim())
                .filter(Boolean)
                .join(', ');

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
                const transporter465 = createTransporter(465, true);
                info = await transporter465.sendMail({
                  from: `"${senderName}" <${senderEmail}>`,
                  to: toAddresses,
                  cc: ccAddresses || undefined,
                  replyTo: replyTo || senderEmail,
                  subject,
                  text: text || undefined,
                  html: finalHtml || undefined,
                  attachments: processedAttachments,
                });
              } catch (primaryErr: any) {
                const msg = primaryErr?.message || '';
                if (
                  msg.includes('ETIMEDOUT') ||
                  msg.includes('ECONNREFUSED') ||
                  msg.includes('ESOCKET') ||
                  msg.includes('greeting') ||
                  primaryErr?.code === 'ECONNECTION'
                ) {
                  console.warn('[vite:send-email] Porta 465 falhou, tentando fallback porta 587 (TLS)...', primaryErr);
                  const transporter587 = createTransporter(587, false);
                  info = await transporter587.sendMail({
                    from: `"${senderName}" <${senderEmail}>`,
                    to: toAddresses,
                    cc: ccAddresses || undefined,
                    replyTo: replyTo || senderEmail,
                    subject,
                    text: text || undefined,
                    html: finalHtml || undefined,
                    attachments: processedAttachments,
                  });
                } else {
                  throw primaryErr;
                }
              }

              if (!info.accepted || info.accepted.length === 0) {
                res.statusCode = 502;
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({
                  error: 'O servidor SMTP não aceitou nenhum endereço de destinatário.',
                  rejected: info.rejected,
                }));
                return;
              }

              res.statusCode = 200;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({
                success: true,
                messageId: info.messageId,
                accepted: info.accepted,
                rejected: info.rejected,
                totalAttachments: processedAttachments.length,
                sender: senderEmail,
              }));
            } catch (err: any) {
              const errorMessage = err?.message || 'Erro ao enviar e-mail';
              let userHelp = '';
              if (errorMessage.includes('Invalid login') || errorMessage.includes('535')) {
                userHelp = 'Falha de autenticação no Google Workspace. Verifique se o e-mail está correto e utilize uma "Senha de App" de 16 dígitos.';
              }
              res.statusCode = 500;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({
                error: errorMessage,
                userHelp,
              }));
            }
          });
        });
      }
    },
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['vite.svg'],
      manifest: {
        name: 'Transcunha Logística',
        short_name: 'Transcunha',
        description: 'Sistema de Gestão Transcunha',
        theme_color: '#0B66E4',
        background_color: '#F8FAFC',
        display: 'standalone',
        icons: [
          {
            src: '/vite.svg',
            sizes: '192x192',
            type: 'image/svg+xml'
          },
          {
            src: '/vite.svg',
            sizes: '512x512',
            type: 'image/svg+xml'
          }
        ]
      },
      workbox: {
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
        navigateFallbackDenylist: [/^\/api\//],
      },
      devOptions: {
        enabled: true
      }
    })
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    }
  },
  build: {
    chunkSizeWarningLimit: 1200,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules')) {
            if (id.includes('pdfjs-dist') || id.includes('jspdf') || id.includes('jspdf-autotable') || id.includes('html2canvas')) {
              return 'pdf-vendor';
            }
            if (id.includes('leaflet') || id.includes('react-leaflet') || id.includes('@vis.gl/react-google-maps')) {
              return 'geo-vendor';
            }
            if (id.includes('lucide-react')) {
              return 'icons-vendor';
            }
            if (id.includes('@supabase')) {
              return 'supabase-vendor';
            }
            if (id.includes('react') || id.includes('react-dom') || id.includes('react-router-dom')) {
              return 'react-vendor';
            }
          }
        }
      }
    }
  }
});
