/**
 * DA "Price Watch" bulletins: retail prices checked at public markets by the Department of Agriculture (Sourced, not live).
 *
 * Where these come from: DA Regional Field Office XI (Davao Region) posts a "Price Watch" picture per market with Low, High,
 * Prevailing (most common) and Average prices in pesos per kilo (eggs per piece, cooking oil per liter). The pictures cannot be read
 * by a program, so the numbers below were copied by hand from them and checked against the pictures. Rows that DA marked "-"
 * (not sold that day) are left out. The Average column is not copied: the app shows Low to High and the most common price.
 *
 * Updating: add a new bulletin per market with its own `asOf` date and `sourceUrl`; the app always uses the newest bulletin of each
 * market and says how old it is. Keep `label` as DA wrote it so a later copy can be checked against the picture.
 */

import ncrPrices from './ncrPrices.json';

export interface WatchMarket {
  id: string;
  name: string;
  /** the city or town, and province, as DA writes them */
  place: string;
  /** approximate position of the market (the town centre), used only to find the market nearest the user */
  lat: number;
  lon: number;
  /** a list for a whole area (DA Bantay Presyo's Metro Manila list), not one market */
  area?: boolean;
}

/** [label as DA wrote it, low, high, prevailing] in pesos */
export type WatchRow = [label: string, low: number, high: number, prevailing: number];

export interface WatchGroup {
  /** DA's heading, e.g. "Lowland vegetable" */
  name: string;
  rows: WatchRow[];
}

export interface WatchBulletin {
  market: string;
  /** ISO date printed on the bulletin */
  asOf: string;
  source: string;
  /** where the bulletin pictures were found */
  sourceUrl: string;
  groups: WatchGroup[];
}

const DA_XI = 'DA Davao Region (RFO XI) Price Watch';
const DA_XI_URL = 'https://davao.da.gov.ph/';

export const WATCH_MARKETS: WatchMarket[] = [
  { id: 'bankerohan', name: 'Bankerohan Public Market', place: 'Davao City', lat: 7.067, lon: 125.6 },
  { id: 'digos', name: 'Digos City Public Market', place: 'Digos City, Davao del Sur', lat: 6.75, lon: 125.357 },
  { id: 'tagum', name: 'Tagum City Public Market', place: 'Tagum City, Davao del Norte', lat: 7.447, lon: 125.808 },
  { id: 'mati', name: 'Mati City Public Market', place: 'Mati City, Davao Oriental', lat: 6.955, lon: 126.217 },
  { id: 'malita', name: 'Malita Public Market', place: 'Malita, Davao Occidental', lat: 6.415, lon: 125.611 },
  { id: 'nabunturan', name: 'Nabunturan Public Market', place: 'Nabunturan, Davao de Oro', lat: 7.6, lon: 125.966 },
];

