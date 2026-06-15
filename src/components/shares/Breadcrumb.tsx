// 【阶段 1 P0 - 2026-06-15】Shares 路径面包屑
// 从 Shares.tsx 拆出：/mnt/user + 各级目录导航
interface BreadcrumbProps {
  path: string;
  onNavigate: (targetPath: string) => void;
}

export default function Breadcrumb({ path, onNavigate }: BreadcrumbProps) {
  const crumbs = path.split('/').filter(Boolean);

  return (
    <div className="flex items-center gap-1 mb-3 text-sm text-gray-600 dark:text-gray-400 overflow-x-auto">
      <button onClick={() => onNavigate('')} className="hover:text-blue-600 whitespace-nowrap">
        /mnt/user
      </button>
      {crumbs.map((crumb, i) => (
        <span key={i} className="flex items-center gap-1 whitespace-nowrap">
          <span className="text-gray-400 dark:text-gray-500">/</span>
          <button
            onClick={() => onNavigate(crumbs.slice(0, i + 1).join('/') + '/')}
            className="hover:text-blue-600"
          >
            {crumb}
          </button>
        </span>
      ))}
    </div>
  );
}
