export default function Avatar({ nombre, color, size = 36 }: { nombre?: string | null; color?: string | null; size?: number }) {
  const ini = (nombre || "?").split(" ").map(p => p[0]).slice(0, 2).join("").toUpperCase();
  return (
    <span className="av" style={{ width: size, height: size, background: color || "#7c5cff", fontSize: Math.round(size * 0.36) }}>
      {ini}
    </span>
  );
}
