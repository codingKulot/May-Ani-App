/**
 * APPROXIMATE traces of major active fault systems in the Philippines, simplified to a few
 * vertices each (lat, lon). They are for orientation ONLY - never for siting decisions.
 * Authoritative sources: PHIVOLCS FaultFinder and HazardHunterPH.
 * Replace/extend with the official PHIVOLCS GIS data when available (services/hazards.ts
 * consumes the `FaultSegment[]` shape, so the data source can be swapped without UI changes).
 */
export interface FaultSegment {
  id: string;
  name: string;
  region: string;
  points: [number, number][]; // [lat, lon]
}

export const FAULTS: FaultSegment[] = [
  { id: 'pfz-digdig', name: 'Philippine Fault Zone - Digdig segment', region: 'Nueva Vizcaya / Nueva Ecija / Aurora',
    points: [[16.55, 121.35], [16.0, 121.2], [15.75, 121.1], [15.45, 121.3], [15.15, 121.45]] },
  { id: 'pfz-infanta', name: 'Philippine Fault Zone - Infanta to Guinayangan', region: 'Quezon / Aurora',
    points: [[15.15, 121.45], [14.75, 121.65], [14.3, 122.0], [13.95, 122.45]] },
  { id: 'pfz-masbate', name: 'Philippine Fault Zone - Masbate segment', region: 'Masbate / Bicol',
    points: [[13.2, 123.1], [12.55, 123.55], [12.0, 123.85]] },
  { id: 'pfz-leyte', name: 'Philippine Fault Zone - Leyte segment', region: 'Leyte / Southern Leyte',
    points: [[11.3, 124.7], [10.65, 124.95], [10.2, 125.0]] },
  { id: 'pfz-mindanao', name: 'Philippine Fault Zone - Surigao / Agusan', region: 'Caraga',
    points: [[9.85, 125.55], [9.2, 125.7], [8.6, 126.1], [8.0, 126.3]] },
  { id: 'wvf', name: 'Marikina Valley Fault System - West Valley Fault', region: 'Bulacan / Metro Manila / Rizal / Laguna / Cavite',
    points: [[14.95, 121.15], [14.75, 121.12], [14.6, 121.1], [14.45, 121.05], [14.25, 121.05], [14.1, 121.05]] },
  { id: 'evf', name: 'Marikina Valley Fault System - East Valley Fault', region: 'Rizal / Metro Manila',
    points: [[14.75, 121.2], [14.6, 121.17], [14.5, 121.18]] },
  { id: 'makilala', name: 'Makilala-Malungon Fault', region: 'Cotabato / Davao del Sur / Sarangani',
    points: [[7.15, 125.0], [6.8, 125.15], [6.2, 125.3]] },
  { id: 'bohol', name: 'North Bohol Fault', region: 'Bohol',
    points: [[9.85, 124.05], [9.92, 124.3]] },
  { id: 'lubang', name: 'Lubang-Verde Island Passage fault zone', region: 'Mindoro / Batangas',
    points: [[13.8, 120.15], [13.55, 120.7], [13.55, 121.0]] },
];
