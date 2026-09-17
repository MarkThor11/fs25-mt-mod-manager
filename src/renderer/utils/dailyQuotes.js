/**
 * Curated list of inspiring, positive, and farming-related quotes.
 * A deterministic daily rotation algorithm ensures a fresh quote every calendar day.
 */

export const FARMING_QUOTES = [
  {
    quote: "Don't judge each day by the harvest you reap, but by the seeds you plant.",
    author: "Robert Louis Stevenson"
  },
  {
    quote: "Farming is a profession of hope.",
    author: "Brian Brett"
  },
  {
    quote: "To plant a seed is to believe in tomorrow.",
    author: "Audrey Hepburn"
  },
  {
    quote: "Agriculture is the most healthful, most useful and most noble employment of man.",
    author: "George Washington"
  },
  {
    quote: "The master's eye is the best fertilizer.",
    author: "Traditional Proverb"
  },
  {
    quote: "The farmer has to be an optimist, or he wouldn’t still be a farmer.",
    author: "Will Rogers"
  },
  {
    quote: "Plant seeds of kindness, harvest showers of blessings.",
    author: "Country Wisdom"
  },
  {
    quote: "Life on a farm is a school of patience; you can't hurry the crops.",
    author: "Henri Alain"
  },
  {
    quote: "He that sows good seed shall reap good corn.",
    author: "English Proverb"
  },
  {
    quote: "The soil is the great connector of lives, the source and destination of all.",
    author: "Wendell Berry"
  },
  {
    quote: "No race can prosper till it learns there is as much dignity in tilling a field as in writing a poem.",
    author: "Booker T. Washington"
  },
  {
    quote: "A fruitful harvest begins with honest labor and a grateful heart.",
    author: "Folk Saying"
  },
  {
    quote: "Behind every fruitful season stands patience, grit, and hope.",
    author: "Farming Proverb"
  },
  {
    quote: "There are no mistakes in farming, only experiments that teach.",
    author: "Farmer's Lore"
  },
  {
    quote: "Keep your face always toward the sunshine, and shadows will fall behind you.",
    author: "Walt Whitman"
  },
  {
    quote: "When the tiller of the soil meets the sunrise, prosperity follows.",
    author: "Rural Saying"
  },
  {
    quote: "A field that has rested gives a bountiful crop.",
    author: "Ovid"
  },
  {
    quote: "The tractor may turn the soil, but faith and sunshine bring the harvest.",
    author: "Farm Saying"
  },
  {
    quote: "Hard work puts you where good luck can find you.",
    author: "Country Proverb"
  },
  {
    quote: "Look deep into nature, and then you will understand everything better.",
    author: "Albert Einstein"
  },
  {
    quote: "Every seed has a story; every harvest has a reward.",
    author: "Agricultural Proverb"
  },
  {
    quote: "Start each day with a grateful heart and an open field.",
    author: "Farm Saying"
  },
  {
    quote: "In the rhythm of the seasons lies the peace of the earth.",
    author: "Country Proverb"
  },
  {
    quote: "A good farmer is nothing more nor less than a handy man with a sense of humor.",
    author: "E.B. White"
  },
  {
    quote: "Patience and perseverance have a magical effect before which difficulties disappear.",
    author: "John Quincy Adams"
  },
  {
    quote: "Even the tallest oak was once a little nut that held its ground.",
    author: "Author Unknown"
  },
  {
    quote: "Great things are done by a series of small things brought together.",
    author: "Vincent van Gogh"
  },
  {
    quote: "Cultivate your garden; sow joy and reap contentment.",
    author: "Voltaire"
  },
  {
    quote: "Sunshine is delicious, rain is refreshing, and wind braces us up.",
    author: "John Ruskin"
  },
  {
    quote: "The earth laughs in flowers and bountiful grain.",
    author: "Ralph Waldo Emerson"
  },
  {
    quote: "Work hard in silence, let your harvest be your noise.",
    author: "Modern Wisdom"
  },
  {
    quote: "Nature does not hurry, yet everything is accomplished.",
    author: "Lao Tzu"
  },
  {
    quote: "The day you plant the seed is not the day you eat the fruit. Be patient.",
    author: "Folk Proverb"
  },
  {
    quote: "Strong roots produce sweet fruit.",
    author: "Traditional Proverb"
  },
  {
    quote: "Respect the land, cherish the seasons, and enjoy the fruits of your labor.",
    author: "Homestead Lore"
  },
  {
    quote: "The greatest fine art of the future will be the making of a comfortable living from a small piece of land.",
    author: "Abraham Lincoln"
  },
  {
    quote: "Early morning in the fields is where peace begins.",
    author: "Rural Saying"
  },
  {
    quote: "Every day provides its own gifts. Reap what is good.",
    author: "Marcus Aurelius"
  },
  {
    quote: "Those who labor in the earth are the chosen people of hope.",
    author: "Thomas Jefferson"
  },
  {
    quote: "A well-tended field never fails to return its gratitude.",
    author: "Farming Saying"
  }
];

/**
 * Returns the daily quote based on the current date (rotates at midnight).
 * @param {Date} [date] Optional date object
 * @returns {{ quote: string, author: string, index: number }}
 */
export function getQuoteOfTheDay(date = new Date()) {
  try {
    const validDate = (date instanceof Date && !isNaN(date.getTime())) ? date : new Date();
    const year = validDate.getFullYear();
    const startOfYear = new Date(year, 0, 0);
    const diff = validDate - startOfYear;
    const oneDay = 1000 * 60 * 60 * 24;
    const dayOfYear = Math.floor(diff / oneDay);
    
    // Deterministic daily index
    const index = Math.abs((year * 365 + dayOfYear) % (FARMING_QUOTES.length || 1));
    const item = FARMING_QUOTES[index] || FARMING_QUOTES[0];
    return {
      quote: item.quote,
      author: item.author,
      index
    };
  } catch (_) {
    return {
      quote: FARMING_QUOTES[0].quote,
      author: FARMING_QUOTES[0].author,
      index: 0
    };
  }
}

/**
 * Returns a quote by index (wraps around). Safe against NaN, null, and non-numbers.
 * @param {number|string} index 
 * @returns {{ quote: string, author: string, index: number }}
 */
export function getQuoteByIndex(index) {
  if (index === null || index === undefined || isNaN(Number(index))) {
    return getQuoteOfTheDay();
  }
  const num = Math.floor(Number(index));
  const len = FARMING_QUOTES.length || 1;
  const safeIndex = ((num % len) + len) % len;
  const item = FARMING_QUOTES[safeIndex] || FARMING_QUOTES[0];
  return {
    quote: item.quote,
    author: item.author,
    index: safeIndex
  };
}
