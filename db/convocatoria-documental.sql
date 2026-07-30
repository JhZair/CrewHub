-- Etiqueta como «Documental» las convocatorias cuyo nombre lo dice.
-- Revisa el SELECT antes de correr el UPDATE: confirma que son las correctas.

-- 1) Ver a cuáles afectaría:
select id, codigo, nombre, categoria
from convocatorias
where nombre ilike '%documental%'
order by anio desc, codigo;

-- 2) Si la lista es correcta, aplicar:
update convocatorias
set categoria = 'Documental'
where nombre ilike '%documental%';
