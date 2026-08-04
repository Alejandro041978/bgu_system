-- Plan Estratégico 2023-2028 · Reporte 2025-2026 (generado desde la hoja)



-- E1-K1 · Programas autorizados
insert into effectiveness_kpis (code, name, level, value_type, unit, owner_plan, data_source, frequency, source, scope)
select 'E1-K1', 'Programas autorizados', 'institucional', 'decimal', 'programas', 'estrategico',
       'CIE / Academic Affairs', 'anual', 'manual', 'KPI del Plan Estratégico 2023-2028'
 where not exists (select 1 from effectiveness_kpis where trim(code)='E1-K1');

insert into strategic_plan_kpis (cycle_id, kpi_id, objective_id, owner_label)
select c.id, k.id, o.id, 'Ronald'
  from strategic_plan_cycles c, effectiveness_kpis k
  left join strategic_objectives o on o.code = 'O1' and o.status='active'
 where c.status='active' and trim(k.code)='E1-K1'
on conflict (cycle_id, kpi_id) do nothing;

insert into indicator_composition (parent_id, child_id)
select p.id, c.id from effectiveness_kpis p, effectiveness_kpis c
 where trim(p.code)='E1-K1' and trim(c.code)='E1-O01' on conflict do nothing;

insert into indicator_targets (indicator_id, academic_year_id, value, operator, note)
select k.id, (select id from academic_years where extract(year from start_date)::int = 2025), 11, '>=', 'Curva del ciclo 2023-2028'
  from effectiveness_kpis k where trim(k.code)='E1-K1' and (select id from academic_years where extract(year from start_date)::int = 2025) is not null
on conflict (indicator_id, academic_year_id) do update set value=excluded.value, operator=excluded.operator;

insert into indicator_targets (indicator_id, academic_year_id, value, operator, note)
select k.id, (select id from academic_years where extract(year from start_date)::int = 2026), 13, '>=', 'Curva del ciclo 2023-2028'
  from effectiveness_kpis k where trim(k.code)='E1-K1' and (select id from academic_years where extract(year from start_date)::int = 2026) is not null
on conflict (indicator_id, academic_year_id) do update set value=excluded.value, operator=excluded.operator;

insert into indicator_targets (indicator_id, academic_year_id, value, operator, note)
select k.id, (select id from academic_years where extract(year from start_date)::int = 2027), 15, '>=', 'Curva del ciclo 2023-2028'
  from effectiveness_kpis k where trim(k.code)='E1-K1' and (select id from academic_years where extract(year from start_date)::int = 2027) is not null
on conflict (indicator_id, academic_year_id) do update set value=excluded.value, operator=excluded.operator;

insert into indicator_results (indicator_id, academic_year_id, period, value, source, status, note)
select k.id, (select id from academic_years where extract(year from start_date)::int = 2023), 'anual', 5, 'manual', null, '5*'
  from effectiveness_kpis k where trim(k.code)='E1-K1' and (select id from academic_years where extract(year from start_date)::int = 2023) is not null
on conflict (indicator_id, academic_year_id, period)
do update set value=excluded.value, status=excluded.status, note=excluded.note;

insert into indicator_results (indicator_id, academic_year_id, period, value, source, status, note)
select k.id, (select id from academic_years where extract(year from start_date)::int = 2024), 'anual', 8, 'manual', null, '8'
  from effectiveness_kpis k where trim(k.code)='E1-K1' and (select id from academic_years where extract(year from start_date)::int = 2024) is not null
on conflict (indicator_id, academic_year_id, period)
do update set value=excluded.value, status=excluded.status, note=excluded.note;

insert into indicator_results (indicator_id, academic_year_id, period, value, source, status, note)
select k.id, (select id from academic_years where extract(year from start_date)::int = 2025), 'anual', 11, 'manual', 'cumplido', '11 programas'
  from effectiveness_kpis k where trim(k.code)='E1-K1' and (select id from academic_years where extract(year from start_date)::int = 2025) is not null
on conflict (indicator_id, academic_year_id, period)
do update set value=excluded.value, status=excluded.status, note=excluded.note;

insert into indicator_evidence (indicator_id, academic_year_id, label, pending, uploaded_by)
select k.id, (select id from academic_years where extract(year from start_date)::int = 2025), '12499Approved Data (1).pdf', true, 'Reporte estratégico 2025-2026'
  from effectiveness_kpis k where trim(k.code)='E1-K1' and (select id from academic_years where extract(year from start_date)::int = 2025) is not null
   and not exists (select 1 from indicator_evidence e where e.indicator_id=k.id and e.label='12499Approved Data (1).pdf');

-- E1-K2 · Oferta efectiva de programas
insert into effectiveness_kpis (code, name, level, value_type, unit, owner_plan, data_source, frequency, source, scope)
select 'E1-K2', 'Oferta efectiva de programas', 'institucional', 'porcentaje', 'porcentaje', 'estrategico',
       'Catálogo / SIS', 'anual', 'manual', 'KPI del Plan Estratégico 2023-2028'
 where not exists (select 1 from effectiveness_kpis where trim(code)='E1-K2');

insert into strategic_plan_kpis (cycle_id, kpi_id, objective_id, owner_label)
select c.id, k.id, o.id, 'Ronald'
  from strategic_plan_cycles c, effectiveness_kpis k
  left join strategic_objectives o on o.code = 'O1' and o.status='active'
 where c.status='active' and trim(k.code)='E1-K2'
on conflict (cycle_id, kpi_id) do nothing;

insert into indicator_composition (parent_id, child_id)
select p.id, c.id from effectiveness_kpis p, effectiveness_kpis c
 where trim(p.code)='E1-K2' and trim(c.code)='E1-I01' on conflict do nothing;

insert into indicator_targets (indicator_id, academic_year_id, value, operator, note)
select k.id, (select id from academic_years where extract(year from start_date)::int = 2025), 59, '>=', 'Curva del ciclo 2023-2028'
  from effectiveness_kpis k where trim(k.code)='E1-K2' and (select id from academic_years where extract(year from start_date)::int = 2025) is not null
on conflict (indicator_id, academic_year_id) do update set value=excluded.value, operator=excluded.operator;

insert into indicator_targets (indicator_id, academic_year_id, value, operator, note)
select k.id, (select id from academic_years where extract(year from start_date)::int = 2026), 70, '>=', 'Curva del ciclo 2023-2028'
  from effectiveness_kpis k where trim(k.code)='E1-K2' and (select id from academic_years where extract(year from start_date)::int = 2026) is not null
on conflict (indicator_id, academic_year_id) do update set value=excluded.value, operator=excluded.operator;

insert into indicator_targets (indicator_id, academic_year_id, value, operator, note)
select k.id, (select id from academic_years where extract(year from start_date)::int = 2027), 80, '>=', 'Curva del ciclo 2023-2028'
  from effectiveness_kpis k where trim(k.code)='E1-K2' and (select id from academic_years where extract(year from start_date)::int = 2027) is not null
on conflict (indicator_id, academic_year_id) do update set value=excluded.value, operator=excluded.operator;

insert into indicator_results (indicator_id, academic_year_id, period, value, source, status, note)
select k.id, (select id from academic_years where extract(year from start_date)::int = 2023), 'anual', 50, 'manual', null, '50%*'
  from effectiveness_kpis k where trim(k.code)='E1-K2' and (select id from academic_years where extract(year from start_date)::int = 2023) is not null
on conflict (indicator_id, academic_year_id, period)
do update set value=excluded.value, status=excluded.status, note=excluded.note;

insert into indicator_results (indicator_id, academic_year_id, period, value, source, status, note)
select k.id, (select id from academic_years where extract(year from start_date)::int = 2024), 'anual', 55, 'manual', null, '55%'
  from effectiveness_kpis k where trim(k.code)='E1-K2' and (select id from academic_years where extract(year from start_date)::int = 2024) is not null
on conflict (indicator_id, academic_year_id, period)
do update set value=excluded.value, status=excluded.status, note=excluded.note;

insert into indicator_results (indicator_id, academic_year_id, period, value, source, status, note)
select k.id, (select id from academic_years where extract(year from start_date)::int = 2025), 'anual', 100, 'manual', 'cumplido', '100,00%'
  from effectiveness_kpis k where trim(k.code)='E1-K2' and (select id from academic_years where extract(year from start_date)::int = 2025) is not null
on conflict (indicator_id, academic_year_id, period)
do update set value=excluded.value, status=excluded.status, note=excluded.note;

insert into indicator_evidence (indicator_id, academic_year_id, label, pending, uploaded_by)
select k.id, (select id from academic_years where extract(year from start_date)::int = 2025), 'Catálogo BGU 12499Approved Data (1).pdf', true, 'Reporte estratégico 2025-2026'
  from effectiveness_kpis k where trim(k.code)='E1-K2' and (select id from academic_years where extract(year from start_date)::int = 2025) is not null
   and not exists (select 1 from indicator_evidence e where e.indicator_id=k.id and e.label='Catálogo BGU 12499Approved Data (1).pdf');

-- E1-K3 · Países representados
insert into effectiveness_kpis (code, name, level, value_type, unit, owner_plan, data_source, frequency, source, scope)
select 'E1-K3', 'Países representados', 'institucional', 'decimal', null, 'estrategico',
       'Admissions / SIS', 'anual', 'manual', 'KPI del Plan Estratégico 2023-2028'
 where not exists (select 1 from effectiveness_kpis where trim(code)='E1-K3');

insert into strategic_plan_kpis (cycle_id, kpi_id, objective_id, owner_label)
select c.id, k.id, o.id, 'Antony Huaynapata'
  from strategic_plan_cycles c, effectiveness_kpis k
  left join strategic_objectives o on o.code = 'O1' and o.status='active'
 where c.status='active' and trim(k.code)='E1-K3'
on conflict (cycle_id, kpi_id) do nothing;

insert into indicator_composition (parent_id, child_id)
select p.id, c.id from effectiveness_kpis p, effectiveness_kpis c
 where trim(p.code)='E1-K3' and trim(c.code)='E1-I02' on conflict do nothing;

insert into indicator_composition (parent_id, child_id)
select p.id, c.id from effectiveness_kpis p, effectiveness_kpis c
 where trim(p.code)='E1-K3' and trim(c.code)='E1-I03' on conflict do nothing;

insert into indicator_composition (parent_id, child_id)
select p.id, c.id from effectiveness_kpis p, effectiveness_kpis c
 where trim(p.code)='E1-K3' and trim(c.code)='E1-S02' on conflict do nothing;

insert into indicator_targets (indicator_id, academic_year_id, value, operator, note)
select k.id, (select id from academic_years where extract(year from start_date)::int = 2025), 20, '>=', 'Curva del ciclo 2023-2028'
  from effectiveness_kpis k where trim(k.code)='E1-K3' and (select id from academic_years where extract(year from start_date)::int = 2025) is not null
on conflict (indicator_id, academic_year_id) do update set value=excluded.value, operator=excluded.operator;

insert into indicator_targets (indicator_id, academic_year_id, value, operator, note)
select k.id, (select id from academic_years where extract(year from start_date)::int = 2026), 23, '>=', 'Curva del ciclo 2023-2028'
  from effectiveness_kpis k where trim(k.code)='E1-K3' and (select id from academic_years where extract(year from start_date)::int = 2026) is not null
on conflict (indicator_id, academic_year_id) do update set value=excluded.value, operator=excluded.operator;

insert into indicator_targets (indicator_id, academic_year_id, value, operator, note)
select k.id, (select id from academic_years where extract(year from start_date)::int = 2027), 25, '>=', 'Curva del ciclo 2023-2028'
  from effectiveness_kpis k where trim(k.code)='E1-K3' and (select id from academic_years where extract(year from start_date)::int = 2027) is not null
on conflict (indicator_id, academic_year_id) do update set value=excluded.value, operator=excluded.operator;

insert into indicator_results (indicator_id, academic_year_id, period, value, source, status, note)
select k.id, (select id from academic_years where extract(year from start_date)::int = 2023), 'anual', 11, 'manual', null, '11*'
  from effectiveness_kpis k where trim(k.code)='E1-K3' and (select id from academic_years where extract(year from start_date)::int = 2023) is not null
on conflict (indicator_id, academic_year_id, period)
do update set value=excluded.value, status=excluded.status, note=excluded.note;

insert into indicator_results (indicator_id, academic_year_id, period, value, source, status, note)
select k.id, (select id from academic_years where extract(year from start_date)::int = 2024), 'anual', 15, 'manual', null, '15'
  from effectiveness_kpis k where trim(k.code)='E1-K3' and (select id from academic_years where extract(year from start_date)::int = 2024) is not null
on conflict (indicator_id, academic_year_id, period)
do update set value=excluded.value, status=excluded.status, note=excluded.note;

insert into indicator_results (indicator_id, academic_year_id, period, value, source, status, note)
select k.id, (select id from academic_years where extract(year from start_date)::int = 2025), 'anual', 21, 'manual', 'cumplido', '21'
  from effectiveness_kpis k where trim(k.code)='E1-K3' and (select id from academic_years where extract(year from start_date)::int = 2025) is not null
on conflict (indicator_id, academic_year_id, period)
do update set value=excluded.value, status=excluded.status, note=excluded.note;

insert into indicator_evidence (indicator_id, academic_year_id, label, pending, uploaded_by)
select k.id, (select id from academic_years where extract(year from start_date)::int = 2025), 'Paises/Registros', true, 'Reporte estratégico 2025-2026'
  from effectiveness_kpis k where trim(k.code)='E1-K3' and (select id from academic_years where extract(year from start_date)::int = 2025) is not null
   and not exists (select 1 from indicator_evidence e where e.indicator_id=k.id and e.label='Paises/Registros');

-- E1-K4 · Pertinencia curricular (1-5)
insert into effectiveness_kpis (code, name, level, value_type, unit, owner_plan, data_source, frequency, source, scope)
select 'E1-K4', 'Pertinencia curricular (1-5)', 'institucional', 'decimal', 'puntos (1-5)', 'estrategico',
       'Curriculum review / advisory', 'anual', 'manual', 'KPI del Plan Estratégico 2023-2028'
 where not exists (select 1 from effectiveness_kpis where trim(code)='E1-K4');

insert into strategic_plan_kpis (cycle_id, kpi_id, objective_id, owner_label)
select c.id, k.id, o.id, 'Ronald'
  from strategic_plan_cycles c, effectiveness_kpis k
  left join strategic_objectives o on o.code = 'O1' and o.status='active'
 where c.status='active' and trim(k.code)='E1-K4'
on conflict (cycle_id, kpi_id) do nothing;

