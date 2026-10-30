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
  Plus,
  Trash2,
  Check,
  Timer,
  ChevronDown,
  Sparkles,
  Ticket,
  X,
} from 'lucide-react';

// Preset popular places on BookMyShow
const POPULAR_PLACES = [
  { slug: 'karwar', name: 'Karwar', fullName: 'Karwar, Karnataka', cinema: 'Miraj Cinemas: Geetanjali' },
  { slug: 'bengaluru', name: 'Bengaluru', fullName: 'Bengaluru / Bangalore', cinema: 'PVR, INOX, Cinepolis' },
  { slug: 'mangaluru', name: 'Mangaluru', fullName: 'Mangaluru / Mangalore', cinema: 'PVR, Bharat Cinemas' },
  { slug: 'hubli', name: 'Hubballi', fullName: 'Hubballi / Hubli', cinema: 'Cinepolis, PVR Urban' },
  { slug: 'belgaum', name: 'Belagavi', fullName: 'Belagavi / Belgaum', cinema: 'Inox, Carnival' },
  { slug: 'mysuru', name: 'Mysuru', fullName: 'Mysuru / Mysore', cinema: 'DRC Cinemas, INOX' },
  { slug: 'manipal', name: 'Manipal', fullName: 'Manipal / Udupi', cinema: 'Bharat Cinemas, INOX' },
  { slug: 'goa', name: 'Goa', fullName: 'Goa (Panaji / Margao)', cinema: 'INOX Panaji, Osia' },
  { slug: 'mumbai', name: 'Mumbai', fullName: 'Mumbai', cinema: 'PVR, INOX, Cinepolis' },
  { slug: 'hyderabad', name: 'Hyderabad', fullName: 'Hyderabad', cinema: 'Prasads, AMB Cinemas' },
  { slug: 'chennai', name: 'Chennai', fullName: 'Chennai', cinema: 'Sathyam Cinemas, PVR' },
  { slug: 'ncr', name: 'Delhi-NCR', fullName: 'Delhi-NCR', cinema: 'PVR Directors Cut' },
  { slug: 'pune', name: 'Pune', fullName: 'Pune', cinema: 'Cinepolis, PVR Phoenix' },
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

const INTERVAL_OPTIONS = [
  { label: 'Off', minutes: 0 },
  { label: '5m', minutes: 5 },
  { label: '10m', minutes: 10 },
  { label: '15m', minutes: 15 },
  { label: '20m', minutes: 20 },
  { label: '30m', minutes: 30 },
  { label: '60m', minutes: 60 },
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
      theaters: ['Miraj Cinemas: Geetanjali, Karwar'],
    },
  ]);

  // Form State for Adding Tracker
  const [formTitle, setFormTitle] = useState('');
  const [formRegion, setFormRegion] = useState('karwar');
  const [formKeywords, setFormKeywords] = useState('');
  const [addingMovie, setAddingMovie] = useState(false);

  // Global settings
  const [intervalMinutes, setIntervalMinutes] = useState(15);
  const [countdownSeconds, setCountdownSeconds] = useState(15 * 60);

  const [loading, setLoading] = useState(true);
  const [checkingMovieId, setCheckingMovieId] = useState(null);
  const [checkingAll, setCheckingAll] = useState(false);
  const [testingDiscord, setTestingDiscord] = useState(false);
  const [feedback, setFeedback] = useState(null);

  // Custom Delete Modal State
  const [deleteModal, setDeleteModal] = useState({
    isOpen: false,
    movie: null,
    deleting: false,
  });

  // Fetch initial movies & settings
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
        if (settingsData.settings.region) setFormRegion(settingsData.settings.region);
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
      console.warn('Failed to fetch initial data:', err.message);
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
  }, [intervalMinutes, movies]);

  // Handle adding a new movie tracker
  const handleAddTracker = async (e) => {
    if (e) e.preventDefault();
    if (!formTitle.trim()) return;

    try {
      setAddingMovie(true);
      setFeedback(null);

      const res = await fetch('/api/movies', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: formTitle.trim(),
          region: formRegion,
          keywords: formKeywords.trim(),
        }),
      });

      const data = await res.json();
      if (data.success) {
        setMovies(data.movies);
        setFormTitle('');
        setFormKeywords('');
        setFeedback({
          type: 'success',
          title: 'Tracker Added!',
          msg: `"${data.movie.title}" is now actively tracked in ${data.movie.region.toUpperCase()}.`,
        });
        try {
          localStorage.setItem('bms_tracked_movies', JSON.stringify(data.movies));
        } catch {}
      } else {
        throw new Error(data.error || 'Failed to add tracker');
      }
    } catch (err) {
      setFeedback({
        type: 'error',
        title: 'Error Adding Tracker',
        msg: err.message,
      });
    } finally {
      setAddingMovie(false);
    }
  };

  // Close modal on Escape key press
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && deleteModal.isOpen && !deleteModal.deleting) {
        setDeleteModal({ isOpen: false, movie: null, deleting: false });
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [deleteModal.isOpen, deleteModal.deleting]);

  // Open custom confirmation modal to delete a tracker
  const promptDeleteTracker = (movie) => {
    setDeleteModal({
      isOpen: true,
      movie,
      deleting: false,
    });
  };

  const closeDeleteModal = () => {
    if (deleteModal.deleting) return;
    setDeleteModal({ isOpen: false, movie: null, deleting: false });
  };

  const confirmDeleteTracker = async () => {
    if (!deleteModal.movie) return;
    const { id, title } = deleteModal.movie;

    try {
      setDeleteModal((prev) => ({ ...prev, deleting: true }));
      const res = await fetch(`/api/movies?id=${id}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) {
        setMovies(data.movies);
        try {
          localStorage.setItem('bms_tracked_movies', JSON.stringify(data.movies));
        } catch {}
        setFeedback({
          type: 'info',
          title: 'Tracker Removed',
          msg: `"${title}" is no longer being tracked.`,
        });
      } else {
        throw new Error(data.error || 'Failed to remove tracker');
      }
    } catch (err) {
      console.warn('Failed to delete movie:', err.message);
      setFeedback({
        type: 'error',
        title: 'Delete Failed',
        msg: err.message,
      });
    } finally {
      setDeleteModal({ isOpen: false, movie: null, deleting: false });
    }
  };

  // Compatibility fallback
  const handleDeleteTracker = (movieId, movieTitle) => {
    const m = movies.find((item) => item.id === movieId) || { id: movieId, title: movieTitle };
    promptDeleteTracker(m);
  };

  // Check a single movie tracker
  const handleCheckSingleMovie = async (movie) => {
    try {
      setCheckingMovieId(movie.id);
      setFeedback(null);

      const res = await fetch('/api/track', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          movieId: movie.id,
          title: movie.title,
          region: movie.region || 'karwar',
          keywords: movie.keywords,
          movie,
        }),
      });
      const data = await res.json();

      if (data.success) {
        const { result, movie: updatedMovie, alertDispatched, movies: updatedMovies } = data;
        if (updatedMovies && updatedMovies.length > 0) {
          setMovies(updatedMovies);
        } else {
          setMovies((prev) =>
            prev.map((m) => (m.id === updatedMovie.id ? { ...m, ...updatedMovie } : m))
          );
        }

        if (result.isLive) {
          setFeedback({
            type: 'success',
            title: 'TICKETS LIVE!',
            msg: `🎉 Booking is OPEN for "${result.movieTitle}" in ${(movie.region || 'karwar').toUpperCase()}! ${
              alertDispatched ? 'Discord webhook alert dispatched!' : ''
            }`,
          });
        } else if (result.isFound) {
          setFeedback({
            type: 'info',
            title: 'Movie Listed (Coming Soon)',
            msg: `"${result.movieTitle}" is visible on BookMyShow ${(movie.region || 'karwar').toUpperCase()}, but booking hasn't opened yet.`,
          });
        } else {
          setFeedback({
            type: 'warning',
            title: 'Not Yet Listed',
            msg: `"${movie.title}" is not listed in ${(movie.region || 'karwar').toUpperCase()} yet. The auto-tracker will keep monitoring.`,
          });
        }
      } else {
        throw new Error(data.error || 'Check failed');
      }
    } catch (err) {
      setFeedback({
        type: 'error',
        title: 'Check Finished',
        msg: err.message,
      });
    } finally {
      setCheckingMovieId(null);
      if (intervalMinutes > 0) setCountdownSeconds(intervalMinutes * 60);
    }
  };

  // Check all movies
  const handleCheckAllMovies = async (isAuto = false) => {
    try {
      setCheckingAll(true);
      if (!isAuto) setFeedback(null);

      const res = await fetch('/api/track', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ all: true }),
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
            title: 'All Trackers Checked',
            msg: `Checked ${movies.length} movies. Auto-check continues at your chosen interval.`,
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
      setCheckingAll(false);
      if (intervalMinutes > 0) setCountdownSeconds(intervalMinutes * 60);
    }
  };

  // Test Discord Webhook
  const handleSendTestAlert = async () => {
    try {
      setTestingDiscord(true);
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
      setTestingDiscord(false);
    }
  };

  // Change interval
  const handleChangeInterval = async (minutes) => {
    setIntervalMinutes(minutes);
    setCountdownSeconds(minutes * 60);

    try {
      await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ checkIntervalMinutes: minutes }),
      });
    } catch {}
  };

  // Format time relative or string
  const formatTimeAgo = (iso) => {
    if (!iso) return 'Never checked';
    const diffMs = Date.now() - new Date(iso).getTime();
    const diffMins = Math.floor(diffMs / 60000);
    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    return new Date(iso).toLocaleDateString();
  };

  const formatCountdown = (secs) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m}m ${s < 10 ? '0' : ''}${s}s`;
  };

  return (
    <main className="min-h-screen text-slate-100 p-4 md:p-8 max-w-7xl mx-auto">
      {/* Top Header */}
      <header className="flex flex-col sm:flex-row items-start sm:items-center justify-between pb-6 border-b border-slate-800/80 gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-bms-red to-purple-600 flex items-center justify-center shadow-lg shadow-bms-red/25">
            <Film className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-xl md:text-2xl font-extrabold tracking-tight text-white flex items-center gap-2">
              BookMyShow Tracker
            </h1>
            <p className="text-xs text-slate-400 uppercase tracking-wider font-medium">
              Real-Time Ticket Availability Tracker
            </p>
          </div>
        </div>

        {/* Global Controls */}
        <div className="flex items-center gap-2.5">
          {/* System Active Badge */}
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-slate-900 border border-slate-800 text-xs text-slate-300">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span className="font-semibold text-emerald-400">System Active</span>
          </div>

          {/* Test Discord */}
          <button
            onClick={handleSendTestAlert}
            disabled={testingDiscord}
            className="p-2 sm:px-3 sm:py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-800 text-xs font-medium flex items-center gap-1.5 transition-colors disabled:opacity-50"
            title="Send Test Discord Webhook Alert"
          >
            <Send className="w-3.5 h-3.5 text-indigo-400" />
            <span className="hidden sm:inline">Test Discord</span>
          </button>

          {/* Refresh */}
          <button
            onClick={fetchInitialData}
            disabled={loading}
            className="p-2 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-800 text-xs transition-colors"
            title="Refresh All Trackers"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </header>

      {/* Feedback Banner */}
      {feedback && (
        <div
          className={`mt-4 p-3.5 rounded-xl border flex items-start gap-3 transition-all ${
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
            <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0 text-emerald-400" />
          ) : (
            <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0 text-amber-400" />
          )}
          <div className="flex-1">
            <h4 className="font-semibold text-xs sm:text-sm">{feedback.title}</h4>
            <p className="text-xs opacity-90 mt-0.5">{feedback.msg}</p>
          </div>
          <button
            onClick={() => setFeedback(null)}
            className="text-slate-400 hover:text-white"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Main 2-Column Layout (FitCheck Pattern) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 mt-6 items-start">
        {/* LEFT COLUMN: "+ Add New Tracker" (4 cols on lg) */}
        <div className="lg:col-span-4 bg-[#131622] border border-slate-800/90 rounded-2xl p-5 shadow-xl sticky top-6">
          <div className="flex items-center gap-2 mb-4 pb-3 border-b border-slate-800">
            <Plus className="w-4 h-4 text-bms-red" />
            <h2 className="text-sm font-bold text-white uppercase tracking-wider">
              Add New Tracker
            </h2>
          </div>

          <form onSubmit={handleAddTracker} className="space-y-4">
            {/* Movie Title */}
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                Movie Title <span className="text-rose-500">*</span>
              </label>
              <div className="relative">
                <Film className="w-4 h-4 text-slate-500 absolute left-3.5 top-3" />
                <input
                  type="text"
                  placeholder="e.g. Ramayana, Kantara, Toxic, War 2"
                  value={formTitle}
                  onChange={(e) => setFormTitle(e.target.value)}
                  required
                  className="w-full pl-10 pr-3.5 py-2.5 rounded-xl bg-[#0c0e17] border border-slate-800 text-white placeholder-slate-500 text-xs focus:outline-none focus:border-bms-red transition-colors"
                />
              </div>
            </div>

            {/* Place / Region */}
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                Place / Region
              </label>
              <div className="relative">
                <MapPin className="w-4 h-4 text-rose-500 absolute left-3.5 top-3" />
                <select
                  value={formRegion}
                  onChange={(e) => setFormRegion(e.target.value)}
                  className="w-full pl-10 pr-3.5 py-2.5 rounded-xl bg-[#0c0e17] border border-slate-800 text-white text-xs focus:outline-none focus:border-bms-red cursor-pointer"
                >
                  {POPULAR_PLACES.map((p) => (
                    <option key={p.slug} value={p.slug} className="bg-slate-900">
                      {p.name} ({p.fullName})
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Target Keywords / Dubs */}
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                Target Keywords / Dubs (Optional)
              </label>
              <input
                type="text"
                placeholder="e.g. Part 1, Hindi, Kannada, 3D"
                value={formKeywords}
                onChange={(e) => setFormKeywords(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl bg-[#0c0e17] border border-slate-800 text-white placeholder-slate-500 text-xs focus:outline-none focus:border-bms-red transition-colors"
              />
              <span className="text-[10px] text-slate-500 mt-1 block">
                Comma separated variants to detect advance bookings.
              </span>
            </div>

            {/* Check Interval */}
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                Check Interval
              </label>
              <div className="relative">
                <Timer className="w-4 h-4 text-indigo-400 absolute left-3.5 top-3" />
                <select
                  value={intervalMinutes}
                  onChange={(e) => handleChangeInterval(parseInt(e.target.value, 10))}
                  className="w-full pl-10 pr-3.5 py-2.5 rounded-xl bg-[#0c0e17] border border-slate-800 text-white text-xs focus:outline-none focus:border-bms-red cursor-pointer"
                >
                  {INTERVAL_OPTIONS.map((opt) => (
                    <option key={opt.minutes} value={opt.minutes} className="bg-slate-900">
                      {opt.minutes > 0 ? `Every ${opt.label}` : 'Off (Manual checks only)'}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* 1-Click Popular Presets */}
            <div>
              <span className="text-[11px] font-semibold text-slate-400 block mb-1.5">
                Popular Upcoming:
              </span>
              <div className="flex flex-wrap gap-1.5">
                {POPULAR_PRESETS.map((p) => (
                  <button
                    key={p.title}
                    type="button"
                    onClick={() => {
                      setFormTitle(p.title);
                      setFormKeywords(p.keywords);
                    }}
                    className="px-2 py-0.5 rounded-lg text-[10px] bg-slate-800/80 hover:bg-slate-700 text-slate-300 border border-slate-700/60 transition-colors"
                  >
                    + {p.title.split(':')[0]}
                  </button>
                ))}
              </div>
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={addingMovie || !formTitle.trim()}
              className="w-full py-3 rounded-xl bg-gradient-to-r from-bms-red to-purple-600 hover:from-rose-600 hover:to-purple-700 text-white font-bold text-xs uppercase tracking-wider transition-all shadow-lg shadow-bms-red/25 disabled:opacity-50 flex items-center justify-center gap-2 mt-2"
            >
              {addingMovie ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>Adding Tracker...</span>
                </>
              ) : (
                <>
                  <Plus className="w-4 h-4" />
                  <span>Start Tracking</span>
                </>
              )}
            </button>
          </form>
        </div>

        {/* RIGHT COLUMN: "Tracked Items" List (8 cols on lg) */}
        <div className="lg:col-span-8 space-y-4">
          {/* Header Row */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Film className="w-4 h-4 text-bms-red" />
              <h2 className="text-sm font-bold text-white uppercase tracking-wider">
                Tracked Movies ({movies.length})
              </h2>
            </div>

            <div className="flex items-center gap-3">
              {intervalMinutes > 0 && (
                <div className="text-xs text-slate-400 hidden sm:flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                  <span>Next check:</span>
                  <span className="font-mono text-white font-bold">{formatCountdown(countdownSeconds)}</span>
                </div>
              )}

              <button
                onClick={() => handleCheckAllMovies()}
                disabled={checkingAll}
                className="px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-white font-semibold text-xs border border-slate-800 flex items-center gap-1.5 transition-colors disabled:opacity-50"
              >
                <RefreshCw className={`w-3.5 h-3.5 text-emerald-400 ${checkingAll ? 'animate-spin' : ''}`} />
                <span>Check All ({movies.length})</span>
              </button>
            </div>
          </div>

          {/* List of Tracked Movie Cards */}
          <div className="space-y-3">
            {movies.map((m) => {
              const isLive = m.lastStatus === 'LIVE';
              const isListed = m.lastStatus === 'LISTED_COMING_SOON';
              const isCheckingThis = checkingMovieId === m.id;
              const placeObj = POPULAR_PLACES.find((p) => p.slug === (m.region || 'karwar')) || {
                name: (m.region || 'karwar').toUpperCase(),
                cinema: 'Local Multiplexes',
              };

              return (
                <div
                  key={m.id}
                  className={`bg-[#131622] rounded-2xl p-5 border transition-all ${
                    isLive
                      ? 'border-emerald-500/60 shadow-lg shadow-emerald-500/10'
                      : 'border-slate-800/90 hover:border-slate-700'
                  }`}
                >
                  {/* Top Row: Region Badge & Live Status */}
                  <div className="flex items-center justify-between pb-3 border-b border-slate-800/60">
                    <div className="flex items-center gap-2">
                      {/* Region Tag */}
                      <span className="px-2.5 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider bg-amber-500/15 text-amber-400 border border-amber-500/30">
                        {placeObj.name}
                      </span>
                      <span className="text-xs text-slate-400 hidden sm:inline truncate max-w-[200px]">
                        {placeObj.cinema}
                      </span>
                    </div>

                    {/* Status Badge */}
                    <div className="flex items-center gap-1.5">
                      <span
                        className={`w-2 h-2 rounded-full ${
                          isLive
                            ? 'bg-emerald-400 animate-ping'
                            : isListed
                            ? 'bg-amber-400 animate-pulse'
                            : 'bg-rose-500'
                        }`}
                      />
                      <span
                        className={`text-xs font-bold uppercase tracking-wider ${
                          isLive
                            ? 'text-emerald-400 font-extrabold'
                            : isListed
                            ? 'text-amber-400'
                            : 'text-rose-400'
                        }`}
                      >
                        {isLive ? 'IN STOCK / TICKETS LIVE' : isListed ? 'COMING SOON' : 'MONITORING'}
                      </span>
                    </div>
                  </div>

                  {/* Middle: Movie Title & Info */}
                  <div className="py-3">
                    <h3 className="text-base sm:text-lg font-bold text-white tracking-tight">
                      {m.title}
                    </h3>
                    <p className="text-xs text-slate-400 mt-0.5">
                      Keywords: {m.keywords && m.keywords.length > 0 ? m.keywords.join(', ') : m.title}
                    </p>
                  </div>

                  {/* Bottom Row: Metadata & Actions */}
                  <div className="pt-3 border-t border-slate-800/60 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs">
                    {/* Meta Info */}
                    <div className="flex items-center gap-4 text-slate-400 font-mono text-[11px]">
                      <div>
                        <span className="text-slate-500 uppercase block text-[9px]">PLACE</span>
                        <span className="text-slate-200 font-sans font-semibold">{placeObj.name}</span>
                      </div>
                      <div>
                        <span className="text-slate-500 uppercase block text-[9px]">CHECKS</span>
                        <span className="text-slate-200">{intervalMinutes > 0 ? `${intervalMinutes}m` : 'Manual'}</span>
                      </div>
                      <div>
                        <span className="text-slate-500 uppercase block text-[9px]">LAST CHECKED</span>
                        <span className="text-slate-200">{formatTimeAgo(m.lastCheckTime)}</span>
                      </div>
                    </div>

                    {/* Action Buttons */}
                    <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
                      {/* Check Now Button */}
                      <button
                        onClick={() => handleCheckSingleMovie(m)}
                        disabled={isCheckingThis || checkingAll}
                        className="px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-indigo-300 hover:text-white font-semibold text-xs border border-indigo-500/30 flex items-center gap-1.5 transition-colors disabled:opacity-50"
                      >
                        <RefreshCw className={`w-3 h-3 ${isCheckingThis ? 'animate-spin' : ''}`} />
                        <span>{isCheckingThis ? 'Checking...' : 'Check Now'}</span>
                      </button>

                      {/* Direct BMS Link Button */}
                      {m.bookingUrl && (
                        <a
                          href={m.bookingUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className={`px-3 py-1.5 rounded-lg font-semibold text-xs flex items-center gap-1 transition-colors ${
                            isLive
                              ? 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-md shadow-emerald-600/30 font-bold'
                              : 'bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-800'
                          }`}
                        >
                          <Ticket className="w-3.5 h-3.5" />
                          <span>{isLive ? 'Book Tickets' : 'BookMyShow'}</span>
                          <ExternalLink className="w-3 h-3 ml-0.5" />
                        </a>
                      )}

                      {/* Delete Button */}
                      {movies.length > 1 && (
                        <button
                          onClick={() => promptDeleteTracker(m)}
                          className="p-1.5 rounded-lg hover:bg-rose-500/20 text-slate-500 hover:text-rose-400 transition-colors"
                          title={`Delete "${m.title}"`}
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
      {/* Custom Confirmation Modal */}
      {deleteModal.isOpen && deleteModal.movie && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200"
          onClick={(e) => {
            if (e.target === e.currentTarget) closeDeleteModal();
          }}
        >
          <div
            className="w-full max-w-sm rounded-2xl bg-[#131622] border border-slate-800/90 shadow-2xl p-6 text-center transform transition-all animate-in zoom-in-95 duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header Icon */}
            <div className="mx-auto w-12 h-12 rounded-2xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center text-rose-500 mb-4 shadow-lg shadow-rose-500/5">
              <Trash2 className="w-6 h-6 text-rose-400" />
            </div>

            {/* Modal Title */}
            <h3 className="text-base font-bold text-white tracking-tight">
              Remove Movie Tracker?
            </h3>

            {/* Modal Description */}
            <p className="text-xs text-slate-400 mt-2 leading-relaxed">
              Are you sure you want to stop tracking{' '}
              <span className="font-semibold text-white">
                "{deleteModal.movie.title}"
              </span>{' '}
              in{' '}
              <span className="font-semibold text-amber-400 uppercase">
                {deleteModal.movie.region || 'karwar'}
              </span>
              ? You will no longer receive availability alerts for this movie.
            </p>

            {/* Action Buttons */}
            <div className="flex items-center gap-3 mt-6">
              <button
                type="button"
                onClick={closeDeleteModal}
                disabled={deleteModal.deleting}
                className="flex-1 py-2.5 px-4 rounded-xl bg-slate-800/90 hover:bg-slate-700 text-slate-300 font-semibold text-xs border border-slate-700/60 transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmDeleteTracker}
                disabled={deleteModal.deleting}
                className="flex-1 py-2.5 px-4 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs transition-colors shadow-lg shadow-rose-600/25 flex items-center justify-center gap-1.5 disabled:opacity-50"
              >
                {deleteModal.deleting ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Removing...</span>
                  </>
                ) : (
                  <>
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Remove</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
