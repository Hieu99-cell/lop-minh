create extension if not exists pg_cron with schema pg_catalog;
select cron.schedule('expire-classroom-attempts','* * * * *','select private.expire_attempts()');
