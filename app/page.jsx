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

export default function TrackerDashboard() {
  const [statusData, setStatusData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [runningTrack, setRunningTrack] = useState(false);
  const [sendingAlert, setSendingAlert] = useState(false);
  const [logs, setLogs] = useState([]);
  const [feedback, setFeedback] = useState(null);

  const addLog = (msg) => {
    const time = new Date().toLocaleTimeString();
    setLogs((prev) => [`[${time}] ${msg}`, ...prev.slice(0, 49)]);
  };

  const fetchStatus = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/status');
      const data = await res.json();
      if (data.success) {
        setStatusData(data);
        addLog(`Status refreshed: Current status is ${data.state?.lastStatus || 'READY'}`);
      }
    } catch (err) {
      addLog(`Failed to fetch status: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStatus();
    addLog('System initialized. Ready for manual triggers.');
  }, []);

  const handleManualTrack = async () => {
    try {
      setRunningTrack(true);
      setFeedback(null);
      addLog('Triggering live BookMyShow Karwar scraper...');

      const res = await fetch('/api/track', { method: 'POST' });
      const data = await res.json();

      if (data.success) {
        const { result, state, alertDispatched } = data;
        setStatusData((prev) => ({
          ...prev,
          state: state || prev?.state,
        }));

        if (result.isLive) {
          addLog(`🎉 SUCCESS! Tickets are LIVE for "${result.movieTitle}"!`);
          if (alertDispatched) {
            addLog(`📢 Discord alert sent to @everyone with direct booking link.`);
          }
          setFeedback({
            type: 'success',
            title: 'TICKETS DETECTED LIVE!',
            msg: `Found live booking for "${result.movieTitle}". ${alertDispatched ? 'Discord notification dispatched!' : 'Already previously alerted.'}`,
          });
        } else if (result.isFound) {
          addLog(`ℹ️ "${result.movieTitle}" found on BookMyShow Karwar, but booking is not yet live.`);
          setFeedback({
            type: 'info',
            title: 'Movie Listed (Coming Soon)',
            msg: `"${result.movieTitle}" is visible on Karwar pages, but showtimes/booking haven't opened yet.`,
          });
        } else {
          addLog(`ℹ️ Scraper completed. "Ramayana" is not yet listed in Karwar.`);
          setFeedback({
            type: 'warning',
            title: 'Not Yet Listed',
            msg: 'Ramayana is not listed on BMS Karwar yet. The tracker will continue checking automatically every 20 minutes.',
          });
        }
      } else {
        throw new Error(data.error || 'Tracker execution failed');
      }
    } catch (err) {
      addLog(`❌ Error running tracker: ${err.message}`);
      setFeedback({
        type: 'error',
        title: 'Check Completed with Notice',
        msg: err.message,
      });
    } finally {
      setRunningTrack(false);
    }
  };

  const handleSendTestAlert = async () => {
    try {
      setSendingAlert(true);
      setFeedback(null);
      addLog('Dispatching test alert to Discord webhook...');

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

  const state = statusData?.state || {};
  const isLive = state.lastStatus === 'LIVE';
  const isListed = state.lastStatus === 'LISTED_COMING_SOON';

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
                LIVE
              </span>
            </h1>
            <p className="text-xs md:text-sm text-slate-400">
              Automated Ticket Monitor for <span className="text-slate-200 font-semibold">Ramayana</span>
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={fetchStatus}
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
            <span className="hidden sm:inline">GitHub Repo</span>
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

      {/* Feedback Banner */}
      {feedback && (
        <div
          className={`mt-6 p-4 rounded-xl border flex items-start gap-3 transition-all ${
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
          {/* Hero Status Card */}
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
                  Current Availability Status
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
                {state.lastStatus || 'PENDING'}
              </div>
            </div>

            {/* Target Parameters */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-6">
              <div className="p-3.5 rounded-xl bg-slate-900/60 border border-slate-800">
                <div className="text-xs text-slate-400 flex items-center gap-1.5 mb-1">
                  <Film className="w-3.5 h-3.5 text-bms-red" />
                  Target Movie
                </div>
                <div className="text-sm font-bold text-white">Ramayana</div>
                <div className="text-[11px] text-slate-400 mt-0.5">Part 1 & Dub Variations</div>
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
                  {state.lastCheckTime ? new Date(state.lastCheckTime).toLocaleString() : 'Never'}
                </span>
              </div>

              {state.bookingUrl && (
                <a
                  href={state.bookingUrl}
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
              Execute live checks on-demand or test your Discord webhook directly from this web interface.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <button
                onClick={handleManualTrack}
                disabled={runningTrack}
                className="p-4 rounded-xl bg-gradient-to-r from-bms-red to-rose-600 hover:from-rose-600 hover:to-rose-700 text-white font-semibold flex items-center justify-center gap-2.5 transition-all shadow-lg shadow-bms-red/25 disabled:opacity-50"
              >
                {runningTrack ? (
                  <>
                    <RefreshCw className="w-5 h-5 animate-spin" />
                    <span>Scraping BookMyShow...</span>
                  </>
                ) : (
                  <>
                    <Play className="w-5 h-5 fill-white" />
                    <span>Run Live Check Now</span>
                  </>
                )}
              </button>

              <button
                onClick={handleSendTestAlert}
                disabled={sendingAlert}
                className="p-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold border border-slate-700 flex items-center justify-center gap-2.5 transition-all disabled:opacity-50"
              >
                {sendingAlert ? (
                  <>
                    <RefreshCw className="w-5 h-5 animate-spin text-indigo-400" />
                    <span>Sending Webhook...</span>
                  </>
                ) : (
                  <>
                    <Send className="w-5 h-5 text-indigo-400" />
                    <span>Send Test Discord Alert</span>
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
              Engine Architecture
            </div>

            <ul className="space-y-2 text-slate-400">
              <li className="flex items-start gap-2">
                <span className="text-emerald-400">✓</span>
                <span>
                  <strong className="text-slate-300">GitHub Actions Cron:</strong> Runs every 20m serverless
                </span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-emerald-400">✓</span>
                <span>
                  <strong className="text-slate-300">Next.js SSR Extraction:</strong> Parses <code>__NEXT_DATA__</code> JSON
                </span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-emerald-400">✓</span>
                <span>
                  <strong className="text-slate-300">Discord Rich Embed:</strong> Push alert with <code>@everyone</code>
                </span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-emerald-400">✓</span>
                <span>
                  <strong className="text-slate-300">Deduplication State:</strong> Persists in <code>state.json</code>
                </span>
              </li>
            </ul>
          </div>
        </div>
      </div>
    </main>
  );
}

