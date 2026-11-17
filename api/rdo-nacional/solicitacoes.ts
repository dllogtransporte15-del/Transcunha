/**
 * Endpoint Vercel Serverless: Proxy de Envio de Solicitação para o RDO Nacional
 * Rota: POST /api/rdo-nacional/solicitacoes
 * 
 * Encaminha para: https://painel.mrbsolucoes.com.br/api/integracao/solicitacoes
 * Evita bloqueios de CORS no navegador e preserva o token de integração.
 */
export default async function handler(req: any, res: any) {
  // CORS Headers para permitir chamadas do frontend
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-access-token');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed. Use POST.' });
  }

  const token = 
    req.headers['x-access-token'] || 
    req.headers['authorization']?.replace(/^Bearer\s+/i, '') || 
    req.query?.token ||
    (typeof req.body === 'object' && req.body?.apiToken) ||
    process.env.VITE_RDO_API_TOKEN || 
    process.env.RDO_API_TOKEN ||
    'JsVKPmVPjYQgBpuOgC3EZTTYAEXYG7lXMHtTj83SSU0';

  if (!token) {
    return res.status(401).json({ 
      error: 'Token de integração ausente. Forneça o cabeçalho x-access-token.' 
    });
  }

  // Remove apiToken do body se tiver sido enviado
  let sanitizedBody: any = req.body;
  if (typeof sanitizedBody === 'object' && sanitizedBody !== null) {
    const { apiToken, ...rest } = sanitizedBody;
    sanitizedBody = rest;
  }

  const host = process.env.RDO_HOST || 'https://painel.mrbsolucoes.com.br';
  const targetUrl = `${host}/api/integracao/solicitacoes`;

  try {
    const upstreamResponse = await fetch(targetUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-access-token': String(token).trim(),
      },
      body: typeof sanitizedBody === 'string' ? sanitizedBody : JSON.stringify(sanitizedBody),
    });

    const data = await upstreamResponse.json().catch(() => ({}));

    return res.status(upstreamResponse.status).json(data);
  } catch (err: any) {
    console.error('[API Proxy RDO Solicitacoes] Erro:', err);
    return res.status(502).json({
      error: 'Falha ao comunicar com o servidor do RDO Nacional',
      details: err?.message || String(err),
    });
  }
}
