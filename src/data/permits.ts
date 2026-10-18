import type { PermitItem, PermitSector } from '@/types';

/**
 * Starter list of common Philippine permits and registrations for agri-aqua enterprises.
 * Requirements differ by LGU, project size and scale - the UI always tells users to confirm with
 * their city/municipal Business Permits and Licensing Office (BPLO) and the relevant agency.
 * Add or edit entries here; the Permits page renders whatever is in this list.
 */
export const PERMITS: PermitItem[] = [
  // ---- Common to all ----
  { id: 'brgy-clearance', title: 'Barangay Clearance / Business Clearance', agency: 'Barangay Hall', level: 'barangay', required: 'mandatory',
    sectors: ['agriculture', 'aquaculture', 'livestock', 'processing'],
    detail: 'First stop for most LGU permits. Bring a valid ID, proof of address and a description of your activity.' },
  { id: 'dti-sec-cda', title: 'Business Name / Entity Registration', agency: 'DTI (sole proprietor) / SEC (corporation) / CDA (cooperative)', level: 'national', required: 'mandatory',
    sectors: ['agriculture', 'aquaculture', 'livestock', 'processing'],
    detail: 'Register your business name or entity. Joining a registered cooperative can give access to training, inputs and buyers.',
    link: 'https://bnrs.dti.gov.ph' },
  { id: 'zoning', title: 'Zoning / Locational Clearance', agency: 'City/Municipal Zoning Office', level: 'lgu', required: 'mandatory',
    sectors: ['agriculture', 'aquaculture', 'livestock', 'processing'],
    detail: 'Confirms your land use allows the activity (agri, fishery, livestock). Livestock and ponds often have distance rules from homes and water bodies.' },
  { id: 'mayors-permit', title: "Mayor's / Business Permit", agency: 'LGU Business Permits and Licensing Office (BPLO)', level: 'lgu', required: 'mandatory',
    sectors: ['agriculture', 'aquaculture', 'livestock', 'processing'],
    detail: 'Annual permit to operate a business in the city/municipality. Renew every January.' },
  { id: 'bir', title: 'BIR Registration (TIN, Certificate of Registration, receipts)', agency: 'Bureau of Internal Revenue - Revenue District Office', level: 'national', required: 'mandatory',
    sectors: ['agriculture', 'aquaculture', 'livestock', 'processing'],
    detail: 'Register as a taxpayer if you sell regularly. Many primary agricultural products in their original state are exempt from VAT - ask your RDO what applies to you.',
    link: 'https://www.bir.gov.ph' },
  { id: 'land-docs', title: 'Proof of land rights (title, tax declaration, or lease/contract)', agency: 'Registry of Deeds / Municipal Assessor / Landowner', level: 'lgu', required: 'mandatory',
    sectors: ['agriculture', 'aquaculture', 'livestock', 'processing'],
    detail: 'Needed for most permits and loans. If you rent, get a written lease with a clear term. Converting agricultural land to another use needs DAR clearance.' },
  { id: 'rsbsa', title: 'RSBSA enrollment (farmers & fisherfolk registry)', agency: 'DA via Municipal Agriculture Office', level: 'lgu', required: 'if_applicable',
    sectors: ['agriculture', 'aquaculture', 'livestock'],
    detail: 'Registering opens access to government assistance programs, inputs, crop insurance and some loans.' },
  { id: 'sanitary', title: 'Sanitary Permit / Health Certificate', agency: 'City/Municipal Health Office', level: 'lgu', required: 'if_applicable',
    sectors: ['agriculture', 'aquaculture', 'livestock', 'processing'],
    detail: 'Required for food-handling and processing premises and for workers who handle food.' },

  // ---- Agriculture (crops) ----
  { id: 'water-permit', title: 'Water Permit (groundwater / surface water use)', agency: 'National Water Resources Board (NWRB)', level: 'national', required: 'if_applicable',
    sectors: ['agriculture', 'aquaculture', 'livestock'],
    detail: 'Needed to take water from a well, river or spring beyond small domestic use. Check with NWRB or your LGU before drilling a well.' },
  { id: 'bpi-quarantine', title: 'Plant Quarantine Clearance (moving plants/planting materials)', agency: 'Bureau of Plant Industry (BPI)', level: 'regional', required: 'if_applicable',
    sectors: ['agriculture'],
    detail: 'Needed when moving certain plants or planting materials between provinces or abroad.' },
  { id: 'organic', title: 'Organic certification (if labelling as organic)', agency: 'DA-accredited certifying body (RA 10068)', level: 'national', required: 'if_applicable',
    sectors: ['agriculture', 'livestock'],
    detail: 'Required to legally label products as organic. Optional if you do not use the claim.' },
  { id: 'philgap', title: 'PhilGAP certification (good agricultural practices)', agency: 'DA - Bureau of Agriculture and Fisheries Standards', level: 'national', required: 'if_applicable',
    sectors: ['agriculture'],
    detail: 'Voluntary, but often required by supermarkets and institutional buyers.' },

  // ---- Aquaculture ----
  { id: 'fishpond-lease', title: 'Fishpond Lease Agreement (public land / waters)', agency: 'BFAR / LGU (municipal waters)', level: 'regional', required: 'if_applicable',
    sectors: ['aquaculture'],
    detail: 'Required if your pond is on public land or in public waters. Private titled land does not need a lease.' },
  { id: 'aquafarm-reg', title: 'Aquafarm / fishpond registration', agency: 'BFAR Regional Office & LGU Fisheries Office', level: 'regional', required: 'mandatory',
    sectors: ['aquaculture'],
    detail: 'Register your pond, pen or cage. Ask for current forms and fees; some LGUs also set their own fishpond/cage permits.',
    link: 'https://www.bfar.da.gov.ph' },
  { id: 'fish-transport', title: 'Fish / fry transport permit & health certificate', agency: 'BFAR / LGU Fisheries Office', level: 'regional', required: 'if_applicable',
    sectors: ['aquaculture'],
    detail: 'Needed when moving fingerlings, live fish or fishery products out of your area. Buy fingerlings only from accredited hatcheries.' },
  { id: 'ecc-cnc-aqua', title: 'Environmental Compliance Certificate (ECC) or Certificate of Non-Coverage (CNC)', agency: 'DENR - Environmental Management Bureau', level: 'regional', required: 'if_applicable',
    sectors: ['aquaculture', 'livestock'],
    detail: 'Depends on size and location. Small backyard operations are often not covered but may still need a CNC.' },
  { id: 'wastewater', title: 'Wastewater discharge permit', agency: 'DENR-EMB (Clean Water Act)', level: 'regional', required: 'if_applicable',
    sectors: ['aquaculture', 'livestock', 'processing'],
    detail: 'For larger operations that discharge pond or washing water into waterways.' },

  // ---- Livestock ----
  { id: 'livestock-reg', title: 'Livestock / poultry farm registration', agency: 'LGU Veterinary Office / DA-Bureau of Animal Industry', level: 'lgu', required: 'mandatory',
    sectors: ['livestock'],
    detail: 'Register your farm and animals; this also helps you receive vaccination programs and outbreak alerts.',
    link: 'https://www.bai.da.gov.ph' },
  { id: 'vet-cert', title: 'Veterinary health certificate / shipping permit', agency: 'LGU Veterinarian / BAI', level: 'lgu', required: 'mandatory',
    sectors: ['livestock'],
    detail: 'Needed whenever animals or animal products leave your farm for another area. Do not move sick animals.' },
  { id: 'nmis', title: 'Meat inspection (NMIS-accredited slaughter)', agency: 'National Meat Inspection Service (NMIS)', level: 'national', required: 'if_applicable',
    sectors: ['livestock'],
    detail: 'Animals sold for meat must be slaughtered and inspected at an accredited facility.',
    link: 'https://nmis.gov.ph' },
  { id: 'biosecurity-report', title: 'Report notifiable animal diseases immediately', agency: 'LGU Veterinary Office / DA-BAI', level: 'lgu', required: 'mandatory',
    sectors: ['livestock'],
    detail: 'Diseases like avian influenza, Newcastle disease and African Swine Fever must be reported at once to prevent wider outbreaks.' },

  // ---- Processing ----
  { id: 'fda-lto', title: 'FDA License to Operate (food manufacturer/processor)', agency: 'Food and Drug Administration (FDA)', level: 'national', required: 'if_applicable',
    sectors: ['processing'],
    detail: 'For packaged/processed food (e.g. dried fish, sauces, packed produce). Requirements depend on scale - ask FDA or your DTI Negosyo Center.',
    link: 'https://www.fda.gov.ph' },
  { id: 'fda-cpr', title: 'FDA Certificate of Product Registration (CPR)', agency: 'Food and Drug Administration (FDA)', level: 'national', required: 'if_applicable',
    sectors: ['processing'],
    detail: 'Each processed food product usually needs to be registered before sale.' },
  { id: 'food-handlers', title: 'Food handler health certificates', agency: 'City/Municipal Health Office', level: 'lgu', required: 'mandatory',
    sectors: ['processing'],
    detail: 'Everyone who handles food in your processing area needs a valid health certificate.' },
];

export const PERMIT_SECTORS: { id: PermitSector; label: string }[] = [
  { id: 'agriculture', label: 'Agriculture' },
  { id: 'aquaculture', label: 'Aquaculture' },
  { id: 'livestock', label: 'Livestock' },
  { id: 'processing', label: 'Food Processing' },
];

export const permitsFor = (sector: PermitSector): PermitItem[] => PERMITS.filter((p) => p.sectors.includes(sector));