insert into indicator_composition (parent_id, child_id)
select p.id, c.id from effectiveness_kpis p, effectiveness_kpis c
 where trim(p.code)='E1-K4' and trim(c.code)='E1-S01' on conflict do nothing;

insert into indicator_targets (indicator_id, academic_year_id, value, operator, note)
select k.id, (select id from academic_years where extract(year from start_date)::int = 2025), 4, '>=', 'Curva del ciclo 2023-2028'
  from effectiveness_kpis k where trim(k.code)='E1-K4' and (select id from academic_years where extract(year from start_date)::int = 2025) is not null
on conflict (indicator_id, academic_year_id) do update set value=excluded.value, operator=excluded.operator;

insert into indicator_targets (indicator_id, academic_year_id, value, operator, note)
select k.id, (select id from academic_years where extract(year from start_date)::int = 2026), 4.2, '>=', 'Curva del ciclo 2023-2028'
  from effectiveness_kpis k where trim(k.code)='E1-K4' and (select id from academic_years where extract(year from start_date)::int = 2026) is not null
on conflict (indicator_id, academic_year_id) do update set value=excluded.value, operator=excluded.operator;

insert into indicator_targets (indicator_id, academic_year_id, value, operator, note)
select k.id, (select id from academic_years where extract(year from start_date)::int = 2027), 4.4, '>=', 'Curva del ciclo 2023-2028'
  from effectiveness_kpis k where trim(k.code)='E1-K4' and (select id from academic_years where extract(year from start_date)::int = 2027) is not null
on conflict (indicator_id, academic_year_id) do update set value=excluded.value, operator=excluded.operator;

insert into indicator_results (indicator_id, academic_year_id, period, value, source, status, note)
select k.id, (select id from academic_years where extract(year from start_date)::int = 2024), 'anual', 3.8, 'manual', null, '3.8'
  from effectiveness_kpis k where trim(k.code)='E1-K4' and (select id from academic_years where extract(year from start_date)::int = 2024) is not null
on conflict (indicator_id, academic_year_id, period)
do update set value=excluded.value, status=excluded.status, note=excluded.note;

insert into indicator_results (indicator_id, academic_year_id, period, value, source, status, note)
select k.id, (select id from academic_years where extract(year from start_date)::int = 2025), 'anual', 4.61, 'manual', 'cumplido', '4.61'
  from effectiveness_kpis k where trim(k.code)='E1-K4' and (select id from academic_years where extract(year from start_date)::int = 2025) is not null
on conflict (indicator_id, academic_year_id, period)
do update set value=excluded.value, status=excluded.status, note=excluded.note;

insert into indicator_evidence (indicator_id, academic_year_id, label, pending, uploaded_by)
select k.id, (select id from academic_years where extract(year from start_date)::int = 2025), 'Planes Institucionales', true, 'Reporte estratégico 2025-2026'
  from effectiveness_kpis k where trim(k.code)='E1-K4' and (select id from academic_years where extract(year from start_date)::int = 2025) is not null
   and not exists (select 1 from indicator_evidence e where e.indicator_id=k.id and e.label='Planes Institucionales');

-- E2-K1 · Evaluación docente (1-5)
insert into effectiveness_kpis (code, name, level, value_type, unit, owner_plan, data_source, frequency, source, scope)
select 'E2-K1', 'Evaluación docente (1-5)', 'institucional', 'decimal', 'puntos (1-5)', 'estrategico',
       'Course survey', 'anual', 'manual', 'KPI del Plan Estratégico 2023-2028'
 where not exists (select 1 from effectiveness_kpis where trim(code)='E2-K1');

insert into strategic_plan_kpis (cycle_id, kpi_id, objective_id, owner_label)
select c.id, k.id, o.id, 'Ronald'
  from strategic_plan_cycles c, effectiveness_kpis k
  left join strategic_objectives o on o.code = 'O2' and o.status='active'
 where c.status='active' and trim(k.code)='E2-K1'
on conflict (cycle_id, kpi_id) do nothing;

insert into indicator_composition (parent_id, child_id)
select p.id, c.id from effectiveness_kpis p, effectiveness_kpis c
 where trim(p.code)='E2-K1' and trim(c.code)='E2-I01' on conflict do nothing;

insert into indicator_targets (indicator_id, academic_year_id, value, operator, note)
select k.id, (select id from academic_years where extract(year from start_date)::int = 2025), 4.1, '>=', 'Curva del ciclo 2023-2028'
  from effectiveness_kpis k where trim(k.code)='E2-K1' and (select id from academic_years where extract(year from start_date)::int = 2025) is not null
on conflict (indicator_id, academic_year_id) do update set value=excluded.value, operator=excluded.operator;

insert into indicator_targets (indicator_id, academic_year_id, value, operator, note)
select k.id, (select id from academic_years where extract(year from start_date)::int = 2026), 4.3, '>=', 'Curva del ciclo 2023-2028'
  from effectiveness_kpis k where trim(k.code)='E2-K1' and (select id from academic_years where extract(year from start_date)::int = 2026) is not null
on conflict (indicator_id, academic_year_id) do update set value=excluded.value, operator=excluded.operator;

insert into indicator_targets (indicator_id, academic_year_id, value, operator, note)
select k.id, (select id from academic_years where extract(year from start_date)::int = 2027), 4.5, '>=', 'Curva del ciclo 2023-2028'
  from effectiveness_kpis k where trim(k.code)='E2-K1' and (select id from academic_years where extract(year from start_date)::int = 2027) is not null
on conflict (indicator_id, academic_year_id) do update set value=excluded.value, operator=excluded.operator;

insert into indicator_results (indicator_id, academic_year_id, period, value, source, status, note)
select k.id, (select id from academic_years where extract(year from start_date)::int = 2024), 'anual', 3.9, 'manual', null, '3.9'
  from effectiveness_kpis k where trim(k.code)='E2-K1' and (select id from academic_years where extract(year from start_date)::int = 2024) is not null
on conflict (indicator_id, academic_year_id, period)
do update set value=excluded.value, status=excluded.status, note=excluded.note;

insert into indicator_results (indicator_id, academic_year_id, period, value, source, status, note)
select k.id, (select id from academic_years where extract(year from start_date)::int = 2025), 'anual', 4.54, 'manual', 'cumplido', '4.54'
  from effectiveness_kpis k where trim(k.code)='E2-K1' and (select id from academic_years where extract(year from start_date)::int = 2025) is not null
on conflict (indicator_id, academic_year_id, period)
do update set value=excluded.value, status=excluded.status, note=excluded.note;

insert into indicator_evidence (indicator_id, academic_year_id, label, pending, uploaded_by)
select k.id, (select id from academic_years where extract(year from start_date)::int = 2025), 'Indicadores de Programas de Estudio BGU 2025–2026.pdf', true, 'Reporte estratégico 2025-2026'
  from effectiveness_kpis k where trim(k.code)='E2-K1' and (select id from academic_years where extract(year from start_date)::int = 2025) is not null
   and not exists (select 1 from indicator_evidence e where e.indicator_id=k.id and e.label='Indicadores de Programas de Estudio BGU 2025–2026.pdf');

-- E2-K2 · Faculty capacitado
insert into effectiveness_kpis (code, name, level, value_type, unit, owner_plan, data_source, frequency, source, scope)
select 'E2-K2', 'Faculty capacitado', 'institucional', 'porcentaje', 'porcentaje', 'estrategico',
       'Training records', 'anual', 'manual', 'KPI del Plan Estratégico 2023-2028'
 where not exists (select 1 from effectiveness_kpis where trim(code)='E2-K2');

insert into strategic_plan_kpis (cycle_id, kpi_id, objective_id, owner_label)
select c.id, k.id, o.id, 'Ronald'
  from strategic_plan_cycles c, effectiveness_kpis k
  left join strategic_objectives o on o.code = 'O2' and o.status='active'
 where c.status='active' and trim(k.code)='E2-K2'
on conflict (cycle_id, kpi_id) do nothing;

insert into indicator_composition (parent_id, child_id)
select p.id, c.id from effectiveness_kpis p, effectiveness_kpis c
 where trim(p.code)='E2-K2' and trim(c.code)='E2-S01' on conflict do nothing;

insert into indicator_targets (indicator_id, academic_year_id, value, operator, note)
select k.id, (select id from academic_years where extract(year from start_date)::int = 2025), 70, '>=', 'Curva del ciclo 2023-2028'
  from effectiveness_kpis k where trim(k.code)='E2-K2' and (select id from academic_years where extract(year from start_date)::int = 2025) is not null
on conflict (indicator_id, academic_year_id) do update set value=excluded.value, operator=excluded.operator;

insert into indicator_targets (indicator_id, academic_year_id, value, operator, note)
select k.id, (select id from academic_years where extract(year from start_date)::int = 2026), 85, '>=', 'Curva del ciclo 2023-2028'
  from effectiveness_kpis k where trim(k.code)='E2-K2' and (select id from academic_years where extract(year from start_date)::int = 2026) is not null
on conflict (indicator_id, academic_year_id) do update set value=excluded.value, operator=excluded.operator;

insert into indicator_targets (indicator_id, academic_year_id, value, operator, note)
select k.id, (select id from academic_years where extract(year from start_date)::int = 2027), 90, '>=', 'Curva del ciclo 2023-2028'
  from effectiveness_kpis k where trim(k.code)='E2-K2' and (select id from academic_years where extract(year from start_date)::int = 2027) is not null
on conflict (indicator_id, academic_year_id) do update set value=excluded.value, operator=excluded.operator;

insert into indicator_results (indicator_id, academic_year_id, period, value, source, status, note)
select k.id, (select id from academic_years where extract(year from start_date)::int = 2024), 'anual', 60, 'manual', null, '60%'
  from effectiveness_kpis k where trim(k.code)='E2-K2' and (select id from academic_years where extract(year from start_date)::int = 2024) is not null
on conflict (indicator_id, academic_year_id, period)
do update set value=excluded.value, status=excluded.status, note=excluded.note;

insert into indicator_results (indicator_id, academic_year_id, period, value, source, status, note)
select k.id, (select id from academic_years where extract(year from start_date)::int = 2025), 'anual', 100, 'manual', 'cumplido', '100%'
  from effectiveness_kpis k where trim(k.code)='E2-K2' and (select id from academic_years where extract(year from start_date)::int = 2025) is not null
on conflict (indicator_id, academic_year_id, period)
do update set value=excluded.value, status=excluded.status, note=excluded.note;

insert into indicator_evidence (indicator_id, academic_year_id, label, pending, uploaded_by)
select k.id, (select id from academic_years where extract(year from start_date)::int = 2025), 'Registros de capacitación PLAN ANUAL DE DESARROLLO DOCENTE 2025 - 2026 INFORME DE CUMPLIMIENTO DEL PLAN ANUAL DE DESARROLLO DOCENTE 2025 - 2026', true, 'Reporte estratégico 2025-2026'
  from effectiveness_kpis k where trim(k.code)='E2-K2' and (select id from academic_years where extract(year from start_date)::int = 2025) is not null
   and not exists (select 1 from indicator_evidence e where e.indicator_id=k.id and e.label='Registros de capacitación PLAN ANUAL DE DESARROLLO DOCENTE 2025 - 2026 INFORME DE CUMPLIMIENTO DEL PLAN ANUAL DE DESARROLLO DOCENTE 2025 - 2026');

-- E2-K3 · Retención de faculty
insert into effectiveness_kpis (code, name, level, value_type, unit, owner_plan, data_source, frequency, source, scope)
select 'E2-K3', 'Retención de faculty', 'institucional', 'porcentaje', 'porcentaje', 'estrategico',
       'Faculty roster', 'anual', 'manual', 'KPI del Plan Estratégico 2023-2028'
 where not exists (select 1 from effectiveness_kpis where trim(code)='E2-K3');

insert into strategic_plan_kpis (cycle_id, kpi_id, objective_id, owner_label)
select c.id, k.id, o.id, 'Ronald'
  from strategic_plan_cycles c, effectiveness_kpis k
  left join strategic_objectives o on o.code = 'O2' and o.status='active'
 where c.status='active' and trim(k.code)='E2-K3'
on conflict (cycle_id, kpi_id) do nothing;

insert into indicator_composition (parent_id, child_id)
select p.id, c.id from effectiveness_kpis p, effectiveness_kpis c
 where trim(p.code)='E2-K3' and trim(c.code)='E2-S02' on conflict do nothing;

insert into indicator_targets (indicator_id, academic_year_id, value, operator, note)
select k.id, (select id from academic_years where extract(year from start_date)::int = 2025), 85, '>=', 'Curva del ciclo 2023-2028'
  from effectiveness_kpis k where trim(k.code)='E2-K3' and (select id from academic_years where extract(year from start_date)::int = 2025) is not null
on conflict (indicator_id, academic_year_id) do update set value=excluded.value, operator=excluded.operator;

insert into indicator_targets (indicator_id, academic_year_id, value, operator, note)
select k.id, (select id from academic_years where extract(year from start_date)::int = 2026), 88, '>=', 'Curva del ciclo 2023-2028'
  from effectiveness_kpis k where trim(k.code)='E2-K3' and (select id from academic_years where extract(year from start_date)::int = 2026) is not null
on conflict (indicator_id, academic_year_id) do update set value=excluded.value, operator=excluded.operator;

insert into indicator_targets (indicator_id, academic_year_id, value, operator, note)
select k.id, (select id from academic_years where extract(year from start_date)::int = 2027), 90, '>=', 'Curva del ciclo 2023-2028'
  from effectiveness_kpis k where trim(k.code)='E2-K3' and (select id from academic_years where extract(year from start_date)::int = 2027) is not null
on conflict (indicator_id, academic_year_id) do update set value=excluded.value, operator=excluded.operator;

insert into indicator_results (indicator_id, academic_year_id, period, value, source, status, note)
select k.id, (select id from academic_years where extract(year from start_date)::int = 2024), 'anual', 80, 'manual', null, '80%'
  from effectiveness_kpis k where trim(k.code)='E2-K3' and (select id from academic_years where extract(year from start_date)::int = 2024) is not null
on conflict (indicator_id, academic_year_id, period)
do update set value=excluded.value, status=excluded.status, note=excluded.note;

insert into indicator_results (indicator_id, academic_year_id, period, value, source, status, note)
select k.id, (select id from academic_years where extract(year from start_date)::int = 2025), 'anual', 93, 'manual', 'cumplido', '93%'
  from effectiveness_kpis k where trim(k.code)='E2-K3' and (select id from academic_years where extract(year from start_date)::int = 2025) is not null
