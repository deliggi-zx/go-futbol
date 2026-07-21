import * as XLSX from 'xlsx'

export type ExcelPlayer = { name: string; photo: File | null; video: File | null; numero: number; goles: number; titular: string; bio: string }
export type ExcelTeam = { name: string; group: string; logo: File | null; players: ExcelPlayer[] }

export function downloadTeamsTemplate() {
  const data = [
    { grupo: 'A', equipo: 'Tribu Fútbol', jugador: 'Juan Pérez', numero: 1, goles: 0, titular: 'S', reseña: 'Arquero seguro' },
    { grupo: 'A', equipo: 'Tribu Fútbol', jugador: 'Pedro García', numero: 2, goles: 0, titular: 'S', reseña: '' },
    { grupo: 'B', equipo: 'La Dolfina', jugador: 'Carlos López', numero: 3, goles: 0, titular: 'N', reseña: '' },
  ]
  const ws = XLSX.utils.json_to_sheet(data)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Equipos')
  XLSX.writeFile(wb, 'plantilla_gofutbol.xlsx')
}

// Agrupa las filas de la planilla por equipo. La columna "grupo" es opcional
// para quien la usa desde un partido individual (no tiene fase de grupos).
export function parseTeamsExcel(file: File): Promise<ExcelTeam[]> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer)
        const workbook = XLSX.read(data, { type: 'array' })
        const sheet = workbook.Sheets[workbook.SheetNames[0]]
        const rows: any[] = XLSX.utils.sheet_to_json(sheet)

        const teamsMap: Record<string, ExcelTeam> = {}
        for (const row of rows) {
          const teamName = String(row.equipo ?? '').trim()
          if (!teamName) continue
          if (!teamsMap[teamName]) {
            teamsMap[teamName] = { name: teamName, group: String(row.grupo ?? 'A').trim().toUpperCase(), logo: null, players: [] }
          }
          const playerName = String(row.jugador ?? '').trim()
          if (playerName) {
            teamsMap[teamName].players.push({
              name: playerName,
              photo: null,
              video: null,
              numero: Number(row.numero ?? 0),
              goles: Number(row.goles ?? 0),
              titular: String(row.titular ?? 'S').trim().toUpperCase(),
              bio: String(row.reseña ?? ''),
            })
          }
        }

        resolve(Object.values(teamsMap))
      } catch (err) {
        reject(err)
      }
    }
    reader.onerror = () => reject(reader.error)
    reader.readAsArrayBuffer(file)
  })
}
