/**
 * Things a household or farm often already has, and exactly which bought material each one can replace.
 * `covers[].coverage` is the share of that material's need the recycled item can realistically supply
 * (0 to 1). It is deliberately conservative: reused items vary in size and condition.
 */

export interface Technique {
  title: string;
  /** every step carries its own measurement where one matters */
  steps: string[];
}

export interface Recyclable {
  id: string;
  label: string;
  emoji: string;
  examples: string;
  covers: { materialId: string; coverage: number; how: string }[];
  techniques: Technique[];
  caution?: string;
}

export const RECYCLABLES: Recyclable[] = [
  {
    id: 'pallets', label: 'Wood pallets, crates and scrap boards', emoji: '🪵',
    examples: 'Pallets, fruit crates, old cabinet or door boards',
    covers: [{ materialId: 'lumber_coco', coverage: 0.8, how: 'Use pallet slats and stringers for the bed frames.' }, { materialId: 'lumber_good', coverage: 0.8, how: 'Use pallet slats and stringers for the bed frames.' }],
    techniques: [{
      title: 'Turn a pallet into bed-frame boards',
      steps: [
        'Check the stamp. Use pallets marked HT (heat-treated). Skip any marked MB (methyl bromide) for food crops.',
        'Pull the nails with a pry bar and hammer, working from the slat ends. Do not saw through nails.',
        'Sort the boards. Keep slats at least 90 mm wide and 15 mm thick. A standard 1.0 x 1.2 m pallet gives about 5 to 7 slats of 1.0 to 1.2 m.',
        'Cut slats to the lengths in your cut list. Join short slats end to end with a 300 mm cleat nailed behind the joint.',
        'Sand the inside faces smooth and drive the nail points flush so they do not stick out toward the soil.',
      ],
    }],
    caution: 'Never use wood treated with creosote or used oil, or pallets that carried chemicals.',
  },
  {
    id: 'pet_bottles', label: 'Plastic bottles (PET)', emoji: '🧴',
    examples: '1.5 L and 2 L soft-drink or water bottles',
    covers: [{ materialId: 'grow_bag', coverage: 0.25, how: 'Hanging bottle planters for herbs and lettuce replace a few grow bags.' }, { materialId: 'drip_kit', coverage: 0.5, how: 'Bottle drip emitters water the beds slowly.' }],
    techniques: [
      { title: 'Hanging bottle planter', steps: ['Lay a clean 1.5 L bottle on its side.', 'Cut a window 20 cm long by 8 cm wide in the upper side with a hot knife or sharp cutter.', 'Drill or poke 5 drainage holes of 5 mm in the underside, 2 cm apart.', 'Make 2 holes of 5 mm at the neck and base and tie with 1 m of twine to the trellis or rack.', 'Fill with the soil mix to 2 cm below the window and plant 3 lettuce or herb seedlings.'] },
      { title: 'Bottle drip emitter', steps: ['Poke 3 holes of 1.5 mm in the cap with a hot needle.', 'Fill the bottle with water, screw the cap on and push the bottle neck-down into the soil beside the plant, 15 cm deep.', 'Refill every 2 to 3 days. One 1.5 L bottle waters one fruiting plant.'] },
    ],
  },
  {
    id: 'buckets', label: 'Buckets, basins and cooking-oil cans', emoji: '🪣',
    examples: 'Paint pails (washed well), 5-gallon pails, basins, big tins',
    covers: [{ materialId: 'grow_bag', coverage: 1, how: 'Use as grow containers in place of bought grow bags.' }],
    techniques: [{
      title: 'Bucket garden',
      steps: [
        'Wash with soap and rinse three times. Do not use pails that held paint thinner, pesticide or fuel.',
        'Drill 6 drainage holes of 10 mm in the base, evenly spaced, plus 2 holes of 10 mm 3 cm up the side to set a water reservoir.',
        'Raise each pail 3 cm off the floor on two small blocks or bottle caps so water can drain.',
        'Fill to 3 cm below the rim. A 5-gallon (19 L) pail grows 1 tomato, eggplant or chili, or 5 to 6 pechay.',
        'Space pails 40 cm centre to centre.',
      ],
    }],
    caution: 'Food-grade containers are best. Never use containers that held chemicals.',
  },
  {
    id: 'styro_boxes', label: 'Styrofoam fish or vegetable boxes', emoji: '📦',
    examples: 'Fish boxes, fruit boxes',
    covers: [{ materialId: 'grow_bag', coverage: 1, how: 'A box grows what about 3 grow bags would.' }],
    techniques: [{
      title: 'Styrofoam box planter',
      steps: [
        'Pick a box at least 30 cm deep. A typical 60 x 40 x 30 cm box holds about 60 L.',
        'Wash out fish smell. Poke 8 drainage holes of 10 mm in the base.',
        'Add 5 cm of coarse filler (small stones or broken pottery), then fill with the soil mix to 3 cm below the rim.',
        'Put it on bricks or blocks 5 cm high so the holes can drain. It is light, so it suits roofs and balconies.',
        'Plant 8 to 10 pechay or kangkong, or 2 tomato or eggplant seedlings per box.',
      ],
    }],
  },
  {
    id: 'rice_sacks', label: 'Rice, feed or fertilizer sacks (PP)', emoji: '👜',
    examples: 'Woven polypropylene sacks',
    covers: [{ materialId: 'grow_bag', coverage: 1, how: 'Roll down and use as free grow bags.' }, { materialId: 'poly_sheet', coverage: 0.5, how: 'Open sacks flat as a weed and soil liner.' }],
    techniques: [{
      title: 'Sack grow bag',
      steps: ['Use a clean sack of about 50 kg size (60 x 90 cm).', 'Turn the open end down 20 cm so the sack stands about 35 cm tall.', 'Poke 6 drainage holes of 8 mm at the base with a screwdriver.', 'Fill with the soil mix to 5 cm below the fold.', 'Place 40 cm apart. Each sack grows 1 fruiting plant or 6 leafy plants.'],
    }],
    caution: 'Do not reuse sacks that held fertilizer or chemicals.',
  },
  {
    id: 'bamboo', label: 'Bamboo, branches and old poles', emoji: '🎋',
    examples: 'Bamboo poles, tree prunings, old curtain rods',
    covers: [{ materialId: 'bamboo_pole', coverage: 1, how: 'Use as trellis posts and crossbars.' }, { materialId: 'bamboo_stake', coverage: 1, how: 'Use thin pieces as plant stakes.' }],
    techniques: [{
      title: 'Bamboo trellis',
      steps: ['Cut posts 2.4 m long. Sharpen one end and bury it 40 cm, leaving 2.0 m above ground.', 'Space posts 1.2 m apart.', 'Tie a horizontal pole at 1.8 m across the tops with tie wire or twine, using a figure-eight lash.', 'Hang the netting or run twine every 20 cm from the top pole to the ground.', 'Add a diagonal brace 1.2 m long at each end post.'],
    }],
  },
  {
    id: 'old_nets', label: 'Old nets and mosquito screens', emoji: '🕸️',
    examples: 'Fishing nets, mosquito nets, window screen',
    covers: [{ materialId: 'trellis_net', coverage: 1, how: 'Hang as climbing support for beans and gourds.' }, { materialId: 'shade_net', coverage: 0.4, how: 'Use mosquito net as a light insect cover over seedlings.' }],
    techniques: [{ title: 'Net trellis and insect cover', steps: ['Hang the net from the top pole so it reaches 10 cm above the soil.', 'Pull it tight and fix every 40 cm with twine or tie wire.', 'For an insect cover, bend 3 bamboo or PVC hoops of 1.0 m span over the bed and drape the net, weighing the edges with stones.'] }],
  },
  {
    id: 'drums', label: 'Plastic drums and big water containers', emoji: '🛢️',
    examples: 'Blue plastic drums, 20 L water containers',
    covers: [{ materialId: 'drum_200l', coverage: 1, how: 'Use as the rain or tap water barrel.' }],
    techniques: [{ title: 'Water barrel with tap', steps: ['Rinse out any residue. Only use drums that carried food-grade material.', 'Drill a 20 mm hole 10 cm from the base and fit a 1/2" tap with a rubber washer.', 'Raise the drum 50 cm on blocks so a bucket fits under the tap.', 'Cover the top with fine net so mosquitoes cannot breed.'] }],
    caution: 'Cover water barrels. Open water breeds mosquitoes.',
  },
  {
    id: 'garden_waste', label: 'Dry leaves, rice hull, coco husk and kitchen scraps', emoji: '🍂',
    examples: 'Fallen leaves, rice hull, coco husks, vegetable peelings, shredded paper',
    covers: [{ materialId: 'compost', coverage: 0.5, how: 'Make your own compost; it takes 6 to 8 weeks.' }, { materialId: 'cocopeat', coverage: 0.7, how: 'Rice hull and shredded coco husk work as the loosening part of the mix.' }, { materialId: 'gravel', coverage: 0.6, how: 'Branches, dry leaves and coco husk chips make the bottom filler layer.' }],
    techniques: [
      { title: 'Compost heap', steps: ['Pick a corner of 1.0 x 1.0 m, shaded, with a bit of slope away from the beds.', 'Layer 10 cm of dry leaves (brown) then 5 cm of kitchen scraps (green), repeating up to 1.0 m high.', 'Keep it as damp as a squeezed sponge and turn every 7 days.', 'It is ready in 6 to 8 weeks when it is dark, crumbly and smells earthy.'] },
      { title: 'Free bed filler', steps: ['Fill the bottom 10 cm of each raised bed with coarse material: branches, dry leaves, coco husk chips.', 'Cover with the top 15 cm of soil mix. The bottom layer rots slowly and feeds the plants.'] },
    ],
  },
  {
    id: 'blocks_stones', label: 'Hollow blocks, bricks, stones and broken tiles', emoji: '🧱',
    examples: 'Old hollow blocks, bricks, river stones, broken tiles',
    covers: [{ materialId: 'gravel', coverage: 1, how: 'Use as the drainage layer and path edging.' }],
    techniques: [{ title: 'Drainage layer and edging', steps: ['Break tiles into pieces of about 5 cm.', 'Spread a 5 cm layer over the base of beds or containers so water drains.', 'Use whole blocks to edge paths: lay them flat, 40 cm each, side by side.'] }],
  },
  {
    id: 'egg_trays', label: 'Egg trays and cartons', emoji: '🥚',
    examples: 'Paper egg trays',
    covers: [],
    techniques: [{ title: 'Egg-tray seedling starter', steps: ['Fill each cell with fine soil mix to 1 cm below the rim.', 'Sow 2 seeds per cell at a depth of 2x the seed size.', 'Keep damp. Transplant the whole cell into the bed when seedlings have 3 to 4 true leaves (about 2 to 3 weeks).'] }],
  },
];

const byId = new Map(RECYCLABLES.map((r) => [r.id, r]));
export const recyclableById = (id: string): Recyclable | undefined => byId.get(id);
export const RECYCLABLE_IDS: string[] = RECYCLABLES.map((r) => r.id);
