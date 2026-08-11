-- ============================================================
--  db/ensamblado.sql
--
--  EQUIPOS ENSAMBLADOS — la tercera cara, sin tabla nueva.
--
--  Un monopod de paneo son siete piezas atornilladas: varilla,
--  cabezal, mango, adaptadores, tornillos. Cada una se compró y tiene
--  su boleta, pero mientras está montada no se presta sola.
--
--  Los tres ejes del inventario, ahora completos:
--    · COMBO       con qué ENTRÓ.        Un hecho del pasado: no cambia.
--    · KIT         con qué SALE.         Una decisión, reversible en un clic.
--    · ENSAMBLADO  de qué ESTÁ HECHO.    Un hecho físico: para deshacerlo
--                                        hace falta un destornillador.
--
--  Y por eso NO es una tabla como `kits`. Un kit es una LISTA; un
--  ensamblado es una COSA: se presta, se cae al suelo, tiene una
--  etiqueta pegada con su folio, sale en un kit. Todo eso ya lo sabe
--  hacer `equipamiento`. Como tabla aparte habría que reimplementar
--  entrega, devolución, estados, bitácora, ficha y búsqueda; como
--  unidad son una columna y un estado.
--
--  El valor NO se mueve: cada pieza sigue contando SU precio en el
--  patrimonio. El ensamblado no se compró, se armó, así que su propio
--  `valor_compra` queda vacío y el total del inventario no cuenta nada
--  dos veces. Lo que la ficha enseña —«compuesto por 7 piezas · S/ 340»—
--  es una suma, no un dato guardado.
--
--  `on delete set null`: si el ensamblado se borra, sus piezas no
--  desaparecen. Se sueltan.
-- ============================================================

alter table equipamiento add column if not exists ensamblado_en uuid
  references equipamiento(id) on delete set null;

create index if not exists idx_equipamiento_ensamblado
  on equipamiento(ensamblado_en);

/* Una pieza no puede estar montada en sí misma. Es lo único que la base
   puede impedir por su cuenta; que A esté en B y B en A lo comprueba la
   acción `ensamblar`, porque requiere recorrer la cadena. */
alter table equipamiento drop constraint if exists eq_no_se_ensambla_en_si_mismo;
alter table equipamiento add constraint eq_no_se_ensambla_en_si_mismo
  check (ensamblado_en is null or ensamblado_en <> id);

-- ── COMPROBAR: tiene que decir «si» ──
select 'equipamiento.ensamblado_en' as columna,
       case when count(*) = 1 then 'si' else 'NO — algo falló' end as existe
from information_schema.columns
where table_name = 'equipamiento' and column_name = 'ensamblado_en';
