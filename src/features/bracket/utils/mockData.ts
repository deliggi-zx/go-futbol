import type { MatchNode, Team } from '../types';

const TEAMS: Team[] = [
  { id: 'ARG', name: 'Argentina', flagUrl: 'https://flagcdn.com/w160/ar.png' },
  { id: 'BRA', name: 'Brasil', flagUrl: 'https://flagcdn.com/w160/br.png' },
  { id: 'FRA', name: 'Francia', flagUrl: 'https://flagcdn.com/w160/fr.png' },
  { id: 'ESP', name: 'España', flagUrl: 'https://flagcdn.com/w160/es.png' },
  { id: 'GER', name: 'Alemania', flagUrl: 'https://flagcdn.com/w160/de.png' },
  { id: 'ENG', name: 'Inglaterra', flagUrl: 'https://flagcdn.com/w160/gb-eng.png' },
  { id: 'POR', name: 'Portugal', flagUrl: 'https://flagcdn.com/w160/pt.png' },
  { id: 'NED', name: 'Países Bajos', flagUrl: 'https://flagcdn.com/w160/nl.png' },
  { id: 'ITA', name: 'Italia', flagUrl: 'https://flagcdn.com/w160/it.png' },
  { id: 'URU', name: 'Uruguay', flagUrl: 'https://flagcdn.com/w160/uy.png' },
  { id: 'CRO', name: 'Croacia', flagUrl: 'https://flagcdn.com/w160/hr.png' },
  { id: 'BEL', name: 'Bélgica', flagUrl: 'https://flagcdn.com/w160/be.png' },
  { id: 'USA', name: 'Estados Unidos', flagUrl: 'https://flagcdn.com/w160/us.png' },
  { id: 'MEX', name: 'México', flagUrl: 'https://flagcdn.com/w160/mx.png' },
  { id: 'JPN', name: 'Japón', flagUrl: 'https://flagcdn.com/w160/jp.png' },
  { id: 'MAR', name: 'Marruecos', flagUrl: 'https://flagcdn.com/w160/ma.png' },
  { id: 'COL', name: 'Colombia', flagUrl: 'https://flagcdn.com/w160/co.png' },
  { id: 'SEN', name: 'Senegal', flagUrl: 'https://flagcdn.com/w160/sn.png' },
  { id: 'SUI', name: 'Suiza', flagUrl: 'https://flagcdn.com/w160/ch.png' },
  { id: 'KOR', name: 'Corea del Sur', flagUrl: 'https://flagcdn.com/w160/kr.png' },
  { id: 'AUS', name: 'Australia', flagUrl: 'https://flagcdn.com/w160/au.png' },
  { id: 'CAN', name: 'Canadá', flagUrl: 'https://flagcdn.com/w160/ca.png' },
  { id: 'DEN', name: 'Dinamarca', flagUrl: 'https://flagcdn.com/w160/dk.png' },
  { id: 'POL', name: 'Polonia', flagUrl: 'https://flagcdn.com/w160/pl.png' },
  { id: 'SRB', name: 'Serbia', flagUrl: 'https://flagcdn.com/w160/rs.png' },
  { id: 'TUN', name: 'Túnez', flagUrl: 'https://flagcdn.com/w160/tn.png' },
  { id: 'GHA', name: 'Ghana', flagUrl: 'https://flagcdn.com/w160/gh.png' },
  { id: 'CMR', name: 'Camerún', flagUrl: 'https://flagcdn.com/w160/cm.png' },
  { id: 'ECU', name: 'Ecuador', flagUrl: 'https://flagcdn.com/w160/ec.png' },
  { id: 'CRC', name: 'Costa Rica', flagUrl: 'https://flagcdn.com/w160/cr.png' },
  { id: 'QAT', name: 'Catar', flagUrl: 'https://flagcdn.com/w160/qa.png' },
  { id: 'SAU', name: 'Arabia Saudita', flagUrl: 'https://flagcdn.com/w160/sa.png' },
];

