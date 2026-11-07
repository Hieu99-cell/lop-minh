import katex from 'katex';
import { normalizeMathDelimiters } from '@/features/questions/content-schema';
export function MathText({ text }: { text: string }) {
  const normalized = normalizeMathDelimiters(text);
  return (
    <div className="math-text">
      {normalized.split(/(\$\$[\s\S]*?\$\$|\$(?:\\.|[^$])+?\$)/g).map((part, i) => {
        if (i % 2) {
          try {
            const display = part.startsWith('$$');
            return (
              <span
                className={`math-formula ${display ? 'display-formula' : ''}`}
                tabIndex={display ? 0 : undefined}
                role={display ? 'region' : undefined}
                aria-label={
                  display
                    ? 'Công thức toán; vuốt ngang hoặc dùng phím mũi tên để xem hết nếu công thức dài'
                    : undefined
                }
                key={i}
                dangerouslySetInnerHTML={{
                  __html: katex.renderToString(display ? part.slice(2, -2) : part.slice(1, -1), {
                    throwOnError: true,
                    displayMode: display,
                    trust: false,
                    strict: 'ignore',
                    maxExpand: 1000,
                  }),
                }}
              />
            );
          } catch {
            return (
              <span key={i} role="alert" className="formula-error">
                Công thức không hợp lệ — cần giáo viên sửa.
              </span>
            );
          }
        }
        return <span key={i}>{part}</span>;
      })}
    </div>
  );
}
