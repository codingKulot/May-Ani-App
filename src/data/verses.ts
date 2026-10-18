// Bible verses about farming, fishing, animals, rain and harvest for the Dashboard "Verse of the day".
// Text is the King James Version (KJV), which is public domain, so it can be shown without a licence.

export interface Verse {
  ref: string;
  text: string;
  topic: 'Farming' | 'Fishing' | 'Livestock' | 'Harvest' | 'Rain';
}

export const VERSES: Verse[] = [
  { ref: 'Genesis 8:22', topic: 'Harvest', text: 'While the earth remaineth, seedtime and harvest, and cold and heat, and summer and winter, and day and night shall not cease.' },
  { ref: 'Galatians 6:9', topic: 'Harvest', text: 'And let us not be weary in well doing: for in due season we shall reap, if we faint not.' },
  { ref: 'Galatians 6:7', topic: 'Farming', text: 'Be not deceived; God is not mocked: for whatsoever a man soweth, that shall he also reap.' },
  { ref: '2 Corinthians 9:6', topic: 'Farming', text: 'But this I say, He which soweth sparingly shall reap also sparingly; and he which soweth bountifully shall reap also bountifully.' },
  { ref: 'Ecclesiastes 11:6', topic: 'Farming', text: 'In the morning sow thy seed, and in the evening withhold not thine hand: for thou knowest not whether shall prosper, either this or that, or whether they both shall be alike good.' },
  { ref: 'Ecclesiastes 3:1-2', topic: 'Farming', text: 'To every thing there is a season, and a time to every purpose under the heaven: a time to be born, and a time to die; a time to plant, and a time to pluck up that which is planted.' },
  { ref: 'Proverbs 27:23', topic: 'Livestock', text: 'Be thou diligent to know the state of thy flocks, and look well to thy herds.' },
  { ref: 'Proverbs 12:11', topic: 'Farming', text: 'He that tilleth his land shall be satisfied with bread: but he that followeth vain persons is void of understanding.' },
  { ref: 'Proverbs 3:9-10', topic: 'Harvest', text: 'Honour the LORD with thy substance, and with the firstfruits of all thine increase: so shall thy barns be filled with plenty, and thy presses shall burst out with new wine.' },
  { ref: 'Proverbs 20:4', topic: 'Farming', text: 'The sluggard will not plow by reason of the cold; therefore shall he beg in harvest, and have nothing.' },
  { ref: 'Proverbs 10:5', topic: 'Harvest', text: 'He that gathereth in summer is a wise son: but he that sleepeth in harvest is a son that causeth shame.' },
  { ref: 'Proverbs 6:6-8', topic: 'Harvest', text: 'Go to the ant, thou sluggard; consider her ways, and be wise: which having no guide, overseer, or ruler, provideth her meat in the summer, and gathereth her food in the harvest.' },
  { ref: 'Psalm 65:9', topic: 'Rain', text: 'Thou visitest the earth, and waterest it: thou greatly enrichest it with the river of God, which is full of water: thou preparest them corn, when thou hast so provided for it.' },
  { ref: 'Psalm 104:14', topic: 'Livestock', text: 'He causeth the grass to grow for the cattle, and herb for the service of man: that he may bring forth food out of the earth.' },
  { ref: 'Psalm 126:5', topic: 'Harvest', text: 'They that sow in tears shall reap in joy.' },
  { ref: 'Psalm 23:1-2', topic: 'Livestock', text: 'The LORD is my shepherd; I shall not want. He maketh me to lie down in green pastures: he leadeth me beside the still waters.' },
  { ref: 'Psalm 1:3', topic: 'Farming', text: 'And he shall be like a tree planted by the rivers of water, that bringeth forth his fruit in his season; his leaf also shall not wither; and whatsoever he doeth shall prosper.' },
  { ref: 'Psalm 67:6', topic: 'Harvest', text: 'Then shall the earth yield her increase; and God, even our own God, shall bless us.' },
  { ref: 'Psalm 8:6-8', topic: 'Fishing', text: 'Thou madest him to have dominion over the works of thy hands; thou hast put all things under his feet: all sheep and oxen, yea, and the beasts of the field; the fowl of the air, and the fish of the sea, and whatsoever passeth through the paths of the seas.' },
  { ref: 'Mark 4:26-27', topic: 'Farming', text: 'So is the kingdom of God, as if a man should cast seed into the ground; and should sleep, and rise night and day, and the seed should spring and grow up, he knoweth not how.' },
  { ref: 'Mark 4:28', topic: 'Farming', text: 'For the earth bringeth forth fruit of herself; first the blade, then the ear, after that the full corn in the ear.' },
  { ref: 'Matthew 4:19', topic: 'Fishing', text: 'And he saith unto them, Follow me, and I will make you fishers of men.' },
  { ref: 'Luke 5:4', topic: 'Fishing', text: 'Now when he had left speaking, he said unto Simon, Launch out into the deep, and let down your nets for a draught.' },
  { ref: 'John 21:6', topic: 'Fishing', text: 'And he said unto them, Cast the net on the right side of the ship, and ye shall find. They cast therefore, and now they were not able to draw it for the multitude of fishes.' },
  { ref: 'Matthew 14:19', topic: 'Fishing', text: 'And he commanded the multitude to sit down on the grass, and took the five loaves, and the two fishes, and looking up to heaven, he blessed, and brake, and gave the loaves to his disciples, and the disciples to the multitude.' },
  { ref: 'Ezekiel 47:10', topic: 'Fishing', text: 'And it shall come to pass, that the fishers shall stand upon it from Engedi even unto Eneglaim; they shall be a place to spread forth nets; their fish shall be according to their kinds, as the fish of the great sea, exceeding many.' },
  { ref: 'Job 12:7-8', topic: 'Fishing', text: 'But ask now the beasts, and they shall teach thee; and the fowls of the air, and they shall tell thee: or speak to the earth, and it shall teach thee: and the fishes of the sea shall declare unto thee.' },
  { ref: 'Matthew 6:26', topic: 'Harvest', text: 'Behold the fowls of the air: for they sow not, neither do they reap, nor gather into barns; yet your heavenly Father feedeth them. Are ye not much better than they?' },
  { ref: 'Luke 12:24', topic: 'Harvest', text: 'Consider the ravens: for they neither sow nor reap; which neither have storehouse nor barn; and God feedeth them: how much more are ye better than the fowls?' },
  { ref: 'Matthew 9:37-38', topic: 'Harvest', text: 'The harvest truly is plenteous, but the labourers are few; pray ye therefore the Lord of the harvest, that he will send forth labourers into his harvest.' },
  { ref: 'James 5:7', topic: 'Rain', text: 'Be patient therefore, brethren, unto the coming of the Lord. Behold, the husbandman waiteth for the precious fruit of the earth, and hath long patience for it, until he receive the early and latter rain.' },
  { ref: '1 Corinthians 3:6', topic: 'Farming', text: 'I have planted, Apollos watered; but God gave the increase.' },
  { ref: 'John 15:5', topic: 'Farming', text: 'I am the vine, ye are the branches: He that abideth in me, and I in him, the same bringeth forth much fruit: for without me ye can do nothing.' },
  { ref: 'Isaiah 55:10', topic: 'Rain', text: 'For as the rain cometh down, and the snow from heaven, and returneth not thither, but watereth the earth, and maketh it bring forth and bud, that it may give seed to the sower, and bread to the eater.' },
  { ref: 'Genesis 2:15', topic: 'Farming', text: 'And the LORD God took the man, and put him into the garden of Eden to dress it and to keep it.' },
  { ref: 'Genesis 1:11', topic: 'Farming', text: 'And God said, Let the earth bring forth grass, the herb yielding seed, and the fruit tree yielding fruit after his kind, whose seed is in itself, upon the earth: and it was so.' },
  { ref: 'Leviticus 26:4', topic: 'Rain', text: 'Then I will give you rain in due season, and the land shall yield her increase, and the trees of the field shall yield their fruit.' },
  { ref: 'Deuteronomy 28:12', topic: 'Rain', text: 'The LORD shall open unto thee his good treasure, the heaven to give the rain unto thy land in his season, and to bless all the work of thine hand.' },
  { ref: 'John 10:11', topic: 'Livestock', text: 'I am the good shepherd: the good shepherd giveth his life for the sheep.' },
  { ref: 'Habakkuk 3:17-18', topic: 'Livestock', text: 'Although the fig tree shall not blossom, neither shall fruit be in the vines; the labour of the olive shall fail, and the fields shall yield no meat; the flock shall be cut off from the fold, and there shall be no herd in the stalls: yet I will rejoice in the LORD, I will joy in the God of my salvation.' },
];

// 17 shares no factor with 40, so stepping by it visits every verse once before any repeats,
// and neighbouring days land far apart in the list (different topics most days).
const STRIDE = 17;

/** The verse for a local date (YYYY-MM-DD). Same all day for everyone, changes at midnight. `skip` steps to later verses. */
export function verseForDate(iso: string, skip = 0): Verse {
  const [y, m, d] = iso.split('-').map(Number);
  const day = Math.floor(Date.UTC(y, m - 1, d) / 86_400_000);
  const n = VERSES.length;
  return VERSES[((((day + skip) * STRIDE) % n) + n) % n];
}
