// Lists and limits the server and the app must agree on. The tests import them from here and compare them with the app's
// own copies (tests/build-sync.test.ts, tests/health-ai.test.ts), so a change on one side only is caught.

/** What a health photo shows. Same as PHOTO_SUBJECTS in src/services/ai.ts. */
export const PHOTO_SUBJECTS = ['plant', 'animal', 'fish', 'farm', 'other', 'unclear'];
/** The subjects that can get a diagnosis. */
export const FARM_SUBJECTS = ['plant', 'animal', 'fish', 'farm'];

/** Reusable items the build survey may name. Same ids as src/data/recyclables.ts. */
export const RECYCLABLE_IDS = ['pallets', 'pet_bottles', 'buckets', 'styro_boxes', 'rice_sacks', 'bamboo', 'old_nets', 'drums', 'garden_waste', 'blocks_stones', 'egg_trays'];
/** Items already on site the build survey may name. Each is a material in src/data/materials.ts. */
export const ONSITE_IDS = ['shade_net', 'drum_200l', 'gravel', 'bamboo_pole', 'trellis_net', 'garden_hose'];

/** The longest picture request. Same as MAX_PROMPT in src/services/build/prompt.ts. */
export const MAX_PROMPT = 2400;
