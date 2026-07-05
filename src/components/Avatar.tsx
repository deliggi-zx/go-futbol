type AvatarProps = {
  url?: string | null
  name: string
  size?: number
  bordered?: boolean
}

export function Avatar({ url, name, size = 32, bordered = true }: AvatarProps) {
  const emphasis = bordered ? { border: '2px solid #C9A84C', boxShadow: '0 0 8px rgba(201,168,76,0.4)' } : {}
  if (url) {
    return <img src={url} alt={name} style={{ width: size, height: size, borderRadius: '50%', objectFit: 'cover', flexShrink: 0, ...emphasis }} />
  }
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%',
      background: bordered ? 'radial-gradient(circle, #0D4F28 0%, #062B14 100%)' : '#1A6B35',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: size * 0.4, fontWeight: 700, color: '#C9A84C', flexShrink: 0,
      ...emphasis,
    }}>
      {name.charAt(0).toUpperCase()}
    </div>
  )
}
