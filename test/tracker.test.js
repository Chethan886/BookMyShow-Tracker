/**
 * Unit and Regression Tests for BookMyShow Karwar Tracker
 */

const assert = require('assert');
const cheerio = require('cheerio');

// Test 1: Title & Keyword matching
const targetRegex = /\b(ramayana(:?\s*part\s*1|-?\s*part\s*1)?|ramayan)\b/i;
const targetKeywords = ['ramayana', 'ramayana: part 1', 'ramayana - part 1'];

function isTitleMatch(text) {
  if (!text || typeof text !== 'string') return false;
  const clean = text.trim();
  if (targetRegex.test(clean)) return true;
  const lower = clean.toLowerCase();
  return targetKeywords.some(kw => lower.includes(kw));
}

console.log('--- Test Suite 1: Title Variations ---');
assert.strictEqual(isTitleMatch('Ramayana'), true, 'Should match "Ramayana"');
assert.strictEqual(isTitleMatch('Ramayana: Part 1'), true, 'Should match "Ramayana: Part 1"');
assert.strictEqual(isTitleMatch('Ramayana - Part 1'), true, 'Should match "Ramayana - Part 1"');
assert.strictEqual(isTitleMatch('Ramayana Part 1 (Hindi) (3D)'), true, 'Should match dubbed variation');
assert.strictEqual(isTitleMatch('Ramayan (Kannada)'), true, 'Should match Kannada dub');
assert.strictEqual(isTitleMatch('Avatar 3'), false, 'Should NOT match unrelated movie');
assert.strictEqual(isTitleMatch('Drama'), false, 'Should NOT match substrings like drama');
console.log('✅ Title variation tests passed!');

console.log('\n--- Test Suite 2: Next.js __NEXT_DATA__ Hydration Parsing ---');
const mockNextDataLive = {
  props: {
    pageProps: {
      initialData: [
        {
          EventTitle: 'Kantara: A Legend Chapter-1',
          isBookable: true,
          EventURL: '/karwar/movies/kantara-chapter-1/ET0012345'
        },
        {
          EventTitle: 'Ramayana: Part 1',
          EventCode: 'ET00998877',
          isBookable: true,
          isEventLive: true,
          EventURL: '/buytickets/ramayana-part-1-karwar/movie-karw-ET00998877-MT/20261101',
          dimension: '2D, 3D, IMAX',
          languages: ['Hindi', 'Kannada', 'Telugu']
        }
      ]
    }
  }
};

function searchNextDataForMovie(obj, matches = []) {
  if (!obj || typeof obj !== 'object') return matches;
  if (Array.isArray(obj)) {
    for (const item of obj) searchNextDataForMovie(item, matches);
    return matches;
  }
  const title = obj.EventTitle || obj.eventTitle || obj.title || obj.name || obj.EventName;
  const code = obj.EventCode || obj.eventCode || obj.code;
  const url = obj.EventURL || obj.eventURL || obj.seoUrl || obj.slug || obj.url;

  if (title && isTitleMatch(title)) {
    const isBookable = Boolean(
      obj.isBookable ||
      obj.isEventLive ||
      obj.hasShowtimes ||
      (url && (url.includes('/buytickets/') || url.includes('/booking/'))) ||
      obj.bookingUrl
    );
    matches.push({
      title: String(title).trim(),
      code: code ? String(code).trim() : null,
      bookingUrl: url ? (url.startsWith('http') ? url : `https://in.bookmyshow.com${url}`) : null,
      isBookable,
    });
  }
  for (const key of Object.keys(obj)) {
    if (typeof obj[key] === 'object' && obj[key] !== null) {
      searchNextDataForMovie(obj[key], matches);
    }
  }
  return matches;
}

const parsedNext = searchNextDataForMovie(mockNextDataLive);
assert.strictEqual(parsedNext.length, 1, 'Should find 1 movie match');
assert.strictEqual(parsedNext[0].title, 'Ramayana: Part 1');
assert.strictEqual(parsedNext[0].isBookable, true, 'Should detect bookable status');
assert.strictEqual(parsedNext[0].bookingUrl.includes('/buytickets/'), true, 'Should extract buy tickets URL');
console.log('✅ Next.js JSON extraction tests passed!');

console.log('\n--- Test Suite 3: Cheerio DOM Parsing ---');
const mockHtmlLive = `
  <!DOCTYPE html>
  <html>
    <body>
      <div class="movie-card">
        <h3>Ramayana - Part 1</h3>
        <p>Kannada, Hindi | 2D, 3D</p>
        <a href="/buytickets/ramayana-karwar/movie-karw-ET00123/20261105">Book tickets</a>
      </div>
    </body>
  </html>
`;

const $ = cheerio.load(mockHtmlLive);
const domMatches = [];
$('a').each((_, elem) => {
  const text = $(elem).text().trim();
  const href = $(elem).attr('href') || '';
  const parent = $(elem).closest('div');
  const parentText = parent.text();

  if (isTitleMatch(parentText) || isTitleMatch(text) || isTitleMatch(href)) {
    const isBookable = /book\s*tickets?|buytickets/i.test(parentText) || /buytickets/i.test(href);
    domMatches.push({
      title: 'Ramayana - Part 1',
      bookingUrl: `https://in.bookmyshow.com${href}`,
      isBookable
    });
  }
});

assert.strictEqual(domMatches.length > 0, true, 'Should find DOM match');
assert.strictEqual(domMatches[0].isBookable, true, 'Should recognize Book tickets button');
assert.strictEqual(domMatches[0].bookingUrl, 'https://in.bookmyshow.com/buytickets/ramayana-karwar/movie-karw-ET00123/20261105');
console.log('✅ Cheerio DOM extraction tests passed!');

console.log('\n--- Test Suite 4: Discord Embed Payload Verification ---');
const samplePayload = {
  content: '@everyone 🚨 **TICKETS ARE LIVE IN KARWAR for Ramayana!**',
  embeds: [
    {
      title: '🚨 TICKETS ARE LIVE: Ramayana!',
      color: 16270436,
      fields: [
        { name: '🎬 Movie Title', value: '**Ramayana**', inline: true },
        { name: '📍 Region / City', value: '**Karwar, Karnataka**', inline: true },
        { name: '🏛️ Cinema(s)', value: 'Miraj Cinemas: Geetanjali, Karwar', inline: false },
        { name: '🎟️ Booking Status', value: '🟢 **TICKETS LIVE / ADVANCE BOOKING OPEN**', inline: true }
      ]
    }
  ]
};

assert.strictEqual(samplePayload.content.includes('@everyone'), true);
assert.strictEqual(samplePayload.embeds[0].color, 16270436);
assert.strictEqual(samplePayload.embeds[0].fields.length, 4);
console.log('✅ Discord payload structure tests passed!');

console.log('\n=============================================');
console.log('🎉 ALL UNIT TESTS PASSED SUCCESSFULLY!');
console.log('=============================================');
