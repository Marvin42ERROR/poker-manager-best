// Mock data store for the Poker Manager demo.
// Persists to localStorage so edits survive reloads.

export type Role = "admin" | "player";

export interface Session {
  id: string;
  playerId: string;
  playerName: string;
  tableId: string;
  tableName: string;
  date: string; // YYYY-MM-DD
  joinTime: string; // HH:MM
  leaveTime?: string;
  buyIn: number;
  cashOut?: number;
  status: "playing" | "out";
}

export interface Player {
  id: string;
  name: string;
  notes: string;
  tag: string; // e.g. "Кэшбек", "Должен 5000"
}

export interface Expense {
  id: string;
  date: string;
  category: "Напитки" | "Еда" | "Бонусы" | "Долги гостей" | "Прочее";
  amount: number;
  comment: string;
}

export interface Table {
  id: string;
  name: string;
  rakePerHour: number; // club rake collected per hour at the table
}

const KEY = "poker-manager-data-v1";

interface Data {
  players: Player[];
  tables: Table[];
  sessions: Session[];
  expenses: Expense[];
}

function seed(): Data {
  const today = new Date().toISOString().slice(0, 10);
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);

  const players: Player[] = [
    { id: "p1", name: "Алексей «Туз» Воронов", tag: "VIP", notes: "Любит блефовать на ривере. Стабильный кэш +200к за квартал." },
    { id: "p2", name: "Дмитрий Соколов", tag: "Должен 15 000₽", notes: "Не закрыл долг с прошлой пятницы. Напомнить лично." },
    { id: "p3", name: "Игорь «Молот» Белов", tag: "Кэшбек 10%", notes: "Плотный TAG-стиль, редко проигрывает крупно." },
    { id: "p4", name: "Михаил Орлов", tag: "Новичок", notes: "Пришел впервые. Пригласил Алексей." },
    { id: "p5", name: "Сергей Кузнецов", tag: "Регуляр", notes: "Играет каждую среду и пятницу." },
    { id: "p6", name: "Андрей «Лис» Жуков", tag: "VIP", notes: "Агрессивный LAG. Ставит большие бай-ины." },
  ];

  const tables: Table[] = [
    { id: "t1", name: "Стол №1 — NL100", rakePerHour: 3500 },
    { id: "t2", name: "Стол №2 — NL200", rakePerHour: 6000 },
  ];

  const sessions: Session[] = [
    { id: "s1", playerId: "p1", playerName: "Алексей «Туз» Воронов", tableId: "t1", tableName: "Стол №1 — NL100", date: today, joinTime: "20:00", buyIn: 50000, status: "playing" },
    { id: "s2", playerId: "p3", playerName: "Игорь «Молот» Белов", tableId: "t1", tableName: "Стол №1 — NL100", date: today, joinTime: "20:15", buyIn: 30000, status: "playing" },
    { id: "s3", playerId: "p5", playerName: "Сергей Кузнецов", tableId: "t1", tableName: "Стол №1 — NL100", date: today, joinTime: "20:30", leaveTime: "23:00", buyIn: 20000, cashOut: 12000, status: "out" },
    { id: "s4", playerId: "p6", playerName: "Андрей «Лис» Жуков", tableId: "t2", tableName: "Стол №2 — NL200", date: today, joinTime: "21:00", buyIn: 100000, status: "playing" },
    { id: "s5", playerId: "p4", playerName: "Михаил Орлов", tableId: "t2", tableName: "Стол №2 — NL200", date: today, joinTime: "21:10", buyIn: 80000, status: "playing" },
    { id: "s6", playerId: "p2", playerName: "Дмитрий Соколов", tableId: "t1", tableName: "Стол №1 — NL100", date: yesterday, joinTime: "19:00", leaveTime: "01:30", buyIn: 40000, cashOut: 0, status: "out" },
    { id: "s7", playerId: "p1", playerName: "Алексей «Туз» Воронов", tableId: "t1", tableName: "Стол №1 — NL100", date: yesterday, joinTime: "19:30", leaveTime: "02:00", buyIn: 60000, cashOut: 95000, status: "out" },
  ];

  const expenses: Expense[] = [
    { id: "e1", date: today, category: "Напитки", amount: 4500, comment: "Виски, вода, кола" },
    { id: "e2", date: today, category: "Еда", amount: 7800, comment: "Заказ суши на 6 персон" },
    { id: "e3", date: today, category: "Бонусы", amount: 5000, comment: "Бонус новичку Михаилу" },
    { id: "e4", date: yesterday, category: "Напитки", amount: 3200, comment: "Бар" },
    { id: "e5", date: yesterday, category: "Долги гостей", amount: 15000, comment: "Дмитрий Соколов — отыгрывает в кредит" },
  ];

  return { players, tables, sessions, expenses };
}

function load(): Data {
  if (typeof window === "undefined") return seed();
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) {
      const s = seed();
      localStorage.setItem(KEY, JSON.stringify(s));
      return s;
    }
    return JSON.parse(raw);
  } catch {
    return seed();
  }
}

function save(d: Data) {
  if (typeof window === "undefined") return;
  localStorage.setItem(KEY, JSON.stringify(d));
}

// Simple subscription system so React components can re-read after mutations.
type Listener = () => void;
const listeners = new Set<Listener>();
export function subscribe(l: Listener) {
  listeners.add(l);
  return () => listeners.delete(l);
}
function notify() {
  listeners.forEach((l) => l());
}

export const store = {
  getAll(): Data {
    return load();
  },
  reset() {
    const s = seed();
    save(s);
    notify();
  },
  updateSession(id: string, patch: Partial<Session>) {
    const d = load();
    d.sessions = d.sessions.map((s) => (s.id === id ? { ...s, ...patch } : s));
    save(d);
    notify();
  },
  addExpense(e: Omit<Expense, "id">) {
    const d = load();
    d.expenses.push({ ...e, id: "e" + Date.now() });
    save(d);
    notify();
  },
  deleteExpense(id: string) {
    const d = load();
    d.expenses = d.expenses.filter((e) => e.id !== id);
    save(d);
    notify();
  },
  updatePlayerNotes(id: string, notes: string, tag: string) {
    const d = load();
    d.players = d.players.map((p) => (p.id === id ? { ...p, notes, tag } : p));
    save(d);
    notify();
  },
};
