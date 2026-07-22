-- Identidad del estudiante en las conversaciones del buzón: quién escribe,
-- resuelto por correo (email/email_alt) o por documento/teléfono (WhatsApp).
-- Alimenta la asignación por categorías de programa de las asesoras.
alter table wa_conversations add column if not exists student_id uuid;
