import { useState, useRef } from 'react'

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
  onChangeVote?: (oldId: string, newId: string) => void
  voteCount: (playerId: string) => number
  votedPlayerId?: string | null
}

function Avatar({ url, name, size = 32 }: { url?: string | null; name: string; size?: number }) {
  if (url) return <img src={url} alt={name} style={{ width: size, height: size, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />
  return (
    <div style={{ width: size, height: size, borderRadius: '50%', background: '#8B1A3A', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: size * 0.4, fontWeight: 700, color: '#C9A84C', flexShrink: 0 }}>
      {name.charAt(0).toUpperCase()}
    </div>
  )
}

export default function PlayerCard({ players, onVote, onChangeVote, voteCount, votedPlayerId }: Props) {
  const [index, setIndex] = useState(0)
  const [swipeDir, setSwipeDir] = useState<'left' | 'right' | null>(null)
  const [dragX, setDragX] = useState(0)
  const touchStartX = useRef(0)
  const isDragging = useRef(false)

  if (players.length === 0) return null

  const player = players[index]
  const isVoted = votedPlayerId === player.id
  const hasVotedSomeone = !!votedPlayerId

  function animateAndNext(dir: 'left' | 'right', action: () => void) {
    setSwipeDir(dir)
    setTimeout(() => {
      action()
      setSwipeDir(null)
      setDragX(0)
    }, 300)
  }

  function handleVote() {
    if (isVoted) return
    animateAndNext('right', () => {
      if (hasVotedSomeone && onChangeVote) {
        onChangeVote(votedPlayerId!, player.id)
      } else {
        onVote(player.id)
      }
      setIndex(i => (i + 1) % players.length)
    })
  }

  function handleSkip() {
    animateAndNext('left', () => {
      setIndex(i => (i + 1) % players.length)
    })
  }

  function handleNext() {
    animateAndNext('left', () => {
      setIndex(i => (i + 1) % players.length)
    })
  }

  function handlePrev() {
    animateAndNext('right', () => {
      setIndex(i => (i - 1 + players.length) % players.length)
    })
  }

  function onTouchStart(e: React.TouchEvent) {
    touchStartX.current = e.touches[0].clientX
    isDragging.current = true
  }

  function onTouchMove(e: React.TouchEvent) {
    if (!isDragging.current) return
    const dx = e.touches[0].clientX - touchStartX.current
    setDragX(dx)
  }

  function onTouchEnd() {
    isDragging.current = false
    if (dragX > 80 && !isVoted) {
      handleVote()
    } else if (dragX < -80) {
      handleSkip()
    } else {
      setDragX(0)
    }
  }

  const cardRotation = dragX / 15
  const cardTranslate = swipeDir === 'left'
    ? 'translateX(-130%) rotate(-20deg)'
    : swipeDir === 'right'
    ? 'translateX(130%) rotate(20deg)'
    : `translateX(${dragX}px) rotate(${cardRotation}deg)`

  const showVoteHint = dragX > 40 && !isVoted
  const showSkipHint = dragX < -40

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>

      {hasVotedSomeone && (
        <div style={{ background: 'rgba(201,168,76,0.15)', border: '1px solid #C9A84C', borderRadius: 20, padding: '4px 14px' }}>
          <span style={{ color: '#C9A84C', fontSize: 12, fontWeight: 600 }}>
            &#9733; Votaste a {players.find(p => p.id === votedPlayerId)?.name ?? ''} — podés cambiar tu voto
          </span>
        </div>
      )}

      {/* Indicadores */}
      <div style={{ display: 'flex', gap: 6 }}>
        {players.map((p, i) => (
          <div key={i} onClick={() => setIndex(i)} style={{
            width: i === index ? 20 : 6, height: 6, borderRadius: 3,
            background: p.id === votedPlayerId ? '#C9A84C' : i === index ? '#fff' : '#8B1A3A',
            transition: 'width 0.2s', cursor: 'pointer'
          }} />
        ))}
      </div>

      {/* Tarjeta */}
      <div
        style={{
          position: 'relative',
          width: '100%',
          maxWidth: 340,
          borderRadius: 20,
          overflow: 'hidden',
          boxShadow: isVoted ? '0 0 24px rgba(201,168,76,0.5)' : '0 8px 32px rgba(0,0,0,0.6)',
          border: isVoted ? '2px solid #C9A84C' : '1px solid #8B1A3A',
          transform: cardTranslate,
          transition: swipeDir ? 'transform 0.3s ease-in' : dragX !== 0 ? 'none' : 'transform 0.2s ease-out',
          background: '#1a0a10',
          aspectRatio: '3/4',
          cursor: 'grab',
          userSelect: 'none' as const,
        }}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
      >
        {/* Foto */}
        {player.photo_url ? (
          <img src={player.photo_url} alt={player.name}
            style={{ width: '100%', height: '100%', objectFit: 'cover', position: 'absolute', top: 0, left: 0, pointerEvents: 'none' }} />
        ) : (
          <div style={{ width: '100%', height: '100%', background: 'linear-gradient(135deg, #4A0B1E, #8B1A3A)', display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'absolute', top: 0, left: 0 }}>
            <span style={{ fontSize: 80, fontWeight: 900, color: '#C9A84C', opacity: 0.5 }}>{player.name.charAt(0)}</span>
          </div>
        )}

        {/* Badge votado */}
        {isVoted && (
          <div style={{ position: 'absolute', top: 12, right: 12, background: '#C9A84C', borderRadius: 20, padding: '6px 12px', display: 'flex', alignItems: 'center', gap: 4 }}>
            <span style={{ color: '#4A0B1E', fontSize: 13, fontWeight: 900 }}>&#9733; Tu voto</span>
          </div>
        )}

        {/* Hint votar */}
        {showVoteHint && (
          <div style={{ position: 'absolute', top: 20, left: 20, background: 'rgba(201,168,76,0.9)', borderRadius: 12, padding: '8px 16px', border: '3px solid #C9A84C', transform: 'rotate(-15deg)' }}>
            <span style={{ color: '#4A0B1E', fontWeight: 900, fontSize: 20 }}>VOTO</span>
          </div>
        )}

        {/* Hint pasar */}
        {showSkipHint && (
          <div style={{ position: 'absolute', top: 20, right: 20, background: 'rgba(139,26,58,0.9)', borderRadius: 12, padding: '8px 16px', border: '3px solid #8B1A3A', transform: 'rotate(15deg)' }}>
            <span style={{ color: '#fff', fontWeight: 900, fontSize: 20 }}>PASO</span>
          </div>
        )}

        {/* Info inferior */}
        <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, background: 'linear-gradient(0deg, rgba(0,0,0,0.95) 0%, rgba(0,0,0,0.7) 50%, transparent 100%)', padding: '32px 16px 16px' }}>
          {player.team && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
              <Avatar url={player.team.logo_url} name={player.team.name} size={20} />
              <span style={{ color: '#C9A84C', fontSize: 12, fontWeight: 600, letterSpacing: 1 }}>{player.team.name.toUpperCase()}</span>
            </div>
          )}
          <p style={{ fontSize: 26, fontWeight: 900, color: '#fff', margin: '0 0 6px', lineHeight: 1.1 }}>{player.name}</p>
          <div style={{ display: 'flex', gap: 8, marginBottom: 6, flexWrap: 'wrap' as const }}>
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
            {voteCount(player.id) > 0 && (
              <div style={{ background: 'rgba(201,168,76,0.15)', border: '1px solid #C9A84C', borderRadius: 20, padding: '2px 10px' }}>
                <span style={{ color: '#C9A84C', fontSize: 12, fontWeight: 700 }}>{voteCount(player.id)} votos</span>
              </div>
            )}
          </div>
          {player.bio && <p style={{ color: '#d4a0b0', fontSize: 12, margin: '0 0 4px', fontStyle: 'italic' }}>{player.bio}</p>}
          {player.mares && <p style={{ color: '#888', fontSize: 11, margin: 0 }}>Yeguas: {player.mares}</p>}
        </div>
      </div>

      {/* Botones */}
      <div style={{ display: 'flex', gap: 20, alignItems: 'center' }}>
        <button onClick={handlePrev} style={{
          width: 48, height: 48, borderRadius: '50%',
          background: '#1a0a10', border: '2px solid #8B1A3A',
          color: '#8B1A3A', fontSize: 20, cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>&larr;</button>

        <button onClick={handleSkip} style={{
          width: 56, height: 56, borderRadius: '50%',
          background: '#1a0a10', border: '2px solid #8B1A3A',
          color: '#d4a0b0', fontSize: 22, cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: '0 4px 12px rgba(0,0,0,0.4)'
        }}>&times;</button>

        <button onClick={handleVote} disabled={isVoted} style={{
          width: 72, height: 72, borderRadius: '50%',
          background: isVoted ? 'rgba(201,168,76,0.3)' : 'linear-gradient(135deg, #C9A84C, #a07830)',
          border: isVoted ? '2px solid #C9A84C' : 'none',
          fontSize: 28, cursor: isVoted ? 'default' : 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: '0 4px 20px rgba(201,168,76,0.5)',
          color: '#fff',
        }}>&#9733;</button>

        <button onClick={handleNext} style={{
          width: 56, height: 56, borderRadius: '50%',
          background: '#1a0a10', border: '2px solid #8B1A3A',
          color: '#d4a0b0', fontSize: 22, cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: '0 4px 12px rgba(0,0,0,0.4)'
        }}>&times;</button>

        <button onClick={handleNext} style={{
          width: 48, height: 48, borderRadius: '50%',
          background: '#1a0a10', border: '2px solid #8B1A3A',
          color: '#8B1A3A', fontSize: 20, cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>&rarr;</button>
      </div>

      <p style={{ color: '#d4a0b0', fontSize: 11, margin: 0 }}>Desliza o usa los botones</p>
    </div>
  )
}
