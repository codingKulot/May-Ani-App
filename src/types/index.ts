import type { Quad } from '@/services/build/geometry';
// Domain types shared across the app. Keep this file dependency-free.

/** Props we pass to react-icons components. */
export type AppIcon = (props: { size?: number | string; color?: string; className?: string; style?: Record<string, string | number> }) => any;

/** What a farm grows or raises. 'fruits' was added on 20 October 2026 (fruit trees, banana, papaya, pineapple, watermelon...). */
export type Sector = 'crops' | 'fruits' | 'fish' | 'livestock';
export type Experience = 'beginner' | 'intermediate' | 'advanced';
export type Goal = 'family' | 'family_sell' | 'commercial';

export interface GeoPlace {
  name: string; // e.g. "San Jose"
  province: string; // e.g. "Nueva Ecija"
  lat: number;
  lon: number;
}

export interface Profile {
  id: string;
  name: string;
  location: GeoPlace;
  role: 'farmer' | 'supplier' | 'buyer' | 'expert';
  createdAt: string;
  /**
   * The online account (MongoDB on the May-Ani server). May-Ani is for logged-in users only: without it (a guest profile from
   * before 18 October 2026, or a login that ended) the app shows the log-in screen; the farm data on the phone is kept.
   * The login token is kept separately, never in the app state.
   */
  account?: { id: string; email: string };
}

export interface Farm {
  id: string;
  name: string;
  /** the main type (the first of `sectors` for a mixed farm) */
  sector: Sector;
  /** every type on this farm, only when it has more than one (a mixed plan saved as a farm) */
  sectors?: Sector[];
  areaSqm: number;
  location: GeoPlace;
  planId?: string;
  createdAt: string;
  /** Extra details for a farm the user already runs (all optional). */
  tenure?: LandTenure;
  waterSource?: WaterSource;
  sinceYear?: number;
  barangay?: string;
  notes?: string;
}

export type LandTenure = 'owned' | 'family' | 'rented' | 'tenant' | 'cooperative';

// ---------- Catalog ----------
export interface CatalogItem {
  id: string;
  name: string;
  localName?: string;
  sector: Sector;
  category: string;
  emoji: string;
  /** days from planting/stocking to first harvest/sale */
  daysToHarvest: number;
  /** full production cycle in days (planting -> end of harvest window) */
  cycleDays: number;
  minAreaSqm: number;
  /** one-off set-up cost per sqm of production area (PHP) */
  startupCostPerSqm: number;
  /** recurring cost per sqm per month while in production (PHP) */
  opCostPerSqmMonth: number;
  /** kg harvested per sqm per cycle */
  yieldKgPerSqm: number;
  /** typical farm-gate price PHP/kg */
  farmGatePerKg: number;
  /** water use litres per sqm per day */
  waterLPerSqmDay: number;
  /** 1 easy .. 3 hard */
  difficulty: 1 | 2 | 3;
  /** needs brackish water (e.g. bangus) */
  needsBrackish?: boolean;
  /** freshwater only: cannot be raised in brackish water */
  freshOnly?: boolean;
  /** largest area one grower can realistically sell in one cycle (market absorption) */
  maxAreaSqm?: number;
  /** prefers cool highland climate */
  prefersCool?: boolean;
  /** fruits: area one tree / mat / post / plant takes at the usual spacing (sqm), to show "about N trees" */
  perPlantSqm?: number;
  /** fruits: grows well in partial shade (e.g. lanzones under coconut) */
  shadeTolerant?: boolean;
  /** how the unit of area is used: bed, pond, house, orchard */
  areaKind: 'bed' | 'pond' | 'house' | 'orchard';
  notes: string;
  /** added by the user (not part of the built-in catalog) */
  custom?: boolean;
}

// ---------- Planner ----------
export type Slope = 'flat' | 'gentle' | 'steep';
export type WaterSource = 'none' | 'municipal' | 'well' | 'stream' | 'rain';
export type PowerSource = 'none' | 'grid' | 'solar_possible';
export type Sunlight = 'full' | 'partial' | 'shaded';

export interface SiteConditions {
  slope: Slope;
  waterSource: WaterSource;
  power: PowerSource;
  floodProne: boolean;
  sunlight: Sunlight;
  brackishWater: boolean;
  cool: boolean; // highland / cool climate
}

