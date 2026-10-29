/**
 * Unit and Regression Tests for BookMyShow Karwar Multi-Movie Tracker
 */

const assert = require('assert');
const cheerio = require('cheerio');
const {
  getMovieMatcher,
  isTitleMatch,
  loadState,
  addMovieToState,
  removeMovieFromState,
} = require('../tracker');

console.log('--- Test Suite 1: Title & Keyword Variations ---');

// Test Ramayana
const ramayanaMatcher = getMovieMatcher({ title: 'Ramayana', keywords: ['Ramayana', 'Ramayana: Part 1', 'Ramayana - Part 1', 'Ramayan'] });
assert.strictEqual(isTitleMatch('Ramayana', ramayanaMatcher), true, 'Should match "Ramayana"');
assert.strictEqual(isTitleMatch('Ramayana: Part 1', ramayanaMatcher), true, 'Should match "Ramayana: Part 1"');
assert.strictEqual(isTitleMatch('Ramayana - Part 1 (Kannada)', ramayanaMatcher), true, 'Should match "Ramayana - Part 1 (Kannada)"');
assert.strictEqual(isTitleMatch('Ramayan (Hindi) 3D', ramayanaMatcher), true, 'Should match "Ramayan"');
assert.strictEqual(isTitleMatch('Avatar 3', ramayanaMatcher), false, 'Should NOT match unrelated movie');

// Test Kantara
const kantaraMatcher = getMovieMatcher({ title: 'Kantara: A Legend Chapter-1', keywords: ['Kantara', 'Kantara Chapter 1', 'Kantara 2'] });
assert.strictEqual(isTitleMatch('Kantara: A Legend Chapter-1', kantaraMatcher), true, 'Should match Kantara');
assert.strictEqual(isTitleMatch('Kantara (Kannada)', kantaraMatcher), true, 'Should match Kantara Kannada');
assert.strictEqual(isTitleMatch('Ramayana', kantaraMatcher), false, 'Should NOT match Ramayana for Kantara');

// Test Toxic
const toxicMatcher = getMovieMatcher({ title: 'Toxic: A Fairy Tale for Grown-ups', keywords: ['Toxic', 'Yash Toxic'] });
assert.strictEqual(isTitleMatch('Toxic', toxicMatcher), true, 'Should match Toxic');
assert.strictEqual(isTitleMatch('Toxic: A Fairy Tale for Grown-ups', toxicMatcher), true);
assert.strictEqual(isTitleMatch('War 2', toxicMatcher), false);

console.log('✅ Title and custom movie variation tests passed!');

console.log('\n--- Test Suite 2: Next.js __NEXT_DATA__ Hydration Multi-Movie Parsing ---');
const mockNextData = {
  props: {
    pageProps: {
      initialData: [
        {
          EventTitle: 'Kantara: A Legend Chapter-1',
          EventCode: 'ET00554433',
          isBookable: true,
          isEventLive: true,
          EventURL: '/buytickets/kantara-chapter-1-karwar/movie-karw-ET00554433-MT/20261030',
          dimension: '2D, IMAX',
          languages: ['Kannada', 'Hindi', 'Telugu']
        },
        {
          EventTitle: 'Ramayana: Part 1',
          EventCode: 'ET00998877',
          isBookable: false,
          EventURL: '/karwar/movies/ramayana-part-1/ET00998877'
        }
      ]
    }
  }
};

function searchMockData(obj, matcher, matches = []) {
  if (!obj || typeof obj !== 'object') return matches;
  if (Array.isArray(obj)) {
    for (const item of obj) searchMockData(item, matcher, matches);
    return matches;
  }
  const title = obj.EventTitle || obj.title;
  if (title && isTitleMatch(title, matcher)) {
    matches.push({
      title,
      isBookable: Boolean(obj.isBookable),
      bookingUrl: obj.EventURL,
    });
  }
  for (const k of Object.keys(obj)) {
    if (typeof obj[k] === 'object' && obj[k] !== null) {
      searchMockData(obj[k], matcher, matches);
    }
  }
  return matches;
}

const kantaraFound = searchMockData(mockNextData, kantaraMatcher);
assert.strictEqual(kantaraFound.length, 1);
assert.strictEqual(kantaraFound[0].title, 'Kantara: A Legend Chapter-1');
assert.strictEqual(kantaraFound[0].isBookable, true);

const ramayanaFound = searchMockData(mockNextData, ramayanaMatcher);
assert.strictEqual(ramayanaFound.length, 1);
assert.strictEqual(ramayanaFound[0].title, 'Ramayana: Part 1');
assert.strictEqual(ramayanaFound[0].isBookable, false);

console.log('✅ Next.js multi-movie JSON extraction tests passed!');

console.log('\n--- Test Suite 3: State Migration & Multi-Movie Management ---');
const state = loadState();
assert(Array.isArray(state.movies), 'State should have movies array');
assert(state.movies.length >= 1, 'Should have at least 1 movie in state');

// Test add movie
const added = addMovieToState({
  title: 'Test Movie Alpha',
  keywords: 'Alpha, Test Alpha',
});
assert.strictEqual(added.movie.title, 'Test Movie Alpha');
assert(added.state.movies.some(m => m.id === 'test-movie-alpha'), 'Should contain newly added movie');

// Test remove movie
const removed = removeMovieFromState('test-movie-alpha');
assert.strictEqual(removed.removed, true, 'Should successfully remove movie');
assert(!removed.state.movies.some(m => m.id === 'test-movie-alpha'), 'Should not contain removed movie');

console.log('✅ State migration & multi-movie management tests passed!');

console.log('\n=============================================');
console.log('🎉 ALL MULTI-MOVIE TESTS PASSED SUCCESSFULLY!');
console.log('=============================================');
