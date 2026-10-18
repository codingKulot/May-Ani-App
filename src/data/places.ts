import type { GeoPlace } from '@/types';

/** Offline-friendly list of Philippine provincial capitals / major cities (approximate coordinates). */
const raw: [string, string, number, number][] = [
  ['Laoag', 'Ilocos Norte', 18.197, 120.594], ['Vigan', 'Ilocos Sur', 17.575, 120.387],
  ['San Fernando', 'La Union', 16.616, 120.317], ['Lingayen', 'Pangasinan', 16.022, 120.231],
  ['Dagupan', 'Pangasinan', 16.043, 120.334], ['Baguio', 'Benguet', 16.402, 120.596],
  ['La Trinidad', 'Benguet', 16.456, 120.589], ['Bangued', 'Abra', 17.598, 120.617],
  ['Tabuk', 'Kalinga', 17.418, 121.443], ['Bontoc', 'Mountain Province', 17.087, 120.977],
  ['Lagawe', 'Ifugao', 16.801, 121.121], ['Tuguegarao', 'Cagayan', 17.613, 121.727],
  ['Ilagan', 'Isabela', 17.148, 121.889], ['Santiago', 'Isabela', 16.688, 121.548],
  ['Bayombong', 'Nueva Vizcaya', 16.483, 121.15], ['Cabarroguis', 'Quirino', 16.5, 121.52],
  ['Cabanatuan', 'Nueva Ecija', 15.486, 120.967], ['San Jose', 'Nueva Ecija', 15.793, 120.99],
  ['Palayan', 'Nueva Ecija', 15.543, 121.083], ['Tarlac City', 'Tarlac', 15.475, 120.597],
  ['San Fernando', 'Pampanga', 15.029, 120.689], ['Angeles', 'Pampanga', 15.145, 120.589],
  ['Malolos', 'Bulacan', 14.843, 120.811], ['Balanga', 'Bataan', 14.676, 120.536],
  ['Olongapo', 'Zambales', 14.829, 120.283], ['Iba', 'Zambales', 15.327, 119.978],
  ['Baler', 'Aurora', 15.759, 121.562], ['Manila', 'Metro Manila', 14.599, 120.984],
  ['Quezon City', 'Metro Manila', 14.676, 121.044], ['Antipolo', 'Rizal', 14.586, 121.176],
  ['Calamba', 'Laguna', 14.211, 121.165], ['Santa Cruz', 'Laguna', 14.281, 121.416],
  ['Batangas City', 'Batangas', 13.756, 121.058], ['Lipa', 'Batangas', 13.941, 121.164],
  ['Imus', 'Cavite', 14.43, 120.937], ['Lucena', 'Quezon', 13.941, 121.617],
  ['Calapan', 'Oriental Mindoro', 13.411, 121.18], ['San Jose', 'Occidental Mindoro', 12.352, 121.067],
  ['Puerto Princesa', 'Palawan', 9.739, 118.735], ['Boac', 'Marinduque', 13.446, 121.84],
  ['Romblon', 'Romblon', 12.577, 122.269], ['Legazpi', 'Albay', 13.139, 123.744],
  ['Naga', 'Camarines Sur', 13.621, 123.195], ['Daet', 'Camarines Norte', 14.112, 122.955],
  ['Sorsogon City', 'Sorsogon', 12.974, 124.006], ['Masbate City', 'Masbate', 12.368, 123.619],
  ['Virac', 'Catanduanes', 13.582, 124.235], ['Iloilo City', 'Iloilo', 10.72, 122.562],
  ['Roxas City', 'Capiz', 11.585, 122.751], ['Kalibo', 'Aklan', 11.706, 122.364],
  ['San Jose de Buenavista', 'Antique', 10.745, 121.94], ['Jordan', 'Guimaras', 10.6, 122.6],
  ['Bacolod', 'Negros Occidental', 10.676, 122.951], ['Dumaguete', 'Negros Oriental', 9.307, 123.307],
  ['Cebu City', 'Cebu', 10.315, 123.885], ['Tagbilaran', 'Bohol', 9.647, 123.855],
  ['Tacloban', 'Leyte', 11.244, 125.003], ['Ormoc', 'Leyte', 11.006, 124.607],
  ['Catbalogan', 'Samar', 11.775, 124.886], ['Borongan', 'Eastern Samar', 11.608, 125.432],
  ['Maasin', 'Southern Leyte', 10.133, 124.84], ['Zamboanga City', 'Zamboanga del Sur', 6.921, 122.079],
  ['Pagadian', 'Zamboanga del Sur', 7.826, 123.437], ['Dipolog', 'Zamboanga del Norte', 8.588, 123.34],
  ['Cagayan de Oro', 'Misamis Oriental', 8.454, 124.632], ['Iligan', 'Lanao del Norte', 8.228, 124.245],
  ['Ozamiz', 'Misamis Occidental', 8.148, 123.844], ['Malaybalay', 'Bukidnon', 8.156, 125.127],
  ['Butuan', 'Agusan del Norte', 8.949, 125.543], ['Surigao City', 'Surigao del Norte', 9.784, 125.489],
  ['Davao City', 'Davao del Sur', 7.19, 125.455], ['Tagum', 'Davao del Norte', 7.447, 125.808],
  ['Mati', 'Davao Oriental', 6.955, 126.217], ['Digos', 'Davao del Sur', 6.75, 125.357],
  ['General Santos', 'South Cotabato', 6.113, 125.172], ['Koronadal', 'South Cotabato', 6.503, 124.847],
  ['Kidapawan', 'Cotabato', 7.008, 125.089], ['Cotabato City', 'Maguindanao', 7.223, 124.246],
  ['Marawi', 'Lanao del Sur', 8.0, 124.285], ['Jolo', 'Sulu', 6.053, 121.0],
  ['Isabela City', 'Basilan', 6.704, 121.971], ['Bongao', 'Tawi-Tawi', 5.029, 119.773],
];

export const PLACES: GeoPlace[] = raw.map(([name, province, lat, lon]) => ({ name, province, lat, lon }));

export const DEFAULT_PLACE: GeoPlace = PLACES.find((p) => p.name === 'San Jose' && p.province === 'Nueva Ecija')!;

export const placeLabel = (p: GeoPlace) => `${p.name}, ${p.province}`;

export function searchPlaces(q: string, limit = 8): GeoPlace[] {
  const s = q.trim().toLowerCase();
  if (!s) return PLACES.slice(0, limit);
  return PLACES.filter((p) => placeLabel(p).toLowerCase().includes(s)).slice(0, limit);
}
