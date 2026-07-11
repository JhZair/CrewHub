export default function Avatar({ nombre, color, size = 36, src }: {
  nombre?: string | null; color?: string | null; size?: number; src?: string | null;
}) {
  if (src) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img className="av" src={src} alt={nombre || ""} referrerPolicy="no-referrer"
        style={{ width: size, height: size, objectFit: "cover" }} />
    );
  }
  const ini = (nombre || "?").split(" ").map(p => p[0]).slice(0, 2).join("").toUpperCase();
  return (
    <span className="av" style={{ width: size, height: size, background: color || "#7c5cff", fontSize: Math.round(size * 0.36) }}>
      {ini}
    </span>
  );
}
