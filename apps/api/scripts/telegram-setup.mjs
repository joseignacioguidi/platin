// Configures the Telegram bot (BOT-05, ADR 0026): the webhook straight to Render, with its
// secret_token and only the updates the bot reads, and the list of commands.
//
//   pnpm nx run api:telegram-setup --args="--url=https://<render-service>.onrender.com"
//
// Reads TELEGRAM_BOT_TOKEN and TELEGRAM_WEBHOOK_SECRET from the environment (Nx loads .env).
// The URL can also come from TELEGRAM_WEBHOOK_BASE_URL.

const COMMANDS = [
  { command: 'libre', description: 'Cuánto te queda para gastar este mes' },
  { command: 'hoy', description: 'Lo que cargaste hoy' },
  { command: 'pendientes', description: 'Movimientos para confirmar' },
  { command: 'proximos', description: 'Tus próximos pagos' },
  { command: 'deshacer', description: 'Borrar lo último que cargaste desde acá' },
  { command: 'ayuda', description: 'Cómo escribir un gasto' },
  { command: 'desvincular', description: 'Desvincular este chat' },
];

const token = process.env.TELEGRAM_BOT_TOKEN;
const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
const urlArg = process.argv.find((arg) => arg.startsWith('--url='))?.slice(6);
const base = (urlArg ?? process.env.TELEGRAM_WEBHOOK_BASE_URL ?? '').replace(/\/+$/, '');

if (!token || !secret || !base) {
  console.error('Missing TELEGRAM_BOT_TOKEN, TELEGRAM_WEBHOOK_SECRET or --url=<API base URL>.');
  process.exit(1);
}
if (!base.startsWith('https://')) {
  console.error('Telegram only calls https webhooks.');
  process.exit(1);
}

async function call(method, body) {
  const response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  const json = await response.json();
  if (!json.ok) throw new Error(`${method}: ${json.description}`);
  console.log(`${method}: ok`);
}

await call('setWebhook', {
  url: `${base}/api/v1/telegram/webhook`,
  secret_token: secret,
  allowed_updates: ['message', 'callback_query'],
  drop_pending_updates: false,
});
await call('setMyCommands', { commands: COMMANDS });