on conflict (indicator_id, academic_year_id, period)
do update set value=excluded.value, status=excluded.status, note=excluded.note;

insert into indicator_evidence (indicator_id, academic_year_id, label, pending, uploaded_by)
select k.id, (select id from academic_years where extract(year from start_date)::int = 2025), 'Permanencia docente: 2025-2026 45 docentes y del 2026- 2027 tenemos 68 de ellos 42 de los 45 continuan', true, 'Reporte estratégico 2025-2026'
  from effectiveness_kpis k where trim(k.code)='E2-K3' and (select id from academic_years where extract(year from start_date)::int = 2025) is not null
   and not exists (select 1 from indicator_evidence e where e.indicator_id=k.id and e.label='Permanencia docente: 2025-2026 45 docentes y del 2026- 2027 tenemos 68 de ellos 42 de los 45 continuan');

-- E2-K4 · Faculty con credenciales verificadas
insert into effectiveness_kpis (code, name, level, value_type, unit, owner_plan, data_source, frequency, source, scope)
select 'E2-K4', 'Faculty con credenciales verificadas', 'institucional', 'porcentaje', 'porcentaje', 'estrategico',
       'Academic Affairs', 'anual', 'manual', 'KPI del Plan Estratégico 2023-2028'
 where not exists (select 1 from effectiveness_kpis where trim(code)='E2-K4');

insert into strategic_plan_kpis (cycle_id, kpi_id, objective_id, owner_label)
select c.id, k.id, o.id, 'Ronald'
  from strategic_plan_cycles c, effectiveness_kpis k
  left join strategic_objectives o on o.code = 'O2' and o.status='active'
 where c.status='active' and trim(k.code)='E2-K4'
on conflict (cycle_id, kpi_id) do nothing;

insert into indicator_composition (parent_id, child_id)
select p.id, c.id from effectiveness_kpis p, effectiveness_kpis c
 where trim(p.code)='E2-K4' and trim(c.code)='E2-O01' on conflict do nothing;

insert into indicator_composition (parent_id, child_id)
select p.id, c.id from effectiveness_kpis p, effectiveness_kpis c
 where trim(p.code)='E2-K4' and trim(c.code)='E2-O02' on conflict do nothing;

insert into indicator_targets (indicator_id, academic_year_id, value, operator, note)
select k.id, (select id from academic_years where extract(year from start_date)::int = 2025), 95, '>=', 'Curva del ciclo 2023-2028'
  from effectiveness_kpis k where trim(k.code)='E2-K4' and (select id from academic_years where extract(year from start_date)::int = 2025) is not null
on conflict (indicator_id, academic_year_id) do update set value=excluded.value, operator=excluded.operator;

insert into indicator_targets (indicator_id, academic_year_id, value, operator, note)
select k.id, (select id from academic_years where extract(year from start_date)::int = 2026), 98, '>=', 'Curva del ciclo 2023-2028'
  from effectiveness_kpis k where trim(k.code)='E2-K4' and (select id from academic_years where extract(year from start_date)::int = 2026) is not null
on conflict (indicator_id, academic_year_id) do update set value=excluded.value, operator=excluded.operator;

insert into indicator_targets (indicator_id, academic_year_id, value, operator, note)
select k.id, (select id from academic_years where extract(year from start_date)::int = 2027), 100, '>=', 'Curva del ciclo 2023-2028'
  from effectiveness_kpis k where trim(k.code)='E2-K4' and (select id from academic_years where extract(year from start_date)::int = 2027) is not null
on conflict (indicator_id, academic_year_id) do update set value=excluded.value, operator=excluded.operator;

insert into indicator_results (indicator_id, academic_year_id, period, value, source, status, note)
select k.id, (select id from academic_years where extract(year from start_date)::int = 2023), 'anual', 90, 'manual', null, '90%'
  from effectiveness_kpis k where trim(k.code)='E2-K4' and (select id from academic_years where extract(year from start_date)::int = 2023) is not null
on conflict (indicator_id, academic_year_id, period)
do update set value=excluded.value, status=excluded.status, note=excluded.note;

insert into indicator_results (indicator_id, academic_year_id, period, value, source, status, note)
select k.id, (select id from academic_years where extract(year from start_date)::int = 2024), 'anual', 92, 'manual', null, '92%'
  from effectiveness_kpis k where trim(k.code)='E2-K4' and (select id from academic_years where extract(year from start_date)::int = 2024) is not null
on conflict (indicator_id, academic_year_id, period)
do update set value=excluded.value, status=excluded.status, note=excluded.note;

insert into indicator_results (indicator_id, academic_year_id, period, value, source, status, note)
select k.id, (select id from academic_years where extract(year from start_date)::int = 2025), 'anual', 100, 'manual', 'cumplido', '100%'
  from effectiveness_kpis k where trim(k.code)='E2-K4' and (select id from academic_years where extract(year from start_date)::int = 2025) is not null
on conflict (indicator_id, academic_year_id, period)
do update set value=excluded.value, status=excluded.status, note=excluded.note;

insert into indicator_evidence (indicator_id, academic_year_id, label, pending, uploaded_by)
select k.id, (select id from academic_years where extract(year from start_date)::int = 2025), 'Evidencia ERP: https://system.blackwell.university/academic/faculty', true, 'Reporte estratégico 2025-2026'
  from effectiveness_kpis k where trim(k.code)='E2-K4' and (select id from academic_years where extract(year from start_date)::int = 2025) is not null
   and not exists (select 1 from indicator_evidence e where e.indicator_id=k.id and e.label='Evidencia ERP: https://system.blackwell.university/academic/faculty');

-- E3-K1 · Satisfacción del staff
insert into effectiveness_kpis (code, name, level, value_type, unit, owner_plan, data_source, frequency, source, scope)
select 'E3-K1', 'Satisfacción del staff', 'institucional', 'porcentaje', 'porcentaje', 'estrategico',
       'Annual staff survey', 'anual', 'manual', 'KPI del Plan Estratégico 2023-2028'
 where not exists (select 1 from effectiveness_kpis where trim(code)='E3-K1');

insert into strategic_plan_kpis (cycle_id, kpi_id, objective_id, owner_label)
select c.id, k.id, o.id, 'Yajayra'
  from strategic_plan_cycles c, effectiveness_kpis k
  left join strategic_objectives o on o.code = 'O3' and o.status='active'
 where c.status='active' and trim(k.code)='E3-K1'
on conflict (cycle_id, kpi_id) do nothing;

insert into indicator_composition (parent_id, child_id)
select p.id, c.id from effectiveness_kpis p, effectiveness_kpis c
 where trim(p.code)='E3-K1' and trim(c.code)='E3-I01' on conflict do nothing;

insert into indicator_composition (parent_id, child_id)
select p.id, c.id from effectiveness_kpis p, effectiveness_kpis c
 where trim(p.code)='E3-K1' and trim(c.code)='E3-I02' on conflict do nothing;

insert into indicator_composition (parent_id, child_id)
select p.id, c.id from effectiveness_kpis p, effectiveness_kpis c
 where trim(p.code)='E3-K1' and trim(c.code)='E3-S01' on conflict do nothing;

insert into indicator_targets (indicator_id, academic_year_id, value, operator, note)
select k.id, (select id from academic_years where extract(year from start_date)::int = 2025), 82, '>=', 'Curva del ciclo 2023-2028'
  from effectiveness_kpis k where trim(k.code)='E3-K1' and (select id from academic_years where extract(year from start_date)::int = 2025) is not null
on conflict (indicator_id, academic_year_id) do update set value=excluded.value, operator=excluded.operator;

insert into indicator_targets (indicator_id, academic_year_id, value, operator, note)
select k.id, (select id from academic_years where extract(year from start_date)::int = 2026), 85, '>=', 'Curva del ciclo 2023-2028'
  from effectiveness_kpis k where trim(k.code)='E3-K1' and (select id from academic_years where extract(year from start_date)::int = 2026) is not null
on conflict (indicator_id, academic_year_id) do update set value=excluded.value, operator=excluded.operator;

insert into indicator_targets (indicator_id, academic_year_id, value, operator, note)
select k.id, (select id from academic_years where extract(year from start_date)::int = 2027), 88, '>=', 'Curva del ciclo 2023-2028'
  from effectiveness_kpis k where trim(k.code)='E3-K1' and (select id from academic_years where extract(year from start_date)::int = 2027) is not null
on conflict (indicator_id, academic_year_id) do update set value=excluded.value, operator=excluded.operator;

insert into indicator_results (indicator_id, academic_year_id, period, value, source, status, note)
select k.id, (select id from academic_years where extract(year from start_date)::int = 2024), 'anual', 78, 'manual', null, '78%'
  from effectiveness_kpis k where trim(k.code)='E3-K1' and (select id from academic_years where extract(year from start_date)::int = 2024) is not null
on conflict (indicator_id, academic_year_id, period)
do update set value=excluded.value, status=excluded.status, note=excluded.note;

insert into indicator_results (indicator_id, academic_year_id, period, value, source, status, note)
select k.id, (select id from academic_years where extract(year from start_date)::int = 2025), 'anual', 92, 'manual', 'cumplido', '92%'
  from effectiveness_kpis k where trim(k.code)='E3-K1' and (select id from academic_years where extract(year from start_date)::int = 2025) is not null
on conflict (indicator_id, academic_year_id, period)
do update set value=excluded.value, status=excluded.status, note=excluded.note;

insert into indicator_evidence (indicator_id, academic_year_id, label, pending, uploaded_by)
select k.id, (select id from academic_years where extract(year from start_date)::int = 2025), '112 Encuestados al 14-julio-2026 neutral 19 satisfecho 38 muy satisfecho 46 Resultados:SAT 2026 Encuesta de Satisfacción del Estudiante: https://drive.google.com/file/d/1-gc200lhqIkFpIu_1PCzfQ1sei025df3/view?usp=drive_link', true, 'Reporte estratégico 2025-2026'
  from effectiveness_kpis k where trim(k.code)='E3-K1' and (select id from academic_years where extract(year from start_date)::int = 2025) is not null
   and not exists (select 1 from indicator_evidence e where e.indicator_id=k.id and e.label='112 Encuestados al 14-julio-2026 neutral 19 satisfecho 38 muy satisfecho 46 Resultados:SAT 2026 Encuesta de Satisfacción del Estudiante: https://drive.google.com/file/d/1-gc200lhqIkFpIu_1PCzfQ1sei025df3/view?usp=drive_link');

-- E3-K2 · Staff capacitado
insert into effectiveness_kpis (code, name, level, value_type, unit, owner_plan, data_source, frequency, source, scope)
select 'E3-K2', 'Staff capacitado', 'institucional', 'porcentaje', 'porcentaje', 'estrategico',
       'HR records', 'anual', 'manual', 'KPI del Plan Estratégico 2023-2028'
 where not exists (select 1 from effectiveness_kpis where trim(code)='E3-K2');

insert into strategic_plan_kpis (cycle_id, kpi_id, objective_id, owner_label)
select c.id, k.id, o.id, 'Yajayra'
  from strategic_plan_cycles c, effectiveness_kpis k
  left join strategic_objectives o on o.code = 'O3' and o.status='active'
 where c.status='active' and trim(k.code)='E3-K2'
on conflict (cycle_id, kpi_id) do nothing;

insert into indicator_composition (parent_id, child_id)
select p.id, c.id from effectiveness_kpis p, effectiveness_kpis c
 where trim(p.code)='E3-K2' and trim(c.code)='E3-S02' on conflict do nothing;

insert into indicator_targets (indicator_id, academic_year_id, value, operator, note)
select k.id, (select id from academic_years where extract(year from start_date)::int = 2025), 80, '>=', 'Curva del ciclo 2023-2028'
  from effectiveness_kpis k where trim(k.code)='E3-K2' and (select id from academic_years where extract(year from start_date)::int = 2025) is not null
on conflict (indicator_id, academic_year_id) do update set value=excluded.value, operator=excluded.operator;

insert into indicator_targets (indicator_id, academic_year_id, value, operator, note)
select k.id, (select id from academic_years where extract(year from start_date)::int = 2026), 90, '>=', 'Curva del ciclo 2023-2028'
  from effectiveness_kpis k where trim(k.code)='E3-K2' and (select id from academic_years where extract(year from start_date)::int = 2026) is not null
on conflict (indicator_id, academic_year_id) do update set value=excluded.value, operator=excluded.operator;

insert into indicator_targets (indicator_id, academic_year_id, value, operator, note)
select k.id, (select id from academic_years where extract(year from start_date)::int = 2027), 95, '>=', 'Curva del ciclo 2023-2028'
  from effectiveness_kpis k where trim(k.code)='E3-K2' and (select id from academic_years where extract(year from start_date)::int = 2027) is not null
on conflict (indicator_id, academic_year_id) do update set value=excluded.value, operator=excluded.operator;

insert into indicator_results (indicator_id, academic_year_id, period, value, source, status, note)
select k.id, (select id from academic_years where extract(year from start_date)::int = 2024), 'anual', 65, 'manual', null, '65%'
  from effectiveness_kpis k where trim(k.code)='E3-K2' and (select id from academic_years where extract(year from start_date)::int = 2024) is not null
on conflict (indicator_id, academic_year_id, period)
do update set value=excluded.value, status=excluded.status, note=excluded.note;

insert into indicator_results (indicator_id, academic_year_id, period, value, source, status, note)
select k.id, (select id from academic_years where extract(year from start_date)::int = 2025), 'anual', 93, 'manual', 'cumplido', '93%'
  from effectiveness_kpis k where trim(k.code)='E3-K2' and (select id from academic_years where extract(year from start_date)::int = 2025) is not null
on conflict (indicator_id, academic_year_id, period)
do update set value=excluded.value, status=excluded.status, note=excluded.note;

insert into indicator_evidence (indicator_id, academic_year_id, label, pending, uploaded_by)
select k.id, (select id from academic_years where extract(year from start_date)::int = 2025), 'Informe con corte a Junio 2026 - 93,33%: Informe del Indicado 3.6 - Capacitación Administrativa', true, 'Reporte estratégico 2025-2026'
  from effectiveness_kpis k where trim(k.code)='E3-K2' and (select id from academic_years where extract(year from start_date)::int = 2025) is not null
   and not exists (select 1 from indicator_evidence e where e.indicator_id=k.id and e.label='Informe con corte a Junio 2026 - 93,33%: Informe del Indicado 3.6 - Capacitación Administrativa');

