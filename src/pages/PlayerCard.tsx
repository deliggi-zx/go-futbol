import { useState } from 'react'

type Player = {
  id: string
  name: string
  photo_url?: string | null
  handicap?: number
  position?: number
  bio?: string
  mares?: string
  team?: { name: string; logo_url?: string | null }
}

type Props = {
  players: Player[]
  onVote: (playerId: string) => void
  onSkip?: () => void
  voteCount: (playerId: string) => number
}

function Avatar({ url, name, size = 32 }: { url?: string | null; name: string; size?: number }) {
  if (url) return <img src={url} alt={name} style={{ width: size, height: size, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />
  return (
    <div style={{ width: size, height: size, borderRadius: '50%', background: '#8B1A3A', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: size * 0.4, fontWeight: 700, color: '#C9A84C', flexShrink: 0 }}>
      {name.charAt(0).toUpperCase()}
    </div>
  )
}

export default function PlayerCard({ players, onVote, voteCount }: Props) {
  const [index, setIndex] = useState(0)
  const [swipeDir, setSwipeDir] = useState<'left' | 'right' | null>(null)
  const [voted, setVoted] = useState(false)

  if (players.length === 0) return null

  const player = players[index]

  function handleVote() {
    setSwipeDir('right')
    setTimeout(() => {
      onVote(player.id)
      setVoted(true)
      setSwipeDir(null)
    }, 350)
  }

  function handleSkip() {
    setSwipeDir('left')
    setTimeout(() => {
      setIndex(i => (i + 1) % players.length)
      setSwipeDir(null)
    }, 350)
  }

  if (voted) return null

  const cardStyle: React.CSSProperties = {
    position: 'relative',
    width: '100%',
    maxWidth: 360,
    margin: '0 auto',
    borderRadius: 20,
    overflow: 'hidden',
    boxShadow: '0 8px 32px rgba(0,0,0,0.6)',
    border: '1px solid #8B1A3A',
    transform: swipeDir === 'left' ? 'translateX(-120%) rotate(-15deg)' : swipeDir === 'right' ? 'translateX(120%) rotate(15deg)' : 'translateX(0)',
    transition: swipeDir ? 'transform 0.35s ease-in' : 'transform 0.2s ease-out',
    background: '#1a0a10',
    aspectRatio: '3/4',
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
      {/* Indicador de jugadores */}
      <div style={{ display: 'flex', gap: 6 }}>
        {players.map((_, i) => (
          <div key={i} style={{ width: i === index ? 20 : 6, height: 6, borderRadius: 3, background: i === index ? '#C9A84C' : '#8B1A3A', transition: 'width 0.2s' }} />
        ))}
      </div>

      {/* Tarjeta */}
      <div style={cardStyle}>
        {/* Foto */}
        {player.photo_url ? (
          <img src={player.photo_url} alt={player.name} style={{ width: '100%', height: '100%', objectFit: 'cover', position: 'absolute', top: 0, left: 0 }} />
        ) : (
          <div style={{ width: '100%', height: '100%', background: 'linear-gradient(135deg, #4A0B1E, #8B1A3A)', display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'absolute', top: 0, left: 0 }}>
            <span style={{ fontSize: 80, fontWeight: 900, color: '#C9A84C', opacity: 0.5 }}>{player.name.charAt(0)}</span>
          </div>
        )}

        {/* Gradiente inferior */}
        <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, background: 'linear-gradient(0deg, rgba(0,0,0,0.95) 0%, rgba(0,0,0,0.7) 50%, transparent 100%)', padding: '32px 16px 16px' }}>
          {/* Equipo */}
          {player.team && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
              <Avatar url={player.team.logo_url} name={player.team.name} size={20} />
              <span style={{ color: '#C9A84C', fontSize: 12, fontWeight: 600, letterSpacing: 1 }}>{player.team.name.toUpperCase()}</span>
            </div>
          )}

          {/* Nombre */}
          <p style={{ fontSize: 28, fontWeight: 900, color: '#fff', margin: '0 0 6px', lineHeight: 1.1, textShadow: '0 2px 8px rgba(0,0,0,0.8)' }}>{player.name}</p>

          {/* Datos */}
          <div style={{ display: 'flex', gap: 12, marginBottom: 8 }}>
            {player.handicap !== undefined && player.handicap > 0 && (
              <div style={{ background: 'rgba(201,168,76,0.2)', border: '1px solid #C9A84C', borderRadius: 20, padding: '2px 10px' }}>
                <span style={{ color: '#C9A84C', fontSize: 12, fontWeight: 700 }}>Hcp {player.handicap}</span>
              </div>
            )}
            {player.position !== undefined && player.position > 0 && (
              <div style={{ background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)', borderRadius: 20, padding: '2px 10px' }}>
                <span style={{ color: '#fff', fontSize: 12, fontWeight: 700 }}>N{player.position}</span>
              </div>
            )}
          </div>

          {player.bio && (
            <p style={{ color: '#d4a0b0', fontSize: 13, margin: '0 0 4px', fontStyle: 'italic', lineHeight: 1.3 }}>{player.bio}</p>
          )}
          {player.mares && (
            <p style={{ color: '#888', fontSize: 12, margin: 0 }}>Yeguas: {player.mares}</p>
          )}
        </div>

        {/* Badge de votos */}
        {voteCount(player.id) > 0 && (
          <div style={{ position: 'absolute', top: 12, right: 12, background: '#C9A84C', borderRadius: 20, padding: '4px 10px' }}>
            <span style={{ color: '#4A0B1E', fontSize: 12, fontWeight: 700 }}>{voteCount(player.id)} votos</span>
          </div>
        )}
      </div>

      {/* Botones */}
      <div style={{ display: 'flex', gap: 24, alignItems: 'center' }}>
        <button onClick={handleSkip} style={{
          width: 56, height: 56, borderRadius: '50%',
          background: '#1a0a10', border: '2px solid #8B1A3A',
          color: '#8B1A3A', fontSize: 24, cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: '0 4px 12px rgba(0,0,0,0.4)'
        }}>
          {index === players.length - 1 ? '\u21BA' : '\u2715'}
        </button>
        <button onClick={handleVote} style={{
          width: 72, height: 72, borderRadius: '50%',
          background: 'linear-gradient(135deg, #C9A84C, #a07830)',
          border: 'none',
          color: '#fff', fontSize: 32, cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: '0 4px 20px rgba(201,168,76,0.5)'
        }}>
          \u2605
        </button>
        <button onClick={() => setIndex(i => (i + 1) % players.length)} style={{
          width: 56, height: 56, borderRadius: '50%',
          background: '#1a0a10', border: '2px solid #8B1A3A',
          color: '#8B1A3A', fontSize: 24, cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: '0 4px 12px rgba(0,0,0,0.4)'
        }}>
          \u2192
        </button>
      </div>
      <p style={{ color: '#d4a0b0', fontSize: 12 }}>Desliza o usa los botones</p>
    </div>
  )
}
