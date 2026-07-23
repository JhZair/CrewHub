-- ============================================================
--  Estado de cuenta — el comprobante físico (escaneo/foto), por mes
--
--  El `url` guardaba UN link (PDF en Drive). Pero el comprobante suele ser
--  una o dos fotos del estado impreso, y conviene tenerlas pegadas al mes.
--  `imagenes` es un arreglo de URLs (van al bucket `adjuntos` de Storage,
--  el mismo de los comentarios). Un mes puede tener varias páginas.
-- ============================================================

alter table estado_cuenta
  add column if not exists imagenes jsonb not null default '[]'::jsonb;

comment on column estado_cuenta.imagenes is
  'Escaneos/fotos del estado de cuenta de ese mes (URLs en Storage). Un mes puede tener varias páginas.';
