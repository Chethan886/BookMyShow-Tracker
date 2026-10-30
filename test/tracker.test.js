/**
 * Unit and Regression Tests for BookMyShow Multi-Region & Multi-Movie Tracker
 */

const assert = require('assert');
const cheerio = require('cheerio');
const {
  getMovieMatcher,
  getRegionUrls,
  isTitleMatch,
  loadState,
  addMovieToState,
  removeMovieFromState,
  updateSettingsInState,
  POPULAR_PLACES,
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

console.log('✅ Title and custom movie variation tests passed!');

console.log('\n--- Test Suite 2: Multi-Region URL & Place Mapping ---');
const karwarUrls = getRegionUrls('karwar');
assert.strictEqual(karwarUrls.regionHome, 'https://in.bookmyshow.com/explore/movies-karwar');

const blrUrls = getRegionUrls('bengaluru');
assert.strictEqual(blrUrls.regionHome, 'https://in.bookmyshow.com/explore/movies-bengaluru');

const goaUrls = getRegionUrls('goa');
assert.strictEqual(goaUrls.regionHome, 'https://in.bookmyshow.com/explore/movies-goa');

assert(POPULAR_PLACES.some(p => p.slug === 'karwar'), 'Should include Karwar');
assert(POPULAR_PLACES.some(p => p.slug === 'bengaluru'), 'Should include Bengaluru');
assert(POPULAR_PLACES.some(p => p.slug === 'mangaluru'), 'Should include Mangaluru');

console.log('✅ Region URLs and popular places mapping tests passed!');

console.log('\n--- Test Suite 3: State & Settings Management ---');
const state = loadState();
assert(Array.isArray(state.movies), 'State should have movies array');
assert(state.settings, 'State should have settings');

// Test update settings (place & interval)
const updated = updateSettingsInState({
  region: 'bengaluru',
  checkIntervalMinutes: 10,
});
assert.strictEqual(updated.settings.region, 'bengaluru');
assert.strictEqual(updated.settings.checkIntervalMinutes, 10);

// Reset back to karwar
updateSettingsInState({
  region: 'karwar',
  regionName: 'Karwar, Karnataka',
  checkIntervalMinutes: 15,
});

// Test separate trackers for same movie in different regions
const tracker1 = addMovieToState({ title: 'Ramayana', region: 'karwar' });
const tracker2 = addMovieToState({ title: 'Ramayana', region: 'bengaluru' });
assert.notStrictEqual(tracker1.movie.id, tracker2.movie.id, 'IDs should be distinct for different regions');
assert(tracker2.state.movies.some(m => m.region === 'karwar' && m.title.toLowerCase() === 'ramayana'), 'Should contain Ramayana Karwar');
assert(tracker2.state.movies.some(m => m.region === 'bengaluru' && m.title.toLowerCase() === 'ramayana'), 'Should contain Ramayana Bengaluru');

// Clean up test trackers
removeMovieFromState(tracker1.movie.id);
removeMovieFromState(tracker2.movie.id);

console.log('✅ Settings update, multi-region movie tracking, and interval tests passed!');

console.log('\n=============================================');
console.log('🎉 ALL MULTI-REGION & INTERVAL TESTS PASSED!');
console.log('=============================================');
