// Maps URL path prefixes to page_key in role_permissions table.
// Order matters: more specific paths first.
export const ROUTE_TO_PAGE_KEY: [string, string][] = [
  ['/dashboard', 'dashboard'],
  ['/desk/metrics', 'desk_metrics'],
  ['/desk', 'desk'],
  ['/inbox', 'inbox'],
  ['/helpdesk/skills', 'helpdesk_skills'],
  ['/finance', 'finance'],
  ['/crm', 'crm'],
  ['/ventas/prospectos', 'sales_prospectos'],
  ['/social', 'social'],
  ['/hr/capacitaciones/participantes', 'hr_capacitacion_participantes'],
  ['/hr/capacitaciones', 'hr_capacitaciones'],
  ['/hr', 'hr'],
  ['/kpis', 'kpis'],
  ['/contracts/new', 'contracts_new'],
  ['/contracts/templates', 'contracts_templates'],
  ['/contracts', 'contracts'],
  ['/academic/faculty', 'academic_faculty'],
  ['/academic/grades', 'academic_grades'],
  ['/academic/years', 'academic_years'],
  ['/academic/programs', 'academic_programs'],
  ['/academic/offer', 'academic_offer'],
  ['/academic/grade-scales', 'academic_grade_scales'],
  ['/academic/transfer-credits', 'academic_transfer_credits'],
  ['/academic/schedules', 'academic_schedules'],
  ['/convenios', 'convenios'],
  ['/planning/effectiveness/dashboard', 'effectiveness_dashboard'],
  ['/planning/effectiveness/plan', 'effectiveness_plan'],
  ['/planning/effectiveness/kpis', 'effectiveness_kpis'],
  ['/planning/plan', 'planning_plan'],
  ['/planning/progress', 'planning_progress'],
  ['/planning/dashboard', 'planning_dashboard'],
  ['/admision/matriculas', 'admision_matriculas'],
  ['/academic/credentials', 'academic_credentials'],
  ['/ia/sofia-supervisor', 'sofia_supervisor'],
  ['/registrar/formatos', 'registrar_formatos'],
  ['/chat', 'chat'],
  ['/settings/sofia', 'settings_sofia'],
  ['/settings/users', 'settings_users'],
]

export function pageKeyForPath(pathname: string): string | null {
  for (const [prefix, key] of ROUTE_TO_PAGE_KEY) {
    if (pathname === prefix || pathname.startsWith(prefix + '/')) return key
  }
  return null
}
