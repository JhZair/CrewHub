"use client";
import { useState, type ReactNode } from "react";

export default function TabsPanel({ labels, paneles, inicial = 0 }: {
  labels: string[]; paneles: ReactNode[]; inicial?: number;
}) {
  const [i, setI] = useState(inicial);
  return (
    <div>
      <div className="vtabs" style={{ marginBottom: 14 }}>
        {labels.map((l, k) => (
          <button key={k} className={`vtab ${i === k ? "on" : ""}`} onClick={() => setI(k)}>{l}</button>
        ))}
      </div>
      {paneles.map((p, k) => (
        <div key={k} style={{ display: i === k ? "block" : "none" }}>{p}</div>
      ))}
    </div>
  );
}
