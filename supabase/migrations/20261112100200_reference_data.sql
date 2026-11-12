-- Cities and districts. Reference data that production needs too, so it lives in a migration
-- rather than seed.sql (which is only applied to local or explicitly seeded databases).
-- Ids are stable: listings reference them.

insert into public.cities (id, slug, name_mn, name_en) values
  (1, 'ulaanbaatar', 'Улаанбаатар', 'Ulaanbaatar');

-- The 9 districts (дүүрэг) of Ulaanbaatar. sort_order puts the central districts first.
insert into public.districts (id, city_id, slug, name_mn, name_en, sort_order) values
  (1, 1, 'sukhbaatar',       'Сүхбаатар',      'Sukhbaatar',       1),
  (2, 1, 'chingeltei',       'Чингэлтэй',      'Chingeltei',       2),
  (3, 1, 'bayangol',         'Баянгол',        'Bayangol',         3),
  (4, 1, 'bayanzurkh',       'Баянзүрх',       'Bayanzurkh',       4),
  (5, 1, 'khan-uul',         'Хан-Уул',        'Khan-Uul',         5),
  (6, 1, 'songinokhairkhan', 'Сонгинохайрхан', 'Songinokhairkhan', 6),
  (7, 1, 'nalaikh',          'Налайх',         'Nalaikh',          7),
  (8, 1, 'baganuur',         'Багануур',       'Baganuur',         8),
  (9, 1, 'bagakhangai',      'Багахангай',     'Bagakhangai',      9);
