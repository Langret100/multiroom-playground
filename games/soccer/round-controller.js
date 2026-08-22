(function(global){
  'use strict';

  const PHASE_ORDER = Object.freeze({ idle:0, quiz:1, result:2, countdown:3, playing:4, goal:5, over:6 });
  const VALID_PHASES = new Set(Object.keys(PHASE_ORDER));

  function toFinite(value, fallback=0){
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
  }

  function normalizeSnapshot(raw, fallbackRemainingMs=0){
    const source = raw && typeof raw === 'object' ? raw : {};
    const phase = VALID_PHASES.has(String(source.phase||'')) ? String(source.phase) : 'idle';
    return {
      phase,
      roundId: String(source.roundId||''),
      roundSerial: Math.max(0, Math.floor(toFinite(source.roundSerial, 0))),
      kind: source.kind === 'restart' ? 'restart' : 'initial',
      seed: Math.floor(toFinite(source.seed, 1)) || 1,
      beginsAt: toFinite(source.beginsAt, 0),
      endsAt: toFinite(source.endsAt, 0),
      resultUntil: toFinite(source.resultUntil, 0),
      kickoffAt: toFinite(source.kickoffAt, 0),
      kickoffOwnerSid: String(source.kickoffOwnerSid||''),
      winner: source.winner === 'A' || source.winner === 'B' ? source.winner : '',
      tied: !!source.tied,
      roundScoreA: Math.max(0, toFinite(source.roundScoreA, 0)),
      roundScoreB: Math.max(0, toFinite(source.roundScoreB, 0)),
      scoreA: Math.max(0, toFinite(source.scoreA, 0)),
      scoreB: Math.max(0, toFinite(source.scoreB, 0)),
      selfRoundScore: Math.max(0, toFinite(source.selfRoundScore, 0)),
      remainingMs: Math.max(0, toFinite(source.remainingMs, fallbackRemainingMs)),
      serverNow: toFinite(source.serverNow, 0)
    };
  }

  class SoccerRoundController {
    constructor(){
      this.current = normalizeSnapshot(null, 0);
      this.hasSnapshot = false;
    }

    reset(){
      this.current = normalizeSnapshot(null, 0);
      this.hasSnapshot = false;
    }

    accept(raw, fallbackRemainingMs=0){
      const next = normalizeSnapshot(raw, fallbackRemainingMs);
      const prev = this.current;
      if(this.hasSnapshot){
        if(next.roundSerial < prev.roundSerial){
          return { accepted:false, reason:'stale_round', prev, next };
        }
        if(next.roundSerial === prev.roundSerial){
          const sameRound = next.roundId === prev.roundId;
          const prevRank = PHASE_ORDER[prev.phase] ?? 0;
          const nextRank = PHASE_ORDER[next.phase] ?? 0;
          if(sameRound && nextRank < prevRank){
            return { accepted:false, reason:'stale_phase', prev, next };
          }
        }
      }

      const first = !this.hasSnapshot;
      const roundChanged = first || next.roundSerial !== prev.roundSerial || next.roundId !== prev.roundId;
      const phaseChanged = first || roundChanged || next.phase !== prev.phase;
      const ownerChanged = !first && !roundChanged && next.kickoffOwnerSid !== prev.kickoffOwnerSid;
      const kickoffTimeChanged = !first && !roundChanged && Math.abs(next.kickoffAt - prev.kickoffAt) > 80;
      this.current = next;
      this.hasSnapshot = true;
      return { accepted:true, first, prev, next, roundChanged, phaseChanged, ownerChanged, kickoffTimeChanged };
    }
  }

  global.SoccerRoundCore = Object.freeze({ PHASE_ORDER, normalizeSnapshot, SoccerRoundController });
})(typeof window !== 'undefined' ? window : globalThis);
