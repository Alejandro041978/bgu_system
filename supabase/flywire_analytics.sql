-- Analítica de pagos Flywire: medio de pago, moneda y país de origen
alter table account_payments add column if not exists payment_method text;
alter table account_payments add column if not exists currency_from  text;
alter table account_payments add column if not exists country_from   text;