-- E3-K3 · Resolución en primer contacto
insert into effectiveness_kpis (code, name, level, value_type, unit, owner_plan, data_source, frequency, source, scope)
select 'E3-K3', 'Resolución en primer contacto', 'institucional', 'porcentaje', 'porcentaje', 'estrategico',
       'Ticketing', 'anual', 'manual', 'KPI del Plan Estratégico 2023-2028'
 where not exists (select 1 from effectiveness_kpis where trim(code)='E3-K3');

insert into strategic_plan_kpis (cycle_id, kpi_id, objective_id, owner_label)
select c.id, k.id, o.id, 'Marisol'
  from strategic_plan_cycles c, effectiveness_kpis k
  left join strategic_objectives o on o.code = 'O3' and o.status='active'
 where c.status='active' and trim(k.code)='E3-K3'
on conflict (cycle_id, kpi_id) do nothing;

insert into indicator_composition (parent_id, child_id)
select p.id, c.id from effectiveness_kpis p, effectiveness_kpis c
 where trim(p.code)='E3-K3' and trim(c.code)='E3-O01' on conflict do nothing;

insert into indicator_targets (indicator_id, academic_year_id, value, operator, note)
select k.id, (select id from academic_years where extract(year from start_date)::int = 2025), 70, '>=', 'Curva del ciclo 2023-2028'
  from effectiveness_kpis k where trim(k.code)='E3-K3' and (select id from academic_years where extract(year from start_date)::int = 2025) is not null
on conflict (indicator_id, academic_year_id) do update set value=excluded.value, operator=excluded.operator;

insert into indicator_targets (indicator_id, academic_year_id, value, operator, note)
select k.id, (select id from academic_years where extract(year from start_date)::int = 2026), 78, '>=', 'Curva del ciclo 2023-2028'
  from effectiveness_kpis k where trim(k.code)='E3-K3' and (select id from academic_years where extract(year from start_date)::int = 2026) is not null
on conflict (indicator_id, academic_year_id) do update set value=excluded.value, operator=excluded.operator;

insert into indicator_targets (indicator_id, academic_year_id, value, operator, note)
select k.id, (select id from academic_years where extract(year from start_date)::int = 2027), 82, '>=', 'Curva del ciclo 2023-2028'
  from effectiveness_kpis k where trim(k.code)='E3-K3' and (select id from academic_years where extract(year from start_date)::int = 2027) is not null
on conflict (indicator_id, academic_year_id) do update set value=excluded.value, operator=excluded.operator;

insert into indicator_results (indicator_id, academic_year_id, period, value, source, status, note)
select k.id, (select id from academic_years where extract(year from start_date)::int = 2024), 'anual', 60, 'manual', null, '60%'
  from effectiveness_kpis k where trim(k.code)='E3-K3' and (select id from academic_years where extract(year from start_date)::int = 2024) is not null
on conflict (indicator_id, academic_year_id, period)
do update set value=excluded.value, status=excluded.status, note=excluded.note;

insert into indicator_results (indicator_id, academic_year_id, period, value, source, status, note)
select k.id, (select id from academic_years where extract(year from start_date)::int = 2025), 'anual', 0, 'manual', 'no_cumplido', '0'
  from effectiveness_kpis k where trim(k.code)='E3-K3' and (select id from academic_years where extract(year from start_date)::int = 2025) is not null
on conflict (indicator_id, academic_year_id, period)
do update set value=excluded.value, status=excluded.status, note=excluded.note;

-- E3-K4 · Tiempo medio de respuesta
insert into effectiveness_kpis (code, name, level, value_type, unit, owner_plan, data_source, frequency, source, scope)
select 'E3-K4', 'Tiempo medio de respuesta', 'institucional', 'decimal', 'horas', 'estrategico',
       'Ticketing', 'anual', 'manual', 'KPI del Plan Estratégico 2023-2028'
 where not exists (select 1 from effectiveness_kpis where trim(code)='E3-K4');

insert into strategic_plan_kpis (cycle_id, kpi_id, objective_id, owner_label)
select c.id, k.id, o.id, 'Marisol'
  from strategic_plan_cycles c, effectiveness_kpis k
  left join strategic_objectives o on o.code = 'O3' and o.status='active'
 where c.status='active' and trim(k.code)='E3-K4'
on conflict (cycle_id, kpi_id) do nothing;

insert into indicator_composition (parent_id, child_id)
select p.id, c.id from effectiveness_kpis p, effectiveness_kpis c
 where trim(p.code)='E3-K4' and trim(c.code)='E3-O02' on conflict do nothing;

insert into indicator_targets (indicator_id, academic_year_id, value, operator, note)
select k.id, (select id from academic_years where extract(year from start_date)::int = 2025), 6, '<=', 'Curva del ciclo 2023-2028'
  from effectiveness_kpis k where trim(k.code)='E3-K4' and (select id from academic_years where extract(year from start_date)::int = 2025) is not null
on conflict (indicator_id, academic_year_id) do update set value=excluded.value, operator=excluded.operator;

insert into indicator_targets (indicator_id, academic_year_id, value, operator, note)
select k.id, (select id from academic_years where extract(year from start_date)::int = 2026), 4, '<=', 'Curva del ciclo 2023-2028'
  from effectiveness_kpis k where trim(k.code)='E3-K4' and (select id from academic_years where extract(year from start_date)::int = 2026) is not null
on conflict (indicator_id, academic_year_id) do update set value=excluded.value, operator=excluded.operator;

insert into indicator_targets (indicator_id, academic_year_id, value, operator, note)
select k.id, (select id from academic_years where extract(year from start_date)::int = 2027), 3, '<=', 'Curva del ciclo 2023-2028'
  from effectiveness_kpis k where trim(k.code)='E3-K4' and (select id from academic_years where extract(year from start_date)::int = 2027) is not null
on conflict (indicator_id, academic_year_id) do update set value=excluded.value, operator=excluded.operator;

insert into indicator_results (indicator_id, academic_year_id, period, value, source, status, note)
select k.id, (select id from academic_years where extract(year from start_date)::int = 2024), 'anual', 12, 'manual', null, '12 h'
  from effectiveness_kpis k where trim(k.code)='E3-K4' and (select id from academic_years where extract(year from start_date)::int = 2024) is not null
on conflict (indicator_id, academic_year_id, period)
do update set value=excluded.value, status=excluded.status, note=excluded.note;

insert into indicator_results (indicator_id, academic_year_id, period, value, source, status, note)
select k.id, (select id from academic_years where extract(year from start_date)::int = 2025), 'anual', 0, 'manual', 'no_cumplido', '0'
  from effectiveness_kpis k where trim(k.code)='E3-K4' and (select id from academic_years where extract(year from start_date)::int = 2025) is not null
on conflict (indicator_id, academic_year_id, period)
do update set value=excluded.value, status=excluded.status, note=excluded.note;

-- E4-K1 · Uptime de sistemas críticos
insert into effectiveness_kpis (code, name, level, value_type, unit, owner_plan, data_source, frequency, source, scope)
select 'E4-K1', 'Uptime de sistemas críticos', 'institucional', 'porcentaje', 'porcentaje', 'estrategico',
       'IT monitoring', 'anual', 'manual', 'KPI del Plan Estratégico 2023-2028'
 where not exists (select 1 from effectiveness_kpis where trim(code)='E4-K1');

insert into strategic_plan_kpis (cycle_id, kpi_id, objective_id, owner_label)
select c.id, k.id, o.id, 'Anthony Robles'
  from strategic_plan_cycles c, effectiveness_kpis k
  left join strategic_objectives o on o.code = 'O4' and o.status='active'
 where c.status='active' and trim(k.code)='E4-K1'
on conflict (cycle_id, kpi_id) do nothing;

insert into indicator_composition (parent_id, child_id)
select p.id, c.id from effectiveness_kpis p, effectiveness_kpis c
 where trim(p.code)='E4-K1' and trim(c.code)='E4-S01' on conflict do nothing;

insert into indicator_targets (indicator_id, academic_year_id, value, operator, note)
select k.id, (select id from academic_years where extract(year from start_date)::int = 2025), 99.9, '>=', 'Curva del ciclo 2023-2028'
  from effectiveness_kpis k where trim(k.code)='E4-K1' and (select id from academic_years where extract(year from start_date)::int = 2025) is not null
on conflict (indicator_id, academic_year_id) do update set value=excluded.value, operator=excluded.operator;

insert into indicator_targets (indicator_id, academic_year_id, value, operator, note)
select k.id, (select id from academic_years where extract(year from start_date)::int = 2026), 99.95, '>=', 'Curva del ciclo 2023-2028'
  from effectiveness_kpis k where trim(k.code)='E4-K1' and (select id from academic_years where extract(year from start_date)::int = 2026) is not null
on conflict (indicator_id, academic_year_id) do update set value=excluded.value, operator=excluded.operator;

insert into indicator_targets (indicator_id, academic_year_id, value, operator, note)
select k.id, (select id from academic_years where extract(year from start_date)::int = 2027), 99.95, '>=', 'Curva del ciclo 2023-2028'
  from effectiveness_kpis k where trim(k.code)='E4-K1' and (select id from academic_years where extract(year from start_date)::int = 2027) is not null
on conflict (indicator_id, academic_year_id) do update set value=excluded.value, operator=excluded.operator;

insert into indicator_results (indicator_id, academic_year_id, period, value, source, status, note)
select k.id, (select id from academic_years where extract(year from start_date)::int = 2023), 'anual', 99.2, 'manual', null, '99.2%'
  from effectiveness_kpis k where trim(k.code)='E4-K1' and (select id from academic_years where extract(year from start_date)::int = 2023) is not null
on conflict (indicator_id, academic_year_id, period)
do update set value=excluded.value, status=excluded.status, note=excluded.note;

insert into indicator_results (indicator_id, academic_year_id, period, value, source, status, note)
select k.id, (select id from academic_years where extract(year from start_date)::int = 2024), 'anual', 99.5, 'manual', null, '99.5%'
  from effectiveness_kpis k where trim(k.code)='E4-K1' and (select id from academic_years where extract(year from start_date)::int = 2024) is not null
on conflict (indicator_id, academic_year_id, period)
do update set value=excluded.value, status=excluded.status, note=excluded.note;

insert into indicator_results (indicator_id, academic_year_id, period, value, source, status, note)
select k.id, (select id from academic_years where extract(year from start_date)::int = 2025), 'anual', 99.99, 'manual', 'cumplido', 'Campus LMS = 99,99% Activa = 99,99%'
  from effectiveness_kpis k where trim(k.code)='E4-K1' and (select id from academic_years where extract(year from start_date)::int = 2025) is not null
on conflict (indicator_id, academic_year_id, period)
do update set value=excluded.value, status=excluded.status, note=excluded.note;

insert into indicator_evidence (indicator_id, academic_year_id, label, pending, uploaded_by)
select k.id, (select id from academic_years where extract(year from start_date)::int = 2025), 'https://support.blackwell.university/Uptime/', true, 'Reporte estratégico 2025-2026'
  from effectiveness_kpis k where trim(k.code)='E4-K1' and (select id from academic_years where extract(year from start_date)::int = 2025) is not null
   and not exists (select 1 from indicator_evidence e where e.indicator_id=k.id and e.label='https://support.blackwell.university/Uptime/');

-- E4-K2 · Incidentes críticos de seguridad
insert into effectiveness_kpis (code, name, level, value_type, unit, owner_plan, data_source, frequency, source, scope)
select 'E4-K2', 'Incidentes críticos de seguridad', 'institucional', 'decimal', null, 'estrategico',
       'Security logs', 'anual', 'manual', 'KPI del Plan Estratégico 2023-2028'
 where not exists (select 1 from effectiveness_kpis where trim(code)='E4-K2');

insert into strategic_plan_kpis (cycle_id, kpi_id, objective_id, owner_label)
select c.id, k.id, o.id, 'Anthony Robles'
  from strategic_plan_cycles c, effectiveness_kpis k
  left join strategic_objectives o on o.code = 'O4' and o.status='active'
 where c.status='active' and trim(k.code)='E4-K2'
on conflict (cycle_id, kpi_id) do nothing;

insert into indicator_composition (parent_id, child_id)
select p.id, c.id from effectiveness_kpis p, effectiveness_kpis c
 where trim(p.code)='E4-K2' and trim(c.code)='E4-S02' on conflict do nothing;

insert into indicator_targets (indicator_id, academic_year_id, value, operator, note)
select k.id, (select id from academic_years where extract(year from start_date)::int = 2025), 0, '<=', 'Curva del ciclo 2023-2028'
  from effectiveness_kpis k where trim(k.code)='E4-K2' and (select id from academic_years where extract(year from start_date)::int = 2025) is not null
on conflict (indicator_id, academic_year_id) do update set value=excluded.value, operator=excluded.operator;

insert into indicator_targets (indicator_id, academic_year_id, value, operator, note)
select k.id, (select id from academic_years where extract(year from start_date)::int = 2026), 0, '<=', 'Curva del ciclo 2023-2028'
  from effectiveness_kpis k where trim(k.code)='E4-K2' and (select id from academic_years where extract(year from start_date)::int = 2026) is not null
on conflict (indicator_id, academic_year_id) do update set value=excluded.value, operator=excluded.operator;

insert into indicator_targets (indicator_id, academic_year_id, value, operator, note)
select k.id, (select id from academic_years where extract(year from start_date)::int = 2027), 0, '<=', 'Curva del ciclo 2023-2028'
  from effectiveness_kpis k where trim(k.code)='E4-K2' and (select id from academic_years where extract(year from start_date)::int = 2027) is not null
on conflict (indicator_id, academic_year_id) do update set value=excluded.value, operator=excluded.operator;

insert into indicator_results (indicator_id, academic_year_id, period, value, source, status, note)
select k.id, (select id from academic_years where extract(year from start_date)::int = 2023), 'anual', 0, 'manual', null, '0 reportados*'
  from effectiveness_kpis k where trim(k.code)='E4-K2' and (select id from academic_years where extract(year from start_date)::int = 2023) is not null
on conflict (indicator_id, academic_year_id, period)
do update set value=excluded.value, status=excluded.status, note=excluded.note;

insert into indicator_results (indicator_id, academic_year_id, period, value, source, status, note)
select k.id, (select id from academic_years where extract(year from start_date)::int = 2024), 'anual', 1, 'manual', null, '1'
  from effectiveness_kpis k where trim(k.code)='E4-K2' and (select id from academic_years where extract(year from start_date)::int = 2024) is not null
on conflict (indicator_id, academic_year_id, period)
do update set value=excluded.value, status=excluded.status, note=excluded.note;

