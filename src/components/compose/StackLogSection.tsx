// 【续 78】从 StackDetailModal.tsx 拆出(纯结构移动,不改行为)
// 操作日志区块
// 【续 79】日志显示统一去日期 + ANSI 颜色码转彩色 span(docker compose 输出带 ANSI,
// 原纯文本直出会显示 [32m 等"乱码");无 ANSI/时间戳的行零开销直通
import { Fragment } from 'react';
import { formatLogTimesForDisplay } from '../../utils/formatters';
import { parseAnsiToSpans } from '../../utils/logParser';

interface StackLogSectionProps {
  log: string;
  opRunning: boolean;
}

export default function StackLogSection({ log, opRunning }: StackLogSectionProps) {
  return (
    <div>
      <h4 className="text-sm font-medium text-gray-700 dark:text-gray-200 mb-1.5">
        操作日志{opRunning ? '(执行中…)' : ''}
      </h4>
      {/* 【续 86】日志区 160px → 55vh(用户反馈显示空间太小)
          【续 86b】55vh → 40vh:55vh 把默认折叠的「▸ compose.yaml」标题顶出弹窗首屏,
          且日志 pre 内滚吞掉弹窗滚动手势(嵌套滚动陷阱),yaml 区体感"消失";
          40vh 兼顾日志阅读与 yaml 标题首屏可见,仍不改弹窗 vertical 布局 */}
      <pre className="max-h-[40vh] overflow-auto font-mono text-[11px] p-2.5 rounded-lg bg-gray-900 text-gray-200 whitespace-pre-wrap break-all">
        {log
          ? formatLogTimesForDisplay(log)
              .split('\n')
              .map((line, i) => (
                <Fragment key={i}>
                  {i > 0 ? '\n' : ''}
                  {parseAnsiToSpans(line)}
                </Fragment>
              ))
          : '(暂无日志)'}
      </pre>
    </div>
  );
}
