"use client";
import TextoRico from "@/components/TextoRico";
import { useState } from "react";

/* TEXTO QUE SE CORTA Y SE ABRE AHÍ MISMO
   Para cuerpos largos dentro de una tarjeta: se muestra el principio y
   «ver más» lo despliega en el sitio, sin abrir otra página.

   Por qué existe: un aviso cortado con «…» obligaba a entrar al caso para
   leer el final —y a volver para darse por enterado—. Dos viajes para leer
   un párrafo. Palabras de John (17/07): «el ver más puede ser ahí mismo».

   El corte va por ESPACIO, no por número exacto de caracteres. Cortar en
   seco parte la última palabra («Bus…») y, peor, puede partir una URL por
   la mitad: TextoRico la reconocería igual y armaría un enlace roto a una
   dirección que no existe. */

const CORTE = 400;

/** Recorta sin partir palabras. Si el último espacio queda demasiado atrás
 *  —una parrafada sin espacios, un enlace larguísimo— corta en seco: mejor
 *  eso que devolver medio texto. */
const corta = (t: string, n: number) => {
  if (t.length <= n) return t;
  const trozo = t.slice(0, n);
  const i = trozo.lastIndexOf(" ");
  return i > n * 0.6 ? trozo.slice(0, i) : trozo;
};

export default function TextoCorto({ texto, corte = CORTE, className = "" }: {
  texto: string;
  corte?: number;
  className?: string;
}) {
  const [abierto, setAbierto] = useState(false);
  const largo = (texto || "").length > corte;
  const visible = !largo || abierto ? texto : corta(texto, corte);

  return (
    <div className={className}>
      <TextoRico texto={visible} />
      {largo && !abierto && "… "}
      {largo && (
        /* `fila-encima` porque esto vive dentro de tarjetas con enlace
           estirado: sin subirlo, la capa se come el clic y en vez de abrir
           el texto te saca a otra página. `stopPropagation` cubre el otro
           caso, el de las tarjetas que navegan con onClick. */
        <button className="ver-mas fila-encima"
          onClick={e => { e.stopPropagation(); setAbierto(!abierto); }}>
          {abierto ? "ver menos" : "ver más"}
        </button>
      )}
    </div>
  );
}
