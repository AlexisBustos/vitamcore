/**
 * Renderiza el contenido del agente (formato ligero: ## títulos y - viñetas).
 * Evita dependencias de markdown; suficiente para las respuestas estructuradas.
 */
interface Props {
  content: string;
}

export function AgentContent({ content }: Props) {
  const lines = content.split('\n');
  const blocks: React.ReactNode[] = [];
  let list: string[] = [];
  let key = 0;

  const flush = () => {
    if (list.length) {
      blocks.push(
        <ul key={`ul-${key++}`} className="ml-1 space-y-1">
          {list.map((item, i) => (
            <li key={i} className="flex gap-2 text-sm text-[var(--color-foreground)]">
              <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-[var(--color-accent)]" />
              <span>{item}</span>
            </li>
          ))}
        </ul>,
      );
      list = [];
    }
  };

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) {
      flush();
      continue;
    }
    if (line.startsWith('## ') || line.startsWith('# ')) {
      flush();
      blocks.push(
        <h4
          key={`h-${key++}`}
          className="mt-3 text-sm font-semibold text-[var(--color-foreground)]"
        >
          {line.replace(/^#+\s*/, '')}
        </h4>,
      );
    } else if (line.startsWith('- ')) {
      list.push(line.slice(2));
    } else {
      flush();
      blocks.push(
        <p key={`p-${key++}`} className="text-sm text-[var(--color-foreground)]">
          {line}
        </p>,
      );
    }
  }
  flush();

  return <div className="space-y-1.5">{blocks}</div>;
}
