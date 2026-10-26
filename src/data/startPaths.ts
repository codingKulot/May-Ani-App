import type { Sector } from '@/types';

/**
 * "Start here" paths in the Learning Center: step-by-step beginner guides for someone who has never farmed.
 * Every link and video below was opened and checked on 26 October 2026 (title and publisher). `official` marks a
 * government or public research source (DA and its bureaus, ATI, PhilRice, BFAR, PCAARRD, SEAFDEC, FAO, ACIAR); the
 * rest are independent Filipino channels, shown with their channel name so users know who is talking.
 * Money and timing figures are rough beginner estimates (2026), not quotes: the page says so next to them.
 */

export interface StartLink {
  label: string;
  url: string;
  /** who published it, shown under the label */
  source: string;
  official: boolean;
  /** one line on why it is worth opening */
  note?: string;
  /** spoken language of a video, when it is not English */
  lang?: string;
}

export interface StartStep {
  title: string;
  body: string;
  tip?: string;
}

export interface StartPath {
  id: string;
  title: string;
  /** null = for every farmer (registration, training, money) */
  sector: Sector | null;
  tagline: string;
  goodFor: string;
  space: string;
  money: string;
  firstIncome: string;
  level: 'Easy' | 'Medium' | 'Harder';
  before: string[];
  steps: StartStep[];
  mistakes: string[];
  help: string[];
  read: StartLink[];
  watch: StartLink[];
}

const ATI_ELEARN: StartLink = {
  label: 'ATI e-Learning: free online farming courses',
  url: 'https://elearn.e-extension.gov.ph/',
  source: 'Agricultural Training Institute (DA-ATI)',
  official: true,
  note: 'Self-paced courses on crops, livestock, fisheries and organic farming. Make a free account to enroll.',
};
const DTI_PCAARRD: StartLink = {
  label: 'DTI-PCAARRD business guides (production guides per crop and animal)',
  url: 'https://dti.gov.ph/resources/e-library/business/starting-a-business/dti-pcaarrd-business-guide/',
  source: 'DTI and DOST-PCAARRD',
  official: true,
  note: 'Free booklets with costs, steps and returns, e.g. goat, native chicken, slaughter pig, cucumber, lettuce, lakatan.',
};
const ATI_CHANNEL: StartLink = {
  label: 'ATI Central Office on YouTube',
  url: 'https://www.youtube.com/@ATICentralOffice',
  source: 'Agricultural Training Institute (DA-ATI)',
  official: true,
  note: 'Trainings, farm schools and learning-site videos from the DA training arm.',
};