export const WATCH_BULLETINS: WatchBulletin[] = [
  {
    market: 'bankerohan', asOf: '2026-05-25', source: DA_XI, sourceUrl: DA_XI_URL,
    groups: [
      { name: 'Rice', rows: [
        ['Imported rice, Premium', 52, 56, 54],
        ['Local rice, Premium', 57, 59, 59],
        ['Local rice, Well Milled', 53, 56, 54],
        ['Local rice, Regular Milled', 50, 51, 50.5],
      ] },
      { name: 'Corn products', rows: [
        ['Corn Grits (White, Food Grade)', 60, 60, 60],
      ] },
      { name: 'Legumes', rows: [
        ['Mungbean', 100, 120, 100],
      ] },
      { name: 'Livestock and poultry', rows: [
        ['Beef Brisket, Local', 400, 460, 460],
        ['Beef Rump, Local', 460, 500, 500],
        ['Pork Belly (Liempo), Local', 350, 370, 360],
        ['Pork Picnic Shoulder (Kasim), Local', 290, 320, 300],
        ['Whole Chicken, Local', 160, 170, 170],
        ['Chicken Egg (White, Extra Small)', 6, 6, 6],
        ['Chicken Egg (White, Small)', 6.5, 7, 7],
        ['Chicken Egg (White, Medium)', 7, 7.5, 7.5],
        ['Chicken Egg (White, Large)', 7.5, 8, 8],
        ['Chicken Egg (White, Extra Large)', 8, 8.75, 8.63],
        ['Chicken Egg (White, Jumbo)', 9, 9.5, 9.5],
      ] },
      { name: 'Fish', rows: [
        ['Alumahan (Indian Mackerel)', 150, 180, 180],
        ['Bangus, Large', 200, 200, 200],
        ['Bangus, Medium', 190, 190, 190],
        ['Galunggong, Local', 170, 200, 180],
        ['Sardines (Tamban)', 150, 170, 160],
        ['Tambakol (Yellow-Fin Tuna), Local', 430, 430, 430],
        ['Tilapia', 140, 160, 140],
      ] },
      { name: 'Lowland vegetables', rows: [
        ['Ampalaya', 90, 100, 100],
        ['Chili Green, Local', 250, 250, 250],
        ['Eggplant', 70, 80, 80],
        ['Native Pechay', 150, 220, 170],
        ['Pole Sitao', 130, 150, 150],
        ['Squash', 40, 50, 47.5],
        ['Tomato', 40, 70, 60],
      ] },
      { name: 'Highland vegetables', rows: [
        ['Bell Pepper (Green), Local', 180, 250, 250],
        ['Bell Pepper (Red), Local', 180, 250, 250],
        ['Cabbage (Scorpio)', 60, 80, 70],
        ['Carrots, Local', 120, 150, 130],
        ['Chayote', 30, 45, 40],
        ['Habichuelas/Baguio Beans, Local', 100, 150, 120],
        ['Pechay Baguio', 70, 90, 75],
        ['White Potato, Local', 120, 140, 130],
      ] },
      { name: 'Spices', rows: [
        ['Chili (Red, Local)', 150, 200, 200],
        ['Garlic, Imported', 130, 160, 140],
        ['Ginger, Local', 100, 120, 120],
        ['Red Onion, Local', 110, 150, 120],
        ['White Onion, Imported', 130, 140, 130],
      ] },
      { name: 'Fruits', rows: [
        ['Avocado', 120, 180, 150],
        ['Banana (Lakatan)', 40, 60, 40],
        ['Banana (Latundan)', 30, 40, 30],
        ['Calamansi', 60, 70, 60],
        ['Mango (Carabao)', 100, 140, 100],
        ['Papaya', 30, 50, 40],
        ['Pomelo', 80, 100, 90],
        ['Watermelon', 40, 60, 40],
      ] },
      { name: 'Other basic goods', rows: [
        ['Sugar (Refined)', 70, 70, 70],
        ['Sugar (Brown)', 60, 70, 70],
        ['Cooking Oil (Palm)', 98, 110, 98],
        ['Cooking Oil (Coconut)', 170, 180, 170],
      ] },
    ],
  },
  {
    market: 'digos', asOf: '2026-05-25', source: DA_XI, sourceUrl: DA_XI_URL,
    groups: [
      { name: 'Rice', rows: [
        ['Imported rice, Glutinous', 52, 55, 55],
        ['Imported rice, Premium', 53, 58, 55],
        ['Local rice, Premium', 58, 59, 58],
        ['Local rice, Well Milled', 55, 57, 56],
        ['Local rice, Regular Milled', 51, 56, 54],
      ] },
      { name: 'Corn products', rows: [
        ['Corn (Yellow)', 45, 55, 55],
        ['Corn Grits (White, Food Grade)', 50, 55, 54],
        ['Corn Cracked (Yellow, Feed Grade)', 30, 32, 30],
        ['Corn Grits (Feed Grade)', 29, 30, 29],
      ] },
      { name: 'Legumes', rows: [
        ['Mungbean', 90, 100, 90],
      ] },
      { name: 'Livestock and poultry', rows: [
        ['Beef Brisket, Local', 350, 380, 360],
        ['Beef Chuck, Local', 350, 360, 350],
        ['Beef Forequarter, Local', 460, 470, 470],
        ['Beef Fore Limb, Local', 470, 470, 470],
        ['Beef Flank, Local', 360, 380, 360],
        ['Beef Loin, Local', 470, 500, 500],
        ['Beef Plate, Local', 470, 480, 480],
        ['Beef Rib Eye, Local', 360, 360, 360],
        ['Beef Rib Set, Local', 360, 360, 360],
        ['Beef Rump, Local', 470, 470, 470],
        ['Beef Short Ribs, Local', 360, 360, 360],
        ['Beef Sirloin, Local', 470, 470, 470],
        ['Beef Striploin, Local', 470, 490, 470],
        ['Beef Tenderloin, Local', 500, 500, 500],
        ['Pork Belly (Liempo), Local', 350, 360, 350],
        ['Pork Chop, Local', 300, 330, 300],
        ['Pork Head, Local', 250, 280, 280],
        ['Pork Hind Leg (Pigue), Local', 280, 300, 290],
        ['Pork Loin, Local', 350, 360, 350],
        ['Pork Offals, Local', 100, 120, 120],
        ['Pork Picnic Shoulder (Kasim), Local', 320, 330, 330],
        ['Pork Rind/Skin, Local', 120, 150, 150],
        ['Pork Spare Ribs, Local', 280, 300, 300],
        ['Chicken Breast, Local', 210, 220, 220],
        ['Chicken Drumstick, Local', 200, 220, 220],
        ['Chicken Feet, Local', 100, 110, 110],
        ['Chicken Leg Quarter', 200, 210, 210],
        ['Chicken Liver, Local', 200, 210, 200],
        ['Chicken Neck, Local', 110, 120, 120],
        ['Chicken Rind/Skin, Local', 150, 180, 160],
        ['Chicken Thigh, Local', 200, 200, 200],
        ['Chicken Wing, Local', 200, 200, 200],
        ['Whole Chicken, Local', 185, 190, 190],
        ['Chicken Egg (White, Pewee)', 4.5, 5, 5],
        ['Chicken Egg (White, Small)', 6, 6.5, 6],
        ['Chicken Egg (White, Medium)', 7, 8, 8],
        ['Chicken Egg (White, Large)', 8, 8.5, 8],
        ['Chicken Egg (White, Extra Large)', 8.5, 9, 8.5],
        ['Chicken Egg (White, Jumbo)', 10, 10, 10],
      ] },
      { name: 'Fish', rows: [
        ['Alumahan (Carabalias)', 180, 180, 180],
        ['Bangus, Large', 200, 200, 200],
        ['Galunggong', 200, 200, 200],
        ['Matambaka', 200, 200, 200],
        ['Sardines (Tamban)', 80, 100, 100],
        ['Squid (Pusit Bisaya), Local', 130, 130, 130],
        ['Tambakol (Yellow-Fin Tuna), Local', 500, 500, 500],
        ['Tilapia', 130, 180, 150],
      ] },
      { name: 'Lowland vegetables', rows: [
        ['Ampalaya', 60, 70, 60],
        ['Chili (Green)', 180, 200, 200],
        ['Eggplant', 40, 60, 40],
        ['Native Pechay', 60, 85, 75],
        ['Pole Sitao', 80, 90, 90],
        ['Squash', 25, 35, 30],
        ['Tomato', 30, 40, 40],
      ] },
      { name: 'Highland vegetables', rows: [
        ['Bell Pepper (Green), Local', 100, 150, 120],
        ['Bell Pepper (Red), Local', 100, 150, 120],
        ['Broccoli, Local', 200, 250, 200],
        ['Cauliflower, Local', 150, 200, 150],
        ['Cabbage (Scorpio)', 40, 50, 40],
        ['Carrots, Local', 90, 100, 100],
        ['Celery', 300, 350, 300],
        ['Chayote', 21, 30, 24],
        ['Habichuelas/Baguio Beans, Local', 70, 80, 70],
        ['Pechay Baguio', 40, 50, 45],
        ['Lettuce (Iceberg)', 150, 200, 180],
        ['White Potato, Local', 90, 100, 100],
      ] },
      { name: 'Spices', rows: [
        ['Chilli (Red), Local', 180, 200, 200],
        ['Garlic, Imported', 110, 125, 110],
        ['Ginger, Local', 90, 100, 90],
        ['Red Onion, Local', 100, 120, 100],
        ['White Onion, Imported', 90, 100, 100],
      ] },
      { name: 'Fruits', rows: [
        ['Avocado', 80, 100, 100],
        ['Banana (Lakatan)', 50, 60, 60],
        ['Banana (Latundan)', 40, 50, 50],
        ['Banana (Saba)', 20, 30, 30],
        ['Calamansi', 50, 60, 60],
        ['Mango (Carabao)', 80, 100, 90],
        ['Papaya', 30, 40, 40],
        ['Pomelo', 80, 80, 80],
        ['Watermelon', 50, 60, 50],
      ] },
      { name: 'Other basic goods', rows: [
        ['Salt Rock', 10, 13, 10],
        ['Sugar (Refined)', 65, 70, 70],
        ['Sugar (Brown)', 50, 55, 51],
        ['Cooking Oil (Palm)', 93, 100, 95],
        ['Cooking Oil (Coconut)', 157, 180, 157],
      ] },
    ],
  },
  {
    market: 'tagum', asOf: '2026-05-25', source: DA_XI, sourceUrl: DA_XI_URL,
    groups: [
      { name: 'Rice', rows: [
        ['Imported rice, Glutinous', 50, 55, 55],
        ['Imported rice, Premium', 50, 58, 58],
        ['Local rice, Premium', 56, 58, 57],
        ['Local rice, Well Milled', 54, 56, 54],
        ['Local rice, Regular Milled', 48, 51, 50],
      ] },
      { name: 'Corn products', rows: [
        ['Corn (Yellow)', 60, 60, 60],
        ['Corn Grits (White, Food Grade)', 55, 57, 56],
        ['Corn Grits (Yellow, Food Grade)', 28, 30, 30],
        ['Corn Cracked (Yellow, Feed Grade)', 28, 30, 28],
      ] },
      { name: 'Legumes', rows: [
        ['Mungbean', 100, 100, 100],
      ] },
      { name: 'Livestock and poultry', rows: [
        ['Beef Brisket, Local', 350, 350, 350],
        ['Beef Rump, Local', 450, 450, 450],
        ['Pork Belly (Liempo), Local', 380, 400, 400],
        ['Pork Picnic Shoulder (Kasim), Local', 340, 340, 340],
        ['Pork Boston Shoulder, Local', 340, 340, 340],
        ['Pork Chop, Local', 340, 340, 340],
        ['Pork Head, Local', 120, 120, 120],
        ['Pork Hind Leg Pigue (Pierna), Local', 340, 340, 340],
        ['Pork Loin, Local', 360, 370, 370],
        ['Pork Spare Ribs, Local', 300, 330, 320],
        ['Carabeef, Local', 280, 280, 280],
        ['Whole Chicken Magnolia, Local', 185, 190, 185],
        ['Whole Chicken, Local', 185, 190, 185],
        ['Chicken Breast, Local', 185, 200, 185],
        ['Chicken Drumstick, Local', 185, 200, 185],
        ['Chicken Feet, Local', 100, 110, 110],
        ['Chicken Liver, Local', 220, 230, 220],
        ['Chicken Neck, Local', 110, 110, 110],
        ['Chicken Thigh, Local', 185, 200, 185],
        ['Chicken Wings, Local', 185, 200, 185],
        ['Chicken Egg (White, Small)', 4.75, 7, 6],
        ['Chicken Egg (White, Medium)', 5.75, 8, 6],
        ['Chicken Egg (White, Large)', 6.25, 9, 6.35],
        ['Chicken Egg (White, Extra Large)', 6.85, 9.5, 6.85],
        ['Chicken Egg (White, Jumbo)', 7.5, 10, 7.5],
      ] },
      { name: 'Fish', rows: [
        ['Alumahan (Karabalyas)', 150, 180, 150],
        ['Bangus, Large', 170, 180, 170],
        ['Bangus, Medium', 150, 170, 160],
        ['Bonito (Tulingan)', 80, 120, 100],
        ['Galunggong', 160, 180, 180],
        ['Matambaka', 185, 185, 185],
        ['Pampano', 500, 500, 500],
        ['Sardines (Tamban)', 90, 90, 90],
        ['Pusit (Bisaya)', 80, 130, 120],
        ['Yellow-fin Tuna, Local', 320, 400, 320],
        ['Tilapia', 140, 160, 150],
      ] },
      { name: 'Lowland vegetables', rows: [
        ['Ampalaya', 60, 70, 70],
        ['Chilli (Green), Local', 130, 200, 150],
        ['Eggplant', 55, 60, 55],
        ['Pechay Native', 150, 150, 150],
        ['Sitao', 90, 100, 100],
        ['Squash', 30, 35, 30],
        ['Tomato', 35, 45, 35],
      ] },
      { name: 'Highland vegetables', rows: [
        ['Bell Pepper (Green), Local', 180, 200, 180],
        ['Bell Pepper (Red), Local', 180, 200, 180],
        ['Broccoli, Local', 250, 300, 260],
        ['Cauliflower, Local', 170, 200, 190],
        ['Cabbage (Scorpio)', 40, 50, 45],
        ['Carrots, Local', 90, 100, 100],
        ['Celery', 260, 260, 260],
        ['Chayote', 20, 30, 25],
        ['Habichuelas/Baguio Beans, Local', 160, 180, 180],
        ['Pechay Baguio', 60, 70, 60],
        ['Lettuce (Iceberg), Local', 190, 210, 210],
        ['White Potato, Local', 85, 100, 100],
      ] },
      { name: 'Spices', rows: [
        ['Chilli (Red), Local', 150, 200, 150],
        ['Garlic, Imported', 130, 130, 130],
        ['Ginger, Local', 70, 100, 90],
        ['Red Onion, Local', 80, 100, 90],
        ['White Onion, Local', 100, 110, 110],
        ['White Onion, Imported', 120, 130, 130],
      ] },
      { name: 'Fruits', rows: [
        ['Avocado', 80, 100, 100],
        ['Banana (Lakatan)', 55, 70, 60],
        ['Banana (Latundan)', 35, 45, 45],
        ['Banana (Saba)', 30, 40, 30],
        ['Calamansi', 35, 45, 40],
        ['Mango (Cebu)', 75, 110, 90],
        ['Papaya', 35, 50, 50],
        ['Pomelo', 75, 100, 85],
        ['Watermelon', 50, 50, 50],
      ] },
      { name: 'Other basic goods', rows: [
        ['Salt (Rock)', 10, 12, 10],
        ['Sugar (Refined)', 64, 70, 65],
        ['Sugar (Brown)', 52, 55, 53],
        ['Cooking Oil (Palm)', 93, 95, 94],
        ['Cooking Oil (Coconut)', 150, 160, 155],
      ] },
    ],
  },
  {
    market: 'mati', asOf: '2026-05-25', source: DA_XI, sourceUrl: DA_XI_URL,
    groups: [
      { name: 'Rice', rows: [
        ['Imported rice, Premium', 58, 60, 58],
        ['Local rice, Premium', 57, 59, 58],
        ['Local rice, Well Milled', 55, 56, 55],
        ['Local rice, Regular Milled', 46, 50, 46],
      ] },
      { name: 'Corn products', rows: [
        ['Corn (Yellow)', 60, 65, 65],
        ['Corn Grits (White, Food Grade)', 55, 55, 55],
        ['Corn Cracked (Yellow, Feed Grade)', 30, 37, 37],
        ['Corn Grits (Feed Grade)', 31, 31, 31],
      ] },
      { name: 'Legumes', rows: [
        ['Mungbean', 100, 120, 100],
      ] },
      { name: 'Livestock and poultry', rows: [
        ['Beef Brisket, Local', 400, 400, 400],
        ['Beef Rump, Local', 500, 500, 500],
        ['Pork Belly (Liempo), Local', 350, 360, 350],
        ['Pork Picnic Shoulder (Kasim), Local', 330, 340, 330],
        ['Whole Chicken, Local', 180, 190, 185],
        ['Chicken Egg (White, Pewee)', 4.7, 5.5, 5.07],
        ['Chicken Egg (White, Extra Small)', 5, 6, 6],
        ['Chicken Egg (White, Small)', 5, 6.7, 6.7],
        ['Chicken Egg (White, Medium)', 6, 7.4, 7.4],
        ['Chicken Egg (White, Large)', 7.5, 7.7, 7.5],
        ['Chicken Egg (White, Extra Large)', 8, 8.5, 8],
        ['Chicken Egg (White, Jumbo)', 8.4, 9, 9],
      ] },
      { name: 'Fish', rows: [
        ['Bangus, Large', 200, 200, 200],
        ['Bangus, Medium', 180, 180, 180],
        ['Squid (Pusit Bisaya)', 120, 140, 140],
        ['Tambakol (Yellow-Fin Tuna), Local', 340, 350, 340],
      ] },
      { name: 'Lowland vegetables', rows: [
        ['Ampalaya', 65, 80, 75],
        ['Chilli (Green), Local', 120, 130, 130],
        ['Eggplant', 60, 65, 60],
        ['Native Pechay', 75, 80, 80],
        ['Pole Sitao', 60, 65, 60],
        ['Squash', 30, 40, 35],
        ['Tomato', 50, 60, 60],
      ] },
      { name: 'Highland vegetables', rows: [
        ['Bell Pepper (Green), Local', 150, 180, 180],
        ['Bell Pepper (Red), Local', 150, 180, 180],
        ['Cabbage (Scorpio)', 50, 60, 60],
        ['Carrots, Local', 100, 140, 130],
        ['Chayote', 27, 33, 30],
        ['Habichuelas/Baguio Beans, Local', 80, 100, 90],
        ['Pechay Baguio', 60, 65, 60],
        ['White Potato, Local', 100, 130, 120],
      ] },
      { name: 'Spices', rows: [
        ['Garlic, Imported', 130, 140, 140],
        ['Ginger, Local', 80, 95, 80],
        ['Red Onion, Local', 95, 100, 100],
        ['White Onion, Imported', 80, 95, 80],
      ] },
      { name: 'Fruits', rows: [
        ['Banana (Lakatan)', 60, 60, 60],
        ['Banana (Latundan)', 35, 45, 45],
        ['Banana (Saba)', 22, 30, 25],
        ['Calamansi', 50, 65, 65],
        ['Mango (Carabao)', 80, 90, 80],
        ['Papaya', 60, 60, 60],
        ['Pomelo', 70, 80, 70],
        ['Watermelon', 60, 60, 60],
      ] },
      { name: 'Other basic goods', rows: [
        ['Sugar (Refined)', 65, 71, 68],
        ['Sugar (Brown)', 53, 57, 57],
        ['Cooking Oil (Palm)', 93, 103, 97],
        ['Cooking Oil (Coconut)', 153, 168, 153],
      ] },
    ],
  },
  {
    market: 'malita', asOf: '2026-05-25', source: DA_XI, sourceUrl: DA_XI_URL,
    groups: [
      { name: 'Rice', rows: [
        ['Imported rice, Glutinous', 50, 60, 50],
        ['Imported rice, Premium', 52, 57, 52],
        ['Local rice, Premium', 57, 62, 59.5],
        ['Local rice, Well Milled', 54, 57, 57],
        ['Local rice, Regular Milled', 52, 54, 52],
      ] },
      { name: 'Corn products', rows: [
        ['Corn (Yellow)', 100, 100, 100],
        ['Corn Grits (White, Food Grade)', 50, 55, 52.5],
        ['Corn Cracked (Yellow, Feed Grade)', 29, 30, 30],
        ['Corn Grits (Feed Grade)', 33, 37, 33],
      ] },
      { name: 'Legumes', rows: [
        ['Mungbean', 100, 110, 100],
      ] },
      { name: 'Livestock and poultry', rows: [
        ['Beef Brisket, Local', 380, 380, 380],
        ['Beef Chuck, Local', 380, 380, 380],
        ['Beef Rump, Local', 490, 490, 490],
        ['Beef Short Ribs, Local', 380, 380, 380],
        ['Beef Tenderloin, Local', 490, 490, 490],
        ['Beef Tongue, Local', 280, 300, 280],
        ['Pork Belly (Liempo), Local', 330, 330, 330],
        ['Pork Chop, Local', 320, 320, 320],
        ['Pork Hind Leg (Pigue), Local', 320, 320, 320],
        ['Pork Picnic Shoulder (Kasim), Local', 320, 320, 320],
        ['Pork Spare Ribs, Local', 300, 300, 300],
        ['Chicken Breast, Local', 180, 180, 180],
        ['Chicken Feet, Local', 125, 125, 125],
        ['Chicken Leg Quarter, Local', 180, 180, 180],
        ['Chicken Liver, Local', 185, 200, 200],
        ['Chicken Neck, Local', 100, 100, 100],
        ['Chicken Wing, Local', 200, 200, 200],
        ['Whole Chicken, Local', 180, 180, 180],
        ['Chicken Egg (White, Small)', 7, 7, 7],
        ['Chicken Egg (White, Medium)', 8, 8, 8],
        ['Chicken Egg (White, Large)', 9, 10, 10],
        ['Chicken Egg (White, Extra Large)', 10, 10, 10],
      ] },
      { name: 'Fish', rows: [
        ['Bangus, Large', 220, 220, 220],
        ['Tilapia', 220, 220, 220],
      ] },
      { name: 'Lowland vegetables', rows: [
        ['Ampalaya', 80, 120, 120],
        ['Chilli (Green), Local', 200, 200, 200],
        ['Eggplant', 80, 80, 80],
        ['Native Pechay', 80, 100, 100],
        ['Pole Sitao', 80, 120, 80],
        ['Squash', 50, 60, 50],
        ['Tomato', 70, 80, 80],
      ] },
      { name: 'Highland vegetables', rows: [
        ['Bell Pepper (Green), Local', 300, 350, 300],
        ['Bell Pepper (Red), Local', 300, 350, 300],
        ['Broccoli, Local', 280, 280, 280],
        ['Cauliflower, Local', 280, 280, 280],
        ['Cabbage (Scorpio)', 80, 100, 80],
        ['Carrots, Local', 120, 130, 120],
        ['Chayote', 21, 28, 24],
        ['Habichuelas/Baguio Beans, Local', 100, 150, 120],
        ['Pechay Baguio', 80, 100, 80],
        ['Lettuce (Iceberg)', 280, 280, 280],
        ['White Potato, Local', 120, 150, 150],
      ] },
      { name: 'Spices', rows: [
        ['Chilli (Red), Local', 200, 300, 300],
        ['Garlic, Imported', 150, 160, 150],
        ['Ginger, Local', 150, 160, 150],
        ['Red Onion, Local', 150, 180, 150],
        ['White Onion, Local', 180, 200, 200],
      ] },
      { name: 'Fruits', rows: [
        ['Avocado', 80, 100, 80],
        ['Banana (Lakatan)', 70, 80, 70],
        ['Banana (Latundan)', 50, 60, 50],
        ['Calamansi', 80, 100, 80],
        ['Mango (Carabao)', 70, 70, 70],
        ['Papaya', 60, 60, 60],
        ['Watermelon', 60, 70, 60],
      ] },
      { name: 'Other basic goods', rows: [
        ['Salt (Rock)', 12, 13, 12],
        ['Sugar (Refined)', 80, 90, 80],
        ['Sugar (Brown)', 56, 64, 60],
        ['Cooking Oil (Palm)', 98, 100, 98],
        ['Cooking Oil (Coconut)', 170, 170, 170],
      ] },
    ],
  },
  {
    market: 'nabunturan', asOf: '2026-05-25', source: DA_XI, sourceUrl: DA_XI_URL,
    groups: [
      { name: 'Rice', rows: [
        ['Imported rice, Premium', 50, 60, 58],
        ['Imported rice, Glutinous', 45, 65, 55],
        ['Local rice, Premium', 54, 60, 58],
        ['Local rice, Well Milled', 54, 56, 54],
        ['Local rice, Regular Milled', 50, 54, 52],
      ] },
      { name: 'Corn products', rows: [
        ['Corn (Yellow)', 60, 70, 60],
        ['Corn Grits (White, Food Grade)', 54, 60, 60],
        ['Corn Cracked (Yellow, Feed Grade)', 30, 30, 30],
        ['Corn Grits (Feed Grade)', 30, 30, 30],
      ] },
      { name: 'Legumes', rows: [
        ['Mungbean', 100, 120, 100],
      ] },
      { name: 'Livestock and poultry', rows: [
        ['Beef Brisket, Local', 380, 380, 380],
        ['Beef Rump, Local', 450, 450, 450],
        ['Pork Belly (Liempo), Local', 330, 330, 330],
        ['Pork Picnic Shoulder (Kasim), Local', 330, 330, 330],
        ['Whole Chicken, Local', 195, 200, 195],
        ['Chicken Egg (Peewee)', 5, 5, 5],
        ['Chicken Egg (White, Extra Small)', 6, 6.5, 6],
        ['Chicken Egg (White, Small)', 6, 7, 7],
        ['Chicken Egg (White, Medium)', 7, 8, 7.5],
        ['Chicken Egg (White, Large)', 7.5, 9, 9],
        ['Chicken Egg (White, Extra Large)', 8, 9.5, 8.5],
        ['Chicken Egg (White, Jumbo)', 9, 10, 10],
      ] },
      { name: 'Fish', rows: [
        ['Alumahan', 200, 240, 220],
        ['Bangus, Large', 220, 240, 220],
        ['Bonito', 160, 160, 160],
        ['Squid (Pusit Bisaya)', 140, 200, 170],
        ['Tambakol (Yellow Fin Tuna)', 420, 450, 450],
      ] },
      { name: 'Lowland vegetables', rows: [
        ['Ampalaya', 70, 80, 80],
        ['Chilli (Green), Local', 200, 200, 200],
        ['Eggplant', 50, 50, 50],
        ['Native Pechay', 200, 200, 200],
        ['Pole Sitao', 100, 100, 100],
        ['Squash', 30, 30, 30],
        ['Tomato', 40, 60, 60],
      ] },
      { name: 'Highland vegetables', rows: [
        ['Bell Pepper (Red), Local', 200, 250, 200],
        ['Cabbage (Scorpio)', 60, 65, 60],
        ['Carrots, Local', 90, 120, 120],
        ['Chayote', 20, 25, 20],
        ['Habichuelas/Baguio Beans, Local', 150, 150, 150],
        ['Pechay Baguio', 50, 80, 70],
        ['Lettuce (Green Ice)', 450, 500, 475],
        ['White Potato, Local', 100, 120, 120],
      ] },
      { name: 'Spices', rows: [
        ['Chilli (Red), Local', 170, 250, 200],
        ['Garlic, Imported', 150, 160, 160],
        ['Ginger, Local', 80, 120, 100],
        ['Red Onion, Local', 100, 150, 130],
      ] },
      { name: 'Fruits', rows: [
        ['Avocado', 80, 100, 100],
        ['Banana (Lakatan)', 40, 55, 45],
        ['Banana (Latundan)', 45, 45, 45],
        ['Banana (Saba)', 20, 20, 20],
        ['Calamansi', 50, 60, 50],
        ['Mango (Carabao)', 70, 100, 90],
        ['Papaya', 45, 45, 45],
        ['Pomelo', 100, 100, 100],
        ['Watermelon', 55, 60, 60],
      ] },
      { name: 'Other basic goods', rows: [
        ['Salt (Rock)', 10, 15, 10],
        ['Salt (Iodized)', 10, 20, 18],
        ['Sugar (Refined)', 68, 100, 82.6],
        ['Sugar (Brown)', 55, 85, 60],
        ['Cooking Oil (Palm)', 98, 120, 98],
        ['Cooking Oil (Coconut)', 170, 200, 180],
      ] },
    ],
  },
];