const VENUES = [
  'Estadio Monumental, Buenos Aires',
  'Maracaná, Río de Janeiro',
  'Santiago Bernabéu, Madrid',
  'Wembley, Londres',
  'Allianz Arena, Múnich',
  'Lusail Stadium, Catar',
];

function addDays(base: Date, days: number): string {
  const d = new Date(base);
  d.setDate(d.getDate() + days);
  return d.toISOString();
}

/**
 * Genera el bracket completo (16avos -> Final) con estructura coherente de
 * nextMatchId, más el partido extra de 3er puesto (round 6, fuera del árbol).
 * Deja resultados ya jugados desde 16avos hasta semis (para poder mostrar el
 * camino del ganador iluminado), un partido en vivo y el resto programado.
 */
export function generateMockBracket(): MatchNode[] {
  const matches: MatchNode[] = [];
  const today = new Date('2026-06-20T00:00:00Z');

  const roundSizes: Record<number, number> = { 1: 16, 2: 8, 3: 4, 4: 2, 5: 1 };

  for (let round = 1; round <= 5; round++) {
    const count = roundSizes[round];
    for (let i = 0; i < count; i++) {
      const nextIndex = Math.floor(i / 2);
      const nextRound = round + 1;
      matches.push({
        id: `R${round}-M${i + 1}`,
        round,
        indexInRound: i,
        nextMatchId: round < 5 ? `R${nextRound}-M${nextIndex + 1}` : null,
        status: 'scheduled',
        date: addDays(today, round * 4),
        venue: VENUES[i % VENUES.length],
        homeTeam: null,
        awayTeam: null,
      });
    }
  }

  // Asigna los 32 equipos a la Ronda 1
  const round1 = matches.filter((m) => m.round === 1);
  round1.forEach((m, idx) => {
    m.homeTeam = TEAMS[idx * 2];
    m.awayTeam = TEAMS[idx * 2 + 1];
  });

  // Simula resultados ya jugados de R1 a R3 (cuartos), para poblar el camino del ganador
  function simulateRound(round: number) {
    const roundMatches = matches.filter((m) => m.round === round);
    for (const m of roundMatches) {
      if (!m.homeTeam || !m.awayTeam) continue;
      const homeScore = (m.indexInRound % 3) + 1;
      const awayScore = (m.indexInRound % 2) === 0 ? homeScore - 1 : homeScore + 1;
      const finalHomeScore = Math.max(0, homeScore);
      const finalAwayScore = Math.max(0, awayScore);
      m.status = 'finished';
      m.homeScore = finalHomeScore;
      m.awayScore = finalAwayScore;
      const winner = finalHomeScore >= finalAwayScore ? m.homeTeam : m.awayTeam;
      m.winnerId = winner.id;

      if (m.nextMatchId) {
        const next = matches.find((x) => x.id === m.nextMatchId)!;
        if (next.indexInRound * 2 === m.indexInRound) {
          next.homeTeam = winner;
        } else {
          next.awayTeam = winner;
        }
      }
    }
  }

  simulateRound(1);
  simulateRound(2);
  simulateRound(3); // Cuartos jugados -> alimenta Semifinal

  // Una semifinal en vivo, la otra programada (con equipos ya definidos por cuartos)
  const semis = matches.filter((m) => m.round === 4);
  if (semis[0]) {
    semis[0].status = 'live';
    semis[0].homeScore = 1;
    semis[0].awayScore = 1;
    semis[0].date = today.toISOString();
    semis[0].venue = VENUES[0];
  }
  if (semis[1]) {
    semis[1].status = 'scheduled';
    semis[1].venue = VENUES[1];
  }

  // Partido por el 3er puesto (fuera del árbol principal)
  matches.push({
    id: 'R6-M1',
    round: 6,
    indexInRound: 0,
    nextMatchId: null,
    status: 'scheduled',
    date: addDays(today, 18),
    venue: VENUES[2],
    homeTeam: null, // se completa con los perdedores de semifinal cuando se jueguen
    awayTeam: null,
  });

  return matches;
}

export const mockMatches: MatchNode[] = generateMockBracket();
