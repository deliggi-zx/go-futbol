export type MatchStatus = 'scheduled' | 'live' | 'finished';

export interface Team {
  id: string;
  name: string;
  logoUrl: string;
}

export interface MatchNode {
  id: string;                 // Ej: "R1-M1" (Ronda 1, Match 1)
  round: number;               // 1..totalRounds derivado de tournament.team_count
  indexInRound: number;        // Posición indexada en esa ronda (0..N-1)
  nextMatchId: string | null;  // Referencia al partido padre en la siguiente ronda
  isThirdPlace: boolean;       // Reemplaza al viejo sentinel de "round mágico" para 3er puesto
  roundLabel: string;          // Nombre de ronda ya resuelto (via knockoutRoundLabel), para no duplicar esa logica acá
  status: MatchStatus;
  date: string;                 // ISO string
  venue?: string;
  homeTeam: Team | null;
  awayTeam: Team | null;
  homeScore?: number;
  awayScore?: number;
  winnerId?: string | null;
}

export interface PositionedMatch extends MatchNode {
  angleDeg: number;
  x: number;
  y: number;
}