// ------------------------------------------------------------------------------------------------ DA Bantay Presyo, Metro Manila

/**
 * DA Bantay Presyo's daily Metro Manila list, as the server reads it from DA's PDF (server/prices.mjs, GET /api/prices/ncr):
 * `markets` = one prevailing price per item at each of 34 named markets; `area` = Low to High across them for about 90 items.
 * A copy is bundled (`ncrPrices.json`, made with scripts/bundle-prices.ts) for phones that cannot reach the server.
 */
export interface NcrList {
  asOf: string;
  url: string;
  area: WatchGroup[];
  markets: { name: string; groups: WatchGroup[] }[];
}

export const BUNDLED_NCR = ncrPrices as NcrList;
const BP = 'DA Bantay Presyo, Metro Manila';
const BP_PAGE = 'https://www.da.gov.ph/price-monitoring/';

/** Lower case letters and digits only, so "Muñoz Market/Quezon City" and "Munoz Market" compare equal. */
export const marketKey = (name: string) => name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().split('/')[0].replace(/[^a-z0-9]/g, '');

/**
 * Where the 34 markets DA checks are (approximate, within a few km; looked up from their names and cities on 21 October 2026).
 * Used only to pick the markets nearest the user. A market DA adds later is shown once it is added here.
 */
export const NCR_MARKET_PLACES: Record<string, { place: string; lat: number; lon: number }> = {
  agorapublicmarket: { place: 'San Juan', lat: 14.602, lon: 121.031 },
  alabangcentralmarket: { place: 'Muntinlupa', lat: 14.425, lon: 121.044 },
  balintawakcloverleafmarket: { place: 'Quezon City', lat: 14.658, lon: 121.0 },
  bicutanmarket: { place: 'Taguig', lat: 14.488, lon: 121.045 },
  commonwealthmarket: { place: 'Quezon City', lat: 14.698, lon: 121.088 },
  dagonoymarket: { place: 'Manila', lat: 14.573, lon: 121.001 },
  farmersmarket: { place: 'Cubao, Quezon City', lat: 14.62, lon: 121.054 },
  gracemarketplace: { place: 'Quezon City', lat: 14.632, lon: 121.009 },
  guadalupepublicmarket: { place: 'Makati', lat: 14.566, lon: 121.046 },
  hulongduhatpublicmarket: { place: 'Malabon', lat: 14.668, lon: 120.96 },
  klmvnewkaruhatanmarket: { place: 'Valenzuela', lat: 14.688, lon: 120.975 },
  lahuertamarket: { place: 'Parañaque', lat: 14.493, lon: 120.99 },
  malaboncentralmarket: { place: 'Malabon', lat: 14.662, lon: 120.957 },
  mandaluyongpublicmarketi: { place: 'Mandaluyong', lat: 14.581, lon: 121.033 },
  mandaluyongpublicmarketii: { place: 'Mandaluyong', lat: 14.584, lon: 121.026 },
  marikinapublicmarket: { place: 'Marikina', lat: 14.633, lon: 121.096 },
  maypajopublicmarket: { place: 'Caloocan', lat: 14.64, lon: 120.976 },
  megaqmart: { place: 'Quezon City', lat: 14.619, lon: 121.052 },
  munozmarket: { place: 'Quezon City', lat: 14.657, lon: 121.023 },
  murphypublicmarket: { place: 'Cubao, Quezon City', lat: 14.623, lon: 121.061 },
  mutyangpasigmegamarket: { place: 'Pasig', lat: 14.561, lon: 121.08 },
  navotasagoramarket: { place: 'Navotas', lat: 14.667, lon: 120.943 },
  newlaspinascitypublicmarket: { place: 'Las Piñas', lat: 14.45, lon: 120.983 },
  newmarulaspublicmarket: { place: 'Valenzuela', lat: 14.677, lon: 120.981 },
  newparangmarket: { place: 'Marikina', lat: 14.656, lon: 121.11 },
  northdiversionmarket: { place: 'Quezon City', lat: 14.66, lon: 121.005 },
  pacomarket: { place: 'Manila', lat: 14.579, lon: 120.999 },
  poblacionpublicmarket: { place: 'Muntinlupa', lat: 14.387, lon: 121.045 },
  pritilmarket: { place: 'Tondo, Manila', lat: 14.611, lon: 120.967 },
  quintamarket: { place: 'Quiapo, Manila', lat: 14.596, lon: 120.984 },
  sanandresmarket: { place: 'Manila', lat: 14.573, lon: 120.993 },
  sukimarketmoonwalk: { place: 'Parañaque', lat: 14.492, lon: 120.998 },
  taguigpeoplesmarket: { place: 'Taguig', lat: 14.525, lon: 121.075 },
  trabajomarket: { place: 'Sampaloc, Manila', lat: 14.612, lon: 120.996 },
};

