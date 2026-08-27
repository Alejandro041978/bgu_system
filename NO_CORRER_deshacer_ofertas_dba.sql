-- Deshacer de las ofertas agregadas el 27/08/2026 para fechar bien las
-- cohortes DBA mudadas de aula (643/644 SPRING 2026, 659 SPRING 2025):
DELETE FROM semester_offerings WHERE id = '7f7a66fb-6ea1-4fe3-a143-c1c4bc9fbd3b';
DELETE FROM semester_offerings WHERE id = '45d385ce-954a-4223-95b2-8a538bc31e4e';
DELETE FROM semester_offerings WHERE id = 'ab116aa7-0d22-42d8-927b-f0d946ca029b';
