// Logo de marca (Blackwell): cuadrado azul con la marca blanca.
// SVG para que sea nítido a cualquier tamaño y sirva también de favicon.
export function BrandLogo({ className = 'w-8 h-8' }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 48" className={className} role="img" aria-label="Blackwell" xmlns="http://www.w3.org/2000/svg">
      <rect width="48" height="48" rx="5" fill="#1a34a8" />
      <polygon points="15,11 26,11 34,23.3 15,23.3" fill="#ffffff" />
      <polygon points="15,24.7 34,24.7 26,37 15,37" fill="#ffffff" />
    </svg>
  )
}
