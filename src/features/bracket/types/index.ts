export type MatchStatus = 'scheduled' | 'live' | 'finished';

export interface Team {
  id: string;
  name: string;
  flagUrl: string;
}

export interface MatchNode {
  id: string;                 // Ej: "R1-M1" (Ronda 1, Match 1)
  round: number;               // 1=16avos ... 5=Final, 6=Tercer puesto (especial)
  indexInRound: number;        // Posición indexada en esa ronda (0..N-1)
  nextMatchId: string | null;  // Referencia al partido padre en la siguiente ronda
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
