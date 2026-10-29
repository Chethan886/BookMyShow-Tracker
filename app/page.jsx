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
  Terminal,
  Layers,
  Sparkles,
  Plus,
  Trash2,
  X,
  Check,
} from 'lucide-react';

function GitHubIcon({ className = 'w-4 h-4' }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.53 1.032 1.53 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z"
      />
    </svg>
  );
}

// Preset popular Indian releases for 1-click addition
const POPULAR_PRESETS = [
  { title: 'Ramayana', keywords: 'Ramayana, Ramayana: Part 1, Ramayan' },
  { title: 'Kantara: A Legend Chapter-1', keywords: 'Kantara, Kantara Chapter 1, Kantara 2' },
  { title: 'Toxic: A Fairy Tale for Grown-ups', keywords: 'Toxic, Yash Toxic' },
  { title: 'War 2', keywords: 'War 2, Hrithik War 2, Jr NTR War 2' },
  { title: 'Kalki 2898 AD Part 2', keywords: 'Kalki 2, Kalki Part 2' },
  { title: 'Spirit', keywords: 'Spirit, Prabhas Spirit' },
];

export default function TrackerDashboard() {
  const [movies, setMovies] = useState([
    {
      id: 'ramayana',
      title: 'Ramayana',
      keywords: ['Ramayana', 'Ramayana: Part 1', 'Ramayan'],
      lastStatus: 'NOT_YET_LISTED',
      lastCheckTime: null,
      bookingUrl: 'https://in.bookmyshow.com/explore/movies-karwar',
    },
  ]);
  const [activeMovieId, setActiveMovieId] = useState('ramayana');
  const [loading, setLoading] = useState(true);
  const [runningTrack, setRunningTrack] = useState(false);
  const [sendingAlert, setSendingAlert] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newKeywords, setNewKeywords] = useState('');
  const [addingMovie, setAddingMovie] = useState(false);
  const [logs, setLogs] = useState([]);
  const [feedback, setFeedback] = useState(null);

  const addLog = (msg) => {
    const time = new Date().toLocaleTimeString();
    setLogs((prev) => [`[${time}] ${msg}`, ...prev.slice(0, 49)]);
  };

  const fetchMovies = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/movies');
      const data = await res.json();
      if (data.success && data.movies && data.movies.length > 0) {
        setMovies(data.movies);
        // Persist local backup
        try {
          localStorage.setItem('bms_tracked_movies', JSON.stringify(data.movies));
        } catch {}
        addLog(`Loaded ${data.movies.length} tracked movie(s) from state.`);
      }
    } catch (err) {
      addLog(`Failed to fetch movies from API: ${err.message}`);
      // Fallback to localStorage if serverless read failed
      try {
        const cached = localStorage.getItem('bms_tracked_movies');
        if (cached) {
          const parsed = JSON.parse(cached);
          if (Array.isArray(parsed) && parsed.length > 0) {
            setMovies(parsed);
            addLog(`Restored ${parsed.length} movie(s) from local browser memory.`);
          }
        }
      } catch {}
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMovies();
    addLog('System initialized. Multi-movie tracking ready.');
  }, []);

  const activeMovie = movies.find((m) => m.id === activeMovieId) || movies[0] || {};

  // Handle adding a new movie
  const handleAddMovie = async (e) => {
    if (e) e.preventDefault();
    if (!newTitle.trim()) return;

    try {
      setAddingMovie(true);
      addLog(`Adding "${newTitle.trim()}" to tracked movies...`);

      const res = await fetch('/api/movies', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: newTitle.trim(),
          keywords: newKeywords.trim(),
        }),
      });

      const data = await res.json();
      if (data.success) {
        setMovies(data.movies);
        setActiveMovieId(data.movie.id);
        setNewTitle('');
        setNewKeywords('');
        setShowAddModal(false);
        addLog(`✅ "${data.movie.title}" is now actively tracked in Karwar!`);
        setFeedback({
          type: 'success',
          title: 'Movie Added!',
          msg: `"${data.movie.title}" added to Karwar tracker. You can run a check right now!`,
        });
        // Cache locally
        try {
          localStorage.setItem('bms_tracked_movies', JSON.stringify(data.movies));
        } catch {}
      } else {
        throw new Error(data.error || 'Failed to add movie');
      }
    } catch (err) {
      addLog(`❌ Error adding movie: ${err.message}`);
      setFeedback({
        type: 'error',
        title: 'Could Not Add Movie',
        msg: err.message,
      });
    } finally {
      setAddingMovie(false);
    }
  };

  // Handle removing a movie
  const handleRemoveMovie = async (movieId, movieTitle, e) => {
    e.stopPropagation();
    if (!confirm(`Are you sure you want to stop tracking "${movieTitle}"?`)) return;

    try {
      addLog(`Removing "${movieTitle}" from tracker...`);
      const res = await fetch(`/api/movies?id=${movieId}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) {
        setMovies(data.movies);
        if (activeMovieId === movieId) {
          setActiveMovieId(data.movies[0]?.id || 'ramayana');
        }
        addLog(`🗑️ Removed "${movieTitle}".`);
        try {
          localStorage.setItem('bms_tracked_movies', JSON.stringify(data.movies));
        } catch {}
      }
    } catch (err) {
      addLog(`❌ Failed to remove movie: ${err.message}`);
    }
  };

  // Run live check for the selected movie
  const handleCheckActiveMovie = async () => {
    if (!activeMovie.id) return;
    try {
      setRunningTrack(true);
      setFeedback(null);
      addLog(`Scraping BookMyShow Karwar for "${activeMovie.title}"...`);

      const res = await fetch('/api/track', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ movieId: activeMovie.id }),
      });
      const data = await res.json();

      if (data.success) {
        const { result, movie: updatedMovie, alertDispatched } = data;
        setMovies((prev) =>
          prev.map((m) => (m.id === updatedMovie.id ? { ...m, ...updatedMovie } : m))
        );

        if (result.isLive) {
          addLog(`🎉 LIVE! Tickets are AVAILABLE for "${result.movieTitle}" in Karwar!`);
          if (alertDispatched) {
            addLog(`📢 Instant push alert sent to Discord @everyone!`);
          }
          setFeedback({
            type: 'success',
            title: 'TICKETS ARE LIVE!',
            msg: `Found live booking for "${result.movieTitle}". ${
              alertDispatched ? 'Discord webhook alert dispatched!' : 'Already alerted previously.'
            }`,
          });
        } else if (result.isFound) {
          addLog(`ℹ️ "${result.movieTitle}" is listed on BookMyShow Karwar, but booking is not yet live.`);
          setFeedback({
            type: 'info',
            title: 'Movie Listed (Coming Soon)',
            msg: `"${result.movieTitle}" is listed on Karwar pages, but showtimes haven't opened yet.`,
          });
        } else {
          addLog(`ℹ️ "${activeMovie.title}" is not yet listed in Karwar.`);
          setFeedback({
            type: 'warning',
            title: 'Not Yet Listed',
            msg: `"${activeMovie.title}" is not listed on BMS Karwar yet. The automated cron will check every 20 minutes.`,
          });
        }
      } else {
        throw new Error(data.error || 'Tracking check failed');
      }
    } catch (err) {
      addLog(`❌ Error: ${err.message}`);
      setFeedback({
        type: 'error',
        title: 'Check Finished',
        msg: err.message,
      });
    } finally {
      setRunningTrack(false);
    }
  };

  // Run live check for ALL tracked movies in batch
  const handleCheckAllMovies = async () => {
    try {
      setRunningTrack(true);
      setFeedback(null);
      addLog(`Batch checking all ${movies.length} tracked movie(s) on BookMyShow Karwar...`);

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
          addLog(`🎉 LIVE TICKETS DETECTED for: ${liveMovies.map((r) => r.movieTitle).join(', ')}!`);
          setFeedback({
            type: 'success',
            title: 'LIVE TICKETS FOUND!',
            msg: `Tickets are LIVE for: ${liveMovies.map((r) => r.movieTitle).join(', ')}!`,
          });
        } else {
          addLog(`ℹ️ Batch check complete. None of the ${movies.length} movies have live bookings yet.`);
          setFeedback({
            type: 'info',
            title: 'Batch Check Complete',
            msg: `Checked all ${movies.length} movies. The automated cron continues monitoring every 20 minutes.`,
          });
        }
      } else {
        throw new Error(data.error || 'Batch check failed');
      }
    } catch (err) {
      addLog(`❌ Error: ${err.message}`);
      setFeedback({
        type: 'error',
        title: 'Batch Check Failed',
        msg: err.message,
      });
    } finally {
      setRunningTrack(false);
    }
  };

  // Dispatch Discord test alert
  const handleSendTestAlert = async () => {
    try {
      setSendingAlert(true);
      setFeedback(null);
      addLog(`Dispatching test alert for "${activeMovie.title || 'Ramayana'}" to Discord webhook...`);

      const res = await fetch('/api/test-alert', { method: 'POST' });
      const data = await res.json();

      if (data.success) {
        addLog('✅ Discord test webhook delivered successfully (HTTP 204)!');
        setFeedback({
          type: 'success',
          title: 'Discord Test Alert Sent!',
          msg: 'Check your Discord channel. You should see a test embed confirming connectivity.',
        });
      } else {
        throw new Error(data.error || 'Failed to dispatch webhook');
      }
    } catch (err) {
      addLog(`❌ Webhook error: ${err.message}`);
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

  return (
    <main className="min-h-screen text-slate-100 p-4 md:p-8 max-w-6xl mx-auto">
      {/* Top Navbar */}
      <header className="flex flex-col md:flex-row items-start md:items-center justify-between pb-6 border-b border-slate-800 gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-bms-red flex items-center justify-center shadow-lg shadow-bms-red/30">
            <Film className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-xl md:text-2xl font-bold tracking-tight flex items-center gap-2">
              BookMyShow Karwar Tracker
              <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-bms-red/20 text-bms-red border border-bms-red/30">
                MULTI-MOVIE
              </span>
            </h1>
            <p className="text-xs md:text-sm text-slate-400">
              Automated Ticket Monitor for <span className="text-slate-200 font-semibold">{movies.length} Movie{movies.length > 1 ? 's' : ''}</span> in Karwar
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowAddModal(true)}
            className="px-3 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-medium transition-colors border border-emerald-500 text-sm flex items-center gap-1.5 shadow-md shadow-emerald-600/20"
          >
            <Plus className="w-4 h-4" />
            <span>Add Movie</span>
          </button>

          <button
            onClick={fetchMovies}
            disabled={loading}
            className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors border border-slate-700 text-sm flex items-center gap-1.5"
            title="Refresh Status"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            <span className="hidden sm:inline">Refresh</span>
          </button>

          <a
            href="https://github.com/Chethan886/BookMyShow-Tracker"
            target="_blank"
            rel="noopener noreferrer"
            className="px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors border border-slate-700 text-sm flex items-center gap-1.5"
          >
            <GitHubIcon className="w-4 h-4" />
            <span className="hidden sm:inline">GitHub</span>
          </a>

          <a
            href="https://in.bookmyshow.com/explore/movies-karwar"
            target="_blank"
            rel="noopener noreferrer"
            className="px-3 py-2 rounded-lg bg-bms-red hover:bg-rose-600 text-white font-medium transition-colors shadow-md shadow-bms-red/20 text-sm flex items-center gap-1.5"
          >
            <span>BookMyShow</span>
            <ExternalLink className="w-4 h-4" />
          </a>
        </div>
      </header>

      {/* Tracked Movies Selector Bar */}
      <section className="mt-6">
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

      {/* Main Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mt-6">
        {/* Left Column: Live Status & Details (2 Cols) */}
        <div className="lg:col-span-2 space-y-6">
          {/* Hero Status Card for Active Movie */}
          <div className="glass-panel rounded-2xl p-6 relative overflow-hidden border">
            {/* Background Accent Glow */}
            <div
              className={`absolute -right-20 -top-20 w-64 h-64 rounded-full blur-3xl opacity-20 pointer-events-none ${
                isLive ? 'bg-emerald-500' : 'bg-bms-red'
              }`}
            />

            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-5 border-b border-slate-800/80">
              <div className="space-y-1">
                <div className="text-xs uppercase tracking-wider text-slate-400 font-medium">
                  Monitoring Availability
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
                  Region
                </div>
                <div className="text-sm font-bold text-white">Karwar, Karnataka</div>
                <div className="text-[11px] text-slate-400 mt-0.5">Slug: karwar</div>
              </div>

              <div className="p-3.5 rounded-xl bg-slate-900/60 border border-slate-800">
                <div className="text-xs text-slate-400 flex items-center gap-1.5 mb-1">
                  <Radio className="w-3.5 h-3.5 text-indigo-400" />
                  Primary Theater
                </div>
                <div className="text-sm font-bold text-white truncate">Miraj Cinemas</div>
                <div className="text-[11px] text-slate-400 mt-0.5 truncate">Geetanjali, Karwar</div>
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
                  Direct Booking Page
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
              Execute live checks on-demand for <strong>{activeMovie.title}</strong> or check all {movies.length} movies at once.
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
                onClick={handleCheckAllMovies}
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

        {/* Right Column: Realtime Console & Engine Specs */}
        <div className="space-y-6">
          {/* Terminal Logs */}
          <div className="glass-panel rounded-2xl p-5 border flex flex-col h-[340px]">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="text-xs font-semibold uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
                <Terminal className="w-4 h-4 text-emerald-400" />
                Live Activity Log
              </div>
              <span className="text-[10px] text-slate-400 px-1.5 py-0.5 rounded bg-slate-800">
                Realtime
              </span>
            </div>

            <div className="flex-1 overflow-y-auto mt-3 space-y-1.5 font-mono text-[11px] text-slate-300 pr-1">
              {logs.map((log, index) => (
                <div
                  key={index}
                  className={`leading-relaxed ${
                    log.includes('🎉')
                      ? 'text-emerald-400 font-bold'
                      : log.includes('❌')
                      ? 'text-rose-400 font-bold'
                      : log.includes('✅')
                      ? 'text-emerald-300'
                      : 'text-slate-400'
                  }`}
                >
                  {log}
                </div>
              ))}
            </div>
          </div>

          {/* Architecture Card */}
          <div className="glass-panel rounded-2xl p-5 border text-xs space-y-3">
            <div className="font-semibold text-slate-200 flex items-center gap-1.5">
              <Layers className="w-4 h-4 text-indigo-400" />
              Multi-Movie Engine Specs
            </div>

            <ul className="space-y-2 text-slate-400">
              <li className="flex items-start gap-2">
                <span className="text-emerald-400">✓</span>
                <span>
                  <strong className="text-slate-300">Tracking {movies.length} Movie(s):</strong> Batch checked in 1 pass
                </span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-emerald-400">✓</span>
                <span>
                  <strong className="text-slate-300">Page Caching:</strong> Karwar catalog fetched once for all movies
                </span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-emerald-400">✓</span>
                <span>
                  <strong className="text-slate-300">GitHub Actions Cron:</strong> Runs every 20m serverless
                </span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-emerald-400">✓</span>
                <span>
                  <strong className="text-slate-300">Custom Movie Alerts:</strong> Discord ping with exact movie title
                </span>
              </li>
            </ul>
          </div>
        </div>
      </div>

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
              Enter any upcoming movie release to start tracking ticket availability on BookMyShow Karwar.
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
                  Search Keywords / Dub Variations (Optional, comma-separated)
                </label>
                <input
                  type="text"
                  placeholder="e.g. Kantara, Kantara Chapter 1, Kantara 2"
                  value={newKeywords}
                  onChange={(e) => setNewKeywords(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900 border border-slate-700 text-white placeholder-slate-500 text-sm focus:outline-none focus:border-bms-red"
                />
                <span className="text-[11px] text-slate-500 mt-1 block">
                  Leave blank to automatically match the title and common variants.
                </span>
              </div>

              {/* Quick Presets */}
              <div>
                <span className="text-xs font-semibold text-slate-400 block mb-2">
                  Or select a popular upcoming release:
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
