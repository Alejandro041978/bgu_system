import { Client } from 'pg'

// Consulta que trae las notas de SystemActiva enlazadas al estudiante y curso.
export const GRADES_QUERY = `
SELECT cr."Id" as external_id,
  u."DocumentNumber" as document_number,
  u."Email" as email,
  trim(concat_ws(' ', u."FirstName", u."LastName", u."SecondaryLastName")) as student_name,
  co."Code" as course_code,
  co."Name" as course_name,
  co."Credits" as credits,
  t."Year" as term_year,
  t."Block" as term_block,
  cr."FinalGrade" as final_grade,
  cr."RetakeGrade" as retake_grade,
  tc."PassingScore" as passing_score,
  cr."Group" as group_number,
  cr."UpdatedAt" as updated_at
FROM "CourseRegistrations" cr
JOIN "StudentAccounts" sa ON sa."Id" = cr."StudentAccountId"
JOIN "Enrollments" e ON e."Id" = sa."EnrollmentId"
JOIN "Users" u ON u."Id" = e."UserId"
JOIN "TermCourses" tc ON tc."Id" = cr."TermCourseId"
JOIN "Courses" co ON co."Id" = tc."CourseId"
JOIN "Terms" t ON t."Id" = tc."TermId"
`

/** Crea un cliente conectado a la BD de SystemActiva. Recuerda llamar client.end(). */
export async function systemActivaClient(): Promise<Client> {
  const client = new Client({
    host:     process.env.SYSTEMACTIVA_DB_HOST,
    user:     process.env.SYSTEMACTIVA_DB_USER,
    password: process.env.SYSTEMACTIVA_DB_PASSWORD,
    database: process.env.SYSTEMACTIVA_DB_NAME,
    port:     Number(process.env.SYSTEMACTIVA_DB_PORT ?? 5432),
    ssl:      false,
  })
  await client.connect()
  return client
}
