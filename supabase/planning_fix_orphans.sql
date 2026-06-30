-- Repara hijos que quedaron apuntando a una versión superseded (bug ya corregido en el código).
-- Re-apunta cada hijo a la versión ACTIVA con el mismo código dentro del mismo padre.
-- Ejecutar en Supabase SQL editor (Run without RLS)

-- Objetivos -> dimensión activa con mismo código
update strategic_objectives so
set dimension_id = active_dim.id
from strategic_dimensions old_dim
join strategic_dimensions active_dim
  on active_dim.cycle_id = old_dim.cycle_id
  and active_dim.code = old_dim.code
  and active_dim.status = 'active'
where so.dimension_id = old_dim.id
  and old_dim.status = 'superseded';

-- Estrategias -> objetivo activo con mismo código
update strategic_strategies ss
set objective_id = active_obj.id
from strategic_objectives old_obj
join strategic_objectives active_obj
  on active_obj.dimension_id = old_obj.dimension_id
  and active_obj.code = old_obj.code
  and active_obj.status = 'active'
where ss.objective_id = old_obj.id
  and old_obj.status = 'superseded';

-- Acciones -> estrategia activa con mismo código
update strategic_actions sa
set strategy_id = active_strat.id
from strategic_strategies old_strat
join strategic_strategies active_strat
  on active_strat.objective_id = old_strat.objective_id
  and active_strat.code = old_strat.code
  and active_strat.status = 'active'
where sa.strategy_id = old_strat.id
  and old_strat.status = 'superseded';

-- Responsables -> acción activa con mismo código
update strategic_action_responsibles sar
set action_id = active_action.id
from strategic_actions old_action
join strategic_actions active_action
  on active_action.strategy_id = old_action.strategy_id
  and active_action.code = old_action.code
  and active_action.status = 'active'
where sar.action_id = old_action.id
  and old_action.status = 'superseded';
