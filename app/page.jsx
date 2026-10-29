'use client';

import React, { useState, useEffect } from 'react';
import {
  Film,
  MapPin,
  Clock,
  Play,
  Send,
  ExternalLink,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  Radio,
  Sparkles,
  Plus,
  Trash2,
  X,
  Check,
  Timer,
  ChevronDown,
  Compass,
} from 'lucide-react';

// Preset popular places on BookMyShow
const POPULAR_PLACES = [
  { slug: 'karwar', name: 'Karwar, Karnataka', cinema: 'Miraj Cinemas: Geetanjali, Karwar' },
  { slug: 'bengaluru', name: 'Bengaluru / Bangalore', cinema: 'PVR, INOX, Cinepolis' },
  { slug: 'mangaluru', name: 'Mangaluru / Mangalore', cinema: 'PVR, Bharat Cinemas, Cinepolis' },
  { slug: 'hubli', name: 'Hubballi / Hubli', cinema: 'Cinepolis, PVR Urban Oasis' },
  { slug: 'belgaum', name: 'Belagavi / Belgaum', cinema: 'Inox, Carnival Cinemas' },
  { slug: 'mysuru', name: 'Mysuru / Mysore', cinema: 'DRC Cinemas, INOX' },
  { slug: 'manipal', name: 'Manipal / Udupi', cinema: 'Bharat Cinemas, INOX' },
  { slug: 'goa', name: 'Goa (Panaji / Margao)', cinema: 'INOX Panaji, Osia' },
  { slug: 'mumbai', name: 'Mumbai', cinema: 'PVR, INOX, Cinepolis' },
  { slug: 'hyderabad', name: 'Hyderabad', cinema: 'Prasads Multiplex, AMB Cinemas' },
  { slug: 'chennai', name: 'Chennai', cinema: 'Sathyam Cinemas, PVR' },
  { slug: 'ncr', name: 'Delhi-NCR', cinema: 'PVR Directors Cut, Cinepolis' },
  { slug: 'pune', name: 'Pune', cinema: 'Cinepolis, PVR Phoenix' },
];

// Preset popular upcoming releases
const POPULAR_PRESETS = [
  { title: 'Ramayana', keywords: 'Ramayana, Ramayana: Part 1, Ramayan' },
  { title: 'Kantara: A Legend Chapter-1', keywords: 'Kantara, Kantara Chapter 1, Kantara 2' },
  { title: 'Toxic: A Fairy Tale for Grown-ups', keywords: 'Toxic, Yash Toxic' },
  { title: 'War 2', keywords: 'War 2, Hrithik War 2, Jr NTR War 2' },
  { title: 'Kalki 2898 AD Part 2', keywords: 'Kalki 2, Kalki Part 2' },
  { title: 'Spirit', keywords: 'Spirit, Prabhas Spirit' },
];

// Available Auto-Check Intervals
const INTERVAL_OPTIONS = [
  { label: 'Off', minutes: 0 },
  { label: '5 mins', minutes: 5 },
  { label: '10 mins', minutes: 10 },
  { label: '15 mins', minutes: 15 },
  { label: '20 mins', minutes: 20 },
  { label: '30 mins', minutes: 30 },
  { label: '60 mins', minutes: 60 },
];

