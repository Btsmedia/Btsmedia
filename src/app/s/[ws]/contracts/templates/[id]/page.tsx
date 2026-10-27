import { notFound } from 'next/navigation';
import { requireMember } from '@/lib/auth';
import { Crumbs, Field, Hidden, PageHead } from '@/components/ui';
import { ConfirmSubmit, Submit } from '@/components/client';
import { SectionsEditor } from '@/components/SectionsEditor';
import { Icon } from '@/components/Icon';
import { saveTemplate } from '../../../actions';
import { CONTRACT_VARS } from '@/lib/vars';
import type { Section } from '@/lib/types';

export default async function TemplatePage({ params }: { params: Promise<{ ws: string; id: string }> }) {
  const { ws: slug, id } = await params;
  const { supabase, ws } = await requireMember(slug);
  let t: { name: string; sections: Section[] } = { name: 'New agreement', sections: [{ heading: 'Scope', body: '{{studio.name}} will deliver {{project.service}} work for {{client.company}}.' }] };
  if (id !== 'new') {
    const { data } = await supabase.from('contract_templates').select('*').eq('id', id).eq('workspace_id', ws.id).maybeSingle();
    if (!data) notFound(); t = data as typeof t;
  }
  return (
    <div className="page">
      <Crumbs items={[['Templates', `/s/${slug}/contracts?tab=templates`], [t.name]]} />
      <PageHead eyebrow="Contract template" title={t.name} sub="Variables fill in from the client and project when you draft a contract." />
      <form className="card" action={saveTemplate}>
        <Hidden v={{ ws: slug, id }} />
        <Field label="Template name"><input className="inp" name="name" id="tp-name" defaultValue={t.name} /></Field>
        <SectionsEditor name="sections" initial={t.sections} vars={CONTRACT_VARS} />
        <div className="row"><span className="sp" /><Submit pending="Saving…">Save template</Submit></div>
      </form>
      {id !== 'new' && <form action={saveTemplate} className="row"><Hidden v={{ ws: slug, id, op: 'delete' }} /><span className="sp" /><ConfirmSubmit className="btn ghost" confirm="Click again to delete"><Icon name="trash" />Delete template</ConfirmSubmit></form>}
    </div>
  );
}
