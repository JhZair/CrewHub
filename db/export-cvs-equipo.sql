-- ============================================================
-- EXPORT PARA DISEÑO DE CVs — equipo de una postulación.
--
-- NO migra nada: EXPORTA. Devuelve un solo JSON con todo lo que
-- la base ya sabe de cada miembro del equipo (identidad + su
-- repositorio completo: obras, premios, certificados, formación,
-- redes, CVs generales…), para pre-llenar las fichas y diseñar
-- los CVs presentados sin re-teclear nada.
--
-- Uso: reemplazar <POSTULACION_ID> por el uuid de la postulación
-- (está en la URL de su ficha: /entidad/postulacion/<uuid>),
-- correr en el SQL Editor de Supabase y descargar/copiar el JSON.
-- ============================================================

select json_agg(fila order by fila->>'cargo') as equipo_cvs
from (
  select json_build_object(
    'cargo',        pe.cargo,
    'cv_url',       pe.cv_url,          -- por si ya se registró alguno
    'persona', json_build_object(
      'id',             p.id,
      'nombre',         p.nombre,
      'alias',          p.alias,
      'tipo',           p.tipo,
      'rol',            p.rol,            -- especialidades (texto con comas)
      'region',         p.region,
      'provincia',      p.provincia,
      'distrito',       p.distrito,
      'direccion',      p.direccion,
      'email',          p.email,
      'telefono',       p.telefono,
      'genero',         p.genero,
      'fecha_nacimiento', p.fecha_nacimiento,
      'nacionalidad',   p.nacionalidad,
      'autoident',      p.autoident,
      'lengua_materna', p.lengua_materna,
      'otras_lenguas',  p.otras_lenguas,
      'es_comunero',    p.es_comunero,
      'foto_url',       p.foto_url,
      'notas',          p.notas
    ),
    'repositorio', coalesce((
      select json_agg(json_build_object(
        'tipo', o.tipo, 'titulo', o.titulo, 'url', o.url,
        'fecha', o.fecha, 'notas', o.notas, 'datos', o.datos,
        'actualizado', o.actualizado
      ) order by o.tipo, o.fecha desc nulls last)
      from objetos o
      where o.entidad_tipo = 'persona' and o.entidad_id = p.id
    ), '[]'::json)
  ) as fila
  from postulacion_equipo pe
  join personas p on p.id = pe.persona_id
  where pe.postulacion_id = '<POSTULACION_ID>'
) t;