/** The Metro Manila list as markets and bulletins the app can show: the 34 markets (those it knows the place of) and the area list. */
export function ncrWatch(list: NcrList): { markets: WatchMarket[]; bulletins: WatchBulletin[] } {
  const markets: WatchMarket[] = [{ id: 'ncr', name: 'All Metro Manila', place: 'DA Bantay Presyo, 34 markets', lat: 14.6, lon: 121.0, area: true }];
  const bulletins: WatchBulletin[] = [{ market: 'ncr', asOf: list.asOf, source: `${BP} (34 markets)`, sourceUrl: list.url || BP_PAGE, groups: list.area }];
  for (const m of list.markets) {
    const key = marketKey(m.name);
    const at = NCR_MARKET_PLACES[key];
    if (!at) continue;
    const id = `ncr-${key}`;
    markets.push({ id, name: m.name.split('/')[0].trim(), place: `${at.place}, Metro Manila`, lat: at.lat, lon: at.lon });
    bulletins.push({ market: id, asOf: list.asOf, source: BP, sourceUrl: list.url || BP_PAGE, groups: m.groups });
  }
  return { markets, bulletins };
}

/** The Metro Manila Low to High list of the bundled copy: the reference for places with no DA-checked market near. */
export const BANTAY_PRESYO_NCR: WatchBulletin = ncrWatch(BUNDLED_NCR).bulletins[0];
