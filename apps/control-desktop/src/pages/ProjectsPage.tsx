import { ProjectCard } from '@/components/ProjectCard';
import { useAppStore } from '@/stores/appStore';

export function ProjectsPage() {
  const projects = useAppStore((s) => s.projects);
  return (
    <div className="space-y-4 p-6">
      <h1 className="text-2xl font-semibold">项目</h1>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 xl:grid-cols-3">
        {projects.map((p) => (
          <ProjectCard key={p.id} project={p} />
        ))}
      </div>
    </div>
  );
}
