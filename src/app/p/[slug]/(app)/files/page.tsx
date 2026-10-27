import { requirePortal } from '@/lib/auth';
import { Card, Chip, Empty, PageHead } from '@/components/ui';
import { FileUpload } from '@/components/FileUpload';
import { Icon } from '@/components/Icon';
import { date, fileSize } from '@/lib/format';
import type { FileRow, Project } from '@/lib/types';

export const metadata = { title: 'Files' };

export default async function PortalFiles({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { supabase, ws, contact } = await requirePortal(slug);
  const { data: projects } = await supabase.from('projects').select('*').eq('contact_id', contact.id).neq('status', 'archived').order('created_at', { ascending: false });
  const P = (projects || []) as Project[];
  const { data: files } = P.length ? await supabase.from('files').select('*').in('project_id', P.map((p) => p.id)).order('created_at', { ascending: false }) : { data: [] };
  const F = (files || []) as FileRow[];
  return (
    <div className="page">
      <PageHead eyebrow={ws.name} title="Files" sub={`Deliverables from ${ws.name}, and anything you've sent them.`} />
      {!P.length && <Card><Empty icon="folder" title="No projects yet" text={`Files appear here once ${ws.name} starts your project.`} /></Card>}
      {P.map((p) => {
        const mine = F.filter((f) => f.project_id === p.id);
        return (
          <Card key={p.id} title={p.name} icon="folder" extra={<span className="muted small">{mine.length} file{mine.length === 1 ? '' : 's'}</span>}>
            {mine.length ? <div className="rows">{mine.map((f) => (
              <a key={f.id} className="lrow" href={`/api/files/${f.id}`}>
                <span className="ftype">{f.name.split('.').pop()?.toUpperCase().slice(0, 4)}</span>
                <div className="grow"><b className="ellip">{f.name}</b><p>{fileSize(f.size_bytes)} · {date(f.created_at)}</p></div>
                {f.by_client ? <Chip tone="line">From you</Chip> : <Chip tone="ink">{ws.name}</Chip>}
                <Icon name="download" size={15} />
              </a>
            ))}</div> : <p className="muted small">Nothing here yet.</p>}
            {p.status !== 'completed' && <FileUpload projectId={p.id} />}
          </Card>
        );
      })}
    </div>
  );
}
