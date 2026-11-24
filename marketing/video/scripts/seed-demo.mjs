// Loads believable demo data into a LOCAL platin through its public API, shaped for the video's
// story ("El saldo te engaña"): this month the card statement, the rent and the bills are still to
// pay, and part of the salary went to the trip savings. The home's "Te quedan para gastar" is what
// is left of the balance after those three.
// Idempotent: if the demo user exists, it signs in, wipes its data ("Empezar de cero") and reloads.
//
//   node scripts/seed-demo.mjs            (API at http://localhost:3000)
//   API_URL=http://localhost:4200 node scripts/seed-demo.mjs
//
// Never point this at production: it creates a user and resets it.
import { writeFile } from 'node:fs/promises';
import { DEMO } from './demo-user.mjs';

const API = `${process.env.API_URL ?? 'http://localhost:3000'}/api/v1`;
if (!/localhost|127\.0\.0\.1/.test(API)) {
  throw new Error(`Refusing to seed a non-local API: ${API}`);
}

let token = '';

async function call(method, path, body) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) {
    const err = new Error(`${method} ${path} → ${res.status} ${text}`);
    err.status = res.status;
    throw err;
  }
  return data;
}

/** Today in Buenos Aires, as YYYY-MM-DD (the API uses the same zone). */
function today() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' }).format(
    new Date(),
  );
}
function shiftDays(date, days) {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
const period = (date) => date.slice(0, 7);
const day = (date) => Number(date.slice(8, 10));
const lastDay = (date) => {
  const [y, m] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
};

async function signIn() {
  try {
    ({ accessToken: token } = await call('POST', '/auth/register', DEMO));
    console.log('Registered', DEMO.email);
  } catch (e) {
    if (e.status !== 409) throw e;
    ({ accessToken: token } = await call('POST', '/auth/login', {
      email: DEMO.email,
      password: DEMO.password,
    }));
    await call('POST', '/users/me/reset', {
      confirmEmail: DEMO.email,
      password: DEMO.password,
      keepCategories: true,
    });
    console.log('Signed in and reset', DEMO.email);
  }
}

async function main() {
  const t = today();
  // The story needs the statement to have closed and still be due this month, and some days
  // left after today for the rent and the bills.
  if (day(t) < 18 || day(t) > lastDay(t) - 2) {
    console.warn(
      `Warning: today (${t}) is outside the 18th–${lastDay(t) - 2}th window the story was ` +
        'designed for; the statement or the bills may fall in another month.',
    );
  }

  await signIn();
  await call('PATCH', '/users/me', { currencies: ['ARS'] });
  for (const step of ['accounts', 'cards', 'cardCharges', 'fixed']) {
    await call('PATCH', `/onboarding/steps/${step}`, { status: 'DONE' });
  }
  await call('POST', '/onboarding/dismiss');

  const list = await call('GET', '/categories');
  const categories = Array.isArray(list) ? list : list.items;
  const cat = (kind, ...names) => {
    const found = categories.find(
      (c) => c.kind === kind && !c.archived && names.some((n) => c.name.toLowerCase().includes(n)),
    );
    if (!found) throw new Error(`No ${kind} category named ${names.join(' / ')}`);
    return found.id;
  };

  // Accounts: the bank with the trip savings, and a wallet.
  const bank = await call('POST', '/accounts', {
    name: 'Banco Galicia',
    kind: 'BANK',
    color: 'brand',
    initialBalance: '185400.00',
  });
  const pesos = bank.pockets.find((p) => p.kind === 'AVAILABLE');
  const trip = await call('POST', `/accounts/${bank.id}/pockets`, {
    name: 'Viaje',
    kind: 'SAVINGS',
    currency: 'ARS',
    initialBalance: '1550000.00',
  });
  await call('POST', '/accounts', {
    name: 'Mercado Pago',
    kind: 'WALLET',
    color: 'transfer',
    initialBalance: '86400.00',
  });

  // Salary this month (collected), and as a fixed income from next month.
  const thisMonth = period(t);
  const nextMonth = period(shiftDays(`${thisMonth}-28`, 7));
  await call('POST', '/transactions', {
    type: 'INCOME',
    pocketId: pesos.id,
    categoryId: cat('INCOME', 'sueldo'),
    amount: '1450000.00',
    date: `${thisMonth}-01`,
    description: 'Sueldo',
  });
  await call('POST', '/fixed', {
    kind: 'INCOME',
    name: 'Sueldo',
    categoryId: cat('INCOME', 'sueldo'),
    pocketId: pesos.id,
    amount: '1450000.00',
    dayOfMonth: 1,
    startPeriod: nextMonth,
  });

  // Problem 3: what goes to the trip this month.
  await call('POST', '/transfers', {
    fromPocketId: pesos.id,
    toPocketId: trip.id,
    amountOut: '250000.00',
    date: `${thisMonth}-02`,
    description: 'Ahorro para el viaje',
  });

  // Problem 2: rent and bills, still to pay this month.
  const billsDay = Math.min(lastDay(t), Math.max(day(t) + 2, 25));
  await call('POST', '/fixed', {
    kind: 'EXPENSE',
    name: 'Alquiler',
    categoryId: cat('EXPENSE', 'alquiler'),
    pocketId: pesos.id,
    amount: '520000.00',
    dayOfMonth: lastDay(t),
    startPeriod: thisMonth,
  });
  await call('POST', '/fixed', {
    kind: 'EXPENSE',
    name: 'Luz, gas e internet',
    categoryId: cat('EXPENSE', 'servicios'),
    pocketId: pesos.id,
    amount: '68000.00',
    dayOfMonth: billsDay,
    startPeriod: thisMonth,
  });

  // Problem 1: the card statement that closed on the 15th and is due on the 28th.
  const card = await call('POST', '/cards', {
    name: 'Visa Galicia',
    issuer: 'Visa',
    last4: '4821',
    creditLimit: '2500000.00',
    closingDay: 15,
    dueDay: 28,
    defaultPaymentPocketId: pesos.id,
  });
  const charge = (body) => call('POST', `/cards/${card.id}/charges`, body);
  const closed = (d) => `${thisMonth}-${String(d).padStart(2, '0')}`;
  await charge({
    date: closed(8),
    description: 'Zapatillas',
    categoryId: cat('EXPENSE', 'ropa'),
    totalAmount: '189000.00',
    currency: 'ARS',
    installmentsCount: 6,
  });
  await charge({
    date: closed(10),
    description: 'Super',
    categoryId: cat('EXPENSE', 'supermercado'),
    totalAmount: '48320.00',
    currency: 'ARS',
  });
  await charge({
    date: closed(12),
    description: 'Cena',
    categoryId: cat('EXPENSE', 'salidas'),
    totalAmount: '36500.00',
    currency: 'ARS',
  });
  // Plans already running: their installment is in the statement that closed.
  await charge({
    date: closed(3),
    description: 'Heladera',
    categoryId: cat('EXPENSE', 'otros gastos'),
    installmentAmount: '74990.00',
    currency: 'ARS',
    installmentsCount: 12,
    startInstallment: 4,
    startStatement: 'PREVIOUS',
  });
  await charge({
    date: closed(5),
    description: 'Celular',
    categoryId: cat('EXPENSE', 'otros gastos'),
    installmentAmount: '62500.00',
    currency: 'ARS',
    installmentsCount: 3,
    startInstallment: 2,
    startStatement: 'PREVIOUS',
  });
  await call('POST', '/fixed', {
    kind: 'EXPENSE',
    name: 'Streaming',
    categoryId: cat('EXPENSE', 'suscripciones'),
    cardId: card.id,
    currency: 'ARS',
    amount: '12999.00',
    dayOfMonth: 8,
    startPeriod: nextMonth,
  });

  // The trip: 1.800.000 of 3.000.000 = 60 %.
  await call('POST', '/goals', {
    name: 'Viaje',
    targetAmount: '3000000.00',
    currency: 'ARS',
    targetPeriod: period(shiftDays(t, 240)),
    pocketIds: [trip.id],
  });

  // The story's numbers, straight from the home: the video reads them (public/captures/story.json).
  const dash = await call('GET', '/dashboard');
  const total = (type) =>
    dash.toPayItems.filter((i) => i.type === type).reduce((acc, i) => acc + Number(i.amount), 0);
  const story = {
    today: t,
    /** The balance before setting the trip money apart: what "the balance" looks like. */
    balance: Number(dash.inAccounts) + Number(dash.reserved),
    card: total('STATEMENT'),
    fixed: total('FIXED'),
    saved: Number(dash.reserved),
    free: Number(dash.free),
    perDay: Number(dash.perDay),
  };
  if (story.balance - story.card - story.fixed - story.saved !== story.free || Number(dash.toCollect) !== 0) {
    throw new Error(`The story does not add up: ${JSON.stringify(story)}`);
  }
  await writeFile(new URL('../public/captures/story.json', import.meta.url), `${JSON.stringify(story, null, 2)}\n`);
  console.log(story);
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
