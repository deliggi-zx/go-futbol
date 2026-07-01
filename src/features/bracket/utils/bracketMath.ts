import type { MatchNode, PositionedMatch } from '../types';

export const ROUND_NAMES: Record<number, string> = {
  1: '16avos',
  2: 'Octavos',
  3: 'Cuartos',
  4: 'Semifinal',
  5: 'Final',
  6: '3er Puesto',
};

export const THIRD_PLACE_ROUND = 6;

/**
 * Ángulo (en grados) de un nodo de Ronda 1 mediante distribución equitativa
 * en 360°, arrancando en la parte superior (-90°) y avanzando en sentido horario.
 * Esta es la ÚNICA ronda donde el ángulo puede calcularse de forma puramente
 * local (round, indexInRound, totalNodesInRound) sin mirar otros nodos.
 */
export function getNodeAngle(
  _round: number,
  indexInRound: number,
  totalNodesInRound: number
): number {
  const step = 360 / totalNodesInRound;
  return -90 + (indexInRound + 0.5) * step;
}

/** Normaliza una diferencia angular al rango (-180, 180] para promediar sin saltos en el cruce 0°/360°. */
function shortestAngleDiff(a1: number, a2: number): number {
  let diff = (a2 - a1) % 360;
  if (diff > 180) diff -= 360;
  if (diff < -180) diff += 360;
  return diff;
}

/**
 * Calcula los ángulos de TODAS las rondas, propagando desde la Ronda 1 hacia
 * adentro. Cada padre (Ronda R+1) toma la bisectriz angular exacta de sus dos
 * hijos (Ronda R), garantizando que las líneas conectoras nunca queden
 * desalineadas. El partido de 3er puesto (round 6) se excluye de este árbol
 * y recibe un ángulo fijo aparte (ver computeThirdPlaceAngle).
 */
export function computeAngles(matches: MatchNode[]): Map<string, number> {
  const angles = new Map<string, number>();
  const byRound = new Map<number, MatchNode[]>();

  for (const m of matches) {
    if (m.round === THIRD_PLACE_ROUND) continue;
    const arr = byRound.get(m.round) ?? [];
    arr.push(m);
    byRound.set(m.round, arr);
  }

  const round1 = (byRound.get(1) ?? []).slice().sort((a, b) => a.indexInRound - b.indexInRound);
  round1.forEach((m) => {
    angles.set(m.id, getNodeAngle(1, m.indexInRound, round1.length));
  });

  const maxRound = Math.max(...Array.from(byRound.keys()));
  for (let round = 2; round <= maxRound; round++) {
    const nodes = (byRound.get(round) ?? []).slice().sort((a, b) => a.indexInRound - b.indexInRound);
    for (const parent of nodes) {
      const children = matches.filter((m) => m.nextMatchId === parent.id);
      if (children.length === 2) {
        const a1 = angles.get(children[0].id);
        const a2 = angles.get(children[1].id);
        if (a1 !== undefined && a2 !== undefined) {
          const diff = shortestAngleDiff(a1, a2);
          angles.set(parent.id, a1 + diff / 2);
        }
      } else if (children.length === 1) {
        angles.set(parent.id, angles.get(children[0].id) ?? 0);
      }
    }
  }

  return angles;
}

/** Posición fija del partido por el 3er puesto: opuesto a la Final (180°), en su propio radio. */
export function computeThirdPlaceAngle(finalAngle: number): number {
  return finalAngle + 180;
}

export interface RadiusConfig {
  baseRadius: number;
  roundSpacing: number;
}

export function getRadius(round: number, { baseRadius, roundSpacing }: RadiusConfig): number {
  if (round === THIRD_PLACE_ROUND) {
    // Vive a la altura de semifinales, desplazado angularmente (ver computeThirdPlaceAngle)
    return baseRadius - (4 - 1) * roundSpacing;
  }
  return baseRadius - (round - 1) * roundSpacing;
}

export function polarToCartesian(
  centerX: number,
  centerY: number,
  radius: number,
  angleDeg: number
): { x: number; y: number } {
  const rad = (angleDeg * Math.PI) / 180;
  return {
    x: centerX + radius * Math.cos(rad),
    y: centerY + radius * Math.sin(rad),
  };
}

/**
 * Posiciona todos los nodos (cartesianas) a partir de los ángulos calculados.
 * Memoizar el resultado de esta función en el componente: no debe recalcularse
 * en cada frame de rotación, solo cuando cambian los datos o el tamaño del lienzo.
 */
export function layoutMatches(
  matches: MatchNode[],
  size: number,
  radiusConfig: RadiusConfig
): PositionedMatch[] {
  const center = size / 2;
  const angles = computeAngles(matches);

  const finalMatch = matches.find((m) => m.round === 5);
  const finalAngle = finalMatch ? angles.get(finalMatch.id) ?? -90 : -90;

  return matches.map((m) => {
    const angleDeg =
      m.round === THIRD_PLACE_ROUND
        ? computeThirdPlaceAngle(finalAngle)
        : angles.get(m.id) ?? 0;
    const radius = getRadius(m.round, radiusConfig);
    const { x, y } = polarToCartesian(center, center, radius, angleDeg);
    return { ...m, angleDeg, x, y };
  });
}

/** Path de Bezier suave entre un hijo y su padre (curva radial). */
export function buildConnectorPath(child: PositionedMatch, parent: PositionedMatch): string {
  const mx = (child.x + parent.x) / 2;
  const my = (child.y + parent.y) / 2;
  return `M ${child.x} ${child.y} Q ${mx} ${my} ${parent.x} ${parent.y}`;
}

export interface ConnectorLine {
  id: string;
  d: string;
  highlighted: boolean;
}

/**
 * Genera todas las líneas conectoras (memoizar junto con layoutMatches).
 * Una línea se "ilumina" (camino del ganador) si el hijo tiene winnerId definido.
 */
export function buildConnectors(positioned: PositionedMatch[]): ConnectorLine[] {
  const byId = new Map(positioned.map((m) => [m.id, m]));
  const lines: ConnectorLine[] = [];

  for (const m of positioned) {
    if (!m.nextMatchId) continue;
    const parent = byId.get(m.nextMatchId);
    if (!parent) continue;
    lines.push({
      id: `${m.id}->${parent.id}`,
      d: buildConnectorPath(m, parent),
      highlighted: Boolean(m.winnerId),
    });
  }

  return lines;
}