export interface PlanInput {
  name: string;
  /**
   * The first chosen type. Plans made before 20 October 2026 have only this; it is still written so older copies of the
   * app can read new plans. Read the types of a plan with `planSectors(input)` (data/catalog.ts), never this alone.
   */
  sector: Sector;
  /** every type chosen (one or more, in SECTORS order), since 20 October 2026 */
  sectors?: Sector[];
  areaSqm: number;
  capital: number;
  location: GeoPlace;
  experience: Experience;
  goal: Goal;
  site: SiteConditions;
  /** preferred item ids (optional) */
  preferred?: string[];
  photoCount: number;
  /** AI notes from the site photo, if any */
  aiSiteNotes?: string[];
}

export interface Allocation {
  itemId: string;
  areaSqm: number;
}

export interface CostLine {
  label: string;
  amount: number;
}

export interface LayoutRect {
  x: number; // metres
  y: number;
  w: number;
  h: number;
  kind: 'bed' | 'pond' | 'house' | 'orchard' | 'path' | 'tank' | 'canal' | 'power' | 'pump' | 'run';
  itemId?: string;
  label?: string;
}

export interface LayoutSpec {
  widthM: number;
  lengthM: number;
  rects: LayoutRect[];
  lowSide: 'N' | 'E' | 'S' | 'W';
  legend: { itemId: string; areaSqm: number }[];
  /** mixed plans only: the strip of the plot each type gets (metres) */
  zones?: { sector: Sector; x: number; y: number; w: number; h: number }[];
}

export interface WaterPlan {
  demandLPerDay: number;
  tankLitres: number;
  tankDays: number;
  source: string;
  pumpHp: number;
  method: string;
  steps: string[];
}

export interface DrainagePlan {
  canalLengthM: number;
  canalSize: string;
  slopePct: number;
  retentionM3: number;
  steps: string[];
}

export interface ElectricalPlan {
  loadsW: { label: string; watts: number; hoursPerDay: number }[];
  totalW: number;
  dailyKwh: number;
  solarKwp: number;
  steps: string[];
}

export interface ScheduleItem {
  week: number;
  title: string;
  detail: string;
}

export interface PlanResult {
  title: string;
  summary: string;
  allocations: Allocation[];
  usedAreaSqm: number;
  phased: boolean;
  cost: {
    initial: number;
    monthlyOperating: number;
    monthlyIncomeMin: number;
    monthlyIncomeMax: number;
    paybackMonths: number | null;
    breakdown: CostLine[];
  };
  layout: LayoutSpec;
  water: WaterPlan;
  drainage: DrainagePlan;
  electrical: ElectricalPlan;
  schedule: ScheduleItem[];
  warnings: string[];
  assumptions: string[];
  /** mixed plans only (more than one type): land and start-up money per type */
  split?: PlanSplit;
}

/** How a mixed plan shares the land and the start-up money between its types. */
export interface PlanSplit {
  zones: PlanZone[];
  /** water tank and pump, drainage, wiring or solar, permits (with their part of the 10% contingency): shared by all types */
  shared: number;
}

export interface PlanZone {
  sector: Sector;
  /** land set aside for this type (an even share of the plot) */
  landSqm: number;
  /** planted or built area of this type in this phase */
  usedAreaSqm: number;
  /** start-up cost of this type's own part (set-up, beds or ponds, piping, tools, working capital, its part of the contingency) */
  initial: number;
}

/** What the user chose in the Layout > Build studio. The photo itself lives in IndexedDB (lib/photoStore). */
export interface PlanBuild {
  /** floor corners on the photo, 0..1: far-left, far-right, near-right, near-left */
  corners?: Quad;
  design?: 'raised' | 'containers' | 'vertical';
  surface?: 'soil' | 'hard' | 'gravel';
  /** recyclable ids the user has (see data/recyclables.ts) */
  recyclables: string[];
  /** material ids already on site (e.g. a shade net) */
  onSite: string[];
  notes: string[];
  aiUsed?: boolean;
}

export interface SavedPlan {
  id: string;
  farmId?: string;
  createdAt: string;
  input: PlanInput;
  result: PlanResult;
  build?: PlanBuild;
}

