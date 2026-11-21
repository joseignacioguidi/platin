// Loads believable demo data into a LOCAL platin through its public API.
// Idempotent: if the demo user exists, it signs in, wipes its data ("Empezar de cero") and reloads.
//
//   node scripts/seed-demo.mjs            (API at http://localhost:3000)
//   API_URL=http://localhost:4200 node scripts/seed-demo.mjs
//
// Never point this at production: it creates a user and resets it.
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
  await signIn();
  await call('PATCH', '/users/me', { currencies: ['ARS', 'USD'] });
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

  const t = today();

  // Accounts: a bank with pesos, dollars and the trip savings; a wallet.
  const bank = await call('POST', '/accounts', {
    name: 'Banco Galicia',
    kind: 'BANK',
    color: 'brand',
    initialBalance: '185400.00',
  });
  const pesos = bank.pockets.find((p) => p.kind === 'AVAILABLE');
  const dollars = await call('POST', `/accounts/${bank.id}/pockets`, {
    name: 'Dólares',
    kind: 'AVAILABLE',
    currency: 'USD',
    initialBalance: '320.00',
  });
  const trip = await call('POST', `/accounts/${bank.id}/pockets`, {
    name: 'Viaje',
    kind: 'SAVINGS',
    currency: 'USD',
    initialBalance: '1800.00',
  });
  await call('POST', '/accounts', {
    name: 'Mercado Pago',
    kind: 'WALLET',
    color: 'transfer',
    initialBalance: '86400.00',
  });

  // Salary this month, and as a fixed income for the commitments' margin.
  await call('POST', '/transactions', {
    type: 'INCOME',
    pocketId: pesos.id,
    categoryId: cat('INCOME', 'sueldo', 'salario'),
    amount: '1450000.00',
    date: `${period(t)}-01`,
    description: 'Sueldo',
  });
  const nextMonth = period(shiftDays(`${period(t)}-28`, 7));
  await call('POST', '/fixed', {
    kind: 'INCOME',
    name: 'Sueldo',
    categoryId: cat('INCOME', 'sueldo', 'salario'),
    pocketId: pesos.id,
    amount: '1450000.00',
    dayOfMonth: 1,
    startPeriod: nextMonth,
  });
  await call('POST', '/fixed', {
    kind: 'EXPENSE',
    name: 'Alquiler',
    categoryId: cat('EXPENSE', 'alquiler'),
    pocketId: pesos.id,
    amount: '520000.00',
    dayOfMonth: 10,
    startPeriod: nextMonth,
  });

  // The card and its purchases.
  const card = await call('POST', '/cards', {
    name: 'Visa Galicia',
    issuer: 'Visa',
    last4: '4821',
    creditLimit: '2500000.00',
    closingDay: 26,
    dueDay: 5,
    defaultPaymentPocketId: pesos.id,
  });
  const charge = (body) => call('POST', `/cards/${card.id}/charges`, body);
  await charge({
    date: shiftDays(t, -2),
    description: 'Super',
    categoryId: cat('EXPENSE', 'supermercado'),
    totalAmount: '48320.00',
    currency: 'ARS',
  });
  await charge({
    date: shiftDays(t, -1),
    description: 'Zapatillas',
    categoryId: cat('EXPENSE', 'ropa'),
    totalAmount: '189000.00',
    currency: 'ARS',
    installmentsCount: 6,
  });
  await charge({
    date: shiftDays(t, -3),
    description: 'Cena',
    categoryId: cat('EXPENSE', 'salidas'),
    totalAmount: '36500.00',
    currency: 'ARS',
  });
  await charge({
    date: shiftDays(t, -20),
    description: 'Heladera',
    categoryId: cat('EXPENSE', 'otros gastos'),
    installmentAmount: '74990.00',
    currency: 'ARS',
    installmentsCount: 12,
    startInstallment: 4,
  });
  await charge({
    date: shiftDays(t, -10),
    description: 'Celular',
    categoryId: cat('EXPENSE', 'otros gastos'),
    installmentAmount: '62500.00',
    currency: 'ARS',
    installmentsCount: 3,
    startInstallment: 2,
  });
  await charge({
    date: shiftDays(t, -5),
    description: 'Vuelo',
    categoryId: cat('EXPENSE', 'transporte'),
    totalAmount: '420.00',
    currency: 'USD',
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

  // The "Viaje" goal: 1.800 of 3.000 dollars = 60 %.
  const targetPeriod = period(shiftDays(t, 240));
  await call('POST', '/goals', {
    name: 'Viaje',
    targetAmount: '3000.00',
    currency: 'USD',
    targetPeriod,
    pocketIds: [trip.id],
  });

  console.log(JSON.stringify({ cardId: card.id, today: t }));
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
