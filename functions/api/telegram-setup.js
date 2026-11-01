// Temporary, authenticated setup only. This is not a public enquiry endpoint.
const reply = (data, status = 200) => Response.json(data, {status, headers: {
  'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex',
  'X-Content-Type-Options': 'nosniff'
}});
const normalise = value => String(value).trim().toLowerCase().replace(/\s+/g, ' ');
export async function onRequest({request, env}) {
  if (request.method !== 'POST') return reply({error: 'not_found'}, 404);
  let setup;
  try { setup = JSON.parse(env.ICAPACITY_TELEGRAM_SETUP_SESSION || '{}'); }
  catch { return reply({error: 'setup_disabled'}, 503); }
  if (typeof setup.key !== 'string' || setup.key.length < 40 ||
      !Number.isFinite(setup.expires) || Date.now() >= setup.expires) {
    return reply({error: 'setup_disabled'}, 503);
  }
  const given = request.headers.get('Authorization') || '';
  const digest = async s => new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)));
  const a = await digest(given), b = await digest('Bearer ' + setup.key);
  let difference = 0;
  for (let i = 0; i < a.length; i++) difference |= a[i] ^ b[i];
  if (difference) return reply({error: 'unauthorized'}, 401);
  const token = env.ICAPACITY_TELEGRAM_BOT_TOKEN || env['ICAPACITY_TELEGRAM_BOT_TOKEN.'];
  if (!token || !/^\d{6,}:[A-Za-z0-9_-]{20,}$/.test(token)) {
    return reply({error: 'bot_token_missing_or_invalid'}, 503);
  }
  let activeMethod = 'none';
  const api = async (method, body = {}) => {
    activeMethod = method;
    const response = await fetch('https://api.telegram.org/bot' + token + '/' + method, {
      method: 'POST', headers: {'Content-Type': 'application/json'},
      body: JSON.stringify(body), redirect: 'manual', signal: AbortSignal.timeout(10000)
    });
    const data = await response.json();
    if (!response.ok || !data.ok) throw Object.assign(new Error('telegram_rejected'), {method, code: response.status});
    return data.result;
  };
  try {
    const bot = await api('getMe');
    if (normalise(bot.username) !== 'icapacity_enquires_bot') return reply({error: 'wrong_bot'}, 409);
    const webhook = await api('getWebhookInfo');
    if (webhook.url) return reply({error: 'existing_webhook_requires_review'}, 409);
    const updates = await api('getUpdates', {timeout: 0, limit: 100});
    const groups = new Map();
    for (const update of updates) {
      const m = update.message;
      if (!m || !['group', 'supergroup'].includes(m.chat?.type)) continue;
      if (normalise(m.chat.title) !== normalise('Icapacity - request -заявки')) continue;
      if (!/^\/icapacity_connect@icapacity_enquires_bot\s*$/i.test(m.text || '')) continue;
      if (Math.abs(Date.now() / 1000 - m.date) > 3600) continue;
      groups.set(String(m.chat.id), m.chat);
    }
    if (!groups.size) return reply({error: 'send_group_connect_command'}, 409);
    if (groups.size !== 1) return reply({error: 'ambiguous_group'}, 409);
    const [chatId, chat] = groups.entries().next().value;
    const message = await api('sendMessage', {
      chat_id: chatId,
      text: 'ICAPACITY · тест подключения сайта к Telegram.\nТестовое уведомление без данных клиентов. Формы сайта пока отключены.',
      protect_content: true
    });
    return reply({ok: true, bot: bot.username, chat_id: chatId,
      group_title: chat.title, message_id: message.message_id});
  } catch (error) {
    return reply({error: 'telegram_' + (error.method || activeMethod) + '_' + (Number(error.code) || (['TypeError','SyntaxError','TimeoutError','AbortError'].includes(error.name) ? error.name : 'network'))}, 502);
  }
}
