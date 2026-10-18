export interface Guide {
  id: string;
  title: string;
  topic: 'Crops' | 'Fish' | 'Livestock' | 'Business' | 'Hazards';
  minutes: number;
  intro: string;
  steps: string[];
}

export const GUIDES: Guide[] = [
  { id: 'start-small', title: 'Start small: your first 20 sqm', topic: 'Business', minutes: 4,
    intro: 'The cheapest lesson is the one you learn on a small plot. Prove you can grow and sell before you scale.',
    steps: [
      'Pick 2-3 easy crops (kangkong, pechay, sitaw) that sell locally.',
      'Use raised beds 1 m wide so you never step on the soil.',
      'Keep a simple notebook (or this app): date planted, money spent, kilos harvested, price sold.',
      'Sell first to neighbors, carinderias and sari-sari stores - fresh and local wins.',
      'After two harvests, reinvest profit into a bigger bed or a second crop.',
    ] },
  { id: 'raised-bed', title: 'Raised beds, drainage and drip basics', topic: 'Crops', minutes: 5,
    intro: 'Good drainage prevents most root diseases and rain damage. Drip irrigation saves water and time.',
    steps: [
      'Make beds 1 m wide, up to 5 m long, 20-30 cm high, with 50 cm paths.',
      'Dig a shallow canal on the low side of the plot; give it a gentle 1-2% slope so water leaves.',
      'Mix compost (about one-third by volume) into the topsoil.',
      'Lay 1-2 drip lines per bed, or water at the base with a can in the morning.',
      'Mulch with rice straw or dried leaves to hold moisture and cut weeds.',
    ] },
  { id: 'compost', title: 'Make compost from farm waste', topic: 'Crops', minutes: 4,
    intro: 'Compost is the cheapest fertilizer you can make and fixes tired soil.',
    steps: [
      'Pile green material (vegetable scraps, fresh grass) and brown material (dry leaves, rice hull) about 1 : 2.',
      'Keep the pile as damp as a squeezed sponge and turn it every 1-2 weeks.',
      'It is ready in 6-10 weeks when it is dark, crumbly and smells like earth.',
      'Do not add meat, oily food or diseased plants.',
    ] },
  { id: 'tilapia-basics', title: 'Tilapia pond basics: keep the water alive', topic: 'Fish', minutes: 5,
    intro: 'Most fish losses are water problems, not fish problems. Learn the early signs.',
    steps: [
      'Buy fingerlings from a BFAR-accredited hatchery and stock early in the morning.',
      'Feed small amounts 2-3 times a day; if feed is left after 15 minutes, you are overfeeding.',
      'Watch the fish at dawn: gulping at the surface means low oxygen - add water or aeration.',
      'Exchange 10-20% of the water weekly if you can; never drain the pond suddenly.',
      'Harvest at the size your buyers want and sell the same day when possible.',
    ] },
  { id: 'native-chicken', title: 'Native chicken: low-cost starter flock', topic: 'Livestock', minutes: 4,
    intro: 'Native chicken needs less feed and fetches a premium. Biosecurity is what protects your investment.',
    steps: [
      'Build a raised, dry shelter with shade, a roost and a fenced run.',
      'Start with healthy chicks from a trusted source; quarantine any new birds for 2 weeks.',
      'Ask your LGU veterinarian for the vaccination schedule (Newcastle disease first).',
      'Give clean water daily and supplement forage with feed or kitchen scraps.',
      'Sick birds: isolate them and call the veterinarian.',
    ] },
  { id: 'sell-smart', title: 'Sell smart: farm-gate vs market price', topic: 'Business', minutes: 4,
    intro: 'Middlemen take part of the price between farm and table. Shrink that gap to keep more of the money.',
    steps: [
      'Check farm-gate vs retail in the Market tab before you agree to a price.',
      'Sell directly to carinderias, hotels, schools and neighbors when volumes are small.',
      'Join a cooperative or farmers group to sell in bulk and negotiate better.',
      'Grade and clean your produce - a tidy product earns a better price.',
      'Never be the only supplier a single buyer depends on, and never rely on one buyer for all your sales.',
    ] },
  { id: 'typhoon-prep', title: 'Before the typhoon: protect your farm', topic: 'Hazards', minutes: 4,
    intro: 'Typhoon season hits fields and ponds hard. A little preparation saves a lot.',
    steps: [
      'Harvest mature crops early and secure what you can.',
      'Clear canals and drains and check that water can leave the plot.',
      'Lower pond water level a little to catch heavy rain, and secure net covers and cages.',
      'Move animals to higher, sturdy shelter and store feed off the ground.',
      'Follow PAGASA advisories and your LGU/DRRMO instructions.',
    ] },
  { id: 'records', title: 'Keep simple farm records', topic: 'Business', minutes: 3,
    intro: 'Records tell you what makes money and what loses it. Banks and cooperatives also ask for them.',
    steps: [
      'Write down every expense on the day it happens.',
      'Record every harvest in kilos and every sale with price and buyer.',
      'Review profit once a month: sales minus expenses.',
      'Use this app\'s Expenses, Production and Reports tabs so the totals are done for you.',
    ] },
];
