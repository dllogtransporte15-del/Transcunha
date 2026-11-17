/**
 * Endpoint Serverless (Vercel / Railway / Node): Proxy Universal para a API do SIGA GR
 * Rota: /api/siga-gr/proxy
 * 
 * Permite realizar chamadas GET, POST, PUT, DELETE sem restrições de CORS no navegador,
 * repassando tokens de autenticação Bearer, arquivos multipart e cabeçalhos de resposta.
 */

export default async function handler(req: any, res: any) {
  // Configuração de CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-siga-endpoint, x-siga-target, Accept');
  res.setHeader('Access-Control-Expose-Headers', 'Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    const rawEndpoint = req.headers['x-siga-endpoint'] || req.query?.endpoint || '';
    const endpoint = String(rawEndpoint).startsWith('/') ? String(rawEndpoint) : `/${rawEndpoint}`;
    const targetHost = req.headers['x-siga-target'] || req.query?.target || 'https://api.sigagr.com.br';
    const targetUrl = `${String(targetHost).replace(/\/$/, '')}${endpoint}`;

    const headers: Record<string, string> = {
      Accept: 'application/json',
    };

    if (req.headers['authorization']) {
      headers['Authorization'] = String(req.headers['authorization']);
    }

    const contentType = req.headers['content-type'];
    if (contentType) {
      headers['Content-Type'] = String(contentType);
    }

    const options: any = {
      method: req.method,
      headers,
    };

    if (['POST', 'PUT', 'PATCH'].includes(req.method)) {
      if (typeof req.body === 'string') {
        options.body = req.body;
      } else if (req.body && Buffer.isBuffer(req.body)) {
        options.body = req.body;
      } else if (req.body) {
        options.body = JSON.stringify(req.body);
      }
    }

    const upstreamResponse = await fetch(targetUrl, options);

    // Repassa cabeçalho Authorization se o SIGA GR retornou (ex: no login)
    const authHeader = upstreamResponse.headers.get('authorization');
    if (authHeader) {
      res.setHeader('Authorization', authHeader);
    }

    const resContentType = upstreamResponse.headers.get('content-type') || 'application/json';
    res.setHeader('Content-Type', resContentType);

    const responseText = await upstreamResponse.text();
    return res.status(upstreamResponse.status).send(responseText);
  } catch (err: any) {
    console.error('[API Proxy SIGA GR] Erro:', err);
    return res.status(502).json({
      error: 'Falha ao comunicar com o servidor do SIGA GR',
      details: err?.message || String(err),
    });
  }
}
