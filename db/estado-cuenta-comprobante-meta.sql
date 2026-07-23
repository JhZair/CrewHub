-- ============================================================
--  Estado de cuenta — quién subió el comprobante y cuándo
--
--  El estado ya guarda `creado_en`/`creado_por` (quién creó la fila). Pero el
--  comprobante físico se adjunta después, y a veces lo sube otra persona en
--  otro momento. Estas dos columnas registran ESE hecho: quién pegó el
--  escaneo/PDF y cuándo. Se llenan solas al adjuntar (acción imagenesEstadoCuenta).
--
--  ⚠ Corre este SQL ANTES de publicar el código nuevo: la ficha del fondo pasa
--  a leer estas columnas, y si aún no existen, la lista de estados no carga.
-- ============================================================

alter table estado_cuenta add column if not exists comprobante_en  timestamptz;
alter table estado_cuenta add column if not exists comprobante_por uuid references perfiles(id);

comment on column estado_cuenta.comprobante_en  is 'Cuándo se adjuntó por última vez el comprobante (escaneo/PDF) de este mes.';
comment on column estado_cuenta.comprobante_por is 'Quién adjuntó el comprobante de este mes.';
