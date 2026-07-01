-- Vinculación de colaboradores con agentes de Zoho Desk
alter table hr_employees add column if not exists zoho_agent_id text;
alter table hr_employees add column if not exists zoho_agent_email text;
