/**
 * THE BOLT — this station's now-playing feed.
 *
 * @clubfm/player keys feeds by station code. The dock (tuned to THE BOLT by default) and every
 * on-page consumer ask for the same code + endpoint, so they share one poll loop. On-page
 * consumers always follow THE BOLT's feed, whatever the dock happens to be tuned to.
 */
import { nowPlayingFeed, tune } from '@clubfm/player';
import { station } from '../config/station';

export const boltFeed = nowPlayingFeed(station.code, { api: station.nowPlaying.api });

/** Ask the dock to play THE BOLT (re-tunes it if it's on another station, else toggles). */
export function tuneBolt(): void {
  tune({
    code: station.code,
    name: station.name,
    stream: station.stream.primary,
    streamFallback: station.stream.fallback,
    api: station.nowPlaying.api,
    pollMs: station.nowPlaying.pollMs,
    idleTitle: 'Vegas rock radio',
    idleArtist: station.name,
    accent: station.accent,
    onAccent: '#FFFFFF',
  });
}
