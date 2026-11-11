insert into services (salon_id, id, category, name, description, price, duration, image, icon, sort_order) values
('elegance', 'coupe-femme','coiffure',
 '{"fr":"Coupe & Brushing","ar":"قص وتصفيف الشعر"}',
 '{"fr":"Coupe personnalisée et brushing pour sublimer votre style.","ar":"قص مخصص وتصفيف لإبراز إطلالتكِ."}',
 2500, 60, 'https://images.pexels.com/photos/3993449/pexels-photo-3993449.jpeg?auto=compress&cs=tinysrgb&w=600', 'scissors', 0),
('elegance', 'coloration','coiffure',
 '{"fr":"Coloration & Balayage","ar":"صبغة الشعر وبلاليج"}',
 '{"fr":"Coloration professionnelle et balayage pour un rendu naturel.","ar":"صبغة احترافية وبلاليج لنتيجة طبيعية."}',
 6000, 120, 'https://images.pexels.com/photos/3992874/pexels-photo-3992874.jpeg?auto=compress&cs=tinysrgb&w=600', 'palette', 1),
('elegance', 'soin-keratine','coiffure',
 '{"fr":"Soin Kératine","ar":"علاج الكيراتين"}',
 '{"fr":"Lissage et soin profond à la kératine pour des cheveux soyeux.","ar":"تنعيم وعلاج عميق بالكيراتين لشعر حريري."}',
 8000, 150, 'https://images.pexels.com/photos/3997389/pexels-photo-3997389.jpeg?auto=compress&cs=tinysrgb&w=600', 'sparkles', 2),
('elegance', 'manucure','beaute',
 '{"fr":"Manucure & Vernis","ar":"مانيكير وطلاء الأظافر"}',
 '{"fr":"Manucure soignée et pose de vernis semi-permanent.","ar":"مانيكير متقن وطلاء أظافر نصف دائم."}',
 2000, 45, 'https://images.pexels.com/photos/3997391/pexels-photo-3997391.jpeg?auto=compress&cs=tinysrgb&w=600', 'hand', 3),
('elegance', 'maquillage','beaute',
 '{"fr":"Maquillage Professionnel","ar":"مكياج احترافي"}',
 '{"fr":"Maquillage pour mariée, soirée ou événements spéciaux.","ar":"مكياج للعروس، السهرة أو المناسبات الخاصة."}',
 5000, 90, 'https://images.pexels.com/photos/3997384/pexels-photo-3997384.jpeg?auto=compress&cs=tinysrgb&w=600', 'brush', 4),
('elegance', 'soin-visage','beaute',
 '{"fr":"Soin du Visage","ar":"عناية بالوجه"}',
 '{"fr":"Nettoyage profond, gommage et masque pour une peau éclatante.","ar":"تنظيف عميق، تقشير وقناع لبشرة مشرقة."}',
 3500, 75, 'https://images.pexels.com/photos/3997390/pexels-photo-3997390.jpeg?auto=compress&cs=tinysrgb&w=600', 'heart', 5)
on conflict (id) do nothing;

insert into stylists (salon_id, id, name, role, specialties, image, sort_order) values
('elegance', 'amina','Amina',
 '{"fr":"Coiffeuse Styliste","ar":"خبيرة تصفيف الشعر"}',
 '[{"fr":"Balayage","ar":"بلاليج"},{"fr":"Kératine","ar":"كيراتين"}]',
 'https://images.pexels.com/photos/3993449/pexels-photo-3993449.jpeg?auto=compress&cs=tinysrgb&w=400', 0),
('elegance', 'leila','Leila',
 '{"fr":"Esthéticienne","ar":"خبيرة تجميل"}',
 '[{"fr":"Maquillage","ar":"مكياج"},{"fr":"Soin visage","ar":"عناية بالوجه"}]',
 'https://images.pexels.com/photos/3997384/pexels-photo-3997384.jpeg?auto=compress&cs=tinysrgb&w=400', 1),
('elegance', 'sara','Sara',
 '{"fr":"Prothésiste Ongles","ar":"خبيرة أظافر"}',
 '[{"fr":"Manucure","ar":"مانيكير"},{"fr":"Vernis","ar":"طلاء"}]',
 'https://images.pexels.com/photos/3997391/pexels-photo-3997391.jpeg?auto=compress&cs=tinysrgb&w=400', 2)
on conflict (id) do nothing;

insert into stylist_services (salon_id, stylist_id, service_id) values
  ('elegance', 'amina', 'coupe-femme'),
  ('elegance', 'amina', 'coloration'),
  ('elegance', 'amina', 'soin-keratine'),
  ('elegance', 'leila', 'maquillage'),
  ('elegance', 'leila', 'soin-visage'),
  ('elegance', 'sara',  'manucure')
on conflict do nothing;

insert into stylist_workdays (salon_id, stylist_id, weekday)
select 'elegance', s, d from unnest(array['amina', 'leila', 'sara']) s cross join generate_series(2, 6) d
on conflict do nothing;
