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
            const token = req.headers['x-access-token'] || process.env.VITE_RDO_API_TOKEN;
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
          const targetHost = req.headers['x-siga-target'] || parsedUrl.searchParams.get('target') || 'https://api.staging.sigagr.com.br';
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
