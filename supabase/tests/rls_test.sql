\set ON_ERROR_STOP on
-- users: studio owner A, client B, stranger C
insert into auth.users (id, email) values
 ('00000000-0000-0000-0000-00000000000a','bolu@onera.studio'),
 ('00000000-0000-0000-0000-00000000000b','kemi@lumiskin.co'),
 ('00000000-0000-0000-0000-00000000000c','stranger@example.com');
create or replace function pg_temp.as_user(u uuid, e text) returns void language plpgsql as $$ begin
  perform set_config('request.jwt.claim.sub', u::text, false); perform set_config('request.jwt.claim.email', e, false); end $$;

set role authenticated;
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a','bolu@onera.studio');
select slug from create_workspace('Onera Studio','onera') \gset ws_
select id as ws from workspaces where slug='onera' \gset
insert into contacts (workspace_id,name,company,email,portal_status) values (:'ws','Kemi Adeyemi','Lumi Skincare','kemi@lumiskin.co','invited') returning id as kemi \gset
insert into projects (workspace_id,contact_id,code,name,value) values (:'ws',:'kemi','LUM-024','Lumi brand identity',1500000) returning id as proj \gset
insert into tasks (workspace_id,project_id,title,for_client) values (:'ws',:'proj','Heart top 3',true) returning id as task \gset
insert into tasks (workspace_id,project_id,title,visible) values (:'ws',:'proj','Internal',false);
select next_number(:'ws','invoice') as n1 \gset
select next_number(:'ws','invoice') as n2 \gset
insert into invoices (workspace_id,contact_id,project_id,number,status,vat) values (:'ws',:'kemi',:'proj',:'n1','sent',true) returning id as inv1 \gset
insert into invoices (workspace_id,contact_id,project_id,number,status) values (:'ws',:'kemi',:'proj',:'n2','draft') returning id as inv2 \gset
insert into invoice_items (invoice_id,workspace_id,description,qty,rate) values (:'inv1',:'ws','Deposit',1,450000);
insert into notes (workspace_id,project_id,body,shared) values (:'ws',:'proj','shared note',true),(:'ws',:'proj','private note',false);
select number as cnum from (select next_number(:'ws','contract') as number) x \gset
insert into contracts (workspace_id,contact_id,project_id,number,status,body) values (:'ws',:'kemi',:'proj',:'cnum','sent','[{"heading":"Scope","body":"x"}]') returning id as con \gset
select 'A total' t, total, vat_amount, is_overdue from invoice_totals where invoice_id=:'inv1';

-- client B
select pg_temp.as_user('00000000-0000-0000-0000-00000000000b','kemi@lumiskin.co');
select 'B before claim sees invoices' t, count(*) from invoices;
select claim_portal_access('onera') is not null as claimed;
select 'B invoices (expect 1)' t, count(*) from invoices;
select 'B tasks (expect 1)' t, count(*) from tasks;
select 'B notes (expect 1)' t, count(*) from notes;
select 'B workspace' t, name from workspaces;
select 'B totals' t, total from invoice_totals;
select portal_toggle_task(:'task') as toggled;
select status, doc_hash is not null as hashed from portal_sign_contract(:'con','Kemi Adeyemi','Kemi Adeyemi','typed','102.89.1.1','test');
insert into messages (workspace_id,contact_id,sender_id,from_client,body) values (:'ws',:'kemi','00000000-0000-0000-0000-00000000000b',true,'hello');
do $$ begin
  begin update invoices set status='paid'; raise notice 'B update rows: %', (select count(*) from invoices where status='paid');
  exception when others then raise notice 'blocked: %', sqlerrm; end;
end $$;
select 'B paid invoices after attempt (expect 0)' t, count(*) from invoices where status='paid';
do $$ begin begin perform next_number((select id from workspaces limit 1),'invoice'); raise exception 'should fail'; exception when others then raise notice 'next_number blocked for client: %', sqlerrm; end; end $$;

-- stranger C
select pg_temp.as_user('00000000-0000-0000-0000-00000000000c','stranger@example.com');
select claim_portal_access('onera') as stranger_claim;
select 'C sees' t, (select count(*) from invoices) inv, (select count(*) from contacts) con, (select count(*) from workspaces) ws, (select count(*) from messages) msg;

-- owner sees activity and message
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a','bolu@onera.studio');
select 'A activity' t, count(*) from activity;
select 'A messages' t, count(*) from messages;
select message from activity order by id;
reset role;
