\set ON_ERROR_STOP on
-- Run after rls_test.sql setup pieces: creates its own users and studio.
insert into auth.users (id, email) values
 ('00000000-0000-0000-0000-0000000000a1','owner2@studio.test'),
 ('00000000-0000-0000-0000-0000000000b1','client2@client.test'),
 ('00000000-0000-0000-0000-0000000000c1','other2@client.test');
create or replace function pg_temp.as_user(u uuid, e text) returns void language plpgsql as $$ begin
  perform set_config('request.jwt.claim.sub', u::text, false); perform set_config('request.jwt.claim.email', e, false); end $$;
set role authenticated;
select pg_temp.as_user('00000000-0000-0000-0000-0000000000a1','owner2@studio.test');
select id as ws from create_workspace('Second Studio','second') \gset
insert into contacts (workspace_id,name,email,portal_status) values (:'ws','Client Two','client2@client.test','invited') returning id as c \gset
insert into projects (workspace_id,contact_id,code,name) values (:'ws',:'c','SEC-01','Second project') returning id as p \gset
insert into galleries (workspace_id,project_id,title,status) values (:'ws',:'p','Round 1','shared') returning id as g1 \gset
insert into galleries (workspace_id,project_id,title) values (:'ws',:'p','Draft round') returning id as g2 \gset
insert into gallery_items (workspace_id,gallery_id,name,path) values (:'ws',:'g1','a.jpg','x/a.jpg') returning id as i1 \gset
insert into gallery_items (workspace_id,gallery_id,name,path) values (:'ws',:'g1','b.jpg','x/b.jpg') returning id as i2 \gset
insert into gallery_items (workspace_id,gallery_id,name,path) values (:'ws',:'g2','c.jpg','x/c.jpg');
select next_number(:'ws','quote') as qn \gset
insert into proposals (workspace_id,contact_id,number,title,status) values (:'ws',:'c',:'qn','Website proposal','sent') returning id as q \gset
insert into proposals (workspace_id,contact_id,number,title) values (:'ws',:'c','QTE-9','Draft proposal');
insert into proposal_items (workspace_id,proposal_id,description,qty,rate) values (:'ws',:'q','Design',1,1000);
insert into booking_types (workspace_id,name) values (:'ws','Discovery call');

select pg_temp.as_user('00000000-0000-0000-0000-0000000000b1','client2@client.test');
select claim_portal_access('second') is not null as claimed;
select 'client galleries (expect 1)' t, count(*) from galleries;
select 'client items (expect 2)' t, count(*) from gallery_items;
select 'client proposals (expect 1)' t, count(*) from proposals;
select 'client proposal items (expect 1)' t, count(*) from proposal_items;
select 'client booking types (expect 0)' t, count(*) from booking_types;
select portal_proof_decide(:'i1','approved','Love it');
select portal_proof_decide(:'i2','approved','');
select 'gallery approved (expect approved)' t, status from galleries where id = :'g1';
select portal_proof_decide(:'i2','changes','Make the logo bigger');
select 'gallery reopened (expect shared)' t, status from galleries where id = :'g1';
select 'comments (expect 2)' t, count(*) from proof_comments;
do $$ begin perform portal_proof_decide((select id from gallery_items where name='a.jpg'),'changes',''); raise exception 'should have failed'; exception when others then if sqlerrm = 'should have failed' then raise; end if; end $$;
do $$ begin update galleries set title='hacked'; end $$;
select 'title unchanged (expect Round 1)' t, title from galleries where id = :'g1';
select portal_proposal_decide(:'q', true, 'Client Two', null);
select 'proposal accepted' t, status, accepted_name from proposals where id = :'q';
do $$ begin perform portal_proposal_decide((select id from proposals where title='Website proposal'), false, '', 'no'); raise exception 'should have failed'; exception when others then if sqlerrm = 'should have failed' then raise; end if; end $$;

select pg_temp.as_user('00000000-0000-0000-0000-0000000000c1','other2@client.test');
select 'stranger galleries (expect 0)' t, count(*) from galleries;
select 'stranger proposals (expect 0)' t, count(*) from proposals;
do $$ begin perform portal_proof_comment((select '00000000-0000-0000-0000-000000000000'::uuid), 'x'); raise exception 'should have failed'; exception when others then if sqlerrm = 'should have failed' then raise; end if; end $$;
reset role;
select 'ALL FEATURE CHECKS PASSED' as result;
