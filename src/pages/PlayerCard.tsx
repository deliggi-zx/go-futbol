import { useState, useRef } from 'react'

type Player = {
  id: string
  name: string
  photo_url?: string | null
  handicap?: number
  position?: number
  bio?: string
  team?: { name: string; logo_url?: string | null }
}

type Props = {
  players: Player[]
  onVote: (playerId: string) => void
  onChangeVote?: (oldId: string, newId: string) => void
  voteCount: (playerId: string) => number
  votedPlayerId?: string | null
}

const TEAM_COLORS = [
  ['#1565C0', '#0D47A1'],
  ['#B71C1C', '#7F0000'],
  ['#1B5E20', '#004D00'],
  ['#4A148C', '#2D0060'],
  ['#E65100', '#BF360C'],
  ['#006064', '#004D51'],
  ['#880E4F', '#560027'],
  ['#33691E', '#1B4500'],
]

function getTeamColors(teamName: string): string[] {
  let hash = 0
  for (let i = 0; i < teamName.length; i++) hash = teamName.charCodeAt(i) + ((hash << 5) - hash)
  return TEAM_COLORS[Math.abs(hash) % TEAM_COLORS.length]
}

function Avatar({ url, name, size = 32 }: { url?: string | null; name: string; size?: number }) {
  if (url) return <img src={url} alt={name} style={{ width: size, height: size, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />
  return (
    <div style={{ width: size, height: size, borderRadius: '50%', background: '#1A6B35', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: size * 0.4, fontWeight: 700, color: '#C9A84C', flexShrink: 0 }}>
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
  const teamColors = player.team ? getTeamColors(player.team.name) : ['#0A3D1F', '#062B14']

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
    animateAndNext('left', () => setIndex(i => (i + 1) % players.length))
  }

  function handleNext() {
    animateAndNext('left', () => setIndex(i => (i + 1) % players.length))
  }

  function handlePrev() {
    animateAndNext('right', () => setIndex(i => (i - 1 + players.length) % players.length))
  }

  function onTouchStart(e: React.TouchEvent) {
    touchStartX.current = e.touches[0].clientX
    isDragging.current = true
  }

  function onTouchMove(e: React.TouchEvent) {
    if (!isDragging.current) return
    setDragX(e.touches[0].clientX - touchStartX.current)
  }

  function onTouchEnd() {
    isDragging.current = false
    if (dragX > 80 && !isVoted) handleVote()
    else if (dragX < -80) handleSkip()
    else setDragX(0)
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
            ★ Votaste a {players.find(p => p.id === votedPlayerId)?.name ?? ''} — podés cambiar tu voto
          </span>
        </div>
      )}

      {/* Indicadores */}
      <div style={{ display: 'flex', gap: 6 }}>
        {players.map((p, i) => (
          <div key={i} onClick={() => setIndex(i)} style={{
            width: i === index ? 20 : 6, height: 6, borderRadius: 3,
            background: p.id === votedPlayerId ? '#C9A84C' : i === index ? '#fff' : '#1A6B35',
            transition: 'width 0.2s', cursor: 'pointer'
          }} />
        ))}
      </div>

      {/* Tarjeta estilo figurita */}
      <div
        style={{
          position: 'relative',
          width: '100%',
          maxWidth: 300,
          borderRadius: 16,
          overflow: 'hidden',
          boxShadow: isVoted
            ? '0 0 0 3px #C9A84C, 0 12px 40px rgba(201,168,76,0.4)'
            : '0 8px 32px rgba(0,0,0,0.7), 0 0 0 1px rgba(255,255,255,0.1)',
          transform: cardTranslate,
          transition: swipeDir ? 'transform 0.3s ease-in' : dragX !== 0 ? 'none' : 'transform 0.2s ease-out',
          cursor: 'grab',
          userSelect: 'none' as const,
          aspectRatio: '2/3',
          background: `linear-gradient(160deg, ${teamColors[0]}, ${teamColors[1]})`,
        }}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
      >
        {/* Textura de papel */}
        <div style={{
          position: 'absolute', inset: 0, zIndex: 0,
          backgroundImage: `repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(255,255,255,0.015) 2px, rgba(255,255,255,0.015) 4px)`,
          pointerEvents: 'none',
        }} />

        {/* Franja superior — nombre torneo */}
        <div style={{
          position: 'relative', zIndex: 1,
          background: 'rgba(0,0,0,0.5)',
          padding: '6px 12px',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        }}>
          <span style={{ color: '#C9A84C', fontSize: 10, fontWeight: 900, letterSpacing: 2, textTransform: 'uppercase' as const, fontFamily: 'Georgia, serif' }}>
            GO FÚTBOL
          </span>
          {player.position !== undefined && player.position > 0 && (
            <span style={{ color: '#fff', fontSize: 10, fontWeight: 700, background: 'rgba(201,168,76,0.3)', borderRadius: 10, padding: '1px 8px', border: '1px solid #C9A84C' }}>
              #{player.position}
            </span>
          )}
        </div>

        {/* Foto del jugador */}
        <div style={{ position: 'relative', zIndex: 1, width: '100%', height: '52%', overflow: 'hidden' }}>
          {player.photo_url ? (
            <img src={player.photo_url} alt={player.name}
              style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'top' }} />
          ) : (
            <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.3)' }}>
              <span style={{ fontSize: 72, fontWeight: 900, color: 'rgba(255,255,255,0.2)', fontFamily: 'Georgia, serif' }}>
                {player.name.charAt(0)}
              </span>
            </div>
          )}
          {/* Gradiente sobre la foto */}
          <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: '40%', background: `linear-gradient(0deg, ${teamColors[1]}, transparent)` }} />
        </div>

        {/* Info del jugador */}
        <div style={{ position: 'relative', zIndex: 1, padding: '8px 12px 12px', background: `linear-gradient(160deg, ${teamColors[0]}cc, ${teamColors[1]})` }}>

          {/* Nombre */}
          <p style={{
            fontSize: 22, fontWeight: 900, color: '#fff', margin: '0 0 4px',
            lineHeight: 1.1, fontFamily: 'Georgia, serif',
            textShadow: '0 2px 8px rgba(0,0,0,0.8)',
            letterSpacing: 0.5,
          }}>{player.name}</p>

          {/* Equipo */}
          {player.team && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
              <Avatar url={player.team.logo_url} name={player.team.name} size={18} />
              <span style={{ color: 'rgba(255,255,255,0.8)', fontSize: 11, fontWeight: 600, letterSpacing: 1, textTransform: 'uppercase' as const }}>
                {player.team.name}
              </span>
            </div>
          )}

          {/* Separador dorado */}
          <div style={{ height: 1, background: 'linear-gradient(90deg, transparent, #C9A84C, transparent)', marginBottom: 8 }} />

          {/* Stats */}
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' as const, marginBottom: 6 }}>
            {voteCount(player.id) > 0 && (
              <div style={{ background: 'rgba(201,168,76,0.25)', border: '1px solid #C9A84C', borderRadius: 20, padding: '2px 10px' }}>
                <span style={{ color: '#C9A84C', fontSize: 11, fontWeight: 700 }}>★ {voteCount(player.id)} votos</span>
              </div>
            )}
            {isVoted && (
              <div style={{ background: '#C9A84C', borderRadius: 20, padding: '2px 10px' }}>
                <span style={{ color: '#0D4F28', fontSize: 11, fontWeight: 900 }}>★ Tu voto</span>
              </div>
            )}
          </div>

          {/* Bio */}
          {player.bio && (
            <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: 11, margin: 0, fontStyle: 'italic', lineHeight: 1.3 }}>
              {player.bio}
            </p>
          )}
        </div>

        {/* Hint votar */}
        {showVoteHint && (
          <div style={{ position: 'absolute', top: 20, left: 16, zIndex: 10, background: 'rgba(201,168,76,0.95)', borderRadius: 10, padding: '6px 14px', border: '3px solid #C9A84C', transform: 'rotate(-12deg)' }}>
            <span style={{ color: '#0D4F28', fontWeight: 900, fontSize: 18 }}>VOTO ★</span>
          </div>
        )}

        {/* Hint pasar */}
        {showSkipHint && (
          <div style={{ position: 'absolute', top: 20, right: 16, zIndex: 10, background: 'rgba(26,107,53,0.95)', borderRadius: 10, padding: '6px 14px', border: '3px solid #1A6B35', transform: 'rotate(12deg)' }}>
            <span style={{ color: '#fff', fontWeight: 900, fontSize: 18 }}>PASO</span>
          </div>
        )}

        {/* Borde inferior decorativo */}
        <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 3, background: 'linear-gradient(90deg, transparent, #C9A84C, transparent)', zIndex: 2 }} />
      </div>

      {/* Botones */}
      <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
        <button onClick={handlePrev} style={{
          width: 44, height: 44, borderRadius: '50%',
          background: 'rgba(26,107,53,0.3)', border: '2px solid #1A6B35',
          color: '#a8d5b5', fontSize: 18, cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>←</button>

        <button onClick={handleSkip} style={{
          width: 52, height: 52, borderRadius: '50%',
          background: 'rgba(26,107,53,0.3)', border: '2px solid #1A6B35',
          color: '#a8d5b5', fontSize: 20, cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: '0 4px 12px rgba(0,0,0,0.4)'
        }}>✕</button>

        <button onClick={handleVote} disabled={isVoted} style={{
          width: 68, height: 68, borderRadius: '50%',
          background: isVoted ? 'rgba(201,168,76,0.3)' : 'linear-gradient(135deg, #C9A84C, #a07830)',
          border: isVoted ? '2px solid #C9A84C' : '2px solid #C9A84C',
          fontSize: 26, cursor: isVoted ? 'default' : 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: isVoted ? 'none' : '0 4px 20px rgba(201,168,76,0.5)',
          color: isVoted ? '#C9A84C' : '#fff',
        }}>★</button>

        <button onClick={handleNext} style={{
          width: 52, height: 52, borderRadius: '50%',
          background: 'rgba(26,107,53,0.3)', border: '2px solid #1A6B35',
          color: '#a8d5b5', fontSize: 20, cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: '0 4px 12px rgba(0,0,0,0.4)'
        }}>→</button>

        <button onClick={handleNext} style={{
          width: 44, height: 44, borderRadius: '50%',
          background: 'rgba(26,107,53,0.3)', border: '2px solid #1A6B35',
          color: '#a8d5b5', fontSize: 18, cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>→</button>
      </div>

      <p style={{ color: '#a8d5b5', fontSize: 11, margin: 0 }}>Deslizá o usá los botones · ★ para votar</p>
    </div>
  )
}