insert into indicator_results (indicator_id, academic_year_id, period, value, source, status, note)
select k.id, (select id from academic_years where extract(year from start_date)::int = 2025), 'anual', 0, 'manual', 'cumplido', '0'
  from effectiveness_kpis k where trim(k.code)='E4-K2' and (select id from academic_years where extract(year from start_date)::int = 2025) is not null
on conflict (indicator_id, academic_year_id, period)
do update set value=excluded.value, status=excluded.status, note=excluded.note;

insert into indicator_evidence (indicator_id, academic_year_id, label, pending, uploaded_by)
select k.id, (select id from academic_years where extract(year from start_date)::int = 2025), 'Consulta referente a Incidentes críticos de seguridad - BGU 2025 - 2026.pdf', true, 'Reporte estratégico 2025-2026'
  from effectiveness_kpis k where trim(k.code)='E4-K2' and (select id from academic_years where extract(year from start_date)::int = 2025) is not null
   and not exists (select 1 from indicator_evidence e where e.indicator_id=k.id and e.label='Consulta referente a Incidentes críticos de seguridad - BGU 2025 - 2026.pdf');

-- E4-K3 · Procesos automatizados acumulados
insert into effectiveness_kpis (code, name, level, value_type, unit, owner_plan, data_source, frequency, source, scope)
select 'E4-K3', 'Procesos automatizados acumulados', 'institucional', 'decimal', null, 'estrategico',
       'IT / process owners', 'anual', 'manual', 'KPI del Plan Estratégico 2023-2028'
 where not exists (select 1 from effectiveness_kpis where trim(code)='E4-K3');

insert into strategic_plan_kpis (cycle_id, kpi_id, objective_id, owner_label)
select c.id, k.id, o.id, 'Anthony Robles'
  from strategic_plan_cycles c, effectiveness_kpis k
  left join strategic_objectives o on o.code = 'O4' and o.status='active'
 where c.status='active' and trim(k.code)='E4-K3'
on conflict (cycle_id, kpi_id) do nothing;

insert into indicator_composition (parent_id, child_id)
select p.id, c.id from effectiveness_kpis p, effectiveness_kpis c
 where trim(p.code)='E4-K3' and trim(c.code)='E4-O01' on conflict do nothing;

insert into indicator_targets (indicator_id, academic_year_id, value, operator, note)
select k.id, (select id from academic_years where extract(year from start_date)::int = 2025), 10, '>=', 'Curva del ciclo 2023-2028'
  from effectiveness_kpis k where trim(k.code)='E4-K3' and (select id from academic_years where extract(year from start_date)::int = 2025) is not null
on conflict (indicator_id, academic_year_id) do update set value=excluded.value, operator=excluded.operator;

insert into indicator_targets (indicator_id, academic_year_id, value, operator, note)
select k.id, (select id from academic_years where extract(year from start_date)::int = 2026), 18, '>=', 'Curva del ciclo 2023-2028'
  from effectiveness_kpis k where trim(k.code)='E4-K3' and (select id from academic_years where extract(year from start_date)::int = 2026) is not null
on conflict (indicator_id, academic_year_id) do update set value=excluded.value, operator=excluded.operator;

insert into indicator_targets (indicator_id, academic_year_id, value, operator, note)
select k.id, (select id from academic_years where extract(year from start_date)::int = 2027), 25, '>=', 'Curva del ciclo 2023-2028'
  from effectiveness_kpis k where trim(k.code)='E4-K3' and (select id from academic_years where extract(year from start_date)::int = 2027) is not null
on conflict (indicator_id, academic_year_id) do update set value=excluded.value, operator=excluded.operator;

insert into indicator_results (indicator_id, academic_year_id, period, value, source, status, note)
select k.id, (select id from academic_years where extract(year from start_date)::int = 2024), 'anual', 5, 'manual', null, '5'
  from effectiveness_kpis k where trim(k.code)='E4-K3' and (select id from academic_years where extract(year from start_date)::int = 2024) is not null
on conflict (indicator_id, academic_year_id, period)
do update set value=excluded.value, status=excluded.status, note=excluded.note;

insert into indicator_results (indicator_id, academic_year_id, period, value, source, status, note)
select k.id, (select id from academic_years where extract(year from start_date)::int = 2025), 'anual', 15, 'manual', 'cumplido', '15'
  from effectiveness_kpis k where trim(k.code)='E4-K3' and (select id from academic_years where extract(year from start_date)::int = 2025) is not null
on conflict (indicator_id, academic_year_id, period)
do update set value=excluded.value, status=excluded.status, note=excluded.note;

insert into indicator_evidence (indicator_id, academic_year_id, label, pending, uploaded_by)
select k.id, (select id from academic_years where extract(year from start_date)::int = 2025), '1) Formularios Admision Acreditación 2) Proyecto Capstone 3) Chatfuel Master / doctorado / Licenciatura 4) Chatfuel DCE 5) ORA IA BGU 6) Trabajos finales 7) Sesiones Eurocoach 8) Sesiones Mentoring 9) Activa Student / Admin 10) Reporte de Consolidado de Deudas y Recaudación de la Empresa por fechas.', true, 'Reporte estratégico 2025-2026'
  from effectiveness_kpis k where trim(k.code)='E4-K3' and (select id from academic_years where extract(year from start_date)::int = 2025) is not null
   and not exists (select 1 from indicator_evidence e where e.indicator_id=k.id and e.label='1) Formularios Admision Acreditación 2) Proyecto Capstone 3) Chatfuel Master / doctorado / Licenciatura 4) Chatfuel DCE 5) ORA IA BGU 6) Trabajos finales 7) Sesiones Eurocoach 8) Sesiones Mentoring 9) Activa Student / Admin 10) Reporte de Consolidado de Deudas y Recaudación de la Empresa por fechas.');

-- E4-K4 · Satisfacción tecnológica (1-5)
insert into effectiveness_kpis (code, name, level, value_type, unit, owner_plan, data_source, frequency, source, scope)
select 'E4-K4', 'Satisfacción tecnológica (1-5)', 'institucional', 'decimal', 'puntos (1-5)', 'estrategico',
       'Student survey', 'anual', 'manual', 'KPI del Plan Estratégico 2023-2028'
 where not exists (select 1 from effectiveness_kpis where trim(code)='E4-K4');

insert into strategic_plan_kpis (cycle_id, kpi_id, objective_id, owner_label)
select c.id, k.id, o.id, 'Anthony Robles'
  from strategic_plan_cycles c, effectiveness_kpis k
  left join strategic_objectives o on o.code = 'O4' and o.status='active'
 where c.status='active' and trim(k.code)='E4-K4'
on conflict (cycle_id, kpi_id) do nothing;

insert into indicator_composition (parent_id, child_id)
select p.id, c.id from effectiveness_kpis p, effectiveness_kpis c
 where trim(p.code)='E4-K4' and trim(c.code)='E4-I01' on conflict do nothing;

insert into indicator_composition (parent_id, child_id)
select p.id, c.id from effectiveness_kpis p, effectiveness_kpis c
 where trim(p.code)='E4-K4' and trim(c.code)='E4-O02' on conflict do nothing;

insert into indicator_targets (indicator_id, academic_year_id, value, operator, note)
select k.id, (select id from academic_years where extract(year from start_date)::int = 2025), 4, '>=', 'Curva del ciclo 2023-2028'
  from effectiveness_kpis k where trim(k.code)='E4-K4' and (select id from academic_years where extract(year from start_date)::int = 2025) is not null
on conflict (indicator_id, academic_year_id) do update set value=excluded.value, operator=excluded.operator;

insert into indicator_targets (indicator_id, academic_year_id, value, operator, note)
select k.id, (select id from academic_years where extract(year from start_date)::int = 2026), 4.2, '>=', 'Curva del ciclo 2023-2028'
  from effectiveness_kpis k where trim(k.code)='E4-K4' and (select id from academic_years where extract(year from start_date)::int = 2026) is not null
on conflict (indicator_id, academic_year_id) do update set value=excluded.value, operator=excluded.operator;

insert into indicator_targets (indicator_id, academic_year_id, value, operator, note)
select k.id, (select id from academic_years where extract(year from start_date)::int = 2027), 4.4, '>=', 'Curva del ciclo 2023-2028'
  from effectiveness_kpis k where trim(k.code)='E4-K4' and (select id from academic_years where extract(year from start_date)::int = 2027) is not null
on conflict (indicator_id, academic_year_id) do update set value=excluded.value, operator=excluded.operator;

insert into indicator_results (indicator_id, academic_year_id, period, value, source, status, note)
select k.id, (select id from academic_years where extract(year from start_date)::int = 2024), 'anual', 3.6, 'manual', null, '3.6'
  from effectiveness_kpis k where trim(k.code)='E4-K4' and (select id from academic_years where extract(year from start_date)::int = 2024) is not null
on conflict (indicator_id, academic_year_id, period)
do update set value=excluded.value, status=excluded.status, note=excluded.note;

insert into indicator_results (indicator_id, academic_year_id, period, value, source, status, note)
select k.id, (select id from academic_years where extract(year from start_date)::int = 2025), 'anual', 3.97, 'manual', 'parcial', '3,97'
  from effectiveness_kpis k where trim(k.code)='E4-K4' and (select id from academic_years where extract(year from start_date)::int = 2025) is not null
on conflict (indicator_id, academic_year_id, period)
do update set value=excluded.value, status=excluded.status, note=excluded.note;

insert into indicator_evidence (indicator_id, academic_year_id, label, pending, uploaded_by)
select k.id, (select id from academic_years where extract(year from start_date)::int = 2025), 'https://support.blackwell.university/tech-infrastructure-reports/', true, 'Reporte estratégico 2025-2026'
  from effectiveness_kpis k where trim(k.code)='E4-K4' and (select id from academic_years where extract(year from start_date)::int = 2025) is not null
   and not exists (select 1 from indicator_evidence e where e.indicator_id=k.id and e.label='https://support.blackwell.university/tech-infrastructure-reports/');

-- E5-K1 · Acuerdos/membresías activos
insert into effectiveness_kpis (code, name, level, value_type, unit, owner_plan, data_source, frequency, source, scope)
select 'E5-K1', 'Acuerdos/membresías activos', 'institucional', 'decimal', null, 'estrategico',
       'Partnership register', 'anual', 'manual', 'KPI del Plan Estratégico 2023-2028'
 where not exists (select 1 from effectiveness_kpis where trim(code)='E5-K1');

insert into strategic_plan_kpis (cycle_id, kpi_id, objective_id, owner_label)
select c.id, k.id, o.id, 'Ronald'
  from strategic_plan_cycles c, effectiveness_kpis k
  left join strategic_objectives o on o.code = 'O5' and o.status='active'
 where c.status='active' and trim(k.code)='E5-K1'
on conflict (cycle_id, kpi_id) do nothing;

insert into indicator_composition (parent_id, child_id)
select p.id, c.id from effectiveness_kpis p, effectiveness_kpis c
 where trim(p.code)='E5-K1' and trim(c.code)='E5-O01' on conflict do nothing;

insert into indicator_targets (indicator_id, academic_year_id, value, operator, note)
select k.id, (select id from academic_years where extract(year from start_date)::int = 2025), 12, '>=', 'Curva del ciclo 2023-2028'
  from effectiveness_kpis k where trim(k.code)='E5-K1' and (select id from academic_years where extract(year from start_date)::int = 2025) is not null
on conflict (indicator_id, academic_year_id) do update set value=excluded.value, operator=excluded.operator;

insert into indicator_targets (indicator_id, academic_year_id, value, operator, note)
select k.id, (select id from academic_years where extract(year from start_date)::int = 2026), 18, '>=', 'Curva del ciclo 2023-2028'
  from effectiveness_kpis k where trim(k.code)='E5-K1' and (select id from academic_years where extract(year from start_date)::int = 2026) is not null
on conflict (indicator_id, academic_year_id) do update set value=excluded.value, operator=excluded.operator;

insert into indicator_targets (indicator_id, academic_year_id, value, operator, note)
select k.id, (select id from academic_years where extract(year from start_date)::int = 2027), 25, '>=', 'Curva del ciclo 2023-2028'
  from effectiveness_kpis k where trim(k.code)='E5-K1' and (select id from academic_years where extract(year from start_date)::int = 2027) is not null
on conflict (indicator_id, academic_year_id) do update set value=excluded.value, operator=excluded.operator;

insert into indicator_results (indicator_id, academic_year_id, period, value, source, status, note)
select k.id, (select id from academic_years where extract(year from start_date)::int = 2023), 'anual', 2, 'manual', null, '2*'
  from effectiveness_kpis k where trim(k.code)='E5-K1' and (select id from academic_years where extract(year from start_date)::int = 2023) is not null
on conflict (indicator_id, academic_year_id, period)
do update set value=excluded.value, status=excluded.status, note=excluded.note;

insert into indicator_results (indicator_id, academic_year_id, period, value, source, status, note)
select k.id, (select id from academic_years where extract(year from start_date)::int = 2024), 'anual', 7, 'manual', null, '7'
  from effectiveness_kpis k where trim(k.code)='E5-K1' and (select id from academic_years where extract(year from start_date)::int = 2024) is not null
on conflict (indicator_id, academic_year_id, period)
do update set value=excluded.value, status=excluded.status, note=excluded.note;

insert into indicator_results (indicator_id, academic_year_id, period, value, source, status, note)
select k.id, (select id from academic_years where extract(year from start_date)::int = 2025), 'anual', 14, 'manual', 'cumplido', '14'
  from effectiveness_kpis k where trim(k.code)='E5-K1' and (select id from academic_years where extract(year from start_date)::int = 2025) is not null
on conflict (indicator_id, academic_year_id, period)
do update set value=excluded.value, status=excluded.status, note=excluded.note;

insert into indicator_evidence (indicator_id, academic_year_id, label, pending, uploaded_by)
select k.id, (select id from academic_years where extract(year from start_date)::int = 2025), 'Membresias activas BGU', true, 'Reporte estratégico 2025-2026'
  from effectiveness_kpis k where trim(k.code)='E5-K1' and (select id from academic_years where extract(year from start_date)::int = 2025) is not null
   and not exists (select 1 from indicator_evidence e where e.indicator_id=k.id and e.label='Membresias activas BGU');

-- E5-K2 · Convenios con impacto documentado
insert into effectiveness_kpis (code, name, level, value_type, unit, owner_plan, data_source, frequency, source, scope)
select 'E5-K2', 'Convenios con impacto documentado', 'institucional', 'porcentaje', 'porcentaje', 'estrategico',
       'Agreement reports', 'anual', 'manual', 'KPI del Plan Estratégico 2023-2028'
 where not exists (select 1 from effectiveness_kpis where trim(code)='E5-K2');