export const START_PATHS: StartPath[] = [
  {
    id: 'first-steps',
    title: 'Before you start: register, train, protect',
    sector: null,
    tagline: 'Free government help most beginners never claim. Do this first, whatever you plan to grow or raise.',
    goodFor: 'Everyone starting a farm, fishpond or backyard animals',
    space: 'None needed yet',
    money: 'Free (bring IDs and photocopies)',
    firstIncome: 'Not income, but it opens seeds, training, insurance and loans',
    level: 'Easy',
    before: [
      'A valid government ID and a few photocopies of it.',
      'Proof that you may use the land: title, tax declaration, CLOA, or a lease or tenancy agreement with the owner.',
      'A notebook (or this app) to keep the names and numbers of the people you meet.',
    ],
    steps: [
      { title: 'Visit your Municipal or City Agriculture Office (MAO/CAO)',
        body: 'This is your main door to the Department of Agriculture. Tell them what you want to start and ask who the agricultural technician (AT) for your barangay is. Fish farmers can also ask for the BFAR person who covers your town.',
        tip: 'Ask what free seeds, fingerlings, trainings or demo farms are coming this season.' },
      { title: 'Register in RSBSA (Registry System for Basic Sectors in Agriculture)',
        body: 'RSBSA is the national list of farmers, farm workers, fisherfolk and agri-youth. Registration is free and lifetime. You must be at least 18. Get the enrollment form at the MAO, fill it in, and attach a copy of your ID and your proof of land use. You get a stub with a temporary RSBSA number.',
        tip: 'Being in RSBSA is what makes you eligible for most DA aid: seeds, fertilizer, insurance, loans and trainings.' },
      { title: 'Fish farmers: also register in FishR',
        body: 'FishR is the BFAR registry of municipal fisherfolk. Ask your MAO or the BFAR office. A fishpond may also need registration with BFAR or the LGU; see the Permits page in this app for the list.' },
      { title: 'Take a free course before you spend money',
        body: 'ATI e-Learning has free, self-paced online courses (crops, livestock, fisheries, organic farming). ATI regional training centers and the MAO also run face-to-face trainings and Farmer Field Schools. A two-week course can save you a season of mistakes.' },
      { title: 'Visit a working farm near you',
        body: 'Ask the MAO or ATI for an ATI Learning Site (a farmer-run farm open to visitors) or a successful farmer in your barangay. Watch one full cycle if you can: planting, feeding, harvest, selling.' },
      { title: 'Insure your crop, fish or animals (PCIC)',
        body: 'The Philippine Crop Insurance Corporation insures rice, corn, high-value crops, livestock, and fisheries against typhoon, flood, drought, pests and diseases. For many small RSBSA-registered farmers the premium is paid by the government. Ask your MAO or the PCIC regional office how to enroll before you plant or stock.' },
      { title: 'Know where cheap credit is, and avoid "5-6"',
        body: 'The Agricultural Credit Policy Council (ACPC) runs the Agri-Negosyo (ANYO) loan: for RSBSA-registered small farmers and fisherfolk, up to ₱300,000, 2% interest a year, paid back based on your harvest. You apply through acpcaccess.ph and a partner cooperative or rural bank. Check if it is open in your area before counting on it.',
        tip: 'Start with your own small money first. Borrow only after you have done one or two cycles and know your costs.' },
      { title: 'Join a farmers association or cooperative',
        body: 'Groups get more DA projects, buy inputs cheaper, share equipment and sell in bulk at better prices. The MAO knows the active groups in your barangay.' },
    ],
    mistakes: [
      'Buying land, a big pond or 50 animals before doing one small trial.',
      'Not registering in RSBSA, then missing free seeds, insurance and loans.',
      'Borrowing from "5-6" lenders for farm inputs: the interest eats the harvest.',
      'Skipping insurance in typhoon season.',
    ],
    help: [
      'Municipal / City Agriculture Office (MAO/CAO) at your town or city hall',
      'Your barangay agricultural technician (AT)',
      'ATI Regional Training Center for your region',
      'BFAR Regional Office (fish farmers)',
      'PCIC regional or provincial office (insurance)',
    ],
    read: [
      { label: 'RSBSA questions and answers (who can register, what to bring)', url: 'https://car.da.gov.ph/wp-content/uploads/2024/02/RSBSA-FAQs.pdf', source: 'DA Regional Field Office CAR', official: true },
      ATI_ELEARN,
      { label: 'ATI website: trainings and regional training centers', url: 'https://ati2.da.gov.ph/ati-main/', source: 'Agricultural Training Institute (DA-ATI)', official: true },
      { label: 'Agri-Negosyo (ANYO) loan: who can borrow and how', url: 'https://acpc.gov.ph/agri-negosyo-loan-program-anyo/', source: 'Agricultural Credit Policy Council (ACPC)', official: true },
      { label: 'Philippine Crop Insurance Corporation', url: 'https://pcic.gov.ph/', source: 'PCIC', official: true },
      DTI_PCAARRD,
    ],
    watch: [
      ATI_CHANNEL,
      { label: 'Department of Agriculture on YouTube', url: 'https://www.youtube.com/channel/UCDzepTQPbPhpD-Yof-AQ-rw', source: 'Department of Agriculture - Philippines', official: true },
      { label: "ATI RTC CAR's Village Learning Site for Agriculture", url: 'https://www.youtube.com/watch?v=-ubv88e3Ke4', source: 'ATI Cordillera', official: true, note: 'What a learning site looks like and what you can learn there.' },
    ],
  },

  {
    id: 'vegetables',
    title: 'Grow vegetables (gulayan)',
    sector: 'crops',
    tagline: 'The fastest and cheapest way to start. Pechay is ready in about a month.',
    goodFor: 'Backyard, rooftop, a vacant lot, or a first small farm',
    space: '10 to 50 sqm to start (even pots on a rooftop)',
    money: 'About ₱2,000 to ₱5,000 for seeds, compost and simple tools',
    firstIncome: '25 to 45 days (pechay, kangkong, mustasa); 60 to 90 days (sitaw, okra, talong)',
    level: 'Easy',
    before: [
      'A spot with at least 6 hours of direct sun a day.',
      'Water nearby: a faucet, a well, or a drum you can refill.',
      'Ask 3 neighbors, a carinderia or a sari-sari store which vegetables they buy every week.',
    ],
    steps: [
      { title: 'Pick 2 or 3 easy crops',
        body: 'Good first crops: pechay (about 30 days), kangkong (25 to 30 days, cut again and again), mustasa, sitaw, okra and talong. Choose what your buyers already buy. Grow leafy greens for quick cash and one fruiting crop for steady harvests.' },
      { title: 'Prepare the soil and make raised beds',
        body: 'Clear weeds and stones. Loosen the soil about one shovel deep. Make beds 1 m wide, 20 to 30 cm high, as long as you like, with 50 cm paths. Mix in compost or decomposed animal manure: about one part compost to three parts soil.',
        tip: 'Raised beds drain fast in heavy rain, which prevents most root rot.' },
      { title: 'Get good seeds',
        body: 'Buy sealed packs from an agri-supply store (check the expiry date) or ask the MAO for free seeds from DA programs. Start small: one pack per crop is enough for a beginner bed.' },
      { title: 'Sow in a seedling tray first',
        body: 'Pechay, mustasa, talong and tomato do better when started in a tray or seedbed with fine soil. Sow 1 to 2 seeds per hole, keep them shaded and moist. Transplant after 2 to 3 weeks when they have 3 to 4 true leaves, in the late afternoon. Sitaw, okra and kangkong can be sown directly in the bed.' },
      { title: 'Water and mulch',
        body: 'Water at the base of the plants early in the morning; in hot months also late afternoon. Cover the soil between plants with rice straw or dried leaves (mulch) to keep moisture and stop weeds.' },
      { title: 'Feed the plants',
        body: 'Side-dress with compost every 2 weeks. If you use commercial fertilizer, follow the label or ask the MAO technician; too much burns plants and wastes money. You can also make your own compost from farm and kitchen waste (see the compost guide below).' },
      { title: 'Check for pests every morning',
        body: 'Walk your beds daily. Pick off worms and eggs by hand. Remove badly sick plants. Use the Health page in this app to identify a problem from a photo before you spray anything.',
        tip: 'Planting marigold, basil or tanglad around the beds helps keep some insects away.' },
      { title: 'Harvest at the right time and sell fresh',
        body: 'Harvest early in the morning when it is cool. Pechay: 25 to 35 days after transplanting, before it flowers. Kangkong: cut 30 days after planting, leaving 5 cm so it grows back. Sell the same day to neighbors, carinderias and the palengke.' },
      { title: 'Plant again in batches',
        body: 'Sow a new batch every 1 to 2 weeks so you always have something to sell. Rotate crop families on each bed (leafy, then beans, then fruiting) to keep the soil healthy.' },
    ],
    mistakes: [
      'Planting a big area at once and not being able to water or sell it all.',
      'Watering the leaves at night (invites fungus).',
      'Spraying chemicals before knowing what the pest is.',
      'Planting the same crop on the same bed every time.',
    ],
    help: [
      'Municipal Agriculture Office: free seeds, soil analysis, technician visits',
      'ATI Regional Training Center: vegetable and organic farming trainings',
      'DA Regional Field Office: high-value crops program',
    ],
    read: [
      ATI_ELEARN,
      DTI_PCAARRD,
    ],
    watch: [
      { label: 'Ampalaya farming: how to grow ampalaya (bitter gourd)', url: 'https://www.youtube.com/watch?v=0D-2BCZyN1E', source: 'Agribusiness How It Works', official: false, note: 'A Filipino farm walks through planting, trellis, care and harvest.' },
      { label: 'Paano patabain ang lupa para sa gulay? (making soil rich for vegetables)', url: 'https://www.youtube.com/watch?v=IIq1bw2KBGI', source: 'AgriTayo Derick', official: false, lang: 'Tagalog' },
      ATI_CHANNEL,
    ],
  },

  {
    id: 'rice',
    title: 'Grow rice (palay) the PalayCheck way',
    sector: 'crops',
    tagline: "PhilRice's 9 key checks: the official step-by-step system for a good rice harvest.",
    goodFor: 'Someone with access to an irrigated or rainfed rice field',
    space: 'From 0.25 hectare; most farms are 0.5 to 2 hectares',
    money: 'Roughly ₱50,000 to ₱70,000 per hectare per season (seed, fertilizer, labor, machine rental)',
    firstIncome: 'About 4 months (110 to 120 days from sowing for most inbred varieties)',
    level: 'Medium',
    before: [
      'Know your water: irrigated (NIA or communal) or rainfed? It decides the variety and planting date.',
      'Talk to the irrigators association and neighboring farmers about the planting schedule. Planting together with them reduces pests and rats.',
      'Register in RSBSA: rice farmers get free certified seed under the RCEF program.',
    ],
    steps: [
      { title: 'Key Check 1: use high-quality seed of a recommended variety',
        body: 'Use certified seed of a variety recommended for your area and season (ask the MAO or use the Binhing Palay app). Good seed alone can raise yield by about 10%.' },
      { title: 'Key Check 2: prepare a well-leveled field',
        body: 'Plow and harrow so the field has no high or low spots. A level field holds water evenly, controls weeds and lets every plant get fertilizer. Repair the dikes (pilapil).' },
      { title: 'Key Check 3: plant together, after a 30-day rest',
        body: 'Leave the field fallow for at least 30 days after the last harvest, then plant within the same 2 weeks as your neighbors (synchronous planting). This breaks the life cycle of pests and diseases.' },
      { title: 'Key Check 4: enough healthy seedlings',
        body: 'For transplanting, prepare a seedbed and use about 20 to 40 kg of seed per hectare (less for hybrid seed). Transplant young seedlings (around 20 to 25 days) at the right spacing. For direct seeding, follow the recommended seeding rate so plants are not too thick.' },
      { title: 'Key Check 5: give enough nutrients at the right time',
        body: 'Supply nutrients from tillering to early panicle initiation and at flowering. Use the MOET kit or a soil test (free at many MAOs) to know what your soil lacks, so you do not buy fertilizer you do not need.' },
      { title: 'Key Check 6: avoid too little or too much water',
        body: 'Keep the field from drying out and from deep flooding at the wrong time, especially from panicle initiation to flowering. Too little water stops the plant from using the fertilizer you paid for.' },
      { title: 'Key Check 7: no big losses from pests',
        body: 'Watch for insects, diseases, weeds, rats, golden kuhol (snails) and birds. Scout the field every week. Act early and only when needed; ask your technician before spraying.' },
      { title: 'Key Check 8: harvest at the right time',
        body: 'Harvest when 80 to 85% of the grains are golden yellow. Thresh right away; palay left in piles loses quality.' },
      { title: 'Key Check 9: dry and store properly',
        body: 'Dry the palay to 12 to 14% moisture before storage or selling. Clean it and store in dry, sealed sacks off the floor. Well-dried palay gets a better price from NFA and traders.' },
    ],
    mistakes: [
      'Using your own saved seed for many seasons (yield drops).',
      'Planting weeks after your neighbors: pests and rats move to the late field.',
      'Adding fertilizer by guess instead of by soil test.',
      'Leaving harvested palay wet in the field.',
    ],
    help: [
      'Municipal Agriculture Office and your rice technician (RCEF seeds and trainings)',
      'PhilRice station in your region, and the PhilRice text center',
      'Irrigators association (water schedule)',
    ],
    read: [
      { label: 'PalayCheck System (2022 revised edition) booklet', url: 'https://www.philrice.gov.ph/wp-content/uploads/2023/02/PalayCheck-System-2022-Revised-Edition.pdf', source: 'PhilRice', official: true, note: 'The full 9 key checks with pictures. Also in Filipino: "Sistemang PalayCheck".' },
      { label: 'Sistemang PalayCheck (Filipino edition)', url: 'https://www.philrice.gov.ph/wp-content/uploads/2023/02/Sistemang-PalayCheck.pdf', source: 'PhilRice', official: true },
      { label: 'Pinoy Rice Knowledge Bank: rice production step by step', url: 'https://www.pinoyrice.com/', source: 'PhilRice', official: true },
      { label: 'PalayCheck app (check your crop on your phone)', url: 'https://palaycheckapp.philrice.gov.ph/', source: 'PhilRice', official: true },
    ],
    watch: [
      { label: 'Rice production: PhilRice Lakbay Palay', url: 'https://www.youtube.com/watch?v=Y4XCxUHGXL0', source: 'Agribusiness How It Works', official: false, note: 'A visit to PhilRice showing modern rice production practices.' },
      { label: 'Bakit bansot ang palay? (why rice stays short: water and nutrients)', url: 'https://www.youtube.com/watch?v=33_VlUO8Ijc', source: 'PhilRiceTV', official: true, lang: 'Tagalog' },
      { label: 'Binhing Palay app: choosing the right rice seed', url: 'https://www.youtube.com/watch?v=nYV0IdC8Uvw', source: 'DDT Nature Farm', official: false, lang: 'Tagalog', note: 'Walks through the free PhilRice app using RC 402 as the example.' },
      { label: 'PhilRiceTV channel', url: 'https://www.youtube.com/@philricetv', source: 'PhilRice', official: true },
    ],
  },

  {
    id: 'fruit-trees',
    title: 'Plant fruit trees (banana, calamansi, mango)',
    sector: 'fruits',
    tagline: 'Slower to start, but one good tree pays for years. Begin with fast fruiters.',
    goodFor: 'A backyard or farm with space you will not need for other crops',
    space: 'About 9 to 25 sqm per tree (banana 2 to 3 m apart, calamansi 3 to 4 m, mango 8 to 10 m)',
    money: 'About ₱3,000 to ₱8,000 for 10 grafted seedlings or banana suckers, compost and stakes',
    firstIncome: 'Banana 9 to 12 months; papaya 8 to 10 months; grafted calamansi 1 to 2 years; grafted mango 3 to 5 years',
    level: 'Medium',
    before: [
      'Check that the spot gets full sun and does not flood after heavy rain.',
      'Decide if you will sell fresh fruit or planting materials; it changes which variety you buy.',
      'Plan where water comes from in the dry months for the first two years.',
    ],
    steps: [
      { title: 'Choose a fruit that fits your area',
        body: 'For a beginner: banana (lakatan, saba) and papaya give income within a year; calamansi bears in 1 to 2 years if grafted. Mango, rambutan and lanzones are long-term. Ask the MAO which fruits do well in your town.' },
      { title: 'Buy healthy, grafted planting materials',
        body: 'Buy from a BPI-accredited nursery or a DA or SUC (state university) nursery. Grafted seedlings bear years earlier than ones grown from seed. For banana, use clean suckers or tissue-cultured plantlets to avoid bunchy top and wilt diseases.' },
      { title: 'Dig big holes and add compost',
        body: 'Dig holes about 50 x 50 x 50 cm (bigger for mango). Mix the topsoil with compost or decomposed manure and put it back in the hole.' },
      { title: 'Plant at the start of the rainy season',
        body: 'Plant in the late afternoon. Keep the graft union above the soil. Firm the soil, water well, and tie the seedling to a stake so wind does not rock it.' },
      { title: 'Mulch, water and weed for the first two years',
        body: 'Keep a circle of mulch around each tree (not touching the trunk). Water weekly in the dry season. Pull weeds around the base. You can grow vegetables between young trees for income while you wait.' },
      { title: 'Fertilize and prune',
        body: 'Add compost every 3 to 4 months. Remove water sprouts and branches below the graft. For banana, keep one main plant and one or two followers per hill and remove the rest.' },
      { title: 'Protect the fruits',
        body: 'Bag mango and other fruits against fruit flies when they are egg-sized. Remove fallen and rotting fruits. Use the Health page if leaves or fruits look sick.' },
      { title: 'Harvest carefully and sell by grade',
        body: 'Harvest at the right maturity, handle gently, sort by size and quality. Graded, clean fruit sells for more.' },
    ],
    mistakes: [
      'Buying cheap ungrafted seedlings and waiting years for poor fruit.',
      'Planting too close together; trees later shade each other.',
      'Using banana suckers from a farm with bunchy top or wilt.',
      'Forgetting to water young trees in the dry season.',
    ],
    help: [
      'Municipal Agriculture Office: list of accredited nurseries, free seedlings in some programs',
      'DA Bureau of Plant Industry (BPI) stations and state university nurseries',
    ],
    read: [
      DTI_PCAARRD,
      ATI_ELEARN,
    ],
    watch: [
      { label: 'How to grow banana (full version)', url: 'https://www.youtube.com/watch?v=wsE8J-o8KTw', source: 'Agribusiness How It Works', official: false },
      { label: 'Integrated crop management for mango production in the Philippines', url: 'https://www.youtube.com/watch?v=KPYuUQQcbJs', source: 'ACIAR Australia', official: true, note: 'Research project with Philippine mango growers: flowering, pests, bagging.' },
    ],
  },

  {
    id: 'tilapia',
    title: 'Raise tilapia in a pond or tank',
    sector: 'fish',
    tagline: 'The most popular first fish. Most losses come from bad water, so learn the water first.',
    goodFor: 'A lot with steady water, or a backyard with a tank or lined pond',
    space: 'From a 2 x 3 m tank to a 200 sqm earthen pond',
    money: 'About ₱15,000 to ₱30,000 for one cycle in a 200 sqm pond (fingerlings and feed; digging the pond is extra)',
    firstIncome: '4 to 5 months to reach market size (about 200 to 250 g, 4 to 5 fish per kilo)',
    level: 'Medium',
    before: [
      'A year-round water source (well, spring, irrigation canal) that does not dry up in summer.',
      'A site that does not flood in typhoons, or a plan to raise the dikes and add nets.',
      'Find a buyer first: palengke vendors, restaurants, neighbors. Live fish sell best.',
    ],
    steps: [
      { title: 'Choose your system',
        body: 'Earthen pond (cheapest per kilo, needs land and water), concrete or lined tank (good for backyards), or cage in a lake (needs a permit). Beginners do well with a small pond of 100 to 200 sqm, about 1 m deep.' },
      { title: 'Prepare the pond',
        body: 'Drain and dry the pond bottom for 1 to 2 weeks until it cracks. Remove mud and repair dikes. Spread agricultural lime on acidic soil. Fill with water through a fine net so wild fish cannot enter, then fertilize with chicken manure or the advised fertilizer to grow natural food (the water turns light green).' },
      { title: 'Get good fingerlings',
        body: 'Buy healthy, same-size fingerlings from a BFAR or BFAR-accredited hatchery. Ask the BFAR office or MAO; some programs give free fingerlings to registered fish farmers. All-male (sex-reversed) fingerlings grow bigger because they do not breed in the pond.' },
      { title: 'Stock carefully',
        body: 'Beginners: about 2 to 4 fingerlings per square meter in a green-water pond. Stock early in the morning. Float the bag in the pond for 15 to 30 minutes so the temperature evens out, then let the fish swim out slowly.',
        tip: 'Fewer fish that grow well earn more than a crowded pond where many die.' },
      { title: 'Feed the right amount',
        body: 'Feed 2 to 3 times a day with floating pellets matched to fish size (starter, grower, finisher). If feed is still floating after 15 minutes, you are overfeeding. Feed is the biggest cost, about half or more of the total.' },
      { title: 'Watch the water every dawn',
        body: 'Fish gulping at the surface at sunrise means low oxygen: stop feeding, add fresh water or run an aerator. Keep the water light green, not dark green or brown. Change 10 to 20% of the water weekly if you can. Never drain suddenly.' },
      { title: 'Sample and keep records',
        body: 'Every 2 weeks, net 20 to 30 fish, weigh them and count. This tells you if they are growing and how much feed to give. Record feed bags used and fish deaths in this app.' },
      { title: 'Harvest and sell',
        body: 'Stop feeding a day before harvest. Harvest early in the morning, partial or total. Keep fish alive or on ice and sell the same day.' },
    ],
    mistakes: [
      'Stocking too many fish for the water you have.',
      'Overfeeding: wasted money and polluted water.',
      'Buying mixed-size or unknown fingerlings.',
      'No plan for floods: a typhoon can wash out the whole stock.',
    ],
    help: [
      'BFAR Regional Office and BFAR technology centers (e.g. the National Freshwater Fisheries Technology Center in Muñoz, Nueva Ecija)',
      'Municipal Agriculture Office / fisheries technician',
      'SEAFDEC Aquaculture Department trainings (Iloilo and Rizal)',
    ],
    read: [
      { label: 'Tilapia farming in cages and ponds (extension manual, free PDF)', url: 'https://repository.seafdec.org/handle/20.500.12066/1940', source: 'SEAFDEC Aquaculture Department', official: true, note: 'A 40-page illustrated beginner manual: seedstock, feeding, water, harvest.' },
      { label: 'Bureau of Fisheries and Aquatic Resources (FishR, aquafarm registration, technology centers)', url: 'https://www.bfar.da.gov.ph/', source: 'DA-BFAR', official: true },
      { label: 'Culture of freshwater catfish (hito) in concrete tanks, and other fish guides', url: 'https://dti.gov.ph/resources/e-library/business/starting-a-business/dti-pcaarrd-business-guide/', source: 'DTI and DOST-PCAARRD', official: true },
      ATI_ELEARN,
    ],
    watch: [
      { label: 'Tilapia farming: pond preparation and management', url: 'https://www.youtube.com/watch?v=YH6EIeJ549I', source: 'Agribusiness How It Works', official: false, note: 'Each pond-preparation step and why it matters.' },
      { label: 'Tilapia farming in ponds, part 1: tilapia farming in the Philippines', url: 'https://www.youtube.com/watch?v=mGxGaguJl6Y', source: 'Agribusiness How It Works', official: false },
      { label: 'Tilapia farming in ponds, part 2: pond cultural practices', url: 'https://www.youtube.com/watch?v=_GYUM2efX2U', source: 'Agribusiness How It Works', official: false },
      { label: 'BFAR on YouTube', url: 'https://www.youtube.com/channel/UCxkqnG214PvYqcGoa-ZptIA', source: 'Bureau of Fisheries and Aquatic Resources', official: true },
    ],
  },

  {
    id: 'native-chicken',
    title: 'Raise native chicken',
    sector: 'livestock',
    tagline: 'Low feed cost, hardy birds and a premium price. Vaccination and a dry house make or break it.',
    goodFor: 'A backyard with some space for birds to roam',
    space: 'A house of about 1 sqm per 3 to 5 birds, plus a fenced range',
    money: 'About ₱5,000 to ₱12,000 for 10 hens and 1 rooster, a simple house, feeders and vaccines',
    firstIncome: 'Meat birds in 3 to 4 months; eggs when hens are about 5 to 6 months old',
    level: 'Easy',
    before: [
      'Check barangay rules about keeping poultry near houses.',
      'A shaded, dry area safe from dogs, cats, snakes and floods.',
      'Find the LGU veterinarian (city or municipal vet) for vaccines.',
    ],
    steps: [
      { title: 'Build a simple, dry house',
        body: 'Raised floor or deep litter (rice hull) bedding, roof against rain, good airflow, roosts and a few nest boxes. Fence a range area where birds can forage for grass and insects.' },
      { title: 'Start with healthy stock',
        body: 'Buy from a known breeder or a DA or university project. Look for active birds with bright eyes and clean vents. Native breeds include Darag, Banaba, Paraoakan and Joloano. Keep new birds apart for 2 weeks before they join the flock.' },
      { title: 'Vaccinate on schedule',
        body: 'Newcastle disease (sakit ng manok) kills whole flocks. Ask your LGU vet for the vaccination schedule for your area and follow it. Write each vaccination date in the app.' },
      { title: 'Feed and water',
        body: 'Clean water every day. Combine foraging with commercial feed or a home mix (rice bran, corn, kitchen greens, azolla, madre de agua leaves). Chicks need starter feed and warmth (a brooder with a bulb) for the first 2 to 3 weeks.' },
      { title: 'Keep it clean (biosecurity)',
        body: 'Change wet litter, clean waterers daily, and limit visitors. Wash hands and boots before entering. Do not bring in birds from cockpits or markets without quarantine.' },
      { title: 'Hatch your own chicks',
        body: 'Let good mother hens sit on 10 to 12 eggs. Remove old or weak birds and keep the best laying hens and a strong rooster. Replace the rooster every 2 years to avoid inbreeding.' },
      { title: 'Sell eggs and live birds',
        body: 'Native eggs and live birds sell at a premium to neighbors, restaurants and markets. Record every sale so you know your real profit.' },
    ],
    mistakes: [
      'Skipping vaccination to save money.',
      'Wet, crowded housing (respiratory disease and coccidiosis).',
      'Mixing new birds with the flock right away.',
      'Not protecting chicks from rats, cats and cold.',
    ],
    help: [
      'City or Municipal Veterinarian (vaccines, sick birds)',
      'Municipal Agriculture Office (livestock dispersal and trainings)',
      'Bureau of Animal Industry (BAI) regional office',
    ],
    read: [
      { label: 'Invest in slaughter native chicken production (business guide)', url: 'https://dti.gov.ph/resources/e-library/business/starting-a-business/dti-pcaarrd-business-guide/', source: 'DTI and DOST-PCAARRD', official: true },
      { label: 'Bureau of Animal Industry: animal health and disease advisories', url: 'https://www.bai.gov.ph/', source: 'DA-BAI', official: true },
      ATI_ELEARN,
    ],
    watch: [
      { label: 'Development of breeder farms of Philippine native chicken for meat and egg production', url: 'https://www.youtube.com/watch?v=Jb-zKMM8S2M', source: 'DA Bureau of Agricultural Research (DABAROfficial)', official: true, note: 'BAI poultry head on Paraoakan, Banaba and Joloano breeds.' },
      { label: 'Free-range chicken farming (full version, English subtitles)', url: 'https://www.youtube.com/watch?v=b29XoInJa3U', source: 'Agribusiness How It Works', official: false },
      { label: 'How to overcome challenges in growing native chicken commercially', url: 'https://www.youtube.com/watch?v=oI1rxI_IHdw', source: 'Philippine Native Chicken', official: false },
    ],
  },

  {
    id: 'backyard-pigs',
    title: 'Raise pigs in the backyard (fattening)',
    sector: 'livestock',
    tagline: 'Buy piglets, grow them for 4 months, sell. Strict ASF biosecurity is a must.',
    goodFor: 'A backyard at a proper distance from houses, with water and drainage',
    space: 'About 1 to 1.5 sqm per fattener in a concrete pen, plus a manure pit',
    money: 'About ₱30,000 to ₱45,000 for 2 piglets, feed to market weight, and simple pen repairs',
    firstIncome: 'About 4 months from a weaned piglet to market weight (around 90 to 100 kg)',
    level: 'Medium',
    before: [
      'Ask the barangay and LGU about rules on hog pens near houses and ASF restrictions in your area.',
      'Plan where manure and wash water go (a pit or biogas), so neighbors and creeks are not polluted.',
      'Price check: piglet cost, a sack of feed, and the live-weight price buyers pay now.',
    ],
    steps: [
      { title: 'Build or fix a clean pen',
        body: 'Concrete floor sloped to a drain, roof for shade, walls against wind, a feeder and a nipple drinker. A footbath with disinfectant at the entrance.' },
      { title: 'Buy healthy piglets from an ASF-free source',
        body: 'Buy weaned piglets (about 25 to 30 days or 8 to 10 kg) from a known, licensed farm with papers. Ask the LGU vet about ASF zoning in your area. Never buy cheap pigs from unknown sources.' },
      { title: 'Feed by stage',
        body: 'Use booster, starter, grower, then finisher feed as the label says. Clean water all the time. Weigh or tape-measure monthly so you know if they are on track.' },
      { title: 'Vaccinate and deworm',
        body: 'Ask your LGU vet for the schedule (for example hog cholera, deworming, iron for young piglets). Record every date in the app.' },
      { title: 'Follow ASF biosecurity every day',
        body: 'Do not feed kitchen leftovers (swill), especially anything with pork. Do not let visitors, traders or other farmers into the pen. Wash and disinfect boots and hands. Keep the pen fenced from stray animals. Report sick or dying pigs to the vet right away.' },
      { title: 'Manage manure',
        body: 'Clean the pen daily. Put manure in a pit or compost it for your vegetables. A small biogas digester turns manure into cooking gas.' },
      { title: 'Sell at market weight',
        body: 'Sell at around 90 to 100 kg to a licensed trader or slaughterhouse. Compare offers using live weight, not guessing.' },
    ],
    mistakes: [
      'Feeding swill (kitchen leftovers): the main way ASF reaches backyard pigs.',
      'Buying piglets from unknown sources or from areas with ASF.',
      'Letting traders and visitors walk into the pen.',
      'Not counting feed cost: feed is usually 70% or more of the total.',
    ],
    help: [
      'City or Municipal Veterinarian (vaccines, ASF reporting, transport permits)',
      'Bureau of Animal Industry (BAI) regional office',
      'Municipal Agriculture Office (swine repopulation programs)',
    ],
    read: [
      { label: 'Bureau of Animal Industry: African swine fever situation and zoning', url: 'https://www.bai.gov.ph/', source: 'DA-BAI', official: true },
      { label: 'Invest in three- or four-way cross slaughter pig production (business guide)', url: 'https://dti.gov.ph/resources/e-library/business/starting-a-business/dti-pcaarrd-business-guide/', source: 'DTI and DOST-PCAARRD', official: true },
      ATI_ELEARN,
    ],
    watch: [
      { label: 'Practice biosecurity to save your pigs (cleaning and disinfection)', url: 'https://www.youtube.com/watch?v=VIOwydNgAVY', source: 'Food and Agriculture Organization of the UN (FAO)', official: true },
      { label: 'Backyard hog fattening, part 1: the hog fattening industry in the Philippines', url: 'https://www.youtube.com/watch?v=G9oP2NC_61Y', source: 'Agribusiness How It Works', official: false },
      { label: 'Backyard hog fattening, part 2: hog fattening management', url: 'https://www.youtube.com/watch?v=JKrjaIZrdoE', source: 'Agribusiness How It Works', official: false },
    ],
  },

  {
    id: 'goats',
    title: 'Raise goats',
    sector: 'livestock',
    tagline: 'Goats eat grass and leaves you can grow yourself. Start with a few does and grow the herd.',
    goodFor: 'A farm or large lot with grass, ipil-ipil, madre de agua or other forage',
    space: 'A raised house of about 1 sqm per goat, plus land for forage',
    money: 'About ₱25,000 to ₱50,000 for 3 does, 1 buck and a simple raised house',
    firstIncome: 'First kids about 5 months after breeding; sell slaughter goats at 8 to 12 months old',
    level: 'Medium',
    before: [
      'Make sure you can grow or cut enough forage every day, all year.',
      'Ask the barangay about rules on letting animals graze.',
      'Find the LGU vet and a nearby goat raiser who can mentor you.',
    ],
    steps: [
      { title: 'Build a raised goat house',
        body: 'Slatted floor about 1 m above the ground so manure and urine fall through, a roof against rain, and a feeding trough. Goats hate wet ground; dampness causes pneumonia and foot rot.' },
      { title: 'Plant forage first',
        body: 'Plant napier, ipil-ipil, madre de agua, gliricidia (kakawate) and grasses before the goats arrive. Cut-and-carry feeding keeps goats healthier than free grazing.' },
      { title: 'Buy healthy stock',
        body: 'Start with 3 to 5 does and 1 buck from a reputable breeder or a government breeding station. Check for clear eyes, no cough, no diarrhea, and good teeth. Quarantine new goats for 2 weeks.' },
      { title: 'Feed and water daily',
        body: 'Fresh forage morning and afternoon, clean water, and mineral salt. Give a little concentrate to pregnant and milking does.' },
      { title: 'Deworm and check health',
        body: 'Worms are the top killer of goats. Ask your vet for a deworming schedule and check the inner eyelids: pale means anemia from worms. Trim hooves every 2 to 3 months.' },
      { title: 'Breed and care for kids',
        body: 'Pregnancy is about 5 months. Make sure kids drink colostrum in the first hours. Keep breeding records so the buck does not mate with his own daughters; replace or swap the buck every 2 years.' },
      { title: 'Sell slaughter goats or breeders',
        body: 'Sell slaughter goats at 8 to 12 months by live weight, or good does as breeders to other raisers.' },
    ],
    mistakes: [
      'Housing goats on wet ground.',
      'Not deworming regularly.',
      'Buying too many goats before the forage is ready.',
      'Inbreeding from keeping the same buck too long.',
    ],
    help: [
      'City or Municipal Veterinarian',
      'Municipal Agriculture Office (livestock dispersal programs)',
      'State universities with goat projects in your region',
    ],
    read: [
      { label: 'Invest in goat farming (business guide)', url: 'https://dti.gov.ph/resources/e-library/business/starting-a-business/dti-pcaarrd-business-guide/', source: 'DTI and DOST-PCAARRD', official: true },
      ATI_ELEARN,
    ],
    watch: [
      { label: 'Goat farming (full version)', url: 'https://www.youtube.com/watch?v=9fM5D5cM0HU', source: 'Agribusiness How It Works', official: false },
      { label: 'Slaughter goat farming, part 1: slaughter goat farming in the Philippines', url: 'https://www.youtube.com/watch?v=JonEnsp2fnI', source: 'Agribusiness How It Works', official: false },
      { label: 'Dairy goat farming, part 1: dairy goat farming in the Philippines', url: 'https://www.youtube.com/watch?v=S_p0q4NfFFw', source: 'Agribusiness How It Works', official: false },
    ],
  },
];

export const startPath = (id: string) => START_PATHS.find((p) => p.id === id);
