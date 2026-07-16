/**
 * THE BOLT — extended now-playing contract.
 *
 * The Bolt's page shows more than the network dock needs: album/year, an elapsed bar, a
 * listener count, a just-played list, and a signed token that authorises a SongRank against
 * the track actually on air. All of that extends @clubfm/player's base snapshot — the dock
 * still only reads title/artist/art, so it stays station-agnostic.
 */
import type { NowPlaying, StationSnapshot, Track } from '@clubfm/player/types';

export type { Track } from '@clubfm/player/types';

export interface BoltNowPlaying extends NowPlaying {
  album?: string;
  year?: number;
}

/**
 * HMAC-signed authorisation for a single rank. The now-playing payload carries it; the rank
 * POST must echo it, so a rank can only be cast against the track on air, and only until it
 * expires. Signed server-side with RANK_SECRET; never trust the client's copy without
 * re-verifying the signature.
 */
export interface RankNonce {
  /** Stable hash of the current track (artist|title). */
  trackKey: string;
  /** Unix seconds after which this nonce is dead. */
  exp: number;
  /** base64url HMAC-SHA256 over `${trackKey}.${exp}`. */
  sig: string;
}

export interface BoltSnapshot extends StationSnapshot {
  nowPlaying: BoltNowPlaying | null;
  /** Concurrent listeners, if the backend reports it. */
  listeners?: number;
  /** Rank authorisation for the current track. Null when unknown/degraded. */
  nonce?: RankNonce | null;
}

/** `recent` IS the just-played history; this alias keeps call sites readable. */
export type HistoryTrack = Track;