// ---------- Farm management ----------
export interface Task {
  id: string;
  farmId?: string;
  title: string;
  time?: string; // "08:00"
  date: string; // yyyy-mm-dd
  done: boolean;
}

export type ExpenseCategory = 'Seeds' | 'Fertilizer' | 'Feed' | 'Tools' | 'Labor' | 'Utilities' | 'Others';

export interface Expense {
  id: string;
  farmId?: string;
  date: string;
  category: ExpenseCategory;
  note: string;
  amount: number;
}

export interface Sale {
  id: string;
  farmId?: string;
  date: string;
  itemId: string;
  kg: number;
  pricePerKg: number;
  buyer?: string;
}

export interface ProductionRecord {
  id: string;
  farmId?: string;
  itemId: string;
  areaSqm: number;
  plantedOn: string;
  harvestedKg?: number;
  harvestedOn?: string;
}

// ---------- Market ----------
export interface MarketPrice {
  itemId: string;
  retailPerKg: number;
  farmGatePerKg: number;
  /** % change over last 7 days */
  trend7d: number;
}

export interface MarketSnapshot {
  asOf: string; // ISO date
  source: 'reference' | 'feed' | 'manual';
  sourceLabel: string;
  prices: MarketPrice[];
}

// ---------- Health ----------
export type HealthKind = 'plant' | 'animal' | 'fish';

export interface DiseaseEntry {
  id: string;
  kind: HealthKind;
  name: string;
  subjects: string[]; // crop / animal names it commonly affects
  keywords: string[]; // lower-case symptom keywords (English + Filipino)
  summary: string;
  causes: string;
  actions: string[];
  prevention: string[];
  seeExpert: boolean;
  reportable?: boolean; // notifiable disease: must report to authorities
}

export interface DiagnosisResult {
  id: string;
  name: string;
  confidence: number; // 0..100
  summary: string;
  /** AI only: what in the photo points to this cause, and where */
  evidence?: string;
  actions: string[];
  prevention: string[];
  seeExpert: boolean;
  reportable?: boolean;
  source: 'rules' | 'ai';
}

// ---------- Permits ----------
export type PermitSector = 'agriculture' | 'aquaculture' | 'livestock' | 'processing';

export interface PermitItem {
  id: string;
  title: string;
  agency: string;
  level: 'barangay' | 'lgu' | 'national' | 'regional';
  required: 'mandatory' | 'if_applicable';
  sectors: PermitSector[];
  detail: string;
  link?: string;
}

// ---------- Chat ----------
export interface ChatContact {
  id: string;
  name: string;
  kind: 'person' | 'business' | 'group';
  blurb: string;
  sample?: boolean;
}

export interface ChatMessage {
  id: string;
  contactId: string;
  from: 'me' | 'them';
  text: string;
  at: string; // ISO
}

export interface HealthLogEntry {
  id: string;
  farmId?: string;
  date: string;
  kind: HealthKind;
  subject?: string;
  title: string;
  confidence: number;
  source: 'rules' | 'ai';
  resolved: boolean;
  reportable?: boolean;
}

// ---------- Settings ----------
export interface Settings {
  apiBase: string; // '' = same origin
  marketFeedUrl: string;
  units: 'metric';
}

export interface AppState {
  version: number;
  profile: Profile | null;
  farms: Farm[];
  plans: SavedPlan[];
  tasks: Task[];
  expenses: Expense[];
  sales: Sale[];
  production: ProductionRecord[];
  permitProgress: Record<string, boolean>;
  permitSector: PermitSector;
  chats: ChatMessage[];
  contacts: ChatContact[];
  /** per conversation (contact id): the time of the newest message read on this phone; later messages from them are unread */
  chatRead: Record<string, string>;
  /** this phone has joined the chat (opened Community with a server); then new messages are watched on every page */
  chatJoined?: boolean;
  marketOverrides: Record<string, { retailPerKg?: number; farmGatePerKg?: number }>;
  watchlist: string[];
  healthLog: HealthLogEntry[];
  /** items the user added beyond the built-in catalog */
  customItems: CatalogItem[];
  /** the user's own prices for building materials, keyed by material id (PHP per unit) */
  materialPrices: Record<string, number>;
  settings: Settings;
  activeFarmId?: string;
}