export default function TrackerDashboard() {
  const [movies, setMovies] = useState([
    {
      id: 'ramayana',
      title: 'Ramayana',
      region: 'karwar',
      keywords: ['Ramayana', 'Ramayana: Part 1', 'Ramayan'],
      lastStatus: 'NOT_YET_LISTED',
      lastCheckTime: null,
      bookingUrl: 'https://in.bookmyshow.com/explore/movies-karwar',
    },
  ]);
  const [activeMovieId, setActiveMovieId] = useState('ramayana');
  const [activeRegion, setActiveRegion] = useState('karwar');
  const [activeRegionName, setActiveRegionName] = useState('Karwar, Karnataka');

  // Auto-check interval state (in minutes, 0 = disabled)
  const [intervalMinutes, setIntervalMinutes] = useState(15);
  const [countdownSeconds, setCountdownSeconds] = useState(15 * 60);

  const [loading, setLoading] = useState(true);
  const [runningTrack, setRunningTrack] = useState(false);
  const [sendingAlert, setSendingAlert] = useState(false);

  // Modals
  const [showAddModal, setShowAddModal] = useState(false);
  const [showPlaceModal, setShowPlaceModal] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newKeywords, setNewKeywords] = useState('');
  const [newMovieRegion, setNewMovieRegion] = useState('karwar');
  const [customPlaceSlug, setCustomPlaceSlug] = useState('');
  const [addingMovie, setAddingMovie] = useState(false);

  const [feedback, setFeedback] = useState(null);

  // Fetch initial state & settings
  const fetchInitialData = async () => {
    try {
      setLoading(true);
      const [moviesRes, settingsRes] = await Promise.all([
        fetch('/api/movies'),
        fetch('/api/settings'),
      ]);

      const moviesData = await moviesRes.json();
      const settingsData = await settingsRes.json();

      if (settingsData.success && settingsData.settings) {
        const reg = settingsData.settings.region || 'karwar';
        setActiveRegion(reg);
        setActiveRegionName(settingsData.settings.regionName || `${reg.toUpperCase()}`);
        if (settingsData.settings.checkIntervalMinutes !== undefined) {
          setIntervalMinutes(settingsData.settings.checkIntervalMinutes);
          setCountdownSeconds(settingsData.settings.checkIntervalMinutes * 60);
        }
      }

      if (moviesData.success && moviesData.movies && moviesData.movies.length > 0) {
        setMovies(moviesData.movies);
        try {
          localStorage.setItem('bms_tracked_movies', JSON.stringify(moviesData.movies));
        } catch {}
      }
    } catch (err) {
      console.warn('Failed to fetch initial settings:', err.message);
      try {
        const cached = localStorage.getItem('bms_tracked_movies');
        if (cached) setMovies(JSON.parse(cached));
      } catch {}
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchInitialData();
  }, []);

  // Auto-Check Countdown & Polling Loop
  useEffect(() => {
    if (intervalMinutes <= 0) return;

    const timer = setInterval(() => {
      setCountdownSeconds((prev) => {
        if (prev <= 1) {
          handleCheckAllMovies(true);
          return intervalMinutes * 60;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [intervalMinutes, movies, activeRegion]);

  const activeMovie = movies.find((m) => m.id === activeMovieId) || movies[0] || {};
  const currentRegionObj = POPULAR_PLACES.find((p) => p.slug === activeRegion) || {
    slug: activeRegion,
    name: activeRegionName,
    cinema: `${activeRegion.toUpperCase()} Theaters & Multiplexes`,
  };

  // Change active place
  const handleSelectPlace = async (placeSlug, placeName) => {
    const slug = placeSlug.toLowerCase().trim();
    const name = placeName || slug.toUpperCase();
    setActiveRegion(slug);
    setActiveRegionName(name);
    setShowPlaceModal(false);

    try {
      await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          region: slug,
          regionName: name,
          checkIntervalMinutes: intervalMinutes,
        }),
      });
    } catch (err) {
      console.warn('Could not save place to backend settings:', err);
    }
  };

  // Change check interval
  const handleChangeInterval = async (minutes) => {
    setIntervalMinutes(minutes);
    setCountdownSeconds(minutes * 60);

    try {
      await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          region: activeRegion,
          regionName: activeRegionName,
          checkIntervalMinutes: minutes,
        }),
      });
    } catch {}
  };

  // Add new movie
  const handleAddMovie = async (e) => {
    if (e) e.preventDefault();
    if (!newTitle.trim()) return;

    try {
      setAddingMovie(true);
      const chosenRegion = newMovieRegion || activeRegion;

      const res = await fetch('/api/movies', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: newTitle.trim(),
          keywords: newKeywords.trim(),
          region: chosenRegion,
        }),
      });

      const data = await res.json();
      if (data.success) {
        setMovies(data.movies);
        setActiveMovieId(data.movie.id);
        setNewTitle('');
        setNewKeywords('');
        setShowAddModal(false);
        setFeedback({
          type: 'success',
          title: 'Movie Added!',
          msg: `"${data.movie.title}" is now being monitored in ${chosenRegion.toUpperCase()}.`,
        });
        try {
          localStorage.setItem('bms_tracked_movies', JSON.stringify(data.movies));
        } catch {}
      } else {
        throw new Error(data.error || 'Failed to add movie');
      }
    } catch (err) {
      setFeedback({
        type: 'error',
        title: 'Could Not Add Movie',
        msg: err.message,
      });
    } finally {
      setAddingMovie(false);
    }
  };

  // Remove movie
  const handleRemoveMovie = async (movieId, movieTitle, e) => {
    e.stopPropagation();
    if (!confirm(`Are you sure you want to stop tracking "${movieTitle}"?`)) return;

    try {
      const res = await fetch(`/api/movies?id=${movieId}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) {
        setMovies(data.movies);
        if (activeMovieId === movieId) {
          setActiveMovieId(data.movies[0]?.id || 'ramayana');
        }
        try {
          localStorage.setItem('bms_tracked_movies', JSON.stringify(data.movies));
        } catch {}
      }
    } catch (err) {
      console.warn('Failed to remove movie:', err.message);
    }
  };

  // Check active movie
  const handleCheckActiveMovie = async () => {
    if (!activeMovie.id) return;
    try {
      setRunningTrack(true);
      setFeedback(null);
      const reg = activeMovie.region || activeRegion;

      const res = await fetch('/api/track', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          movieId: activeMovie.id,
          region: reg,
        }),
      });
      const data = await res.json();

      if (data.success) {
        const { result, movie: updatedMovie, alertDispatched } = data;
        setMovies((prev) =>
          prev.map((m) => (m.id === updatedMovie.id ? { ...m, ...updatedMovie } : m))
        );

        if (result.isLive) {
          setFeedback({
            type: 'success',
            title: 'TICKETS ARE LIVE!',
            msg: `Found live booking for "${result.movieTitle}" in ${reg.toUpperCase()}! ${
              alertDispatched ? 'Discord webhook dispatched!' : 'Already alerted previously.'
            }`,
          });
        } else if (result.isFound) {
          setFeedback({
            type: 'info',
            title: 'Movie Listed (Coming Soon)',
            msg: `"${result.movieTitle}" is visible on ${reg.toUpperCase()} pages, but booking is not yet active.`,
          });
        } else {
          setFeedback({
            type: 'warning',
            title: 'Not Yet Listed',
            msg: `"${activeMovie.title}" is not listed on BMS ${reg.toUpperCase()} yet. The automated timer will continue checking.`,
          });
        }
      } else {
        throw new Error(data.error || 'Check execution failed');
      }
    } catch (err) {
      setFeedback({
        type: 'error',
        title: 'Check Finished',
        msg: err.message,
      });
    } finally {
      setRunningTrack(false);
      if (intervalMinutes > 0) setCountdownSeconds(intervalMinutes * 60);
    }
  };

  // Check all movies
  const handleCheckAllMovies = async (isAuto = false) => {
    try {
      setRunningTrack(true);
      if (!isAuto) setFeedback(null);

      const res = await fetch('/api/track', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ all: true, region: activeRegion }),
      });
      const data = await res.json();

      if (data.success) {
        if (data.movies) setMovies(data.movies);
        const liveMovies = (data.results || []).filter((r) => r.isLive);

        if (liveMovies.length > 0) {
          setFeedback({
            type: 'success',
            title: 'LIVE TICKETS FOUND!',
            msg: `Tickets are LIVE for: ${liveMovies.map((r) => r.movieTitle).join(', ')}!`,
          });
        } else if (!isAuto) {
          setFeedback({
            type: 'info',
            title: 'Batch Check Complete',
            msg: `Checked all ${movies.length} movies. Auto-check continues at your chosen interval.`,
          });
        }
      } else {
        throw new Error(data.error || 'Batch check failed');
      }
    } catch (err) {
      if (!isAuto) {
        setFeedback({
          type: 'error',
          title: 'Batch Check Failed',
          msg: err.message,
        });
      }
    } finally {
      setRunningTrack(false);
      if (intervalMinutes > 0) setCountdownSeconds(intervalMinutes * 60);
    }
  };

  // Test Discord Webhook
  const handleSendTestAlert = async () => {
    try {
      setSendingAlert(true);
      setFeedback(null);

      const res = await fetch('/api/test-alert', { method: 'POST' });
      const data = await res.json();

      if (data.success) {
        setFeedback({
          type: 'success',
          title: 'Discord Test Alert Sent!',
          msg: 'Check your Discord channel. You should see a test embed confirming connectivity.',
        });
      } else {
        throw new Error(data.error || 'Failed to dispatch webhook');
      }
    } catch (err) {
      setFeedback({
        type: 'error',
        title: 'Webhook Test Failed',
        msg: err.message,
      });
    } finally {
      setSendingAlert(false);
    }
  };

  const isLive = activeMovie.lastStatus === 'LIVE';
  const isListed = activeMovie.lastStatus === 'LISTED_COMING_SOON';
  const moviePlace = POPULAR_PLACES.find((p) => p.slug === (activeMovie.region || activeRegion)) || {
    name: (activeMovie.region || activeRegion).toUpperCase(),
    cinema: 'Local Theaters',
  };

  // Format countdown mm:ss
  const formatCountdown = (secs) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m}m ${s < 10 ? '0' : ''}${s}s`;
  };

  return (
    <main className="min-h-screen text-slate-100 p-4 md:p-8 max-w-4xl mx-auto">
      {/* Top Navbar */}
      <header className="flex flex-col md:flex-row items-start md:items-center justify-between pb-6 border-b border-slate-800 gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-bms-red flex items-center justify-center shadow-lg shadow-bms-red/30">
            <Film className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-xl md:text-2xl font-bold tracking-tight flex items-center gap-2">
              BookMyShow Ticket Tracker
              <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-bms-red/20 text-bms-red border border-bms-red/30 uppercase">
                {activeRegion}
              </span>
            </h1>
            <p className="text-xs md:text-sm text-slate-400">
              Monitoring <span className="text-slate-200 font-semibold">{movies.length} Movie{movies.length > 1 ? 's' : ''}</span> in <span className="text-bms-red font-semibold">{activeRegionName}</span>
            </p>
          </div>
        </div>

        {/* Controls: Place, Interval, Add Movie, Refresh, BookMyShow */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Place Selector Pill */}
          <button
            onClick={() => setShowPlaceModal(true)}
            className="px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs sm:text-sm flex items-center gap-1.5 transition-colors font-medium"
            title="Change Monitored Place / City"
          >
            <MapPin className="w-4 h-4 text-rose-400" />
            <span className="font-semibold">{activeRegionName.split(',')[0]}</span>
            <ChevronDown className="w-3.5 h-3.5 text-slate-400 ml-0.5" />
          </button>

          {/* Auto-Check Interval Dropdown */}
          <div className="relative flex items-center bg-slate-800 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs">
            <Timer className="w-3.5 h-3.5 text-indigo-400 mr-1.5" />
            <span className="text-slate-400 hidden sm:inline mr-1">Interval:</span>
            <select
              value={intervalMinutes}
              onChange={(e) => handleChangeInterval(parseInt(e.target.value, 10))}
              className="bg-transparent text-slate-200 font-semibold focus:outline-none cursor-pointer text-xs"
            >
              {INTERVAL_OPTIONS.map((opt) => (
                <option key={opt.minutes} value={opt.minutes} className="bg-slate-900 text-slate-100">
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          <button
            onClick={() => setShowAddModal(true)}
            className="px-3 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-medium transition-colors border border-emerald-500 text-xs sm:text-sm flex items-center gap-1.5 shadow-md shadow-emerald-600/20"
          >
            <Plus className="w-4 h-4" />
            <span>Add Movie</span>
          </button>

          <button
            onClick={fetchInitialData}
            disabled={loading}
            className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors border border-slate-700 text-sm flex items-center gap-1.5"
            title="Refresh State"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>

          <a
            href={`https://in.bookmyshow.com/explore/movies-${activeRegion}`}
            target="_blank"
            rel="noopener noreferrer"
            className="px-3 py-2 rounded-lg bg-bms-red hover:bg-rose-600 text-white font-medium transition-colors shadow-md shadow-bms-red/20 text-xs sm:text-sm flex items-center gap-1.5"
          >
            <span>BookMyShow</span>
            <ExternalLink className="w-4 h-4" />
          </a>
        </div>
      </header>

      {/* Auto-Check Countdown Indicator Bar */}
      {intervalMinutes > 0 && (
        <div className="mt-4 px-4 py-2 rounded-xl bg-slate-900/80 border border-slate-800 flex items-center justify-between text-xs text-slate-400">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span>Auto-Check Active (Every {intervalMinutes}m):</span>
            <span className="text-white font-mono font-bold">{formatCountdown(countdownSeconds)}</span>
          </div>

          <div className="flex items-center gap-3">
            <span className="hidden sm:inline text-slate-500">Scheduled checks run serverless in the background</span>
            <button
              onClick={() => handleCheckAllMovies()}
              disabled={runningTrack}
              className="text-bms-red hover:text-rose-400 font-semibold transition-colors flex items-center gap-1"
            >
              Check Now
            </button>
          </div>
        </div>
      )}

      {/* Tracked Movies Selector Bar */}
      <section className="mt-5">
        <div className="flex items-center justify-between mb-2.5">
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
            Tracked Movies ({movies.length})
          </span>
          <button
            onClick={() => setShowAddModal(true)}
            className="text-xs text-bms-red hover:text-rose-400 flex items-center gap-1 font-medium transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            Add Another Movie
          </button>
        </div>

        <div className="flex items-center gap-2.5 overflow-x-auto pb-2 scrollbar-thin">
          {movies.map((m) => {
            const isSelected = m.id === activeMovieId;
            const live = m.lastStatus === 'LIVE';
            const listed = m.lastStatus === 'LISTED_COMING_SOON';
            const movieReg = m.region || activeRegion;

            return (
              <div
                key={m.id}
                onClick={() => setActiveMovieId(m.id)}
                className={`cursor-pointer px-4 py-2.5 rounded-xl border flex items-center gap-2.5 transition-all shrink-0 select-none ${
                  isSelected
                    ? 'bg-slate-800 border-bms-red/70 shadow-lg shadow-bms-red/10 ring-1 ring-bms-red/40 text-white'
                    : 'glass-panel text-slate-300 hover:border-slate-700 hover:text-white'
                }`}
              >
                <div
                  className={`w-2.5 h-2.5 rounded-full shrink-0 ${
                    live
                      ? 'bg-emerald-400 animate-ping'
                      : listed
                      ? 'bg-amber-400 animate-pulse'
                      : 'bg-rose-500'
                  }`}
                />
                <span className="font-semibold text-sm">{m.title}</span>
                <span className="text-[10px] uppercase font-mono px-1.5 py-0.5 rounded bg-slate-900/80 text-slate-400 border border-slate-700/60">
                  {movieReg}
                </span>

                {movies.length > 1 && (
                  <button
                    onClick={(e) => handleRemoveMovie(m.id, m.title, e)}
                    className="ml-1 p-0.5 rounded hover:bg-rose-500/20 text-slate-500 hover:text-rose-400 transition-colors"
                    title={`Delete ${m.title}`}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            );
          })}

          <button
            onClick={() => setShowAddModal(true)}
            className="px-3.5 py-2.5 rounded-xl border border-dashed border-slate-700 hover:border-bms-red/60 text-slate-400 hover:text-bms-red transition-all flex items-center gap-1.5 text-xs font-semibold shrink-0"
          >
            <Plus className="w-4 h-4" />
            <span>Add Movie</span>
          </button>
        </div>
      </section>

      {/* Feedback Banner */}
      {feedback && (
        <div
          className={`mt-4 p-4 rounded-xl border flex items-start gap-3 transition-all ${
            feedback.type === 'success'
              ? 'bg-emerald-950/60 border-emerald-500/50 text-emerald-200'
              : feedback.type === 'info'
              ? 'bg-blue-950/60 border-blue-500/50 text-blue-200'
              : feedback.type === 'warning'
              ? 'bg-amber-950/60 border-amber-500/50 text-amber-200'
              : 'bg-rose-950/60 border-rose-500/50 text-rose-200'
          }`}
        >
          {feedback.type === 'success' ? (
            <CheckCircle2 className="w-5 h-5 mt-0.5 shrink-0 text-emerald-400" />
          ) : (
            <AlertTriangle className="w-5 h-5 mt-0.5 shrink-0 text-amber-400" />
          )}
          <div>
            <h4 className="font-semibold text-sm">{feedback.title}</h4>
            <p className="text-xs opacity-90 mt-0.5">{feedback.msg}</p>
          </div>
        </div>
      )}

      {/* Main Content Area */}
      <div className="space-y-6 mt-5">
        {/* Hero Status Card for Active Movie */}
        <div className="glass-panel rounded-2xl p-6 relative overflow-hidden border">
          {/* Background Glow */}
          <div
            className={`absolute -right-20 -top-20 w-64 h-64 rounded-full blur-3xl opacity-20 pointer-events-none ${
              isLive ? 'bg-emerald-500' : 'bg-bms-red'
            }`}
          />

          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-5 border-b border-slate-800/80">
            <div className="space-y-1">
              <div className="text-xs uppercase tracking-wider text-slate-400 font-medium flex items-center gap-1.5">
                <Compass className="w-3.5 h-3.5 text-bms-red" />
                Availability Status in {(activeMovie.region || activeRegion).toUpperCase()}
              </div>
              <div className="flex items-center gap-3">
                <div
                  className={`w-3.5 h-3.5 rounded-full ${
                    isLive
                      ? 'bg-emerald-400 animate-ping'
                      : isListed
                      ? 'bg-amber-400 animate-pulse'
                      : 'bg-rose-500'
                  }`}
                />
                <h2 className="text-2xl font-extrabold text-white">
                  {isLive
                    ? 'TICKETS LIVE & BOOKABLE!'
                    : isListed
                    ? 'LISTED (COMING SOON)'
                    : 'MONITORING (NOT YET LIVE)'}
                </h2>
              </div>
            </div>

            <div
              className={`px-3 py-1.5 rounded-full text-xs font-semibold uppercase tracking-wider border ${
                isLive
                  ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40 glow-active'
                  : isListed
                  ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                  : 'bg-slate-800 text-slate-400 border-slate-700'
              }`}
            >
              {activeMovie.lastStatus || 'INITIALIZED'}
            </div>
          </div>

          {/* Target Parameters */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-6">
            <div className="p-3.5 rounded-xl bg-slate-900/60 border border-slate-800">
              <div className="text-xs text-slate-400 flex items-center gap-1.5 mb-1">
                <Film className="w-3.5 h-3.5 text-bms-red" />
                Target Movie
              </div>
              <div className="text-sm font-bold text-white truncate">{activeMovie.title}</div>
              <div className="text-[11px] text-slate-400 mt-0.5 truncate">
                {activeMovie.keywords && activeMovie.keywords.length > 1
                  ? activeMovie.keywords.slice(0, 2).join(', ')
                  : 'Exact & Dub match'}
              </div>
            </div>

            <div className="p-3.5 rounded-xl bg-slate-900/60 border border-slate-800">
              <div className="text-xs text-slate-400 flex items-center gap-1.5 mb-1">
                <MapPin className="w-3.5 h-3.5 text-rose-400" />
                Monitored Place
              </div>
              <div className="text-sm font-bold text-white truncate">{moviePlace.name}</div>
              <div className="text-[11px] text-slate-400 mt-0.5 font-mono">
                Slug: {activeMovie.region || activeRegion}
              </div>
            </div>

            <div className="p-3.5 rounded-xl bg-slate-900/60 border border-slate-800">
              <div className="text-xs text-slate-400 flex items-center gap-1.5 mb-1">
                <Radio className="w-3.5 h-3.5 text-indigo-400" />
                Theaters / Venues
              </div>
              <div className="text-sm font-bold text-white truncate">
                {moviePlace.cinema || 'Local Cinemas'}
              </div>
              <div className="text-[11px] text-slate-400 mt-0.5 truncate">
                BookMyShow Catalog
              </div>
            </div>
          </div>

          {/* Timestamps & Booking Link */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between text-xs text-slate-400 gap-3 mt-5 pt-4 border-t border-slate-800/80">
            <div className="flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5" />
              <span>Last Checked: </span>
              <span className="text-slate-200 font-medium">
                {activeMovie.lastCheckTime
                  ? new Date(activeMovie.lastCheckTime).toLocaleString()
                  : 'Not yet checked'}
              </span>
            </div>

            {activeMovie.bookingUrl && (
              <a
                href={activeMovie.bookingUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-bms-red hover:text-rose-400 flex items-center gap-1 font-semibold transition-colors"
              >
                Book on BookMyShow
                <ExternalLink className="w-3 h-3" />
              </a>
            )}
          </div>
        </div>

        {/* Action Center (Manual Triggers) */}
        <div className="glass-panel rounded-2xl p-6 border">
          <h3 className="text-base font-bold text-white flex items-center gap-2 mb-2">
            <Sparkles className="w-4 h-4 text-bms-red" />
            Manual Control Center
          </h3>
          <p className="text-xs text-slate-400 mb-5">
            Run instant checks on-demand for <strong>{activeMovie.title}</strong>, check all {movies.length} movies, or test Discord alerts.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
            <button
              onClick={handleCheckActiveMovie}
              disabled={runningTrack}
              className="p-3.5 rounded-xl bg-gradient-to-r from-bms-red to-rose-600 hover:from-rose-600 hover:to-rose-700 text-white font-semibold flex items-center justify-center gap-2 transition-all shadow-lg shadow-bms-red/25 disabled:opacity-50 text-xs sm:text-sm"
            >
              {runningTrack ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>Scraping...</span>
                </>
              ) : (
                <>
                  <Play className="w-4 h-4 fill-white" />
                  <span>Check "{activeMovie.title}"</span>
                </>
              )}
            </button>

            <button
              onClick={() => handleCheckAllMovies()}
              disabled={runningTrack}
              className="p-3.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold border border-slate-700 flex items-center justify-center gap-2 transition-all disabled:opacity-50 text-xs sm:text-sm"
            >
              <RefreshCw className="w-4 h-4 text-emerald-400" />
              <span>Check All ({movies.length})</span>
            </button>

            <button
              onClick={handleSendTestAlert}
              disabled={sendingAlert}
              className="p-3.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold border border-slate-700 flex items-center justify-center gap-2 transition-all disabled:opacity-50 text-xs sm:text-sm"
            >
              {sendingAlert ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin text-indigo-400" />
                  <span>Sending...</span>
                </>
              ) : (
                <>
                  <Send className="w-4 h-4 text-indigo-400" />
                  <span>Test Discord</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Select Place / Region Modal */}
      {showPlaceModal && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="glass-panel rounded-2xl p-6 border max-w-lg w-full bg-[#161922] shadow-2xl relative animate-in fade-in zoom-in-95 duration-150 max-h-[90vh] overflow-y-auto">
            <button
              onClick={() => setShowPlaceModal(false)}
              className="absolute top-4 right-4 p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-2.5 mb-1 text-white">
              <MapPin className="w-5 h-5 text-rose-500" />
              <h3 className="text-lg font-bold">Select Place / City</h3>
            </div>
            <p className="text-xs text-slate-400 mb-5">
              Choose your BookMyShow region to track showtimes and advance ticket bookings.
            </p>

            {/* Popular Places Grid */}
            <div className="space-y-2 mb-5">
              <span className="text-xs font-semibold text-slate-300 block">Popular Cities:</span>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {POPULAR_PLACES.map((p) => {
                  const isCurrent = p.slug === activeRegion;
                  return (
                    <button
                      key={p.slug}
                      type="button"
                      onClick={() => handleSelectPlace(p.slug, p.name)}
                      className={`p-2.5 rounded-xl text-left border transition-all text-xs flex flex-col justify-between ${
                        isCurrent
                          ? 'bg-bms-red/20 border-bms-red text-white font-bold'
                          : 'bg-slate-900/60 border-slate-700/80 text-slate-300 hover:border-slate-500 hover:text-white'
                      }`}
                    >
                      <span className="truncate">{p.name.split(',')[0]}</span>
                      <span className="text-[10px] text-slate-500 font-mono mt-0.5">{p.slug}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Custom City Slug Input */}
            <div className="pt-4 border-t border-slate-800">
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                Or enter any custom BookMyShow city slug:
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  placeholder="e.g. sirsi, udupi, shimoga, dharwad"
                  value={customPlaceSlug}
                  onChange={(e) => setCustomPlaceSlug(e.target.value)}
                  className="flex-1 px-3.5 py-2 rounded-xl bg-slate-900 border border-slate-700 text-white placeholder-slate-500 text-xs focus:outline-none focus:border-bms-red font-mono"
                />
                <button
                  type="button"
                  onClick={() => {
                    if (customPlaceSlug.trim()) {
                      handleSelectPlace(customPlaceSlug.trim(), `${customPlaceSlug.trim().toUpperCase()}`);
                      setCustomPlaceSlug('');
                    }
                  }}
                  disabled={!customPlaceSlug.trim()}
                  className="px-4 py-2 rounded-xl bg-bms-red hover:bg-rose-600 text-white font-semibold text-xs transition-colors disabled:opacity-50"
                >
                  Set Place
                </button>
              </div>
              <span className="text-[11px] text-slate-500 mt-1 block">
                Matches the BookMyShow URL: <code>in.bookmyshow.com/explore/movies-[slug]</code>
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Add Movie Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="glass-panel rounded-2xl p-6 border max-w-lg w-full bg-[#161922] shadow-2xl relative animate-in fade-in zoom-in-95 duration-150">
            <button
              onClick={() => setShowAddModal(false)}
              className="absolute top-4 right-4 p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-2.5 mb-1 text-white">
              <Film className="w-5 h-5 text-bms-red" />
              <h3 className="text-lg font-bold">Add Movie to Tracker</h3>
            </div>
            <p className="text-xs text-slate-400 mb-5">
              Add any upcoming movie to track ticket availability on BookMyShow.
            </p>

            <form onSubmit={handleAddMovie} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  Movie Title <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  placeholder="e.g. Kantara: A Legend Chapter-1, Toxic, War 2"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  required
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900 border border-slate-700 text-white placeholder-slate-500 text-sm focus:outline-none focus:border-bms-red"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  Monitored Place / City
                </label>
                <select
                  value={newMovieRegion}
                  onChange={(e) => setNewMovieRegion(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900 border border-slate-700 text-white text-sm focus:outline-none focus:border-bms-red"
                >
                  {POPULAR_PLACES.map((p) => (
                    <option key={p.slug} value={p.slug}>
                      {p.name} ({p.slug})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  Keywords / Aliases (Optional, comma-separated)
                </label>
                <input
                  type="text"
                  placeholder="e.g. Kantara, Kantara Chapter 1, Kantara 2"
                  value={newKeywords}
                  onChange={(e) => setNewKeywords(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900 border border-slate-700 text-white placeholder-slate-500 text-sm focus:outline-none focus:border-bms-red"
                />
              </div>

              {/* Quick Presets */}
              <div>
                <span className="text-xs font-semibold text-slate-400 block mb-2">
                  Popular upcoming releases:
                </span>
                <div className="flex flex-wrap gap-2">
                  {POPULAR_PRESETS.map((p) => (
                    <button
                      key={p.title}
                      type="button"
                      onClick={() => {
                        setNewTitle(p.title);
                        setNewKeywords(p.keywords);
                      }}
                      className="px-2.5 py-1 rounded-lg text-xs bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition-colors"
                    >
                      + {p.title}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-800 mt-6">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 rounded-xl text-slate-400 hover:text-white text-sm"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={addingMovie || !newTitle.trim()}
                  className="px-5 py-2.5 rounded-xl bg-bms-red hover:bg-rose-600 text-white font-semibold text-sm transition-all shadow-md shadow-bms-red/25 disabled:opacity-50 flex items-center gap-1.5"
                >
                  {addingMovie ? (
                    <RefreshCw className="w-4 h-4 animate-spin" />
                  ) : (
                    <Check className="w-4 h-4" />
                  )}
                  <span>Add to Tracker</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </main>
  );
}