insert into strategic_plan_kpis (cycle_id, kpi_id, objective_id, owner_label)
select c.id, k.id, o.id, 'Antony Huaynapata'
  from strategic_plan_cycles c, effectiveness_kpis k
  left join strategic_objectives o on o.code = 'O5' and o.status='active'
 where c.status='active' and trim(k.code)='E5-K2'
on conflict (cycle_id, kpi_id) do nothing;

insert into indicator_composition (parent_id, child_id)
select p.id, c.id from effectiveness_kpis p, effectiveness_kpis c
 where trim(p.code)='E5-K2' and trim(c.code)='E5-S01' on conflict do nothing;

insert into indicator_targets (indicator_id, academic_year_id, value, operator, note)
select k.id, (select id from academic_years where extract(year from start_date)::int = 2025), 55, '>=', 'Curva del ciclo 2023-2028'
  from effectiveness_kpis k where trim(k.code)='E5-K2' and (select id from academic_years where extract(year from start_date)::int = 2025) is not null
on conflict (indicator_id, academic_year_id) do update set value=excluded.value, operator=excluded.operator;

insert into indicator_targets (indicator_id, academic_year_id, value, operator, note)
select k.id, (select id from academic_years where extract(year from start_date)::int = 2026), 70, '>=', 'Curva del ciclo 2023-2028'
  from effectiveness_kpis k where trim(k.code)='E5-K2' and (select id from academic_years where extract(year from start_date)::int = 2026) is not null
on conflict (indicator_id, academic_year_id) do update set value=excluded.value, operator=excluded.operator;

insert into indicator_targets (indicator_id, academic_year_id, value, operator, note)
select k.id, (select id from academic_years where extract(year from start_date)::int = 2027), 80, '>=', 'Curva del ciclo 2023-2028'
  from effectiveness_kpis k where trim(k.code)='E5-K2' and (select id from academic_years where extract(year from start_date)::int = 2027) is not null
on conflict (indicator_id, academic_year_id) do update set value=excluded.value, operator=excluded.operator;

insert into indicator_results (indicator_id, academic_year_id, period, value, source, status, note)
select k.id, (select id from academic_years where extract(year from start_date)::int = 2024), 'anual', 40, 'manual', null, '40%'
  from effectiveness_kpis k where trim(k.code)='E5-K2' and (select id from academic_years where extract(year from start_date)::int = 2024) is not null
on conflict (indicator_id, academic_year_id, period)
do update set value=excluded.value, status=excluded.status, note=excluded.note;

insert into indicator_results (indicator_id, academic_year_id, period, value, source, status, note)
select k.id, (select id from academic_years where extract(year from start_date)::int = 2025), 'anual', 46.53, 'manual', 'parcial', '46,53%'
  from effectiveness_kpis k where trim(k.code)='E5-K2' and (select id from academic_years where extract(year from start_date)::int = 2025) is not null
on conflict (indicator_id, academic_year_id, period)
do update set value=excluded.value, status=excluded.status, note=excluded.note;

insert into indicator_evidence (indicator_id, academic_year_id, label, pending, uploaded_by)
select k.id, (select id from academic_years where extract(year from start_date)::int = 2025), 'SEGUIMIENTO - VENTAS DE ACUERDOS', true, 'Reporte estratégico 2025-2026'
  from effectiveness_kpis k where trim(k.code)='E5-K2' and (select id from academic_years where extract(year from start_date)::int = 2025) is not null
   and not exists (select 1 from indicator_evidence e where e.indicator_id=k.id and e.label='SEGUIMIENTO - VENTAS DE ACUERDOS');

-- E5-K3 · Placement/progreso profesional
insert into effectiveness_kpis (code, name, level, value_type, unit, owner_plan, data_source, frequency, source, scope)
select 'E5-K3', 'Placement/progreso profesional', 'institucional', 'porcentaje', 'porcentaje', 'estrategico',
       'Alumni survey', 'anual', 'manual', 'KPI del Plan Estratégico 2023-2028'
 where not exists (select 1 from effectiveness_kpis where trim(code)='E5-K3');

insert into strategic_plan_kpis (cycle_id, kpi_id, objective_id, owner_label)
select c.id, k.id, o.id, 'Marisol'
  from strategic_plan_cycles c, effectiveness_kpis k
  left join strategic_objectives o on o.code = 'O5' and o.status='active'
 where c.status='active' and trim(k.code)='E5-K3'
on conflict (cycle_id, kpi_id) do nothing;

insert into indicator_composition (parent_id, child_id)
select p.id, c.id from effectiveness_kpis p, effectiveness_kpis c
 where trim(p.code)='E5-K3' and trim(c.code)='E5-I01' on conflict do nothing;

insert into indicator_composition (parent_id, child_id)
select p.id, c.id from effectiveness_kpis p, effectiveness_kpis c
 where trim(p.code)='E5-K3' and trim(c.code)='E5-I02' on conflict do nothing;

insert into indicator_targets (indicator_id, academic_year_id, value, operator, note)
select k.id, (select id from academic_years where extract(year from start_date)::int = 2025), 65, '>=', 'Curva del ciclo 2023-2028'
  from effectiveness_kpis k where trim(k.code)='E5-K3' and (select id from academic_years where extract(year from start_date)::int = 2025) is not null
on conflict (indicator_id, academic_year_id) do update set value=excluded.value, operator=excluded.operator;

insert into indicator_targets (indicator_id, academic_year_id, value, operator, note)
select k.id, (select id from academic_years where extract(year from start_date)::int = 2026), 75, '>=', 'Curva del ciclo 2023-2028'
  from effectiveness_kpis k where trim(k.code)='E5-K3' and (select id from academic_years where extract(year from start_date)::int = 2026) is not null
on conflict (indicator_id, academic_year_id) do update set value=excluded.value, operator=excluded.operator;

insert into indicator_targets (indicator_id, academic_year_id, value, operator, note)
select k.id, (select id from academic_years where extract(year from start_date)::int = 2027), 80, '>=', 'Curva del ciclo 2023-2028'
  from effectiveness_kpis k where trim(k.code)='E5-K3' and (select id from academic_years where extract(year from start_date)::int = 2027) is not null
on conflict (indicator_id, academic_year_id) do update set value=excluded.value, operator=excluded.operator;

insert into indicator_results (indicator_id, academic_year_id, period, value, source, status, note)
select k.id, (select id from academic_years where extract(year from start_date)::int = 2024), 'anual', 50, 'manual', null, '50%'
  from effectiveness_kpis k where trim(k.code)='E5-K3' and (select id from academic_years where extract(year from start_date)::int = 2024) is not null
on conflict (indicator_id, academic_year_id, period)
do update set value=excluded.value, status=excluded.status, note=excluded.note;

insert into indicator_results (indicator_id, academic_year_id, period, value, source, status, note)
select k.id, (select id from academic_years where extract(year from start_date)::int = 2025), 'anual', 27, 'manual', 'parcial', '27%'
  from effectiveness_kpis k where trim(k.code)='E5-K3' and (select id from academic_years where extract(year from start_date)::int = 2025) is not null
on conflict (indicator_id, academic_year_id, period)
do update set value=excluded.value, status=excluded.status, note=excluded.note;

insert into indicator_evidence (indicator_id, academic_year_id, label, pending, uploaded_by)
select k.id, (select id from academic_years where extract(year from start_date)::int = 2025), 'Ratios 801 Data Collection (18.11.25) .xlsx Fueron 46 respuestas Población 172', true, 'Reporte estratégico 2025-2026'
  from effectiveness_kpis k where trim(k.code)='E5-K3' and (select id from academic_years where extract(year from start_date)::int = 2025) is not null
   and not exists (select 1 from indicator_evidence e where e.indicator_id=k.id and e.label='Ratios 801 Data Collection (18.11.25) .xlsx Fueron 46 respuestas Población 172');

-- E5-K4 · Admisiones angloparlantes
insert into effectiveness_kpis (code, name, level, value_type, unit, owner_plan, data_source, frequency, source, scope)
select 'E5-K4', 'Admisiones angloparlantes', 'institucional', 'porcentaje', 'porcentaje', 'estrategico',
       'Admissions', 'anual', 'manual', 'KPI del Plan Estratégico 2023-2028'
 where not exists (select 1 from effectiveness_kpis where trim(code)='E5-K4');

insert into strategic_plan_kpis (cycle_id, kpi_id, objective_id, owner_label)
select c.id, k.id, o.id, 'Antony Huaynapata'
  from strategic_plan_cycles c, effectiveness_kpis k
  left join strategic_objectives o on o.code = 'O5' and o.status='active'
 where c.status='active' and trim(k.code)='E5-K4'
on conflict (cycle_id, kpi_id) do nothing;

insert into indicator_composition (parent_id, child_id)
select p.id, c.id from effectiveness_kpis p, effectiveness_kpis c
 where trim(p.code)='E5-K4' and trim(c.code)='E5-S02' on conflict do nothing;

insert into indicator_targets (indicator_id, academic_year_id, value, operator, note)
select k.id, (select id from academic_years where extract(year from start_date)::int = 2025), 10, '>=', 'Curva del ciclo 2023-2028'
  from effectiveness_kpis k where trim(k.code)='E5-K4' and (select id from academic_years where extract(year from start_date)::int = 2025) is not null
on conflict (indicator_id, academic_year_id) do update set value=excluded.value, operator=excluded.operator;

insert into indicator_targets (indicator_id, academic_year_id, value, operator, note)
select k.id, (select id from academic_years where extract(year from start_date)::int = 2026), 15, '>=', 'Curva del ciclo 2023-2028'
  from effectiveness_kpis k where trim(k.code)='E5-K4' and (select id from academic_years where extract(year from start_date)::int = 2026) is not null
on conflict (indicator_id, academic_year_id) do update set value=excluded.value, operator=excluded.operator;

insert into indicator_targets (indicator_id, academic_year_id, value, operator, note)
select k.id, (select id from academic_years where extract(year from start_date)::int = 2027), 20, '>=', 'Curva del ciclo 2023-2028'
  from effectiveness_kpis k where trim(k.code)='E5-K4' and (select id from academic_years where extract(year from start_date)::int = 2027) is not null
on conflict (indicator_id, academic_year_id) do update set value=excluded.value, operator=excluded.operator;

insert into indicator_results (indicator_id, academic_year_id, period, value, source, status, note)
select k.id, (select id from academic_years where extract(year from start_date)::int = 2024), 'anual', 5, 'manual', null, '5%'
  from effectiveness_kpis k where trim(k.code)='E5-K4' and (select id from academic_years where extract(year from start_date)::int = 2024) is not null
on conflict (indicator_id, academic_year_id, period)
do update set value=excluded.value, status=excluded.status, note=excluded.note;

insert into indicator_results (indicator_id, academic_year_id, period, value, source, status, note)
select k.id, (select id from academic_years where extract(year from start_date)::int = 2025), 'anual', 1.81, 'manual', 'parcial', '1,81%'
  from effectiveness_kpis k where trim(k.code)='E5-K4' and (select id from academic_years where extract(year from start_date)::int = 2025) is not null
on conflict (indicator_id, academic_year_id, period)
do update set value=excluded.value, status=excluded.status, note=excluded.note;

insert into indicator_evidence (indicator_id, academic_year_id, label, pending, uploaded_by)
select k.id, (select id from academic_years where extract(year from start_date)::int = 2025), 'ADMISIONES ANGLOPARLANTES', true, 'Reporte estratégico 2025-2026'
  from effectiveness_kpis k where trim(k.code)='E5-K4' and (select id from academic_years where extract(year from start_date)::int = 2025) is not null
   and not exists (select 1 from indicator_evidence e where e.indicator_id=k.id and e.label='ADMISIONES ANGLOPARLANTES');

-- E6-K1 · Índice de pertenencia e inclusión
insert into effectiveness_kpis (code, name, level, value_type, unit, owner_plan, data_source, frequency, source, scope)
select 'E6-K1', 'Índice de pertenencia e inclusión', 'institucional', 'porcentaje', 'porcentaje', 'estrategico',
       'Annual survey', 'anual', 'manual', 'KPI del Plan Estratégico 2023-2028'
 where not exists (select 1 from effectiveness_kpis where trim(code)='E6-K1');

insert into strategic_plan_kpis (cycle_id, kpi_id, objective_id, owner_label)
select c.id, k.id, o.id, 'Marisol'
  from strategic_plan_cycles c, effectiveness_kpis k
  left join strategic_objectives o on o.code = 'O6' and o.status='active'
 where c.status='active' and trim(k.code)='E6-K1'
on conflict (cycle_id, kpi_id) do nothing;

insert into indicator_composition (parent_id, child_id)
select p.id, c.id from effectiveness_kpis p, effectiveness_kpis c
 where trim(p.code)='E6-K1' and trim(c.code)='E6-I01' on conflict do nothing;

insert into indicator_targets (indicator_id, academic_year_id, value, operator, note)
select k.id, (select id from academic_years where extract(year from start_date)::int = 2025), 82, '>=', 'Curva del ciclo 2023-2028'
  from effectiveness_kpis k where trim(k.code)='E6-K1' and (select id from academic_years where extract(year from start_date)::int = 2025) is not null
on conflict (indicator_id, academic_year_id) do update set value=excluded.value, operator=excluded.operator;

insert into indicator_targets (indicator_id, academic_year_id, value, operator, note)
select k.id, (select id from academic_years where extract(year from start_date)::int = 2026), 86, '>=', 'Curva del ciclo 2023-2028'
  from effectiveness_kpis k where trim(k.code)='E6-K1' and (select id from academic_years where extract(year from start_date)::int = 2026) is not null
on conflict (indicator_id, academic_year_id) do update set value=excluded.value, operator=excluded.operator;

insert into indicator_targets (indicator_id, academic_year_id, value, operator, note)
select k.id, (select id from academic_years where extract(year from start_date)::int = 2027), 90, '>=', 'Curva del ciclo 2023-2028'
  from effectiveness_kpis k where trim(k.code)='E6-K1' and (select id from academic_years where extract(year from start_date)::int = 2027) is not null
on conflict (indicator_id, academic_year_id) do update set value=excluded.value, operator=excluded.operator;

insert into indicator_results (indicator_id, academic_year_id, period, value, source, status, note)
select k.id, (select id from academic_years where extract(year from start_date)::int = 2024), 'anual', 80, 'manual', null, '80%'
  from effectiveness_kpis k where trim(k.code)='E6-K1' and (select id from academic_years where extract(year from start_date)::int = 2024) is not null
