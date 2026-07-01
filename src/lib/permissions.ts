// Maps URL path prefixes to page_key in role_permissions table.
// Order matters: more specific paths first.
export const ROUTE_TO_PAGE_KEY: [string, string][] = [
  ['/dashboard', 'dashboard'],
  ['/desk/metrics', 'desk_metrics'],
  ['/desk', 'desk'],
  ['/finance', 'finance'],
  ['/crm', 'crm'],
  ['/social', 'social'],
  ['/hr', 'hr'],
  ['/kpis', 'kpis'],
  ['/contracts/new', 'contracts_new'],
  ['/contracts/templates', 'contracts_templates'],
  ['/contracts', 'contracts'],
  ['/academic/faculty', 'academic_faculty'],
  ['/academic/years', 'academic_years'],
  ['/academic/programs', 'academic_programs'],
  ['/academic/offer', 'academic_offer'],
  ['/academic/schedules', 'academic_schedules'],
  ['/planning/plan', 'planning_plan'],
  ['/planning/progress', 'planning_progress'],
  ['/planning/dashboard', 'planning_dashboard'],
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