on conflict (indicator_id, academic_year_id, period)
do update set value=excluded.value, status=excluded.status, note=excluded.note;

insert into indicator_results (indicator_id, academic_year_id, period, value, source, status, note)
select k.id, (select id from academic_years where extract(year from start_date)::int = 2025), 'anual', 0, 'manual', 'no_cumplido', '0'
  from effectiveness_kpis k where trim(k.code)='E6-K1' and (select id from academic_years where extract(year from start_date)::int = 2025) is not null
on conflict (indicator_id, academic_year_id, period)
do update set value=excluded.value, status=excluded.status, note=excluded.note;

-- E6-K2 · Capacitación ética y seguridad
insert into effectiveness_kpis (code, name, level, value_type, unit, owner_plan, data_source, frequency, source, scope)
select 'E6-K2', 'Capacitación ética y seguridad', 'institucional', 'porcentaje', 'porcentaje', 'estrategico',
       'Training records', 'anual', 'manual', 'KPI del Plan Estratégico 2023-2028'
 where not exists (select 1 from effectiveness_kpis where trim(code)='E6-K2');

insert into strategic_plan_kpis (cycle_id, kpi_id, objective_id, owner_label)
select c.id, k.id, o.id, 'Marisol'
  from strategic_plan_cycles c, effectiveness_kpis k
  left join strategic_objectives o on o.code = 'O6' and o.status='active'
 where c.status='active' and trim(k.code)='E6-K2'
on conflict (cycle_id, kpi_id) do nothing;

insert into indicator_composition (parent_id, child_id)
select p.id, c.id from effectiveness_kpis p, effectiveness_kpis c
 where trim(p.code)='E6-K2' and trim(c.code)='E6-O01' on conflict do nothing;

insert into indicator_composition (parent_id, child_id)
select p.id, c.id from effectiveness_kpis p, effectiveness_kpis c
 where trim(p.code)='E6-K2' and trim(c.code)='E6-S01' on conflict do nothing;

insert into indicator_targets (indicator_id, academic_year_id, value, operator, note)
select k.id, (select id from academic_years where extract(year from start_date)::int = 2025), 85, '>=', 'Curva del ciclo 2023-2028'
  from effectiveness_kpis k where trim(k.code)='E6-K2' and (select id from academic_years where extract(year from start_date)::int = 2025) is not null
on conflict (indicator_id, academic_year_id) do update set value=excluded.value, operator=excluded.operator;

insert into indicator_targets (indicator_id, academic_year_id, value, operator, note)
select k.id, (select id from academic_years where extract(year from start_date)::int = 2026), 95, '>=', 'Curva del ciclo 2023-2028'
  from effectiveness_kpis k where trim(k.code)='E6-K2' and (select id from academic_years where extract(year from start_date)::int = 2026) is not null
on conflict (indicator_id, academic_year_id) do update set value=excluded.value, operator=excluded.operator;

insert into indicator_targets (indicator_id, academic_year_id, value, operator, note)
select k.id, (select id from academic_years where extract(year from start_date)::int = 2027), 100, '>=', 'Curva del ciclo 2023-2028'
  from effectiveness_kpis k where trim(k.code)='E6-K2' and (select id from academic_years where extract(year from start_date)::int = 2027) is not null
on conflict (indicator_id, academic_year_id) do update set value=excluded.value, operator=excluded.operator;

insert into indicator_results (indicator_id, academic_year_id, period, value, source, status, note)
select k.id, (select id from academic_years where extract(year from start_date)::int = 2024), 'anual', 70, 'manual', null, '70%'
  from effectiveness_kpis k where trim(k.code)='E6-K2' and (select id from academic_years where extract(year from start_date)::int = 2024) is not null
on conflict (indicator_id, academic_year_id, period)
do update set value=excluded.value, status=excluded.status, note=excluded.note;

insert into indicator_results (indicator_id, academic_year_id, period, value, source, status, note)
select k.id, (select id from academic_years where extract(year from start_date)::int = 2025), 'anual', 0, 'manual', 'no_cumplido', '0'
  from effectiveness_kpis k where trim(k.code)='E6-K2' and (select id from academic_years where extract(year from start_date)::int = 2025) is not null
on conflict (indicator_id, academic_year_id, period)
do update set value=excluded.value, status=excluded.status, note=excluded.note;

-- E6-K3 · Participación comunitaria
insert into effectiveness_kpis (code, name, level, value_type, unit, owner_plan, data_source, frequency, source, scope)
select 'E6-K3', 'Participación comunitaria', 'institucional', 'porcentaje', 'porcentaje', 'estrategico',
       'Community records', 'anual', 'manual', 'KPI del Plan Estratégico 2023-2028'
 where not exists (select 1 from effectiveness_kpis where trim(code)='E6-K3');

insert into strategic_plan_kpis (cycle_id, kpi_id, objective_id, owner_label)
select c.id, k.id, o.id, 'Marisol'
  from strategic_plan_cycles c, effectiveness_kpis k
  left join strategic_objectives o on o.code = 'O6' and o.status='active'
 where c.status='active' and trim(k.code)='E6-K3'
on conflict (cycle_id, kpi_id) do nothing;

insert into indicator_targets (indicator_id, academic_year_id, value, operator, note)
select k.id, (select id from academic_years where extract(year from start_date)::int = 2025), 20, '>=', 'Curva del ciclo 2023-2028'
  from effectiveness_kpis k where trim(k.code)='E6-K3' and (select id from academic_years where extract(year from start_date)::int = 2025) is not null
on conflict (indicator_id, academic_year_id) do update set value=excluded.value, operator=excluded.operator;

insert into indicator_targets (indicator_id, academic_year_id, value, operator, note)
select k.id, (select id from academic_years where extract(year from start_date)::int = 2026), 30, '>=', 'Curva del ciclo 2023-2028'
  from effectiveness_kpis k where trim(k.code)='E6-K3' and (select id from academic_years where extract(year from start_date)::int = 2026) is not null
on conflict (indicator_id, academic_year_id) do update set value=excluded.value, operator=excluded.operator;

insert into indicator_targets (indicator_id, academic_year_id, value, operator, note)
select k.id, (select id from academic_years where extract(year from start_date)::int = 2027), 40, '>=', 'Curva del ciclo 2023-2028'
  from effectiveness_kpis k where trim(k.code)='E6-K3' and (select id from academic_years where extract(year from start_date)::int = 2027) is not null
on conflict (indicator_id, academic_year_id) do update set value=excluded.value, operator=excluded.operator;

insert into indicator_results (indicator_id, academic_year_id, period, value, source, status, note)
select k.id, (select id from academic_years where extract(year from start_date)::int = 2024), 'anual', 15, 'manual', null, '15%'
  from effectiveness_kpis k where trim(k.code)='E6-K3' and (select id from academic_years where extract(year from start_date)::int = 2024) is not null
on conflict (indicator_id, academic_year_id, period)
do update set value=excluded.value, status=excluded.status, note=excluded.note;

insert into indicator_results (indicator_id, academic_year_id, period, value, source, status, note)
select k.id, (select id from academic_years where extract(year from start_date)::int = 2025), 'anual', 4, 'manual', 'parcial', '4%'
  from effectiveness_kpis k where trim(k.code)='E6-K3' and (select id from academic_years where extract(year from start_date)::int = 2025) is not null
on conflict (indicator_id, academic_year_id, period)
do update set value=excluded.value, status=excluded.status, note=excluded.note;

insert into indicator_evidence (indicator_id, academic_year_id, label, pending, uploaded_by)
select k.id, (select id from academic_years where extract(year from start_date)::int = 2025), 'Meet and great= 23 NBL= 3 Comunidad = 717 Egresados a Julio calidad= 188 Estudiantes activos a Julio calidad= 529', true, 'Reporte estratégico 2025-2026'
  from effectiveness_kpis k where trim(k.code)='E6-K3' and (select id from academic_years where extract(year from start_date)::int = 2025) is not null
   and not exists (select 1 from indicator_evidence e where e.indicator_id=k.id and e.label='Meet and great= 23 NBL= 3 Comunidad = 717 Egresados a Julio calidad= 188 Estudiantes activos a Julio calidad= 529');

-- E6-K4 · Complaints resueltos en plazo
insert into effectiveness_kpis (code, name, level, value_type, unit, owner_plan, data_source, frequency, source, scope)
select 'E6-K4', 'Complaints resueltos en plazo', 'institucional', 'porcentaje', 'porcentaje', 'estrategico',
       'Complaint log / Registro de quejas', 'anual', 'manual', 'KPI del Plan Estratégico 2023-2028'
 where not exists (select 1 from effectiveness_kpis where trim(code)='E6-K4');

insert into strategic_plan_kpis (cycle_id, kpi_id, objective_id, owner_label)
select c.id, k.id, o.id, 'Marisol'
  from strategic_plan_cycles c, effectiveness_kpis k
  left join strategic_objectives o on o.code = 'O6' and o.status='active'
 where c.status='active' and trim(k.code)='E6-K4'
on conflict (cycle_id, kpi_id) do nothing;

insert into indicator_targets (indicator_id, academic_year_id, value, operator, note)
select k.id, (select id from academic_years where extract(year from start_date)::int = 2025), 85, '>=', 'Curva del ciclo 2023-2028'
  from effectiveness_kpis k where trim(k.code)='E6-K4' and (select id from academic_years where extract(year from start_date)::int = 2025) is not null
on conflict (indicator_id, academic_year_id) do update set value=excluded.value, operator=excluded.operator;

insert into indicator_targets (indicator_id, academic_year_id, value, operator, note)
select k.id, (select id from academic_years where extract(year from start_date)::int = 2026), 90, '>=', 'Curva del ciclo 2023-2028'
  from effectiveness_kpis k where trim(k.code)='E6-K4' and (select id from academic_years where extract(year from start_date)::int = 2026) is not null
on conflict (indicator_id, academic_year_id) do update set value=excluded.value, operator=excluded.operator;

insert into indicator_targets (indicator_id, academic_year_id, value, operator, note)
select k.id, (select id from academic_years where extract(year from start_date)::int = 2027), 95, '>=', 'Curva del ciclo 2023-2028'
  from effectiveness_kpis k where trim(k.code)='E6-K4' and (select id from academic_years where extract(year from start_date)::int = 2027) is not null
on conflict (indicator_id, academic_year_id) do update set value=excluded.value, operator=excluded.operator;

insert into indicator_results (indicator_id, academic_year_id, period, value, source, status, note)
select k.id, (select id from academic_years where extract(year from start_date)::int = 2024), 'anual', 75, 'manual', null, '75%'
  from effectiveness_kpis k where trim(k.code)='E6-K4' and (select id from academic_years where extract(year from start_date)::int = 2024) is not null
on conflict (indicator_id, academic_year_id, period)
do update set value=excluded.value, status=excluded.status, note=excluded.note;

insert into indicator_evidence (indicator_id, academic_year_id, label, pending, uploaded_by)
select k.id, (select id from academic_years where extract(year from start_date)::int = 2025), 'D.E', true, 'Reporte estratégico 2025-2026'
  from effectiveness_kpis k where trim(k.code)='E6-K4' and (select id from academic_years where extract(year from start_date)::int = 2025) is not null
   and not exists (select 1 from indicator_evidence e where e.indicator_id=k.id and e.label='D.E');

-- E7-K1 · Fondos de scholarships y grants
insert into effectiveness_kpis (code, name, level, value_type, unit, owner_plan, data_source, frequency, source, scope)
select 'E7-K1', 'Fondos de scholarships y grants', 'institucional', 'decimal', 'USD millones', 'estrategico',
       'Finance / aid / finanzas/ayuda', 'anual', 'manual', 'KPI del Plan Estratégico 2023-2028'
 where not exists (select 1 from effectiveness_kpis where trim(code)='E7-K1');

insert into strategic_plan_kpis (cycle_id, kpi_id, objective_id, owner_label)
select c.id, k.id, o.id, 'Yajayra'
  from strategic_plan_cycles c, effectiveness_kpis k
  left join strategic_objectives o on o.code = 'O7' and o.status='active'
 where c.status='active' and trim(k.code)='E7-K1'
on conflict (cycle_id, kpi_id) do nothing;

insert into indicator_composition (parent_id, child_id)
select p.id, c.id from effectiveness_kpis p, effectiveness_kpis c
 where trim(p.code)='E7-K1' and trim(c.code)='E7-O01' on conflict do nothing;

insert into indicator_targets (indicator_id, academic_year_id, value, operator, note)
select k.id, (select id from academic_years where extract(year from start_date)::int = 2025), 3.6, '>=', 'Curva del ciclo 2023-2028'
  from effectiveness_kpis k where trim(k.code)='E7-K1' and (select id from academic_years where extract(year from start_date)::int = 2025) is not null
on conflict (indicator_id, academic_year_id) do update set value=excluded.value, operator=excluded.operator;

insert into indicator_targets (indicator_id, academic_year_id, value, operator, note)
select k.id, (select id from academic_years where extract(year from start_date)::int = 2026), 3.8, '>=', 'Curva del ciclo 2023-2028'
  from effectiveness_kpis k where trim(k.code)='E7-K1' and (select id from academic_years where extract(year from start_date)::int = 2026) is not null
on conflict (indicator_id, academic_year_id) do update set value=excluded.value, operator=excluded.operator;

insert into indicator_targets (indicator_id, academic_year_id, value, operator, note)
select k.id, (select id from academic_years where extract(year from start_date)::int = 2027), 4, '>=', 'Curva del ciclo 2023-2028'
  from effectiveness_kpis k where trim(k.code)='E7-K1' and (select id from academic_years where extract(year from start_date)::int = 2027) is not null
on conflict (indicator_id, academic_year_id) do update set value=excluded.value, operator=excluded.operator;

insert into indicator_results (indicator_id, academic_year_id, period, value, source, status, note)
select k.id, (select id from academic_years where extract(year from start_date)::int = 2023), 'anual', 3.3, 'manual', null, 'USD 3.3M*'
  from effectiveness_kpis k where trim(k.code)='E7-K1' and (select id from academic_years where extract(year from start_date)::int = 2023) is not null
on conflict (indicator_id, academic_year_id, period)
do update set value=excluded.value, status=excluded.status, note=excluded.note;

insert into indicator_results (indicator_id, academic_year_id, period, value, source, status, note)
select k.id, (select id from academic_years where extract(year from start_date)::int = 2024), 'anual', 3.5, 'manual', null, 'USD 3.5M'
  from effectiveness_kpis k where trim(k.code)='E7-K1' and (select id from academic_years where extract(year from start_date)::int = 2024) is not null
on conflict (indicator_id, academic_year_id, period)
do update set value=excluded.value, status=excluded.status, note=excluded.note;

insert into indicator_results (indicator_id, academic_year_id, period, value, source, status, note)
select k.id, (select id from academic_years where extract(year from start_date)::int = 2025), 'anual', 3.9, 'manual', 'cumplido', 'USD 3,90 M'
  from effectiveness_kpis k where trim(k.code)='E7-K1' and (select id from academic_years where extract(year from start_date)::int = 2025) is not null
on conflict (indicator_id, academic_year_id, period)
do update set value=excluded.value, status=excluded.status, note=excluded.note;

insert into indicator_evidence (indicator_id, academic_year_id, label, pending, uploaded_by)
select k.id, (select id from academic_years where extract(year from start_date)::int = 2025), 'Reporte: Monto Total de GRANT Reporte Consolidado de Admisión: Reporte Consolidado de Admisión Blackwell Global University', true, 'Reporte estratégico 2025-2026'
  from effectiveness_kpis k where trim(k.code)='E7-K1' and (select id from academic_years where extract(year from start_date)::int = 2025) is not null
   and not exists (select 1 from indicator_evidence e where e.indicator_id=k.id and e.label='Reporte: Monto Total de GRANT Reporte Consolidado de Admisión: Reporte Consolidado de Admisión Blackwell Global University');

-- E7-K2 · Estudiantes beneficiarios
insert into effectiveness_kpis (code, name, level, value_type, unit, owner_plan, data_source, frequency, source, scope)
select 'E7-K2', 'Estudiantes beneficiarios', 'institucional', 'porcentaje', 'porcentaje', 'estrategico',
       'Financial aid finanzas/ayuda', 'anual', 'manual', 'KPI del Plan Estratégico 2023-2028'
 where not exists (select 1 from effectiveness_kpis where trim(code)='E7-K2');

insert into strategic_plan_kpis (cycle_id, kpi_id, objective_id, owner_label)
select c.id, k.id, o.id, 'Yajayra'
  from strategic_plan_cycles c, effectiveness_kpis k
  left join strategic_objectives o on o.code = 'O7' and o.status='active'
 where c.status='active' and trim(k.code)='E7-K2'
on conflict (cycle_id, kpi_id) do nothing;

insert into indicator_composition (parent_id, child_id)
select p.id, c.id from effectiveness_kpis p, effectiveness_kpis c
 where trim(p.code)='E7-K2' and trim(c.code)='E7-S01' on conflict do nothing;

insert into indicator_targets (indicator_id, academic_year_id, value, operator, note)
select k.id, (select id from academic_years where extract(year from start_date)::int = 2025), 40, '>=', 'Curva del ciclo 2023-2028'
  from effectiveness_kpis k where trim(k.code)='E7-K2' and (select id from academic_years where extract(year from start_date)::int = 2025) is not null
on conflict (indicator_id, academic_year_id) do update set value=excluded.value, operator=excluded.operator;

insert into indicator_targets (indicator_id, academic_year_id, value, operator, note)
select k.id, (select id from academic_years where extract(year from start_date)::int = 2026), 42, '>=', 'Curva del ciclo 2023-2028'
  from effectiveness_kpis k where trim(k.code)='E7-K2' and (select id from academic_years where extract(year from start_date)::int = 2026) is not null
on conflict (indicator_id, academic_year_id) do update set value=excluded.value, operator=excluded.operator;

insert into indicator_targets (indicator_id, academic_year_id, value, operator, note)
select k.id, (select id from academic_years where extract(year from start_date)::int = 2027), 45, '>=', 'Curva del ciclo 2023-2028'
  from effectiveness_kpis k where trim(k.code)='E7-K2' and (select id from academic_years where extract(year from start_date)::int = 2027) is not null
on conflict (indicator_id, academic_year_id) do update set value=excluded.value, operator=excluded.operator;

insert into indicator_results (indicator_id, academic_year_id, period, value, source, status, note)
select k.id, (select id from academic_years where extract(year from start_date)::int = 2023), 'anual', 35, 'manual', null, '35%'
  from effectiveness_kpis k where trim(k.code)='E7-K2' and (select id from academic_years where extract(year from start_date)::int = 2023) is not null
on conflict (indicator_id, academic_year_id, period)
do update set value=excluded.value, status=excluded.status, note=excluded.note;

insert into indicator_results (indicator_id, academic_year_id, period, value, source, status, note)
select k.id, (select id from academic_years where extract(year from start_date)::int = 2024), 'anual', 38, 'manual', null, '38%'
  from effectiveness_kpis k where trim(k.code)='E7-K2' and (select id from academic_years where extract(year from start_date)::int = 2024) is not null
on conflict (indicator_id, academic_year_id, period)
do update set value=excluded.value, status=excluded.status, note=excluded.note;

insert into indicator_results (indicator_id, academic_year_id, period, value, source, status, note)
select k.id, (select id from academic_years where extract(year from start_date)::int = 2025), 'anual', 100, 'manual', 'cumplido', '100%'
  from effectiveness_kpis k where trim(k.code)='E7-K2' and (select id from academic_years where extract(year from start_date)::int = 2025) is not null
on conflict (indicator_id, academic_year_id, period)
do update set value=excluded.value, status=excluded.status, note=excluded.note;

insert into indicator_evidence (indicator_id, academic_year_id, label, pending, uploaded_by)
select k.id, (select id from academic_years where extract(year from start_date)::int = 2025), 'Reporte: Monto Total de GRANT Reporte Consolidado de Admisión: Reporte Consolidado de Admisión Blackwell Global University', true, 'Reporte estratégico 2025-2026'
  from effectiveness_kpis k where trim(k.code)='E7-K2' and (select id from academic_years where extract(year from start_date)::int = 2025) is not null
   and not exists (select 1 from indicator_evidence e where e.indicator_id=k.id and e.label='Reporte: Monto Total de GRANT Reporte Consolidado de Admisión: Reporte Consolidado de Admisión Blackwell Global University');

-- E7-K3 · Persistencia de beneficiarios
insert into effectiveness_kpis (code, name, level, value_type, unit, owner_plan, data_source, frequency, source, scope)
select 'E7-K3', 'Persistencia de beneficiarios', 'institucional', 'porcentaje', 'porcentaje', 'estrategico',
       'SIS / aid', 'anual', 'manual', 'KPI del Plan Estratégico 2023-2028'
 where not exists (select 1 from effectiveness_kpis where trim(code)='E7-K3');

insert into strategic_plan_kpis (cycle_id, kpi_id, objective_id, owner_label)
select c.id, k.id, o.id, 'Marisol'
  from strategic_plan_cycles c, effectiveness_kpis k
  left join strategic_objectives o on o.code = 'O7' and o.status='active'
 where c.status='active' and trim(k.code)='E7-K3'
on conflict (cycle_id, kpi_id) do nothing;

insert into indicator_composition (parent_id, child_id)
select p.id, c.id from effectiveness_kpis p, effectiveness_kpis c
 where trim(p.code)='E7-K3' and trim(c.code)='E7-I01' on conflict do nothing;

insert into indicator_targets (indicator_id, academic_year_id, value, operator, note)
select k.id, (select id from academic_years where extract(year from start_date)::int = 2025), 82, '>=', 'Curva del ciclo 2023-2028'
  from effectiveness_kpis k where trim(k.code)='E7-K3' and (select id from academic_years where extract(year from start_date)::int = 2025) is not null
on conflict (indicator_id, academic_year_id) do update set value=excluded.value, operator=excluded.operator;

insert into indicator_targets (indicator_id, academic_year_id, value, operator, note)
select k.id, (select id from academic_years where extract(year from start_date)::int = 2026), 86, '>=', 'Curva del ciclo 2023-2028'
  from effectiveness_kpis k where trim(k.code)='E7-K3' and (select id from academic_years where extract(year from start_date)::int = 2026) is not null
on conflict (indicator_id, academic_year_id) do update set value=excluded.value, operator=excluded.operator;

insert into indicator_targets (indicator_id, academic_year_id, value, operator, note)
select k.id, (select id from academic_years where extract(year from start_date)::int = 2027), 90, '>=', 'Curva del ciclo 2023-2028'
  from effectiveness_kpis k where trim(k.code)='E7-K3' and (select id from academic_years where extract(year from start_date)::int = 2027) is not null
on conflict (indicator_id, academic_year_id) do update set value=excluded.value, operator=excluded.operator;

insert into indicator_results (indicator_id, academic_year_id, period, value, source, status, note)
select k.id, (select id from academic_years where extract(year from start_date)::int = 2024), 'anual', 78, 'manual', null, '78%'
  from effectiveness_kpis k where trim(k.code)='E7-K3' and (select id from academic_years where extract(year from start_date)::int = 2024) is not null
on conflict (indicator_id, academic_year_id, period)
do update set value=excluded.value, status=excluded.status, note=excluded.note;

insert into indicator_results (indicator_id, academic_year_id, period, value, source, status, note)
select k.id, (select id from academic_years where extract(year from start_date)::int = 2025), 'anual', 91, 'manual', 'cumplido', '91%'
  from effectiveness_kpis k where trim(k.code)='E7-K3' and (select id from academic_years where extract(year from start_date)::int = 2025) is not null
on conflict (indicator_id, academic_year_id, period)
do update set value=excluded.value, status=excluded.status, note=excluded.note;

insert into indicator_evidence (indicator_id, academic_year_id, label, pending, uploaded_by)
select k.id, (select id from academic_years where extract(year from start_date)::int = 2025), 'Ratios 801 Data Collection (18.11.25) .xlsx', true, 'Reporte estratégico 2025-2026'
  from effectiveness_kpis k where trim(k.code)='E7-K3' and (select id from academic_years where extract(year from start_date)::int = 2025) is not null
   and not exists (select 1 from indicator_evidence e where e.indicator_id=k.id and e.label='Ratios 801 Data Collection (18.11.25) .xlsx');

-- E7-K4 · Fondos recibidos de donantes
insert into effectiveness_kpis (code, name, level, value_type, unit, owner_plan, data_source, frequency, source, scope)
select 'E7-K4', 'Fondos recibidos de donantes', 'institucional', 'decimal', 'USD millones', 'estrategico',
       'Finance', 'anual', 'manual', 'KPI del Plan Estratégico 2023-2028'
 where not exists (select 1 from effectiveness_kpis where trim(code)='E7-K4');

insert into strategic_plan_kpis (cycle_id, kpi_id, objective_id, owner_label)
select c.id, k.id, o.id, 'Yajayra'
  from strategic_plan_cycles c, effectiveness_kpis k
  left join strategic_objectives o on o.code = 'O7' and o.status='active'
 where c.status='active' and trim(k.code)='E7-K4'
on conflict (cycle_id, kpi_id) do nothing;

insert into indicator_composition (parent_id, child_id)
select p.id, c.id from effectiveness_kpis p, effectiveness_kpis c
 where trim(p.code)='E7-K4' and trim(c.code)='E7-O0' on conflict do nothing;

insert into indicator_targets (indicator_id, academic_year_id, value, operator, note)
select k.id, (select id from academic_years where extract(year from start_date)::int = 2025), 0.2, '>=', 'Curva del ciclo 2023-2028'
  from effectiveness_kpis k where trim(k.code)='E7-K4' and (select id from academic_years where extract(year from start_date)::int = 2025) is not null
on conflict (indicator_id, academic_year_id) do update set value=excluded.value, operator=excluded.operator;

insert into indicator_targets (indicator_id, academic_year_id, value, operator, note)
select k.id, (select id from academic_years where extract(year from start_date)::int = 2026), 0.3, '>=', 'Curva del ciclo 2023-2028'
  from effectiveness_kpis k where trim(k.code)='E7-K4' and (select id from academic_years where extract(year from start_date)::int = 2026) is not null
on conflict (indicator_id, academic_year_id) do update set value=excluded.value, operator=excluded.operator;

insert into indicator_targets (indicator_id, academic_year_id, value, operator, note)
select k.id, (select id from academic_years where extract(year from start_date)::int = 2027), 0.5, '>=', 'Curva del ciclo 2023-2028'
  from effectiveness_kpis k where trim(k.code)='E7-K4' and (select id from academic_years where extract(year from start_date)::int = 2027) is not null
on conflict (indicator_id, academic_year_id) do update set value=excluded.value, operator=excluded.operator;

insert into indicator_results (indicator_id, academic_year_id, period, value, source, status, note)
select k.id, (select id from academic_years where extract(year from start_date)::int = 2023), 'anual', 0, 'manual', null, 'USD 0*'
  from effectiveness_kpis k where trim(k.code)='E7-K4' and (select id from academic_years where extract(year from start_date)::int = 2023) is not null
on conflict (indicator_id, academic_year_id, period)
do update set value=excluded.value, status=excluded.status, note=excluded.note;

insert into indicator_results (indicator_id, academic_year_id, period, value, source, status, note)
select k.id, (select id from academic_years where extract(year from start_date)::int = 2024), 'anual', 0.1, 'manual', null, 'USD 0.1M'
  from effectiveness_kpis k where trim(k.code)='E7-K4' and (select id from academic_years where extract(year from start_date)::int = 2024) is not null
on conflict (indicator_id, academic_year_id, period)
do update set value=excluded.value, status=excluded.status, note=excluded.note;

insert into indicator_results (indicator_id, academic_year_id, period, value, source, status, note)
select k.id, (select id from academic_years where extract(year from start_date)::int = 2025), 'anual', 0, 'manual', 'no_cumplido', '0'
  from effectiveness_kpis k where trim(k.code)='E7-K4' and (select id from academic_years where extract(year from start_date)::int = 2025) is not null
on conflict (indicator_id, academic_year_id, period)
do update set value=excluded.value, status=excluded.status, note=excluded.note;

insert into indicator_evidence (indicator_id, academic_year_id, label, pending, uploaded_by)
select k.id, (select id from academic_years where extract(year from start_date)::int = 2025), 'No se han recibido recursos de donantes', true, 'Reporte estratégico 2025-2026'
  from effectiveness_kpis k where trim(k.code)='E7-K4' and (select id from academic_years where extract(year from start_date)::int = 2025) is not null
   and not exists (select 1 from indicator_evidence e where e.indicator_id=k.id and e.label='No se han recibido recursos de donantes');


update strategic_plan_kpis s set responsible_id = e.id
  from hr_employees e
 where s.responsible_id is null and s.owner_label is not null
   and e.full_name ilike '%' || s.owner_label || '%';
